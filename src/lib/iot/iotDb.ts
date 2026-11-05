import { getIotDb } from '@/lib/mongodb';
import {
  EMPTY_COMMON_OVERVIEW,
  SAMPLE_OVERVIEW,
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
  COMMON: 'commondatas',
  MACHINES: 'machines',
  EMPLOYEES: 'employees',
  DEVICES: 'devices',
  SHIFTS: 'shifts',
  MAPPINGS: 'machinemappings',
  PRODUCTION_ENTRIES: 'productionentries',
  MAINTENANCE: 'maintenanceschedules',
  SPINFO_LIVES: 'spinfolives',
  SPINFO_HISTORIES: 'spinfohistories'
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

/**
 * Fetches live MAG SPinFO records directly from
 * https://iot-machine-backend-production.up.railway.app/api/common
 * (with fallback to Render /api/common) and archives into local MongoDB.
 */
export async function fetchLiveRenderStream(
  limit: number = 50,
  shiftNum?: number,
  date?: string
): Promise<any[]> {
  const urlsToTry = [
    IOT_COMMON_API_URL,
    `${REMOTE_IOT_API}/common?limit=${limit}&sort=createdAt&order=desc`
  ];

  for (const baseUrl of urlsToTry) {
    try {
      const res = await fetch(baseUrl, { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const records = extractCommonRecords(json);
        if (records.length > 0) {
          try {
            const db = await getIotDb();
            const col = db.collection(IOT_COLLECTIONS.COMMON);
            for (const doc of records) {
              const msgId = doc.msgId || doc._id || `${doc.shiftDate}_${doc.shift}_${doc.part || 1}`;
              await col.updateOne({ msgId }, { $set: doc }, { upsert: true });
            }
          } catch (_) {}
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
  const targetDate = filter?.fromDate || filter?.toDate || filter?.shiftDate;
  const shiftFilter = filter?.shift;
  const cacheKey = `${shiftFilter ?? 'all'}_${targetDate ?? 'any'}`;
  const now = Date.now();

  const cached = overviewCache.get(cacheKey);
  if (!forceRefresh && cached && now - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  // 1. Pull live telemetry from https://iot-machine-backend-production.up.railway.app/api/common
  const liveRecords = await fetchLiveRenderStream(50);
  if (liveRecords.length > 0) {
    const { record, availableDates, availableShifts } = selectAndMergeCommonRecord(liveRecords, {
      fromDate: targetDate,
      shift: shiftFilter
    });
    if (record) {
      const overview = transformCommonToOverview(record, { availableDates, availableShifts });
      overviewCache.set(cacheKey, { data: overview, timestamp: now });
      return overview;
    }
  }

  // 2. Fallback to local MongoDB iot_machine.commondatas
  try {
    const db = await getIotDb();
    const localDocs = await db
      .collection(IOT_COLLECTIONS.COMMON)
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(50)
      .toArray();

    const validLocal = extractCommonRecords(localDocs);
    if (validLocal.length > 0) {
      const { record, availableDates, availableShifts } = selectAndMergeCommonRecord(validLocal, {
        fromDate: targetDate,
        shift: shiftFilter
      });
      if (record) {
        const overview = transformCommonToOverview(record, { availableDates, availableShifts });
        overviewCache.set(cacheKey, { data: overview, timestamp: now });
        return overview;
      }
    }
  } catch (_) {}

  // 3. Return empty overview when no live telemetry is available
  return EMPTY_COMMON_OVERVIEW;
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
  await ensureIotSeeded();

  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/shifts`, { cache: 'no-store' });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        const mapped: Shift[] = json.data.map((s: any) => ({
          shiftId: String(s._id || s.shiftId || s.name || s.shiftName),
          name: String(s.name || s.shiftName || 'Shift 1'),
          shiftName: String(s.shiftName || s.name || 'Shift 1'),
          startTime: String(s.startTime || '06:00'),
          endTime: String(s.endTime || '14:00'),
          overnight: Boolean(s.overnight),
          active: s.active !== false
        }));

        try {
          const db = await getIotDb();
          for (const sh of mapped) {
            await db.collection(IOT_COLLECTIONS.SHIFTS).updateOne(
              { shiftId: sh.shiftId },
              { $set: sh },
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
      .collection<Shift>(IOT_COLLECTIONS.SHIFTS)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) {
      return list.map((s: any) => ({
        shiftId: String(s.shiftId || s._id),
        name: String(s.name || s.shiftName || 'Shift 1'),
        shiftName: String(s.shiftName || s.name || 'Shift 1'),
        startTime: String(s.startTime || '06:00'),
        endTime: String(s.endTime || '14:00'),
        overnight: Boolean(s.overnight),
        active: s.active !== false
      }));
    }
  } catch (_) {}

  return [];
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
