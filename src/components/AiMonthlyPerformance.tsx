import React, { useState, useMemo, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift } from '../types';
import { Calendar, User, Printer, Coins, Tv, Monitor, ChevronRight, Activity, Award, Percent, TrendingUp } from 'lucide-react';
import { parseUniversalDateParts, parseUniversalDate, cn } from '../lib/utils';
import { CalendarMonthPicker } from './CalendarPickers';

interface AiMonthlyPerformanceProps {
  history: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  isTvMode?: boolean;
  month?: number;
  year?: number;
}

interface AiPerformanceRow {
  date: string;
  shift: Shift;
  count: string;
  utility: number;
  incentive: number;
}

export const AiMonthlyPerformance: React.FC<AiMonthlyPerformanceProps> = ({
  history,
  workers,
  rules,
  isTvMode: appIsTvMode = false,
  month,
  year
}) => {
  const [localTvMode, setLocalTvMode] = useState<boolean>(false);
  const activeTv = appIsTvMode || localTvMode;

  const today = new Date();
  const currentMonthNum = today.getMonth() + 1;
  const currentYearNum = today.getFullYear();
  
  const [selectedMonth, setSelectedMonth] = useState<number>(month || currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(year || currentYearNum);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');

  useEffect(() => {
    if (month) setSelectedMonth(month);
  }, [month]);

  useEffect(() => {
    if (year) setSelectedYear(year);
  }, [year]);

  const { fromDate, toDate } = useMemo(() => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    return {
      fromDate: `${selectedYear}-${pad(selectedMonth)}-${pad(firstDay.getDate())}`,
      toDate: `${selectedYear}-${pad(selectedMonth)}-${pad(lastDay.getDate())}`
    };
  }, [selectedMonth, selectedYear]);

  const monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const getWorkerMonthlyLedger = (workerId: string) => {
    const targetWorker = workers.find(w => w.id === workerId || w.tNo === workerId);
    if (!targetWorker) return { rows: [], total: 0 };

    const rows: AiPerformanceRow[] = [];

    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;

      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;

      if (rDateStr < fromDate || rDateStr > toDate) return;

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
          const shiftEntries = report.entries.filter(e => e.shift === shift);
          const utilEntries = shiftEntries.filter(e => typeof e.utility === 'number' && !isNaN(e.utility) && e.utility > 0);
          const avgUtility = utilEntries.length > 0
            ? utilEntries.reduce((acc, curr) => acc + curr.utility, 0) / utilEntries.length
            : 0;

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

          rows.push({
            date: report.date,
            shift,
            count: shiftEntries[0]?.count || 'Mixed',
            utility: avgUtility,
            incentive
          });
        }
      });
    });

    const sortedRows = rows.sort((a, b) => {
      const timeA = parseUniversalDate(a.date).getTime();
      const timeB = parseUniversalDate(b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const shiftOrder: Record<Shift, number> = { 'I': 1, 'II': 2, 'III': 3 };
      return shiftOrder[a.shift] - shiftOrder[b.shift];
    });

    const total = sortedRows.reduce((acc, curr) => acc + curr.incentive, 0);
    return { rows: sortedRows, total };
  };

  const activeWorkersWithData = useMemo(() => {
    const aiWorkers = workers.filter(w => w.department === 'AI Linkconer');
    const dynamicAssignedIds = new Set<string>();

    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;
      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;

      if (rDateStr >= fromDate && rDateStr <= toDate) {
        (['I', 'II', 'III'] as Shift[]).forEach(s => {
          (report.aiCones?.[s] || []).forEach(id => {
            if (id) dynamicAssignedIds.add(String(id).toLowerCase().trim());
          });
        });
      }
    });

    const candidates = [...aiWorkers];
    workers.forEach(w => {
      if (dynamicAssignedIds.has(w.id.toLowerCase().trim()) || dynamicAssignedIds.has(w.tNo.toLowerCase().trim())) {
        if (!candidates.some(c => c.id === w.id)) {
          candidates.push(w);
        }
      }
    });

    const results = candidates.map(worker => {
      const { rows, total } = getWorkerMonthlyLedger(worker.id);
      return {
        worker,
        rows,
        total,
        workingDays: rows.length
      };
    }).filter(d => d.workingDays > 0);

    return results.sort((a, b) => b.total - a.total);
  }, [workers, history, fromDate, toDate, rules]);

  useEffect(() => {
    if (activeWorkersWithData.length > 0 && !selectedWorkerId) {
      setSelectedWorkerId(activeWorkersWithData[0].worker.id);
    }
  }, [activeWorkersWithData, selectedWorkerId]);

  const activeWorkerData = useMemo(() => {
    if (!selectedWorkerId) return null;
    return activeWorkersWithData.find(d => d.worker.id === selectedWorkerId || d.worker.tNo === selectedWorkerId) || null;
  }, [selectedWorkerId, activeWorkersWithData]);

  // TV mode rotating index
  const [tvWorkerIndex, setTvWorkerIndex] = useState(0);
  useEffect(() => {
    if (!activeTv || activeWorkersWithData.length === 0) return;
    const interval = setInterval(() => {
      setTvWorkerIndex(prev => (prev + 1) % activeWorkersWithData.length);
    }, 15000);
    return () => clearInterval(interval);
  }, [activeTv, activeWorkersWithData.length]);

  const currentTvWorker = activeWorkersWithData[tvWorkerIndex] || null;

  const averageUtility = useMemo(() => {
    if (!activeWorkerData || activeWorkerData.rows.length === 0) return 0;
    const sum = activeWorkerData.rows.reduce((acc, r) => acc + r.utility, 0);
    return Math.round(sum / activeWorkerData.rows.length);
  }, [activeWorkerData]);

  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* FILTER TOOLS PANEL */}
      {!activeTv && (
        <div className="bg-white rounded-2xl border border-stone-200/90 p-4 md:p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4 no-print">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <CalendarMonthPicker
              month={selectedMonth}
              year={selectedYear}
              onChange={(m, y) => {
                setSelectedMonth(m);
                setSelectedYear(y);
                setSelectedWorkerId('');
              }}
            />

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">Operator:</span>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="px-3 py-1.5 border border-stone-200 rounded-xl font-bold text-stone-800 text-xs bg-stone-50 outline-none cursor-pointer focus:border-purple-500 transition-colors max-w-[260px] truncate"
              >
                {activeWorkersWithData.length === 0 ? (
                  <option value="">No active AI Linkconer duties</option>
                ) : (
                  activeWorkersWithData.map(d => (
                    <option key={d.worker.id} value={d.worker.id}>
                      [{d.worker.tNo}] {d.worker.name.toUpperCase()} ({d.workingDays} Duties — ₹{Math.round(d.total).toLocaleString()})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={() => setLocalTvMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold border border-stone-200 cursor-pointer transition-all"
            >
              <Monitor size={13} />
              <span>Full Screen</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Printer size={13} />
              <span>Print Ledger</span>
            </button>
          </div>
        </div>
      )}

      {/* TV VIEW */}
      {activeTv && currentTvWorker ? (
        <div className="bg-white text-stone-900 rounded-3xl p-8 border border-stone-200 shadow-xs animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-stone-200 pb-6 mb-6 gap-4">
            <div className="flex items-center gap-5">
              {currentTvWorker.worker.photoUrl ? (
                <img 
                  src={currentTvWorker.worker.photoUrl} 
                  alt={currentTvWorker.worker.name} 
                  className="w-24 h-24 rounded-2xl object-cover border-2 border-purple-200 shadow-sm shrink-0" 
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 font-serif italic text-4xl font-black shrink-0 shadow-inner">
                  {currentTvWorker.worker.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="bg-purple-100 text-purple-900 font-extrabold text-xs uppercase tracking-widest px-3 py-1 rounded-full border border-purple-200">
                    AI Linkconer Performance Slide
                  </span>
                  <span className="bg-stone-900 text-white font-extrabold text-xs uppercase tracking-wider px-2.5 py-1 rounded-lg">
                    Ticket #{currentTvWorker.worker.tNo}
                  </span>
                </div>
                <h2 className="text-3xl md:text-4xl font-black uppercase tracking-tight text-stone-900">
                  {currentTvWorker.worker.name}
                </h2>
              </div>
            </div>
            
            <div className="flex items-center gap-6">
              <div className="bg-stone-50 border border-stone-200 px-5 py-3 rounded-2xl text-center">
                <p className="text-xs text-stone-400 uppercase font-black tracking-wider">Duties Logged</p>
                <p className="text-2xl font-black text-stone-900">{currentTvWorker.workingDays}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 px-6 py-3 rounded-2xl text-center">
                <p className="text-xs text-emerald-700 uppercase font-black tracking-wider">Total Earnings</p>
                <p className="text-3xl md:text-4xl font-black text-emerald-800 font-mono">
                  ₹{Math.round(currentTvWorker.total).toLocaleString()}
                </p>
              </div>
              {localTvMode && (
                <button
                  onClick={() => setLocalTvMode(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold border border-stone-200"
                >
                  Exit TV
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-stone-100 text-stone-700 uppercase tracking-wider h-12 text-base font-black border-b border-stone-200">
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3 text-center">Shift</th>
                  <th className="px-5 py-3 text-center">Utilisation</th>
                  <th className="px-5 py-3 text-right">Incentive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 text-lg md:text-xl font-bold">
                {currentTvWorker.rows.map((row, idx) => (
                  <tr key={idx} className="h-12 hover:bg-purple-50/30 transition-colors">
                    <td className="px-5 py-3 font-black text-stone-900">{row.date}</td>
                    <td className="px-5 py-3 text-center font-bold text-stone-600">{row.shift}</td>
                    <td className="px-5 py-3 text-center font-bold text-blue-700">{Math.round(row.utility)}%</td>
                    <td className="px-5 py-3 text-right font-black text-emerald-800 font-mono">₹{Math.round(row.incentive).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {/* STANDARD APP VIEW */}
      {!activeTv && (
        <div>
          {!activeWorkerData ? (
            <div className="flex flex-col items-center justify-center p-16 bg-white border border-stone-200/90 rounded-2xl text-center shadow-xs">
              <User size={40} className="text-stone-300 mb-2" />
              <h3 className="text-sm font-black uppercase text-stone-700">No Operator Duties Recorded</h3>
              <p className="text-stone-400 text-xs mt-1 uppercase">
                Select another month or worker from the filters above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
              {/* Profile Card */}
              <div className="lg:col-span-1 bg-white rounded-2xl border border-stone-200/90 p-5 shadow-xs flex flex-col items-center text-center">
                {activeWorkerData.worker.photoUrl ? (
                  <img 
                    src={activeWorkerData.worker.photoUrl} 
                    alt={activeWorkerData.worker.name}
                    className="w-28 h-28 rounded-2xl object-cover border-2 border-stone-200 shadow-sm mb-3"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-2xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700 font-serif italic text-4xl font-black mb-3 shadow-2xs">
                    {activeWorkerData.worker.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <span className="px-2.5 py-0.5 rounded-full bg-purple-100 text-purple-900 text-[10px] font-black uppercase tracking-wider">
                  Ticket #{activeWorkerData.worker.tNo}
                </span>

                <h3 className="text-lg font-black text-stone-900 uppercase mt-2 tracking-tight">
                  {activeWorkerData.worker.name}
                </h3>
                <p className="text-[10px] font-black uppercase text-stone-400 tracking-wider">AI Linkconer Operator</p>

                <div className="w-full grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-stone-100">
                  <div className="p-2 rounded-xl bg-stone-50 text-center">
                    <p className="text-[9px] font-black uppercase text-stone-400">Duties</p>
                    <p className="text-base font-black text-stone-900 mt-0.5">{activeWorkerData.workingDays}</p>
                  </div>
                  <div className="p-2 rounded-xl bg-blue-50 text-center">
                    <p className="text-[9px] font-black uppercase text-blue-500">Avg U%</p>
                    <p className="text-base font-black text-blue-900 mt-0.5">{averageUtility}%</p>
                  </div>
                  <div className="p-2 rounded-xl bg-emerald-50 text-center">
                    <p className="text-[9px] font-black uppercase text-emerald-600">Total ₹</p>
                    <p className="text-base font-black text-emerald-950 mt-0.5">₹{Math.round(activeWorkerData.total).toLocaleString()}</p>
                  </div>
                </div>
              </div>

              {/* Duty Ledger Details */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden">
                <div className="p-4 border-b border-stone-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-tight text-stone-900 flex items-center gap-1.5">
                      <Activity size={14} className="text-purple-600" />
                      <span>Monthly Duties Log</span>
                    </h3>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider mt-0.5">
                      Showing {activeWorkerData.rows.length} shifts worked
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-[55vh]">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-stone-50 text-stone-600 uppercase tracking-wider font-black text-[10px] border-b border-stone-200 h-9 sticky top-0 z-10">
                        <th className="px-3 py-1">Date</th>
                        <th className="px-3 py-1 text-center">Shift</th>
                        <th className="px-3 py-1 text-center">Shift Count</th>
                        <th className="px-3 py-1 text-center">Shift Utilisation</th>
                        <th className="px-4 py-1 text-right">Incentive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {activeWorkerData.rows.map((row, idx) => {
                        const isLowUtility = Math.round(row.utility) < 94;
                        return (
                          <tr key={idx} className="hover:bg-purple-50/20 transition-colors h-9">
                            <td className="px-3 py-1 font-bold text-stone-900 flex items-center gap-1">
                              <ChevronRight size={13} className="text-purple-600 shrink-0" />
                              {row.date}
                            </td>
                            <td className="px-3 py-1 text-center font-bold text-stone-600">{row.shift}</td>
                            <td className="px-3 py-1 text-center font-bold text-stone-500">{row.count}</td>
                            <td className={cn(
                              "px-3 py-1 text-center font-bold tabular-nums",
                              isLowUtility ? "text-rose-600" : "text-blue-700"
                            )}>
                              {Math.round(row.utility)}%
                            </td>
                            <td className="px-4 py-1 text-right font-black text-stone-900 font-mono tabular-nums">
                              ₹{Math.round(row.incentive).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-stone-50 font-black border-t-2 border-stone-200 h-10 sticky bottom-0 z-10">
                        <td colSpan={4} className="px-4 py-2 text-right uppercase tracking-wider text-stone-700 text-xs font-black">
                          Total Payout for Month:
                        </td>
                        <td className="px-4 py-2 text-right font-black text-emerald-950 text-sm tabular-nums">
                          ₹{Math.round(activeWorkerData.total).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
