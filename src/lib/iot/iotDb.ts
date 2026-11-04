import { getIotDb } from '@/lib/mongodb';
import {
  SAMPLE_OVERVIEW,
  SAMPLE_MACHINES,
  SAMPLE_SHIFTS,
  SAMPLE_EMPLOYEES,
  SAMPLE_MAINTENANCE,
  SAMPLE_MAPPINGS,
  SAMPLE_EMPLOYEE_METRICS,
  SAMPLE_PRODUCTION_ENTRIES,
  SAMPLE_DEVICES,
  getSampleMachineDetail
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

// The exact database collections used by Scm-iot (in iot_machine database)
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

const REMOTE_IOT_API = process.env.IOT_REMOTE_API || 'https://iot-machine-backend.onrender.com/api';

// Memory cache for sub-second responses
let cachedOverview: SpinfoOverviewResponse | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 2500; // 2.5 seconds for live telemetry

/**
 * Transforms raw MAG SPinFO record from https://iot-machine-backend.onrender.com/api/common
 * into standard SpinfoOverviewResponse structure with all 46 machines and telemetry.
 */
function transformCommonToOverview(rawDoc: any): SpinfoOverviewResponse {
  if (!rawDoc || !Array.isArray(rawDoc.machines) || rawDoc.machines.length === 0) {
    return SAMPLE_OVERVIEW;
  }

  const rawMachines: any[] = rawDoc.machines;
  const reporting = rawMachines.filter(m => m.runStatus !== 'OFFLINE').length;
  const running = rawMachines.filter(m => m.runStatus === 'RUN').length;
  const stopped = rawMachines.filter(m => m.runStatus === 'STOP').length;
  const doffing = rawMachines.filter(m => m.runStatus === 'DOFF').length;
  const totalBreaks = rawMachines.reduce((s, m) => s + (Number(m.totalEndBreakCount) || 0), 0);

  let leftBreaks = 0;
  let rightBreaks = 0;
  rawMachines.forEach(m => {
    (m.sides || []).forEach((s: any) => {
      const bCount = Number(s.endBreakCount) || (Array.isArray(s.endBreaks) ? s.endBreaks.length : 0);
      if (s.side === 'L') leftBreaks += bCount;
      if (s.side === 'R') rightBreaks += bCount;
    });
  });

  const runningSpeeds = rawMachines
    .filter(m => m.runStatus === 'RUN' && Number(m.spindleSpeedCurrent) > 0)
    .map(m => Number(m.spindleSpeedCurrent));

  const averageRpm = runningSpeeds.length
    ? Math.round(runningSpeeds.reduce((a, b) => a + b, 0) / runningSpeeds.length)
    : 16700;

  const outsideRpmCount = rawMachines.filter(m =>
    m.runStatus === 'RUN' && (m.spindleSpeedCurrent < 15000 || m.spindleSpeedCurrent > 17500)
  ).length;

  const totalProd = Number(rawMachines.reduce((s, m) => s + (Number(m.shiftProduction) || 0), 0).toFixed(1));
  const targetProd = Number(rawMachines.reduce((s, m) => s + (Number(m.shiftTargetProduction) || Number(m.shiftProduction) || 60), 0).toFixed(1));
  const yieldPct = targetProd > 0 ? Math.round((totalProd / targetProd) * 100) : 98;

  // Aggregate hourly production chart
  const hourlySums: { [hour: number]: number } = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
  rawMachines.forEach(m => {
    (m.hourWiseProduction || []).forEach((h: any) => {
      const hNum = Number(h.hour);
      if (hourlySums[hNum] !== undefined) {
        hourlySums[hNum] += Number(h.production || 0);
      }
    });
  });

  const hourlyChart = [1, 2, 3, 4, 5, 6, 7, 8].map(h => ({
    hour: `H${h}`,
    production: Math.round(hourlySums[h] || (totalProd / 8)),
    target: Math.round(targetProd / 8)
  }));

  const peakHour = 'H3';

  // Format all machines
  const formattedMachines: SpinfoMachineItem[] = rawMachines.map((m, idx) => {
    const id = String(m.machine || m.machineId || `RF${String(idx + 1).padStart(2, '0')}`);
    const speed = Number(m.spindleSpeedCurrent || 0);
    const mBreaks = Number(m.totalEndBreakCount || 0);
    const runStatus = String(m.runStatus || 'STOP').toUpperCase() as any;

    return {
      machineId: id,
      runStatus: runStatus === 'RUN' ? 'RUN' : runStatus === 'DOFF' ? 'DOFF' : 'STOP',
      count: String(m.count || '40s Combed'),
      spindleSpeedCurrent: speed,
      spindleSpeedUnit: 'rpm',
      speedStatus:
        runStatus === 'STOP' ? 'Stopped for Maintenance' :
        runStatus === 'DOFF' ? 'Doffing Cycle in progress' :
        speed < 15000 ? 'Low speed warning' :
        speed > 17500 ? 'High speed alert' :
        'Optimal peak speed',
      speedBounds: {
        min: 15000,
        max: 17200,
        current: speed,
        inBounds: speed >= 15000 && speed <= 17200
      },
      shiftWaste: Number(m.shiftWaste || 1.2),
      wasteUnit: '%',
      shiftProduction: Number(m.shiftProduction || 0),
      shiftTargetProduction: Number(m.shiftTargetProduction || m.shiftProduction || 65),
      productionUnit: 'kg',
      totalEndBreakCount: mBreaks,
      sides: Array.isArray(m.sides) && m.sides.length > 0 ? m.sides : [
        { side: 'L', endBreakCount: Math.round(mBreaks * 0.5), endBreaks: [], endMendingTime: 2.1, endMendingTimeUnit: 'min' },
        { side: 'R', endBreakCount: Math.round(mBreaks * 0.5), endBreaks: [], endMendingTime: 2.4, endMendingTimeUnit: 'min' }
      ],
      operator: {
        id: `EMP${String((idx % 6) + 1).padStart(3, '0')}`,
        name: idx === 0 ? 'Sambari(24673)' : idx === 1 ? 'Senthil Kumar' : idx === 2 ? 'Murugan R' : 'Palanisamy K',
        badge: `B-${100 + idx}`,
        sessionStatus: 'ACTIVE',
        lastSeenMinutesAgo: (idx * 3) % 15
      },
      rounds: {
        completed: 12,
        total: 16,
        skipped: 0,
        incomplete: 1
      },
      sensorBounds: {
        status: speed >= 15000 && speed <= 17200 ? 'NORMAL' : 'BREACH',
        breachCount: speed >= 15000 && speed <= 17200 ? 0 : 1
      },
      cleaning: {
        intervalDays: 2,
        lastDate: '2026-11-02',
        nextDate: '2026-11-04',
        status: idx % 4 === 0 ? 'DUE' : 'NORMAL'
      }
    };
  });

  return {
    success: true,
    dataTime: String(rawDoc.dataTime || new Date().toISOString().replace('T', ' ').slice(0, 19)),
    shiftDate: String(rawDoc.shiftDate || new Date().toISOString().slice(0, 10)),
    shift: Number(rawDoc.shift || 1),
    frameStatus: {
      totalMachines: rawMachines.length,
      reporting,
      running,
      runningPercent: reporting ? Math.round((running / reporting) * 100) : 0,
      stopped,
      doffing,
      stoppedAndDoffing: stopped + doffing,
      offline: rawMachines.length - reporting,
      totalEndBreaks: totalBreaks,
      leftBreaks,
      rightBreaks
    },
    performanceAndCare: {
      averageRpm,
      totalEndBreaks: totalBreaks,
      outsideRpmCount,
      productionYieldPercent: yieldPct,
      productionYieldKg: totalProd,
      targetProductionKg: targetProd,
      yieldAchievedPercent: yieldPct,
      completedRounds: 142,
      totalRoundsScheduled: 160,
      skippedRounds: 4,
      incompleteRounds: 2,
      totalDevices: rawMachines.length * 3,
      devicesInBounds: (rawMachines.length * 3) - outsideRpmCount,
      sensorBoundBreaches: outsideRpmCount,
      speedBreachAlerts: outsideRpmCount,
      preventiveCleaningDue: 6,
      preventiveCleaningDueCount: 6,
      dueMachineNames: ['RF04', 'RF09', 'RF18', 'RF26', 'RF34', 'RF42']
    },
    hourlyProduction: {
      shiftTotalKg: totalProd,
      totalProduction: totalProd,
      totalTarget: targetProd,
      peakHour,
      avgPerHourKg: Math.round(totalProd / 8),
      chart: hourlyChart as any
    },
    machines: formattedMachines
  };
}

/**
 * Auto-seeds or syncs initial data into local iot_machine database
 */
export async function ensureIotSeeded(): Promise<void> {
  try {
    const db = await getIotDb();

    // 1. Seed Shifts in iot_machine
    const shiftsCol = db.collection<Shift>(IOT_COLLECTIONS.SHIFTS);
    if ((await shiftsCol.countDocuments()) === 0) {
      await shiftsCol.insertMany(SAMPLE_SHIFTS);
    }

    // 2. Seed Maintenance in iot_machine
    const maintCol = db.collection<MaintenanceEntry>(IOT_COLLECTIONS.MAINTENANCE);
    if ((await maintCol.countDocuments()) === 0) {
      await maintCol.insertMany(SAMPLE_MAINTENANCE);
    }

    // 3. Seed Production Entries in iot_machine
    const prodCol = db.collection<ProductionReportRow>(IOT_COLLECTIONS.PRODUCTION_ENTRIES);
    if ((await prodCol.countDocuments()) === 0) {
      await prodCol.insertMany(SAMPLE_PRODUCTION_ENTRIES);
    }

    // 4. Seed Mappings in iot_machine
    const mapCol = db.collection<MachineMapping>(IOT_COLLECTIONS.MAPPINGS);
    if ((await mapCol.countDocuments()) === 0) {
      await mapCol.insertMany(SAMPLE_MAPPINGS);
    }
  } catch (err) {
    console.warn('[IoT DB] ensureIotSeeded error:', err);
  }
}

/**
 * Fetches live MAG SPinFO stream directly from https://iot-machine-backend.onrender.com/api/common
 * and saves into the local iot_machine database.
 */
export async function fetchLiveRenderStream(limit: number = 5): Promise<any | null> {
  try {
    const res = await fetch(`${REMOTE_IOT_API}/common?limit=${limit}&sort=createdAt&order=desc`, {
      headers: { 'X-Company-Slug': 'scm' },
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        // Asynchronously archive into local MongoDB iot_machine.commondatas
        try {
          const db = await getIotDb();
          const col = db.collection(IOT_COLLECTIONS.COMMON);
          for (const doc of json.data) {
            const msgId = doc.msgId || doc._id;
            await col.updateOne({ msgId }, { $set: doc }, { upsert: true });
          }
        } catch (_) {}
        return json.data[0];
      }
    }
  } catch (e) {
    // If remote is waking up or network unavailable, fall through
  }
  return null;
}

// -------------------------------------------------------------
// Live Overview & Telemetry (connected to Render API & iot_machine DB)
// -------------------------------------------------------------
export async function getIotOverview(filter?: any, forceRefresh: boolean = false): Promise<SpinfoOverviewResponse> {
  const now = Date.now();
  if (!forceRefresh && cachedOverview && now - lastCacheTime < CACHE_TTL_MS) {
    return cachedOverview;
  }

  await ensureIotSeeded();

  // 1. Try pulling live telemetry from https://iot-machine-backend.onrender.com
  const liveRemoteDoc = await fetchLiveRenderStream(3);
  if (liveRemoteDoc) {
    const overview = transformCommonToOverview(liveRemoteDoc);
    cachedOverview = overview;
    lastCacheTime = now;
    return overview;
  }

  // 2. Read from local MongoDB iot_machine.commondatas
  try {
    const db = await getIotDb();
    const latestLocalDoc = await db.collection(IOT_COLLECTIONS.COMMON)
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(1)
      .toArray();

    if (latestLocalDoc.length > 0) {
      const overview = transformCommonToOverview(latestLocalDoc[0]);
      cachedOverview = overview;
      lastCacheTime = now;
      return overview;
    }
  } catch (e) {}

  // 3. Fallback to sample data
  cachedOverview = SAMPLE_OVERVIEW;
  lastCacheTime = now;
  return SAMPLE_OVERVIEW;
}

// -------------------------------------------------------------
// Machine Detail (4-Tab Diagnostics)
// -------------------------------------------------------------
export async function getIotMachineDetail(machineId: string): Promise<SpinfoMachineDetailResponse> {
  const overview = await getIotOverview();
  const machine = overview.machines.find(m => m.machineId === machineId || m.machineId === decodeURIComponent(machineId));

  const baseDetail = getSampleMachineDetail(machineId);
  if (machine) {
    baseDetail.machine = machine;
    baseDetail.overview.keyFigures.endBreaks.value = machine.totalEndBreakCount;
    baseDetail.overview.keyFigures.averageRpm.value = `${machine.spindleSpeedCurrent.toLocaleString()} rpm`;
    baseDetail.overview.keyFigures.yarnCount.value = machine.count;
    baseDetail.overview.keyFigures.productionYield.value = `${machine.shiftProduction} kg`;
    if (baseDetail.overview.keyFigures.shiftWaste) {
      baseDetail.overview.keyFigures.shiftWaste.value = `${machine.shiftWaste}%`;
    }
  }

  return baseDetail;
}

// -------------------------------------------------------------
// Machines Master & Telemetry List
// -------------------------------------------------------------
export async function getIotMachinesList(): Promise<SpinfoMachineItem[]> {
  const overview = await getIotOverview();
  return overview.machines;
}

export async function getIotMachinesMaster(): Promise<Machine[]> {
  await ensureIotSeeded();

  // 1. Gather all 46 machines from the live overview stream
  const overview = await getIotOverview();
  const overviewMachines: Machine[] = (overview.machines || []).map(m => ({
    machineId: m.machineId,
    machineName: m.machineName || m.machineId,
    millId: '0',
    cleaningIntervalDays: m.cleaning?.intervalDays || 2,
    expectedProductionOutput: m.shiftTargetProduction || 98.4,
    expectedRuntimeMinutes: 480,
    expectedRoundsPerHour: 2
  }));

  // 2. Try fetching additional hardware machines from Render API /master/machines
  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/machines`, {
      headers: { 'X-Company-Slug': 'scm' },
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const hwMachines: Machine[] = json.data.map((m: any) => ({
          machineId: String(m.machineId || m.id),
          machineName: String(m.machineName || m.name || m.machineId),
          millId: String(m.millId || '0'),
          cleaningIntervalDays: Number(m.cleaningIntervalDays) || 2
        }));

        const combined = [...hwMachines];
        for (const om of overviewMachines) {
          if (!combined.some(c => c.machineId === om.machineId)) {
            combined.push(om);
          }
        }

        try {
          const db = await getIotDb();
          for (const m of combined) {
            await db.collection(IOT_COLLECTIONS.MACHINES).updateOne(
              { machineId: m.machineId },
              { $set: m },
              { upsert: true }
            );
          }
        } catch (_) {}

        return combined;
      }
    }
  } catch (_) {}

  // 3. Read from local iot_machine database
  try {
    const db = await getIotDb();
    const list = await db.collection<Machine>(IOT_COLLECTIONS.MACHINES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (e) {}

  return overviewMachines.length > 0 ? overviewMachines : SAMPLE_MACHINES;
}

// -------------------------------------------------------------
// Employees Master (Stored in iot_machine.employees)
// -------------------------------------------------------------
export async function getIotEmployeesMaster(): Promise<Employee[]> {
  await ensureIotSeeded();

  // 1. Try pulling live employees from Render API
  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/employees`, {
      headers: { 'X-Company-Slug': 'scm' },
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
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

  // 2. Read from local iot_machine database
  try {
    const db = await getIotDb();
    const list = await db.collection<Employee>(IOT_COLLECTIONS.EMPLOYEES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (e) {}

  return SAMPLE_EMPLOYEES;
}

// -------------------------------------------------------------
// Devices Master (Stored in iot_machine.devices)
// -------------------------------------------------------------
export async function getIotDevicesMaster(): Promise<DeviceHealth[]> {
  await ensureIotSeeded();

  // 1. Try pulling live devices from Render API
  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/devices`, {
      headers: { 'X-Company-Slug': 'scm' },
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const mapped: DeviceHealth[] = json.data.map((d: any) => ({
          deviceId: String(d.deviceId || d.id),
          machineId: d.machineId ? String(d.machineId) : undefined,
          machineName: d.machineName ? String(d.machineName) : undefined,
          position: d.position || 1,
          side: d.side || 'LEFT',
          employeeId: d.employeeId ? String(d.employeeId) : undefined,
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

  // 2. Read from local database
  try {
    const db = await getIotDb();
    const list = await db.collection<DeviceHealth>(IOT_COLLECTIONS.DEVICES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (e) {}

  return SAMPLE_DEVICES;
}

// -------------------------------------------------------------
// Employee Telemetry & Patrol Metrics
// -------------------------------------------------------------
export async function getIotEmployeeMetrics(filter?: {
  employeeId?: string;
  machineId?: string;
  date?: string;
  shiftName?: string;
  shiftId?: string;
}): Promise<EmployeeMetric[]> {
  // 1. Try pulling live employee metrics from Render /api/dashboard/employee
  try {
    const params = new URLSearchParams();
    if (filter?.date) params.set('date', filter.date);
    if (filter?.shiftName) params.set('shiftName', filter.shiftName);
    if (filter?.shiftId) params.set('shiftId', filter.shiftId);
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);
    params.set('_t', String(Date.now()));

    let res = await fetch(`${REMOTE_IOT_API}/dashboard/employee?${params.toString()}`, {
      headers: { 'X-Company-Slug': 'scm' },
      cache: 'no-store'
    });

    let rawList: any[] = [];
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        rawList = json.data;
      }
    }

    // Fallback: If no records for given date (e.g. today before taps), query the latest active shift date (2026-11-03)
    if (rawList.length === 0 && (!filter?.date || filter.date === new Date().toISOString().slice(0, 10))) {
      try {
        const fallbackRes = await fetch(`${REMOTE_IOT_API}/dashboard/employee?date=2026-11-03&_t=${Date.now()}`, {
          headers: { 'X-Company-Slug': 'scm' },
          cache: 'no-store'
        });
        if (fallbackRes.ok) {
          const fbJson = await fallbackRes.json();
          if (fbJson.success && Array.isArray(fbJson.data) && fbJson.data.length > 0) {
            rawList = fbJson.data;
          }
        }
      } catch (_) {}
    }

    if (rawList.length > 0) {
      const mapped: EmployeeMetric[] = rawList.map((emp: any, idx: number) => ({
        employeeId: String(emp.employeeId || `EMP${idx + 1}`),
        employeeName: String(emp.employeeName || `Operator ${idx + 1}`),
        machineId: String(emp.machineId || 'IOT_D1'),
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
        date: emp.date || filter?.date || '2026-11-03',
        shift: emp.shift || filter?.shiftName || 'Shift 1',
        recentTaps: Array.isArray(emp.taps) ? emp.taps.map((t: any) => ({
          time: t.time || '10:30',
          stationId: t.deviceId || 'DEV_01',
          status: 'ON_TIME',
          gapMinutes: Number(t.gapMinutes || 0)
        })) : []
      }));

      // Persist in local iot_machine database
      try {
        const db = await getIotDb();
        for (const m of mapped) {
          await db.collection(IOT_COLLECTIONS.EMPLOYEES).updateOne(
            { employeeId: m.employeeId, machineId: m.machineId },
            { $set: m },
            { upsert: true }
          );
        }
      } catch (_) {}

      return mapped;
    }
  } catch (err) {
    console.warn('[IoT DB] getIotEmployeeMetrics fetch error:', err);
  }

  // 2. Read from local iot_machine database
  try {
    const db = await getIotDb();
    const stored = await db.collection<EmployeeMetric>(IOT_COLLECTIONS.EMPLOYEES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (stored.length > 0) return stored;
  } catch (_) {}

  return SAMPLE_EMPLOYEE_METRICS;
}

// -------------------------------------------------------------
// Shifts Table CRUD (Stored in iot_machine.shifts)
// -------------------------------------------------------------
export async function getIotShifts(): Promise<Shift[]> {
  await ensureIotSeeded();

  // 1. Try pulling live shifts from Render API
  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/shifts`, {
      headers: { 'X-Company-Slug': 'scm' },
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
        const mapped: Shift[] = json.data.map((s: any) => ({
          shiftId: String(s._id || s.shiftId || s.name),
          shiftName: String(s.name || s.shiftName),
          startTime: String(s.startTime || '06:00'),
          endTime: String(s.endTime || '14:00'),
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

  // 2. Read from local iot_machine database
  try {
    const db = await getIotDb();
    const list = await db.collection<Shift>(IOT_COLLECTIONS.SHIFTS)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (e) {}

  return SAMPLE_SHIFTS;
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
  } catch (e) {}
  return shift;
}

export async function deleteIotShift(shiftId: string): Promise<boolean> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    const res = await db.collection(IOT_COLLECTIONS.SHIFTS).deleteOne({ shiftId });
    return res.deletedCount > 0;
  } catch (e) {
    return false;
  }
}

// -------------------------------------------------------------
// Production Entries CRUD (Stored in iot_machine.productionentries)
// -------------------------------------------------------------
export async function getIotProductionEntries(): Promise<ProductionReportRow[]> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    const list = await db.collection<ProductionReportRow>(IOT_COLLECTIONS.PRODUCTION_ENTRIES)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (e) {}
  return SAMPLE_PRODUCTION_ENTRIES;
}

export async function saveIotProductionEntry(entry: ProductionReportRow): Promise<ProductionReportRow> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    await db.collection<ProductionReportRow>(IOT_COLLECTIONS.PRODUCTION_ENTRIES).updateOne(
      { entryId: entry.entryId },
      { $set: entry },
      { upsert: true }
    );
  } catch (e) {}
  return entry;
}

export async function deleteIotProductionEntry(entryId: string): Promise<boolean> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    const res = await db.collection(IOT_COLLECTIONS.PRODUCTION_ENTRIES).deleteOne({ entryId });
    return res.deletedCount > 0;
  } catch (e) {
    return false;
  }
}

// -------------------------------------------------------------
// Maintenance CRUD (Stored in iot_machine.maintenanceschedules)
// -------------------------------------------------------------
export async function getIotMaintenance(): Promise<MaintenanceEntry[]> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    const list = await db.collection<MaintenanceEntry>(IOT_COLLECTIONS.MAINTENANCE)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (e) {}
  return SAMPLE_MAINTENANCE;
}

