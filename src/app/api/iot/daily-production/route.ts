import { NextRequest, NextResponse } from 'next/server';
import { getIotDb } from '@/lib/mongodb';
import { IOT_COLLECTIONS } from '@/lib/iot/iotDb';
import { normalizeShed } from '@/lib/utils';
import {
  IotDailyProductionResponse,
  IotMonthDateShiftRow,
  IotDailyProductionMachineRow
} from '@/types/iot';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

function inferShed(spinningFrame: string, iotMachine: string, registryMap?: Map<string, string>): string {
  const normSp = spinningFrame.toUpperCase().trim();
  const normIot = iotMachine.toUpperCase().trim();

  if (registryMap) {
    if (registryMap.has(normSp)) return registryMap.get(normSp)!;
    if (registryMap.has(normIot)) return registryMap.get(normIot)!;
  }

  // Extract number from frame or IoT
  const match = normSp.match(/\d+/) || normIot.match(/\d+/);
  if (match) {
    const num = parseInt(match[0], 10);
    if (num >= 1 && num <= 18) return 'Shed 1';
    if (num >= 19 && num <= 36) return 'Shed 2';
    if (num >= 37 && num <= 55) return 'Shed 3';
  }
  return 'Shed 1';
}

function getShiftTiming(shiftNum: number): { from: string; to: string } {
  if (shiftNum === 1) return { from: '06:00', to: '14:00' };
  if (shiftNum === 2) return { from: '14:00', to: '22:00' };
  if (shiftNum === 3) return { from: '22:00', to: '06:00' };
  return { from: '07:00', to: '15:00' };
}

