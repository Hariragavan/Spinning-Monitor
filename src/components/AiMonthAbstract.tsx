import React, { useMemo, useState, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift, FrozenMonthRecord } from '../types';
import { Printer, Zap, Crown, ChevronRight, TrendingUp, Lock, Unlock, Download, FileSpreadsheet } from 'lucide-react';
import { cn, parseUniversalDateParts, parseUniversalDate } from '../lib/utils';
import { motion } from 'motion/react';
import { getMonthKey } from '../lib/frozenMonths';
import * as XLSX from 'xlsx';

interface AiMonthAbstractProps {
  history: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  month: number;
  year: number;
  isTvMode?: boolean;
  onPagesDetermined?: (pages: number) => void;
  tvPageInterval?: number;
  frozenMonths?: Record<string, FrozenMonthRecord>;
  onToggleFreezeMonth?: (month: number, year: number) => void;
}

export const AiMonthAbstract: React.FC<AiMonthAbstractProps> = ({
  history,
  workers,
  rules,
  month,
  year,
  isTvMode = false,
  onPagesDetermined,
  tvPageInterval,
  frozenMonths,
  onToggleFreezeMonth
}) => {
  const monthKey = getMonthKey(month, year);
  const frozenRecord = frozenMonths?.[monthKey];
  const isFrozen = !!frozenRecord;
  const [isPrintingAll, setIsPrintingAll] = useState<boolean>(false);
  const [isPrintingAbstract, setIsPrintingAbstract] = useState<boolean>(false);
  const [omittedWorkerIds, setOmittedWorkerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isPrintingAll || isPrintingAbstract) {
      const timer = setTimeout(() => {
        window.print();
        setIsPrintingAll(false);
        setIsPrintingAbstract(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isPrintingAll, isPrintingAbstract]);

  const aiTotals = useMemo(() => {
    if (isFrozen && frozenRecord && frozenRecord.aiAbstract) {
      return frozenRecord.aiAbstract.map(item => ({
        id: item.id,
        name: item.name,
        tNo: item.tNo,
        amount: item.amount,
        duties: item.duties || item.workedDaysCount,
        workedDaysCount: item.workedDaysCount
      })).filter(t => t.amount > 0 || t.duties > 0);
    }

    // Filter history for the selected month and year
    const filteredHistory = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      return parts.month === month && parts.year === year;
    });

    // Calculate totals for each unique AI Linkconer worker
    const totals = new Map<string, {
      id: string;
      name: string;
      tNo: string;
      amount: number;
      duties: number;
      workedDaysCount: Set<string>;
    }>();
    
    // Seed with AI Linkconer workers
    const aiWorkers = workers.filter(w => w.department === 'AI Linkconer');
    aiWorkers.forEach(w => {
      totals.set(w.tNo || w.id, {
        id: w.id,
        name: w.name,
        tNo: w.tNo,
        amount: 0,
        duties: 0,
        workedDaysCount: new Set<string>()
      });
    });

    filteredHistory.forEach(report => {
      if (!report) return;

      const shifts: Shift[] = ['I', 'II', 'III'];
      shifts.forEach(shift => {
        const shiftAiConeIds = report.aiCones?.[shift] || [];
        shiftAiConeIds.forEach(id => {
          if (!id) return;
          const targetIdLower = String(id).toLowerCase().trim();
          const worker = workers.find(w => 
            w.id.toLowerCase().trim() === targetIdLower || 
            w.tNo.toLowerCase().trim() === targetIdLower ||
            w.name.toLowerCase().trim() === targetIdLower
          );
          if (!worker) return;

          const tNo = worker.tNo || id;

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

          if (totals.has(tNo)) {
            const current = totals.get(tNo)!;
            current.amount += incentive;
            current.duties += 1;
            current.workedDaysCount.add(report.date);
          } else {
            const workedDaysCount = new Set<string>();
            workedDaysCount.add(report.date);
            totals.set(tNo, {
              id: worker.id || id,
              name: worker.name || id,
              tNo: tNo,
              amount: incentive,
              duties: 1,
              workedDaysCount
            });
          }
        });
      });
    });

    return Array.from(totals.values())
      .map(t => ({
        id: t.id,
        name: t.name,
        tNo: t.tNo,
        amount: t.amount,
        duties: t.duties,
        workingDays: t.workedDaysCount.size
      }))
      .filter(t => {
        if (t.amount <= 0 && t.duties <= 0) return false;
        
        if (!t.tNo) return false;
        const cleanTNo = t.tNo.trim();
        const cleanTNoLower = cleanTNo.toLowerCase();
        if (cleanTNo === "" || cleanTNo === "-" || cleanTNoLower === "none" || cleanTNoLower === "no t.no" || cleanTNoLower === "no t. no" || cleanTNoLower === "n/a" || cleanTNoLower === "na") {
          return false;
        }

        if (t.name) {
          const nameLower = t.name.toLowerCase();
          if (nameLower.includes("unknown") || nameLower.includes("unregistered")) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const aNum = parseInt(a.tNo);
        const bNum = parseInt(b.tNo);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.name.localeCompare(b.name);
      });
  }, [history, workers, rules, month, year]);

  const printedAiTotals = useMemo(() => {
    return aiTotals.filter(row => !omittedWorkerIds.has(row.id));
  }, [aiTotals, omittedWorkerIds]);

  const printedGrandTotal = useMemo(() => {
    return printedAiTotals.reduce((acc, curr) => acc + curr.amount, 0);
  }, [printedAiTotals]);

  const abstractChunks = useMemo(() => {
    const remaining = [...printedAiTotals];
    const chunks: any[][] = [];
    if (remaining.length === 0) return chunks;

    const M_nf = 18; // Max rows on non-final page
    const M_f = 13;  // Max rows on final page (with consolidation block)

    // 1. Determine the number of pages P
    let P = 1;
    while (true) {
      const maxCapacity = (P - 1) * M_nf + M_f;
      if (remaining.length <= maxCapacity) {
        break;
      }
      P++;
    }

    // 2. Distribute rows across P pages
    const pageSizes: number[] = [];
    let tempRemaining = remaining.length;

    if (P === 1) {
      pageSizes.push(tempRemaining);
    } else {
      // Find average size target
      const avg = Math.ceil(tempRemaining / P);
      if (avg > M_f) {
        // Final page gets max capacity M_f
        // Remaining are distributed as evenly as possible over the first P-1 pages
        let remainingForNonFinal = tempRemaining - M_f;
        const numNonFinal = P - 1;
        const baseSize = Math.floor(remainingForNonFinal / numNonFinal);
        const extra = remainingForNonFinal % numNonFinal;

        for (let i = 0; i < numNonFinal; i++) {
          pageSizes.push(baseSize + (i < extra ? 1 : 0));
        }
        pageSizes.push(M_f);
      } else {
        // Distribute evenly among all P pages
        const baseSize = Math.floor(tempRemaining / P);
        const extra = tempRemaining % P;
        for (let i = 0; i < P; i++) {
          pageSizes.push(baseSize + (i < extra ? 1 : 0));
        }
      }
    }

    // 3. Slice the remaining list into chunks based on calculated pageSizes
    let sliceStart = 0;
    for (const size of pageSizes) {
      chunks.push(remaining.slice(sliceStart, sliceStart + size));
      sliceStart += size;
    }

    return chunks;
  }, [printedAiTotals]);

  const getWorkerLedgerForMonth = (workerId: string) => {
    const targetWorker = workers.find(w => w.id === workerId || w.tNo === workerId);
    if (!targetWorker) return [];

    const rows: { date: string; shift: Shift; count: string; utility: number; incentive: number }[] = [];

    // Filter history for selected month & year
    const matchingReports = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      return parts.month === month && parts.year === year;
    });

    matchingReports.forEach(report => {
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
          const aiFrameNos = ['K01', 'K02', 'K03', 'K04', 'K05', 'K06', 'K1', 'K2', 'K3', 'K4', 'K5', 'K6'];
          const utilEntries = shiftEntries.filter(e => {
            const normalizedFrame = (e.frameNo || '').toUpperCase().trim().replace(/[\s-]/g, '');
            const isAiFrame = aiFrameNos.some(f => f.toUpperCase().replace(/[\s-]/g, '') === normalizedFrame);
            return isAiFrame && typeof e.utility === 'number' && !isNaN(e.utility);
          });
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
          let matchedCount = '-';
          if (matchedRule) {
            const sortedPayouts = [...matchedRule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
            const bestPayout = sortedPayouts.find(p => Math.round(avgUtility) >= p.gpsThreshold);
            incentive = bestPayout ? bestPayout.amount : 0;
            matchedCount = matchedRule.count;
          }

          rows.push({
            date: report.date,
            shift,
            count: matchedCount,
            utility: avgUtility,
            incentive
          });
        }
      });
    });

    return rows.sort((a, b) => {
      const timeA = parseUniversalDate(a.date).getTime();
      const timeB = parseUniversalDate(b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;
      const shiftVal = { 'I': 1, 'II': 2, 'III': 3 };
      return shiftVal[a.shift] - shiftVal[b.shift];
    });
  };

  const reportMonthYear = useMemo(() => {
    return new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [month, year]);

  const grandTotal = aiTotals.reduce((acc, curr) => acc + curr.amount, 0);

  // Divide into dynamic columns for normal printing
  const totalCount = aiTotals.length;
  const halfLength = Math.ceil(totalCount / 2);
  const leftColumn = aiTotals.slice(0, halfLength);
  const rightColumn = aiTotals.slice(halfLength);

  const leftTotal = leftColumn.reduce((acc, curr) => acc + curr.amount, 0);
  const rightTotal = rightColumn.reduce((acc, curr) => acc + curr.amount, 0);

  useEffect(() => {
    if (isTvMode && onPagesDetermined) {
      onPagesDetermined(1); // Set to single page as requested!
    }
  }, [isTvMode, onPagesDetermined]);

  // Normal header
  const TableHeader = () => (
    <thead className="bg-purple-100/50">
      <tr className="border-[2px] border-purple-900 text-purple-950 font-black">
        <th className="px-4 py-3 border-r-[2px] border-purple-900 text-[27px] font-black w-24 text-center no-print">
          <input
            type="checkbox"
            checked={aiTotals.length > 0 && omittedWorkerIds.size === 0}
            onChange={() => {
              if (omittedWorkerIds.size > 0) {
                setOmittedWorkerIds(new Set());
              } else {
                setOmittedWorkerIds(new Set(aiTotals.map(r => r.id)));
              }
            }}
            className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-6 w-6 cursor-pointer"
            title="Toggle all for Print All"
          />
        </th>
        <th className="px-4 py-3 border-r-[2px] border-purple-900 text-[27px] font-black w-24 text-center">S. NO</th>
        <th className="px-4 py-3 border-r-[2px] border-purple-900 text-[27px] font-black w-40 text-left">TK No</th>
        <th className="px-4 py-3 border-r-[2px] border-purple-900 text-[27px] font-black text-left">Name</th>
        <th className="px-3 py-3 border-r-[2px] border-purple-900 text-[27px] font-black w-40 text-center">Days Worked</th>
        <th className="px-3 py-3 border-r-[2px] border-purple-900 text-[27px] font-black w-40 text-center">Duties</th>
        <th className="px-4 py-3 text-[27px] font-black w-64 text-right">Incentive Amt</th>
      </tr>
    </thead>
  );

  // TV mode component for AI abstract (Single Table format for simple aesthetic layout)
  if (isTvMode) {
    return (
      <div className="bg-stone-950 p-6 md:p-12 xl:p-16 min-h-screen text-white font-sans overflow-hidden">
        {/* Top Header */}
        <div className="text-center mb-12 relative">
          <div className="flex items-center justify-center gap-2 text-purple-400 font-extrabold text-sm uppercase tracking-widest mb-2">
            <Zap size={16} className="text-amber-400 animate-bounce" />
            AI Operator Monthly Performance Abstract
          </div>
          <h1 className="text-5xl md:text-6xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 drop-shadow-md pb-4">
            AI Monthly Incentive Abstract {reportMonthYear}
          </h1>
          <div className="bg-gradient-to-r from-transparent via-purple-600 to-transparent h-1.5 w-1/2 mx-auto rounded-full" />
        </div>

        {/* Centered Single Table Panel */}
        <div className="max-w-5xl mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="bg-stone-900/40 rounded-[2.5rem] border-2 border-purple-950 p-8 shadow-2xl backdrop-blur-sm"
          >
            <table className="w-full border-collapse font-sans">
              <thead>
                <tr className="bg-purple-950 text-purple-300 border-b-2 border-purple-900 text-[26px] font-black h-20">
                  <th className="px-5 text-center w-28 rounded-tl-2xl border-r border-purple-900/50">S. NO</th>
                  <th className="px-5 text-left w-44 border-r border-purple-900/50">TK No</th>
                  <th className="px-5 text-left border-r border-purple-900/50">Name of Operator</th>
                  <th className="px-4 text-center w-36 border-r border-purple-900/50">Days Worked</th>
                  <th className="px-4 text-center w-36 border-r border-purple-900/50">Duties</th>
                  <th className="px-6 text-right w-64 rounded-tr-2xl">Incentive Amt</th>
                </tr>
              </thead>
              <tbody>
                {aiTotals.map((item, idx) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.05 }}
                    key={item.id} 
                    className="border-b border-stone-800/80 h-20 hover:bg-purple-950/20 transition-colors"
                  >
                    <td className="px-5 text-center text-[27px] font-extrabold text-stone-500 border-r border-stone-800/50">{idx + 1}</td>
                    <td className="px-5 text-left text-[27px] font-black text-purple-400 font-mono border-r border-stone-800/50">{item.tNo}</td>
                    <td className="px-5 text-left text-[27px] font-bold uppercase tracking-tight text-stone-100 flex items-center gap-2 h-20 border-r border-stone-800/50">
                      <ChevronRight size={18} className="text-purple-500 shrink-0" />
                      {item.name}
                    </td>
                    <td className="px-4 text-center text-[27px] font-black text-stone-300 font-mono border-r border-stone-800/50">{item.workingDays}</td>
                    <td className="px-4 text-center text-[27px] font-black text-stone-300 font-mono border-r border-stone-800/50">{item.duties}</td>
                    <td className="px-6 text-right text-[28px] font-black text-white font-mono">₹{Math.round(item.amount).toLocaleString()}</td>
                  </motion.tr>
                ))}
                
                {/* Fallback empty view */}
                {aiTotals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="h-32 text-center text-stone-500 text-lg uppercase tracking-widest font-bold">
                       No Records
                    </td>
                  </tr>
                )}
                
                {/* Single Table Total row */}
                <tr className="bg-purple-950/40 font-black h-20 border-t-2 border-purple-900">
                  <td colSpan={5} className="px-6 text-right text-[23px] uppercase tracking-wider text-purple-400 border-r border-stone-800/20">Total Incentive Amount:</td>
                  <td className="px-6 text-right text-[33px] font-black text-purple-300 font-mono">
                    ₹{grandTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </motion.div>
        </div>

        {/* Floating Glowing Grand Total Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="max-w-5xl mx-auto mt-12 bg-gradient-to-r from-purple-950 via-stone-900 to-purple-950 border-4 border-purple-700/80 rounded-[2.5rem] p-6 shadow-[0_0_50px_rgba(168,85,247,0.15)] flex flex-col md:flex-row items-center justify-between"
        >
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <div className="w-14 h-14 rounded-2xl bg-purple-500/20 flex items-center justify-center border border-purple-500/30">
              <TrendingUp size={30} className="text-purple-400 animate-pulse" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-wide text-white uppercase">Grand Total Incentives</h3>
              <p className="text-sm text-stone-400 font-extrabold uppercase tracking-widest">AI Linkconer Operators Statement Summary</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-6xl md:text-7xl font-extrabold tabular-nums tracking-normal text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-amber-300 font-mono">
              ₹{grandTotal.toLocaleString()}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Normal Print View - displaying all persons clearly in high-contrast light theme
  return (
    <div className="bg-white p-6 min-h-screen text-stone-900 font-sans animate-in fade-in duration-500">
      <div className={(isPrintingAll || isPrintingAbstract) ? "print:hidden" : ""}>
        {/* Freeze / Lock Status Banner */}
        <div className="max-w-[97%] mx-auto mb-6 no-print">
          {isFrozen && frozenRecord ? (
            <div className="p-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-amber-900">
                <div className="p-2.5 bg-amber-500/20 rounded-xl">
                  <Lock className="text-amber-700 shrink-0" size={24} />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider text-amber-900 flex items-center gap-2">
                    <span>🔒 AI Linkconer Month Incentive Abstract Frozen (Locked for Accounts)</span>
                  </h3>
                  <p className="text-xs text-amber-800 font-bold mt-0.5">
                    Locked on <span className="underline">{frozenRecord.frozenAt}</span>{frozenRecord.frozenBy ? ` by ${frozenRecord.frozenBy}` : ''}. Future changes in Machine Config or Incentive Master will NOT alter these paid figures.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Are you sure you want to UNFREEZE ${reportMonthYear}? Recalculations will resume using active Incentive Master rules.`)) {
                    onToggleFreezeMonth?.(month, year);
                  }
                }}
                className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase flex items-center gap-2 shadow-sm transition-all cursor-pointer"
              >
                <Unlock size={16} />
                Unfreeze Month
              </button>
            </div>
          ) : (
            <div className="p-4 bg-purple-500/10 border-2 border-purple-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3 text-purple-900">
                <div className="p-2.5 bg-purple-500/20 rounded-xl">
                  <Unlock className="text-purple-700 shrink-0" size={24} />
                </div>
                <div>
                  <h3 className="font-black text-sm uppercase tracking-wider text-purple-900">
                    Live AI Incentive Calculation (Not Frozen)
                  </h3>
                  <p className="text-xs text-purple-800 font-medium mt-0.5">
                    Freeze this month before submitting to Accounts to lock paid amounts permanently against machine or rule changes.
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Freeze monthly AI incentive amount for ${reportMonthYear}? This will lock the paid abstract figures for Accounts submission.`)) {
                    onToggleFreezeMonth?.(month, year);
                  }
                }}
                className="bg-purple-800 hover:bg-purple-900 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase flex items-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <Lock size={16} />
                Freeze Month (Lock for Accounts)
              </button>
            </div>
          )}
        </div>

        <div className="text-center mb-10 relative">
          <div className="flex items-center justify-center gap-2 text-purple-700 font-extrabold text-xs uppercase tracking-widest no-print mb-1">
            <Zap size={14} className="animate-pulse" /> Final Audited Statements
          </div>
          <h2 className="text-3xl md:text-5xl font-black text-purple-950 uppercase tracking-tight">
            AI Linkconer Monthly Abstract <span className="text-stone-900">{reportMonthYear}</span>
          </h2>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-3 no-print">
            <button 
              onClick={() => setIsPrintingAbstract(true)}
              className="p-3 bg-purple-50 hover:bg-purple-100 text-purple-800 rounded-full transition-all shadow-sm cursor-pointer"
              title="Print Abstract Only"
            >
              <Printer size={22} />
            </button>
            <button 
              onClick={() => setIsPrintingAll(true)}
              className="p-3 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-full transition-all shadow-sm cursor-pointer animate-pulse"
              title="Print All (Abstract + Ledgers)"
            >
              <Printer size={22} className="text-amber-600" />
            </button>
          </div>
        </div>

        <div className="max-w-[97%] mx-auto w-full">
          <table className="w-full border-collapse border-[2px] border-purple-900 shadow-sm font-sans">
            <TableHeader />
            <tbody>
              {aiTotals.map((item, idx) => (
                <tr key={item.id} className="border border-purple-900 h-18 hover:bg-purple-50/20 transition-colors">
                  <td className="px-4 py-2 border-r border-purple-900 text-[27px] text-center no-print">
                    <input
                      type="checkbox"
                      checked={!omittedWorkerIds.has(item.id)}
                      onChange={() => {
                        setOmittedWorkerIds(prev => {
                          const next = new Set(prev);
                          if (next.has(item.id)) {
                            next.delete(item.id);
                          } else {
                            next.add(item.id);
                          }
                          return next;
                        });
                      }}
                      className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-6 w-6 cursor-pointer"
                      title="Include in Print All / Omit"
                    />
                  </td>
                  <td className="px-4 py-2 border-r border-purple-900 text-[27px] text-center font-bold text-stone-400">{idx + 1}</td>
                  <td className="px-4 py-2 border-r border-purple-900 text-[27px] font-extrabold text-purple-900">{item.tNo}</td>
                  <td className="px-4 py-2 border-r border-purple-900 text-[27px] font-black uppercase text-stone-900">{item.name}</td>
                  <td className="px-3 py-2 border-r border-purple-900 text-[27px] text-center tabular-nums font-bold text-stone-600">{item.workingDays}</td>
                  <td className="px-3 py-2 border-r border-purple-900 text-[27px] text-center tabular-nums font-bold text-stone-600">{item.duties}</td>
                  <td className="px-4 py-2 text-[27px] text-right font-black tabular-nums text-purple-950">₹{Math.round(item.amount).toLocaleString()}</td>
                </tr>
              ))}
              <tr className="border-[2px] border-purple-900 bg-purple-50/20 h-22 font-black">
                <td className="no-print"></td>
                <td colSpan={5} className="px-6 py-2 text-right text-[23px] uppercase tracking-widest font-black text-purple-800">Total:</td>
                <td className="px-4 py-2 text-[39px] font-black text-purple-950 text-right tabular-nums">
                   ₹{printedGrandTotal.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {aiTotals.length === 0 && (
          <div className="text-center py-16 border rounded-2xl border-stone-200 max-w-[1600px] mx-auto mt-6">
            <p className="text-stone-400 font-bold uppercase tracking-widest">No active earnings recorded for AI Linkconer operators in {reportMonthYear}</p>
          </div>
        )}

        {/* Global Total Bar */}
        {aiTotals.length > 0 && (
          <div className="max-w-[1600px] mx-auto mt-10 border-4 border-purple-950 flex h-24 items-center overflow-hidden rounded-sm shadow-xl">
            <div className="w-[240px] text-3xl font-black italic text-white bg-purple-950 h-full flex items-center justify-center uppercase tracking-wider">
              Grand Total
            </div>
            <div className="flex-1 text-5xl md:text-6xl font-black text-purple-950 text-center tracking-[0.1em] bg-white h-full flex items-center justify-center tabular-nums">
              ₹{printedGrandTotal.toLocaleString()}
            </div>
          </div>
        )}

        <div className="mt-12 text-center no-print flex flex-wrap justify-center gap-4">
          <button 
            onClick={() => {
              const wb = XLSX.utils.book_new();
              const rows = aiTotals.map((item, idx) => ({
                'S.No': idx + 1,
                'TK No': item.tNo || '—',
                'Operator Name': item.name,
                'Duties / Shifts': item.duties,
                'Days Worked': item.workedDaysCount,
                'Monthly Incentive (INR)': item.amount
              }));
              rows.push({
                'S.No': 'TOTAL',
                'TK No': '',
                'Operator Name': '',
                'Duties / Shifts': '',
                'Days Worked': '',
                'Monthly Incentive (INR)': printedGrandTotal
              });
              const ws = XLSX.utils.json_to_sheet(rows);
              XLSX.utils.book_append_sheet(wb, ws, 'AI Monthly Abstract');
              XLSX.writeFile(wb, `AI_Monthly_Abstract_${month}_${year}.xlsx`);
            }}
            className="px-8 py-4 bg-emerald-700 hover:bg-emerald-800 text-white font-black uppercase text-sm tracking-widest rounded-2xl transition-all shadow-xl shadow-emerald-700/20 active:scale-95 flex items-center gap-3 cursor-pointer"
            title="Download as Excel (.xlsx)"
          >
            <FileSpreadsheet size={20} />
            Export to Excel
          </button>

          <button 
            onClick={() => {
              let csv = `KTTM SPINNING MILLS - AI MONTHLY INCENTIVE ABSTRACT (${month}/${year})\n\n`;
              csv += `S.No,TK No,Operator Name,Duties / Shifts,Days Worked,Monthly Incentive (INR)\n`;
              aiTotals.forEach((item, idx) => {
                csv += `${idx + 1},"${item.tNo || ''}","${item.name}",${item.duties},${item.workedDaysCount},${item.amount}\n`;
              });
              csv += `TOTAL,,,,,${printedGrandTotal}\n`;

              const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
              const url = URL.createObjectURL(blob);
              const link = document.createElement('a');
              link.href = url;
              link.download = `AI_Monthly_Abstract_${month}_${year}.csv`;
              link.click();
              URL.revokeObjectURL(url);
            }}
            className="px-8 py-4 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 font-black uppercase text-sm tracking-widest rounded-2xl transition-all shadow-sm active:scale-95 flex items-center gap-3 cursor-pointer"
            title="Download as CSV"
          >
            <Download size={20} />
            Export to CSV
          </button>

          <button 
            onClick={() => setIsPrintingAbstract(true)}
            className="px-8 py-4 bg-purple-850 hover:bg-purple-950 text-white font-black uppercase text-sm tracking-widest rounded-2xl transition-all shadow-xl shadow-purple-850/20 active:scale-95 flex items-center gap-3 cursor-pointer"
          >
            <Printer size={20} />
            Print Abstract Only
          </button>
          
          <button 
            onClick={() => setIsPrintingAll(true)}
            className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white font-black uppercase text-sm tracking-widest rounded-2xl transition-all shadow-xl shadow-amber-600/20 active:scale-95 flex items-center gap-3 cursor-pointer"
          >
            <Printer size={20} />
            Print All (Abstract + Ledgers)
          </button>
        </div>
      </div>

      {/* PRINT-ALL OVERLAY (ON-SCREEN INDICATION ONLY) */}
      {isPrintingAll && (
        <div className="print-all-preview-overlay fixed inset-0 bg-stone-900/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-white no-print">
          <div className="text-center space-y-6 max-w-lg p-8 bg-stone-950/40 rounded-[2.5rem] border border-white/10 shadow-2xl">
            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black uppercase tracking-widest text-amber-400">Preparing AI Accounts Package</h2>
              <p className="text-stone-300 text-xs font-bold uppercase tracking-wider leading-relaxed">
                Compiling the Monthly Abstract and individual ledger sheets for all {aiTotals.length} active AI Linkconer operators.
              </p>
              <p className="text-amber-500/80 text-[10px] font-black uppercase tracking-widest animate-pulse">
                Print dialog will open automatically. Please select portrait orientation in print options.
              </p>
            </div>
            <button 
              onClick={() => setIsPrintingAll(false)}
              className="px-6 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider border border-stone-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PRINT ABSTRACT OVERLAY (ON-SCREEN INDICATION ONLY) */}
      {isPrintingAbstract && (
        <div className="print-all-preview-overlay fixed inset-0 bg-stone-900/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-white no-print">
          <div className="text-center space-y-6 max-w-lg p-8 bg-stone-950/40 rounded-[2.5rem] border border-white/10 shadow-2xl">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black uppercase tracking-widest text-purple-400">Preparing AI Abstract</h2>
              <p className="text-stone-300 text-xs font-bold uppercase tracking-wider leading-relaxed">
                Compiling the Monthly Consolidated Incentive Abstract.
              </p>
              <p className="text-purple-500/80 text-[10px] font-black uppercase tracking-widest animate-pulse">
                Print dialog will open automatically. Please select portrait orientation in print options.
              </p>
            </div>
            <button 
              onClick={() => setIsPrintingAbstract(false)}
              className="px-6 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider border border-stone-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PRINT CONTAINER (ONLY VISIBLE ON PAPER) */}
      {(isPrintingAll || isPrintingAbstract) && (
        <div className="print-all-container hidden print:block text-black bg-white font-sans w-full p-0">
          
          {/* PAGES: AI LINKCONER INCENTIVE ABSTRACT */}
          {abstractChunks.map((chunk, chunkIdx) => (
            <div key={chunkIdx} className="print-page-break p-5 border-2 border-black rounded-lg h-[238mm] flex flex-col mb-8">
              <div className="text-center pb-2 border-b-2 border-black mb-3">
                <span className="text-[9px] font-bold uppercase tracking-widest text-stone-500 block mb-0.5">Accounts Department Payout Support Statement</span>
                <h1 className="text-2xl font-black text-black uppercase tracking-tight">AI Linkconer Consolidated Incentive Abstract</h1>
                <div className="mt-1 text-[10px] font-black text-stone-600 uppercase tracking-wider flex justify-between items-center px-4">
                  <span>
                    Compensation Period: <span className="text-black font-extrabold text-sm">{reportMonthYear}</span>
                  </span>
                  <span className="text-stone-700 font-extrabold">
                    Page {chunkIdx + 1} of {abstractChunks.length}
                  </span>
                </div>
              </div>

              <table className="w-full text-center border-collapse border border-black mb-3">
                <thead>
                  <tr className="bg-stone-100 border-b-2 border-black text-black text-xs font-black uppercase">
                    <th className="border border-black px-3 py-1.5 text-left">S. NO</th>
                    <th className="border border-black px-3 py-1.5 text-left">TNo</th>
                    <th className="border border-black px-3 py-1.5 text-left">AI Operator Name</th>
                    <th className="border border-black px-3 py-1.5">Days Worked</th>
                    <th className="border border-black px-3 py-1.5">Duties Assigned</th>
                    <th className="border border-black px-3 py-1.5 text-right font-black">Incentive Payout (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((row, idx) => {
                    const previousCount = abstractChunks.slice(0, chunkIdx).reduce((sum, c) => sum + c.length, 0);
                    const absoluteIdx = previousCount + idx + 1;
                    return (
                      <tr key={row.id} className="border-b border-stone-400 text-sm">
                        <td className="border border-black px-3 py-1.5 text-left font-bold">{absoluteIdx}</td>
                        <td className="border border-black px-3 py-1.5 text-left font-mono font-black text-black">{row.tNo || '—'}</td>
                        <td className="border border-black px-3 py-1.5 text-left uppercase font-bold">{row.name}</td>
                        <td className="border border-black px-3 py-1.5 font-bold">{row.workingDays}</td>
                        <td className="border border-black px-3 py-1.5 font-bold">{row.duties}</td>
                        <td className="border border-black px-3 py-1.5 text-right font-mono font-black text-black">₹{Math.round(row.amount).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Account Summary block and Signatures block are only shown on the very last page of the abstract */}
              {chunkIdx === abstractChunks.length - 1 && (
                <>
                  {/* Account Summary block */}
                  <div className="p-3 border-2 border-black bg-stone-50 rounded-lg flex items-center justify-between mb-3">
                    <div className="text-left">
                      <span className="text-[9px] font-black tracking-widest text-stone-500 uppercase">Accounts Consolidation Total</span>
                      <div className="text-black font-black uppercase text-base mt-0.5">AI Linkconer Payroll Allocation</div>
                      <p className="text-[9px] font-bold text-stone-500 uppercase mt-0.5">
                        Total payout computation of all ({printedAiTotals.length}) active AI Linkconer operators registered in the selected schedule.
                      </p>
                    </div>
                    <div className="flex gap-6 items-center">
                      <div className="text-center">
                        <span className="block text-[8px] font-black text-stone-500 uppercase tracking-widest">Active Operators</span>
                        <span className="text-lg font-black text-black">{printedAiTotals.filter(c => c.amount > 0).length}</span>
                      </div>
                      <div className="bg-black text-white px-4 py-2 rounded text-center">
                        <span className="block text-[8px] font-black text-stone-300 uppercase tracking-widest">Total Payout Release</span>
                        <span className="text-xl font-extrabold font-mono">₹{printedGrandTotal.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures block at bottom of first page */}
                  <div className="mt-auto pt-2 grid grid-cols-3 gap-6 text-center text-xs font-bold uppercase tracking-wider text-stone-700">
                    <div>
                      <div className="border-t border-black pt-1">AM/AM</div>
                    </div>
                    <div>
                      <div className="border-t border-black pt-1">GM</div>
                    </div>
                    <div>
                      <div className="border-t border-black pt-1">DIRECTOR</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* PAGES 2+: INDIVIDUAL AI OPERATOR LEDGERS */}
          {isPrintingAll && printedAiTotals.map((workerRow) => {
            const workerLedger = getWorkerLedgerForMonth(workerRow.id);
            const workerTotal = workerLedger.reduce((sum, item) => sum + item.incentive, 0);

            return (
              <div key={workerRow.id} className="print-page-break p-4 px-5 border-2 border-black rounded-lg min-h-[238mm] flex flex-col justify-between text-black bg-white mb-8">
                <div>
                  <div className="text-center pb-1.5 border-b border-black mb-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-stone-500 block mb-0.5">Worker Wise History — Supporting Documents for Payout</span>
                    <h1 className="text-lg md:text-xl font-black text-black uppercase tracking-tight">AI Linkconer Incentive Ledger Statement</h1>
                    
                    <div className="mt-1.5 flex justify-center gap-6 text-[13px] font-bold text-stone-600 uppercase tracking-wider">
                      <div>Operator Name: <span className="text-black font-extrabold text-[14px]">{workerRow.name}</span></div>
                      <div>TK. No: <span className="text-black font-extrabold text-[14px]">{workerRow.tNo || '—'}</span></div>
                      <div>Period: <span className="text-black font-extrabold text-[14px]">{reportMonthYear}</span></div>
                    </div>
                  </div>

                  <table className="w-full text-center border-collapse border border-black mb-2">
                    <thead>
                      <tr className="bg-stone-50 border-b border-black text-[11.5px] font-black uppercase text-black">
                        <th className="border border-black px-2 py-1.5 text-left">S. NO</th>
                        <th className="border border-black px-2 py-1.5 text-left">Date</th>
                        <th className="border border-black px-2 py-1.5">Shift</th>
                        <th className="border border-black px-2 py-1.5">Shift Utilisation (U%)</th>
                        <th className="border border-black px-2 py-1.5 text-right">Incentive (Rs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workerLedger.map((item, idx) => (
                        <tr key={idx} className="border-b border-stone-300 text-[11px] leading-tight font-bold text-stone-900">
                          <td className="border border-black px-2 py-1 text-left font-bold text-stone-600">{idx + 1}</td>
                          <td className="border border-black px-2 py-1 text-left font-mono font-bold text-stone-950">{item.date}</td>
                          <td className="border border-black px-2 py-1 font-bold text-stone-700">{item.shift}</td>
                          <td className="border border-black px-2 py-1 text-stone-900 font-bold">{Math.round(item.utility)}%</td>
                          <td className="border border-black px-2 py-1 font-mono font-black text-right text-black">₹{item.incentive}</td>
                        </tr>
                      ))}
                      {workerLedger.length === 0 && (
                        <tr>
                          <td colSpan={5} className="border border-black text-center py-2 text-[11px] text-stone-500 font-bold uppercase tracking-wider">
                            No active duties logged in this period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {/* Individual Summary block */}
                  <div className="p-2 px-3 border border-black bg-stone-50 rounded flex justify-between items-center mb-2">
                    <div className="text-left">
                      <span className="text-[10px] font-black tracking-widest text-stone-500 uppercase">Payout Summary</span>
                      <div className="text-black font-black uppercase text-[13px] mt-0.5">Payable Incentive Record</div>
                      <p className="text-[11.5px] font-semibold text-stone-500 uppercase mt-0.5 leading-normal">
                        Includes {workerLedger.length} active shift cycles under AI Linkconer framework
                      </p>
                    </div>
                    <div className="flex gap-4 items-center">
                      <div className="text-center">
                        <span className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">Total Duties</span>
                        <span className="text-[14px] font-black text-black">{workerLedger.length}</span>
                      </div>
                      <div className="border border-black px-2.5 py-1 bg-black text-white text-center rounded">
                        <span className="block text-[10px] font-black text-stone-300 uppercase tracking-widest">Total Amount</span>
                        <span className="text-[16px] font-black font-mono">₹{workerTotal}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Signatures block for operator sheet */}
                <div className="mt-2 pt-2 border-t border-stone-200 grid grid-cols-2 gap-4 text-center text-[11px] font-bold uppercase tracking-wider text-stone-700">
                  <div>
                    <div className="border-t border-black pt-1">Worker Signature</div>
                  </div>
                  <div>
                    <div className="border-t border-black pt-1">Authorised Signature</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PRINT STYLES */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Reset parent layout limitations to allow multi-page breaking without truncation */
          html, body, #root, 
          #root > div, 
          #root > div > main, 
          #root > div > main > div,
          #root > div > main > div > div {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            display: block !important;
            position: static !important;
          }

          body {
            background-color: white !important;
            color: black !important;
          }
          .no-print, button, select, input, nav, aside, header, footer {
            display: none !important;
          }
          .print-page-break {
            page-break-after: always !important;
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            height: 238mm !important; /* Force exact A4 printable height to prevent empty page overflow */
            box-sizing: border-box !important;
            background: white !important;
            color: black !important;
          }
          .print-page-break:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          @page {
            size: A4 portrait !important;
            margin: 12mm 10mm 12mm 10mm !important;
          }
        }
      `}} />
    </div>
  );
};

