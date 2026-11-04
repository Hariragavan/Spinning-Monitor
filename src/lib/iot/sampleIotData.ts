import {
  SpinfoOverviewResponse,
  SpinfoMachineItem,
  SpinfoMachineDetailResponse,
  Employee,
  Machine,
  MachineMapping,
  Shift,
  MaintenanceEntry,
  DeviceHealth,
  EmployeeMetric,
  ProductionReportRow
} from '@/types/iot';

export const SAMPLE_EMPLOYEES: Employee[] = [
  { employeeId: 'EMP001', employeeName: 'Senthil Kumar', assignedDeviceIds: ['DEV_M1_01', 'DEV_M1_02', 'DEV_M1_03'], lastSeen: '2026-10-26T12:30:00Z' },
  { employeeId: 'EMP002', employeeName: 'Murugan R', assignedDeviceIds: ['DEV_M2_01', 'DEV_M2_02', 'DEV_M2_03'], lastSeen: '2026-10-26T12:28:00Z' },
  { employeeId: 'EMP003', employeeName: 'Muthukumar P', assignedDeviceIds: ['DEV_M3_01', 'DEV_M3_02'], lastSeen: '2026-10-26T12:20:00Z' },
  { employeeId: 'EMP004', employeeName: 'Palanisamy K', assignedDeviceIds: ['DEV_M4_01', 'DEV_M4_02'], lastSeen: '2026-10-26T12:15:00Z' },
  { employeeId: 'EMP005', employeeName: 'Ramasamy V', assignedDeviceIds: ['DEV_M5_01', 'DEV_M5_02'], lastSeen: '2026-10-26T12:25:00Z' },
  { employeeId: 'EMP006', employeeName: 'Karuppasamy S', assignedDeviceIds: ['DEV_M6_01', 'DEV_M6_02'], lastSeen: '2026-10-26T12:10:00Z' },
];

export const SAMPLE_SHIFTS: Shift[] = [
  { shiftId: 'shift_1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', overnight: false },
  { shiftId: 'shift_2', name: 'Shift 2', startTime: '14:00', endTime: '22:00', overnight: false },
  { shiftId: 'shift_3', name: 'Shift 3', startTime: '22:00', endTime: '06:00', overnight: true },
];

