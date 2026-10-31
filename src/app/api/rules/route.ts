import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { IncentiveRule } from '@/types';

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const { searchParams } = new URL(req.url);
    const shed = searchParams.get('shed');

    const filter: any = {};
    if (shed && shed !== 'All' && shed !== 'All Sheds') {
      filter.$or = [{ shed }, { shed: 'All Sheds' }];
    }

    let rules = await db.collection<IncentiveRule>('incentiverules').find(filter, { projection: { _id: 0 } }).toArray();
    if (!rules || rules.length === 0) {
      rules = await db.collection<IncentiveRule>('incentive_rules').find(filter, { projection: { _id: 0 } }).toArray();
    }

    const normalized = (rules || []).map(r => ({
      ...r,
      count: (r.count || '').trim(),
      shed: r.shed || 'Shed 1'
    }));

    return NextResponse.json({ success: true, data: normalized });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch rules' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();

    if (body.action === 'save_rule') {
      const rule: IncentiveRule = body.rule;
      if (!rule || !rule.count) {
        return NextResponse.json({ success: false, error: 'rule and count are required' }, { status: 400 });
      }
      const cleanCount = rule.count.trim();
      const shed = rule.shed || 'Shed 1';
      const dept = rule.department || 'Sider';
      const filter = { count: cleanCount, department: dept, shed };
      await db.collection('incentiverules').updateOne(filter, { $set: { ...rule, count: cleanCount, shed, department: dept } }, { upsert: true });
      await db.collection('incentive_rules').updateOne(filter, { $set: { ...rule, count: cleanCount, shed, department: dept } }, { upsert: true });
      return NextResponse.json({ success: true, data: { ...rule, count: cleanCount, shed, department: dept } });
    }

    const rawRules: IncentiveRule[] = body.rules || [];
    const seen = new Set<string>();
    const normalizedRules: IncentiveRule[] = [];

    for (const r of rawRules) {
      if (!r || !r.count) continue;
      const cleanCount = r.count.trim();
      const shed = r.shed || 'Shed 1';
      const dept = r.department || 'Sider';
      const key = `${cleanCount.toLowerCase()}__${dept.toLowerCase()}__${shed.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        normalizedRules.push({
          ...r,
          count: cleanCount,
          shed,
          department: dept
        });
      }
    }

    await db.collection('incentiverules').deleteMany({});
    if (normalizedRules.length > 0) {
      await db.collection('incentiverules').insertMany(normalizedRules);
    }
    await db.collection('incentive_rules').deleteMany({});
    if (normalizedRules.length > 0) {
      await db.collection('incentive_rules').insertMany(normalizedRules);
    }

    return NextResponse.json({ success: true, count: normalizedRules.length });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to update rules' }, { status: 500 });
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
    const escapedCount = cleanCount.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    const countRegex = new RegExp(`^${escapedCount}$`, 'i');

    const filter: any = { count: countRegex };
    if (shed && shed !== 'All' && shed !== 'All Sheds') {
      filter.$or = [{ shed }, { shed: 'All Sheds' }];
    }

    await db.collection('incentiverules').deleteMany(filter);
    await db.collection('incentive_rules').deleteMany(filter);
    return NextResponse.json({ success: true, message: `Rule ${cleanCount} deleted` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete rule' }, { status: 500 });
  }
}
