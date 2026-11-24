import { NextRequest, NextResponse } from 'next/server';
import { getIotDb } from '@/lib/mongodb';
import { IOT_COLLECTIONS, REMOTE_IOT_API } from '@/lib/iot/iotDb';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * API route for IoT Employee RFID Mapping
 * Supports:
 * - GET: List only available RFID cards that are tapped on hardware devices (IOT_D1, IOT_D2...)
 *        Active when tap is <= 10 minutes ago, otherwise Inactive.
 *        Excludes un-tapped / phantom cards ("if not taped and not device is detected so not recorded").
 * - POST: Upsert employee mapping (no manual hardware device assignment required)
 * - DELETE: Delete employee mapping
 */

function extractRealDevice(act: any): string | null {
  const m = String(act.machineId || '').trim().toUpperCase();
  const d = String(act.deviceId || '').trim().toUpperCase();

  // "iot_m1,2.. is not the device, iot_d1,d2 is the device"
  // Look for IOT_D... or D1/D2
  if (m.startsWith('IOT_D') || /^D\d+$/i.test(m)) {
    return m.startsWith('IOT_') ? m : `IOT_${m}`;
  }
  if (d.startsWith('IOT_D') || /^D\d+$/i.test(d)) {
    return d.startsWith('IOT_') ? d : `IOT_${d}`;
  }

  // If machineId or deviceId is non-empty and does NOT start with IOT_M
  if (m && !m.startsWith('IOT_M')) return m;
  if (d && !d.startsWith('IOT_M')) return d;

  return null;
}

