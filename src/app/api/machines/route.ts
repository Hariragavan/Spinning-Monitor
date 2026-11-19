import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

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
 * Synchronize and restore machines from uploaded reports and standard profiles
 */
async function syncMachinesFromReportsInternal(db: any) {
  const machineMap = new Map<string, any>();

  // 1. Ingest from uploaded reports (both this month and all historical reports)
  const reports = await db.collection('reports').find({}).toArray();
  reports.forEach((r: any) => {
    const shed = r.shed || 'Shed 1';
    (r.entries || []).forEach((e: any) => {
      const rf = String(e.frameNo || e.rfNo || '').trim().toUpperCase();
      if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return;
      const key = `${rf}__${shed.toLowerCase()}`;
      const existing = machineMap.get(key);
      machineMap.set(key, {
        id: `m-${rf.toLowerCase()}-${shed.toLowerCase().replace(/\s+/g, '-')}`,
        rfNo: rf,
        frameNo: rf,
        shed: shed,
        count: (e.count || '').trim() || existing?.count || '030/1-PH-PC',
        spindles: e.spindles || existing?.spindles || 1008,
        status: 'Active',
        description: `RING FRAME ${rf} (${shed})`
      });
    });

    (r.summaries || []).forEach((s: any) => {
      const rf = String(s.frameNo || s.rfNo || '').trim().toUpperCase();
      if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return;
      const key = `${rf}__${shed.toLowerCase()}`;
      const existing = machineMap.get(key);
      machineMap.set(key, {
        id: `m-${rf.toLowerCase()}-${shed.toLowerCase().replace(/\s+/g, '-')}`,
        rfNo: rf,
        frameNo: rf,
        shed: shed,
        count: (s.count || '').trim() || existing?.count || '030/1-PH-PC',
        spindles: existing?.spindles || 1008,
        status: 'Active',
        description: `RING FRAME ${rf} (${shed})`
      });
    });
  });

  // 2. Also ensure standard machines for each shed are included
  for (const [shed, list] of Object.entries(STANDARD_FALLBACK_MACHINES)) {
    for (const item of list) {
      const key = `${item.rfNo}__${shed.toLowerCase()}`;
      if (!machineMap.has(key)) {
        machineMap.set(key, {
          id: `m-${item.rfNo.toLowerCase()}-${shed.toLowerCase().replace(/\s+/g, '-')}`,
          rfNo: item.rfNo,
          frameNo: item.rfNo,
          shed: shed,
          count: item.count,
          stdGps: item.stdGps,
          spindles: item.spindles || 1200,
          status: 'Active',
          description: `RING FRAME ${item.rfNo} (${shed})`
        });
      }
    }
  }

  // 3. Batch upsert into machines collection
  for (const machine of machineMap.values()) {
    await db.collection('machines').updateOne(
      { rfNo: machine.rfNo, shed: machine.shed },
      { $set: machine },
      { upsert: true }
    );
  }

  return machineMap.size;
}

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');
    const syncFromReports = searchParams.get('syncFromReports') === 'true' || searchParams.get('sync') === 'true';

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
      await syncMachinesFromReportsInternal(db);
    }

    const filter: any = {};
    if (shed && shed !== 'All') {
      filter.shed = shed;
    }

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

    if (body.action === 'syncFromReports') {
      const restoredCount = await syncMachinesFromReportsInternal(db);
      const machines = await db.collection('machines').find({}, { projection: { _id: 0 } }).toArray();
      return NextResponse.json({ success: true, count: restoredCount, data: machines });
    }

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
