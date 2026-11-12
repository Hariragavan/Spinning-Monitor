import { getIotDb } from '@/lib/mongodb';
import { IOT_COLLECTIONS, REMOTE_IOT_API, IOT_COMMON_API_URL } from '@/lib/iot/iotDb';
import { normalizeToCanonicalDate, parseUniversalDateParts, resolveEffectiveMappingForDate, calculateUpdatedAllocationPeriods } from '@/lib/utils';
import { IotMachineAllocationPeriod } from '@/types';

export interface IotEmRecord {
  machineNo: string;
  date: string;       // YYYY-MM-DD
  month: string;      // YYYY-MM
  shift: number | string;
  hour: number;
  hourLabel: string;
  emLeft: number;
  emRight: number;
  emTotal: number;
  unit: string;
  endBreakCountLeft: number;
  endBreakCountRight: number;
  totalEndBreaks: number;
  isFinalized: boolean;
  recordedAt: Date;
  updatedAt: Date;
}

export interface IotEmSideDetail {
  machineNo: string;
  spinningFrame?: string;
  mappedIot?: string;
  date: string;
  shift: number;
  emLeft: number;
  emRight: number;
  emTotal: number;
  unit: string;
  endBreakCountLeft?: number;
  endBreakCountRight?: number;
  totalEndBreaks?: number;
}

export interface MachineRunningStatusItem {
  machine: string;
  runStatus: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE';
  statusBadge: string;
  speed: number;
  speedUnit: string;
  count: string;
  emLeft?: number;
  emRight?: number;
  emTotal?: number;
  totalEndBreaks?: number;
  lastUpdated: string;
}

// In-memory cache for 45-sec lightweight status
let cachedStatuses: MachineRunningStatusItem[] = [];
let lastStatusFetchTime = 0;
const STATUS_CACHE_TTL_MS = 25000; // 25 seconds throttle so 45s poll always gets fresh data

/**
 * Calculates shift hour (1 through 8) given shift and dataTime timestamp
 * Shift 1: 06:00 - 14:00 (Hours 1 to 8)
 * Shift 2: 14:00 - 22:00 (Hours 1 to 8)
 * Shift 3: 22:00 - 06:00 (Hours 1 to 8)
 */
export function calculateShiftHour(shift: number | string, dataTime?: string): number {
  const sNum = Number(shift) || 1;
  const d = dataTime ? new Date(dataTime.replace(' ', 'T')) : new Date();
  const currentHour = isNaN(d.getHours()) ? new Date().getHours() : d.getHours();

  if (sNum === 1) {
    return Math.min(8, Math.max(1, currentHour - 6 + 1));
  } else if (sNum === 2) {
    return Math.min(8, Math.max(1, currentHour - 14 + 1));
  } else if (sNum === 3) {
    const h = currentHour >= 22 ? (currentHour - 22 + 1) : (currentHour + 2 + 1);
    return Math.min(8, Math.max(1, h));
  }
  return 1;
}

/**
 * Prunes intermediate 45-second ticks of completed shifts from iot_spinfo_histories,
 * keeping only the final shift-ending closing record (isShiftFinal: true).
 */
async function pruneCompletedShiftHistories(
  db: any,
  currentShiftDate: string,
  currentShift: number
): Promise<number> {
  let prunedCount = 0;
  const histCol = db.collection(IOT_COLLECTIONS.SPINFO_HISTORIES);

  try {
    // Find unfinalized records that belong to past shifts
    const olderShiftGroups = await histCol.aggregate([
      {
        $match: {
          $or: [
            { shiftDate: { $lt: currentShiftDate } },
            { shiftDate: currentShiftDate, shift: { $ne: currentShift } }
          ],
          isShiftFinal: { $ne: true }
        }
      },
      {
        $group: {
          _id: { shiftDate: '$shiftDate', shift: '$shift' },
          count: { $sum: 1 }
        }
      }
    ]).toArray();

    for (const group of olderShiftGroups) {
      const gDate = group._id?.shiftDate;
      const gShift = group._id?.shift;
      if (!gDate || gShift === undefined) continue;

      // Find the last record of this completed shift
      const lastRec = await histCol.findOne(
        { shiftDate: gDate, shift: gShift },
        { sort: { recordedAt: -1, createdAt: -1, _id: -1 } }
      );

      if (lastRec) {
        // Freeze this last packet as the permanent shift-closing record
        await histCol.updateOne(
          { _id: lastRec._id },
          { $set: { isShiftFinal: true, finalizedAt: new Date() } }
        );

        // Delete all other intermediate 45s ticks for that shift
        const delRes = await histCol.deleteMany({
          shiftDate: gDate,
          shift: gShift,
          _id: { $ne: lastRec._id },
          isShiftFinal: { $ne: true }
        });

        prunedCount += delRes.deletedCount;
      }
    }
  } catch (err) {
    console.error('Error during shift history pruning:', err);
  }

  return prunedCount;
}

/**
 * 1. Lightweight Machine Running Status (checked every 45s)
 * - Fetches live payload from remote API
 * - Saves 45-sec telemetry tick into iot_spinfo_histories
 * - Prunes ended shifts (keeps only shift closing record)
 * - Returns ONLY machine running status, speed, and status badge
 */
