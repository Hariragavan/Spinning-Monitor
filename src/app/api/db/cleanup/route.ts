import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { transferAndCleanupDatabase } from '@/lib/dbMigration';

export async function GET() {
  try {
    const db = await getDb();
    const report = await transferAndCleanupDatabase(db);
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Database cleanup failed' }, { status: 500 });
  }
}

export async function POST() {
  try {
    const db = await getDb();
    const report = await transferAndCleanupDatabase(db);
    return NextResponse.json({ success: true, report });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Database cleanup failed' }, { status: 500 });
  }
}

