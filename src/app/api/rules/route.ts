import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { IncentiveRule } from '@/types';

export async function GET() {
  try {
    const db = await getDb();
    let rules = await db.collection<IncentiveRule>('incentiverules').find({}, { projection: { _id: 0 } }).toArray();
    if (!rules || rules.length === 0) {
      rules = await db.collection<IncentiveRule>('incentive_rules').find({}, { projection: { _id: 0 } }).toArray();
    }
    return NextResponse.json({ success: true, data: rules });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch rules' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();
    const rules: IncentiveRule[] = body.rules || [];

    await db.collection('incentiverules').deleteMany({});
    if (rules.length > 0) {
      await db.collection('incentiverules').insertMany(rules);
    }
    // Also keep incentive_rules synced for legacy compat
    await db.collection('incentive_rules').deleteMany({});
    if (rules.length > 0) {
      await db.collection('incentive_rules').insertMany(rules);
    }

    return NextResponse.json({ success: true, count: rules.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update rules' }, { status: 500 });
  }
}
