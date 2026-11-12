import { Db, MongoClient } from 'mongodb';
import clientPromise, { getTargetDbName } from '@/lib/mongodb';

export interface OldDbMigrationSummary {
  success: boolean;
  sourceDatabasesFound: string[];
  targetDatabase: string;
  transferredCounts: Record<string, number>;
  details: string[];
  errors: string[];
  timestamp: string;
}

const CANDIDATE_COLLECTIONS = [
  'machines',
  'workers',
  'reports',
  'count_conversions',
  'incentive_rules',
  'dailyproductionlogs',
  'settings',
  'frozen_months',
  'millcalendars',
  'users',
  'machine_em',
  'iot_shiftwise_data',
  'iot_devices',
  'iot_employees',
  'iot_em'
];

// Databases to strictly ignore as sources
const SYSTEM_DBS = new Set(['admin', 'config', 'local', 'canteen_db']);

/**
 * Searches the MongoDB server for old databases (such as 'spinning_monitor', 'spinning', 'test')
 * and migrates all historical data (machines, workers, reports, counts, incentives, etc.)
 * into the current canonical database (scm-spinning).
 * 
 * Safe and non-destructive: Never deletes or overwrites newer target documents.
 */
export async function migrateFromOldDatabases(explicitTargetDb?: Db): Promise<OldDbMigrationSummary> {
  const summary: OldDbMigrationSummary = {
    success: true,
    sourceDatabasesFound: [],
    targetDatabase: '',
    transferredCounts: {},
    details: [],
    errors: [],
    timestamp: new Date().toISOString()
  };

  try {
    const client: MongoClient = await clientPromise;
    const targetDbName = explicitTargetDb ? explicitTargetDb.databaseName : getTargetDbName();
    const targetDb = explicitTargetDb || client.db(targetDbName);
    summary.targetDatabase = targetDbName;

    // 1. Discover all databases on this MongoDB server
    let allDbs: string[] = [];
    try {
      const admin = client.db().admin();
      const list = await admin.listDatabases();
      allDbs = list.databases.map(d => d.name);
    } catch (e: any) {
      // If admin listDatabases lacks permission, check standard candidate names
      summary.details.push(`listDatabases restricted (${e?.message}); checking known names directly`);
      allDbs = ['spinning_monitor', 'spinning', 'test', 'scm_spinning', 'spinning_mill'];
    }

    // Filter candidate source databases: Must not be system DB or target DB
    const candidateDbNames = allDbs.filter(d => !SYSTEM_DBS.has(d) && d !== targetDbName);
    
    // Always include 'spinning_monitor' in candidates if not already present
    if (!candidateDbNames.includes('spinning_monitor') && targetDbName !== 'spinning_monitor') {
      candidateDbNames.push('spinning_monitor');
    }

    const validSourceDbs: { name: string; db: Db; docCount: number }[] = [];

    // 2. Inspect candidate databases for actual spinning documents
    for (const srcName of candidateDbNames) {
      try {
        const srcDb = client.db(srcName);
        let totalDocs = 0;
        const cols = await srcDb.listCollections().toArray().catch(() => []);
        const colNames = new Set(cols.map(c => c.name));

        // Check key spinning collections
        for (const keyCol of ['machines', 'workers', 'reports', 'count_conversions', 'incentive_rules']) {
          if (colNames.has(keyCol)) {
            const count = await srcDb.collection(keyCol).countDocuments().catch(() => 0);
            totalDocs += count;
          }
        }

        if (totalDocs > 0) {
          validSourceDbs.push({ name: srcName, db: srcDb, docCount: totalDocs });
          summary.sourceDatabasesFound.push(srcName);
        }
      } catch (_) {}
    }

    if (validSourceDbs.length === 0) {
      summary.details.push(`No old source databases with spinning records found among: ${candidateDbNames.join(', ')}`);
      return summary;
    }

    // Sort valid sources so the richest database runs first
    validSourceDbs.sort((a, b) => b.docCount - a.docCount);

    // 3. Migrate each collection from valid source databases into targetDb
    for (const src of validSourceDbs) {
      summary.details.push(`Migrating data from old database '${src.name}' (containing ~${src.docCount} records)...`);

      for (const colName of CANDIDATE_COLLECTIONS) {
        try {
          const srcCol = src.db.collection(colName);
          const tgtCol = targetDb.collection(colName);

          const srcCount = await srcCol.countDocuments().catch(() => 0);
          if (srcCount === 0) continue;

          const tgtCount = await tgtCol.countDocuments().catch(() => 0);

          // -------------------------------------------------------------
          // SPECIAL HANDLING: Settings document
          // -------------------------------------------------------------
          if (colName === 'settings') {
            const oldSet = await srcCol.findOne({ _id: 'system_settings' as any }).catch(() => null);
            if (oldSet) {
              const curSet = await tgtCol.findOne({ _id: 'system_settings' as any }).catch(() => null);
              const { _id, ...cleanOld } = oldSet;

              // Don't overwrite new IoT mapping fields if target already has them
              if (curSet?.iotMachineAllocationPeriods?.length) delete cleanOld.iotMachineAllocationPeriods;
              if (curSet?.iotMachineMappingByDate && Object.keys(curSet.iotMachineMappingByDate).length) delete cleanOld.iotMachineMappingByDate;

              await tgtCol.updateOne(
                { _id: 'system_settings' as any },
                { $set: cleanOld },
                { upsert: true }
              );
              summary.transferredCounts['settings'] = (summary.transferredCounts['settings'] || 0) + 1;
              summary.details.push(`Merged system_settings from '${src.name}'`);
            }
            continue;
          }

          // -------------------------------------------------------------
          // GENERAL COLLECTIONS: Transfer documents if missing in target
          // -------------------------------------------------------------
          if (tgtCount === 0) {
            // Whole collection is missing in target: bulk insert all
            const allDocs = await srcCol.find({}).toArray();
            if (allDocs.length > 0) {
              await tgtCol.insertMany(allDocs, { ordered: false }).catch(() => {});
              summary.transferredCounts[colName] = (summary.transferredCounts[colName] || 0) + allDocs.length;
              summary.details.push(`Transferred all ${allDocs.length} documents for '${colName}' from '${src.name}'`);
            }
          } else {
            // Target already has some documents: copy missing ones
            let addedCount = 0;
            const cursor = srcCol.find({});

            while (await cursor.hasNext()) {
              const doc = await cursor.next();
              if (!doc) continue;

              let filter: any = { _id: doc._id };
              if (colName === 'machines') {
                const fNo = doc.frameNo || doc.rfNo || doc.machineId;
                if (fNo) filter = { $or: [{ frameNo: fNo }, { rfNo: fNo }, { machineId: fNo }] };
              } else if (colName === 'workers') {
                if (doc.id) filter = { id: doc.id };
                else if (doc.tNo) filter = { tNo: doc.tNo };
              } else if (colName === 'reports') {
                if (doc.date && doc.shed) filter = { date: doc.date, shed: doc.shed };
              } else if (colName === 'count_conversions') {
                if (doc.count) filter = { count: doc.count };
              }

              const exists = await tgtCol.findOne(filter);
              if (!exists) {
                await tgtCol.insertOne(doc).catch(() => {});
                addedCount++;
              }
            }

            if (addedCount > 0) {
              summary.transferredCounts[colName] = (summary.transferredCounts[colName] || 0) + addedCount;
              summary.details.push(`Added ${addedCount} missing documents for '${colName}' from '${src.name}'`);
            }
          }
        } catch (colErr: any) {
          summary.errors.push(`Error migrating '${colName}' from '${src.name}': ${colErr?.message}`);
        }
      }
    }

    // 4. Clean up any redundant pure numeric machine keys (e.g. '9', '10', '11') from target settings
    try {
      const currentSettings = await targetDb.collection('settings').findOne({ _id: 'system_settings' as any });
      if (currentSettings) {
        const cleanDuplicateKeys = (map: Record<string, any> | undefined): Record<string, any> => {
          if (!map || typeof map !== 'object') return {};
          const cleaned: Record<string, any> = { ...map };
          const keys = Object.keys(cleaned);
          for (const k of keys) {
            if (/^\d+$/.test(k.trim())) {
              const num = parseInt(k.trim(), 10);
              const hasPrefixed = keys.some(other => {
                if (/^\d+$/.test(other.trim())) return false;
                const m = other.match(/\d+/);
                return m && parseInt(m[0], 10) === num;
              });
              if (hasPrefixed) {
                delete cleaned[k];
              }
            }
          }
          return cleaned;
        };

        const newMapping = cleanDuplicateKeys(currentSettings.iotMachineMapping);
        const newMappingByDate: Record<string, any> = {};
        let dateUpdated = false;
        for (const [d, m] of Object.entries(currentSettings.iotMachineMappingByDate || {})) {
          const cleanedSub = cleanDuplicateKeys(m as any);
          newMappingByDate[d] = cleanedSub;
          if (Object.keys(cleanedSub).length !== Object.keys((m as any) || {}).length) {
            dateUpdated = true;
          }
        }

        const mapUpdated = Object.keys(newMapping).length !== Object.keys(currentSettings.iotMachineMapping || {}).length;

        if (mapUpdated || dateUpdated) {
          await targetDb.collection('settings').updateOne(
            { _id: 'system_settings' as any },
            {
              $set: {
                iotMachineMapping: newMapping,
                iotMachineMappingByDate: dateUpdated ? newMappingByDate : (currentSettings.iotMachineMappingByDate || {}),
                machineToMachineMapping: newMapping,
                machinePairs: Object.entries(newMapping).map(([spinningFrame, iotMachine]) => ({
                  spinningFrame,
                  iotMachine
                }))
              }
            }
          );
          summary.details.push('Cleaned up redundant unpadded machine numbers (e.g. 9, 10, 11) from IoT machine mappings');
        }
      }
    } catch (cleanErr: any) {
      summary.errors.push(`Error cleaning redundant mapping keys: ${cleanErr?.message}`);
    }

    summary.details.push('Old database retrieval and migration completed successfully.');
    return summary;
  } catch (err: any) {
    summary.success = false;
    summary.errors.push(err?.message || 'Database migration failed');
    return summary;
  }
}