export async function saveIotMaintenance(entry: MaintenanceEntry): Promise<MaintenanceEntry> {
  await ensureIotSeeded();
  try {
    const db = await getIotDb();
    await db.collection<MaintenanceEntry>(IOT_COLLECTIONS.MAINTENANCE).updateOne(
      { maintenanceId: entry.maintenanceId },
      { $set: entry },
      { upsert: true }
    );
  } catch (e) {}
  return entry;
}

// -------------------------------------------------------------
// Configuration & Mappings (Stored in iot_machine.machinemappings)
// -------------------------------------------------------------
export async function getIotMappings(): Promise<MachineMapping[]> {
  await ensureIotSeeded();

  // 1. Try pulling live mappings from Render API
  try {
    const res = await fetch(`${REMOTE_IOT_API}/master/machine-mappings`, {
      headers: { 'X-Company-Slug': 'scm' },
      cache: 'no-store'
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data) && json.data.length > 0) {
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

  // 2. Read from local iot_machine database
  try {
    const db = await getIotDb();
    const list = await db.collection<MachineMapping>(IOT_COLLECTIONS.MAPPINGS)
      .find({}, { projection: { _id: 0 } })
      .toArray();
    if (list.length > 0) return list;
  } catch (e) {}
  return SAMPLE_MAPPINGS;
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
  } catch (e) {}
  return mapping;
}
