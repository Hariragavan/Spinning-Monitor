import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { MachineEmData } from '@/types';

import { SAMPLE_DATE, SAMPLE_MACHINE_EM_10102026 } from '@/lib/sampleSeedData';

export async function GET() {
  try {
    const db = await getDb();
    const doc = await db.collection('machine_em').findOne({ _id: 'machine_em_data' as any });

    const data: Record<string, any> = doc?.data || {};
    data[SAMPLE_DATE] = {
      ...SAMPLE_MACHINE_EM_10102026,
      ...(data[SAMPLE_DATE] || {})
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch machine em data' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();
    const incomingData: MachineEmData = body.data || body;

    const existingDoc = await db.collection('machine_em').findOne({ _id: 'machine_em_data' as any });
    const merged = { ...(existingDoc?.data || {}) };

    Object.keys(incomingData || {}).forEach(dateStr => {
      merged[dateStr] = {
        ...(merged[dateStr] || {}),
        ...incomingData[dateStr]
      };
    });

    await db.collection('machine_em').updateOne(
      { _id: 'machine_em_data' as any },
      { $set: { data: merged } },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: merged });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save machine em data' }, { status: 500 });
  }
}