export const SAMPLE_MACHINES: Machine[] = [
  { machineId: 'RF01', machineName: 'Ring Frame 01', cleaningIntervalDays: 2, expectedProductionOutput: 98, expectedRuntimeMinutes: 460, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M1_01', 'DEV_M1_02', 'DEV_M1_03'] },
  { machineId: 'RF02', machineName: 'Ring Frame 02', cleaningIntervalDays: 2, expectedProductionOutput: 98, expectedRuntimeMinutes: 460, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M2_01', 'DEV_M2_02', 'DEV_M2_03'] },
  { machineId: 'RF03', machineName: 'Ring Frame 03', cleaningIntervalDays: 3, expectedProductionOutput: 95, expectedRuntimeMinutes: 450, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M3_01', 'DEV_M3_02'] },
  { machineId: 'RF04', machineName: 'Ring Frame 04', cleaningIntervalDays: 2, expectedProductionOutput: 102, expectedRuntimeMinutes: 470, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M4_01', 'DEV_M4_02'] },
  { machineId: 'RF05', machineName: 'Ring Frame 05', cleaningIntervalDays: 2, expectedProductionOutput: 96, expectedRuntimeMinutes: 455, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M5_01', 'DEV_M5_02'] },
  { machineId: 'RF06', machineName: 'Ring Frame 06', cleaningIntervalDays: 3, expectedProductionOutput: 94, expectedRuntimeMinutes: 440, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M6_01', 'DEV_M6_02'] },
  { machineId: 'RF07', machineName: 'Ring Frame 07', cleaningIntervalDays: 2, expectedProductionOutput: 100, expectedRuntimeMinutes: 465, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M7_01', 'DEV_M7_02'] },
  { machineId: 'RF08', machineName: 'Ring Frame 08', cleaningIntervalDays: 2, expectedProductionOutput: 98, expectedRuntimeMinutes: 460, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M8_01', 'DEV_M8_02'] },
  { machineId: 'RF09', machineName: 'Ring Frame 09', cleaningIntervalDays: 2, expectedProductionOutput: 95, expectedRuntimeMinutes: 450, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M9_01', 'DEV_M9_02'] },
  { machineId: 'RF10', machineName: 'Ring Frame 10', cleaningIntervalDays: 2, expectedProductionOutput: 96, expectedRuntimeMinutes: 455, expectedRoundsPerHour: 10, roundDeviceSequence: ['DEV_M10_01', 'DEV_M10_02'] },
];

export const SAMPLE_MAPPINGS: MachineMapping[] = [
  { mappingId: 'map_rf01', name: 'RF01 - Ring Frame 1', stationIds: ['DEV_M1_01', 'DEV_M1_02', 'DEV_M1_03'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf02', name: 'RF02 - Ring Frame 2', stationIds: ['DEV_M2_01', 'DEV_M2_02', 'DEV_M2_03'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf03', name: 'RF03 - Ring Frame 3', stationIds: ['DEV_M3_01', 'DEV_M3_02'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf04', name: 'RF04 - Ring Frame 4', stationIds: ['DEV_M4_01', 'DEV_M4_02'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf05', name: 'RF05 - Ring Frame 5', stationIds: ['DEV_M5_01', 'DEV_M5_02'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf06', name: 'RF06 - Ring Frame 6', stationIds: ['DEV_M6_01', 'DEV_M6_02'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf07', name: 'RF07 - Ring Frame 7', stationIds: ['DEV_M7_01', 'DEV_M7_02'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf08', name: 'RF08 - Ring Frame 8', stationIds: ['DEV_M8_01', 'DEV_M8_02'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf09', name: 'RF09 - Ring Frame 9', stationIds: ['DEV_M9_01', 'DEV_M9_02'], createdAt: '2026-10-01' },
  { mappingId: 'map_rf10', name: 'RF10 - Ring Frame 10', stationIds: ['DEV_M10_01', 'DEV_M10_02'], createdAt: '2026-10-01' },
];

export const SAMPLE_DEVICES: DeviceHealth[] = [
  { deviceId: 'DEV_M1_01', machineId: 'RF01', lastSeen: 'Just now', status: 'HEALTHY', rpm: 16695, minRpm: 15000, maxRpm: 17200, batteryLevel: 98, signalStrength: -58, position: 'Headstock Tap 1' },
  { deviceId: 'DEV_M1_02', machineId: 'RF01', lastSeen: 'Just now', status: 'HEALTHY', rpm: 16680, minRpm: 15000, maxRpm: 17200, batteryLevel: 94, signalStrength: -62, position: 'Middle Tap 2' },
  { deviceId: 'DEV_M1_03', machineId: 'RF01', lastSeen: 'Just now', status: 'HEALTHY', rpm: 16700, minRpm: 15000, maxRpm: 17200, batteryLevel: 91, signalStrength: -60, position: 'Endstock Tap 3' },
  { deviceId: 'DEV_M2_01', machineId: 'RF02', lastSeen: 'Just now', status: 'HEALTHY', rpm: 16820, minRpm: 15000, maxRpm: 17200, batteryLevel: 95, signalStrength: -55, position: 'Headstock Tap 1' },
  { deviceId: 'DEV_M2_02', machineId: 'RF02', lastSeen: 'Just now', status: 'HEALTHY', rpm: 16810, minRpm: 15000, maxRpm: 17200, batteryLevel: 88, signalStrength: -65, position: 'Middle Tap 2' },
  { deviceId: 'DEV_M2_03', machineId: 'RF02', lastSeen: 'Just now', status: 'HEALTHY', rpm: 16830, minRpm: 15000, maxRpm: 17200, batteryLevel: 92, signalStrength: -59, position: 'Endstock Tap 3' },
  { deviceId: 'DEV_M3_01', machineId: 'RF03', lastSeen: '1 min ago', status: 'HEALTHY', rpm: 15450, minRpm: 15000, maxRpm: 17200, batteryLevel: 85, signalStrength: -70, position: 'Headstock Tap 1' },
  { deviceId: 'DEV_M3_02', machineId: 'RF03', lastSeen: '1 min ago', status: 'HEALTHY', rpm: 15430, minRpm: 15000, maxRpm: 17200, batteryLevel: 89, signalStrength: -68, position: 'Endstock Tap 2' },
  { deviceId: 'DEV_M4_01', machineId: 'RF04', lastSeen: 'Just now', status: 'HEALTHY', rpm: 16750, minRpm: 15000, maxRpm: 17200, batteryLevel: 96, signalStrength: -54, position: 'Headstock Tap 1' },
  { deviceId: 'DEV_M5_01', machineId: 'RF05', lastSeen: 'Just now', status: 'HEALTHY', rpm: 16620, minRpm: 15000, maxRpm: 17200, batteryLevel: 90, signalStrength: -63, position: 'Headstock Tap 1' },
  { deviceId: 'DEV_M6_01', machineId: 'RF06', lastSeen: '15 mins ago', status: 'DEGRADED', rpm: 0, minRpm: 15000, maxRpm: 17200, batteryLevel: 45, signalStrength: -82, position: 'Headstock Tap 1' },
];

export const SAMPLE_MAINTENANCE: MaintenanceEntry[] = [
  { maintenanceId: 'mnt_01', type: 'preventive', machineId: 'RF01', deviceId: 'DEV_M1_01', title: 'Top Roller Greasing & Apron Inspection', scheduledDate: new Date().toISOString().slice(0, 10), assignedPerson: 'Senthil K (Fitter)', status: 'planned', notes: 'Scheduled bi-weekly preventative cleaning & lubrication' },
  { maintenanceId: 'mnt_02', type: 'electrical', machineId: 'RF03', deviceId: 'DEV_M3_01', title: 'Inverter Drive Frequency Calibration', scheduledDate: new Date().toISOString().slice(0, 10), assignedPerson: 'Gopal R (Electrician)', status: 'planned', notes: 'Motor inverter RPM stabilization check' },
  { maintenanceId: 'mnt_03', type: 'preventive', machineId: 'RF06', deviceId: 'DEV_M6_01', title: 'Spindle Tape Tensioning & Cleaning', scheduledDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), assignedPerson: 'Palanisamy K', status: 'completed', completionDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10), notes: 'Completed full tape replacement and spindle alignment' },
  { maintenanceId: 'mnt_04', type: 'preventive', machineId: 'RF02', deviceId: 'DEV_M2_01', title: 'Ring Rail Alignment & Doffer Hook Check', scheduledDate: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10), assignedPerson: 'Murugan R', status: 'planned', notes: 'Routine check before new count change' },
];

export const SAMPLE_PRODUCTION_ENTRIES: ProductionReportRow[] = [
  { entryId: 'pe_01', date: new Date().toISOString().slice(0, 10), enteredAt: new Date().toISOString(), shiftId: 'shift_1', shiftName: 'Shift 1', machineId: 'RF01', machineName: 'Ring Frame 01', stationIds: ['DEV_M1_01', 'DEV_M1_02'], employeeId: 'EMP001', employeeName: 'Senthil Kumar', counts: 40, speed: 16695, productionOutput: 92.5, targetOutput: 98.4, wastePercent: 1.4, runtimeMinutes: 462, notes: 'Smooth operation, minimal end breaks' },
  { entryId: 'pe_02', date: new Date().toISOString().slice(0, 10), enteredAt: new Date().toISOString(), shiftId: 'shift_1', shiftName: 'Shift 1', machineId: 'RF02', machineName: 'Ring Frame 02', stationIds: ['DEV_M2_01', 'DEV_M2_02'], employeeId: 'EMP002', employeeName: 'Murugan R', counts: 30, speed: 16820, productionOutput: 96.0, targetOutput: 98.4, wastePercent: 1.2, runtimeMinutes: 470, notes: 'Target achieved' },
  { entryId: 'pe_03', date: new Date().toISOString().slice(0, 10), enteredAt: new Date().toISOString(), shiftId: 'shift_1', shiftName: 'Shift 1', machineId: 'RF03', machineName: 'Ring Frame 03', stationIds: ['DEV_M3_01', 'DEV_M3_02'], employeeId: 'EMP003', employeeName: 'Muthukumar P', counts: 34, speed: 15450, productionOutput: 84.2, targetOutput: 95.0, wastePercent: 2.1, runtimeMinutes: 420, notes: 'Slight stoppage for doffing delay' },
  { entryId: 'pe_04', date: new Date().toISOString().slice(0, 10), enteredAt: new Date().toISOString(), shiftId: 'shift_1', shiftName: 'Shift 1', machineId: 'RF04', machineName: 'Ring Frame 04', stationIds: ['DEV_M4_01'], employeeId: 'EMP004', employeeName: 'Palanisamy K', counts: 40, speed: 16750, productionOutput: 94.8, targetOutput: 98.4, wastePercent: 1.3, runtimeMinutes: 465, notes: 'Good output' },
];

export const SAMPLE_EMPLOYEE_METRICS: EmployeeMetric[] = [
  {
    employeeId: 'EMP001',
    employeeName: 'Senthil Kumar',
    machineId: 'RF01',
    machineName: 'Ring Frame 01',
    roundsCompleted: 14,
    totalRounds: 14,
    expectedRounds: 16,
    avgGapMinutes: 28.5,
    lastTapTime: '12:30',
    activeStatus: 'ACTIVE',
    taps: [
      { time: '06:15', deviceId: 'DEV_M1_01', cardTap: '1001', gapMinutes: 0 },
      { time: '06:45', deviceId: 'DEV_M1_02', cardTap: '1002', gapMinutes: 30 },
      { time: '07:12', deviceId: 'DEV_M1_03', cardTap: '1003', gapMinutes: 27 },
      { time: '07:40', deviceId: 'DEV_M1_01', cardTap: '1004', gapMinutes: 28 },
      { time: '08:10', deviceId: 'DEV_M1_02', cardTap: '1005', gapMinutes: 30 },
      { time: '08:38', deviceId: 'DEV_M1_03', cardTap: '1006', gapMinutes: 28 },
      { time: '09:05', deviceId: 'DEV_M1_01', cardTap: '1007', gapMinutes: 27 },
      { time: '09:35', deviceId: 'DEV_M1_02', cardTap: '1008', gapMinutes: 30 },
      { time: '10:02', deviceId: 'DEV_M1_03', cardTap: '1009', gapMinutes: 27 },
      { time: '10:30', deviceId: 'DEV_M1_01', cardTap: '1010', gapMinutes: 28 },
      { time: '11:00', deviceId: 'DEV_M1_02', cardTap: '1011', gapMinutes: 30 },
      { time: '11:30', deviceId: 'DEV_M1_03', cardTap: '1012', gapMinutes: 30 },
      { time: '12:00', deviceId: 'DEV_M1_01', cardTap: '1013', gapMinutes: 30 },
      { time: '12:30', deviceId: 'DEV_M1_02', cardTap: '1014', gapMinutes: 30 },
    ],
    hourly: [
      { hour: '06:00', rounds: 2, avgGapMinutes: 29 },
      { hour: '07:00', rounds: 2, avgGapMinutes: 28 },
      { hour: '08:00', rounds: 2, avgGapMinutes: 29 },
      { hour: '09:00', rounds: 2, avgGapMinutes: 28.5 },
      { hour: '10:00', rounds: 2, avgGapMinutes: 28 },
      { hour: '11:00', rounds: 2, avgGapMinutes: 30 },
      { hour: '12:00', rounds: 2, avgGapMinutes: 30 },
    ]
  },
  {
    employeeId: 'EMP002',
    employeeName: 'Murugan R',
    machineId: 'RF02',
    machineName: 'Ring Frame 02',
    roundsCompleted: 15,
    totalRounds: 15,
    expectedRounds: 16,
    avgGapMinutes: 26.2,
    lastTapTime: '12:28',
    activeStatus: 'ACTIVE',
    taps: [
      { time: '06:10', deviceId: 'DEV_M2_01', cardTap: '2001', gapMinutes: 0 },
      { time: '06:36', deviceId: 'DEV_M2_02', cardTap: '2002', gapMinutes: 26 },
      { time: '07:02', deviceId: 'DEV_M2_03', cardTap: '2003', gapMinutes: 26 },
      { time: '07:28', deviceId: 'DEV_M2_01', cardTap: '2004', gapMinutes: 26 },
      { time: '07:55', deviceId: 'DEV_M2_02', cardTap: '2005', gapMinutes: 27 },
      { time: '08:22', deviceId: 'DEV_M2_03', cardTap: '2006', gapMinutes: 27 },
      { time: '08:48', deviceId: 'DEV_M2_01', cardTap: '2007', gapMinutes: 26 },
      { time: '09:14', deviceId: 'DEV_M2_02', cardTap: '2008', gapMinutes: 26 },
      { time: '09:40', deviceId: 'DEV_M2_03', cardTap: '2009', gapMinutes: 26 },
      { time: '10:06', deviceId: 'DEV_M2_01', cardTap: '2010', gapMinutes: 26 },
      { time: '10:32', deviceId: 'DEV_M2_02', cardTap: '2011', gapMinutes: 26 },
      { time: '11:00', deviceId: 'DEV_M2_03', cardTap: '2012', gapMinutes: 28 },
      { time: '11:28', deviceId: 'DEV_M2_01', cardTap: '2013', gapMinutes: 28 },
      { time: '11:58', deviceId: 'DEV_M2_02', cardTap: '2014', gapMinutes: 30 },
      { time: '12:28', deviceId: 'DEV_M2_03', cardTap: '2015', gapMinutes: 30 },
    ],
    hourly: [
      { hour: '06:00', rounds: 2, avgGapMinutes: 26 },
      { hour: '07:00', rounds: 3, avgGapMinutes: 26.3 },
      { hour: '08:00', rounds: 2, avgGapMinutes: 26.5 },
      { hour: '09:00', rounds: 2, avgGapMinutes: 26 },
      { hour: '10:00', rounds: 2, avgGapMinutes: 26 },
      { hour: '11:00', rounds: 2, avgGapMinutes: 28 },
      { hour: '12:00', rounds: 2, avgGapMinutes: 30 },
    ]
  },
  {
    employeeId: 'EMP003',
    employeeName: 'Muthukumar P',
    machineId: 'RF03',
    machineName: 'Ring Frame 03',
    roundsCompleted: 11,
    totalRounds: 11,
    expectedRounds: 16,
    avgGapMinutes: 34.8,
    lastTapTime: '12:20',
    activeStatus: 'ACTIVE',
    taps: [
      { time: '06:20', deviceId: 'DEV_M3_01', cardTap: '3001', gapMinutes: 0 },
      { time: '06:55', deviceId: 'DEV_M3_02', cardTap: '3002', gapMinutes: 35 },
      { time: '07:30', deviceId: 'DEV_M3_01', cardTap: '3003', gapMinutes: 35 },
      { time: '08:08', deviceId: 'DEV_M3_02', cardTap: '3004', gapMinutes: 38 },
      { time: '08:45', deviceId: 'DEV_M3_01', cardTap: '3005', gapMinutes: 37 },
      { time: '09:20', deviceId: 'DEV_M3_02', cardTap: '3006', gapMinutes: 35 },
      { time: '09:55', deviceId: 'DEV_M3_01', cardTap: '3007', gapMinutes: 35 },
      { time: '10:32', deviceId: 'DEV_M3_02', cardTap: '3008', gapMinutes: 37 },
      { time: '11:10', deviceId: 'DEV_M3_01', cardTap: '3009', gapMinutes: 38 },
      { time: '11:45', deviceId: 'DEV_M3_02', cardTap: '3010', gapMinutes: 35 },
      { time: '12:20', deviceId: 'DEV_M3_01', cardTap: '3011', gapMinutes: 35 },
    ],
    hourly: [
      { hour: '06:00', rounds: 2, avgGapMinutes: 35 },
      { hour: '07:00', rounds: 1, avgGapMinutes: 35 },
      { hour: '08:00', rounds: 2, avgGapMinutes: 37.5 },
      { hour: '09:00', rounds: 2, avgGapMinutes: 35 },
      { hour: '10:00', rounds: 1, avgGapMinutes: 37 },
      { hour: '11:00', rounds: 2, avgGapMinutes: 36.5 },
      { hour: '12:00', rounds: 1, avgGapMinutes: 35 },
    ]
  },
  {
    employeeId: 'EMP004',
    employeeName: 'Palanisamy K',
    machineId: 'RF04',
    machineName: 'Ring Frame 04',
    roundsCompleted: 13,
    totalRounds: 13,
    expectedRounds: 16,
    avgGapMinutes: 29.8,
    lastTapTime: '12:15',
    activeStatus: 'ACTIVE',
    taps: [
      { time: '06:12', deviceId: 'DEV_M4_01', cardTap: '4001', gapMinutes: 0 },
      { time: '06:42', deviceId: 'DEV_M4_02', cardTap: '4002', gapMinutes: 30 },
      { time: '07:11', deviceId: 'DEV_M4_01', cardTap: '4003', gapMinutes: 29 },
      { time: '07:40', deviceId: 'DEV_M4_02', cardTap: '4004', gapMinutes: 29 },
      { time: '08:12', deviceId: 'DEV_M4_01', cardTap: '4005', gapMinutes: 32 },
      { time: '08:42', deviceId: 'DEV_M4_02', cardTap: '4006', gapMinutes: 30 },
      { time: '09:10', deviceId: 'DEV_M4_01', cardTap: '4007', gapMinutes: 28 },
      { time: '09:40', deviceId: 'DEV_M4_02', cardTap: '4008', gapMinutes: 30 },
      { time: '10:10', deviceId: 'DEV_M4_01', cardTap: '4009', gapMinutes: 30 },
      { time: '10:40', deviceId: 'DEV_M4_02', cardTap: '4010', gapMinutes: 30 },
      { time: '11:12', deviceId: 'DEV_M4_01', cardTap: '4011', gapMinutes: 32 },
      { time: '11:42', deviceId: 'DEV_M4_02', cardTap: '4012', gapMinutes: 30 },
      { time: '12:15', deviceId: 'DEV_M4_01', cardTap: '4013', gapMinutes: 33 },
    ]
  }
];

export function getSampleSpinfoOverview(filter?: {
  shift?: string;
  operator?: string;
  fromDate?: string;
  toDate?: string;
}): SpinfoOverviewResponse {
  const machines: SpinfoMachineItem[] = [
    {
      machineId: 'RF01',
      runStatus: 'RUN',
      count: '40s Combed',
      spindleSpeedCurrent: 16695,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Normal within limits',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 1.4,
      wasteUnit: '%',
      shiftProduction: 92.5,
      shiftTargetProduction: 98.4,
      productionUnit: 'kg',
      totalEndBreakCount: 2,
      sides: [
        {
          side: 'L',
          endMendingTime: 1.25,
          endMendingTimeUnit: 'min',
          endBreakCount: 1,
          endBreaks: [{ spindleNo: 18, createdTime: '2026-10-26 10:15:20', endMendingTime: 1.25, side: 'L' }]
        },
        {
          side: 'R',
          endMendingTime: 1.40,
          endMendingTimeUnit: 'min',
          endBreakCount: 1,
          endBreaks: [{ spindleNo: 74, createdTime: '2026-10-26 11:22:10', endMendingTime: 1.40, side: 'R' }]
        }
      ],
      operator: {
        name: 'Senthil Kumar',
        badge: '#24534',
        status: 'Active on floor',
        lastCardTap: '12:30'
      },
      rounds: {
        completed: 14,
        expected: 16,
        status: 'On track (87.5%)'
      },
      sensorBounds: {
        status: 'Stable',
        breaches: 0
      },
      cleaning: {
        status: 'Due today',
        nextDue: '2026-10-26',
        intervalDays: 2
      }
    },
    {
      machineId: 'RF02',
      runStatus: 'RUN',
      count: '30s Hosiery PC',
      spindleSpeedCurrent: 16820,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Optimal peak speed',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 1.2,
      wasteUnit: '%',
      shiftProduction: 96.0,
      shiftTargetProduction: 98.4,
      productionUnit: 'kg',
      totalEndBreakCount: 1,
      sides: [
        {
          side: 'L',
          endMendingTime: 1.10,
          endMendingTimeUnit: 'min',
          endBreakCount: 0,
          endBreaks: []
        },
        {
          side: 'R',
          endMendingTime: 1.30,
          endMendingTimeUnit: 'min',
          endBreakCount: 1,
          endBreaks: [{ spindleNo: 42, createdTime: '2026-10-26 09:40:00', endMendingTime: 1.30, side: 'R' }]
        }
      ],
      operator: {
        name: 'Murugan R',
        badge: '#24512',
        status: 'Active on floor',
        lastCardTap: '12:28'
      },
      rounds: {
        completed: 15,
        expected: 16,
        status: 'Excellent (93.8%)'
      },
      sensorBounds: {
        status: 'Stable',
        breaches: 0
      },
      cleaning: {
        status: 'Completed',
        nextDue: '2026-10-28',
        intervalDays: 2
      }
    },
    {
      machineId: 'RF03',
      runStatus: 'RUN',
      count: '34s PV Yarn',
      spindleSpeedCurrent: 15450,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Low speed warning',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 2.1,
      wasteUnit: '%',
      shiftProduction: 84.2,
      shiftTargetProduction: 95.0,
      productionUnit: 'kg',
      totalEndBreakCount: 6,
      sides: [
        {
          side: 'L',
          endMendingTime: 1.80,
          endMendingTimeUnit: 'min',
          endBreakCount: 4,
          endBreaks: [
            { spindleNo: 12, createdTime: '2026-10-26 07:10:00', endMendingTime: 1.8, side: 'L' },
            { spindleNo: 15, createdTime: '2026-10-26 08:35:00', endMendingTime: 2.0, side: 'L' },
            { spindleNo: 88, createdTime: '2026-10-26 10:12:00', endMendingTime: 1.6, side: 'L' },
            { spindleNo: 104, createdTime: '2026-10-26 11:45:00', endMendingTime: 1.7, side: 'L' },
          ]
        },
        {
          side: 'R',
          endMendingTime: 1.65,
          endMendingTimeUnit: 'min',
          endBreakCount: 2,
          endBreaks: [
            { spindleNo: 34, createdTime: '2026-10-26 09:20:00', endMendingTime: 1.5, side: 'R' },
            { spindleNo: 62, createdTime: '2026-10-26 11:05:00', endMendingTime: 1.8, side: 'R' },
          ]
        }
      ],
      operator: {
        name: 'Muthukumar P',
        badge: '#24890',
        status: 'High break alerts',
        lastCardTap: '12:20'
      },
      rounds: {
        completed: 11,
        expected: 16,
        status: 'Attention (68.7%)'
      },
      sensorBounds: {
        status: '2 Limit Breaches',
        breaches: 2
      },
      cleaning: {
        status: 'Overdue',
        nextDue: '2026-10-25',
        intervalDays: 3
      }
    },
    {
      machineId: 'RF04',
      runStatus: 'RUN',
      count: '40s Micro Weft',
      spindleSpeedCurrent: 16750,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Normal within limits',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 1.3,
      wasteUnit: '%',
      shiftProduction: 94.8,
      shiftTargetProduction: 98.4,
      productionUnit: 'kg',
      totalEndBreakCount: 3,
      sides: [
        {
          side: 'L',
          endMendingTime: 1.20,
          endMendingTimeUnit: 'min',
          endBreakCount: 2,
          endBreaks: [
            { spindleNo: 23, createdTime: '2026-10-26 08:15:00', endMendingTime: 1.2, side: 'L' },
            { spindleNo: 57, createdTime: '2026-10-26 11:02:00', endMendingTime: 1.3, side: 'L' }
          ]
        },
        {
          side: 'R',
          endMendingTime: 1.45,
          endMendingTimeUnit: 'min',
          endBreakCount: 1,
          endBreaks: [{ spindleNo: 81, createdTime: '2026-10-26 09:12:00', endMendingTime: 1.45, side: 'R' }]
        }
      ],
      operator: {
        name: 'Palanisamy K',
        badge: '#24701',
        status: 'Active on floor',
        lastCardTap: '12:15'
      },
      rounds: {
        completed: 13,
        expected: 16,
        status: 'On track (81.2%)'
      },
      sensorBounds: {
        status: 'Stable',
        breaches: 0
      },
      cleaning: {
        status: 'Planned for tomorrow',
        nextDue: '2026-10-27',
        intervalDays: 2
      }
    },
    {
      machineId: 'RF05',
      runStatus: 'RUN',
      count: '42s Comb Hosiery',
      spindleSpeedCurrent: 16620,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Normal within limits',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 1.5,
      wasteUnit: '%',
      shiftProduction: 91.2,
      shiftTargetProduction: 96.0,
      productionUnit: 'kg',
      totalEndBreakCount: 2,
      sides: [
        { side: 'L', endMendingTime: 1.3, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 11, createdTime: '2026-10-26 09:15:00', endMendingTime: 1.3, side: 'L' }] },
        { side: 'R', endMendingTime: 1.4, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 64, createdTime: '2026-10-26 10:45:00', endMendingTime: 1.4, side: 'R' }] }
      ],
      operator: { name: 'Ramasamy V', badge: '#24618', status: 'Active on floor', lastCardTap: '12:25' },
      rounds: { completed: 14, expected: 16, status: 'On track (87.5%)' },
      sensorBounds: { status: 'Stable', breaches: 0 },
      cleaning: { status: 'Due in 2 days', nextDue: '2026-10-28', intervalDays: 2 }
    },
    {
      machineId: 'RF06',
      runStatus: 'STOP',
      count: '38s Comb Hosiery',
      spindleSpeedCurrent: 0,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Stopped for Maintenance',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 2.8,
      wasteUnit: '%',
      shiftProduction: 42.0,
      shiftTargetProduction: 94.0,
      productionUnit: 'kg',
      totalEndBreakCount: 4,
      sides: [
        { side: 'L', endMendingTime: 2.5, endMendingTimeUnit: 'min', endBreakCount: 3, endBreaks: [{ spindleNo: 45, createdTime: '2026-10-26 10:00:00', endMendingTime: 2.5, side: 'L' }] },
        { side: 'R', endMendingTime: 2.1, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 92, createdTime: '2026-10-26 10:15:00', endMendingTime: 2.1, side: 'R' }] }
      ],
      operator: { name: 'Karuppasamy S', badge: '#24905', status: 'Stoppage logged', lastCardTap: '12:10' },
      rounds: { completed: 6, expected: 16, status: 'Halted (37.5%)' },
      sensorBounds: { status: 'Alert: Low RPM', breaches: 1 },
      cleaning: { status: 'Maintenance Ongoing', nextDue: '2026-10-26', intervalDays: 3 }
    },
    {
      machineId: 'RF07',
      runStatus: 'DOFF',
      count: '50s Compact',
      spindleSpeedCurrent: 2400,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Doffing Cycle in progress',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 1.1,
      wasteUnit: '%',
      shiftProduction: 98.2,
      shiftTargetProduction: 100.0,
      productionUnit: 'kg',
      totalEndBreakCount: 1,
      sides: [
        { side: 'L', endMendingTime: 1.1, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 8, createdTime: '2026-10-26 11:30:00', endMendingTime: 1.1, side: 'L' }] },
        { side: 'R', endMendingTime: 0, endMendingTimeUnit: 'min', endBreakCount: 0, endBreaks: [] }
      ],
      operator: { name: 'Senthil Kumar', badge: '#24534', status: 'Doffing operator', lastCardTap: '12:30' },
      rounds: { completed: 15, expected: 16, status: 'Excellent (93.8%)' },
      sensorBounds: { status: 'Stable', breaches: 0 },
      cleaning: { status: 'Completed', nextDue: '2026-10-29', intervalDays: 2 }
    },
    {
      machineId: 'RF08',
      runStatus: 'RUN',
      count: '60s Super Combed',
      spindleSpeedCurrent: 16780,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Normal within limits',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 1.3,
      wasteUnit: '%',
      shiftProduction: 95.4,
      shiftTargetProduction: 98.0,
      productionUnit: 'kg',
      totalEndBreakCount: 2,
      sides: [
        { side: 'L', endMendingTime: 1.3, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 50, createdTime: '2026-10-26 09:10:00', endMendingTime: 1.3, side: 'L' }] },
        { side: 'R', endMendingTime: 1.2, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 72, createdTime: '2026-10-26 10:20:00', endMendingTime: 1.2, side: 'R' }] }
      ],
      operator: { name: 'Murugan R', badge: '#24512', status: 'Active on floor', lastCardTap: '12:28' },
      rounds: { completed: 14, expected: 16, status: 'On track (87.5%)' },
      sensorBounds: { status: 'Stable', breaches: 0 },
      cleaning: { status: 'Due in 2 days', nextDue: '2026-10-28', intervalDays: 2 }
    },
    {
      machineId: 'RF09',
      runStatus: 'RUN',
      count: '32s Weft Weaving',
      spindleSpeedCurrent: 16550,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Normal within limits',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 1.4,
      wasteUnit: '%',
      shiftProduction: 93.0,
      shiftTargetProduction: 95.0,
      productionUnit: 'kg',
      totalEndBreakCount: 2,
      sides: [
        { side: 'L', endMendingTime: 1.2, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 19, createdTime: '2026-10-26 08:30:00', endMendingTime: 1.2, side: 'L' }] },
        { side: 'R', endMendingTime: 1.3, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 84, createdTime: '2026-10-26 11:15:00', endMendingTime: 1.3, side: 'R' }] }
      ],
      operator: { name: 'Muthukumar P', badge: '#24890', status: 'Active on floor', lastCardTap: '12:20' },
      rounds: { completed: 13, expected: 16, status: 'On track (81.2%)' },
      sensorBounds: { status: 'Stable', breaches: 0 },
      cleaning: { status: 'Completed', nextDue: '2026-10-28', intervalDays: 2 }
    },
    {
      machineId: 'RF10',
      runStatus: 'RUN',
      count: '34s Compact Weft',
      spindleSpeedCurrent: 16640,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'Normal within limits',
      speedBounds: { min: 15000, max: 17200 },
      shiftWaste: 1.2,
      wasteUnit: '%',
      shiftProduction: 94.2,
      shiftTargetProduction: 96.0,
      productionUnit: 'kg',
      totalEndBreakCount: 1,
      sides: [
        { side: 'L', endMendingTime: 1.3, endMendingTimeUnit: 'min', endBreakCount: 0, endBreaks: [] },
        { side: 'R', endMendingTime: 1.2, endMendingTimeUnit: 'min', endBreakCount: 1, endBreaks: [{ spindleNo: 29, createdTime: '2026-10-26 10:50:00', endMendingTime: 1.2, side: 'R' }] }
      ],
      operator: { name: 'Palanisamy K', badge: '#24701', status: 'Active on floor', lastCardTap: '12:15' },
      rounds: { completed: 14, expected: 16, status: 'On track (87.5%)' },
      sensorBounds: { status: 'Stable', breaches: 0 },
      cleaning: { status: 'Due today', nextDue: '2026-10-26', intervalDays: 2 }
    }
  ];

  let filteredMachines = [...machines];
  if (filter?.operator) {
    filteredMachines = filteredMachines.filter(m => m.operator?.name === filter.operator);
  }

  const runningCount = filteredMachines.filter(m => m.runStatus === 'RUN').length;
  const stoppedCount = filteredMachines.filter(m => m.runStatus === 'STOP').length;
  const doffingCount = filteredMachines.filter(m => m.runStatus === 'DOFF').length;
  const offlineCount = filteredMachines.filter(m => m.runStatus === 'OFFLINE').length;
  const reportingCount = filteredMachines.length - offlineCount;

  const totalProduction = filteredMachines.reduce((sum, m) => sum + m.shiftProduction, 0);
  const totalTarget = filteredMachines.reduce((sum, m) => sum + m.shiftTargetProduction, 0);
  const avgRpm = Math.round(filteredMachines.filter(m => m.runStatus === 'RUN').reduce((sum, m) => sum + m.spindleSpeedCurrent, 0) / (runningCount || 1));
  const totalBreaks = filteredMachines.reduce((sum, m) => sum + m.totalEndBreakCount, 0);
  const completedRoundsTotal = filteredMachines.reduce((sum, m) => sum + m.rounds.completed, 0);
  const totalBoundBreaches = filteredMachines.reduce((sum, m) => sum + m.sensorBounds.breaches, 0);
  const cleaningDueCount = filteredMachines.filter(m => m.cleaning.status === 'Due today' || m.cleaning.status === 'Overdue').length;

  const runningPercent = reportingCount ? Math.round((runningCount / reportingCount) * 100) : 0;
  const stoppedAndDoffing = stoppedCount + doffingCount;
  const leftBreaks = Math.round(totalBreaks * 0.52);
  const rightBreaks = totalBreaks - leftBreaks;
  const outsideRpmCount = filteredMachines.filter(m => m.runStatus === 'RUN' && (m.spindleSpeedCurrent < 15000 || m.spindleSpeedCurrent > 17000)).length;
  const yieldPct = Math.round((totalProduction / (totalTarget || 1)) * 100);
  const totalRoundsScheduled = filteredMachines.length * 4;
  const skippedRounds = 4;
  const incompleteRounds = 2;
  const totalDevices = filteredMachines.length * 3;
  const devicesInBounds = Math.max(0, totalDevices - totalBoundBreaches);
  const speedBreachAlerts = outsideRpmCount;
  const dueNames = filteredMachines.filter(m => m.cleaning.status === 'Due today' || m.cleaning.status === 'Overdue').map(m => m.machineId);

  return {
    success: true,
    dataTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
    shiftDate: filter?.fromDate || new Date().toISOString().slice(0, 10),
    shift: filter?.shift === '2' ? 2 : filter?.shift === '3' ? 3 : 1,
    frameStatus: {
      totalMachines: filteredMachines.length,
      reporting: reportingCount,
      running: runningCount,
      runningPercent,
      stopped: stoppedCount,
      doffing: doffingCount,
      stoppedAndDoffing,
      offline: offlineCount,
      totalEndBreaks: totalBreaks,
      leftBreaks,
      rightBreaks
    },
    performanceAndCare: {
      averageRpm: avgRpm || 16712,
      outsideRpmCount,
      totalEndBreaks: totalBreaks,
      productionYieldPercent: yieldPct,
      productionYieldKg: Math.round(totalProduction),
      targetProductionKg: Math.round(totalTarget),
      yieldAchievedPercent: yieldPct,
      completedRounds: completedRoundsTotal,
      totalRoundsScheduled,
      skippedRounds,
      incompleteRounds,
      devicesInBounds,
      totalDevices,
      sensorBoundBreaches: totalBoundBreaches,
      speedBreachAlerts,
      preventiveCleaningDue: cleaningDueCount,
      preventiveCleaningDueCount: cleaningDueCount,
      dueMachineNames: dueNames.length > 0 ? dueNames : ['RF04', 'RF09', 'RF18', 'RF26']
    },
    hourlyProduction: {
      shiftTotalKg: Math.round(totalProduction),
      totalProduction: Math.round(totalProduction),
      totalTarget: Math.round(totalTarget),
      peakHour: '11:00 - 12:00',
      avgPerHourKg: Math.round(totalProduction / 8),
      chart: [
        { hour: 1, timeLabel: '06:00 - 07:00', production: 118, target: 122 },
        { hour: 2, timeLabel: '07:00 - 08:00', production: 121, target: 122 },
        { hour: 3, timeLabel: '08:00 - 09:00', production: 114, target: 122 },
        { hour: 4, timeLabel: '09:00 - 10:00', production: 112, target: 122 },
        { hour: 5, timeLabel: '10:00 - 11:00', production: 117, target: 122 },
        { hour: 6, timeLabel: '11:00 - 12:00', production: 120, target: 122 },
        { hour: 7, timeLabel: '12:00 - 13:00', production: 116, target: 122 },
        { hour: 8, timeLabel: '13:00 - 14:00', production: 108, target: 122 },
      ]
    },
    machines: filteredMachines
  };
}

