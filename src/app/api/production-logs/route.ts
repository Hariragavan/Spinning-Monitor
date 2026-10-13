import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date');
    const frameNo = searchParams.get('frameNo');

    const query: any = {};
    if (date) query.date = date;
    if (frameNo) query.frameNo = frameNo;

    const logs = await db.collection('dailyproductionlogs')
      .find(query, { projection: { _id: 0 } })
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({ success: true, count: logs.length, data: logs });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch production logs' }, { status: 500 });
  }
}
