export interface Employee {
  employeeId: string;
  employeeName: string;
  assignedDeviceIds?: string[];
  lastSeen?: string | null;
}

export interface Machine {
  machineId: string;
  machineName: string;
  millId?: string;
  cleaningIntervalDays?: number;
  expectedProductionOutput?: number;
  expectedRuntimeMinutes?: number;
  expectedRoundsPerHour?: number;
  roundDeviceSequence?: string[];
}

export interface MachineMapping {
  mappingId: string;
  name: string;
  stationIds: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MachineMappingInput {
  name: string;
  stationIds: string[];
}

export interface MachineSessionTap {
  timestamp: string | null;
  employeeId?: string | null;
  employeeName?: string | null;
  tapNumber?: number;
  badge?: string;
  time?: string;
}

export interface MachineLoginSession {
  id: string;
  label: string;
  status: 'LOGGED_IN' | 'LOGGED_OUT' | string;
  startedAt?: string | null;
  endedAt?: string | null;
  isCurrent?: boolean;
  isPrevious?: boolean;
  taps: MachineSessionTap[];
}

export interface MachineSession {
  machineId: string;
  machineName: string;
  employeeId?: string | null;
  employeeName?: string | null;
  loginStatus: 'LOGGED_IN' | 'LOGGED_OUT' | string;
  lastCardTapAt?: string | null;
  logoutAt?: string | null;
  expired?: boolean;
  loginSessions?: MachineLoginSession[];
  sessions?: MachineLoginSession[];
  cardTaps?: MachineSessionTap[];
  tapHistory?: MachineSessionTap[];
}

export interface Shift {
  _id?: string;
  shiftId: string;
  name: string;
  startTime: string;
  endTime: string;
  overnight?: boolean;
}

export interface MaintenanceEntry {
  maintenanceId: string;
  type: 'preventive' | 'electrical' | string;
  machineId: string;
  deviceId?: string | null;
  title?: string | null;
  scheduledDate: string;
  assignedPerson: string;
  status: 'planned' | 'completed' | 'cancelled' | string;
  completionDate?: string | null;
  notes?: string | null;
}

export interface MachineConfiguration {
  expectedProductionOutput: number;
  expectedRuntimeMinutes: number;
  expectedRoundsPerHour: number;
  roundDeviceSequence: string[];
  cleaningInterval: number;
}

export interface DeviceHealth {
  deviceId: string;
  machineId: string;
  lastSeen: string;
  status: 'HEALTHY' | 'DEGRADED' | 'OFFLINE';
  rpm?: number;
  minRpm?: number;
  maxRpm?: number;
  batteryLevel?: number;
  signalStrength?: number;
  position?: string;
}

export interface EmployeeTapDetail {
  time: string;
  deviceId?: string;
  cardTap?: string;
  gapMinutes?: number;
  interval?: number;
}

export interface EmployeeHourlyMetric {
  hour: string;
  rounds: number;
  avgGapMinutes: number;
  taps?: EmployeeTapDetail[];
}

export interface EmployeeMetric {
  employeeId: string;
  employeeName?: string | null;
  machineId: string;
  machineName?: string;
  roundsCompleted: number;
  totalRounds?: number;
  expectedRounds?: number;
  avgGapMinutes: number;
  lastTapTime?: string | null;
  activeStatus?: 'ACTIVE' | 'IDLE' | 'ABSENT';
  taps?: EmployeeTapDetail[];
  hourly?: EmployeeHourlyMetric[];
}

export interface MachineMetric {
  machineId: string;
  machineName: string;
  rpm: number;
  efficiency: number;
  runtimeMinutes: number;
  status: 'RUN' | 'STOP' | 'DOFF' | 'OFFLINE';
  operatorName?: string;
  count?: string;
  production: number;
  targetProduction: number;
  wastePercent: number;
  endBreaks: number;
}

export interface DeviceGapTransition {
  fromDeviceId: string | null;
  toDeviceId: string | null;
  gapMinutes: number;
  roundNumber?: number;
  employeeId?: string | null;
  employeeName?: string | null;
  occurredAt?: string | null;
  label?: string;
}

export interface RoundGapEntry {
  roundNumber: number;
  employeeId?: string | null;
  employeeName?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMinutes: number;
  transitions: DeviceGapTransition[];
}

export interface MachineRoundPerformance {
  rounds: RoundGapEntry[];
  deviceGaps: DeviceGapTransition[];
  employees: Array<{
    employeeId: string | null;
    employeeName: string | null;
    completedRounds: number;
    totalGapMinutes: number;
    averageGapMinutes: number;
  }>;
  totalCompletedRounds: number;
  totalGapMinutes: number;
  averageGapMinutes: number;
}

export interface ReportFilter {
  reportType: 'rpm_efficiency' | 'employee_productivity' | 'downtime_modes' | 'duty_coverage' | 'cleaning_maintenance';
  machineId?: string;
  employeeId?: string;
  shiftId?: string;
  from?: string;
  to?: string;
}

export interface ReportResponse {
  success: boolean;
  reportType: string;
  title: string;
  data: any[];
  summary?: Record<string, any>;
}

export interface ProductionEntryInput {
  date: string;
  shiftId: string;
  machineId: string;
  employeeId: string;
  employeeName?: string;
  counts?: number | null;
  speed?: number | null;
  productionOutput: number | null;
  targetOutput?: number;
  wastePercent?: number;
  runtimeMinutes?: number;
  stoppageReason?: string;
  notes?: string;
}

export interface ProductionReportRow {
  entryId: string;
  date: string;
  enteredAt: string;
  shiftId: string;
  shiftName?: string;
  machineId: string;
  machineName?: string;
  stationIds?: string[];
  employeeId: string;
  employeeName: string;
  counts?: number | null;
  speed?: number | null;
  productionOutput: number;
  wastePercent?: number;
  runtimeMinutes?: number;
  targetOutput?: number;
  notes?: string;
}

export interface ProductionReportFilter {
  date?: string;
  shiftId?: string;
  machineId?: string;
  employeeId?: string;
}

export interface ProductionReportSummary {
  entries: number;
  totalProductionOutput: number;
  averageOutput: number;
  averageSpeed: number;
}

export interface SpinfoFrameStatus {
  totalMachines: number;
  reporting: number;
  running: number;
  stopped: number;
  offline: number;
  doffing?: number;
  runningPercent?: number;
  stoppedAndDoffing?: number;
  totalEndBreaks?: number;
  leftBreaks?: number;
  rightBreaks?: number;
}

export interface SpinfoPerformanceAndCare {
  averageRpm: number;
  totalEndBreaks: number;
  productionYieldPercent: number;
  completedRounds: number;
  sensorBoundBreaches: number;
  preventiveCleaningDue: number;
  outsideRpmCount?: number;
  productionYieldKg?: number;
  yieldAchievedPercent?: number;
  targetProductionKg?: number;
  totalRoundsScheduled?: number;
  skippedRounds?: number;
  incompleteRounds?: number;
  devicesInBounds?: number;
  totalDevices?: number;
  speedBreachAlerts?: number;
  preventiveCleaningDueCount?: number;
  dueMachineNames?: string[];
}

export interface SpinfoHourlyProductionItem {
  hour: any;
  timeLabel?: string;
  production: number;
  target?: number;
  isPeak?: boolean;
}

export interface SpinfoHourlyProduction {
  chart: SpinfoHourlyProductionItem[];
  totalProduction?: number;
  totalTarget?: number;
  shiftTotalKg?: number;
  peakHour?: string;
  avgPerHourKg?: number;
}

export interface SpinfoEndBreakItem {
  spindleNo: number;
  createdTime?: string;
  endMendingTime?: number;
  side?: 'L' | 'R';
  breakCount?: number;
  durationMinutes?: number;
  timestamp?: string;
}

export interface SpinfoMachineSide {
  side: 'L' | 'R';
  endMendingTime: number;
  endMendingTimeUnit: string;
  endBreakCount: number;
  endBreaks: SpinfoEndBreakItem[];
}

export interface SpinfoMachineSessionTap {
  tapNumber: number;
  badge: string;
  operatorName: string;
  time: string;
}

export interface SpinfoMachineSession {
  id: string;
  label: string;
  status: 'LOGGED_IN' | 'LOGGED_OUT';
  startedAt: string;
  taps: SpinfoMachineSessionTap[];
}

export interface SpinfoMachineItem {
  machineId: string;
  machineName?: string;
  statusBadge?: string;
  runStatus: 'RUN' | 'STOP' | 'DOFF' | 'OFFLINE';
  count: string;
  spindleSpeedCurrent: number;
  spindleSpeedUnit: string;
  speedStatus: string;
  speedBounds: { min: number; max: number };
  shiftWaste: number;
  wasteUnit: string;
  shiftProduction: number;
  shiftTargetProduction: number;
  productionUnit: string;
  totalEndBreakCount: number;
  yieldPercent?: number;
  breakSidesDisplay?: string;
  sides: SpinfoMachineSide[];
  operator: {
    name: string;
    badge: string;
    status?: string;
    session?: string;
    lastTap?: string;
    lastCardTap?: string;
  };
  rounds: {
    completed: number;
    expected?: number;
    total?: number;
    status?: string;
    skipped?: number;
    incomplete?: number;
  };
  sensorBounds: {
    status?: string;
    breaches?: number;
    inBounds?: number;
    total?: number;
  };
  cleaning: {
    status: string;
    nextDue?: string;
    nextDate?: string;
    intervalDays?: number;
  };
  sessions?: SpinfoMachineSession[];
}

export interface SpinfoSpeedCurveData {
  curvePoints: Array<{ time: string; rpm: number }>;
  minRecorded: number;
  average: number;
  peak: number;
}

export interface MachineHourProductionItem {
  hour: number;
  hourLabel: string;
  timeLabel: string;
  production: number;
}

export interface MachineShiftHourlyProduction {
  shift: number;
  shiftName: string;
  shiftTiming: string;
  shiftDate: string;
  hours: MachineHourProductionItem[];
}

export interface MachineHourlyProductionData {
  isAllShifts: boolean;
  selectedShift: string | number;
  grandTotalProduction: number;
  shifts: MachineShiftHourlyProduction[];
}

export interface SpinfoMachineDetailResponse {
  success: boolean;
  machine: SpinfoMachineItem;
  overview: {
    needsAttention: string;
    hasAttention: boolean;
    keyFigures: {
      endBreaks: { value: number; sub: string };
      averageRpm: { value: string; sub: string };
      yarnCount: { value: string; sub: string };
      productionYield: { value: string; sub: string };
      completedRounds: { value: string; sub: string };
      endMending?: { value: string; sub: string };
      sensorBounds: { value: string; sub: string };
      operatingMode: { value: string; sub: string };
      shiftWaste?: { value: string; sub: string };
      targetProduction?: { value: string; sub: string };
      nextCleaning: { value: string; sub: string };
    };
    operatingModeBreakdown: {
      totalMinutes: number;
      modes: Array<{ name: string; minutes: number; color: string }>;
    };
  };
  endBreaks: {
    leftSide: SpinfoEndBreakItem[];
    rightSide: SpinfoEndBreakItem[];
  };
  hourlyProduction?: MachineHourlyProductionData;
  speedAndSensors: {
    hourly?: SpinfoSpeedCurveData;
    daily?: SpinfoSpeedCurveData;
    weekly?: SpinfoSpeedCurveData;
    curvePoints: Array<{ time: string; rpm: number }>;
    minRecorded: number;
    average: number;
    peak: number;
    allowedMin: number;
    allowedMax: number;
    hourlyProduction?: MachineHourlyProductionData;
    devices: Array<{
      deviceId: string;
      position: string;
      rpm: number;
      status: string;
      limits: string;
      lastReported: string;
    }>;
  };
  roundsAndCleaning: {
    shiftRounds: Array<{
      round: number;
      window: string;
      operator: string;
      status: string;
      detail: string;
    }>;
    preventiveCleaning: {
      nextCleaning: string;
      interval: string;
      lastCleaning: string;
      duration: string;
      status: string;
    };
  };
}

export interface SpinfoOverviewResponse {
  success: boolean;
  dataTime: string;
  shiftDate: string;
  shift: number;
  frameStatus: SpinfoFrameStatus;
  performanceAndCare: SpinfoPerformanceAndCare;
  hourlyProduction: SpinfoHourlyProduction;
  machines: SpinfoMachineItem[];
}

export interface Company {
  _id?: string;
  name: string;
  slug: string;
  active: boolean;
  description?: string;
}

