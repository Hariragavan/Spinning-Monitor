import { NextRequest, NextResponse } from 'next/server';
import { getIotDb } from '@/lib/mongodb';
import {
  getIotOverview,
  getIotMachineDetail,
  getIotMachinesMaster,
  getIotEmployeesMaster,
  getIotDevicesMaster,
  getIotProductionEntries,
  saveIotProductionEntry,
  deleteIotProductionEntry,
  getIotMaintenance,
  saveIotMaintenance,
  getIotShifts,
  saveIotShift,
  deleteIotShift,
  getIotMappings,
  saveIotMapping,
  getIotEmployeeMetrics,
  fetchLiveRenderStream,
  persistLiveIotPayload,
  IOT_COLLECTIONS,
  IOT_COMMON_API_URL
} from '@/lib/iot/iotDb';
import {
  getLightweightMachineStatuses,
  syncIotEmAndManageShiftHistory,
  getIotEmRecords,
  getLatestEmForAllIotMachines,
  syncIotEmToSpinningMonitor,
  fetchAndSyncAllShiftsFromRailway
} from '@/lib/iot/iotEmService';

const REMOTE_IOT_API = process.env.IOT_REMOTE_API || 'https://iot-machine-backend.onrender.com/api';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  const { searchParams } = new URL(req.url);

  try {
    // 0. Lightweight 45-Second Machine Running Status check
    if (path === 'status' || path === 'machine-status') {
      const statuses = await getLightweightMachineStatuses();
      return NextResponse.json(statuses, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
      });
    }

    // 0.1 Hourly End Mending (EM) records
    if (path === 'em' || path === 'iot-em') {
      const date = searchParams.get('date') || undefined;
      const month = searchParams.get('month') || undefined;
      const shift = searchParams.get('shift') || undefined;
      const machineNo = searchParams.get('machineNo') || searchParams.get('machineId') || undefined;

      const records = await getIotEmRecords({ date, month, shift, machineNo });
      return NextResponse.json({ success: true, count: records.length, data: records });
    }

    // 0.2 Trigger EM 5-Minute Sync & Shift History Management (Syncs all shifts 1, 2, 3)
    if (path === 'em/sync' || path === 'sync-em') {
      const targetDate = searchParams.get('date') || undefined;
      const syncResult = await fetchAndSyncAllShiftsFromRailway(targetDate);
      return NextResponse.json(syncResult);
    }

    // 0.3 Latest EM for All 46 IoT Machines (for Settings machine matching dropdowns)
    if (path === 'em/live-by-machine' || path === 'em/machines') {
      const emMap = await getLatestEmForAllIotMachines();
      return NextResponse.json({ success: true, count: Object.keys(emMap).length, data: emMap }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
      });
    }
    // 1. Spinfo & Dashboard Overview (sourced from https://iot-machine-backend-production.up.railway.app/api/common)
    if (
      path === 'spinfo/overview' ||
      path === 'overview' ||
      path === 'dashboard/overview' ||
      path === 'spinfo/sync'
    ) {
      const fromDate = searchParams.get('fromDate') || undefined;
      const toDate = searchParams.get('toDate') || undefined;
      const shift = searchParams.get('shift') || undefined;
      const operator = searchParams.get('operator') || undefined;

      const force = Boolean(searchParams.get('force') || searchParams.get('_t'));
      const data = await getIotOverview({ fromDate, toDate, shift, operator }, force);
      return NextResponse.json({ success: true, data }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
      });
    }

    // 2. Machine Detail (sourced from https://iot-machine-backend-production.up.railway.app/api/common)
    if (
      path.startsWith('machine/') ||
      path.startsWith('machines/') ||
      path.startsWith('spinfo/machine/')
    ) {
      const parts = path.split('/');
      const machineId = parts[parts.length - 1] || 'RF01';
      const fromDate = searchParams.get('fromDate') || undefined;
      const toDate = searchParams.get('toDate') || undefined;
      const shift = searchParams.get('shift') || undefined;
      const data = await getIotMachineDetail(decodeURIComponent(machineId), { fromDate, toDate, shift });
      return NextResponse.json({ success: true, data }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
      });
    }

    // 3. Machines List
    if (path === 'master/machines' || path === 'machines') {
      const machines = await getIotMachinesMaster();
      return NextResponse.json({ success: true, data: machines });
    }

    // 4. Employees Master
    if (path === 'master/employees' || path === 'employees') {
      const employees = await getIotEmployeesMaster();
      return NextResponse.json({ success: true, data: employees });
    }

    // 5. Employee Performance & Dashboard
    if (path === 'dashboard/employee' || path === 'employee-dashboard') {
      const employeeId = searchParams.get('employeeId') || undefined;
      const machineId = searchParams.get('machineId') || undefined;
      const date = searchParams.get('date') || undefined;
      const shiftName = searchParams.get('shiftName') || searchParams.get('shift') || undefined;
      const shiftId = searchParams.get('shiftId') || undefined;

      let metrics = await getIotEmployeeMetrics({
        employeeId,
        machineId,
        date,
        shiftName,
        shiftId
      });

      if (employeeId) metrics = metrics.filter(m => m.employeeId === employeeId);
      if (machineId) metrics = metrics.filter(m => m.machineId === machineId);

      return NextResponse.json({
        success: true,
        data: metrics
      }, {
        headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
      });
    }

    // 6. Machine Mappings & Configuration
    if (
      path === 'master/machine-mappings' ||
      path === 'mappings' ||
      path === 'configuration'
    ) {
      const mappings = await getIotMappings();
      return NextResponse.json({
        success: true,
        data: mappings
      });
    }

    // 7. Devices
    if (path === 'master/devices' || path === 'devices') {
      const devices = await getIotDevicesMaster();
      return NextResponse.json({ success: true, data: devices });
    }

    // 8. Shifts
    if (path === 'master/shifts' || path === 'shifts') {
      const data = await getIotShifts();
      return NextResponse.json({ success: true, data });
    }

    // 9. Maintenance
    if (path === 'master/maintenance' || path === 'maintenance') {
      const data = await getIotMaintenance();
      return NextResponse.json({ success: true, data });
    }

    // 10. Production Entries / Reports
    if (
      path === 'production' ||
      path === 'production/report' ||
      path === 'production/entries' ||
      path === 'production-entry' ||
      path === 'production-entries'
    ) {
      const date = searchParams.get('date');
      const shiftId = searchParams.get('shiftId');
      const machineId = searchParams.get('machineId');
      const employeeId = searchParams.get('employeeId');

      let rows = await getIotProductionEntries();
      if (date) rows = rows.filter(r => r.date === date || r.shiftDate === date);
      if (shiftId) rows = rows.filter(r => r.shiftId === shiftId);
      if (machineId) rows = rows.filter(r => r.machineId === machineId);
      if (employeeId) rows = rows.filter(r => r.employeeId === employeeId);

      return NextResponse.json({ success: true, data: rows });
    }

    // 10b. Round Performance Reports (queries /dashboard/machine on remote IoT API)
    if (path === 'reports/round-performance' || path === 'round-performance') {
      const machineId = searchParams.get('machineId') || undefined;
      const employeeId = searchParams.get('employeeId') || undefined;
      const date = searchParams.get('date') || searchParams.get('from') || searchParams.get('fromDate') || undefined;
      const shift = searchParams.get('shift') || searchParams.get('shiftName') || undefined;

      const p = new URLSearchParams();
      if (machineId) p.set('machineId', machineId);
      if (employeeId) p.set('employeeId', employeeId);
      if (date) p.set('date', date);
      if (shift) p.set('shiftName', shift);
      p.set('_t', String(Date.now()));

      try {
        const res = await fetch(`${REMOTE_IOT_API}/dashboard/machine?${p.toString()}`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const json = await res.json();
          const roundGaps = json.data?.roundGaps || json.roundGaps || {};
          return NextResponse.json({
            success: true,
            data: {
              rounds: Array.isArray(roundGaps.rounds) ? roundGaps.rounds : [],
              deviceGaps: Array.isArray(roundGaps.deviceGaps) ? roundGaps.deviceGaps : [],
              employees: Array.isArray(roundGaps.employees) ? roundGaps.employees : [],
              totalCompletedRounds: Number(roundGaps.completedRounds ?? roundGaps.totalCompletedRounds ?? 0),
              totalGapMinutes: Number(roundGaps.totalGapMinutes ?? 0),
              averageGapMinutes: Number(roundGaps.averageGapMinutes ?? 0)
            }
          });
        }
      } catch (_) {}

      return NextResponse.json({
        success: true,
        data: {
          rounds: [],
          deviceGaps: [],
          employees: [],
          totalCompletedRounds: 0,
          totalGapMinutes: 0,
          averageGapMinutes: 0
        }
      });
    }

    // 10c. Shift Summaries / Telemetry
    if (path === 'spinfo/shifts' || path === 'shifts/summary') {
      const date = searchParams.get('date') || searchParams.get('shiftDate');
      try {
        const db = await getIotDb();
        const filter: any = {};
        if (date) filter.shiftDate = date;
        const summaries = await db.collection(IOT_COLLECTIONS.COMMON).find(filter).sort({ createdAt: -1 }).limit(20).toArray();
        return NextResponse.json({ success: true, data: summaries });
      } catch {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    // 10d. Raw Common Stream (from https://iot-machine-backend-production.up.railway.app/api/common)
    if (path === 'common') {
      const shift = searchParams.get('shift');
      const shiftDate = searchParams.get('shiftDate');
      const limit = parseInt(searchParams.get('limit') || '10', 10);
      const shiftNum = shift ? parseInt(shift.replace(/\D/g, ''), 10) || undefined : undefined;
      const doc = await fetchLiveRenderStream(limit, shiftNum, shiftDate);
      if (doc) return NextResponse.json({ success: true, sourceApi: IOT_COMMON_API_URL, data: Array.isArray(doc) ? doc : [doc] });
      try {
        const db = await getIotDb();
        const q: any = {};
        if (shiftNum !== undefined) q.shift = shiftNum;
        if (shiftDate) q.shiftDate = shiftDate;
        const docs = await db.collection(IOT_COLLECTIONS.COMMON).find(q).sort({ createdAt: -1 }).limit(limit).toArray();
        return NextResponse.json({ success: true, data: docs });
      } catch {
        return NextResponse.json({ success: true, data: [] });
      }
    }

    // 11. Reports (5 Database-backed Operational Reports from REMOTE_IOT_API)
    if (path === 'reports' || path === 'report' || path === 'master/reports') {
      const reportType = searchParams.get('reportType') || 'rpm_efficiency';
      const machineId = searchParams.get('machineId');
      const employeeId = searchParams.get('employeeId');
      const shiftId = searchParams.get('shiftId');
      const from = searchParams.get('from') || searchParams.get('fromDate');
      const to = searchParams.get('to') || searchParams.get('toDate');

      const p = new URLSearchParams();
      p.set('reportType', reportType);
      if (machineId) p.set('machineId', machineId);
      if (employeeId) p.set('employeeId', employeeId);
      if (shiftId) p.set('shiftId', shiftId);
      if (from) p.set('from', from);
      if (to) p.set('to', to);
      p.set('_t', String(Date.now()));

      try {
        const res = await fetch(`${REMOTE_IOT_API}/master/reports?${p.toString()}`, {
          cache: 'no-store'
        });
        if (res.ok) {
          const json = await res.json();
          return NextResponse.json(json, {
            headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
          });
        }
      } catch (err: any) {
        console.warn('Reports fetch from remote failed:', err?.message);
      }

      const defaultTitles: Record<string, string> = {
        rpm_efficiency: 'RPM & Machine Efficiency Report',
        employee_productivity: 'Employee Productivity & Round Gap Report',
        downtime_modes: 'Machine Downtime & Mode Analysis Report',
        duty_coverage: 'Device & Employee Duty Coverage Report',
        cleaning_maintenance: 'Machine Cleaning & Maintenance Schedule Report'
      };

      return NextResponse.json({
        success: true,
        reportType,
        title: defaultTitles[reportType] || 'Operational Report',
        data: []
      });
    }

    // Fallback: Proxy to Render remote API if unhandled
    try {
      const remoteRes = await fetch(`${REMOTE_IOT_API}/${path}?${searchParams.toString()}`, {
        cache: 'no-store'
      });
      if (remoteRes.ok) {
        const json = await remoteRes.json();
        return NextResponse.json(json);
      }
    } catch {}

    // Unknown route
    return NextResponse.json({ success: false, error: `Route not found: ${path}` }, { status: 404 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'IoT API failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');

  try {
    const body = await req.json();

    // Sync live IoT payload (e.g. from Railway common API) to MongoDB Atlas
    if (path === 'spinfo/sync' || path === 'sync' || path === 'spinfo/overview') {
      await persistLiveIotPayload(body);
      return NextResponse.json({ success: true, message: 'Payload synced to MongoDB' });
    }

    if (
      path === 'production' ||
      path === 'production/entries' ||
      path === 'production-entry' ||
      path === 'production-entries'
    ) {
      const saved = await saveIotProductionEntry(body);
      return NextResponse.json({ success: true, data: saved });
    }

    if (path === 'master/maintenance' || path === 'maintenance') {
      const saved = await saveIotMaintenance(body);
      return NextResponse.json({ success: true, data: saved });
    }

    if (path === 'master/shifts' || path === 'shifts') {
      const saved = await saveIotShift(body);
      return NextResponse.json({ success: true, data: saved });
    }

    if (
      path === 'master/machine-mappings' ||
      path === 'configuration' ||
      path === 'mappings'
    ) {
      const saved = await saveIotMapping(body);
      return NextResponse.json({ success: true, data: saved });
    }

    // EM Sync from iot_em into spinning_monitor machine_em
    if (path === 'em/sync-to-spinning' || path === 'em/match' || path === 'em/map') {
      const mappings = body.mappings || body.mapping || body;
      const targetDate = body.date || undefined;
      const result = await syncIotEmToSpinningMonitor(mappings, targetDate);
      return NextResponse.json(result);
    }

    return NextResponse.json({ success: true, data: body });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'IoT API post failed' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');

  try {
    const body = await req.json();

    if (path.startsWith('master/machine-mappings') || path.startsWith('mappings/')) {
      const saved = await saveIotMapping(body);
      return NextResponse.json({ success: true, data: saved });
    }

    if (path.startsWith('master/shifts') || path.startsWith('shifts/')) {
      const saved = await saveIotShift(body);
      return NextResponse.json({ success: true, data: saved });
    }

    if (path.startsWith('master/maintenance') || path.startsWith('maintenance/')) {
      const saved = await saveIotMaintenance(body);
      return NextResponse.json({ success: true, data: saved });
    }

    if (
      path === 'production' ||
      path.startsWith('production/') ||
      path.startsWith('production/entries') ||
      path.startsWith('production-entry/')
    ) {
      const saved = await saveIotProductionEntry(body);
      return NextResponse.json({ success: true, data: saved });
    }

    return NextResponse.json({ success: true, data: body });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'IoT API put failed' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  const { searchParams } = new URL(req.url);

  const parts = path.split('/');
  const idFromPath = parts.length > 1 ? parts[parts.length - 1] : null;
  const id = searchParams.get('id') || idFromPath;

  try {
    if (!id) {
      return NextResponse.json({ success: false, error: 'id required' }, { status: 400 });
    }

    if (
      path === 'production' ||
      path.startsWith('production/') ||
      path.startsWith('production/entries') ||
      path.startsWith('production-entry') ||
      path.startsWith('production-entries')
    ) {
      const ok = await deleteIotProductionEntry(id);
      return NextResponse.json({ success: ok });
    }

    if (path.startsWith('master/shifts') || path.startsWith('shifts')) {
      const ok = await deleteIotShift(id);
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'IoT API delete failed' }, { status: 500 });
  }
}
