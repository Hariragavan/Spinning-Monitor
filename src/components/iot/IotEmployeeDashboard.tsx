'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Employee,
  Machine,
  Shift,
  EmployeeMetric,
  EmployeeTapDetail,
  ProductionReportRow,
  MachineMapping
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  employeeDisplayName,
  employeeLabel,
  employeeInitials
} from '@/lib/iot/employeeDisplay';

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

  const [employeeId, setEmployeeId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => propDate || '2026-11-03');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (propDate) {
      setSelectedDate(propDate);
    }
  }, [propDate]);

  // Tap Details Modal
  const [selectedTapModal, setSelectedTapModal] = useState<TapModalState | null>(null);

  // Production Report Dialog
  const [productionReportOpen, setProductionReportOpen] = useState(false);
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reportShiftId, setReportShiftId] = useState('');
  const [reportEmployeeId, setReportEmployeeId] = useState('');
  const [reportMachineId, setReportMachineId] = useState('');
  const [reportRows, setReportRows] = useState<ProductionReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

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

      if (machs && machs.length > 0 && !machineId) {
        setMachineId(machs[0].machineId);
      }
      if (shfs && shfs.length > 0 && !shiftName) {
        setShiftName(shfs[0].name || shfs[0].shiftName || 'Shift 1');
        setShiftId(shfs[0].shiftId);
      }
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
      const [metrics, prod] = await Promise.all([
        iotApi.getEmployeePerformance({
          employeeId: employeeId || undefined,
          machineId: machineId || undefined,
          date: selectedDate,
          shiftName: shiftName || undefined,
          shiftId: resolvedShiftId || undefined
        }),
        iotApi.getProductionReport({
          date: selectedDate,
          shiftId: resolvedShiftId || undefined,
          machineId: machineId || undefined,
          employeeId: employeeId || undefined
        }).catch(() => [])
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
    const interval = setInterval(() => {
      refresh(false);
    }, 10000);
    return () => clearInterval(interval);
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

  // Filtered metrics by search query
  const filteredMetrics = useMemo(() => {
    if (!searchQuery.trim()) return employeeMetrics;
    const q = searchQuery.toLowerCase().trim();
    return employeeMetrics.filter(m =>
      (m.employeeId && m.employeeId.toLowerCase().includes(q)) ||
      (m.employeeName && m.employeeName.toLowerCase().includes(q)) ||
      (m.machineId && m.machineId.toLowerCase().includes(q))
    );
  }, [employeeMetrics, searchQuery]);

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

    setSelectedTapModal({
      employeeId: m.employeeId,
      employeeName: m.employeeName,
      machineId: m.machineId,
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
                {machines.map(m => (
                  <option key={m.machineId} value={m.machineId}>
                    {m.machineName} ({m.machineId})
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

        {/* KPI 4: Production Report (Action Card) */}
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
              <span>📑</span>
            </div>
          </div>
          <div className="kpi-main">
            <div className="kpi-figure num-tabular">
              <strong>{totalProductionOutput.toLocaleString()}</strong>
              <span className="unit">O/P</span>
            </div>
            <div className="kpi-indicator positive">
              <span>{productionRows.length} hourly entries recorded</span>
            </div>
          </div>
          <div className="kpi-meta-row action-meta-row">
            <span className="action-text">View Detailed Report →</span>
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
                      <span className="machine-tag num-tabular">{m.machineId}</span>
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
                      {mappings.map(m => (
                        <option key={m.mappingId} value={m.mappingId}>{m.name}</option>
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
