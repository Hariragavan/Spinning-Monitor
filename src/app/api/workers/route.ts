import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { Sider } from '@/types';

export async function GET() {
  try {
    const db = await getDb();
    const workers = await db.collection<Sider>('workers').find({}, { projection: { _id: 0 } }).toArray();
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
      // Overwrite/update entire list
      const workers: Sider[] = body.workers || [];
      await db.collection('workers').deleteMany({});
      if (workers.length > 0) {
        await db.collection('workers').insertMany(workers);
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
    const all = searchParams.get('all');

    if (all === 'true') {
      await db.collection('workers').deleteMany({});
      return NextResponse.json({ success: true, message: 'All workers deleted' });
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
