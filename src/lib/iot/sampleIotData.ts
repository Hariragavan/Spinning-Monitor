import {
  SpinfoOverviewResponse,
  SpinfoMachineItem,
  SpinfoMachineDetailResponse,
  SpinfoMachineSide,
  Employee,
  Machine,
  MachineMapping,
  Shift,
  MaintenanceEntry,
  DeviceHealth,
  EmployeeMetric,
  ProductionReportRow
} from '@/types/iot';

export const EMPTY_COMMON_OVERVIEW: SpinfoOverviewResponse = {
  success: true,
  source: '',
  customer: '',
  city: '',
  msgId: '',
  dataTime: '',
  shiftDate: '',
  shift: 1,
  totalShiftHours: 8,
  stdEndMendingTime: 0,
  stdEndMendingTimeUnit: 'min',
  part: 1,
  parts: 1,
  machineCount: 0,
  frameStatus: {
    totalMachines: 0,
    reporting: 0,
    running: 0,
    runningPercent: 0,
    stopped: 0,
    doffing: 0,
    stoppedAndDoffing: 0,
    offline: 0,
    totalEndBreaks: 0,
    leftBreaks: 0,
    rightBreaks: 0
  },
  performanceAndCare: {
    averageRpm: 0,
    totalEndBreaks: 0,
    outsideRpmCount: 0,
    productionYieldPercent: 0,
    productionYieldKg: 0,
    targetProductionKg: 0,
    yieldAchievedPercent: 0,
    avgShiftWaste: 0,
    minShiftWaste: 0,
    maxShiftWaste: 0,
    avgEndMendingTime: 0,
    avgLeftMendingTime: 0,
    avgRightMendingTime: 0,
    stdEndMendingTime: 0,
    stdEndMendingTimeUnit: 'min',
    completedRounds: 0,
    totalRoundsScheduled: 0,
    skippedRounds: 0,
    incompleteRounds: 0,
    totalDevices: 0,
    devicesInBounds: 0,
    sensorBoundBreaches: 0,
    speedBreachAlerts: 0,
    preventiveCleaningDue: 0,
    preventiveCleaningDueCount: 0,
    dueMachineNames: []
  },
  hourlyProduction: {
    shiftTotalKg: 0,
    totalProduction: 0,
    totalTarget: 0,
    peakHour: '-',
    avgPerHourKg: 0,
    loggedHoursCount: 0,
    totalShiftHours: 8,
    chart: []
  },
  machines: []
};

/**
 * Extracts MAG SPinFO common telemetry records from any API response wrapper
 */
export function extractCommonRecords(payload: any): any[] {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter(d => d && Array.isArray(d.machines));
  }
  if (Array.isArray(payload.data)) {
    return payload.data.filter((d: any) => d && Array.isArray(d.machines));
  }
  if (payload.data && Array.isArray(payload.data.machines)) {
    return [payload.data];
  }
  if (Array.isArray(payload.machines)) {
    return [payload];
  }
  return [];
}

/**
 * Selects the best matching record (and merges multi-part messages if parts > 1)
 */
