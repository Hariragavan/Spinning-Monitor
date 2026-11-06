import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { MachineEmData } from '@/types';
import { syncIotEmToSpinningMonitor } from '@/lib/iot/iotEmService';

export async function GET() {
  try {
    const db = await getDb();

    // Auto-sync mapped IoT EM to machine_em if mappings exist
    try {
      const setDoc = await db.collection('settings').findOne({ _id: 'system_settings' as any });
      if (setDoc?.iotMachineMapping && Object.keys(setDoc.iotMachineMapping).length > 0) {
        await syncIotEmToSpinningMonitor(setDoc.iotMachineMapping);
      }
    } catch (_) {}

    const doc = await db.collection('machine_em').findOne({ _id: 'machine_em_data' as any });

    if (!doc) {
      return NextResponse.json({ success: true, data: {} });
    }

    return NextResponse.json({ success: true, data: doc.data || {} });
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
