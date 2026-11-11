import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { CountConversion } from '@/types';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');

    const filter: any = {};
    if (shed && shed !== 'All' && shed !== 'All Sheds') {
      filter.$or = [{ shed }, { shed: 'All Sheds' }];
    }

    const counts = (await db.collection('count_conversions').find(filter, { projection: { _id: 0 } }).toArray()) as any;
    
    // Ensure shed is always defined
    const normalizedCounts = (counts || []).map((c: any) => ({
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
        await db.collection('count_conversions').deleteMany({ shed });
      } else {
        await db.collection('count_conversions').deleteMany({});
      }
      if (normalizedCounts.length > 0) {
        await db.collection('count_conversions').insertMany(normalizedCounts);
      }
      // Drop legacy yarncounts collection if present
      await db.collection('yarncounts').drop().catch(() => {});
      return NextResponse.json({ success: true, count: normalizedCounts.length });
    }

    const item: CountConversion = body.conversion || body;
    if (!item || !item.count) {
      return NextResponse.json({ success: false, error: 'count is required' }, { status: 400 });
    }

    const cleanCount = item.count.trim();
    const itemShed = item.shed && item.shed !== 'All' ? item.shed : 'Shed 1';
    const filter = { count: cleanCount, shed: itemShed };

    await db.collection('count_conversions').updateOne(
      filter,
      { $set: { ...item, count: cleanCount, shed: itemShed } },
      { upsert: true }
    );

    // Drop legacy yarncounts collection if present
    await db.collection('yarncounts').drop().catch(() => {});

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
    const all = searchParams.get('all');

    if (all === 'true') {
      const deleteFilter: any = {};
      if (shed && shed !== 'All' && shed !== 'All Sheds') {
        deleteFilter.shed = shed;
      }
      await db.collection('count_conversions').deleteMany(deleteFilter);
      await db.collection('yarncounts').drop().catch(() => {});
      return NextResponse.json({ success: true, message: 'Counts wiped successfully' });
    }

    if (!count) {
      return NextResponse.json({ success: false, error: 'count is required' }, { status: 400 });
    }

    const cleanCount = count.trim();
    const filter: any = { count: cleanCount };
    if (shed && shed !== 'All' && shed !== 'All Sheds') {
      filter.shed = shed;
    }

    await db.collection('count_conversions').deleteMany(filter);
    return NextResponse.json({ success: true, message: `Count ${cleanCount} deleted` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete count' }, { status: 500 });
  }
}
