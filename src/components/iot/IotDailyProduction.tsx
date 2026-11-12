'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  Download,
  RefreshCw,
  AlertCircle,
  Activity,
  Gauge,
  Cpu
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { iotApi } from '@/lib/iot/iotApi';
import {
  IotDailyProductionResponse,
  IotMonthDateShiftRow
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

  // 24x7 Live Auto-Refresh (Updates every 45 seconds from API)
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
      r.targetKg,
      r.varianceKg,
      `${r.achievementPct}%`,
      r.overallEm,
      `${r.activeMachineCount} / ${r.totalMachineCount}`,
      r.activeMachinesSummary || '',
      `${r.wastePercentage}%`
    ]);

    const headers = [
      '#', 'Date', 'Shift', 'Timing', 'Hours', 'Production (kg)',
      'Target (kg)', 'Variance (kg)', 'Achievement %',
      'Overall EM (min)', 'Active Machines', 'Active Machines List', 'Waste %'
    ];

    const grand = [
      'TOTAL',
      '',
      `${data.monthGrandTotal.totalShifts} Shifts`,
      '',
      '',
      data.monthGrandTotal.productionKg,
      data.monthGrandTotal.targetKg,
      data.monthGrandTotal.varianceKg,
      `${data.monthGrandTotal.achievementPct}%`,
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
                  <th className="py-3.5 px-3.5 text-right whitespace-nowrap">Target (kg)</th>
                  <th className="py-3.5 px-3.5 text-right whitespace-nowrap">Diff (kg)</th>
                  <th className="py-3.5 px-3 text-center whitespace-nowrap">Achieved</th>
                  <th className="py-3.5 px-3.5 text-right whitespace-nowrap">Overall EM</th>
                  <th className="py-3.5 px-3 text-center whitespace-nowrap">Active Machines</th>
                  <th className="py-3.5 px-3 text-right whitespace-nowrap">Waste %</th>
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

                  return (
                    <tr
                      key={`${r.date}-${r.shift}-${idx}`}
                      className={`hover:bg-emerald-50/40 transition ${
                        idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/40'
                      }`}
                    >
                      {/* S.No */}
                      <td className="py-3 px-3 text-center font-mono text-stone-700 text-[11px]">
                        {idx + 1}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
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
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-black bg-stone-100 text-stone-850 border border-stone-200">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                          {r.shiftName}
                        </span>
                      </td>

                      {/* Timing (From - To) */}
                      <td className="py-3 px-3 font-mono text-stone-700 text-xs whitespace-nowrap">
                        {r.timing.from} - {r.timing.to}
                      </td>

                      {/* Shift Hours */}
                      <td className="py-3 px-3 text-center font-mono font-medium text-stone-700 text-xs whitespace-nowrap">
                        {r.shiftHours} hrs
                      </td>

                      {/* Actual Production (kg) */}
                      <td className="py-3 px-3.5 text-right font-mono font-black text-stone-900 text-xs whitespace-nowrap">
                        {r.productionKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Target Production (kg) */}
                      <td className="py-3 px-3.5 text-right font-mono font-medium text-stone-700 text-xs whitespace-nowrap">
                        {r.targetKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>

                      {/* Diff (kg) */}
                      <td className="py-3 px-3.5 text-right font-mono text-xs whitespace-nowrap">
                        <span
                          className={`font-bold ${
                            r.varianceKg >= 0 ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {r.varianceKg >= 0 ? `+${r.varianceKg.toFixed(2)}` : r.varianceKg.toFixed(2)}
                        </span>
                      </td>

                      {/* Achievement % */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md font-mono text-xs font-black ${
                            r.achievementPct >= 98
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {r.achievementPct}%
                        </span>
                      </td>

                      {/* Overall EM */}
                      <td className="py-3 px-3.5 text-right whitespace-nowrap">
                        <span className="font-mono font-black text-stone-900 text-xs">
                          {r.overallEm.toFixed(2)} min
                        </span>
                      </td>

                      {/* Active Machines */}
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1 font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200"
                          title={r.activeMachinesSummary ? `Active: ${r.activeMachinesSummary}` : undefined}
                        >
                          {r.activeMachineCount} / {r.totalMachineCount} RUN
                        </span>
                      </td>

                      {/* Waste % */}
                      <td className="py-3 px-3 text-right font-mono text-xs text-stone-700 whitespace-nowrap">
                        {r.wastePercentage > 0 ? `${r.wastePercentage.toFixed(2)}%` : '-'}
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
                    <td className="py-3.5 px-3.5 text-right font-mono text-stone-700 text-xs">
                      {monthGrandTotal.targetKg.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="py-3.5 px-3.5 text-right font-mono text-xs">
                      <span className={monthGrandTotal.varianceKg >= 0 ? 'text-emerald-700' : 'text-amber-700'}>
                        {monthGrandTotal.varianceKg >= 0 ? `+${monthGrandTotal.varianceKg.toFixed(2)}` : monthGrandTotal.varianceKg.toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3.5 px-3 text-center text-xs font-black text-emerald-700">
                      {monthGrandTotal.achievementPct}%
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
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
