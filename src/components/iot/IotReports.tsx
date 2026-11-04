'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Machine,
  Employee,
  Shift,
  ReportFilter,
  MachineRoundPerformance
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  SAMPLE_MACHINES,
  SAMPLE_EMPLOYEES,
  SAMPLE_SHIFTS
} from '@/lib/iot/sampleIotData';
import { employeeLabel, employeeDisplayName } from '@/lib/iot/employeeDisplay';

export const IotReports: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>(() => SAMPLE_MACHINES);
  const [employees, setEmployees] = useState<Employee[]>(() => SAMPLE_EMPLOYEES);
  const [shifts, setShifts] = useState<Shift[]>(() => SAMPLE_SHIFTS);

  const [activeReportType, setActiveReportType] = useState<ReportFilter['reportType']>('rpm_efficiency');
  const [machineId, setMachineId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [reportTitle, setReportTitle] = useState('Spinning & Machine Efficiency');
  const [reportData, setReportData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Round Performance section
  const [roundPerformanceLoading, setRoundPerformanceLoading] = useState(false);
  const [roundPerformanceError, setRoundPerformanceError] = useState('');
  const [roundPerformanceData, setRoundPerformanceData] = useState<MachineRoundPerformance | null>(null);

  const reportsList: { id: ReportFilter['reportType']; name: string; icon: string }[] = [
    { id: 'rpm_efficiency', name: '1. Spinning & Machine Efficiency', icon: '⚙' },
    { id: 'employee_productivity', name: '2. Employee Productivity & Gaps', icon: '👤' },
    { id: 'downtime_modes', name: '3. Machine Downtime & Modes', icon: '⏱' },
    { id: 'duty_coverage', name: '4. Device & Employee Duty Coverage', icon: '✦' },
    { id: 'cleaning_maintenance', name: '5. Cleaning & Maintenance Schedule', icon: '📅' }
  ];

  const loadFilters = async () => {
    try {
      const [m, e, s] = await Promise.all([
        iotApi.getMachines(),
        iotApi.getEmployees(),
        iotApi.getShifts()
      ]);
      setMachines(m.length ? m : SAMPLE_MACHINES);
      setEmployees(e.length ? e : SAMPLE_EMPLOYEES);
      setShifts(s.length ? s : SAMPLE_SHIFTS);

      if (m.length && !machineId) {
        setMachineId(m[0].machineId);
      }
    } catch (err) {
      console.error('Failed to load report filters:', err);
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await iotApi.getReports({
        reportType: activeReportType,
        machineId: machineId || undefined,
        employeeId: employeeId || undefined,
        shiftId: shiftId || undefined,
        from: fromDate || undefined,
        to: toDate || undefined
      });
      setReportTitle(res.title || getDefaultTitle(activeReportType));
      setReportData(res.data || []);
    } catch {
      setReportTitle(getDefaultTitle(activeReportType));
      setReportData(getSampleReportRows(activeReportType));
    } finally {
      setLoading(false);
    }
  };

  const getDefaultTitle = (type: ReportFilter['reportType']) => {
    switch (type) {
      case 'rpm_efficiency': return 'Spinning & Machine Efficiency';
      case 'employee_productivity': return 'Employee Productivity & Round Gap Report';
      case 'downtime_modes': return 'Machine Downtime & Mode Analysis Report';
      case 'duty_coverage': return 'Device & Employee Duty Coverage Report';
      case 'cleaning_maintenance': return 'Cleaning & Maintenance Schedule Report';
      default: return 'Database Analytical Reports';
    }
  };

  const getSampleReportRows = (type: ReportFilter['reportType']) => {
    if (type === 'rpm_efficiency') {
      return [
        { deviceId: 'IOT_D1', machineId: 'IOT_01', avgRPM: 17200, minRPM: 16000, maxRPM: 18000, count: 48, violationsCount: 0, efficiencyPercent: 96, expectedProduction: 140, actualProduction: 142, expectedRuntimeMinutes: 480, actualRuntimeMinutes: 470, lastRPM: 17250 },
        { deviceId: 'IOT_D2', machineId: 'IOT_01', avgRPM: 17150, minRPM: 16000, maxRPM: 18000, count: 48, violationsCount: 1, efficiencyPercent: 94, expectedProduction: 140, actualProduction: 138, expectedRuntimeMinutes: 480, actualRuntimeMinutes: 465, lastRPM: 17100 },
        { deviceId: 'IOT_D3', machineId: 'IOT_02', avgRPM: 16800, minRPM: 16000, maxRPM: 18000, count: 48, violationsCount: 0, efficiencyPercent: 92, expectedProduction: 140, actualProduction: 135, expectedRuntimeMinutes: 480, actualRuntimeMinutes: 450, lastRPM: 16850 }
      ];
    } else if (type === 'employee_productivity') {
      return [
        { employeeId: '2343230214', employeeName: 'Ramesh', machinesOperated: 'IOT_01', totalCardTaps: 4, averageTapGapMinutes: 1.2, idlePercentage: 1.2, performanceReductionPercent: 0, avgGapMinutes: 1.2 },
        { employeeId: '3157579526', employeeName: 'Sambari(24673)', machinesOperated: 'IOT_01 + IOT_02', totalCardTaps: 24, averageTapGapMinutes: 2.8, idlePercentage: 2.8, performanceReductionPercent: 12, avgGapMinutes: 2.8 },
        { employeeId: '2075521798', employeeName: 'Karthik', machinesOperated: 'IOT_02', totalCardTaps: 8, averageTapGapMinutes: 0.8, idlePercentage: 0.8, performanceReductionPercent: 0, avgGapMinutes: 0.8 },
        { employeeId: '2509127430', employeeName: 'Murugan', machinesOperated: 'IOT_03', totalCardTaps: 2, averageTapGapMinutes: 0.1, idlePercentage: 0.1, performanceReductionPercent: 0, avgGapMinutes: 0.1 },
        { employeeId: '1328481243', employeeName: 'Suresh', machinesOperated: 'IOT_01', totalCardTaps: 36, averageTapGapMinutes: 26.5, idlePercentage: 26.5, performanceReductionPercent: 35, avgGapMinutes: 26.5 },
        { employeeId: '621665542', employeeName: 'Rahul(34257)', machinesOperated: 'IOT_02', totalCardTaps: 18, averageTapGapMinutes: 19.2, idlePercentage: 19.2, performanceReductionPercent: 24, avgGapMinutes: 19.2 },
        { employeeId: '562288134', employeeName: 'Mangal(33786)', machinesOperated: 'IOT_01', totalCardTaps: 16, averageTapGapMinutes: 15.4, idlePercentage: 15.4, performanceReductionPercent: 18, avgGapMinutes: 15.4 }
      ];
    } else if (type === 'downtime_modes') {
      return [
        { mode: 'Normal Running', totalDowntimeMinutes: 0, eventCount: 0, machineName: 'All machines', deviceId: 'All devices' },
        { mode: 'Doffing Stop', totalDowntimeMinutes: 0, eventCount: 0, machineName: 'All machines', deviceId: 'All devices' },
        { mode: 'Creeling / Maintenance', totalDowntimeMinutes: 0, eventCount: 0, machineName: 'All machines', deviceId: 'All devices' },
        { mode: 'End Breakage Interruption', totalDowntimeMinutes: 0, eventCount: 0, machineName: 'All machines', deviceId: 'All devices' }
      ];
    } else if (type === 'duty_coverage') {
      return [
        { deviceId: 'IOT_D1', machineId: 'IOT_01', position: 'Front', side: 'L', minRPM: 16000, maxRPM: 18000, assignedEmployeeId: '562288134', assignedEmployeeName: 'Mangal(33786)', lastActiveEmployeeId: '562288134', lastActiveEmployeeName: 'Mangal(33786)', lastSeenAt: new Date().toISOString() },
        { deviceId: 'IOT_D2', machineId: 'IOT_01', position: 'Back', side: 'R', minRPM: 16000, maxRPM: 18000, assignedEmployeeId: '3157579526', assignedEmployeeName: 'Sambari(24673)', lastActiveEmployeeId: '3157579526', lastActiveEmployeeName: 'Sambari(24673)', lastSeenAt: new Date().toISOString() }
      ];
    } else {
      return [
        { machineId: 'M1', machineName: 'Spinning Frame 1', millId: 'SCM-1', cleaningIntervalDays: 7, lastCleaningAt: '2026-11-01', nextCleaningAt: '2026-11-08', lastMaintenanceAt: '2026-10-25', status: 'COMPLIANT' },
        { machineId: 'M2', machineName: 'Spinning Frame 2', millId: 'SCM-1', cleaningIntervalDays: 7, lastCleaningAt: '2026-10-20', nextCleaningAt: '2026-10-27', lastMaintenanceAt: '2026-10-20', status: 'CLEANING OVERDUE' }
      ];
    }
  };

  const loadRoundPerformance = async () => {
    setRoundPerformanceLoading(true);
    setRoundPerformanceError('');
    try {
      const res = await iotApi.getMachineRoundPerformance({
        machineId: machineId || undefined,
        employeeId: employeeId || undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined
      });
      setRoundPerformanceData(res || { rounds: [], deviceGaps: [], employees: [], totalCompletedRounds: 0, totalGapMinutes: 0, averageGapMinutes: 0 });
    } catch {
      setRoundPerformanceData({ rounds: [], deviceGaps: [], employees: [], totalCompletedRounds: 0, totalGapMinutes: 0, averageGapMinutes: 0 });
    } finally {
      setRoundPerformanceLoading(false);
    }
  };

  useEffect(() => {
    loadFilters();
  }, []);

  useEffect(() => {
    loadReport();
    if (activeReportType === 'employee_productivity') {
      loadRoundPerformance();
    }
  }, [activeReportType]);

  const applyFilters = () => {
    loadReport();
    if (activeReportType === 'employee_productivity') {
      loadRoundPerformance();
    }
  };

  const selectedMachineLabel = useMemo(() => {
    const m = machines.find(x => x.machineId === machineId);
    if (m) return `${m.machineName} (${m.machineId})`;
    return machineId || 'All machines';
  }, [machines, machineId]);

  const selectedEmployeeLabel = useMemo(() => {
    const e = employees.find(x => x.employeeId === employeeId);
    if (e) return employeeLabel(e.employeeId, e.employeeName);
    return employeeId || 'All employees';
  }, [employees, employeeId]);

  const barWidth = (val: unknown) => {
    const num = Number(val || 0);
    const allVals = reportData.map(r =>
      Number(r.totalDowntimeMinutes || r.downtimeMinutes || r.efficiencyPercent || r.idlePercentage || 0)
    );
    const maxVal = Math.max(...allVals, 1);
    return Math.min(100, (num / maxVal) * 100);
  };

  const barLabel = (row: any) => {
    return row.machineName || employeeLabel(row.employeeId, row.employeeName) || row.mode || row.deviceId || 'Item';
  };

  const exportCSV = () => {
    if (!reportData.length) return;
    const keys = Object.keys(reportData[0]);
    const csvRows = [
      keys.join(','),
      ...reportData.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))
    ];
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeReportType}_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="content w-full">
      {/* Top Bar */}
      <header className="topbar">
        <div>
          <h1 className="title">Database Analytical Reports</h1>
          <p className="subtitle">
            Select from 5 database-backed operational reports with custom parameters and CSV export
          </p>
        </div>

        <button
          className="btn btn-success cursor-pointer"
          onClick={exportCSV}
          disabled={!reportData.length}
        >
          📥 Export Report (CSV)
        </button>
      </header>

      {/* Report Selection Tabs */}
      <section className="report-nav-tabs">
        {reportsList.map(rep => (
          <button
            key={rep.id}
            className={`rep-tab cursor-pointer ${activeReportType === rep.id ? 'active' : ''}`}
            onClick={() => setActiveReportType(rep.id)}
          >
            <span className="rep-icon">{rep.icon}</span>
            <span>{rep.name}</span>
          </button>
        ))}
      </section>

      {/* Filter Bar */}
      <section className="card filter-bar">
        <div className="filter-row">
          <div className="field">
            <label>Machine Filter</label>
            <div className="select-wrapper">
              <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
                <option value="">All Machines</option>
                {machines.map(m => (
                  <option key={m.machineId} value={m.machineId}>
                    {m.machineName} ({m.machineId})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Employee Filter</label>
            <div className="select-wrapper">
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                <option value="">All Employees</option>
                {employees.map(e => (
                  <option key={e.employeeId} value={e.employeeId}>
                    {employeeLabel(e.employeeId, e.employeeName)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="date-input"
            />
          </div>

          <div className="field">
            <label>Shift Filter</label>
            <div className="select-wrapper">
              <select value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
                <option value="">All Shifts</option>
                {shifts.map(shift => (
                  <option key={shift.shiftId || shift.name} value={shift.shiftId}>
                    {shift.name} ({shift.startTime} - {shift.endTime})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="date-input"
            />
          </div>

          <button
            className="btn btn-primary cursor-pointer"
            onClick={applyFilters}
            disabled={loading || roundPerformanceLoading}
          >
            🔍 Filter Database
          </button>
        </div>
      </section>

      {/* Machine Round Performance Panel (When Tab 2 is active) */}
      {activeReportType === 'employee_productivity' && (
        <section className="card round-performance-panel">
          <div className="card-header">
            <div>
              <h3 className="card-title">Machine Round Performance</h3>
              <p className="card-subtitle">
                Machine: {selectedMachineLabel} • Employee: {selectedEmployeeLabel}
              </p>
            </div>
            <button
              className="btn btn-primary cursor-pointer"
              onClick={loadRoundPerformance}
              disabled={roundPerformanceLoading}
            >
              ↻ Refresh
            </button>
          </div>

          {roundPerformanceLoading ? (
            <div className="empty-state">Loading machine round performance...</div>
          ) : roundPerformanceError ? (
            <div className="empty-state error-state" role="alert">{roundPerformanceError}</div>
          ) : !roundPerformanceData || (!roundPerformanceData.rounds.length && !roundPerformanceData.deviceGaps.length) ? (
            <div className="empty-state">
              No round performance data matches the current date, machine, and employee filters.
            </div>
          ) : (
            <div className="round-performance-body">
              <div className="summary-grid">
                <div className="summary-card accent-blue">
                  <span className="summary-label">Selected machine</span>
                  <strong>{selectedMachineLabel}</strong>
                </div>
                <div className="summary-card accent-purple">
                  <span className="summary-label">Selected employee</span>
                  <strong>{selectedEmployeeLabel}</strong>
                </div>
                <div className="summary-card accent-green">
                  <span className="summary-label">Completed rounds</span>
                  <strong>{roundPerformanceData.totalCompletedRounds || roundPerformanceData.rounds.length || 0}</strong>
                </div>
                <div className="summary-card accent-amber">
                  <span className="summary-label">Total gap time</span>
                  <strong>{roundPerformanceData.totalGapMinutes || 0} min</strong>
                </div>
                <div className="summary-card accent-red">
                  <span className="summary-label">Avg gap time</span>
                  <strong>{roundPerformanceData.averageGapMinutes || 0} min</strong>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Main Report Table Section */}
      <section className="card card-table">
        <div className="card-header">
          <div>
            <h3 className="card-title">{reportTitle}</h3>
            <p className="card-subtitle">Database records count: {reportData.length}</p>
          </div>
        </div>

        {/* Horizontal Report Bars */}
        {reportData.length > 0 &&
          (activeReportType === 'rpm_efficiency' ||
            activeReportType === 'downtime_modes' ||
            activeReportType === 'employee_productivity') && (
            <div className="report-bars">
              {reportData.slice(0, 8).map((row, idx) => {
                const fillClass =
                  activeReportType === 'downtime_modes'
                    ? 'downtime'
                    : activeReportType === 'employee_productivity'
                    ? 'idle'
                    : '';
                const widthPercent = barWidth(
                  row.totalDowntimeMinutes || row.downtimeMinutes || row.efficiencyPercent || row.idlePercentage
                );
                const displayVal =
                  activeReportType === 'downtime_modes'
                    ? `${row.totalDowntimeMinutes || row.downtimeMinutes || 0} min`
                    : activeReportType === 'employee_productivity'
                    ? `${row.idlePercentage || 0}%`
                    : `${row.efficiencyPercent || row.avgRPM || 0}%`;

                return (
                  <div key={idx} className="bar-row">
                    <span title={barLabel(row)}>{barLabel(row)}</span>
                    <div className="bar-track">
                      <div className={`bar-fill ${fillClass}`} style={{ width: `${widthPercent}%` }} />
                    </div>
                    <strong>{displayVal}</strong>
                  </div>
                );
              })}
            </div>
          )}

        {/* Report 1: Spinning & Machine Efficiency */}
        {activeReportType === 'rpm_efficiency' && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Machine ID</th>
                  <th>Avg Speed (Spinning)</th>
                  <th>Min / Max Target</th>
                  <th>Total Readings</th>
                  <th>Speed Breaches</th>
                  <th>Efficiency Score</th>
                  <th>Production expected / actual</th>
                  <th>Runtime expected / actual</th>
                  <th>Last Logged Speed</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i}>
                    <td><strong>{row.deviceId}</strong></td>
                    <td>{row.machineId}</td>
                    <td><strong>{row.avgRPM} Spinning</strong></td>
                    <td>{row.minRPM} - {row.maxRPM} Spinning</td>
                    <td>{row.count}</td>
                    <td>
                      <span className={row.violationsCount > 0 ? 'text-danger' : ''}>
                        {row.violationsCount} Breaches
                      </span>
                    </td>
                    <td>
                      <strong className={row.efficiencyPercent >= 80 ? 'text-success' : 'text-danger'}>
                        {row.efficiencyPercent}%
                      </strong>
                    </td>
                    <td>{row.expectedProduction || 0} / {row.actualProduction || row.productionOutput || 0}</td>
                    <td>{row.expectedRuntimeMinutes || 0} / {row.actualRuntimeMinutes || row.runtimeMinutes || 0} min</td>
                    <td>{row.lastRPM ? `${row.lastRPM} Spinning` : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report 2: Employee Productivity */}
        {activeReportType === 'employee_productivity' && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Machines Operated</th>
                  <th>Total RFID Card Taps</th>
                  <th>Avg Tap Gap</th>
                  <th>Idle Time / %</th>
                  <th>Performance Reduction</th>
                  <th>Avg Round Gap</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i}>
                    <td>
                      <strong>{employeeDisplayName(row.employeeId, row.employeeName)}</strong>
                    </td>
                    <td>{row.machinesOperated}</td>
                    <td>{row.totalCardTaps} Taps</td>
                    <td>{row.averageTapGapMinutes || row.avgGapMinutes || 0} min</td>
                    <td>{row.idleMinutes || 0} min / {row.idlePercentage || 0}%</td>
                    <td>{row.performanceReductionPercent || 0}%</td>
                    <td>{row.avgGapMinutes || 0} Mins</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report 3: Machine Downtime & Modes */}
        {activeReportType === 'downtime_modes' && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Operational Mode</th>
                  <th>Total Downtime (minutes)</th>
                  <th>Event Count</th>
                  <th>Machine</th>
                  <th>Device</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i}>
                    <td><strong>{row.mode}</strong></td>
                    <td><strong>{row.totalDowntimeMinutes || row.downtimeMinutes || 0} min</strong></td>
                    <td>{row.eventCount || 0}</td>
                    <td>{row.machineName || row.machineId || 'All machines'}</td>
                    <td>{row.deviceId || 'All devices'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report 4: Duty Coverage */}
        {activeReportType === 'duty_coverage' && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Machine &amp; Position</th>
                  <th>Target Min/Max Spinning</th>
                  <th>Assigned Employee</th>
                  <th>Last Active Operator</th>
                  <th>Last Telemetry Date</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i}>
                    <td><strong>{row.deviceId}</strong></td>
                    <td>{row.machineId} (Pos {row.position} - {row.side})</td>
                    <td>{row.minRPM} - {row.maxRPM} Spinning</td>
                    <td>
                      <strong>
                        {employeeDisplayName(row.assignedEmployeeId, row.assignedEmployeeName, 'Unassigned')}
                      </strong>
                    </td>
                    <td>{employeeDisplayName(row.lastActiveEmployeeId, row.lastActiveEmployeeName, 'N/A')}</td>
                    <td>{row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString() : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Report 5: Cleaning & Maintenance */}
        {activeReportType === 'cleaning_maintenance' && (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine ID</th>
                  <th>Machine Name</th>
                  <th>Mill Location</th>
                  <th>Cleaning Frequency</th>
                  <th>Last Cleaned Date</th>
                  <th>Next Due Date</th>
                  <th>Last Maintenance Date</th>
                  <th>Compliance Status</th>
                </tr>
              </thead>
              <tbody>
                {reportData.map((row, i) => (
                  <tr key={i}>
                    <td><strong>{row.machineId}</strong></td>
                    <td>{row.machineName}</td>
                    <td>Mill #{row.millId}</td>
                    <td>Every {row.cleaningIntervalDays} Days</td>
                    <td>{row.lastCleaningAt ? new Date(row.lastCleaningAt).toLocaleDateString() : 'No Record'}</td>
                    <td><strong>{row.nextCleaningAt ? new Date(row.nextCleaningAt).toLocaleDateString() : 'N/A'}</strong></td>
                    <td>{row.lastMaintenanceAt ? new Date(row.lastMaintenanceAt).toLocaleDateString() : 'N/A'}</td>
                    <td>
                      <div
                        className={`status-badge ${
                          row.status === 'CLEANING OVERDUE' ? 'warning' : 'success'
                        }`}
                      >
                        {row.status}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!reportData.length && !loading && (
          <div className="empty-state">
            No report records returned for the chosen parameters.
          </div>
        )}
      </section>
    </div>
  );
};
