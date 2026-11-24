import React, { useMemo, useState, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift, FrozenMonthRecord } from '../types';
import { Printer, Zap, ChevronRight, TrendingUp, Lock, Unlock, Download, FileSpreadsheet, Users, Coins, Calendar } from 'lucide-react';
import { cn, parseUniversalDateParts, parseUniversalDate } from '../lib/utils';
import { motion } from 'motion/react';
import { getMonthKey } from '../lib/frozenMonths';
import { CalendarMonthPicker } from './CalendarPickers';
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
  onMonthChange?: (month: number) => void;
  onYearChange?: (year: number) => void;
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
  onToggleFreezeMonth,
  onMonthChange,
  onYearChange
}) => {
  const monthKey = getMonthKey(month, year);
  const frozenRecord = frozenMonths?.[monthKey];
  const isFrozen = !!frozenRecord;
  const [isPrintingAbstract, setIsPrintingAbstract] = useState<boolean>(false);
  const [isPrintingAll, setIsPrintingAll] = useState<boolean>(false);
  const [omittedWorkerIds, setOmittedWorkerIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isPrintingAbstract || isPrintingAll) {
      const timer = setTimeout(() => {
        window.print();
        setIsPrintingAbstract(false);
        setIsPrintingAll(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isPrintingAbstract, isPrintingAll]);

  const aiTotals = useMemo(() => {
    if (isFrozen && frozenRecord && frozenRecord.aiAbstract) {
      return frozenRecord.aiAbstract.map(item => ({
        id: item.id,
        name: item.name,
        tNo: item.tNo,
        amount: item.amount,
        duties: item.duties || item.workedDaysCount,
        workingDays: item.workedDaysCount
      })).filter(t => t.amount > 0 || t.duties > 0);
    }

    const filteredHistory = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      return parts.month === month && parts.year === year;
    });

    const totals = new Map<string, {
      id: string;
      name: string;
      tNo: string;
      amount: number;
      duties: number;
      workedDaysCount: Set<string>;
    }>();
    
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

          const shiftEntries = report.entries.filter(e => e.shift === shift);
          const utilEntries = shiftEntries.filter(e => {
            return typeof e.utility === 'number' && !isNaN(e.utility) && e.utility > 0;
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
          if (matchedRule && Array.isArray(matchedRule.payouts)) {
            const sortedPayouts = [...matchedRule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
            const bestPayout = sortedPayouts.find(p => Math.round(avgUtility) >= p.gpsThreshold);
            incentive = bestPayout ? bestPayout.amount : 0;
          }

          const existing = totals.get(tNo) || {
            id: worker.id,
            name: worker.name,
            tNo,
            amount: 0,
            duties: 0,
            workedDaysCount: new Set<string>()
          };

          existing.amount += incentive;
          existing.duties += 1;
          existing.workedDaysCount.add(report.date);
          totals.set(tNo, existing);
        });
      });
    });

    return Array.from(totals.values())
      .map(t => ({
        ...t,
        workingDays: t.workedDaysCount.size
      }))
      .filter(t => t.amount > 0 || t.duties > 0)
      .sort((a, b) => {
        const aNum = parseInt(a.tNo);
        const bNum = parseInt(b.tNo);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.name.localeCompare(b.name);
      });
  }, [history, workers, rules, month, year, isFrozen, frozenRecord]);

  const reportMonthYear = useMemo(() => {
    return new Date(year, month - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [month, year]);

  const printedRows = useMemo(() => {
    return aiTotals.filter(item => !omittedWorkerIds.has(item.id));
  }, [aiTotals, omittedWorkerIds]);

  const grandTotal = aiTotals.reduce((acc, curr) => acc + curr.amount, 0);
  const printedGrandTotal = printedRows.reduce((acc, curr) => acc + curr.amount, 0);

  const formatDisplayDate = (d: string) => {
    const p = parseUniversalDateParts(d);
    if (!p) return d;
    return `${p.day.toString().padStart(2, '0')}/${p.month.toString().padStart(2, '0')}/${p.year}`;
  };

  const getAiWorkerDuties = (workerId: string) => {
    const targetWorker = workers.find(w => w.id === workerId || w.tNo === workerId);
    if (!targetWorker) return { rows: [], total: 0, avgUtil: 0 };

    const rows: { date: string; shift: Shift; utility: number; incentive: number; count: string }[] = [];

    const filteredHistory = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      return parts.month === month && parts.year === year;
    });

    filteredHistory.forEach(report => {
      const shifts: Shift[] = ['I', 'II', 'III'];
      shifts.forEach(shift => {
        const shiftAiConeIds = report.aiCones?.[shift] || [];
        const isMatched = shiftAiConeIds.some(id => {
          if (!id) return false;
          const target = String(id).toLowerCase().trim();
          return target === targetWorker.id.toLowerCase().trim() ||
                 target === targetWorker.tNo.toLowerCase().trim() ||
                 target === targetWorker.name.toLowerCase().trim();
        });

        if (isMatched) {
          const shiftEntries = report.entries?.filter(e => e.shift === shift) || [];
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
          if (matchedRule && Array.isArray(matchedRule.payouts)) {
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
      const order: Record<Shift, number> = { 'I': 1, 'II': 2, 'III': 3 };
      return order[a.shift] - order[b.shift];
    });

    const total = sortedRows.reduce((sum, r) => sum + r.incentive, 0);
    const avgUtil = sortedRows.length > 0 ? sortedRows.reduce((sum, r) => sum + r.utility, 0) / sortedRows.length : 0;
    return { rows: sortedRows, total, avgUtil };
  };

  const handleExportToExcel = () => {
    const excelRows = aiTotals.map((item, idx) => ({
      'S. NO': idx + 1,
      'TK No': item.tNo || 'N/A',
      'Operator Name': item.name,
      'Days Worked': item.workingDays,
      'Duties Assigned': item.duties,
      'Incentive Payout (INR)': Math.round(item.amount)
    }));

    excelRows.push({
      'S. NO': '',
      'TK No': '',
      'Operator Name': 'TOTAL',
      'Days Worked': '',
      'Duties Assigned': '',
      'Incentive Payout (INR)': Math.round(grandTotal)
    } as any);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);
    ws['!cols'] = [
      { wch: 8 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 16 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'AI Abstract');
    XLSX.writeFile(wb, `AI_Linkconer_Incentive_Abstract_${month}_${year}.xlsx`);
  };

  const handleExportToCSV = () => {
    let csv = `KTTM SPINNING MILLS - AI LINKCONER INCENTIVE ABSTRACT (${reportMonthYear})\n\n`;
    csv += `S. NO,TK No,Operator Name,Days Worked,Duties Assigned,Incentive Payout (INR)\n`;

    aiTotals.forEach((row, idx) => {
      csv += `${idx + 1},"${row.tNo || ''}","${row.name}",${row.workingDays},${row.duties},${Math.round(row.amount)}\n`;
    });

    csv += `TOTAL,,,,,${Math.round(grandTotal)}\n`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `AI_Linkconer_Abstract_${month}_${year}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isTvMode && onPagesDetermined) {
      onPagesDetermined(1);
    }
  }, [isTvMode, onPagesDetermined]);

  if (isTvMode) {
    return (
      <div className="w-full h-full bg-white rounded-3xl border border-stone-200 p-6 xl:p-8 text-stone-900 font-sans flex flex-col justify-between overflow-hidden shadow-xs animate-in fade-in duration-300">
        {/* Top Header */}
        <div className="text-center mb-8 relative">
          <div className="flex items-center justify-center gap-2 text-purple-700 font-extrabold text-sm uppercase tracking-widest mb-2">
            <Zap size={16} className="text-amber-500" />
            AI Operator Monthly Performance Abstract
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-wider text-stone-900 pb-2">
            AI Monthly Incentive Abstract — {reportMonthYear}
          </h1>
          <div className="bg-gradient-to-r from-transparent via-purple-600 to-transparent h-1.5 w-1/2 mx-auto rounded-full mt-2" />
        </div>

        <div className="max-w-6xl mx-auto w-full flex-1 overflow-hidden flex flex-col justify-center">
          <div className="bg-stone-50 rounded-3xl border border-stone-200 p-6 shadow-xs overflow-x-auto">
            <table className="w-full border-collapse font-sans text-base md:text-lg">
              <thead>
                <tr className="bg-purple-800 text-white font-black h-14 text-base md:text-lg uppercase tracking-wider">
                  <th className="px-5 text-center w-24 rounded-tl-2xl border-r border-purple-700">S. NO</th>
                  <th className="px-5 text-left w-36 border-r border-purple-700">TK No</th>
                  <th className="px-6 text-left border-r border-purple-700">Name of Operator</th>
                  <th className="px-5 text-center w-32 border-r border-purple-700">Days</th>
                  <th className="px-5 text-center w-32 border-r border-purple-700">Duties</th>
                  <th className="px-6 text-right w-48 rounded-tr-2xl">Incentive (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-200 text-lg md:text-xl font-bold">
                {aiTotals.map((item, idx) => (
                  <tr key={item.id} className="h-14 hover:bg-purple-50/30 transition-colors">
                    <td className="px-5 text-center font-bold text-stone-500 border-r border-stone-200">{idx + 1}</td>
                    <td className="px-5 text-left font-black text-purple-800 font-mono border-r border-stone-200">{item.tNo}</td>
                    <td className="px-6 text-left font-bold uppercase text-stone-900 border-r border-stone-200">{item.name}</td>
                    <td className="px-5 text-center font-bold text-stone-600 border-r border-stone-200">{item.workingDays}</td>
                    <td className="px-5 text-center font-bold text-stone-600 border-r border-stone-200">{item.duties}</td>
                    <td className="px-6 text-right font-black text-emerald-800 tabular-nums">₹{Math.round(item.amount).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-stone-100 font-black h-14 border-t-2 border-stone-300">
                  <td colSpan={5} className="px-6 text-right uppercase tracking-wider text-stone-700 text-base md:text-lg">Grand Total:</td>
                  <td className="px-6 text-right font-black text-emerald-900 text-2xl tabular-nums">₹{Math.round(grandTotal).toLocaleString()}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Normal Paper / App View
  return (
    <div className="space-y-4 animate-in fade-in duration-500">
      {/* Top Controls Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-stretch lg:items-center gap-4 bg-white p-4 rounded-2xl border border-stone-200/90 shadow-xs no-print">
        <div className="flex flex-wrap items-center gap-3">
          {onMonthChange && onYearChange && (
            <CalendarMonthPicker
              month={month}
              year={year}
              onChange={(m, y) => {
                onMonthChange(m);
                onYearChange(y);
              }}
            />
          )}

          {isFrozen && frozenRecord ? (
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-bold flex items-center gap-2">
              <Lock size={14} className="text-amber-600" />
              <span>Locked for Accounts ({frozenRecord.frozenAt})</span>
            </div>
          ) : (
            <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
              <Unlock size={14} className="text-emerald-600" />
              <span>Live Calculation Active</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              if (isFrozen) {
                if (confirm(`Unfreeze AI incentive abstract for ${reportMonthYear}?`)) {
                  onToggleFreezeMonth?.(month, year);
                }
              } else {
                if (confirm(`Freeze AI incentive abstract for ${reportMonthYear}? Locks paid amounts for Accounts.`)) {
                  onToggleFreezeMonth?.(month, year);
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

          <button 
            onClick={handleExportToExcel}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 font-bold rounded-xl uppercase text-xs transition-all shadow-xs cursor-pointer active:scale-95"
            title="Download Excel"
          >
            <FileSpreadsheet size={14} />
            <span>Export Excel</span>
          </button>

          <button 
            onClick={handleExportToCSV}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-200 font-bold rounded-xl uppercase text-xs transition-all shadow-xs cursor-pointer active:scale-95"
            title="Download CSV"
          >
            <Download size={14} />
            <span>CSV</span>
          </button>

          <button 
            onClick={() => setIsPrintingAbstract(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-stone-900 text-white hover:bg-black font-bold rounded-xl uppercase text-xs transition-all shadow-xs cursor-pointer active:scale-95"
            title="Print Monthly Abstract Only"
          >
            <Printer size={14} />
            <span>Print Abstract</span>
          </button>

          <button 
            onClick={() => setIsPrintingAll(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-xl uppercase text-xs transition-all shadow-xs cursor-pointer active:scale-95"
            title="Print Abstract + All Individual AI Operator Statements"
          >
            <Printer size={14} />
            <span>Print All (Abstract + Ledgers)</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 no-print">
        <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
            <Users size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 leading-none">Total Operators</p>
            <p className="text-lg font-black text-stone-900 tabular-nums mt-0.5">{aiTotals.length}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <Coins size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 leading-none">Grand Total Payout</p>
            <p className="text-lg font-black text-emerald-950 tabular-nums mt-0.5">₹{Math.round(grandTotal).toLocaleString()}</p>
          </div>
        </div>

        <div className="bg-white p-3.5 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <TrendingUp size={16} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 leading-none">Abstract Period</p>
            <p className="text-xs font-black text-stone-900 uppercase tracking-tight mt-0.5">{reportMonthYear}</p>
          </div>
        </div>
      </div>

      {/* Main Abstract Card */}
      <div className="bg-white rounded-2xl border border-stone-200/90 shadow-xs overflow-hidden no-print">
        {/* Printable Title Block */}
        <div className="p-5 border-b border-stone-100 text-center">
          <h2 className="text-xl md:text-2xl font-black uppercase tracking-tight text-stone-900">
            AI Linkconer Monthly Incentive Abstract
          </h2>
          <p className="text-xs font-extrabold uppercase tracking-widest text-stone-400 mt-1">
            Month of {reportMonthYear} • Consolidated Payout Statement
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-center border-collapse text-xs">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-black uppercase tracking-wider text-[11px] h-10">
                <th className="px-3 py-1 w-12 text-center no-print">
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
                    className="rounded border-stone-300 text-purple-600 focus:ring-purple-500 h-4 w-4 cursor-pointer"
                    title="Toggle all"
                  />
                </th>
                <th className="px-3 py-1 w-16 text-center border-r border-stone-200">S. NO</th>
                <th className="px-4 py-1 w-28 text-left border-r border-stone-200">TK No</th>
                <th className="px-6 py-1 text-left border-r border-stone-200">Operator Name</th>
                <th className="px-4 py-1 w-28 text-center border-r border-stone-200">Days Worked</th>
                <th className="px-4 py-1 w-28 text-center border-r border-stone-200">Duties</th>
                <th className="px-6 py-1 w-44 text-right">Incentive Payout (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {aiTotals.map((item, idx) => (
                <tr key={item.id} className="hover:bg-purple-50/20 transition-colors h-10">
                  <td className="px-3 py-1 text-center no-print">
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
                      className="rounded border-stone-300 text-purple-600 focus:ring-purple-500 h-4 w-4 cursor-pointer"
                    />
                  </td>
                  <td className="px-3 py-1 text-center font-bold text-stone-400 border-r border-stone-200">{idx + 1}</td>
                  <td className="px-4 py-1 text-left font-black text-purple-800 font-mono border-r border-stone-200">{item.tNo}</td>
                  <td className="px-6 py-1 text-left font-bold uppercase text-stone-900 border-r border-stone-200">{item.name}</td>
                  <td className="px-4 py-1 text-center font-bold text-stone-600 border-r border-stone-200 tabular-nums">{item.workingDays}</td>
                  <td className="px-4 py-1 text-center font-bold text-stone-600 border-r border-stone-200 tabular-nums">{item.duties}</td>
                  <td className="px-6 py-1 text-right font-black text-stone-900 tabular-nums">₹{Math.round(item.amount).toLocaleString()}</td>
                </tr>
              ))}

              {aiTotals.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                    No active earnings recorded for AI Linkconer operators in {reportMonthYear}
                  </td>
                </tr>
              )}
            </tbody>
            {aiTotals.length > 0 && (
              <tfoot>
                <tr className="bg-stone-50 font-black border-t-2 border-stone-200 h-12">
                  <td className="no-print"></td>
                  <td colSpan={5} className="px-6 text-right uppercase tracking-wider text-stone-700 text-xs font-black">
                    Consolidated Total Payout:
                  </td>
                  <td className="px-6 text-right font-black text-emerald-950 text-sm tabular-nums">
                    ₹{Math.round(printedGrandTotal).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* PRINT CONTAINER */}
      {(isPrintingAll || isPrintingAbstract) && (
        <div className="print-all-container hidden print:block text-black bg-white font-sans w-full p-0">
          {/* PAGE 1: AI LINKCONER INCENTIVE ABSTRACT */}
          <div className="print-page-break p-5 border-2 border-black rounded-lg min-h-[250mm] flex flex-col justify-between mb-8 text-black bg-white">
            <div>
              <div className="text-center pb-2 border-b-2 border-black mb-3">
                <img
                  src="/scm-logo-horizontal.png"
                  alt="SCM Textile Spinners"
                  className="h-9 w-auto max-w-[180px] object-contain mx-auto mb-1.5"
                />
                <h1 className="text-2xl font-black text-black uppercase tracking-tight">AI Linkconer Monthly Incentive Abstract</h1>
                <div className="mt-1 text-[10px] font-black text-stone-600 uppercase tracking-wider flex justify-between items-center px-4">
                  <span>
                    Month: <span className="text-black font-extrabold text-sm">{reportMonthYear}</span>
                  </span>
                  <span className="text-stone-700 font-extrabold">
                    Consolidated Payout Statement
                  </span>
                </div>
              </div>

              <table className="w-full text-center border-collapse border border-black mb-3">
                <thead>
                  <tr className="bg-stone-100 border-b-2 border-black text-black text-xs font-black uppercase">
                    <th className="border border-black px-3 py-1.5 text-center w-14">S. NO</th>
                    <th className="border border-black px-3 py-1.5 text-left w-24">TK NO</th>
                    <th className="border border-black px-3 py-1.5 text-left">OPERATOR NAME</th>
                    <th className="border border-black px-3 py-1.5 text-center w-28">DAYS WORKED</th>
                    <th className="border border-black px-3 py-1.5 text-center w-24">DUTIES</th>
                    <th className="border border-black px-3 py-1.5 text-right font-black w-36">INCENTIVE PAYOUT (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {printedRows.map((item, idx) => (
                    <tr key={item.id} className="border-b border-black text-xs font-bold">
                      <td className="border border-black px-3 py-1.5 text-center font-bold">{idx + 1}</td>
                      <td className="border border-black px-3 py-1.5 text-left font-mono font-black">{item.tNo || '—'}</td>
                      <td className="border border-black px-3 py-1.5 text-left uppercase font-bold">{item.name}</td>
                      <td className="border border-black px-3 py-1.5 font-bold">{item.workingDays}</td>
                      <td className="border border-black px-3 py-1.5 font-bold">{item.duties}</td>
                      <td className="border border-black px-3 py-1.5 text-right font-mono font-black">₹{Math.round(item.amount).toLocaleString()}</td>
                    </tr>
                  ))}
                  {printedRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="border border-black text-center py-4 text-xs font-bold uppercase text-stone-500">
                        No active AI Linkconer duties recorded for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              {/* Account Summary block */}
              <div className="p-3 border-2 border-black bg-stone-50 rounded-lg flex items-center justify-between mb-3">
                <div className="text-left">
                  <span className="text-[9px] font-black tracking-widest text-stone-500 uppercase">Accounts Consolidation Total</span>
                  <div className="text-black font-black uppercase text-base mt-0.5">AI Linkconer Payroll Allocation</div>
                  <p className="text-[9px] font-bold text-stone-500 uppercase mt-0.5">
                    Total payout computation of all ({printedRows.length}) AI operators registered in the schedule.
                  </p>
                </div>
                <div className="flex gap-6 items-center">
                  <div className="text-center">
                    <span className="block text-[8px] font-black text-stone-500 uppercase tracking-widest">Active Operators</span>
                    <span className="text-lg font-black text-black">{printedRows.filter(c => c.amount > 0).length}</span>
                  </div>
                  <div className="bg-black text-white px-4 py-2 rounded text-center">
                    <span className="block text-[8px] font-black text-stone-300 uppercase tracking-widest">Total Payout Release</span>
                    <span className="text-xl font-extrabold font-mono">₹{Math.round(printedGrandTotal).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Signatures block */}
              <div className="pt-2 grid grid-cols-3 gap-6 text-center text-xs font-bold uppercase tracking-wider text-stone-700">
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
            </div>
          </div>

          {/* PAGES 2+: INDIVIDUAL AI OPERATOR STATEMENTS (PRINT ALL) */}
          {isPrintingAll && printedRows.map((item, idx) => {
            const duties = getAiWorkerDuties(item.id);
            return (
              <div key={`ai-worker-${item.id}-${idx}`} className="print-page-break p-4 px-5 border-2 border-black rounded-lg min-h-[250mm] flex flex-col justify-between text-black bg-white mb-8">
                <div>
                  <div className="text-center pb-1.5 border-b border-black mb-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-stone-500 block mb-0.5">WORKER WISE HISTORY — SUPPORTING DOCUMENTS FOR PAYOUT</span>
                    <h1 className="text-lg md:text-xl font-black text-black uppercase tracking-tight">AI LINKCONER OPERATOR INCENTIVE STATEMENT</h1>
                    
                    <div className="mt-1.5 flex justify-center gap-6 text-[13px] font-bold text-stone-600 uppercase tracking-wider">
                      <div>OPERATOR NAME: <span className="text-black font-extrabold text-[14px]">{item.name}</span></div>
                      <div>TK. NO: <span className="text-black font-extrabold text-[14px]">{item.tNo || '—'}</span></div>
                      <div>PERIOD: <span className="text-black font-extrabold text-[14px]">{reportMonthYear}</span></div>
                    </div>
                  </div>

                  <table className="w-full text-center border-collapse border border-black mb-2">
                    <thead>
                      <tr className="bg-stone-50 border-b border-black text-[11.5px] font-black uppercase text-black">
                        <th className="border border-black px-1.5 py-1 text-center w-12">S.NO</th>
                        <th className="border border-black px-1.5 py-1 text-center w-28">DATE</th>
                        <th className="border border-black px-1.5 py-1 text-center w-16">SHIFT</th>
                        <th className="border border-black px-1.5 py-1 text-center">COUNT</th>
                        <th className="border border-black px-1.5 py-1 text-center w-28">UTILITY %</th>
                        <th className="border border-black px-1.5 py-1 text-center w-32">INCENTIVE (RS)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {duties.rows.map((duty, dIdx) => (
                        <tr key={dIdx} className="border-b border-black text-[11px] leading-tight font-bold text-black">
                          <td className="border border-black px-1.5 py-1 text-center font-bold text-black">{dIdx + 1}</td>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-bold text-black">{formatDisplayDate(duty.date)}</td>
                          <td className="border border-black px-1.5 py-1 text-center font-bold text-black">{duty.shift}</td>
                          <td className="border border-black px-1.5 py-1 text-center font-bold text-black">{duty.count}</td>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-bold text-black">{duty.utility > 0 ? `${duty.utility.toFixed(1)}%` : '—'}</td>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-black text-black">₹{duty.incentive}</td>
                        </tr>
                      ))}
                      {duties.rows.length === 0 && (
                        <tr>
                          <td colSpan={6} className="border border-black text-center py-2 text-[11px] text-stone-500 font-bold uppercase tracking-wider">
                            No shift duties recorded for this operator in {reportMonthYear}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  {/* Individual Summary block */}
                  <div className="p-2 px-3 border border-black bg-stone-50 rounded flex justify-between items-center mb-2">
                    <div className="text-left">
                      <span className="text-[10px] font-black tracking-widest text-stone-500 uppercase">Payout Summary</span>
                      <div className="text-black font-black uppercase text-[13px] mt-0.5">AI Linkconer Incentive Record</div>
                      <p className="text-[11.5px] font-semibold text-stone-500 uppercase mt-0.5 leading-normal">
                        Includes {duties.rows.length} active shift duties under approved utility thresholds.
                      </p>
                    </div>
                    <div className="flex gap-4 items-center">
                      <div className="text-center">
                        <span className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">Average Utility</span>
                        <span className="text-[14px] font-black text-black">{duties.avgUtil > 0 ? `${duties.avgUtil.toFixed(1)}%` : '—'}</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">Total Duties</span>
                        <span className="text-[14px] font-black text-black">{duties.rows.length}</span>
                      </div>
                      <div className="border border-black px-2.5 py-1 bg-black text-white text-center rounded">
                        <span className="block text-[10px] font-black text-stone-300 uppercase tracking-widest">Total Amount</span>
                        <span className="text-[16px] font-black font-mono">₹{Math.round(duties.total || item.amount)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures block for operator sheet */}
                  <div className="mt-1.5 pt-1.5 border-t border-black grid grid-cols-3 gap-6 text-center text-[11px] font-bold uppercase tracking-wider text-stone-700">
                    <div>
                      <div className="pt-1">AM/AM</div>
                    </div>
                    <div>
                      <div className="pt-1">GM</div>
                    </div>
                    <div>
                      <div className="pt-1">DIRECTOR</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
