import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { DailyReport } from '@/types';
import { ensureSixMachines, mockData, getTodayUniversalDate, createDefaultReportForShed } from '@/lib/parser';
import { parseUniversalDate } from '@/lib/utils';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const shed = searchParams.get('shed') || 'Shed 1';

    const shedFilter = shed === 'Shed 1'
      ? { $or: [{ shed: 'Shed 1' }, { shed: { $exists: false } }] }
      : { shed };

    if (date) {
      const report = await db.collection<DailyReport>('reports').findOne(
        { date, ...shedFilter },
        { projection: { _id: 0 } }
      );
      if (report) {
        return NextResponse.json({ success: true, data: ensureSixMachines(report, shed) });
      }
      return NextResponse.json({ success: false, message: 'Report not found' }, { status: 404 });
    }

    // Default: Check if today's report exists for this shed
    const todayStr = getTodayUniversalDate();
    const todayReport = await db.collection<DailyReport>('reports').findOne(
      { date: todayStr, ...shedFilter },
      { projection: { _id: 0 } }
    );
    if (todayReport) {
      return NextResponse.json({ success: true, data: ensureSixMachines(todayReport, shed) });
    }

    // Fresh day: return fresh blank report for today for this shed
    const freshReport = createDefaultReportForShed(shed, todayStr);
    return NextResponse.json({ success: true, data: freshReport });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch report' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();
    const report: DailyReport = body.report || body;

    if (!report || !report.date) {
      return NextResponse.json({ success: false, error: 'date is required in report' }, { status: 400 });
    }

    const shed = report.shed || 'Shed 1';
    const reportWithTs = {
      ...report,
      shed,
      timestamp: report.timestamp || Date.now()
    };

    await db.collection('reports').updateOne(
      { date: report.date, shed },
      { $set: reportWithTs },
      { upsert: true }
    );

    // Sync to separate collections: dailyproductionlogs, machineemlogs, shiftallocations
    if (report.entries && report.entries.length > 0) {
      const prodLogs = report.entries.map((entry, idx) => ({
        logId: `LOG_${report.date.replace(/[\/.-]/g, '')}_${entry.frameNo}_${entry.shift}_${idx}`,
        date: report.date,
        shed,
        frameNo: entry.frameNo,
        shift: entry.shift,
        count: entry.count,
        productionTarget: entry.productionTarget || 0,
        productionActual: entry.productionActual || 0,
        variance: (entry.productionActual || 0) - (entry.productionTarget || 0),
        gpsTarget: entry.gpsTarget || 0,
        gpsActual: entry.gpsActual || 0,
        gps40sCon: entry.gps40sCon || 0,
        efficiency: entry.efficiency || 0,
        utility: entry.utility || 0,
        doffEmt: entry.doffEmt || 0,
        naturalEmt: entry.naturalEmt || 0,
        assignedWorkerId: entry.siderIds?.[0] || entry.siderId || '',
        assignedWorkerName: entry.siderName || '',
        incentiveEarned: entry.incentiveAmount || 0,
        status: 'COMPLETED',
        createdAt: new Date()
      }));

      const emLogs = report.entries.map((entry, idx) => {
        const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;
        return {
          logId: `EM_${report.date.replace(/[\/.-]/g, '')}_${entry.frameNo}_${shiftNum}_${idx}`,
          date: report.date,
          shed,
          frameNo: entry.frameNo,
          shift: shiftNum,
          emValue: entry.doffEmt || entry.naturalEmt || 0,
          doffEmt: entry.doffEmt || 0,
          naturalEmt: entry.naturalEmt || 0,
          idlePercent: entry.idlePercent || 0,
          slipPercent: entry.slipPercent || 0,
          isHighEm: (entry.doffEmt || 0) > 4,
          assignedSider: entry.siderName || '',
          createdAt: new Date()
        };
      });

      const allocLogs = report.entries.map((entry, idx) => ({
        allocationId: `ALLOC_${report.date.replace(/[\/.-]/g, '')}_${entry.frameNo}_${entry.shift}_${idx}`,
        date: report.date,
        shed,
        shift: entry.shift,
        frameNo: entry.frameNo,
        count: entry.count,
        siderIds: entry.siderIds || (entry.siderId ? [entry.siderId] : []),
        siderName: entry.siderName || '',
        status: 'ALLOCATED',
        allocatedAt: new Date()
      }));

      await db.collection('dailyproductionlogs').deleteMany({ date: report.date, shed });
      await db.collection('dailyproductionlogs').insertMany(prodLogs);

      await db.collection('machineemlogs').deleteMany({ date: report.date, shed });
      await db.collection('machineemlogs').insertMany(emLogs);

      await db.collection('shiftallocations').deleteMany({ date: report.date, shed });
      await db.collection('shiftallocations').insertMany(allocLogs);
    }

    return NextResponse.json({ success: true, data: reportWithTs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save report' }, { status: 500 });
  }
}