export async function GET(req: NextRequest) {
  try {
    const db = await getIotDb();
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim().toLowerCase();
    const now = Date.now();

    // 1. Fetch mapped employees from iot_employees
    const mappedEmployees = await db
      .collection(IOT_COLLECTIONS.EMPLOYEES)
      .find({})
      .sort({ updatedAt: -1, employeeName: 1 })
      .toArray();

    const mappedMap = new Map<string, any>();
    for (const e of mappedEmployees) {
      if (e.employeeId) mappedMap.set(String(e.employeeId).trim(), e);
    }

    // 2. Fetch recent employee activities / card taps
    const recentActivities = await db
      .collection(IOT_COLLECTIONS.EMPLOYEE_ACTIVITIES)
      .find({ employeeId: { $exists: true, $nin: [null, ''] } })
      .sort({ tapTime: -1, activityAt: -1, recordedAt: -1, timestamp: -1 })
      .limit(3000)
      .toArray();

    // Group activities by RFID card (employeeId)
    const tappedInfoByCard = new Map<string, {
      lastTapTime: string;
      lastDevice: string;
      detectedDevices: Set<string>;
      tapsCount: number;
      lastShift?: number;
      lastShiftDate?: string;
      detectedEmployeeName?: string;
    }>();

    // Group activities by real device (e.g. IOT_D1, IOT_D2)
    const deviceLastTapMap = new Map<string, {
      lastTapTime: string;
      employeeId: string;
      employeeName: string;
      shift?: number;
      shiftDate?: string;
    }>();

    // Default devices guaranteed to exist
    const knownDevices = new Set<string>(['IOT_D1', 'IOT_D2']);

    for (const act of recentActivities) {
      const cardId = String(act.employeeId || '').trim();
      if (!cardId) continue;

      const realDev = extractRealDevice(act);
      // "if not taped and not device is detected so not recorded"
      if (!realDev) continue;

      knownDevices.add(realDev);

      const rawTime = act.tapTime || act.activityAt || act.recordedAt || act.timestamp || act.createdAt;
      if (!rawTime) continue;

      const tapTimeStr = new Date(rawTime).toISOString();
      const tapTimeMs = new Date(rawTime).getTime();

      // Update card taps telemetry
      if (!tappedInfoByCard.has(cardId)) {
        tappedInfoByCard.set(cardId, {
          lastTapTime: tapTimeStr,
          lastDevice: realDev,
          detectedDevices: new Set([realDev]),
          tapsCount: 1,
          lastShift: act.shift,
          lastShiftDate: act.shiftDate,
          detectedEmployeeName: act.employeeName
        });
      } else {
        const info = tappedInfoByCard.get(cardId)!;
        info.tapsCount += 1;
        info.detectedDevices.add(realDev);
        if (tapTimeMs > new Date(info.lastTapTime).getTime()) {
          info.lastTapTime = tapTimeStr;
          info.lastDevice = realDev;
          info.lastShift = act.shift;
          info.lastShiftDate = act.shiftDate;
          if (act.employeeName) info.detectedEmployeeName = act.employeeName;
        }
      }

      // Update device last tap telemetry
      if (!deviceLastTapMap.has(realDev) || tapTimeMs > new Date(deviceLastTapMap.get(realDev)!.lastTapTime).getTime()) {
        deviceLastTapMap.set(realDev, {
          lastTapTime: tapTimeStr,
          employeeId: cardId,
          employeeName: act.employeeName || cardId,
          shift: act.shift,
          shiftDate: act.shiftDate
        });
      }
    }

    // Build device status summary: Active if tapped within 10 min, otherwise Inactive
    const devicesList = Array.from(knownDevices).map(devId => {
      const tapInfo = deviceLastTapMap.get(devId);
      if (tapInfo) {
        const diffMinutes = Math.floor((now - new Date(tapInfo.lastTapTime).getTime()) / 60000);
        const isActive = diffMinutes >= 0 && diffMinutes <= 10;
        return {
          deviceId: devId,
          status: isActive ? 'ACTIVE' : 'INACTIVE',
          lastTapTime: tapInfo.lastTapTime,
          diffMinutes,
          lastEmployeeId: tapInfo.employeeId,
          lastEmployeeName: tapInfo.employeeName,
          shift: tapInfo.shift,
          shiftDate: tapInfo.shiftDate
        };
      }
      return {
        deviceId: devId,
        status: 'INACTIVE',
        lastTapTime: null,
        diffMinutes: null,
        lastEmployeeId: null,
        lastEmployeeName: null,
        shift: null,
        shiftDate: null
      };
    }).sort((a, b) => a.deviceId.localeCompare(b.deviceId));

    // Build available taped RFID records (ONLY RFIDs that have been tapped in devices)
    const unmappedCards: string[] = [];
    const availableTapedRecords = Array.from(tappedInfoByCard.entries()).map(([cardId, tapInfo]) => {
      const mapped = mappedMap.get(cardId);
      const isRegistered = !!mapped;
      if (!isRegistered) {
        unmappedCards.push(cardId);
      }

      const diffMinutes = Math.floor((now - new Date(tapInfo.lastTapTime).getTime()) / 60000);
      // "show when the tap detected in the device, othervice show inactive when tap is started and not taped until 10 min show inactive"
      const isCurrentlyActive = diffMinutes >= 0 && diffMinutes <= 10;

      const employeeName = mapped?.employeeName || mapped?.name || tapInfo.detectedEmployeeName || `RFID ${cardId}`;
      const tNo = mapped?.tNo || (employeeName.match(/\((\d+)\)/)?.[1] || null);
      const department = mapped?.department || 'Sider';

      return {
        _id: mapped?._id,
        employeeId: cardId,
        employeeName,
        name: employeeName,
        department,
        tNo,
        active: mapped ? mapped.active !== false : true,
        isRegistered,
        // Automatically detected devices from API per completed shift
        assignedDeviceIds: Array.from(tapInfo.detectedDevices),
        detectedDevices: Array.from(tapInfo.detectedDevices),
        lastDevice: tapInfo.lastDevice,
        lastTapTime: tapInfo.lastTapTime,
        tapsCount: tapInfo.tapsCount,
        lastShift: tapInfo.lastShift,
        lastShiftDate: tapInfo.lastShiftDate,
        tapAgeMinutes: diffMinutes,
        tapStatus: isCurrentlyActive ? 'ACTIVE' : 'INACTIVE',
        loginStatus: isCurrentlyActive ? 'LOGGED_IN' : 'LOGGED_OUT',
        updatedAt: mapped?.updatedAt || tapInfo.lastTapTime
      };
    });

    // Sort by latest tap time descending (most recently active card first)
    availableTapedRecords.sort((a, b) => new Date(b.lastTapTime).getTime() - new Date(a.lastTapTime).getTime());

    // Filter if search query provided
    let filtered = availableTapedRecords;
    if (search) {
      filtered = availableTapedRecords.filter(e =>
        e.employeeId.toLowerCase().includes(search) ||
        e.employeeName.toLowerCase().includes(search) ||
        (e.tNo && String(e.tNo).toLowerCase().includes(search)) ||
        e.detectedDevices.some(d => d.toLowerCase().includes(search))
      );
    }

    return NextResponse.json({
      success: true,
      count: filtered.length,
      data: filtered,
      devices: devicesList,
      unmappedCards,
      stats: {
        totalTaped: availableTapedRecords.length,
        activeNow: availableTapedRecords.filter(e => e.tapStatus === 'ACTIVE').length,
        inactive: availableTapedRecords.filter(e => e.tapStatus === 'INACTIVE').length,
        registered: availableTapedRecords.filter(e => e.isRegistered).length,
        unmapped: unmappedCards.length,
        devicesCount: devicesList.length
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
