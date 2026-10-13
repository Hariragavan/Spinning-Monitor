import React, { useMemo } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift, FrozenMonthRecord } from '../types';
import { Calendar, Printer, BarChart3, Coins, Percent, Lock, Unlock, Download, FileSpreadsheet } from 'lucide-react';
import { cn, parseUniversalDateParts } from '../lib/utils';
import { getMonthKey } from '../lib/frozenMonths';
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
  const [metricType, setMetricType] = React.useState<'incentive' | 'utility'>('incentive');

  // Generate days for the selected month
  const gridDays = useMemo(() => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    return Array.from({ length: lastDay }, (_, i) => i + 1);
  }, [selectedMonth, selectedYear]);

  // Find the last day with data/reports in the selected month
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
      // If we are looking at the current month/year, we should show up to today's date (or maxDay if there's somehow a future report)
      return Math.max(maxDay, today.getDate());
    } else {
      // If looking at a past/future month, use maxDay if we have reports, otherwise default to the last day of that month
      if (maxDay > 0) {
        return maxDay;
      } else {
        return new Date(selectedYear, selectedMonth, 0).getDate();
      }
    }
  }, [history, selectedMonth, selectedYear]);

  // TV mode only wants last 10 days of reports to increase readability
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

  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const years = [2025, 2026, 2027];

  // AI Linkconer workers list (from Worker Master or dynamically resolved from active monthly assignments)
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

  // Metric calculation for a single AI worker, day helper
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

        // Compute shift average utility
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

  // Process rows with totals for rendering
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
        total: metricType === 'incentive' ? total : (count > 0 ? total / count : 0)
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

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full overflow-hidden monthly-incentive-grid">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 border-2 border-purple-800 rounded-sm no-print">
        <div className="flex gap-4">
          <select 
            value={selectedMonth}
            onChange={(e) => onMonthChange(Number(e.target.value))}
            className="bg-white border-2 border-purple-800 px-4 py-2 rounded-md font-bold text-purple-900 focus:outline-none"
          >
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select 
            value={selectedYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="bg-white border-2 border-purple-800 px-4 py-2 rounded-md font-bold text-purple-900 focus:outline-none"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex gap-2">
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
                "flex items-center gap-2 px-4 py-2 font-bold rounded-md uppercase text-xs transition-all shadow-md cursor-pointer",
                isFrozen 
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-purple-800 hover:bg-purple-900 text-white"
              )}
            >
              {isFrozen ? <Unlock size={16} /> : <Lock size={16} />}
              {isFrozen ? "Unfreeze Month" : "Freeze Month (Accounts)"}
            </button>
          )}

          {/* Metric Type Switcher */}
          <button
            onClick={() => setMetricType(metricType === 'incentive' ? 'utility' : 'incentive')}
            className="px-4 py-2 bg-purple-100 hover:bg-purple-200 text-purple-900 font-extrabold rounded-md uppercase text-xs flex items-center gap-1.5 transition-colors border border-purple-300"
          >
            {metricType === 'incentive' ? (
              <>
                <Percent size={14} /> Show Utilisation (U%)
              </>
            ) : (
              <>
                <Coins size={14} /> Show Incentives (₹)
              </>
            )}
          </button>

          {!isTvMode && (
            <>
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 text-white font-bold rounded-md uppercase text-xs hover:bg-black transition-all shadow-md cursor-pointer active:scale-95"
              >
                <Printer size={15} />
                Print Report
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
                className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-md uppercase text-xs transition-all shadow-md cursor-pointer active:scale-95"
                title="Download as Excel (.xlsx)"
              >
                <FileSpreadsheet size={15} />
                Export Excel
              </button>
              <button 
                onClick={() => {
                  let csv = `SPINMONITOR AI - AI MONTHLY INCENTIVE GRID (${selectedMonth}/${selectedYear})\n\n`;
                  csv += `TK No,Operator Name,` + displayedDays.map(d => `Day ${d}`).join(',') + `,Total\n`;

                  rowsWithTotals.forEach(row => {
                    const dayValues = displayedDays.map(day => {
                      const val = getAiMetricByDay(day, row.id, row.tNo);
                      return val !== null ? Math.round(val) : '';
                    }).join(',');
                    csv += `"${row.tNo}","${row.name}",${dayValues},${Math.round(row.total)}\n`;
                  });

                  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `AI_Monthly_Grid_${selectedMonth}_${selectedYear}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 font-bold rounded-md uppercase text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                title="Download as CSV"
              >
                <Download size={15} />
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div className="text-center py-4 bg-white border-b-2 border-stone-200 flex flex-col items-center justify-center gap-2">
        {isFrozen && frozenRecord && (
          <div className="w-full max-w-4xl mx-auto my-1 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center gap-2 text-amber-900 text-xs font-bold no-print">
            <Lock size={16} className="text-amber-600" />
            <span>
              🔒 AI Incentive Data Frozen for Accounts Submission (Snapshot saved on {frozenRecord.frozenAt})
            </span>
          </div>
        )}
        <h2 className="text-2xl md:text-3xl font-black text-purple-950 uppercase tracking-tight">
          AI Cone Linkconer Incentive Report — {dataMonthDisplay} {isTvMode && "(Last 10 Days TV View)"}
        </h2>
        <p className="text-xs text-stone-500 font-bold uppercase tracking-widest mt-1">
          Showing {metricType === 'incentive' ? 'Daily Incentives (₹)' : 'Daily Utilisation Average (U%)'}
        </p>
      </div>

      <div className="bg-white overflow-hidden shadow-inner">
        <div className="overflow-x-auto overflow-y-auto max-h-[50vh]">
          <table className={cn("w-full text-center border-collapse table-fixed border border-purple-800", isTvMode ? "min-w-full" : "min-w-[2000px]")}>
            <thead>
              <tr className="bg-purple-50/50 border-b border-purple-800 h-[72px] text-[22px] text-purple-950 uppercase tracking-wider font-extrabold">
                <th className="w-20 px-1 py-1 sticky left-0 z-20 bg-purple-50 border-r border-purple-800 text-[22px]">TK No</th>
                <th className="w-48 px-2 py-1 sticky left-20 z-20 bg-purple-50 border-r border-purple-800 text-left text-[22px]">Name</th>
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
                      "px-0.5 py-1 border-r border-purple-800 hover:bg-purple-100 transition-colors group text-[22px]",
                      !isTvMode && "cursor-pointer"
                    )}
                  >
                    <div className="group-hover:scale-110 group-hover:text-purple-700 transition-all font-black">{day}</div>
                  </th>
                ))}
                <th className="w-28 px-2 py-1 text-purple-950 bg-purple-50 sticky right-0 z-20 border-l border-purple-800 text-[22px]">
                  {metricType === 'incentive' ? 'Total (₹)' : 'Avg (U%)'}
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsWithTotals.map((row) => {
                return (
                  <tr key={row.id} className="border-b border-purple-100 h-14 hover:bg-purple-50/30 transition-colors">
                    <td className="px-1 py-0.5 text-[22px] font-extrabold text-stone-950 sticky left-0 z-10 border-r border-purple-200 bg-white">
                      {row.tNo}
                    </td>
                    <td className="px-2 py-0.5 text-[22px] font-bold text-stone-900 sticky left-20 z-10 border-r border-purple-200 uppercase truncate text-left bg-white">
                      {row.name}
                    </td>
                    {displayedDays.map(day => {
                      const val = getAiMetricByDay(day, row.id, row.tNo);
                      return (
                        <td key={day} className="px-0.5 py-0.5 text-[22px] border-r border-purple-100 tabular-nums text-stone-700 font-semibold">
                          {val !== null ? (
                            metricType === 'incentive' ? (
                              Math.round(val).toLocaleString()
                            ) : (
                              `${Math.round(val)}%`
                            )
                          ) : '-'}
                        </td>
                      );
                    })}
                    <td className="px-2 py-0.5 text-[22px] font-black text-purple-900 bg-purple-50/20 sticky right-0 z-10 border-l border-purple-300 tabular-nums">
                      {row.total > 0 ? (
                        metricType === 'incentive' ? (
                          `₹${Math.round(row.total).toLocaleString()}`
                        ) : (
                          `${Math.round(row.total)}%`
                        )
                      ) : '-'}
                    </td>
                  </tr>
                );
              })}

              {rowsWithTotals.length === 0 && (
                <tr>
                  <td colSpan={displayedDays.length + 3} className="py-12 text-center text-[22px] font-semibold text-stone-400 uppercase tracking-widest">
                    No active AI Linkconer workers found in Master list
                  </td>
                </tr>
              )}

              {/* Total Row */}
              {rowsWithTotals.length > 0 && (
                <tr className="bg-purple-50/40 font-black border-t-2 border-purple-800 h-[72px] text-purple-950">
                  <td colSpan={1} className="sticky left-0 z-10 bg-purple-50 border-r border-purple-800"></td>
                  <td className="px-2 py-1 sticky left-20 z-10 border-r border-purple-800 text-left bg-purple-50 uppercase text-[22px]">
                    Total
                  </td>
                  {displayedDays.map(day => {
                    const values = rowsWithTotals.map(row => getAiMetricByDay(day, row.id, row.tNo)).filter(v => v !== null) as number[];
                    const dayVal = values.length > 0
                      ? (metricType === 'incentive'
                          ? values.reduce((a, b) => a + b, 0)
                          : values.reduce((a, b) => a + b, 0) / values.length)
                      : 0;

                    return (
                      <td key={`total-${day}`} className="px-0.5 py-1 border-r border-purple-800 tabular-nums text-[22px]">
                        {dayVal > 0 ? (
                          metricType === 'incentive' ? (
                            Math.round(dayVal).toLocaleString()
                          ) : (
                            `${Math.round(dayVal)}%`
                          )
                        ) : '-'}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1 text-[22px] font-black text-purple-950 bg-purple-50 sticky right-0 z-20 border-l border-purple-800 tabular-nums">
                    {grandTotalOrAvg > 0 ? (
                      metricType === 'incentive' ? (
                        `₹${Math.round(grandTotalOrAvg).toLocaleString()}`
                      ) : (
                        `Avg: ${Math.round(grandTotalOrAvg)}%`
                      )
                    ) : '-'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Signature Footer Block */}
      <div className="hidden print-signatures">
        <div className="print-signature-box">
          Shift Supervisor
        </div>
        <div className="print-signature-box">
          Accounts Head
        </div>
        <div className="print-signature-box">
          Mill General Manager
        </div>
      </div>
      
      <div className="flex justify-center items-center py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest no-print">
        <span>SpinMonitor AI • AI Cone Linkconer Monthly Incentive Ledger</span>
      </div>
    </div>
  );
};
