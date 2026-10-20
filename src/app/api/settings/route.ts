import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { SystemSettings } from '@/types';

const DEFAULT_SETTINGS: SystemSettings = {
  googleSheetUrl: '',
  autoUpdateEnabled: false,
  lastSyncDate: null,
  bestSiderOverrideId: null,
  tvInterval: 15,
  tvSubInterval: 5,
  machineSiderCounts: { SP023: 2, SP045: 2, SP046: 2, SP047: 2, SP048: 2, SP049: 2, SP050: 2, SP051: 2, SP052: 2, SP053: 2, SP054: 2, SP055: 2, K01: 2, K02: 2, K03: 2, K04: 2, K05: 2, K06: 2 },
  gaiterCounts: { I: 1, II: 1, III: 1 },
  tvPageIntervals: {},
  tvMonth: 0,
  tvYear: 0,
  tvShowBestSiderMonth: true,
  machineEmGoogleSheetUrl: '',
  lastMachineEmSyncDate: null,
  emHighLimit: 4,
  whatsAppProdPhone: '+919944711575',
  whatsAppEmPhone: '+919944711575',
  whatsAppIncentivePhone: '+919944711575',
};

export async function GET() {
  try {
    const db = await getDb();
    let doc = await db.collection('settings').findOne({ _id: 'system_settings' as any });

    if (!doc) {
      await db.collection('settings').insertOne({ _id: 'system_settings' as any, ...DEFAULT_SETTINGS });
      return NextResponse.json({ success: true, data: DEFAULT_SETTINGS });
    }

    const { _id, ...settings } = doc;
    return NextResponse.json({ success: true, data: { ...DEFAULT_SETTINGS, ...settings } });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to fetch settings' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const body = await req.json();
    const settings = body.settings || body;

    await db.collection('settings').updateOne(
      { _id: 'system_settings' as any },
      { $set: settings },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save settings' }, { status: 500 });
  }
}
