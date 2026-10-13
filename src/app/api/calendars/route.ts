import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';

export async function GET() {
  try {
    const db = await getDb();
    const calendars = await db.collection('millcalendars').find({}, { projection: { _id: 0 } }).sort({ year: -1, month: -1 }).toArray();
    return NextResponse.json({ success: true, data: calendars });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch mill calendars' }, { status: 500 });
  }
}
