import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

import { SAMPLE_MACHINES } from '@/lib/sampleSeedData';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');

    const filter: any = {};
    if (shed && shed !== 'All') {
      filter.shed = shed;
    }

    const machines = await db.collection('machines').find(filter, { projection: { _id: 0 } }).toArray();
    if (!machines || machines.length === 0) {
      return NextResponse.json({ success: true, data: SAMPLE_MACHINES });
    }
    return NextResponse.json({ success: true, data: machines });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch machines' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();

    if (body.action === 'batch') {
      const machines: any[] = body.machines || [];
      const shed = body.shed;
      if (shed && shed !== 'All') {
        await db.collection('machines').deleteMany({ shed });
      } else {
        await db.collection('machines').deleteMany({});
      }

      if (machines.length > 0) {
        await db.collection('machines').insertMany(machines);
      }
      return NextResponse.json({ success: true, count: machines.length });
    }

    const machine = body.machine || body;
    const rfNo = machine.rfNo || machine.frameNo;
    if (!machine || !rfNo) {
      return NextResponse.json({ success: false, error: 'rfNo or frameNo is required' }, { status: 400 });
    }

    const normalizedMachine = {
      ...machine,
      frameNo: rfNo,
      rfNo
    };

    await db.collection('machines').updateOne(
      { frameNo: rfNo },
      { $set: normalizedMachine },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: normalizedMachine });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save machine' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const frameNo = searchParams.get('frameNo');
    const shed = searchParams.get('shed');
    const all = searchParams.get('all');

    if (all === 'true') {
      if (shed && shed !== 'All') {
        await db.collection('machines').deleteMany({ shed });
        return NextResponse.json({ success: true, message: `All machines for ${shed} deleted` });
      } else {
        await db.collection('machines').deleteMany({});
        return NextResponse.json({ success: true, message: 'All machines deleted' });
      }
    }

    if (frameNo) {
      await db.collection('machines').deleteOne({ frameNo });
      return NextResponse.json({ success: true, message: `Machine ${frameNo} deleted` });
    }

    if (id) {
      await db.collection('machines').deleteOne({ $or: [{ id }, { frameNo: id }, { rfNo: id }] });
      return NextResponse.json({ success: true, message: `Machine ${id} deleted` });
    }

    return NextResponse.json({ success: false, error: 'frameNo, id, or all=true is required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete machine' }, { status: 500 });
  }
}

