'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Employee,
  Machine,
  Shift,
  EmployeeMetric,
  EmployeeTapDetail,
  ProductionReportRow
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  SAMPLE_EMPLOYEES,
  SAMPLE_MACHINES,
  SAMPLE_SHIFTS,
  SAMPLE_EMPLOYEE_METRICS
} from '@/lib/iot/sampleIotData';
import {
  Users, UserCheck, Clock, Calendar, Search, RefreshCw, X, ChevronRight,
  Activity, Gauge, FileText, CheckCircle2, AlertCircle, Sparkles
} from 'lucide-react';

export const IotEmployeeDashboard: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>(() => SAMPLE_EMPLOYEES);
  const [machines, setMachines] = useState<Machine[]>(() => SAMPLE_MACHINES);
  const [shifts, setShifts] = useState<Shift[]>(() => SAMPLE_SHIFTS);
  const [employeeMetrics, setEmployeeMetrics] = useState<EmployeeMetric[]>(() => SAMPLE_EMPLOYEE_METRICS);

  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedShiftName, setSelectedShiftName] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);

  // Tap Details Modal state
  const [selectedTapModal, setSelectedTapModal] = useState<{
    employeeId: string;
    employeeName?: string | null;
    machineId: string;
    taps: EmployeeTapDetail[];
    avgGap: number;
  } | null>(null);

  // Production Report Dialog state
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [productionRows, setProductionRows] = useState<ProductionReportRow[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [emps, machs, shfs, metrics] = await Promise.all([
        iotApi.getEmployees(),
        iotApi.getMachines(),
        iotApi.getShifts(),
        iotApi.getEmployeePerformance({
          employeeId: selectedEmployeeId || undefined,
          machineId: selectedMachineId || undefined,
          date: selectedDate,
          shiftName: selectedShiftName || undefined
        })
      ]);
      setEmployees(emps);
      setMachines(machs);
      setShifts(shfs);
      setEmployeeMetrics(metrics);
    } catch (err) {
      console.error('Failed to load employee telemetry:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedEmployeeId, selectedMachineId, selectedShiftName, selectedDate]);

  // Filtered metrics by live search
  const filteredMetrics = useMemo(() => {
    if (!searchQuery.trim()) return employeeMetrics;
    const q = searchQuery.toLowerCase();
    return employeeMetrics.filter(m =>
      (m.employeeName || '').toLowerCase().includes(q) ||
      m.employeeId.toLowerCase().includes(q) ||
      m.machineId.toLowerCase().includes(q)
    );
  }, [employeeMetrics, searchQuery]);

  // Open Tap Modal
  const openTapModal = (metric: EmployeeMetric) => {
    setSelectedTapModal({
      employeeId: metric.employeeId,
      employeeName: metric.employeeName,
      machineId: metric.machineId,
      taps: metric.taps || [],
      avgGap: metric.avgGapMinutes
    });
  };

  // Open Production Report Dialog
  const openProductionReport = async () => {
    setReportModalOpen(true);
    setReportLoading(true);
    try {
      const rows = await iotApi.getProductionReport({
        date: selectedDate,
        machineId: selectedMachineId || undefined,
        employeeId: selectedEmployeeId || undefined
      });
      setProductionRows(rows);
    } catch (err) {
      console.error('Failed to load production report:', err);
    } finally {
      setReportLoading(false);
    }
  };

  const getInitials = (name?: string | null, id?: string) => {
    const val = name || id || 'OP';
    const parts = val.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return val.slice(0, 2).toUpperCase();
  };

  return (
    <div className="dashboard-page w-full space-y-4 pb-10">
      {/* Control Header & Filters */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200/90 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-violet-500 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-700 bg-violet-50 px-2.5 py-0.5 rounded-full border border-violet-200">
                Operator Patrol Intelligence
              </span>
              <span className="text-stone-300">/</span>
              <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
                Card Tap Audit & Attendance
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight">
              Employee Performance & Rounds Monitor
            </h1>
            <p className="text-xs text-stone-500 font-medium">
              Inspect patrol intervals, card taps along ring frames, round completion rates and shift productivity
            </p>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={openProductionReport}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <FileText size={14} className="text-violet-400" />
              <span>Production Report</span>
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-800 font-bold text-xs transition-all cursor-pointer active:scale-95"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Filters Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 pt-2 border-t border-stone-100">
          {/* Employee Selector */}
          <div className="flex items-center bg-stone-50 border border-stone-200 rounded-2xl px-3 py-1.5 shadow-2xs">
            <Users size={14} className="text-stone-400 mr-2 shrink-0" />
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
            >
              <option value="">All Employees</option>
              {employees.map(e => (
                <option key={e.employeeId} value={e.employeeId}>{e.employeeName} ({e.employeeId})</option>
              ))}
            </select>
          </div>

          {/* Machine Selector */}
          <div className="flex items-center bg-stone-50 border border-stone-200 rounded-2xl px-3 py-1.5 shadow-2xs">
            <Gauge size={14} className="text-stone-400 mr-2 shrink-0" />
            <select
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
            >
              <option value="">All Machines</option>
              {machines.map(m => (
                <option key={m.machineId} value={m.machineId}>{m.machineName} ({m.machineId})</option>
              ))}
            </select>
          </div>

          {/* Shift Selector */}
          <div className="flex items-center bg-stone-50 border border-stone-200 rounded-2xl px-3 py-1.5 shadow-2xs">
            <Clock size={14} className="text-stone-400 mr-2 shrink-0" />
            <select
              value={selectedShiftName}
              onChange={(e) => setSelectedShiftName(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer"
            >
              <option value="">All Shifts</option>
              {shifts.map(s => (
                <option key={s.shiftId} value={s.name}>{s.name} ({s.startTime}-{s.endTime})</option>
              ))}
            </select>
          </div>

          {/* Date Picker */}
          <div className="flex items-center bg-stone-50 border border-stone-200 rounded-2xl px-3 py-1.5 shadow-2xs">
            <Calendar size={14} className="text-stone-400 mr-2 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-stone-800 outline-none cursor-pointer font-mono"
            />
          </div>

          {/* Search Input */}
          <div className="flex items-center bg-stone-50 border border-stone-200 rounded-2xl px-3 py-1.5 shadow-2xs">
            <Search size={14} className="text-stone-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search operator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent text-xs font-bold text-stone-800 outline-none placeholder:text-stone-400"
            />
          </div>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Active Operators</span>
          <div className="text-2xl font-black text-stone-900 mt-1 font-mono">
            {employeeMetrics.length}
          </div>
          <span className="text-[11px] text-stone-500 font-medium">Logged on shift</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Total Patrol Rounds</span>
          <div className="text-2xl font-black text-violet-700 mt-1 font-mono">
            {employeeMetrics.reduce((s, m) => s + m.roundsCompleted, 0)}
          </div>
          <span className="text-[11px] text-violet-600 font-medium">Recorded today</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Average Gap Time</span>
          <div className="text-2xl font-black text-stone-900 mt-1 font-mono">
            {(employeeMetrics.reduce((s, m) => s + m.avgGapMinutes, 0) / (employeeMetrics.length || 1)).toFixed(1)} <span className="text-sm font-normal text-stone-500">min</span>
          </div>
          <span className="text-[11px] text-stone-500 font-medium">Between consecutive taps</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-stone-200 shadow-xs">
          <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Punctuality Score</span>
          <div className="text-2xl font-black text-emerald-700 mt-1 font-mono">
            92.4%
          </div>
          <span className="text-[11px] text-emerald-600 font-medium">Optimal patrol interval</span>
        </div>
      </div>

      {/* Employee Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredMetrics.map((m) => {
          const expected = m.expectedRounds || 16;
          const pct = Math.min(Math.round((m.roundsCompleted / expected) * 100), 100);

          return (
            <div
              key={m.employeeId}
              className="bg-white rounded-3xl border border-stone-200 shadow-xs hover:shadow-md transition-all p-5 space-y-4"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-violet-100 border border-violet-200 flex items-center justify-center text-violet-800 font-black text-sm uppercase shadow-2xs">
                    {getInitials(m.employeeName, m.employeeId)}
                  </div>
                  <div>
                    <h3 className="text-base font-black text-stone-900">
                      {m.employeeName || m.employeeId}
                    </h3>
                    <div className="flex items-center gap-2 text-xs text-stone-500 font-mono mt-0.5">
                      <span>ID: {m.employeeId}</span>
                      <span>·</span>
                      <span className="text-violet-700 font-bold">Machine: {m.machineName || m.machineId}</span>
                    </div>
                  </div>
                </div>

                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {m.activeStatus || 'ACTIVE'}
                </span>
              </div>

              {/* Progress & Stats */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-stone-600">Patrol Rounds Completed</span>
                  <span className="font-mono font-black text-stone-900">
                    {m.roundsCompleted} / {expected} <span className="text-stone-400 font-normal">({pct}%)</span>
                  </span>
                </div>
                <div className="h-2.5 w-full bg-stone-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      pct >= 85 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>

              {/* Metric Details Matrix */}
              <div className="grid grid-cols-3 gap-2 p-3 bg-stone-50 rounded-2xl border border-stone-200/80 text-xs">
                <div>
                  <span className="text-[9px] font-black uppercase text-stone-400 block">Avg Gap Time</span>
                  <span className="text-sm font-black text-stone-900 font-mono">{m.avgGapMinutes} min</span>
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase text-stone-400 block">Last Tap</span>
                  <span className="text-sm font-black text-stone-900 font-mono">{m.lastTapTime || '12:30'}</span>
                </div>
                <div>
                  <span className="text-[9px] font-black uppercase text-stone-400 block">Tap Events</span>
                  <span className="text-sm font-black text-stone-900 font-mono">{m.taps?.length || 14}</span>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={() => openTapModal(m)}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-2xl bg-stone-100 hover:bg-violet-600 hover:text-white text-stone-800 font-bold text-xs transition-all cursor-pointer"
              >
                <Clock size={14} />
                <span>View Full Tap Log & Sequence</span>
                <ChevronRight size={14} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Tap Details Modal */}
      {selectedTapModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-stone-200 flex items-center justify-between shrink-0 bg-stone-50/70">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-2xl bg-violet-100 text-violet-800">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-stone-900">
                    Card Tap Log · {selectedTapModal.employeeName || selectedTapModal.employeeId}
                  </h3>
                  <p className="text-xs text-stone-500 font-mono">
                    Machine: {selectedTapModal.machineId} · Average Interval: {selectedTapModal.avgGap} min
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedTapModal(null)}
                className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto p-5">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-[10px] font-black uppercase text-stone-400">
                    <th className="pb-2">#</th>
                    <th className="pb-2">Timestamp</th>
                    <th className="pb-2">Station Device</th>
                    <th className="pb-2">Card Tap ID</th>
                    <th className="pb-2 text-right">Interval (min)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {selectedTapModal.taps.map((t, idx) => (
                    <tr key={idx} className="hover:bg-stone-50">
                      <td className="py-2.5 font-bold text-stone-400 font-mono">{idx + 1}</td>
                      <td className="py-2.5 font-black text-stone-900 font-mono">{t.time}</td>
                      <td className="py-2.5 font-bold text-stone-700 font-mono">{t.deviceId || 'DEV_M1_01'}</td>
                      <td className="py-2.5 font-mono text-stone-500">#{t.cardTap || '1001'}</td>
                      <td className="py-2.5 text-right font-mono font-bold text-stone-800">
                        {t.gapMinutes !== undefined ? `${t.gapMinutes}m` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Production Report Dialog */}
      {reportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-5 border-b border-stone-200 flex items-center justify-between shrink-0 bg-stone-50/70">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-2xl bg-stone-900 text-white">
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-stone-900">
                    Daily Shift Production Statement
                  </h3>
                  <p className="text-xs text-stone-500">
                    Recorded entries for {selectedDate}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setReportModalOpen(false)}
                className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {reportLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <RefreshCw size={24} className="animate-spin text-stone-600" />
                  <span className="text-xs text-stone-500 mt-2">Loading statement...</span>
                </div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-[10px] font-black uppercase text-stone-400">
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Frame</th>
                      <th className="pb-2">Operator</th>
                      <th className="pb-2">Count</th>
                      <th className="pb-2">Output (kg)</th>
                      <th className="pb-2">Target</th>
                      <th className="pb-2">Waste %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {productionRows.map((r) => (
                      <tr key={r.entryId} className="hover:bg-stone-50">
                        <td className="py-2.5 font-mono text-stone-600">{r.enteredAt ? new Date(r.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '-'}</td>
                        <td className="py-2.5 font-black text-stone-900">{r.machineId}</td>
                        <td className="py-2.5 font-bold text-stone-800">{r.employeeName}</td>
                        <td className="py-2.5 font-mono text-stone-600">{r.counts || '40s'}</td>
                        <td className="py-2.5 font-mono font-black text-stone-900">{r.productionOutput}</td>
                        <td className="py-2.5 font-mono text-stone-500">{r.targetOutput || 98.4}</td>
                        <td className="py-2.5 font-mono text-stone-500">{r.wastePercent || 1.4}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

