const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/scm-spinning';

const STANDARD_SHED_MACHINES = {
  'Shed 1': [
    { rfNo: 'SP009', count: '21/1-CW-SY', stdGps: 340, spindles: 1008 },
    { rfNo: 'SP010', count: '24/1-CH-SY', stdGps: 340, spindles: 1008 },
    { rfNo: 'SP011', count: '24/1-CH-SY', stdGps: 340, spindles: 1008 },
    { rfNo: 'SP012', count: '30/1--DY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP013', count: '30/1--DY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP014', count: '30/1--DY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP015', count: '32/1-CW-SY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP016', count: '32/1-CW-SY', stdGps: 330, spindles: 1008 },
    { rfNo: 'SP017', count: '40/1CHY', stdGps: 310, spindles: 1008 },
    { rfNo: 'SP018', count: '40/1CHY', stdGps: 310, spindles: 1008 },
    { rfNo: 'SP021', count: '030/1-PH-PC', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP022', count: '030/1-PH-PC', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP023', count: '040/1-PH-PC', stdGps: 310, spindles: 1200 },
    { rfNo: 'SP024', count: '040/1-PH-PC', stdGps: 310, spindles: 1200 },
    { rfNo: 'SP025', count: '34/1-PH-PV', stdGps: 330, spindles: 1200 },
    { rfNo: 'SP026', count: '34/1-PH-PV', stdGps: 330, spindles: 1200 },
    { rfNo: 'SP027', count: '042/1-CH-NY', stdGps: 305, spindles: 1200 },
    { rfNo: 'SP028', count: '042/1-CH-NY', stdGps: 305, spindles: 1200 },
    { rfNo: 'SP029', count: '038/1-CH-NY', stdGps: 320, spindles: 1200 },
    { rfNo: 'SP030', count: '034/1-PH-PC', stdGps: 330, spindles: 1200 }
  ],
  'Shed 2': [
    { rfNo: 'SP031', count: '32/1-CH-CY', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP032', count: '32/1-CH-CY', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP033', count: '32/1-CH-CY', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP034', count: '34/1CHY-OCY', stdGps: 330, spindles: 1200 },
    { rfNo: 'SP035', count: '34/1CHY-OCY', stdGps: 330, spindles: 1200 },
    { rfNo: 'SP036', count: '30/1CH', stdGps: 355, spindles: 1200 },
    { rfNo: 'SP037', count: '30/1CH', stdGps: 355, spindles: 1200 },
    { rfNo: 'SP038', count: '30/1CH', stdGps: 355, spindles: 1200 },
    { rfNo: 'SP039', count: '20/1-CW-WVG', stdGps: 375, spindles: 1200 },
    { rfNo: 'SP040', count: '20/1-CW-WVG', stdGps: 375, spindles: 1200 }
  ],
  'Shed 3': [
    { rfNo: 'SP041', count: '26/1-CHY', stdGps: 360, spindles: 1200 },
    { rfNo: 'SP042', count: '26/1-CHY', stdGps: 360, spindles: 1200 },
    { rfNo: 'SP043', count: '26/1-CHY', stdGps: 360, spindles: 1200 },
    { rfNo: 'SP044', count: '50s Compact', stdGps: 325, spindles: 1200 },
    { rfNo: 'SP045', count: '50s Compact', stdGps: 325, spindles: 1200 },
    { rfNo: 'SP046', count: '60s Super Combed', stdGps: 310, spindles: 1200 },
    { rfNo: 'SP047', count: '60s Super Combed', stdGps: 310, spindles: 1200 },
    { rfNo: 'SP048', count: '40s Micro Weft', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP049', count: '40s Micro Weft', stdGps: 340, spindles: 1200 },
    { rfNo: 'SP050', count: '40s Micro Weft', stdGps: 340, spindles: 1200 }
  ],
  'KTTM': [
    { rfNo: 'K01', count: '60s CW', stdGps: 310, spindles: 1200 },
    { rfNo: 'K02', count: '60s CW', stdGps: 310, spindles: 1200 },
    { rfNo: 'K03', count: '60s CW', stdGps: 310, spindles: 1200 },
    { rfNo: 'K04', count: '40s KTTM', stdGps: 345, spindles: 1200 },
    { rfNo: 'K05', count: '40s KTTM', stdGps: 345, spindles: 1200 },
    { rfNo: 'K06', count: '40s KTTM', stdGps: 345, spindles: 1200 },
    { rfNo: 'K07', count: '80s Compact', stdGps: 280, spindles: 1200 },
    { rfNo: 'K08', count: '80s Compact', stdGps: 280, spindles: 1200 },
    { rfNo: 'K09', count: '100s Dobby', stdGps: 250, spindles: 1200 },
    { rfNo: 'K10', count: '100s Dobby', stdGps: 250, spindles: 1200 }
  ]
};

async function syncAndRestoreMachines() {
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('scm-spinning');
  
  // 1. Fetch all reports to extract this month's uploaded machines by shed and date
  const reports = await db.collection('reports').find({}).toArray();
  const machineMap = new Map();

  reports.forEach(r => {
    const shed = r.shed || 'Shed 1';
    (r.entries || []).forEach(e => {
      const rf = (e.frameNo || '').trim().toUpperCase();
      if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return;
      const key = `${rf}__${shed.toLowerCase()}`;
      const existing = machineMap.get(key);
      machineMap.set(key, {
        id: `m-${rf.toLowerCase()}-${shed.toLowerCase().replace(/\s+/g, '-')}`,
        rfNo: rf,
        frameNo: rf,
        shed: shed,
        count: (e.count || '').trim() || existing?.count || '030/1-PH-PC',
        spindles: e.spindles || existing?.spindles || 1008,
        status: 'Active',
        description: `RING FRAME ${rf} (${shed})`
      });
    });

    (r.summaries || []).forEach(s => {
      const rf = (s.frameNo || '').trim().toUpperCase();
      if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return;
      const key = `${rf}__${shed.toLowerCase()}`;
      const existing = machineMap.get(key);
      machineMap.set(key, {
        id: `m-${rf.toLowerCase()}-${shed.toLowerCase().replace(/\s+/g, '-')}`,
        rfNo: rf,
        frameNo: rf,
        shed: shed,
        count: (s.count || '').trim() || existing?.count || '030/1-PH-PC',
        spindles: existing?.spindles || 1008,
        status: 'Active',
        description: `RING FRAME ${rf} (${shed})`
      });
    });
  });

  console.log('Extracted', machineMap.size, 'machines from uploaded reports');

  // 2. Also ensure standard machines for each shed exist
  for (const [shed, list] of Object.entries(STANDARD_SHED_MACHINES)) {
    for (const item of list) {
      const key = `${item.rfNo}__${shed.toLowerCase()}`;
      if (!machineMap.has(key)) {
        machineMap.set(key, {
          id: `m-${item.rfNo.toLowerCase()}-${shed.toLowerCase().replace(/\s+/g, '-')}`,
          rfNo: item.rfNo,
          frameNo: item.rfNo,
          shed: shed,
          count: item.count,
          stdGps: item.stdGps,
          spindles: item.spindles || 1200,
          status: 'Active',
          description: `RING FRAME ${item.rfNo} (${shed})`
        });
      }
    }
  }

  // 3. Upsert all into machines collection
  let upsertCount = 0;
  for (const machine of machineMap.values()) {
    await db.collection('machines').updateOne(
      { rfNo: machine.rfNo, shed: machine.shed },
      { $set: machine },
      { upsert: true }
    );
    upsertCount++;
  }

  console.log('Successfully upserted', upsertCount, 'machines into machines collection');

  const afterCount = await db.collection('machines').countDocuments();
  console.log('Total machines in collection now:', afterCount);

  const shedCounts = {};
  const allM = await db.collection('machines').find({}).toArray();
  allM.forEach(m => {
    shedCounts[m.shed] = (shedCounts[m.shed] || 0) + 1;
  });
  console.log('Machines per shed:', shedCounts);

  await client.close();
}

syncAndRestoreMachines().catch(console.error);
