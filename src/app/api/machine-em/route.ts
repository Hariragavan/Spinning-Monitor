import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { MachineEmData } from '@/types';
import { syncIotEmToSpinningMonitor, fetchAndSyncAllShiftsFromRailway } from '@/lib/iot/iotEmService';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const maxDuration = 30;

let lastRailwaySyncTime = 0;

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get('date') || undefined;
    const force = Boolean(searchParams.get('force') || searchParams.get('sync'));

    // Auto-sync mapped IoT EM to machine_em across all shifts (1, 2, 3) from Railway
    // Throttled to at most once every 15 seconds unless force=true is requested
    const now = Date.now();
    if (force || (now - lastRailwaySyncTime >= 15000)) {
      lastRailwaySyncTime = now;
      try {
        await fetchAndSyncAllShiftsFromRailway(date);
      } catch (syncErr) {
        console.warn('Auto-sync all shifts from Railway failed:', syncErr);
        // Fallback: sync from existing iot_em documents in database
        try {
          const setDoc = await db.collection('settings').findOne({ _id: 'system_settings' as any });
          if (setDoc?.iotMachineMapping && Object.keys(setDoc.iotMachineMapping).length > 0) {
            await syncIotEmToSpinningMonitor(setDoc.iotMachineMapping);
          }
        } catch (_) {}
      }
    }

    const doc = await db.collection('machine_em').findOne({ _id: 'machine_em_data' as any });

    return NextResponse.json(
      { success: true, data: doc?.data || {} },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to fetch machine em data' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();
    const incomingData: MachineEmData = body.data || body;

    const existingDoc = await db.collection('machine_em').findOne({ _id: 'machine_em_data' as any });
    const merged: Record<string, Record<string, Record<string, number>>> = { ...(existingDoc?.data || {}) };

    // Deep merge shift-wise: date -> machine -> shift
    Object.keys(incomingData || {}).forEach(dateStr => {
      if (!merged[dateStr]) merged[dateStr] = {};
      const machineMap = incomingData[dateStr] || {};
      Object.keys(machineMap).forEach(mStr => {
        if (!merged[dateStr][mStr]) merged[dateStr][mStr] = {};
        const shiftMap = machineMap[mStr] || {};
        Object.keys(shiftMap).forEach(sKey => {
          const val = Number(shiftMap[sKey]);
          if (!isNaN(val)) {
            merged[dateStr][mStr][sKey] = val;
          }
        });
      });
    });

    await db.collection('machine_em').updateOne(
      { _id: 'machine_em_data' as any },
      { $set: { data: merged, updatedAt: new Date() } },
      { upsert: true }
    );

    return NextResponse.json(
      { success: true, data: merged },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to save machine em data' },
      { status: 500 }
    );
  }
}
