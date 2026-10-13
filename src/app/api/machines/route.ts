import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const machines = await db.collection('machines').find({}, { projection: { _id: 0 } }).toArray();
    return NextResponse.json({ success: true, data: machines });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch machines' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();
    const machine = body.machine || body;

    if (!machine || !machine.frameNo) {
      return NextResponse.json({ success: false, error: 'frameNo is required' }, { status: 400 });
    }

    await db.collection('machines').updateOne(
      { frameNo: machine.frameNo },
      { $set: machine },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: machine });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save machine' }, { status: 500 });
  }
}
