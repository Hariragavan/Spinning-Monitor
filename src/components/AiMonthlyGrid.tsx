import React, { useMemo, useState } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift, FrozenMonthRecord } from '../types';
import { Calendar, Printer, BarChart3, Coins, Percent, Lock, Unlock, Download, FileSpreadsheet, Sparkles, Users, Award } from 'lucide-react';
import { cn, parseUniversalDateParts } from '../lib/utils';
import { getMonthKey } from '../lib/frozenMonths';
import { CalendarMonthPicker } from './CalendarPickers';
import * as XLSX from 'xlsx';

interface AiMonthlyGridProps {
  history: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  selectedMonth: number;
  selectedYear: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  onEditDate?: (date: string) => void;
  isTvMode?: boolean;
  frozenMonths?: Record<string, FrozenMonthRecord>;
  onToggleFreezeMonth?: (month: number, year: number) => void;
}

export const AiMonthlyGrid: React.FC<AiMonthlyGridProps> = ({
  history,
  workers,
  rules,
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
  onEditDate,
  isTvMode = false,
  frozenMonths,
  onToggleFreezeMonth
}) => {
  const monthKey = getMonthKey(selectedMonth, selectedYear);
  const frozenRecord = frozenMonths?.[monthKey];
  const isFrozen = !!frozenRecord;
  const [metricType, setMetricType] = useState<'incentive' | 'utility'>('incentive');

  // Days for the selected month
  const gridDays = useMemo(() => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    return Array.from({ length: lastDay }, (_, i) => i + 1);
  }, [selectedMonth, selectedYear]);

  // Last active day with reports
  const lastActiveDay = useMemo(() => {
    let maxDay = 0;
    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (parts && parts.month === selectedMonth && parts.year === selectedYear) {
        if (parts.day > maxDay) maxDay = parts.day;
      }
    });

    const today = new Date();
    const isCurrentMonthYear = today.getMonth() + 1 === selectedMonth && today.getFullYear() === selectedYear;

    if (isCurrentMonthYear) {
      return Math.max(maxDay, today.getDate());
    } else {
      return maxDay > 0 ? maxDay : new Date(selectedYear, selectedMonth, 0).getDate();
    }
  }, [history, selectedMonth, selectedYear]);

  const displayedDays = useMemo(() => {
    if (isTvMode) {
      const start = Math.max(1, lastActiveDay - 9);
      const days: number[] = [];
      for (let d = start; d <= lastActiveDay; d++) {
        days.push(d);
      }
      return days;
    }
    return gridDays;
  }, [isTvMode, gridDays, lastActiveDay]);

  const dataMonthDisplay = useMemo(() => {
    return new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [selectedMonth, selectedYear]);

  // AI Linkconer workers list
  const aiWorkers = useMemo(() => {
    const masterAi = workers.filter(w => w.department === 'AI Linkconer');
    const assignedIds = new Set<string>();

    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (parts && parts.month === selectedMonth && parts.year === selectedYear) {
        const shifts: Shift[] = ['I', 'II', 'III'];
        shifts.forEach(shift => {
          const shiftAiConeIds = report.aiCones?.[shift] || [];
          shiftAiConeIds.forEach(id => {
            if (id) assignedIds.add(String(id).toLowerCase().trim());
          });
        });
      }
    });

    const assignedWorkers = workers.filter(w => 
      assignedIds.has(w.id.toLowerCase().trim()) || 
      assignedIds.has(w.tNo.toLowerCase().trim())
    );

    const combined = [...masterAi];
    assignedWorkers.forEach(aw => {
      if (!combined.some(w => w.id === aw.id)) {
        combined.push(aw);
      }
    });

    return combined.sort((a, b) => {
      const aNum = parseInt(a.tNo);
      const bNum = parseInt(b.tNo);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.name.localeCompare(b.name);
    });
  }, [workers, history, selectedMonth, selectedYear]);

  // Metric calculation for a single AI worker
  const getAiMetricByDay = (day: number, workerId: string, tNo: string) => {
    const targetWorker = workers.find(w => w.id === workerId || w.tNo === workerId);
    if (!targetWorker) return null;

    const dateStr = `${day.toString().padStart(2, '0')}/${selectedMonth.toString().padStart(2, '0')}/${selectedYear}`;
    const report = history.find(r => r.date === dateStr);
    if (!report) return null;

    let totalIncentive = 0;
    let totalUtility = 0;
    let workedShiftsCount = 0;
    let hasData = false;

    const shifts: Shift[] = ['I', 'II', 'III'];
    shifts.forEach(shift => {
      const shiftAiConeIds = report.aiCones?.[shift] || [];
      const isMatched = shiftAiConeIds.some(idOrName => {
        if (!idOrName) return false;
        const normalizedVal = String(idOrName).toLowerCase().trim();
        return normalizedVal === targetWorker.id.toLowerCase().trim() ||
               normalizedVal === targetWorker.tNo.toLowerCase().trim() ||
               normalizedVal === targetWorker.name.toLowerCase().trim();
      });

      if (isMatched) {
        hasData = true;
        workedShiftsCount++;

        const shiftEntries = report.entries.filter(e => e.shift === shift);
        const aiFrameNos = ['K01', 'K02', 'K03', 'K04', 'K05', 'K06', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
        const utilEntries = shiftEntries.filter(e => {
          const normalizedFrame = (e.frameNo || '').toUpperCase().trim().replace(/[\s-]/g, '');
          const isAiFrame = aiFrameNos.some(f => f.toUpperCase().replace(/[\s-]/g, '') === normalizedFrame);
          return isAiFrame && typeof e.utility === 'number' && !isNaN(e.utility);
        });
        const avgUtility = utilEntries.length > 0
          ? utilEntries.reduce((acc, curr) => acc + curr.utility, 0) / utilEntries.length
          : 0;

        totalUtility += avgUtility;

        // Compute incentive
        const aiRules = rules.filter(r => r.department === 'AI Linkconer');
        let matchedRule = aiRules.find(r =>
          shiftEntries.some(e => {
            const rNorm = r.count.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
            const eNorm = (e.count || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
            return rNorm && eNorm && (rNorm.startsWith(eNorm) || eNorm.startsWith(rNorm));
          })
        );
        if (!matchedRule) {
          matchedRule = aiRules[0];
        }

        let incentive = 0;
        if (matchedRule) {
          const sortedPayouts = [...matchedRule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
          const bestPayout = sortedPayouts.find(p => Math.round(avgUtility) >= p.gpsThreshold);
          incentive = bestPayout ? bestPayout.amount : 0;
        }

        totalIncentive += incentive;
      }
    });

    if (!hasData) return null;

    if (metricType === 'incentive') {
      if (isFrozen && frozenRecord && frozenRecord.dailyWorkerIncentives?.[dateStr]) {
        const key = targetWorker.tNo || targetWorker.id;
        if (key && frozenRecord.dailyWorkerIncentives[dateStr][key] !== undefined) {
          return frozenRecord.dailyWorkerIncentives[dateStr][key];
        }
      }
      return totalIncentive;
    } else {
      return workedShiftsCount > 0 ? totalUtility / workedShiftsCount : 0;
    }
  };

  // Process rows with totals
  const rowsWithTotals = useMemo(() => {
    const mapped = aiWorkers.map(row => {
      let total = 0;
      let count = 0;
      displayedDays.forEach(day => {
        const val = getAiMetricByDay(day, row.id, row.tNo);
        if (val !== null) {
          total += val;
          count++;
        }
      });
      return {
        ...row,
        total: metricType === 'incentive' ? total : (count > 0 ? total / count : 0),
        activeDuties: count
      };
    });

    if (isTvMode) {
      return mapped.sort((a, b) => b.total - a.total);
    }
    return mapped;
  }, [aiWorkers, displayedDays, history, selectedMonth, selectedYear, isTvMode, metricType, rules]);

  const grandTotalOrAvg = useMemo(() => {
    if (rowsWithTotals.length === 0) return 0;
    const values = rowsWithTotals.map(r => r.total).filter(v => v > 0);
    if (metricType === 'incentive') {
      return rowsWithTotals.reduce((acc, row) => acc + row.total, 0);
    } else {
      return values.length > 0 ? values.reduce((acc, curr) => acc + curr, 0) / values.length : 0;
    }
  }, [rowsWithTotals, metricType]);

  const topPerformer = useMemo(() => {
    if (rowsWithTotals.length === 0) return null;
    const sorted = [...rowsWithTotals].sort((a, b) => b.total - a.total);
    return sorted[0]?.total > 0 ? sorted[0] : null;
  }, [rowsWithTotals]);

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-3 duration-500 w-full overflow-hidden">
      {/* Top Controls Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-white p-4 rounded-2xl border border-stone-200/90 shadow-xs no-print">
        <div className="flex flex-wrap items-center gap-3">
          <CalendarMonthPicker
            month={selectedMonth}
            year={selectedYear}
            onChange={(m, y) => {
              onMonthChange(m);
              onYearChange(y);
            }}
          />

          {/* Metric Type Switcher */}
          <button
            onClick={() => setMetricType(metricType === 'incentive' ? 'utility' : 'incentive')}
            className={cn(
              "px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer border",
              metricType === 'incentive'
                ? "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                : "bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100"
            )}
          >
            {metricType === 'incentive' ? (
              <>
                <Percent size={13} />
                <span>Show Utilisation %</span>
              </>
            ) : (
              <>
                <Coins size={13} />
                <span>Show Incentives ₹</span>
              </>
            )}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isTvMode && (
            <button
              onClick={() => {
                if (isFrozen) {
                  if (confirm(`Unfreeze AI incentives for ${dataMonthDisplay}? Live calculations will resume.`)) {
                    onToggleFreezeMonth?.(selectedMonth, selectedYear);
                  }
                } else {
                  if (confirm(`Freeze AI incentives for ${dataMonthDisplay}? This locks payout figures for Accounts.`)) {
                    onToggleFreezeMonth?.(selectedMonth, selectedYear);
                  }
                }
              }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 font-bold rounded-xl uppercase text-xs transition-all shadow-xs cursor-pointer border",
                isFrozen 
                  ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-600"
                  : "bg-stone-100 hover:bg-stone-200 text-stone-700 border-stone-200"
              )}
            >
              {isFrozen ? <Unlock size={14} /> : <Lock size={14} />}
              <span>{isFrozen ? "Unfreeze" : "Freeze Accounts"}</span>
            </button>
          )}

          {!isTvMode && (
            <>
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-900 text-white font-bold rounded-xl uppercase text-xs hover:bg-black transition-all shadow-xs cursor-pointer active:scale-95"
              >
                <Printer size={14} />
                <span>Print</span>
              </button>

              <button 
                onClick={() => {
                  const wb = XLSX.utils.book_new();
                  const rows = rowsWithTotals.map(row => {
                    const obj: any = {
                      'TK No': row.tNo,
                      'Operator Name': row.name
                    };
                    displayedDays.forEach(day => {
                      const val = getAiMetricByDay(day, row.id, row.tNo);
                      obj[`Day ${day}`] = val !== null ? Math.round(val) : '';
                    });
                    obj[metricType === 'incentive' ? 'Total (INR)' : 'Avg (U%)'] = Math.round(row.total);
                    return obj;
                  });

                  const ws = XLSX.utils.json_to_sheet(rows);
                  XLSX.utils.book_append_sheet(wb, ws, 'AI Monthly Grid');
                  XLSX.writeFile(wb, `AI_Monthly_Grid_${selectedMonth}_${selectedYear}.xlsx`);
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold rounded-xl uppercase text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                title="Download as Excel"
              >
                <FileSpreadsheet size={14} />
                <span>Export Excel</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 no-print">
        <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Users size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 leading-none">Active Personnel</p>
            <p className="text-lg font-black text-stone-900 tabular-nums mt-0.5">{aiWorkers.length}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Coins size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 leading-none">
              {metricType === 'incentive' ? 'Total AI Payout' : 'Average Utility'}
            </p>
            <p className="text-lg font-black text-stone-900 tabular-nums mt-0.5">
              {metricType === 'incentive' ? `₹${Math.round(grandTotalOrAvg).toLocaleString()}` : `${Math.round(grandTotalOrAvg)}%`}
            </p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <BarChart3 size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 leading-none">Selected Month</p>
            <p className="text-xs font-black text-stone-900 uppercase tracking-tight mt-0.5">{dataMonthDisplay}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Award size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 leading-none">Top Performer</p>
            <p className="text-xs font-black text-stone-900 truncate mt-0.5">
              {topPerformer ? `${topPerformer.name} (₹${Math.round(topPerformer.total).toLocaleString()})` : 'None'}
            </p>
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
        {/* Card Header */}
        <div className="p-4 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
              <h3 className="text-sm font-black text-stone-900 uppercase tracking-tight">
                AI Cone Linkconer Incentive Ledger
              </h3>
            </div>
            <p className="text-[11px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
              {dataMonthDisplay} • Showing {metricType === 'incentive' ? 'Daily Incentives (₹)' : 'Daily Utilisation Average (U%)'}
            </p>
          </div>
          {isFrozen && frozenRecord && (
            <div className="px-3 py-1 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto">
              <Lock size={12} className="text-amber-600" />
              <span>Locked for Accounts</span>
            </div>
          )}
        </div>

        {/* Scrollable Table */}
        <div className="overflow-x-auto overflow-y-auto max-h-[65vh]">
          <table className="w-full text-center border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-black uppercase tracking-wider text-[11px] h-10 sticky top-0 z-30">
                <th className="w-16 px-2 py-1 sticky left-0 z-40 bg-stone-50 border-r border-stone-200">TK No</th>
                <th className="w-40 px-3 py-1 sticky left-16 z-40 bg-stone-50 border-r border-stone-200 text-left">Operator Name</th>
                {displayedDays.map(day => (
                  <th 
                    key={day} 
                    onClick={() => {
                      if (!isTvMode) {
                        const dateStr = `${day.toString().padStart(2, '0')}/${selectedMonth.toString().padStart(2, '0')}/${selectedYear}`;
                        onEditDate?.(dateStr);
                      }
                    }}
                    className={cn(
                      "px-1.5 py-1 border-r border-stone-200/80 hover:bg-stone-100 transition-colors w-12",
                      !isTvMode && "cursor-pointer"
                    )}
                    title={!isTvMode ? `Jump to ${day}/${selectedMonth}/${selectedYear}` : undefined}
                  >
                    <span className="hover:text-emerald-700 transition-colors">{day}</span>
                  </th>
                ))}
                <th className="w-24 px-3 py-1 text-stone-900 bg-stone-100/90 sticky right-0 z-40 border-l border-stone-200 font-black">
                  {metricType === 'incentive' ? 'Total (₹)' : 'Avg (U%)'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rowsWithTotals.map((row) => (
                <tr key={row.id} className="hover:bg-purple-50/20 transition-colors h-9">
                  <td className="px-2 py-1 text-xs font-black text-stone-900 sticky left-0 z-20 border-r border-stone-200 bg-white">
                    {row.tNo}
                  </td>
                  <td className="px-3 py-1 text-xs font-bold text-stone-800 sticky left-16 z-20 border-r border-stone-200 uppercase truncate text-left bg-white">
                    {row.name}
                  </td>
                  {displayedDays.map(day => {
                    const val = getAiMetricByDay(day, row.id, row.tNo);
                    return (
                      <td key={day} className="px-1 py-1 border-r border-stone-100 tabular-nums text-stone-600 font-semibold text-xs">
                        {val !== null ? (
                          metricType === 'incentive' ? (
                            <span className="font-bold text-stone-900">{Math.round(val).toLocaleString()}</span>
                          ) : (
                            <span className="text-blue-700 font-bold">{Math.round(val)}%</span>
                          )
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1 font-black tabular-nums text-right bg-stone-50/70 sticky right-0 z-20 border-l border-stone-200 text-stone-900">
                    {metricType === 'incentive' ? `₹${Math.round(row.total).toLocaleString()}` : `${Math.round(row.total)}%`}
                  </td>
                </tr>
              ))}

              {rowsWithTotals.length === 0 && (
                <tr>
                  <td colSpan={displayedDays.length + 3} className="py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                    No active AI Linkconer duties recorded for {dataMonthDisplay}
                  </td>
                </tr>
              )}
            </tbody>
            {rowsWithTotals.length > 0 && (
              <tfoot>
                <tr className="bg-stone-50 font-black border-t-2 border-stone-200 h-10 sticky bottom-0 z-30">
                  <td className="sticky left-0 z-40 bg-stone-50 border-r border-stone-200"></td>
                  <td className="sticky left-16 z-40 bg-stone-50 px-3 py-1 text-left uppercase tracking-wider text-xs font-black text-stone-900 border-r border-stone-200">
                    Consolidated Total
                  </td>
                  <td colSpan={displayedDays.length} className="border-r border-stone-200"></td>
                  <td className="px-3 py-1 text-right text-xs font-black text-stone-950 bg-stone-100 sticky right-0 z-40 border-l border-stone-200 tabular-nums">
                    {metricType === 'incentive' ? `₹${Math.round(grandTotalOrAvg).toLocaleString()}` : `${Math.round(grandTotalOrAvg)}%`}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
