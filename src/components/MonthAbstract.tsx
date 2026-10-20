import React, { useMemo, useState, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, ProductionEntry, Shift, FrozenMonthRecord } from '../types';
import { cn, calculateIncentive, resolveWorker, findDuplicatesInReport, getGaiterIncentive, parseUniversalDateParts } from '../lib/utils';
import { Printer, TrendingUp, Sparkles, ChevronRight, Download, Lock, Unlock } from 'lucide-react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';
import { getMonthKey } from '../lib/frozenMonths';

interface MonthAbstractProps {
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

export const MonthAbstract: React.FC<MonthAbstractProps> = ({ 
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
  const monthlyDuplicates = useMemo(() => {
    const filteredHistory = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      return parts.month === month && parts.year === year;
    });

    const results: any[] = [];
    filteredHistory.forEach(report => {
      const dups = findDuplicatesInReport(report, workers);
      results.push(...dups);
    });
    return results;
  }, [history, workers, month, year]);

  const siderTotals = useMemo(() => {
    if (isFrozen && frozenRecord && frozenRecord.siderAbstract) {
      return frozenRecord.siderAbstract.map(item => ({
        id: item.id,
        name: item.name,
        tNo: item.tNo,
        amount: item.amount,
        workingDays: item.workedDaysCount,
        entriesCount: item.workedDaysCount,
        avgGps: item.workedDaysCount > 0 && item.gpsAcc ? Math.round(item.gpsAcc / item.workedDaysCount) : 0
      })).filter(t => t.amount > 0);
    }

    // Filter history for the selected month and year
    const filteredHistory = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      return parts.month === month && parts.year === year;
    });

    // We want to calculate totals for each unique sider found in filtered history
    const totals = new Map<string, { 
      id: string; 
      name: string; 
      tNo: string; 
      amount: number;
      workedDays: Set<string>;
      gpsAcc: number;
      gpsCount: number;
      entriesCount: number;
    }>();
    
    // Seed with current workers to ensure we have their correct names/TNo
    workers.forEach(w => {
      const key = w.tNo || w.id;
      if (key) {
        totals.set(key, { 
          id: w.id, 
          name: w.name, 
          tNo: w.tNo, 
          amount: 0,
          workedDays: new Set<string>(),
          gpsAcc: 0,
          gpsCount: 0,
          entriesCount: 0
        });
      }
    });

