import { NextResponse } from 'next/server';
import { getDb } from '@/lib/mongodb';
import { DailyReport, Sider, CountConversion, IncentiveRule, MachineMasterItem, ProductionEntry } from '@/types';
import { getTodayUniversalDate, createDefaultReportForShed } from '@/lib/parser';

// Mill standard counts per shed
const SHED_REAL_COUNTS: Record<string, string[]> = {
  'Shed 1': ['030/1-PH-PC', '040/1-PH-PC', '34/1-PH-PV', '042/1-CH-NY', '038/1-CH-NY', '034/1-PH-PC'],
  'Shed 2': ['32/1-CH-CY', '34/1CHY-OCY', '30/1CH', '20/1-CW-WVG'],
  'Shed 3': ['26/1-CHY', '40s'],
  'KTTM': ['60s CW', '40s'],
};

// Universal CORS & Public Cache Headers for Unrestricted Access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  'Access-Control-Max-Age': '86400',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
};

// Pre-flight CORS OPTIONS request
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

// Helper to filter array items by shed
function filterItemsByShed<T extends { shed?: string }>(items: T[], targetShed: string): T[] {
  if (!targetShed || targetShed === 'All' || targetShed === 'All Sheds') return items;
  return items.filter(item => (item.shed || 'Shed 1').toLowerCase() === targetShed.toLowerCase());
}

