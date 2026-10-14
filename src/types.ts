/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Shift = 'I' | 'II' | 'III';

export type Shed = 'Shed 1' | 'Shed 2' | 'Shed 3' | 'KTTM';

export interface Sider {
  id: string;
  name: string;
  tNo: string; // Ticket Number
  photoUrl?: string;
  department?: string; // Optional department (e.g. 'Sider', 'Gaiter', 'AI Linkconer')
  shed?: Shed | string; // e.g. 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'
  assignedMachine?: string; // e.g. 'SP023'
}

export interface MachineMasterItem {
  id: string;
  rfNo: string;
  description?: string;
  count: string;
  stdGps: number;
  actualGps: number;
  productionKg: number;
  assignedSider?: string;
  assignedGaiter?: string;
  shed?: string;
}

export interface ProductionEntry {
  shift: Shift;
  frameNo: string;
  count: string;
  productionTarget: number;
  productionActual: number;
  gpsTarget: number;
  gpsActual: number;
  gps40sCon: number;
  efficiency: number;
  utility: number;
  ue: number;
  naturalEmt: number; // Breaks / 100 Spindle
  doffEmt: number; // EM
  idlePercent: number; // Idle %
  worstPercent: number; // Rougu %
  slipPercent: number; // Slip %
  ukg: number; // UKG
  restartBreaks: number; // Restarting Breaks %
  incentiveAmount?: number; // Added for manual incentive uploads
  remarks?: string;
  siderId?: string; // Link to worker by ID (kept for backward compatibility or singular use)
  siderIds?: string[]; // Multiple siders assigned to this machine/entry
  siderName?: string; // Link to worker by Name (extracted from Excel)
  shed?: string; // e.g. 'Shed 1', 'Shed 2', 'Shed 3'
}

export interface IncentivePayout {
  gpsThreshold: number;
  amount: number;
  fromGps?: number;
  toGps?: number;
  conditionText?: string;
  ruleText?: string;
}

export interface IncentiveRule {
  count: string;
  payouts: IncentivePayout[];
  department?: string; // e.g. 'Sider', 'AI Linkconer'
  effectiveDate?: string; // Optional effective date (DD/MM/YYYY format)
}

export interface IncentiveReport {
  siderId: string;
  siderName: string;
  tNo: string;
  totalProduction: number;
  avgEfficiency: number;
  incentiveAmount: number;
  frames: string[];
  shifts: Shift[];
}

export interface FrameDailySummary {
  frameNo: string;
  count: string;
  stdGps: number;
  targetProd: number;
  actualProd: number;
  shiftGps: Record<Shift, number>;
  avgGps: number;
  shiftUtil: Record<Shift, number>;
  avgUtil: number;
  // New breakage stats
  shiftNaturalEmt: Record<Shift, number>;
  shiftRestartBreaks: Record<Shift, number>;
  shiftDoffEmt: Record<Shift, number>;
  shiftIdle: Record<Shift, number>;
  shiftWorst: Record<Shift, number>;
  shiftSlip: Record<Shift, number>;
  shiftUkg: Record<Shift, number>;
  shiftNoOfDoff: Record<Shift, number>;
  shiftAvgDoffTime: Record<Shift, number>;
  shiftNoOfStop: Record<Shift, number>;
  shiftNormalStopMin: Record<Shift, number>;
  shiftProductionKg: Record<Shift, number>;
  shiftUtilizationPinter: Record<Shift, number>;
  shed?: string;
}

export interface CountConversion {
  count: string;
  multiplicationFactor: number; // Factor to multiply Actual GPSS to get 40s GPSS
  description?: string;
}

export interface DailyReport {
  date: string;
  shed?: Shed | string; // 'Shed 1' | 'Shed 2' | 'Shed 3' | 'KTTM'
  entries: ProductionEntry[];
  summaries: FrameDailySummary[];
  gaiters?: Record<Shift, string[]>; // Map of shift to array of worker IDs
  aiCones?: Record<Shift, string[]>; // Map of shift to array of worker IDs (AI Linkconer)
  fitters?: Record<Shift, string[]>; // Map of shift to array of worker IDs (Fitter)
  totalProductionTarget: number;
  totalProductionActual: number;
  timestamp?: number;
  emData?: MachineEmData;
}

export interface MachineEmData {
  [dateStr: string]: {
    [machineName: string]: {
      [shiftNum: string]: number;
    };
  };
}

export interface SystemSettings {
  googleSheetUrl: string;
  autoUpdateEnabled: boolean;
  lastSyncDate: string | null;
  bestSiderOverrideId?: string | null;
  tvInterval: number;
  tvSubInterval: number;
  machineSiderCounts: Record<string, number>;
  gaiterCounts: Record<Shift, number>;
  tvPageIntervals?: Record<string, number>;
  tvMonth?: number;
  tvYear?: number;
  tvShowBestSiderMonth?: boolean;
  machineEmGoogleSheetUrl?: string;
  lastMachineEmSyncDate?: string | null;
  emHighLimit?: number;
  whatsAppProdPhone?: string;
  whatsAppEmPhone?: string;
  whatsAppIncentivePhone?: string;
  tvSlideIntervals?: Record<string, number>;
  tvSlideEnabled?: Record<string, boolean>;
}

export interface FrozenMonthAbstractItem {
  id: string;
  name: string;
  tNo: string;
  amount: number;
  workedDaysCount: number;
  gpsAcc?: number;
  duties?: number;
}

export interface FrozenMonthRecord {
  monthKey: string; // e.g. "2026-07"
  month: number;
  year: number;
  frozenAt: string;
  frozenBy?: string;
  note?: string;
  siderAbstract: FrozenMonthAbstractItem[];
  aiAbstract: FrozenMonthAbstractItem[];
  dailyWorkerIncentives: Record<string, Record<string, number>>;
}

export interface User {
  userId: string;
  username: string;
  name: string;
  role: 'ADMIN' | 'SUPERVISOR' | 'MAINTENANCE';
  accessLevel: string;
  shed?: Shed | string;
  email?: string;
  phone?: string;
  status: 'ACTIVE' | 'INACTIVE';
  lastLogin?: Date | string;
  createdAt?: Date | string;
}

