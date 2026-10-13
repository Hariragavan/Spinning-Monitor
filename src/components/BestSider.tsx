import React, { useMemo, useState, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule } from '../types';
import { Trophy, Award, Coins, Calendar, Star, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { cn, resolveWorker, calculateIncentive, parseUniversalDateParts } from '../lib/utils';

interface BestSiderProps {
  history: DailyReport[];
  workers: Sider[];
  isTvMode?: boolean;
  rules?: IncentiveRule[];
  month?: number;
  year?: number;
  showMonthOnTv?: boolean;
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

export const BestSider: React.FC<BestSiderProps> = ({ 
  history, 
  workers, 
  isTvMode, 
  rules = [],
  month,
  year,
  showMonthOnTv = true
}) => {
  const [selectedMonth, setSelectedMonth] = useState<number>(month || (new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState<number>(year || new Date().getFullYear());

  useEffect(() => {
    if (month && month > 0) {
      setSelectedMonth(month);
    }
  }, [month]);

  useEffect(() => {
    if (year && year > 0) {
      setSelectedYear(year);
    }
  }, [year]);

  const topSix = useMemo(() => {
    const totals = new Map<string, { id: string; name: string; tNo: string; amount: number; duties: number; photoUrl?: string }>();
    
    // Seed with workers
    workers.forEach(w => {
      totals.set(w.tNo || w.id, { id: w.id, name: w.name, tNo: w.tNo, amount: 0, duties: 0, photoUrl: w.photoUrl });
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

        // Calculate dynamic incentive
        let amount = entry.incentiveAmount || 0;
        if (amount === 0 && rules && rules.length > 0) {
          amount = calculateIncentive(entry, rules, report.date);
        }
        
        assignedIds.forEach(idVal => {
          const worker = resolveWorker(idVal, entry.siderName, workers);
          const tNo = worker.tNo || worker.id;
          if (!tNo) return;

          if (totals.has(tNo)) {
            const current = totals.get(tNo)!;
            current.amount += amount;
            current.duties += 1;
            // Keep actual registration name if possible
            if ((current.name === tNo || current.name === 'Unknown Worker' || current.name === 'Unregistered') && worker.name) {
              current.name = worker.name;
            }
          } else {
            totals.set(tNo, {
              id: worker.id,
              name: worker.name,
              tNo: tNo,
              amount: amount,
              duties: 1,
              photoUrl: worker.photoUrl
            });
          }
        });
      });
    });

    return Array.from(totals.values())
      .filter(t => t.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6);
  }, [history, workers, rules, selectedMonth, selectedYear]);

  const reportMonthYear = useMemo(() => {
    const monthObj = monthsList.find(m => m.value === selectedMonth);
    return `${monthObj ? monthObj.label : 'June'} ${selectedYear}`;
  }, [selectedMonth, selectedYear]);

  // Configurations for each ranking
  const rankConfigs = [
    {
      bg: 'bg-gradient-to-br from-amber-50 to-yellow-100/40',
      border: 'border-amber-300 shadow-amber-200/50',
      text: 'text-amber-800',
      amtText: 'text-amber-700',
      badge: 'bg-amber-400 text-amber-950 border-amber-500',
      label: '1st Rank - Champion',
      glow: 'shadow-amber-500/10'
    },
    {
      bg: 'bg-gradient-to-br from-slate-50 to-stone-200/40',
      border: 'border-slate-300 shadow-slate-200/50',
      text: 'text-slate-800',
      amtText: 'text-slate-700',
      badge: 'bg-slate-300 text-slate-950 border-slate-400',
      label: '2nd Rank - Elite',
      glow: 'shadow-slate-500/10'
    },
    {
      bg: 'bg-gradient-to-br from-orange-50 to-orange-100/40',
      border: 'border-orange-300 shadow-orange-200/50',
      text: 'text-orange-800',
      amtText: 'text-orange-700',
      badge: 'bg-orange-400 text-white border-orange-500',
      label: '3rd Rank - Star',
      glow: 'shadow-orange-500/10'
    },
    {
      bg: 'bg-white',
      border: 'border-stone-200 shadow-stone-100/50',
      text: 'text-stone-800',
      amtText: 'text-stone-900',
      badge: 'bg-stone-100 text-stone-700 border-stone-300',
      label: '4th Rank',
      glow: ''
    },
    {
      bg: 'bg-white',
      border: 'border-stone-200 shadow-stone-100/50',
      text: 'text-stone-800',
      amtText: 'text-stone-900',
      badge: 'bg-stone-100 text-stone-700 border-stone-300',
      label: '5th Rank',
      glow: ''
    },
    {
      bg: 'bg-white',
      border: 'border-stone-200 shadow-stone-100/50',
      text: 'text-stone-800',
      amtText: 'text-stone-900',
      badge: 'bg-stone-100 text-stone-700 border-stone-300',
      label: '6th Rank',
      glow: ''
    }
  ];

  return (
    <div className={cn(
      "mx-auto animate-in fade-in duration-700",
      isTvMode ? "w-full max-w-full px-6 flex flex-col justify-between h-[calc(100vh-140px)] select-none overflow-hidden" : "max-w-7xl px-4 space-y-6 pb-12"
    )}>
      
      {/* Title Header Section */}
      <div className={cn("text-center", isTvMode ? "mb-1.5" : "mb-6 space-y-2")}>
        <div className={cn(
          "inline-flex items-center gap-3 bg-amber-100 text-amber-700 rounded-full font-black uppercase shadow-sm border border-amber-200",
          isTvMode ? "px-5 py-1 text-[9px] tracking-[0.25em]" : "px-6 py-2 text-[10px] tracking-[0.3em]"
        )}>
          <Trophy size={13} fill="currentColor" />
          Monthly Hall of Fame (Top 6)
        </div>
        <h2 className={cn("font-black text-stone-900 tracking-tighter uppercase leading-none", isTvMode ? "text-4xl my-1" : "text-5xl")}>
          Best Siders <span className="text-emerald-600">{isTvMode && showMonthOnTv ? `Of ${reportMonthYear}` : "Of The Month"}</span>
        </h2>
        {(!isTvMode || showMonthOnTv) && (
          <p className={cn("text-stone-400 font-extrabold uppercase tracking-[0.4em]", isTvMode ? "text-xs mt-1" : "text-[10px]")}>
            Recognition for {reportMonthYear}
          </p>
        )}
      </div>

      {/* Date Selectors for Month and Year */}
      {!isTvMode && (
        <div className="flex flex-wrap justify-center gap-6 bg-stone-50 border border-stone-200 rounded-[2rem] p-5 max-w-xl mx-auto shadow-inner">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black text-stone-500 uppercase tracking-wider">Select Month:</span>
            <div className="relative">
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(Number(e.target.value))}
                className="appearance-none bg-white border border-stone-300 rounded-xl pl-4 pr-10 py-2.5 text-xs font-black text-stone-800 uppercase tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-sm"
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
                className="appearance-none bg-white border border-stone-300 rounded-xl pl-4 pr-10 py-2.5 text-xs font-black text-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-sm"
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

      {topSix.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-stone-400 bg-white rounded-[3rem] border border-stone-200 shadow-sm max-w-3xl mx-auto">
          <Trophy size={64} className="mb-6 opacity-20 text-stone-400" />
          <p className="font-black uppercase tracking-widest text-sm">No Performance Data Found for {reportMonthYear}</p>
        </div>
      ) : (
        /* Performers Grid */
        <div className={cn(
          "grid gap-6",
          isTvMode 
            ? "grid-cols-3 grid-rows-2 flex-1 my-2 min-h-0" 
            : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mt-8"
        )}>
        {topSix.map((performer, idx) => {
          const config = rankConfigs[idx] || rankConfigs[3];
          
          return (
            <motion.div
              key={performer.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={cn(
                "relative rounded-[2.5rem] border-3 shadow-xl flex flex-col justify-between p-6 bg-white hover:scale-[1.02] transition-all duration-300",
                config.bg, config.border, config.glow,
                isTvMode ? "h-full min-h-0 overflow-hidden" : "min-h-[280px]"
              )}
            >
              {/* Rank Medal / Badge */}
              <div className={cn(
                "absolute -top-4 -left-3 w-16 h-16 rounded-2xl flex flex-col items-center justify-center font-black shadow-lg border-2 border-white rotate-[-8deg] z-10",
                config.badge
              )}>
                <span className="text-[9px] uppercase tracking-tighter -mb-0.5 opacity-90">Rank</span>
                <span className="text-2xl leading-none">{idx + 1}</span>
              </div>

              {/* Top Row: Worker Photo & Basic Info */}
              <div className={cn(
                "flex items-center gap-6 flex-1 min-h-0",
                isTvMode ? "flex-col justify-center text-center py-2" : "flex-row"
              )}>
                {/* Photo with beautiful ring indicator */}
                <div className="shrink-0 relative">
                  <div className={cn(
                    "rounded-full overflow-hidden border-4 border-white shadow-lg bg-stone-100 flex items-center justify-center mx-auto transition-all",
                    isTvMode ? "w-52 h-52 xl:w-56 xl:h-56 border-8 shadow-2xl" : "w-28 h-28 border-4 shadow-md",
                    idx === 0 ? "ring-8 ring-amber-400/40" : idx === 1 ? "ring-8 ring-slate-400/40" : idx === 2 ? "ring-8 ring-orange-400/40" : ""
                  )}>
                    {performer.photoUrl ? (
                      <img
                        src={performer.photoUrl}
                        alt={performer.name}
                        className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-stone-200 to-stone-300 flex flex-col items-center justify-center text-stone-500 font-black">
                        <span className={cn("tracking-tighter uppercase", isTvMode ? "text-5xl" : "text-3xl")}>
                          {performer.name.substring(0, 2)}
                        </span>
                      </div>
                    )}
                  </div>
                  
                  {/* Small absolute indicator star for Top 3 */}
                  {idx < 3 && (
                    <div className={cn(
                      "absolute bg-white rounded-full shadow-md border border-stone-100",
                      isTvMode ? "-bottom-1 -right-1 p-2" : "-bottom-1 -right-1 p-1.5"
                    )}>
                      <Star size={isTvMode ? 20 : 14} className={idx === 0 ? "text-amber-500" : idx === 1 ? "text-slate-400" : "text-orange-500"} fill="currentColor" />
                    </div>
                  )}
                </div>

                {/* Worker Identity */}
                <div className={cn("flex-1 min-w-0", isTvMode ? "space-y-2 mt-2" : "space-y-1.5")}>
                  <p className={cn(
                    "inline-flex bg-white/80 backdrop-blur-sm rounded-lg border border-stone-200/50 font-black uppercase tracking-wider text-stone-500",
                    isTvMode ? "px-3 py-1 text-xs" : "px-2 py-0.5 text-[9px]"
                  )}>
                    TK: <span className="text-stone-900 ml-1 font-mono font-black">{performer.tNo}</span>
                  </p>
                  
                  <h3 className={cn(
                    "font-black tracking-tight uppercase truncate text-stone-950",
                    isTvMode ? "text-3xl xl:text-4xl leading-tight" : "text-2xl leading-none"
                  )}>
                    {performer.name}
                  </h3>
                  
                  <div className={cn(
                    "font-extrabold uppercase tracking-widest", 
                    config.text,
                    isTvMode ? "text-xs xl:text-sm" : "text-[10px]"
                  )}>
                    {config.label}
                  </div>
                </div>
              </div>

              {/* Stats Block: Duties count & Incentive amount */}
              <div className={cn(
                "bg-white/80 backdrop-blur-sm rounded-2xl border border-stone-200/40 flex items-center justify-between shadow-inner w-full",
                isTvMode ? "mt-4 p-4" : "mt-3.5 p-3"
              )}>
                {/* Left side: Duties */}
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "rounded-xl bg-stone-100 flex items-center justify-center text-stone-500 shadow-sm shrink-0",
                    isTvMode ? "w-10 h-10" : "w-8 h-8"
                  )}>
                    <Calendar size={isTvMode ? 18 : 14} className="text-stone-500" />
                  </div>
                  <div>
                    <p className={cn("font-black text-stone-400 uppercase tracking-widest leading-none mb-1", isTvMode ? "text-[9px]" : "text-[7px]")}>Duties</p>
                    <p className={cn("font-black text-stone-800 leading-none tabular-nums", isTvMode ? "text-lg xl:text-xl" : "text-[14px]")}>
                      {performer.duties} {performer.duties === 1 ? 'Shift' : 'Shifts'}
                    </p>
                  </div>
                </div>

                {/* Right side: Amount */}
                <div className="text-right">
                  <p className={cn("font-black text-stone-400 uppercase tracking-widest leading-none mb-1", isTvMode ? "text-[9px]" : "text-[7px]")}>Incentive</p>
                  <div className="flex items-center gap-1.5 justify-end">
                    <Coins size={isTvMode ? 18 : 12} className="text-emerald-600 animate-pulse shrink-0" />
                    <span className={cn(
                      "font-black tabular-nums leading-none",
                      isTvMode ? "text-2xl xl:text-3xl" : "text-xl",
                      config.amtText
                    )}>
                      ₹{Math.round(performer.amount).toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Giant clean watermark background rank number */}
              <div className="absolute right-4 top-0 text-[6rem] font-black leading-none opacity-[0.03] select-none pointer-events-none">
                #{idx + 1}
              </div>
            </motion.div>
          );
        })}
      </div>
      )}

      {/* Footer / Star bar */}
      <div className={cn("text-center", isTvMode ? "mt-1 mb-0" : "mt-8 space-y-4")}>
        <p className={cn("font-bold text-stone-400 uppercase tracking-[0.3em] mx-auto leading-none", isTvMode ? "text-[8px]" : "text-[10px]")}>
          The elite standard of productivity for {reportMonthYear}.
        </p>
        {!isTvMode && (
          <div className="flex justify-center gap-3">
            <div className="h-px w-8 bg-stone-200 mt-1.5"></div>
            <Star className="text-amber-400" size={12} fill="currentColor" />
            <div className="h-px w-8 bg-stone-200 mt-1.5"></div>
          </div>
        )}
      </div>
    </div>
  );
};
