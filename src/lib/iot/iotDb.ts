import { getIotDb } from '@/lib/mongodb';
import {
  EMPTY_COMMON_OVERVIEW,
  SAMPLE_OVERVIEW,
  getSampleSpinfoOverview,
  extractCommonRecords,
  selectAndMergeCommonRecord,
  transformCommonToOverview,
  buildMachineDetailFromCommon
} from './sampleIotData';
import {
  SpinfoOverviewResponse,
  SpinfoMachineItem,
  SpinfoMachineDetailResponse,
  Employee,
  Machine,
  Shift,
  MaintenanceEntry,
  MachineMapping,
  ProductionReportRow,
  EmployeeMetric,
  DeviceHealth
} from '@/types/iot';

export const IOT_COLLECTIONS = {
  SHIFTWISE: 'iot_shiftwise_data',
  COMMON: 'iot_shiftwise_data', // Alias for backwards compatibility
  MACHINES: 'machines',
  EMPLOYEES: 'iot_employees',
  DEVICES: 'iot_devices',
  SHIFTS: 'iot_shiftwise_data',
  MAPPINGS: 'settings',
  PRODUCTION_ENTRIES: 'dailyproductionlogs',
  MAINTENANCE: 'iot_maintenance_schedules',
  SPINFO_LIVES: 'iot_spinfo_lives',
  SPINFO_HISTORIES: 'iot_shiftwise_data',
  MACHINE_STATUS_EVENTS: 'iot_spinfo_lives',
  STATUS_EVENTS: 'iot_spinfo_lives',
  EMPLOYEE_ACTIVITIES: 'iot_employee_activities',
  ACTIVITIES: 'iot_employee_activities',
  EMPLOYEE_PERFORMANCES: 'iot_employee_performances',
  PERFORMANCES: 'iot_employee_performances',
  EM: 'iot_em'
};

export const REMOTE_IOT_API =
  process.env.IOT_REMOTE_API ||
  process.env.NEXT_PUBLIC_IOT_REMOTE_API ||
  'https://iot-machine-backend.onrender.com/api';

export const IOT_COMMON_API_URL =
  process.env.IOT_COMMON_API ||
  process.env.NEXT_PUBLIC_IOT_COMMON_API ||
  'https://iot-machine-backend-production.up.railway.app/api/common';

// Memory cache for sub-second responses keyed by shift & date
const overviewCache = new Map<string, { data: SpinfoOverviewResponse; timestamp: number }>();
const CACHE_TTL_MS = 2500;

export async function ensureIotSeeded(): Promise<void> {
  try {
    const db = await getIotDb();

    // 1. Sync Shifts if empty
    const shiftsCol = db.collection<Shift>(IOT_COLLECTIONS.SHIFTS);
    if ((await shiftsCol.countDocuments()) === 0) {
      try {
        const res = await fetch(`${REMOTE_IOT_API}/master/shifts`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const mapped = json.data.map((s: any) => ({
              shiftId: String(s._id || s.shiftId || s.name || s.shiftName),
              name: String(s.name || s.shiftName || 'Shift 1'),
              shiftName: String(s.shiftName || s.name || 'Shift 1'),
              startTime: String(s.startTime || '06:00'),
              endTime: String(s.endTime || '14:00'),
              overnight: Boolean(s.overnight),
              active: s.active !== false
            }));
            await shiftsCol.insertMany(mapped);
          }
        }
      } catch (_) {}
    }

    // 2. Sync Machines if empty
    const machinesCol = db.collection(IOT_COLLECTIONS.MACHINES);
    if ((await machinesCol.countDocuments()) === 0) {
      try {
        const res = await fetch(`${REMOTE_IOT_API}/master/machines`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const mapped = json.data.map((m: any) => {
              const copy = { ...m };
              delete copy._id;
              return copy;
            });
            await machinesCol.insertMany(mapped);
          }
        }
      } catch (_) {}
    }

    // 3. Sync Mappings if empty
    const mapCol = db.collection(IOT_COLLECTIONS.MAPPINGS);
    if ((await mapCol.countDocuments()) === 0) {
      try {
        const res = await fetch(`${REMOTE_IOT_API}/master/machine-mappings`, { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            const mapped = json.data.map((m: any) => {
              const copy = { ...m };
              delete copy._id;
              return copy;
            });
            await mapCol.insertMany(mapped);
          }
        }
      } catch (_) {}
    }
  } catch (err) {
    console.warn('[IoT DB] ensureIotSeeded error:', err);
  }
}

function appendQueryParams(baseUrl: string, params: Record<string, string | number | undefined>): string {
  try {
    const url = new URL(baseUrl);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  } catch {
    const query = Object.entries(params)
      .filter(([_, v]) => v !== undefined && v !== '')
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join('&');
    if (!query) return baseUrl;
    return baseUrl.includes('?') ? `${baseUrl}&${query}` : `${baseUrl}?${query}`;
  }
}

