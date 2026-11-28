'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Employee,
  Machine,
  Shift,
  EmployeeMetric,
  EmployeeTapDetail,
  EmployeeHourlyMetric,
  EmployeeMachineTelemetry,
  DeviceHealth,
  ProductionReportRow,
  MachineMapping,
  SpinfoOverviewResponse
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  employeeDisplayName,
  employeeLabel,
  employeeInitials
} from '@/lib/iot/employeeDisplay';
import { getTodayDateString, parseUniversalDateParts, resolveEffectiveMappingForDate } from '@/lib/utils';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getIstHourStartMs(epochMs: number): number {
  return Math.floor((epochMs + IST_OFFSET_MS) / 3600000) * 3600000 - IST_OFFSET_MS;
}

function formatIstTime(raw: string | Date | null | undefined, withSeconds = false): string {
  if (!raw) return '—';
  const d = raw instanceof Date ? raw : new Date(raw);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    ...(withSeconds ? { second: '2-digit' } : {}),
    hour12: true
  });
}

function getOrdinalLabel(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

function getShiftOrdinalFromHourStart(
  hourStartMs: number,
  shiftLabel?: string,
  fallbackIndex?: number
): { index: number; label: string; timeRange: string; shortTime: string } {
  const istDate = new Date(hourStartMs + IST_OFFSET_MS);
  const istHour = istDate.getUTCHours(); // 0..23
  const endHour = (istHour + 1) % 24;
  const fmtHr = (h: number) => {
    const suffix = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${String(h12).padStart(2, '0')}:00 ${suffix}`;
  };
  const shortTime = `${String(istHour).padStart(2, '0')}:00`;
  const timeRange = `${fmtHr(istHour)} – ${fmtHr(endHour)}`;

  const sMatch = shiftLabel ? String(shiftLabel).match(/\d+/) : null;
  let shiftNum = sMatch ? Number(sMatch[0]) : 0;
  if (!shiftNum) {
    if (istHour >= 6 && istHour < 14) shiftNum = 1;
    else if (istHour >= 14 && istHour < 22) shiftNum = 2;
    else shiftNum = 3;
  }

  let idx = fallbackIndex ?? 1;
  if (shiftNum === 1 && istHour >= 6 && istHour < 14) idx = istHour - 6 + 1;
  else if (shiftNum === 2 && istHour >= 14 && istHour < 22) idx = istHour - 14 + 1;
  else if (shiftNum === 3 && (istHour >= 22 || istHour < 6)) idx = istHour >= 22 ? istHour - 22 + 1 : istHour + 2 + 1;

  return {
    index: idx,
    label: `${getOrdinalLabel(idx)} Hour`,
    timeRange,
    shortTime
  };
}

function getIstClockHour(hourStartMs: number): number {
  return new Date(hourStartMs + IST_OFFSET_MS).getUTCHours();
}

function resolveHourOrdinals(
  sortedHourStartMs: number[],
  shiftFilter?: string,
  empShift?: string
): Map<number, { index: number; label: string; timeRange: string; shortTime: string }> {
  const result = new Map<number, { index: number; label: string; timeRange: string; shortTime: string }>();
  if (!sortedHourStartMs.length) return result;

  const sFilterMatch = shiftFilter ? String(shiftFilter).match(/\d+/) : null;
  const sEmpMatch = empShift ? String(empShift).match(/\d+/) : null;
  const explicitShift = sFilterMatch ? Number(sFilterMatch[0]) : sEmpMatch ? Number(sEmpMatch[0]) : 0;

  // Detect whether hours fit within a single shift window
  const detectedShifts = new Set<1 | 2 | 3>(
    sortedHourStartMs.map(ms => {
      const h = getIstClockHour(ms);
      if (h >= 6 && h < 14) return 1;
      if (h >= 14 && h < 22) return 2;
      return 3;
    })
  );

  const singleShift =
    (explicitShift === 1 || explicitShift === 2 || explicitShift === 3) &&
    detectedShifts.size === 1 &&
    detectedShifts.has(explicitShift)
      ? explicitShift
      : detectedShifts.size === 1
      ? Array.from(detectedShifts)[0]
      : 0;

  sortedHourStartMs.forEach((hMs, idx) => {
    const info = getShiftOrdinalFromHourStart(
      hMs,
      singleShift ? `Shift ${singleShift}` : undefined,
      idx + 1
    );
    if (!singleShift) {
      // Multi-shift / all-shift duty: keep strict sequential 1st, 2nd, 3rd... across active hours
      const seqIdx = idx + 1;
      result.set(hMs, {
        ...info,
        index: seqIdx,
        label: `${getOrdinalLabel(seqIdx)} Hour`
      });
    } else {
      result.set(hMs, info);
    }
  });

  return result;
}

function countSortedInWindow(sortedMs: number[], startMs: number, endMs: number): number {
  if (!sortedMs.length || endMs <= startMs) return 0;
  let count = 0;
  for (let i = 0; i < sortedMs.length; i++) {
    const t = sortedMs[i];
    if (t >= endMs) break;
    if (t >= startMs) count++;
  }
  return count;
}

export interface EnrichedTapRow extends EmployeeTapDetail {
  spindleBreaks: number;
  resolvedDeviceId: string;
  nextTapTime?: string | null;
}

export interface TapHourGroup {
  hourStartMs: number;
  hourIso: string;
  ordinalLabel: string;
  timeRange: string;
  shortTime: string;
  taps: EnrichedTapRow[];
  spindleBreaks: number;
  em: number;
}

export interface TapModalState {
  employeeId: string;
  employeeName?: string | null;
  machineId: string;
  sideLabel: string;
  sideShort: string;
  hourLabel?: string;
  taps: EnrichedTapRow[];
  hourGroups: TapHourGroup[];
  avgGap: number;
  totalSpindleBreaks: number;
  avgEm: number;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
}

export interface IotEmployeeDashboardProps {
  selectedDate?: string;
}

export const IotEmployeeDashboard: React.FC<IotEmployeeDashboardProps> = ({ selectedDate: propDate }) => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employeeMetrics, setEmployeeMetrics] = useState<EmployeeMetric[]>([]);
  const [productionRows, setProductionRows] = useState<ProductionReportRow[]>([]);
  const [mappings, setMappings] = useState<MachineMapping[]>([]);
  const [devices, setDevices] = useState<DeviceHealth[]>([]);
  const [settings, setSettings] = useState<any>(null);
  const [overview, setOverview] = useState<SpinfoOverviewResponse | null>(null);
  const [breakTelemetry, setBreakTelemetry] = useState<Record<string, EmployeeMachineTelemetry>>({});

  const [employeeId, setEmployeeId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [shiftId, setShiftId] = useState('');

  // Default to today's local date (YYYY-MM-DD)
  const todayStr = useMemo(() => getTodayDateString(), []);

  const [selectedDate, setSelectedDate] = useState(() => {
    if (propDate) {
      const parts = parseUniversalDateParts(propDate);
      if (parts) return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      return propDate;
    }
    return todayStr;
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (propDate) {
      const parts = parseUniversalDateParts(propDate);
      const formatted = parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : propDate;
      setSelectedDate(formatted);
    }
  }, [propDate]);

  // Production Report Dialog
  const [productionReportOpen, setProductionReportOpen] = useState(false);
  const [reportDate, setReportDate] = useState(() => todayStr);
  const [reportShiftId, setReportShiftId] = useState('');
  const [reportEmployeeId, setReportEmployeeId] = useState('');
  const [reportMachineId, setReportMachineId] = useState('');
  const [reportRows, setReportRows] = useState<ProductionReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const fetchSettingsAndOverview = useCallback(async (targetDate: string, targetShift?: string) => {
    try {
      const [stRes, ovRes] = await Promise.all([
        fetch('/api/settings').then(r => r.ok ? r.json() : null).catch(() => null),
        iotApi.getSpinfoOverview({ fromDate: targetDate, toDate: targetDate, shift: targetShift }).catch(() => null)
      ]);
      const safeSettings = stRes?.data || stRes;
      if (safeSettings) setSettings(safeSettings);
      if (ovRes?.machines?.length) {
        setOverview(ovRes);
      } else if (targetDate === todayStr) {
        // Fallback via same-origin server common proxy only for Today live view
        try {
          const cRes = await fetch(`/api/iot/common?limit=10&_t=${Date.now()}`);
          if (cRes.ok) {
            const cJson = await cRes.json();
            const rec = Array.isArray(cJson) ? cJson[0] : (cJson.data?.[0] || cJson.data);
            if (rec?.machines) {
              setOverview({
                shiftDate: rec.shiftDate,
                machines: rec.machines.map((m: any) => ({
                  machineId: m.machine || m.machineId,
                  runStatus: m.runStatus || 'STOP',
                  count: m.count || '',
                  spindleSpeedCurrent: m.spindleSpeedCurrent || 0,
                  shiftWaste: m.shiftWaste || 0,
                  shiftProduction: m.shiftProduction || 0,
                  shiftTargetProduction: m.shiftTargetProduction || m.shiftProduction || 0,
                  productionUnit: m.productionUnit || 'kg',
                  totalEndBreakCount: m.totalEndBreakCount || 0,
                  sides: m.sides || []
                })),
                keyFigures: {
                  productionYield: {
                    value: `${rec.machines.reduce((acc: number, m: any) => acc + (m.shiftProduction || 0), 0).toFixed(2)} kg`
                  }
                }
              } as any);
            }
          }
        } catch (_) {}
      } else {
        setOverview(null);
      }
    } catch (_) {}
  }, []);

  const loadMasters = async () => {
    try {
      const [emps, machs, shfs, maps, devs] = await Promise.all([
        iotApi.getEmployees(),
        iotApi.getMachines(),
        iotApi.getShifts(),
        iotApi.getMachineMappings().catch(() => []),
        iotApi.getDevices().catch(() => [])
      ]);
      setEmployees(emps || []);
      setMachines(machs || []);
      setShifts(shfs || []);
      setMappings(maps || []);
      setDevices(devs || []);
      await fetchSettingsAndOverview(selectedDate, shiftName);
    } catch (err) {
      console.error('Failed to load masters:', err);
    }
  };

  const refreshSeqRef = useRef(0);
  const lastFilterKeyRef = useRef('');

  const refresh = async (showLoading: boolean = false) => {
    const selectedShift = shifts.find(s => (s.name || s.shiftName) === shiftName);
    const resolvedShiftId = selectedShift?.shiftId || '';
    setShiftId(resolvedShiftId);

    const filterKey = `${selectedDate}__${shiftName}`;
    if (lastFilterKeyRef.current !== filterKey) {
      lastFilterKeyRef.current = filterKey;
      setBreakTelemetry({});
    }
    const seq = ++refreshSeqRef.current;

    if (showLoading) setLoading(true);
    try {
      const isBackendDeviceId = machines.some(m => m.machineId === machineId);
      const backendMachineFilter = isBackendDeviceId ? machineId : undefined;

      // Kick off break + EM telemetry aggregation in parallel cleanly (discarding stale requests on date/shift switch)
      iotApi
        .getEmployeeBreakTelemetry({ date: selectedDate, shift: shiftName || undefined })
        .then(telMap => {
          if (seq !== refreshSeqRef.current) return;
          if (telMap && Object.keys(telMap).length > 0) {
            setBreakTelemetry(telMap);
          } else {
            setBreakTelemetry({});
          }
        })
        .catch(() => {});

      const [metrics, prod] = await Promise.all([
        iotApi.getEmployeePerformance({
          employeeId: employeeId || undefined,
          machineId: backendMachineFilter,
          date: selectedDate,
          shiftName: shiftName || undefined,
          shiftId: resolvedShiftId || undefined
        }),
        iotApi.getProductionReport({
          date: selectedDate,
          shiftId: resolvedShiftId || undefined,
          machineId: backendMachineFilter,
          employeeId: employeeId || undefined
        }).catch(() => []),
        fetchSettingsAndOverview(selectedDate, shiftName)
      ]);
      // Enrich with latest mapped operator names from employees state / /api/iot/employees
      let latestEmps = employees;
      try {
        const freshEmps = await iotApi.getEmployees();
        if (freshEmps && freshEmps.length > 0) {
          latestEmps = freshEmps;
          setEmployees(freshEmps);
        }
      } catch (_) {}
      const empNameMap = new Map(
        (latestEmps || [])
          .filter(e => e.employeeId && e.employeeName && e.employeeName !== e.employeeId)
          .map(e => [String(e.employeeId).trim(), e.employeeName])
      );
      const enrichedMetrics = (metrics || []).map(m => {
        const mapped = m.employeeId ? empNameMap.get(String(m.employeeId).trim()) : undefined;
        return mapped ? { ...m, employeeName: mapped } : m;
      });
      const enrichedProd = (prod || []).map(r => {
        const mapped = r.employeeId ? empNameMap.get(String(r.employeeId).trim()) : undefined;
        return mapped ? { ...r, employeeName: mapped } : r;
      });
      setEmployeeMetrics(enrichedMetrics);
      setProductionRows(enrichedProd);
    } catch (err) {
      console.error('Failed to refresh employee performance:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    loadMasters();
  }, []);

  useEffect(() => {
    refresh(true);
  }, [employeeId, machineId, shiftName, selectedDate]);

  // Live auto-refresh: every 45s when viewing today for live EM & spindle breaks, every 5m on historical dates
  useEffect(() => {
    const isTodayView = selectedDate === todayStr;
    const AUTO_REFRESH_INTERVAL_MS = isTodayView ? 45 * 1000 : 5 * 60 * 1000;
    const timer = setInterval(() => {
      refreshRef.current(false);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [employeeId, machineId, shiftName, selectedDate, todayStr]);

  // Calculations for KPIs
  const totalRounds = useMemo(() => {
    return employeeMetrics.reduce((sum, x) => sum + (x.roundsCompleted ?? x.rounds ?? 0), 0);
  }, [employeeMetrics]);

  const avgGap = useMemo(() => {
    if (!employeeMetrics.length) return 0;
    const sum = employeeMetrics.reduce((s, x) => s + (x.avgGapMinutes || 0), 0);
    return Math.round((sum / employeeMetrics.length) * 10) / 10;
  }, [employeeMetrics]);

  const avgPerformance = useMemo(() => {
    if (!employeeMetrics.length) return 0;
    const sum = employeeMetrics.reduce((s, x) => s + (x.performancePercent || 0), 0);
    return Math.round(sum / employeeMetrics.length);
  }, [employeeMetrics]);

  const totalProductionOutput = useMemo(() => {
    return productionRows.reduce((sum, x) => sum + (Number(x.productionOutput) || 0), 0);
  }, [productionRows]);

  const optimalGapsCount = useMemo(() => {
    return employeeMetrics.filter(m => (m.avgGapMinutes || 0) <= 5).length;
  }, [employeeMetrics]);

  // Machine resolution: maps raw device/station (IOT_D1, IOT_D2, IOT_01, IOT_02, etc.)
  // -> Physical Spinning Frame (SP044) -> Telemetry Hardware Machine (RF44 / RF044)
  // -> Live Telemetry (shiftProduction, speed, runStatus, count)
  const resolveMachineInfo = useCallback((rawId: string) => {
    if (!rawId) return {
      rawId: '',
      frameNo: '',
      rfNo: '',
      profileName: '',
      side: '',
      liveProduction: 0,
      targetProduction: 0,
      yieldPercent: 100,
      runStatus: 'OFFLINE' as const,
      speed: 0,
      count: '',
      waste: 0,
      breaks: 0
    };

    const clean = String(rawId).trim().toUpperCase();
    const cleanNorm = clean.replace(/[\s\-_]/g, '');

    // Side detection: D1/01/M1 -> LH (Left), D2/02/M2 -> RH (Right)
    let side = '';
    if (clean.includes('D1') || clean.includes('01') || clean.endsWith('_1') || clean.endsWith('-1') || clean.includes('M1') || clean.includes('LH') || clean.includes('LEFT')) {
      side = 'LH';
    } else if (clean.includes('D2') || clean.includes('02') || clean.endsWith('_2') || clean.endsWith('-2') || clean.includes('M2') || clean.includes('RH') || clean.includes('RIGHT')) {
      side = 'RH';
    }

    let frameNo = '';
    let rfNo = '';
    let profileName = '';

    // Direct frame or RF
    if (clean.startsWith('SP') || clean.startsWith('K')) {
      frameNo = clean;
    } else if (clean.startsWith('RF')) {
      rfNo = clean;
    } else {
      // Find matching profile from machine mappings / stationIds
      for (const m of mappings) {
        const stations = (m.stationIds || []).map(s => s.toUpperCase());
        const stationNorms = stations.map(s => s.replace(/[\s\-_]/g, ''));
        const mNorm = String(m.name || '').replace(/[\s\-_]/g, '').toUpperCase();
        const idNorm = String(m.mappingId || '').replace(/[\s\-_]/g, '').toUpperCase();

        if (
          stations.includes(clean) ||
          stationNorms.includes(cleanNorm) ||
          stations.some(s => s.replace('_D', '_').replace('_0', '_') === clean.replace('_D', '_').replace('_0', '_')) ||
          cleanNorm === mNorm ||
          cleanNorm === idNorm
        ) {
          profileName = m.name;
          break;
        }
      }

      // Check settings profile mappings with normalized case & whitespace
      const normProf = profileName ? profileName.replace(/[\s\-_]/g, '').toUpperCase() : cleanNorm;

      if (settings?.iotProfileToFrameMapping) {
        for (const [p, f] of Object.entries(settings.iotProfileToFrameMapping)) {
          const pNorm = String(p).replace(/[\s\-_]/g, '').toUpperCase();
          if (pNorm === normProf || (profileName && pNorm === profileName.replace(/[\s\-_]/g, '').toUpperCase())) {
            frameNo = String(f).trim().toUpperCase();
            if (!profileName) profileName = p;
            break;
          }
        }
      }

      if (!frameNo && settings?.frameToIotProfileMapping) {
        for (const [f, p] of Object.entries(settings.frameToIotProfileMapping)) {
          const pNorm = String(p).replace(/[\s\-_]/g, '').toUpperCase();
          if (pNorm === normProf || (profileName && pNorm === profileName.replace(/[\s\-_]/g, '').toUpperCase())) {
            frameNo = String(f).trim().toUpperCase();
            if (!profileName) profileName = String(p);
            break;
          }
        }
      }

      // Fallback: If single frame is mapped in settings
      if (!frameNo && settings?.iotProfileToFrameMapping) {
        const entries = Object.entries(settings.iotProfileToFrameMapping);
        if (entries.length === 1) {
          profileName = profileName || entries[0][0];
          frameNo = String(entries[0][1]).trim().toUpperCase();
        }
      }
      if (!frameNo && settings?.frameToIotProfileMapping) {
        const entries = Object.entries(settings.frameToIotProfileMapping);
        if (entries.length === 1) {
          frameNo = String(entries[0][0]).trim().toUpperCase();
          profileName = profileName || String(entries[0][1]);
        }
      }
    }

    // Resolve RF from frameNo using effective date mapping, allocationPeriods or settings
    if (frameNo && !rfNo) {
      const eff = resolveEffectiveMappingForDate(
        selectedDate,
        settings?.iotMachineAllocationPeriods || [],
        settings?.iotMachineMappingByDate || {},
        settings?.iotMachineMapping || {}
      );
      if (eff[frameNo]) {
        rfNo = eff[frameNo];
      } else if (settings?.iotMachineMapping?.[frameNo]) {
        rfNo = settings.iotMachineMapping[frameNo];
      } else if (settings?.machineToMachineMapping?.[frameNo]) {
        rfNo = settings.machineToMachineMapping[frameNo];
      } else {
        // Natural numeric match: SP044 -> RF44
        const num = parseInt(frameNo.replace(/\D/g, ''), 10);
        if (!isNaN(num)) {
          rfNo = `RF${num}`;
        }
      }
    }

    // Reverse resolve frameNo from rfNo if needed
    if (rfNo && !frameNo) {
      for (const [f, r] of Object.entries(settings?.iotMachineMapping || {})) {
        if (r === rfNo || r === `RF${parseInt(rfNo.replace(/\D/g, ''), 10)}`) {
          frameNo = f;
          break;
        }
      }
      if (!frameNo) {
        const num = parseInt(rfNo.replace(/\D/g, ''), 10);
        if (!isNaN(num)) frameNo = `SP${String(num).padStart(3, '0')}`;
      }
    }

    // Live telemetry lookup from overview.machines
    const liveMachines = overview?.machines || [];
    let telemetry: any = null;
    if (rfNo) {
      const pInt = parseInt(rfNo.replace(/\D/g, ''), 10);
      telemetry = liveMachines.find((m: any) => {
        const mId = String(m.machine || m.machineId || '').trim().toUpperCase();
        const mInt = parseInt(mId.replace(/\D/g, ''), 10);
        return mId === rfNo || (!isNaN(mInt) && !isNaN(pInt) && mInt === pInt);
      });
    }

    const liveProd = telemetry ? Number((telemetry.shiftProduction || 0).toFixed(2)) : 0;
    const targetProd = telemetry ? Number((telemetry.shiftTargetProduction || telemetry.shiftProduction || 0).toFixed(2)) : 0;
    const yieldPct = telemetry ? Number((telemetry.yieldPercent || (targetProd > 0 ? (liveProd / targetProd) * 100 : 100)).toFixed(1)) : 100;
    const waste = telemetry ? Number((telemetry.shiftWaste || 0).toFixed(2)) : 0;
    const breaks = telemetry ? Number(telemetry.totalEndBreakCount || 0) : 0;

    return {
      rawId,
      frameNo: frameNo || clean,
      rfNo: rfNo || (telemetry?.machineId || telemetry?.machine || clean),
      profileName: profileName || '',
      side,
      telemetry,
      liveProduction: liveProd,
      targetProduction: targetProd,
      yieldPercent: yieldPct,
      runStatus: (telemetry?.runStatus || 'STOP') as 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE',
      speed: telemetry?.spindleSpeedCurrent || telemetry?.speed || 0,
      count: telemetry?.count || '',
      waste,
      breaks
    };
  }, [mappings, settings, overview, selectedDate]);

  // Unique live machines assigned across displayed / filtered employee metrics or floor machine mappings
  const assignedMachineMetrics = useMemo(() => {
    const rfMap = new Map<string, any>();

    // 1. From employeeMetrics (the machines assigned to operators on duty)
    employeeMetrics.forEach(m => {
      const info = resolveMachineInfo(m.machineId);
      if (info.rfNo && !rfMap.has(info.rfNo)) {
        rfMap.set(info.rfNo, {
          ...info,
          operatorId: m.employeeId,
          operatorName: m.employeeName
        });
      }
    });

    // 2. If employeeMetrics has no assigned machines, fallback to all mapped profiles in settings/mappings
    if (rfMap.size === 0) {
      mappings.forEach(m => {
        const info = resolveMachineInfo(m.name || m.mappingId);
        if (info.rfNo && !rfMap.has(info.rfNo)) {
          rfMap.set(info.rfNo, {
            ...info,
            profileName: m.name,
            operatorId: '',
            operatorName: 'Floor Operator'
          });
        }
      });

      if (settings?.iotProfileToFrameMapping) {
        Object.entries(settings.iotProfileToFrameMapping).forEach(([prof, frame]) => {
          const info = resolveMachineInfo(String(frame));
          if (info.rfNo && !rfMap.has(info.rfNo)) {
            rfMap.set(info.rfNo, {
              ...info,
              profileName: prof,
              operatorId: '',
              operatorName: 'Floor Operator'
            });
          }
        });
      }
    }

    return Array.from(rfMap.values());
  }, [employeeMetrics, resolveMachineInfo, mappings, settings]);

  const totalLiveProduction = useMemo(() => {
    if (assignedMachineMetrics.length > 0) {
      const sum = assignedMachineMetrics.reduce((acc, m) => acc + (m.liveProduction || 0), 0);
      if (sum > 0) return Number(sum.toFixed(2));
    }
    return totalProductionOutput;
  }, [assignedMachineMetrics, totalProductionOutput]);

  const assignedMachinesLabel = useMemo(() => {
    if (!assignedMachineMetrics.length) return '';
    return assignedMachineMetrics.map(m => m.frameNo ? `${m.frameNo} (${m.rfNo})` : m.rfNo).join(', ');
  }, [assignedMachineMetrics]);

  const avgAssignedYield = useMemo(() => {
    if (!assignedMachineMetrics.length) return 100;
    const sum = assignedMachineMetrics.reduce((acc, m) => acc + (m.yieldPercent || 100), 0);
    return Math.round(sum / assignedMachineMetrics.length);
  }, [assignedMachineMetrics]);

  const totalAssignedTarget = useMemo(() => {
    return Number(assignedMachineMetrics.reduce((acc, m) => acc + (m.targetProduction || 0), 0).toFixed(1));
  }, [assignedMachineMetrics]);

  const machineOptions = useMemo(() => {
    const list: Array<{ value: string; label: string }> = [];
    const added = new Set<string>();

    // 1. All unique machines from employeeMetrics resolved
    employeeMetrics.forEach(m => {
      const info = resolveMachineInfo(m.machineId);
      const val = m.machineId;
      if (val && !added.has(val)) {
        added.add(val);
        const lbl = info.frameNo ? `${info.frameNo} (${info.rfNo || val}) · ${val}` : val;
        list.push({ value: val, label: lbl });
      }
    });

    // 2. Add mapped frames like SP044
    if (settings?.frameToIotProfileMapping) {
      Object.keys(settings.frameToIotProfileMapping).forEach(f => {
        if (!added.has(f)) {
          added.add(f);
          const rf = settings?.iotMachineMapping?.[f] || `RF${parseInt(f.replace(/\D/g, ''), 10) || ''}`;
          list.push({ value: f, label: `${f} (${rf})` });
        }
      });
    }

    // 3. Add machines from machines master
    machines.forEach(m => {
      if (!added.has(m.machineId)) {
        added.add(m.machineId);
        list.push({ value: m.machineId, label: `${m.machineName || m.machineId} (${m.machineId})` });
      }
    });

    return list;
  }, [employeeMetrics, machines, settings, resolveMachineInfo]);

  // Filtered metrics by search query & machine dropdown
  const filteredMetrics = useMemo(() => {
    return employeeMetrics.filter(m => {
      const info = resolveMachineInfo(m.machineId);
      const matchMachine = !machineId ||
        m.machineId.toUpperCase() === machineId.toUpperCase() ||
        info.frameNo.toUpperCase() === machineId.toUpperCase() ||
        info.rfNo.toUpperCase() === machineId.toUpperCase();

      const matchSearch = !searchQuery.trim() ||
        (m.employeeId && m.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.employeeName && m.employeeName.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (m.machineId && m.machineId.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (info.frameNo && info.frameNo.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (info.rfNo && info.rfNo.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchMachine && matchSearch;
    });
  }, [employeeMetrics, searchQuery, machineId, resolveMachineInfo]);

  // Tap Details Modal Target (reactive to live breakTelemetry updates)
  const [tapModalTarget, setTapModalTarget] = useState<{
    metric: EmployeeMetric;
    hourIso?: string;
    hourlyFallback?: { hour: string; rounds: number; avgGapMinutes: number; taps?: EmployeeTapDetail[] };
  } | null>(null);

  const deviceToStationMap = useMemo(() => {
    const map = new Map<string, string>();
    devices.forEach(d => {
      const devId = String(d.deviceId || '').trim().toUpperCase();
      const machId = String(d.machineId || '').trim().toUpperCase();
      if (devId && machId) map.set(devId, machId);
      else if (devId) map.set(devId, devId);
    });
    return map;
  }, [devices]);

  const resolveTapStationNode = useCallback(
    (rawTapDeviceId?: string, operatorMachineId?: string, singleDistinctRawNode?: boolean): string => {
      const devClean = String(rawTapDeviceId || '').trim().toUpperCase();
      const opClean = String(operatorMachineId || '').trim().toUpperCase();
      if (singleDistinctRawNode && /^IOT_D\d+$/i.test(opClean)) {
        return opClean;
      }
      if (devClean) {
        const mapped = deviceToStationMap.get(devClean);
        if (mapped && /^IOT_D/i.test(mapped)) return mapped;
        if (/^IOT_D/i.test(devClean)) return devClean;
        if (devClean.startsWith('IOT_M')) {
          if (mapped) return mapped;
          return devClean.replace(/^IOT_M(\d+)$/i, 'IOT_D$1');
        }
        return mapped || devClean;
      }
      return opClean || '—';
    },
    [deviceToStationMap]
  );

  const getOperatorSideTelemetry = useCallback(
    (m: EmployeeMetric) => {
      const info = resolveMachineInfo(m.machineId);
      const rfKey = (info.rfNo || '').toUpperCase();
      const side = info.side; // 'LH' | 'RH' | ''
      const tel = rfKey ? breakTelemetry[rfKey] : undefined;

      // Live overview snapshot only matches selectedDate (or Today live mode)
      const isTodayView = selectedDate === todayStr;
      const ovDate = overview?.shiftDate ? String(overview.shiftDate).slice(0, 10) : '';
      const overviewMatchesSelected = isTodayView || (!!ovDate && ovDate === selectedDate);

      // Side-specific timestamped breaks (ms)
      let sideBreakTimes: number[] = [];
      let totalSideBreaks = 0;
      let avgSideEm = 0;

      if (tel) {
        if (side === 'LH') {
          sideBreakTimes = tel.leftBreakTimes || [];
          totalSideBreaks = tel.leftTotalBreaks || sideBreakTimes.length;
          avgSideEm = isTodayView ? (tel.latestEmLeft || tel.avgEmLeft || 0) : (tel.avgEmLeft || tel.latestEmLeft || 0);
        } else if (side === 'RH') {
          sideBreakTimes = tel.rightBreakTimes || [];
          totalSideBreaks = tel.rightTotalBreaks || sideBreakTimes.length;
          avgSideEm = isTodayView ? (tel.latestEmRight || tel.avgEmRight || 0) : (tel.avgEmRight || tel.latestEmRight || 0);
        } else {
          sideBreakTimes = [...(tel.leftBreakTimes || []), ...(tel.rightBreakTimes || [])].sort((a, b) => a - b);
          totalSideBreaks = (tel.leftTotalBreaks || 0) + (tel.rightTotalBreaks || 0);
          avgSideEm = Number(
            (tel.avgEmLeft > 0 && tel.avgEmRight > 0
              ? (tel.avgEmLeft + tel.avgEmRight) / 2
              : tel.avgEmLeft || tel.avgEmRight || 0
            ).toFixed(2)
          );
        }
      } else if (overviewMatchesSelected && info.telemetry?.sides) {
        const sideL = info.telemetry.sides.find((s: any) => String(s.side).toUpperCase() === 'L');
        const sideR = info.telemetry.sides.find((s: any) => String(s.side).toUpperCase() === 'R');
        if (side === 'LH' && sideL) {
          totalSideBreaks = Number(sideL.endBreakCount || 0);
          avgSideEm = Number(sideL.endMendingTime || 0);
        } else if (side === 'RH' && sideR) {
          totalSideBreaks = Number(sideR.endBreakCount || 0);
          avgSideEm = Number(sideR.endMendingTime || 0);
        } else {
          totalSideBreaks = Number(info.breaks || 0);
          const lEm = Number(sideL?.endMendingTime || 0);
          const rEm = Number(sideR?.endMendingTime || 0);
          avgSideEm = lEm > 0 && rEm > 0 ? Number(((lEm + rEm) / 2).toFixed(2)) : lEm || rEm || 0;
        }
      }

      const getHourStats = (hourIso: string) => {
        const hMs = Date.parse(hourIso);
        const hKey = !isNaN(hMs) ? new Date(getIstHourStartMs(hMs)).toISOString() : hourIso;
        const hBucket = tel?.hourly?.[hKey];
        if (!hBucket) {
          // Count directly from sideBreakTimes if available
          const cnt = !isNaN(hMs) ? countSortedInWindow(sideBreakTimes, hMs, hMs + 3600000) : 0;
          return { breaks: cnt, em: avgSideEm };
        }
        if (side === 'LH') return { breaks: hBucket.breaksLeft, em: hBucket.emLeft };
        if (side === 'RH') return { breaks: hBucket.breaksRight, em: hBucket.emRight };
        const bothEm =
          hBucket.emLeft > 0 && hBucket.emRight > 0
            ? Number(((hBucket.emLeft + hBucket.emRight) / 2).toFixed(2))
            : hBucket.emLeft || hBucket.emRight || avgSideEm;
        return { breaks: hBucket.breaksLeft + hBucket.breaksRight, em: bothEm };
      };

      return {
        info,
        side,
        sideLabel: side === 'LH' ? 'LH (Left)' : side === 'RH' ? 'RH (Right)' : 'All Sides',
        sideShort: side || 'L/R',
        sideBreakTimes,
        totalSideBreaks,
        avgSideEm,
        getHourStats,
        tel
      };
    },
    [resolveMachineInfo, breakTelemetry, overview?.shiftDate, selectedDate, todayStr]
  );

  // Open Tap Modal
  const openTapDetailsModal = (
    m: EmployeeMetric,
    hourlyItem?: { hour: string; rounds: number; avgGapMinutes: number; taps?: EmployeeTapDetail[] }
  ) => {
    setTapModalTarget({
      metric: m,
      hourIso: hourlyItem?.hour,
      hourlyFallback: hourlyItem
    });
  };

  const closeTapModal = () => setTapModalTarget(null);

  const selectedTapModal: TapModalState | null = useMemo(() => {
    if (!tapModalTarget) return null;
    const { metric: m, hourIso, hourlyFallback } = tapModalTarget;
    const { info, side, sideLabel, sideShort, sideBreakTimes, totalSideBreaks, avgSideEm, getHourStats } =
      getOperatorSideTelemetry(m);

    // Build chronological deduplicated tap list across the operator's duty so next-tap break windows stay accurate even inside 1-hour view
    let rawAllTaps: EmployeeTapDetail[] = m.taps ? [...m.taps] : [];
    if (!rawAllTaps.length && m.hourly?.length) {
      rawAllTaps = m.hourly.flatMap(h => h.taps || []);
    }
    if (hourlyFallback?.taps?.length && !rawAllTaps.length) {
      rawAllTaps = [...hourlyFallback.taps];
    }

    const tapSeen = new Set<string>();
    const dedupedRaw = rawAllTaps.filter(t => {
      const key = `${t.time || ''}|${t.tapNumber ?? ''}|${t.deviceId || ''}`;
      if (tapSeen.has(key)) return false;
      tapSeen.add(key);
      return true;
    });

    const sortedAll = [...dedupedRaw].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
    const distinctRawNodes = new Set(
      sortedAll.map(t => String(t.deviceId || '').trim().toUpperCase()).filter(Boolean)
    );
    const singleDistinctRawNode = distinctRawNodes.size <= 1;
    const allHourStarts = Array.from(
      new Set(
        sortedAll
          .map(t => Date.parse(t.time))
          .filter(ms => !isNaN(ms))
          .map(ms => getIstHourStartMs(ms))
      )
    ).sort((a, b) => a - b);
    const ordinalMap = resolveHourOrdinals(allHourStarts, shiftName, m.shift);

    const enrichedAll: EnrichedTapRow[] = sortedAll.map((tap, idx) => {
      const tapMs = Date.parse(tap.time);
      const nextTap = idx < sortedAll.length - 1 ? sortedAll[idx + 1] : null;
      const nextTapMs = nextTap ? Date.parse(nextTap.time) : NaN;
      // After tap time until next tap recorded (or end of shift / last recorded break + 1ms)
      const lastRecordedBreakEnd = sideBreakTimes.length
        ? sideBreakTimes[sideBreakTimes.length - 1] + 1000
        : tapMs + 3600000;
      const windowEndMs = !isNaN(nextTapMs) && nextTapMs > tapMs ? nextTapMs : Math.max(tapMs + 1, lastRecordedBreakEnd);
      const spindleBreaks = !isNaN(tapMs) ? countSortedInWindow(sideBreakTimes, tapMs, windowEndMs) : 0;
      return {
        ...tap,
        spindleBreaks,
        resolvedDeviceId: resolveTapStationNode(tap.deviceId, m.machineId, singleDistinctRawNode),
        nextTapTime: nextTap?.time || null
      };
    });

    let activeTaps = enrichedAll;
    let hourLabel: string | undefined = undefined;
    let avgGap = m.avgGapMinutes || 0;
    let modalTotalBreaks = totalSideBreaks;
    let modalAvgEm = avgSideEm;

    if (hourIso) {
      const targetHourMs = Date.parse(hourIso);
      const normTargetStart = !isNaN(targetHourMs) ? getIstHourStartMs(targetHourMs) : NaN;
      if (!isNaN(normTargetStart)) {
        activeTaps = enrichedAll.filter(t => getIstHourStartMs(Date.parse(t.time)) === normTargetStart);
      } else if (hourlyFallback?.taps) {
        activeTaps = hourlyFallback.taps.map(ht => {
          const match = enrichedAll.find(et => et.time === ht.time && et.tapNumber === ht.tapNumber);
          return (
            match || {
              ...ht,
              spindleBreaks: 0,
              resolvedDeviceId: resolveTapStationNode(ht.deviceId, m.machineId),
              nextTapTime: null
            }
          );
        });
      }
      const ord = !isNaN(normTargetStart)
        ? ordinalMap.get(normTargetStart) || getShiftOrdinalFromHourStart(normTargetStart, shiftName || m.shift)
        : null;
      hourLabel = ord ? `${ord.label} (${ord.timeRange})` : hourIso;
      avgGap = hourlyFallback?.avgGapMinutes ?? avgGap;
      const hStats = getHourStats(hourIso);
      modalTotalBreaks = hStats.breaks;
      modalAvgEm = hStats.em;
    } else if (sideBreakTimes.length > 0 && modalTotalBreaks === 0) {
      modalTotalBreaks = sideBreakTimes.length;
    }

    // Group activeTaps by hour bucket (segregated 1st Hour, 2nd Hour, ...)
    const groupMap = new Map<number, EnrichedTapRow[]>();
    activeTaps.forEach(t => {
      const ms = Date.parse(t.time);
      const hStart = !isNaN(ms) ? getIstHourStartMs(ms) : 0;
      const list = groupMap.get(hStart) || [];
      list.push(t);
      groupMap.set(hStart, list);
    });

    const sortedGroupKeys = Array.from(groupMap.keys()).sort((a, b) => a - b);
    const hourGroups: TapHourGroup[] = sortedGroupKeys.map((hStartMs, idx) => {
      const hIso = hStartMs > 0 ? new Date(hStartMs).toISOString() : '';
      const ord =
        hStartMs > 0
          ? ordinalMap.get(hStartMs) || getShiftOrdinalFromHourStart(hStartMs, shiftName || m.shift, idx + 1)
          : { index: idx + 1, label: `${getOrdinalLabel(idx + 1)} Hour`, timeRange: '—', shortTime: '—' };
      const hStats = hIso ? getHourStats(hIso) : { breaks: 0, em: modalAvgEm };
      return {
        hourStartMs: hStartMs,
        hourIso: hIso,
        ordinalLabel: ord.label,
        timeRange: ord.timeRange,
        shortTime: ord.shortTime,
        taps: groupMap.get(hStartMs) || [],
        spindleBreaks: hStats.breaks,
        em: hStats.em
      };
    });

    // Keep full shift EM (avgSideEm / live EM) in full Inspect Taps view rather than replacing with only the tapped hour's EM.
    const startTime = activeTaps.length ? activeTaps[0].time : null;
    const endTime = activeTaps.length ? activeTaps[activeTaps.length - 1].time : null;

    return {
      employeeId: m.employeeId,
      employeeName: m.employeeName,
      machineId: info.frameNo
        ? `${info.frameNo} (${info.rfNo || m.machineId})${info.side ? ' · ' + info.side + ' Side' : ''}`
        : m.machineId,
      sideLabel,
      sideShort: side || sideShort || 'Side',
      hourLabel,
      taps: activeTaps,
      hourGroups,
      avgGap,
      totalSpindleBreaks: modalTotalBreaks,
      avgEm: modalAvgEm,
      startTime,
      endTime
    };
  }, [tapModalTarget, getOperatorSideTelemetry, resolveTapStationNode, shiftName]);

  // Load Production Report Dialog
  const openProductionReportDialog = async () => {
    setReportDate(selectedDate);
    setReportShiftId(shiftId);
    setReportMachineId(machineId);
    setReportEmployeeId(employeeId);
    setProductionReportOpen(true);
    loadDialogProductionRows(selectedDate, shiftId, machineId, employeeId);
  };

  const loadDialogProductionRows = async (d: string, sId: string, mId: string, eId: string) => {
    setReportLoading(true);
    try {
      const res = await iotApi.getProductionReport({
        date: d,
        shiftId: sId || undefined,
        machineId: mId || undefined,
        employeeId: eId || undefined
      });
      setReportRows(res || []);
    } catch {
      setReportRows([]);
    } finally {
      setReportLoading(false);
    }
  };

  return (
    <div className="content emp-dash w-full">
      {/* Top Bar / Executive Control Header */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-eyebrow">
            <span className="live-pulse-dot" />
            <span className="eyebrow-text">
              {selectedDate === todayStr ? 'RFID REAL-TIME TELEMETRY' : `HISTORICAL VIEW · ${selectedDate}`}
            </span>
            <span className="eyebrow-divider">/</span>
            <span className="eyebrow-sub">
              {overview?.dataTime ? `SYNCED ${overview.dataTime}` : 'WORKFORCE INTELLIGENCE'}
            </span>
          </div>
          <h1 className="title">Employee Productivity Dashboard</h1>
          <p className="subtitle">
            Operator activity monitoring, RFID card tap rounds, interval gaps &amp; shift performance targets
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="filters-card">
          <div className="field">
            <label>
              <span className="field-icon">👤</span>
              <span>Operator</span>
            </label>
            <div className="select-wrapper">
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                id="emp-filter-select"
              >
                <option value="">All active operators</option>
                {employees.map(e => (
                  <option key={e.employeeId} value={e.employeeId}>
                    {employeeLabel(e.employeeId, e.employeeName)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>
              <span className="field-icon">🖥️</span>
              <span>Machine</span>
            </label>
            <div className="select-wrapper">
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                id="emp-machine-select"
              >
                <option value="">All machines</option>
                {machineOptions.map(m => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>
              <span className="field-icon">⏱️</span>
              <span>Shift</span>
            </label>
            <div className="select-wrapper">
              <select
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                id="emp-shift-select"
              >
                <option value="">All shifts</option>
                {shifts.map(shift => {
                  const sName = shift.name || shift.shiftName || 'Shift';
                  return (
                    <option key={shift.shiftId || sName} value={sName}>
                      {sName} {shift.startTime && shift.endTime ? `(${shift.startTime} - ${shift.endTime})` : ''}
                    </option>
                  );
                })}
                {shifts.length === 0 && (
                  <>
                    <option value="Shift 1">Shift 1 (06:00 - 14:00)</option>
                    <option value="Shift 2">Shift 2 (14:01 - 22:00)</option>
                    <option value="Shift 3">Shift 3 (22:01 - 06:00)</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="field">
            <label>
              <span className="field-icon">📅</span>
              <span>Date</span>
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="date-input"
              id="emp-date-input"
            />
          </div>

          <button
            className="btn btn-primary"
            onClick={() => refresh(true)}
            disabled={loading}
            id="emp-refresh-btn"
          >
            <span className={`btn-icon ${loading ? 'spin' : ''}`}>↻</span>
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {/* KPI Summary Cards - Redesigned Executive Grid */}
      <section className="kpi-grid">
        {/* KPI 1: Total Rounds */}
        <div className="card kpi-card kpi-emerald">
          <div className="kpi-top">
            <div className="kpi-header-text">
              <span className="kpi-caption">CYCLE COMPLETION</span>
              <h3 className="kpi-title">Total Rounds</h3>
            </div>
            <div className="kpi-badge-icon">
              <span>↻</span>
            </div>
          </div>
          <div className="kpi-main">
            <div className="kpi-figure num-tabular">
              <strong>{totalRounds.toLocaleString()}</strong>
              <span className="unit">Rounds</span>
            </div>
            <div className="kpi-indicator positive">
              <span className="dot-indicator" />
              <span>{employeeMetrics.length} Active {employeeMetrics.length === 1 ? 'Operator' : 'Operators'}</span>
            </div>
          </div>
          <div className="kpi-meta-row">
            <span>Avg / Operator</span>
            <strong className="num-tabular text-slate-900">
              {employeeMetrics.length ? (totalRounds / employeeMetrics.length).toFixed(1) : '0.0'} rounds
            </strong>
          </div>
        </div>

        {/* KPI 2: Avg Round Gap */}
        <div className="card kpi-card kpi-amber">
          <div className="kpi-top">
            <div className="kpi-header-text">
              <span className="kpi-caption">PACING &amp; IDLE TIME</span>
              <h3 className="kpi-title">Avg Round Gap</h3>
            </div>
            <div className="kpi-badge-icon">
              <span>⏱️</span>
            </div>
          </div>
          <div className="kpi-main">
            <div className="kpi-figure num-tabular">
              <strong>{avgGap.toFixed(1)}</strong>
              <span className="unit">Mins</span>
            </div>
            <div className={`kpi-indicator ${avgGap <= 5 ? 'positive' : 'warning'}`}>
              <span className="dot-indicator" />
              <span>{avgGap <= 5 ? 'Optimal pacing (≤ 5m)' : 'Extended pacing (> 5m)'}</span>
            </div>
          </div>
          <div className="kpi-meta-row">
            <span>Within Target (≤ 5m)</span>
            <strong className="num-tabular text-slate-900">
              {optimalGapsCount} / {employeeMetrics.length} Ops
            </strong>
          </div>
        </div>

        {/* KPI 3: Performance Score */}
        <div className="card kpi-card kpi-purple">
          <div className="kpi-top">
            <div className="kpi-header-text">
              <span className="kpi-caption">WORKFORCE EFFICIENCY</span>
              <h3 className="kpi-title">Performance Score</h3>
            </div>
            <div className="kpi-badge-icon">
              <span>📊</span>
            </div>
          </div>
          <div className="kpi-main">
            <div className="flex items-baseline justify-between gap-2">
              <div className="kpi-figure num-tabular">
                <strong>{avgPerformance}%</strong>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[11px] font-extrabold ${
                  avgPerformance >= 75
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                }`}
              >
                {avgPerformance >= 75 ? 'On Target' : 'Needs Focus'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full rounded-full transition-all ${
                  avgPerformance >= 75 ? 'bg-emerald-500' : avgPerformance >= 40 ? 'bg-amber-500' : 'bg-rose-500'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, avgPerformance))}%` }}
              />
            </div>
          </div>
          <div className="kpi-meta-row">
            <span>Shift Baseline Target</span>
            <strong className="num-tabular text-slate-900">75%</strong>
          </div>
        </div>

        {/* KPI 4: Shift Production Output (Live Machine Telemetry) */}
        <button
          type="button"
          className="card kpi-card kpi-rose kpi-action-card text-left cursor-pointer"
          onClick={openProductionReportDialog}
          aria-haspopup="dialog"
          id="view-production-report-btn"
        >
          <div className="kpi-top">
            <div className="kpi-header-text">
              <span className="kpi-caption">SHIFT OUTPUT</span>
              <h3 className="kpi-title">Production Yield</h3>
            </div>
            <div className="kpi-badge-icon">
              <span>🏭</span>
            </div>
          </div>
          <div className="kpi-main">
            <div className="flex items-baseline justify-between gap-2">
              <div className="kpi-figure num-tabular">
                <strong>{totalLiveProduction.toLocaleString()}</strong>
                <span className="unit">kg</span>
              </div>
              {totalAssignedTarget > 0 && (
                <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 num-tabular">
                  {avgAssignedYield}% Yield
                </span>
              )}
            </div>
            <div className="kpi-indicator positive">
              <span className="dot-indicator" />
              <span className="truncate">
                {assignedMachinesLabel
                  ? `Live · ${assignedMachinesLabel}`
                  : `${productionRows.length} hourly entries`}
              </span>
            </div>
          </div>
          <div className="kpi-meta-row action-meta-row">
            <span>
              {totalAssignedTarget > 0 ? `Target: ${totalAssignedTarget} kg` : 'Detailed Hourly View'}
            </span>
            <span className="action-text">Open Report →</span>
          </div>
        </button>
      </section>

      {/* Employee Performance Table Section */}
      <section className="card table-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">WORKFORCE ROUND &amp; SIDE TELEMETRY BREAKDOWN</span>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="panel-title">Employee Duty &amp; Round Activity</h3>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-blue-50 text-blue-700 border border-blue-200 num-tabular">
                {filteredMetrics.length} {filteredMetrics.length === 1 ? 'Record' : 'Records'}
              </span>
            </div>
            <p className="panel-subtitle">
              RFID activity logs, card tap frequency, side-wise hourly spindle breaks, EM &amp; shift performance score
            </p>
          </div>

          <div className="panel-tools">
            {/* Quick Search */}
            <div className="search-input-wrapper">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by operator name, ID or machine..."
                className="table-search-input"
                id="employee-search-box"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  title="Clear"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="table-legend">
              <span className="legend-badge normal"><span className="dot" /> Optimal Gap (≤5m)</span>
              <span className="legend-badge warn"><span className="dot" /> Idle Warning (&gt;5m)</span>
            </div>
          </div>
        </div>

        <div className="table-container">
          <table className="refined-table">
            <thead>
              <tr>
                <th>Operator</th>
                <th>Machine &amp; Side Telemetry</th>
                <th>Rounds</th>
                <th>Avg Gap</th>
                <th>Target Perf.</th>
                <th>Hourly Taps &amp; Side Breaks</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMetrics.map((m, mIdx) => {
                const rounds = m.roundsCompleted ?? m.rounds ?? 0;
                const gapVal = m.avgGapMinutes ?? 0;
                const perfVal = m.performancePercent ?? 0;
                const perfClass = perfVal >= 80 ? 'high' : perfVal >= 50 ? 'medium' : 'low';
                const perfTextClass = perfVal >= 80 ? 'high-text' : perfVal < 50 ? 'low-text' : '';
                const sideTel = getOperatorSideTelemetry(m);
                const { info } = sideTel;
                const rowHourStarts = (m.hourly || [])
                  .map(h => Date.parse(h.hour))
                  .filter(ms => !isNaN(ms))
                  .map(ms => getIstHourStartMs(ms))
                  .sort((a, b) => a - b);
                const rowOrdinalMap = resolveHourOrdinals(rowHourStarts, shiftName, m.shift);

                return (
                  <tr key={`${m.employeeId}-${m.machineId}-${m.shift || mIdx}`}>
                    <td>
                      <div className="emp-profile">
                        <div className="avatar">{employeeInitials(m.employeeId, m.employeeName)}</div>
                        <div className="emp-names min-w-0">
                          <strong className="emp-name whitespace-nowrap">
                            {employeeDisplayName(m.employeeId, m.employeeName)}
                          </strong>
                          <span className="emp-id-badge num-tabular whitespace-nowrap">Badge #{m.employeeId}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-col gap-1.5 min-w-[205px]">
                        <div className="flex items-center gap-1.5 flex-nowrap whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-md bg-slate-200 text-slate-900 font-extrabold text-xs num-tabular">
                            {info.frameNo || m.machineId}
                          </span>
                          {info.rfNo && (
                            <span
                              className="px-2 py-0.5 rounded-md bg-teal-50 text-teal-800 border border-teal-200 font-extrabold text-xs num-tabular"
                              title={`Live IoT Telemetry Device: ${info.rfNo}`}
                            >
                              {info.rfNo}
                            </span>
                          )}
                          {info.side && (
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-extrabold border ${
                                info.side === 'LH'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-violet-50 text-violet-700 border-violet-200'
                              }`}
                            >
                              {info.side} Side
                            </span>
                          )}
                          <span
                            className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[11px] font-bold border border-slate-200"
                            title={`Station Node: ${m.machineId}`}
                          >
                            {m.machineId}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                          <span
                            className="inline-block w-2 h-2 rounded-full shrink-0"
                            style={{
                              background:
                                info.runStatus === 'RUN'
                                  ? '#10B981'
                                  : info.runStatus === 'DOFF'
                                  ? '#f59e0b'
                                  : '#ef4444'
                            }}
                          />
                          <span className="font-extrabold text-slate-900 num-tabular">
                            {info.liveProduction > 0 ? `${info.liveProduction} kg` : info.runStatus}
                          </span>
                          {info.count && <span className="text-slate-500 font-semibold">· {info.count}</span>}
                          <span className="px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200 text-[11px] font-bold num-tabular">
                            {sideTel.sideShort} Brk: {sideTel.totalSideBreaks}
                          </span>
                          {sideTel.avgSideEm > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-bold num-tabular">
                              {sideTel.side || sideTel.sideShort} EM: {sideTel.avgSideEm.toFixed(2)}m
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-inspect-rounds num-tabular cursor-pointer whitespace-nowrap"
                        onClick={() => openTapDetailsModal(m)}
                        title={`Inspect all ${rounds} RFID card taps`}
                      >
                        <span className="round-count-num">{rounds}</span>
                        <span className="round-count-label">Rounds</span>
                        <span className="round-inspect-icon">👁️</span>
                      </button>
                    </td>
                    <td>
                      <span className={`gap-chip num-tabular whitespace-nowrap ${gapVal <= 5 ? 'gap-optimal' : 'gap-extended'}`}>
                        <span className="chip-dot" />
                        {gapVal.toFixed(1)} mins
                      </span>
                    </td>
                    <td>
                      <div
                        className="perf-wrapper"
                        title={m.idleMinutes ? `${m.idleMinutes} mins idle (>5m gaps)` : '100% active duty pacing'}
                      >
                        <div className="perf-track">
                          <div
                            className={`perf-bar ${perfClass}`}
                            style={{ width: `${Math.min(100, Math.max(0, perfVal))}%` }}
                          />
                        </div>
                        <span className={`perf-value num-tabular ${perfTextClass}`}>
                          {Math.round(perfVal)}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="hourly-chips-flow">
                        {m.hourly && m.hourly.length > 0 ? (
                          m.hourly.map((h, i) => {
                            const hMs = Date.parse(h.hour);
                            const hStart = !isNaN(hMs) ? getIstHourStartMs(hMs) : 0;
                            const ord = hStart
                              ? rowOrdinalMap.get(hStart) || getShiftOrdinalFromHourStart(hStart, shiftName || m.shift, i + 1)
                              : { index: i + 1, label: `${getOrdinalLabel(i + 1)} Hr`, timeRange: h.hour, shortTime: h.hour };
                            const hStats = sideTel.getHourStats(h.hour);
                            return (
                              <button
                                key={i}
                                type="button"
                                className="hourly-chip num-tabular cursor-pointer"
                                onClick={() => openTapDetailsModal(m, h)}
                                title={`${ord.label} (${ord.timeRange}): ${h.rounds} rounds · ${hStats.breaks} spindle breaks (${sideTel.sideShort}) · EM ${hStats.em.toFixed(2)}m`}
                              >
                                <div className="hourly-chip-top">
                                  <span>{getOrdinalLabel(ord.index)} Hr</span>
                                  <span>{ord.shortTime}</span>
                                </div>
                                <div className="hourly-chip-stats">
                                  <span className="hourly-chip-rounds">{h.rounds}r</span>
                                  <span className={`hourly-chip-breaks ${hStats.breaks === 0 ? 'zero' : ''}`}>
                                    {hStats.breaks} {sideTel.side ? sideTel.side : ''} brk
                                  </span>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <span className="text-dim text-xs">No hourly logs</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-view-taps cursor-pointer whitespace-nowrap"
                        onClick={() => openTapDetailsModal(m)}
                      >
                        <span>Inspect Taps</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {!filteredMetrics.length && (
                <tr>
                  <td colSpan={7} className="empty-table-cell">
                    <div className="empty-search-state">
                      <span className="empty-icon">👥</span>
                      {searchQuery ? (
                        <>
                          <p>No operators matching search &quot;{searchQuery}&quot;.</p>
                          <button
                            type="button"
                            className="btn-reset-search cursor-pointer"
                            onClick={() => setSearchQuery('')}
                          >
                            Clear Search Filter
                          </button>
                        </>
                      ) : (
                        <p>No employee activity records found for the selected filters.</p>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Tap Details Breakdown Modal Popup - Segregated by Hours with Spindle Breaks & EM */}
      {selectedTapModal && (
        <div className="modal-backdrop" onClick={closeTapModal}>
          <div className="modal-content tap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">
                  <span className="modal-dot" />
                  <span>RFID CARD TAP &amp; SPINDLE BREAKDOWN</span>
                </div>
                <h3 className="modal-title">
                  {employeeDisplayName(selectedTapModal.employeeId, selectedTapModal.employeeName)}
                </h3>
                <p className="modal-subtitle">
                  Monitored Machine: <strong>{selectedTapModal.machineId}</strong>
                  {selectedTapModal.hourLabel && (
                    <span> · Time Window: <strong>{selectedTapModal.hourLabel}</strong></span>
                  )}
                  {' · '}Total Taps: <strong>{selectedTapModal.taps.length}</strong>
                </p>
              </div>
              <button
                type="button"
                className="btn-close cursor-pointer"
                onClick={closeTapModal}
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="tap-summary-tiles">
                <div className="summary-tile">
                  <span className="tile-label">TOTAL TAPS / ROUNDS</span>
                  <strong className="tile-val num-tabular">{selectedTapModal.taps.length}</strong>
                  <span className="tile-sub">{selectedTapModal.hourLabel ? 'Selected Hour' : 'Shift Duty Total'}</span>
                </div>
                <div className="summary-tile tile-breaks">
                  <span className="tile-label">TOTAL SPINDLE BREAKS</span>
                  <strong className="tile-val num-tabular text-orange-700">{selectedTapModal.totalSpindleBreaks}</strong>
                  <span className="tile-sub">{selectedTapModal.sideLabel}</span>
                </div>
                <div className="summary-tile tile-em">
                  <span className="tile-label">{selectedTapModal.sideShort} SIDE EM</span>
                  <strong className="tile-val num-tabular text-blue-700">
                    {selectedTapModal.avgEm > 0 ? `${selectedTapModal.avgEm.toFixed(2)} min` : '0.00 min'}
                  </strong>
                  <span className="tile-sub">{selectedTapModal.sideLabel} only</span>
                </div>
                <div className="summary-tile">
                  <span className="tile-label">AVG GAP DURATION</span>
                  <strong className="tile-val num-tabular">{selectedTapModal.avgGap.toFixed(1)} mins</strong>
                  <span className="tile-sub">Between taps</span>
                </div>
                <div className="summary-tile">
                  <span className="tile-label">ACTIVITY WINDOW</span>
                  <strong className="tile-val num-tabular text-sm">
                    {formatIstTime(selectedTapModal.startTime)} – {formatIstTime(selectedTapModal.endTime)}
                  </strong>
                  <span className="tile-sub">First to last tap (IST)</span>
                </div>
              </div>

              <div className="modal-hours-scroll">
                {selectedTapModal.hourGroups.map((grp) => (
                  <div key={grp.hourStartMs || grp.ordinalLabel} className="hour-group-section">
                    <div className="hour-group-header">
                      <div className="hour-group-title">
                        <span className="hour-ordinal-badge">{grp.ordinalLabel}</span>
                        <span className="hour-window-text num-tabular">{grp.timeRange}</span>
                      </div>
                      <div className="hour-group-pills num-tabular">
                        <span className="hour-stat-pill">{grp.taps.length} {grp.taps.length === 1 ? 'Tap' : 'Taps'}</span>
                        <span className="hour-stat-pill breaks">
                          Spindle Breaks ({selectedTapModal.sideShort}): {grp.spindleBreaks}
                        </span>
                        <span className="hour-stat-pill em">
                          {selectedTapModal.sideShort} EM: {grp.em > 0 ? `${grp.em.toFixed(2)} min` : '0.00 min'}
                        </span>
                      </div>
                    </div>

                    <table className="refined-table modal-table">
                      <thead>
                        <tr>
                          <th style={{ width: '115px' }}>Tap Sequence</th>
                          <th>Timestamp</th>
                          <th>Sensor / Station Node</th>
                          <th>Spindle Breaks (Until Next Tap)</th>
                          <th>Interval Gap Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grp.taps.map((tap, idx) => (
                          <tr key={`${tap.tapNumber ?? idx}-${tap.time}`}>
                            <td>
                              <span className="tap-badge-pill num-tabular">Tap #{tap.tapNumber ?? idx + 1}</span>
                            </td>
                            <td>
                              <strong className="time-text num-tabular">
                                {formatIstTime(tap.time, true)}
                              </strong>
                            </td>
                            <td>
                              <span className="device-tag-pill num-tabular">{tap.resolvedDeviceId}</span>
                            </td>
                            <td>
                              <div className="flex flex-col items-start gap-0.5">
                                <span
                                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-extrabold num-tabular ${
                                    tap.spindleBreaks > 0
                                      ? 'bg-orange-50 text-orange-700 border border-orange-200'
                                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  }`}
                                  title={
                                    tap.nextTapTime
                                      ? `Breaks from ${formatIstTime(tap.time, true)} until ${formatIstTime(tap.nextTapTime, true)}`
                                      : `Breaks recorded after ${formatIstTime(tap.time, true)} through ongoing shift`
                                  }
                                >
                                  {tap.spindleBreaks} {tap.spindleBreaks === 1 ? 'Break' : 'Breaks'}
                                </span>
                                <span className="text-[10px] font-semibold text-slate-500 num-tabular">
                                  {tap.nextTapTime
                                    ? `→ ${formatIstTime(tap.nextTapTime)}`
                                    : '→ ongoing'}
                                </span>
                              </div>
                            </td>
                            <td>
                              {tap.gapMinutes && tap.gapMinutes > 0 ? (
                                <span className={`gap-badge ${tap.gapMinutes > 5 ? 'gap-warn' : ''}`}>
                                  ⏱️ {tap.gapMinutes.toFixed(1)} min gap
                                </span>
                              ) : (
                                <span className="first-tap-badge">🏁 Initial Tap</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {!selectedTapModal.taps.length && (
                  <div className="empty-table-cell border border-slate-200 rounded-xl">
                    No detailed RFID tap logs recorded for this selection.
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary cursor-pointer"
                onClick={closeTapModal}
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Production Report Dialog Component */}
      {productionReportOpen && (
        <div className="modal-backdrop" onClick={() => setProductionReportOpen(false)}>
          <section
            className="modal-content tap-modal"
            style={{ maxWidth: '1000px', width: '95%' }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">
                  <span className="modal-dot" />
                  <span>HOURLY PRODUCTION</span>
                </div>
                <h3 className="modal-title">Production Report</h3>
                <p className="modal-subtitle">
                  Hourly speed, counts and output entries with the logged-in operator&apos;s taps, gaps and rounds for that hour.
                </p>
              </div>
              <button
                type="button"
                className="btn-close cursor-pointer"
                onClick={() => setProductionReportOpen(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {/* LIVE PAIRED MACHINE TELEMETRY SECTION */}
              <div className="mb-5 rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-xs">
                <div className="flex flex-wrap items-center justify-between pb-3 border-b border-rose-200 mb-3 gap-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <div>
                      <h4 className="text-sm font-black uppercase tracking-wider text-rose-950 flex items-center gap-2">
                        Live Paired Machines Telemetry
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white text-rose-700 border border-rose-200">
                          {assignedMachineMetrics.length} {assignedMachineMetrics.length === 1 ? 'Machine' : 'Machines'}
                        </span>
                      </h4>
                      <p className="text-xs text-rose-800/80 mt-0.5">
                        Live stream from MAG SPinFO mapped to floor frames ({assignedMachinesLabel || 'Active Pairs'})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Total Live Yield</div>
                      <div className="text-base font-black text-emerald-800 num-tabular">
                        {totalLiveProduction.toLocaleString()} kg
                      </div>
                    </div>
                    {totalAssignedTarget > 0 && (
                      <div className="text-right pl-3 border-l border-rose-200">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-rose-700">Yield %</div>
                        <div className="text-base font-black text-rose-900 num-tabular">
                          {avgAssignedYield}%
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="table-container modal-table-wrap bg-white rounded-lg border border-rose-200 overflow-x-auto shadow-2xs">
                  <table className="refined-table modal-table text-xs w-full">
                    <thead className="bg-rose-100/60 text-stone-700">
                      <tr>
                        <th>Machine / Profile</th>
                        <th>Paired Frame</th>
                        <th>Operator</th>
                        <th className="text-right">Live Speed</th>
                        <th className="text-right">Count</th>
                        <th className="text-right font-black text-rose-950">Shift Output</th>
                        <th className="text-right">Target</th>
                        <th className="text-right">Yield %</th>
                        <th className="text-right">Waste %</th>
                        <th className="text-right">End Breaks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignedMachineMetrics.map((am, idx) => (
                        <tr key={idx} className="hover:bg-rose-50/40">
                          <td>
                            <strong className="text-stone-900 font-bold">{am.frameNo || am.rawId}</strong>
                            {am.profileName && am.profileName !== am.frameNo && (
                              <span className="ml-1 text-[11px] text-stone-500 font-medium">({am.profileName})</span>
                            )}
                          </td>
                          <td>
                            <div className="inline-flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 rounded text-[11px] font-black bg-blue-100 text-blue-900 border border-blue-200">
                                {am.rfNo}
                              </span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                am.runStatus === 'RUN' ? 'bg-emerald-100 text-emerald-800' :
                                am.runStatus === 'DOFF' ? 'bg-amber-100 text-amber-800' :
                                'bg-rose-100 text-rose-800'
                              }`}>
                                {am.runStatus === 'RUN' ? 'Running' : am.runStatus === 'DOFF' ? 'Doffing' : 'Stopped'}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className="font-semibold text-stone-800">
                              {am.operatorName || am.operatorId || 'Floor Assigned'}
                            </span>
                          </td>
                          <td className="text-right font-mono font-bold text-stone-900">
                            {am.speed ? `${am.speed.toLocaleString()} rpm` : '0 rpm'}
                          </td>
                          <td className="text-right font-medium text-stone-700">
                            {am.count || '—'}
                          </td>
                          <td className="text-right font-mono font-black text-emerald-700 text-sm">
                            {am.liveProduction.toFixed(2)} kg
                          </td>
                          <td className="text-right font-mono text-stone-600">
                            {am.targetProduction ? `${am.targetProduction.toFixed(2)} kg` : '—'}
                          </td>
                          <td className="text-right font-mono font-bold">
                            <span className={am.yieldPercent >= 90 ? 'text-emerald-700' : 'text-amber-700'}>
                              {am.yieldPercent}%
                            </span>
                          </td>
                          <td className="text-right font-mono text-stone-700">
                            {am.waste ? `${am.waste.toFixed(2)}%` : '0.00%'}
                          </td>
                          <td className="text-right font-mono text-stone-700">
                            {am.breaks}
                          </td>
                        </tr>
                      ))}
                      {assignedMachineMetrics.length > 1 && (
                        <tr className="bg-rose-100/70 font-black border-t-2 border-rose-300">
                          <td colSpan={5} className="text-rose-950 uppercase tracking-wider text-right pr-3 font-extrabold">
                            Total Assigned Machines Output:
                          </td>
                          <td className="text-right font-mono font-black text-emerald-800 text-sm">
                            {totalLiveProduction.toFixed(2)} kg
                          </td>
                          <td className="text-right font-mono text-stone-800">
                            {totalAssignedTarget ? `${totalAssignedTarget.toFixed(2)} kg` : '—'}
                          </td>
                          <td className="text-right font-mono text-emerald-800 font-extrabold">
                            {avgAssignedYield}%
                          </td>
                          <td colSpan={2}></td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="filters-card mb-4">
                <div className="field">
                  <label>Date</label>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={(e) => {
                      setReportDate(e.target.value);
                      loadDialogProductionRows(e.target.value, reportShiftId, reportMachineId, reportEmployeeId);
                    }}
                    className="date-input"
                  />
                </div>
                <div className="field">
                  <label>Shift</label>
                  <div className="select-wrapper">
                    <select
                      value={reportShiftId}
                      onChange={(e) => {
                        setReportShiftId(e.target.value);
                        loadDialogProductionRows(reportDate, e.target.value, reportMachineId, reportEmployeeId);
                      }}
                    >
                      <option value="">All shifts</option>
                      {shifts.map(s => (
                        <option key={s.shiftId} value={s.shiftId}>{s.name || s.shiftName || 'Shift'}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Operator</label>
                  <div className="select-wrapper">
                    <select
                      value={reportEmployeeId}
                      onChange={(e) => {
                        setReportEmployeeId(e.target.value);
                        loadDialogProductionRows(reportDate, reportShiftId, reportMachineId, e.target.value);
                      }}
                    >
                      <option value="">All operators</option>
                      {employees.map(e => (
                        <option key={e.employeeId} value={e.employeeId}>
                          {employeeLabel(e.employeeId, e.employeeName)}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label>Machine</label>
                  <div className="select-wrapper">
                    <select
                      value={reportMachineId}
                      onChange={(e) => {
                        setReportMachineId(e.target.value);
                        loadDialogProductionRows(reportDate, reportShiftId, e.target.value, reportEmployeeId);
                      }}
                    >
                      <option value="">All machines</option>
                      {machineOptions.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="table-container modal-table-wrap">
                <table className="refined-table modal-table">
                  <thead>
                    <tr>
                      <th>M.No</th>
                      <th>Operator</th>
                      <th className="text-right">Speed</th>
                      <th className="text-right">Counts</th>
                      <th className="text-right">Production O/P</th>
                      <th className="text-right">Taps / hr</th>
                      <th className="text-right">Gap Duration / hr</th>
                      <th className="text-right">Rounds Completed</th>
                      <th>Time Entered</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportLoading ? (
                      <tr>
                        <td colSpan={9} className="empty-table-cell">Loading production entries...</td>
                      </tr>
                    ) : reportRows.map((r, i) => (
                      <tr key={i}>
                        <td><span className="machine-tag num-tabular">{r.machineId}</span></td>
                        <td>
                          <strong>{employeeDisplayName(r.employeeId, r.employeeName)}</strong>
                        </td>
                        <td className="text-right num-tabular">{r.speed?.toLocaleString()}</td>
                        <td className="text-right num-tabular">{r.counts}</td>
                        <td className="text-right num-tabular font-bold">
                          <span style={{ color: (r.productionOutput || 0) < 140 ? '#ef4444' : '#10b981' }}>
                            {r.productionOutput?.toLocaleString()}
                          </span>
                        </td>
                        <td className="text-right num-tabular">{r.tapCount ?? '—'}</td>
                        <td className="text-right num-tabular">{(r.gapMinutes || 0).toFixed(1)} mins</td>
                        <td className="text-right num-tabular">{r.roundsCompleted ?? '—'}</td>
                        <td>
                          <span className="text-stone-600 font-medium">
                            {r.enteredAt ? new Date(r.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!reportLoading && !reportRows.length && (
                      <tr>
                        <td colSpan={9} className="empty-table-cell">No hourly production entries found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary cursor-pointer"
                onClick={() => setProductionReportOpen(false)}
              >
                Close Report
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
