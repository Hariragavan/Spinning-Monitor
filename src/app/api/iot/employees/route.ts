import { NextRequest, NextResponse } from 'next/server';
import { getIotDb } from '@/lib/mongodb';
import { IOT_COLLECTIONS, REMOTE_IOT_API } from '@/lib/iot/iotDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * API route for IoT Employee RFID Mapping
 * Supports:
 * - GET: List all mapped employees, assigned devices, unmapped recent RFID cards, and summary stats
 * - POST: Upsert single employee mapping OR bulk import from JSON (matching employee-names.json format)
 * - DELETE: Delete employee mapping and remove device assignments
 */

export async function GET(req: NextRequest) {
  try {
    const db = await getIotDb();
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim().toLowerCase();

    // 1. Fetch all employees from iot_employees
    const employees = await db
      .collection(IOT_COLLECTIONS.EMPLOYEES)
      .find({})
      .sort({ updatedAt: -1, employeeName: 1, employeeId: 1 })
      .toArray();

    // 2. Fetch all devices to get real-time device assignments
    const devices = await db
      .collection(IOT_COLLECTIONS.DEVICES)
      .find({})
      .toArray();

    // Build map of employeeId -> assigned devices
    const deviceMap = new Map<string, Array<{ deviceId: string; machineId?: string; side?: string }>>();
    for (const d of devices) {
      const empId = d.assignedEmployeeId || d.employeeId;
      if (empId) {
        const idStr = String(empId);
        const list = deviceMap.get(idStr) || [];
        list.push({
          deviceId: String(d.deviceId),
          machineId: d.machineId ? String(d.machineId) : undefined,
          side: d.side ? String(d.side) : undefined
        });
        deviceMap.set(idStr, list);
      }
    }

    // 3. Find recent RFID cards seen in employee activities / card taps
    const recentActivities = await db
      .collection(IOT_COLLECTIONS.EMPLOYEE_ACTIVITIES)
      .find({ employeeId: { $exists: true, $nin: [null, ''] } })
      .sort({ activityAt: -1, tapTime: -1, timestamp: -1 })
      .limit(300)
      .toArray();

    const mappedIdSet = new Set(employees.map(e => String(e.employeeId).trim()));
    const unmappedCardSet = new Set<string>();
    const lastSeenMap = new Map<string, string | Date>();

    for (const act of recentActivities) {
      const id = String(act.employeeId || '').trim();
      if (!id) continue;
      const seenTime = act.activityAt || act.tapTime || act.timestamp || act.createdAt;
      if (seenTime && (!lastSeenMap.has(id) || new Date(seenTime) > new Date(lastSeenMap.get(id)!))) {
        lastSeenMap.set(id, seenTime);
      }
      if (!mappedIdSet.has(id)) {
        unmappedCardSet.add(id);
      }
    }

    // Enrich employees with assigned device list and last seen
    const enrichedEmployees = employees.map(e => {
      const idStr = String(e.employeeId);
      const assignedDevices = deviceMap.get(idStr) || [];
      const assignedDeviceIds = (e.assignedDeviceIds && e.assignedDeviceIds.length > 0)
        ? e.assignedDeviceIds
        : assignedDevices.map(d => d.deviceId);

      return {
        _id: e._id,
        employeeId: idStr,
        employeeName: e.employeeName || e.name || idStr,
        name: e.name || e.employeeName || idStr,
        department: e.department || 'Sider',
        tNo: e.tNo || (e.employeeName ? (e.employeeName.match(/\((\d+)\)/)?.[1] || null) : null),
        active: e.active !== false,
        assignedDeviceIds,
        assignedDevices,
        lastSeen: e.lastSeen || lastSeenMap.get(idStr) || null,
        lastLoginAt: e.lastLoginAt || null,
        loginStatus: e.loginStatus || 'LOGGED_OUT',
        updatedAt: e.updatedAt || e.createdAt || null
      };
    });

    // Filter if search query provided
    let filtered = enrichedEmployees;
    if (search) {
      filtered = enrichedEmployees.filter(e =>
        e.employeeId.toLowerCase().includes(search) ||
        (e.employeeName && e.employeeName.toLowerCase().includes(search)) ||
        (e.tNo && String(e.tNo).toLowerCase().includes(search)) ||
        (e.department && e.department.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({
      success: true,
      count: filtered.length,
      data: filtered,
      unmappedCards: Array.from(unmappedCardSet),
      stats: {
        total: enrichedEmployees.length,
        active: enrichedEmployees.filter(e => e.active).length,
        assignedToDevices: enrichedEmployees.filter(e => e.assignedDeviceIds.length > 0).length,
        unmappedCount: unmappedCardSet.size
      }
    }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (error: any) {
    console.error('[API /api/iot/employees GET error]:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to fetch employees' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = await getIotDb();
    const body = await req.json();

    // 1. Bulk Import Action (matches employee-names.json format: { "<employeeId>": "<employeeName>" })
    if (body.action === 'bulk_import' || body.entries || Array.isArray(body.employees)) {
      let entries: Array<[string, string]> = [];

      if (body.entries && typeof body.entries === 'object' && !Array.isArray(body.entries)) {
        entries = Object.entries(body.entries).map(([id, name]) => [String(id).trim(), String(name).trim()]);
      } else if (Array.isArray(body.employees)) {
        entries = body.employees.map((e: any) => [
          String(e.employeeId || e.id || '').trim(),
          String(e.employeeName || e.name || '').trim()
        ]);
      } else if (typeof body === 'object' && !body.employeeId) {
        // Direct JSON object payload: { "3157579526": "Sambari(24673)" }
        entries = Object.entries(body)
          .filter(([k]) => k !== 'action')
          .map(([id, name]) => [String(id).trim(), String(name).trim()]);
      }

      entries = entries.filter(([id, name]) => id && name);

      if (entries.length === 0) {
        return NextResponse.json({ success: false, message: 'No valid employee entries provided for import' }, { status: 400 });
      }

      let updatedCount = 0;
      const now = new Date();

      for (const [employeeId, employeeName] of entries) {
        // Extract ticket number if present like "Name(12345)"
        const tNoMatch = employeeName.match(/\((\d+)\)/);
        const tNo = tNoMatch ? tNoMatch[1] : undefined;

        // Upsert employee
        await db.collection(IOT_COLLECTIONS.EMPLOYEES).updateOne(
          { employeeId },
          {
            $set: {
              employeeId,
              name: employeeName,
              employeeName,
              ...(tNo ? { tNo } : {}),
              active: true,
              updatedAt: now
            },
            $setOnInsert: {
              createdAt: now,
              assignedDeviceIds: [],
              loginStatus: 'LOGGED_OUT'
            }
          },
          { upsert: true }
        );

        // Update assignedEmployeeName on all matching devices
        await db.collection(IOT_COLLECTIONS.DEVICES).updateMany(
          { assignedEmployeeId: employeeId },
          { $set: { assignedEmployeeName: employeeName } }
        );

        updatedCount++;
      }

      // Sync with remote IoT backend if available
      try {
        await fetch(`${REMOTE_IOT_API}/master/employees`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'bulk_import', entries: Object.fromEntries(entries) })
        }).catch(() => {});
      } catch (_) {}

      return NextResponse.json({
        success: true,
        message: `Successfully updated ${updatedCount} employee mappings`,
        updatedCount
      });
    }

    // 2. Single Employee Add / Update
    const { employeeId, employeeName, name, department, tNo, assignedDeviceIds, active } = body;
    const cleanId = String(employeeId || '').trim();
    const cleanName = String(employeeName || name || cleanId).trim();

    if (!cleanId) {
      return NextResponse.json({ success: false, message: 'Employee RFID Card ID is required' }, { status: 400 });
    }

    const now = new Date();
    const updateDoc: any = {
      employeeId: cleanId,
      employeeName: cleanName,
      name: cleanName,
      department: department || 'Sider',
      active: active !== false,
      updatedAt: now
    };

    if (tNo) {
      updateDoc.tNo = String(tNo).trim();
    } else {
      const match = cleanName.match(/\((\d+)\)/);
      if (match) updateDoc.tNo = match[1];
    }

    if (Array.isArray(assignedDeviceIds)) {
      updateDoc.assignedDeviceIds = assignedDeviceIds;
    }

    await db.collection(IOT_COLLECTIONS.EMPLOYEES).updateOne(
      { employeeId: cleanId },
      {
        $set: updateDoc,
        $setOnInsert: {
          createdAt: now,
          loginStatus: 'LOGGED_OUT',
          lastSeen: null
        }
      },
      { upsert: true }
    );

    // Synchronize device assignments in iot_devices
    if (Array.isArray(assignedDeviceIds)) {
      // 1. Clear previous assignments for this employee
      await db.collection(IOT_COLLECTIONS.DEVICES).updateMany(
        { assignedEmployeeId: cleanId, deviceId: { $nin: assignedDeviceIds } },
        { $set: { assignedEmployeeId: null, assignedEmployeeName: null } }
      );

      // 2. Set new assignments for this employee
      if (assignedDeviceIds.length > 0) {
        await db.collection(IOT_COLLECTIONS.DEVICES).updateMany(
          { deviceId: { $in: assignedDeviceIds } },
          { $set: { assignedEmployeeId: cleanId, assignedEmployeeName: cleanName } }
        );
      }
    } else {
      // Update assignedEmployeeName on already assigned devices
      await db.collection(IOT_COLLECTIONS.DEVICES).updateMany(
        { assignedEmployeeId: cleanId },
        { $set: { assignedEmployeeName: cleanName } }
      );
    }

    // Return the updated employee
    const saved = await db.collection(IOT_COLLECTIONS.EMPLOYEES).findOne({ employeeId: cleanId });

    return NextResponse.json({
      success: true,
      message: 'Employee RFID mapping saved successfully',
      data: saved
    });
  } catch (error: any) {
    console.error('[API /api/iot/employees POST error]:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to save employee' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const db = await getIotDb();
    const { searchParams } = new URL(req.url);
    const employeeId = (searchParams.get('employeeId') || searchParams.get('id') || '').trim();

    if (!employeeId) {
      return NextResponse.json({ success: false, message: 'Employee ID is required' }, { status: 400 });
    }

    // Delete from iot_employees
    await db.collection(IOT_COLLECTIONS.EMPLOYEES).deleteOne({ employeeId });

    // Unassign in iot_devices
    await db.collection(IOT_COLLECTIONS.DEVICES).updateMany(
      { assignedEmployeeId: employeeId },
      { $set: { assignedEmployeeId: null, assignedEmployeeName: null } }
    );

    return NextResponse.json({
      success: true,
      message: `Employee ${employeeId} removed and unassigned from devices`
    });
  } catch (error: any) {
    console.error('[API /api/iot/employees DELETE error]:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to delete employee' }, { status: 500 });
  }
}
