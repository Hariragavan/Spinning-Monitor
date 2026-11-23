import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { getMachineShed, normalizeShed, parseUniversalDateParts } from '@/lib/utils';

const STANDARD_FALLBACK_MACHINES: Record<string, Array<{ rfNo: string; count: string; stdGps: number; spindles: number }>> = {
  'Shed 1': [
    { rfNo: 'SP009', count: '21/1-CW-SY', stdGps: 340, spindles: 1008 },
    { rfNo: 'SP010', count: '24/1-CH-SY', stdGps: 340, spindles: 1008 },
    { rfNo: 'SP011', count: '24/1-CH-SY', stdGps: 340, spindles: 1008 },
    { rfNo: 'SP012', count: '30/1--DY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP013', count: '30/1--DY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP014', count: '30/1--DY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP015', count: '32/1-CW-SY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP016', count: '32/1-CW-SY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP017', count: '40/1CHY', stdGps: 310, spindles: 1008 },
    { rfNo: 'SP018', count: '40/1CHY', stdGps: 310, spindles: 1008 },
    { rfNo: 'SP021', count: '030/1-PH-PC', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP022', count: '030/1-PH-PC', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP023', count: '040/1-PH-PC', stdGps: 310, spindles: 1200 },
    { rfNo: 'SP024', count: '040/1-PH-PC', stdGps: 310, spindles: 1200 },
    { rfNo: 'SP025', count: '34/1-PH-PV', stdGps: 330, spindles: 1200 },
    { rfNo: 'SP026', count: '34/1-PH-PV', stdGps: 330, spindles: 1200 },
    { rfNo: 'SP027', count: '042/1-CH-NY', stdGps: 305, spindles: 1200 },
    { rfNo: 'SP028', count: '042/1-CH-NY', stdGps: 305, spindles: 1200 },
    { rfNo: 'SP029', count: '038/1-CH-NY', stdGps: 320, spindles: 1200 },
    { rfNo: 'SP030', count: '034/1-PH-PC', stdGps: 330, spindles: 1200 }
  ],
  'Shed 2': [
    { rfNo: 'SP031', count: '32/1-CH-CY', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP032', count: '32/1-CH-CY', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP033', count: '32/1-CH-CY', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP034', count: '34/1CHY-OCY', stdGps: 330, spindles: 1200 },
    { rfNo: 'SP035', count: '34/1CHY-OCY', stdGps: 330, spindles: 1200 },
    { rfNo: 'SP036', count: '30/1CH', stdGps: 355, spindles: 1200 },
    { rfNo: 'SP037', count: '30/1CH', stdGps: 355, spindles: 1200 },
    { rfNo: 'SP038', count: '30/1CH', stdGps: 355, spindles: 1200 },
    { rfNo: 'SP039', count: '20/1-CW-WVG', stdGps: 375, spindles: 1200 },
    { rfNo: 'SP040', count: '20/1-CW-WVG', stdGps: 375, spindles: 1200 }
  ],
  'Shed 3': [
    { rfNo: 'SP041', count: '26/1-CHY', stdGps: 360, spindles: 1200 },
    { rfNo: 'SP042', count: '26/1-CHY', stdGps: 360, spindles: 1200 },
    { rfNo: 'SP043', count: '26/1-CHY', stdGps: 360, spindles: 1200 },
    { rfNo: 'SP044', count: '50s Compact', stdGps: 325, spindles: 1200 },
    { rfNo: 'SP045', count: '50s Compact', stdGps: 325, spindles: 1200 },
    { rfNo: 'SP046', count: '60s Super Combed', stdGps: 310, spindles: 1200 },
    { rfNo: 'SP047', count: '60s Super Combed', stdGps: 310, spindles: 1200 },
    { rfNo: 'SP048', count: '40s Micro Weft', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP049', count: '40s Micro Weft', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP050', count: '40s Micro Weft', stdGps: 340, spindles: 1200 }
  ],
  'KTTM': [
    { rfNo: 'K01', count: '60s CW', stdGps: 310, spindles: 1200 },
    { rfNo: 'K02', count: '60s CW', stdGps: 310, spindles: 1200 },
    { rfNo: 'K03', count: '60s CW', stdGps: 310, spindles: 1200 },
    { rfNo: 'K04', count: '40s KTTM', stdGps: 345, spindles: 1200 },
    { rfNo: 'K05', count: '40s KTTM', stdGps: 345, spindles: 1200 },
    { rfNo: 'K06', count: '40s KTTM', stdGps: 345, spindles: 1200 },
    { rfNo: 'K07', count: '80s Compact', stdGps: 280, spindles: 1200 },
    { rfNo: 'K08', count: '80s Compact', stdGps: 280, spindles: 1200 },
    { rfNo: 'K09', count: '100s Dobby', stdGps: 250, spindles: 1200 },
    { rfNo: 'K10', count: '100s Dobby', stdGps: 250, spindles: 1200 }
  ]
};

/**
 * Synchronize and recreate master machines strictly from uploaded daily production reports for this month.
 * Strictly checks each machine number available in this month's daily uploaded production:
 * - Shed 1: SP009 - SP030 (1..30)
 * - Shed 2: SP031 - SP040 (31..40)
 * - Shed 3: SP041 - SP050 (41..50)
 * - KTTM: K01 - K10 (starts with 'K')
 * If that machine number is not in this month's daily uploaded production, it is removed!
 * Removes current all machines in each shed and recreates the machine numbers cleanly.
 */
async function syncMachinesFromReportsInternal(db: any, targetMonth?: number, targetYear?: number) {
  const machineMap = new Map<string, any>();

  // 1. Fetch all reports from database
  const allReports = await db.collection('reports').find({}).toArray();

  // 2. Identify the target month and year
  let mTarget = targetMonth;
  let yTarget = targetYear;
  if (!mTarget || !yTarget) {
    for (const r of allReports) {
      const p = parseUniversalDateParts(r.date);
      if (p) {
        if (!yTarget || p.year > yTarget || (p.year === yTarget && p.month > (mTarget || 0))) {
          yTarget = p.year;
          mTarget = p.month;
        }
      }
    }
  }

  const now = new Date();
  if (!mTarget) mTarget = now.getMonth() + 1;
  if (!yTarget) yTarget = now.getFullYear();

  // 3. Filter reports specifically for this month!
  const monthReports = allReports.filter((r: any) => {
    const p = parseUniversalDateParts(r.date);
    if (!p) return false;
    return p.month === mTarget && p.year === yTarget;
  });

  // Source reports: strictly this month's reports (or allReports fallback only if zero reports exist for this month)
  const sourceReports = monthReports.length > 0 ? monthReports : allReports;

  // 4. Ingest strictly from uploaded daily reports in sheet upload order (NO hardcoded standard machine injection)
  sourceReports.forEach((r: any) => {
    // 1. First process summaries to preserve sheet upload row order
    (r.summaries || []).forEach((s: any) => {
      const rf = String(s.frameNo || s.rfNo || '').trim().toUpperCase();
      if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return;
      const canonicalShed = getMachineShed(rf, s.shed || r.shed);
      const existing = machineMap.get(rf);
      machineMap.set(rf, {
        id: existing?.id || `m-${rf.toLowerCase()}-${canonicalShed.toLowerCase().replace(/\s+/g, '-')}`,
        rfNo: s.frameNo || rf,
        frameNo: s.frameNo || rf,
        shed: canonicalShed,
        count: (s.count || '').trim() || existing?.count || '030/1-PH-PC',
        spindles: existing?.spindles || 1008,
        stdGps: s.stdGps || s.avgGps || existing?.stdGps || 0,
        status: 'Active',
        description: `RING FRAME ${rf} (${canonicalShed})`
      });
    });

    // 2. Next process entries for any machine not in summaries
    (r.entries || []).forEach((e: any) => {
      const rf = String(e.frameNo || e.rfNo || '').trim().toUpperCase();
      if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return;
      const canonicalShed = getMachineShed(rf, e.shed || r.shed);
      const existing = machineMap.get(rf);
      if (!existing) {
        machineMap.set(rf, {
          id: `m-${rf.toLowerCase()}-${canonicalShed.toLowerCase().replace(/\s+/g, '-')}`,
          rfNo: e.frameNo || rf,
          frameNo: e.frameNo || rf,
          shed: canonicalShed,
          count: (e.count || '').trim() || '030/1-PH-PC',
          spindles: e.spindles || 1008,
          stdGps: e.gpsTarget || e.gpsActual || 0,
          status: 'Active',
          description: `RING FRAME ${rf} (${canonicalShed})`
        });
      } else if (!existing.count && e.count) {
        existing.count = (e.count || '').trim();
      }
    });
  });

  // 5. Clear machines collection to remove any unlisted/old machines
  await db.collection('machines').deleteMany({});

  // 6. Batch insert recreated machines into machines collection
  const allMachines = Array.from(machineMap.values());
  if (allMachines.length > 0) {
    await db.collection('machines').insertMany(allMachines);
  }

  return machineMap.size;
}

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');
    const syncFromReports = searchParams.get('syncFromReports') === 'true' || searchParams.get('sync') === 'true' || searchParams.get('startFresh') === 'true';
    const month = searchParams.get('month') ? parseInt(searchParams.get('month')!, 10) : undefined;
    const year = searchParams.get('year') ? parseInt(searchParams.get('year')!, 10) : undefined;

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

    // Check count of machines
    const currentCount = await db.collection('machines').countDocuments();
    if (syncFromReports || currentCount === 0) {
      await syncMachinesFromReportsInternal(db, month, year);
    }

    const rawMachines = await db.collection('machines').find({}, { projection: { _id: 0 } }).toArray();
    const normalized = rawMachines
      .filter((m: any) => {
        const rf = String(m.rfNo || m.frameNo || '').trim().toUpperCase();
        return rf !== '' && rf !== 'M' && rf !== 'MC' && Boolean(rf.match(/\d+/));
      })
      .map((m: any) => {
        const rf = m.rfNo || m.frameNo || '';
        const trueShed = getMachineShed(rf, m.shed);
        return {
          ...m,
          id: m.id || `m-${rf.toLowerCase()}`,
          rfNo: rf,
          frameNo: m.frameNo || rf,
          shed: trueShed,
          count: m.count || '030/1-PH-PC',
          spindles: m.spindles ?? 1200,
          status: m.status || 'Active',
          description: m.description || `RING FRAME ${rf} (${trueShed})`
        };
      })
      .filter((m: any) => {
        if (!shed || shed === 'All' || shed === 'All Sheds') return true;
        return normalizeShed(m.shed) === normalizeShed(shed);
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

    if (body.action === 'syncFromReports' || body.action === 'startFresh') {
      const month = body.month ? parseInt(body.month, 10) : undefined;
      const year = body.year ? parseInt(body.year, 10) : undefined;
      const restoredCount = await syncMachinesFromReportsInternal(db, month, year);
      const machines = await db.collection('machines').find({}, { projection: { _id: 0 } }).toArray();
      const normalized = machines.map((m: any) => {
        const rf = m.rfNo || m.frameNo || '';
        const trueShed = getMachineShed(rf, m.shed);
        return { ...m, shed: trueShed, rfNo: rf, frameNo: rf };
      });
      return NextResponse.json({ success: true, count: restoredCount, data: normalized });
    }

    const isValidMachine = (m: any) => {
      const rf = String(m?.rfNo || m?.frameNo || '').trim().toUpperCase();
      return rf !== '' && rf !== 'M' && rf !== 'MC' && Boolean(rf.match(/\d+/));
    };

    if (body.action === 'batch') {
      const machines: any[] = (body.machines || []).filter(isValidMachine);
      const shed = body.shed;
      if (shed && shed !== 'All' && shed !== 'All Sheds') {
        const normS = normalizeShed(shed);
        await db.collection('machines').deleteMany({
          $or: [
            { shed: normS },
            { shed: shed }
          ]
        });
      } else {
        await db.collection('machines').deleteMany({});
      }

      if (machines.length > 0) {
        const normalizedList = machines.map(m => {
          const rf = m.rfNo || m.frameNo;
          const trueShed = getMachineShed(rf, m.shed || shed);
          return {
            ...m,
            rfNo: rf,
            frameNo: rf,
            shed: trueShed
          };
        });
        await db.collection('machines').insertMany(normalizedList);
      }
      return NextResponse.json({ success: true, count: machines.length });
    }

    const machine = body.machine || body;
    const rfNo = machine?.rfNo || machine?.frameNo;
    if (!machine || !rfNo || !isValidMachine(machine)) {
      return NextResponse.json({ success: false, error: 'A valid machine number with digits is required' }, { status: 400 });
    }

    const cleanRf = String(rfNo).trim().toUpperCase();
    const mShed = getMachineShed(cleanRf, machine.shed || 'Shed 1');
    const normalizedMachine = {
      ...machine,
      shed: mShed,
      frameNo: cleanRf,
      rfNo: cleanRf
    };

    await db.collection('machines').updateOne(
      { frameNo: cleanRf },
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