export function selectAndMergeCommonRecord(
  records: any[],
  filter?: { fromDate?: string; toDate?: string; shiftDate?: string; shift?: string | number }
): { record: any | null; availableDates: string[]; availableShifts: number[] } {
  if (!records || records.length === 0) {
    return { record: null, availableDates: [], availableShifts: [] };
  }

  const availableDates = Array.from(
    new Set(records.map(r => String(r.shiftDate || '')).filter(Boolean))
  ).sort((a, b) => b.localeCompare(a));

  const availableShifts = Array.from(
    new Set(records.map(r => Number(r.shift || 1)).filter(n => !isNaN(n)))
  ).sort((a, b) => a - b);

  let candidates = [...records];

  // Filter by shift if specified
  if (filter?.shift !== undefined && filter.shift !== null && filter.shift !== 'All Shifts' && filter.shift !== '') {
    const match = String(filter.shift).match(/\d+/);
    const shiftNum = match ? parseInt(match[0], 10) : undefined;
    if (shiftNum !== undefined) {
      const shiftMatches = candidates.filter(r => Number(r.shift) === shiftNum);
      if (shiftMatches.length > 0) {
        candidates = shiftMatches;
      }
    }
  }

  // Filter by date range (fromDate & toDate) or exact shiftDate
  const fromDate = filter?.fromDate;
  const toDate = filter?.toDate;
  const exactDate = filter?.shiftDate;

  if (fromDate && toDate) {
    const rangeMatches = candidates.filter(r => {
      const d = String(r.shiftDate || '');
      return d >= fromDate && d <= toDate;
    });
    if (rangeMatches.length > 0) {
      candidates = rangeMatches;
    }
  } else if (fromDate) {
    const fromMatches = candidates.filter(r => String(r.shiftDate || '') >= fromDate);
    if (fromMatches.length > 0) {
      candidates = fromMatches;
    }
  } else if (toDate) {
    const toMatches = candidates.filter(r => String(r.shiftDate || '') <= toDate);
    if (toMatches.length > 0) {
      candidates = toMatches;
    }
  } else if (exactDate) {
    const exactMatches = candidates.filter(r => String(r.shiftDate || '') === exactDate);
    if (exactMatches.length > 0) {
      candidates = exactMatches;
    }
  }

  const primary = candidates[0];
  if (!primary) {
    return { record: null, availableDates, availableShifts };
  }

  // If multi-part payload exists for same shiftDate & shift, merge machines
  if (Number(primary.parts) > 1 || Number(primary.part) > 1) {
    const sameBatch = candidates.filter(
      r => (r.msgId && primary.msgId && r.msgId === primary.msgId) ||
           (r.shiftDate === primary.shiftDate && Number(r.shift) === Number(primary.shift) && r.dataTime === primary.dataTime)
    );
    const machineMap = new Map<string, any>();
    for (const doc of sameBatch) {
      for (const m of doc.machines || []) {
        const key = String(m.machine || m.machineId || '');
        if (key) machineMap.set(key, m);
      }
    }
    return {
      record: {
        ...primary,
        part: 1,
        machines: Array.from(machineMap.values()),
        machineCount: machineMap.size || primary.machineCount
      },
      availableDates,
      availableShifts
    };
  }

  return { record: primary, availableDates, availableShifts };
}

/**
 * Transforms a MAG SPinFO common JSON object directly into SpinfoOverviewResponse
 * using ONLY the exact fields returned by the API.
 */
