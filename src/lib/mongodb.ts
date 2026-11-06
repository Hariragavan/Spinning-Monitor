import { MongoClient, Db } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinning_monitor';
const options = {};

let client: MongoClient;
let clientPromise: Promise<MongoClient>;

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri, options);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  client = new MongoClient(uri, options);
  clientPromise = client.connect();
}

/**
 * Returns the canonical database name.
 * Prevents split databases between "test" and "spinning_monitor" on MongoDB Atlas.
 */
export function getTargetDbName(): string {
  if (process.env.DB_NAME && process.env.DB_NAME.trim()) {
    return process.env.DB_NAME.trim();
  }

  try {
    const raw = (process.env.MONGODB_URI || '').trim();
    if (raw) {
      const match = raw.match(/^mongodb(?:\+srv)?:\/\/[^\/]+\/([^?]+)/);
      if (match && match[1] && match[1] !== 'test') {
        return decodeURIComponent(match[1].trim());
      }
    }
  } catch {}

  if (process.env.IOT_DB_NAME && process.env.IOT_DB_NAME.trim()) {
    return process.env.IOT_DB_NAME.trim();
  }

  return 'spinning_monitor';
}

/**
 * All required collections for both Spinning Monitor operations and IoT live telemetry.
 * Explicitly created so they always display properly in MongoDB Atlas.
 */
export const REQUIRED_COLLECTIONS: string[] = [
  // 1. Spinning Mill Collections
  'workers',
  'machines',
  'yarncounts',
  'count_conversions',
  'incentiverules',
  'incentive_rules',
  'reports',
  'dailyproductionlogs',
  'machineemlogs',
  'shiftallocations',
  'settings',
  'machine_em',
  'frozen_months',
  'millcalendars',
  'users',

  // 2. IoT Telemetry Collections
  'iot_commondatas',
  'iot_machines',
  'iot_employees',
  'iot_devices',
  'iot_shifts',
  'iot_machine_mappings',
  'iot_production_entries',
  'iot_maintenance_schedules',
  'iot_spinfo_lives',
  'iot_spinfo_histories',
  'iot_machine_status_events',
  'iot_employee_activities',
  'iot_employee_performances',
  'iot_em'
];

let isInitialized = false;
let initPromise: Promise<void> | null = null;

/**
 * Checks and creates all required collections and indexes if they do not exist in MongoDB Atlas.
 * Also ensures default configuration documents exist.
 */
export async function ensureDatabaseInitialized(db: Db): Promise<void> {
  if (isInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const existing = await db.listCollections().toArray();
      const existingNames = new Set(existing.map(c => c.name));

      // 1. Create missing collections explicitly
      for (const colName of REQUIRED_COLLECTIONS) {
        if (!existingNames.has(colName)) {
          try {
            await db.createCollection(colName);
          } catch (createErr: any) {
            // Error code 48 is "NamespaceExists", which can safely be ignored on concurrent calls
            if (createErr.code !== 48) {
              console.warn(`[MongoDB Init] createCollection(${colName}) warning:`, createErr.message);
            }
          }
        }
      }

      // 2. Ensure indexes for query speed and data integrity
      try {
        await Promise.allSettled([
          db.collection('reports').createIndex({ date: 1, shed: 1 }),
          db.collection('workers').createIndex({ id: 1 }),
          db.collection('workers').createIndex({ tNo: 1 }),
          db.collection('machines').createIndex({ frameNo: 1 }),
          db.collection('count_conversions').createIndex({ count: 1 }),
          db.collection('incentive_rules').createIndex({ count: 1, shed: 1, department: 1 }),
          db.collection('iot_em').createIndex({ date: 1, machineNo: 1, shift: 1, hour: 1 }),
          db.collection('iot_spinfo_histories').createIndex({ shiftDate: 1, shift: 1, recordedAt: -1 }),
          db.collection('iot_machines').createIndex({ machineNo: 1 })
        ]);
      } catch (idxErr: any) {
        console.warn('[MongoDB Init] Index creation warning:', idxErr.message);
      }

      // 3. Ensure default system settings document exists
      const settingsDoc = await db.collection('settings').findOne({ _id: 'system_settings' as any });
      if (!settingsDoc) {
        await db.collection('settings').insertOne({
          _id: 'system_settings' as any,
          googleSheetUrl: '',
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
          machineEmGoogleSheetUrl: '',
          lastMachineEmSyncDate: null,
          emHighLimit: 4,
          shed40sFormulas: {
            'Shed 1': '40s GPS = Actual GPS × Multiplication Factor',
            'Shed 2': '40s GPS = Actual GPS × Multiplication Factor',
            'Shed 3': '40s GPS = Actual GPS × Multiplication Factor',
            'KTTM': '40s GPS = (Actual GPS × Count) / 40'
          },
          iotMachineMapping: {},
          iotMachineMappingByDate: {},
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }

      // 4. Ensure default machine_em document exists
      const emDoc = await db.collection('machine_em').findOne({ _id: 'machine_em_data' as any });
      if (!emDoc) {
        await db.collection('machine_em').insertOne({
          _id: 'machine_em_data' as any,
          data: {},
          updatedAt: new Date()
        });
      }

      isInitialized = true;
    } catch (err) {
      console.error('[MongoDB Init] Error ensuring database initialization:', err);
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

/**
 * Returns database instance for Spinning Monitor operations.
 * Guaranteed to point to the canonical database and ensure all collections exist.
 */
export async function getDb(): Promise<Db> {
  const connectedClient = await clientPromise;
  const db = connectedClient.db(getTargetDbName());
  await ensureDatabaseInitialized(db);
  return db;
}

/**
 * Returns database instance for IoT telemetry.
 * Targets the exact same database so data is unified and synchronized.
 */
export async function getIotDb(): Promise<Db> {
  const connectedClient = await clientPromise;
  const db = connectedClient.db(getTargetDbName());
  await ensureDatabaseInitialized(db);
  return db;
}

export default clientPromise;
