import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { CountConversion } from '@/types';

export const DEFAULT_COUNT_CONVERSIONS: CountConversion[] = [
  { count: '32/1-CH-CY', multiplicationFactor: 0.7155, description: '32/1 Comb Hosiery Compact Weft' },
  { count: '34/1CHY-OCY', multiplicationFactor: 0.7836, description: '34/1 Comb Hosiery Compact Compact' },
  { count: '30/1CH', multiplicationFactor: 0.6495, description: '30/1 Comb Hosiery' },
  { count: '20/1-CW-WVG', multiplicationFactor: 0.3536, description: '20/1 Carded Weft Weaving' },
  { count: '40s', multiplicationFactor: 1.0, description: 'Default 40s Standard Count' }
];

export async function GET() {
  try {
    const db = await getDb();
    let counts = (await db.collection('yarncounts').find({}, { projection: { _id: 0 } }).toArray()) as any;
    if (!counts || counts.length === 0) {
      counts = (await db.collection('count_conversions').find({}, { projection: { _id: 0 } }).toArray()) as any;
    }
    
    // Seed defaults if empty
    if (!counts || counts.length === 0) {
      await db.collection('yarncounts').insertMany(DEFAULT_COUNT_CONVERSIONS);
      await db.collection('count_conversions').insertMany(DEFAULT_COUNT_CONVERSIONS);
      counts = DEFAULT_COUNT_CONVERSIONS;
    }

    return NextResponse.json({ success: true, data: counts });
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
      await db.collection('yarncounts').deleteMany({});
      await db.collection('count_conversions').deleteMany({});
      if (counts.length > 0) {
        await db.collection('yarncounts').insertMany(counts);
        await db.collection('count_conversions').insertMany(counts);
      }
      return NextResponse.json({ success: true, count: counts.length });
    }

    const item: CountConversion = body.conversion || body;
    if (!item || !item.count) {
      return NextResponse.json({ success: false, error: 'count is required' }, { status: 400 });
    }

    await db.collection('yarncounts').updateOne(
      { count: item.count },
      { $set: item },
      { upsert: true }
    );
    await db.collection('count_conversions').updateOne(
      { count: item.count },
      { $set: item },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save count conversion' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const count = searchParams.get('count');

    if (!count) {
      return NextResponse.json({ success: false, error: 'count is required' }, { status: 400 });
    }

    await db.collection('count_conversions').deleteOne({ count });
    return NextResponse.json({ success: true, message: `Count ${count} deleted` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete count' }, { status: 500 });
  }
}
