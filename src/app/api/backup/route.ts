import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    
    const [workers, rules, counts, reports, settingsDoc, emDoc, frozen] = await Promise.all([
      db.collection('workers').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('incentive_rules').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('count_conversions').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('reports').find({}, { projection: { _id: 0 } }).toArray(),
      db.collection('settings').findOne({ _id: 'system_settings' as any }),
      db.collection('machine_em').findOne({ _id: 'machine_em_data' as any }),
      db.collection('frozen_months').find({}, { projection: { _id: 0 } }).toArray(),
    ]);

    const backup = {
      exportDate: new Date().toISOString(),
      workers,
      rules,
      counts,
      history: reports,
      dailyReport: reports.length > 0 ? reports[reports.length - 1] : null,
      settings: settingsDoc ? (({ _id, ...rest }) => rest)(settingsDoc) : {},
      machineEm: emDoc?.data || {},
      frozenMonths: frozen
    };

    return NextResponse.json({ success: true, data: backup });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to export backup' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();
    const data = body.data || body;

    if (Array.isArray(data.workers)) {
      await db.collection('workers').deleteMany({});
      if (data.workers.length > 0) await db.collection('workers').insertMany(data.workers);
    }

    if (Array.isArray(data.rules)) {
      await db.collection('incentive_rules').deleteMany({});
      if (data.rules.length > 0) await db.collection('incentive_rules').insertMany(data.rules);
    }

    if (Array.isArray(data.counts)) {
      await db.collection('count_conversions').deleteMany({});
      if (data.counts.length > 0) await db.collection('count_conversions').insertMany(data.counts);
    }

    if (Array.isArray(data.history)) {
      for (const r of data.history) {
        if (r && r.date) {
          await db.collection('reports').updateOne(
            { date: r.date },
            { $set: r },
            { upsert: true }
          );
        }
      }
    }

    if (data.settings) {
      await db.collection('settings').updateOne(
        { _id: 'system_settings' as any },
        { $set: data.settings },
        { upsert: true }
      );
    }

    if (data.machineEm) {
      await db.collection('machine_em').updateOne(
        { _id: 'machine_em_data' as any },
        { $set: { data: data.machineEm } },
        { upsert: true }
      );
    }

    if (Array.isArray(data.frozenMonths)) {
      for (const f of data.frozenMonths) {
        if (f && f.monthKey) {
          await db.collection('frozen_months').updateOne(
            { monthKey: f.monthKey },
            { $set: f },
            { upsert: true }
          );
        }
      }
    }

    return NextResponse.json({ success: true, message: 'Backup restored successfully' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to restore backup' }, { status: 500 });
  }
}
