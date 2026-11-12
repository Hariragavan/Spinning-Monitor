import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { SystemSettings } from '@/types';

const DEFAULT_SETTINGS: SystemSettings = {
  autoUpdateEnabled: false,
  lastSyncDate: null,
  bestSiderOverrideId: null,
  tvInterval: 15,
  tvSubInterval: 5,
  machineSiderCounts: {},
  gaiterCounts: { I: 1, II: 1, III: 1 },
  tvPageIntervals: {},
  tvMonth: 0,
  tvYear: 0,
  tvShowBestSiderMonth: true,
  emHighLimit: 4,
  shed40sFormulas: {
    'Shed 1': '40s GPS = Actual GPS × Multiplication Factor',
    'Shed 2': '40s GPS = Actual GPS × Multiplication Factor',
    'Shed 3': '40s GPS = Actual GPS × Multiplication Factor',
    'KTTM': '40s GPS = (Actual GPS × Count) / 40',
  },
  iotMachineMapping: {},
  machineToMachineMapping: {},
  machinePairs: [],
  iotMachineMappingByDate: {},
  iotMachineAllocationPeriods: [],
};

export async function GET() {
  try {
    const db = await getDb();
    
    // Unset legacy WhatsApp phone numbers and Google Sheet URLs from settings document
    await db.collection('settings').updateOne(
      { _id: 'system_settings' as any },
      {
        $unset: {
          whatsAppProdPhone: '',
          whatsAppEmPhone: '',
          whatsAppIncentivePhone: '',
          googleSheetUrl: '',
          machineEmGoogleSheetUrl: '',
          lastMachineEmSyncDate: ''
        }
      }
    ).catch(() => {});

    let doc = await db.collection('settings').findOne({ _id: 'system_settings' as any });

    if (!doc) {
      await db.collection('settings').insertOne({ _id: 'system_settings' as any, ...DEFAULT_SETTINGS });
      return NextResponse.json({ success: true, data: DEFAULT_SETTINGS });
    }

    const { _id, ...settings } = doc;
    delete (settings as any).whatsAppProdPhone;
    delete (settings as any).whatsAppEmPhone;
    delete (settings as any).whatsAppIncentivePhone;
    delete (settings as any).googleSheetUrl;
    delete (settings as any).machineEmGoogleSheetUrl;
    delete (settings as any).lastMachineEmSyncDate;

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
    const { _id, ...cleanSettings } = settings;

    // Delete legacy unwanted fields from save payload
    delete cleanSettings.whatsAppProdPhone;
    delete cleanSettings.whatsAppEmPhone;
    delete cleanSettings.whatsAppIncentivePhone;
    delete cleanSettings.googleSheetUrl;
    delete cleanSettings.machineEmGoogleSheetUrl;
    delete cleanSettings.lastMachineEmSyncDate;

    // Ensure machineToMachineMapping and machinePairs are stored alongside iotMachineMapping
    const currentMapping = cleanSettings.iotMachineMapping || cleanSettings.machineToMachineMapping || {};
    cleanSettings.iotMachineMapping = currentMapping;
    cleanSettings.machineToMachineMapping = currentMapping;
    cleanSettings.machinePairs = Object.entries(currentMapping).map(([spinningFrame, iotMachine]) => ({
      spinningFrame,
      iotMachine
    }));

    await db.collection('settings').updateOne(
      { _id: 'system_settings' as any },
      { 
        $set: cleanSettings,
        $unset: {
          whatsAppProdPhone: '',
          whatsAppEmPhone: '',
          whatsAppIncentivePhone: '',
          googleSheetUrl: '',
          machineEmGoogleSheetUrl: '',
          lastMachineEmSyncDate: ''
        }
      },
      { upsert: true }
    );

    return NextResponse.json({ success: true, data: cleanSettings });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to save settings' }, { status: 500 });
  }
}