export function transformCommonToOverview(
  rawDoc: any,
  meta?: { availableDates?: string[]; availableShifts?: number[] }
): SpinfoOverviewResponse {
  if (!rawDoc || !Array.isArray(rawDoc.machines)) {
    return EMPTY_COMMON_OVERVIEW;
  }

  const doc = rawDoc;
  const rawMachines: any[] = doc.machines;

  const source = String(doc.source || '');
  const customer = String(doc.customer || '');
  const city = String(doc.city || '');
  const msgId = String(doc.msgId || '');
  const dataTime = String(doc.dataTime || '');
  const shiftDate = String(doc.shiftDate || (dataTime ? dataTime.slice(0, 10) : ''));
  const shift = Number(doc.shift || 1);
  const totalShiftHours = Number(doc.totalShiftHours || 8);
  const stdEndMendingTime = Number(doc.stdEndMendingTime ?? 1.5);
  const stdEndMendingTimeUnit = String(doc.stdEndMendingTimeUnit || 'min');
  const part = Number(doc.part || 1);
  const parts = Number(doc.parts || 1);

  const formattedMachines: SpinfoMachineItem[] = rawMachines.map((m, idx) => {
    const id = String(m.machine || m.machineId || `RF${String(idx + 1).padStart(2, '0')}`);
    const rawStatus = String(m.runStatus || 'STOP').toUpperCase();
    const runStatus: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE' =
      rawStatus === 'RUN'
        ? 'RUN'
        : rawStatus === 'DOFF'
        ? 'DOFF'
        : rawStatus === 'OFFLINE'
        ? 'OFFLINE'
        : 'STOP';

    const statusBadge =
      runStatus === 'RUN'
        ? 'Running'
        : runStatus === 'DOFF'
        ? 'Doffing'
        : runStatus === 'STOP'
        ? 'Stopped'
        : 'Offline';

    const speed = Number(m.spindleSpeedCurrent ?? 0);
    const speedUnit = String(m.spindleSpeedUnit || 'rpm');
    const shiftWaste = Number(m.shiftWaste ?? 0);
    const wasteUnit = String(m.wasteUnit || '%');
    const shiftProduction = Number(m.shiftProduction ?? 0);
    const shiftTargetProduction = Number(m.shiftTargetProduction ?? 0);
    const productionUnit = String(m.productionUnit || 'kg');
    const yieldPercent =
      shiftTargetProduction > 0
        ? Number(((shiftProduction / shiftTargetProduction) * 100).toFixed(1))
        : 0;

    const hourWiseProduction = Array.isArray(m.hourWiseProduction)
      ? m.hourWiseProduction.map((h: any) => ({
          hour: Number(h.hour),
          production: Number(h.production ?? 0)
        }))
      : [];

    const rawSides: any[] = Array.isArray(m.sides) ? m.sides : [];
    const findSide = (sideKey: 'L' | 'R'): SpinfoMachineSide => {
      const found = rawSides.find(s => String(s.side).toUpperCase() === sideKey);
      const endMendingTime = Number(found?.endMendingTime ?? 0);
      const endMendingTimeUnit = String(found?.endMendingTimeUnit || stdEndMendingTimeUnit);
      const rawBreaks: any[] = Array.isArray(found?.endBreaks) ? found.endBreaks : [];
      const endBreaks = rawBreaks.map(eb => {
        const createdTime = String(eb.createdTime || eb.timestamp || dataTime);
        return {
          spindleNo: Number(eb.spindleNo),
          createdTime,
          breakCount: 1,
          durationMinutes: endMendingTime,
          timestamp: createdTime
        };
      });
      const endBreakCount =
        found?.endBreakCount !== undefined ? Number(found.endBreakCount) : endBreaks.length;

      return {
        side: sideKey,
        endMendingTime,
        endMendingTimeUnit,
        endBreakCount,
        endBreaks
      };
    };

    const leftSide = findSide('L');
    const rightSide = findSide('R');
    const totalEndBreakCount =
      m.totalEndBreakCount !== undefined
        ? Number(m.totalEndBreakCount)
        : leftSide.endBreakCount + rightSide.endBreakCount;

    const speedStatus =
      runStatus === 'RUN'
        ? `${speed.toLocaleString()} ${speedUnit}`
        : `${runStatus} (0 ${speedUnit})`;

    return {
      machineId: id,
      machine: id,
      machineName: `Machine ${id}`,
      runStatus,
      statusBadge,
      count: String(m.count || '-'),
      spindleSpeedCurrent: speed,
      spindleSpeedUnit: speedUnit,
      speedStatus,
      speedBounds: { min: 0, max: 20000, current: speed, inBounds: true },
      shiftWaste,
      wasteUnit,
      shiftProduction,
      shiftTargetProduction,
      productionUnit,
      yieldPercent,
      hourWiseProduction,
      totalEndBreakCount,
      breakSidesDisplay: `L: ${leftSide.endBreakCount} · R: ${rightSide.endBreakCount}`,
      sides: [leftSide, rightSide]
    };
  });

  const totalMachines = Number(doc.machineCount || formattedMachines.length);
  const running = formattedMachines.filter(m => m.runStatus === 'RUN').length;
  const doffing = formattedMachines.filter(m => m.runStatus === 'DOFF').length;
  const stopped = formattedMachines.filter(m => m.runStatus === 'STOP').length;
  const offline = formattedMachines.filter(m => m.runStatus === 'OFFLINE').length;
  const reporting = totalMachines - offline;
  const runningPercent = totalMachines > 0 ? Math.round((running / totalMachines) * 100) : 0;

  let leftBreaks = 0;
  let rightBreaks = 0;
  formattedMachines.forEach(m => {
    leftBreaks += m.sides?.[0]?.endBreakCount || 0;
    rightBreaks += m.sides?.[1]?.endBreakCount || 0;
  });
  const totalEndBreaks = formattedMachines.reduce((acc, m) => acc + (m.totalEndBreakCount || 0), 0);

  const runningMachines = formattedMachines.filter(m => m.runStatus === 'RUN' && m.spindleSpeedCurrent > 0);
  const averageRpm =
    runningMachines.length > 0
      ? Math.round(
          runningMachines.reduce((acc, m) => acc + m.spindleSpeedCurrent, 0) / runningMachines.length
        )
      : 0;

  const productionYieldKg = Number(
    formattedMachines.reduce((acc, m) => acc + (m.shiftProduction || 0), 0).toFixed(2)
  );
  const targetProductionKg = Number(
    formattedMachines.reduce((acc, m) => acc + (m.shiftTargetProduction || 0), 0).toFixed(2)
  );
  const yieldAchievedPercent =
    targetProductionKg > 0 ? Math.round((productionYieldKg / targetProductionKg) * 100) : 0;

  // Shift waste metrics from JSON
  const wastes = formattedMachines.map(m => m.shiftWaste || 0);
  const avgShiftWaste =
    wastes.length > 0
      ? Number((wastes.reduce((a, b) => a + b, 0) / wastes.length).toFixed(2))
      : 0;
  const minShiftWaste = wastes.length > 0 ? Math.min(...wastes) : 0;
  const maxShiftWaste = wastes.length > 0 ? Math.max(...wastes) : 0;

  // End mending time metrics from JSON sides
  const leftMendingTimes = formattedMachines
    .map(m => m.sides?.[0]?.endMendingTime || 0)
    .filter(v => v > 0);
  const rightMendingTimes = formattedMachines
    .map(m => m.sides?.[1]?.endMendingTime || 0)
    .filter(v => v > 0);
  const allMendingTimes = [...leftMendingTimes, ...rightMendingTimes];

  const avgLeftMendingTime =
    leftMendingTimes.length > 0
      ? Number((leftMendingTimes.reduce((a, b) => a + b, 0) / leftMendingTimes.length).toFixed(2))
      : 0;
  const avgRightMendingTime =
    rightMendingTimes.length > 0
      ? Number((rightMendingTimes.reduce((a, b) => a + b, 0) / rightMendingTimes.length).toFixed(2))
      : 0;
  const avgEndMendingTime =
    allMendingTimes.length > 0
      ? Number((allMendingTimes.reduce((a, b) => a + b, 0) / allMendingTimes.length).toFixed(2))
      : 0;

  // Aggregate hourWiseProduction across all machines in the shift
  const hourMap = new Map<number, number>();
  formattedMachines.forEach(m => {
    (m.hourWiseProduction || []).forEach(hp => {
      const h = Number(hp.hour);
      if (!isNaN(h)) {
        hourMap.set(h, Number(((hourMap.get(h) || 0) + (hp.production || 0)).toFixed(2)));
      }
    });
  });

  const sortedHours = Array.from(hourMap.keys()).sort((a, b) => a - b);
  let maxHourVal = -1;
  let peakHourLabel = 'H1';
  const chart = sortedHours.map(h => {
    const prod = hourMap.get(h) || 0;
    const label = `H${h}`;
    if (prod > maxHourVal) {
      maxHourVal = prod;
      peakHourLabel = label;
    }
    return {
      hour: label,
      hourNum: h,
      timeLabel: `Hour ${h}`,
      production: prod
    };
  });

  const loggedHoursCount = chart.length;
  const hourlySum = chart.reduce((acc, c) => acc + c.production, 0);
  const avgPerHourKg =
    loggedHoursCount > 0 ? Number((hourlySum / loggedHoursCount).toFixed(2)) : 0;

  return {
    success: true,
    source,
    customer,
    city,
    msgId,
    dataTime,
    shiftDate,
    shift,
    totalShiftHours,
    stdEndMendingTime,
    stdEndMendingTimeUnit,
    part,
    parts,
    machineCount: totalMachines,
    availableDates: meta?.availableDates || (shiftDate ? [shiftDate] : []),
    availableShifts: meta?.availableShifts || [shift],
    frameStatus: {
      totalMachines,
      reporting,
      running,
      runningPercent,
      stopped,
      doffing,
      stoppedAndDoffing: stopped + doffing,
      offline,
      totalEndBreaks,
      leftBreaks,
      rightBreaks
    },
    performanceAndCare: {
      averageRpm,
      totalEndBreaks,
      outsideRpmCount: 0,
      productionYieldPercent: yieldAchievedPercent,
      productionYieldKg,
      targetProductionKg,
      yieldAchievedPercent,
      avgShiftWaste,
      minShiftWaste,
      maxShiftWaste,
      avgEndMendingTime,
      avgLeftMendingTime,
      avgRightMendingTime,
      stdEndMendingTime,
      stdEndMendingTimeUnit,
      completedRounds: 0,
      totalRoundsScheduled: 0,
      skippedRounds: 0,
      incompleteRounds: 0,
      totalDevices: 0,
      devicesInBounds: 0,
      sensorBoundBreaches: 0,
      speedBreachAlerts: 0,
      preventiveCleaningDue: 0,
      preventiveCleaningDueCount: 0,
      dueMachineNames: []
    },
    hourlyProduction: {
      shiftTotalKg: productionYieldKg,
      totalProduction: productionYieldKg,
      totalTarget: targetProductionKg,
      peakHour: peakHourLabel,
      avgPerHourKg,
      loggedHoursCount,
      totalShiftHours,
      chart
    },
    machines: formattedMachines
  };
}

