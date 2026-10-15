import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { DailyReport } from '@/types';
import { getHistoricalAprilData } from '@/lib/historicalData';
import { parseUniversalDate, parseUniversalDateParts, normalizeToCanonicalDate } from '@/lib/utils';
import { ensureSixMachines } from '@/lib/parser';
import { createSampleReportForShed1_10102026, SAMPLE_DATE } from '@/lib/sampleSeedData';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');

    const filter: any = {};
    if (shed) {
      filter.shed = shed;
    }

    const history = (await db.collection<DailyReport>('reports')
      .find(filter, { projection: { _id: 0 } })
      .toArray()) as unknown as DailyReport[];

    // Ensure 10/10/2026 sample report is present and fully populated
    const targetShed = shed || 'Shed 1';
    const sample1010 = createSampleReportForShed1_10102026(targetShed);
    const idx1010 = history.findIndex(r => (r.date === SAMPLE_DATE || normalizeToCanonicalDate(r.date) === SAMPLE_DATE) && (r.shed || 'Shed 1') === targetShed);
    if (idx1010 === -1) {
      history.push(sample1010);
    } else if (!history[idx1010].entries || history[idx1010].entries.length === 0) {
      history[idx1010] = sample1010;
    }

    // Sort history by calendar date descending so latest dates (e.g. today) are first
    history.sort((a, b) => {
      const timeA = parseUniversalDate(a.date).getTime();
      const timeB = parseUniversalDate(b.date).getTime();
      if (timeA !== timeB) return timeB - timeA;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    return NextResponse.json({
      success: true,
      data: history.map(r => ({
        ...ensureSixMachines(r, r.shed || 'Shed 1'),
        shed: r.shed || 'Shed 1'
      }))
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();

    if (body.action === 'seed_april') {
      const aprilReports = getHistoricalAprilData();
      for (const report of aprilReports) {
        const shed = report.shed || 'Shed 1';
        await db.collection('reports').updateOne(
          { date: report.date, shed },
          { $set: { ...report, shed, timestamp: report.timestamp || Date.now() } },
          { upsert: true }
        );
      }
      return NextResponse.json({ success: true, count: aprilReports.length, message: 'April historical data seeded' });
    }

    if (body.action === 'batch_save') {
      const reports: DailyReport[] = body.reports || [];
      for (const report of reports) {
        if (report && report.date) {
          const shed = report.shed || 'Shed 1';
          await db.collection('reports').updateOne(
            { date: report.date, shed },
            { $set: { ...report, shed, timestamp: report.timestamp || Date.now() } },
            { upsert: true }
          );
        }
      }
      return NextResponse.json({ success: true, count: reports.length });
    }

    if (body.action === 'clear_month') {
      const { month, year } = body; // month 1-12, year number
      const targetMonth = Number(month);
      const targetYear = Number(year);

      const all = await db.collection<DailyReport>('reports').find({}).toArray();
      const datesToDelete: string[] = [];

      for (const r of all) {
        const parts = parseUniversalDateParts(r.date);
        if (parts && parts.month === targetMonth && parts.year === targetYear) {
          datesToDelete.push(r.date);
        }
      }

      if (datesToDelete.length > 0) {
        await db.collection('reports').deleteMany({ date: { $in: datesToDelete } });
      }

      return NextResponse.json({ success: true, deletedCount: datesToDelete.length });
    }

    if (body.action === 'rollback') {
      const { cutoffDate, mode } = body; // mode: 'after' | 'upto' | 'august'
      const all = await db.collection<DailyReport>('reports').find({}).toArray();
      const targetTime = parseUniversalDate(cutoffDate).getTime();
      const datesToDelete: string[] = [];

      for (const r of all) {
        const rTime = parseUniversalDate(r.date).getTime();
        const parts = parseUniversalDateParts(r.date);

        if (mode === 'august') {
          if (parts && parts.month === 8 && parts.year === 2026) {
            datesToDelete.push(r.date);
          }
        } else if (mode === 'after') {
          // Keep records <= cutoffDate, delete records > cutoffDate
          if (rTime > targetTime) {
            datesToDelete.push(r.date);
          }
        } else if (mode === 'upto') {
          // Delete records <= cutoffDate
          if (rTime <= targetTime) {
            datesToDelete.push(r.date);
          }
        }
      }

      if (datesToDelete.length > 0) {
        await db.collection('reports').deleteMany({ date: { $in: datesToDelete } });
      }

      return NextResponse.json({ success: true, deletedCount: datesToDelete.length });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to process history action' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const all = searchParams.get('all');

    if (all === 'true') {
      await db.collection('reports').deleteMany({});
      return NextResponse.json({ success: true, message: 'All report history cleared' });
    }

    if (date) {
      await db.collection('reports').deleteOne({ date });
      return NextResponse.json({ success: true, message: `Report for ${date} deleted` });
    }

    return NextResponse.json({ success: false, error: 'date or all=true required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete report' }, { status: 500 });
  }
}