export const SAMPLE_OVERVIEW: SpinfoOverviewResponse = getSampleSpinfoOverview();

export const SAMPLE_CARD_TAPS = [
  { machineId: 'RF01', operatorId: 'EMP001', operatorName: 'Senthil Kumar', timestamp: '12:28:44', stationId: 'DEV_M1_01', tapType: 'Patrol Tap' },
  { machineId: 'RF02', operatorId: 'EMP002', operatorName: 'Murugan R', timestamp: '12:26:12', stationId: 'DEV_M2_01', tapType: 'Patrol Tap' },
  { machineId: 'RF03', operatorId: 'EMP003', operatorName: 'Muthukumar P', timestamp: '12:20:00', stationId: 'DEV_M3_01', tapType: 'Patrol Tap' },
  { machineId: 'RF04', operatorId: 'EMP004', operatorName: 'Palanisamy K', timestamp: '12:15:30', stationId: 'DEV_M4_01', tapType: 'Patrol Tap' },
  { machineId: 'RF05', operatorId: 'EMP005', operatorName: 'Ramasamy V', timestamp: '12:25:10', stationId: 'DEV_M5_01', tapType: 'Patrol Tap' },
  { machineId: 'RF06', operatorId: 'EMP006', operatorName: 'Karuppasamy S', timestamp: '12:10:45', stationId: 'DEV_M6_01', tapType: 'Patrol Tap' }
];

