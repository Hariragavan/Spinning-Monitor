import { MongoClient } from 'mongodb';

async function seedAllTables() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinning_monitor';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB:', uri);
    const db = client.db();

    // 1. MACHINES MASTER TABLE
    const machinesData = [
      {
        machineId: 'K01',
        frameNo: 'K01',
        unit: 'KTTM UNIT 01',
        spindles: 1200,
        model: 'KTTM RXI 240 Ring Spinning Frame',
        status: 'ACTIVE',
        defaultCount: '32/1-CH-CY',
        stdGps: 340,
        targetProductionKg: 1500,
        siderCapacity: 1,
        installationYear: 2021,
        maintenanceStatus: 'GOOD',
        createdAt: new Date()
      },
      {
        machineId: 'K02',
        frameNo: 'K02',
        unit: 'KTTM UNIT 01',
        spindles: 1200,
        model: 'KTTM RXI 240 Ring Spinning Frame',
        status: 'ACTIVE',
        defaultCount: '32/1-CH-CY',
        stdGps: 340,
        targetProductionKg: 1500,
        siderCapacity: 1,
        installationYear: 2021,
        maintenanceStatus: 'GOOD',
        createdAt: new Date()
      },
      {
        machineId: 'K03',
        frameNo: 'K03',
        unit: 'KTTM UNIT 01',
        spindles: 1200,
        model: 'KTTM RXI 240 Ring Spinning Frame',
        status: 'ACTIVE',
        defaultCount: '34/1CHY-OCY',
        stdGps: 330,
        targetProductionKg: 1480,
        siderCapacity: 1,
        installationYear: 2022,
        maintenanceStatus: 'EXCELLENT',
        createdAt: new Date()
      },
      {
        machineId: 'K04',
        frameNo: 'K04',
        unit: 'KTTM UNIT 01',
        spindles: 1200,
        model: 'KTTM RXI 240 Ring Spinning Frame',
        status: 'ACTIVE',
        defaultCount: '34/1CHY-OCY',
        stdGps: 330,
        targetProductionKg: 1480,
        siderCapacity: 1,
        installationYear: 2022,
        maintenanceStatus: 'GOOD',
        createdAt: new Date()
      },
      {
        machineId: 'K05',
        frameNo: 'K05',
        unit: 'KTTM UNIT 01',
        spindles: 1200,
        model: 'KTTM RXI 240 Ring Spinning Frame',
        status: 'ACTIVE',
        defaultCount: '30/1CH',
        stdGps: 355,
        targetProductionKg: 1550,
        siderCapacity: 1,
        installationYear: 2022,
        maintenanceStatus: 'GOOD',
        createdAt: new Date()
      },
      {
        machineId: 'K06',
        frameNo: 'K06',
        unit: 'KTTM UNIT 01',
        spindles: 1200,
        model: 'KTTM RXI 240 Ring Spinning Frame',
        status: 'ACTIVE',
        defaultCount: '20/1-CW-WVG',
        stdGps: 375,
        targetProductionKg: 1650,
        siderCapacity: 1,
        installationYear: 2023,
        maintenanceStatus: 'EXCELLENT',
        createdAt: new Date()
      }
    ];

    await db.collection('machines').deleteMany({});
    await db.collection('machines').insertMany(machinesData);
    await db.collection('machines').createIndex({ frameNo: 1 }, { unique: true });
    console.log(`✓ machines: inserted ${machinesData.length} records`);

    // 2. YARNCOUNTS MASTER TABLE
    const yarncountsData = [
      {
        countId: '32/1-CH-CY',
        count: '32/1-CH-CY',
        multiplicationFactor: 0.7155,
        description: '32/1 Comb Hosiery Compact Weft',
        stdGps: 340,
        blend: '100% Combed Cotton',
        tpi: 27.5,
        status: 'ACTIVE',
        createdAt: new Date()
      },
      {
        countId: '34/1CHY-OCY',
        count: '34/1CHY-OCY',
        multiplicationFactor: 0.7836,
        description: '34/1 Comb Hosiery Compact Compact',
        stdGps: 330,
        blend: '100% Organic Combed Cotton',
        tpi: 28.0,
        status: 'ACTIVE',
        createdAt: new Date()
      },
      {
        countId: '30/1CH',
        count: '30/1CH',
        multiplicationFactor: 0.6495,
        description: '30/1 Comb Hosiery',
        stdGps: 355,
        blend: '100% Carded/Combed Cotton',
        tpi: 26.0,
        status: 'ACTIVE',
        createdAt: new Date()
      },
      {
        countId: '20/1-CW-WVG',
        count: '20/1-CW-WVG',
        multiplicationFactor: 0.3536,
        description: '20/1 Carded Weft Weaving',
        stdGps: 375,
        blend: '100% Carded Weft Cotton',
        tpi: 22.0,
        status: 'ACTIVE',
        createdAt: new Date()
      },
      {
        countId: '40s',
        count: '40s',
        multiplicationFactor: 1.0,
        description: 'Default 40s Standard Count',
        stdGps: 310,
        blend: '100% Cotton Standard',
        tpi: 29.5,
        status: 'ACTIVE',
        createdAt: new Date()
      }
    ];

    await db.collection('yarncounts').deleteMany({});
    await db.collection('yarncounts').insertMany(yarncountsData);
    await db.collection('yarncounts').createIndex({ count: 1 }, { unique: true });
    console.log(`✓ yarncounts: inserted ${yarncountsData.length} records`);

    // 3. WORKERS MASTER TABLE
    const workersData = [
      { id: 'W101', name: 'K. Murugan', tNo: '101', department: 'Sider', phone: '+919944711571', shiftPreference: 'I', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W102', name: 'P. Selvam', tNo: '102', department: 'Sider', phone: '+919944711572', shiftPreference: 'I', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W103', name: 'M. Kumar', tNo: '103', department: 'Sider', phone: '+919944711573', shiftPreference: 'II', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W104', name: 'S. Rajesh', tNo: '104', department: 'Sider', phone: '+919944711574', shiftPreference: 'II', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W105', name: 'R. Vignesh', tNo: '105', department: 'Sider', phone: '+919944711575', shiftPreference: 'III', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W106', name: 'A. Saravanan', tNo: '106', department: 'Sider', phone: '+919944711576', shiftPreference: 'III', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W107', name: 'G. Kannan', tNo: '107', department: 'Sider', phone: '+919944711577', shiftPreference: 'I', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W108', name: 'V. Ramesh', tNo: '108', department: 'Sider', phone: '+919944711578', shiftPreference: 'II', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W109', name: 'K. Senthil', tNo: '109', department: 'Sider', phone: '+919944711579', shiftPreference: 'III', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W201', name: 'G. Manikandan', tNo: '201', department: 'Gaiter', phone: '+919944711581', shiftPreference: 'I', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W202', name: 'V. Senthil', tNo: '202', department: 'Gaiter', phone: '+919944711582', shiftPreference: 'II', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W203', name: 'D. Karthik', tNo: '203', department: 'Gaiter', phone: '+919944711583', shiftPreference: 'III', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W301', name: 'T. Ramasamy', tNo: '301', department: 'Fitter', phone: '+919944711591', shiftPreference: 'General', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W302', name: 'N. Sivakumar', tNo: '302', department: 'Fitter', phone: '+919944711592', shiftPreference: 'General', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W401', name: 'K. Anand', tNo: '401', department: 'AI Linkconer', phone: '+919944711595', shiftPreference: 'I', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W402', name: 'S. Prakash', tNo: '402', department: 'AI Linkconer', phone: '+919944711596', shiftPreference: 'II', status: 'ACTIVE', createdAt: new Date() },
      { id: 'W403', name: 'M. Suresh', tNo: '403', department: 'AI Linkconer', phone: '+919944711597', shiftPreference: 'III', status: 'ACTIVE', createdAt: new Date() }
    ];

    await db.collection('workers').deleteMany({});
    await db.collection('workers').insertMany(workersData);
    await db.collection('workers').createIndex({ id: 1 }, { unique: true });
    await db.collection('workers').createIndex({ tNo: 1 });
    console.log(`✓ workers: inserted ${workersData.length} records`);

    // 4. INCENTIVERULES MASTER TABLE
    const incentiverulesData = [
      {
        ruleId: 'RULE_40S_SIDER',
        count: '40s',
        department: 'Sider',
        effectiveDate: '01/01/2026',
        payouts: [
          { gpsThreshold: 185, amount: 60 },
          { gpsThreshold: 190, amount: 65 },
          { gpsThreshold: 195, amount: 70 },
          { gpsThreshold: 200, amount: 80 },
          { gpsThreshold: 205, amount: 85 },
          { gpsThreshold: 210, amount: 90 },
          { gpsThreshold: 220, amount: 95 },
          { gpsThreshold: 230, amount: 110 }
        ],
        createdAt: new Date()
      },
      {
        ruleId: 'RULE_301CH_SIDER',
        count: '30/1CH',
        department: 'Sider',
        effectiveDate: '01/01/2026',
        payouts: [
          { gpsThreshold: 310, amount: 60 },
          { gpsThreshold: 315, amount: 66 },
          { gpsThreshold: 318, amount: 68 },
          { gpsThreshold: 325, amount: 70 },
          { gpsThreshold: 335, amount: 80 },
          { gpsThreshold: 345, amount: 85 },
          { gpsThreshold: 355, amount: 90 },
          { gpsThreshold: 365, amount: 95 },
          { gpsThreshold: 375, amount: 100 },
          { gpsThreshold: 385, amount: 110 }
        ],
        createdAt: new Date()
      },
      {
        ruleId: 'RULE_321CH_SIDER',
        count: '32/1-CH-CY',
        department: 'Sider',
        effectiveDate: '01/01/2026',
        payouts: [
          { gpsThreshold: 310, amount: 60 },
          { gpsThreshold: 320, amount: 70 },
          { gpsThreshold: 330, amount: 80 },
          { gpsThreshold: 340, amount: 90 },
          { gpsThreshold: 350, amount: 100 },
          { gpsThreshold: 360, amount: 110 }
        ],
        createdAt: new Date()
      },
      {
        ruleId: 'RULE_341CH_SIDER',
        count: '34/1CHY-OCY',
        department: 'Sider',
        effectiveDate: '01/01/2026',
        payouts: [
          { gpsThreshold: 305, amount: 60 },
          { gpsThreshold: 315, amount: 70 },
          { gpsThreshold: 325, amount: 80 },
          { gpsThreshold: 335, amount: 90 },
          { gpsThreshold: 345, amount: 100 },
          { gpsThreshold: 355, amount: 110 }
        ],
        createdAt: new Date()
      },
      {
        ruleId: 'RULE_201CW_SIDER',
        count: '20/1-CW-WVG',
        department: 'Sider',
        effectiveDate: '01/01/2026',
        payouts: [
          { gpsThreshold: 310, amount: 60 },
          { gpsThreshold: 325, amount: 70 },
          { gpsThreshold: 345, amount: 85 },
          { gpsThreshold: 365, amount: 95 },
          { gpsThreshold: 385, amount: 110 }
        ],
        createdAt: new Date()
      },
      {
        ruleId: 'RULE_GAITER_ALL',
        count: 'All',
        department: 'Gaiter',
        effectiveDate: '01/01/2026',
        payouts: [
          { gpsThreshold: 300, amount: 50 },
          { gpsThreshold: 320, amount: 70 },
          { gpsThreshold: 340, amount: 90 }
        ],
        createdAt: new Date()
      }
    ];

    await db.collection('incentiverules').deleteMany({});
    await db.collection('incentiverules').insertMany(incentiverulesData);
    await db.collection('incentiverules').createIndex({ count: 1, department: 1 });
    console.log(`✓ incentiverules: inserted ${incentiverulesData.length} records`);

    // 5. USERS MASTER TABLE
    const usersData = [
      {
        userId: 'USR_001',
        username: 'admin',
        name: 'General Manager',
        role: 'ADMIN',
        accessLevel: 'FULL',
        email: 'gm@spinmonitor.local',
        phone: '+919944711575',
        status: 'ACTIVE',
        lastLogin: new Date(),
        createdAt: new Date()
      },
      {
        userId: 'USR_002',
        username: 'supervisor',
        name: 'Shift Incharge',
        role: 'SUPERVISOR',
        accessLevel: 'SHIFT_ALLOCATION',
        email: 'supervisor@spinmonitor.local',
        phone: '+919944711575',
        status: 'ACTIVE',
        lastLogin: new Date(),
        createdAt: new Date()
      },
      {
        userId: 'USR_003',
        username: 'maintenance',
        name: 'Spinning Master / Fitter Incharge',
        role: 'MAINTENANCE',
        accessLevel: 'MACHINE_STATUS',
        email: 'maintenance@spinmonitor.local',
        phone: '+919944711575',
        status: 'ACTIVE',
        lastLogin: new Date(),
        createdAt: new Date()
      }
    ];

    await db.collection('users').deleteMany({});
    await db.collection('users').insertMany(usersData);
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    console.log(`✓ users: inserted ${usersData.length} records`);

    // 6. POPULATE DAILYPRODUCTIONLOGS, MACHINEEMLOGS, SHIFTALLOCATIONS FROM REPORTS
    const reports = await db.collection('reports').find({}).toArray();
    console.log(`Processing ${reports.length} reports for logs extraction...`);

    const productionLogs = [];
    const machineEmLogs = [];
    const shiftAllocations = [];

    reports.forEach(report => {
      const date = report.date;
      if (!date) return;

      const entries = report.entries || [];
      entries.forEach((entry, idx) => {
        const logId = `LOG_${date.replace(/[\/.-]/g, '')}_${entry.frameNo}_${entry.shift}_${idx}`;
        const workerId = entry.siderIds?.[0] || entry.siderId || '';
        const workerName = entry.siderName || '';

        productionLogs.push({
          logId,
          date,
          frameNo: entry.frameNo,
          shift: entry.shift,
          count: entry.count,
          productionTarget: entry.productionTarget || 0,
          productionActual: entry.productionActual || 0,
          variance: (entry.productionActual || 0) - (entry.productionTarget || 0),
          gpsTarget: entry.gpsTarget || 0,
          gpsActual: entry.gpsActual || 0,
          gps40sCon: entry.gps40sCon || 0,
          efficiency: entry.efficiency || 0,
          utility: entry.utility || 0,
          doffEmt: entry.doffEmt || 0,
          naturalEmt: entry.naturalEmt || 0,
          assignedWorkerId: workerId,
          assignedWorkerName: workerName,
          incentiveEarned: entry.incentiveAmount || 0,
          status: 'COMPLETED',
          createdAt: new Date(report.timestamp || Date.now())
        });

        // Machine EM log
        const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;
        machineEmLogs.push({
          logId: `EM_${date.replace(/[\/.-]/g, '')}_${entry.frameNo}_${shiftNum}_${idx}`,
          date,
          frameNo: entry.frameNo,
          shift: shiftNum,
          emValue: entry.doffEmt || entry.naturalEmt || 0,
          doffEmt: entry.doffEmt || 0,
          naturalEmt: entry.naturalEmt || 0,
          idlePercent: entry.idlePercent || 0,
          slipPercent: entry.slipPercent || 0,
          isHighEm: (entry.doffEmt || 0) > 4,
          assignedSider: workerName,
          createdAt: new Date(report.timestamp || Date.now())
        });

        // Shift allocation log
        shiftAllocations.push({
          allocationId: `ALLOC_${date.replace(/[\/.-]/g, '')}_${entry.frameNo}_${entry.shift}_${idx}`,
          date,
          shift: entry.shift,
          frameNo: entry.frameNo,
          count: entry.count,
          siderIds: entry.siderIds || (entry.siderId ? [entry.siderId] : []),
          siderName: workerName,
          status: 'ALLOCATED',
          allocatedAt: new Date(report.timestamp || Date.now())
        });
      });
    });

    if (productionLogs.length > 0) {
      await db.collection('dailyproductionlogs').deleteMany({});
      await db.collection('dailyproductionlogs').insertMany(productionLogs);
      await db.collection('dailyproductionlogs').createIndex({ date: 1, frameNo: 1, shift: 1 });
      await db.collection('dailyproductionlogs').createIndex({ logId: 1 }, { unique: true });
      console.log(`✓ dailyproductionlogs: inserted ${productionLogs.length} records`);
    }

    if (machineEmLogs.length > 0) {
      await db.collection('machineemlogs').deleteMany({});
      await db.collection('machineemlogs').insertMany(machineEmLogs);
      await db.collection('machineemlogs').createIndex({ date: 1, frameNo: 1, shift: 1 });
      console.log(`✓ machineemlogs: inserted ${machineEmLogs.length} records`);
    }

    if (shiftAllocations.length > 0) {
      await db.collection('shiftallocations').deleteMany({});
      await db.collection('shiftallocations').insertMany(shiftAllocations);
      await db.collection('shiftallocations').createIndex({ date: 1, shift: 1, frameNo: 1 });
      console.log(`✓ shiftallocations: inserted ${shiftAllocations.length} records`);
    }

    // 7. MILLCALENDARS TABLE
    const months = [
      { key: '2026-04', year: 2026, month: 4, name: 'April', days: 30, targetKg: 270000, actualKg: 268400, avgEff: 96.8, avgGps: 345, isFrozen: false },
      { key: '2026-05', year: 2026, month: 5, name: 'May', days: 31, targetKg: 279000, actualKg: 276100, avgEff: 96.2, avgGps: 343, isFrozen: false },
      { key: '2026-06', year: 2026, month: 6, name: 'June', days: 30, targetKg: 270000, actualKg: 271500, avgEff: 97.1, avgGps: 346, isFrozen: false }
    ];

    const millCalendarsData = months.map(m => ({
      calendarId: `CAL_${m.year}_${String(m.month).padStart(2, '0')}`,
      monthKey: m.key,
      year: m.year,
      month: m.month,
      monthName: m.name,
      totalDays: m.days,
      targetProductionKg: m.targetKg,
      actualProductionKg: m.actualKg,
      avgEfficiency: m.avgEff,
      avgGps: m.avgGps,
      isFrozen: m.isFrozen,
      activeMachines: ['K01', 'K02', 'K03', 'K04', 'K05', 'K06'],
      unit: 'KTTM UNIT 01',
      createdAt: new Date()
    }));

    await db.collection('millcalendars').deleteMany({});
    await db.collection('millcalendars').insertMany(millCalendarsData);
    await db.collection('millcalendars').createIndex({ monthKey: 1 }, { unique: true });
    console.log(`✓ millcalendars: inserted ${millCalendarsData.length} records`);

    // Verify all collections in DB now
    const allCols = await db.listCollections().toArray();
    console.log('\nFINAL MONGODB COLLECTIONS LIST in spinning_monitor:');
    allCols.map(c => c.name).sort().forEach(name => console.log('  📁 ' + name));

    console.log('\n🎉 ALL COLLECTIONS SUCCESSFULLY SEEDED AND NORMALIZED!');
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await client.close();
  }
}

seedAllTables();
