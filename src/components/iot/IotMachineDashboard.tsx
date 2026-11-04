'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  SpinfoOverviewResponse,
  SpinfoMachineItem,
  SpinfoMachineDetailResponse,
  Shift
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import { SAMPLE_OVERVIEW } from '@/lib/iot/sampleIotData';

export type ActiveKpiType =
  | 'TOTAL_MACHINES'
  | 'REPORTING'
  | 'RUNNING'
  | 'STOPPED_DOFFING'
  | 'END_BREAKS'
  | 'AVERAGE_RPM'
  | 'PRODUCTION_YIELD'
  | 'COMPLETED_ROUNDS'
  | 'SENSOR_BOUNDS'
  | 'PREVENTIVE_CLEANING';

export type ViewModeType = 'cards' | 'spindle_map' | 'table';

export type ModalTabType =
  | 'overview'
  | 'end_breaks'
  | 'speed_production'
  | 'rounds_cleaning';

export interface IotMachineDashboardProps {
  selectedDate?: string;
}

export const IotMachineDashboard: React.FC<IotMachineDashboardProps> = ({ selectedDate }) => {
  const [overview, setOverview] = useState<SpinfoOverviewResponse>(() => SAMPLE_OVERVIEW);
  const [selectedMachineDetail, setSelectedMachineDetail] = useState<SpinfoMachineDetailResponse | null>(null);
  const [activeMachineId, setActiveMachineId] = useState<string | null>(null);

  const [shifts, setShifts] = useState<Shift[]>([]);
  const [selectedShift, setSelectedShift] = useState<string>('All Shifts');
  const [selectedFromDate, setSelectedFromDate] = useState<string>(() => selectedDate || new Date().toISOString().slice(0, 10));
  const [selectedToDate, setSelectedToDate] = useState<string>(() => selectedDate || new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (selectedDate) {
      setSelectedFromDate(selectedDate);
      setSelectedToDate(selectedDate);
    }
  }, [selectedDate]);
  const [selectedOperator, setSelectedOperator] = useState<string>('');

  const [activeKpi, setActiveKpi] = useState<ActiveKpiType>('TOTAL_MACHINES');
  const [viewMode, setViewMode] = useState<ViewModeType>('cards');
  const [endBreaksSort, setEndBreaksSort] = useState<'highest' | 'machine_no'>('highest');
  const [speedPeriod, setSpeedPeriod] = useState<'hourly' | 'daily' | 'weekly'>('hourly');

  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [activeModalTab, setActiveModalTab] = useState<ModalTabType>('overview');
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  // Spindle arrays 1 to 120
  const spindleRangeLeft = useMemo(() => Array.from({ length: 120 }, (_, i) => i + 1), []);
  const spindleRangeRight = useMemo(() => Array.from({ length: 120 }, (_, i) => i + 1), []);

  // Fetch live overview
  const loadOverview = useCallback(async (isInitial: boolean = false) => {
    try {
      if (isInitial) setLoading(true);
      setErrorMessage(null);
      const data = await iotApi.getSpinfoOverview({
        fromDate: selectedFromDate,
        toDate: selectedToDate,
        shift: selectedShift === 'All Shifts' ? undefined : selectedShift,
        operator: selectedOperator || undefined
      });
      if (data && data.frameStatus && data.machines) {
        setOverview(data);
      }
      setLastRefreshedAt(new Date());

      // Also fetch shifts
      try {
        const sList = await iotApi.getShifts();
        if (sList && sList.length > 0) setShifts(sList);
      } catch {}
    } catch (err: any) {
      if (isInitial) {
        setErrorMessage(err?.message || 'Failed to connect to IoT Telemetry stream.');
      }
    } finally {
      if (isInitial) setLoading(false);
    }
  }, [selectedFromDate, selectedToDate, selectedShift, selectedOperator]);

  useEffect(() => {
    loadOverview(true);
    const interval = setInterval(() => {
      loadOverview(false);
    }, 5000);
    return () => clearInterval(interval);
  }, [loadOverview]);

  // Open Machine Diagnostics Modal
  const openMachineModal = useCallback(async (machineId: string) => {
    setActiveMachineId(machineId);
    setModalOpen(true);
    setDetailLoading(true);
    try {
      const detail = await iotApi.getMachineDetail(machineId);
      setSelectedMachineDetail(detail);
    } catch {
      // Handled by fallback inside API
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setActiveMachineId(null);
    setSelectedMachineDetail(null);
  }, []);

  // Keyboard navigation for modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!modalOpen) return;
      if (e.key === 'Escape') closeModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [modalOpen, closeModal]);

  // Available Operators list
  const availableOperators = useMemo(() => {
    if (!overview?.machines) return [];
    const ops = new Set<string>();
    overview.machines.forEach(m => {
      if (m.operator?.name) ops.add(m.operator.name);
    });
    return Array.from(ops);
  }, [overview]);

  // Machine list with sorting and filtering
  const displayedMachines = useMemo(() => {
    if (!overview?.machines) return [];
    let list = [...overview.machines];

    if (selectedOperator) {
      list = list.filter(m => m.operator?.name === selectedOperator);
    }

    if (activeKpi === 'RUNNING') {
      list = list.filter(m => m.runStatus === 'RUN' || m.statusBadge === 'Running');
    } else if (activeKpi === 'STOPPED_DOFFING') {
      list = list.filter(m => m.runStatus === 'STOP' || m.runStatus === 'DOFF' || m.statusBadge === 'Stopped' || m.statusBadge === 'Doffing');
    } else if (activeKpi === 'END_BREAKS') {
      if (endBreaksSort === 'highest') {
        list.sort((a, b) => (b.totalEndBreakCount || 0) - (a.totalEndBreakCount || 0));
      } else {
        list.sort((a, b) => a.machineId.localeCompare(b.machineId, undefined, { numeric: true }));
      }
    } else if (activeKpi === 'AVERAGE_RPM') {
      list.sort((a, b) => {
        const aBreach = a.speedStatus?.includes('limit') ? 1 : 0;
        const bBreach = b.speedStatus?.includes('limit') ? 1 : 0;
        return bBreach - aBreach;
      });
    } else if (activeKpi === 'PRODUCTION_YIELD') {
      list.sort((a, b) => (b.shiftProduction || 0) - (a.shiftProduction || 0));
    } else if (activeKpi === 'COMPLETED_ROUNDS') {
      list.sort((a, b) => (a.rounds?.completed ?? 0) - (b.rounds?.completed ?? 0));
    } else if (activeKpi === 'SENSOR_BOUNDS') {
      list.sort((a, b) => (b.sensorBounds?.breaches ?? 0) - (a.sensorBounds?.breaches ?? 0));
    } else if (activeKpi === 'PREVENTIVE_CLEANING') {
      list.sort((a, b) => {
        const aOver = a.cleaning?.status === 'Overdue' ? 2 : a.cleaning?.status === 'Due today' ? 1 : 0;
        const bOver = b.cleaning?.status === 'Overdue' ? 2 : b.cleaning?.status === 'Due today' ? 1 : 0;
        return bOver - aOver;
      });
    }

    return list;
  }, [overview, selectedOperator, activeKpi, endBreaksSort]);

  // Spindle break helper
  const hasBreakAtSpindle = useCallback((m: SpinfoMachineItem, side: 'L' | 'R', spindleNo: number): boolean => {
    if (!m.sides || !Array.isArray(m.sides)) return false;
    const sideIdx = side === 'L' ? 0 : 1;
    const s = m.sides[sideIdx];
    if (!s || !Array.isArray(s.endBreaks)) return false;
    return s.endBreaks.some(b => b.spindleNo === spindleNo);
  }, []);

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
    if (!overview?.hourlyProduction?.chart) return 20;
    return Math.max(...overview.hourlyProduction.chart.map(c => c.production), 15);
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
            <div className="brand-eyebrow">
              <span className="live-pulse-dot"></span>
              <span className="eyebrow-text">LIVE TELEMETRY STREAM</span>
              <span className="eyebrow-divider">/</span>
              <span className="eyebrow-sub">CONTROL CENTER</span>
              {overview?.shift && (
                <span className="ml-2.5 px-2.5 py-0.5 rounded-full text-[10.5px] font-black uppercase tracking-wider bg-blue-600 text-white shadow-xs">
                  Shift {overview.shift} · {overview.shiftDate}
                </span>
              )}
            </div>
            <h1 className="title">Machine Telemetry Intelligence</h1>
            <p className="subtitle">Real-time sensor telemetry, rotational speed curve diagnostics, operating mode allocation & shift audit</p>
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
                <span className="field-icon">👤</span>
                <span>Operator</span>
              </label>
              <div className="select-wrapper">
                <select value={selectedOperator} onChange={e => setSelectedOperator(e.target.value)}>
                  <option value="">All operators</option>
                  {availableOperators.map(op => (
                    <option key={op} value={op}>{op}</option>
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
                value={selectedFromDate}
                onChange={e => {
                  const val = e.target.value;
                  setSelectedFromDate(val);
                  setSelectedToDate(val);
                }}
                className="date-input"
              />
            </div>

            <div className="field">
              <label>
                <span className="field-icon">📅</span>
                <span>To Date</span>
              </label>
              <input
                type="date"
                value={selectedToDate}
                onChange={e => setSelectedToDate(e.target.value)}
                className="date-input"
              />
            </div>

            <button
              className="btn btn-primary"
              onClick={() => loadOverview(true)}
              disabled={loading}
              title="Click to instantly refresh live telemetry"
            >
              <span className={`btn-icon ${loading ? 'spin' : ''}`}>↻</span>
              <span>Quick Refresh</span>
            </button>

            {lastRefreshedAt && (
              <div className="sync-indicator" title="Live stream synced">
                <span className="pulse-dot"></span>
                <span className="sync-text">Live: {lastRefreshedAt.toLocaleTimeString()}</span>
              </div>
            )}
          </div>
        </header>

        {/* TOP KPI HEADER */}
        {overview && (
          <div className="kpi-header">
            {/* ROW 1: FRAME STATUS */}
            <div className="section-title">FRAME STATUS</div>
            <div className="kpi-row">
              {/* 1. Total Machines */}
              <div
                className={`kpi-card ${activeKpi === 'TOTAL_MACHINES' ? 'active' : ''}`}
                onClick={() => setActiveKpi('TOTAL_MACHINES')}
              >
                <div className="kpi-bar blue"></div>
                <div className="kpi-label">TOTAL MACHINES</div>
                <div className="kpi-value">{overview.frameStatus.totalMachines ?? 0}</div>
                <div className="kpi-subtext">
                  {overview.frameStatus.reporting ?? 0} reporting · {overview.frameStatus.offline ?? 0} offline
                </div>
              </div>

              {/* 2. Reporting */}
              <div
                className={`kpi-card ${activeKpi === 'REPORTING' ? 'active' : ''}`}
                onClick={() => setActiveKpi('REPORTING')}
              >
                <div className="kpi-bar teal"></div>
                <div className="kpi-label">REPORTING (ACTUAL)</div>
                <div className="kpi-value">{overview.frameStatus.reporting ?? 0}</div>
                <div className="kpi-subtext">of {overview.frameStatus.totalMachines ?? 0} configured</div>
              </div>

              {/* 3. Running */}
              <div
                className={`kpi-card ${activeKpi === 'RUNNING' ? 'active' : ''}`}
                onClick={() => setActiveKpi('RUNNING')}
              >
                <div className="kpi-bar green"></div>
                <div className="kpi-label">RUNNING</div>
                <div className="kpi-value">{overview.frameStatus.running ?? 0}</div>
                <div className="kpi-subtext">{overview.frameStatus.runningPercent ?? 0}% of reporting</div>
              </div>

              {/* 4. Stopped / Doffing */}
              <div
                className={`kpi-card ${activeKpi === 'STOPPED_DOFFING' ? 'active' : ''}`}
                onClick={() => setActiveKpi('STOPPED_DOFFING')}
              >
                <div className="kpi-bar orange"></div>
                <div className="kpi-label">STOPPED / DOFFING</div>
                <div className="kpi-value">{overview.frameStatus.stoppedAndDoffing ?? 0}</div>
                <div className="kpi-subtext">
                  {overview.frameStatus.stopped ?? 0} stopped · {overview.frameStatus.doffing ?? 0} doffing
                </div>
              </div>

              {/* 5. Total End Breaks */}
              <div
                className={`kpi-card ${activeKpi === 'END_BREAKS' ? 'active' : ''}`}
                onClick={() => setActiveKpi('END_BREAKS')}
              >
                <div className="kpi-bar red"></div>
                <div className="kpi-label">TOTAL END BREAKS</div>
                <div className="kpi-value">{overview.frameStatus.totalEndBreaks ?? 0}</div>
                <div className="kpi-subtext">
                  Left {overview.frameStatus.leftBreaks ?? 0} · Right {overview.frameStatus.rightBreaks ?? 0}
                </div>
              </div>
            </div>

            {/* ROW 2: PERFORMANCE AND CARE */}
            <div className="section-title" style={{ marginTop: '1.25rem' }}>PERFORMANCE AND CARE</div>
            <div className="kpi-row">
              {/* 6. Average RPM */}
              <div
                className={`kpi-card ${activeKpi === 'AVERAGE_RPM' ? 'active' : ''}`}
                onClick={() => setActiveKpi('AVERAGE_RPM')}
              >
                <div className="kpi-bar blue"></div>
                <div className="kpi-label">AVERAGE RPM</div>
                <div className="kpi-value">
                  {(overview.performanceAndCare.averageRpm ?? 16700).toLocaleString()} <span className="unit">rpm</span>
                </div>
                <div className="kpi-subtext">
                  {overview.performanceAndCare.outsideRpmCount ?? 0} machine(s) outside 15,000 to 17,000
                </div>
              </div>

              {/* 7. Production Yield */}
              <div
                className={`kpi-card ${activeKpi === 'PRODUCTION_YIELD' ? 'active' : ''}`}
                onClick={() => setActiveKpi('PRODUCTION_YIELD')}
              >
                <div className="kpi-bar purple"></div>
                <div className="kpi-label">PRODUCTION YIELD</div>
                <div className="kpi-value">
                  {(overview.performanceAndCare.productionYieldKg ?? 0).toLocaleString()} <span className="unit">kg</span>
                </div>
                <div className="kpi-subtext">
                  {overview.performanceAndCare.yieldAchievedPercent ?? 0}% of {(overview.performanceAndCare.targetProductionKg ?? 0).toLocaleString()} kg target
                </div>
              </div>

              {/* 8. Completed Rounds */}
              <div
                className={`kpi-card ${activeKpi === 'COMPLETED_ROUNDS' ? 'active' : ''}`}
                onClick={() => setActiveKpi('COMPLETED_ROUNDS')}
              >
                <div className="kpi-bar teal"></div>
                <div className="kpi-label">COMPLETED ROUNDS</div>
                <div className="kpi-value">
                  {overview.performanceAndCare.completedRounds ?? 0} / {overview.performanceAndCare.totalRoundsScheduled ?? 0}
                </div>
                <div className="kpi-subtext">
                  {overview.performanceAndCare.skippedRounds ?? 0} skipped · {overview.performanceAndCare.incompleteRounds ?? 0} incomplete
                </div>
              </div>

              {/* 9. Sensor Bounds */}
              <div
                className={`kpi-card ${activeKpi === 'SENSOR_BOUNDS' ? 'active' : ''}`}
                onClick={() => setActiveKpi('SENSOR_BOUNDS')}
              >
                <div className="kpi-bar orange"></div>
                <div className="kpi-label">SENSOR BOUNDS</div>
                <div className="kpi-value">
                  {overview.performanceAndCare.devicesInBounds ?? 0} / {overview.performanceAndCare.totalDevices ?? 0} <span className="unit">devices</span>
                </div>
                <div className="kpi-subtext">
                  {overview.performanceAndCare.speedBreachAlerts ?? 0} speed breach alert(s)
                </div>
              </div>

              {/* 10. Preventive Cleaning */}
              <div
                className={`kpi-card ${activeKpi === 'PREVENTIVE_CLEANING' ? 'active' : ''}`}
                onClick={() => setActiveKpi('PREVENTIVE_CLEANING')}
              >
                <div className="kpi-bar green"></div>
                <div className="kpi-label">PREVENTIVE CLEANING</div>
                <div className="kpi-value">
                  {overview.performanceAndCare.preventiveCleaningDueCount ?? 0} <span className="unit">due</span>
                </div>
                <div className="kpi-subtext">
                  {overview.performanceAndCare.dueMachineNames?.length
                    ? overview.performanceAndCare.dueMachineNames.join(', ')
                    : 'All up to date'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* HOURLY PRODUCTION BAR CHART (Displayed when Production Yield is active) */}
        {activeKpi === 'PRODUCTION_YIELD' && overview?.hourlyProduction && (
          <div className="hourly-chart-card">
            <div className="hourly-chart-header">
              <div>
                <h3 className="chart-title">Hourly production · all frames</h3>
                <p className="chart-subtitle">Kilograms per hour this shift. The last bar is a partial hour.</p>
              </div>
              <div className="chart-stats-group">
                <div className="stat-item">
                  <span className="stat-label">SHIFT TOTAL</span>
                  <span className="stat-value">{(overview.hourlyProduction.shiftTotalKg ?? 0).toLocaleString()} kg</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">PEAK HOUR</span>
                  <span className="stat-value">{overview.hourlyProduction.peakHour ?? 'N/A'}</span>
                </div>
                <div className="stat-item">
                  <span className="stat-label">AVG PER FULL HOUR</span>
                  <span className="stat-value">{(overview.hourlyProduction.avgPerHourKg ?? 0).toLocaleString()} kg</span>
                </div>
              </div>
            </div>

            {/* Bars visualization */}
            <div className="chart-bars-container">
              {overview.hourlyProduction.chart?.map(item => (
                <div key={item.hour} className="chart-bar-col">
                  <div className="bar-value">{(item.production ?? 0).toFixed(1)}</div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${item.hour === overview.hourlyProduction.peakHour ? 'peak' : ''}`}
                      style={{ height: `${((item.production ?? 0) / maxHourlyProduction) * 100}%` }}
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
                <div className="section-label">MACHINE DETAILS</div>
                <h2 className="dynamic-heading">
                  {activeKpi === 'END_BREAKS'
                    ? 'End breaks by machine'
                    : activeKpi === 'AVERAGE_RPM'
                    ? 'Spindle speed by machine'
                    : activeKpi === 'PRODUCTION_YIELD'
                    ? 'Production yield by machine'
                    : activeKpi === 'COMPLETED_ROUNDS'
                    ? 'Rounds by machine'
                    : activeKpi === 'SENSOR_BOUNDS'
                    ? 'Sensor bounds by machine'
                    : activeKpi === 'PREVENTIVE_CLEANING'
                    ? 'Preventive cleaning by machine'
                    : 'All machines'}
                </h2>

                <p className="details-subtext">
                  {activeKpi === 'END_BREAKS'
                    ? `Highest first · ${overview.frameStatus.totalEndBreaks} in total`
                    : activeKpi === 'AVERAGE_RPM'
                    ? 'Limit breaches first · allowed 15,000 to 17,000 rpm'
                    : activeKpi === 'PRODUCTION_YIELD'
                    ? `Highest yield first · target ${displayedMachines[0]?.shiftTargetProduction || 98.4} kg each`
                    : activeKpi === 'COMPLETED_ROUNDS'
                    ? 'Fewest completed rounds first · 8 scheduled per shift'
                    : activeKpi === 'SENSOR_BOUNDS'
                    ? 'Machines with speed breach alerts first'
                    : activeKpi === 'PREVENTIVE_CLEANING'
                    ? 'Overdue and due machines first · every 2 days'
                    : `${displayedMachines.length} configured · select one for its details`}
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
                    className={`pill-btn ${viewMode === 'spindle_map' ? 'active' : ''}`}
                    onClick={() => setViewMode('spindle_map')}
                    title="Interactive Spindle Map 120L + 120R"
                  >
                    Spindle Map
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
                  <span className="sub-label">AVERAGE PER MACHINE</span>
                  <span className="sub-val">
                    {((overview.frameStatus.totalEndBreaks ?? 0) / (displayedMachines.length || 1)).toFixed(1)}
                  </span>
                </div>
                <div className="stat-pill-item">
                  <span className="sub-label">HIGHEST</span>
                  <span className="sub-val">
                    {displayedMachines[0]?.machineId || 'RF01'} · {displayedMachines[0]?.totalEndBreakCount || 0}
                  </span>
                </div>
                <div className="stat-pill-item">
                  <span className="sub-label">MACHINES AT 14 OR MORE</span>
                  <span className="sub-val">0</span>
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
                {displayedMachines.map(m => (
                  <div
                    key={m.machineId}
                    className={`machine-card ${
                      m.runStatus === 'RUN' || m.statusBadge === 'Running'
                        ? 'status-running'
                        : m.runStatus === 'STOP' || m.statusBadge === 'Stopped'
                        ? 'status-stopped'
                        : m.runStatus === 'DOFF' || m.statusBadge === 'Doffing'
                        ? 'status-doffing'
                        : 'status-offline'
                    }`}
                    onClick={() => openMachineModal(m.machineId)}
                  >
                    <div className="card-top">
                      <span className="machine-code">{m.machineId}</span>
                      <span
                        className={`status-pill ${
                          m.statusBadge === 'Running'
                            ? 'running'
                            : m.statusBadge === 'Doffing'
                            ? 'doffing'
                            : m.statusBadge === 'Stopped'
                            ? 'stopped'
                            : 'not-reporting'
                        }`}
                      >
                        {m.statusBadge}
                      </span>
                    </div>

                    {/* Default / End Breaks Card Face */}
                    {(activeKpi === 'TOTAL_MACHINES' ||
                      activeKpi === 'REPORTING' ||
                      activeKpi === 'RUNNING' ||
                      activeKpi === 'STOPPED_DOFFING' ||
                      activeKpi === 'END_BREAKS') && (
                      <>
                        <div className="card-mid-label">END BREAKS</div>
                        <div className="card-large-number">{m.totalEndBreakCount}</div>
                        <div className="card-progress-bar">
                          <div
                            className="progress-fill blue"
                            style={{ width: `${Math.min(100, (m.totalEndBreakCount || 0) * 15)}%` }}
                          ></div>
                        </div>
                        <div className="card-footer-sub">{m.breakSidesDisplay}</div>
                      </>
                    )}

                    {/* Average RPM Card Face */}
                    {activeKpi === 'AVERAGE_RPM' && (
                      <>
                        <div className="card-mid-label">SPINDLE SPEED</div>
                        <div className="card-large-number">
                          {(m.spindleSpeedCurrent || 0).toLocaleString()} <span className="unit-sm">rpm</span>
                        </div>
                        <div className="card-progress-bar">
                          <div
                            className={`progress-fill ${m.speedStatus?.includes('limit') ? 'red' : 'blue'}`}
                            style={{ width: `${Math.min(100, ((m.spindleSpeedCurrent || 0) / 18000) * 100)}%` }}
                          ></div>
                        </div>
                        <div className={`card-footer-sub ${m.speedStatus?.includes('limit') ? 'text-red' : ''}`}>
                          {m.speedStatus}
                        </div>
                      </>
                    )}

                    {/* Production Yield Card Face */}
                    {activeKpi === 'PRODUCTION_YIELD' && (
                      <>
                        <div className="card-mid-label">YIELD</div>
                        <div className="card-large-number">
                          {(m.shiftProduction || 0).toFixed(1)} <span className="unit-sm">kg</span>
                        </div>
                        <div className="card-progress-bar">
                          <div
                            className="progress-fill blue"
                            style={{ width: `${Math.min(100, m.yieldPercent || 0)}%` }}
                          ></div>
                        </div>
                        <div className="card-footer-sub">{m.yieldPercent}% of target</div>
                      </>
                    )}

                    {/* Completed Rounds Card Face */}
                    {activeKpi === 'COMPLETED_ROUNDS' && (
                      <>
                        <div className="card-mid-label">ROUNDS</div>
                        <div className="card-large-number">
                          {m.rounds?.completed ?? 0} / {m.rounds?.total ?? 8}
                        </div>
                        <div className="card-progress-bar">
                          <div
                            className="progress-fill blue"
                            style={{ width: `${Math.min(100, (((m.rounds?.completed ?? 0) / (m.rounds?.total ?? 8)) * 100))}%` }}
                          ></div>
                        </div>
                        <div className="card-footer-sub">
                          {m.rounds?.skipped ?? 0} skipped · {m.rounds?.incomplete ?? 0} incomplete
                        </div>
                      </>
                    )}

                    {/* Sensor Bounds Card Face */}
                    {activeKpi === 'SENSOR_BOUNDS' && (
                      <>
                        <div className="card-mid-label">SENSOR BOUNDS</div>
                        <div className="card-large-number">
                          {m.sensorBounds?.inBounds ?? 2} / {m.sensorBounds?.total ?? 2}
                        </div>
                        <div className="card-progress-bar">
                          <div
                            className={`progress-fill ${m.sensorBounds?.breaches ? 'red' : 'green'}`}
                            style={{ width: '100%' }}
                          ></div>
                        </div>
                        <div className={`card-footer-sub ${m.sensorBounds?.breaches ? 'text-red' : ''}`}>
                          {m.sensorBounds?.breaches ? `${m.sensorBounds.breaches} speed breach` : 'All within bounds'}
                        </div>
                      </>
                    )}

                    {/* Preventive Cleaning Card Face */}
                    {activeKpi === 'PREVENTIVE_CLEANING' && (
                      <>
                        <div className="card-mid-label">NEXT CLEANING</div>
                        <div className="card-large-number">{m.cleaning?.nextDate || '-'}</div>
                        <div
                          className={`card-footer-sub ${
                            m.cleaning?.status === 'Overdue'
                              ? 'text-red'
                              : m.cleaning?.status === 'Due today'
                              ? 'text-orange'
                              : ''
                          }`}
                        >
                          {m.cleaning?.status || 'Scheduled'}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* VIEW 2: SPINDLE MAP TABLE */}
            {viewMode === 'spindle_map' && (
              <div className="spindle-map-container">
                <div className="spindle-map-table-header">
                  <div className="col-machine">MACHINE</div>
                  <div className="col-side">LEFT SIDE · SPINDLES 1 TO 120</div>
                  <div className="col-side">RIGHT SIDE · SPINDLES 1 TO 120</div>
                  <div className="col-breaks">BREAKS</div>
                </div>

                {displayedMachines.map(m => (
                  <div
                    key={m.machineId}
                    className={`spindle-map-row ${
                      m.runStatus === 'RUN' || m.statusBadge === 'Running'
                        ? 'status-running'
                        : m.runStatus === 'STOP' || m.statusBadge === 'Stopped'
                        ? 'status-stopped'
                        : 'status-doffing'
                    }`}
                    onClick={() => openMachineModal(m.machineId)}
                  >
                    <div className="col-machine">
                      <span
                        className={`status-dot ${
                          m.runStatus === 'RUN' ? 'running' : m.runStatus === 'DOFF' ? 'doffing' : 'stopped'
                        }`}
                      ></span>
                      <strong>{m.machineId}</strong>
                      <span className="badge-mini">{m.statusBadge}</span>
                    </div>

                    {/* Left Spindle Ticks */}
                    <div className="col-side spindle-ticks">
                      {spindleRangeLeft.map(s => (
                        <div
                          key={`L-${s}`}
                          className={`spindle-tick ${hasBreakAtSpindle(m, 'L', s) ? 'broken' : ''}`}
                          title={`Left Spindle #${s}${hasBreakAtSpindle(m, 'L', s) ? ' (End Break)' : ''}`}
                        ></div>
                      ))}
                    </div>

                    {/* Right Spindle Ticks */}
                    <div className="col-side spindle-ticks">
                      {spindleRangeRight.map(s => (
                        <div
                          key={`R-${s}`}
                          className={`spindle-tick ${hasBreakAtSpindle(m, 'R', s) ? 'broken' : ''}`}
                          title={`Right Spindle #${s}${hasBreakAtSpindle(m, 'R', s) ? ' (End Break)' : ''}`}
                        ></div>
                      ))}
                    </div>

                    <div className="col-breaks">
                      <span className="breaks-num">{m.totalEndBreakCount}</span>
                      <span className="breaks-detail">{m.breakSidesDisplay}</span>
                    </div>
                  </div>
                ))}

                <div className="spindle-legend">
                  <span className="legend-item"><span className="dot red"></span> End break</span>
                  <span className="legend-item"><span className="dot gray"></span> Active Spindle</span>
                  <span className="legend-item"><span className="dot green"></span> Running</span>
                  <span className="legend-item"><span className="dot orange"></span> Stopped / Doffing</span>
                </div>
              </div>
            )}

            {/* VIEW 3: SEPARATE TELEMETRY DATA TABLE */}
            {viewMode === 'table' && (
              <div className="breaks-table-card" style={{ marginTop: '0.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h4 className="table-card-title" style={{ margin: 0 }}>
                    Ring Frames Live Telemetry Table · {displayedMachines.length} Units Active
                  </h4>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    Click any machine row to open full sensor diagnostics
                  </span>
                </div>

                <div className="table-scroll-container" style={{ maxHeight: '520px' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>MACHINE</th>
                        <th>STATUS</th>
                        <th>SPINDLE SPEED</th>
                        <th>BREAKS (L / R)</th>
                        <th>TOTAL BREAKS</th>
                        <th>YIELD (KG)</th>
                        <th>TARGET %</th>
                        <th>ROUNDS</th>
                        <th>CLEANING</th>
                        <th>OPERATOR</th>
                        <th style={{ textAlign: 'right' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayedMachines.map(m => (
                        <tr
                          key={m.machineId}
                          onClick={() => openMachineModal(m.machineId)}
                          style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                        >
                          <td>
                            <strong style={{ color: '#0f172a', fontSize: '0.9rem' }}>{m.machineId}</strong>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{m.machineName}</div>
                          </td>
                          <td>
                            <span
                              className={`status-pill ${
                                m.statusBadge === 'Running'
                                  ? 'running'
                                  : m.statusBadge === 'Doffing'
                                  ? 'doffing'
                                  : m.statusBadge === 'Stopped'
                                  ? 'stopped'
                                  : 'not-reporting'
                              }`}
                            >
                              {m.statusBadge}
                            </span>
                          </td>
                          <td>
                            <strong style={{ color: m.speedStatus?.includes('limit') ? '#dc2626' : '#0f172a' }}>
                              {(m.spindleSpeedCurrent || 0).toLocaleString()} rpm
                            </strong>
                            <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{m.speedStatus}</div>
                          </td>
                          <td>{m.breakSidesDisplay}</td>
                          <td>
                            <strong style={{ fontSize: '0.95rem', color: (m.totalEndBreakCount || 0) > 4 ? '#dc2626' : '#0f172a' }}>
                              {m.totalEndBreakCount}
                            </strong>
                          </td>
                          <td>
                            <strong>{(m.shiftProduction || 0).toFixed(1)}</strong>
                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}> / {m.shiftTargetProduction || 98.4} kg</span>
                          </td>
                          <td>
                            <span style={{ fontWeight: 700, color: (m.yieldPercent || 0) >= 90 ? '#15803d' : '#b45309' }}>
                              {m.yieldPercent}%
                            </span>
                          </td>
                          <td>
                            {m.rounds?.completed ?? 0} / {m.rounds?.total ?? 8}
                          </td>
                          <td>
                            <span
                              style={{
                                color:
                                  m.cleaning?.status === 'Overdue'
                                    ? '#dc2626'
                                    : m.cleaning?.status === 'Due today'
                                    ? '#ea580c'
                                    : '#15803d',
                                fontWeight: 600
                              }}
                            >
                              {m.cleaning?.status || 'Scheduled'}
                            </span>
                          </td>
                          <td>
                            <div>{m.operator?.name || 'Assigned'}</div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b' }}>Last tap: {m.operator?.lastCardTap || '-'}</div>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <button
                              className="btn btn-primary"
                              style={{ height: '30px', padding: '0 0.6rem', fontSize: '0.75rem' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openMachineModal(m.machineId);
                              }}
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* MACHINE DETAIL SLIDE POPUP (RIGHT SIDE) */}
        {modalOpen && (
          <div className="slide-popup-backdrop" onClick={closeModal}>
            <div className="slide-popup-panel" onClick={e => e.stopPropagation()}>
              {/* SLIDE POPUP STICKY HEADER */}
              <div className="slide-popup-header">
                <div className="slide-popup-top-bar">
                  <div className="modal-title-wrap">
                    <span className="modal-eyebrow">MACHINE DETAIL</span>
                    <div className="modal-heading-row">
                      <h1 className="modal-machine-title">
                        {selectedMachineDetail?.machine?.machineId || activeMachineId}
                      </h1>
                      <span className="modal-shift-badge">
                        <span className="shift-icon">⏱</span>
                        {selectedShift === 'All Shifts' ? 'Shift 1 · 07:00 - 15:30' : selectedShift}
                      </span>
                    </div>
                  </div>

                  <div className="slide-header-controls">
                    <span
                      className={`status-pill ${
                        selectedMachineDetail?.machine?.statusBadge === 'Running'
                          ? 'running'
                          : selectedMachineDetail?.machine?.statusBadge === 'Doffing'
                          ? 'doffing'
                          : selectedMachineDetail?.machine?.statusBadge === 'Stopped'
                          ? 'stopped'
                          : 'not-reporting'
                      }`}
                    >
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

                {/* Operator session meta bar */}
                <div className="operator-meta-bar">
                  <div className="meta-item">
                    <span className="meta-label">ACTIVE OPERATOR</span>
                    <span className="meta-val">
                      {selectedMachineDetail?.machine?.operator?.name || 'Senthil Kumar'}
                    </span>
                    <span className="meta-sub">
                      Badge {selectedMachineDetail?.machine?.operator?.badge || 'OP-104'}
                    </span>
                  </div>

                  <div className="meta-item">
                    <span className="meta-label">SESSION STATUS</span>
                    <span className="badge-active">
                      {selectedMachineDetail?.machine?.operator?.session || 'Session active'}
                    </span>
                  </div>

                  <div className="meta-item">
                    <span className="meta-label">LAST CARD TAP</span>
                    <span className="meta-val">
                      {selectedMachineDetail?.machine?.operator?.lastTap || selectedMachineDetail?.machine?.operator?.lastCardTap || '12:28:44'}
                    </span>
                  </div>

                  <div className="meta-item">
                    <span className="meta-label">AUTO LOGOUT</span>
                    <span className="meta-val">5m idle cutoff</span>
                  </div>
                </div>

                {/* 4 Sub-Tabs Navigation */}
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
                    End breaks
                  </button>
                  <button
                    className={`tab-btn ${activeModalTab === 'speed_production' ? 'active' : ''}`}
                    onClick={() => setActiveModalTab('speed_production')}
                  >
                    Speed and production
                  </button>
                  <button
                    className={`tab-btn ${activeModalTab === 'rounds_cleaning' ? 'active' : ''}`}
                    onClick={() => setActiveModalTab('rounds_cleaning')}
                  >
                    Rounds and cleaning
                  </button>
                </div>
              </div>

              {/* SLIDE POPUP BODY (SCROLLABLE) */}
              <div className="slide-popup-body">
                {detailLoading && !selectedMachineDetail && (
                  <div className="modal-loading-placeholder">
                    <div className="spinner-sm"></div>
                    <span>Loading machine data for {activeMachineId}...</span>
                  </div>
                )}

                {selectedMachineDetail && (
                  <>
                    {/* TAB 1: OVERVIEW */}
                    {activeModalTab === 'overview' && (
                      <div className="tab-pane">
                        {/* Needs attention banner */}
                        <div className={`attention-banner ${selectedMachineDetail.overview?.hasAttention ? 'alert' : ''}`}>
                          <div className="attention-title">Needs attention</div>
                          <div className="attention-desc">{selectedMachineDetail.overview?.needsAttention || 'None · All metrics within bounds'}</div>
                        </div>

                        <div className="overview-grid">
                          {/* Left: Key Figures (9 clean live tiles) */}
                          <div className="key-figures-card">
                            <h3 className="card-heading">Key figures</h3>
                            <div className="key-tiles-grid">
                              {/* 1: End breaks */}
                              <div className="key-tile">
                                <div className="tile-label">END BREAKS</div>
                                <div className="tile-number">{selectedMachineDetail.overview?.keyFigures?.endBreaks?.value ?? 3}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.endBreaks?.sub ?? '2 Left · 1 Right'}</div>
                              </div>

                              {/* 2: Average RPM */}
                              <div className="key-tile">
                                <div className="tile-label">AVERAGE RPM</div>
                                <div className="tile-number">{selectedMachineDetail.overview?.keyFigures?.averageRpm?.value ?? '16,650'}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.averageRpm?.sub ?? 'Allowed 15,000-17,000'}</div>
                              </div>

                              {/* 3: Yarn Count */}
                              <div className="key-tile">
                                <div className="tile-label">YARN COUNT</div>
                                <div className="tile-number">{selectedMachineDetail.overview?.keyFigures?.yarnCount?.value ?? '40s CW'}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.yarnCount?.sub ?? 'Combed Warp'}</div>
                              </div>

                              {/* 4: Production Yield */}
                              <div className="key-tile">
                                <div className="tile-label">PRODUCTION YIELD</div>
                                <div className="tile-number">{selectedMachineDetail.overview?.keyFigures?.productionYield?.value ?? '98.4 kg'}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.productionYield?.sub ?? '100% of shift target'}</div>
                              </div>

                              {/* 5: Completed Rounds */}
                              <div className="key-tile">
                                <div className="tile-label">COMPLETED ROUNDS</div>
                                <div className="tile-number">{selectedMachineDetail.overview?.keyFigures?.completedRounds?.value ?? '8 / 8'}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.completedRounds?.sub ?? '0 skipped'}</div>
                              </div>

                              {/* 6: End Mending (EM) */}
                              <div className="key-tile">
                                <div className="tile-label">END MENDING (EM)</div>
                                <div className="tile-number text-primary">{selectedMachineDetail.overview?.keyFigures?.endMending?.value ?? 'L(2.1), R(1.4)'}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.endMending?.sub ?? 'Left & right mending (min)'}</div>
                              </div>

                              {/* 7: Sensor Bounds */}
                              <div className="key-tile">
                                <div className="tile-label">SENSOR BOUNDS</div>
                                <div className="tile-number">{selectedMachineDetail.overview?.keyFigures?.sensorBounds?.value ?? '2 / 2'}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.sensorBounds?.sub ?? 'All within bounds'}</div>
                              </div>

                              {/* 8: Operating Mode */}
                              <div className="key-tile">
                                <div className="tile-label">OPERATING MODE</div>
                                <div className="tile-number text-primary">{selectedMachineDetail.overview?.keyFigures?.operatingMode?.value ?? 'Production'}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.operatingMode?.sub ?? '92% runtime'}</div>
                              </div>

                              {/* 9: Next Cleaning */}
                              <div className="key-tile">
                                <div className="tile-label">NEXT CLEANING</div>
                                <div className="tile-number text-success">{selectedMachineDetail.overview?.keyFigures?.nextCleaning?.value ?? 'Tomorrow'}</div>
                                <div className="tile-sub">{selectedMachineDetail.overview?.keyFigures?.nextCleaning?.sub ?? 'Every 2 days'}</div>
                              </div>
                            </div>
                          </div>

                          {/* Right: Operating mode breakdown donut */}
                          <div className="donut-card">
                            <h3 className="card-heading">Operating mode breakdown</h3>
                            <p className="card-subhead">Minutes spent in each mode this shift</p>

                            <div className="donut-display-area">
                              <div
                                className="donut-chart"
                                style={{ background: getDonutConicGradient(selectedMachineDetail.overview?.operatingModeBreakdown?.modes) }}
                              >
                                <div className="donut-hole">
                                  <span className="donut-total-val">{selectedMachineDetail.overview?.operatingModeBreakdown?.totalMinutes ?? 480}</span>
                                  <span className="donut-total-lbl">TOTAL MINS</span>
                                </div>
                              </div>
                            </div>

                            {/* Modes list */}
                            <div className="mode-legend-list">
                              {(selectedMachineDetail.overview?.operatingModeBreakdown?.modes || []).map(m => (
                                <div key={m.name} className="mode-legend-row">
                                  <div className="mode-label-group">
                                    <span className="mode-square" style={{ background: m.color }}></span>
                                    <span>{m.name}</span>
                                  </div>
                                  <span className="mode-mins">{m.minutes} min</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* Interactive Spindle Map preview inside Overview */}
                        <div className="spindle-map-container" style={{ marginTop: '1.25rem' }}>
                          <div className="spindle-map-table-header">
                            <div className="col-machine">FRAME SPINDLES</div>
                            <div className="col-side">LEFT SIDE (1-120)</div>
                            <div className="col-side">RIGHT SIDE (1-120)</div>
                            <div className="col-breaks">STATUS</div>
                          </div>
                          <div className="spindle-map-row status-running">
                            <div className="col-machine">
                              <span className="status-dot running"></span>
                              <strong>{selectedMachineDetail.machine?.machineId}</strong>
                            </div>
                            <div className="col-side spindle-ticks">
                              {spindleRangeLeft.map(s => (
                                <div
                                  key={`m-L-${s}`}
                                  className={`spindle-tick ${(selectedMachineDetail.endBreaks?.leftSide || []).some(b => b.spindleNo === s) ? 'broken' : ''}`}
                                  title={`Left Spindle #${s}`}
                                ></div>
                              ))}
                            </div>
                            <div className="col-side spindle-ticks">
                              {spindleRangeRight.map(s => (
                                <div
                                  key={`m-R-${s}`}
                                  className={`spindle-tick ${(selectedMachineDetail.endBreaks?.rightSide || []).some(b => b.spindleNo === s) ? 'broken' : ''}`}
                                  title={`Right Spindle #${s}`}
                                ></div>
                              ))}
                            </div>
                            <div className="col-breaks">
                              <span className="breaks-num">{selectedMachineDetail.machine?.totalEndBreakCount ?? 0}</span>
                              <span className="breaks-detail">Breaks</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 2: END BREAKS */}
                    {activeModalTab === 'end_breaks' && (
                      <div className="tab-pane">
                        <div className="end-breaks-tables-grid">
                          {/* Left Side Table */}
                          <div className="breaks-table-card">
                            <h4 className="table-card-title">
                              Left Side Spindles ({selectedMachineDetail.endBreaks?.leftSide?.length || 0})
                            </h4>
                            <div className="table-scroll-container">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>SPINDLE NO</th>
                                    <th>BREAKS</th>
                                    <th>DURATION</th>
                                    <th>TIME</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedMachineDetail.endBreaks?.leftSide || []).map(b => (
                                    <tr key={`lb-${b.spindleNo}`}>
                                      <td><strong>Spindle #{b.spindleNo}</strong></td>
                                      <td><span style={{ color: '#dc2626', fontWeight: 700 }}>{b.breakCount}</span></td>
                                      <td>{b.durationMinutes} min</td>
                                      <td>{b.timestamp}</td>
                                    </tr>
                                  ))}
                                  {(!selectedMachineDetail.endBreaks?.leftSide || selectedMachineDetail.endBreaks.leftSide.length === 0) && (
                                    <tr>
                                      <td colSpan={4} className="empty-cell">No active end breaks on left side.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Right Side Table */}
                          <div className="breaks-table-card">
                            <h4 className="table-card-title">
                              Right Side Spindles ({selectedMachineDetail.endBreaks?.rightSide?.length || 0})
                            </h4>
                            <div className="table-scroll-container">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>SPINDLE NO</th>
                                    <th>BREAKS</th>
                                    <th>DURATION</th>
                                    <th>TIME</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedMachineDetail.endBreaks?.rightSide || []).map(b => (
                                    <tr key={`rb-${b.spindleNo}`}>
                                      <td><strong>Spindle #{b.spindleNo}</strong></td>
                                      <td><span style={{ color: '#dc2626', fontWeight: 700 }}>{b.breakCount}</span></td>
                                      <td>{b.durationMinutes} min</td>
                                      <td>{b.timestamp}</td>
                                    </tr>
                                  ))}
                                  {(!selectedMachineDetail.endBreaks?.rightSide || selectedMachineDetail.endBreaks.rightSide.length === 0) && (
                                    <tr>
                                      <td colSpan={4} className="empty-cell">No active end breaks on right side.</td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 3: SPEED & PRODUCTION */}
                    {activeModalTab === 'speed_production' && (
                      <div className="tab-pane">
                        <div className="speed-sensors-grid">
                          {/* Speed Curve Card */}
                          <div className="curve-card">
                            <div className="curve-header">
                              <div>
                                <h4 className="card-heading">Rotational Speed Curve</h4>
                                <p className="card-subhead">Spindle RPM telemetry across shift timeline</p>
                              </div>
                              <div className="period-pills">
                                <button
                                  className={`pill-btn ${speedPeriod === 'hourly' ? 'active' : ''}`}
                                  onClick={() => setSpeedPeriod('hourly')}
                                >
                                  Hourly
                                </button>
                                <button
                                  className={`pill-btn ${speedPeriod === 'daily' ? 'active' : ''}`}
                                  onClick={() => setSpeedPeriod('daily')}
                                >
                                  Daily
                                </button>
                              </div>
                            </div>

                            <div className="svg-curve-wrapper">
                              <svg className="curve-svg" viewBox="0 0 600 140" preserveAspectRatio="none">
                                <defs>
                                  <linearGradient id="rpmGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.3" />
                                    <stop offset="100%" stopColor="#2563eb" stopOpacity="0.0" />
                                  </linearGradient>
                                </defs>
                                {/* Safe Band (15000 to 17000) */}
                                <rect x="0" y="25" width="600" height="85" fill="#dcfce7" fillOpacity="0.6" />
                                <line x1="0" y1="25" x2="600" y2="25" stroke="#86efac" strokeDasharray="3 3" />
                                <line x1="0" y1="110" x2="600" y2="110" stroke="#86efac" strokeDasharray="3 3" />

                                {/* RPM Area */}
                                <polygon
                                  points="0,140 0,60 100,55 200,50 300,52 400,48 500,51 600,54 600,140"
                                  fill="url(#rpmGrad)"
                                />
                                {/* RPM Stroke */}
                                <polyline
                                  points="0,60 100,55 200,50 300,52 400,48 500,51 600,54"
                                  fill="none"
                                  stroke="#2563eb"
                                  strokeWidth="2.5"
                                  strokeLinecap="round"
                                />
                              </svg>

                              <div className="chart-time-labels">
                                <span>07:00</span>
                                <span>09:00</span>
                                <span>11:00</span>
                                <span>13:00</span>
                                <span>15:00</span>
                              </div>
                            </div>

                            <div className="curve-stats-footer">
                              <div className="cstat-item">
                                <span className="cstat-lbl">CURRENT RPM</span>
                                <span className="cstat-val">
                                  {(selectedMachineDetail.machine?.spindleSpeedCurrent || 16650).toLocaleString()}
                                </span>
                              </div>
                              <div className="cstat-item">
                                <span className="cstat-lbl">MIN / MAX</span>
                                <span className="cstat-val">15,000 / 17,200</span>
                              </div>
                              <div className="cstat-legend">
                                <span className="band-box"></span>
                                <span>Target Band</span>
                              </div>
                            </div>
                          </div>

                          {/* Sensor Devices Status Table */}
                          <div className="devices-bounds-card">
                            <h4 className="card-heading">Sensor Devices</h4>
                            <p className="card-subhead">Headstock, Middle & Endstock telemetry nodes</p>

                            <div className="table-scroll-container">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>DEVICE</th>
                                    <th>RPM</th>
                                    <th>STATUS</th>
                                    <th>BATTERY</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedMachineDetail.speedAndSensors?.devices || []).map(d => (
                                    <tr key={d.deviceId}>
                                      <td>
                                        <strong>{d.deviceId}</strong>
                                        <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{d.position}</div>
                                      </td>
                                      <td><strong>{d.rpm?.toLocaleString()}</strong></td>
                                      <td>
                                        <span className={`status-pill ${d.status === 'HEALTHY' || d.status === 'NORMAL' ? 'running' : 'stopped'}`}>
                                          {d.status}
                                        </span>
                                      </td>
                                      <td>{(d as any).batteryLevel ?? 96}%</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* TAB 4: ROUNDS & CLEANING */}
                    {activeModalTab === 'rounds_cleaning' && (
                      <div className="tab-pane">
                        <div className="rounds-cleaning-grid">
                          {/* Shift Rounds Timeline Card */}
                          <div className="shift-rounds-card">
                            <h4 className="card-heading">Shift Patrol Rounds</h4>
                            <p className="card-subhead">Operator inspection sequence and timing compliance</p>

                            <div className="table-scroll-container">
                              <table className="data-table">
                                <thead>
                                  <tr>
                                    <th>ROUND</th>
                                    <th>SCHEDULED</th>
                                    <th>PATROL DETAIL</th>
                                    <th>STATUS</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedMachineDetail.roundsAndCleaning?.shiftRounds || []).map((r: any, idx: number) => (
                                    <tr key={`rd-${r.round || idx}`}>
                                      <td><strong>Round #{r.round || idx + 1}</strong></td>
                                      <td>{r.window || r.scheduledTime || `Round ${idx + 1}`}</td>
                                      <td>{r.detail || r.completedTime || 'Completed on schedule'}</td>
                                      <td>
                                        <span
                                          className={`status-pill ${
                                            r.status === 'COMPLETED' || r.status === 'Completed'
                                              ? 'completed'
                                              : r.status === 'INCOMPLETE'
                                              ? 'incomplete'
                                              : 'not-reporting'
                                          }`}
                                        >
                                          {r.status}
                                        </span>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Preventive Cleaning Card */}
                          <div className="cleaning-card">
                            <div className="cleaning-card-header">
                              <h4 className="card-heading" style={{ margin: 0 }}>Preventive Cleaning</h4>
                              <span
                                className={`status-pill ${
                                  selectedMachineDetail.roundsAndCleaning?.preventiveCleaning?.status === 'Overdue'
                                    ? 'stopped'
                                    : 'running'
                                }`}
                              >
                                {selectedMachineDetail.roundsAndCleaning?.preventiveCleaning?.status || 'Scheduled'}
                              </span>
                            </div>

                            <div className="cleaning-2x2-grid">
                              <div className="cleaning-quad">
                                <span className="quad-label">NEXT DUE</span>
                                <span className="quad-val">
                                  {selectedMachineDetail.roundsAndCleaning?.preventiveCleaning?.nextCleaning || 'Tomorrow'}
                                </span>
                              </div>
                              <div className="cleaning-quad">
                                <span className="quad-label">INTERVAL</span>
                                <span className="quad-val">
                                  {selectedMachineDetail.roundsAndCleaning?.preventiveCleaning?.interval || 'Every 2 days'}
                                </span>
                              </div>
                              <div className="cleaning-quad">
                                <span className="quad-label">LAST CLEANED</span>
                                <span className="quad-val">
                                  {selectedMachineDetail.roundsAndCleaning?.preventiveCleaning?.lastCleaning || 'Yesterday'}
                                </span>
                              </div>
                              <div className="cleaning-quad">
                                <span className="quad-label">TECHNICIAN</span>
                                <span className="quad-val">Assigned</span>
                              </div>
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
      </div>
  );
};
