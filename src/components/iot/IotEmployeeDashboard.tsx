'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Employee,
  Machine,
  Shift,
  EmployeeMetric,
  EmployeeTapDetail,
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

export interface TapModalState {
  employeeId: string;
  employeeName?: string | null;
  machineId: string;
  hourLabel?: string;
  taps: EmployeeTapDetail[];
  avgGap: number;
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
  const [settings, setSettings] = useState<any>(null);
  const [overview, setOverview] = useState<SpinfoOverviewResponse | null>(null);

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

  // Tap Details Modal
  const [selectedTapModal, setSelectedTapModal] = useState<TapModalState | null>(null);

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
        iotApi.getSpinfoOverview({ fromDate: targetDate, shift: targetShift }).catch(() => null)
      ]);
      const safeSettings = stRes?.data || stRes;
      if (safeSettings) setSettings(safeSettings);
      if (ovRes?.machines?.length) {
        setOverview(ovRes);
      } else {
        // Fallback directly to Railway common API to ensure live telemetry is always active
        try {
          const cRes = await fetch('https://iot-machine-backend-production.up.railway.app/api/common?limit=10');
          if (cRes.ok) {
            const cJson = await cRes.json();
            const rec = Array.isArray(cJson) ? cJson[0] : (cJson.data?.[0] || cJson.data);
            if (rec?.machines) {
              setOverview({
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
      }
    } catch (_) {}
  }, []);

  const loadMasters = async () => {
    try {
      const [emps, machs, shfs, maps] = await Promise.all([
        iotApi.getEmployees(),
        iotApi.getMachines(),
        iotApi.getShifts(),
        iotApi.getMachineMappings().catch(() => [])
      ]);
      setEmployees(emps || []);
      setMachines(machs || []);
      setShifts(shfs || []);
      setMappings(maps || []);
      await fetchSettingsAndOverview(selectedDate, shiftName);
    } catch (err) {
      console.error('Failed to load masters:', err);
    }
  };

  const refresh = async (showLoading: boolean = false) => {
    const selectedShift = shifts.find(s => (s.name || s.shiftName) === shiftName);
    const resolvedShiftId = selectedShift?.shiftId || '';
    setShiftId(resolvedShiftId);

    if (showLoading) setLoading(true);
    try {
      const isBackendDeviceId = machines.some(m => m.machineId === machineId);
      const backendMachineFilter = isBackendDeviceId ? machineId : undefined;

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
      setEmployeeMetrics(metrics || []);
      setProductionRows(prod || []);
    } catch (err) {
      console.error('Failed to refresh employee performance:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadMasters();
  }, []);

  useEffect(() => {
    refresh(true);
  }, [employeeId, machineId, shiftName, selectedDate]);

  // Periodic 5-Minute Auto-Refresh (300,000 ms)
  useEffect(() => {
    const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
    const timer = setInterval(() => {
      refresh(false);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [employeeId, machineId, shiftName, selectedDate]);

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

  // Open Tap Modal
  const openTapDetailsModal = (
    m: EmployeeMetric,
    hourlyItem?: { hour: string; rounds: number; avgGapMinutes: number; taps?: EmployeeTapDetail[] }
  ) => {
    let taps: EmployeeTapDetail[] = [];
    let hourLabel: string | undefined = undefined;
    let gap = 0;

    if (hourlyItem) {
      taps = hourlyItem.taps || [];
      const dateObj = new Date(hourlyItem.hour);
      hourLabel = isNaN(dateObj.getTime())
        ? hourlyItem.hour
        : dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      gap = hourlyItem.avgGapMinutes || 0;
    } else {
      taps = m.taps || [];
      if (!taps.length && m.hourly?.length) {
        taps = m.hourly.flatMap(h => h.taps || []);
      }
      gap = m.avgGapMinutes || 0;
    }

    const startTime = taps.length ? taps[0].time : null;
    const endTime = taps.length ? taps[taps.length - 1].time : null;

    const info = resolveMachineInfo(m.machineId);
    setSelectedTapModal({
      employeeId: m.employeeId,
      employeeName: m.employeeName,
      machineId: info.frameNo ? `${info.frameNo} (${info.rfNo || m.machineId})${info.side ? ' · ' + info.side + ' Side' : ''}` : m.machineId,
      hourLabel,
      taps,
      avgGap: gap,
      startTime,
      endTime
    });
  };

  const closeTapModal = () => setSelectedTapModal(null);

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
    <div className="content w-full">
      {/* Top Bar / Executive Control Header */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-eyebrow">
            <span className="live-pulse-dot" />
            <span className="eyebrow-text">RFID REAL-TIME TELEMETRY</span>
            <span className="eyebrow-divider">/</span>
            <span className="eyebrow-sub">WORKFORCE INTELLIGENCE</span>
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

      {/* KPI Summary Cards */}
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
              <span>Card tap increments</span>
            </div>
          </div>
          <div className="kpi-meta-row">
            <span>
              Avg per Operator: <strong>{employeeMetrics.length ? (totalRounds / employeeMetrics.length).toFixed(1) : 0}</strong>
            </span>
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
              <span>{avgGap <= 5 ? 'Optimal pacing (≤ 5 mins)' : 'Extended pacing (> 5 mins)'}</span>
            </div>
          </div>
          <div className="kpi-meta-row">
            <span>
              Operators in Target: <strong>{optimalGapsCount} / {employeeMetrics.length}</strong>
            </span>
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
            <div className="kpi-figure num-tabular">
              <strong>{avgPerformance}%</strong>
            </div>
            <div className={`kpi-indicator ${avgPerformance >= 75 ? 'positive' : 'warning'}`}>
              <span className="dot-indicator" />
              <span>{avgPerformance >= 75 ? 'Shift target achieved' : 'Below shift target (< 75%)'}</span>
            </div>
          </div>
          <div className="kpi-meta-row">
            <span>Shift Target: <strong>75% Baseline</strong></span>
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
            <div className="kpi-figure num-tabular">
              <strong>{totalLiveProduction.toLocaleString()}</strong>
              <span className="unit">kg</span>
            </div>
            <div className="kpi-indicator positive">
              <span className="dot-indicator" />
              <span>
                {assignedMachinesLabel
                  ? `Live output · ${assignedMachinesLabel}`
                  : `${productionRows.length} hourly entries recorded`}
              </span>
            </div>
          </div>
          <div className="kpi-meta-row action-meta-row">
            <span className="action-text">
              {totalAssignedTarget > 0 ? `Target: ${totalAssignedTarget} kg · Yield: ${avgAssignedYield}%` : 'View Detailed Report →'}
            </span>
          </div>
        </button>
      </section>

      {/* Employee Performance Table Section */}
      <section className="card table-panel">
        <div className="panel-header">
          <div>
            <span className="panel-eyebrow">WORKFORCE ROUND BREAKDOWN</span>
            <h3 className="panel-title">Employee Duty &amp; Round Activity</h3>
            <p className="panel-subtitle">
              RFID activity logs, card tap frequency, average gap duration &amp; shift performance score
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
                <th>Operator Profile</th>
                <th>Assigned Machine</th>
                <th>Rounds Completed</th>
                <th>Avg Gap Duration</th>
                <th>Shift Target Performance</th>
                <th>Hourly Tap Sequence</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMetrics.map((m) => {
                const rounds = m.roundsCompleted ?? m.rounds ?? 0;
                const gapVal = m.avgGapMinutes ?? 0;
                const perfVal = m.performancePercent ?? 0;
                const perfClass = perfVal >= 80 ? 'high' : perfVal >= 50 ? 'medium' : 'low';
                const perfTextClass = perfVal >= 80 ? 'high-text' : perfVal < 50 ? 'low-text' : '';

                return (
                  <tr key={`${m.employeeId}-${m.machineId}`}>
                    <td>
                      <div className="emp-profile">
                        <div className="avatar">{employeeInitials(m.employeeId, m.employeeName)}</div>
                        <div className="emp-names">
                          <strong className="emp-name">
                            {employeeDisplayName(m.employeeId, m.employeeName)}
                          </strong>
                          <span className="emp-id-badge num-tabular">Badge #{m.employeeId}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      {(() => {
                        const info = resolveMachineInfo(m.machineId);
                        return (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span
                                className="machine-tag num-tabular"
                                style={{
                                  fontWeight: 800,
                                  color: '#0F172A',
                                  background: '#E2E8F0',
                                  fontSize: '0.86rem',
                                  padding: '0.15rem 0.55rem',
                                  borderRadius: '6px'
                                }}
                              >
                                {info.frameNo || m.machineId}
                              </span>
                              {info.rfNo && (
                                <span
                                  style={{
                                    fontSize: '0.74rem',
                                    fontWeight: 800,
                                    color: '#0F766E',
                                    background: '#E6FFFA',
                                    padding: '0.12rem 0.45rem',
                                    borderRadius: '6px',
                                    border: '1px solid rgba(20, 184, 166, 0.35)'
                                  }}
                                  title={`Live IoT Telemetry Device: ${info.rfNo}`}
                                >
                                  {info.rfNo}
                                </span>
                              )}
                              {info.side && (
                                <span
                                  style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 800,
                                    color: info.side === 'LH' ? '#2563eb' : '#7c3aed',
                                    background: '#F1F5F9',
                                    padding: '0.1rem 0.4rem',
                                    borderRadius: '4px'
                                  }}
                                >
                                  {info.side} Side
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.74rem' }}>
                              <span
                                style={{
                                  width: '6.5px',
                                  height: '6.5px',
                                  borderRadius: '50%',
                                  background: info.runStatus === 'RUN' ? '#10B981' : info.runStatus === 'DOFF' ? '#f59e0b' : '#ef4444'
                                }}
                              />
                              <span style={{ fontWeight: 800, color: '#0F172A' }}>
                                {info.liveProduction > 0 ? `${info.liveProduction} kg` : info.runStatus}
                              </span>
                              {info.count && <span style={{ color: '#64748B', fontWeight: 700 }}>· {info.count}</span>}
                              <span style={{ color: '#94a3b8', fontSize: '0.68rem' }} title={`Raw Station Node: ${m.machineId}`}>
                                ({m.machineId})
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn-inspect-rounds num-tabular cursor-pointer"
                        onClick={() => openTapDetailsModal(m)}
                        title={`Inspect all ${rounds} RFID card taps`}
                      >
                        <span className="round-count-num">{rounds}</span>
                        <span className="round-count-label">Rounds</span>
                        <span className="round-inspect-icon">👁️</span>
                      </button>
                    </td>
                    <td>
                      <span className={`gap-chip num-tabular ${gapVal <= 5 ? 'gap-optimal' : 'gap-extended'}`}>
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
                          m.hourly.map((h, i) => (
                            <button
                              key={i}
                              type="button"
                              className="hourly-chip num-tabular cursor-pointer"
                              onClick={() => openTapDetailsModal(m, h)}
                              title={`Hour ${h.hour}: ${h.rounds} rounds, ${(h.avgGapMinutes || 0).toFixed(1)}m avg gap`}
                            >
                              <span className="chip-rounds">{h.rounds}r</span>
                            </button>
                          ))
                        ) : (
                          <span className="text-dim text-xs">No hourly logs</span>
                        )}
                      </div>
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="btn-view-taps cursor-pointer"
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

      {/* Tap Details Breakdown Modal Popup */}
      {selectedTapModal && (
        <div className="modal-backdrop" onClick={closeTapModal}>
          <div className="modal-content tap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-eyebrow">
                  <span className="modal-dot" />
                  <span>RFID CARD TAP BREAKDOWN</span>
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
                </div>
                <div className="summary-tile">
                  <span className="tile-label">AVG GAP DURATION</span>
                  <strong className="tile-val num-tabular">{selectedTapModal.avgGap.toFixed(1)} mins</strong>
                </div>
                <div className="summary-tile">
                  <span className="tile-label">ACTIVITY WINDOW</span>
                  <strong className="tile-val num-tabular">
                    {selectedTapModal.startTime
                      ? new Date(selectedTapModal.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}{' '}
                    –{' '}
                    {selectedTapModal.endTime
                      ? new Date(selectedTapModal.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '—'}
                  </strong>
                </div>
              </div>

              <div className="table-container modal-table-wrap">
                <table className="refined-table modal-table">
                  <thead>
                    <tr>
                      <th style={{ width: '110px' }}>Tap Sequence</th>
                      <th>Timestamp</th>
                      <th>Sensor / Station Node</th>
                      <th>Card Tap ID</th>
                      <th>Interval Gap Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedTapModal.taps.map((tap, idx) => (
                      <tr key={idx}>
                        <td>
                          <span className="tap-badge-pill num-tabular">Tap #{tap.tapNumber ?? idx + 1}</span>
                        </td>
                        <td>
                          <strong className="time-text num-tabular">
                            {tap.time ? new Date(tap.time).toLocaleTimeString() : '—'}
                          </strong>
                        </td>
                        <td>
                          <span className="device-tag-pill num-tabular">{tap.deviceId}</span>
                        </td>
                        <td>
                          <span className="card-id-text num-tabular">{tap.cardTap ?? '—'}</span>
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
                    {!selectedTapModal.taps.length && (
                      <tr>
                        <td colSpan={5} className="empty-table-cell">
                          No detailed RFID tap logs recorded for this selection.
                        </td>
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
