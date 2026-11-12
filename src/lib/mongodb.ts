import { MongoClient, Db } from 'mongodb';
import { transferAndCleanupDatabase } from '@/lib/dbMigration';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/scm-spinning';
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
 * Strictly resolves to the primary cluster database (scm-spinning)
 * and prevents split databases between "test", "spinning_monitor", and "scm-spinning" on MongoDB Atlas.
 */
export function getTargetDbName(): string {
  // 1. Explicit DB_NAME override
  if (process.env.DB_NAME && process.env.DB_NAME.trim()) {
    return process.env.DB_NAME.trim();
  }

  // 2. Extract database name from connection URI
  try {
    const raw = (process.env.MONGODB_URI || process.env.IOT_MONGODB_URI || '').trim();
    if (raw) {
      const match = raw.match(/^mongodb(?:\+srv)?:\/\/[^\/]+\/([^?]+)/);
      if (match && match[1] && match[1].trim() && match[1].trim() !== 'test') {
        return decodeURIComponent(match[1].trim());
      }
      // If URI host contains scm-spinning or scm, use 'scm-spinning'
      if (raw.toLowerCase().includes('scm-spinning') || raw.toLowerCase().includes('scm')) {
        return 'scm-spinning';
      }
    }
  } catch {}

  // 3. Explicit IOT_DB_NAME if set and not generic test or spinning_monitor
  if (process.env.IOT_DB_NAME && process.env.IOT_DB_NAME.trim()) {
    const iotDb = process.env.IOT_DB_NAME.trim();
    if (iotDb !== 'test' && iotDb !== 'spinning_monitor') {
      return iotDb;
    }
  }

  // 4. Default to canonical Atlas database 'scm-spinning'
  return 'scm-spinning';
}

/**
 * All required canonical collections for both Spinning Monitor operations and IoT live telemetry.
 * Explicitly created so they always display properly in MongoDB Atlas.
 */
export const REQUIRED_COLLECTIONS: string[] = [
  // 1. Spinning Mill Collections (10)
  'workers',
  'machines',
  'count_conversions',
  'incentive_rules',
  'reports',
  'dailyproductionlogs',
  'settings',
  'frozen_months',
  'millcalendars',
  'users',

  // 2. IoT Telemetry Collections (8)
  'iot_shiftwise_data',
  'iot_devices',
  'iot_employees',
  'iot_maintenance_schedules',
  'iot_spinfo_lives',
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
      const missing = REQUIRED_COLLECTIONS.filter(c => !existingNames.has(c));

      // 1. Create missing collections explicitly (only if any are missing)
      if (missing.length > 0) {
        for (const colName of missing) {
          try {
            await db.createCollection(colName);
          } catch (createErr: any) {
            // Error code 48 is "NamespaceExists", which can safely be ignored on concurrent calls
            if (createErr.code !== 48) {
              console.warn(`[MongoDB Init] createCollection(${colName}) warning:`, createErr.message);
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
            db.collection('iot_em').createIndex({ date: 1, machineNo: 1, shift: 1 }),
            db.collection('iot_shiftwise_data').createIndex({ shiftDate: 1, shift: 1 }, { unique: true }),
            db.collection('iot_employees').createIndex({ employeeId: 1 }),
            db.collection('iot_devices').createIndex({ deviceId: 1 }),
            db.collection('iot_maintenance_schedules').createIndex({ machineId: 1, shiftDate: 1, shift: 1 }),
            db.collection('iot_employee_performances').createIndex({ shiftDate: 1, shift: 1, employeeId: 1 }),
            db.collection('iot_employee_activities').createIndex({ shiftDate: 1, shift: 1, employeeId: 1, tapTime: 1 })
          ]);
        } catch (idxErr: any) {
          console.warn('[MongoDB Init] Index creation warning:', idxErr.message);
        }
      }

      // 3. Ensure default system settings document exists
      if (!existingNames.has('settings') || missing.length > 0) {
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
      }

      // 4. Safe transfer from legacy/duplicate tables and Atlas cleanup
      try {
        await transferAndCleanupDatabase(db);
      } catch (cleanupErr) {
        console.warn('[MongoDB Init] Transfer and cleanup warning:', cleanupErr);
      }

      // 5. Unify split databases: If old 'spinning_monitor' database exists on this Atlas cluster,
      // copy any IoT documents into this canonical database (scm-spinning) so no data is stranded
      if (missing.length > 0 && db.databaseName !== 'spinning_monitor') {
        try {
          const connectedClient = await clientPromise;
          const oldDb = connectedClient.db('spinning_monitor');
          const oldCollections = ['iot_shiftwise_data', 'iot_spinfo_lives', 'iot_em', 'settings'];
          for (const cName of oldCollections) {
            const currentCount = await db.collection(cName).countDocuments();
            if (currentCount === 0) {
              const oldDocs = await oldDb.collection(cName).find({}).toArray();
              if (oldDocs.length > 0) {
                console.log(`[MongoDB Migration] Migrating ${oldDocs.length} documents from spinning_monitor.${cName} to ${db.databaseName}.${cName}`);
                await db.collection(cName).insertMany(oldDocs, { ordered: false }).catch(() => {});
              }
            }
          }
        } catch (_) {}
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