export async function getLightweightMachineStatuses(): Promise<{
  success: boolean;
  timestamp: string;
  totalMachines: number;
  running: number;
  stopped: number;
  doffing: number;
  offline: number;
  machines: MachineRunningStatusItem[];
}> {
  const now = Date.now();

  // Return cached result if within throttle window (sub-millisecond response)
  if (cachedStatuses.length > 0 && now - lastStatusFetchTime < STATUS_CACHE_TTL_MS) {
    const running = cachedStatuses.filter(m => m.runStatus === 'RUN').length;
    const stopped = cachedStatuses.filter(m => m.runStatus === 'STOP').length;
    const doffing = cachedStatuses.filter(m => m.runStatus === 'DOFF').length;
    const offline = cachedStatuses.filter(m => m.runStatus === 'OFFLINE').length;
    return {
      success: true,
      timestamp: new Date().toISOString(),
      totalMachines: cachedStatuses.length,
      running,
      stopped,
      doffing,
      offline,
      machines: cachedStatuses
    };
  }

  let rawItem: any = null;

  // 1. Try to fetch live payload from remote API with sort=_id&order=desc to avoid 32MB sort limit
  const endpoints = [
    `${REMOTE_IOT_API}/common?limit=1&sort=_id&order=desc`,
    IOT_COMMON_API_URL ? `${IOT_COMMON_API_URL}?limit=1&sort=_id&order=desc` : null
  ].filter(Boolean) as string[];

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6000);
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Company-Slug': 'scm' },
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const json = await res.json();
        rawItem = Array.isArray(json) ? json[0] : (json.data?.[0] || json.data || json);
        if (rawItem && Array.isArray(rawItem.machines)) break;
      }
    } catch (_) {}
  }

  try {
    const db = await getIotDb();

    // Fallback to DB if remote was unreachable
    if (!rawItem || !Array.isArray(rawItem.machines)) {
      rawItem = await db.collection(IOT_COLLECTIONS.SPINFO_LIVES).findOne({});
      if (!rawItem || !Array.isArray(rawItem.machines)) {
        rawItem = await db.collection(IOT_COLLECTIONS.SHIFTWISE).findOne({}, { sort: { shiftDate: -1, shift: -1 } });
      }
    }

    if (rawItem && Array.isArray(rawItem.machines)) {
      const shiftDate = String(rawItem.shiftDate || (rawItem.dataTime ? rawItem.dataTime.slice(0, 10) : new Date().toISOString().slice(0, 10)));
      const month = shiftDate.slice(0, 7);
      const shift = Number(rawItem.shift || 1);

      // Strip any immutable _id from remote payload to prevent MongoServerError code 66 and duplicate key conflicts
      const { _id: _ignoredId, ...cleanItem } = rawItem;

      // Update singleton live snapshot with fixed immutable _id (in-place)
      await db.collection(IOT_COLLECTIONS.SPINFO_LIVES).updateOne(
        { _id: 'spinfo_live_snapshot' as any },
        { $set: { ...cleanItem, shiftDate, shift, updatedAt: new Date() } },
        { upsert: true }
      );

      // Extract lightweight statuses AND EM values
      cachedStatuses = rawItem.machines.map((m: any, idx: number) => {
        const id = String(m.machine || m.machineId || `RF${String(idx + 1).padStart(2, '0')}`);
        const rawStatus = String(m.runStatus || 'STOP').toUpperCase();
        const runStatus: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE' =
          rawStatus === 'RUN' ? 'RUN' : rawStatus === 'DOFF' ? 'DOFF' : rawStatus === 'OFFLINE' ? 'OFFLINE' : 'STOP';
        const statusBadge =
          runStatus === 'RUN' ? 'Running' : runStatus === 'DOFF' ? 'Doffing' : runStatus === 'STOP' ? 'Stopped' : 'Offline';
        const speed = Number(m.spindleSpeedCurrent ?? 0);
        const speedUnit = String(m.spindleSpeedUnit || 'rpm');
        const count = String(m.count || '');

        const sideL = (m.sides || []).find((s: any) => s.side === 'L');
        const sideR = (m.sides || []).find((s: any) => s.side === 'R');
        const emLeft = Number(sideL?.endMendingTime || 0);
        const emRight = Number(sideR?.endMendingTime || 0);
        const emTotal = Number((emLeft + emRight).toFixed(2));
        const endBreakCountLeft = Number(sideL?.endBreakCount || 0);
        const endBreakCountRight = Number(sideR?.endBreakCount || 0);
        const totalEndBreaks = Number(m.shiftEndBreaks || m.totalEndBreakCount || (endBreakCountLeft + endBreakCountRight));

        return {
          machine: id,
          runStatus,
          statusBadge,
          speed,
          speedUnit,
          count,
          emLeft,
          emRight,
          emTotal,
          totalEndBreaks,
          lastUpdated: rawItem.dataTime || new Date().toISOString()
        };
      });

      // Upsert EM records to iot_em on every 45s cycle so live database stays current
      const emBulk: any[] = [];
      for (const st of cachedStatuses) {
        if (!st.machine) continue;
        emBulk.push({
          updateOne: {
            filter: { machineNo: st.machine, date: shiftDate, shift },
            update: {
              $set: {
                machineNo: st.machine,
                date: shiftDate,
                month,
                shift,
                emLeft: st.emLeft || 0,
                emRight: st.emRight || 0,
                emTotal: st.emTotal || 0,
                totalEndBreaks: st.totalEndBreaks || 0,
                updatedAt: new Date()
              },
              $setOnInsert: { recordedAt: new Date() }
            },
            upsert: true
          }
        });
      }
      if (emBulk.length > 0) {
        await db.collection(IOT_COLLECTIONS.EM).bulkWrite(emBulk, { ordered: false }).catch(() => {});
      }

      lastStatusFetchTime = now;
    }
  } catch (err) {
    console.error('Error fetching lightweight machine status:', err);
  }

  const running = cachedStatuses.filter(m => m.runStatus === 'RUN').length;
  const stopped = cachedStatuses.filter(m => m.runStatus === 'STOP').length;
  const doffing = cachedStatuses.filter(m => m.runStatus === 'DOFF').length;
  const offline = cachedStatuses.filter(m => m.runStatus === 'OFFLINE').length;

  return {
    success: true,
    timestamp: new Date().toISOString(),
    totalMachines: cachedStatuses.length,
    running,
    stopped,
    doffing,
    offline,
    machines: cachedStatuses
  };
}

/**
 * 2. 5-Minute Sync & Hourly EM (End Mending) Upsert Engine
 * - Fetches latest live payload from remote IoT API
 * - Replaces/upserts the current active hour's EM document per machine
 * - Freezes previous completed hours (isFinalized: true)
 */
