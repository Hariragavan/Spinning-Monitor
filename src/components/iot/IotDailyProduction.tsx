'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  AlertCircle,
  Activity,
  Gauge,
  Cpu,
  Search,
  Filter,
  CheckCircle2,
  X
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { iotApi } from '@/lib/iot/iotApi';
import {
  IotDailyProductionResponse,
  IotMonthDateShiftRow,
  IotDailyProductionMachineRow
} from '@/types/iot';

export interface IotDailyProductionProps {
  initialDate?: string;
  isTvMode?: boolean;
}

export const IotDailyProduction: React.FC<IotDailyProductionProps> = ({
  initialDate,
  isTvMode = false
}) => {
  // Current month determination (YYYY-MM)
  const currentMonthStr = useMemo(() => {
    if (initialDate && /^\d{4}-\d{2}/.test(initialDate)) {
      return initialDate.slice(0, 7);
    }
    return new Date().toISOString().slice(0, 7);
  }, [initialDate]);

  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonthStr);
  const [selectedShift, setSelectedShift] = useState<string>('all'); // 'all', '1', '2', '3'

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [data, setData] = useState<IotDailyProductionResponse | null>(null);

  // Modal popup state for viewing machine details of a shift
  const [modalShiftKey, setModalShiftKey] = useState<string | null>(null);
  const [machineSearch, setMachineSearch] = useState<string>('');
  const [selectedShedFilter, setSelectedShedFilter] = useState<string>('all');

  // Fetch telemetry
  const fetchData = useCallback(async (month: string, shift: string, isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await iotApi.getDailyProduction({
        month,
        shift: shift === 'all' ? 'all' : shift
      });
      setData(res);
    } catch (err) {
      console.error('Failed to load daily production:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData(selectedMonth, selectedShift);
  }, [selectedMonth, selectedShift, fetchData]);

  // Live Auto-Refresh: Updates every 45 seconds from API
  useEffect(() => {
    const timer = setInterval(() => {
      fetchData(selectedMonth, selectedShift, true);
    }, 45000);
    return () => clearInterval(timer);
  }, [selectedMonth, selectedShift, fetchData]);

  // Month navigation
  const handleStepMonth = (direction: 'prev' | 'next') => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + (direction === 'next' ? 1 : -1), 1);
    const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setSelectedMonth(nextMonth);
  };

  const monthLabel = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    if (!y || !m) return selectedMonth;
    const d = new Date(y, m - 1, 1);
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }, [selectedMonth]);

  // Excel Export
  const handleExportMonthExcel = () => {
    if (!data?.monthRows || data.monthRows.length === 0) return;

    const rows = data.monthRows.map((r, idx) => [
      idx + 1,
      r.date,
      r.shiftName,
      `${r.timing.from} - ${r.timing.to}`,
      `${r.shiftHours} hrs`,
      r.productionKg,
      r.overallEm,
      `${r.activeMachineCount} / ${r.totalMachineCount}`,
      r.activeMachinesSummary || '',
      `${r.wastePercentage}%`
    ]);

    const headers = [
      '#', 'Date', 'Shift', 'Timing', 'Hours', 'Production (kg)',
      'Overall EM (min)', 'Active Machines', 'Active Machines List', 'Waste %'
    ];

    const grand = [
      'TOTAL',
      '',
      `${data.monthGrandTotal.totalShifts} Shifts`,
      '',
      '',
      data.monthGrandTotal.productionKg,
      data.monthGrandTotal.overallEm,
      '',
      '',
      `${data.monthGrandTotal.wastePercentage}%`
    ];

    const ws = XLSX.utils.aoa_to_sheet([
      [`SCM TEXTILE SPINNERS - DAILY SHIFT END PRODUCTION STATEMENT (${monthLabel})`],
      ['Filter:', selectedShift === 'all' ? 'All Shifts' : `Shift ${selectedShift}`],
      [],
      headers,
      ...rows,
      grand
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Production');
    XLSX.writeFile(wb, `SCM_Daily_Production_${selectedMonth}_S${selectedShift}.xlsx`);
  };

  const monthRows = data?.monthRows || [];
  const monthGrandTotal = data?.monthGrandTotal;
  const availableMonths = data?.availableMonths || [];

  // Find currently selected shift row object for modal popup
  const activeShiftRow = useMemo(() => {
    if (!modalShiftKey) return null;
    return monthRows.find(r => `${r.date}-${r.shift}` === modalShiftKey) || null;
  }, [monthRows, modalShiftKey]);

  // Filtered machines for the active shift
  const activeShiftMachines = useMemo(() => {
    if (!activeShiftRow?.machines) return [];
    let list = [...activeShiftRow.machines];

    if (selectedShedFilter !== 'all') {
      list = list.filter(m => (m.shed || '').toLowerCase() === selectedShedFilter.toLowerCase());
    }

    if (machineSearch.trim()) {
      const q = machineSearch.trim().toLowerCase();
      list = list.filter(m =>
        m.spinningFrame.toLowerCase().includes(q) ||
        m.iotMachine.toLowerCase().includes(q) ||
        (m.count && m.count.toLowerCase().includes(q)) ||
        (m.shed && m.shed.toLowerCase().includes(q))
      );
    }

    return list;
  }, [activeShiftRow, selectedShedFilter, machineSearch]);

  // Available sheds in active shift machines
  const availableSheds = useMemo(() => {
    if (!activeShiftRow?.machines) return [];
    const set = new Set<string>();
    activeShiftRow.machines.forEach(m => {
      if (m.shed) set.add(m.shed);
    });
    return Array.from(set).sort();
  }, [activeShiftRow]);

  return (
    <div className={`w-full min-h-screen pb-16 bg-stone-50 text-stone-900 ${isTvMode ? 'p-2' : 'p-4 md:p-6'}`}>
      {/* 1. Header Toolbar: ONLY Month Picker and Shift Selector */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-xs p-4 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Title & Month Selector */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white shadow-sm shadow-emerald-500/20">
                <Layers size={20} className="stroke-[2.2]" />
              </div>
              <div>
                <h1 className="text-xl font-black text-stone-900 tracking-tight">
                  Daily Production
                </h1>
                <p className="text-xs text-stone-700 font-medium">
                  Shift-end production, targets, active machines, and overall EM
                </p>
              </div>
            </div>

            {/* Month Stepper (< Month Year >) */}
            <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200 ml-0 sm:ml-4">
              <button
                onClick={() => handleStepMonth('prev')}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-stone-700 hover:text-stone-900 transition cursor-pointer"
                title="Previous Month"
              >
                <ChevronLeft size={16} />
              </button>

              <div className="flex items-center gap-2 px-3">
                <Calendar size={15} className="text-emerald-600" />
                <span className="text-xs font-black text-stone-900 min-w-[125px] text-center tracking-tight">
                  {monthLabel}
                </span>
              </div>

              <button
                onClick={() => handleStepMonth('next')}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white text-stone-700 hover:text-stone-900 transition cursor-pointer"
                title="Next Month"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {/* Quick Month Dropdown (if multiple months recorded) */}
            {availableMonths.length > 1 && (
              <select
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="text-xs font-bold bg-stone-100 border border-stone-200 rounded-xl px-3 py-2 text-stone-700 cursor-pointer outline-none hover:bg-stone-200 transition"
              >
                {availableMonths.map(m => {
                  const [y, mo] = m.split('-').map(Number);
                  const lbl = new Date(y, mo - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                  return (
                    <option key={m} value={m}>
                      {lbl}
                    </option>
                  );
                })}
              </select>
            )}
          </div>

          {/* Shift Selector & Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Shift Selector Pills */}
            <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl border border-stone-200">
              {[
                { id: 'all', label: 'All Shifts' },
                { id: '1', label: 'Shift 1' },
                { id: '2', label: 'Shift 2' },
                { id: '3', label: 'Shift 3' }
              ].map(s => {
                const active = selectedShift === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedShift(s.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      active
                        ? 'bg-white text-emerald-700 shadow-sm border border-stone-200/80 font-black'
                        : 'text-stone-600 hover:text-stone-900'
                    }`}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchData(selectedMonth, selectedShift, true)}
              disabled={refreshing || loading}
              className="px-3 py-2 text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition flex items-center gap-1.5 border border-stone-200 cursor-pointer disabled:opacity-50"
              title="Refresh"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin text-emerald-600' : ''} />
              <span>{refreshing ? '...' : 'Refresh'}</span>
            </button>

            {/* Export Excel Button */}
            <button
              onClick={handleExportMonthExcel}
              disabled={!monthRows.length}
              className="px-4 py-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-xs transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download size={13} />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Neat Shift-End Daily Production Table */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        {/* Table Header Bar */}
        <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between flex-wrap gap-2 bg-stone-50/50">
          <div>
            <h2 className="text-sm font-black text-stone-900 uppercase tracking-wider flex items-center gap-2">
              <Calendar size={15} className="text-emerald-600" />
              Daily Shift End Statement — {monthLabel}
            </h2>
            <p className="text-xs text-stone-700 font-medium mt-0.5">
              Production, targets, overall EM, active machines, and waste for each shift
            </p>
          </div>
          <span className="text-xs font-bold text-stone-700 bg-stone-100 px-3 py-1 rounded-full border border-stone-200">
            {monthRows.length} Shifts Recorded
          </span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-stone-700">
            <RefreshCw size={24} className="animate-spin text-emerald-600 mx-auto mb-2.5" />
            <p className="text-xs font-bold text-stone-700">Loading daily production telemetry...</p>
          </div>
        ) : monthRows.length === 0 ? (
          <div className="p-16 text-center text-stone-700">
            <AlertCircle size={30} className="text-stone-600 mx-auto mb-2.5" />
            <h3 className="text-sm font-bold text-stone-850">No shift telemetry found for {monthLabel}</h3>
            <p className="text-xs text-stone-700 mt-1 max-w-sm mx-auto">
              No shift-ending records exist for {monthLabel} with {selectedShift === 'all' ? 'All Shifts' : `Shift ${selectedShift}`}. Use the month picker above to view previous months.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-stone-100/80 text-stone-700 font-bold uppercase tracking-wider text-[11px] border-b border-stone-200">
                  <th className="py-3.5 px-3 text-center w-12">#</th>
                  <th className="py-3.5 px-3.5 whitespace-nowrap">Date</th>
                  <th className="py-3.5 px-3 whitespace-nowrap">Shift</th>
                  <th className="py-3.5 px-3 whitespace-nowrap">Timing</th>
                  <th className="py-3.5 px-3 text-center whitespace-nowrap">Hours</th>
                  <th className="py-3.5 px-3.5 text-right whitespace-nowrap">Production (kg)</th>
                  <th className="py-3.5 px-3.5 text-right whitespace-nowrap">Overall EM</th>
                  <th className="py-3.5 px-3 text-center whitespace-nowrap">Active Machines</th>
                  <th className="py-3.5 px-3 text-right whitespace-nowrap">Waste %</th>
                  <th className="py-3.5 px-3 text-center whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {monthRows.map((r, idx) => {
                  const dObj = new Date(r.date);
                  const dateDisplay = isNaN(dObj.getTime())
                    ? r.date
                    : dObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
                  const dayName = isNaN(dObj.getTime())
                    ? ''
                    : dObj.toLocaleDateString('en-US', { weekday: 'short' });

                  const rowKey = `${r.date}-${r.shift}`;
                  const isSelected = modalShiftKey === rowKey;

                  return (
                    <tr
                      key={`${rowKey}-${idx}`}
                      onClick={() => setModalShiftKey(rowKey)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/80 ring-2 ring-emerald-500/30'
                          : idx % 2 === 0
                            ? 'bg-white hover:bg-emerald-50/40'
                            : 'bg-stone-50/40 hover:bg-emerald-50/40'
                      }`}
                    >
                      {/* S.No */}
                      <td className="py-3.5 px-3 text-center font-mono text-stone-700 text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-stone-900 text-xs">
                            {dateDisplay}
                          </span>
                          <span className="text-[10px] font-bold text-stone-700 bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                            {dayName}
                          </span>
                        </div>
                      </td>

                      {/* Shift Badge */}
                      <td className="py-3.5 px-3 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black border ${
                          isSelected ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-stone-100 text-stone-850 border-stone-200'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-emerald-500'}`} />
                          {r.shiftName}
                        </span>
                      </td>

                      {/* Timing (From - To) */}
                      <td className="py-3.5 px-3 font-mono text-stone-700 text-xs whitespace-nowrap">
                        {r.timing.from} - {r.timing.to}
                      </td>

                      {/* Shift Hours */}
                      <td className="py-3.5 px-3 text-center font-mono font-medium text-stone-700 text-xs whitespace-nowrap">
                        {r.shiftHours} hrs
                      </td>

                      {/* Actual Production (kg) */}
                      <td className="py-3.5 px-3.5 text-right font-mono font-black text-stone-900 text-xs whitespace-nowrap">
                        {r.productionKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Overall EM */}
                      <td className="py-3.5 px-3.5 text-right whitespace-nowrap">
                        <span className="font-mono font-black text-stone-900 text-xs">
                          {r.overallEm.toFixed(2)} min
                        </span>
                      </td>

                      {/* Active Machines */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200"
                          title={r.activeMachinesSummary ? `Active: ${r.activeMachinesSummary}` : undefined}
                        >
                          {r.activeMachineCount} / {r.totalMachineCount} RUN
                        </span>
                      </td>

                      {/* Waste % */}
                      <td className="py-3.5 px-3 text-right font-mono text-xs text-stone-700 whitespace-nowrap">
                        {r.wastePercentage > 0 ? `${r.wastePercentage.toFixed(2)}%` : '-'}
                      </td>

                      {/* View Machines Action */}
                      <td className="py-3.5 px-3 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setModalShiftKey(rowKey);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer bg-emerald-50 hover:bg-emerald-600 text-emerald-800 hover:text-white border border-emerald-200 shadow-2xs"
                        >
                          <Cpu size={13} />
                          <span>View Shift Details</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Grand Total Footer */}
              {monthGrandTotal && (
                <tfoot>
                  <tr className="bg-stone-100/90 font-black text-stone-900 border-t-2 border-stone-300">
                    <td className="py-3.5 px-3 text-center font-bold text-[10px] uppercase tracking-wider text-stone-700" colSpan={4}>
                      Month Grand Total ({monthGrandTotal.totalShifts} Shifts)
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono text-xs text-stone-700">
                      {monthGrandTotal.totalShifts * 8} hrs
                    </td>
                    <td className="py-3.5 px-3.5 text-right font-mono text-emerald-800 text-xs font-black">
                      {monthGrandTotal.productionKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-3.5 text-right font-mono text-xs font-black text-stone-900">
                      {monthGrandTotal.overallEm.toFixed(2)} min
                    </td>
                    <td className="py-3.5 px-3 text-center text-xs font-bold text-stone-700">
                      Fleet Avg
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-xs">
                      {monthGrandTotal.wastePercentage > 0 ? `${monthGrandTotal.wastePercentage.toFixed(2)}%` : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-center text-xs font-bold text-stone-400">
                      -
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>

      {/* 3. Shift Machine Details Modal Popup (Interactive Dialog when user clicks a shift row or View button) */}
      {activeShiftRow && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setModalShiftKey(null)}
        >
          <div 
            className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header Bar */}
            <div className="px-6 py-5 border-b border-stone-200 bg-stone-50/90 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
              <div>
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="text-base font-black text-stone-900 uppercase tracking-wider">
                    Machine Details — {activeShiftRow.shiftName} ({new Date(activeShiftRow.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })})
                  </h3>
                  <span className="text-[11px] font-bold text-stone-600 bg-stone-100 px-2 py-0.5 rounded border border-stone-200">
                    {activeShiftRow.timing.from} - {activeShiftRow.timing.to} ({activeShiftRow.shiftHours} hrs)
                  </span>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Total: {activeShiftRow.productionKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg
                  </span>
                </div>
                <p className="text-xs text-stone-600 font-medium mt-1">
                  Individual frame telemetry: yarn count, spindle speed, production, end breaks, and EM
                </p>
              </div>

              {/* Controls and Close Button */}
              <div className="flex items-center gap-3 flex-wrap">
                {/* Shed Filter Pills */}
                {availableSheds.length > 0 && (
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-stone-200 shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setSelectedShedFilter('all')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                        selectedShedFilter === 'all'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-stone-600 hover:text-stone-900'
                      }`}
                    >
                      All Sheds
                    </button>
                    {availableSheds.map(shed => (
                      <button
                        key={shed}
                        type="button"
                        onClick={() => setSelectedShedFilter(shed)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          selectedShedFilter.toLowerCase() === shed.toLowerCase()
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'text-stone-600 hover:text-stone-900'
                        }`}
                      >
                        {shed}
                      </button>
                    ))}
                  </div>
                )}

                {/* Search input */}
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Filter frame or count..."
                    value={machineSearch}
                    onChange={(e) => setMachineSearch(e.target.value)}
                    className="pl-8 pr-3 py-1.5 text-xs bg-white border border-stone-200 rounded-xl outline-none focus:border-emerald-500 font-medium text-stone-900 placeholder-stone-400 w-44"
                  />
                </div>

                <span className="text-xs font-bold text-stone-600 bg-stone-100 px-3 py-1.5 rounded-xl border border-stone-200">
                  {activeShiftMachines.length} / {activeShiftRow.machines?.length || 0} Frames
                </span>

                {/* Close Modal Button */}
                <button
                  type="button"
                  onClick={() => setModalShiftKey(null)}
                  className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-900 flex items-center justify-center cursor-pointer transition-colors"
                  title="Close popup"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Table Body (Scrollable) */}
            <div className="overflow-y-auto flex-1 p-0">
              {activeShiftMachines.length === 0 ? (
                <div className="p-16 text-center text-stone-600">
                  <Cpu size={32} className="text-stone-400 mx-auto mb-3" />
                  <p className="text-sm font-bold text-stone-800">No machine records match the filter</p>
                  <p className="text-xs text-stone-500 mt-1">Try clearing the search or changing the shed filter above.</p>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-stone-100 text-stone-700 font-bold uppercase tracking-wider text-[11px] border-b border-stone-200 shadow-2xs">
                      <th className="py-3 px-3 text-center w-12 bg-stone-100">#</th>
                      <th className="py-3 px-3.5 whitespace-nowrap bg-stone-100">Spinning Frame</th>
                      <th className="py-3 px-3 whitespace-nowrap bg-stone-100">IoT Device</th>
                      <th className="py-3 px-3 whitespace-nowrap bg-stone-100">Shed</th>
                      <th className="py-3 px-3.5 whitespace-nowrap bg-stone-100">Yarn Count</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap bg-stone-100">Status</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap bg-stone-100">Spindle Speed</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap bg-stone-100">Production (kg)</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap bg-stone-100">Left EM (min)</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap bg-stone-100">Right EM (min)</th>
                      <th className="py-3 px-3.5 text-right whitespace-nowrap bg-stone-100">Total EM (min)</th>
                      <th className="py-3 px-3 text-center whitespace-nowrap bg-stone-100">End Breaks</th>
                      <th className="py-3 px-3 text-right whitespace-nowrap bg-stone-100">Waste %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {activeShiftMachines.map((m, mIdx) => {
                      const isRunning = m.runStatus === 'RUN';
                      const isDoffing = m.runStatus === 'DOFF';
                      const isStopped = m.runStatus === 'STOP';

                      return (
                        <tr
                          key={`${m.spinningFrame}-${m.iotMachine}-${mIdx}`}
                          className={`hover:bg-emerald-50/30 transition-colors ${
                            mIdx % 2 === 0 ? 'bg-white' : 'bg-stone-50/40'
                          }`}
                        >
                          {/* S.No */}
                          <td className="py-2.5 px-3 text-center font-mono text-stone-600 text-[11px]">
                            {mIdx + 1}
                          </td>

                          {/* Spinning Frame */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span className="font-mono font-black text-stone-900 text-xs">
                              {m.spinningFrame}
                            </span>
                          </td>

                          {/* IoT Device */}
                          <td className="py-2.5 px-3 whitespace-nowrap font-mono text-xs text-stone-600">
                            {m.iotMachine || '-'}
                          </td>

                          {/* Shed */}
                          <td className="py-2.5 px-3 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-stone-100 text-stone-700 border border-stone-200">
                              {m.shed}
                            </span>
                          </td>

                          {/* Yarn Count */}
                          <td className="py-2.5 px-3.5 whitespace-nowrap">
                            <span className="font-bold text-stone-850 text-xs">
                              {m.count || '-'}
                            </span>
                          </td>

                          {/* Run Status */}
                          <td className="py-2.5 px-3 text-center whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                isRunning
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : isDoffing
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : isStopped
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-stone-100 text-stone-600 border border-stone-300'
                              }`}
                            >
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                  isRunning ? 'bg-emerald-500 animate-pulse' : isDoffing ? 'bg-amber-500' : isStopped ? 'bg-rose-500' : 'bg-stone-400'
                                }`}
                              />
                              {m.runStatus || 'OFFLINE'}
                            </span>
                          </td>

                          {/* Spindle Speed */}
                          <td className="py-2.5 px-3.5 text-right font-mono text-xs text-stone-700 whitespace-nowrap">
                            {m.spindleSpeed > 0 ? `${m.spindleSpeed.toLocaleString('en-IN')} rpm` : '-'}
                          </td>

                          {/* Production (kg) */}
                          <td className="py-2.5 px-3.5 text-right font-mono font-black text-stone-900 text-xs whitespace-nowrap">
                            {m.actualKg > 0 ? (
                              <span className="text-emerald-800 font-bold">
                                {m.actualKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            ) : (
                              <span className="text-stone-400">0.00</span>
                            )}
                          </td>

                          {/* Left EM */}
                          <td className="py-2.5 px-3.5 text-right font-mono text-xs text-stone-700 whitespace-nowrap">
                            {m.emLeftMin > 0 ? `${m.emLeftMin.toFixed(2)} min` : '-'}
                          </td>

                          {/* Right EM */}
                          <td className="py-2.5 px-3.5 text-right font-mono text-xs text-stone-700 whitespace-nowrap">
                            {m.emRightMin > 0 ? `${m.emRightMin.toFixed(2)} min` : '-'}
                          </td>

                          {/* Total EM */}
                          <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                            <span className={`font-mono text-xs font-black ${
                              m.emTotalMin > 0 ? 'text-stone-900' : 'text-stone-400'
                            }`}>
                              {m.emTotalMin > 0 ? `${m.emTotalMin.toFixed(2)} min` : '-'}
                            </span>
                          </td>

                          {/* End Breaks */}
                          <td className="py-2.5 px-3 text-center font-mono text-xs whitespace-nowrap">
                            {m.endBreakCount > 0 ? (
                              <span className="px-2 py-0.5 rounded font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                {m.endBreakCount}
                              </span>
                            ) : (
                              <span className="text-stone-400">-</span>
                            )}
                          </td>

                          {/* Waste % */}
                          <td className="py-2.5 px-3 text-right font-mono text-xs text-stone-600 whitespace-nowrap">
                            {m.wastePct > 0 ? `${m.wastePct.toFixed(2)}%` : '-'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* Machine Summary Footer */}
                  <tfoot className="sticky bottom-0 z-10">
                    <tr className="bg-stone-100 font-black text-stone-900 border-t-2 border-stone-300 shadow-md">
                      <td className="py-3 px-3 text-center font-bold text-[10px] uppercase tracking-wider text-stone-700" colSpan={4}>
                        Shift Total ({activeShiftMachines.length} Frames)
                      </td>
                      <td className="py-3 px-3.5 font-bold text-xs text-stone-600">
                        {activeShiftMachines.filter(m => m.runStatus === 'RUN').length} Running
                      </td>
                      <td className="py-3 px-3 text-center text-xs font-bold text-emerald-800">
                        {Math.round((activeShiftMachines.filter(m => m.runStatus === 'RUN').length / Math.max(1, activeShiftMachines.length)) * 100)}% Active
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-xs text-stone-700">
                        {(() => {
                          const running = activeShiftMachines.filter(m => m.spindleSpeed > 0);
                          return running.length > 0 ? `${Math.round(running.reduce((a, b) => a + b.spindleSpeed, 0) / running.length).toLocaleString('en-IN')} rpm avg` : '-';
                        })()}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-emerald-800 text-xs font-black">
                        {activeShiftMachines.reduce((a, b) => a + b.actualKg, 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-xs text-stone-700">
                        {activeShiftMachines.reduce((a, b) => a + b.emLeftMin, 0).toFixed(2)} min
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-xs text-stone-700">
                        {activeShiftMachines.reduce((a, b) => a + b.emRightMin, 0).toFixed(2)} min
                      </td>
                      <td className="py-3 px-3.5 text-right font-mono text-xs font-black text-stone-900">
                        {activeShiftMachines.reduce((a, b) => a + b.emTotalMin, 0).toFixed(2)} min
                      </td>
                      <td className="py-3 px-3 text-center font-mono text-xs font-bold text-amber-900">
                        {activeShiftMachines.reduce((a, b) => a + b.endBreakCount, 0)} breaks
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-xs">
                        {(() => {
                          const withW = activeShiftMachines.filter(m => m.wastePct > 0);
                          return withW.length > 0 ? `${(withW.reduce((a, b) => a + b.wastePct, 0) / withW.length).toFixed(2)}%` : '-';
                        })()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
