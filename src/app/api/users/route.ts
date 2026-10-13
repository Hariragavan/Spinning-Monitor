import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const users = await db.collection('users').find({}, { projection: { _id: 0, password: 0 } }).toArray();
    return NextResponse.json({ success: true, data: users });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch users' }, { status: 500 });
  }
}