export async function syncIotEmAndManageShiftHistory(latestPayload?: any): Promise<{
  success: boolean;
  syncedMachines: number;
  date: string;
  shift: number;
  hour: number;
  prunedPreviousShifts: number;
}> {
  try {
    const db = await getIotDb();

    // 1. Get latest payload if not provided
    let item = latestPayload;
    if (!item) {
      try {
        const res = await fetch(`${IOT_COMMON_API_URL}?limit=50&_t=${Date.now()}`, {
          headers: { Accept: 'application/json' },
          cache: 'no-store'
        });
        if (res.ok) {
          const json = await res.json();
          item = Array.isArray(json) ? json[0] : (json.data?.[0] || json.data || json);
        }
      } catch (_) {}
    }

    if (!item || !Array.isArray(item.machines)) {
      item = await db.collection(IOT_COLLECTIONS.SPINFO_LIVES).findOne({});
      if (!item || !Array.isArray(item.machines)) {
        item = await db.collection(IOT_COLLECTIONS.SHIFTWISE).findOne({}, { sort: { shiftDate: -1, shift: -1 } });
      }
    }

    if (!item || !Array.isArray(item.machines)) {
      return { success: false, syncedMachines: 0, date: '', shift: 1, hour: 1, prunedPreviousShifts: 0 };
    }

    const shiftDate = String(item.shiftDate || (item.dataTime ? item.dataTime.slice(0, 10) : new Date().toISOString().slice(0, 10)));
    const month = shiftDate.slice(0, 7);
    const shift = Number(item.shift || 1);
    const hour = calculateShiftHour(shift, item.dataTime);

    // 2. Save / Upsert Hourly EM records for each machine
    const emCol = db.collection<IotEmRecord>(IOT_COLLECTIONS.EM);
    let syncedCount = 0;

    for (const m of item.machines) {
      const mNo = String(m.machine || m.machineId || 'RF01');
      const sideL = (m.sides || []).find((s: any) => s.side === 'L');
      const sideR = (m.sides || []).find((s: any) => s.side === 'R');
      const emLeft = Number(sideL?.endMendingTime || 0);
      const emRight = Number(sideR?.endMendingTime || 0);
      const emTotal = Number((emLeft + emRight).toFixed(2));
      const unit = String(sideL?.endMendingTimeUnit || sideR?.endMendingTimeUnit || 'min');
      const endBreakCountLeft = Number(sideL?.endBreakCount || 0);
      const endBreakCountRight = Number(sideR?.endBreakCount || 0);
      const totalEndBreaks = Number(m.totalEndBreakCount || (endBreakCountLeft + endBreakCountRight));

      const emDoc = {
        machineNo: mNo,
        date: shiftDate,
        month,
        shift,
        hour,
        hourLabel: `Hour ${hour}`,
        emLeft,
        emRight,
        emTotal,
        unit,
        endBreakCountLeft,
        endBreakCountRight,
        totalEndBreaks,
        isFinalized: false,
        updatedAt: new Date()
      };

      // Rewrites the data for the active shift every 5 minutes (upsert)
      await emCol.updateOne(
        { machineNo: mNo, date: shiftDate, shift: shift },
        {
          $set: emDoc,
          $setOnInsert: { recordedAt: new Date() }
        },
        { upsert: true }
      );
      syncedCount++;
    }

    // Freeze previous completed hours of this shift and past shifts/dates
    await emCol.updateMany(
      {
        $or: [
          { date: { $lt: shiftDate }, isFinalized: false },
          { date: shiftDate, shift: { $lt: shift }, isFinalized: false },
          { date: shiftDate, shift: shift, hour: { $lt: hour }, isFinalized: false }
        ]
      },
      { $set: { isFinalized: true } }
    );

    // Check and prune completed older shifts in iot_spinfo_histories
    const prunedCount = await pruneCompletedShiftHistories(db, shiftDate, shift);

    // Auto-sync mapped IoT EM to Spinning Monitor machine_em so it is ALWAYS current
    try {
      await syncIotEmToSpinningMonitor();
    } catch (syncErr) {
      console.warn('[IoT EM Service] Auto-sync to spinning monitor error:', syncErr);
    }

    return {
      success: true,
      syncedMachines: syncedCount,
      date: shiftDate,
      shift,
      hour,
      prunedPreviousShifts: prunedCount
    };
  } catch (err) {
    console.error('Error in syncIotEmAndManageShiftHistory:', err);
    return { success: false, syncedMachines: 0, date: '', shift: 1, hour: 1, prunedPreviousShifts: 0 };
  }
}

/**
 * 3. Query Hourly EM Records
 */
export async function getIotEmRecords(filter: {
  date?: string;
  month?: string;
  shift?: string | number;
  machineNo?: string;
}): Promise<IotEmRecord[]> {
  try {
    const db = await getIotDb();
    const query: any = {};
    if (filter.date) query.date = filter.date;
    if (filter.month) query.month = filter.month;
    if (filter.shift && filter.shift !== 'All' && filter.shift !== 'All Shifts') {
      const sNum = parseInt(String(filter.shift).replace(/\D/g, ''), 10);
      if (!isNaN(sNum)) query.shift = sNum;
      else query.shift = filter.shift;
    }
    if (filter.machineNo && filter.machineNo !== 'All') {
      query.machineNo = filter.machineNo;
    }

    const records = await db
      .collection<IotEmRecord>(IOT_COLLECTIONS.EM)
      .find(query)
      .sort({ date: -1, shift: 1, hour: 1, machineNo: 1 })
      .toArray();

    return records.map(r => ({
      ...r,
      _id: undefined
    }));
  } catch (err) {
    console.error('Error fetching iot_em records:', err);
    return [];
  }
}

/**
 * 4. Get Latest EM for All 46 IoT Machines (for Settings dropdown & live badges)
 * Returns { [machineNo]: { emTotal, emLeft, emRight, shift, hour, date, updatedAt } }
 */
