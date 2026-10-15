import { DailyReport, Sider, ProductionEntry, FrameDailySummary, Shift } from '../types';

export const SAMPLE_DATE = '10/10/2026';

export const SAMPLE_WORKERS: Sider[] = [
  { id: 'w-1001', name: 'Ramesh Kumar', tNo: '1001', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1002', name: 'Suresh Babu', tNo: '1002', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1003', name: 'Murugan P', tNo: '1003', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1004', name: 'Selvan M', tNo: '1004', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1005', name: 'Karthik S', tNo: '1005', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1006', name: 'Vignesh R', tNo: '1006', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1007', name: 'Prakash K', tNo: '1007', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1008', name: 'Anbu Chelvan', tNo: '1008', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1009', name: 'Vijay Anand', tNo: '1009', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1010', name: 'Saravanan T', tNo: '1010', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1011', name: 'Manikandan V', tNo: '1011', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1012', name: 'Raja Mohan', tNo: '1012', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1013', name: 'Arumugam C', tNo: '1013', department: 'Sider', shed: 'Shed 1' },
  { id: 'w-1014', name: 'Dhandapani K', tNo: '1014', department: 'Sider', shed: 'Shed 1' },
  // Gaiters
  { id: 'w-2001', name: 'Muthu Vel', tNo: '2001', department: 'Gaiter', shed: 'Shed 1' },
  { id: 'w-2002', name: 'Ganesan R', tNo: '2002', department: 'Gaiter', shed: 'Shed 1' },
  { id: 'w-2003', name: 'Senthil Nathan', tNo: '2003', department: 'Gaiter', shed: 'Shed 1' },
  // AI Linkconers
  { id: 'w-3001', name: 'Balaji K', tNo: '3001', department: 'AI Linkconer', shed: 'Shed 1' },
  { id: 'w-3002', name: 'Deepak Raj', tNo: '3002', department: 'AI Linkconer', shed: 'Shed 1' },
  { id: 'w-3003', name: 'Dinesh Kumar', tNo: '3003', department: 'AI Linkconer', shed: 'Shed 1' },
  // Fitters
  { id: 'w-4001', name: 'Ravi Chandran', tNo: '4001', department: 'Maintenance', shed: 'Shed 1' },
  { id: 'w-4002', name: 'Natarajan M', tNo: '4002', department: 'Maintenance', shed: 'Shed 1' }
];

export const SAMPLE_MACHINE_EM_10102026: Record<string, { '1': number; '2': number; '3': number }> = {
  'SP029': { '1': 2.5, '2': 1.8, '3': 2.0 },
  'SP032': { '1': 3.8, '2': 3.0, '3': 3.8 },
  'SP033': { '1': 3.0, '2': 3.0, '3': 3.8 },
  'SP034': { '1': 3.2, '2': 2.8, '3': 3.1 },
  'SP035': { '1': 4.9, '2': 3.8, '3': 3.6 },
  'SP036': { '1': 2.3, '2': 3.3, '3': 3.1 },
  'SP037': { '1': 3.0, '2': 2.9, '3': 3.0 },
  'SP038': { '1': 3.1, '2': 3.0, '3': 3.2 },
  'SP025': { '1': 2.8, '2': 2.5, '3': 2.7 },
  'SP026': { '1': 3.5, '2': 3.1, '3': 3.4 },
  'SP027': { '1': 3.2, '2': 2.9, '3': 3.0 },
  'SP030': { '1': 3.4, '2': 3.2, '3': 3.3 },
  'SP031': { '1': 3.3, '2': 3.0, '3': 3.2 },
  'SP056': { '1': 3.1, '2': 2.8, '3': 3.0 }
};

