import React, { useMemo, useState, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, MachineEmData } from '../types';
import { Trophy, ArrowDown, ArrowUp, AlertTriangle, HelpCircle, Users, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { cn, resolveWorker, parseUniversalDateParts } from '../lib/utils';

interface EmOutliersCompareProps {
  history: DailyReport[];
  workers: Sider[];
  machineEm?: MachineEmData;
  isTvMode?: boolean;
  month?: number;
  year?: number;
}

const monthsList = [
  { value: 1, label: 'January' },
  { value: 2, label: 'February' },
  { value: 3, label: 'March' },
  { value: 4, label: 'April' },
  { value: 5, label: 'May' },
  { value: 6, label: 'June' },
  { value: 7, label: 'July' },
  { value: 8, label: 'August' },
  { value: 9, label: 'September' },
  { value: 10, label: 'October' },
  { value: 11, label: 'November' },
  { value: 12, label: 'December' }
];

const yearsList = [2024, 2025, 2026, 2027, 2028, 2029, 2030];

interface OperatorEmStats {
  id: string;
  name: string;
  tNo: string;
  averageEm: number;
  dutiesCount: number;
  emDutiesCount: number;
  photoUrl?: string;
}

export const EmOutliersCompare: React.FC<EmOutliersCompareProps> = ({
  history,
  workers,
  machineEm,
  isTvMode = false,
  month,
  year
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(month || (new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<number>(year || new Date().getFullYear());

  useEffect(() => {
    if (month && month > 0) setSelectedMonth(month);
  }, [month]);

  useEffect(() => {
    if (year && year > 0) setSelectedYear(year);
  }, [year]);

  const { topFive, bottomFive } = useMemo(() => {
    const totals = new Map<string, { 
      id: string; 
      name: string; 
      tNo: string; 
      dutiesCount: number; 
      emSum: number;
      emCount: number;
      photoUrl?: string;
    }>();

    // Initialize with active workers
    workers.forEach(w => {
      totals.set(w.tNo || w.id, { 
        id: w.id, 
        name: w.name, 
        tNo: w.tNo, 
        dutiesCount: 0, 
        emSum: 0,
        emCount: 0,
        photoUrl: w.photoUrl
      });
    });

    const filteredHistory = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (parts) {
        return parts.month === selectedMonth && parts.year === selectedYear;
      }
      return false;
    });

    filteredHistory.forEach(report => {
      if (!report || !report.entries) return;
      
      report.entries.forEach(entry => {
        const assignedIds = new Set<string>();
        if (entry.siderId) assignedIds.add(entry.siderId);
        if (entry.siderIds) {
          entry.siderIds.forEach(id => {
            if (id) assignedIds.add(id);
          });
        }

        if (assignedIds.size === 0) {
          const fallbackTNo = entry.siderName?.split(' ')[0] || (entry.siderName ? entry.siderName.substring(0, 5) : null);
          if (fallbackTNo) assignedIds.add(fallbackTNo);
        }

        const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;
        let emVal = machineEm?.[report.date]?.[entry.frameNo]?.[shiftNum];
        if (emVal === undefined) {
          emVal = entry.doffEmt || 0;
        }

        assignedIds.forEach(idVal => {
          const worker = resolveWorker(idVal, entry.siderName, workers);
          const tNo = worker.tNo || worker.id;
          if (!tNo) return;

          if (totals.has(tNo)) {
            const current = totals.get(tNo)!;
            current.dutiesCount += 1;
            if (emVal && emVal > 0) {
              current.emSum += emVal;
              current.emCount += 1;
            }
            if ((current.name === tNo || current.name === 'Unknown Worker' || current.name === 'Unregistered') && worker.name) {
              current.name = worker.name;
            }
          } else {
            totals.set(tNo, {
              id: worker.id,
              name: worker.name,
              tNo: tNo,
              dutiesCount: 1,
              emSum: (emVal && emVal > 0) ? emVal : 0,
              emCount: (emVal && emVal > 0) ? 1 : 0,
              photoUrl: worker.photoUrl
            });
          }
        });
      });
    });

    const list: OperatorEmStats[] = Array.from(totals.values())
      .filter(t => t.emCount > 1) // Exclude workers working only 1 day with EM data to prevent 1-day bias
      .map(t => ({
        id: t.id,
        name: t.name,
        tNo: t.tNo,
        averageEm: t.emSum / t.emCount,
        dutiesCount: t.dutiesCount,
        emDutiesCount: t.emCount,
        photoUrl: t.photoUrl
      }))
      .filter(t => t.averageEm > 0);

    // LOWER EM IS BETTER
    // Top 5 have the lowest average EM
    const sortedBest = [...list].sort((a, b) => a.averageEm - b.averageEm);
    const topFive = sortedBest.slice(0, 5);

    // Bottom 5 have the highest average EM
    const sortedWorst = [...list].sort((a, b) => b.averageEm - a.averageEm);
    const bottomFive = sortedWorst.slice(0, 5);

    return { topFive, bottomFive };
  }, [history, workers, machineEm, selectedMonth, selectedYear]);

  const reportMonthYear = useMemo(() => {
    const monthObj = monthsList.find(m => m.value === selectedMonth);
    return `${monthObj ? monthObj.label : 'July'} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  return (
    <div className={cn(
      "mx-auto animate-in fade-in duration-700",
      isTvMode ? "w-full max-w-full px-8 flex flex-col justify-between h-[calc(100vh-140px)] select-none overflow-hidden bg-white text-stone-900 p-6" : "max-w-7xl px-4 space-y-6 pb-12 text-stone-900"
    )}>
      
      {/* Header Section */}
      <div className={cn("text-center", isTvMode ? "mb-6" : "mb-6 space-y-2")}>
        <div className={cn(
          "inline-flex items-center gap-3 rounded-full font-black uppercase shadow-sm border",
          isTvMode 
            ? "px-10 py-3 text-xl tracking-[0.25em] bg-blue-50 text-blue-800 border-blue-300" 
            : "px-6 py-2 text-[10px] tracking-[0.3em] bg-blue-100 text-blue-700 border-blue-200"
        )}>
          <Users size={20} className="text-blue-500" />
          EM Outliers Analysis Dashboard
        </div>
        <h2 className={cn("font-black tracking-tighter uppercase leading-none text-stone-900", isTvMode ? "text-7xl my-4" : "text-5xl")}>
          EM Performance Outliers <span className="text-blue-600">Of {reportMonthYear}</span>
        </h2>
        <p className={cn("font-extrabold uppercase tracking-[0.4em] text-stone-500", isTvMode ? "text-xl mt-3" : "text-[10px]")}>
          Side-By-Side Comparison • Lower EM is Better (Excludes 1-Day Workers)
        </p>
      </div>

      {/* Selectors for Normal View */}
      {!isTvMode && (
        <div className="flex flex-wrap justify-center gap-6 bg-stone-50 border border-stone-200 rounded-[2rem] p-5 max-w-xl mx-auto shadow-inner">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-stone-500 uppercase tracking-wider">Select Month:</span>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="appearance-none bg-white border border-stone-300 rounded-xl pl-4 pr-10 py-2.5 text-xs font-black text-stone-800 uppercase tracking-wider focus:outline-none cursor-pointer shadow-sm"
              >
                {monthsList.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" size={14} />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-stone-500 uppercase tracking-wider">Select Year:</span>
            <div className="relative">
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="appearance-none bg-white border border-stone-300 rounded-xl pl-4 pr-10 py-2.5 text-xs font-black text-stone-800 focus:outline-none cursor-pointer shadow-sm"
              >
                {yearsList.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 pointer-events-none" size={14} />
            </div>
          </div>
        </div>
      )}

      {topFive.length === 0 && bottomFive.length === 0 ? (
        <div className={cn(
          "flex flex-col items-center justify-center py-24 rounded-[3rem] border max-w-3xl mx-auto bg-white border-stone-200 text-stone-400 shadow-sm"
        )}>
          <HelpCircle size={64} className="mb-6 opacity-20 text-stone-500" />
          <p className="font-black uppercase tracking-widest text-sm text-center">No operators with 2+ active EM days found in {reportMonthYear}</p>
        </div>
      ) : (
        /* Side by Side Layout */
        <div className={cn(
          "grid gap-8 items-stretch",
          isTvMode 
            ? "grid-cols-2 flex-1 my-2 min-h-0 overflow-hidden" 
            : "grid-cols-1 lg:grid-cols-2"
        )}>
          
          {/* TOP 5 PANEL (Lowest EM - Best) */}
          <div className={cn(
            "rounded-[2.5rem] border-2 p-8 flex flex-col justify-between relative overflow-hidden shadow-2xl",
            isTvMode ? "bg-white border-emerald-400" : "bg-gradient-to-b from-emerald-50/40 to-white border-emerald-300"
          )}>
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className={cn("rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200", isTvMode ? "p-4.5" : "p-2.5")}>
                  <Trophy size={isTvMode ? 36 : 22} className="fill-emerald-600/10" />
                </div>
                <div>
                  <h3 className={cn("font-black uppercase tracking-tight text-stone-950", isTvMode ? "text-4xl" : "text-2xl")}>
                    Top 5 EM Stars
                  </h3>
                  <p className={cn("font-extrabold uppercase tracking-wider text-emerald-600", isTvMode ? "text-lg" : "text-xs")}>
                    Lowest Average EM (Highly Efficient)
                  </p>
                </div>
              </div>

              <div className={cn("mt-4", isTvMode ? "space-y-5" : "space-y-3")}>
                {topFive.map((op, i) => (
                  <div 
                    key={`top-${op.id}`}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border border-emerald-100 bg-white shadow-sm hover:border-emerald-300 hover:shadow-md transition-all",
                      isTvMode ? "p-5 py-4.5" : "p-3.5"
                    )}
                  >
                    <div className="flex items-center gap-5 min-w-0">
                      <div className={cn(
                        "font-black flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-700",
                        isTvMode ? "w-14 h-14 text-2xl rounded-2xl" : "w-8 h-8 text-sm rounded-lg"
                      )}>
                        #{i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("font-black uppercase truncate leading-tight text-stone-950", isTvMode ? "text-[31px]" : "text-[19px]")}>{op.name}</p>
                        <p className={cn("font-extrabold font-mono uppercase tracking-wider text-stone-500", isTvMode ? "text-[17px]" : "text-xs")}>
                          TK No: {op.tNo} • {op.emDutiesCount} days
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn(
                        "flex items-center justify-end gap-1 font-black font-mono text-emerald-600 leading-none",
                        isTvMode ? "text-4xl" : "text-2xl"
                      )}>
                        <ArrowDown size={isTvMode ? 28 : 18} className="animate-bounce text-emerald-500" />
                        {op.averageEm.toFixed(2)}
                      </div>
                      <p className={cn("font-bold uppercase tracking-widest text-stone-400 mt-1", isTvMode ? "text-[15px]" : "text-[10px]")}>Avg EM</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BOTTOM 5 PANEL (Highest EM - Outliers) */}
          <div className={cn(
            "rounded-[2.5rem] border-2 p-8 flex flex-col justify-between relative overflow-hidden shadow-2xl",
            isTvMode ? "bg-white border-red-400" : "bg-gradient-to-b from-red-50/40 to-white border-red-300"
          )}>
            <div>
              <div className="flex items-center gap-4 mb-6">
                <div className={cn("rounded-2xl bg-red-50 text-red-600 border border-red-200", isTvMode ? "p-4.5" : "p-2.5")}>
                  <AlertTriangle size={isTvMode ? 36 : 22} className="text-red-500" />
                </div>
                <div>
                  <h3 className={cn("font-black uppercase tracking-tight text-stone-950", isTvMode ? "text-4xl" : "text-2xl")}>
                    Bottom 5 EM Outliers
                  </h3>
                  <p className={cn("font-extrabold uppercase tracking-wider text-red-600", isTvMode ? "text-lg" : "text-xs")}>
                    Highest Average EM (Review Needed)
                  </p>
                </div>
              </div>

              <div className={cn("mt-4", isTvMode ? "space-y-5" : "space-y-3")}>
                {bottomFive.map((op, i) => (
                  <div 
                    key={`bottom-${op.id}`}
                    className={cn(
                      "flex items-center justify-between rounded-2xl border border-red-100 bg-white shadow-sm hover:border-red-300 hover:shadow-md transition-all",
                      isTvMode ? "p-5 py-4.5" : "p-3.5"
                    )}
                  >
                    <div className="flex items-center gap-5 min-w-0">
                      <div className={cn(
                        "font-black flex items-center justify-center shrink-0 bg-red-100 text-red-700",
                        isTvMode ? "w-14 h-14 text-2xl rounded-2xl" : "w-8 h-8 text-sm rounded-lg"
                      )}>
                        #{i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className={cn("font-black uppercase truncate leading-tight text-stone-950", isTvMode ? "text-[31px]" : "text-[19px]")}>{op.name}</p>
                        <p className={cn("font-extrabold font-mono uppercase tracking-wider text-stone-500", isTvMode ? "text-[17px]" : "text-xs")}>
                          TK No: {op.tNo} • {op.emDutiesCount} days
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={cn(
                        "flex items-center justify-end gap-1 font-black font-mono text-red-600 leading-none",
                        isTvMode ? "text-4xl" : "text-2xl"
                      )}>
                        <ArrowUp size={isTvMode ? 28 : 18} className="animate-bounce text-red-500" />
                        {op.averageEm.toFixed(2)}
                      </div>
                      <p className={cn("font-bold uppercase tracking-widest text-stone-400 mt-1", isTvMode ? "text-[15px]" : "text-[10px]")}>Avg EM</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* Footer Branding / Information */}
      <div className={cn("text-center", isTvMode ? "mt-1 mb-0" : "mt-8 space-y-4")}>
        <p className="font-bold uppercase tracking-[0.3em] mx-auto leading-none text-[10px] text-stone-500">
          SpinMonitor Outlier Diagnostics Panel • Automatic 2-Day Duty Filter Active
        </p>
      </div>
    </div>
  );
};
