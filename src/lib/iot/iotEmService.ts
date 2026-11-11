import { getIotDb } from '@/lib/mongodb';
import { IOT_COLLECTIONS, REMOTE_IOT_API, IOT_COMMON_API_URL } from '@/lib/iot/iotDb';
import { normalizeToCanonicalDate, parseUniversalDateParts } from '@/lib/utils';

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

export interface MachineRunningStatusItem {
  machine: string;
  runStatus: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE';
  statusBadge: string;
  speed: number;
  speedUnit: string;
  count: string;
  lastUpdated: string;
}

// In-memory cache for 45-sec lightweight status
let cachedStatuses: MachineRunningStatusItem[] = [];
let lastStatusFetchTime = 0;
const STATUS_CACHE_TTL_MS = 35000; // 35 seconds throttle for fresh remote polling

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

  // 1. Try to fetch live payload from remote API
  const endpoints = [
    `${REMOTE_IOT_API}/common?limit=1`,
    IOT_COMMON_API_URL ? `${IOT_COMMON_API_URL}?limit=1` : null
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

      // Check and prune completed older shifts
      await pruneCompletedShiftHistories(db, shiftDate, shift);

      // Extract lightweight statuses
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

        return {
          machine: id,
          runStatus,
          statusBadge,
          speed,
          speedUnit,
          count,
          lastUpdated: rawItem.dataTime || new Date().toISOString()
        };
      });
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

    variants.add(rawNum);
    variants.add(unpadded);
    variants.add(p2);
    variants.add(p3);
    variants.add(`RF${p2}`);
    variants.add(`RF${unpadded}`);
    variants.add(`SP${p3}`);
    variants.add(`SP${p2}`);
    variants.add(`K${p2}`);
    variants.add(`K${unpadded}`);
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
    if (!activeMappings || Object.keys(activeMappings).length === 0) {
      const setDoc = await db.collection('settings').findOne({ _id: 'system_settings' as any });
      activeMappings = setDoc?.iotMachineMapping || {};
      mappingsByDate = setDoc?.iotMachineMappingByDate || {};
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

    const iotRecords = await emCol.find(query).sort({ date: 1, shift: 1 }).toArray();

    for (const rec of iotRecords) {
      if (!rec || !rec.machineNo || !rec.date) continue;
      const cleanIot = rec.machineNo.trim().toUpperCase();
      const shiftNum = Number(rec.shift || 1);
      const emVal = Number(rec.emTotal ?? ((rec.emLeft || 0) + (rec.emRight || 0)));

      // Collect all machine/frame keys to record this EM under
      const targetKeys = new Set<string>(getFrameVariants(cleanIot));
      const mappedFrames = new Set<string>(iotToSpinningMap.get(cleanIot) || []);

      // Also check date-specific mappings for this record's date
      const dateMap = mappingsByDate[rec.date] || mappingsByDate[normalizeToCanonicalDate(rec.date)];
      if (dateMap) {
        for (const [sFrame, iDev] of Object.entries(dateMap)) {
          if (iDev && iDev.trim().toUpperCase() === cleanIot) {
            mappedFrames.add(sFrame);
          }
        }
      }

      for (const frame of mappedFrames) {
        getFrameVariants(frame).forEach(k => targetKeys.add(k));
      }

      const dateKeys = getDateVariants(rec.date);
      for (const dKey of dateKeys) {
        if (!merged[dKey]) merged[dKey] = {};

        for (const fKey of targetKeys) {
          if (!merged[dKey][fKey]) merged[dKey][fKey] = {};

          const existing = merged[dKey][fKey][shiftNum];
          const bestVal = existing !== undefined && existing > 0
            ? (emVal > 0 ? Math.max(existing, emVal) : existing)
            : emVal;

          merged[dKey][fKey][shiftNum] = bestVal;
          merged[dKey][fKey][String(shiftNum)] = bestVal;
        }
      }
    }

    return merged;
  } catch (err) {
    console.error('Error fetching mapped machine EM from iot_em:', err);
    return {};
  }
}

