import { NextResponse } from 'next/server';
import { getDb, getTargetDbName, REQUIRED_COLLECTIONS, ensureDatabaseInitialized } from '@/lib/mongodb';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = await getDb();
    await ensureDatabaseInitialized(db);

    const existing = await db.listCollections().toArray();
    const existingNames = existing.map(c => c.name);

    // Get count for each collection
    const collectionStats = await Promise.all(
      existingNames.map(async name => {
        try {
          const count = await db.collection(name).countDocuments();
          return { name, count, isRequired: REQUIRED_COLLECTIONS.includes(name) };
        } catch {
          return { name, count: -1, isRequired: REQUIRED_COLLECTIONS.includes(name) };
        }
      })
    );

    collectionStats.sort((a, b) => a.name.localeCompare(b.name));

    const missingRequired = REQUIRED_COLLECTIONS.filter(name => !existingNames.includes(name));

    return NextResponse.json({
      success: true,
      database: getTargetDbName(),
      totalCollections: existingNames.length,
      requiredCollectionsTotal: REQUIRED_COLLECTIONS.length,
      missingRequired,
      collections: collectionStats,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to inspect database' },
      { status: 500 }
    );
  }
}

export async function POST() {
  return GET();
}
