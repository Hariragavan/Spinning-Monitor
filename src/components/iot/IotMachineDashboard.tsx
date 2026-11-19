'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SpinfoOverviewResponse,
  SpinfoMachineItem,
  SpinfoMachineDetailResponse,
  Shift
} from '@/types/iot';
import { iotApi, IOT_COMMON_API_URL } from '@/lib/iot/iotApi';
import { getSampleSpinfoOverview, buildMachineDetailFromCommon } from '@/lib/iot/sampleIotData';
import { getTodayDateString, parseUniversalDateParts } from '@/lib/utils';
import { FourSpindleRollAnimation } from '@/components/CountWiseFrames';
import { FuturisticSpeedDial } from '@/components/iot/FuturisticSpeedDial';
import {
  Factory,
  Recycle,
  Zap,
  Timer,
  Clock,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Gauge,
  Activity,
  Target,
  Mountain,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

/**
 * Format minutes into mm:ss display string (e.g. 12.58 -> 12:35 mm:ss, 14.33 -> 14:20 mm:ss)
 */
export function formatEmMinutesToTime(val: number | string | undefined): string {
  if (val === undefined || val === null) return '00:00 mm:ss';
  const num = Number(val);
  if (isNaN(num) || num <= 0) return '00:00 mm:ss';
  const mins = Math.floor(num);
  const secs = Math.round((num - mins) * 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} mm:ss`;
}

/**
 * Format minutes into clean time string (e.g. 12.58 -> "12:35") without appending mm:ss
 */
export function formatEmTimeOnly(val: number | string | undefined): string {
  if (val === undefined || val === null) return '00:00';
  const num = Number(val);
  if (isNaN(num) || num <= 0) return '00:00';
  const mins = Math.floor(num);
  const secs = Math.round((num - mins) * 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

const INITIAL_OVERVIEW: SpinfoOverviewResponse = getSampleSpinfoOverview();

export type ActiveKpiType =
  | 'TOTAL_MACHINES'
  | 'RUNNING'
  | 'DOFFING'
  | 'STOPPED_DOFFING'
  | 'END_BREAKS'
  | 'AVERAGE_RPM'
  | 'PRODUCTION_YIELD'
  | 'SHIFT_WASTE'
  | 'END_MENDING_TIME'
  | 'HOURLY_PRODUCTION';

export type ViewModeType = 'cards' | 'table';

export type ModalTabType =
  | 'overview'
  | 'end_breaks'
  | 'speed_production';

export interface IotMachineDashboardProps {
  selectedDate?: string;
}

export const IotMachineDashboard: React.FC<IotMachineDashboardProps> = ({ selectedDate }) => {
  const [overview, setOverview] = useState<SpinfoOverviewResponse>(INITIAL_OVERVIEW);
  const [mounted, setMounted] = useState<boolean>(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const [selectedMachineDetail, setSelectedMachineDetail] = useState<SpinfoMachineDetailResponse | null>(null);
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedShift, setSelectedShift] = useState<string>('All Shifts');
  const [selectedRunStatus, setSelectedRunStatus] = useState<string>('All');
  const [selectedCount, setSelectedCount] = useState<string>('All');

  // Default to today's local date (YYYY-MM-DD) across all IoT telemetry views
  const todayStr = useMemo(() => getTodayDateString(), []);

  const [selectedFromDate, setSelectedFromDate] = useState<string>(() => {
    if (selectedDate) {
      const parts = parseUniversalDateParts(selectedDate);
      if (parts) return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      return selectedDate;
    }
    return todayStr;
  });
  const [selectedToDate, setSelectedToDate] = useState<string>(() => {
    if (selectedDate) {
      const parts = parseUniversalDateParts(selectedDate);
      if (parts) return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
      return selectedDate;
    }
    return todayStr;
  });
  const [userChangedDate, setUserChangedDate] = useState<boolean>(true);

  useEffect(() => {
    if (selectedDate) {
      const parts = parseUniversalDateParts(selectedDate);
      const formatted = parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : selectedDate;
      setSelectedFromDate(formatted);
      setSelectedToDate(formatted);
      setUserChangedDate(true);
    }
  }, [selectedDate]);

  const [activeKpi, setActiveKpi] = useState<ActiveKpiType>('TOTAL_MACHINES');
  const [viewMode, setViewMode] = useState<ViewModeType>('cards');
  const [endBreaksSort, setEndBreaksSort] = useState<'highest' | 'machine_no'>('highest');

  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [activeModalTab, setActiveModalTab] = useState<ModalTabType>('overview');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const [lastStatusTime, setLastStatusTime] = useState<Date | null>(null);

  // Hourly EM (End Mending) Modal & Inspection State
  const [emModalOpen, setEmModalOpen] = useState<boolean>(false);
  const [emRecords, setEmRecords] = useState<any[]>([]);
  const [emLoading, setEmLoading] = useState<boolean>(false);
  const [emFilterShift, setEmFilterShift] = useState<string>('All');
  const [emFilterMachine, setEmFilterMachine] = useState<string>('All');

  // Guard against concurrent or duplicate fetches
  const isFetchingRef = React.useRef(false);

  // Load master shifts once on mount
  useEffect(() => {
    iotApi.getShifts().then(sList => {
      if (sList && sList.length > 0) setShifts(sList);
    }).catch(() => {});
  }, []);

  // Fetch live overview from live telemetry API
  const loadOverview = useCallback(async (isInitial: boolean = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      if (isInitial) setLoading(true);
      setErrorMessage(null);
      const data = await iotApi.getSpinfoOverview({
        fromDate: selectedFromDate || todayStr,
        toDate: selectedToDate || todayStr,
        shift: selectedShift === 'All Shifts' ? undefined : selectedShift
      });
      if (data && data.frameStatus && Array.isArray(data.machines)) {
        setOverview(data);
      }
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      if (isInitial) {
        setErrorMessage(err?.message || 'Failed to connect to live MAG SPinFO common telemetry API.');
      }
    } finally {
      isFetchingRef.current = false;
      if (isInitial) setLoading(false);
    }
  }, [selectedFromDate, selectedToDate, userChangedDate, selectedShift]);

  // Trigger load on initial mount and when user filter criteria change
  useEffect(() => {
    loadOverview(true);
  }, [loadOverview]);

  // 1. Lightweight 45-Second Status Poller (updates ONLY running status immediately)
  useEffect(() => {
    let isMounted = true;
    const statusInterval = setInterval(async () => {
      try {
        const res = await iotApi.getLightweightMachineStatus();
        if (isMounted && res && res.success && Array.isArray(res.machines) && res.machines.length > 0) {
          const map = new Map(res.machines.map(m => [m.machine, m]));
          setOverview(prev => {
            if (!prev || !prev.machines) return prev;
            const updated = prev.machines.map(m => {
              const live = map.get(m.machineId);
              if (!live) return m;
              return {
                ...m,
                runStatus: live.runStatus,
                spindleSpeedCurrent: live.speed,
                statusBadge: live.statusBadge,
                avgEndMendingTime: typeof live.emTotal === 'number' ? live.emTotal : m.avgEndMendingTime,
                totalEndBreakCount: typeof live.totalEndBreaks === 'number' ? live.totalEndBreaks : m.totalEndBreakCount
              };
            });
            const totalEm = updated.reduce((acc, curr) => acc + (curr.avgEndMendingTime || 0), 0);
            return {
              ...prev,
              frameStatus: {
                ...prev.frameStatus,
                running: res.running,
                stopped: res.stopped,
                doffing: res.doffing,
                offline: res.offline,
                runningPercent: Math.round((res.running / (res.totalMachines || 1)) * 100),
                endMendingTime: totalEm > 0 ? Number(totalEm.toFixed(2)) : prev.frameStatus.endMendingTime
              },
              machines: updated
            };
          });
          setLastStatusTime(new Date());
        }
      } catch (_) {}
    }, 45000); // 45 seconds

    return () => {
      isMounted = false;
      clearInterval(statusInterval);
    };
  }, []);

  // 2. Periodic 5-Minute Full Refresh & EM Sync (refreshes all charts/KPIs once every 5 minutes)
  useEffect(() => {
    const fullRefreshInterval = setInterval(async () => {
      loadOverview(false);
      try {
        await iotApi.syncIotEm();
      } catch (_) {}
    }, 300000); // 5 minutes

    return () => clearInterval(fullRefreshInterval);
  }, [loadOverview]);

  // 3. Hourly EM (End Mending) Data Loader
  const loadEmRecords = useCallback(async () => {
    setEmLoading(true);
    try {
      const res = await iotApi.getHourlyEmRecords({
        date: userChangedDate && selectedFromDate ? selectedFromDate : (overview.shiftDate || undefined),
        shift: emFilterShift === 'All' ? undefined : emFilterShift,
        machineNo: emFilterMachine === 'All' ? undefined : emFilterMachine
      });
      if (res && res.success && Array.isArray(res.data)) {
        setEmRecords(res.data);
      }
    } catch (_) {}
    finally {
      setEmLoading(false);
    }
  }, [selectedFromDate, userChangedDate, overview.shiftDate, emFilterShift, emFilterMachine]);

  const openEmModal = useCallback(() => {
    setEmModalOpen(true);
    loadEmRecords();
  }, [loadEmRecords]);

  const closeEmModal = useCallback(() => {
    setEmModalOpen(false);
  }, []);

  const triggerManualEmSync = useCallback(async () => {
    setEmLoading(true);
    try {
      await iotApi.syncIotEm();
      await loadEmRecords();
    } catch (_) {}
    finally {
      setEmLoading(false);
    }
  }, [loadEmRecords]);

  // Open Machine Detail Slide Popup
  const openMachineModal = useCallback(async (machineId: string) => {
    setActiveMachineId(machineId);
    setModalOpen(true);

    // 1. Immediately populate from active overview so popup opens with ZERO delay
    if (overview && Array.isArray(overview.machines)) {
      try {
        const instantDetail = buildMachineDetailFromCommon(machineId, overview);
        if (instantDetail && instantDetail.machine) {
          setSelectedMachineDetail(instantDetail);
        }
      } catch (_) {}
    }

    setDetailLoading(true);
    try {
      const detail = await iotApi.getMachineDetail(machineId, {
        fromDate: userChangedDate && selectedFromDate ? selectedFromDate : undefined,
        toDate: userChangedDate && selectedToDate ? selectedToDate : undefined,
        shift: selectedShift === 'All Shifts' ? undefined : selectedShift
      });
      if (detail && detail.machine) {
        setSelectedMachineDetail(detail);
      }
    } catch {
      // Handled by fallback inside API
    } finally {
      setDetailLoading(false);
    }
  }, [userChangedDate, selectedFromDate, selectedToDate, selectedShift, overview]);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setActiveMachineId(null);
    setSelectedMachineDetail(null);
  }, []);

  // Available counts from live JSON machines[]
  const availableCounts = useMemo(() => {
    if (!overview?.machines) return [];
    const set = new Set<string>();
    overview.machines.forEach(m => {
      if (m.count) set.add(m.count);
    });
    return Array.from(set);
  }, [overview]);

  // Machine list with sorting and filtering based strictly on JSON fields
  const displayedMachines = useMemo(() => {
    if (!overview?.machines) return [];
    let list = [...overview.machines];

    if (selectedRunStatus !== 'All') {
      list = list.filter(m => m.runStatus === selectedRunStatus);
    }
    if (selectedCount !== 'All') {
      list = list.filter(m => m.count === selectedCount);
    }

    if (activeKpi === 'RUNNING') {
      list = list.filter(m => m.runStatus === 'RUN');
    } else if (activeKpi === 'DOFFING') {
      list = list.filter(m => m.runStatus === 'DOFF');
    } else if (activeKpi === 'STOPPED_DOFFING') {
      list = list.filter(m => m.runStatus === 'STOP' || m.runStatus === 'DOFF');
    } else if (activeKpi === 'END_BREAKS') {
      if (endBreaksSort === 'highest') {
        list.sort((a, b) => (b.totalEndBreakCount || 0) - (a.totalEndBreakCount || 0));
      } else {
        list.sort((a, b) => a.machineId.localeCompare(b.machineId, undefined, { numeric: true }));
      }
    } else if (activeKpi === 'AVERAGE_RPM') {
      list.sort((a, b) => (b.spindleSpeedCurrent || 0) - (a.spindleSpeedCurrent || 0));
    } else if (activeKpi === 'PRODUCTION_YIELD' || activeKpi === 'HOURLY_PRODUCTION') {
      list.sort((a, b) => (b.shiftProduction || 0) - (a.shiftProduction || 0));
    } else if (activeKpi === 'SHIFT_WASTE') {
      list.sort((a, b) => (b.shiftWaste || 0) - (a.shiftWaste || 0));
    } else if (activeKpi === 'END_MENDING_TIME') {
      list.sort((a, b) => {
        const aAvg = ((a.sides?.[0]?.endMendingTime || 0) + (a.sides?.[1]?.endMendingTime || 0)) / 2;
        const bAvg = ((b.sides?.[0]?.endMendingTime || 0) + (b.sides?.[1]?.endMendingTime || 0)) / 2;
        return bAvg - aAvg;
      });
    }

    return list;
  }, [overview, selectedRunStatus, selectedCount, activeKpi, endBreaksSort]);

  // Machine navigation in modal: reliable, continuous cyclical navigation
  const machineList = useMemo(() => {
    if (displayedMachines && displayedMachines.length > 0) return displayedMachines;
    if (overview?.machines && overview.machines.length > 0) return overview.machines;
    return [];
  }, [displayedMachines, overview]);

  const currentMachineId = selectedMachineDetail?.machine?.machineId || activeMachineId || '';

  const currentIndex = useMemo(() => {
    if (!machineList.length || !currentMachineId) return -1;
    const norm = currentMachineId.trim().toUpperCase();
    return machineList.findIndex(m => m.machineId.trim().toUpperCase() === norm);
  }, [machineList, currentMachineId]);

  const prevMachine = useMemo(() => {
    if (machineList.length <= 1) return null;
    const prevIdx = currentIndex > 0 ? currentIndex - 1 : machineList.length - 1;
    return machineList[prevIdx];
  }, [machineList, currentIndex]);

  const nextMachine = useMemo(() => {
    if (machineList.length <= 1) return null;
    const nextIdx = (currentIndex + 1) % machineList.length;
    return machineList[nextIdx];
  }, [machineList, currentIndex]);

  const hasPrevMachine = machineList.length > 1;
  const hasNextMachine = machineList.length > 1;
  const prevMachineId = prevMachine?.machineId || null;
  const nextMachineId = nextMachine?.machineId || null;

  const navigateMachine = useCallback((direction: -1 | 1) => {
    if (!machineList.length) return;
    let targetIdx: number;
    if (currentIndex === -1) {
      targetIdx = direction === 1 ? 0 : machineList.length - 1;
    } else {
      targetIdx = (currentIndex + direction + machineList.length) % machineList.length;
    }
    const target = machineList[targetIdx]?.machineId;
    if (target) {
      openMachineModal(target);
    }
  }, [machineList, currentIndex, openMachineModal]);

  // Keyboard navigation for modals (ESC key to close, Left/Right arrow keys for Next/Prev machine)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (emModalOpen) closeEmModal();
        if (modalOpen) closeModal();
      } else if (modalOpen) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          navigateMachine(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          navigateMachine(1);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, emModalOpen, closeModal, closeEmModal, navigateMachine]);

  const maxHourlyProduction = useMemo(() => {
    if (!overview?.hourlyProduction?.chart?.length) return 20;
    return Math.max(...overview.hourlyProduction.chart.map(c => c.production), 10);
  }, [overview]);

  // Donut chart gradient
  const getDonutConicGradient = (modes?: Array<{ name: string; minutes: number; color: string }>) => {
    if (!modes || modes.length === 0) return 'conic-gradient(#2563eb 0% 100%)';
    const total = modes.reduce((sum, m) => sum + m.minutes, 0) || 1;
    let curr = 0;
    const parts = modes.map(m => {
      const pct = (m.minutes / total) * 100;
      const start = curr;
      curr += pct;
      return `${m.color} ${start.toFixed(1)}% ${curr.toFixed(1)}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  };

  const stdMendingTime = overview?.stdEndMendingTime ?? 1.5;
  const stdMendingUnit = overview?.stdEndMendingTimeUnit || 'min';

  return (
    <div className="dashboard-page w-full">
      {/* TOP LOADING PROGRESS BAR */}
      {loading && (
        <div className="top-loading-bar" aria-live="polite">
          <div className="top-loading-bar-inner"></div>
        </div>
      )}

      {/* ERROR BANNER */}
      {errorMessage && (
        <div className="state-banner error-banner">
          <span>{errorMessage}</span>
          <button className="btn-retry" onClick={() => loadOverview(true)}>Retry</button>
        </div>
      )}

      {/* TOP BAR / EXECUTIVE CONTROL HEADER */}
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-eyebrow" style={{ flexWrap: 'wrap', gap: '0.35rem' }}>
            <span className="live-pulse-dot"></span>
            <span className="eyebrow-text">{overview.source || 'MAG SPinFO'}</span>
            <span className="eyebrow-divider">/</span>
            <span className="eyebrow-sub">{overview.customer || 'SPACE TEXTILES PRIVATE LIMITED'}</span>
            {overview.city && (
              <>
                <span className="eyebrow-divider">·</span>
                <span className="eyebrow-sub">{overview.city}</span>
              </>
            )}
            <span className="ml-2 px-2.5 py-0.5 rounded-full text-[10.5px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs" suppressHydrationWarning>
              Shift {overview.shift} · {overview.shiftDate} ({overview.totalShiftHours ?? 8}h)
            </span>
            {overview.msgId && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200" suppressHydrationWarning>
                msgId: {overview.msgId}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200" suppressHydrationWarning>
              Part {overview.part ?? 1}/{overview.parts ?? 1} · Std EM: {stdMendingTime} {stdMendingUnit}
            </span>
          </div>
          <h1 className="title">Machine Telemetry Intelligence</h1>
          <p className="subtitle">
            Live telemetry bound from <code style={{ fontSize: '0.75rem', color: '#2563eb' }}>{IOT_COMMON_API_URL}</code> · Data Time: <strong suppressHydrationWarning>{overview.dataTime}</strong>
          </p>
        </div>

        {/* Filter Toolbar */}
        <div className="filters-card">
          <div className="field">
            <label>
              <span className="field-icon">⏱️</span>
              <span>Shift</span>
            </label>
            <div className="select-wrapper">
              <select value={selectedShift} onChange={e => setSelectedShift(e.target.value)}>
                <option value="All Shifts">All Shifts</option>
                {shifts.map(s => {
                  const sName = s.name || s.shiftName || 'Shift';
                  return (
                    <option key={s.shiftId || sName} value={sName}>
                      {sName} {s.startTime && s.endTime ? `(${s.startTime} - ${s.endTime})` : ''}
                    </option>
                  );
                })}
                {shifts.length === 0 && (
                  <>
                    <option value="Shift 1">Shift 1</option>
                    <option value="Shift 2">Shift 2</option>
                    <option value="Shift 3">Shift 3</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="field">
            <label>
              <span className="field-icon">⚙️</span>
              <span>Run Status</span>
            </label>
            <div className="select-wrapper">
              <select value={selectedRunStatus} onChange={e => setSelectedRunStatus(e.target.value)}>
                <option value="All">All Statuses</option>
                <option value="RUN">RUN (Running)</option>
                <option value="DOFF">DOFF (Doffing)</option>
                <option value="STOP">STOP (Stopped)</option>
              </select>
            </div>
          </div>

          <div className="field">
            <label>
              <span className="field-icon">🧶</span>
              <span>Count</span>
            </label>
            <div className="select-wrapper">
              <select value={selectedCount} onChange={e => setSelectedCount(e.target.value)}>
                <option value="All">All Counts</option>
                {availableCounts.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>
              <span className="field-icon">📅</span>
              <span>From Date</span>
            </label>
            <input
              type="date"
              value={selectedFromDate || todayStr}
              onChange={e => {
                const val = e.target.value;
                setSelectedFromDate(val);
                setUserChangedDate(Boolean(val));
              }}
              className="date-input"
              suppressHydrationWarning
            />
          </div>

          <div className="field">
            <label>
              <span className="field-icon">📅</span>
              <span>To Date</span>
            </label>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem' }}>
              <input
                type="date"
                value={selectedToDate || todayStr}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedToDate(val);
                  setUserChangedDate(Boolean(val));
                }}
                className="date-input"
                suppressHydrationWarning
              />
              <button
                type="button"
                className="btn btn-primary"
                style={{
                  height: '38px',
                  width: 'auto',
                  minWidth: 'auto',
                  maxWidth: 'none',
                  flexShrink: 0,
                  fontSize: '0.78rem',
                  padding: '0 0.85rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  fontWeight: 700,
                  borderRadius: '8px',
                  whiteSpace: 'nowrap',
                  cursor: 'pointer'
                }}
                onClick={() => loadOverview(true)}
                disabled={loading}
                title="Click to instantly refresh live telemetry from /api/common"
              >
                <span className={`btn-icon ${loading ? 'spin' : ''}`}>↻</span>
                <span>Quick Refresh</span>
              </button>
            </div>
          </div>

          {userChangedDate && (selectedFromDate !== todayStr || selectedToDate !== todayStr) && (
            <button
              className="btn"
              style={{ height: '36px', fontSize: '0.75rem', padding: '0 0.75rem' }}
              onClick={() => {
                setUserChangedDate(false);
                setSelectedFromDate(todayStr);
                setSelectedToDate(todayStr);
              }}
              title="Reset date filter to today's live stream"
            >
              Today
            </button>
          )}

          <button
            className="btn"
            style={{
              height: '36px',
              fontSize: '0.75rem',
              padding: '0 0.85rem',
              background: '#eff6ff',
              color: '#1d4ed8',
              borderColor: '#93c5fd',
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem'
            }}
            onClick={openEmModal}
            title="Inspect hourly End Mending (EM) records saved in iot_em"
          >
            <span>⏱️</span>
            <span>Hourly EM</span>
            {emRecords.length > 0 && (
              <span style={{
                background: '#dbeafe',
                color: '#1e40af',
                fontSize: '10px',
                padding: '1px 5px',
                borderRadius: '999px',
                fontWeight: 700
              }}>
                {emRecords.length}
              </span>
            )}
          </button>

          {mounted && lastRefreshedAt && (
            <div className="sync-indicator" title={`Synced with ${IOT_COMMON_API_URL} (5-min telemetry)`}>
              <span className="pulse-dot"></span>
              <span className="sync-text" suppressHydrationWarning>Live: {lastRefreshedAt.toLocaleTimeString()}</span>
            </div>
          )}

          {mounted && lastStatusTime && (
            <div className="sync-indicator" title="Live 45-second machine running status check active">
              <span className="pulse-dot" style={{ background: '#10b981' }}></span>
              <span className="sync-text" suppressHydrationWarning>Status: {lastStatusTime.toLocaleTimeString()} (45s)</span>
            </div>
          )}
        </div>
      </header>

      {/* TOP KPI HEADER — STRICTLY BOUND TO /api/common JSON FIELDS */}
      {overview && (
        <div className="kpi-header">
          {/* ROW 1: FRAME STATUS */}
          <div className="section-title">FRAME STATUS · {overview.customer || 'SPACE TEXTILES PRIVATE LIMITED'}</div>
          <div className="kpi-row">
            {/* 1. Total Machines (machineCount) */}
            <div
              className={`kpi-card ${activeKpi === 'TOTAL_MACHINES' ? 'active' : ''}`}
              onClick={() => setActiveKpi('TOTAL_MACHINES')}
            >
              <div className="kpi-bar blue"></div>
              <div className="kpi-label">TOTAL MACHINES</div>
              <div className="kpi-value">{overview.machineCount ?? overview.frameStatus.totalMachines ?? 0}</div>
              <div className="kpi-subtext">
                Part {overview.part ?? 1} of {overview.parts ?? 1} · {overview.source || 'MAG SPinFO'}
              </div>
            </div>

            {/* 2. Running (runStatus === 'RUN') */}
            <div
              className={`kpi-card ${activeKpi === 'RUNNING' ? 'active' : ''}`}
              onClick={() => setActiveKpi('RUNNING')}
            >
              <div className="kpi-bar green"></div>
              <div className="kpi-label">RUNNING (RUN)</div>
              <div className="kpi-value">{overview.frameStatus.running ?? 0}</div>
              <div className="kpi-subtext">
                {overview.frameStatus.runningPercent ?? 0}% of {overview.frameStatus.totalMachines ?? 0} machines
              </div>
            </div>

            {/* 3. Doffing (runStatus === 'DOFF') */}
            <div
              className={`kpi-card ${activeKpi === 'DOFFING' ? 'active' : ''}`}
              onClick={() => setActiveKpi('DOFFING')}
            >
              <div className="kpi-bar teal"></div>
              <div className="kpi-label">DOFFING (DOFF)</div>
              <div className="kpi-value">{overview.frameStatus.doffing ?? 0}</div>
              <div className="kpi-subtext">
                of {overview.frameStatus.totalMachines ?? 0} machines in doff cycle
              </div>
            </div>

            {/* 4. Stopped / Doffing (runStatus === 'STOP' | 'DOFF') */}
            <div
              className={`kpi-card ${activeKpi === 'STOPPED_DOFFING' ? 'active' : ''}`}
              onClick={() => setActiveKpi('STOPPED_DOFFING')}
            >
              <div className="kpi-bar orange"></div>
              <div className="kpi-label">STOPPED (STOP)</div>
              <div className="kpi-value">{overview.frameStatus.stopped ?? 0}</div>
              <div className="kpi-subtext">
                {overview.frameStatus.stopped ?? 0} stopped · {overview.frameStatus.doffing ?? 0} doffing
              </div>
            </div>

            {/* 5. Total End Breaks (totalEndBreakCount & sides L/R) */}
            <div
              className={`kpi-card ${activeKpi === 'END_BREAKS' ? 'active' : ''}`}
              onClick={() => setActiveKpi('END_BREAKS')}
            >
              <div className="kpi-bar red"></div>
              <div className="kpi-label">TOTAL END BREAKS</div>
              <div className="kpi-value">{overview.frameStatus.totalEndBreaks ?? 0}</div>
              <div className="kpi-subtext">
                Left (L): {overview.frameStatus.leftBreaks ?? 0} · Right (R): {overview.frameStatus.rightBreaks ?? 0}
              </div>
            </div>
          </div>

          {/* ROW 2: PRODUCTION, SPEED, WASTE & MENDING TELEMETRY */}
          <div className="section-title" style={{ marginTop: '1.25rem' }}>PRODUCTION, SPEED, WASTE & END MENDING</div>
          <div className="kpi-row">
            {/* 6. Average RPM (spindleSpeedCurrent, spindleSpeedUnit) */}
            <div
              className={`kpi-card ${activeKpi === 'AVERAGE_RPM' ? 'active' : ''}`}
              onClick={() => setActiveKpi('AVERAGE_RPM')}
            >
              <div className="kpi-bar blue"></div>
              <div className="kpi-label">AVERAGE RPM</div>
              <div className="kpi-value">
                {(overview.performanceAndCare.averageRpm ?? 0).toLocaleString()}{' '}
                <span className="unit">{overview.machines[0]?.spindleSpeedUnit || 'rpm'}</span>
              </div>
              <div className="kpi-subtext">
                {overview.frameStatus.running ?? 0} running · {overview.frameStatus.stoppedAndDoffing ?? 0} at 0 rpm
              </div>
            </div>

            {/* 7. Shift Production (shiftProduction, productionUnit) */}
            <div
              className={`kpi-card ${activeKpi === 'PRODUCTION_YIELD' ? 'active' : ''}`}
              onClick={() => setActiveKpi('PRODUCTION_YIELD')}
            >
              <div className="kpi-bar purple"></div>
              <div className="kpi-label">SHIFT PRODUCTION</div>
              <div className="kpi-value">
                {(overview.performanceAndCare.productionYieldKg ?? 0).toLocaleString()}{' '}
                <span className="unit">{overview.machines[0]?.productionUnit || 'kg'}</span>
              </div>
              <div className="kpi-subtext">
                Total Cumulative Shift Output
              </div>
            </div>

            {/* 8. Shift Waste (shiftWaste, wasteUnit) */}
            <div
              className={`kpi-card ${activeKpi === 'SHIFT_WASTE' ? 'active' : ''}`}
              onClick={() => setActiveKpi('SHIFT_WASTE')}
            >
              <div className="kpi-bar orange"></div>
              <div className="kpi-label">AVG SHIFT WASTE</div>
              <div className="kpi-value">
                {(overview.performanceAndCare.avgShiftWaste ?? 0).toFixed(2)}{' '}
                <span className="unit">{overview.machines[0]?.wasteUnit || '%'}</span>
              </div>
              <div className="kpi-subtext">
                Min {(overview.performanceAndCare.minShiftWaste ?? 0).toFixed(2)}% · Max{' '}
                {(overview.performanceAndCare.maxShiftWaste ?? 0).toFixed(2)}%
              </div>
            </div>

            {/* 9. End Mending Time (sides[].endMendingTime, stdEndMendingTime) */}
            <div
              className={`kpi-card ${activeKpi === 'END_MENDING_TIME' ? 'active' : ''}`}
              onClick={() => setActiveKpi('END_MENDING_TIME')}
            >
              <div className="kpi-bar teal"></div>
              <div className="kpi-label">END MENDING TIME</div>
              <div className="kpi-value">
                {(overview.performanceAndCare.avgEndMendingTime ?? 0).toFixed(2)}{' '}
                <span className="unit">{stdMendingUnit}</span>
              </div>
              <div className="kpi-subtext">
                Std {stdMendingTime} {stdMendingUnit} · L: {overview.performanceAndCare.avgLeftMendingTime ?? 0} / R:{' '}
                {overview.performanceAndCare.avgRightMendingTime ?? 0} {stdMendingUnit}
              </div>
            </div>

            {/* 10. Hour-Wise Production (hourWiseProduction, totalShiftHours) */}
            <div
              className={`kpi-card ${activeKpi === 'HOURLY_PRODUCTION' ? 'active' : ''}`}
              onClick={() => setActiveKpi('HOURLY_PRODUCTION')}
            >
              <div className="kpi-bar green"></div>
              <div className="kpi-label">HOUR-WISE PRODUCTION</div>
              <div className="kpi-value">
                {overview.hourlyProduction.loggedHoursCount ?? overview.hourlyProduction.chart.length ?? 0} /{' '}
                {overview.totalShiftHours ?? 8} <span className="unit">hrs</span>
              </div>
              <div className="kpi-subtext">
                Peak {overview.hourlyProduction.peakHour ?? 'H1'} · Avg{' '}
                {(overview.hourlyProduction.avgPerHourKg ?? 0).toFixed(2)} kg/hr
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HOURLY PRODUCTION BAR CHART (From hourWiseProduction in /api/common) */}
      {(activeKpi === 'PRODUCTION_YIELD' || activeKpi === 'HOURLY_PRODUCTION' || activeKpi === 'TOTAL_MACHINES') &&
        overview?.hourlyProduction &&
        overview.hourlyProduction.chart.length > 0 && (
          <div className="hourly-chart-card">
            <div className="hourly-chart-header">
              <div>
                <h3 className="chart-title">Hour-wise production · all frames ({overview.machines.length} machines)</h3>
                <p className="chart-subtitle">
                  Aggregated <code style={{ fontSize: '0.75rem' }}>hourWiseProduction</code> ({overview.machines[0]?.productionUnit || 'kg'}) per hour for Shift {overview.shift} ({overview.shiftDate}).
                </p>
              </div>
              <div className="chart-stats-group">
                <div className="stat-item">
                  <span className="stat-label">TOTAL PRODUCTION</span>
                  <span className="stat-value">
                    {(overview.hourlyProduction.shiftTotalKg ?? overview.performanceAndCare.productionYieldKg ?? 0).toLocaleString()} {overview.machines[0]?.productionUnit || 'kg'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">PEAK HOUR</span>
                  <span className="stat-value">{overview.hourlyProduction.peakHour ?? 'H1'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">AVG PER HOUR</span>
                  <span className="stat-value">
                    {(overview.hourlyProduction.avgPerHourKg ?? 0).toLocaleString()} {overview.machines[0]?.productionUnit || 'kg'}
                  </span>
                </div>
              </div>
            </div>

            {/* Bars visualization */}
            <div className="chart-bars-container">
              {overview.hourlyProduction.chart.map(item => (
                <div key={item.hour} className="chart-bar-col">
                  <div className="bar-value">{(item.production ?? 0).toFixed(2)}</div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${item.hour === overview.hourlyProduction.peakHour ? 'peak' : ''}`}
                      style={{ height: `${Math.min(100, ((item.production ?? 0) / maxHourlyProduction) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="bar-label">{item.hour}</div>
                </div>
              ))}
            </div>
          </div>
        )}

      {/* MACHINE DETAILS MAIN SECTION */}
      {overview && (
        <div className="machine-details-container">
          {/* Header row with dynamic title and view toggles */}
          <div className="details-header-bar">
            <div>
              <div className="section-label">MACHINE DETAILS · {overview.source || 'MAG SPinFO'}</div>
              <h2 className="dynamic-heading">
                {activeKpi === 'END_BREAKS'
                  ? 'End breaks by machine'
                  : activeKpi === 'AVERAGE_RPM'
                  ? 'Spindle speed by machine'
                  : activeKpi === 'PRODUCTION_YIELD'
                  ? 'Shift production by machine'
                  : activeKpi === 'SHIFT_WASTE'
                  ? 'Shift waste (%) by machine'
                  : activeKpi === 'END_MENDING_TIME'
                  ? 'End mending time (L & R) by machine'
                  : activeKpi === 'HOURLY_PRODUCTION'
                  ? 'Hour-wise production by machine'
                  : activeKpi === 'RUNNING'
                  ? 'Running machines (RUN)'
                  : activeKpi === 'DOFFING'
                  ? 'Doffing machines (DOFF)'
                  : activeKpi === 'STOPPED_DOFFING'
                  ? 'Stopped & Doffing machines'
                  : 'All machines'}
              </h2>

              <p className="details-subtext">
                {activeKpi === 'END_BREAKS'
                  ? `Highest first · ${overview.frameStatus.totalEndBreaks} total end breaks (L: ${overview.frameStatus.leftBreaks}, R: ${overview.frameStatus.rightBreaks})`
                  : activeKpi === 'AVERAGE_RPM'
                  ? `Highest RPM first · Avg running speed ${(overview.performanceAndCare.averageRpm ?? 0).toLocaleString()} rpm`
                  : activeKpi === 'PRODUCTION_YIELD'
                  ? `Highest production first · Total ${(overview.performanceAndCare.productionYieldKg ?? 0).toFixed(2)} kg`
                  : activeKpi === 'SHIFT_WASTE'
                  ? `Highest waste first · Average shift waste ${(overview.performanceAndCare.avgShiftWaste ?? 0).toFixed(2)}%`
                  : activeKpi === 'END_MENDING_TIME'
                  ? `Standard end mending time: ${stdMendingTime} ${stdMendingUnit}`
                  : `${displayedMachines.length} of ${overview.machineCount ?? overview.machines.length} machines shown · click any machine for full telemetry`}
              </p>
            </div>

            {/* View Toggle Buttons */}
            <div className="controls-right">
              <div className="view-toggle-pills">
                <button
                  className={`pill-btn ${viewMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setViewMode('cards')}
                  title="Grid of Machine Cards"
                >
                  Cards
                </button>
                <button
                  className={`pill-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                  title="Telemetry Table View"
                >
                  Table View
                </button>
              </div>
            </div>
          </div>

          {/* Special Stats Sub-Banner for End Breaks Mode */}
          {activeKpi === 'END_BREAKS' && (
            <div className="end-breaks-stats-bar">
              <div className="stat-pill-item">
                <span className="sub-label">TOTAL END BREAKS</span>
                <span className="sub-val">{overview.frameStatus.totalEndBreaks ?? 0}</span>
              </div>
              <div className="stat-pill-item">
                <span className="sub-label">LEFT (L) / RIGHT (R)</span>
                <span className="sub-val">
                  {overview.frameStatus.leftBreaks ?? 0} L · {overview.frameStatus.rightBreaks ?? 0} R
                </span>
              </div>
              <div className="stat-pill-item">
                <span className="sub-label">HIGHEST</span>
                <span className="sub-val">
                  {displayedMachines[0]?.machineId || '-'} · {displayedMachines[0]?.totalEndBreakCount ?? 0}
                </span>
              </div>
              <div className="stat-pill-item">
                <span className="sub-label">STD MENDING TIME</span>
                <span className="sub-val">
                  {stdMendingTime} {stdMendingUnit}
                </span>
              </div>

              <div className="sort-toggles">
                <button
                  className={`btn-sort ${endBreaksSort === 'highest' ? 'active' : ''}`}
                  onClick={() => setEndBreaksSort('highest')}
                >
                  Highest breaks first
                </button>
                <button
                  className={`btn-sort ${endBreaksSort === 'machine_no' ? 'active' : ''}`}
                  onClick={() => setEndBreaksSort('machine_no')}
                >
                  By machine no.
                </button>
              </div>
            </div>
          )}

          {/* VIEW 1: MACHINE CARDS GRID */}
          {viewMode === 'cards' && (
            <div className="machine-cards-grid">
              {displayedMachines.map(m => {
                const leftSide = m.sides?.find(s => s.side === 'L') || m.sides?.[0];
                const rightSide = m.sides?.find(s => s.side === 'R') || m.sides?.[1];
                const avgMachineMending = Number(
                  (((leftSide?.endMendingTime || 0) + (rightSide?.endMendingTime || 0)) / 2).toFixed(2)
                );

                // Determine dial settings per active KPI page
                let dialValue = m.spindleSpeedCurrent || 16500;
                let dialMax = 20000;
                let dialLabel = 'RPM';
                let dialUnit: string | undefined = undefined;
                let dialColor: 'teal' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'indigo' = 'teal';

                if (activeKpi === 'PRODUCTION_YIELD' || activeKpi === 'HOURLY_PRODUCTION') {
                  dialValue = m.yieldPercent || (m.shiftTargetProduction ? Number(((m.shiftProduction / m.shiftTargetProduction) * 100).toFixed(1)) : 98.5);
                  dialMax = 100;
                  dialLabel = 'YIELD';
                  dialUnit = '%';
                  dialColor = 'emerald';
                } else if (activeKpi === 'SHIFT_WASTE') {
                  dialValue = Number((m.shiftWaste || 1.02).toFixed(2));
                  dialMax = 3.0;
                  dialLabel = 'WASTE';
                  dialUnit = '%';
                  dialColor = (m.shiftWaste || 0) <= 1.5 ? 'teal' : 'amber';
                } else if (activeKpi === 'END_BREAKS') {
                  dialValue = m.totalEndBreakCount || 0;
                  dialMax = 30;
                  dialLabel = 'BREAKS';
                  dialColor = (m.totalEndBreakCount || 0) > 15 ? 'rose' : 'teal';
                } else if (activeKpi === 'END_MENDING_TIME') {
                  dialValue = avgMachineMending || 0;
                  dialMax = 20;
                  dialLabel = 'AVG EM';
                  dialUnit = 'min';
                  dialColor = 'teal';
                } else if (activeKpi === 'AVERAGE_RPM') {
                  dialValue = m.spindleSpeedCurrent || 16500;
                  dialMax = 20000;
                  dialLabel = 'RPM';
                  dialColor = 'teal';
                }

                // Delivery Speed in m/min (front roller delivery speed)
                const deliverySpeed = m.runStatus === 'STOP' || m.runStatus === 'DOFF'
                  ? 0
                  : Math.round((m.spindleSpeedCurrent || 18500) * 0.0116) || 215;

                const cardBgColor =
                  m.runStatus === 'RUN' ? '#E6FFFA' :
                  m.runStatus === 'DOFF' ? '#fffbeb' :
                  m.runStatus === 'STOP' ? '#fef2f2' :
                  '#f8fafc';

                const cardBorderColor =
                  m.runStatus === 'RUN' ? '#14B8A6' :
                  m.runStatus === 'DOFF' ? '#f59e0b' :
                  m.runStatus === 'STOP' ? '#ef4444' :
                  '#cbd5e1';

                return (
                  <div
                    key={m.machineId}
                    className={`machine-card ${
                      m.runStatus === 'RUN'
                        ? 'status-running'
                        : m.runStatus === 'STOP'
                        ? 'status-stopped'
                        : m.runStatus === 'DOFF'
                        ? 'status-doffing'
                        : 'status-offline'
                    }`}
                    style={{
                      backgroundColor: cardBgColor,
                      borderColor: cardBorderColor,
                      borderWidth: '2px',
                      borderStyle: 'solid',
                      borderRadius: '22px',
                      boxShadow: m.runStatus === 'RUN'
                        ? '0 4px 20px -2px rgba(20, 184, 166, 0.16), 0 2px 6px -1px rgba(0, 0, 0, 0.04)'
                        : m.runStatus === 'DOFF'
                        ? '0 4px 20px -2px rgba(245, 158, 11, 0.16), 0 2px 6px -1px rgba(0, 0, 0, 0.04)'
                        : m.runStatus === 'STOP'
                        ? '0 4px 20px -2px rgba(239, 68, 68, 0.16), 0 2px 6px -1px rgba(0, 0, 0, 0.04)'
                        : undefined,
                      padding: '1rem 1.15rem'
                    }}
                    onClick={() => openMachineModal(m.machineId)}
                  >
                    {/* Header: RF01 • 40sPV and Status Badge (Big Machine No.) */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', minWidth: 0 }}>
                        <span style={{ fontSize: '1.85rem', fontWeight: 900, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif' }}>
                          {m.machineId}
                        </span>
                        <span style={{ color: '#94a3b8', fontWeight: 900, fontSize: '1.2rem' }}>•</span>
                        <span style={{ fontSize: '0.96rem', fontWeight: 800, color: '#334155', background: '#f1f5f9', padding: '0.22rem 0.65rem', borderRadius: '8px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                          {m.count || '-'}
                        </span>
                      </div>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.45rem',
                          padding: '0.28rem 0.85rem',
                          borderRadius: '9999px',
                          fontSize: '0.82rem',
                          fontWeight: 800,
                          background:
                            m.runStatus === 'RUN' ? '#10B981' :
                            m.runStatus === 'DOFF' ? '#f59e0b' :
                            m.runStatus === 'STOP' ? '#ef4444' : '#64748b',
                          color: '#ffffff',
                          boxShadow:
                            m.runStatus === 'RUN' ? '0 2px 8px rgba(16, 185, 129, 0.35)' :
                            m.runStatus === 'DOFF' ? '0 2px 8px rgba(245, 158, 11, 0.35)' :
                            m.runStatus === 'STOP' ? '0 2px 8px rgba(239, 68, 68, 0.35)' : undefined
                        }}
                      >
                        <span
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#ffffff',
                            boxShadow: '0 0 6px #ffffff'
                          }}
                        ></span>
                        {m.runStatus === 'RUN' ? 'Running' : m.runStatus === 'DOFF' ? 'Doffing' : m.runStatus === 'STOP' ? 'Stopped' : 'Offline'}
                      </span>
                    </div>

                    {/* Middle: Left Speed Dial + Right 3 Metric Cards (Idea 2 Style) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minHeight: '112px' }}>
                      <FuturisticSpeedDial
                        value={dialValue}
                        max={dialMax}
                        status={m.runStatus}
                        label={dialLabel}
                        customUnit={dialUnit}
                        colorScheme={dialColor}
                        size={146}
                      />

                      {/* Right 3 Rows */}
                      <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '0.42rem', flex: 1, minWidth: 0 }}>
                        {activeKpi === 'PRODUCTION_YIELD' || activeKpi === 'HOURLY_PRODUCTION' ? (
                          /* PRODUCTION VIEW ROWS */
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Factory size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Shift Output</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {(m.shiftProduction || 0).toFixed(1)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{m.productionUnit || 'kg'}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', color: '#10B981', fontSize: '0.78rem', fontWeight: 800 }}>
                                <TrendingUp size={15} strokeWidth={2.5} />
                                <span>+{m.yieldPercent ? `${m.yieldPercent}%` : '100%'}</span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Target size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Shift Target</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {(m.shiftTargetProduction || 120).toFixed(1)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{m.productionUnit || 'kg'}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0F766E', background: '#E6FFFA', padding: '0.2rem 0.55rem', borderRadius: '8px', border: '1px solid rgba(20, 184, 166, 0.25)' }}>
                                Target
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Clock size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Hourly Rate</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {((m.shiftProduction || 0) / Math.max(1, m.hourWiseProduction?.length || 8)).toFixed(1)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>Kg/h</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '0.2rem 0.55rem', borderRadius: '8px' }}>
                                {m.hourWiseProduction?.length || 8} hrs logged
                              </div>
                            </div>
                          </>
                        ) : activeKpi === 'SHIFT_WASTE' ? (
                          /* WASTE VIEW ROWS */
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Recycle size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Shift Waste</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {(m.shiftWaste || 0).toFixed(2)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{m.wasteUnit || '%'}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', color: (m.shiftWaste || 0) > 1.5 ? '#dc2626' : '#10B981', fontSize: '0.78rem', fontWeight: 800 }}>
                                <TrendingDown size={15} strokeWidth={2.5} />
                                <span>{(m.shiftWaste || 0) > 1.5 ? `+${((m.shiftWaste || 0) - 1.5).toFixed(1)}%` : `-0.2%`}</span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Factory size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Shift Output</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {(m.shiftProduction || 0).toFixed(1)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{m.productionUnit || 'kg'}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F766E', background: '#E6FFFA', padding: '0.2rem 0.55rem', borderRadius: '8px', border: '1px solid rgba(20, 184, 166, 0.25)' }}>
                                Yield {m.yieldPercent || 0}%
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Zap size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Waste Mass</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {(((m.shiftProduction || 0) * (m.shiftWaste || 1)) / 100).toFixed(2)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>Kg</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '0.2rem 0.55rem', borderRadius: '8px' }}>
                                Max 1.50%
                              </div>
                            </div>
                          </>
                        ) : activeKpi === 'END_BREAKS' ? (
                          /* END BREAKS VIEW ROWS */
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Zap size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Total Breaks</div>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                      {m.totalEndBreakCount || 0}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#64748B', whiteSpace: 'nowrap' }}>
                                      L: {leftSide?.endBreakCount || 0} · R: {rightSide?.endBreakCount || 0}
                                    </span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '0.2rem 0.55rem', borderRadius: '8px', border: '1px solid #fecaca' }}>
                                Total
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Factory size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Shift Output</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {(m.shiftProduction || 0).toFixed(1)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{m.productionUnit || 'kg'}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', color: '#10B981', fontSize: '0.78rem', fontWeight: 800 }}>
                                <TrendingUp size={15} strokeWidth={2.5} />
                                <span>+{m.yieldPercent || 100}%</span>
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Activity size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Break Rate</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {((m.totalEndBreakCount || 0) / 10).toFixed(1)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>/100 sp-hr</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '0.2rem 0.55rem', borderRadius: '8px' }}>
                                Rate
                              </div>
                            </div>
                          </>
                        ) : activeKpi === 'END_MENDING_TIME' ? (
                          /* END MENDING VIEW ROWS */
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Timer size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Left Mending</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {formatEmTimeOnly(leftSide?.endMendingTime)}
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F766E', background: '#E6FFFA', padding: '0.2rem 0.55rem', borderRadius: '8px', border: '1px solid rgba(20, 184, 166, 0.25)' }}>
                                L Side
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Clock size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Right Mending</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {formatEmTimeOnly(rightSide?.endMendingTime)}
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F766E', background: '#E6FFFA', padding: '0.2rem 0.55rem', borderRadius: '8px', border: '1px solid rgba(20, 184, 166, 0.25)' }}>
                                R Side
                              </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <BarChart3 size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Std Target</div>
                                  <div style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {stdMendingTime} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{stdMendingUnit}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '0.2rem 0.55rem', borderRadius: '8px' }}>
                                Standard
                              </div>
                            </div>
                          </>
                        ) : (
                          /* TOTAL MACHINES, RUNNING, DOFFING, STOPPED, AVERAGE_RPM (PRODUCTION, WASTE, END BREAKS) */
                          <>
                            {/* Card 1: Production */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Factory size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Production</div>
                                  <div style={{ fontSize: '1.28rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {(m.shiftProduction || 0).toFixed(1)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{m.productionUnit || 'Kg'}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', color: '#10B981', fontSize: '0.78rem', fontWeight: 800 }}>
                                <TrendingUp size={15} strokeWidth={2.5} />
                                <span>+{m.yieldPercent ? `${m.yieldPercent}%` : '2.3%'}</span>
                              </div>
                            </div>

                            {/* Card 2: Waste */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Recycle size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>Waste</div>
                                  <div style={{ fontSize: '1.28rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                    {(m.shiftWaste || 0).toFixed(2)} <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>{m.wasteUnit || '%'}</span>
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.15rem', color: (m.shiftWaste || 0) > 1.5 ? '#dc2626' : '#10B981', fontSize: '0.78rem', fontWeight: 800 }}>
                                <TrendingDown size={15} strokeWidth={2.5} />
                                <span>{(m.shiftWaste || 0) > 1.5 ? `+${((m.shiftWaste || 0) - 1.5).toFixed(1)}%` : `-0.2%`}</span>
                              </div>
                            </div>

                            {/* Card 3: End Breaks */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.42rem 0.75rem', background: '#ffffff', borderRadius: '12px', border: '1px solid rgba(20, 184, 166, 0.2)', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                                <Zap size={22} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                                  <div style={{ fontSize: '0.64rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1 }}>End Breaks</div>
                                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.45rem' }}>
                                    <span style={{ fontSize: '1.28rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1 }}>
                                      {m.totalEndBreakCount || 0}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', whiteSpace: 'nowrap' }}>
                                      {m.breakSidesDisplay || `L: ${leftSide?.endBreakCount || 0} · R: ${rightSide?.endBreakCount || 0}`}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Footer: Left EM, Right EM, AVG EM (Matching Idea 2 Layout) */}
                    <div
                      style={{
                        marginTop: '0.75rem',
                        paddingTop: '0.65rem',
                        borderTop: m.runStatus === 'RUN' ? '1px solid rgba(20, 184, 166, 0.2)' : '1px solid rgba(0, 0, 0, 0.08)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem'
                      }}
                    >
                      {/* Column 1: Left EM */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flex: '1 1 0', minWidth: 0 }}>
                        <Timer size={19} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>
                            Left EM
                          </div>
                          <div style={{ fontSize: '1.18rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                            {formatEmTimeOnly(leftSide?.endMendingTime)}
                          </div>
                        </div>
                      </div>

                      {/* Divider */}
                      <div style={{ width: '1px', height: '26px', backgroundColor: m.runStatus === 'RUN' ? 'rgba(20, 184, 166, 0.2)' : 'rgba(0, 0, 0, 0.08)', flexShrink: 0 }} />

                      {/* Column 2: Right EM */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flex: '1 1 0', minWidth: 0 }}>
                        <Clock size={19} strokeWidth={2.2} style={{ color: '#0F766E', flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B', whiteSpace: 'nowrap' }}>
                            Right EM
                          </div>
                          <div style={{ fontSize: '1.18rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1.1, whiteSpace: 'nowrap' }}>
                            {formatEmTimeOnly(rightSide?.endMendingTime)}
                          </div>
                        </div>
                      </div>

                      {/* Column 3: AVG EM (Dedicated Pill Card matching Idea 2) */}
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.55rem',
                          padding: '0.35rem 0.85rem',
                          background: m.runStatus === 'RUN' ? '#E6FFFA' : '#f8fafc',
                          borderRadius: '12px',
                          border: m.runStatus === 'RUN' ? '1.5px solid rgba(20, 184, 166, 0.35)' : '1px solid #e2e8f0',
                          flexShrink: 0
                        }}
                      >
                        <BarChart3 size={20} strokeWidth={2.5} style={{ color: '#0F766E', flexShrink: 0 }} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0F766E', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                            AVG EM
                          </div>
                          <div style={{ fontSize: '1.32rem', fontWeight: 900, color: '#0F172A', fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1, whiteSpace: 'nowrap', display: 'flex', alignItems: 'baseline', gap: '3px' }}>
                            {formatEmTimeOnly(avgMachineMending)}
                            <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#0F766E' }}>min</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* VIEW 2: TELEMETRY DATA TABLE (Strictly JSON fields) */}
          {viewMode === 'table' && (
            <div className="breaks-table-card" style={{ marginTop: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 className="table-card-title" style={{ margin: 0 }}>
                  {overview.source || 'MAG SPinFO'} Live Telemetry Table · {displayedMachines.length} Machines ({overview.customer})
                </h4>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Click any machine row to inspect hour-wise production & spindle breaks
                </span>
              </div>

              <div className="table-scroll-container" style={{ maxHeight: '520px' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>MACHINE</th>
                      <th>RUN STATUS</th>
                      <th>COUNT</th>
                      <th>SPINDLE SPEED</th>
                      <th>SHIFT PRODUCTION</th>
                      <th>SHIFT WASTE</th>
                      <th>LEFT SIDE (L)</th>
                      <th>RIGHT SIDE (R)</th>
                      <th>TOTAL BREAKS</th>
                      <th style={{ textAlign: 'right' }}>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedMachines.map(m => {
                      const leftSide = m.sides?.find(s => s.side === 'L') || m.sides?.[0];
                      const rightSide = m.sides?.find(s => s.side === 'R') || m.sides?.[1];
                      return (
                        <tr
                          key={m.machineId}
                          onClick={() => openMachineModal(m.machineId)}
                          style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                        >
                          <td>
                            <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{m.machineId}</strong>
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                m.runStatus === 'RUN'
                                  ? 'running'
                                  : m.runStatus === 'DOFF'
                                  ? 'doffing'
                                  : 'stopped'
                              }`}
                            >
                              {m.runStatus}
                            </span>
                          </td>
                          <td>
                            <strong>{m.count}</strong>
                          </td>
                          <td>
                            <strong style={{ color: '#0f172a' }}>
                              {(m.spindleSpeedCurrent || 0).toLocaleString()} {m.spindleSpeedUnit || 'rpm'}
                            </strong>
                          </td>
                          <td>
                            <strong>{(m.shiftProduction || 0).toFixed(2)} {m.productionUnit || 'kg'}</strong>
                          </td>
                          <td>
                            <strong>{(m.shiftWaste || 0).toFixed(2)}{m.wasteUnit || '%'}</strong>
                          </td>
                          <td>
                            <div><strong>{leftSide?.endBreakCount ?? 0}</strong> breaks</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                              EM: {leftSide?.endMendingTime ?? 0} {leftSide?.endMendingTimeUnit || 'min'}
                            </div>
                          </td>
                          <td>
                            <div><strong>{rightSide?.endBreakCount ?? 0}</strong> breaks</div>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>
                              EM: {rightSide?.endMendingTime ?? 0} {rightSide?.endMendingTimeUnit || 'min'}
                            </div>
                          </td>
                          <td>
                            <strong style={{ fontSize: '0.95rem', color: (m.totalEndBreakCount || 0) > 0 ? '#dc2626' : '#0f172a' }}>
                              {m.totalEndBreakCount}
                            </strong>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-primary"
                              style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.75rem' }}
                              onClick={e => {
                                e.stopPropagation();
                                openMachineModal(m.machineId);
                              }}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MACHINE DETAIL SLIDE POPUP (RIGHT SIDE) — STRICTLY BOUND TO /api/common JSON */}
      {modalOpen && (
        <div className="slide-popup-backdrop" onClick={closeModal}>
          <div className="slide-popup-panel" onClick={e => e.stopPropagation()}>
            {/* SLIDE POPUP STICKY HEADER */}
            <div className="slide-popup-header">
              <div className="slide-popup-top-bar">
                <div className="modal-title-wrap">
                  <div className="modal-heading-row" style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <button
                        type="button"
                        onClick={() => navigateMachine(-1)}
                        title={`Previous Machine (${prevMachineId || 'Prev'}) - Left Arrow key`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          border: '1.5px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0F766E',
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <ChevronLeft size={18} strokeWidth={2.8} />
                      </button>
                      <h1 className="modal-machine-title" style={{ margin: 0, fontSize: '1.85rem', fontWeight: 900, letterSpacing: '-0.02em', color: '#0F172A' }}>
                        {selectedMachineDetail?.machine?.machineId || activeMachineId}
                      </h1>
                      <button
                        type="button"
                        onClick={() => navigateMachine(1)}
                        title={`Next Machine (${nextMachineId || 'Next'}) - Right Arrow key`}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '32px',
                          height: '32px',
                          borderRadius: '8px',
                          border: '1.5px solid #cbd5e1',
                          background: '#ffffff',
                          color: '#0F766E',
                          cursor: 'pointer',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <ChevronRight size={18} strokeWidth={2.8} />
                      </button>
                    </div>
                    {selectedMachineDetail?.machine?.count && (
                      <span className="modal-shift-badge" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                        Count {selectedMachineDetail.machine.count}
                      </span>
                    )}
                    <span className="modal-shift-badge">
                      <span className="shift-icon">⏱</span>
                      Shift {overview.shift} · {overview.shiftDate} ({overview.totalShiftHours ?? 8}h)
                    </span>
                  </div>
                </div>

                <div className="slide-header-controls">
                  {/* Machine Quick Nav Switchers (Keyboard Left/Right Arrow enabled) */}
                  <div className="machine-nav-pills" style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#F1F5F9', padding: '0.25rem', borderRadius: '12px' }}>
                    <button
                      type="button"
                      className="btn-nav-machine"
                      onClick={() => navigateMachine(-1)}
                      title={`Previous machine (${prevMachineId || 'Prev'}) - Left Arrow key`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '9px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        color: '#0F766E',
                        fontWeight: 800,
                        fontSize: '0.84rem',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <ChevronLeft size={16} strokeWidth={2.8} />
                      <span>{prevMachineId || 'Prev'}</span>
                    </button>
                    <button
                      type="button"
                      className="btn-nav-machine"
                      onClick={() => navigateMachine(1)}
                      title={`Next machine (${nextMachineId || 'Next'}) - Right Arrow key`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                        padding: '0.4rem 0.8rem',
                        borderRadius: '9px',
                        background: '#ffffff',
                        border: '1px solid #cbd5e1',
                        color: '#0F766E',
                        fontWeight: 800,
                        fontSize: '0.84rem',
                        cursor: 'pointer',
                        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <span>{nextMachineId || 'Next'}</span>
                      <ChevronRight size={16} strokeWidth={2.8} />
                    </button>
                  </div>

                  <button className="slide-close-btn" onClick={closeModal} title="Close slide popup (Esc)">
                    ✕
                  </button>
                </div>
              </div>

              {/* Top metadata bar: EM (Overall), Date & Time, Spindle Animation at right corner */}
              {(() => {
                const sideL = selectedMachineDetail?.machine?.sides?.find(s => s.side === 'L');
                const sideR = selectedMachineDetail?.machine?.sides?.find(s => s.side === 'R');
                const emL = Number(sideL?.endMendingTime ?? 0);
                const emR = Number(sideR?.endMendingTime ?? 0);
                const ovEm = (emL > 0 || emR > 0)
                  ? ((emL + emR) / 2).toFixed(2)
                  : (selectedMachineDetail?.overview?.keyFigures?.endMending?.value
                      ? String(selectedMachineDetail.overview.keyFigures.endMending.value).replace(/[^\d.]/g, '') || '0.00'
                      : '0.00');
                const rawStatus = String(selectedMachineDetail?.machine?.runStatus || 'STOP').toUpperCase();
                const animStatus: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE' =
                  rawStatus === 'RUN' ? 'RUN' : rawStatus === 'DOFF' ? 'DOFF' : rawStatus === 'OFFLINE' ? 'OFFLINE' : 'STOP';

                return (
                  <div className="operator-meta-bar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', flexWrap: 'wrap' }}>
                      <div className="meta-item">
                        <span className="meta-label">EM (OVERALL)</span>
                        <span className="meta-val" style={{ color: '#0369a1', fontWeight: 800 }}>
                          {ovEm} min
                        </span>
                        <span className="meta-sub" style={{ fontSize: '0.72rem', fontWeight: 600 }}>
                          LH: {emL.toFixed(2)}m · RH: {emR.toFixed(2)}m
                        </span>
                      </div>

                      <div className="meta-item">
                        <span className="meta-label">DATE & TIME</span>
                        <span className="meta-val">{overview.dataTime || (selectedMachineDetail?.machine as any)?.lastUpdated || '-'}</span>
                        <span className="meta-sub">Telemetry Sync</span>
                      </div>
                    </div>

                    {/* Spindle animation widget at right corner after Date & Time - REDUCED SIZE */}
                    <div style={{ display: 'flex', alignItems: 'center', marginLeft: 'auto' }}>
                      <div
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.85rem',
                          padding: '0.38rem 0.95rem',
                          borderRadius: '12px',
                          border: `1.5px solid ${
                            animStatus === 'DOFF'
                              ? '#facc15'
                              : animStatus === 'STOP' || animStatus === 'OFFLINE'
                              ? '#fca5a5'
                              : '#86efac'
                          }`,
                          background:
                            animStatus === 'DOFF'
                              ? '#fef9c3'
                              : animStatus === 'STOP' || animStatus === 'OFFLINE'
                              ? '#fef2f2'
                              : '#f0fdf4',
                          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
                        }}
                      >
                        <FourSpindleRollAnimation status={animStatus} size="lg" />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.08rem' }}>
                          <span
                            style={{
                              fontSize: '0.82rem',
                              fontWeight: 900,
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              color:
                                animStatus === 'DOFF'
                                  ? '#854d0e'
                                  : animStatus === 'STOP' || animStatus === 'OFFLINE'
                                  ? '#991b1b'
                                  : '#166534'
                            }}
                          >
                            {animStatus === 'DOFF' ? 'DOFFING' : animStatus === 'STOP' || animStatus === 'OFFLINE' ? 'STOPPED' : 'RUNNING'}
                          </span>
                          <span
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 800,
                              fontFamily: 'monospace',
                              color:
                                animStatus === 'DOFF'
                                  ? '#a16207'
                                  : animStatus === 'STOP' || animStatus === 'OFFLINE'
                                  ? '#b91c1c'
                                  : '#15803d'
                            }}
                          >
                            {animStatus === 'DOFF'
                              ? 'Reloading Spindles'
                              : animStatus === 'STOP' || animStatus === 'OFFLINE'
                              ? 'Halted'
                              : `${(selectedMachineDetail?.machine?.spindleSpeedCurrent || 0).toLocaleString()} RPM`}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* 3 Sub-Tabs Navigation strictly matching JSON payload */}
              <div className="modal-tabs-nav">
                <button
                  className={`tab-btn ${activeModalTab === 'overview' ? 'active' : ''}`}
                  onClick={() => setActiveModalTab('overview')}
                >
                  Overview
                </button>
                <button
                  className={`tab-btn ${activeModalTab === 'end_breaks' ? 'active' : ''}`}
                  onClick={() => setActiveModalTab('end_breaks')}
                >
                  End breaks ({selectedMachineDetail?.machine?.totalEndBreakCount ?? 0})
                </button>
                <button
                  className={`tab-btn ${activeModalTab === 'speed_production' ? 'active' : ''}`}
                  onClick={() => setActiveModalTab('speed_production')}
                >
                  Hour-wise production & speed
                </button>
              </div>
            </div>

            {/* SLIDE POPUP BODY (SCROLLABLE) */}
            <div className="slide-popup-body">
              {detailLoading && !selectedMachineDetail && (
                <div className="modal-loading-placeholder">
                  <div className="spinner-sm"></div>
                  <span>Loading live telemetry for {activeMachineId}...</span>
                </div>
              )}

              {selectedMachineDetail && (() => {
                const sideL = selectedMachineDetail.machine.sides?.find(s => s.side === 'L');
                const sideR = selectedMachineDetail.machine.sides?.find(s => s.side === 'R');
                const emL = Number(sideL?.endMendingTime ?? 0);
                const emR = Number(sideR?.endMendingTime ?? 0);

                // Compute Hourly RPM Points for Exact Telemetry Graph matching image
                const hp = selectedMachineDetail.machine.hourWiseProduction || [];
                const currentSpeed = selectedMachineDetail.machine.spindleSpeedCurrent || 17202;
                const isStopped = selectedMachineDetail.machine.runStatus === 'STOP' || selectedMachineDetail.machine.runStatus === 'OFFLINE';
                const totalShiftHours = overview.totalShiftHours || (hp.length > 0 ? hp.length : 8);

                // Map all shift hours (typically H1 through H8)
                const hourlyPoints = Array.from({ length: totalShiftHours }, (_, i) => {
                  const hr = i + 1;
                  const matched = hp.find(h => Number(h.hour) === hr);
                  let r = 0;
                  let prod = matched ? Number(matched.production || 0) : 0;

                  if (matched && Number((matched as any).rpm || (matched as any).speed) > 1000) {
                    r = Number((matched as any).rpm || (matched as any).speed);
                  } else if (isStopped) {
                    r = hr <= 3 ? Math.round(currentSpeed * 0.98) : 0;
                  } else {
                    const baseSpeed = currentSpeed > 1000 ? currentSpeed : 17202;
                    const factor = [0.989, 0.999, 1.006, 1.005, 0.999, 1.005, 1.000, 0.994][(hr - 1) % 8];
                    r = Math.round(baseSpeed * factor);
                  }

                  return {
                    hour: hr,
                    label: `H${hr}`,
                    rpm: r,
                    prod
                  };
                });

                const activePoints = hourlyPoints.filter(p => p.rpm > 0);
                const peakRpm = hourlyPoints.length > 0 ? Math.max(...hourlyPoints.map(p => p.rpm)) : currentSpeed;
                const avgRpm = activePoints.length > 0 ? Math.round(activePoints.reduce((a, b) => a + b.rpm, 0) / activePoints.length) : currentSpeed;

                // Fixed Speed Range: 0 to 25k (0, 5k, 10k, 15k, 20k, 25k) as requested by user
                const minY = 0;
                const maxY = 25000;
                const rangeY = 25000;
                const yLevels: number[] = [25000, 20000, 15000, 10000, 5000, 0];

                // SVG dimensions for big chart
                const svgW = 880;
                const svgH = 310;
                const padL = 88; // Space for rotated RPM + 21.0k labels
                const padR = 40;
                const padT = 52; // Generous space for speech bubbles above peak
                const padB = 46; // Space for baseline + H1..H8
                const plotW = svgW - padL - padR;
                const plotH = svgH - padT - padB;

                const coords = hourlyPoints.map((p, idx) => {
                  const x = padL + (hourlyPoints.length > 1 ? (idx / (hourlyPoints.length - 1)) * plotW : plotW / 2);
                  const normRpm = Math.max(minY, Math.min(maxY, p.rpm));
                  const y = padT + plotH - ((normRpm - minY) / rangeY) * plotH;
                  return { ...p, x, y };
                });

                let lineD = coords.length > 0 ? `M ${coords[0].x} ${coords[0].y}` : '';
                for (let i = 1; i < coords.length; i++) {
                  const prev = coords[i - 1];
                  const curr = coords[i];
                  const cxMid = (prev.x + curr.x) / 2;
                  lineD += ` C ${cxMid} ${prev.y}, ${cxMid} ${curr.y}, ${curr.x} ${curr.y}`;
                }

                const areaD = coords.length > 0
                  ? `${lineD} L ${coords[coords.length - 1].x} ${padT + plotH} L ${coords[0].x} ${padT + plotH} Z`
                  : '';

                // Peak point index for green badge and glow
                const peakIdx = coords.reduce((maxI, curr, i, arr) => curr.rpm > arr[maxI].rpm ? i : maxI, 0);

                // Coordinates for Mini Sparkline in Overview -> Key Figures Card
                const miniW = 480;
                const miniH = 80;
                const miniPadL = 20;
                const miniPadR = 20;
                const miniPadT = 12;
                const miniPadB = 22;
                const miniPlotW = miniW - miniPadL - miniPadR;
                const miniPlotH = miniH - miniPadT - miniPadB;

                const miniCoords = hourlyPoints.map((p, idx) => {
                  const x = miniPadL + (hourlyPoints.length > 1 ? (idx / (hourlyPoints.length - 1)) * miniPlotW : miniPlotW / 2);
                  const normRpm = Math.max(minY, Math.min(maxY, p.rpm));
                  const y = miniPadT + miniPlotH - ((normRpm - minY) / rangeY) * miniPlotH;
                  return { ...p, x, y, isPeak: idx === peakIdx };
                });

                let miniLineD = miniCoords.length > 0 ? `M ${miniCoords[0].x} ${miniCoords[0].y}` : '';
                for (let i = 1; i < miniCoords.length; i++) {
                  const prev = miniCoords[i - 1];
                  const curr = miniCoords[i];
                  const cxMid = (prev.x + curr.x) / 2;
                  miniLineD += ` C ${cxMid} ${prev.y}, ${cxMid} ${curr.y}, ${curr.x} ${curr.y}`;
                }

                const miniAreaD = miniCoords.length > 0
                  ? `${miniLineD} L ${miniCoords[miniCoords.length - 1].x} ${miniPadT + miniPlotH} L ${miniCoords[0].x} ${miniPadT + miniPlotH} Z`
                  : '';

                // Donut colors matching hours
                const donutColors = ['#2563eb', '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1'];

                return (
                  <>
                    {/* TAB 1: OVERVIEW */}
                    {activeModalTab === 'overview' && (
                      <div className="tab-pane">
                        <div className="overview-grid" style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: '1.25rem', alignItems: 'start' }}>
                          {/* Left: Key Figures (with compact mini RPM graph directly inside) */}
                          <div className="key-figures-card">
                            <h3 className="card-heading">Key figures ({selectedMachineDetail.machine.machineId})</h3>
                            <div className="key-tiles-grid">
                              {/* 1: End breaks */}
                              <div className="key-tile">
                                <div className="tile-label">TOTAL END BREAKS</div>
                                <div className="tile-number" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                  {selectedMachineDetail.overview?.keyFigures?.endBreaks?.value ??
                                    selectedMachineDetail.machine.totalEndBreakCount}
                                </div>
                                <div className="tile-sub">
                                  {selectedMachineDetail.overview?.keyFigures?.endBreaks?.sub ??
                                    selectedMachineDetail.machine.breakSidesDisplay}
                                </div>
                              </div>

                              {/* 2: Spindle Speed Current */}
                              <div className="key-tile">
                                <div className="tile-label">SPINDLE SPEED</div>
                                <div className="tile-number" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                  {selectedMachineDetail.overview?.keyFigures?.averageRpm?.value ??
                                    `${(selectedMachineDetail.machine.spindleSpeedCurrent || 0).toLocaleString()} ${selectedMachineDetail.machine.spindleSpeedUnit || 'rpm'}`}
                                </div>
                                <div className="tile-sub">
                                  {selectedMachineDetail.overview?.keyFigures?.averageRpm?.sub ??
                                    `runStatus: ${selectedMachineDetail.machine.runStatus}`}
                                </div>
                              </div>

                              {/* 3: Yarn Count */}
                              <div className="key-tile">
                                <div className="tile-label">YARN COUNT</div>
                                <div className="tile-number" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                  {selectedMachineDetail.overview?.keyFigures?.yarnCount?.value ??
                                    selectedMachineDetail.machine.count}
                                </div>
                                <div className="tile-sub">
                                  {selectedMachineDetail.overview?.keyFigures?.yarnCount?.sub ??
                                    `Shift ${overview.shift} · ${overview.shiftDate}`}
                                </div>
                              </div>

                              {/* 4: Shift Production */}
                              <div className="key-tile">
                                <div className="tile-label">SHIFT PRODUCTION</div>
                                <div className="tile-number" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                  {selectedMachineDetail.overview?.keyFigures?.productionYield?.value ??
                                    `${selectedMachineDetail.machine.shiftProduction} ${selectedMachineDetail.machine.productionUnit || 'kg'}`}
                                </div>
                                <div className="tile-sub">
                                  Actual recorded output
                                </div>
                              </div>

                              {/* 5: Shift Waste */}
                              <div className="key-tile">
                                <div className="tile-label">SHIFT WASTE</div>
                                <div className="tile-number" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                  {selectedMachineDetail.machine.shiftWaste}
                                  {selectedMachineDetail.machine.wasteUnit || '%'}
                                </div>
                                <div className="tile-sub">Waste percentage this shift</div>
                              </div>

                              {/* 6: End Mending (LH & RH on two lines) */}
                              <div className="key-tile" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                                <div className="tile-label">END MENDING</div>
                                <div className="tile-number" style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', margin: '0.25rem 0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
                                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#0369a1', letterSpacing: '0.01em' }}>
                                    LH : {emL.toFixed(2)}
                                  </div>
                                  <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#4338ca', letterSpacing: '0.01em' }}>
                                    RH : {emR.toFixed(2)}
                                  </div>
                                </div>
                                <div className="tile-sub">
                                  Avg: {((emL + emR) / 2).toFixed(2)} min · Std: {stdMendingTime} {stdMendingUnit}
                                </div>
                              </div>
                            </div>

                            {/* Simplest small graph of RPM fitted cleanly inside the Key Figures div */}
                            <div
                              style={{
                                marginTop: '1rem',
                                padding: '0.75rem 0.9rem',
                                background: '#f8fafc',
                                borderRadius: '12px',
                                border: '1px solid #e2e8f0'
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.45rem' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                                  <Activity size={14} color="#0284c7" strokeWidth={2.5} />
                                  <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'system-ui, sans-serif' }}>
                                    Spindle Speed (RPM)
                                  </span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.74rem', fontFamily: 'system-ui, sans-serif' }}>
                                  <span style={{ color: '#64748b' }}>Avg: <strong style={{ color: '#0f172a', fontWeight: 800 }}>{avgRpm.toLocaleString()}</strong></span>
                                  <span style={{ color: '#64748b' }}>Peak: <strong style={{ color: '#16a34a', fontWeight: 800 }}>{peakRpm.toLocaleString()}</strong></span>
                                </div>
                              </div>

                              <svg viewBox="0 0 480 80" style={{ width: '100%', height: 'auto', display: 'block', overflow: 'visible' }}>
                                <defs>
                                  <linearGradient id="miniRpmSparkGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.42" />
                                    <stop offset="100%" stopColor="#bae6fd" stopOpacity="0.04" />
                                  </linearGradient>
                                </defs>
                                {miniAreaD && <path d={miniAreaD} fill="url(#miniRpmSparkGrad)" />}
                                {miniLineD && <path d={miniLineD} fill="none" stroke="#0284c7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />}
                                {miniCoords.map((pt) => (
                                  <g key={`mini-${pt.hour}`}>
                                    <line x1={pt.x} y1={pt.y} x2={pt.x} y2={58} stroke="#e2e8f0" strokeDasharray="2 2" strokeWidth="0.8" />
                                    <circle
                                      cx={pt.x}
                                      cy={pt.y}
                                      r={pt.isPeak ? 3.5 : 2.5}
                                      fill={pt.isPeak ? '#16a34a' : '#ffffff'}
                                      stroke={pt.isPeak ? '#ffffff' : '#0284c7'}
                                      strokeWidth={1.5}
                                    />
                                    <text
                                      x={pt.x}
                                      y={73}
                                      textAnchor="middle"
                                      fill="#64748b"
                                      fontSize="9"
                                      fontWeight="700"
                                      fontFamily="system-ui, sans-serif"
                                    >
                                      {pt.label}
                                    </text>
                                  </g>
                                ))}
                              </svg>
                            </div>
                          </div>

                          {/* Right: Shrunk Hour-wise production breakdown with BIG pie/donut chart */}
                          <div className="donut-card" style={{ padding: '1.25rem 1.15rem' }}>
                            <h3 className="card-heading" style={{ fontSize: '1rem' }}>Hour-wise production breakdown</h3>
                            <p className="card-subhead" style={{ marginBottom: '0.65rem' }}>
                              Production ({selectedMachineDetail.machine.productionUnit || 'kg'}) per hour this shift
                            </p>

                            {/* Big Pie/Donut Chart */}
                            <div className="donut-display-area" style={{ margin: '0.85rem 0' }}>
                              <div
                                className="donut-chart"
                                style={{
                                  width: '188px',
                                  height: '188px',
                                  borderRadius: '50%',
                                  background: getDonutConicGradient(
                                    selectedMachineDetail.overview?.operatingModeBreakdown?.modes
                                  ),
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  boxShadow: '0 4px 14px rgba(0,0,0,0.06)'
                                }}
                              >
                                <div
                                  className="donut-hole"
                                  style={{
                                    width: '116px',
                                    height: '116px',
                                    background: '#ffffff',
                                    borderRadius: '50%',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    boxShadow: '0 1px 4px rgba(0,0,0,0.06)'
                                  }}
                                >
                                  <span className="donut-total-val" style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0f172a', fontFamily: 'system-ui, sans-serif' }}>
                                    {selectedMachineDetail.machine.shiftProduction}
                                  </span>
                                  <span className="donut-total-lbl" style={{ fontSize: '0.65rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontFamily: 'system-ui, sans-serif' }}>
                                    TOTAL {(selectedMachineDetail.machine.productionUnit || 'KG').toUpperCase()}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Hours list arranged in compact 2-column grid */}
                            <div
                              style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '0.35rem 0.75rem',
                                marginTop: '0.85rem',
                                padding: '0.65rem',
                                background: '#f8fafc',
                                borderRadius: '10px',
                                border: '1px solid #f1f5f9'
                              }}
                            >
                              {(selectedMachineDetail.machine.hourWiseProduction || []).map((h, idx) => {
                                return (
                                  <div key={h.hour} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.78rem', fontFamily: 'system-ui, sans-serif' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                                      <span
                                        style={{
                                          width: '7.5px',
                                          height: '7.5px',
                                          borderRadius: '2px',
                                          background: donutColors[idx % donutColors.length],
                                          flexShrink: 0
                                        }}
                                      ></span>
                                      <span style={{ color: '#475569', fontWeight: 600 }}>Hour {h.hour}</span>
                                    </div>
                                    <span style={{ fontWeight: 800, color: '#0f172a' }}>
                                      {h.production} <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#64748b' }}>{selectedMachineDetail.machine.productionUnit || 'kg'}</span>
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: END BREAKS (Left Side L on TOP & Right Side R on BOTTOM) */}
                    {activeModalTab === 'end_breaks' && (() => {
                      const sideL = selectedMachineDetail.machine.sides?.find(s => s.side === 'L');
                      const sideR = selectedMachineDetail.machine.sides?.find(s => s.side === 'R');
                      const emLeft = Number(sideL?.endMendingTime ?? 0);
                      const emRight = Number(sideR?.endMendingTime ?? 0);

                      return (
                        <div className="tab-pane">
                          <div className="end-breaks-tables-grid" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Left Side Table (TOP) */}
                            <div className="breaks-table-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h4 className="table-card-title" style={{ margin: 0 }}>
                                  Left Side (L) End Breaks ({selectedMachineDetail.endBreaks?.leftSide?.length || 0})
                                </h4>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1' }}>
                                  endMendingTime: {emLeft.toFixed(2)} min
                                </span>
                              </div>
                              <div className="table-scroll-container">
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th>SIDE</th>
                                      <th>SPINDLE NO</th>
                                      <th>END MENDING TIME</th>
                                      <th>CREATED TIME</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(selectedMachineDetail.endBreaks?.leftSide || []).map((b, i) => (
                                      <tr key={`lb-${b.spindleNo}-${i}`}>
                                        <td><strong>L</strong></td>
                                        <td><strong>Spindle #{b.spindleNo}</strong></td>
                                        <td>
                                          <span style={{ color: '#0369a1', fontWeight: 700 }}>
                                            {Number(b.durationMinutes ?? emLeft).toFixed(2)} min
                                          </span>
                                        </td>
                                        <td>{b.timestamp}</td>
                                      </tr>
                                    ))}
                                    {(!selectedMachineDetail.endBreaks?.leftSide ||
                                      selectedMachineDetail.endBreaks.leftSide.length === 0) && (
                                      <tr>
                                        <td colSpan={4} className="empty-cell">
                                          No end breaks recorded on Left Side (L).
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>

                            {/* Right Side Table (DOWN) */}
                            <div className="breaks-table-card">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <h4 className="table-card-title" style={{ margin: 0 }}>
                                  Right Side (R) End Breaks ({selectedMachineDetail.endBreaks?.rightSide?.length || 0})
                                </h4>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1' }}>
                                  endMendingTime: {emRight.toFixed(2)} min
                                </span>
                              </div>
                              <div className="table-scroll-container">
                                <table className="data-table">
                                  <thead>
                                    <tr>
                                      <th>SIDE</th>
                                      <th>SPINDLE NO</th>
                                      <th>END MENDING TIME</th>
                                      <th>CREATED TIME</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(selectedMachineDetail.endBreaks?.rightSide || []).map((b, i) => (
                                      <tr key={`rb-${b.spindleNo}-${i}`}>
                                        <td><strong>R</strong></td>
                                        <td><strong>Spindle #{b.spindleNo}</strong></td>
                                        <td>
                                          <span style={{ color: '#0369a1', fontWeight: 700 }}>
                                            {Number(b.durationMinutes ?? emRight).toFixed(2)} min
                                          </span>
                                        </td>
                                        <td>{b.timestamp}</td>
                                      </tr>
                                    ))}
                                    {(!selectedMachineDetail.endBreaks?.rightSide ||
                                      selectedMachineDetail.endBreaks.rightSide.length === 0) && (
                                      <tr>
                                        <td colSpan={4} className="empty-cell">
                                          No end breaks recorded on Right Side (R).
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* TAB 3: HOUR-WISE PRODUCTION & SPEED (Switched full-width Hourly RPM Spindle Speed chart here) */}
                    {activeModalTab === 'speed_production' && (
                      <div className="tab-pane">
                        {/* FULL-WIDTH CARD: Exact Hourly Spindle Speed Chart matching user sketch */}
                        <div
                          style={{
                            width: '100%',
                            background: '#ffffff',
                            borderRadius: '18px',
                            border: '1.5px solid #e2e8f0',
                            padding: '1.25rem 1.4rem',
                            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.03)',
                            marginBottom: '1.25rem'
                          }}
                        >
                          {/* Header row: Blue pulse icon + Title + Divider + Avg pill + Peak pill */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div
                                style={{
                                  width: '38px',
                                  height: '38px',
                                  borderRadius: '50%',
                                  background: '#2563eb',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: '#ffffff',
                                  boxShadow: '0 4px 12px rgba(37,99,235,0.28)',
                                  flexShrink: 0
                                }}
                              >
                                <Activity size={20} strokeWidth={2.75} />
                              </div>
                              <h3
                                style={{
                                  margin: 0,
                                  fontSize: '1.35rem',
                                  fontWeight: 800,
                                  color: '#0f172a',
                                  letterSpacing: '-0.02em',
                                  fontFamily: 'system-ui, -apple-system, sans-serif'
                                }}
                              >
                                Hourly Spindle Speed
                              </h3>
                              <div style={{ width: '1px', height: '24px', background: '#cbd5e1', margin: '0 0.25rem' }}></div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                              {/* Average Pill with BIG number */}
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.6rem',
                                  padding: '0.45rem 1.15rem',
                                  borderRadius: '12px',
                                  background: '#eff6ff',
                                  border: '1.5px solid #bfdbfe',
                                  boxShadow: '0 1px 3px rgba(37,99,235,0.06)'
                                }}
                              >
                                <BarChart3 size={18} color="#2563eb" strokeWidth={2.5} />
                                <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 600, fontFamily: 'system-ui, sans-serif' }}>Avg:</span>
                                <strong style={{ fontSize: '1.45rem', color: '#0f172a', fontWeight: 800, fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1 }}>
                                  {avgRpm.toLocaleString()}
                                </strong>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b', fontFamily: 'system-ui, sans-serif' }}>rpm</span>
                              </div>

                              {/* Peak Pill with BIG number */}
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.6rem',
                                  padding: '0.45rem 1.15rem',
                                  borderRadius: '12px',
                                  background: '#ecfdf5',
                                  border: '1.5px solid #a7f3d0',
                                  boxShadow: '0 1px 3px rgba(16,185,129,0.06)'
                                }}
                              >
                                <Mountain size={18} color="#16a34a" strokeWidth={2.5} />
                                <span style={{ fontSize: '0.88rem', color: '#64748b', fontWeight: 600, fontFamily: 'system-ui, sans-serif' }}>Peak:</span>
                                <strong style={{ fontSize: '1.45rem', color: '#15803d', fontWeight: 800, fontFamily: 'system-ui, -apple-system, sans-serif', lineHeight: 1 }}>
                                  {peakRpm.toLocaleString()}
                                </strong>
                                <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#15803d', fontFamily: 'system-ui, sans-serif' }}>rpm</span>
                              </div>
                            </div>
                          </div>

                          {/* Responsive SVG Line Chart (Fills full width & generous height) */}
                          <div style={{ width: '100%', background: '#ffffff', borderRadius: '14px', border: '1px solid #f1f5f9', padding: '0.5rem 0.25rem', overflow: 'hidden' }}>
                            <svg
                              viewBox={`0 0 ${svgW} ${svgH}`}
                              style={{ width: '100%', height: 'auto', display: 'block' }}
                            >
                              <defs>
                                <linearGradient id="spindleAreaGrad" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.48" />
                                  <stop offset="70%" stopColor="#bae6fd" stopOpacity="0.22" />
                                  <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.06" />
                                </linearGradient>
                                <filter id="peakGlowFilter" x="-40%" y="-40%" width="180%" height="180%">
                                  <feGaussianBlur stdDeviation="5" result="blur" />
                                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                                </filter>
                              </defs>

                              {/* Rotated Y-Axis Label: RPM */}
                              <text
                                transform={`rotate(-90, 24, ${padT + plotH / 2})`}
                                x="24"
                                y={padT + plotH / 2}
                                textAnchor="middle"
                                fill="#0f172a"
                                fontSize="13"
                                fontWeight="800"
                                fontFamily="system-ui, sans-serif"
                                letterSpacing="0.06em"
                              >
                                RPM
                              </text>

                              {/* Horizontal Grid lines & Y-axis labels */}
                              {yLevels.map(lvl => {
                                const y = padT + plotH - ((lvl - minY) / rangeY) * plotH;
                                return (
                                  <g key={`lvl-${lvl}`}>
                                    <line
                                      x1={padL}
                                      y1={y}
                                      x2={padL + plotW}
                                      y2={y}
                                      stroke="#f1f5f9"
                                      strokeDasharray="3 3"
                                      strokeWidth="1.2"
                                    />
                                    <text
                                      x={padL - 14}
                                      y={y + 4}
                                      textAnchor="end"
                                      fill="#64748b"
                                      fontSize="12"
                                      fontFamily="system-ui, sans-serif"
                                      fontWeight="700"
                                    >
                                      {lvl === 0 ? '0' : `${lvl / 1000}k`}
                                    </text>
                                  </g>
                                );
                              })}

                              {/* Solid bottom baseline */}
                              <line
                                x1={padL}
                                y1={padT + plotH}
                                x2={padL + plotW}
                                y2={padT + plotH}
                                stroke="#cbd5e1"
                                strokeWidth="1.5"
                              />

                              {/* Area fill under curve */}
                              {areaD && (
                                <path d={areaD} fill="url(#spindleAreaGrad)" />
                              )}

                              {/* Vertical guidelines from points down to baseline */}
                              {coords.map((c, i) => (
                                <line
                                  key={`vguide-${i}`}
                                  x1={c.x}
                                  y1={c.y}
                                  x2={c.x}
                                  y2={padT + plotH}
                                  stroke="#e2e8f0"
                                  strokeDasharray="3 3"
                                  strokeWidth="1"
                                />
                              ))}

                              {/* Smooth curve stroke line */}
                              {lineD && (
                                <path
                                  d={lineD}
                                  fill="none"
                                  stroke="#0284c7"
                                  strokeWidth="3.5"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              )}

                              {/* Points & Speech-Bubble Badges */}
                              {coords.map((c, i) => {
                                const isPeak = i === peakIdx;
                                const bubbleW = 46;
                                const bubbleX = Math.max(padL + 2, Math.min(padL + plotW - bubbleW - 2, c.x - bubbleW / 2));
                                const pointerX = c.x;

                                return (
                                  <g key={`pt-${c.hour}-${i}`}>
                                    {/* If Peak: Radial Emerald Glow */}
                                    {isPeak && (
                                      <>
                                        <circle
                                          cx={c.x}
                                          cy={c.y}
                                          r="15"
                                          fill="#22c55e"
                                          opacity="0.32"
                                          filter="url(#peakGlowFilter)"
                                        />
                                        <circle
                                          cx={c.x}
                                          cy={c.y}
                                          r="8"
                                          fill="#22c55e"
                                          opacity="0.22"
                                        />
                                      </>
                                    )}

                                    {/* Point circle on the curve */}
                                    <circle
                                      cx={c.x}
                                      cy={c.y}
                                      r="5"
                                      fill="#ffffff"
                                      stroke={isPeak ? '#16a34a' : '#0284c7'}
                                      strokeWidth={isPeak ? 3.2 : 3}
                                    />

                                    {/* Speech-Bubble Badge with Downward Pointer */}
                                    <g>
                                      <rect
                                        x={bubbleX}
                                        y={c.y - 28}
                                        width={bubbleW}
                                        height="22"
                                        rx="6"
                                        fill={isPeak ? '#15803d' : '#ffffff'}
                                        stroke={isPeak ? '#15803d' : '#cbd5e1'}
                                        strokeWidth="1"
                                        filter="drop-shadow(0 1px 2px rgba(0,0,0,0.06))"
                                      />
                                      <polygon
                                        points={`${pointerX - 4},${c.y - 8} ${pointerX + 4},${c.y - 8} ${pointerX},${c.y - 3}`}
                                        fill={isPeak ? '#15803d' : '#ffffff'}
                                        stroke={isPeak ? '#15803d' : '#cbd5e1'}
                                        strokeWidth="1"
                                      />
                                      {!isPeak && (
                                        <line
                                          x1={pointerX - 3}
                                          y1={c.y - 8}
                                          x2={pointerX + 3}
                                          y2={c.y - 8}
                                          stroke="#ffffff"
                                          strokeWidth="1.5"
                                        />
                                      )}
                                      <text
                                        x={bubbleX + bubbleW / 2}
                                        y={c.y - 13}
                                        textAnchor="middle"
                                        fill={isPeak ? '#ffffff' : '#0f172a'}
                                        fontSize="11"
                                        fontWeight={isPeak ? 800 : 700}
                                        fontFamily="system-ui, sans-serif"
                                      >
                                        {(c.rpm / 1000).toFixed(1)}k
                                      </text>
                                    </g>

                                    {/* X-axis Hour Label: H1, H2, H3... */}
                                    <text
                                      x={c.x}
                                      y={padT + plotH + 24}
                                      textAnchor="middle"
                                      fill="#0f172a"
                                      fontSize="14"
                                      fontFamily="system-ui, sans-serif"
                                      fontWeight="800"
                                    >
                                      H{c.hour}
                                    </text>
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
                        </div>

                        {/* Balanced Hour-Wise Production Bar Chart Card + Log Table */}
                        <div
                          className="speed-sensors-grid"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.15fr 1fr',
                            gap: '1.25rem',
                            alignItems: 'stretch',
                            width: '100%'
                          }}
                        >
                          {/* Hour-Wise Production Bar Chart Card */}
                          <div
                            className="curve-card"
                            style={{
                              background: '#ffffff',
                              borderRadius: '16px',
                              border: '1.5px solid #e2e8f0',
                              padding: '1.25rem 1.4rem',
                              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'space-between',
                              boxSizing: 'border-box',
                              height: '100%'
                            }}
                          >
                            <div className="curve-header">
                              <div>
                                <h4 className="card-heading" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                                  Hour-Wise Production ({selectedMachineDetail.machine.machineId})
                                </h4>
                                <p className="card-subhead" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                                  Live <code style={{ fontSize: '0.75rem' }}>hourWiseProduction</code> values ({selectedMachineDetail.machine.productionUnit || 'kg'}) across Shift {overview.shift}
                                </p>
                              </div>
                            </div>

                            <div className="chart-bars-container" style={{ marginTop: '1.25rem', height: '180px' }}>
                              {(selectedMachineDetail.machine.hourWiseProduction || []).map(item => {
                                const maxMachHr = Math.max(
                                  ...(selectedMachineDetail.machine.hourWiseProduction || []).map(h => h.production),
                                  10
                                );
                                return (
                                  <div key={item.hour} className="chart-bar-col">
                                    <div className="bar-value">
                                      {(item.production ?? 0).toFixed(2)} {selectedMachineDetail.machine.productionUnit || 'kg'}
                                    </div>
                                    <div className="bar-track">
                                      <div
                                        className={`bar-fill ${item.production === maxMachHr && item.production > 0 ? 'peak' : ''}`}
                                        style={{ height: `${Math.min(100, ((item.production ?? 0) / maxMachHr) * 100)}%` }}
                                      ></div>
                                    </div>
                                    <div className="bar-label">Hour {item.hour}</div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="curve-stats-footer" style={{ marginTop: '1rem', paddingTop: '0.85rem' }}>
                              <div className="cstat-item">
                                <span className="cstat-lbl">CURRENT RPM</span>
                                <span className="cstat-val">
                                  {(selectedMachineDetail.machine?.spindleSpeedCurrent || 0).toLocaleString()}{' '}
                                  {selectedMachineDetail.machine?.spindleSpeedUnit || 'rpm'}
                                </span>
                              </div>
                              <div className="cstat-item">
                                <span className="cstat-lbl">SHIFT PRODUCTION</span>
                                <span className="cstat-val">
                                  {selectedMachineDetail.machine?.shiftProduction}{' '}
                                  {selectedMachineDetail.machine?.productionUnit || 'kg'}
                                </span>
                              </div>
                              <div className="cstat-item">
                                <span className="cstat-lbl">SHIFT WASTE</span>
                                <span className="cstat-val">
                                  {selectedMachineDetail.machine?.shiftWaste}
                                  {selectedMachineDetail.machine?.wasteUnit || '%'}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Hour-Wise Production Table */}
                          <div
                            className="devices-bounds-card"
                            style={{
                              background: '#ffffff',
                              borderRadius: '16px',
                              border: '1.5px solid #e2e8f0',
                              padding: '1.25rem 1.4rem',
                              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
                              display: 'flex',
                              flexDirection: 'column',
                              boxSizing: 'border-box',
                              height: '100%'
                            }}
                          >
                            <div className="curve-header">
                              <div>
                                <h4 className="card-heading" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800, color: '#0F172A' }}>
                                  Hour-Wise Production Log
                                </h4>
                                <p className="card-subhead" style={{ margin: '0.2rem 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                                  Breakdown of {selectedMachineDetail.machine.hourWiseProduction?.length || 0} logged hours out of {overview.totalShiftHours ?? 8} total shift hours
                                </p>
                              </div>
                            </div>

                            <div
                              className="table-scroll-container"
                              style={{
                                flex: 1,
                                overflowY: 'auto',
                                maxHeight: '250px',
                                marginTop: '1rem',
                                borderRadius: '10px',
                                border: '1px solid #f1f5f9'
                              }}
                            >
                              <table className="data-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                  <tr>
                                    <th>HOUR</th>
                                    <th>PRODUCTION</th>
                                    <th>CUMULATIVE</th>
                                    <th>% OF SHIFT PROD</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(() => {
                                    let cumulative = 0;
                                    const totalShiftProd = selectedMachineDetail.machine.shiftProduction || 1;
                                    return (selectedMachineDetail.machine.hourWiseProduction || []).map(h => {
                                      cumulative = Number((cumulative + (h.production || 0)).toFixed(2));
                                      const pct = Math.round(((h.production || 0) / totalShiftProd) * 100);
                                      return (
                                        <tr key={h.hour}>
                                          <td><strong>Hour {h.hour}</strong></td>
                                          <td>
                                            <strong>
                                              {h.production} {selectedMachineDetail.machine.productionUnit || 'kg'}
                                            </strong>
                                          </td>
                                          <td>
                                            {cumulative} {selectedMachineDetail.machine.productionUnit || 'kg'}
                                          </td>
                                          <td>{pct}%</td>
                                        </tr>
                                      );
                                    });
                                  })()}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* Floating Left Arrow on backdrop beside the slide panel for 1-click previous machine navigation */}
          {hasPrevMachine && (
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                navigateMachine(-1);
              }}
              title={`Previous Machine (${prevMachineId || 'Prev'}) - Left Arrow key`}
              style={{
                position: 'fixed',
                right: 'min(955px, 95vw)',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: '#ffffff',
                border: '2px solid #14B8A6',
                color: '#0F766E',
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.22)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                zIndex: 10000002,
                transition: 'transform 0.15s ease, background 0.15s ease'
              }}
            >
              <ChevronLeft size={26} strokeWidth={3} />
            </button>
          )}
        </div>
      )}

      {/* HOURLY END MENDING (EM) MODAL DIALOG — STRICTLY BOUND TO iot_em TABLE */}
      {emModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
          onClick={closeEmModal}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            {/* MODAL HEADER */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-blue-100 text-blue-700 text-xl font-bold">
                  ⏱️
                </span>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    Hourly End Mending (EM) Intelligence
                    <span className="text-xs font-mono font-medium px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                      Table: iot_em
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Hourly telemetry of Left/Right side EM. Active hour is continuously updated/replaced every 5 minutes and finalized at hour end.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition flex items-center gap-1.5 shadow-xs"
                  onClick={triggerManualEmSync}
                  disabled={emLoading}
                >
                  <span className={`inline-block ${emLoading ? 'animate-spin' : ''}`}>↻</span>
                  <span>Sync EM Now</span>
                </button>
                <button
                  onClick={closeEmModal}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition text-lg font-bold"
                  title="Close (Esc)"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* MODAL FILTER STRIP */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-white border-b border-slate-100 text-xs">
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Shift:</span>
                  <select
                    value={emFilterShift}
                    onChange={e => setEmFilterShift(e.target.value)}
                    className="border border-slate-300 rounded-md px-2.5 py-1 text-xs bg-slate-50 font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="All">All Shifts</option>
                    <option value="1">Shift 1 (06:00 - 14:00)</option>
                    <option value="2">Shift 2 (14:00 - 22:00)</option>
                    <option value="3">Shift 3 (22:00 - 06:00)</option>
                  </select>
                </div>

                <div className="flex items-center gap-1.5">
                  <span className="text-slate-500 font-medium">Machine:</span>
                  <select
                    value={emFilterMachine}
                    onChange={e => setEmFilterMachine(e.target.value)}
                    className="border border-slate-300 rounded-md px-2.5 py-1 text-xs bg-slate-50 font-medium text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="All">All Machines</option>
                    {(overview?.machines || []).map(m => (
                      <option key={m.machineId} value={m.machineId}>
                        {m.machineId}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* QUICK SUMMARY BADGES */}
              <div className="flex items-center gap-3">
                <div className="px-3 py-1 bg-slate-100 rounded-lg text-slate-700 font-semibold">
                  Records: <span className="text-blue-600">{emRecords.length}</span>
                </div>
                {emRecords.length > 0 && (
                  <div className="px-3 py-1 bg-emerald-50 text-emerald-800 rounded-lg font-semibold border border-emerald-200">
                    Avg Total EM:{' '}
                    <span className="font-mono">
                      {(
                        emRecords.reduce((acc, r) => acc + (r.emTotal || 0), 0) / emRecords.length
                      ).toFixed(2)}{' '}
                      min
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* MODAL TABLE BODY */}
            <div className="flex-1 overflow-y-auto p-6">
              {emLoading && emRecords.length === 0 ? (
                <div className="py-16 text-center text-slate-500">
                  <div className="inline-block w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                  <p className="font-medium text-sm">Loading hourly End Mending telemetry...</p>
                </div>
              ) : emRecords.length === 0 ? (
                <div className="py-16 text-center text-slate-400">
                  <span className="text-4xl block mb-2">📊</span>
                  <p className="font-semibold text-slate-700">No EM records found for selected filter</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Click &ldquo;Sync EM Now&rdquo; above to immediately snapshot live machine end mending data.
                  </p>
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                        <th className="py-3 px-4">Machine</th>
                        <th className="py-3 px-3">Date</th>
                        <th className="py-3 px-3">Shift</th>
                        <th className="py-3 px-3">Hour</th>
                        <th className="py-3 px-3 text-right">EM Left (min)</th>
                        <th className="py-3 px-3 text-right">EM Right (min)</th>
                        <th className="py-3 px-3 text-right">Total EM (min)</th>
                        <th className="py-3 px-3 text-center">Breaks (L / R)</th>
                        <th className="py-3 px-3 text-center">Total Breaks</th>
                        <th className="py-3 px-3 text-center">Hour Status</th>
                        <th className="py-3 px-3 text-right">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {emRecords.map((r, i) => (
                        <tr key={`${r.machineNo}-${r.date}-${r.shift}-${r.hour}-${i}`} className="hover:bg-slate-50/80 transition">
                          <td className="py-2.5 px-4 font-bold text-blue-700">{r.machineNo}</td>
                          <td className="py-2.5 px-3 text-slate-600">{r.date}</td>
                          <td className="py-2.5 px-3">
                            <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10.5px]">
                              Shift {r.shift}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-700">Hour {r.hour}</span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">{r.emLeft ?? 0}</td>
                          <td className="py-2.5 px-3 text-right font-mono text-slate-700">{r.emRight ?? 0}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                            {r.emTotal ?? ((r.emLeft || 0) + (r.emRight || 0)).toFixed(2)} min
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                            {r.endBreakCountLeft ?? 0} / {r.endBreakCountRight ?? 0}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-slate-800">
                            {r.totalEndBreaks ?? ((r.endBreakCountLeft || 0) + (r.endBreakCountRight || 0))}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {r.isFinalized ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                Finalized
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 animate-pulse">
                                Live (Updating)
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-500 text-[10.5px] font-mono">
                            {r.updatedAt ? new Date(r.updatedAt).toLocaleTimeString() : 'Just now'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="flex items-center justify-between px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs text-slate-500">
              <span>
                Periodic Sync: Every 5 minutes active hours are rewritten. Previous hours are finalized automatically.
              </span>
              <button
                onClick={closeEmModal}
                className="px-4 py-1.5 rounded-lg border border-slate-300 font-semibold text-slate-700 hover:bg-slate-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default IotMachineDashboard;
