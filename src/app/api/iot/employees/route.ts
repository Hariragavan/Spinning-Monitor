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

    // 2. Fetch recent employee activities / card taps from local DB
    const recentActivities = await db
      .collection(IOT_COLLECTIONS.EMPLOYEE_ACTIVITIES)
      .find({ employeeId: { $exists: true, $nin: [null, ''] } })
      .sort({ tapTime: -1, activityAt: -1, recordedAt: -1, timestamp: -1 })
      .limit(3000)
      .toArray();

    // 2b. Also merge real-time live taps from REMOTE_IOT_API for today (so D1/D2 live taps appear immediately)
    const todayIso = new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const liveMergedActs: any[] = [...recentActivities];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${REMOTE_IOT_API}/dashboard/employee?date=${todayIso}&_t=${now}`, {
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const json = await res.json();
        const empList = Array.isArray(json?.data) ? json.data : [];
        for (const emp of empList) {
          const cardId = String(emp.employeeId || '').trim();
          if (!cardId) continue;
          const tapsArr = Array.isArray(emp.taps) ? emp.taps : [];
          if (tapsArr.length > 0) {
            for (const tap of tapsArr) {
              liveMergedActs.push({
                employeeId: cardId,
                employeeName: emp.employeeName || null,
                deviceId: tap.deviceId || tap.stationId || emp.machineId || '',
                machineId: tap.machineId || emp.machineId || '',
                tapTime: tap.time || tap.timestamp || emp.lastActiveTime,
                shift: emp.shift,
                shiftDate: emp.date || todayIso
              });
            }
          } else if (emp.lastActiveTime && extractRealDevice({ machineId: emp.machineId })) {
            liveMergedActs.push({
              employeeId: cardId,
              employeeName: emp.employeeName || null,
              machineId: emp.machineId,
              tapTime: emp.lastActiveTime,
              shift: emp.shift,
              shiftDate: emp.date || todayIso
            });
          }
        }
      }
    } catch (_) {}

    // Deduplicate taps and group activities by RFID card (employeeId)
    const seenTapKeys = new Set<string>();
    const tappedInfoByCard = new Map<string, {
      lastTapTime: string;
      lastDevice: string;
      deviceLastTapMs: Map<string, number>;
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

    for (const act of liveMergedActs) {
      const cardId = String(act.employeeId || '').trim();
      if (!cardId) continue;

      const realDev = extractRealDevice(act);
      // "if not taped and not device is detected so not recorded"
      if (!realDev) continue;

      knownDevices.add(realDev);

      const rawTime = act.tapTime || act.activityAt || act.recordedAt || act.timestamp || act.createdAt;
      if (!rawTime) continue;

      const parsedDate = new Date(rawTime);
      if (isNaN(parsedDate.getTime())) continue;
      const tapTimeStr = parsedDate.toISOString();
      const tapTimeMs = parsedDate.getTime();

      const dedupKey = `${cardId}|${realDev}|${tapTimeStr}`;
      if (seenTapKeys.has(dedupKey)) continue;
      seenTapKeys.add(dedupKey);

      // Update card taps telemetry
      if (!tappedInfoByCard.has(cardId)) {
        tappedInfoByCard.set(cardId, {
          lastTapTime: tapTimeStr,
          lastDevice: realDev,
          deviceLastTapMs: new Map([[realDev, tapTimeMs]]),
          tapsCount: 1,
          lastShift: act.shift,
          lastShiftDate: act.shiftDate,
          detectedEmployeeName: act.employeeName
        });
      } else {
        const info = tappedInfoByCard.get(cardId)!;
        info.tapsCount += 1;
        const prevDevMs = info.deviceLastTapMs.get(realDev) ?? -Infinity;
        if (tapTimeMs > prevDevMs) {
          info.deviceLastTapMs.set(realDev, tapTimeMs);
        }
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
        const mappedEmp = mappedMap.get(cardId);
        deviceLastTapMap.set(realDev, {
          lastTapTime: tapTimeStr,
          employeeId: cardId,
          employeeName: mappedEmp?.employeeName || mappedEmp?.name || act.employeeName || cardId,
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
        // Allow for minor device clock skew (up to 15 min ahead) and <= 10 min idle
        const isActive = diffMinutes >= -15 && diffMinutes <= 10;
        const mappedEmp = mappedMap.get(tapInfo.employeeId);
        return {
          deviceId: devId,
          status: isActive ? 'ACTIVE' : 'INACTIVE',
          lastTapTime: tapInfo.lastTapTime,
          diffMinutes,
          lastEmployeeId: tapInfo.employeeId,
          lastEmployeeName: mappedEmp?.employeeName || mappedEmp?.name || tapInfo.employeeName,
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

      // Live detected devices ONLY: devices tapped by this RFID within the 10-minute active window (e.g. IOT_D1, IOT_D2)
      const liveDetectedDevices: string[] = [];
      for (const [devId, devMs] of tapInfo.deviceLastTapMs.entries()) {
        const devDiffMins = Math.floor((now - devMs) / 60000);
        if (devDiffMins >= -15 && devDiffMins <= 10) {
          liveDetectedDevices.push(devId);
        }
      }
      liveDetectedDevices.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      const diffMinutes = Math.floor((now - new Date(tapInfo.lastTapTime).getTime()) / 60000);
      // Allow for minor hardware clock skew (up to 15 min ahead) and <= 10 min idle
      const isCurrentlyActive = liveDetectedDevices.length > 0 || (diffMinutes >= -15 && diffMinutes <= 10);

      const employeeName = mapped?.employeeName || mapped?.name || tapInfo.detectedEmployeeName || `RFID ${cardId}`;
      const tNo = mapped?.tNo || (employeeName.match(/\((\d+)\)/)?.[1] || null);
      const department = mapped?.department || 'Sider';

      return {
        _id: mapped?._id,
        employeeId: cardId,
        workerId: mapped?.workerId || null,
        employeeName,
        name: employeeName,
        department,
        tNo,
        active: mapped ? mapped.active !== false : true,
        isRegistered,
        // Live detected devices ONLY (if both D1 and D2 tapped live by this RFID, both appear here)
        assignedDeviceIds: liveDetectedDevices,
        detectedDevices: liveDetectedDevices,
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

    const registeredMappings = mappedEmployees.map(e => ({
      employeeId: String(e.employeeId || '').trim(),
      employeeName: String(e.employeeName || e.name || '').trim(),
      workerId: e.workerId ? String(e.workerId).trim() : null,
      tNo: e.tNo ? String(e.tNo).trim() : (String(e.employeeName || '').match(/\((\d+)\)/)?.[1] || null)
    })).filter(e => e.employeeId);

    return NextResponse.json({
      success: true,
      count: filtered.length,
      data: filtered,
      devices: devicesList,
      unmappedCards,
      registeredMappings,
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

    // 2. Single Employee Add / Update (Strict 1-to-1 RFID <-> Operator Mapping)
    const { employeeId, employeeName, name, department, tNo, workerId, assignedDeviceIds, mode } = body;
    const cleanId = String(employeeId || '').trim();
    const cleanName = String(employeeName || name || '').trim();
    const cleanWorkerId = workerId ? String(workerId).trim() : '';

    if (!cleanId) {
      return NextResponse.json({ success: false, message: 'RFID Card No. is required' }, { status: 400 });
    }
    if (!cleanName) {
      return NextResponse.json({ success: false, message: 'Operator selection from Worker Master is required' }, { status: 400 });
    }

    const extractedTNo = tNo ? String(tNo).trim() : (cleanName.match(/\((\d+)\)/)?.[1] || '');
    const normalizedBaseName = cleanName.replace(/\([^)]*\)/g, '').trim().toLowerCase();

    // Enforce 1-to-1 rule:
    // (a) In create mode, reject if this RFID is already registered
    const existingByCard = await db.collection(IOT_COLLECTIONS.EMPLOYEES).findOne({ employeeId: cleanId });
    if (mode === 'create' && existingByCard) {
      return NextResponse.json({
        success: false,
        message: `RFID "${cleanId}" is already mapped to ${existingByCard.employeeName || existingByCard.name}. Edit the existing mapping instead.`
      }, { status: 409 });
    }

    // (b) Ensure this operator is NOT already mapped to any other RFID card
    const otherMappings = await db
      .collection(IOT_COLLECTIONS.EMPLOYEES)
      .find({ employeeId: { $ne: cleanId } })
      .toArray();

    for (const other of otherMappings) {
      const oWorkerId = other.workerId ? String(other.workerId).trim() : '';
      const oName = String(other.employeeName || other.name || '').trim();
      const oTNo = other.tNo ? String(other.tNo).trim() : (oName.match(/\((\d+)\)/)?.[1] || '');
      const oBaseName = oName.replace(/\([^)]*\)/g, '').trim().toLowerCase();

      const sameWorker =
        (cleanWorkerId && oWorkerId && cleanWorkerId === oWorkerId) ||
        (extractedTNo && oTNo && extractedTNo === oTNo) ||
        (!extractedTNo && !oTNo && normalizedBaseName && oBaseName && normalizedBaseName === oBaseName);

      if (sameWorker) {
        return NextResponse.json({
          success: false,
          message: `Operator "${cleanName}" is already mapped to RFID "${other.employeeId}". Only one operator can be mapped to one RFID.`
        }, { status: 409 });
      }
    }

    const now = new Date();
    const updateDoc: any = {
      employeeId: cleanId,
      employeeName: cleanName,
      name: cleanName,
      department: department || 'Sider',
      active: true,
      updatedAt: now
    };

    if (cleanWorkerId) {
      updateDoc.workerId = cleanWorkerId;
    }
    if (extractedTNo) {
      updateDoc.tNo = extractedTNo;
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

    // Synchronize device assignments & propagate mapped operator name across all IoT collections
    if (Array.isArray(assignedDeviceIds)) {
      await db.collection(IOT_COLLECTIONS.DEVICES).updateMany(
        { assignedEmployeeId: cleanId, deviceId: { $nin: assignedDeviceIds } },
        { $set: { assignedEmployeeId: null, assignedEmployeeName: null } }
      );
      if (assignedDeviceIds.length > 0) {
        await db.collection(IOT_COLLECTIONS.DEVICES).updateMany(
          { deviceId: { $in: assignedDeviceIds } },
          { $set: { assignedEmployeeId: cleanId, assignedEmployeeName: cleanName } }
        );
      }
    } else {
      await db.collection(IOT_COLLECTIONS.DEVICES).updateMany(
        { assignedEmployeeId: cleanId },
        { $set: { assignedEmployeeName: cleanName } }
      );
    }

    await Promise.all([
      db.collection(IOT_COLLECTIONS.EMPLOYEE_ACTIVITIES).updateMany(
        { employeeId: cleanId },
        { $set: { employeeName: cleanName } }
      ),
      db.collection(IOT_COLLECTIONS.PERFORMANCES).updateMany(
        { employeeId: cleanId },
        { $set: { employeeName: cleanName } }
      ),
      db.collection(IOT_COLLECTIONS.PRODUCTION_ENTRIES).updateMany(
        { employeeId: cleanId },
        { $set: { employeeName: cleanName } }
      )
    ]).catch(() => {});

    // Best-effort sync to remote IoT backend so remote reports also reflect the mapped name
    try {
      await fetch(`${REMOTE_IOT_API}/master/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_import', entries: { [cleanId]: cleanName } })
      }).catch(() => {});
    } catch (_) {}

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
