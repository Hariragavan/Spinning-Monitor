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
                statusBadge: live.statusBadge
              };
            });
            return {
              ...prev,
              frameStatus: {
                ...prev.frameStatus,
                running: res.running,
                stopped: res.stopped,
                doffing: res.doffing,
                offline: res.offline,
                runningPercent: Math.round((res.running / (res.totalMachines || 1)) * 100)
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

  // Keyboard navigation for modals (ESC key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (emModalOpen) closeEmModal();
        if (modalOpen) closeModal();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, emModalOpen, closeModal, closeEmModal]);

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

  // Machine navigation in modal
  const currentIndex = displayedMachines.findIndex(m => m.machineId === (selectedMachineDetail?.machine?.machineId || activeMachineId));
  const hasPrevMachine = currentIndex > 0;
  const hasNextMachine = currentIndex >= 0 && currentIndex < displayedMachines.length - 1;
  const prevMachineId = hasPrevMachine ? displayedMachines[currentIndex - 1]?.machineId : null;
  const nextMachineId = hasNextMachine ? displayedMachines[currentIndex + 1]?.machineId : null;

  const navigateMachine = (direction: -1 | 1) => {
    const target = direction === -1 ? prevMachineId : nextMachineId;
    if (target) openMachineModal(target);
  };

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

            {/* 7. Shift Production (shiftProduction, shiftTargetProduction, productionUnit) */}
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
                {overview.performanceAndCare.yieldAchievedPercent ?? 0}% of{' '}
                {(overview.performanceAndCare.targetProductionKg ?? 0).toLocaleString()}{' '}
                {overview.machines[0]?.productionUnit || 'kg'} target
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
                  <span className="stat-label">SHIFT TOTAL</span>
                  <span className="stat-value">
                    {(overview.hourlyProduction.shiftTotalKg ?? 0).toLocaleString()} {overview.machines[0]?.productionUnit || 'kg'}
                  </span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">SHIFT TARGET</span>
                  <span className="stat-value">
                    {(overview.hourlyProduction.totalTarget ?? 0).toLocaleString()} {overview.machines[0]?.productionUnit || 'kg'}
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
                  ? `Highest production first · Total ${(overview.performanceAndCare.productionYieldKg ?? 0).toFixed(2)} / ${(overview.performanceAndCare.targetProductionKg ?? 0).toFixed(1)} kg`
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
                    onClick={() => openMachineModal(m.machineId)}
                  >
                    <div className="card-top">
                      <div>
                        <span className="machine-code">{m.machineId}</span>
                        <span
                          style={{
                            marginLeft: '0.4rem',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            padding: '0.1rem 0.4rem',
                            borderRadius: '4px',
                            background: '#f1f5f9',
                            color: '#334155'
                          }}
                        >
                          Count {m.count}
                        </span>
                      </div>
                      <span
                        className={`status-pill ${
                          m.runStatus === 'RUN'
                            ? 'running'
                            : m.runStatus === 'DOFF'
                            ? 'doffing'
                            : 'stopped'
                        }`}
                      >
                        {m.runStatus} · {m.statusBadge}
                      </span>
                    </div>

                    {/* Default / Frame Status / End Breaks Card Face */}
                    {(activeKpi === 'TOTAL_MACHINES' ||
                      activeKpi === 'RUNNING' ||
                      activeKpi === 'DOFFING' ||
                      activeKpi === 'STOPPED_DOFFING' ||
                      activeKpi === 'END_BREAKS') && (
                      <>
                        <div className="card-mid-label">TOTAL END BREAKS</div>
                        <div className="card-large-number">{m.totalEndBreakCount}</div>
                        <div className="card-progress-bar">
                          <div
                            className="progress-fill blue"
                            style={{ width: `${Math.min(100, (m.totalEndBreakCount || 0) * 20)}%` }}
                          ></div>
                        </div>
                        <div className="card-footer-sub">
                          {m.breakSidesDisplay} · EM: L({leftSide?.endMendingTime ?? 0}{leftSide?.endMendingTimeUnit || 'm'}) / R({rightSide?.endMendingTime ?? 0}{rightSide?.endMendingTimeUnit || 'm'})
                        </div>
                      </>
                    )}

                    {/* Average RPM Card Face */}
                    {activeKpi === 'AVERAGE_RPM' && (
                      <>
                        <div className="card-mid-label">SPINDLE SPEED CURRENT</div>
                        <div className="card-large-number">
                          {(m.spindleSpeedCurrent || 0).toLocaleString()}{' '}
                          <span className="unit-sm">{m.spindleSpeedUnit || 'rpm'}</span>
                        </div>
                        <div className="card-progress-bar">
                          <div
                            className="progress-fill blue"
                            style={{ width: `${Math.min(100, ((m.spindleSpeedCurrent || 0) / 18500) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="card-footer-sub">
                          Status: {m.runStatus} · Count: {m.count}
                        </div>
                      </>
                    )}

                    {/* Production Yield / Hourly Production Card Face */}
                    {(activeKpi === 'PRODUCTION_YIELD' || activeKpi === 'HOURLY_PRODUCTION') && (
                      <>
                        <div className="card-mid-label">SHIFT PRODUCTION</div>
                        <div className="card-large-number">
                          {(m.shiftProduction || 0).toFixed(2)}{' '}
                          <span className="unit-sm">{m.productionUnit || 'kg'}</span>
                        </div>
                        <div className="card-progress-bar">
                          <div
                            className="progress-fill blue"
                            style={{ width: `${Math.min(100, m.yieldPercent || 0)}%` }}
                          ></div>
                        </div>
                        <div className="card-footer-sub">
                          {m.yieldPercent}% of {m.shiftTargetProduction} {m.productionUnit || 'kg'} target · {m.hourWiseProduction?.length || 0} hrs logged
                        </div>
                      </>
                    )}

                    {/* Shift Waste Card Face */}
                    {activeKpi === 'SHIFT_WASTE' && (
                      <>
                        <div className="card-mid-label">SHIFT WASTE</div>
                        <div className="card-large-number">
                          {(m.shiftWaste || 0).toFixed(2)} <span className="unit-sm">{m.wasteUnit || '%'}</span>
                        </div>
                        <div className="card-progress-bar">
                          <div
                            className={`progress-fill ${(m.shiftWaste || 0) > 2.0 ? 'red' : 'blue'}`}
                            style={{ width: `${Math.min(100, ((m.shiftWaste || 0) / 3) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="card-footer-sub">
                          Count {m.count} · Prod {(m.shiftProduction || 0).toFixed(2)} {m.productionUnit || 'kg'}
                        </div>
                      </>
                    )}

                    {/* End Mending Time Card Face */}
                    {activeKpi === 'END_MENDING_TIME' && (
                      <>
                        <div className="card-mid-label">END MENDING TIME (L / R)</div>
                        <div className="card-large-number">
                          {avgMachineMending.toFixed(2)}{' '}
                          <span className="unit-sm">{leftSide?.endMendingTimeUnit || stdMendingUnit}</span>
                        </div>
                        <div className="card-progress-bar">
                          <div
                            className={`progress-fill ${avgMachineMending > stdMendingTime ? 'red' : 'green'}`}
                            style={{ width: `${Math.min(100, (avgMachineMending / (stdMendingTime * 1.5)) * 100)}%` }}
                          ></div>
                        </div>
                        <div className="card-footer-sub">
                          L: {leftSide?.endMendingTime ?? 0} {leftSide?.endMendingTimeUnit || 'min'} · R: {rightSide?.endMendingTime ?? 0} {rightSide?.endMendingTimeUnit || 'min'} (Std {stdMendingTime})
                        </div>
                      </>
                    )}

                    {/* Compact Bottom Telemetry Strip showing key JSON metrics */}
                    <div
                      style={{
                        marginTop: '0.65rem',
                        paddingTop: '0.55rem',
                        borderTop: '1px solid #f1f5f9',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.35rem',
                        fontSize: '0.7rem',
                        color: '#475569'
                      }}
                    >
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.62rem', fontWeight: 700 }}>SPEED</span>
                        <strong>{(m.spindleSpeedCurrent || 0).toLocaleString()} {m.spindleSpeedUnit || 'rpm'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.62rem', fontWeight: 700 }}>PROD / TARGET</span>
                        <strong>{m.shiftProduction}/{m.shiftTargetProduction} {m.productionUnit || 'kg'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#94a3b8', display: 'block', fontSize: '0.62rem', fontWeight: 700 }}>WASTE</span>
                        <strong>{m.shiftWaste}{m.wasteUnit || '%'}</strong>
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
                      <th>TARGET %</th>
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
                            <strong>{(m.shiftProduction || 0).toFixed(2)}</strong>
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                              {' '}
                              / {m.shiftTargetProduction} {m.productionUnit || 'kg'}
                            </span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: (m.yieldPercent || 0) >= 45 ? '#15803d' : '#b45309' }}>
                              {m.yieldPercent}%
                            </span>
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
                  <span className="modal-eyebrow">
                    {overview.source || 'MAG SPinFO'} · MACHINE TELEMETRY DETAIL
                  </span>
                  <div className="modal-heading-row">
                    <h1 className="modal-machine-title">
                      {selectedMachineDetail?.machine?.machineId || activeMachineId}
                    </h1>
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
                  <span
                    className={`status-pill ${
                      selectedMachineDetail?.machine?.runStatus === 'RUN'
                        ? 'running'
                        : selectedMachineDetail?.machine?.runStatus === 'DOFF'
                        ? 'doffing'
                        : 'stopped'
                    }`}
                  >
                    {selectedMachineDetail?.machine?.runStatus || 'RUN'} ·{' '}
                    {selectedMachineDetail?.machine?.statusBadge || 'Running'}
                  </span>

                  {/* Machine Quick Nav Switchers */}
                  <div className="machine-nav-pills">
                    <button
                      type="button"
                      className="btn-nav-machine"
                      disabled={!hasPrevMachine}
                      onClick={() => navigateMachine(-1)}
                      title="Previous machine"
                    >
                      ‹ {prevMachineId || 'Prev'}
                    </button>
                    <button
                      type="button"
                      className="btn-nav-machine"
                      disabled={!hasNextMachine}
                      onClick={() => navigateMachine(1)}
                      title="Next machine"
                    >
                      {nextMachineId || 'Next'} ›
                    </button>
                  </div>

                  <button className="slide-close-btn" onClick={closeModal} title="Close slide popup (Esc)">
                    ✕
                  </button>
                </div>
              </div>

              {/* Telemetry packet metadata bar (Strictly from /api/common JSON root fields) */}
              <div className="operator-meta-bar">
                <div className="meta-item">
                  <span className="meta-label">CUSTOMER</span>
                  <span className="meta-val">{overview.customer || 'SPACE TEXTILES PRIVATE LIMITED'}</span>
                  <span className="meta-sub">{overview.city || 'COIMBATORE'}</span>
                </div>

                <div className="meta-item">
                  <span className="meta-label">MESSAGE ID</span>
                  <span className="badge-active">{overview.msgId || '-'}</span>
                </div>

                <div className="meta-item">
                  <span className="meta-label">DATA TIME</span>
                  <span className="meta-val">{overview.dataTime || '-'}</span>
                </div>

                <div className="meta-item">
                  <span className="meta-label">STD END MENDING</span>
                  <span className="meta-val">
                    {stdMendingTime} {stdMendingUnit} (Part {overview.part ?? 1}/{overview.parts ?? 1})
                  </span>
                </div>
              </div>

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

              {selectedMachineDetail && (
                <>
                  {/* TAB 1: OVERVIEW */}
                  {activeModalTab === 'overview' && (
                    <div className="tab-pane">
                      {/* Telemetry status banner */}
                      <div className={`attention-banner ${selectedMachineDetail.overview?.hasAttention ? 'alert' : ''}`}>
                        <div className="attention-title">Telemetry status</div>
                        <div className="attention-desc">
                          {selectedMachineDetail.overview?.needsAttention || 'RUN · Normal operation'}
                        </div>
                      </div>

                      <div className="overview-grid">
                        {/* Left: Key Figures (9 clean live tiles strictly from JSON) */}
                        <div className="key-figures-card">
                          <h3 className="card-heading">Key figures ({selectedMachineDetail.machine.machineId})</h3>
                          <div className="key-tiles-grid">
                            {/* 1: End breaks */}
                            <div className="key-tile">
                              <div className="tile-label">TOTAL END BREAKS</div>
                              <div className="tile-number">
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
                              <div className="tile-number">
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
                              <div className="tile-number">
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
                              <div className="tile-number">
                                {selectedMachineDetail.overview?.keyFigures?.productionYield?.value ??
                                  `${selectedMachineDetail.machine.shiftProduction} ${selectedMachineDetail.machine.productionUnit || 'kg'}`}
                              </div>
                              <div className="tile-sub">
                                {selectedMachineDetail.overview?.keyFigures?.productionYield?.sub ??
                                  `Target: ${selectedMachineDetail.machine.shiftTargetProduction} ${selectedMachineDetail.machine.productionUnit || 'kg'}`}
                              </div>
                            </div>

                            {/* 5: Shift Waste */}
                            <div className="key-tile">
                              <div className="tile-label">SHIFT WASTE</div>
                              <div className="tile-number">
                                {selectedMachineDetail.machine.shiftWaste}
                                {selectedMachineDetail.machine.wasteUnit || '%'}
                              </div>
                              <div className="tile-sub">Waste percentage this shift</div>
                            </div>

                            {/* 6: End Mending (L & R) */}
                            <div className="key-tile">
                              <div className="tile-label">END MENDING (L / R)</div>
                              <div className="tile-number text-primary">
                                {selectedMachineDetail.overview?.keyFigures?.endMending?.value ?? '-'}
                              </div>
                              <div className="tile-sub">
                                {selectedMachineDetail.overview?.keyFigures?.endMending?.sub ??
                                  `Std: ${stdMendingTime} ${stdMendingUnit}`}
                              </div>
                            </div>

                            {/* 7: Run Status */}
                            <div className="key-tile">
                              <div className="tile-label">RUN STATUS</div>
                              <div className="tile-number text-primary">
                                {selectedMachineDetail.machine.runStatus}
                              </div>
                              <div className="tile-sub">{selectedMachineDetail.machine.statusBadge}</div>
                            </div>

                            {/* 8: Hour-Wise Logged */}
                            <div className="key-tile">
                              <div className="tile-label">HOURS LOGGED</div>
                              <div className="tile-number">
                                {selectedMachineDetail.machine.hourWiseProduction?.length || 0} /{' '}
                                {overview.totalShiftHours ?? 8} hrs
                              </div>
                              <div className="tile-sub">hourWiseProduction entries</div>
                            </div>

                            {/* 9: Target Achievement */}
                            <div className="key-tile">
                              <div className="tile-label">TARGET ACHIEVED</div>
                              <div className="tile-number text-success">
                                {selectedMachineDetail.machine.yieldPercent ?? 0}%
                              </div>
                              <div className="tile-sub">
                                of {selectedMachineDetail.machine.shiftTargetProduction}{' '}
                                {selectedMachineDetail.machine.productionUnit || 'kg'}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Right: Hour-wise production breakdown donut */}
                        <div className="donut-card">
                          <h3 className="card-heading">Hour-wise production breakdown</h3>
                          <p className="card-subhead">
                            Production ({selectedMachineDetail.machine.productionUnit || 'kg'}) per hour this shift
                          </p>

                          <div className="donut-display-area">
                            <div
                              className="donut-chart"
                              style={{
                                background: getDonutConicGradient(
                                  selectedMachineDetail.overview?.operatingModeBreakdown?.modes
                                )
                              }}
                            >
                              <div className="donut-hole">
                                <span className="donut-total-val">
                                  {selectedMachineDetail.machine.shiftProduction}
                                </span>
                                <span className="donut-total-lbl">
                                  TOTAL {(selectedMachineDetail.machine.productionUnit || 'KG').toUpperCase()}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Hours list */}
                          <div className="mode-legend-list">
                            {(selectedMachineDetail.machine.hourWiseProduction || []).map((h, idx) => {
                              const colors = ['#2563eb', '#0ea5e9', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1'];
                              return (
                                <div key={h.hour} className="mode-legend-row">
                                  <div className="mode-label-group">
                                    <span
                                      className="mode-square"
                                      style={{ background: colors[idx % colors.length] }}
                                    ></span>
                                    <span>Hour {h.hour}</span>
                                  </div>
                                  <span className="mode-mins">
                                    {h.production} {selectedMachineDetail.machine.productionUnit || 'kg'}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* TAB 2: END BREAKS (Left Side L & Right Side R from sides[]) */}
                  {activeModalTab === 'end_breaks' && (
                    <div className="tab-pane">
                      <div className="end-breaks-tables-grid">
                        {/* Left Side Table */}
                        <div className="breaks-table-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h4 className="table-card-title" style={{ margin: 0 }}>
                              Left Side (L) End Breaks ({selectedMachineDetail.endBreaks?.leftSide?.length || 0})
                            </h4>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1' }}>
                              endMendingTime: {selectedMachineDetail.machine.sides?.find(s => s.side === 'L')?.endMendingTime ?? 0}{' '}
                              {selectedMachineDetail.machine.sides?.find(s => s.side === 'L')?.endMendingTimeUnit || 'min'}
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
                                        {b.durationMinutes} {stdMendingUnit}
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

                        {/* Right Side Table */}
                        <div className="breaks-table-card">
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                            <h4 className="table-card-title" style={{ margin: 0 }}>
                              Right Side (R) End Breaks ({selectedMachineDetail.endBreaks?.rightSide?.length || 0})
                            </h4>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0369a1' }}>
                              endMendingTime: {selectedMachineDetail.machine.sides?.find(s => s.side === 'R')?.endMendingTime ?? 0}{' '}
                              {selectedMachineDetail.machine.sides?.find(s => s.side === 'R')?.endMendingTimeUnit || 'min'}
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
                                        {b.durationMinutes} {stdMendingUnit}
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
                  )}

                  {/* TAB 3: HOUR-WISE PRODUCTION & SPEED (Strictly from hourWiseProduction & machine telemetry) */}
                  {activeModalTab === 'speed_production' && (
                    <div className="tab-pane">
                      <div className="speed-sensors-grid">
                        {/* Hour-Wise Production Bar Chart Card */}
                        <div className="curve-card">
                          <div className="curve-header">
                            <div>
                              <h4 className="card-heading">
                                Hour-Wise Production ({selectedMachineDetail.machine.machineId})
                              </h4>
                              <p className="card-subhead">
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

                          <div className="curve-stats-footer" style={{ marginTop: '1rem' }}>
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
                                {selectedMachineDetail.machine?.shiftProduction} /{' '}
                                {selectedMachineDetail.machine?.shiftTargetProduction}{' '}
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
                        <div className="devices-bounds-card">
                          <h4 className="card-heading">Hour-Wise Production Log</h4>
                          <p className="card-subhead">
                            Breakdown of {selectedMachineDetail.machine.hourWiseProduction?.length || 0} logged hours out of {overview.totalShiftHours ?? 8} total shift hours
                          </p>

                          <div className="table-scroll-container">
                            <table className="data-table">
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
              )}
            </div>
          </div>
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
