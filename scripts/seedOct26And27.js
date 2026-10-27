import { MongoClient } from 'mongodb';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017/spinning_monitor';

async function seedData() {
  const client = new MongoClient(uri);

  try {
    await client.connect();
    console.log('Connected to MongoDB at', uri);
    const db = client.db();

    // =========================================================================
    // 1. WORKERS MASTER (10 workers for each of the 4 sheds = 40 workers total)
    // =========================================================================
    const workersData = [
      // Shed 1 Workers (10)
      { id: 'W101', name: 'K. Murugan', tNo: '101', department: 'Sider', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W102', name: 'P. Selvam', tNo: '102', department: 'Sider', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W103', name: 'M. Kumar', tNo: '103', department: 'Sider', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W104', name: 'S. Rajesh', tNo: '104', department: 'Sider', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W105', name: 'R. Vignesh', tNo: '105', department: 'Sider', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W106', name: 'A. Saravanan', tNo: '106', department: 'Sider', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W107', name: 'G. Kannan', tNo: '107', department: 'Sider', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W108', name: 'V. Ramesh', tNo: '108', department: 'AI Linkconer', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W109', name: 'G. Manikandan', tNo: '109', department: 'Gaiter', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },
      { id: 'W110', name: 'T. Ramasamy', tNo: '110', department: 'Fitter', shed: 'Shed 1', status: 'ACTIVE', photoUrl: '' },

      // Shed 2 Workers (10)
      { id: 'W201', name: 'D. Karthik', tNo: '201', department: 'Sider', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W202', name: 'S. Palanisamy', tNo: '202', department: 'Sider', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W203', name: 'N. Velusamy', tNo: '203', department: 'Sider', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W204', name: 'C. Arumugam', tNo: '204', department: 'Sider', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W205', name: 'M. Marimuthu', tNo: '205', department: 'Sider', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W206', name: 'K. Balasubramani', tNo: '206', department: 'Sider', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W207', name: 'R. Natarajan', tNo: '207', department: 'Sider', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W208', name: 'P. Thangaraj', tNo: '208', department: 'AI Linkconer', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W209', name: 'V. Senthil', tNo: '209', department: 'Gaiter', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },
      { id: 'W210', name: 'N. Sivakumar', tNo: '210', department: 'Fitter', shed: 'Shed 2', status: 'ACTIVE', photoUrl: '' },

      // Shed 3 Workers (10)
      { id: 'W301', name: 'S. Mohanraj', tNo: '301', department: 'Sider', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W302', name: 'E. Boopathi', tNo: '302', department: 'Sider', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W303', name: 'M. Vijayakumar', tNo: '303', department: 'Sider', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W304', name: 'K. Duraisamy', tNo: '304', department: 'Sider', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W305', name: 'A. Nagaraj', tNo: '305', department: 'Sider', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W306', name: 'J. Shanmugam', tNo: '306', department: 'Sider', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W307', name: 'T. Govindasamy', tNo: '307', department: 'Sider', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W308', name: 'B. Prabhakaran', tNo: '308', department: 'AI Linkconer', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W309', name: 'S. Anandhakumar', tNo: '309', department: 'Gaiter', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },
      { id: 'W310', name: 'M. Muthusamy', tNo: '310', department: 'Fitter', shed: 'Shed 3', status: 'ACTIVE', photoUrl: '' },

      // KTTM Workers (10)
      { id: 'W401', name: 'K. Anand', tNo: '401', department: 'Sider', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W402', name: 'S. Prakash', tNo: '402', department: 'Sider', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W403', name: 'M. Suresh', tNo: '403', department: 'Sider', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W404', name: 'R. Dhanasekaran', tNo: '404', department: 'Sider', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W405', name: 'P. Vetrivel', tNo: '405', department: 'Sider', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W406', name: 'K. Sathishkumar', tNo: '406', department: 'Sider', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W407', name: 'A. Dinesh', tNo: '407', department: 'Sider', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W408', name: 'G. Prasanth', tNo: '408', department: 'Fitter', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W409', name: 'K. Loganathan', tNo: '409', department: 'Gaiter', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
      { id: 'W410', name: 'R. Chandrasekar', tNo: '410', department: 'AI Linkconer', shed: 'KTTM', status: 'ACTIVE', photoUrl: '' },
    ];

    // Replace workers collection with exactly 40 workers (10 per shed)
    await db.collection('workers').deleteMany({});
    await db.collection('workers').insertMany(workersData);
    console.log(`✓ Inserted exactly ${workersData.length} workers (10 workers each for Shed 1, Shed 2, Shed 3, KTTM)`);

    // =========================================================================
    // 2. YARN COUNTS & CONVERSIONS MASTER
    // =========================================================================
    const countsData = [
      // Shed 1 Counts
      { count: '030/1-PH-PC', multiplicationFactor: 0.539, description: '30/1 Poly Hosiery PC Yarn', shed: 'Shed 1', stdGps: 340, blend: '65/35 Poly Cotton', tpi: 26.5 },
      { count: '040/1-PH-PC', multiplicationFactor: 0.803, description: '40/1 Poly Hosiery PC Yarn', shed: 'Shed 1', stdGps: 310, blend: '65/35 Poly Cotton', tpi: 29.5 },
      { count: '34/1-PH-PV', multiplicationFactor: 0.540, description: '34/1 Poly Viscose Yarn', shed: 'Shed 1', stdGps: 330, blend: '65/35 Poly Viscose', tpi: 28.0 },
      { count: '042/1-CH-NY', multiplicationFactor: 0.7235, description: '42/1 Comb Hosiery NY', shed: 'Shed 1', stdGps: 305, blend: '100% Combed Cotton', tpi: 30.5 },
      { count: '038/1-CH-NY', multiplicationFactor: 0.6641, description: '38/1 Comb Hosiery NY', shed: 'Shed 1', stdGps: 320, blend: '100% Combed Cotton', tpi: 29.0 },
      { count: '034/1-PH-PC', multiplicationFactor: 0.540, description: 'Auto-imported count (034/1-PH-PC)', shed: 'Shed 1', stdGps: 330, blend: '65/35 Poly Cotton', tpi: 28.0 },

      // Shed 2 Counts
      { count: '32/1-CH-CY', multiplicationFactor: 0.7155, description: '32/1 Comb Hosiery Compact Weft', shed: 'Shed 2', stdGps: 340, blend: '100% Combed Cotton', tpi: 27.5 },
      { count: '34/1CHY-OCY', multiplicationFactor: 0.7836, description: '34/1 Comb Hosiery Compact Compact', shed: 'Shed 2', stdGps: 330, blend: '100% Organic Combed', tpi: 28.0 },
      { count: '30/1CH', multiplicationFactor: 0.6495, description: '30/1 Comb Hosiery', shed: 'Shed 2', stdGps: 355, blend: '100% Carded/Combed', tpi: 26.0 },
      { count: '20/1-CW-WVG', multiplicationFactor: 0.3536, description: '20/1 Carded Weft Weaving', shed: 'Shed 2', stdGps: 375, blend: '100% Carded Weft Cotton', tpi: 22.0 },

      // Shed 3 Counts
      { count: '26/1-CHY', multiplicationFactor: 0.520, description: '26/1 Comb Hosiery Yarn', shed: 'Shed 3', stdGps: 360, blend: '100% Combed Cotton', tpi: 24.5 },
      { count: '50s Compact', multiplicationFactor: 1.150, description: '50s Combed Compact Yarn', shed: 'Shed 3', stdGps: 325, blend: '100% Extra Long Staple', tpi: 32.0 },
      { count: '60s Super Combed', multiplicationFactor: 1.320, description: '60s Super Combed Warp', shed: 'Shed 3', stdGps: 310, blend: '100% Giza Cotton', tpi: 34.0 },
      { count: '40s Micro Weft', multiplicationFactor: 1.000, description: '40s Micro Weft Yarn', shed: 'Shed 3', stdGps: 340, blend: '100% Combed Cotton', tpi: 29.5 },
      { count: '40s', multiplicationFactor: 1.000, description: 'Default 40s Standard Count', shed: 'All Sheds', stdGps: 340, blend: '100% Cotton Standard', tpi: 29.5 },

      // KTTM Counts
      { count: '60s CW', multiplicationFactor: 1.300, description: '60s Combed Weft KTTM', shed: 'KTTM', stdGps: 310, blend: '100% Supima Cotton', tpi: 33.5 },
      { count: '40s KTTM', multiplicationFactor: 1.000, description: '40s KTTM High Speed Standard', shed: 'KTTM', stdGps: 345, blend: '100% Combed Cotton', tpi: 29.5 },
      { count: '80s Compact', multiplicationFactor: 1.650, description: '80s Ultra Compact Yarn', shed: 'KTTM', stdGps: 280, blend: '100% Premium Cotton', tpi: 38.0 },
      { count: '100s Dobby', multiplicationFactor: 2.100, description: '100s High Twist Dobby Yarn', shed: 'KTTM', stdGps: 250, blend: '100% Egyptian Cotton', tpi: 42.0 },
    ];

    for (const c of countsData) {
      await db.collection('yarncounts').updateOne(
        { count: c.count },
        { $set: { ...c, status: 'ACTIVE', createdAt: new Date() } },
        { upsert: true }
      );
      await db.collection('count_conversions').updateOne(
        { count: c.count, shed: c.shed },
        { $set: { ...c } },
        { upsert: true }
      );
    }
    console.log(`✓ Upserted ${countsData.length} yarn counts & conversions`);

    // =========================================================================
    // 2.1 INCENTIVE RULES (AI Linkconer & Fitter)
    // =========================================================================
    const extraRules = [
      {
        ruleId: 'RULE_AI_LINKCONER_ALL',
        count: 'All',
        department: 'AI Linkconer',
        effectiveDate: '01/01/2026',
        shed: 'All Sheds',
        payouts: [
          { gpsThreshold: 85, amount: 60 },
          { gpsThreshold: 88, amount: 70 },
          { gpsThreshold: 90, amount: 80 },
          { gpsThreshold: 92, amount: 90 },
          { gpsThreshold: 94, amount: 100 },
          { gpsThreshold: 96, amount: 110 }
        ],
        createdAt: new Date()
      },
      {
        ruleId: 'RULE_AI_LINKCONER_SPECIFIC',
        count: 'AI LINKCONER',
        department: 'AI Linkconer',
        effectiveDate: '01/01/2026',
        shed: 'All Sheds',
        payouts: [
          { gpsThreshold: 85, amount: 60 },
          { gpsThreshold: 88, amount: 70 },
          { gpsThreshold: 90, amount: 80 },
          { gpsThreshold: 92, amount: 90 },
          { gpsThreshold: 94, amount: 100 },
          { gpsThreshold: 96, amount: 110 }
        ],
        createdAt: new Date()
      },
      {
        ruleId: 'RULE_FITTER_ALL',
        count: 'All',
        department: 'Fitter',
        effectiveDate: '01/01/2026',
        shed: 'All Sheds',
        payouts: [
          { gpsThreshold: 300, amount: 60 },
          { gpsThreshold: 320, amount: 80 },
          { gpsThreshold: 340, amount: 100 }
        ],
        createdAt: new Date()
      }
    ];

    for (const r of extraRules) {
      await db.collection('incentiverules').updateOne(
        { count: r.count, department: r.department },
        { $set: r },
        { upsert: true }
      );
      await db.collection('incentive_rules').updateOne(
        { count: r.count, department: r.department },
        { $set: r },
        { upsert: true }
      );
    }
    console.log(`✓ Upserted AI Linkconer and Fitter incentive rules`);

    // =========================================================================
    // 3. MACHINES MASTER (10 machines for each of the 4 sheds = 40 machines total)
    // =========================================================================
    const machinesData = [
      // Shed 1: SP021 - SP030 (with 6 different counts)
      { id: 'm-SP021', rfNo: 'SP021', frameNo: 'SP021', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '030/1-PH-PC', defaultCount: '030/1-PH-PC', stdGps: 340, targetProductionKg: 1550, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-SP022', rfNo: 'SP022', frameNo: 'SP022', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '030/1-PH-PC', defaultCount: '030/1-PH-PC', stdGps: 340, targetProductionKg: 1550, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP023', rfNo: 'SP023', frameNo: 'SP023', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '040/1-PH-PC', defaultCount: '040/1-PH-PC', stdGps: 310, targetProductionKg: 1420, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP024', rfNo: 'SP024', frameNo: 'SP024', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '040/1-PH-PC', defaultCount: '040/1-PH-PC', stdGps: 310, targetProductionKg: 1420, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-SP025', rfNo: 'SP025', frameNo: 'SP025', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '34/1-PH-PV', defaultCount: '34/1-PH-PV', stdGps: 330, targetProductionKg: 1480, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP026', rfNo: 'SP026', frameNo: 'SP026', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '34/1-PH-PV', defaultCount: '34/1-PH-PV', stdGps: 330, targetProductionKg: 1480, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP027', rfNo: 'SP027', frameNo: 'SP027', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '042/1-CH-NY', defaultCount: '042/1-CH-NY', stdGps: 305, targetProductionKg: 1400, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP028', rfNo: 'SP028', frameNo: 'SP028', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '042/1-CH-NY', defaultCount: '042/1-CH-NY', stdGps: 305, targetProductionKg: 1400, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-SP029', rfNo: 'SP029', frameNo: 'SP029', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '038/1-CH-NY', defaultCount: '038/1-CH-NY', stdGps: 320, targetProductionKg: 1450, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP030', rfNo: 'SP030', frameNo: 'SP030', shed: 'Shed 1', unit: 'Unit 1 - Shed 1', count: '034/1-PH-PC', defaultCount: '034/1-PH-PC', stdGps: 330, targetProductionKg: 1480, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },

      // Shed 2: SP031 - SP040 (with 4 different counts)
      { id: 'm-SP031', rfNo: 'SP031', frameNo: 'SP031', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '32/1-CH-CY', defaultCount: '32/1-CH-CY', stdGps: 340, targetProductionKg: 1500, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP032', rfNo: 'SP032', frameNo: 'SP032', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '32/1-CH-CY', defaultCount: '32/1-CH-CY', stdGps: 340, targetProductionKg: 1500, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-SP033', rfNo: 'SP033', frameNo: 'SP033', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '32/1-CH-CY', defaultCount: '32/1-CH-CY', stdGps: 340, targetProductionKg: 1500, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP034', rfNo: 'SP034', frameNo: 'SP034', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '34/1CHY-OCY', defaultCount: '34/1CHY-OCY', stdGps: 330, targetProductionKg: 1480, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP035', rfNo: 'SP035', frameNo: 'SP035', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '34/1CHY-OCY', defaultCount: '34/1CHY-OCY', stdGps: 330, targetProductionKg: 1480, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-SP036', rfNo: 'SP036', frameNo: 'SP036', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '30/1CH', defaultCount: '30/1CH', stdGps: 355, targetProductionKg: 1550, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP037', rfNo: 'SP037', frameNo: 'SP037', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '30/1CH', defaultCount: '30/1CH', stdGps: 355, targetProductionKg: 1550, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP038', rfNo: 'SP038', frameNo: 'SP038', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '30/1CH', defaultCount: '30/1CH', stdGps: 355, targetProductionKg: 1550, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-SP039', rfNo: 'SP039', frameNo: 'SP039', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '20/1-CW-WVG', defaultCount: '20/1-CW-WVG', stdGps: 375, targetProductionKg: 1650, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP040', rfNo: 'SP040', frameNo: 'SP040', shed: 'Shed 2', unit: 'Unit 2 - Shed 2', count: '20/1-CW-WVG', defaultCount: '20/1-CW-WVG', stdGps: 375, targetProductionKg: 1650, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },

      // Shed 3: SP041 - SP050 (with 5 different counts)
      { id: 'm-SP041', rfNo: 'SP041', frameNo: 'SP041', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '26/1-CHY', defaultCount: '26/1-CHY', stdGps: 360, targetProductionKg: 1600, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP042', rfNo: 'SP042', frameNo: 'SP042', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '26/1-CHY', defaultCount: '26/1-CHY', stdGps: 360, targetProductionKg: 1600, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP043', rfNo: 'SP043', frameNo: 'SP043', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '26/1-CHY', defaultCount: '26/1-CHY', stdGps: 360, targetProductionKg: 1600, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-SP044', rfNo: 'SP044', frameNo: 'SP044', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '50s Compact', defaultCount: '50s Compact', stdGps: 325, targetProductionKg: 1420, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP045', rfNo: 'SP045', frameNo: 'SP045', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '50s Compact', defaultCount: '50s Compact', stdGps: 325, targetProductionKg: 1420, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP046', rfNo: 'SP046', frameNo: 'SP046', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '60s Super Combed', defaultCount: '60s Super Combed', stdGps: 310, targetProductionKg: 1350, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-SP047', rfNo: 'SP047', frameNo: 'SP047', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '60s Super Combed', defaultCount: '60s Super Combed', stdGps: 310, targetProductionKg: 1350, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP048', rfNo: 'SP048', frameNo: 'SP048', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '40s Micro Weft', defaultCount: '40s Micro Weft', stdGps: 340, targetProductionKg: 1510, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP049', rfNo: 'SP049', frameNo: 'SP049', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '40s Micro Weft', defaultCount: '40s Micro Weft', stdGps: 340, targetProductionKg: 1510, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-SP050', rfNo: 'SP050', frameNo: 'SP050', shed: 'Shed 3', unit: 'Unit 3 - Shed 3', count: '40s', defaultCount: '40s', stdGps: 340, targetProductionKg: 1500, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },

      // KTTM: K01 - K10 (with 4 different counts)
      { id: 'm-K01', rfNo: 'K01', frameNo: 'K01', shed: 'KTTM', unit: 'KTTM RXI 240', count: '60s CW', defaultCount: '60s CW', stdGps: 310, targetProductionKg: 1360, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-K02', rfNo: 'K02', frameNo: 'K02', shed: 'KTTM', unit: 'KTTM RXI 240', count: '60s CW', defaultCount: '60s CW', stdGps: 310, targetProductionKg: 1360, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-K03', rfNo: 'K03', frameNo: 'K03', shed: 'KTTM', unit: 'KTTM RXI 240', count: '60s CW', defaultCount: '60s CW', stdGps: 310, targetProductionKg: 1360, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-K04', rfNo: 'K04', frameNo: 'K04', shed: 'KTTM', unit: 'KTTM RXI 240', count: '40s KTTM', defaultCount: '40s KTTM', stdGps: 345, targetProductionKg: 1520, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-K05', rfNo: 'K05', frameNo: 'K05', shed: 'KTTM', unit: 'KTTM RXI 240', count: '40s KTTM', defaultCount: '40s KTTM', stdGps: 345, targetProductionKg: 1520, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-K06', rfNo: 'K06', frameNo: 'K06', shed: 'KTTM', unit: 'KTTM RXI 240', count: '40s KTTM', defaultCount: '40s KTTM', stdGps: 345, targetProductionKg: 1520, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-K07', rfNo: 'K07', frameNo: 'K07', shed: 'KTTM', unit: 'KTTM RXI 240', count: '80s Compact', defaultCount: '80s Compact', stdGps: 280, targetProductionKg: 1220, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
      { id: 'm-K08', rfNo: 'K08', frameNo: 'K08', shed: 'KTTM', unit: 'KTTM RXI 240', count: '80s Compact', defaultCount: '80s Compact', stdGps: 280, targetProductionKg: 1220, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-K09', rfNo: 'K09', frameNo: 'K09', shed: 'KTTM', unit: 'KTTM RXI 240', count: '100s Dobby', defaultCount: '100s Dobby', stdGps: 250, targetProductionKg: 1050, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'GOOD', createdAt: new Date() },
      { id: 'm-K10', rfNo: 'K10', frameNo: 'K10', shed: 'KTTM', unit: 'KTTM RXI 240', count: '100s Dobby', defaultCount: '100s Dobby', stdGps: 250, targetProductionKg: 1050, spindles: 1200, status: 'ACTIVE', maintenanceStatus: 'EXCELLENT', createdAt: new Date() },
    ];

    // Replace machines collection with exactly 40 machines (10 per shed)
    await db.collection('machines').deleteMany({});
    await db.collection('machines').insertMany(machinesData);
    console.log(`✓ Inserted exactly ${machinesData.length} machines (10 machines each for Shed 1, Shed 2, Shed 3, KTTM)`);

    // =========================================================================
    // 4. GENERATE TELEMETRY DATA FOR DATES 26/10/2026 AND 27/10/2026
    // =========================================================================
    const dates = ['26/10/2026', '27/10/2026'];
    const sheds = ['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'];
    const shifts = ['I', 'II', 'III'];

    // Map counts to their multiplication factors
    const countFactorMap = {};
    countsData.forEach(c => {
      countFactorMap[c.count] = c.multiplicationFactor;
    });

    // Group machines and workers by shed
    const machinesByShed = {};
    const workersByShed = {};

    sheds.forEach(shed => {
      machinesByShed[shed] = machinesData.filter(m => m.shed === shed);
      workersByShed[shed] = workersData.filter(w => w.shed === shed);
    });

    const allMachineEmDoc = { ...(await db.collection('machine_em').findOne({ _id: 'machine_em_data' }))?.data || {} };
    const allProdLogsToInsert = [];
    const allEmLogsToInsert = [];
    const allShiftAllocationsToInsert = [];

    for (const date of dates) {
      const isDate27 = date === '27/10/2026';
      const dayMultiplier = isDate27 ? 1.012 : 0.995; // Slight realistic difference between the two days

      for (const shed of sheds) {
        const shedMachines = machinesByShed[shed];
        const shedWorkers = workersByShed[shed];
        const siders = shedWorkers.filter(w => w.department === 'Sider');
        const gaiterWorker = shedWorkers.find(w => w.department === 'Gaiter') || shedWorkers[0];
        const fitterWorker = shedWorkers.find(w => w.department === 'Fitter') || shedWorkers[1];
        const aiWorker = shedWorkers.find(w => w.department === 'AI Linkconer') || shedWorkers[2];

        const entries = [];
        const summaries = [];
        let reportTotalTarget = 0;
        let reportTotalActual = 0;

        if (!allMachineEmDoc[date]) {
          allMachineEmDoc[date] = {};
        }

        // Generate telemetry for each machine across all 3 shifts
        shedMachines.forEach((machine, mIdx) => {
          const frameNo = machine.frameNo;
          const count = machine.count;
          const stdGps = machine.stdGps;
          const countFactor = countFactorMap[count] || 1.0;
          const dailyTargetKg = machine.targetProductionKg;
          const shiftTargetKg = Math.round(dailyTargetKg / 3);

          let frameTotalActual = 0;
          let frameTotalTarget = 0;

          const shiftGps = { I: 0, II: 0, III: 0 };
          const shiftUtil = { I: 0, II: 0, III: 0 };
          const shiftProductionKg = { I: 0, II: 0, III: 0 };
          const shiftNaturalEmt = { I: 0, II: 0, III: 0 };
          const shiftDoffEmt = { I: 0, II: 0, III: 0 };
          const shiftIdle = { I: 0, II: 0, III: 0 };
          const shiftWorst = { I: 0, II: 0, III: 0 };
          const shiftSlip = { I: 0, II: 0, III: 0 };
          const shiftUkg = { I: 0, II: 0, III: 0 };
          const shiftRestartBreaks = { I: 0, II: 0, III: 0 };
          const shiftNoOfDoff = { I: 0, II: 0, III: 0 };
          const shiftAvgDoffTime = { I: 0, II: 0, III: 0 };
          const shiftNoOfStop = { I: 0, II: 0, III: 0 };
          const shiftNormalStopMin = { I: 0, II: 0, III: 0 };
          const shiftUtilizationPinter = { I: 0, II: 0, III: 0 };

          shifts.forEach((shift, sIdx) => {
            // Shift-specific variation factors:
            // Shift I (morning) tends to have higher efficiency, Shift II medium, Shift III night slightly lower
            const shiftEfficiencyBase = sIdx === 0 ? 0.965 : sIdx === 1 ? 0.948 : 0.925;
            // Frame deterministic pseudo-variation
            const frameVar = ((mIdx * 7 + sIdx * 13 + (isDate27 ? 17 : 3)) % 11 - 5) * 0.006;
            const shiftActualProd = Math.round(shiftTargetKg * (shiftEfficiencyBase + frameVar) * dayMultiplier);

            // GPS: Target GPS vs Actual GPS
            const gpsBaseVar = ((mIdx * 3 + sIdx * 5 + (isDate27 ? 7 : 1)) % 9 - 4) * 1.5;
            const gpsActual = Math.round((stdGps + gpsBaseVar) * (sIdx === 0 ? 1.01 : sIdx === 1 ? 0.995 : 0.985));
            const gps40sCon = Math.round(gpsActual * countFactor * 10) / 10;

            const efficiency = Math.min(100, Math.round((shiftActualProd / shiftTargetKg) * 100 * 10) / 10);
            const utility = Math.min(100, Math.round((efficiency * 0.985 + (sIdx === 0 ? 1.0 : sIdx === 1 ? 0.2 : -0.8)) * 10) / 10);
            const ue = Math.round((efficiency * (utility / 100)) * 10) / 10;

            // Breakage and EMT metrics:
            const naturalEmt = Math.round((2.4 + ((mIdx * 2 + sIdx) % 5) * 0.6 + (sIdx === 2 ? 0.8 : 0)) * 10) / 10;
            const doffEmt = Math.round((1.1 + ((mIdx + sIdx * 2) % 4) * 0.35 + (sIdx === 2 ? 0.4 : 0)) * 10) / 10;
            const idlePercent = Math.round((1.8 + ((mIdx + sIdx) % 3) * 0.5) * 10) / 10;
            const worstPercent = Math.round((1.0 + ((mIdx * 3) % 4) * 0.3) * 10) / 10;
            const slipPercent = Math.round((0.3 + ((mIdx) % 3) * 0.15) * 10) / 10;
            const ukg = Math.round((3.2 + ((mIdx * 2 + sIdx) % 4) * 0.25) * 10) / 10;
            const restartBreaks = Math.round((1.4 + ((mIdx + sIdx) % 4) * 0.4) * 10) / 10;
            const noOfDoff = 3 + (mIdx % 2);
            const avgDoffTime = Math.round((12.5 + ((mIdx * 2) % 5) * 0.8) * 10) / 10;
            const noOfStop = 2 + (sIdx % 3);
            const normalStopMin = Math.round((14.0 + ((mIdx + sIdx) % 6) * 1.5) * 10) / 10;
            const utilizationPinter = utility;

            // Worker Assignment: cycle through siders distinctly for each shift
            const siderWorker = siders[(mIdx + sIdx * 2 + (isDate27 ? 1 : 0)) % siders.length];

            entries.push({
              shift,
              frameNo,
              count,
              productionTarget: shiftTargetKg,
              productionActual: shiftActualProd,
              gpsTarget: stdGps,
              gpsActual,
              gps40sCon,
              efficiency,
              utility,
              ue,
              naturalEmt,
              doffEmt,
              idlePercent,
              worstPercent,
              slipPercent,
              ukg,
              restartBreaks,
              siderId: siderWorker.id,
              siderIds: [siderWorker.id],
              siderName: siderWorker.name,
              gaiterId: gaiterWorker.id,
              gaiterName: gaiterWorker.name,
              shed
            });

            // Accumulate frame metrics
            frameTotalActual += shiftActualProd;
            frameTotalTarget += shiftTargetKg;
            shiftGps[shift] = gpsActual;
            shiftUtil[shift] = utility;
            shiftProductionKg[shift] = shiftActualProd;
            shiftNaturalEmt[shift] = naturalEmt;
            shiftDoffEmt[shift] = doffEmt;
            shiftIdle[shift] = idlePercent;
            shiftWorst[shift] = worstPercent;
            shiftSlip[shift] = slipPercent;
            shiftUkg[shift] = ukg;
            shiftRestartBreaks[shift] = restartBreaks;
            shiftNoOfDoff[shift] = noOfDoff;
            shiftAvgDoffTime[shift] = avgDoffTime;
            shiftNoOfStop[shift] = noOfStop;
            shiftNormalStopMin[shift] = normalStopMin;
            shiftUtilizationPinter[shift] = utilizationPinter;

            // Populate machine EM table
            if (!allMachineEmDoc[date][frameNo]) {
              allMachineEmDoc[date][frameNo] = {};
            }
            allMachineEmDoc[date][frameNo][String(sIdx + 1)] = doffEmt;
          });

          // Machine daily summary
          const avgGps = Math.round(((shiftGps.I + shiftGps.II + shiftGps.III) / 3) * 10) / 10;
          const avgUtil = Math.round(((shiftUtil.I + shiftUtil.II + shiftUtil.III) / 3) * 10) / 10;

          summaries.push({
            frameNo,
            count,
            stdGps,
            targetProd: frameTotalTarget,
            actualProd: frameTotalActual,
            shiftGps,
            avgGps,
            shiftUtil,
            avgUtil,
            shiftNaturalEmt,
            shiftRestartBreaks,
            shiftDoffEmt,
            shiftIdle,
            shiftWorst,
            shiftSlip,
            shiftUkg,
            shiftNoOfDoff,
            shiftAvgDoffTime,
            shiftNoOfStop,
            shiftNormalStopMin,
            shiftProductionKg,
            shiftUtilizationPinter,
            shed
          });

          reportTotalTarget += frameTotalTarget;
          reportTotalActual += frameTotalActual;
        });

        // Shift staffing records: exactly 1 gaiter, 1 fitter, and 1 AI Linkconer for each shift and each shed
        const gaiters = {
          I: [gaiterWorker.id],
          II: [gaiterWorker.id],
          III: [gaiterWorker.id]
        };

        const fitters = {
          I: [fitterWorker.id],
          II: [fitterWorker.id],
          III: [fitterWorker.id]
        };

        const aiCones = {
          I: [aiWorker.id],
          II: [aiWorker.id],
          III: [aiWorker.id]
        };

        const dailyReportDoc = {
          date,
          shed,
          entries,
          summaries,
          gaiters,
          fitters,
          aiCones,
          totalProductionTarget: reportTotalTarget,
          totalProductionActual: reportTotalActual,
          timestamp: new Date(isDate27 ? 2026 : 2026, 9, isDate27 ? 27 : 26, 23, 59, 0).getTime(),
          emData: { [date]: allMachineEmDoc[date] }
        };

        await db.collection('reports').updateOne(
          { date, shed },
          { $set: dailyReportDoc },
          { upsert: true }
        );

        console.log(`✓ Seeded Daily Report: Date ${date} | ${shed} (10 frames, 30 entries, Target: ${reportTotalTarget} kg, Actual: ${reportTotalActual} kg)`);

        // Prepare logs
        entries.forEach((entry, idx) => {
          const logId = `LOG_${date.replace(/[\/.-]/g, '')}_${shed.replace(/\s+/g, '')}_${entry.frameNo}_${entry.shift}_${idx}`;
          const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;

          allProdLogsToInsert.push({
            logId,
            date,
            shed,
            frameNo: entry.frameNo,
            shift: entry.shift,
            count: entry.count,
            productionTarget: entry.productionTarget,
            productionActual: entry.productionActual,
            variance: entry.productionActual - entry.productionTarget,
            gpsTarget: entry.gpsTarget,
            gpsActual: entry.gpsActual,
            gps40sCon: entry.gps40sCon,
            efficiency: entry.efficiency,
            utility: entry.utility,
            doffEmt: entry.doffEmt,
            naturalEmt: entry.naturalEmt,
            assignedWorkerId: entry.siderId,
            assignedWorkerName: entry.siderName,
            status: 'COMPLETED',
            createdAt: new Date(dailyReportDoc.timestamp)
          });

          allEmLogsToInsert.push({
            logId: `EM_${date.replace(/[\/.-]/g, '')}_${shed.replace(/\s+/g, '')}_${entry.frameNo}_${shiftNum}_${idx}`,
            date,
            shed,
            frameNo: entry.frameNo,
            shift: shiftNum,
            emValue: entry.doffEmt,
            doffEmt: entry.doffEmt,
            naturalEmt: entry.naturalEmt,
            idlePercent: entry.idlePercent,
            slipPercent: entry.slipPercent,
            isHighEm: entry.doffEmt > 4,
            assignedSider: entry.siderName,
            createdAt: new Date(dailyReportDoc.timestamp)
          });

          allShiftAllocationsToInsert.push({
            allocationId: `ALLOC_${date.replace(/[\/.-]/g, '')}_${shed.replace(/\s+/g, '')}_${entry.frameNo}_${entry.shift}_${idx}`,
            date,
            shed,
            shift: entry.shift,
            frameNo: entry.frameNo,
            count: entry.count,
            siderIds: entry.siderIds,
            siderName: entry.siderName,
            status: 'ALLOCATED',
            allocatedAt: new Date(dailyReportDoc.timestamp)
          });
        });

        // Add shift allocation logs for Gaiter, Fitter, and AI Linkconer
        shifts.forEach(shift => {
          allShiftAllocationsToInsert.push({
            allocationId: `ALLOC_GAITER_${date.replace(/[\/.-]/g, '')}_${shed.replace(/\s+/g, '')}_${shift}`,
            date,
            shed,
            shift,
            frameNo: 'GAITER',
            count: 'SUPPORT',
            siderIds: [gaiterWorker.id],
            workerId: gaiterWorker.id,
            workerName: gaiterWorker.name,
            role: 'GAITER',
            status: 'ALLOCATED',
            allocatedAt: new Date(dailyReportDoc.timestamp)
          });

          allShiftAllocationsToInsert.push({
            allocationId: `ALLOC_FITTER_${date.replace(/[\/.-]/g, '')}_${shed.replace(/\s+/g, '')}_${shift}`,
            date,
            shed,
            shift,
            frameNo: 'FITTER',
            count: 'MAINTENANCE',
            siderIds: [fitterWorker.id],
            workerId: fitterWorker.id,
            workerName: fitterWorker.name,
            role: 'FITTER',
            status: 'ALLOCATED',
            allocatedAt: new Date(dailyReportDoc.timestamp)
          });

          allShiftAllocationsToInsert.push({
            allocationId: `ALLOC_AI_${date.replace(/[\/.-]/g, '')}_${shed.replace(/\s+/g, '')}_${shift}`,
            date,
            shed,
            shift,
            frameNo: 'AI_CONER',
            count: 'WINDING',
            siderIds: [aiWorker.id],
            workerId: aiWorker.id,
            workerName: aiWorker.name,
            role: 'AI LINKCONER',
            status: 'ALLOCATED',
            allocatedAt: new Date(dailyReportDoc.timestamp)
          });
        });
      }
    }

    // =========================================================================
    // 5. UPDATE MACHINE EM COLLECTION
    // =========================================================================
    await db.collection('machine_em').updateOne(
      { _id: 'machine_em_data' },
      { $set: { data: allMachineEmDoc } },
      { upsert: true }
    );
    console.log(`✓ Updated machine_em collection with multi-shed telemetry for dates ${dates.join(', ')}`);

    // =========================================================================
    // 6. SYNC LOGS & ALLOCATIONS
    // =========================================================================
    // Delete existing logs for these two dates then insert new
    await db.collection('dailyproductionlogs').deleteMany({ date: { $in: dates } });
    if (allProdLogsToInsert.length > 0) {
      await db.collection('dailyproductionlogs').insertMany(allProdLogsToInsert);
      console.log(`✓ Inserted ${allProdLogsToInsert.length} production logs for dates ${dates.join(', ')}`);
    }

    await db.collection('machineemlogs').deleteMany({ date: { $in: dates } });
    if (allEmLogsToInsert.length > 0) {
      await db.collection('machineemlogs').insertMany(allEmLogsToInsert);
      console.log(`✓ Inserted ${allEmLogsToInsert.length} machine EM logs for dates ${dates.join(', ')}`);
    }

    await db.collection('shiftallocations').deleteMany({ date: { $in: dates } });
    if (allShiftAllocationsToInsert.length > 0) {
      await db.collection('shiftallocations').insertMany(allShiftAllocationsToInsert);
      console.log(`✓ Inserted ${allShiftAllocationsToInsert.length} shift allocations for dates ${dates.join(', ')}`);
    }

    console.log('\n======================================================');
    console.log('✅ ALL SEEDING FOR OCT 26 & OCT 27 COMPLETED SUCCESSFULLY!');
    console.log('   - 40 Workers (10 per shed for Shed 1, Shed 2, Shed 3, KTTM)');
    console.log('   - 40 Machines (10 per shed with different counts)');
    console.log('   - 8 Complete Daily Reports (2 dates × 4 sheds, 3 shifts each)');
    console.log('   - Distinct shift, shed, and date telemetry data');
    console.log('======================================================\n');

  } catch (err) {
    console.error('Seeding error:', err);
  } finally {
    await client.close();
  }
}

seedData();
