import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');

    const filter: any = {};
    if (shed && shed !== 'All') {
      filter.shed = shed;
    }

    // Clean up legacy non-registered / invalid machine records like "M"
    await db.collection('machines').deleteMany({
      $or: [
        { frameNo: /^m$/i },
        { rfNo: /^m$/i },
        { frameNo: 'M' },
        { rfNo: 'M' },
        { frameNo: '' },
        { rfNo: '' },
        { frameNo: null }
      ]
    }).catch(() => {});

    const machines = await db.collection('machines').find(filter, { projection: { _id: 0 } }).toArray();
    const normalized = machines
      .filter((m: any) => {
        const rf = String(m.rfNo || m.frameNo || '').trim().toUpperCase();
        return rf !== '' && rf !== 'M' && rf !== 'MC' && Boolean(rf.match(/\d+/));
      })
      .map((m: any) => {
        const rf = m.rfNo || m.frameNo || '';
        return {
          ...m,
          id: m.id || `m-${rf}`,
          rfNo: rf,
          frameNo: m.frameNo || rf,
          shed: m.shed || 'Shed 1',
          count: m.count || '030/1-PH-PC',
          spindles: m.spindles ?? 1200,
          status: m.status || 'Active',
          description: m.description || `RING FRAME ${rf}`
        };
      });
    return NextResponse.json({ success: true, data: normalized });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch machines' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();

    const isValidMachine = (m: any) => {
      const rf = String(m?.rfNo || m?.frameNo || '').trim().toUpperCase();
      return rf !== '' && rf !== 'M' && rf !== 'MC' && Boolean(rf.match(/\d+/));
    };

    if (body.action === 'batch') {
      const machines: any[] = (body.machines || []).filter(isValidMachine);
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
    const rfNo = machine?.rfNo || machine?.frameNo;
    if (!machine || !rfNo || !isValidMachine(machine)) {
      return NextResponse.json({ success: false, error: 'A valid machine number with digits is required' }, { status: 400 });
    }

    const mShed = machine.shed || 'Shed 1';
    const normalizedMachine = {
      ...machine,
      shed: mShed,
      frameNo: rfNo,
      rfNo
    };

    await db.collection('machines').updateOne(
      { frameNo: rfNo, shed: mShed },
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

