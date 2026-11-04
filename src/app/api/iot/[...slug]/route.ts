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
  IOT_COLLECTIONS
} from '@/lib/iot/iotDb';
import {
  SAMPLE_OVERVIEW,
  SAMPLE_MACHINES,
  SAMPLE_EMPLOYEES,
  SAMPLE_DEVICES,
  SAMPLE_CARD_TAPS,
  SAMPLE_EMPLOYEE_METRICS,
  getSampleMachineDetail,
  getSampleSpinfoOverview
} from '@/lib/iot/sampleIotData';

const REMOTE_IOT_API = process.env.IOT_REMOTE_API || 'https://iot-machine-backend.onrender.com/api';

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const path = slug.join('/');
  const { searchParams } = new URL(req.url);

  try {
    // 1. Spinfo & Dashboard Overview
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

    // 2. Machine Detail
    if (
      path.startsWith('machine/') ||
      path.startsWith('machines/') ||
      path.startsWith('spinfo/machine/')
    ) {
      const parts = path.split('/');
      const machineId = parts[parts.length - 1] || 'RF01';
      const data = await getIotMachineDetail(decodeURIComponent(machineId));
      return NextResponse.json({ success: true, data });
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
      if (date) rows = rows.filter(r => r.date === date);
      if (shiftId) rows = rows.filter(r => r.shiftId === shiftId);
      if (machineId) rows = rows.filter(r => r.machineId === machineId);
      if (employeeId) rows = rows.filter(r => r.employeeId === employeeId);

      return NextResponse.json({ success: true, data: rows });
    }

    // 10b. Round Performance Reports
    if (path === 'reports/round-performance' || path === 'round-performance') {
      const machineId = searchParams.get('machineId');
      const employeeId = searchParams.get('employeeId');
      const date = searchParams.get('date');
      const shift = searchParams.get('shift');

      const metrics = await getIotEmployeeMetrics({
        machineId: machineId || undefined,
        employeeId: employeeId || undefined,
        date: date || undefined,
        shiftName: shift || undefined
      });
      return NextResponse.json({ success: true, data: metrics });
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

    // 10d. Raw Common Stream
    if (path === 'common') {
      const shift = searchParams.get('shift');
      const shiftDate = searchParams.get('shiftDate');
      const limit = parseInt(searchParams.get('limit') || '5', 10);
      const shiftNum = shift ? parseInt(shift.replace(/\D/g, ''), 10) || undefined : undefined;
      const doc = await fetchLiveRenderStream(limit, shiftNum, shiftDate);
      if (doc) return NextResponse.json({ success: true, data: Array.isArray(doc) ? doc : [doc] });
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

    // 11. Reports (5 Types)
    if (path.startsWith('reports') || path.startsWith('report')) {
      const reportType = searchParams.get('reportType') || 'rpm_efficiency';
      const overview = await getIotOverview();
      const rows = overview.machines.map(m => ({
        machineId: m.machineId,
        count: m.count,
        runStatus: m.runStatus,
        currentRpm: m.spindleSpeedCurrent,
        targetRpm: 16700,
        efficiencyPercent: Math.round((m.shiftProduction / (m.shiftTargetProduction || 1)) * 100),
        shiftProduction: m.shiftProduction,
        shiftTarget: m.shiftTargetProduction,
        wastePercent: m.shiftWaste
      }));

      return NextResponse.json({
        success: true,
        reportType,
        title: 'Spinning & Machine Efficiency Report',
        data: rows,
        summary: {
          totalMachines: rows.length,
          averageEfficiency: Math.round(rows.reduce((s, r) => s + r.efficiencyPercent, 0) / rows.length),
          averageRpm: Math.round(rows.reduce((s, r) => s + r.currentRpm, 0) / rows.length),
          totalProduction: rows.reduce((s, r) => s + r.shiftProduction, 0).toFixed(1)
        }
      });
    }

    // Fallback: Proxy to Render remote API if unhandled
    try {
      const remoteRes = await fetch(`${REMOTE_IOT_API}/${path}?${searchParams.toString()}`, {
        headers: { 'X-Company-Slug': 'scm' },
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

  // ID can be passed in query ?id=... or at end of path (e.g. master/shifts/shift_1)
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