/**
 * Builds SpinfoMachineDetailResponse strictly from the machine's live JSON fields
 */
export function buildMachineDetailFromCommon(
  machineId: string,
  rawOrOverview?: any
): SpinfoMachineDetailResponse {
  const activeOverview: SpinfoOverviewResponse =
    rawOrOverview && rawOrOverview.frameStatus && Array.isArray(rawOrOverview.machines)
      ? rawOrOverview
      : transformCommonToOverview(rawOrOverview);

  const machine: SpinfoMachineItem =
    activeOverview.machines.find(
      m => m.machineId === machineId || m.machineId === decodeURIComponent(machineId)
    ) ||
    activeOverview.machines[0] || {
      machineId,
      machine: machineId,
      machineName: `Machine ${machineId}`,
      runStatus: 'STOP',
      statusBadge: 'Stopped',
      count: '-',
      spindleSpeedCurrent: 0,
      spindleSpeedUnit: 'rpm',
      speedStatus: 'STOP (0 rpm)',
      speedBounds: { min: 0, max: 20000, current: 0, inBounds: true },
      shiftWaste: 0,
      wasteUnit: '%',
      shiftProduction: 0,
      shiftTargetProduction: 0,
      productionUnit: 'kg',
      yieldPercent: 0,
      hourWiseProduction: [],
      totalEndBreakCount: 0,
      breakSidesDisplay: 'L: 0 · R: 0',
      sides: []
    };

  const leftSide = machine?.sides?.[0] || {
    side: 'L',
    endMendingTime: 0,
    endMendingTimeUnit: 'min',
    endBreakCount: 0,
    endBreaks: []
  };
  const rightSide = machine?.sides?.[1] || {
    side: 'R',
    endMendingTime: 0,
    endMendingTimeUnit: 'min',
    endBreakCount: 0,
    endBreaks: []
  };

  const hours = (machine?.hourWiseProduction || []).map(h => ({
    hour: h.hour,
    hourLabel: `Hour ${h.hour}`,
    timeLabel: `Hour ${h.hour}`,
    production: h.production
  }));

  return {
    success: true,
    machine,
    overview: {
      needsAttention:
        machine?.runStatus === 'STOP'
          ? `Machine ${machine.machineId} is currently STOPPED`
          : machine?.runStatus === 'DOFF'
          ? `Machine ${machine.machineId} is currently in DOFF status`
          : (machine?.totalEndBreakCount || 0) > 0
          ? `${machine.totalEndBreakCount} end break(s) recorded (L: ${leftSide.endBreakCount}, R: ${rightSide.endBreakCount})`
          : 'Running normally · 0 end breaks',
      hasAttention: machine?.runStatus !== 'RUN' || (machine?.totalEndBreakCount || 0) > 0,
      keyFigures: {
        endBreaks: {
          value: machine?.totalEndBreakCount ?? 0,
          sub: `Left (L): ${leftSide.endBreakCount} · Right (R): ${rightSide.endBreakCount}`
        },
        averageRpm: {
          value: `${(machine?.spindleSpeedCurrent ?? 0).toLocaleString()} ${machine?.spindleSpeedUnit || 'rpm'}`,
          sub: `Run Status: ${machine?.runStatus || 'STOP'}`
        },
        yarnCount: {
          value: machine?.count || '-',
          sub: `Machine ${machine?.machineId || ''}`
        },
        productionYield: {
          value: `${machine?.shiftProduction ?? 0} ${machine?.productionUnit || 'kg'}`,
          sub: `${machine?.yieldPercent ?? 0}% of ${machine?.shiftTargetProduction ?? 0} ${machine?.productionUnit || 'kg'} target`
        },
        completedRounds: {
          value: `${(machine?.hourWiseProduction || []).length} / ${activeOverview.totalShiftHours || 8} hrs`,
          sub: `Hour-wise production logs`
        },
        endMending: {
          value: `L: ${leftSide.endMendingTime} · R: ${rightSide.endMendingTime} ${leftSide.endMendingTimeUnit}`,
          sub: `Std Mending Time: ${activeOverview.stdEndMendingTime ?? 1.5} ${activeOverview.stdEndMendingTimeUnit || 'min'}`
        },
        sensorBounds: {
          value: `${leftSide.endBreakCount} L / ${rightSide.endBreakCount} R`,
          sub: `Side-wise break count`
        },
        operatingMode: {
          value: machine?.runStatus || 'STOP',
          sub: machine?.statusBadge || 'Stopped'
        },
        shiftWaste: {
          value: `${machine?.shiftWaste ?? 0}${machine?.wasteUnit || '%'}`,
          sub: `Shift waste percentage`
        },
        targetProduction: {
          value: `${machine?.shiftTargetProduction ?? 0} ${machine?.productionUnit || 'kg'}`,
          sub: `Shift target production`
        },
        nextCleaning: {
          value: `Shift ${activeOverview.shift || 1}`,
          sub: activeOverview.shiftDate || ''
        }
      },
      operatingModeBreakdown: {
        totalMinutes: (activeOverview.totalShiftHours || 8) * 60,
        modes: hours.map((h, i) => ({
          name: `Hour ${h.hour} (${h.production} ${machine?.productionUnit || 'kg'})`,
          minutes: h.production,
          color: ['#2563eb', '#0891b2', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1'][i % 8]
        }))
      }
    },
    endBreaks: {
      leftSide: leftSide.endBreaks || [],
      rightSide: rightSide.endBreaks || []
    },
    hourlyProduction: {
      isAllShifts: false,
      selectedShift: activeOverview.shift || 1,
      grandTotalProduction: machine?.shiftProduction || 0,
      shifts: [
        {
          shift: activeOverview.shift || 1,
          shiftName: `Shift ${activeOverview.shift || 1}`,
          shiftTiming: `${activeOverview.totalShiftHours || 8} Hours`,
          shiftDate: activeOverview.shiftDate || '',
          hours
        }
      ]
    },
    speedAndSensors: {
      curvePoints: hours.map(h => ({
        time: `Hour ${h.hour}`,
        rpm: machine?.spindleSpeedCurrent || 0
      })),
      minRecorded: machine?.spindleSpeedCurrent || 0,
      average: machine?.spindleSpeedCurrent || 0,
      peak: machine?.spindleSpeedCurrent || 0,
      allowedMin: 0,
      allowedMax: 20000,
      devices: []
    },
    roundsAndCleaning: {
      shiftRounds: [],
      preventiveCleaning: {
        nextCleaning: '-',
        interval: '-',
        lastCleaning: '-',
        duration: '-',
        status: '-'
      }
    }
  };
}

export function getSampleSpinfoOverview(): SpinfoOverviewResponse {
  return EMPTY_COMMON_OVERVIEW;
}

export const SAMPLE_OVERVIEW: SpinfoOverviewResponse = EMPTY_COMMON_OVERVIEW;

export function getSampleMachineDetail(machineId: string): SpinfoMachineDetailResponse {
  return buildMachineDetailFromCommon(machineId, EMPTY_COMMON_OVERVIEW);
}

export const SAMPLE_EMPLOYEES: Employee[] = [];
export const SAMPLE_SHIFTS: Shift[] = [
  { shiftId: 'shift_1', name: 'Shift 1', startTime: '06:00', endTime: '14:00', overnight: false },
  { shiftId: 'shift_2', name: 'Shift 2', startTime: '14:00', endTime: '22:00', overnight: false },
  { shiftId: 'shift_3', name: 'Shift 3', startTime: '22:00', endTime: '06:00', overnight: true }
];
export const SAMPLE_MACHINES: Machine[] = [];
export const SAMPLE_MAPPINGS: MachineMapping[] = [];
export const SAMPLE_DEVICES: DeviceHealth[] = [];
export const SAMPLE_MAINTENANCE: MaintenanceEntry[] = [];
export const SAMPLE_PRODUCTION_ENTRIES: ProductionReportRow[] = [];
export const SAMPLE_EMPLOYEE_METRICS: EmployeeMetric[] = [];
export const SAMPLE_CARD_TAPS: any[] = [];
