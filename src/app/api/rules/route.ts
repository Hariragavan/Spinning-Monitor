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

    const rules = await db.collection<IncentiveRule>('incentive_rules').find(filter, { projection: { _id: 0 } }).toArray();

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
      
      await db.collection('incentive_rules').updateOne(
        filter,
        { $set: { ...rule, count: cleanCount, shed, department: dept } },
        { upsert: true }
      );
      // Drop legacy incentiverules if present
      await db.collection('incentiverules').drop().catch(() => {});

      return NextResponse.json({ success: true, data: { ...rule, count: cleanCount, shed, department: dept } });
    }

    const rawRules: IncentiveRule[] = body.rules || [];
    const seen = new Set<string>();
    const normalizedRules: IncentiveRule[] = [];

    // Iterate backwards so the newest updated rule for a count in a shed overrides older ones
    for (let i = rawRules.length - 1; i >= 0; i--) {
      const r = rawRules[i];
      if (!r || !r.count) continue;
      const cleanCount = r.count.trim();
      const shed = r.shed || 'Shed 1';
      const dept = r.department || 'Sider';
      const normCount = cleanCount.toLowerCase().replace(/[-/\s_]/g, '');
      const key = `${normCount}__${dept.toLowerCase()}__${shed.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.add(key);
        const { _id, ...cleanObj } = r as any;
        normalizedRules.unshift({
          ...cleanObj,
          count: cleanCount,
          shed,
          department: dept
        });
      }
    }

    await db.collection('incentive_rules').deleteMany({});
    if (normalizedRules.length > 0) {
      await db.collection('incentive_rules').insertMany(normalizedRules.map(x => ({ ...x })));
    }
    // Drop legacy incentiverules if present
    await db.collection('incentiverules').drop().catch(() => {});

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
    const all = searchParams.get('all');

    if (all === 'true') {
      const deleteFilter: any = {};
      if (shed && shed !== 'All' && shed !== 'All Sheds') {
        deleteFilter.shed = shed;
      }
      await db.collection('incentive_rules').deleteMany(deleteFilter);
      await db.collection('incentiverules').drop().catch(() => {});
      return NextResponse.json({ success: true, message: 'Incentive rules wiped successfully' });
    }

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

    await db.collection('incentive_rules').deleteMany(filter);
    return NextResponse.json({ success: true, message: `Rule ${cleanCount} deleted` });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to delete rule' }, { status: 500 });
  }
}
