import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { CountConversion } from '@/types';

const DEFAULT_COUNT_CONVERSIONS: CountConversion[] = [
  // Shed 1 Counts (Matching Mill Standards)
  { count: '030/1-PH-PC', multiplicationFactor: 0.539, description: '30/1 Poly Hosiery PC Yarn', shed: 'Shed 1' },
  { count: '040/1-PH-PC', multiplicationFactor: 0.803, description: '40/1 Poly Hosiery PC Yarn', shed: 'Shed 1' },
  { count: '34/1-PH-PV', multiplicationFactor: 0.54, description: '34/1 Poly Viscose Yarn', shed: 'Shed 1' },
  { count: '042/1-CH-NY', multiplicationFactor: 0.7235, description: '42/1 Comb Hosiery NY', shed: 'Shed 1' },
  { count: '038/1-CH-NY', multiplicationFactor: 0.6641, description: '38/1 Comb Hosiery NY', shed: 'Shed 1' },
  { count: '034/1-PH-PC', multiplicationFactor: 0.54, description: 'Auto-imported count (034/1-PH-PC)', shed: 'Shed 1' },
  
  // Shed 2 Counts
  { count: '32/1-CH-CY', multiplicationFactor: 0.7155, description: '32/1 Comb Hosiery Compact Weft', shed: 'Shed 2' },
  { count: '34/1CHY-OCY', multiplicationFactor: 0.7836, description: '34/1 Comb Hosiery Compact Compact', shed: 'Shed 2' },
  { count: '30/1CH', multiplicationFactor: 0.6495, description: '30/1 Comb Hosiery', shed: 'Shed 2' },
  { count: '20/1-CW-WVG', multiplicationFactor: 0.3536, description: '20/1 Carded Weft Weaving', shed: 'Shed 2' },
  
  // Universal / All Sheds
  { count: '40s', multiplicationFactor: 1.0, description: 'Default 40s Standard Count', shed: 'All Sheds' }
];

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');

    const filter: any = {};
    if (shed && shed !== 'All' && shed !== 'All Sheds') {
      filter.$or = [{ shed }, { shed: 'All Sheds' }];
    }

    let counts = (await db.collection('yarncounts').find(filter, { projection: { _id: 0 } }).toArray()) as any;
    if (!counts || counts.length === 0) {
      counts = (await db.collection('count_conversions').find(filter, { projection: { _id: 0 } }).toArray()) as any;
    }
    
    // Seed defaults if totally empty
    if (!counts || counts.length === 0) {
      await db.collection('yarncounts').insertMany(DEFAULT_COUNT_CONVERSIONS);
      await db.collection('count_conversions').insertMany(DEFAULT_COUNT_CONVERSIONS);
      counts = shed && shed !== 'All' && shed !== 'All Sheds'
        ? DEFAULT_COUNT_CONVERSIONS.filter(c => c.shed === shed || c.shed === 'All Sheds')
        : DEFAULT_COUNT_CONVERSIONS;
    }

    // Ensure shed is always defined
    const normalizedCounts = counts.map((c: any) => ({
      ...c,
      shed: c.shed || 'Shed 1'
    }));

    return NextResponse.json({ success: true, data: normalizedCounts });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch counts' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();

    if (body.action === 'batch') {
      const counts: CountConversion[] = body.counts || [];
      const shed = body.shed;
      const seen = new Set<string>();
      const normalizedCounts: CountConversion[] = [];

      for (const c of counts) {
        if (!c || !c.count) continue;
        const cleanCount = c.count.trim();
        const itemShed = c.shed || shed || 'Shed 1';
        const key = `${cleanCount.toLowerCase()}__${itemShed.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          normalizedCounts.push({
            ...c,
            count: cleanCount,
            shed: itemShed
          });
        }
      }

      if (shed && shed !== 'All Sheds' && shed !== 'All') {
        await db.collection('yarncounts').deleteMany({ shed });
        await db.collection('count_conversions').deleteMany({ shed });
      } else {
        await db.collection('yarncounts').deleteMany({});
        await db.collection('count_conversions').deleteMany({});
      }
      if (normalizedCounts.length > 0) {
        await db.collection('yarncounts').insertMany(normalizedCounts);
        await db.collection('count_conversions').insertMany(normalizedCounts);
      }
      return NextResponse.json({ success: true, count: normalizedCounts.length });
    }

    const item: CountConversion = body.conversion || body;
    if (!item || !item.count) {
      return NextResponse.json({ success: false, error: 'count is required' }, { status: 400 });
    }

    const cleanCount = item.count.trim();
    const itemShed = item.shed && item.shed !== 'All' ? item.shed : 'Shed 1';
    const filter = { count: cleanCount, shed: itemShed };

    await db.collection('yarncounts').updateOne(
      filter,
      { $set: { ...item, count: cleanCount, shed: itemShed } },
      { upsert: true }
    );
    await db.collection('count_conversions').updateOne(
      filter,
      { $set: { ...item, count: cleanCount, shed: itemShed } },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: { ...item, count: cleanCount, shed: itemShed } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save count conversion' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const count = searchParams.get('count');
    const shed = searchParams.get('shed');

    if (!count) {
      return NextResponse.json({ success: false, error: 'count is required' }, { status: 400 });
    }

    const cleanCount = count.trim();
    const filter: any = { count: cleanCount };
    if (shed && shed !== 'All' && shed !== 'All Sheds') {
      filter.shed = shed;
    }

    await db.collection('yarncounts').deleteMany(filter);
    await db.collection('count_conversions').deleteMany(filter);
    return NextResponse.json({ success: true, message: `Count ${cleanCount} deleted` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete count' }, { status: 500 });
  }
}

