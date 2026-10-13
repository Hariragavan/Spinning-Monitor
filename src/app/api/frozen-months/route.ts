import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { FrozenMonthRecord } from '@/types';

export async function GET() {
  try {
    const db = await getDb();
    const records = await db.collection<FrozenMonthRecord>('frozen_months').find({}, { projection: { _id: 0 } }).toArray();
    
    const recordMap: Record<string, FrozenMonthRecord> = {};
    records.forEach(r => {
      if (r && r.monthKey) {
        recordMap[r.monthKey] = r;
      }
    });

    return NextResponse.json({ success: true, data: recordMap });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch frozen months' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();
    const { action, monthKey, record } = body;

    if (action === 'delete') {
      if (!monthKey) {
        return NextResponse.json({ success: false, error: 'monthKey required for unfreezing' }, { status: 400 });
      }
      await db.collection('frozen_months').deleteOne({ monthKey });
      return NextResponse.json({ success: true, message: `Unfrozen ${monthKey}` });
    }

    if (record && record.monthKey) {
      await db.collection('frozen_months').updateOne(
        { monthKey: record.monthKey },
        { $set: record },
        { upsert: true }
      );
      return NextResponse.json({ success: true, data: record });
    }

    return NextResponse.json({ success: false, error: 'Invalid payload' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save frozen month' }, { status: 500 });
  }
}