export async function getLatestEmForAllIotMachines(): Promise<Record<string, {
  machineNo: string;
  emTotal: number;
  emLeft: number;
  emRight: number;
  shift: number;
  hour: number;
  date: string;
  updatedAt: string;
}>> {
  try {
    const db = await getIotDb();
    const emCol = db.collection<IotEmRecord>(IOT_COLLECTIONS.EM);

    // Get latest record for each machine using aggregation
    const latestList = await emCol.aggregate([
      { $sort: { date: -1, shift: -1, hour: -1, updatedAt: -1 } },
      {
        $group: {
          _id: '$machineNo',
          machineNo: { $first: '$machineNo' },
          emTotal: { $first: '$emTotal' },
          emLeft: { $first: '$emLeft' },
          emRight: { $first: '$emRight' },
          shift: { $first: '$shift' },
          hour: { $first: '$hour' },
          date: { $first: '$date' },
          updatedAt: { $first: '$updatedAt' }
        }
      }
    ]).toArray();

    const map: Record<string, any> = {};
    for (const item of latestList) {
      if (item.machineNo) {
        map[item.machineNo] = {
          machineNo: item.machineNo,
          emTotal: Number(item.emTotal || 0),
          emLeft: Number(item.emLeft || 0),
          emRight: Number(item.emRight || 0),
          shift: Number(item.shift || 1),
          hour: Number(item.hour || 1),
          date: String(item.date || ''),
          updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString()
        };
      }
    }

    // If cachedStatuses is empty, trigger lightweight status fetch to populate live telemetry
    if (cachedStatuses.length === 0) {
      try {
        await getLightweightMachineStatuses();
      } catch (_) {}
    }

    // Merge with in-memory cachedStatuses if available to get live speed, runStatus, and current EM
    for (const st of cachedStatuses) {
      if (st.machine) {
        const existing = map[st.machine] || {};
        map[st.machine] = {
          machineNo: st.machine,
          emTotal: typeof st.emTotal === 'number' ? st.emTotal : (existing.emTotal || 0),
          emLeft: typeof st.emLeft === 'number' ? st.emLeft : (existing.emLeft || 0),
          emRight: typeof st.emRight === 'number' ? st.emRight : (existing.emRight || 0),
          speed: st.speed || 0,
          runStatus: st.runStatus || 'STOP',
          statusBadge: st.statusBadge || 'Stopped',
          count: st.count || '',
          shift: existing.shift || 1,
          hour: existing.hour || 1,
          date: existing.date || new Date().toISOString().slice(0, 10),
          updatedAt: st.lastUpdated || new Date().toISOString()
        };
      }
    }

    return map;
  } catch (err) {
    console.error('Error fetching latest EM for all IoT machines:', err);
    return {};
  }
}

export function getFrameVariants(frame: string): string[] {
  if (!frame) return [];
  const clean = frame.trim();
  const upper = clean.toUpperCase();
  const variants = new Set<string>([clean, upper]);

  const digits = upper.match(/\d+/);
  if (digits) {
    const rawNum = digits[0];
    const intVal = parseInt(rawNum, 10);
    const unpadded = String(intVal);
    const p2 = rawNum.padStart(2, '0');
    const p3 = rawNum.padStart(3, '0');

    if (upper.startsWith('RF')) {
      // ONLY RF device variants for IoT hardware devices
      variants.add(upper);
      variants.add(`RF${p2}`);
      variants.add(`RF${unpadded}`);
    } else {
      // Spinning machine frame variants (SP, K, numbers)
      variants.add(rawNum);
      variants.add(unpadded);
      variants.add(p2);
      variants.add(p3);
      variants.add(`SP${p3}`);
      variants.add(`SP${p2}`);
      variants.add(`K${p2}`);
      variants.add(`K${unpadded}`);
    }
  }

  return Array.from(variants);
}

