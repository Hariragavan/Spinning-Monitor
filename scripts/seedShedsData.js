import { MongoClient } from 'mongodb';

async function seedSheds() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinning_monitor';
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB for Sheds seeding:', uri);
    const db = client.db();

    // 1. Tag existing reports with Shed 1
    const tagRes = await db.collection('reports').updateMany(
      { $or: [{ shed: { $exists: false } }, { shed: null }] },
      { $set: { shed: 'Shed 1' } }
    );
    console.log(`Tagged ${tagRes.modifiedCount} existing reports with 'Shed 1'`);

    // 2. Insert / Upsert Machines for all 3 Sheds
    const machines = [
      // Shed 1: K01 - K06
      { machineId: 'K01', frameNo: 'K01', unit: 'KTTM UNIT 01 - Shed 1', shed: 'Shed 1', spindles: 1200, model: 'KTTM RXI 240', status: 'ACTIVE', defaultCount: '32/1-CH-CY', stdGps: 340, targetProductionKg: 1500, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K02', frameNo: 'K02', unit: 'KTTM UNIT 01 - Shed 1', shed: 'Shed 1', spindles: 1200, model: 'KTTM RXI 240', status: 'ACTIVE', defaultCount: '32/1-CH-CY', stdGps: 340, targetProductionKg: 1500, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K03', frameNo: 'K03', unit: 'KTTM UNIT 01 - Shed 1', shed: 'Shed 1', spindles: 1200, model: 'KTTM RXI 240', status: 'ACTIVE', defaultCount: '34/1CHY-OCY', stdGps: 330, targetProductionKg: 1480, maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { machineId: 'K04', frameNo: 'K04', unit: 'KTTM UNIT 01 - Shed 1', shed: 'Shed 1', spindles: 1200, model: 'KTTM RXI 240', status: 'ACTIVE', defaultCount: '34/1CHY-OCY', stdGps: 330, targetProductionKg: 1480, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K05', frameNo: 'K05', unit: 'KTTM UNIT 01 - Shed 1', shed: 'Shed 1', spindles: 1200, model: 'KTTM RXI 240', status: 'ACTIVE', defaultCount: '30/1CH', stdGps: 355, targetProductionKg: 1550, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K06', frameNo: 'K06', unit: 'KTTM UNIT 01 - Shed 1', shed: 'Shed 1', spindles: 1200, model: 'KTTM RXI 240', status: 'ACTIVE', defaultCount: '20/1-CW-WVG', stdGps: 375, targetProductionKg: 1650, maintenanceStatus: 'EXCELLENT', createdAt: new Date() },

      // Shed 2: K07 - K12
      { machineId: 'K07', frameNo: 'K07', unit: 'KTTM UNIT 02 - Shed 2', shed: 'Shed 2', spindles: 1200, model: 'LMW LR9/AX Frame', status: 'ACTIVE', defaultCount: '40s Combed', stdGps: 345, targetProductionKg: 1520, maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { machineId: 'K08', frameNo: 'K08', unit: 'KTTM UNIT 02 - Shed 2', shed: 'Shed 2', spindles: 1200, model: 'LMW LR9/AX Frame', status: 'ACTIVE', defaultCount: '40s Combed', stdGps: 345, targetProductionKg: 1520, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K09', frameNo: 'K09', unit: 'KTTM UNIT 02 - Shed 2', shed: 'Shed 2', spindles: 1200, model: 'LMW LR9/AX Frame', status: 'ACTIVE', defaultCount: '34/1 CH', stdGps: 335, targetProductionKg: 1490, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K10', frameNo: 'K10', unit: 'KTTM UNIT 02 - Shed 2', shed: 'Shed 2', spindles: 1200, model: 'LMW LR9/AX Frame', status: 'ACTIVE', defaultCount: '34/1 CH', stdGps: 335, targetProductionKg: 1490, maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { machineId: 'K11', frameNo: 'K11', unit: 'KTTM UNIT 02 - Shed 2', shed: 'Shed 2', spindles: 1200, model: 'LMW LR9/AX Frame', status: 'ACTIVE', defaultCount: '24/1 Carded', stdGps: 360, targetProductionKg: 1600, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K12', frameNo: 'K12', unit: 'KTTM UNIT 02 - Shed 2', shed: 'Shed 2', spindles: 1200, model: 'LMW LR9/AX Frame', status: 'ACTIVE', defaultCount: '24/1 Carded', stdGps: 360, targetProductionKg: 1600, maintenanceStatus: 'GOOD', createdAt: new Date() },

      // Shed 3: K13 - K18
      { machineId: 'K13', frameNo: 'K13', unit: 'KTTM UNIT 03 - Shed 3', shed: 'Shed 3', spindles: 1200, model: 'Rieter G35 Frame', status: 'ACTIVE', defaultCount: '60s Super Combed', stdGps: 310, targetProductionKg: 1350, maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { machineId: 'K14', frameNo: 'K14', unit: 'KTTM UNIT 03 - Shed 3', shed: 'Shed 3', spindles: 1200, model: 'Rieter G35 Frame', status: 'ACTIVE', defaultCount: '60s Super Combed', stdGps: 310, targetProductionKg: 1350, maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { machineId: 'K15', frameNo: 'K15', unit: 'KTTM UNIT 03 - Shed 3', shed: 'Shed 3', spindles: 1200, model: 'Rieter G35 Frame', status: 'ACTIVE', defaultCount: '50s Compact', stdGps: 325, targetProductionKg: 1420, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K16', frameNo: 'K16', unit: 'KTTM UNIT 03 - Shed 3', shed: 'Shed 3', spindles: 1200, model: 'Rieter G35 Frame', status: 'ACTIVE', defaultCount: '50s Compact', stdGps: 325, targetProductionKg: 1420, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K17', frameNo: 'K17', unit: 'KTTM UNIT 03 - Shed 3', shed: 'Shed 3', spindles: 1200, model: 'Rieter G35 Frame', status: 'ACTIVE', defaultCount: '40s Micro Weft', stdGps: 340, targetProductionKg: 1510, maintenanceStatus: 'GOOD', createdAt: new Date() },
      { machineId: 'K18', frameNo: 'K18', unit: 'KTTM UNIT 03 - Shed 3', shed: 'Shed 3', spindles: 1200, model: 'Rieter G35 Frame', status: 'ACTIVE', defaultCount: '40s Micro Weft', stdGps: 340, targetProductionKg: 1510, maintenanceStatus: 'EXCELLENT', createdAt: new Date() }
    ];

    for (const m of machines) {
      await db.collection('machines').updateOne(
        { frameNo: m.frameNo },
        { $set: m },
        { upsert: true }
      );
    }
    console.log(`✓ machines: upserted ${machines.length} records across Shed 1, Shed 2, Shed 3`);

    // 3. Create Shed 2 and Shed 3 reports for each existing date
    const shed1Reports = await db.collection('reports').find({ shed: 'Shed 1' }).toArray();
    console.log(`Found ${shed1Reports.length} Shed 1 reports. Generating corresponding Shed 2 and Shed 3 data...`);

    const shed2Machines = ['K07', 'K08', 'K09', 'K10', 'K11', 'K12'];
    const shed3Machines = ['K13', 'K14', 'K15', 'K16', 'K17', 'K18'];
    const shifts = ['I', 'II', 'III'];

    const shed2Workers = [
      { id: 'W201', name: 'P. Selvam', tNo: '102' },
      { id: 'W202', name: 'M. Kumar', tNo: '103' },
      { id: 'W203', name: 'S. Rajesh', tNo: '104' },
      { id: 'W204', name: 'V. Ramesh', tNo: '108' }
    ];

    const shed3Workers = [
      { id: 'W301', name: 'R. Vignesh', tNo: '105' },
      { id: 'W302', name: 'A. Saravanan', tNo: '106' },
      { id: 'W303', name: 'G. Kannan', tNo: '107' },
      { id: 'W304', name: 'K. Senthil', tNo: '109' }
    ];

    for (const s1 of shed1Reports) {
      const date = s1.date;
      if (!date) continue;

      // Build Shed 2 report
      const shed2Entries = [];
      const shed2Summaries = [];
      let s2TotalTarget = 0;
      let s2TotalActual = 0;

      shed2Machines.forEach((frameNo, fIdx) => {
        const count = fIdx < 2 ? '40s Combed' : fIdx < 4 ? '34/1 CH' : '24/1 Carded';
        const stdGps = fIdx < 2 ? 345 : fIdx < 4 ? 335 : 360;
        const targetProd = fIdx < 2 ? 1520 : fIdx < 4 ? 1490 : 1600;

        let frameActual = 0;
        const shiftGps = { I: 0, II: 0, III: 0 };
        const shiftUtil = { I: 0, II: 0, III: 0 };

        shifts.forEach((shift, sIdx) => {
          const w = shed2Workers[(fIdx + sIdx) % shed2Workers.length];
          const actual = Math.round(targetProd * (0.92 + (fIdx * 0.015) - (sIdx * 0.01)));
          const gps = Math.round(stdGps * (0.95 + (fIdx * 0.01)));
          const eff = Math.min(100, Math.round((actual / targetProd) * 100 * 10) / 10);
          const inc = eff >= 95 ? 100 : eff >= 90 ? 80 : 60;

          frameActual += actual;
          shiftGps[shift] = gps;
          shiftUtil[shift] = 95.5;

          shed2Entries.push({
            shift,
            frameNo,
            count,
            productionTarget: targetProd,
            productionActual: actual,
            gpsTarget: stdGps,
            gpsActual: gps,
            gps40sCon: Math.round(gps * 0.98),
            efficiency: eff,
            utility: 95.5,
            ue: 94.2,
            naturalEmt: 1.8,
            doffEmt: 2.1,
            idlePercent: 1.5,
            worstPercent: 0.8,
            slipPercent: 0.5,
            ukg: 3.2,
            restartBreaks: 1.2,
            incentiveAmount: inc,
            siderId: w.id,
            siderIds: [w.id],
            siderName: w.name,
            shed: 'Shed 2'
          });
        });

        s2TotalTarget += targetProd * 3;
        s2TotalActual += frameActual;

        shed2Summaries.push({
          frameNo,
          count,
          stdGps,
          targetProd: targetProd * 3,
          actualProd: frameActual,
          shiftGps,
          avgGps: Math.round((shiftGps.I + shiftGps.II + shiftGps.III) / 3),
          shiftUtil,
          avgUtil: 95.5,
          shiftNaturalEmt: { I: 1.8, II: 1.9, III: 1.7 },
          shiftRestartBreaks: { I: 1.2, II: 1.3, III: 1.1 },
          shiftDoffEmt: { I: 2.1, II: 2.2, III: 2.0 },
          shiftIdle: { I: 1.5, II: 1.6, III: 1.4 },
          shiftWorst: { I: 0.8, II: 0.9, III: 0.7 },
          shiftSlip: { I: 0.5, II: 0.5, III: 0.4 },
          shiftUkg: { I: 3.2, II: 3.2, III: 3.1 },
          shiftNoOfDoff: { I: 4, II: 4, III: 4 },
          shiftAvgDoffTime: { I: 12, II: 12, III: 12 },
          shiftNoOfStop: { I: 3, II: 4, III: 3 },
          shiftNormalStopMin: { I: 15, II: 18, III: 14 },
          shiftProductionKg: { I: Math.round(frameActual / 3), II: Math.round(frameActual / 3), III: Math.round(frameActual / 3) },
          shiftUtilizationPinter: { I: 95.5, II: 95.2, III: 95.8 },
          shed: 'Shed 2'
        });
      });

      const shed2Report = {
        date,
        shed: 'Shed 2',
        entries: shed2Entries,
        summaries: shed2Summaries,
        totalProductionTarget: s2TotalTarget,
        totalProductionActual: s2TotalActual,
        timestamp: (s1.timestamp || Date.now()) + 1000
      };

      await db.collection('reports').updateOne(
        { date, shed: 'Shed 2' },
        { $set: shed2Report },
        { upsert: true }
      );

      // Build Shed 3 report
      const shed3Entries = [];
      const shed3Summaries = [];
      let s3TotalTarget = 0;
      let s3TotalActual = 0;

      shed3Machines.forEach((frameNo, fIdx) => {
        const count = fIdx < 2 ? '60s Super Combed' : fIdx < 4 ? '50s Compact' : '40s Micro Weft';
        const stdGps = fIdx < 2 ? 310 : fIdx < 4 ? 325 : 340;
        const targetProd = fIdx < 2 ? 1350 : fIdx < 4 ? 1420 : 1510;

        let frameActual = 0;
        const shiftGps = { I: 0, II: 0, III: 0 };
        const shiftUtil = { I: 0, II: 0, III: 0 };

        shifts.forEach((shift, sIdx) => {
          const w = shed3Workers[(fIdx + sIdx) % shed3Workers.length];
          const actual = Math.round(targetProd * (0.91 + (fIdx * 0.02) - (sIdx * 0.015)));
          const gps = Math.round(stdGps * (0.94 + (fIdx * 0.012)));
          const eff = Math.min(100, Math.round((actual / targetProd) * 100 * 10) / 10);
          const inc = eff >= 95 ? 110 : eff >= 90 ? 90 : 70;

          frameActual += actual;
          shiftGps[shift] = gps;
          shiftUtil[shift] = 96.0;

          shed3Entries.push({
            shift,
            frameNo,
            count,
            productionTarget: targetProd,
            productionActual: actual,
            gpsTarget: stdGps,
            gpsActual: gps,
            gps40sCon: Math.round(gps * 1.05),
            efficiency: eff,
            utility: 96.0,
            ue: 95.0,
            naturalEmt: 1.5,
            doffEmt: 1.9,
            idlePercent: 1.2,
            worstPercent: 0.6,
            slipPercent: 0.4,
            ukg: 2.9,
            restartBreaks: 1.0,
            incentiveAmount: inc,
            siderId: w.id,
            siderIds: [w.id],
            siderName: w.name,
            shed: 'Shed 3'
          });
        });

        s3TotalTarget += targetProd * 3;
        s3TotalActual += frameActual;

        shed3Summaries.push({
          frameNo,
          count,
          stdGps,
          targetProd: targetProd * 3,
          actualProd: frameActual,
          shiftGps,
          avgGps: Math.round((shiftGps.I + shiftGps.II + shiftGps.III) / 3),
          shiftUtil,
          avgUtil: 96.0,
          shiftNaturalEmt: { I: 1.5, II: 1.6, III: 1.4 },
          shiftRestartBreaks: { I: 1.0, II: 1.1, III: 0.9 },
          shiftDoffEmt: { I: 1.9, II: 2.0, III: 1.8 },
          shiftIdle: { I: 1.2, II: 1.3, III: 1.1 },
          shiftWorst: { I: 0.6, II: 0.7, III: 0.5 },
          shiftSlip: { I: 0.4, II: 0.4, III: 0.3 },
          shiftUkg: { I: 2.9, II: 2.9, III: 2.8 },
          shiftNoOfDoff: { I: 3, II: 3, III: 3 },
          shiftAvgDoffTime: { I: 11, II: 11, III: 11 },
          shiftNoOfStop: { I: 2, II: 3, III: 2 },
          shiftNormalStopMin: { I: 12, II: 15, III: 11 },
          shiftProductionKg: { I: Math.round(frameActual / 3), II: Math.round(frameActual / 3), III: Math.round(frameActual / 3) },
          shiftUtilizationPinter: { I: 96.0, II: 95.8, III: 96.2 },
          shed: 'Shed 3'
        });
      });

      const shed3Report = {
        date,
        shed: 'Shed 3',
        entries: shed3Entries,
        summaries: shed3Summaries,
        totalProductionTarget: s3TotalTarget,
        totalProductionActual: s3TotalActual,
        timestamp: (s1.timestamp || Date.now()) + 2000
      };

      await db.collection('reports').updateOne(
        { date, shed: 'Shed 3' },
        { $set: shed3Report },
        { upsert: true }
      );
    }

    console.log('✓ reports: successfully seeded Shed 2 and Shed 3 across all dates');

    // 4. Update dailyproductionlogs, machineemlogs, shiftallocations for all sheds
    await db.collection('dailyproductionlogs').updateMany(
      { $or: [{ shed: { $exists: false } }, { shed: null }] },
      { $set: { shed: 'Shed 1' } }
    );
    await db.collection('machineemlogs').updateMany(
      { $or: [{ shed: { $exists: false } }, { shed: null }] },
      { $set: { shed: 'Shed 1' } }
    );
    await db.collection('shiftallocations').updateMany(
      { $or: [{ shed: { $exists: false } }, { shed: null }] },
      { $set: { shed: 'Shed 1' } }
    );

    const s1Count = await db.collection('reports').countDocuments({ shed: 'Shed 1' });
    const s2Count = await db.collection('reports').countDocuments({ shed: 'Shed 2' });
    const s3Count = await db.collection('reports').countDocuments({ shed: 'Shed 3' });
    console.log(`Summary - Reports: Shed 1: ${s1Count}, Shed 2: ${s2Count}, Shed 3: ${s3Count}`);

    await client.close();
    console.log('Seeding completed successfully!');
  } catch (err) {
    console.error('Seeding error:', err);
    process.exit(1);
  }
}

seedSheds();
