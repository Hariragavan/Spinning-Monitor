import { NextResponse } from 'next/server';
import { migrateFromOldDatabases } from '@/lib/oldDbMigration';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  try {
    const summary = await migrateFromOldDatabases();
    return NextResponse.json({
      success: summary.success,
      message: 'Old database inspection and migration executed successfully',
      data: summary
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to migrate old database' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}

