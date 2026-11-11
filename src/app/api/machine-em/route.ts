import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { MachineEmData } from '@/types';
import { getMappedMachineEmFromIotEm, fetchAndSyncAllShiftsFromRailway } from '@/lib/iot/iotEmService';
import { IOT_COLLECTIONS } from '@/lib/iot/iotDb';

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

    // Drop legacy redundant machine_em collection on Atlas if it exists
    db.collection('machine_em').drop().catch(() => {});

    // Auto-sync mapped IoT EM across all shifts (1, 2, 3) from Railway
    // Throttled to at most once every 15 seconds unless force=true is requested
    const now = Date.now();
    if (force || (now - lastRailwaySyncTime >= 15000)) {
      lastRailwaySyncTime = now;
      try {
        await fetchAndSyncAllShiftsFromRailway(date);
      } catch (syncErr) {
        console.warn('Auto-sync all shifts from Railway warning:', syncErr);
      }
    }

    // Direct read from single canonical table iot_em
    const data = await getMappedMachineEmFromIotEm(undefined, date);

    return NextResponse.json(
      { success: true, data },
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

    const emCol = db.collection(IOT_COLLECTIONS.EM);
    const bulkOps: any[] = [];

    // Save cell edits directly into iot_em (machine-by-machine, shift-by-shift, date-wise)
    Object.keys(incomingData || {}).forEach(dateStr => {
      const month = dateStr.slice(0, 7);
      const machineMap = incomingData[dateStr] || {};
      Object.keys(machineMap).forEach(mStr => {
        const shiftMap = machineMap[mStr] || {};
        Object.keys(shiftMap).forEach(sKey => {
          const val = Number(shiftMap[sKey]);
          if (!isNaN(val)) {
            const shift = Number(sKey);
            bulkOps.push({
              updateOne: {
                filter: { machineNo: mStr, date: dateStr, shift },
                update: {
                  $set: {
                    machineNo: mStr,
                    date: dateStr,
                    month,
                    shift,
                    emTotal: val,
                    isShiftFinal: true,
                    updatedAt: new Date()
                  },
                  $setOnInsert: { recordedAt: new Date() }
                },
                upsert: true
              }
            });
          }
        });
      });
    });

    if (bulkOps.length > 0) {
      await emCol.bulkWrite(bulkOps, { ordered: false });
    }

    // Drop legacy redundant machine_em collection if still present
    db.collection('machine_em').drop().catch(() => {});

    // Return the fresh mapped data directly from iot_em
    const updatedData = await getMappedMachineEmFromIotEm();

    return NextResponse.json(
      { success: true, data: updatedData },
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
