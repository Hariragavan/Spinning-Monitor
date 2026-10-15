import { MongoClient } from 'mongodb';
import { createSampleReportForShed1_10102026, SAMPLE_DATE, SAMPLE_MACHINES, SAMPLE_WORKERS, SAMPLE_MACHINE_EM_10102026 } from '../lib/sampleSeedData';

async function seedLocal() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinning_monitor';
  console.log('Connecting to:', uri);
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    console.log('Connected to DB:', db.databaseName);

    const sampleReport = createSampleReportForShed1_10102026();
    console.log('Sample report entries count:', sampleReport.entries.length);

    // 1. Update reports collection
    await db.collection('reports').updateOne(
      { date: SAMPLE_DATE, shed: 'Shed 1' },
      { $set: { ...sampleReport, shed: 'Shed 1', timestamp: Date.now() } },
      { upsert: true }
    );
    console.log('Successfully updated reports collection for 10/10/2026');

    // 2. Update machine_em collection
    const existingEmDoc = await db.collection('machine_em').findOne({ _id: 'machine_em_data' as any });
    const mergedEm = { ...(existingEmDoc?.data || {}), [SAMPLE_DATE]: SAMPLE_MACHINE_EM_10102026 };
    await db.collection('machine_em').updateOne(
      { _id: 'machine_em_data' as any },
      { $set: { data: mergedEm } },
      { upsert: true }
    );
    console.log('Successfully updated machine_em collection for 10/10/2026');

    // 3. Upsert sample machines
    for (const machine of SAMPLE_MACHINES) {
      const rfNo = machine.rfNo || (machine as any).frameNo;
      await db.collection('machines').updateOne(
        { frameNo: rfNo },
        { $set: { ...machine, frameNo: rfNo, rfNo } },
        { upsert: true }
      );
    }
    console.log('Successfully upserted sample machines');

    // 4. Upsert sample workers
    for (const worker of SAMPLE_WORKERS) {
      await db.collection('workers').updateOne(
        { id: worker.id },
        { $set: worker },
        { upsert: true }
      );
    }
    console.log('Successfully upserted sample workers');

    // 5. Update dailyproductionlogs
    await db.collection('dailyproductionlogs').deleteMany({ date: SAMPLE_DATE, shed: 'Shed 1' });
    const prodLogs = sampleReport.entries.map((entry, idx) => ({
      logId: `LOG_${SAMPLE_DATE.replace(/[\/.-]/g, '')}_${entry.frameNo}_${entry.shift}_${idx}`,
      date: SAMPLE_DATE,
      shed: 'Shed 1',
      frameNo: entry.frameNo,
      shift: entry.shift,
      count: entry.count,
      productionTarget: entry.productionTarget || 0,
      productionActual: entry.productionActual || 0,
      gpsTarget: entry.gpsTarget || 0,
      gpsActual: entry.gpsActual || 0,
      efficiency: entry.efficiency || 0,
      utility: entry.utility || 0,
      siderId: entry.siderId || '',
      siderName: entry.siderName || '',
      incentiveAmount: entry.incentiveAmount || 0,
      timestamp: Date.now()
    }));
    await db.collection('dailyproductionlogs').insertMany(prodLogs);
    console.log('Successfully inserted dailyproductionlogs for 10/10/2026');

    // 6. Update shiftallocations
    await db.collection('shiftallocations').deleteMany({ date: SAMPLE_DATE, shed: 'Shed 1' });
    const shiftAllocations = sampleReport.entries.map(entry => ({
      allocationId: `ALLOC_${SAMPLE_DATE.replace(/[\/.-]/g, '')}_${entry.frameNo}_${entry.shift}`,
      date: SAMPLE_DATE,
      shed: 'Shed 1',
      frameNo: entry.frameNo,
      shift: entry.shift,
      siderId: entry.siderId || '',
      siderName: entry.siderName || '',
      timestamp: Date.now()
    }));
    await db.collection('shiftallocations').insertMany(shiftAllocations);
    console.log('Successfully inserted shiftallocations for 10/10/2026');

    console.log('ALL LOCAL SAMPLE DATA SEEDED SUCCESSFULLY FOR 10/10/2026!');
  } finally {
    await client.close();
  }
}

seedLocal().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