async function syncLatestShiftsFromRemote(db: any) {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 86400000);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);
    const datesToSync = [yesterday, today];
    const shiftsToSync = [1, 2, 3];

    const ep = 'https://iot-machine-backend.onrender.com/api/common';
    const shiftwiseCol = db.collection(IOT_COLLECTIONS.SHIFTWISE);

    for (const sDate of datesToSync) {
      for (const sNum of shiftsToSync) {
        try {
          const url = `${ep}?shiftDate=${sDate}&shift=${sNum}&limit=1&sort=_id&order=desc`;
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal, cache: 'no-store' });
          clearTimeout(timeout);
          if (!res.ok) continue;
          const json = await res.json();
          const p = json.data?.[0];
          if (!p || !Array.isArray(p.machines) || p.machines.length === 0) continue;

          const sHours = Number(p.totalShiftHours || 8);
          const month = sDate.slice(0, 7);
          const { _id, createdAt: _ignoreCreated, ...cleanDoc } = p;
          const msgId = cleanDoc.msgId || `${sDate.replace(/-/g, '')}-S${sNum}-END`;

          // Check if existing record in DB is older or missing
          const existing = await shiftwiseCol.findOne({ shiftDate: sDate, shift: sNum });
          if (!existing || !existing.dataTime || (p.dataTime && p.dataTime >= existing.dataTime)) {
            await shiftwiseCol.updateOne(
              { shiftDate: sDate, shift: sNum },
              {
                $set: {
                  ...cleanDoc,
                  msgId,
                  recordType: 'SHIFT_END',
                  shiftDate: sDate,
                  month,
                  shift: sNum,
                  totalShiftHours: sHours,
                  machineCount: cleanDoc.machines.length,
                  machines: cleanDoc.machines,
                  updatedAt: new Date()
                },
                $setOnInsert: { createdAt: new Date() }
              },
              { upsert: true }
            );
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.warn('[syncLatestShiftsFromRemote] warning:', e);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const requestedMonth = searchParams.get('month')?.trim();
    const requestedDate = searchParams.get('date')?.trim();
    const shiftParam = searchParams.get('shift')?.trim() || 'all'; // 'all', '1', '2', '3'

    const db = await getIotDb();

    // Auto-sync latest live shift packets into iot_shiftwise_data
    await syncLatestShiftsFromRemote(db);

    // 1. Fetch distinct dates available in iot_shiftwise_data
    const rawDates = await db
      .collection(IOT_COLLECTIONS.SHIFTWISE)
      .distinct('shiftDate');

    const availableDates = Array.from(
      new Set(
        rawDates
          .filter(Boolean)
          .map(d => String(d).trim())
          .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      )
    ).sort().reverse();

    // Extract available distinct months (YYYY-MM)
    const availableMonths = Array.from(
      new Set(availableDates.map(d => d.slice(0, 7)))
    ).sort().reverse();

    // Determine target month
    const targetMonth = requestedMonth
      || (requestedDate ? requestedDate.slice(0, 7) : null)
      || availableMonths[0]
      || new Date().toISOString().slice(0, 7);

    // 2. Fetch machine mappings & registry
    const settings = await db.collection('settings').findOne({});
    const machineMapping = settings?.machineToMachineMapping || {};
    const iotToSpinning: Record<string, string> = {};
    for (const [spinning, iot] of Object.entries(machineMapping)) {
      if (typeof iot === 'string' && iot.trim()) {
        iotToSpinning[iot.toUpperCase().trim()] = spinning.toUpperCase().trim();
      }
    }

    const registryMap = new Map<string, string>();
    try {
      const regMachines = await db.collection('machines').find({}).toArray();
      for (const rm of regMachines) {
        const id = String(rm.rfNo || rm.frameNo || rm.machineId || '').toUpperCase().trim();
        const shed = normalizeShed(rm.shed);
        if (id) registryMap.set(id, shed);
      }
    } catch (_) {}

    // 3. Query all shift documents for targetMonth
    const monthDocs = await db
      .collection(IOT_COLLECTIONS.SHIFTWISE)
      .find({ shiftDate: new RegExp('^' + targetMonth) })
      .sort({ shiftDate: -1, shift: 1 })
      .toArray();

    // 4. Transform each shift doc into a Month Date Row
    const allMonthRows: IotMonthDateShiftRow[] = [];

    for (const doc of monthDocs) {
      const sNum = Number(doc.shift || 1);

      // Shift filter
      if (shiftParam !== 'all' && sNum !== Number(shiftParam)) {
        continue;
      }

      const sHours = Number(doc.totalShiftHours || 8);
      const timing = getShiftTiming(sNum);
      const rawMachines = Array.isArray(doc.machines) ? doc.machines : [];

      let sProd = 0;
      let sTarget = 0;
      let sTotalEm = 0;
      let sWasteSum = 0;
      let sWasteCount = 0;
      const sActiveList: string[] = [];

      for (const m of rawMachines) {
        const iotId = String(m.machine || m.machineId || '').toUpperCase().trim();
        const spinId = iotToSpinning[iotId] || iotId;
        const actualKg = Number((Number(m.shiftProduction) || 0).toFixed(2));
        const targetKg = Number((Number(m.shiftTargetProduction) || 0).toFixed(2));
        const wastePct = Number((Number(m.shiftWaste) || 0).toFixed(2));

        const sideL = m.sides?.find((s: any) => s.side === 'L');
        const sideR = m.sides?.find((s: any) => s.side === 'R');
        const emLeftMin = Number(Number(sideL?.endMendingTime || 0).toFixed(2));
        const emRightMin = Number(Number(sideR?.endMendingTime || 0).toFixed(2));
        const emTotalMin = Number((emLeftMin + emRightMin).toFixed(2));

        sProd += actualKg;
        sTarget += targetKg;
        sTotalEm += emTotalMin;
        if (wastePct > 0) {
          sWasteSum += wastePct;
          sWasteCount++;
        }

        if (String(m.runStatus || '').toUpperCase() === 'RUN') {
          sActiveList.push(spinId);
        }
      }

      const overallEm = doc.stdEndMendingTime !== undefined && Number(doc.stdEndMendingTime) > 0
        ? Number(Number(doc.stdEndMendingTime).toFixed(2))
        : sActiveList.length > 0
          ? Number((sTotalEm / sActiveList.length).toFixed(2))
          : rawMachines.length > 0
            ? Number((sTotalEm / rawMachines.length).toFixed(2))
            : 0;

      const avgWaste = sWasteCount > 0 ? Number((sWasteSum / sWasteCount).toFixed(2)) : 0;
      const varianceKg = Number((sProd - sTarget).toFixed(2));
      const achievementPct = sTarget > 0 ? Number(((sProd / sTarget) * 100).toFixed(1)) : 0;

      allMonthRows.push({
        date: doc.shiftDate,
        shift: sNum,
        shiftName: `Shift ${sNum}`,
        shiftHours: sHours,
        timing: {
          from: timing.from,
          to: timing.to,
          dataTime: doc.dataTime || undefined
        },
        productionKg: Number(sProd.toFixed(2)),
        targetKg: Number(sTarget.toFixed(2)),
        achievementPct,
        varianceKg,
        overallEm,
        totalEm: Number(sTotalEm.toFixed(2)),
        activeMachineCount: sActiveList.length,
        totalMachineCount: rawMachines.length,
        wastePercentage: avgWaste,
        activeMachinesSummary: sActiveList.slice(0, 15).join(', ') + (sActiveList.length > 15 ? '...' : '')
      });
    }

    // 5. Month Grand Total
    const monthProdTotal = allMonthRows.reduce((a, b) => a + b.productionKg, 0);
    const monthTargetTotal = allMonthRows.reduce((a, b) => a + b.targetKg, 0);
    const monthTotalEm = allMonthRows.reduce((a, b) => a + b.totalEm, 0);
    const monthAvgOverallEm = allMonthRows.length > 0
      ? Number((allMonthRows.reduce((a, b) => a + b.overallEm, 0) / allMonthRows.length).toFixed(2))
      : 0;
    const monthAvgWaste = allMonthRows.length > 0
      ? Number((allMonthRows.reduce((a, b) => a + b.wastePercentage, 0) / allMonthRows.length).toFixed(2))
      : 0;
    const monthAchievementPct = monthTargetTotal > 0
      ? Number(((monthProdTotal / monthTargetTotal) * 100).toFixed(1))
      : 0;

    const monthGrandTotal = {
      productionKg: Number(monthProdTotal.toFixed(2)),
      targetKg: Number(monthTargetTotal.toFixed(2)),
      achievementPct: monthAchievementPct,
      varianceKg: Number((monthProdTotal - monthTargetTotal).toFixed(2)),
      overallEm: monthAvgOverallEm,
      totalEm: Number(monthTotalEm.toFixed(2)),
      wastePercentage: monthAvgWaste,
      totalShifts: allMonthRows.length
    };

    // 6. Day Machine Data for Bottom Table
    const datesInMonth = Array.from(new Set(allMonthRows.map(r => r.date)));
    const targetDate = (requestedDate && requestedDate.startsWith(targetMonth))
      ? requestedDate
      : (datesInMonth[0] || requestedDate || availableDates[0] || new Date().toISOString().slice(0, 10));

    // Get matching docs for targetDate
    const targetDayDocs = monthDocs.filter(d => d.shiftDate === targetDate && (shiftParam === 'all' || Number(d.shift) === Number(shiftParam)));

    const dayMachineRows: IotDailyProductionMachineRow[] = [];
    const frameMap = new Map<string, IotDailyProductionMachineRow>();

    for (const doc of targetDayDocs) {
      const rawMachines = Array.isArray(doc.machines) ? doc.machines : [];
      let sNo = 1;

      for (const m of rawMachines) {
        const iotId = String(m.machine || m.machineId || '').toUpperCase().trim();
        const spinId = iotToSpinning[iotId] || iotId;
        const shed = inferShed(spinId, iotId, registryMap);

        const count = String(m.count || '-');
        const runStatus = String(m.runStatus || 'STOP').toUpperCase();
        const speed = Number(m.spindleSpeedCurrent || 0);
        const actualKg = Number((Number(m.shiftProduction) || 0).toFixed(2));
        const targetKg = Number((Number(m.shiftTargetProduction) || 0).toFixed(2));
        const varianceKg = Number((actualKg - targetKg).toFixed(2));
        const achievementPct = targetKg > 0 ? Number(((actualKg / targetKg) * 100).toFixed(1)) : 0;
        const wastePct = Number((Number(m.shiftWaste) || 0).toFixed(2));

        const sideL = m.sides?.find((s: any) => s.side === 'L');
        const sideR = m.sides?.find((s: any) => s.side === 'R');
        const emLeftMin = Number(Number(sideL?.endMendingTime || 0).toFixed(2));
        const emRightMin = Number(Number(sideR?.endMendingTime || 0).toFixed(2));
        const emTotalMin = Number((emLeftMin + emRightMin).toFixed(2));

        const endBreakCount = Number(
          m.totalEndBreakCount ??
          ((Number(sideL?.endBreakCount) || 0) + (Number(sideR?.endBreakCount) || 0))
        );

        if (targetDayDocs.length > 1) {
          if (!frameMap.has(spinId)) {
            frameMap.set(spinId, {
              sNo: sNo++,
              spinningFrame: spinId,
              iotMachine: iotId,
              shed,
              count,
              runStatus,
              spindleSpeed: speed,
              targetKg,
              actualKg,
              varianceKg,
              achievementPct,
              wastePct,
              emTotalMin,
              emLeftMin,
              emRightMin,
              endBreakCount,
              hourWiseProduction: Array.isArray(m.hourWiseProduction) ? [...m.hourWiseProduction] : []
            });
          } else {
            const ex = frameMap.get(spinId)!;
            ex.actualKg = Number((ex.actualKg + actualKg).toFixed(2));
            ex.targetKg = Number((ex.targetKg + targetKg).toFixed(2));
            ex.varianceKg = Number((ex.actualKg - ex.targetKg).toFixed(2));
            ex.achievementPct = ex.targetKg > 0 ? Number(((ex.actualKg / ex.targetKg) * 100).toFixed(1)) : 0;
            ex.emTotalMin = Number((ex.emTotalMin + emTotalMin).toFixed(2));
            ex.emLeftMin = Number((ex.emLeftMin + emLeftMin).toFixed(2));
            ex.emRightMin = Number((ex.emRightMin + emRightMin).toFixed(2));
            ex.endBreakCount += endBreakCount;
            ex.spindleSpeed = Math.round((ex.spindleSpeed + speed) / 2);
            if (runStatus === 'RUN') ex.runStatus = 'RUN';
            ex.wastePct = Number(((ex.wastePct + wastePct) / 2).toFixed(2));
            if (Array.isArray(m.hourWiseProduction)) {
              ex.hourWiseProduction.push(...m.hourWiseProduction);
            }
          }
        } else {
          dayMachineRows.push({
            sNo: sNo++,
            spinningFrame: spinId,
            iotMachine: iotId,
            shed,
            count,
            runStatus,
            spindleSpeed: speed,
            targetKg,
            actualKg,
            varianceKg,
            achievementPct,
            wastePct,
            emTotalMin,
            emLeftMin,
            emRightMin,
            endBreakCount,
            hourWiseProduction: Array.isArray(m.hourWiseProduction) ? m.hourWiseProduction : []
          });
        }
      }
    }

    const finalDayRows = targetDayDocs.length > 1 ? Array.from(frameMap.values()) : dayMachineRows;
    finalDayRows.sort((a, b) => a.spinningFrame.localeCompare(b.spinningFrame, undefined, { numeric: true }));
    finalDayRows.forEach((r, idx) => { r.sNo = idx + 1; });

    // Day summary
    const dayProdTotal = finalDayRows.reduce((a, b) => a + b.actualKg, 0);
    const dayTargetTotal = finalDayRows.reduce((a, b) => a + b.targetKg, 0);
    const dayEmTotal = finalDayRows.reduce((a, b) => a + b.emTotalMin, 0);
    const activeMachinesCount = finalDayRows.filter(r => r.runStatus === 'RUN').length;
    const activeMachinesList = finalDayRows
      .filter(r => r.runStatus === 'RUN')
      .map(r => ({
        spinningFrame: r.spinningFrame,
        iotMachine: r.iotMachine,
        count: r.count,
        speed: r.spindleSpeed,
        prodKg: r.actualKg
      }));

    const daySummary = {
      productionKg: Number(dayProdTotal.toFixed(2)),
      targetKg: Number(dayTargetTotal.toFixed(2)),
      achievementPct: dayTargetTotal > 0 ? Number(((dayProdTotal / dayTargetTotal) * 100).toFixed(1)) : 0,
      varianceKg: Number((dayProdTotal - dayTargetTotal).toFixed(2)),
      overallEm: activeMachinesCount > 0 ? Number((dayEmTotal / activeMachinesCount).toFixed(2)) : 0,
      totalEm: Number(dayEmTotal.toFixed(2)),
      activeMachineCount: activeMachinesCount,
      totalMachineCount: finalDayRows.length,
      wastePercentage: finalDayRows.length > 0
        ? Number((finalDayRows.reduce((a, b) => a + b.wastePct, 0) / finalDayRows.length).toFixed(2))
        : 0,
      shiftHours: targetDayDocs.length * 8 || 8,
      timing: targetDayDocs.length === 1
        ? getShiftTiming(targetDayDocs[0].shift)
        : { from: '06:00', to: '22:00' },
      activeMachines: activeMachinesList
    };

    const responseData: IotDailyProductionResponse = {
      success: true,
      month: targetMonth,
      availableMonths,
      date: targetDate,
      availableDates,
      selectedShift: shiftParam === 'all' ? 'all' : Number(shiftParam),
      monthGrandTotal,
      monthRows: allMonthRows,
      dayMachines: finalDayRows,
      daySummary,
      overallSummary: daySummary,
      tableRows: finalDayRows
    };

    return NextResponse.json(responseData, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (error: any) {
    console.error('Error fetching daily production:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to load daily production' },
      { status: 500 }
    );
  }
}