    filteredHistory.forEach(report => {
      if (!report || !report.entries) return;
      
      const dailyIncentives = new Map<string, { worker: Sider; amount: number; gps: number; entryCount: number }>();

      // Calculate machine siders
      report.entries.forEach(entry => {
        const assignedIds = new Set<string>();
        if (entry.siderId) assignedIds.add(entry.siderId);
        if (entry.siderIds) {
          entry.siderIds.forEach(id => {
            if (id) assignedIds.add(id);
          });
        }

        const amount = calculateIncentive(entry, rules, report.date);
        
        assignedIds.forEach(id => {
           const worker = resolveWorker(id, entry.siderName, workers);
           const tNo = worker.tNo || worker.id;
           if (!tNo) return;

           const existing = dailyIncentives.get(tNo) || { worker, amount: 0, gps: 0, entryCount: 0 };
           existing.amount += amount;
           existing.gps += entry.gpsActual;
           existing.entryCount += 1;
           dailyIncentives.set(tNo, existing);
        });
      });

      // Calculate gaiters
      const shifts: Shift[] = ['I', 'II', 'III'];
      shifts.forEach(shift => {
        const shiftEntries = report.entries.filter(e => e.shift === shift);
        if (shiftEntries.length === 0) return;
        
        const shiftGaiterIds = report.gaiters?.[shift] || [];
        const incentive = getGaiterIncentive(report, shift, rules, workers);
        const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);

        shiftGaiterIds.forEach(gid => {
          const worker = resolveWorker(gid, undefined, workers);
          const tNo = worker.tNo || worker.id;
          if (!tNo) return;

          const existing = dailyIncentives.get(tNo) || { worker, amount: 0, gps: 0, entryCount: 0 };
          existing.amount += incentive;
          existing.gps += minGpsEntry ? minGpsEntry.gpsActual : 0;
          existing.entryCount += 1;
          dailyIncentives.set(tNo, existing);
        });
      });

      // Add capped daily incentives to the monthly totals
      dailyIncentives.forEach((val, key) => {
        const cappedAmount = Math.min(120, val.amount);
        if (totals.has(key)) {
          const current = totals.get(key)!;
          current.amount += cappedAmount;
          current.workedDays.add(report.date);
          current.gpsAcc += val.gps;
          current.gpsCount += val.entryCount;
          current.entriesCount += val.entryCount;
        } else {
          totals.set(key, {
            id: val.worker.id,
            name: val.worker.name,
            tNo: key,
            amount: cappedAmount,
            workedDays: new Set<string>([report.date]),
            gpsAcc: val.gps,
            gpsCount: val.entryCount,
            entriesCount: val.entryCount
          });
        }
      });
    });

    return Array.from(totals.values())
      .map(item => ({
        ...item,
        workingDays: item.workedDays.size,
        avgGps: item.gpsCount > 0 ? Math.round(item.gpsAcc / item.gpsCount) : 0
      }))
      .filter(t => {
        if (t.amount <= 0) return false;
        
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
  }, [history, workers, month, year]);

  const [currentTvPage, setCurrentTvPage] = useState(0);

  const reportMonthYear = useMemo(() => {
    return new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [month, year]);

  const grandTotal = useMemo(() => {
    return siderTotals.reduce((acc, curr) => acc + curr.amount, 0);
  }, [siderTotals]);

  const handleExportToExcel = () => {
    // 1. Prepare rows
    const excelRows: any[] = siderTotals.map((row, idx) => ({
      'S. NO': idx + 1,
      'TNo': row.tNo || '—',
      'Operator / Sider Name': row.name,
      'Days Worked': row.workingDays,
      'Duties Assigned': row.entriesCount,
      'Monthly Avg GPS': row.avgGps > 0 ? row.avgGps : '—',
      'Incentive Payout (INR)': row.amount
    }));

    // 2. Add Grand Total row
    excelRows.push({
      'S. NO': 'Total',
      'TNo': '',
      'Operator / Sider Name': '',
      'Days Worked': '',
      'Duties Assigned': '',
      'Monthly Avg GPS': '',
      'Incentive Payout (INR)': grandTotal
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Apply column widths
    ws['!cols'] = [
      { wch: 8 },  // S. NO
      { wch: 12 }, // TNo
      { wch: 30 }, // Operator / Sider Name
      { wch: 15 }, // Days Worked
      { wch: 18 }, // Duties Assigned
      { wch: 18 }, // Monthly Avg GPS
      { wch: 24 }  // Incentive Payout (INR)
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Incentive Abstract');
    XLSX.writeFile(wb, `KTTM_Ringframe_Operator_Incentive_Abstract_${reportMonthYear.replace(/\s+/g, '_')}.xlsx`);
  };

  const handleExportToCSV = () => {
    let csv = `KTTM SPINNING MILLS - MONTHLY INCENTIVE ABSTRACT (${reportMonthYear})\n\n`;
    csv += `S. NO,TNo,Operator / Sider Name,Days Worked,Duties Assigned,Monthly Avg GPS,Incentive Payout (INR)\n`;

    siderTotals.forEach((row, idx) => {
      csv += `${idx + 1},"${row.tNo || ''}","${row.name}",${row.workingDays},${row.entriesCount},${row.avgGps > 0 ? row.avgGps : 0},${row.amount}\n`;
    });

    csv += `TOTAL,,,,,,${grandTotal}\n`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `KTTM_Incentive_Abstract_${reportMonthYear.replace(/\s+/g, '_')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Dynamically divide into columns so ALL persons are included and balanced perfectly
  const totalCount = siderTotals.length;
  const halfLength = Math.ceil(totalCount / 2);
  const leftColumn = siderTotals.slice(0, halfLength);
  const rightColumn = siderTotals.slice(halfLength);
  
  const leftTotal = leftColumn.reduce((acc, curr) => acc + curr.amount, 0);
  const rightTotal = rightColumn.reduce((acc, curr) => acc + curr.amount, 0);

  // TV view paging parameters: 15 items per page (e.g., 8 in left, 7 in right column)
  const itemsPerPage = 15;
  const totalTvPages = Math.max(1, Math.ceil(siderTotals.length / itemsPerPage));

  useEffect(() => {
    if (!isTvMode || totalTvPages <= 1) return;
    const timer = setInterval(() => {
      setCurrentTvPage(prev => (prev + 1) % totalTvPages);
    }, (tvPageInterval || 15) * 1000); // respects set page timer!
    return () => clearInterval(timer);
  }, [isTvMode, totalTvPages, tvPageInterval]);

  useEffect(() => {
    if (currentTvPage >= totalTvPages) {
      setCurrentTvPage(0);
    }
  }, [totalTvPages, currentTvPage]);

  useEffect(() => {
    if (isTvMode && onPagesDetermined) {
      onPagesDetermined(totalTvPages);
    }
  }, [isTvMode, totalTvPages, onPagesDetermined]);

  const pageStartIndex = currentTvPage * itemsPerPage;
  const currentTvPageItems = useMemo(() => {
    if (isTvMode) {
      return siderTotals.slice(pageStartIndex, pageStartIndex + itemsPerPage);
    }
    return [];
  }, [siderTotals, isTvMode, pageStartIndex, itemsPerPage]);

  const halfLengthTv = useMemo(() => {
    return Math.ceil(currentTvPageItems.length / 2);
  }, [currentTvPageItems]);

  const leftTvColumn = useMemo(() => {
    if (isTvMode) {
      return currentTvPageItems.slice(0, halfLengthTv);
    }
    return [];
  }, [currentTvPageItems, isTvMode, halfLengthTv]);

  const rightTvColumn = useMemo(() => {
    if (isTvMode) {
      return currentTvPageItems.slice(halfLengthTv);
    }
    return [];
  }, [currentTvPageItems, isTvMode, halfLengthTv]);

  const leftTvTotal = useMemo(() => {
    return leftTvColumn.reduce((acc, curr) => acc + curr.amount, 0);
  }, [leftTvColumn]);

  const rightTvTotal = useMemo(() => {
    return rightTvColumn.reduce((acc, curr) => acc + curr.amount, 0);
  }, [rightTvColumn]);

  // Print template header (Normal view)
  const TableHeader = () => (
    <thead className="bg-[#e2efda]">
      <tr className="border-[2px] border-stone-800">
        <th className="px-4 py-3 border-r-[2px] border-stone-800 text-lg font-black text-stone-900 w-16">S. NO</th>
        <th className="px-4 py-3 border-r-[2px] border-stone-800 text-lg font-black text-stone-900 w-24 text-left">TK No</th>
        <th className="px-4 py-3 border-r-[2px] border-stone-800 text-lg font-black text-stone-900 text-left">Name</th>
        <th className="px-4 py-3 text-lg font-black text-stone-900 w-44 text-right">Total Amount</th>
      </tr>
    </thead>
  );

  // TV mode component
  if (isTvMode) {
    return (
      <div className="w-full h-full bg-white rounded-3xl border border-stone-200 p-6 xl:p-8 text-stone-900 font-sans flex flex-col justify-between overflow-hidden shadow-xs animate-in fade-in duration-300">
        {/* Top Header */}
        <div className="text-center mb-8 relative">
          <div className="flex items-center justify-center gap-2 text-emerald-700 font-extrabold text-sm uppercase tracking-widest mb-2">
            <Sparkles size={16} className="animate-spin text-amber-500" />
            Live Consolidated Incentive abstract {totalTvPages > 1 && `(Page ${currentTvPage + 1} of ${totalTvPages})`}
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-emerald-800 via-teal-700 to-emerald-950 drop-shadow-md pb-3">
            Monthly Incentive Abstract {reportMonthYear}
          </h1>
          <div className="bg-gradient-to-r from-transparent via-emerald-600 to-transparent h-1.5 w-1/2 mx-auto rounded-full" />
        </div>

        {/* Dynamic High Contrast Screen Grid */}
        <div className="max-w-[98%] mx-auto grid grid-cols-1 xl:grid-cols-2 gap-8 items-start flex-1 overflow-hidden">
          
          {/* Left Table Panel */}
          <motion.div 
            initial={{ opacity: 0, x: -50 }}
            animate={{ opacity: 1, x: 0 }}
            key={`left-page-${currentTvPage}`}
            transition={{ duration: 0.6 }}
            className="bg-stone-50/50 rounded-[2.5rem] border-2 border-emerald-900/15 p-8 shadow-xl"
          >
            <table className="w-full border-collapse font-sans">
              <thead>
                <tr className="bg-emerald-800 text-white border-b-2 border-emerald-900 text-[20px] font-black h-16">
                  <th className="px-5 text-center w-24 rounded-tl-2xl">S. NO</th>
                  <th className="px-5 text-left w-36">TK No</th>
                  <th className="px-5 text-left">Name of Operator</th>
                  <th className="px-6 text-right w-52 rounded-tr-2xl">Incentive Amt</th>
                </tr>
              </thead>
              <tbody>
                {leftTvColumn.map((item, idx) => {
                  const isDup = monthlyDuplicates.some(d => d.workerId === item.id || d.tNo === item.tNo);
                  return (
                    <motion.tr 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                      key={item.id} 
                      className={cn(
                        "border-b border-stone-200/80 h-16 hover:bg-stone-100/50 transition-colors",
                        isDup && "bg-red-50/70 hover:bg-red-100/80"
                      )}
                    >
                      <td className="px-5 text-center text-[21px] font-extrabold text-stone-550">{pageStartIndex + idx + 1}</td>
                      <td className="px-5 text-left text-[21px] font-black text-emerald-700 font-mono">{item.tNo}</td>
                      <td className="px-5 text-left text-[21px] font-bold uppercase tracking-tight text-stone-900 flex items-center gap-2 h-16">
                        <ChevronRight size={18} className="text-emerald-600 shrink-0" />
                        <span className={cn(isDup && "text-red-700 font-extrabold")}>{item.name}</span>
                        {isDup && (
                          <span className="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded tracking-wider animate-pulse shrink-0">
                            ⚠️ DUP
                          </span>
                        )}
                      </td>
                      <td className="px-6 text-right text-[22px] font-black text-stone-950 font-mono">₹{Math.round(item.amount).toLocaleString()}</td>
                    </motion.tr>
                  );
                })}
                {/* Fill empty placeholder if left side has fewer items than 8 */}
                {leftTvColumn.length < 8 && Array.from({ length: 8 - leftTvColumn.length }).map((_, i) => (
                  <tr key={`empty-fill-l-${i}`} className="border-b border-stone-100 h-16">
                    <td className="px-5">&nbsp;</td>
                    <td className="px-5">&nbsp;</td>
                    <td className="px-5">&nbsp;</td>
                    <td className="px-6">&nbsp;</td>
                  </tr>
                ))}
                {/* Fallback empty view */}
                {leftTvColumn.length === 0 && (
                  <tr>
                    <td colSpan={4} className="h-32 text-center text-stone-500 text-lg uppercase tracking-widest font-bold">
                      No Records
                    </td>
                  </tr>
                )}
                {/* Visual total for left column */}
                <tr className="bg-emerald-50/50 font-black h-16 border-t-2 border-stone-200">
                  <td colSpan={3} className="px-6 text-right text-[18px] uppercase tracking-wider text-emerald-800">Panel Column A Total:</td>
                  <td className="px-6 text-right text-[26px] font-black text-emerald-900 font-mono">
                    ₹{leftTvTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </motion.div>

          {/* Right Table Panel */}
          <motion.div 
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            key={`right-page-${currentTvPage}`}
            transition={{ duration: 0.6 }}
            className="bg-stone-50/50 rounded-[2.5rem] border-2 border-emerald-900/15 p-8 shadow-xl"
          >
            <table className="w-full border-collapse font-sans">
              <thead>
                <tr className="bg-emerald-800 text-white border-b-2 border-emerald-900 text-[20px] font-black h-16">
                  <th className="px-5 text-center w-24 rounded-tl-2xl">S. NO</th>
                  <th className="px-5 text-left w-36">TK No</th>
                  <th className="px-5 text-left">Name of Operator</th>
                  <th className="px-6 text-right w-52 rounded-tr-2xl">Incentive Amt</th>
                </tr>
              </thead>
              <tbody>
                {rightTvColumn.map((item, idx) => {
                  const isDup = monthlyDuplicates.some(d => d.workerId === item.id || d.tNo === item.tNo);
                  return (
                    <motion.tr 
                      initial={{ opacity: 0, y: 15 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                      key={item.id} 
                      className={cn(
                        "border-b border-stone-200/80 h-16 hover:bg-stone-100/50 transition-colors",
                        isDup && "bg-red-50/70 hover:bg-red-100/80"
                      )}
                    >
                      <td className="px-5 text-center text-[21px] font-extrabold text-stone-550">{pageStartIndex + halfLengthTv + idx + 1}</td>
                      <td className="px-5 text-left text-[21px] font-black text-emerald-700 font-mono">{item.tNo}</td>
                      <td className="px-5 text-left text-[21px] font-bold uppercase tracking-tight text-stone-900 flex items-center gap-2 h-16">
                        <ChevronRight size={18} className="text-emerald-600 shrink-0" />
                        <span className={cn(isDup && "text-red-700 font-extrabold")}>{item.name}</span>
                        {isDup && (
                          <span className="bg-red-600 text-white font-black text-[10px] px-2 py-0.5 rounded tracking-wider animate-pulse shrink-0">
                            ⚠️ DUP
                          </span>
                        )}
                      </td>
                      <td className="px-6 text-right text-[22px] font-black text-stone-950 font-mono">₹{Math.round(item.amount).toLocaleString()}</td>
                    </motion.tr>
                  );
                })}
                {/* Fill empty placeholder if right side has fewer items than left (or fewer than 8) */}
                {rightTvColumn.length < 8 && Array.from({ length: 8 - rightTvColumn.length }).map((_, i) => (
                  <tr key={`empty-fill-${i}`} className="border-b border-stone-100 h-16">
                    <td className="px-5">&nbsp;</td>
                    <td className="px-5">&nbsp;</td>
                    <td className="px-5">&nbsp;</td>
                    <td className="px-6">&nbsp;</td>
                  </tr>
                ))}
                {/* Fallback empty view */}
                {rightTvColumn.length === 0 && leftTvColumn.length === 0 && (
                  <tr>
                    <td colSpan={4} className="h-32 text-center text-stone-500 text-lg uppercase tracking-widest font-bold">
                      No Records
                    </td>
                  </tr>
                )}
                {/* Visual total for right column */}
                <tr className="bg-emerald-50/50 font-black h-16 border-t-2 border-stone-200">
                  <td colSpan={3} className="px-6 text-right text-[18px] uppercase tracking-wider text-emerald-800">Panel Column B Total:</td>
                  <td className="px-6 text-right text-[26px] font-black text-emerald-900 font-mono">
                    ₹{rightTvTotal.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </motion.div>

        </div>

        {/* Page Indicators */}
        {totalTvPages > 1 && (
          <div className="flex justify-center gap-3 mt-6">
            {Array.from({ length: totalTvPages }).map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentTvPage(i)}
                className={cn(
                  "w-3.5 h-3.5 rounded-full transition-all duration-300 pointer-events-auto cursor-pointer",
                  currentTvPage === i 
                    ? "bg-emerald-600 w-10 shadow-[0_0_12px_rgba(5,150,105,0.4)]" 
                    : "bg-stone-300 hover:bg-stone-400"
                )}
                title={`Go to Page ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* Floating Glowing Grand Total Panel */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="max-w-[98%] mx-auto mt-12 bg-gradient-to-r from-emerald-50 via-white to-emerald-50 border-4 border-emerald-700/85 rounded-[2.5rem] p-6 shadow-xl flex flex-col md:flex-row items-center justify-between"
        >
          <div className="flex items-center gap-4 mb-4 md:mb-0">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center border border-emerald-200">
              <TrendingUp size={30} className="text-emerald-700 animate-pulse" />
            </div>
            <div>
              <h3 className="text-2xl font-black tracking-wide text-emerald-950 uppercase">Grand Total Incentives</h3>
              <p className="text-sm text-stone-600 font-extrabold uppercase tracking-widest">Sider & Gaiter Payouts Consolidated</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-6xl md:text-7xl font-extrabold tabular-nums tracking-normal text-transparent bg-clip-text bg-gradient-to-r from-emerald-850 via-teal-750 to-emerald-950 font-mono">
              ₹{grandTotal.toLocaleString()}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  // Normal Print / Paper View (Preserved exactly with the dynamic split to avoid cutting any people off!)
  return (
    <div className="bg-white p-6 min-h-screen text-stone-900 font-sans animate-in fade-in duration-500">
      {/* Freeze / Lock Status Banner */}
      <div className="max-w-[1600px] mx-auto mb-6 no-print">
        {isFrozen && frozenRecord ? (
          <div className="p-4 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-amber-900">
              <div className="p-2.5 bg-amber-500/20 rounded-xl">
                <Lock className="text-amber-700 shrink-0" size={24} />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase tracking-wider text-amber-900 flex items-center gap-2">
                  <span>🔒 Month Incentive Abstract Frozen (Locked for Accounts)</span>
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
          <div className="p-4 bg-emerald-500/10 border-2 border-emerald-500/30 rounded-2xl flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 text-emerald-900">
              <div className="p-2.5 bg-emerald-500/20 rounded-xl">
                <Unlock className="text-emerald-700 shrink-0" size={24} />
              </div>
              <div>
                <h3 className="font-black text-sm uppercase tracking-wider text-emerald-900">
                  Live Incentive Calculation (Not Frozen)
                </h3>
                <p className="text-xs text-emerald-800 font-medium mt-0.5">
                  Freeze this month before submitting to Accounts to lock paid amounts permanently against machine or rule changes.
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                if (confirm(`Freeze monthly incentive amount for ${reportMonthYear}? This will lock the paid abstract figures for Accounts submission.`)) {
                  onToggleFreezeMonth?.(month, year);
                }
              }}
              className="bg-emerald-800 hover:bg-emerald-900 text-white px-4 py-2.5 rounded-xl font-black text-xs uppercase flex items-center gap-2 shadow-md transition-all cursor-pointer"
            >
              <Lock size={16} />
              Freeze Month (Lock for Accounts)
            </button>
          </div>
        )}
      </div>

      <div className="text-center mb-10 relative flex items-center justify-center">
        <h2 className="text-5xl font-black uppercase tracking-tight">Monthly Incentive Abstract {reportMonthYear}</h2>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center gap-3 no-print">
          <button 
            onClick={handleExportToExcel}
            className="p-3 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full transition-all shadow-sm flex items-center justify-center cursor-pointer"
            title="Export to Excel"
          >
            <Download size={24} />
          </button>
          <button 
            onClick={() => window.print()}
            className="p-3 bg-stone-100 hover:bg-stone-200 text-stone-600 rounded-full transition-all shadow-sm flex items-center justify-center cursor-pointer"
            title="Print Abstract"
          >
            <Printer size={24} />
          </button>
        </div>
      </div>

      <div className="max-w-[1600px] mx-auto flex gap-16 justify-center items-start">
        {/* Left Table */}
        <div className="flex-1">
          <table className="w-full border-collapse border-[2px] border-stone-800">
            <TableHeader />
            <tbody>
              {leftColumn.map((item, idx) => {
                const isDup = monthlyDuplicates.some(d => d.workerId === item.id || d.tNo === item.tNo);
                return (
                  <tr 
                    key={item.id} 
                    className={cn(
                      "border border-stone-800 h-11",
                      isDup && "bg-red-50"
                    )}
                  >
                    <td className="px-4 py-2 border-r border-stone-800 text-base text-center">{idx + 1}</td>
                    <td className="px-4 py-2 border-r border-stone-800 text-base text-left text-green-800 font-bold">{item.tNo}</td>
                    <td className="px-4 py-2 border-r border-stone-800 text-base text-left whitespace-nowrap overflow-hidden text-ellipsis uppercase font-bold flex items-center justify-between">
                      <span className={cn(isDup && "text-red-700 font-extrabold")}>{item.name}</span>
                      {isDup && (
                        <span className="text-red-600 font-black text-[9px] border border-red-200 bg-red-100 px-1 rounded uppercase tracking-wider shrink-0 no-print">
                          ⚠️ DUP
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-2 text-base text-right font-black tabular-nums">{Math.round(item.amount).toLocaleString()}</td>
                  </tr>
                );
              })}
              {/* Fill remaining to balance view if needed */}
              {Array.from({ length: Math.max(0, 13 - leftColumn.length) }).map((_, i) => (
                <tr key={`empty-l-${i}`} className="border border-stone-800 h-11">
                  <td className="border-r border-stone-800">&nbsp;</td>
                  <td className="border-r border-stone-800">&nbsp;</td>
                  <td className="border-r border-stone-800">&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              ))}
              <tr className="border-[2px] border-stone-800 bg-stone-50">
                <td colSpan={3} className="h-14"></td>
                <td className="px-6 py-2 text-3xl font-black text-rose-600 text-right tabular-nums">
                   ₹{leftTotal.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Right Table */}
        <div className="flex-1">
          <table className="w-full border-collapse border-[2px] border-stone-800">
            <TableHeader />
            <tbody>
              {rightColumn.map((item, idx) => {
                const isDup = monthlyDuplicates.some(d => d.workerId === item.id || d.tNo === item.tNo);
                return (
                  <tr 
                    key={item.id} 
                    className={cn(
                      "border border-stone-800 h-11",
                      isDup && "bg-red-50"
                    )}
                  >
                    <td className="px-4 py-2 border-r border-stone-800 text-base text-center">{idx + halfLength + 1}</td>
                    <td className="px-4 py-2 border-r border-stone-800 text-base text-left text-green-800 font-bold">{item.tNo}</td>
                    <td className="px-4 py-2 border-r border-stone-800 text-base text-left whitespace-nowrap overflow-hidden text-ellipsis uppercase font-bold flex items-center justify-between">
                      <span className={cn(isDup && "text-red-700 font-extrabold")}>{item.name}</span>
                      {isDup && (
                        <span className="text-red-600 font-black text-[9px] border border-red-200 bg-red-100 px-1 rounded uppercase tracking-wider shrink-0 no-print">
                          ⚠️ DUP
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-2 text-base text-right font-black tabular-nums">{Math.round(item.amount).toLocaleString()}</td>
                  </tr>
                );
              })}
              {/* Fill remaining to balance view if needed */}
              {Array.from({ length: Math.max(0, 13 - rightColumn.length) }).map((_, i) => (
                <tr key={`empty-r-${i}`} className="border border-stone-800 h-11">
                  <td className="border-r border-stone-800">&nbsp;</td>
                  <td className="border-r border-stone-800">&nbsp;</td>
                  <td className="border-r border-stone-800">&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              ))}
              <tr className="border-[2px] border-stone-800 bg-stone-50">
                <td colSpan={3} className="h-14"></td>
                <td className="px-6 py-2 text-3xl font-black text-rose-600 text-right tabular-nums">
                   ₹{rightTotal.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Global Total Bar */}
      <div className="max-w-[1600px] mx-auto mt-10 border-4 border-stone-800 flex h-24 items-center overflow-hidden rounded-sm shadow-xl">
        <div className="w-[200px] text-4xl font-black italic text-rose-600 px-8 uppercase tracking-tighter bg-stone-50 h-full flex items-center border-r-4 border-stone-800">Total</div>
        <div className="flex-1 text-7xl font-black text-rose-600 text-center tracking-[0.25em] bg-white h-full flex items-center justify-center tabular-nums">
          ₹{grandTotal.toLocaleString()}
        </div>
      </div>

      <div className="mt-8 text-center no-print flex flex-col sm:flex-row gap-4 justify-center items-center">
        <button 
          onClick={handleExportToExcel}
          className="px-8 py-4 bg-emerald-700 text-white font-black uppercase text-sm tracking-widest rounded-2xl hover:bg-emerald-800 transition-all shadow-xl shadow-emerald-700/20 active:scale-95 flex items-center gap-3 cursor-pointer"
        >
          <Download size={20} />
          Export to Excel
        </button>
        <button 
          onClick={handleExportToCSV}
          className="px-8 py-4 bg-stone-100 text-stone-800 border border-stone-300 font-black uppercase text-sm tracking-widest rounded-2xl hover:bg-stone-200 transition-all shadow-sm active:scale-95 flex items-center gap-3 cursor-pointer"
        >
          <Download size={20} />
          Export to CSV
        </button>
        <button 
          onClick={() => window.print()}
          className="px-8 py-4 bg-stone-900 text-white font-black uppercase text-sm tracking-widest rounded-2xl hover:bg-stone-850 transition-all shadow-xl shadow-stone-900/20 active:scale-95 flex items-center gap-3 cursor-pointer"
        >
          <Printer size={20} />
          Print Monthly Abstract
        </button>
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
    </div>
  );
};


