import { Db, MongoClient } from 'mongodb';
import clientPromise, { getTargetDbName } from '@/lib/mongodb';
import { IncentiveRule, CountConversion, MachineMasterItem } from '@/types';

export interface OldDbMigrationSummary {
  success: boolean;
  sourceDatabasesFound: string[];
  targetDatabase: string;
  transferredCounts: Record<string, number>;
  cleanedOldData: Record<string, number>;
  details: string[];
  errors: string[];
  timestamp: string;
}

const COLLECTION_MAPPINGS: Record<string, string[]> = {
  'count_conversions': ['count_conversions', 'yarncounts', 'counts'],
  'incentive_rules': ['incentive_rules', 'incentiverules', 'rules', 'incentives'],
  'machines': ['machines', 'ring_frames', 'ringframes'],
  'workers': ['workers', 'siders', 'operators'],
  'reports': ['reports', 'daily_reports', 'dailyreports'],
  'dailyproductionlogs': ['dailyproductionlogs', 'production_logs'],
  'settings': ['settings', 'system_settings'],
  'millcalendars': ['millcalendars', 'calendars'],
  'frozen_months': ['frozen_months'],
  'users': ['users'],
  'iot_em': ['iot_em', 'machine_em', 'machin_em'],
  'iot_devices': ['iot_devices'],
  'iot_employees': ['iot_employees']
};

// Databases to strictly ignore as sources
const SYSTEM_DBS = new Set(['admin', 'config', 'local', 'canteen_db']);

// Old legacy dummy counts that were hardcoded seeds in early prototypes
const OBSOLETE_DUMMY_COUNTS = new Set([
  '030/1-ph-pc',
  '040/1-ph-pc',
  '34/1-ph-pv',
  '042/1-ch-ny',
  '038/1-ch-ny',
  '034/1-ph-pc',
  '40s'
]);

/**
 * Searches the MongoDB server for old databases (such as 'spinning_monitor', 'spinning', 'test')
 * and migrates all historical records (counts, incentive rules, machines, workers, reports, etc.)
 * into the current canonical database (scm-spinning).
 * 
 * Also:
 * - Purges old dummy hardcoded rules that conflict with active counts.
 * - Auto-generates standard incentive slab rules for all active counts running in the mill.
 * - Cleans duplicate bare-number machines ('9', '10', '11') and fixes machine sheds.
 */