export function getSampleMachineDetail(machineId: string): SpinfoMachineDetailResponse {
  const overview = getSampleSpinfoOverview();
  const machine = overview.machines.find(m => m.machineId === machineId) || overview.machines[0];

  const curvePoints: Array<{ time: string; rpm: number }> = [
    { time: '06:00', rpm: 16200 },
    { time: '07:00', rpm: 16550 },
    { time: '08:00', rpm: 16680 },
    { time: '09:00', rpm: 16700 },
    { time: '10:00', rpm: 16695 },
    { time: '11:00', rpm: 16710 },
    { time: '12:00', rpm: 16690 },
    { time: '13:00', rpm: 16720 },
  ];

  return {
    success: true,
    machine,
    overview: {
      needsAttention: machine.totalEndBreakCount > 4 ? 'High break rate detected on left side' : 'Operating stably within normal parameters',
      hasAttention: machine.totalEndBreakCount > 4 || machine.sensorBounds.breaches > 0,
      keyFigures: {
        endBreaks: { value: machine.totalEndBreakCount, sub: `${machine.sides[0].endBreakCount} Left / ${machine.sides[1].endBreakCount} Right` },
        averageRpm: { value: `${machine.spindleSpeedCurrent} RPM`, sub: 'Target 16,700 RPM' },
        yarnCount: { value: machine.count, sub: 'Standard Mill Count' },
        productionYield: { value: `${Math.round((machine.shiftProduction / machine.shiftTargetProduction) * 100)}%`, sub: `${machine.shiftProduction} / ${machine.shiftTargetProduction} kg` },
        completedRounds: { value: `${machine.rounds.completed}`, sub: `Target ${machine.rounds.expected} rounds` },
        sensorBounds: { value: machine.sensorBounds.status, sub: `${machine.sensorBounds.breaches} alerts recorded` },
        operatingMode: { value: machine.runStatus, sub: 'Production active' },
        shiftWaste: { value: `${machine.shiftWaste}%`, sub: 'Allowed max 1.8%' },
        targetProduction: { value: `${machine.shiftTargetProduction} kg`, sub: 'Full 8h shift' },
        nextCleaning: { value: machine.cleaning.status, sub: machine.cleaning.nextDue }
      },
      operatingModeBreakdown: {
        totalMinutes: 480,
        modes: [
          { name: 'Production (RUN)', minutes: machine.runStatus === 'STOP' ? 240 : 445, color: '#10b981' },
          { name: 'Doffing (DOFF)', minutes: 20, color: '#06b6d4' },
          { name: 'End Breakage Mending', minutes: 10, color: '#f59e0b' },
          { name: 'Stoppage / Idle', minutes: machine.runStatus === 'STOP' ? 210 : 5, color: '#ef4444' },
        ]
      }
    },
    endBreaks: {
      leftSide: machine.sides[0]?.endBreaks || [],
      rightSide: machine.sides[1]?.endBreaks || []
    },
    hourlyProduction: {
      isAllShifts: false,
      selectedShift: 1,
      grandTotalProduction: machine.shiftProduction,
      shifts: [
        {
          shift: 1,
          shiftName: 'Shift 1',
          shiftTiming: '06:00 - 14:00',
          shiftDate: new Date().toISOString().slice(0, 10),
          hours: [
            { hour: 1, hourLabel: 'Hr 1', timeLabel: '06:00', production: 12.0 },
            { hour: 2, hourLabel: 'Hr 2', timeLabel: '07:00', production: 11.8 },
            { hour: 3, hourLabel: 'Hr 3', timeLabel: '08:00', production: 11.2 },
            { hour: 4, hourLabel: 'Hr 4', timeLabel: '09:00', production: 11.1 },
            { hour: 5, hourLabel: 'Hr 5', timeLabel: '10:00', production: 11.7 },
            { hour: 6, hourLabel: 'Hr 6', timeLabel: '11:00', production: 12.0 },
            { hour: 7, hourLabel: 'Hr 7', timeLabel: '12:00', production: 11.7 },
            { hour: 8, hourLabel: 'Hr 8', timeLabel: '13:00', production: 11.0 }
          ]
        }
      ]
    },
    speedAndSensors: {
      curvePoints,
      minRecorded: 16200,
      average: machine.spindleSpeedCurrent,
      peak: 16750,
      allowedMin: 15000,
      allowedMax: 17200,
      devices: [
        { deviceId: `DEV_${machine.machineId}_01`, position: 'Headstock', rpm: machine.spindleSpeedCurrent, status: 'NORMAL', limits: '15,000 - 17,200', lastReported: 'Just now' },
        { deviceId: `DEV_${machine.machineId}_02`, position: 'Mid-Frame', rpm: machine.spindleSpeedCurrent - 15, status: 'NORMAL', limits: '15,000 - 17,200', lastReported: 'Just now' },
        { deviceId: `DEV_${machine.machineId}_03`, position: 'Tailstock', rpm: machine.spindleSpeedCurrent + 10, status: 'NORMAL', limits: '15,000 - 17,200', lastReported: 'Just now' },
      ]
    },
    roundsAndCleaning: {
      shiftRounds: [
        { round: 1, window: '06:00 - 06:30', operator: machine.operator.name, status: 'Completed', detail: '26 mins patrol duration' },
        { round: 2, window: '06:30 - 07:00', operator: machine.operator.name, status: 'Completed', detail: '28 mins patrol duration' },
        { round: 3, window: '07:00 - 07:30', operator: machine.operator.name, status: 'Completed', detail: '25 mins patrol duration' },
        { round: 4, window: '07:30 - 08:00', operator: machine.operator.name, status: 'Completed', detail: '29 mins patrol duration' },
        { round: 5, window: '08:00 - 08:30', operator: machine.operator.name, status: 'Completed', detail: '30 mins patrol duration' },
        { round: 6, window: '08:30 - 09:00', operator: machine.operator.name, status: 'Completed', detail: '27 mins patrol duration' },
        { round: 7, window: '09:00 - 09:30', operator: machine.operator.name, status: 'Completed', detail: '28 mins patrol duration' },
        { round: 8, window: '09:30 - 10:00', operator: machine.operator.name, status: 'Completed', detail: '28 mins patrol duration' },
      ],
      preventiveCleaning: {
        nextCleaning: machine.cleaning.nextDue,
        interval: `${machine.cleaning.intervalDays} Days`,
        lastCleaning: '2026-10-24 14:00',
        duration: '45 mins standard',
        status: machine.cleaning.status
      }
    }
  };
}

