import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { Sider } from '@/types';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');

    const filter: any = {};
    if (shed && shed !== 'All') {
      filter.shed = shed;
    }

    const workers = await db.collection<Sider>('workers').find(filter, { projection: { _id: 0 } }).toArray();
    return NextResponse.json({ success: true, data: workers });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch workers' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();

    if (body.action === 'batch') {
      const workers: Sider[] = body.workers || [];
      const shed = body.shed;

      if (shed && shed !== 'All') {
        // Only replace workers belonging to this shed
        await db.collection('workers').deleteMany({ shed });
        if (workers.length > 0) {
          await db.collection('workers').insertMany(workers.map(w => ({ ...w, shed })));
        }
      } else {
        await db.collection('workers').deleteMany({});
        if (workers.length > 0) {
          await db.collection('workers').insertMany(workers);
        }
      }
      return NextResponse.json({ success: true, count: workers.length });
    }

    if (body.action === 'save_single') {
      const worker: Sider = body.worker;
      if (!worker || !worker.id) {
        return NextResponse.json({ success: false, error: 'Worker id is required' }, { status: 400 });
      }
      await db.collection('workers').updateOne(
        { id: worker.id },
        { $set: worker },
        { upsert: true }
      );
      return NextResponse.json({ success: true, worker });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update workers' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const shed = searchParams.get('shed');
    const all = searchParams.get('all');

    if (all === 'true') {
      if (shed && shed !== 'All') {
        await db.collection('workers').deleteMany({ shed });
        return NextResponse.json({ success: true, message: `All workers for ${shed} deleted` });
      } else {
        await db.collection('workers').deleteMany({});
        return NextResponse.json({ success: true, message: 'All workers deleted' });
      }
    }

    if (id) {
      await db.collection('workers').deleteOne({ id });
      return NextResponse.json({ success: true, message: `Worker ${id} deleted` });
    }

    return NextResponse.json({ success: false, error: 'id or all=true is required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete worker' }, { status: 500 });
  }
}

