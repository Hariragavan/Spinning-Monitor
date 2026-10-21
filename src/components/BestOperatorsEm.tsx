import React, { useMemo, useState, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, MachineEmData } from '../types';
import { Trophy, Calendar, Coins, Star, Award, Zap, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { cn, resolveWorker, calculateIncentive, parseUniversalDateParts, parseUniversalDate } from '../lib/utils';
import { CalendarMonthPicker } from './CalendarPickers';

interface BestOperatorsEmProps {
  history: DailyReport[];
  workers: Sider[];
  rules?: IncentiveRule[];
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

interface OperatorDuty {
  date: string;
  shift: string;
  machineId: string;
  count: string;
  gps: number;
  em: number;
  incentive: number;
}

export const BestOperatorsEm: React.FC<BestOperatorsEmProps> = ({
  history,
  workers,
  rules = [],
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

  const topTwo = useMemo(() => {
    const totals = new Map<string, { 
      id: string; 
      name: string; 
      tNo: string; 
      amount: number; 
      dutiesCount: number; 
      photoUrl?: string;
      duties: OperatorDuty[];
    }>();

    // Initialize with active workers
    workers.forEach(w => {
      totals.set(w.tNo || w.id, { 
        id: w.id, 
        name: w.name, 
        tNo: w.tNo, 
        amount: 0, 
        dutiesCount: 0, 
        photoUrl: w.photoUrl,
        duties: []
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

        let amount = entry.incentiveAmount || 0;
        if (amount === 0 && rules && rules.length > 0) {
          amount = calculateIncentive(entry, rules, report.date);
        }

        // Fetch custom EM value if exists
        const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;
        let emVal = machineEm?.[report.date]?.[entry.frameNo]?.[shiftNum];
        if (emVal === undefined) {
          emVal = entry.doffEmt || 0;
        }

        assignedIds.forEach(idVal => {
          const worker = resolveWorker(idVal, entry.siderName, workers);
          const tNo = worker.tNo || worker.id;
          if (!tNo) return;

          const duty: OperatorDuty = {
            date: report.date,
            shift: entry.shift,
            machineId: entry.frameNo,
            count: entry.count,
            gps: entry.gpsActual || 0,
            em: emVal || 0,
            incentive: amount
          };

          if (totals.has(tNo)) {
            const current = totals.get(tNo)!;
            current.amount += amount;
            current.dutiesCount += 1;
            current.duties.push(duty);
            if ((current.name === tNo || current.name === 'Unknown Worker' || current.name === 'Unregistered') && worker.name) {
              current.name = worker.name;
            }
          } else {
            totals.set(tNo, {
              id: worker.id,
              name: worker.name,
              tNo: tNo,
              amount: amount,
              dutiesCount: 1,
              photoUrl: worker.photoUrl,
              duties: [duty]
            });
          }
        });
      });
    });

    const mappedWithEm = Array.from(totals.values()).map(t => {
      const emDuties = t.duties.filter(d => d.em > 0);
      const averageEm = emDuties.length > 0 
        ? emDuties.reduce((sum, d) => sum + d.em, 0) / emDuties.length
        : 999999;
      return {
        ...t,
        averageEm,
        emDutiesCount: emDuties.length
      };
    });

    return mappedWithEm
      .filter(t => t.emDutiesCount > 1 && t.averageEm < 999999) // Exclude operators working only 1 day or with no EM data
      .sort((a, b) => a.averageEm - b.averageEm) // Lower EM is better! (Best EM at top)
      .slice(0, 2)
      .map(t => {
        // Sort duties by date descending, then by shift
        const sortedDuties = t.duties.sort((x, y) => {
          return parseUniversalDate(y.date).getTime() - parseUniversalDate(x.date).getTime();
        });
        return { ...t, duties: sortedDuties };
      });
  }, [history, workers, rules, machineEm, selectedMonth, selectedYear]);

  const reportMonthYear = useMemo(() => {
    const monthObj = monthsList.find(m => m.value === selectedMonth);
    return `${monthObj ? monthObj.label : 'July'} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  return (
    <div className={cn(
      "mx-auto animate-in fade-in duration-700",
      isTvMode ? "w-full max-w-full px-8 flex flex-col justify-between h-[calc(100vh-140px)] select-none overflow-hidden bg-white text-stone-900 p-6" : "max-w-7xl px-4 space-y-6 pb-12 text-stone-900"
    )}>
      
      {/* Title Header Section */}
      <div className={cn("text-center", isTvMode ? "mb-6" : "mb-6 space-y-2")}>
        <div className={cn(
          "inline-flex items-center gap-3 rounded-full font-black uppercase shadow-sm border",
          isTvMode 
            ? "px-12 py-3 text-xl tracking-[0.25em] bg-amber-50 text-amber-800 border-amber-300" 
            : "px-6 py-2 text-[10px] tracking-[0.3em] bg-amber-100 text-amber-700 border-amber-200"
        )}>
          <Trophy size={20} fill="currentColor" className="text-amber-500" />
          Top 2 Operators EM & Payout Spotlight
        </div>
        <h2 className={cn("font-black tracking-tighter uppercase leading-none text-stone-900", isTvMode ? "text-8xl my-5" : "text-5xl")}>
          Best EM Operators <span className="text-emerald-600">Of {reportMonthYear}</span>
        </h2>
        <p className={cn("font-extrabold uppercase tracking-[0.4em] text-stone-500", isTvMode ? "text-2xl mt-4" : "text-[10px]")}>
          Live Performance Duty logs & EM Metrics
        </p>
      </div>

      {/* Date Selectors for Month and Year in Normal Mode */}
      {!isTvMode && (
        <div className="flex justify-center bg-stone-50 border border-stone-200 rounded-[2rem] p-4 max-w-sm mx-auto shadow-inner">
          <CalendarMonthPicker
            month={selectedMonth}
            year={selectedYear}
            onChange={(m, y) => {
              setSelectedMonth(m);
              setSelectedYear(y);
            }}
          />
        </div>
      )}

      {topTwo.length === 0 ? (
        <div className={cn(
          "flex flex-col items-center justify-center py-24 rounded-[3rem] border max-w-3xl mx-auto bg-white border-stone-200 text-stone-400 shadow-sm"
        )}>
          <Trophy size={64} className="mb-6 opacity-20 text-amber-500" />
          <p className="font-black uppercase tracking-widest text-sm text-center">No operator records found for {reportMonthYear}</p>
        </div>
      ) : (
        /* Spotlight Layout */
        <div className={cn(
          "grid gap-6 items-stretch",
          isTvMode 
            ? "grid-cols-2 flex-1 my-2 min-h-0 overflow-hidden" 
            : "grid-cols-1 xl:grid-cols-2"
        )}>
          {topTwo.map((operator, idx) => {
            const isRank1 = idx === 0;
            // Calculations
            const emDuties = operator.duties.filter(d => d.em > 0);
            const avgEm = emDuties.length > 0 
              ? (emDuties.reduce((sum, d) => sum + d.em, 0) / emDuties.length).toFixed(2)
              : '0.00';
            
            // Layout styling
            const themeBg = isTvMode 
              ? (isRank1 ? "bg-white border-amber-400" : "bg-white border-blue-400")
              : isRank1 
                ? "bg-gradient-to-b from-amber-50/40 to-white border-amber-300" 
                : "bg-gradient-to-b from-blue-50/30 to-white border-blue-200";

            const ringColor = isRank1 
              ? "ring-8 ring-amber-400/20 border-amber-400" 
              : "ring-8 ring-blue-400/20 border-blue-400";

            return (
              <motion.div
                key={operator.id}
                initial={{ opacity: 0, x: isRank1 ? -30 : 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8 }}
                className={cn(
                  "rounded-[2.5rem] border-2 shadow-2xl p-8 flex flex-col justify-between overflow-hidden relative",
                  themeBg,
                  isTvMode ? "h-full min-h-0" : "min-h-[500px]"
                )}
              >
                {/* Clean Rank Indicator watermark */}
                <div className="absolute right-6 top-2 text-[8rem] font-black opacity-[0.05] select-none pointer-events-none leading-none text-stone-500">
                  #{idx + 1}
                </div>

                {/* Operator Identity & Spotlight Header */}
                <div className="flex flex-col sm:flex-row gap-6 items-center border-b pb-6 mb-6 border-stone-200">
                  {/* Photo Section with rank circle */}
                  <div className="relative shrink-0">
                    <div className={cn(
                      "rounded-full overflow-hidden border-4 bg-stone-100 flex items-center justify-center",
                      isTvMode ? "w-48 h-48" : "w-28 h-28",
                      ringColor
                    )}>
                      {operator.photoUrl && !operator.photoUrl.includes('picsum.photos') ? (
                        <img 
                          src={operator.photoUrl} 
                          alt={operator.name} 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-full h-full bg-white flex items-center justify-center p-4">
                          <img 
                            src="/scm-emblem.png" 
                            alt={operator.name} 
                            className="w-full h-full object-contain"
                          />
                        </div>
                      )}
                    </div>
                    {/* Absolute Rank Badge */}
                    <div className={cn(
                      "absolute left-1/2 -translate-x-1/2 rounded-full font-black uppercase shadow-lg tracking-widest border border-white",
                      isTvMode ? "-bottom-5 px-8 py-2.5 text-lg" : "-bottom-2 px-3.5 py-0.5 text-[10px]",
                      isRank1 ? "bg-amber-500 text-stone-950" : "bg-blue-500 text-white"
                    )}>
                      {isRank1 ? "CHAMPION" : "RUNNER UP"}
                    </div>
                  </div>

                  {/* Profile Details */}
                  <div className="text-center sm:text-left flex-1 min-w-0">
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                      <span className={cn(
                        "rounded-lg font-black font-mono bg-stone-100 text-stone-800 border border-stone-200",
                        isTvMode ? "px-8 py-2.5 text-xl rounded-xl" : "px-3 py-0.5 text-xs"
                      )}>
                        TK NO: {operator.tNo}
                      </span>
                      <span className={cn(
                        "inline-flex items-center gap-1 font-black text-emerald-600 uppercase tracking-widest",
                        isTvMode ? "text-xl gap-3" : "text-xs gap-1"
                      )}>
                        <Zap size={isTvMode ? 20 : 12} className="animate-pulse text-emerald-500" /> SPINNING TEAM
                      </span>
                    </div>

                    <h3 className={cn(
                      "font-black tracking-tight uppercase truncate leading-none mb-2 text-stone-950",
                      isTvMode ? "text-7xl my-3" : "text-2xl"
                    )}>
                      {operator.name}
                    </h3>

                    {/* Simple summary counts with increased size */}
                    <div className={cn("flex items-center justify-center sm:justify-start", isTvMode ? "gap-10 mt-6" : "gap-6 mt-3")}>
                      <div className="text-left">
                        <p className={cn("font-bold uppercase tracking-widest text-stone-500 mb-1", isTvMode ? "text-lg" : "text-[10px]")}>Duties</p>
                        <p className={cn("font-black leading-none tabular-nums text-stone-800", isTvMode ? "text-4xl" : "text-base")}>
                          {operator.dutiesCount} Shifts
                        </p>
                      </div>
                      <div className={cn("w-px bg-stone-300", isTvMode ? "h-12" : "h-8")} />
                      <div className="text-left">
                        <p className={cn("font-bold uppercase tracking-widest text-stone-500 mb-1", isTvMode ? "text-lg" : "text-[10px]")}>Avg EM</p>
                        <p className={cn("font-black leading-none tabular-nums text-blue-600", isTvMode ? "text-5xl" : "text-lg")}>
                          {avgEm}
                        </p>
                      </div>
                      <div className={cn("w-px bg-stone-300", isTvMode ? "h-12" : "h-8")} />
                      <div className="text-left">
                        <p className={cn("font-bold uppercase tracking-widest text-stone-500 mb-1", isTvMode ? "text-lg" : "text-[10px]")}>Payout</p>
                        <p className={cn("font-black leading-none tabular-nums text-emerald-600", isTvMode ? "text-5xl" : "text-lg")}>
                          ₹{Math.round(operator.amount).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Duty Statement / EM Table */}
                <div className="flex-1 min-h-0 flex flex-col justify-start overflow-hidden">
                  <div className="flex items-center justify-between mb-4 border-b-2 pb-3 border-stone-200">
                    <h4 className={cn(
                      "font-extrabold uppercase tracking-widest flex items-center gap-2 text-stone-600",
                      isTvMode ? "text-3xl" : "text-[13px]"
                    )}>
                      <Calendar size={isTvMode ? 24 : 13} />
                      Duty Statement Details
                    </h4>
                    <span className={cn(
                      "font-black uppercase tracking-widest rounded bg-stone-100 text-stone-500",
                      isTvMode ? "text-xl px-5 py-2" : "text-[10px] px-2 py-0.5"
                    )}>
                      Showing Latest 6 Duties
                    </span>
                  </div>

                  <div className="overflow-hidden flex-1 min-h-0">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className={cn(
                          "border-b uppercase tracking-wider text-center border-stone-200 text-stone-500",
                          isTvMode ? "text-[22px] h-14 font-black" : "text-[12px] h-8 font-black"
                        )}>
                          <th className="text-left py-1">Date</th>
                          <th className="py-1">Shift</th>
                          <th className="py-1">Alloted RF</th>
                          <th className="py-1">Count</th>
                          <th className="py-1">GPS</th>
                          <th className="py-1">EM</th>
                          <th className="text-right py-1">Incentive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {operator.duties.slice(0, 6).map((duty, dIdx) => {
                          const hasHighEm = duty.em > 4;
                          return (
                            <tr 
                              key={`${duty.date}-${duty.shift}-${dIdx}`}
                              className={cn(
                                "border-b font-bold text-center border-stone-100 hover:bg-stone-50/55 text-stone-800",
                                isTvMode ? "text-[33px] h-18" : "text-[19px] h-11"
                              )}
                            >
                              <td className="text-left font-mono font-black py-1">
                                {(() => {
                                  const dp = parseUniversalDateParts(duty.date);
                                  return dp ? `${dp.day.toString().padStart(2, '0')} / ${dp.month.toString().padStart(2, '0')}` : duty.date;
                                })()}
                              </td>
                              <td className="py-1 font-extrabold">{duty.shift}</td>
                              <td className="py-1 font-mono font-black text-emerald-700">{duty.machineId}</td>
                              <td className="py-1 text-stone-600 font-extrabold">{duty.count}</td>
                              <td className="py-1 font-mono tabular-nums text-stone-700">{duty.gps ? Math.round(duty.gps) : '-'}</td>
                              <td className="py-1 font-mono font-black tabular-nums">
                                {hasHighEm ? (
                                  <span className={cn(
                                    "inline-block bg-red-100 border border-red-300 rounded-full text-red-700 font-black",
                                    isTvMode ? "px-6 py-1.5 text-[30px]" : "px-3 py-0.5 text-[19px]"
                                  )}>
                                    {duty.em.toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-blue-600">{duty.em > 0 ? duty.em.toFixed(2) : '-'}</span>
                                )}
                              </td>
                              <td className="text-right font-mono font-black text-emerald-600 py-1">
                                {duty.incentive > 0 ? `₹${Math.round(duty.incentive)}` : '-'}
                              </td>
                            </tr>
                          );
                        })}

                        {/* Fill up placeholder rows if they have fewer than 6 duties to keep symmetric height */}
                        {operator.duties.length < 6 && Array.from({ length: 6 - operator.duties.length }).map((_, i) => (
                          <tr key={`empty-duty-${i}`} className={cn("opacity-20 border-b border-stone-200", isTvMode ? "h-18" : "h-11")}>
                            <td className="py-1">&nbsp;</td>
                            <td className="py-1">&nbsp;</td>
                            <td className="py-1">&nbsp;</td>
                            <td className="py-1">&nbsp;</td>
                            <td className="py-1">&nbsp;</td>
                            <td className="py-1">&nbsp;</td>
                            <td className="py-1">&nbsp;</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Footer Sparkle line */}
      <div className={cn("text-center", isTvMode ? "mt-1 mb-0" : "mt-8 space-y-4")}>
        <p className="font-bold uppercase tracking-[0.3em] mx-auto leading-none text-[10px] text-stone-500">
          SpinMonitor AI Enterprise Spotlight • Production & Compensation Analytics Board
        </p>
      </div>
    </div>
  );
};