export const createSampleReportForShed1_10102026 = (): DailyReport => {
  const machines = [
    { no: 'SP025', count: '40s CH', target: 1200 },
    { no: 'SP026', count: '40s CH', target: 1200 },
    { no: 'SP027', count: '40s CH', target: 1200 },
    { no: 'SP029', count: '40s CH', target: 1200 },
    { no: 'SP030', count: '34s K', target: 1260 },
    { no: 'SP031', count: '34s K', target: 1260 },
    { no: 'SP032', count: '34s K', target: 1260 },
    { no: 'SP033', count: '34s K', target: 1260 },
    { no: 'SP034', count: '30s KD', target: 1320 },
    { no: 'SP035', count: '30s KD', target: 1320 },
    { no: 'SP036', count: '30s KD', target: 1320 },
    { no: 'SP037', count: '30s KD', target: 1320 },
    { no: 'SP038', count: '60s CW', target: 980 },
    { no: 'SP056', count: '60s CW', target: 980 }
  ];

  const shifts: Shift[] = ['I', 'II', 'III'];
  const entries: ProductionEntry[] = [];
  const summaries: FrameDailySummary[] = [];

  let workerIdx = 0;

  machines.forEach((m, mIdx) => {
    let machineActualTotal = 0;
    let gpsSum = 0;
    let utilSum = 0;
    const shiftGps: Record<Shift, number> = { I: 0, II: 0, III: 0 };
    const shiftUtil: Record<Shift, number> = { I: 0, II: 0, III: 0 };
    const shiftProd: Record<Shift, number> = { I: 0, II: 0, III: 0 };

    shifts.forEach((shift, sIdx) => {
      const assignedWorker = SAMPLE_WORKERS[workerIdx % 14];
      workerIdx++;

      const shiftTarget = Math.round(m.target / 3);
      const prodVariance = (mIdx * 3 + sIdx * 5) % 25 - 10;
      const actualProd = shiftTarget + prodVariance;
      machineActualTotal += actualProd;
      shiftProd[shift] = actualProd;

      const baseGps = m.count.startsWith('40') ? 448 : m.count.startsWith('34') ? 455 : m.count.startsWith('30') ? 465 : 435;
      const gpsActual = baseGps + ((mIdx * 2 + sIdx * 3) % 15 - 5);
      gpsSum += gpsActual;
      shiftGps[shift] = gpsActual;

      const efficiency = Number(((actualProd / shiftTarget) * 96).toFixed(1));
      utilSum += efficiency;
      shiftUtil[shift] = efficiency;

      const incentiveAmount = gpsActual >= 460 ? 120 : gpsActual >= 455 ? 110 : gpsActual >= 450 ? 100 : gpsActual >= 445 ? 90 : 80;

      entries.push({
        frameNo: m.no,
        shift,
        count: m.count,
        productionTarget: shiftTarget,
        productionActual: actualProd,
        gpsTarget: baseGps,
        gpsActual,
        gps40sCon: gpsActual,
        efficiency,
        utility: efficiency,
        ue: efficiency,
        naturalEmt: 0,
        doffEmt: 0,
        idlePercent: 2.1,
        worstPercent: 1.2,
        slipPercent: 0.8,
        ukg: 3.2,
        restartBreaks: 1.1,
        siderId: assignedWorker.id,
        siderName: assignedWorker.name,
        incentiveAmount,
        shed: 'Shed 1'
      });
    });

    summaries.push({
      frameNo: m.no,
      count: m.count,
      stdGps: m.count.startsWith('40') ? 450 : m.count.startsWith('34') ? 455 : m.count.startsWith('30') ? 460 : 440,
      targetProd: m.target,
      actualProd: machineActualTotal,
      shiftGps,
      avgGps: Number((gpsSum / 3).toFixed(1)),
      shiftUtil,
      avgUtil: Number((utilSum / 3).toFixed(1)),
      shiftNaturalEmt: { I: 0, II: 0, III: 0 },
      shiftRestartBreaks: { I: 0, II: 0, III: 0 },
      shiftDoffEmt: { I: 0, II: 0, III: 0 },
      shiftIdle: { I: 2.1, II: 2.0, III: 2.2 },
      shiftWorst: { I: 1.2, II: 1.1, III: 1.3 },
      shiftSlip: { I: 0.8, II: 0.7, III: 0.9 },
      shiftUkg: { I: 3.2, II: 3.1, III: 3.3 },
      shiftNoOfDoff: { I: 3, II: 3, III: 3 },
      shiftAvgDoffTime: { I: 12, II: 12, III: 12 },
      shiftNoOfStop: { I: 2, II: 2, III: 2 },
      shiftNormalStopMin: { I: 15, II: 15, III: 15 },
      shiftProductionKg: shiftProd,
      shiftUtilizationPinter: shiftUtil,
      shed: 'Shed 1'
    });
  });

  const totalProductionTarget = machines.reduce((acc, m) => acc + m.target, 0);
  const totalProductionActual = summaries.reduce((acc, s) => acc + s.actualProd, 0);

  return {
    date: SAMPLE_DATE,
    shed: 'Shed 1',
    entries,
    summaries,
    gaiters: {
      I: ['w-2001'],
      II: ['w-2002'],
      III: ['w-2003']
    },
    aiCones: {
      I: ['w-3001'],
      II: ['w-3002'],
      III: ['w-3003']
    },
    fitters: {
      I: ['w-4001'],
      II: ['w-4002'],
      III: ['w-4001']
    },
    totalProductionTarget,
    totalProductionActual,
    timestamp: Date.now(),
    emData: {
      [SAMPLE_DATE]: SAMPLE_MACHINE_EM_10102026
    }
  };
};