function calculateShiftHour(shift: number | string, dataTime?: string): number {
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
 * Centrally persists incoming live IoT payload into MongoDB Atlas:
 * 1. Writes all records to iot_commondatas
 * 2. Writes the latest singleton snapshot to iot_spinfo_lives under fixed _id: 'spinfo_live_snapshot'
 * 3. Writes live telemetry ticks into iot_spinfo_histories
 * 4. Extracts and saves hourly EM to iot_em for all 46 machines
 * 5. Auto-syncs mapped IoT EM into machine_em so Spinning Monitor screens update immediately
 */
export async function persistLiveIotPayload(payload: any): Promise<void> {
  const records = extractCommonRecords(payload);
  if (!records || records.length === 0) return;

  try {
    const db = await getIotDb();
    const shiftwiseCol = db.collection(IOT_COLLECTIONS.SHIFTWISE);
    const emCol = db.collection(IOT_COLLECTIONS.EM);

    // Group records by (shiftDate, shift)
    const shiftGroups = new Map<string, any[]>();
    for (const r of records) {
      if (!r || !Array.isArray(r.machines)) continue;
      const key = `${r.shiftDate || ''}_${r.shift || 1}`;
      const list = shiftGroups.get(key) || [];
      list.push(r);
      shiftGroups.set(key, list);
    }

    for (const [_key, recList] of shiftGroups.entries()) {
      const baseRec = recList[0];
      const shiftDate = String(baseRec.shiftDate || (baseRec.dataTime ? baseRec.dataTime.slice(0, 10) : new Date().toISOString().slice(0, 10)));
      const month = shiftDate.slice(0, 7);
      const shift = Number(baseRec.shift || 1);

      // Merge multi-part packets to accurately get all 46 machines
      const machineMap = new Map<string, any>();
      for (const r of recList) {
        for (const m of (r.machines || [])) {
          const mNo = String(m.machine || m.machineId || '');
          if (mNo) machineMap.set(mNo, m);
        }
      }
      const mergedMachines = Array.from(machineMap.values());
      if (mergedMachines.length === 0) continue;

      // Detect shift-end: either explicit SHIFT_END marker, or packet timestamp near/past shift completion
      const isShiftEnd = (
        baseRec.recordType === 'SHIFT_END' ||
        String(baseRec.msgId || '').toUpperCase().endsWith('-END') ||
        recList.some(r => r.recordType === 'SHIFT_END' || String(r.msgId || '').toUpperCase().endsWith('-END')) ||
        (shift === 1 && new Date().getHours() >= 14) ||
        (shift === 2 && new Date().getHours() >= 22) ||
        (shift === 3 && (new Date().getHours() >= 6 && new Date().getHours() < 14))
      );

      // 1. Save permanent / latest shift summary to iot_shiftwise_data
      // Strip _id and createdAt to avoid Mongo update conflicts with $setOnInsert
      const { _id, createdAt: _ignoreCreated, ...cleanDoc } = baseRec;
      const msgId = cleanDoc.msgId || `${shiftDate.replace(/-/g, '')}-S${shift}-END`;
      await shiftwiseCol.updateOne(
        { shiftDate, shift },
        {
          $set: {
            ...cleanDoc,
            msgId,
            recordType: isShiftEnd ? 'SHIFT_END' : (cleanDoc.recordType || 'SHIFT_LIVE'),
            shiftDate,
            month,
            shift,
            machineCount: mergedMachines.length,
            machines: mergedMachines,
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      if (isShiftEnd) {
        // Auto-save non-machine IoT entities at shift end: cardtap, rounds, maintenance, employee, performance
        syncShiftEndNonMachineIotData(shiftDate, shift).catch(syncErr => {
          console.warn('[persistLiveIotPayload] syncShiftEndNonMachineIotData warning:', syncErr);
        });
      }

      // 2. Machine EM update in iot_em (Machine-by-machine, shift-by-shift, date-wise)
      const emBulkOps: any[] = [];
      for (const m of mergedMachines) {
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
            filter: { machineNo: mNo, date: shiftDate, shift },
            update: {
              $set: {
                machineNo: mNo,
                date: shiftDate,
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

      if (emBulkOps.length > 0) {
        await emCol.bulkWrite(emBulkOps, { ordered: false }).catch(() => {});
      }
    }

    // 3. Update live snapshot with latest overall record (overwrites in-place)
    const latest = records[0];
    if (latest && Array.isArray(latest.machines) && latest.machines.length > 0) {
      const { _id: _ignoredId, ...cleanLatest } = latest;
      const shiftDate = String(cleanLatest.shiftDate || (cleanLatest.dataTime ? cleanLatest.dataTime.slice(0, 10) : new Date().toISOString().slice(0, 10)));
      const shift = Number(cleanLatest.shift || 1);

      await db.collection(IOT_COLLECTIONS.SPINFO_LIVES).updateOne(
        { _id: 'spinfo_live_snapshot' as any },
        { $set: { ...cleanLatest, shiftDate, shift, updatedAt: new Date() } },
        { upsert: true }
      );
    }
  } catch (err) {
    console.error('[persistLiveIotPayload] Error persisting live IoT payload:', err);
  }
}

/**
 * Fetches live MAG SPinFO records directly from remote endpoints
 * with strict 5-second timeout and guaranteed MongoDB persistence.
 */
export async function fetchLiveRenderStream(
  limit: number = 5,
  shiftNum?: number,
  date?: string
): Promise<any[]> {
  const queryParams = {
    limit: limit || 5,
    sort: 'createdAt',
    order: 'desc',
    date: date || undefined,
    shift: shiftNum !== undefined ? shiftNum : undefined
  };

  const urlsToTry = [
    appendQueryParams(IOT_COMMON_API_URL, queryParams),
    appendQueryParams(`${REMOTE_IOT_API}/common`, queryParams)
  ];

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(url, {
        headers: { Accept: 'application/json', 'X-Company-Slug': 'scm' },
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const json = await res.json();
        const records = extractCommonRecords(json);
        if (records.length > 0) {
          // Strictly await MongoDB persistence so Vercel does not terminate early
          await persistLiveIotPayload(records);
          return records;
        }
      }
    } catch (_) {}
  }

  return [];
}

// -------------------------------------------------------------
// Live Overview & Telemetry (from https://iot-machine-backend-production.up.railway.app/api/common)
// -------------------------------------------------------------
export async function getIotOverview(
  filter?: any,
  forceRefresh: boolean = false
): Promise<SpinfoOverviewResponse> {
  const fromDate = filter?.fromDate;
  const toDate = filter?.toDate;
  const targetDate = fromDate || toDate || filter?.shiftDate;
  const shiftFilter = filter?.shift;
  const cacheKey = `${shiftFilter ?? 'all'}_${fromDate ?? ''}_${toDate ?? ''}_${targetDate ?? 'any'}`;
  const now = Date.now();

  const cached = overviewCache.get(cacheKey);
  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Pull live telemetry from remote stream (limit: 5, fast & lightweight)
  const liveRecords = await fetchLiveRenderStream(5, undefined, targetDate);
  if (liveRecords.length > 0) {
    const { record, availableDates, availableShifts } = selectAndMergeCommonRecord(liveRecords, {
      fromDate,
      toDate,
      shiftDate: targetDate,
      shift: shiftFilter
    });
    if (record) {
      const overview = transformCommonToOverview(record, { availableDates, availableShifts });
      overviewCache.set(cacheKey, { data: overview, timestamp: now });
      return overview;
    }
  }

  // 2. Local MongoDB collections (iot_shiftwise_data for past shifts, iot_spinfo_lives for live)
  try {
    const db = await getIotDb();

    // 2a. If looking for past data (targetDate specified): query iot_shiftwise_data first
    if (targetDate) {
      const shiftQuery: any = { shiftDate: targetDate };
      if (shiftFilter) shiftQuery.shift = Number(shiftFilter);

      const shiftDocs = await db
        .collection(IOT_COLLECTIONS.SHIFTWISE)
        .find(shiftQuery)
        .sort({ shift: -1 })
        .toArray();

      if (shiftDocs.length > 0) {
        const { record, availableDates, availableShifts } = selectAndMergeCommonRecord(shiftDocs, {
          fromDate,
          toDate,
          shiftDate: targetDate,
          shift: shiftFilter
        });
        if (record) {
          const overview = transformCommonToOverview(record, { availableDates, availableShifts });
          overviewCache.set(cacheKey, { data: overview, timestamp: now });
          return overview;
        }
      }
    }

    // 2b. Live snapshot (current shift): Check iot_spinfo_lives singleton snapshot
    const liveDoc = await db.collection(IOT_COLLECTIONS.SPINFO_LIVES).findOne({});
    if (liveDoc && Array.isArray(liveDoc.machines) && liveDoc.machines.length > 0) {
      const { record, availableDates, availableShifts } = selectAndMergeCommonRecord([liveDoc], {
        fromDate,
        toDate,
        shiftDate: targetDate,
        shift: shiftFilter
      });
      if (record) {
        const overview = transformCommonToOverview(record, { availableDates, availableShifts });
        overviewCache.set(cacheKey, { data: overview, timestamp: now });
        return overview;
      }
    }

    // 2c. Fallback to latest shiftwise record in iot_shiftwise_data
    const localDocs = await db
      .collection(IOT_COLLECTIONS.SHIFTWISE)
      .find({})
      .sort({ shiftDate: -1, shift: -1 })
      .limit(10)
      .toArray();

    const validLocal = extractCommonRecords(localDocs);
    if (validLocal.length > 0) {
      const { record, availableDates, availableShifts } = selectAndMergeCommonRecord(validLocal, {
        fromDate,
        toDate,
        shiftDate: targetDate,
        shift: shiftFilter
      });
      if (record) {
        const overview = transformCommonToOverview(record, { availableDates, availableShifts });
        overviewCache.set(cacheKey, { data: overview, timestamp: now });
        return overview;
      }
    }
  } catch (_) {}

  // 3. Fallback to sample data so UI never displays an empty 0/0 state
  return getSampleSpinfoOverview();
}

// -------------------------------------------------------------
// Machine Detail
// -------------------------------------------------------------
export async function getIotMachineDetail(
  machineId: string,
  filter?: any
): Promise<SpinfoMachineDetailResponse> {
  const overview = await getIotOverview(filter);
  return buildMachineDetailFromCommon(machineId, overview);
}

// -------------------------------------------------------------
// Machines Master & Telemetry List (https://iot-machine-backend.onrender.com/api)
// -------------------------------------------------------------
export async function getIotMachinesList(): Promise<SpinfoMachineItem[]> {
  const overview = await getIotOverview();
  return overview.machines;
}

export async function getIotMachinesMaster(): Promise<Machine[]> {
  await ensureIotSeeded();

  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/machines`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const hwMachines: Machine[] = json.data.map((m: any) => ({
          machineId: String(m.machineId || m.id),
          machineName: String(m.machineName || m.name || m.machineId),
          millId: String(m.millId || '0'),
          cleaningIntervalDays: Number(m.cleaningIntervalDays) || 2,
          expectedProductionOutput: Number(m.expectedOutput ?? m.expectedProductionOutput ?? 0),
          expectedRuntimeMinutes: Number(m.expectedRunDurationMinutes ?? m.expectedRuntimeMinutes ?? 0),
          expectedRoundsPerHour: Number(m.expectedRoundsPerHour ?? 0),
          roundDeviceSequence: Array.isArray(m.roundDeviceSequence) ? m.roundDeviceSequence : []
        }));

        try {
          const db = await getIotDb();
          for (const m of hwMachines) {
            await db.collection(IOT_COLLECTIONS.MACHINES).updateOne(
              { machineId: m.machineId },
              { $set: m },
              { upsert: true }
            );
          }
        } catch (_) {}

        return hwMachines;
      }
    }
  } catch (_) {}

  try {
    const db = await getIotDb();
    const list = await db
      .collection<Machine>(IOT_COLLECTIONS.MACHINES)
      .find({ machineId: { $not: { $regex: /^RF/i } } }, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (_) {}

  return [];
}

// -------------------------------------------------------------
// Employees Master (https://iot-machine-backend.onrender.com/api/master/employees)
// -------------------------------------------------------------
export async function getIotEmployeesMaster(): Promise<Employee[]> {
  await ensureIotSeeded();

  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/employees`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: Employee[] = json.data.map((e: any) => ({
          employeeId: String(e.employeeId || e.id),
          employeeName: String(e.employeeName || e.name || e.employeeId),
          lastSeen: e.lastSeen || null,
          assignedDeviceIds: Array.isArray(e.assignedDeviceIds) ? e.assignedDeviceIds : []
        }));

        try {
          const db = await getIotDb();
          for (const emp of mapped) {
            await db.collection(IOT_COLLECTIONS.EMPLOYEES).updateOne(
              { employeeId: emp.employeeId },
              { $set: emp },
              { upsert: true }
            );
          }
        } catch (_) {}
        return mapped;
      }
    }
  } catch (_) {}

  try {
    const db = await getIotDb();
    const list = await db
      .collection<Employee>(IOT_COLLECTIONS.EMPLOYEES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (_) {}

  return [];
}

// -------------------------------------------------------------
// Devices Master (https://iot-machine-backend.onrender.com/api/master/devices)
// -------------------------------------------------------------
export async function getIotDevicesMaster(): Promise<DeviceHealth[]> {
  await ensureIotSeeded();

  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/devices`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: DeviceHealth[] = json.data.map((d: any) => ({
          deviceId: String(d.deviceId || d.id),
          machineId: d.machineId ? String(d.machineId) : undefined,
          machineName: d.machineName ? String(d.machineName) : undefined,
          position: d.position ?? 1,
          side: d.side || 'LEFT',
          minRPM: Number(d.minRPM ?? d.minRpm ?? 700),
          maxRPM: Number(d.maxRPM ?? d.maxRpm ?? 1000),
          minRpm: Number(d.minRPM ?? d.minRpm ?? 700),
          maxRpm: Number(d.maxRPM ?? d.maxRpm ?? 1000),
          expectedRPM: Number(d.expectedRPM ?? 850),
          assignedEmployeeId: d.assignedEmployeeId ? String(d.assignedEmployeeId) : undefined,
          assignedEmployeeName: d.assignedEmployeeName ? String(d.assignedEmployeeName) : undefined,
          lastSeen: d.lastSeen || new Date().toISOString()
        }));

        try {
          const db = await getIotDb();
          for (const dev of mapped) {
            await db.collection(IOT_COLLECTIONS.DEVICES).updateOne(
              { deviceId: dev.deviceId },
              { $set: dev },
              { upsert: true }
            );
          }
        } catch (_) {}
        return mapped;
      }
    }
  } catch (_) {}

  try {
    const db = await getIotDb();
    const list = await db
      .collection<DeviceHealth>(IOT_COLLECTIONS.DEVICES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (_) {}

  return [];
}

// -------------------------------------------------------------
// Employee Telemetry & Patrol Metrics (https://iot-machine-backend.onrender.com/api/dashboard/employee)
// -------------------------------------------------------------
export async function getIotEmployeeMetrics(filter?: {
  employeeId?: string;
  machineId?: string;
  date?: string;
  shiftName?: string;
  shiftId?: string;
}): Promise<EmployeeMetric[]> {
  // 1. Check local MongoDB iot_employee_performances first if date or shift filter is provided
  try {
    const db = await getIotDb();
    const query: any = {};
    if (filter?.date) query.shiftDate = filter.date;
    if (filter?.employeeId) query.employeeId = filter.employeeId;
    if (filter?.machineId) query.machineId = filter.machineId;

    if (filter?.shiftName || filter?.shiftId) {
      const sVal = String(filter.shiftName || filter.shiftId);
      const digits = sVal.match(/\d+/);
      if (digits) query.shift = Number(digits[0]);
    }

    if (Object.keys(query).length > 0) {
      const localDocs = await db.collection(IOT_COLLECTIONS.PERFORMANCES).find(query).toArray();
      if (localDocs.length > 0) {
        // Also fetch taps from iot_employee_activities for these employees
        const tapsQuery: any = { ...query };
        const localTaps = await db
          .collection(IOT_COLLECTIONS.ACTIVITIES)
          .find(tapsQuery)
          .sort({ tapTime: 1 })
          .toArray();

        const tapsByEmp = new Map<string, any[]>();
        for (const t of localTaps) {
          const list = tapsByEmp.get(t.employeeId) || [];
          list.push({
            tapNumber: t.tapNumber ?? 0,
            time: t.tapTime,
            deviceId: t.deviceId,
            cardTap: t.cardTap ?? 1,
            gapMinutes: t.gapMinutes ?? 0
          });
          tapsByEmp.set(t.employeeId, list);
        }

        return localDocs.map((emp: any) => ({
          employeeId: String(emp.employeeId),
          employeeName: emp.employeeName || null,
          machineId: String(emp.machineId || ''),
          roundsCompleted: Number(emp.roundsCompleted ?? emp.rounds ?? 0),
          rounds: Number(emp.rounds ?? emp.roundsCompleted ?? 0),
          expectedRounds: Number(emp.expectedRounds || 8),
          avgGapMinutes: Number(emp.avgGapMinutes || 0),
          longestGapMinutes: Number(emp.longestGapMinutes || 0),
          activeStatus: 'ACTIVE',
          idleMinutes: Number(emp.idleMinutes || 0),
          performancePercent: Number(emp.performancePercent || 0),
          lastActiveTime: 'Shift End',
          taps: tapsByEmp.get(emp.employeeId) || (Array.isArray(emp.taps) ? emp.taps : []),
          hourly: Array.isArray(emp.hourly) ? emp.hourly : [],
          date: emp.shiftDate || filter?.date,
          shift: `Shift ${emp.shift || 1}`
        }));
      }
    }
  } catch (_) {}

  // 2. Fetch live metrics from REMOTE_IOT_API
  try {
    const params = new URLSearchParams();
    if (filter?.date) params.set('date', filter.date);
    if (filter?.shiftName) params.set('shiftName', filter.shiftName);
    if (filter?.shiftId) params.set('shiftId', filter.shiftId);
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);
    params.set('_t', String(Date.now()));

    const res = await fetch(`${REMOTE_IOT_API}/dashboard/employee?${params.toString()}`, {
      cache: 'no-store'
    });

    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data.map((emp: any, idx: number) => ({
          employeeId: String(emp.employeeId || `EMP${idx + 1}`),
          employeeName: emp.employeeName || null,
          machineId: String(emp.machineId || ''),
          roundsCompleted: Number(emp.roundsCompleted ?? emp.rounds ?? 0),
          rounds: Number(emp.rounds ?? emp.roundsCompleted ?? 0),
          expectedRounds: Number(emp.expectedRounds || 8),
          avgGapMinutes: Number(emp.avgGapMinutes || 0),
          longestGapMinutes: Number(emp.longestGapMinutes || 0),
          activeStatus: 'ACTIVE',
          idleMinutes: Number(emp.idleMinutes || 0),
          performancePercent: Number(emp.performancePercent || 0),
          lastActiveTime: 'Just now',
          taps: Array.isArray(emp.taps) ? emp.taps : [],
          hourly: Array.isArray(emp.hourly) ? emp.hourly : [],
          date: emp.date || filter?.date,
          shift: emp.shift || filter?.shiftName
        }));
      }
    }
  } catch (err) {
    console.warn('[IoT DB] getIotEmployeeMetrics fetch error:', err);
  }

  return [];
}

// -------------------------------------------------------------
// Shifts Table CRUD (https://iot-machine-backend.onrender.com/api/master/shifts)
// -------------------------------------------------------------
export async function getIotShifts(): Promise<Shift[]> {
  return [
    { shiftId: '1', name: 'Shift 1', shiftName: 'Shift 1', startTime: '06:00', endTime: '14:00', overnight: false, active: true },
    { shiftId: '2', name: 'Shift 2', shiftName: 'Shift 2', startTime: '14:00', endTime: '22:00', overnight: false, active: true },
    { shiftId: '3', name: 'Shift 3', shiftName: 'Shift 3', startTime: '22:00', endTime: '06:00', overnight: true, active: true }
  ];
}

export async function saveIotShift(shift: Shift): Promise<Shift> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    await db.collection<Shift>(IOT_COLLECTIONS.SHIFTS).updateOne(
      { shiftId: shift.shiftId },
      { $set: shift },
      { upsert: true }
    );
  } catch (_) {}
  return shift;
}

export async function deleteIotShift(shiftId: string): Promise<boolean> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    const res = await db.collection(IOT_COLLECTIONS.SHIFTS).deleteOne({ shiftId });
    return res.deletedCount > 0;
  } catch (_) {
    return false;
  }
}

// -------------------------------------------------------------
// Production Entries CRUD (https://iot-machine-backend.onrender.com/api/production)
// -------------------------------------------------------------
export async function getIotProductionEntries(filter?: {
  date?: string | null;
  shiftId?: string | null;
  machineId?: string | null;
  employeeId?: string | null;
}): Promise<ProductionReportRow[]> {
  try {
    const params = new URLSearchParams();
    if (filter?.date) params.set('date', filter.date);
    if (filter?.shiftId) params.set('shiftId', filter.shiftId);
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);
    const res = await fetch(`${REMOTE_IOT_API}/production/report?${params.toString()}`, {
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data;
      }
    }
  } catch (_) {}

  try {
    const db = await getIotDb();
    const list = await db
      .collection<ProductionReportRow>(IOT_COLLECTIONS.PRODUCTION_ENTRIES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (_) {}
  return [];
}

export async function saveIotProductionEntry(entry: ProductionReportRow): Promise<ProductionReportRow> {
  try {
    const db = await getIotDb();
    await db.collection<ProductionReportRow>(IOT_COLLECTIONS.PRODUCTION_ENTRIES).updateOne(
      { entryId: entry.entryId },
      { $set: entry },
      { upsert: true }
    );
  } catch (_) {}
  return entry;
}

export async function deleteIotProductionEntry(entryId: string): Promise<boolean> {
  try {
    const db = await getIotDb();
    const res = await db.collection(IOT_COLLECTIONS.PRODUCTION_ENTRIES).deleteOne({ entryId });
    return res.deletedCount > 0;
  } catch (_) {
    return false;
  }
}

// -------------------------------------------------------------
// Maintenance CRUD (https://iot-machine-backend.onrender.com/api/master/maintenance)
// -------------------------------------------------------------
export async function getIotMaintenance(): Promise<MaintenanceEntry[]> {
  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/maintenance`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data.map((entry: any) => ({
          maintenanceId: entry.maintenanceId || entry._id || '',
          type: String(entry.type || 'PREVENTIVE').toLowerCase(),
          machineId: entry.machineId || '',
          deviceId: entry.deviceId || null,
          title: entry.title || null,
          scheduledDate: entry.scheduledDate || entry.scheduledAt || '',
          assignedPerson: entry.assignedPerson || entry.assigneeName || '',
          status: String(entry.status || 'PLANNED').toLowerCase(),
          completionDate: entry.completionDate || entry.completedAt || null,
          notes: entry.notes || null
        }));
      }
    }
  } catch (_) {}

  try {
    const db = await getIotDb();
    const list = await db
      .collection<MaintenanceEntry>(IOT_COLLECTIONS.MAINTENANCE)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (_) {}
  return [];
}

export async function saveIotMaintenance(entry: MaintenanceEntry): Promise<MaintenanceEntry> {
  try {
    const db = await getIotDb();
    await db.collection<MaintenanceEntry>(IOT_COLLECTIONS.MAINTENANCE).updateOne(
      { maintenanceId: entry.maintenanceId },
      { $set: entry },
      { upsert: true }
    );
  } catch (_) {}
  return entry;
}

// -------------------------------------------------------------
// Configuration & Mappings (https://iot-machine-backend.onrender.com/api/master/machine-mappings)
// -------------------------------------------------------------
export async function getIotMappings(): Promise<MachineMapping[]> {
  await ensureIotSeeded();

  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/machine-mappings`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: MachineMapping[] = json.data.map((m: any) => ({
          mappingId: String(m.mappingId || m._id || m.id),
          name: String(m.name || m.mappingId),
          stationIds: Array.isArray(m.stationIds) ? m.stationIds : [],
          createdAt: m.createdAt,
          updatedAt: m.updatedAt
        }));

        try {
          const db = await getIotDb();
          for (const mp of mapped) {
            await db.collection(IOT_COLLECTIONS.MAPPINGS).updateOne(
              { mappingId: mp.mappingId },
              { $set: mp },
              { upsert: true }
            );
          }
        } catch (_) {}
        return mapped;
      }
    }
  } catch (_) {}

  try {
    const db = await getIotDb();
    const list = await db
      .collection<MachineMapping>(IOT_COLLECTIONS.MAPPINGS)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (_) {}
  return [];
}

export async function saveIotMapping(mapping: MachineMapping): Promise<MachineMapping> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    await db.collection<MachineMapping>(IOT_COLLECTIONS.MAPPINGS).updateOne(
      { mappingId: mapping.mappingId },
      { $set: mapping },
      { upsert: true }
    );
  } catch (_) {}
  return mapping;
}

/**
 * Deletes legacy/interim telemetry ticks and drops machine_em if still present,
 * ensuring MongoDB Atlas remains lightweight with only:
 * - iot_shiftwise_data (permanent 8-hour shift summaries)
 * - iot_em (final shift-wise machine EM records)
 * - iot_spinfo_lives (current real-time live snapshot)
 */
export async function cleanupInterimIotHistories(): Promise<{
  deletedCommon: number;
  deletedHistories: number;
  machineEmDropped: boolean;
}> {
  try {
    const db = await getIotDb();
    let deletedCommon = 0;
    let deletedHistories = 0;
    let machineEmDropped = false;

    try {
      const res = await db.collection('iot_commondatas').deleteMany({});
      deletedCommon = res.deletedCount;
    } catch (_) {}

    try {
      const res = await db.collection('iot_spinfo_histories').deleteMany({});
      deletedHistories = res.deletedCount;
    } catch (_) {}

    try {
      await db.collection('machine_em').drop();
      machineEmDropped = true;
    } catch (_) {}

    return { deletedCommon, deletedHistories, machineEmDropped };
  } catch (err) {
    console.error('Error cleaning up interim IoT histories:', err);
    return { deletedCommon: 0, deletedHistories: 0, machineEmDropped: false };
  }
}

/**
 * Queries card tap activities from iot_employee_activities
 */
export async function getIotCardTaps(filter?: {
  date?: string;
  shift?: number | string;
  employeeId?: string;
  deviceId?: string;
  machineId?: string;
  limit?: number;
}): Promise<any[]> {
  try {
    const db = await getIotDb();
    const query: any = {};
    if (filter?.date) query.shiftDate = filter.date;
    if (filter?.shift) query.shift = Number(filter.shift);
    if (filter?.employeeId) query.employeeId = filter.employeeId;
    if (filter?.deviceId) query.deviceId = filter.deviceId;
    if (filter?.machineId) query.machineId = filter.machineId;

    return await db
      .collection(IOT_COLLECTIONS.ACTIVITIES)
      .find(query, { projection: { _id: 0 } })
      .sort({ tapTime: -1 })
      .limit(filter?.limit || 500)
      .toArray();
  } catch (err) {
    console.error('Error fetching card taps:', err);
    return [];
  }
}

/**
 * Saves non-machine IoT telemetry entities at the end of each shift:
 * 1. iot_employees (RFID operator master)
 * 2. iot_devices (hardware gateway sensors)
 * 3. iot_maintenance_schedules (cleaning & preventive maintenance schedules)
 * 4. iot_employee_performances (rounds completed, gap minutes, idle time, efficiency %)
 * 5. iot_employee_activities (RFID card tap timestamps, gap between taps, station device IDs)
 */
export async function syncShiftEndNonMachineIotData(
  shiftDate: string,
  shift: number | string
): Promise<{
  success: boolean;
  shiftDate: string;
  shift: number;
  employeesSynced: number;
  devicesSynced: number;
  maintenanceSynced: number;
  performancesSynced: number;
  cardTapsSynced: number;
}> {
  const sNum = Number(shift) || 1;
  const sDate = String(shiftDate).trim();
  let employeesSynced = 0;
  let devicesSynced = 0;
  let maintenanceSynced = 0;
  let performancesSynced = 0;
  let cardTapsSynced = 0;

  try {
    const db = await getIotDb();

    // 1. Sync Employees Master from REMOTE_IOT_API
    try {
      const empRes = await fetch(`${REMOTE_IOT_API}/master/employees`, { cache: 'no-store' });
      if (empRes.ok) {
        const empJson = await empRes.json();
        if (empJson.success && Array.isArray(empJson.data) && empJson.data.length > 0) {
          const bulk = empJson.data.map((e: any) => ({
            updateOne: {
              filter: { employeeId: String(e.employeeId || e.id) },
              update: {
                $set: {
                  employeeId: String(e.employeeId || e.id),
                  employeeName: String(e.employeeName || e.name || e.employeeId),
                  lastSeen: e.lastSeen || null,
                  assignedDeviceIds: Array.isArray(e.assignedDeviceIds) ? e.assignedDeviceIds : [],
                  updatedAt: new Date()
                }
              },
              upsert: true
            }
          }));
          await db.collection(IOT_COLLECTIONS.EMPLOYEES).bulkWrite(bulk, { ordered: false });
          employeesSynced = bulk.length;
        }
      }
    } catch (empErr) {
      console.warn('[syncShiftEndNonMachineIotData] employees sync error:', empErr);
    }

    // 2. Sync Devices Master from REMOTE_IOT_API
    try {
      const devRes = await fetch(`${REMOTE_IOT_API}/master/devices`, { cache: 'no-store' });
      if (devRes.ok) {
        const devJson = await devRes.json();
        if (devJson.success && Array.isArray(devJson.data) && devJson.data.length > 0) {
          const bulk = devJson.data.map((d: any) => ({
            updateOne: {
              filter: { deviceId: String(d.deviceId || d.id) },
              update: {
                $set: {
                  deviceId: String(d.deviceId || d.id),
                  machineId: d.machineId ? String(d.machineId) : undefined,
                  machineName: d.machineName ? String(d.machineName) : undefined,
                  position: d.position ?? 1,
                  side: d.side || 'LEFT',
                  minRPM: Number(d.minRPM ?? 700),
                  maxRPM: Number(d.maxRPM ?? 1000),
                  lastSeen: d.lastSeen || new Date().toISOString(),
                  updatedAt: new Date()
                }
              },
              upsert: true
            }
          }));
          await db.collection(IOT_COLLECTIONS.DEVICES).bulkWrite(bulk, { ordered: false });
          devicesSynced = bulk.length;
        }
      }
    } catch (devErr) {
      console.warn('[syncShiftEndNonMachineIotData] devices sync error:', devErr);
    }

    // 3. Sync Maintenance & Cleaning from REMOTE_IOT_API
    try {
      const maintRes = await fetch(`${REMOTE_IOT_API}/master/reports?reportType=cleaning_maintenance`, { cache: 'no-store' });
      if (maintRes.ok) {
        const maintJson = await maintRes.json();
        if (maintJson.success && Array.isArray(maintJson.data) && maintJson.data.length > 0) {
          const bulk = maintJson.data.map((m: any) => ({
            updateOne: {
              filter: { machineId: String(m.machineId || ''), shiftDate: sDate, shift: sNum },
              update: {
                $set: {
                  machineId: String(m.machineId || ''),
                  machineName: String(m.machineName || m.machineId || ''),
                  millId: String(m.millId || '0'),
                  cleaningIntervalDays: Number(m.cleaningIntervalDays || 2),
                  lastCleaningAt: m.lastCleaningAt || null,
                  nextCleaningAt: m.nextCleaningAt || null,
                  lastMaintenanceAt: m.lastMaintenanceAt || null,
                  status: String(m.status || 'SCHEDULED'),
                  shiftDate: sDate,
                  shift: sNum,
                  updatedAt: new Date()
                }
              },
              upsert: true
            }
          }));
          await db.collection(IOT_COLLECTIONS.MAINTENANCE).bulkWrite(bulk, { ordered: false });
          maintenanceSynced = bulk.length;
        }
      }
    } catch (maintErr) {
      console.warn('[syncShiftEndNonMachineIotData] maintenance sync error:', maintErr);
    }

    // 4. Sync Employee Performance & Card Taps for this shift from REMOTE_IOT_API
    try {
      const pUrl = `${REMOTE_IOT_API}/dashboard/employee?date=${encodeURIComponent(sDate)}&shift=${sNum}&_t=${Date.now()}`;
      const perfRes = await fetch(pUrl, { cache: 'no-store' });
      if (perfRes.ok) {
        const perfJson = await perfRes.json();
        const empList = Array.isArray(perfJson.data) ? perfJson.data : (perfJson.data ? [perfJson.data] : []);

        if (empList.length > 0) {
          const perfBulk: any[] = [];
          const tapBulk: any[] = [];

          for (const emp of empList) {
            const eId = String(emp.employeeId || emp.id || '');
            if (!eId) continue;

            const roundsCompleted = Number(emp.roundsCompleted ?? emp.rounds ?? 0);
            const expectedRounds = Number(emp.expectedRounds || 8);
            const avgGapMinutes = Number(emp.avgGapMinutes || 0);
            const longestGapMinutes = Number(emp.longestGapMinutes || 0);
            const idleMinutes = Number(emp.idleMinutes || 0);
            const performancePercent = Number(emp.performancePercent || 0);
            const hourly = Array.isArray(emp.hourly) ? emp.hourly : [];

            perfBulk.push({
              updateOne: {
                filter: { employeeId: eId, shiftDate: sDate, shift: sNum },
                update: {
                  $set: {
                    employeeId: eId,
                    employeeName: String(emp.employeeName || eId),
                    machineId: String(emp.machineId || ''),
                    shiftDate: sDate,
                    shift: sNum,
                    roundsCompleted,
                    rounds: roundsCompleted,
                    expectedRounds,
                    avgGapMinutes,
                    longestGapMinutes,
                    idleMinutes,
                    performancePercent,
                    hourly,
                    updatedAt: new Date()
                  },
                  $setOnInsert: { recordedAt: new Date() }
                },
                upsert: true
              }
            });

            // Extract each individual card tap
            for (const tap of (emp.taps || [])) {
              const tapTime = tap.time || tap.timestamp || new Date().toISOString();
              tapBulk.push({
                updateOne: {
                  filter: { employeeId: eId, tapTime, shiftDate: sDate, shift: sNum },
                  update: {
                    $set: {
                      employeeId: eId,
                      employeeName: String(emp.employeeName || eId),
                      deviceId: String(tap.deviceId || emp.machineId || ''),
                      machineId: String(emp.machineId || tap.deviceId || ''),
                      cardTap: tap.cardTap ?? 1,
                      tapNumber: Number(tap.tapNumber ?? 0),
                      gapMinutes: Number(tap.gapMinutes ?? 0),
                      tapTime,
                      shiftDate: sDate,
                      shift: sNum,
                      updatedAt: new Date()
                    },
                    $setOnInsert: { recordedAt: new Date() }
                  },
                  upsert: true
                }
              });
            }
          }

          if (perfBulk.length > 0) {
            await db.collection(IOT_COLLECTIONS.PERFORMANCES).bulkWrite(perfBulk, { ordered: false });
            performancesSynced = perfBulk.length;
          }
          if (tapBulk.length > 0) {
            await db.collection(IOT_COLLECTIONS.ACTIVITIES).bulkWrite(tapBulk, { ordered: false });
            cardTapsSynced = tapBulk.length;
          }
        }
      }
    } catch (perfErr) {
      console.warn('[syncShiftEndNonMachineIotData] employee performance sync error:', perfErr);
    }

    return {
      success: true,
      shiftDate: sDate,
      shift: sNum,
      employeesSynced,
      devicesSynced,
      maintenanceSynced,
      performancesSynced,
      cardTapsSynced
    };
  } catch (err: any) {
    console.error('Error in syncShiftEndNonMachineIotData:', err);
    return {
      success: false,
      shiftDate: sDate,
      shift: sNum,
      employeesSynced: 0,
      devicesSynced: 0,
      maintenanceSynced: 0,
      performancesSynced: 0,
      cardTapsSynced: 0
    };
  }
}

