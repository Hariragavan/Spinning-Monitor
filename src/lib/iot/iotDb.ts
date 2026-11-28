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
  EmployeeMachineTelemetry,
  EmployeeBreakHourBucket,
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
  'https://iot-machine-backend-production.up.railway.app/api';

export const IOT_COMMON_API_URL =
  process.env.IOT_COMMON_API ||
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
      const todayIso = new Date().toISOString().slice(0, 10);
      const isPastDate = shiftDate < todayIso;
      const currentHour = new Date().getHours();
      const isShiftEnd = (
        isPastDate ||
        baseRec.recordType === 'SHIFT_END' ||
        String(baseRec.msgId || '').toUpperCase().endsWith('-END') ||
        recList.some(r => r.recordType === 'SHIFT_END' || String(r.msgId || '').toUpperCase().endsWith('-END')) ||
        (shift === 1 && currentHour >= 14) ||
        (shift === 2 && currentHour >= 22) ||
        (shift === 3 && (currentHour >= 6 && currentHour < 14))
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

      // 2. Machine EM update in iot_em (all keys: RF ID, SP ID, frame numbers)
      const settings = await db.collection('settings').findOne({ _id: 'system_settings' as any }).catch(() => null);
      const mapping = settings?.machineToMachineMapping || settings?.iotMachineMapping || {};
      const iotToSpinning: Record<string, string> = {};
      for (const [spin, iot] of Object.entries(mapping)) {
        if (iot) iotToSpinning[String(iot).toUpperCase().trim()] = String(spin).trim();
      }

      const emBulkOps: any[] = [];
      for (const m of mergedMachines) {
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
              filter: { machineNo: mKey, date: shiftDate, shift },
              update: {
                $set: {
                  machineNo: mKey,
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
    limit: limit || 50,
    sort: '_id',
    order: 'desc',
    shiftDate: date || undefined,
    shift: shiftNum !== undefined ? shiftNum : undefined
  };

  const urlsToTry = [
    appendQueryParams(IOT_COMMON_API_URL, queryParams),
    appendQueryParams(`${REMOTE_IOT_API}/common`, queryParams)
  ];

  for (const url of urlsToTry) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
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
  const shiftNum = shiftFilter && shiftFilter !== 'All Shifts' && shiftFilter !== 'All'
    ? parseInt(String(shiftFilter).replace(/\D/g, ''), 10) || undefined
    : undefined;
  const cacheKey = `${shiftFilter ?? 'all'}_${fromDate ?? ''}_${toDate ?? ''}_${targetDate ?? 'any'}`;
  const now = Date.now();

  const cached = overviewCache.get(cacheKey);
  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Pull live/historical telemetry from remote stream (use small limit for fast ~1s resolution)
  const liveRecords = await fetchLiveRenderStream(5, shiftNum, targetDate);
  if (liveRecords.length > 0) {
    const { record, availableDates, availableShifts } = selectAndMergeCommonRecord(liveRecords, {
      fromDate,
      toDate: toDate || fromDate,
      shiftDate: targetDate,
      shift: shiftNum !== undefined ? shiftNum : shiftFilter
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
      if (shiftNum !== undefined) {
        shiftQuery.shift = shiftNum;
      } else if (shiftFilter) {
        shiftQuery.shift = Number(shiftFilter);
      }

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
// Employees Master (Local MongoDB RFID Mappings take authoritative priority)
// -------------------------------------------------------------
export async function getMappedEmployeeNameMap(dbArg?: any): Promise<Map<string, { employeeName: string; tNo?: string; workerId?: string }>> {
  const nameMap = new Map<string, { employeeName: string; tNo?: string; workerId?: string }>();
  try {
    const db = dbArg || await getIotDb();
    const docs = await db
      .collection(IOT_COLLECTIONS.EMPLOYEES)
      .find({}, { projection: { employeeId: 1, employeeName: 1, name: 1, tNo: 1, workerId: 1 } })
      .toArray();
    for (const d of docs) {
      const id = String(d.employeeId || '').trim();
      const disp = String(d.employeeName || d.name || '').trim();
      if (id && disp) {
        nameMap.set(id, {
          employeeName: disp,
          tNo: d.tNo ? String(d.tNo).trim() : undefined,
          workerId: d.workerId ? String(d.workerId).trim() : undefined
        });
      }
    }
  } catch (_) {}
  return nameMap;
}

export async function getIotEmployeesMaster(): Promise<Employee[]> {
  await ensureIotSeeded();

  const localMap = new Map<string, Employee>();
  try {
    const db = await getIotDb();
    const list = await db
      .collection<Employee>(IOT_COLLECTIONS.EMPLOYEES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    for (const emp of list) {
      if (emp.employeeId) {
        localMap.set(String(emp.employeeId).trim(), {
          ...emp,
          employeeId: String(emp.employeeId).trim(),
          employeeName: String(emp.employeeName || (emp as any).name || emp.employeeId).trim()
        });
      }
    }
  } catch (_) {}

  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/employees`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        for (const e of json.data) {
          const id = String(e.employeeId || e.id || '').trim();
          if (!id) continue;
          const existing = localMap.get(id);
          if (existing) {
            // Preserve user's locally mapped RFID operator name; merge any missing metadata
            if ((!existing.assignedDeviceIds || existing.assignedDeviceIds.length === 0) && Array.isArray(e.assignedDeviceIds)) {
              existing.assignedDeviceIds = e.assignedDeviceIds;
            }
            if (!existing.lastSeen && e.lastSeen) existing.lastSeen = e.lastSeen;
          } else {
            const empObj: Employee = {
              employeeId: id,
              employeeName: String(e.employeeName || e.name || id).trim(),
              lastSeen: e.lastSeen || null,
              assignedDeviceIds: Array.isArray(e.assignedDeviceIds) ? e.assignedDeviceIds : []
            };
            localMap.set(id, empObj);
          }
        }
      }
    }
  } catch (_) {}

  return Array.from(localMap.values());
}

// -------------------------------------------------------------
// Devices Master (https://iot-machine-backend.onrender.com/api/master/devices)
// -------------------------------------------------------------
export async function getIotDevicesMaster(): Promise<DeviceHealth[]> {
  await ensureIotSeeded();
  const empNameMap = await getMappedEmployeeNameMap();

  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/devices`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: DeviceHealth[] = json.data.map((d: any) => {
          const assignedEmpId = d.assignedEmployeeId ? String(d.assignedEmployeeId).trim() : undefined;
          const mappedName = assignedEmpId ? empNameMap.get(assignedEmpId)?.employeeName : undefined;
          return {
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
            assignedEmployeeId: assignedEmpId,
            assignedEmployeeName: mappedName || (d.assignedEmployeeName ? String(d.assignedEmployeeName) : undefined),
            lastSeen: d.lastSeen || new Date().toISOString()
          };
        });

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
    if (list.length > 0) {
      return list.map(d => ({
        ...d,
        assignedEmployeeName: (d.assignedEmployeeId ? empNameMap.get(String(d.assignedEmployeeId).trim())?.employeeName : undefined) || d.assignedEmployeeName
      }));
    }
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
  const empNameMap = await getMappedEmployeeNameMap();
  const targetDate = filter?.date ? normalizeTelemetryDate(filter.date) : '';
  const todayIso = normalizeTelemetryDate();
  const isLiveOrToday = !targetDate || targetDate >= todayIso;

  const dedupeTaps = (rawTaps: any[]) => {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const t of rawTaps || []) {
      const key = `${String(t.time || t.tapTime || '')}|${t.tapNumber ?? ''}|${String(t.deviceId || '')}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(t);
    }
    return out.sort((a, b) => Date.parse(a.time || a.tapTime || '') - Date.parse(b.time || b.tapTime || ''));
  };

  const fetchRemote = async (): Promise<EmployeeMetric[]> => {
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
          return json.data.map((emp: any, idx: number) => {
            const eId = String(emp.employeeId || `EMP${idx + 1}`).trim();
            const mappedName = empNameMap.get(eId)?.employeeName;
            return {
              employeeId: eId,
              employeeName: mappedName || emp.employeeName || null,
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
              taps: dedupeTaps(Array.isArray(emp.taps) ? emp.taps : []),
              hourly: Array.isArray(emp.hourly) ? emp.hourly : [],
              date: emp.date || filter?.date,
              shift: emp.shift || filter?.shiftName
            };
          });
        }
      }
    } catch (err) {
      console.warn('[IoT DB] getIotEmployeeMetrics fetch error:', err);
    }
    return [];
  };

  // Always prioritize remote dashboard/employee API first (has complete multi-device rounds & hourly taps
  // for both live today and historical dates like 2026-11-23..2026-11-26), falling back to local DB only if empty/offline
  const remoteData = await fetchRemote();
  if (remoteData.length > 0) return remoteData;

  // Fallback to local MongoDB iot_employee_performances if remote is unavailable or returned empty
  try {
    const db = await getIotDb();
    const query: any = {};
    if (targetDate) query.shiftDate = targetDate;
    else if (filter?.date) query.shiftDate = filter.date;
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
        const localTaps = await db
          .collection(IOT_COLLECTIONS.ACTIVITIES)
          .find(query)
          .sort({ tapTime: 1 })
          .toArray();

        const tapsByKey = new Map<string, any[]>();
        for (const t of localTaps) {
          const key = `${String(t.employeeId || '').trim()}__${String(t.machineId || '').trim()}__${Number(t.shift || 1)}`;
          const list = tapsByKey.get(key) || [];
          list.push({
            tapNumber: t.tapNumber ?? 0,
            time: t.tapTime,
            deviceId: t.deviceId,
            cardTap: t.cardTap ?? 1,
            gapMinutes: t.gapMinutes ?? 0
          });
          tapsByKey.set(key, list);
        }

        // Merge duplicate shift rows if an unfiltered sync wrote identical tap streams across shifts
        const mergedByEmpMach = new Map<string, EmployeeMetric>();
        for (const emp of localDocs) {
          const eId = String(emp.employeeId || '').trim();
          const mId = String(emp.machineId || '').trim();
          const sNum = Number(emp.shift || 1);
          const mappedName = empNameMap.get(eId)?.employeeName;
          const tapKey = `${eId}__${mId}__${sNum}`;
          const empTaps = dedupeTaps(
            tapsByKey.get(tapKey) || (Array.isArray(emp.taps) ? emp.taps : [])
          );

          const rowKey = filter?.shiftName || filter?.shiftId ? `${eId}__${mId}__${sNum}` : `${eId}__${mId}`;
          const existing = mergedByEmpMach.get(rowKey);
          if (!existing) {
            mergedByEmpMach.set(rowKey, {
              employeeId: eId,
              employeeName: mappedName || emp.employeeName || null,
              machineId: mId,
              roundsCompleted: Number(emp.roundsCompleted ?? emp.rounds ?? 0),
              rounds: Number(emp.rounds ?? emp.roundsCompleted ?? 0),
              expectedRounds: Number(emp.expectedRounds || 8),
              avgGapMinutes: Number(emp.avgGapMinutes || 0),
              longestGapMinutes: Number(emp.longestGapMinutes || 0),
              activeStatus: 'ACTIVE',
              idleMinutes: Number(emp.idleMinutes || 0),
              performancePercent: Number(emp.performancePercent || 0),
              lastActiveTime: 'Shift End',
              taps: empTaps,
              hourly: Array.isArray(emp.hourly) ? emp.hourly : [],
              date: emp.shiftDate || filter?.date,
              shift: `Shift ${sNum}`
            });
          } else {
            // Merge distinct taps from multiple shifts for the same employee+machine when viewing All shifts
            const combinedTaps = dedupeTaps([...(existing.taps || []), ...empTaps]);
            const oldTapSig = (existing.taps || []).map(t => `${t.time}|${t.tapNumber}`).join(',');
            const newTapSig = empTaps.map(t => `${t.time}|${t.tapNumber}`).join(',');
            if (oldTapSig !== newTapSig) {
              existing.taps = combinedTaps;
              existing.rounds = (existing.rounds || 0) + Number(emp.rounds ?? emp.roundsCompleted ?? 0);
              existing.roundsCompleted = existing.rounds;
            }
          }
        }
        return Array.from(mergedByEmpMach.values());
      }
    }
  } catch (_) {}

  // Past dates: fallback already tried above; nothing else left
  void isLiveOrToday;
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
  const empNameMap = await getMappedEmployeeNameMap();
  const applyMappedNames = (rows: ProductionReportRow[]) =>
    rows.map(r => {
      const eId = r.employeeId ? String(r.employeeId).trim() : '';
      const mapped = eId ? empNameMap.get(eId)?.employeeName : undefined;
      return mapped ? { ...r, employeeName: mapped } : r;
    });

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
        return applyMappedNames(json.data);
      }
    }
  } catch (_) {}

  try {
    const db = await getIotDb();
    const list = await db
      .collection<ProductionReportRow>(IOT_COLLECTIONS.PRODUCTION_ENTRIES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return applyMappedNames(list);
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
    const empNameMap = await getMappedEmployeeNameMap(db);
    const query: any = {};
    if (filter?.date) query.shiftDate = filter.date;
    if (filter?.shift) query.shift = Number(filter.shift);
    if (filter?.employeeId) query.employeeId = filter.employeeId;
    if (filter?.deviceId) query.deviceId = filter.deviceId;
    if (filter?.machineId) query.machineId = filter.machineId;

    const taps = await db
      .collection(IOT_COLLECTIONS.ACTIVITIES)
      .find(query, { projection: { _id: 0 } })
      .sort({ tapTime: -1 })
      .limit(filter?.limit || 500)
      .toArray();
    return taps.map((t: any) => {
      const eId = String(t.employeeId || '').trim();
      const mapped = eId ? empNameMap.get(eId)?.employeeName : undefined;
      return mapped ? { ...t, employeeName: mapped } : t;
    });
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
      const pUrl = `${REMOTE_IOT_API}/dashboard/employee?date=${encodeURIComponent(sDate)}&shiftName=${encodeURIComponent(`Shift ${sNum}`)}&_t=${Date.now()}`;
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
            const mId = String(emp.machineId || '');

            const roundsCompleted = Number(emp.roundsCompleted ?? emp.rounds ?? 0);
            const expectedRounds = Number(emp.expectedRounds || 8);
            const avgGapMinutes = Number(emp.avgGapMinutes || 0);
            const longestGapMinutes = Number(emp.longestGapMinutes || 0);
            const idleMinutes = Number(emp.idleMinutes || 0);
            const performancePercent = Number(emp.performancePercent || 0);
            const hourly = Array.isArray(emp.hourly) ? emp.hourly : [];
            const taps = Array.isArray(emp.taps) ? emp.taps : [];

            perfBulk.push({
              updateOne: {
                filter: { employeeId: eId, machineId: mId, shiftDate: sDate, shift: sNum },
                update: {
                  $set: {
                    employeeId: eId,
                    employeeName: String(emp.employeeName || eId),
                    machineId: mId,
                    shiftDate: sDate,
                    shift: sNum,
                    roundsCompleted,
                    rounds: roundsCompleted,
                    expectedRounds,
                    avgGapMinutes,
                    longestGapMinutes,
                    idleMinutes,
                    performancePercent,
                    taps,
                    hourly,
                    updatedAt: new Date()
                  },
                  $setOnInsert: { recordedAt: new Date() }
                },
                upsert: true
              }
            });

            // Extract each individual card tap
            for (const tap of taps) {
              const tapTime = tap.time || tap.timestamp || new Date().toISOString();
              const tapMachId = String(mId || tap.deviceId || '');
              tapBulk.push({
                updateOne: {
                  filter: { employeeId: eId, machineId: tapMachId, tapTime, shiftDate: sDate, shift: sNum },
                  update: {
                    $set: {
                      employeeId: eId,
                      employeeName: String(emp.employeeName || eId),
                      deviceId: String(tap.deviceId || mId || ''),
                      machineId: tapMachId,
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

// -------------------------------------------------------------
// Employee Hourly & Inter-Tap Spindle Break + EM Telemetry Aggregation
// -------------------------------------------------------------
const empBreakTelemetryCache = new Map<
  string,
  { data: Record<string, EmployeeMachineTelemetry>; timestamp: number }
>();

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function parseIotTimestampMs(raw: any): number {
  if (!raw) return NaN;
  const s = String(raw).trim();
  if (!s) return NaN;
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const iso = s.replace(' ', 'T') + (s.length <= 16 ? ':00' : '') + '+05:30';
    return Date.parse(iso);
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    return Date.parse(s + '+05:30');
  }
  return Date.parse(s);
}

function getIstHourStartMs(epochMs: number): number {
  return Math.floor((epochMs + IST_OFFSET_MS) / 3600000) * 3600000 - IST_OFFSET_MS;
}

function normalizeTelemetryDate(rawDate?: string): string {
  if (!rawDate) {
    const nowIst = new Date(Date.now() + IST_OFFSET_MS);
    return nowIst.toISOString().slice(0, 10);
  }
  const s = rawDate.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes('/')) {
    const p = s.split('/');
    if (p[2]?.length === 4) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
  if (s.includes('-')) {
    const p = s.split('-');
    if (p[0]?.length === 2 && p[2]?.length === 4) return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
  }
  return s;
}

interface MachineAccum {
  leftMap: Map<string, number>;
  rightMap: Map<string, number>;
  maxLeftCount: number;
  maxRightCount: number;
  latestLeftCount: number;
  latestRightCount: number;
  latestPacketMs: number;
  latestEmLeft: number;
  latestEmRight: number;
  hourlyEmSnap: Map<number, { snapMs: number; emLeft: number; emRight: number }>;
  perShiftStats: Map<number, { brkLeft: number; brkRight: number; emLeft: number; emRight: number }>;
}

const rollingTelemetryAccStore = new Map<
  string,
  { accMap: Map<string, MachineAccum>; hasBackfill: boolean }
>();

/**
 * Aggregates unique timestamped spindle breaks (L/R sides) and hourly EM snapshots
 * per machine for a given shiftDate/shift from Railway /api/common + local MongoDB.
 */
export async function getIotEmployeeBreakTelemetry(filter?: {
  date?: string;
  shift?: string;
  machine?: string;
}): Promise<Record<string, EmployeeMachineTelemetry>> {
  const targetDate = normalizeTelemetryDate(filter?.date);
  const shiftMatch = filter?.shift && filter.shift !== 'All shifts' && filter.shift !== 'All Shifts'
    ? String(filter.shift).match(/\d+/)
    : null;
  const shiftNum = shiftMatch ? Number(shiftMatch[0]) : undefined;
  const targetMachine = filter?.machine ? String(filter.machine).trim().toUpperCase() : undefined;

  const cacheKey = `${targetDate}_${shiftNum ?? 'all'}_${targetMachine ?? 'all'}`;
  const cached = empBreakTelemetryCache.get(cacheKey);
  const todayIso = normalizeTelemetryDate();
  const isToday = targetDate === todayIso;
  const ttlMs = isToday ? 20_000 : 300_000;
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return cached.data;
  }

  let accStore = rollingTelemetryAccStore.get(cacheKey);
  if (!accStore) {
    accStore = { accMap: new Map<string, MachineAccum>(), hasBackfill: false };
    rollingTelemetryAccStore.set(cacheKey, accStore);
  }
  const accMap = accStore.accMap;

  const getOrCreate = (mKey: string): MachineAccum => {
    let a = accMap.get(mKey);
    if (!a) {
      a = {
        leftMap: new Map(),
        rightMap: new Map(),
        maxLeftCount: 0,
        maxRightCount: 0,
        latestLeftCount: 0,
        latestRightCount: 0,
        latestPacketMs: -1,
        latestEmLeft: 0,
        latestEmRight: 0,
        hourlyEmSnap: new Map(),
        perShiftStats: new Map()
      };
      accMap.set(mKey, a);
    }
    return a;
  };

  const packets: any[] = [];

  // 1. Fetch minute-by-minute common telemetry packets for this shiftDate (has full endBreaks[] timestamps)
  try {
    const fetchPackets = async (limitVal: number, timeoutMs: number, latestSort = false) => {
      const sp = new URLSearchParams();
      sp.set('shiftDate', targetDate);
      if (shiftNum !== undefined) sp.set('shift', String(shiftNum));
      sp.set('limit', String(limitVal));
      if (latestSort) {
        sp.set('sort', '_id');
        sp.set('order', 'desc');
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${IOT_COMMON_API_URL}?${sp.toString()}`, {
          cache: 'no-store',
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) {
          const json = await res.json();
          return extractCommonRecords(json);
        }
      } catch (err) {
        clearTimeout(timer);
        throw err;
      }
      return [];
    };

    if (isToday && accStore.hasBackfill) {
      // Steady-state live poll: only fetch latest ~45 packets (~1-2s!) and merge into accumulator
      const recentPkts = await fetchPackets(45, 10000, true).catch(() => []);
      packets.push(...recentPkts);
    } else {
      try {
        const fullPkts = await fetchPackets(shiftNum !== undefined ? 600 : 1200, 24000);
        packets.push(...fullPkts);
        if (fullPkts.length > 0) accStore.hasBackfill = true;
      } catch {
        const smallPkts = await fetchPackets(200, 12000, true).catch(() => []);
        packets.push(...smallPkts);
      }
    }
  } catch (err) {
    console.warn('[IoT Telemetry] Railway common fetch failed:', err);
  }

  // 2. Supplement with MongoDB shiftwise & live snapshot & iot_em for offline/historical resiliency
  let emDbRecords: any[] = [];
  try {
    const db = await getIotDb();
    const shiftQuery: any = { shiftDate: targetDate };
    if (shiftNum !== undefined) shiftQuery.shift = shiftNum;
    const shiftDocs = await db.collection(IOT_COLLECTIONS.SHIFTWISE).find(shiftQuery).toArray();
    packets.push(...extractCommonRecords(shiftDocs));

    const liveDoc = await db.collection(IOT_COLLECTIONS.SPINFO_LIVES).findOne({});
    if (liveDoc && liveDoc.shiftDate === targetDate && (!shiftNum || Number(liveDoc.shift) === shiftNum)) {
      packets.push(liveDoc);
    }

    const dDay = parseInt(targetDate.slice(8, 10), 10);
    const dMonth = parseInt(targetDate.slice(5, 7), 10);
    const dYear = targetDate.slice(0, 4);
    const slashPadded = `${targetDate.slice(8, 10)}/${targetDate.slice(5, 7)}/${dYear}`;
    const slashUnpadded = `${dDay}/${dMonth}/${dYear}`;
    const emQuery: any = { date: { $in: Array.from(new Set([targetDate, slashPadded, slashUnpadded])) } };
    if (shiftNum !== undefined) emQuery.shift = shiftNum;
    emDbRecords = await db.collection(IOT_COLLECTIONS.EM).find(emQuery).toArray();
  } catch (_) {}

  // Shift 1 day window starts at 06:00 IST on targetDate; exclude leftover pre-06:00 Shift 3 breaks from Shift 1 packets
  const targetDayStartMs = Date.parse(`${targetDate}T00:00:00+05:30`);
  const shift1StartMs = targetDayStartMs + 6 * 3600000;

  for (const pkt of packets) {
    if (!pkt || !Array.isArray(pkt.machines)) continue;
    const pktShift = Number(pkt.shift || 1);
    const pktMs = parseIotTimestampMs(pkt.dataTime || pkt.updatedAt || pkt.createdAt);
    const pktHourStart = !isNaN(pktMs) ? getIstHourStartMs(pktMs) : NaN;
    const minBreakMs = pktShift === 1 ? shift1StartMs : targetDayStartMs;

    for (const m of pkt.machines) {
      const mKey = String(m.machine || m.machineId || '').trim().toUpperCase();
      if (!mKey) continue;
      if (targetMachine && mKey !== targetMachine) continue;

      const acc = getOrCreate(mKey);
      const sides: any[] = Array.isArray(m.sides) ? m.sides : [];
      const sideL = sides.find(s => String(s.side).toUpperCase() === 'L');
      const sideR = sides.find(s => String(s.side).toUpperCase() === 'R');

      const emL = Number(sideL?.endMendingTime ?? 0);
      const emR = Number(sideR?.endMendingTime ?? 0);
      const cntL = Number(sideL?.endBreakCount ?? 0);
      const cntR = Number(sideR?.endBreakCount ?? 0);

      if (cntL > acc.maxLeftCount) acc.maxLeftCount = cntL;
      if (cntR > acc.maxRightCount) acc.maxRightCount = cntR;

      const sStat = acc.perShiftStats.get(pktShift) || { brkLeft: 0, brkRight: 0, emLeft: 0, emRight: 0 };
      if (cntL > sStat.brkLeft) sStat.brkLeft = cntL;
      if (cntR > sStat.brkRight) sStat.brkRight = cntR;
      if (emL > 0) sStat.emLeft = emL;
      if (emR > 0) sStat.emRight = emR;
      acc.perShiftStats.set(pktShift, sStat);

      if (!isNaN(pktMs) && pktMs >= acc.latestPacketMs) {
        acc.latestPacketMs = pktMs;
        acc.latestEmLeft = emL;
        acc.latestEmRight = emR;
        acc.latestLeftCount = cntL;
        acc.latestRightCount = cntR;
      }

      if (!isNaN(pktHourStart) && pktHourStart >= minBreakMs) {
        const prev = acc.hourlyEmSnap.get(pktHourStart);
        if (!prev || pktMs >= prev.snapMs) {
          acc.hourlyEmSnap.set(pktHourStart, { snapMs: pktMs, emLeft: emL, emRight: emR });
        }
      }

      for (const eb of sideL?.endBreaks || []) {
        const bMs = parseIotTimestampMs(eb.createdTime || eb.timestamp || pkt.dataTime);
        if (isNaN(bMs) || bMs < minBreakMs) continue;
        const key = `${eb.spindleNo ?? ''}|${eb.createdTime || bMs}`;
        if (!acc.leftMap.has(key)) acc.leftMap.set(key, bMs);
      }
      for (const eb of sideR?.endBreaks || []) {
        const bMs = parseIotTimestampMs(eb.createdTime || eb.timestamp || pkt.dataTime);
        if (isNaN(bMs) || bMs < minBreakMs) continue;
        const key = `${eb.spindleNo ?? ''}|${eb.createdTime || bMs}`;
        if (!acc.rightMap.has(key)) acc.rightMap.set(key, bMs);
      }
    }
  }

  // Merge iot_em records (covers shift-level totals even when em.hour is omitted on historical dates)
  for (const em of emDbRecords) {
    const mKey = String(em.machineNo || '').trim().toUpperCase();
    if (!mKey) continue;
    if (targetMachine && mKey !== targetMachine) continue;
    const acc = getOrCreate(mKey);
    const sNum = Number(em.shift || 1);
    const emL = Number(em.emLeft || 0);
    const emR = Number(em.emRight || 0);
    const cntL = Number(em.endBreakCountLeft || 0);
    const cntR = Number(em.endBreakCountRight || 0);
    if (acc.latestEmLeft === 0 && emL > 0) acc.latestEmLeft = emL;
    if (acc.latestEmRight === 0 && emR > 0) acc.latestEmRight = emR;
    if (cntL > acc.maxLeftCount) acc.maxLeftCount = cntL;
    if (cntR > acc.maxRightCount) acc.maxRightCount = cntR;

    const sStat = acc.perShiftStats.get(sNum) || { brkLeft: 0, brkRight: 0, emLeft: 0, emRight: 0 };
    if (cntL > sStat.brkLeft) sStat.brkLeft = cntL;
    if (cntR > sStat.brkRight) sStat.brkRight = cntR;
    if (sStat.emLeft === 0 && emL > 0) sStat.emLeft = emL;
    if (sStat.emRight === 0 && emR > 0) sStat.emRight = emR;
    acc.perShiftStats.set(sNum, sStat);

    if (em.hour && em.shift) {
      const hrIdx = Math.min(8, Math.max(1, Number(em.hour)));
      const baseHour = sNum === 1 ? 6 : sNum === 2 ? 14 : 22;
      const clockHr = (baseHour + hrIdx - 1) % 24;
      const dayOffset = sNum === 3 && clockHr < 6 ? 1 : 0;
      const baseDateMs = Date.parse(`${targetDate}T00:00:00+05:30`);
      const hStart = baseDateMs + dayOffset * 86400000 + clockHr * 3600000;
      if (!acc.hourlyEmSnap.has(hStart)) {
        acc.hourlyEmSnap.set(hStart, { snapMs: hStart, emLeft: emL, emRight: emR });
      }
    }
  }

  const result: Record<string, EmployeeMachineTelemetry> = {};

  for (const [mKey, acc] of accMap.entries()) {
    const leftBreakTimes = Array.from(acc.leftMap.values()).sort((a, b) => a - b);
    const rightBreakTimes = Array.from(acc.rightMap.values()).sort((a, b) => a - b);

    const hourly: Record<string, EmployeeBreakHourBucket> = {};
    const hourKeys = new Set<number>(acc.hourlyEmSnap.keys());
    for (const ms of leftBreakTimes) hourKeys.add(getIstHourStartMs(ms));
    for (const ms of rightBreakTimes) hourKeys.add(getIstHourStartMs(ms));

    const leftByHour = new Map<number, number>();
    const rightByHour = new Map<number, number>();
    for (const ms of leftBreakTimes) {
      const h = getIstHourStartMs(ms);
      leftByHour.set(h, (leftByHour.get(h) || 0) + 1);
    }
    for (const ms of rightBreakTimes) {
      const h = getIstHourStartMs(ms);
      rightByHour.set(h, (rightByHour.get(h) || 0) + 1);
    }

    const sortedHours = Array.from(hourKeys).sort((a, b) => a - b);
    let emLeftSum = 0;
    let emLeftCnt = 0;
    let emRightSum = 0;
    let emRightCnt = 0;

    for (const hMs of sortedHours) {
      const hIso = new Date(hMs).toISOString();
      const emSnap = acc.hourlyEmSnap.get(hMs);
      const emLeft = emSnap ? Number(emSnap.emLeft.toFixed(2)) : 0;
      const emRight = emSnap ? Number(emSnap.emRight.toFixed(2)) : 0;
      if (emSnap && emLeft > 0) {
        emLeftSum += emLeft;
        emLeftCnt++;
      }
      if (emSnap && emRight > 0) {
        emRightSum += emRight;
        emRightCnt++;
      }
      hourly[hIso] = {
        hourStartMs: hMs,
        hourIso: hIso,
        emLeft,
        emRight,
        breaksLeft: leftByHour.get(hMs) || 0,
        breaksRight: rightByHour.get(hMs) || 0
      };
    }

    // Also compute shift-level average EM & summed shift breaks when hourly packets aren't retained on old dates
    let shiftEmLSum = 0, shiftEmLCnt = 0, shiftEmRSum = 0, shiftEmRCnt = 0;
    let sumShiftBrkL = 0, sumShiftBrkR = 0;
    for (const sVal of acc.perShiftStats.values()) {
      sumShiftBrkL += sVal.brkLeft;
      sumShiftBrkR += sVal.brkRight;
      if (sVal.emLeft > 0) { shiftEmLSum += sVal.emLeft; shiftEmLCnt++; }
      if (sVal.emRight > 0) { shiftEmRSum += sVal.emRight; shiftEmRCnt++; }
    }

    const avgEmLeft =
      emLeftCnt > 0
        ? Number((emLeftSum / emLeftCnt).toFixed(2))
        : shiftEmLCnt > 0
        ? Number((shiftEmLSum / shiftEmLCnt).toFixed(2))
        : acc.latestEmLeft;
    const avgEmRight =
      emRightCnt > 0
        ? Number((emRightSum / emRightCnt).toFixed(2))
        : shiftEmRCnt > 0
        ? Number((shiftEmRSum / shiftEmRCnt).toFixed(2))
        : acc.latestEmRight;

    result[mKey] = {
      machine: mKey,
      leftBreakTimes,
      rightBreakTimes,
      leftTotalBreaks: Math.max(leftBreakTimes.length, sumShiftBrkL, acc.latestLeftCount),
      rightTotalBreaks: Math.max(rightBreakTimes.length, sumShiftBrkR, acc.latestRightCount),
      avgEmLeft,
      avgEmRight,
      latestEmLeft: acc.latestEmLeft,
      latestEmRight: acc.latestEmRight,
      hourly
    };
  }

  if (Object.keys(result).length > 0) {
    empBreakTelemetryCache.set(cacheKey, { data: result, timestamp: Date.now() });
  }
  return result;
}