/**
 * 5b. Sync Mapped IoT EM to Spinning Monitor
 * - Updates settings if new mappings are provided
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
    if (mappings && Object.keys(mappings).length > 0) {
      const effectiveDate = targetDate || new Date().toISOString().slice(0, 10);
      const updateFields: any = {
        iotMachineMapping: mappings,
        [`iotMachineMappingByDate.${effectiveDate}`]: mappings
      };

      await db.collection('settings').updateOne(
        { _id: 'system_settings' as any },
        { $set: updateFields },
        { upsert: true }
      );
    }

    const machineEm = await getMappedMachineEmFromIotEm(mappings, targetDate);
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
    const commonCol = db.collection(IOT_COLLECTIONS.COMMON);

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

    // Helper to fetch from Railway with a 4000ms timeout
    const fetchRailway = async (params: Record<string, string>): Promise<any[]> => {
      try {
        const url = new URL(IOT_COMMON_API_URL);
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
        url.searchParams.set('_t', String(Date.now()));

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
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

    // Parallel fetch: Recent packets + Shift 1 + Shift 2 + Shift 3
    const baseParams: Record<string, string> = normalizedDate ? { shiftDate: normalizedDate } : {};
    const [recentDocsRes, s1DocsRes, s2DocsRes, s3DocsRes] = await Promise.allSettled([
      fetchRailway({ ...baseParams, limit: '25' }),
      fetchRailway({ ...baseParams, shift: '1', limit: '20' }),
      fetchRailway({ ...baseParams, shift: '2', limit: '20' }),
      fetchRailway({ ...baseParams, shift: '3', limit: '20' })
    ]);

    const allRawDocs: any[] = [];
    if (recentDocsRes.status === 'fulfilled') allRawDocs.push(...recentDocsRes.value);
    if (s1DocsRes.status === 'fulfilled' && s1DocsRes.value.length > 0) {
      allRawDocs.push(...s1DocsRes.value);
      syncedShifts.push(1);
    }
    if (s2DocsRes.status === 'fulfilled' && s2DocsRes.value.length > 0) {
      allRawDocs.push(...s2DocsRes.value);
      syncedShifts.push(2);
    }
    if (s3DocsRes.status === 'fulfilled' && s3DocsRes.value.length > 0) {
      allRawDocs.push(...s3DocsRes.value);
      syncedShifts.push(3);
    }

    if (allRawDocs.length === 0) {
      // Fallback: sync from existing iot_em documents
      const syncRes = await syncIotEmToSpinningMonitor(undefined, normalizedDate);
      return { success: true, syncedShifts: [], syncedMachines: 0, dates: [], machineEm: syncRes.machineEm };
    }

    // Group packets by (shiftDate + shift) to merge multi-part machines
    const shiftwiseCol = db.collection(IOT_COLLECTIONS.SHIFTWISE);
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
      const isShiftEnd = (
        base.recordType === 'SHIFT_END' ||
        String(base.msgId || '').toUpperCase().endsWith('-END') ||
        packetList.some((pkt: any) => pkt.recordType === 'SHIFT_END' || String(pkt.msgId || '').toUpperCase().endsWith('-END'))
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

      const sDate = String(base.shiftDate || (base.dataTime ? base.dataTime.slice(0, 10) : new Date().toISOString().slice(0, 10)));
      const month = sDate.slice(0, 7);
      const shift = Number(base.shift || 1);
      dateSet.add(sDate);

      // 1. If SHIFT_END: Save permanent shift-wise summary to iot_shiftwise_data (NOT time-wise)
      if (isShiftEnd) {
        const { _id, ...cleanDoc } = base;
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

      // 2. Prepare machine EM bulk upsert into iot_em (machine-by-machine, shift-by-shift, date-wise)
      for (const m of machines) {
        const mNo = String(m.machine || m.machineId || 'RF01');
        const sideL = (m.sides || []).find((s: any) => s.side === 'L');
        const sideR = (m.sides || []).find((s: any) => s.side === 'R');
        const emLeft = Number(sideL?.endMendingTime || 0);
        const emRight = Number(sideR?.endMendingTime || 0);
        const emTotal = Number((emLeft + emRight).toFixed(2));
        const unit = String(sideL?.endMendingTimeUnit || sideR?.endMendingTimeUnit || 'min');
        const endBreakCountLeft = Number(sideL?.endBreakCount || 0);
        const endBreakCountRight = Number(sideR?.endBreakCount || 0);
        const totalEndBreaks = Number(m.shiftEndBreaks || m.totalEndBreakCount || (endBreakCountLeft + endBreakCountRight));

        emBulkOps.push({
          updateOne: {
            filter: { machineNo: mNo, date: sDate, shift },
            update: {
              $set: {
                machineNo: mNo,
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