export async function migrateFromOldDatabases(explicitTargetDb?: Db): Promise<OldDbMigrationSummary> {
  const summary: OldDbMigrationSummary = {
    success: true,
    sourceDatabasesFound: [],
    targetDatabase: '',
    transferredCounts: {},
    cleanedOldData: {},
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
      summary.details.push(`listDatabases restricted (${e?.message}); checking known candidate databases`);
      allDbs = ['spinning_monitor', 'spinning', 'test', 'scm_spinning', 'spinning_mill'];
    }

    // Filter candidate source databases: Must not be system DB or target DB
    const candidateDbNames = allDbs.filter(d => !SYSTEM_DBS.has(d) && d !== targetDbName);
    if (!candidateDbNames.includes('spinning_monitor') && targetDbName !== 'spinning_monitor') {
      candidateDbNames.push('spinning_monitor');
    }

    const validSourceDbs: { name: string; db: Db; docCount: number; colNames: Set<string> }[] = [];

    // 2. Inspect candidate databases for spinning records
    for (const srcName of candidateDbNames) {
      try {
        const srcDb = client.db(srcName);
        let totalDocs = 0;
        const cols = await srcDb.listCollections().toArray().catch(() => []);
        const colNames = new Set(cols.map(c => c.name));

        for (const [targetName, legacyNames] of Object.entries(COLLECTION_MAPPINGS)) {
          for (const lName of legacyNames) {
            if (colNames.has(lName)) {
              const count = await srcDb.collection(lName).countDocuments().catch(() => 0);
              totalDocs += count;
            }
          }
        }

        if (totalDocs > 0) {
          validSourceDbs.push({ name: srcName, db: srcDb, docCount: totalDocs, colNames });
          summary.sourceDatabasesFound.push(srcName);
        }
      } catch (_) {}
    }

    // Sort valid sources so the richest database runs first
    validSourceDbs.sort((a, b) => b.docCount - a.docCount);

    // 3. Migrate each mapped collection from valid source databases into targetDb
    for (const src of validSourceDbs) {
      summary.details.push(`Migrating data from source database '${src.name}' (~${src.docCount} records)...`);

      for (const [canonicalTargetCol, legacySourceAliases] of Object.entries(COLLECTION_MAPPINGS)) {
        try {
          const tgtCol = targetDb.collection(canonicalTargetCol);

          // Find which alias exists in source
          const matchingSrcColName = legacySourceAliases.find(a => src.colNames.has(a));
          if (!matchingSrcColName) continue;

          const srcCol = src.db.collection(matchingSrcColName);
          const srcCount = await srcCol.countDocuments().catch(() => 0);
          if (srcCount === 0) continue;

          // -------------------------------------------------------------
          // SPECIAL HANDLING: Settings document
          // -------------------------------------------------------------
          if (canonicalTargetCol === 'settings') {
            const oldSet = await srcCol.findOne({ _id: 'system_settings' as any }).catch(() => null);
            if (oldSet) {
              const curSet = await tgtCol.findOne({ _id: 'system_settings' as any }).catch(() => null);
              const { _id, ...cleanOld } = oldSet;
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
          // SPECIAL HANDLING: Count Conversions (yarncounts / count_conversions)
          // -------------------------------------------------------------
          if (canonicalTargetCol === 'count_conversions') {
            let countsTransferred = 0;
            const cursor = srcCol.find({});
            while (await cursor.hasNext()) {
              const doc = await cursor.next();
              if (!doc) continue;
              const rawCount = (doc.count || doc.yarnCount || '').trim();
              if (!rawCount || rawCount.toLowerCase() === 'all' || rawCount.toLowerCase() === '40s') continue;
              const shed = doc.shed || 'Shed 1';
              const normCount = rawCount.toLowerCase().replace(/[-/\s_]/g, '');

              const exists = await tgtCol.findOne({
                count: { $regex: new RegExp(`^${rawCount.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
                shed: { $in: [shed, 'All Sheds'] }
              });

              if (!exists) {
                const { _id, ...cleanDoc } = doc as any;
                await tgtCol.insertOne({
                  ...cleanDoc,
                  count: rawCount,
                  shed,
                  multiplicationFactor: Number(doc.multiplicationFactor || doc.factor || 1.0),
                  description: doc.description || `Migrated count ${rawCount}`
                });
                countsTransferred++;
              }
            }
            if (countsTransferred > 0) {
              summary.transferredCounts['count_conversions'] = (summary.transferredCounts['count_conversions'] || 0) + countsTransferred;
              summary.details.push(`Transferred ${countsTransferred} count conversions from '${src.name}.${matchingSrcColName}'`);
            }
            continue;
          }

          // -------------------------------------------------------------
          // SPECIAL HANDLING: Incentive Rules (incentiverules / incentive_rules)
          // -------------------------------------------------------------
          if (canonicalTargetCol === 'incentive_rules') {
            let rulesTransferred = 0;
            const cursor = srcCol.find({});
            while (await cursor.hasNext()) {
              const doc = await cursor.next();
              if (!doc) continue;
              const rawCount = (doc.count || '').trim();
              if (!rawCount) continue;
              const dept = doc.department || 'Sider';
              const shed = doc.shed || 'Shed 1';

              const exists = await tgtCol.findOne({
                count: { $regex: new RegExp(`^${rawCount.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
                department: dept,
                shed: { $in: [shed, 'All Sheds'] }
              });

              if (!exists && Array.isArray(doc.payouts) && doc.payouts.length > 0) {
                const { _id, ...cleanDoc } = doc as any;
                await tgtCol.insertOne({
                  ...cleanDoc,
                  count: rawCount,
                  department: dept,
                  shed,
                  payouts: doc.payouts
                });
                rulesTransferred++;
              }
            }
            if (rulesTransferred > 0) {
              summary.transferredCounts['incentive_rules'] = (summary.transferredCounts['incentive_rules'] || 0) + rulesTransferred;
              summary.details.push(`Transferred ${rulesTransferred} incentive rules from '${src.name}.${matchingSrcColName}'`);
            }
            continue;
          }

          // -------------------------------------------------------------
          // GENERAL COLLECTIONS (workers, machines, reports, etc.)
          // -------------------------------------------------------------
          let addedCount = 0;
          const cursor = srcCol.find({});

          while (await cursor.hasNext()) {
            const doc = await cursor.next();
            if (!doc) continue;

            let filter: any = { _id: doc._id };
            if (canonicalTargetCol === 'machines') {
              const fNo = String(doc.frameNo || doc.rfNo || doc.machineId || '').trim();
              if (!fNo || /^\d+$/.test(fNo)) continue; // Skip bare numeric machines (e.g. 9, 10, 11)
              filter = { $or: [{ frameNo: fNo }, { rfNo: fNo }, { machineId: fNo }] };
            } else if (canonicalTargetCol === 'workers') {
              if (doc.id) filter = { id: doc.id };
              else if (doc.tNo) filter = { tNo: doc.tNo };
            } else if (canonicalTargetCol === 'reports') {
              if (doc.date && doc.shed) filter = { date: doc.date, shed: doc.shed };
            }

            const exists = await tgtCol.findOne(filter);
            if (!exists) {
              const { _id, ...cleanDoc } = doc as any;
              await tgtCol.insertOne(cleanDoc).catch(() => {});
              addedCount++;
            }
          }

          if (addedCount > 0) {
            summary.transferredCounts[canonicalTargetCol] = (summary.transferredCounts[canonicalTargetCol] || 0) + addedCount;
            summary.details.push(`Added ${addedCount} missing documents for '${canonicalTargetCol}' from '${src.name}.${matchingSrcColName}'`);
          }
        } catch (colErr: any) {
          summary.errors.push(`Error migrating '${canonicalTargetCol}' from '${src.name}': ${colErr?.message}`);
        }
      }
    }

    // 4. CLEAN UP OBSOLETE HARDCODED DATA IN TARGET DATABASE
    try {
      // 4a. Remove bare numeric machine duplicates (e.g. '9', '10', '11') from target machines collection
      const deleteResult = await targetDb.collection('machines').deleteMany({
        $or: [
          { rfNo: { $in: ['9', '10', '11', '09', '010', '011'] } },
          { frameNo: { $in: ['9', '10', '11', '09', '010', '011'] } },
          { machineId: { $in: ['9', '10', '11', '09', '010', '011'] } },
          { id: { $in: ['m-9', 'm-10', 'm-11', 'm-9-shed-1', 'm-10-shed-1', 'm-11-shed-1'] } }
        ]
      });
      if (deleteResult.deletedCount > 0) {
        summary.cleanedOldData['duplicate_numeric_machines'] = deleteResult.deletedCount;
        summary.details.push(`Cleaned up ${deleteResult.deletedCount} bare numeric machine records (9, 10, 11) from machines collection`);
      }

      // 4b. Fix shed assignments for all machines in Machine Master:
      // SP001-SP024 -> Shed 1
      // SP025-SP044 (including SP028, SP039, SP040, SP041, SP042, SP043, SP044) -> Shed 2
      // SP045-SP056, SP023 -> Shed 3
      // K01-K06 -> KTTM
      const allTargetMachines = await targetDb.collection('machines').find({}).toArray();
      let machinesCorrected = 0;
      for (const m of allTargetMachines) {
        const fNo = String(m.rfNo || m.frameNo || m.machineId || '').trim().toUpperCase();
        if (!fNo) continue;
        let correctShed = m.shed || 'Shed 1';
        if (fNo.startsWith('K')) {
          correctShed = 'KTTM';
        } else if (fNo === 'SP023' || fNo === '23') {
          correctShed = 'Shed 3';
        } else {
          const numMatch = fNo.match(/\d+/);
          if (numMatch) {
            const num = parseInt(numMatch[0], 10);
            if (num >= 1 && num <= 24) correctShed = 'Shed 1';
            else if (num >= 25 && num <= 44) correctShed = 'Shed 2';
            else if (num >= 45) correctShed = 'Shed 3';
          }
        }

        if (m.shed !== correctShed) {
          await targetDb.collection('machines').updateOne(
            { _id: m._id },
            { $set: { shed: correctShed } }
          );
          machinesCorrected++;
        }
      }
      if (machinesCorrected > 0) {
        summary.cleanedOldData['corrected_machine_sheds'] = machinesCorrected;
        summary.details.push(`Corrected shed alignment for ${machinesCorrected} machines in Machine Master`);
      }

      // 4c. Delete obsolete legacy dummy rules that do not correspond to any active mill count
      const activeCounts = await targetDb.collection('count_conversions').find({}).toArray();
      const activeCountSet = new Set(activeCounts.map(c => (c.count || '').trim().toLowerCase()));

      const allRules = await targetDb.collection('incentive_rules').find({}).toArray();
      let obsoleteRulesDeleted = 0;
      for (const r of allRules) {
        const rCount = (r.count || '').trim().toLowerCase();
        // If it's one of the obsolete prototype seed rules AND is not in count conversions
        if (OBSOLETE_DUMMY_COUNTS.has(rCount) && !activeCountSet.has(rCount)) {
          await targetDb.collection('incentive_rules').deleteOne({ _id: r._id });
          obsoleteRulesDeleted++;
        }
      }
      if (obsoleteRulesDeleted > 0) {
        summary.cleanedOldData['obsolete_dummy_rules'] = obsoleteRulesDeleted;
        summary.details.push(`Deleted ${obsoleteRulesDeleted} obsolete dummy seed rules`);
      }

      // 4d. Auto-generate / ensure standard incentive slab rules for all active mill counts
      const standardCountSlabs: Record<string, { stdGps: number; step: number; maxPayout: number }> = {
        '21/1-CW-SY': { stdGps: 240, step: 10, maxPayout: 100 },
        '24/1-CH-SY': { stdGps: 225, step: 10, maxPayout: 100 },
        '20/1--SY': { stdGps: 260, step: 10, maxPayout: 100 },
        '30/1--DY': { stdGps: 190, step: 10, maxPayout: 100 },
        '32/1-CW-SY': { stdGps: 170, step: 10, maxPayout: 100 },
        '30/1-VH-CV': { stdGps: 200, step: 5, maxPayout: 100 },
        '34/1-VH-CV': { stdGps: 180, step: 5, maxPayout: 100 },
        '36/1-VH-CV': { stdGps: 170, step: 10, maxPayout: 100 },
        '40/1CHY': { stdGps: 140, step: 10, maxPayout: 100 },
        '32/1-CH-CY': { stdGps: 175, step: 10, maxPayout: 100 },
        '34/1CHY-OCY': { stdGps: 165, step: 10, maxPayout: 100 },
        '30/1CH': { stdGps: 200, step: 10, maxPayout: 100 },
        '20/1-CW-WVG': { stdGps: 260, step: 10, maxPayout: 100 },
        '26/1-CH-CY': { stdGps: 210, step: 10, maxPayout: 100 },
        '40/1-CHY-COM': { stdGps: 140, step: 10, maxPayout: 100 },
        '45/1-PW-PC': { stdGps: 130, step: 5, maxPayout: 100 },
        '60s CW': { stdGps: 110, step: 5, maxPayout: 110 }
      };

      let generatedRulesCount = 0;
      for (const countDoc of activeCounts) {
        const cName = (countDoc.count || '').trim();
        if (!cName || cName.toLowerCase() === 'all' || cName.toLowerCase() === '40s') continue;
        const cShed = countDoc.shed || 'Shed 1';

        const existingRule = await targetDb.collection('incentive_rules').findOne({
          count: { $regex: new RegExp(`^${cName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}$`, 'i') },
          department: 'Sider'
        });

        if (!existingRule) {
          const cfg = standardCountSlabs[cName] || { stdGps: 180, step: 10, maxPayout: 100 };
          const base = cfg.stdGps;
          const step = cfg.step;

          const payouts = [
            { gpsThreshold: base, amount: 100, fromGps: base, toGps: base, conditionText: `for GPS >= ${base}`, ruleText: `Rs 100 for GPS >= ${base}` },
            { gpsThreshold: base - step, amount: 90, fromGps: base - step, toGps: base, conditionText: `for GPS ${base - step} to ${base}`, ruleText: `Rs 90 for GPS ${base - step} to ${base}` },
            { gpsThreshold: base - (step * 2), amount: 80, fromGps: base - (step * 2), toGps: base - step, conditionText: `for GPS ${base - (step * 2)} to ${base - step}`, ruleText: `Rs 80 for GPS ${base - (step * 2)} to ${base - step}` },
            { gpsThreshold: base - (step * 3), amount: 70, fromGps: base - (step * 3), toGps: base - (step * 2), conditionText: `for GPS ${base - (step * 3)} to ${base - (step * 2)}`, ruleText: `Rs 70 for GPS ${base - (step * 3)} to ${base - (step * 2)}` },
            { gpsThreshold: base - (step * 4), amount: 60, fromGps: base - (step * 4), toGps: base - (step * 3), conditionText: `for GPS ${base - (step * 4)} to ${base - (step * 3)}`, ruleText: `Rs 60 for GPS ${base - (step * 4)} to ${base - (step * 3)}` },
            { gpsThreshold: base - (step * 5), amount: 50, fromGps: base - (step * 5), toGps: base - (step * 4), conditionText: `for GPS ${base - (step * 5)} to ${base - (step * 4)}`, ruleText: `Rs 50 for GPS ${base - (step * 5)} to ${base - (step * 4)}` }
          ];

          await targetDb.collection('incentive_rules').insertOne({
            count: cName,
            department: 'Sider',
            shed: cShed,
            effectiveDate: '01/01/2026',
            payouts,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          generatedRulesCount++;
        }
      }
      if (generatedRulesCount > 0) {
        summary.transferredCounts['generated_operational_rules'] = generatedRulesCount;
        summary.details.push(`Auto-generated standard incentive slab rules for ${generatedRulesCount} operational counts`);
      }

      // 4e. Ensure support role rules exist (AI Linkconer, Gaiter, Fitter)
      const supportRoles = [
        {
          count: 'All',
          department: 'AI Linkconer',
          shed: 'KTTM',
          effectiveDate: '01/01/2026',
          payouts: [
            { gpsThreshold: 96, amount: 110, fromGps: 96 },
            { gpsThreshold: 94, amount: 100, fromGps: 94 },
            { gpsThreshold: 92, amount: 90, fromGps: 92 },
            { gpsThreshold: 90, amount: 80, fromGps: 90 },
            { gpsThreshold: 88, amount: 70, fromGps: 88 },
            { gpsThreshold: 85, amount: 60, fromGps: 85 }
          ]
        },
        {
          count: 'All',
          department: 'Gaiter',
          shed: 'All Sheds',
          effectiveDate: '01/01/2026',
          payouts: [
            { gpsThreshold: 180, amount: 80, fromGps: 180 },
            { gpsThreshold: 160, amount: 60, fromGps: 160 },
            { gpsThreshold: 140, amount: 50, fromGps: 140 }
          ]
        },
        {
          count: 'All',
          department: 'Fitter',
          shed: 'All Sheds',
          effectiveDate: '01/01/2026',
          payouts: [
            { gpsThreshold: 340, amount: 100, fromGps: 340 },
            { gpsThreshold: 320, amount: 80, fromGps: 320 },
            { gpsThreshold: 300, amount: 60, fromGps: 300 }
          ]
        }
      ];

      for (const sr of supportRoles) {
        const hasSr = await targetDb.collection('incentive_rules').findOne({
          count: sr.count,
          department: sr.department
        });
        if (!hasSr) {
          await targetDb.collection('incentive_rules').insertOne({
            ...sr,
            createdAt: new Date()
          });
        }
      }
    } catch (cleanErr: any) {
      summary.errors.push(`Error during data cleanup and rule alignment: ${cleanErr?.message}`);
    }

    summary.details.push('Old database retrieval and migration completed successfully.');
    return summary;
  } catch (err: any) {
    summary.success = false;
    summary.errors.push(err?.message || 'Database migration failed');
    return summary;
  }
}
