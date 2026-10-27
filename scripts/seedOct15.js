import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinning_monitor';

async function seedOct15() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db();
    const date = '15/10/2026';

    const shedsConfig = [
      {
        shed: 'KTTM',
        rfCount: 6,
        std: 9143,
        achieved: 8919,
        counts: ['30s CW', '34s CW', '40s CW']
      },
      {
        shed: 'Shed 1',
        rfCount: 14,
        std: 8285,
        achieved: 7925,
        counts: ['40s CH', '40s CW', '60s CH']
      },
      {
        shed: 'Shed 2',
        rfCount: 14,
        std: 7682,
        achieved: 6809,
        counts: ['30s KD', '32s KD', '40s KD']
      },
      {
        shed: 'Shed 3',
        rfCount: 12,
        std: 5767,
        achieved: 5184,
        counts: ['P/C 45s', 'P/C 50s', 'P/C 60s']
      }
    ];

    for (const conf of shedsConfig) {
      const summaries = [];
      const entries = [];
      const targetPerRf = conf.std / conf.rfCount;
      const actualPerRf = conf.achieved / conf.rfCount;

      for (let i = 1; i <= conf.rfCount; i++) {
        const frameNo = conf.shed === 'KTTM' ? `K${i}` : conf.shed === 'Shed 1' ? `RF-${String(i).padStart(2, '0')}` : conf.shed === 'Shed 2' ? `S2-${String(i).padStart(2, '0')}` : `PC-${String(i).padStart(2, '0')}`;
        const count = conf.counts[(i - 1) % conf.counts.length];
        const rfTarget = Math.round(targetPerRf);
        const rfActual = Math.round(actualPerRf);
        const stdGps = conf.shed === 'KTTM' ? 95 : 82;
        const avgGps = Math.round(stdGps * (conf.achieved / conf.std));

        summaries.push({
          frameNo,
          count,
          shed: conf.shed,
          stdGps,
          targetProd: rfTarget,
          actualProd: rfActual,
          shiftGps: {
            I: avgGps + 1,
            II: avgGps,
            III: avgGps - 1
          },
          avgGps,
          shiftUtil: {
            I: 96,
            II: 95,
            III: 94
          },
          avgUtil: 95
        });

        // 3 shifts
        const shifts = ['I', 'II', 'III'];
        const shTarget = Math.round(rfTarget / 3);
        const shActual = Math.round(rfActual / 3);

        shifts.forEach((sh, shIdx) => {
          entries.push({
            frameNo,
            count,
            shift: sh,
            shed: conf.shed,
            productionTarget: shTarget,
            productionActual: shActual,
            gpsTarget: stdGps,
            gpsActual: avgGps + (shIdx === 0 ? 1 : shIdx === 1 ? 0 : -1),
            gps40sCon: Math.round(avgGps * 1.05),
            efficiency: Math.round((conf.achieved / conf.std) * 100),
            utility: 95,
            doffEmt: 2.1,
            naturalEmt: 0.8,
            idlePercent: 1.5,
            slipPercent: 0.6,
            siderId: `W${conf.shed === 'Shed 1' ? '1' : conf.shed === 'Shed 2' ? '2' : conf.shed === 'Shed 3' ? '3' : '4'}0${((i - 1) % 7) + 1}`,
            siderName: `Operator ${i}`
          });
        });
      }

      const reportDoc = {
        date,
        shed: conf.shed,
        totalProductionTarget: conf.std,
        totalProductionActual: conf.achieved,
        summaries,
        entries,
        gaiters: { I: ['W109'], II: ['W109'], III: ['W109'] },
        fitters: { I: ['W110'], II: ['W110'], III: ['W110'] },
        aiCones: { I: ['W108'], II: ['W108'], III: ['W108'] },
        timestamp: new Date('2026-10-15T12:00:00Z').getTime()
      };

      await db.collection('reports').updateOne(
        { date, shed: conf.shed },
        { $set: reportDoc },
        { upsert: true }
      );
      console.log(`✓ Seeded ${conf.shed} for ${date}: ${conf.rfCount} RF, STD: ${conf.std}, Achieved: ${conf.achieved}`);
    }

    console.log('✅ Oct 15 image report seeded successfully into MongoDB!');
  } catch (err) {
    console.error('Error seeding Oct 15:', err);
  } finally {
    await client.close();
  }
}

seedOct15();