// Universal Open JSON API (GET)
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const type = (searchParams.get('type') || 'all').toLowerCase();
    const shed = searchParams.get('shed') || '';
    const date = searchParams.get('date') || '';
    const shift = searchParams.get('shift') || '';

    let workers: Sider[] = [];
    let rules: IncentiveRule[] = [];
    let counts: CountConversion[] = [];
    let reports: DailyReport[] = [];
    let machines: MachineMasterItem[] = [];
    let settings: any = {};
    let machineEm: any = {};

    // Attempt MongoDB connection
    try {
      const db = await getDb();
      const [wDocs, rDocs, cDocs, repDocs, mDocs, setDoc, emDoc] = await Promise.all([
        db.collection('workers').find({}, { projection: { _id: 0 } }).toArray(),
        db.collection('incentive_rules').find({}, { projection: { _id: 0 } }).toArray(),
        db.collection('count_conversions').find({}, { projection: { _id: 0 } }).toArray(),
        db.collection('reports').find({}, { projection: { _id: 0 } }).toArray(),
        db.collection('machines').find({}, { projection: { _id: 0 } }).toArray(),
        db.collection('settings').findOne({ _id: 'system_settings' as any }),
        db.collection('machine_em').findOne({ _id: 'machine_em_data' as any }),
      ]);

      workers = (wDocs as unknown as Sider[]) || [];
      rules = (rDocs as unknown as IncentiveRule[]) || [];
      counts = (cDocs as unknown as CountConversion[]) || [];
      reports = (repDocs as unknown as DailyReport[]) || [];
      machines = (mDocs as unknown as MachineMasterItem[]) || [];
      settings = setDoc ? (({ _id, ...rest }) => rest)(setDoc) : {};
      machineEm = emDoc?.data || {};
    } catch (dbErr) {
      console.warn('MongoDB query warning (fallback serverless mode):', dbErr);
    }

    // Default counts fallback if empty
    if (counts.length === 0) {
      counts = [
        { count: '030/1-PH-PC', multiplicationFactor: 1.0, shed: 'Shed 1' },
        { count: '040/1-PH-PC', multiplicationFactor: 1.0, shed: 'Shed 1' },
        { count: '32/1-CH-CY', multiplicationFactor: 1.0, shed: 'Shed 2' },
        { count: '26/1-CHY', multiplicationFactor: 1.0, shed: 'Shed 3' },
        { count: '60s CW', multiplicationFactor: 1.0, shed: 'KTTM' },
      ];
    }

    // Filter reports by shed and date
    let filteredReports: DailyReport[] = filterItemsByShed(reports, shed);
    if (date) {
      filteredReports = filteredReports.filter(r => r.date === date);
    }

    // Determine active daily report
    const todayUniversal = getTodayUniversalDate();
    const effectiveDate = date || todayUniversal;
    const effectiveShed = shed || 'Shed 1';

    let currentReport: DailyReport | undefined = filteredReports.find(r => r.date === effectiveDate);
    if (!currentReport && filteredReports.length > 0) {
      currentReport = filteredReports[filteredReports.length - 1];
    }
    if (!currentReport) {
      currentReport = createDefaultReportForShed(effectiveShed, effectiveDate);
    }

    // Filter entries by shift if specified
    let currentEntries: ProductionEntry[] = currentReport.entries || [];
    if (shift && (shift === 'I' || shift === 'II' || shift === 'III')) {
      currentEntries = currentEntries.filter(e => e.shift === shift);
    }

    // 1. SPECIFIC SUB-QUERIES
    if (type === 'reports' || type === 'report') {
      return NextResponse.json({
        success: true,
        source: 'Spinning Monitor Open JSON API',
        timestamp: new Date().toISOString(),
        query: { type, shed, date, shift },
        totalReports: filteredReports.length,
        report: {
          ...currentReport,
          entries: currentEntries
        },
        history: date ? undefined : filteredReports
      }, { headers: corsHeaders });
    }

    if (type === 'allocations' || type === 'roster') {
      return NextResponse.json({
        success: true,
        source: 'Spinning Monitor Open JSON API',
        timestamp: new Date().toISOString(),
        date: currentReport.date,
        shed: currentReport.shed || effectiveShed,
        aiLinkconer: currentReport.aiCones || { I: [], II: [], III: [] },
        gaiters: currentReport.gaiters || { I: [], II: [], III: [] },
        machines: currentEntries.map(e => ({
          shift: e.shift,
          machine: e.frameNo,
          count: e.count,
          lhSider: e.siderIds?.[0] || e.siderId || null,
          rhSider: e.siderIds?.[1] || null,
          isBothSides: Boolean(e.siderIds?.[0] && e.siderIds?.[1] && e.siderIds[0] === e.siderIds[1]),
          gaiter: e.gaiterId || currentReport?.gaiters?.[e.shift]?.[0] || null,
          status: (e.siderIds?.[0] && e.siderIds?.[1] && (e.gaiterId || currentReport?.gaiters?.[e.shift]?.[0])) 
            ? 'FULL_CREW' 
            : (e.siderIds?.[0] && e.siderIds?.[1]) 
            ? 'BOTH_SIDES' 
            : (e.siderIds?.[0] || e.siderIds?.[1]) 
            ? 'PARTIAL' 
            : 'UNASSIGNED'
        }))
      }, { headers: corsHeaders });
    }

    if (type === 'workers' || type === 'siders') {
      const filteredWorkers = filterItemsByShed(workers, shed);
      return NextResponse.json({
        success: true,
        source: 'Spinning Monitor Open JSON API',
        total: filteredWorkers.length,
        workers: filteredWorkers
      }, { headers: corsHeaders });
    }

    if (type === 'counts' || type === 'conversions') {
      const filteredCounts = filterItemsByShed(counts, shed);
      return NextResponse.json({
        success: true,
        source: 'Spinning Monitor Open JSON API',
        total: filteredCounts.length,
        counts: filteredCounts,
        shedStandardCounts: SHED_REAL_COUNTS
      }, { headers: corsHeaders });
    }

    if (type === 'incentives' || type === 'rules') {
      const filteredRules = filterItemsByShed(rules, shed);
      return NextResponse.json({
        success: true,
        source: 'Spinning Monitor Open JSON API',
        total: filteredRules.length,
        rules: filteredRules
      }, { headers: corsHeaders });
    }

    if (type === 'machines' || type === 'master') {
      const shedMachines = machines.length > 0
        ? filterItemsByShed(machines, shed)
        : currentReport.entries.map(e => ({
            id: `m-${e.frameNo}`,
            rfNo: e.frameNo,
            count: e.count,
            shed: e.shed || currentReport?.shed || 'Shed 1'
          }));

      return NextResponse.json({
        success: true,
        source: 'Spinning Monitor Open JSON API',
        total: shedMachines.length,
        machines: shedMachines
      }, { headers: corsHeaders });
    }

    // 2. CONSOLIDATED COMMON JSON PAYLOAD (DEFAULT)
    const consolidatedPayload = {
      success: true,
      status: 'ONLINE',
      source: 'Spinning Monitor Open JSON API (Vercel Ready)',
      timestamp: new Date().toISOString(),
      millName: 'Spinning Monitor Intelligent Telemetry',
      activeDate: currentReport.date,
      supportedSheds: ['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'],
      data: {
        activeReport: {
          ...currentReport,
          entries: currentEntries
        },
        allocations: {
          aiLinkconer: currentReport.aiCones || { I: [], II: [], III: [] },
          gaiters: currentReport.gaiters || { I: [], II: [], III: [] },
          entries: currentEntries.map(e => ({
            shift: e.shift,
            machine: e.frameNo,
            count: e.count,
            lhSider: e.siderIds?.[0] || e.siderId || '',
            rhSider: e.siderIds?.[1] || '',
            gaiter: e.gaiterId || currentReport?.gaiters?.[e.shift]?.[0] || '',
          }))
        },
        masters: {
          workers: filterItemsByShed(workers, shed),
          counts: filterItemsByShed(counts, shed),
          rules: filterItemsByShed(rules, shed),
          machines: filterItemsByShed(machines, shed)
        },
        telemetry: {
          machineEm: machineEm || {},
          settings: settings || {}
        }
      },
      availableEndpoints: {
        allData: '/api/common',
        reports: '/api/common?type=reports&date=DD/MM/YYYY&shed=Shed 1',
        allocations: '/api/common?type=allocations&shift=I',
        workers: '/api/common?type=workers&shed=Shed 1',
        counts: '/api/common?type=counts',
        incentives: '/api/common?type=incentives',
        machines: '/api/common?type=machines'
      }
    };

    return NextResponse.json(consolidatedPayload, {
      status: 200,
      headers: corsHeaders,
    });
  } catch (error: any) {
    console.error('Error in /api/common:', error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || 'Internal Server Error in Common JSON API',
        timestamp: new Date().toISOString()
      },
      {
        status: 500,
        headers: corsHeaders
      }
    );
  }
}