export function getDateVariants(dateStr: string): string[] {
  if (!dateStr) return [];
  const clean = dateStr.trim();
  const canonical = normalizeToCanonicalDate(clean);
  const parts = parseUniversalDateParts(clean);
  const variants = new Set<string>([clean, canonical]);

  if (parts) {
    const iso = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const ddmmyyyy = `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
    const dmmyyyy = `${parts.day}/${parts.month}/${parts.year}`;
    variants.add(iso);
    variants.add(ddmmyyyy);
    variants.add(dmmyyyy);
  }

  return Array.from(variants).filter(Boolean);
}

/**
 * 5. Get Mapped Machine EM directly from MongoDB iot_em Collection
 * - Queries iot_em directly (machine-by-machine, shift-by-shift, date-wise)
 * - Resolves both ISO (YYYY-MM-DD) and Canonical (DD/MM/YYYY) date keys
 * - Maps across frame variants (RF01, 1, 01, SP01) and active IoT machine mappings
 * - Completely eliminates the legacy redundant machine_em collection
 */
export async function getMappedMachineEmFromIotEm(
  mappings?: Record<string, string>,
  targetDate?: string
): Promise<Record<string, Record<string, Record<string, number>>>> {
  try {
    const db = await getIotDb();
    const emCol = db.collection<IotEmRecord>(IOT_COLLECTIONS.EM);

    // If mappings not explicitly passed, load active mappings from system settings
    let activeMappings = mappings;
    let mappingsByDate: Record<string, Record<string, string>> = {};
    let allocationPeriods: IotMachineAllocationPeriod[] = [];
    const setDoc = await db.collection('settings').findOne({ _id: 'system_settings' as any });
    if (setDoc) {
      if (!activeMappings || Object.keys(activeMappings).length === 0) {
        activeMappings = setDoc.machineToMachineMapping || setDoc.iotMachineMapping || {};
      }
      mappingsByDate = setDoc.iotMachineMappingByDate || {};
      allocationPeriods = setDoc.iotMachineAllocationPeriods || [];
    }

    const merged: Record<string, Record<string, Record<string, number>>> = {};

    // Invert mapping: iotNo -> spinningFrameNo(s)
    const iotToSpinningMap = new Map<string, string[]>();
    for (const [spinningFrame, iotMachine] of Object.entries(activeMappings || {})) {
      if (iotMachine && iotMachine !== 'None' && iotMachine !== 'NONE' && iotMachine !== 'unassigned') {
        const cleanIot = iotMachine.trim().toUpperCase();
        const current = iotToSpinningMap.get(cleanIot) || [];
        current.push(spinningFrame);
        iotToSpinningMap.set(cleanIot, current);
      }
    }

    // Query iot_em for records (all machines, or filtered by date if specified)
    const query: any = {};
    if (targetDate) {
      const dVariants = getDateVariants(targetDate);
      query.date = { $in: dVariants };
    }

    const iotRecords = await emCol.find(query).sort({ date: 1, shift: 1, updatedAt: 1 }).toArray();

    const detailsMap: Record<string, Record<string, Record<string, IotEmSideDetail>>> = {};

    for (const rec of iotRecords) {
      if (!rec || !rec.machineNo || !rec.date) continue;
      const cleanIot = rec.machineNo.trim().toUpperCase();
      const shiftNum = Number(rec.shift || 1);
      const emLeft = Number(rec.emLeft || 0);
      const emRight = Number(rec.emRight || 0);
      const emVal = Number(rec.emTotal ?? (emLeft + emRight));
      const endBreakCountLeft = Number(rec.endBreakCountLeft || 0);
      const endBreakCountRight = Number(rec.endBreakCountRight || 0);
      const totalEndBreaks = Number(rec.totalEndBreaks || (endBreakCountLeft + endBreakCountRight));
      const unit = String(rec.unit || 'min');

      const sideDetail: IotEmSideDetail = {
        machineNo: cleanIot,
        date: rec.date,
        shift: shiftNum,
        emLeft,
        emRight,
        emTotal: emVal,
        unit,
        endBreakCountLeft,
        endBreakCountRight,
        totalEndBreaks
      };

      // Collect all machine/frame keys to record this EM under
      const targetKeys = new Set<string>(getFrameVariants(cleanIot));
      const mappedFrames = new Set<string>();

      // Check date-specific mappings for this record's date using date range periods
      const dateMap = resolveEffectiveMappingForDate(
        rec.date,
        allocationPeriods,
        mappingsByDate,
        activeMappings
      );

      if (dateMap) {
        for (const [sFrame, iDev] of Object.entries(dateMap)) {
          if (iDev && iDev.trim().toUpperCase() === cleanIot) {
            mappedFrames.add(sFrame);
            sideDetail.spinningFrame = sFrame;
            sideDetail.mappedIot = cleanIot;
          }
        }
      }

      // ONLY add spinning frame variants if explicitly mapped!
      for (const frame of mappedFrames) {
        getFrameVariants(frame).forEach(k => targetKeys.add(k));
      }

      const dateKeys = getDateVariants(rec.date);
      for (const dKey of dateKeys) {
        if (!merged[dKey]) merged[dKey] = {};
        if (!detailsMap[dKey]) detailsMap[dKey] = {};

        for (const fKey of targetKeys) {
          if (!merged[dKey][fKey]) merged[dKey][fKey] = {};
          if (!detailsMap[dKey][fKey]) detailsMap[dKey][fKey] = {};

          // Record latest EM value for this machine, date and shift
          merged[dKey][fKey][shiftNum] = emVal;
          merged[dKey][fKey][String(shiftNum)] = emVal;

          detailsMap[dKey][fKey][shiftNum] = sideDetail;
          detailsMap[dKey][fKey][String(shiftNum)] = sideDetail;
        }
      }
    }

    (merged as any)._details = detailsMap;
    return merged;
  } catch (err) {
    console.error('Error fetching mapped machine EM from iot_em:', err);
    return {};
  }
}

/**
 * Single machine EM side breakdown lookup (Left EM, Right EM, Total EM)
 */
export async function getSingleMachineEmDetail(
  date: string,
  machine: string,
  shift: number | string
): Promise<IotEmSideDetail | null> {
  try {
    const db = await getIotDb();
    const sNum = Number(shift) || 1;
    const cleanMachine = machine.trim().toUpperCase();
    const frameVariants = Array.from(getFrameVariants(cleanMachine));

    // 1. Check settings for mapped device using date-specific resolution
    const settings = await db.collection('settings').findOne({ _id: 'system_settings' as any }).catch(() => null);
    const dateMapping = resolveEffectiveMappingForDate(
      date,
      settings?.iotMachineAllocationPeriods || [],
      settings?.iotMachineMappingByDate || {},
      settings?.machineToMachineMapping || settings?.iotMachineMapping || {}
    );
    const mappedIot = dateMapping[cleanMachine] || dateMapping[machine] || undefined;
    if (mappedIot) {
      frameVariants.push(mappedIot.toUpperCase().trim());
    }

    const dateCandidates = Array.from(getDateVariants(date));

    // 2. Query iot_em
    const rec = await db.collection<IotEmRecord>(IOT_COLLECTIONS.EM).findOne({
      date: { $in: dateCandidates },
      shift: sNum,
      machineNo: { $in: frameVariants }
    });

    if (rec) {
      return {
        machineNo: rec.machineNo,
        spinningFrame: cleanMachine,
        mappedIot,
        date: rec.date,
        shift: sNum,
        emLeft: Number(rec.emLeft || 0),
        emRight: Number(rec.emRight || 0),
        emTotal: Number(rec.emTotal ?? ((rec.emLeft || 0) + (rec.emRight || 0))),
        unit: rec.unit || 'min',
        endBreakCountLeft: rec.endBreakCountLeft,
        endBreakCountRight: rec.endBreakCountRight,
        totalEndBreaks: rec.totalEndBreaks
      };
    }

    // 3. Fallback: Query iot_shiftwise_data
    const shiftDoc = await db.collection(IOT_COLLECTIONS.SHIFTWISE).findOne({
      shiftDate: { $in: dateCandidates },
      shift: sNum
    });

    if (shiftDoc && Array.isArray(shiftDoc.machines)) {
      const matchM = shiftDoc.machines.find((m: any) => {
        const id = String(m.machine || m.machineId || '').toUpperCase().trim();
        return frameVariants.includes(id);
      });

      if (matchM) {
        const sideL = matchM.sides?.find((s: any) => s.side === 'L');
        const sideR = matchM.sides?.find((s: any) => s.side === 'R');
        const emLeft = Number(sideL?.endMendingTime || 0);
        const emRight = Number(sideR?.endMendingTime || 0);
        const emTotal = Number((emLeft + emRight).toFixed(2));
        const endBreakCountLeft = Number(sideL?.endBreakCount || 0);
        const endBreakCountRight = Number(sideR?.endBreakCount || 0);
        const totalEndBreaks = Number(matchM.shiftEndBreaks || matchM.totalEndBreakCount || (endBreakCountLeft + endBreakCountRight));

        return {
          machineNo: String(matchM.machine || matchM.machineId || cleanMachine),
          spinningFrame: cleanMachine,
          mappedIot,
          date: shiftDoc.shiftDate,
          shift: sNum,
          emLeft,
          emRight,
          emTotal,
          unit: 'min',
          endBreakCountLeft,
          endBreakCountRight,
          totalEndBreaks
        };
      }
    }

    return null;
  } catch (err) {
    console.error('Error in getSingleMachineEmDetail:', err);
    return null;
  }
}

/**
 * 5b. Sync Mapped IoT EM to Spinning Monitor
 * - Updates settings if new mappings are provided
 * - Preserves date-to-date allocation periods in settings table
 * - Returns mapped EM matrix directly from iot_em (without machine_em table)
 */
export async function syncIotEmToSpinningMonitor(
  mappings?: Record<string, string>,
  targetDate?: string
): Promise<{
  success: boolean;
  updatedCount: number;
  machineEm: Record<string, Record<string, Record<number | string, number>>>;
}> {
  try {
    const db = await getIotDb();

    // Persist mappings into settings collection if explicitly provided
    if (mappings !== undefined) {
      const effectiveDate = targetDate || new Date().toISOString().slice(0, 10);
      const parts = parseUniversalDateParts(effectiveDate);
      const effIso = parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : effectiveDate;
      const effCanonical = normalizeToCanonicalDate(effectiveDate);

      const existingDoc = await db.collection('settings').findOne({ _id: 'system_settings' as any });
      const currentPeriods = existingDoc?.iotMachineAllocationPeriods || [];
      const updatedPeriods = calculateUpdatedAllocationPeriods(currentPeriods, mappings, effectiveDate);

      const machinePairs = Object.entries(mappings).map(([spinningFrame, iotMachine]) => ({
        spinningFrame,
        iotMachine
      }));

      const updateFields: any = {
        iotMachineMapping: mappings,
        machineToMachineMapping: mappings,
        machinePairs,
        [`iotMachineMappingByDate.${effectiveDate}`]: mappings,
        [`iotMachineMappingByDate.${effIso}`]: mappings,
        [`iotMachineMappingByDate.${effCanonical}`]: mappings,
        iotMachineAllocationPeriods: updatedPeriods
      };

      await db.collection('settings').updateOne(
        { _id: 'system_settings' as any },
        { 
          $set: updateFields,
          $unset: {
            whatsAppProdPhone: '',
            whatsAppEmPhone: '',
            whatsAppIncentivePhone: '',
            googleSheetUrl: '',
            machineEmGoogleSheetUrl: '',
            lastMachineEmSyncDate: ''
          }
        },
        { upsert: true }
      );
    }

    // Always fetch all dates so complete monthly EM matrix is preserved
    const machineEm = await getMappedMachineEmFromIotEm(undefined, undefined);
    const updatedCount = Object.keys(machineEm).length;

    return {
      success: true,
      updatedCount,
      machineEm
    };
  } catch (err) {
    console.error('Error syncing iot_em:', err);
    return { success: false, updatedCount: 0, machineEm: {} };
  }
}

/**
 * 5b. Sync EM Data from History (iot_spinfo_histories and iot_commondatas)
 * - Scans historical telemetry records stored in MongoDB
 * - Extracts end mending time and end break counts for all machines across past shifts
 * - Bulk-upserts hourly EM records into iot_em
 * - Calls syncIotEmToSpinningMonitor() to make past EM available across all historical dates
 */
export async function syncEmFromHistory(): Promise<{
  success: boolean;
  historicalDates: string[];
  totalRecordsUpserted: number;
  machineEm: Record<string, Record<string, Record<number | string, number>>>;
}> {
  try {
    const db = await getIotDb();
    const emCol = db.collection<IotEmRecord>(IOT_COLLECTIONS.EM);
    const histCol = db.collection(IOT_COLLECTIONS.SPINFO_HISTORIES);
    const commonCol = db.collection(IOT_COLLECTIONS.COMMON);

    const [histRecords, commonRecords] = await Promise.all([
      histCol.find({ machines: { $exists: true, $ne: [] } }).sort({ shiftDate: 1, shift: 1 }).toArray(),
      commonCol.find({ machines: { $exists: true, $ne: [] } }).sort({ shiftDate: 1, shift: 1 }).toArray()
    ]);

    const allPackets = [...histRecords, ...commonRecords];
    if (allPackets.length === 0) {
      const syncRes = await syncIotEmToSpinningMonitor();
      return { success: true, historicalDates: [], totalRecordsUpserted: 0, machineEm: syncRes.machineEm };
    }

    const emBulkOps: any[] = [];
    const dateSet = new Set<string>();

    for (const doc of allPackets) {
      const sDate = doc.shiftDate || (doc.dataTime ? doc.dataTime.slice(0, 10) : null);
      if (!sDate) continue;
      const shift = Number(doc.shift || 1);
      const month = sDate.slice(0, 7);
      const hour = calculateShiftHour(shift, doc.dataTime);
      dateSet.add(sDate);

      for (const m of (doc.machines || [])) {
        const mNo = String(m.machine || m.machineId || '');
        if (!mNo) continue;
        const sideL = (m.sides || []).find((s: any) => s.side === 'L');
        const sideR = (m.sides || []).find((s: any) => s.side === 'R');
        const emLeft = Number(sideL?.endMendingTime || 0);
        const emRight = Number(sideR?.endMendingTime || 0);
        const emTotal = Number((emLeft + emRight).toFixed(2));
        const unit = String(sideL?.endMendingTimeUnit || sideR?.endMendingTimeUnit || 'min');
        const endBreakCountLeft = Number(sideL?.endBreakCount || 0);
        const endBreakCountRight = Number(sideR?.endBreakCount || 0);
        const totalEndBreaks = Number(m.totalEndBreakCount || (endBreakCountLeft + endBreakCountRight));

        if (emTotal > 0 || totalEndBreaks > 0) {
          emBulkOps.push({
            updateOne: {
              filter: { machineNo: mNo, date: sDate, shift, hour },
              update: {
                $set: {
                  machineNo: mNo,
                  date: sDate,
                  month,
                  shift,
                  hour,
                  hourLabel: `Hour ${hour}`,
                  emLeft,
                  emRight,
                  emTotal,
                  unit,
                  endBreakCountLeft,
                  endBreakCountRight,
                  totalEndBreaks,
                  isFinalized: true,
                  updatedAt: new Date()
                },
                $setOnInsert: { recordedAt: new Date() }
              },
              upsert: true
            }
          });
        }
      }
    }

    if (emBulkOps.length > 0) {
      await emCol.bulkWrite(emBulkOps, { ordered: false }).catch(() => {});
    }

    const syncRes = await syncIotEmToSpinningMonitor();

    return {
      success: true,
      historicalDates: Array.from(dateSet).sort(),
      totalRecordsUpserted: emBulkOps.length,
      machineEm: syncRes.machineEm
    };
  } catch (err: any) {
    console.error('Error syncing EM from history:', err);
    return { success: false, historicalDates: [], totalRecordsUpserted: 0, machineEm: {} };
  }
}

/**
 * 6. Fetch and Sync ALL Shifts (1, 2, 3) from Railway MAG SPinFO Common API
 * - Queries Shift 1, Shift 2, and Shift 3 in parallel from Railway (sub-3 second completion)
 * - Combines multi-part packets to accurately capture all machines
 * - Bulk-upserts hourly EM records for every shift into MongoDB iot_em
 * - Auto-syncs to spinning monitor machine_em so Operator EM Format displays all shifts
 */
/**
 * Synchronizes all shift-end machine EM records from iot_shiftwise_data into iot_em.
 * Ensures that both IoT IDs (e.g. RF09) and spinning frame IDs (e.g. SP009, 009, 9)
 * are stored in iot_em for every date and shift 1, 2, 3.
 */
export async function syncShiftwiseDataToIotEm(dbInstance?: any, targetDate?: string): Promise<number> {
  try {
    const db = dbInstance || (await getIotDb());
    const settings = await db.collection('settings').findOne({ _id: 'system_settings' as any }).catch(() => null);
    const mapping = settings?.machineToMachineMapping || settings?.iotMachineMapping || {};

    const iotToSpinning: Record<string, string> = {};
    for (const [spin, iot] of Object.entries(mapping)) {
      if (iot) iotToSpinning[String(iot).toUpperCase().trim()] = String(spin).trim();
    }

    const query: any = {};
    if (targetDate) {
      query.shiftDate = targetDate;
    }

    const shiftDocs = await db.collection(IOT_COLLECTIONS.SHIFTWISE).find(query).toArray();
    if (!shiftDocs || shiftDocs.length === 0) return 0;

    const emBulkOps: any[] = [];
    for (const doc of shiftDocs) {
      const sDate = doc.shiftDate;
      if (!sDate) continue;
      const shift = Number(doc.shift || 1);
      const month = sDate.slice(0, 7);

      for (const m of (doc.machines || [])) {
        const iotId = String(m.machine || m.machineId || '').toUpperCase().trim();
        const spinId = iotToSpinning[iotId] || iotId;
        const digits = spinId.match(/\d+/);
        const rawNum = digits ? String(parseInt(digits[0], 10)) : '';
        const p3 = digits ? digits[0].padStart(3, '0') : '';

        const sideL = m.sides?.find((s: any) => s.side === 'L');
        const sideR = m.sides?.find((s: any) => s.side === 'R');
        const emLeft = Number(sideL?.endMendingTime || 0);
        const emRight = Number(sideR?.endMendingTime || 0);
        const emTotal = Number((emLeft + emRight).toFixed(2));
        const endBreakCountLeft = Number(sideL?.endBreakCount || 0);
        const endBreakCountRight = Number(sideR?.endBreakCount || 0);
        const totalEndBreaks = Number(m.shiftEndBreaks || m.totalEndBreakCount || (endBreakCountLeft + endBreakCountRight));

        const machineKeys = new Set([iotId, spinId, p3, rawNum].filter(Boolean));

        for (const mKey of machineKeys) {
          emBulkOps.push({
            updateOne: {
              filter: { machineNo: mKey, date: sDate, shift },
              update: {
                $set: {
                  machineNo: mKey,
                  date: sDate,
                  month,
                  shift,
                  emLeft,
                  emRight,
                  emTotal,
                  unit: 'min',
                  endBreakCountLeft,
                  endBreakCountRight,
                  totalEndBreaks,
                  isShiftFinal: true,
                  updatedAt: new Date()
                },
                $setOnInsert: { recordedAt: new Date() }
              },
              upsert: true
            }
          });
        }
      }
    }

    if (emBulkOps.length > 0) {
      await db.collection(IOT_COLLECTIONS.EM).bulkWrite(emBulkOps, { ordered: false });
    }
    return emBulkOps.length;
  } catch (err) {
    console.warn('[syncShiftwiseDataToIotEm] warning:', err);
    return 0;
  }
}

/**
 * 7. Live Auto-Sync for All Shifts (1, 2, 3) from Railway IoT API
 * - Queries Railway IoT backend for live / shift-end packets across shifts 1, 2, 3
 * - Synchronizes both iot_shiftwise_data and canonical table iot_em
 * - Returns mapped EM matrix directly from canonical iot_em
 */
export async function fetchAndSyncAllShiftsFromRailway(targetDate?: string): Promise<{
  success: boolean;
  syncedShifts: number[];
  syncedMachines: number;
  dates: string[];
  machineEm: Record<string, Record<string, Record<number | string, number>>>;
}> {
  try {
    const db = await getIotDb();
    const emCol = db.collection<IotEmRecord>(IOT_COLLECTIONS.EM);
    const shiftwiseCol = db.collection(IOT_COLLECTIONS.SHIFTWISE);

    const settings = await db.collection('settings').findOne({ _id: 'system_settings' as any }).catch(() => null);
    const mapping = settings?.machineToMachineMapping || settings?.iotMachineMapping || {};
    const iotToSpinning: Record<string, string> = {};
    for (const [spin, iot] of Object.entries(mapping)) {
      if (iot) iotToSpinning[String(iot).toUpperCase().trim()] = String(spin).trim();
    }

    // Normalize targetDate to YYYY-MM-DD
    let normalizedDate = targetDate ? targetDate.trim() : undefined;
    if (normalizedDate) {
      const parts = normalizedDate.split(/[-/]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) {
          normalizedDate = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        } else {
          normalizedDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
      }
    }

    const syncedShifts: number[] = [];
    const dateSet = new Set<string>();
    let totalSyncedMachines = 0;

    // Helper to fetch from Railway with an 8000ms timeout
    const fetchRailway = async (params: Record<string, string>): Promise<any[]> => {
      try {
        const url = new URL(IOT_COMMON_API_URL);
        url.searchParams.set('sort', '_id');
        url.searchParams.set('order', 'desc');
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        url.searchParams.set('_t', String(Date.now()));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const res = await fetch(url.toString(), {
          headers: { Accept: 'application/json' },
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timeout);

        if (!res.ok) return [];
        const json = await res.json();
        const docs = Array.isArray(json) ? json : (json.data || []);
        return Array.isArray(docs) ? docs : [];
      } catch (err) {
        return [];
      }
    };

    const todayIso = new Date().toISOString().slice(0, 10);
    const yesterdayIso = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const datesToPoll = normalizedDate ? [normalizedDate] : [todayIso, yesterdayIso];
    const allRawDocs: any[] = [];

    // Query shifts 1, 2, 3 for target date(s)
    const pollPromises: Promise<any[]>[] = [];
    for (const d of datesToPoll) {
      for (const s of [1, 2, 3]) {
        pollPromises.push(fetchRailway({ shiftDate: d, shift: String(s), limit: '1' }));
      }
    }
    const pollResults = await Promise.allSettled(pollPromises);
    for (const r of pollResults) {
      if (r.status === 'fulfilled' && r.value.length > 0) {
        allRawDocs.push(...r.value);
        r.value.forEach(d => {
          if (d?.shift) syncedShifts.push(Number(d.shift));
        });
      }
    }

    // Group packets by (shiftDate + shift) to merge multi-part machines
    const msgMap = new Map<string, any[]>();

    for (const doc of allRawDocs) {
      if (!doc || !Array.isArray(doc.machines)) continue;
      const { _id, ...cleanDoc } = doc;
      const sNum = Number(cleanDoc.shift || 1);
      const sDate = String(cleanDoc.shiftDate || (cleanDoc.dataTime ? cleanDoc.dataTime.slice(0, 10) : ''));
      const groupKey = `${sDate}_${sNum}`;
      const list = msgMap.get(groupKey) || [];
      list.push(cleanDoc);
      msgMap.set(groupKey, list);
    }

    const emBulkOps: any[] = [];

    for (const [_gKey, packetList] of msgMap.entries()) {
      const base = packetList[0];
      const shift = Number(base.shift || 1);
      const sDate = String(base.shiftDate || (base.dataTime ? base.dataTime.slice(0, 10) : new Date().toISOString().slice(0, 10)));
      const month = sDate.slice(0, 7);
      dateSet.add(sDate);

      const isPastDate = sDate < todayIso;
      const currentHour = new Date().getHours();
      const isShiftEnd = (
        isPastDate ||
        base.recordType === 'SHIFT_END' ||
        String(base.msgId || '').toUpperCase().endsWith('-END') ||
        packetList.some((pkt: any) => pkt.recordType === 'SHIFT_END' || String(pkt.msgId || '').toUpperCase().endsWith('-END')) ||
        (shift === 1 && currentHour >= 14) ||
        (shift === 2 && currentHour >= 22) ||
        (shift === 3 && (currentHour >= 6 && currentHour < 14))
      );

      const machineMap = new Map<string, any>();
      for (const pkt of packetList) {
        for (const m of (pkt.machines || [])) {
          const key = String(m.machine || m.machineId || '');
          if (key) machineMap.set(key, m);
        }
      }
      const machines = Array.from(machineMap.values());
      if (machines.length === 0) continue;

      // 1. If SHIFT_END or past date: Save permanent shift-wise summary to iot_shiftwise_data
      if (isShiftEnd) {
        const { _id, createdAt: _ignoreCreated, ...cleanDoc } = base;
        const msgId = cleanDoc.msgId || `${sDate.replace(/-/g, '')}-S${shift}-END`;
        await shiftwiseCol.updateOne(
          { shiftDate: sDate, shift },
          {
            $set: {
              ...cleanDoc,
              msgId,
              recordType: 'SHIFT_END',
              shiftDate: sDate,
              month,
              shift,
              machineCount: machines.length,
              machines,
              updatedAt: new Date()
            },
            $setOnInsert: { createdAt: new Date() }
          },
          { upsert: true }
        );

        // Auto-save non-machine IoT entities at shift end: cardtap, rounds, maintenance, employee, performance
        try {
          const { syncShiftEndNonMachineIotData } = await import('./iotDb');
          syncShiftEndNonMachineIotData(sDate, shift).catch(() => {});
        } catch (_) {}
      }

      // 2. Prepare machine EM bulk upsert into iot_em (all keys: RF ID, SP ID, frame numbers)
      for (const m of machines) {
        const iotId = String(m.machine || m.machineId || 'RF01').toUpperCase().trim();
        const spinId = iotToSpinning[iotId] || iotId;
        const digits = spinId.match(/\d+/);
        const rawNum = digits ? String(parseInt(digits[0], 10)) : '';
        const p3 = digits ? digits[0].padStart(3, '0') : '';

        const sideL = (m.sides || []).find((s: any) => s.side === 'L');
        const sideR = (m.sides || []).find((s: any) => s.side === 'R');
        const emLeft = Number(sideL?.endMendingTime || 0);
        const emRight = Number(sideR?.endMendingTime || 0);
        const emTotal = Number((emLeft + emRight).toFixed(2));
        const unit = String(sideL?.endMendingTimeUnit || sideR?.endMendingTimeUnit || 'min');
        const endBreakCountLeft = Number(sideL?.endBreakCount || 0);
        const endBreakCountRight = Number(sideR?.endBreakCount || 0);
        const totalEndBreaks = Number(m.shiftEndBreaks || m.totalEndBreakCount || (endBreakCountLeft + endBreakCountRight));

        const machineKeys = new Set([iotId, spinId, p3, rawNum].filter(Boolean));

        for (const mKey of machineKeys) {
          emBulkOps.push({
            updateOne: {
              filter: { machineNo: mKey, date: sDate, shift },
              update: {
                $set: {
                  machineNo: mKey,
                  date: sDate,
                  month,
                  shift,
                  emLeft,
                  emRight,
                  emTotal,
                  unit,
                  endBreakCountLeft,
                  endBreakCountRight,
                  totalEndBreaks,
                  isShiftFinal: isShiftEnd,
                  updatedAt: new Date()
                },
                $setOnInsert: { recordedAt: new Date() }
              },
              upsert: true
            }
          });
        }
        totalSyncedMachines++;
      }
    }

    // 2b. Bulk upsert into iot_em
    if (emBulkOps.length > 0) {
      try {
        await emCol.bulkWrite(emBulkOps, { ordered: false });
      } catch (bulkErr: any) {
        console.warn('[fetchAndSyncAllShiftsFromRailway] bulkWrite iot_em warning:', bulkErr?.message);
      }
    }

    // 2c. Backfill any other shifts in iot_shiftwise_data into iot_em
    await syncShiftwiseDataToIotEm(db, normalizedDate);

    // 3. Return mapped EM matrix directly from iot_em
    const mappedMatrix = await getMappedMachineEmFromIotEm(undefined, normalizedDate);

    return {
      success: true,
      syncedShifts: Array.from(new Set(syncedShifts)),
      syncedMachines: totalSyncedMachines,
      dates: Array.from(dateSet),
      machineEm: mappedMatrix
    };
  } catch (err: any) {
    console.error('[fetchAndSyncAllShiftsFromRailway] General error:', err);
    return { success: false, syncedShifts: [], syncedMachines: 0, dates: [], machineEm: {} };
  }
}

