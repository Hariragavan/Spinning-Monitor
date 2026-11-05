const { MongoClient } = require('../node_modules/mongodb');
const https = require('https');

function fetchJson(path, headers = {}) {
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'iot-machine-backend.onrender.com',
      path,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'X-Company-Slug': 'scm',
        ...headers
      },
      timeout: 10000
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

async function runMigration() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB at', uri);

    const targetDb = client.db('spinning_monitor');
    const sourceScm = client.db('iot_scm');
    const sourceMachine = client.db('iot_machine');

    // 1. Definition of all 23 IoT tables
    const iotTables = [
      'iot_devices',
      'iot_employees',
      'iot_employee_activities',
      'iot_employee_performances',
      'iot_machines',
      'iot_machine_mappings',
      'iot_machine_readings',
      'iot_machine_sessions',
      'iot_machine_status_events',
      'iot_machine_performances',
      'iot_maintenance_schedules',
      'iot_production_entries',
      'iot_shifts',
      'iot_commondatas',
      'iot_spinfo_lives',
      'iot_spinfo_hourlies',
      'iot_spinfo_shift_summaries',
      'iot_spinfo_daily_summaries',
      'iot_spinfo_histories',
      'iot_spinfo_records',
      'iot_telegram_configs',
      'iot_telegram_subscribers',
      'iot_em'
    ];

    console.log('\n--- Ensuring all IoT collections exist in spinning_monitor ---');
    const existingTargetCols = (await targetDb.listCollections().toArray()).map(c => c.name);
    for (const t of iotTables) {
      if (!existingTargetCols.includes(t)) {
        await targetDb.createCollection(t);
        console.log(`Created collection: ${t}`);
      } else {
        console.log(`Collection exists: ${t}`);
      }
    }

    // Helper to copy documents from source to target without duplicates
    async function copyCollection(srcDb, srcName, targetColName, keyField = '_id') {
      const srcCol = srcDb.collection(srcName);
      const targetCol = targetDb.collection(targetColName);
      const count = await srcCol.countDocuments();
      if (count === 0) return 0;

      const cursor = srcCol.find({});
      let inserted = 0;
      let skipped = 0;

      while (await cursor.hasNext()) {
        const doc = await cursor.next();
        const query = keyField === '_id' ? { _id: doc._id } : { [keyField]: doc[keyField] };
        const exists = await targetCol.findOne(query);
        if (!exists) {
          try {
            await targetCol.insertOne(doc);
            inserted++;
          } catch {
            skipped++;
          }
        } else {
          skipped++;
        }
      }
      console.log(`Copied from ${srcDb.databaseName}.${srcName} -> ${targetColName}: ${inserted} inserted, ${skipped} already existed (total source: ${count})`);
      return inserted;
    }

    console.log('\n--- Migrating IoT Data into spinning_monitor ---');

    // From iot_scm:
    await copyCollection(sourceScm, 'machinestatusevents', 'iot_machine_status_events');
    await copyCollection(sourceScm, 'spinfohistories', 'iot_spinfo_histories');
    await copyCollection(sourceScm, 'spinfohourlies', 'iot_spinfo_hourlies');
    await copyCollection(sourceScm, 'spinfoshiftsummaries', 'iot_spinfo_shift_summaries');
    await copyCollection(sourceScm, 'spinfodailysummaries', 'iot_spinfo_daily_summaries');
    await copyCollection(sourceScm, 'spinforecords', 'iot_spinfo_records');
    await copyCollection(sourceScm, 'spinfolives', 'iot_spinfo_lives');

    // From iot_machine:
    await copyCollection(sourceMachine, 'commondatas', 'iot_commondatas');
    await copyCollection(sourceMachine, 'employees', 'iot_employees', 'employeeId');
    await copyCollection(sourceMachine, 'devices', 'iot_devices', 'deviceId');
    await copyCollection(sourceMachine, 'machines', 'iot_machines', 'machineId');
    await copyCollection(sourceMachine, 'machinemappings', 'iot_machine_mappings', 'mappingId');
    await copyCollection(sourceMachine, 'shifts', 'iot_shifts', 'shiftId');
    await copyCollection(sourceMachine, 'productionentries', 'iot_production_entries', 'entryId');
    await copyCollection(sourceMachine, 'maintenanceschedules', 'iot_maintenance_schedules', 'maintenanceId');
    await copyCollection(sourceMachine, 'telegramconfigs', 'iot_telegram_configs');
    await copyCollection(sourceMachine, 'telegramsubscribers', 'iot_telegram_subscribers');

    // Fetch and sync Employee Activities from Remote API (Mangal, Sambari, etc.)
    console.log('\n--- Syncing Remote Employee Activities & Live Telemetry ---');
    const datesToSync = ['2026-11-03', '2026-11-04', '2026-11-05'];
    for (const d of datesToSync) {
      const resp = await fetchJson(`/api/dashboard/employee?date=${d}`);
      if (resp && resp.success && Array.isArray(resp.data) && resp.data.length > 0) {
        const actCol = targetDb.collection('iot_employee_activities');
        const perfCol = targetDb.collection('iot_employee_performances');

        for (const item of resp.data) {
          // Upsert employee performance summary
          await perfCol.updateOne(
            { employeeId: item.employeeId, machineId: item.machineId, date: item.date },
            { $set: { ...item, updatedAt: new Date() } },
            { upsert: true }
          );

          // Save taps as employee activities
          if (Array.isArray(item.taps)) {
            for (const tap of item.taps) {
              const actDoc = {
                employeeId: item.employeeId,
                employeeName: item.employeeName,
                machineId: item.machineId,
                date: item.date,
                tapNumber: tap.tapNumber,
                time: tap.time ? new Date(tap.time) : new Date(),
                deviceId: tap.deviceId,
                cardTap: tap.cardTap,
                gapMinutes: tap.gapMinutes,
                recordedAt: new Date()
              };
              await actCol.updateOne(
                { employeeId: item.employeeId, machineId: item.machineId, time: actDoc.time },
                { $set: actDoc },
                { upsert: true }
              );
            }
          }
        }
        console.log(`Synced ${resp.data.length} employee metrics and tap activities for ${d}`);
      }
    }

    // Initial seed for iot_em from latest remote common telemetry
    console.log('\n--- Initializing iot_em from Remote Telemetry ---');
    const commonResp = await fetchJson('/api/common?limit=1');
    if (commonResp && commonResp.data && commonResp.data[0]) {
      const item = commonResp.data[0];
      const shiftDate = item.shiftDate || (item.dataTime ? item.dataTime.slice(0, 10) : new Date().toISOString().slice(0, 10));
      const month = shiftDate.slice(0, 7);
      const shift = item.shift || 1;
      const hour = item.hourWiseProduction ? item.hourWiseProduction.length : 1;
      const emCol = targetDb.collection('iot_em');

      if (Array.isArray(item.machines)) {
        for (const m of item.machines) {
          const mNo = m.machine || m.machineId || 'RF01';
          const sideL = (m.sides || []).find(s => s.side === 'L');
          const sideR = (m.sides || []).find(s => s.side === 'R');
          const emLeft = Number(sideL?.endMendingTime || 0);
          const emRight = Number(sideR?.endMendingTime || 0);
          const emTotal = Number((emLeft + emRight).toFixed(2));
          const unit = sideL?.endMendingTimeUnit || sideR?.endMendingTimeUnit || 'min';
          const endBreakCountLeft = Number(sideL?.endBreakCount || 0);
          const endBreakCountRight = Number(sideR?.endBreakCount || 0);
          const totalEndBreaks = Number(m.totalEndBreakCount || (endBreakCountLeft + endBreakCountRight));

          const emDoc = {
            machineNo: mNo,
            date: shiftDate,
            month: month,
            shift: shift,
            hour: hour,
            hourLabel: `Hour ${hour}`,
            emLeft,
            emRight,
            emTotal,
            unit,
            endBreakCountLeft,
            endBreakCountRight,
            totalEndBreaks,
            isFinalized: false,
            updatedAt: new Date()
          };

          await emCol.updateOne(
            { machineNo: mNo, date: shiftDate, shift: shift, hour: hour },
            { $set: emDoc, $setOnInsert: { recordedAt: new Date() } },
            { upsert: true }
          );
        }
        console.log(`Initialized iot_em for ${item.machines.length} machines at ${shiftDate} Shift ${shift} Hour ${hour}`);
      }
    }

    // 2. Create optimized indexes on all key IoT collections
    console.log('\n--- Creating Indexes on IoT Collections ---');
    await targetDb.collection('iot_em').createIndex({ machineNo: 1, date: 1, shift: 1, hour: 1 }, { unique: true });
    await targetDb.collection('iot_em').createIndex({ date: 1, shift: 1 });
    await targetDb.collection('iot_em').createIndex({ month: 1, machineNo: 1 });

    await targetDb.collection('iot_spinfo_histories').createIndex({ shiftDate: 1, shift: 1, isShiftFinal: 1 });
    await targetDb.collection('iot_spinfo_histories').createIndex({ createdAt: -1 });

    await targetDb.collection('iot_machines').createIndex({ machineId: 1 }, { unique: true });
    await targetDb.collection('iot_devices').createIndex({ deviceId: 1 }, { unique: true });
    await targetDb.collection('iot_employees').createIndex({ employeeId: 1 }, { unique: true });
    await targetDb.collection('iot_shifts').createIndex({ shiftId: 1 }, { unique: true });
    await targetDb.collection('iot_machine_status_events').createIndex({ machineId: 1, occurredAt: -1 });
    await targetDb.collection('iot_employee_activities').createIndex({ employeeId: 1, time: -1 });

    console.log('All indexes created successfully.');

    // Final summary of document counts in spinning_monitor
    console.log('\n=== Final Collections in spinning_monitor ===');
    const finalCols = await targetDb.listCollections().toArray();
    for (const c of finalCols.sort((a,b) => a.name.localeCompare(b.name))) {
      const cnt = await targetDb.collection(c.name).countDocuments();
      const prefix = c.name.startsWith('iot_') ? '[IoT Table]' : '[Spinning Mill Table]';
      console.log(`  ${prefix.padEnd(23)} ${c.name.padEnd(30)} : ${cnt} docs`);
    }

    console.log('\n✓ Migration and seeding complete!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await client.close();
  }
}

runMigration();