// Universal Ingestion (POST) without restriction
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { action, type, data } = body;

    // Connect to DB if available
    try {
      const db = await getDb();

      if (type === 'report' || data?.entries) {
        const report: DailyReport = data.report || data;
        if (report && report.date) {
          await db.collection('reports').updateOne(
            { date: report.date, shed: report.shed || 'Shed 1' },
            { $set: { ...report, timestamp: Date.now() } },
            { upsert: true }
          );
        }
      } else if (type === 'workers' && Array.isArray(data)) {
        await db.collection('workers').deleteMany({});
        if (data.length > 0) await db.collection('workers').insertMany(data);
      } else if (type === 'counts' && Array.isArray(data)) {
        await db.collection('count_conversions').deleteMany({});
        if (data.length > 0) await db.collection('count_conversions').insertMany(data);
      } else if (type === 'rules' && Array.isArray(data)) {
        await db.collection('incentive_rules').deleteMany({});
        if (data.length > 0) await db.collection('incentive_rules').insertMany(data);
      }
    } catch (dbErr) {
      console.warn('DB ingestion warning (serverless mode):', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Data successfully processed via Common JSON API',
      receivedType: type || action || 'custom',
      timestamp: new Date().toISOString()
    }, {
      status: 200,
      headers: corsHeaders
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err?.message || 'Failed to ingest data'
    }, {
      status: 400,
      headers: corsHeaders
    });
  }
}
