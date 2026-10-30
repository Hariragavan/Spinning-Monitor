import React, { useState, useMemo } from 'react';
import { DailyReport, Sider, IncentiveRule, ProductionEntry, Shift, CountConversion } from '../types';
import {
  Table, Search, Download, Filter, Calendar, Activity,
  Coins, ArrowUpDown, ChevronDown, CheckCircle, AlertTriangle,
  Layers, Users, Gauge, FileText, Check, Sparkles, Printer, FileSpreadsheet
} from 'lucide-react';
import { cn, calculateIncentive, resolveWorker, isCountNameMatching } from '../lib/utils';
import * as XLSX from 'xlsx';
import { CalendarDatePicker } from './CalendarPickers';

interface MasterDataTableProps {
  report: DailyReport;
  workers: Sider[];
  rules: IncentiveRule[];
  countConversions?: CountConversion[];
  isTvMode?: boolean;
  onSelectDate?: (date: string) => void;
  availableDates?: string[];
}

type ViewMode = 'machines' | 'entries' | 'counts' | 'workers';

export const MasterDataTable: React.FC<MasterDataTableProps> = ({
  report,
  workers,
  rules,
  countConversions = [],
  isTvMode = false,
  onSelectDate,
  availableDates = []
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('machines');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShiftFilter, setSelectedShiftFilter] = useState<'ALL' | Shift>('ALL');

  // Frame summary data with shift details & worker info
  const machineData = useMemo(() => {
    const frames = Array.from(new Set([
      ...(report.summaries?.map(s => s.frameNo) || []),
      ...(report.entries?.map(e => e.frameNo) || [])
    ])).filter(Boolean);

    if (frames.length === 0) return [];
    const entries = report.entries || [];
    const summaries = report.summaries || [];

    return frames.map(frameNo => {
      const summary = summaries.find(s => s.frameNo === frameNo);
      const frameEntries = entries.filter(e => e.frameNo === frameNo);

      const shiftData: Record<Shift, {
        actual: number;
        target: number;
        gps: number;
        eff: number;
        em: number;
        workers: string[];
        incentive: number;
      }> = {
        I: { actual: 0, target: 0, gps: 0, eff: 0, em: 0, workers: [], incentive: 0 },
        II: { actual: 0, target: 0, gps: 0, eff: 0, em: 0, workers: [], incentive: 0 },
        III: { actual: 0, target: 0, gps: 0, eff: 0, em: 0, workers: [], incentive: 0 }
      };

      let totalActual = 0;
      let totalTarget = summary?.targetProd || 0;
      let totalIncentive = 0;
      let sumGps = 0;
      let sumEff = 0;
      let shiftCount = 0;
      let countName = summary?.count || (frameEntries[0]?.count || '-');
      let stdGps = summary?.stdGps || (frameEntries[0]?.gpsTarget || 0);

      (['I', 'II', 'III'] as Shift[]).forEach(shift => {
        const entry = frameEntries.find(e => e.shift === shift);
        if (entry) {
          const inc = calculateIncentive(entry, rules, report.date);
          const assignedWorkers: string[] = [];
          if (entry.siderIds && entry.siderIds.length > 0) {
            entry.siderIds.forEach(id => {
              if (id) {
                const w = resolveWorker(id, entry.siderName, workers);
                assignedWorkers.push(`${w.name}${w.tNo ? ` (${w.tNo})` : ''}`);
              }
            });
          } else if (entry.siderId || entry.siderName) {
            const w = resolveWorker(entry.siderId || '', entry.siderName, workers);
            assignedWorkers.push(`${w.name}${w.tNo ? ` (${w.tNo})` : ''}`);
          }

          shiftData[shift] = {
            actual: entry.productionActual || 0,
            target: entry.productionTarget || 0,
            gps: entry.gpsActual || 0,
            eff: entry.efficiency || (entry.productionTarget > 0 ? (entry.productionActual / entry.productionTarget) * 100 : 0),
            em: entry.doffEmt ?? entry.naturalEmt ?? 0,
            workers: assignedWorkers,
            incentive: inc
          };

          totalActual += entry.productionActual || 0;
          totalIncentive += inc;
          if (entry.gpsActual > 0) {
            sumGps += entry.gpsActual;
            sumEff += (entry.productionTarget > 0 ? (entry.productionActual / entry.productionTarget) * 100 : 0);
            shiftCount++;
          }
        }
      });

      if (summary) {
        if (totalTarget === 0) totalTarget = summary.targetProd || 0;
        if (totalActual === 0) totalActual = summary.actualProd || 0;
      }

      const avgGps = shiftCount > 0 ? Math.round(sumGps / shiftCount) : Math.round(summary?.avgGps || 0);
      const avgEff = shiftCount > 0 ? Number((sumEff / shiftCount).toFixed(1)) : (totalTarget > 0 ? Number(((totalActual / totalTarget) * 100).toFixed(1)) : 0);

      return {
        frameNo,
        count: countName,
        stdGps: Math.round(stdGps),
        target: Math.round(totalTarget),
        actual: Math.round(totalActual),
        eff: avgEff,
        avgGps,
        totalIncentive: Math.round(totalIncentive),
        shifts: shiftData
      };
    });
  }, [report, workers, rules]);

  // Overall totals for summary row
  const overallTotals = useMemo(() => {
    let target = 0;
    let actual = 0;
    let shI = 0;
    let shII = 0;
    let shIII = 0;
    let totalIncentive = 0;
    let sumGps = 0;
    let countGps = 0;

    machineData.forEach(m => {
      target += m.target;
      actual += m.actual;
      shI += m.shifts.I.actual;
      shII += m.shifts.II.actual;
      shIII += m.shifts.III.actual;
      totalIncentive += m.totalIncentive;
      if (m.avgGps > 0) {
        sumGps += m.avgGps;
        countGps++;
      }
    });

    const eff = target > 0 ? Number(((actual / target) * 100).toFixed(1)) : 0;
    const avgGps = countGps > 0 ? Math.round(sumGps / countGps) : 0;

    return {
      target,
      actual,
      shI: Math.round(shI),
      shII: Math.round(shII),
      shIII: Math.round(shIII),
      eff,
      avgGps,
      totalIncentive
    };
  }, [machineData]);

  // Running counts aggregation
  const runningCountsData = useMemo(() => {
    const map = new Map<string, {
      count: string;
      frames: string[];
      stdGps: number;
      actualSum: number;
      gpsSum: number;
      gps40sSum: number;
      entryCount: number;
    }>();

    (report.entries || []).forEach(e => {
      if (!e.count) return;
      const key = e.count;
      if (!map.has(key)) {
        map.set(key, {
          count: key,
          frames: [],
          stdGps: e.gpsTarget || 0,
          actualSum: 0,
          gpsSum: 0,
          gps40sSum: 0,
          entryCount: 0
        });
      }
      const item = map.get(key)!;
      if (!item.frames.includes(e.frameNo)) item.frames.push(e.frameNo);
      item.actualSum += e.productionActual || 0;
      item.gpsSum += e.gpsActual || 0;
      const factor = countConversions.find(c => isCountNameMatching(c.count, key))?.multiplicationFactor ?? 1.0;
      const calcGps40s = (e.gps40sCon && e.gps40sCon > 0) ? e.gps40sCon : ((e.gpsActual || 0) > 0 ? Math.round(e.gpsActual * factor) : 0);
      item.gps40sSum += calcGps40s;
      item.entryCount++;
    });

    return Array.from(map.values()).map(item => ({
      count: item.count,
      frames: item.frames.sort().join(', '),
      stdGps: Math.round(item.stdGps),
      avgGps: item.entryCount > 0 ? Math.round(item.gpsSum / item.entryCount) : 0,
      avg40sGps: item.entryCount > 0 ? Math.round(item.gps40sSum / item.entryCount) : 0,
      totalProduction: Math.round(item.actualSum),
      sharePercent: overallTotals.actual > 0 ? ((item.actualSum / overallTotals.actual) * 100).toFixed(1) : '0'
    }));
  }, [report, overallTotals, countConversions]);

  // Worker allocation & incentive summary
  const workerAllocationData = useMemo(() => {
    const list: {
      tNo: string;
      name: string;
      role: string;
      shift: Shift;
      machine: string;
      count: string;
      gps: number;
      incentive: number;
    }[] = [];

    (report.entries || []).forEach(e => {
      const inc = calculateIncentive(e, rules, report.date);
      const workerIds = (e.siderIds && e.siderIds.length > 0) ? e.siderIds : (e.siderId ? [e.siderId] : []);
      if (workerIds.length > 0) {
        workerIds.forEach(id => {
          if (!id) return;
          const w = resolveWorker(id, e.siderName, workers);
          list.push({
            tNo: w.tNo || 'N/A',
            name: w.name || 'Unassigned',
            role: 'Operator',
            shift: e.shift,
            machine: e.frameNo,
            count: e.count,
            gps: Math.round(e.gpsActual || 0),
            incentive: inc
          });
        });
      } else if (e.siderName) {
        list.push({
          tNo: 'N/A',
          name: e.siderName,
          role: 'Operator',
          shift: e.shift,
          machine: e.frameNo,
          count: e.count,
          gps: Math.round(e.gpsActual || 0),
          incentive: inc
        });
      }
    });

    (['I', 'II', 'III'] as Shift[]).forEach(shift => {
      (report.gaiters?.[shift] || []).forEach(gid => {
        const w = resolveWorker(gid, undefined, workers);
        list.push({
          tNo: w.tNo || 'N/A',
          name: w.name,
          role: 'Gaiter',
          shift,
          machine: 'All Frames',
          count: 'Mill Wide',
          gps: 0,
          incentive: 0
        });
      });
    });

    return list.sort((a, b) => a.machine.localeCompare(b.machine));
  }, [report, workers, rules]);

  // Filtered entries for Detailed Entries tab
  const filteredEntries = useMemo(() => {
    let entries = report.entries || [];
    if (selectedShiftFilter !== 'ALL') {
      entries = entries.filter(e => e.shift === selectedShiftFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      entries = entries.filter(e =>
        e.frameNo.toLowerCase().includes(q) ||
        (e.count && e.count.toLowerCase().includes(q)) ||
        (e.siderName && e.siderName.toLowerCase().includes(q))
      );
    }
    return entries;
  }, [report.entries, selectedShiftFilter, searchQuery]);

  // Export data as Excel (.xlsx)
  const exportToExcel = () => {
    const dateStr = report.date?.replace(/[/\\?%*:|"<>]/g, '-') || 'live';
    const wb = XLSX.utils.book_new();

    if (viewMode === 'machines') {
      const rows: any[] = machineData.map(m => ({
        'Machine': m.frameNo,
        'Yarn Count': m.count,
        'STD GPS': m.stdGps,
        'Target (Kg)': m.target,
        'Shift I (Kg)': m.shifts.I.actual,
        'Shift II (Kg)': m.shifts.II.actual,
        'Shift III (Kg)': m.shifts.III.actual,
        'Total Prod (Kg)': m.actual,
        'Efficiency %': `${m.eff}%`,
        'Avg GPS': m.avgGps,
        'Daily Incentive (INR)': m.totalIncentive
      }));

      rows.push({
        'Machine': 'TOTAL',
        'Yarn Count': '',
        'STD GPS': overallTotals.avgGps,
        'Target (Kg)': overallTotals.target,
        'Shift I (Kg)': overallTotals.shI,
        'Shift II (Kg)': overallTotals.shII,
        'Shift III (Kg)': overallTotals.shIII,
        'Total Prod (Kg)': overallTotals.actual,
        'Efficiency %': `${overallTotals.eff}%`,
        'Avg GPS': overallTotals.avgGps,
        'Daily Incentive (INR)': overallTotals.totalIncentive
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 10 }, { wch: 14 }, { wch: 10 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
        { wch: 12 }, { wch: 10 }, { wch: 18 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Machine Master Data');
    } else {
      const rows = (filteredEntries || []).map((e, idx) => {
        const inc = calculateIncentive(e, rules, report.date);
        return {
          'S.No': idx + 1,
          'Machine': e.frameNo,
          'Shift': e.shift,
          'Yarn Count': e.count,
          'Target Prod (Kg)': e.productionTarget,
          'Actual Prod (Kg)': e.productionActual,
          'Target GPS': e.gpsTarget,
          'Actual GPS': e.gpsActual,
          'Efficiency %': `${e.efficiency}%`,
          'Utility %': `${e.utility}%`,
          'Assigned Operator': e.siderName || 'UNASSIGNED',
          'Incentive (INR)': inc
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 8 }, { wch: 10 }, { wch: 8 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 24 }, { wch: 16 }
      ];
      XLSX.utils.book_append_sheet(wb, ws, 'Frame Shift Entries');
    }

    XLSX.writeFile(wb, `SpinMonitor_Master_Data_${dateStr}.xlsx`);
  };

  // Export data as CSV
  const exportToCSV = () => {
    const dateStr = report.date?.replace(/[/\\?%*:|"<>]/g, '-') || 'live';
    let csv = `SPINMONITOR AI - MASTER DATA REPORT (${report.date})\n\n`;

    if (viewMode === 'machines') {
      csv += `Frame,Count,Std GPS,Target (Kg),Shift I (Kg),Shift II (Kg),Shift III (Kg),Total Actual (Kg),Efficiency %,Avg GPS,Incentive (Rs)\n`;
      machineData.forEach(m => {
        csv += `"${m.frameNo}","${m.count}",${m.stdGps},${m.target},${m.shifts.I.actual},${m.shifts.II.actual},${m.shifts.III.actual},${m.actual},${m.eff}%,${m.avgGps},${m.totalIncentive}\n`;
      });
      csv += `"TOTAL","",${overallTotals.avgGps},${overallTotals.target},${overallTotals.shI},${overallTotals.shII},${overallTotals.shIII},${overallTotals.actual},${overallTotals.eff}%,${overallTotals.avgGps},${overallTotals.totalIncentive}\n`;
    } else {
      csv += `Frame,Shift,Count,Target (Kg),Actual (Kg),GPS Target,GPS Actual,Efficiency %,Utility %,Operator,Incentive (Rs)\n`;
      (report.entries || []).forEach(e => {
        const inc = calculateIncentive(e, rules, report.date);
        csv += `"${e.frameNo}","${e.shift}","${e.count}",${e.productionTarget},${e.productionActual},${e.gpsTarget},${e.gpsActual},${e.efficiency}%,${e.utility}%,"${e.siderName || ''}",${inc}\n`;
      });
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `SpinMonitor_AllData_${dateStr}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={cn(
      "bg-white border border-stone-200/90 shadow-2xs overflow-hidden flex flex-col font-sans transition-all",
      isTvMode ? "rounded-2xl p-3 border border-stone-200 bg-white shadow-md flex-1 min-h-0" : "rounded-2xl p-3.5 md:p-4 mb-4"
    )}>
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">KTTM SPINNING MILLS - UNIT 01</h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">Mill Master Production & Incentive Statement</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Date: <strong>{report.date}</strong></span>
          <span>View Mode: <strong>{viewMode.toUpperCase()}</strong></span>
          <span>Total Prod: <strong>{overallTotals.actual.toLocaleString()} Kg</strong></span>
          <span>Incentive: <strong>₹{overallTotals.totalIncentive.toLocaleString()}</strong></span>
        </div>
      </div>

      {/* Table Header Bar */}
      <div className={cn("flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 border-b border-stone-200 no-print", isTvMode ? "pb-2" : "pb-3")}>
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-stone-900 text-emerald-400 flex items-center justify-center shadow-xs">
              <Table size={16} />
            </div>
            <div>
              <h3 className={cn(
                "font-black tracking-tight uppercase text-stone-900 leading-none",
                isTvMode ? "text-lg" : "text-base md:text-lg"
              )}>
                Mill Master Data Table
              </h3>
              <p className="text-[9.5px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
                Complete Frame Breakdown • Production, GPS, Efficiency & Payouts
              </p>
            </div>
          </div>
        </div>

        {/* View Mode Tabs & Quick Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
          <div className="flex bg-stone-100 p-1 rounded-2xl border border-stone-200/80">
            <button
              onClick={() => setViewMode('machines')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer",
                viewMode === 'machines'
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-900"
              )}
            >
              Machine Matrix
            </button>
            <button
              onClick={() => setViewMode('entries')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer",
                viewMode === 'entries'
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-900"
              )}
            >
              Shift Entries
            </button>
            <button
              onClick={() => setViewMode('counts')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer",
                viewMode === 'counts'
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-900"
              )}
            >
              Running Counts
            </button>
            <button
              onClick={() => setViewMode('workers')}
              className={cn(
                "px-3.5 py-1.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer",
                viewMode === 'workers'
                  ? "bg-white text-stone-900 shadow-sm"
                  : "text-stone-500 hover:text-stone-900"
              )}
            >
              Allocations
            </button>
          </div>

          {!isTvMode && (
            <div className="flex flex-wrap items-center gap-2 ml-auto lg:ml-0 no-print">
              {onSelectDate && (
                <CalendarDatePicker
                  value={report.date}
                  onChange={(d) => {
                    if (d && d !== report.date) {
                      onSelectDate(d);
                    }
                  }}
                />
              )}
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 text-white hover:bg-black rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                title="Print this master table"
              >
                <Printer size={14} />
                <span>Print Table</span>
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/80 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                title="Download table data as Excel (.xlsx)"
              >
                <FileSpreadsheet size={14} />
                <span>Export Excel</span>
              </button>
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 rounded-2xl font-black text-xs uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                title="Download table data as CSV"
              >
                <Download size={14} />
                <span>Export CSV</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filter / Search Bar (Hidden in TV Mode for clean broadcast) */}
      {!isTvMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 pb-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
            <input
              type="text"
              placeholder="Search machine, count, or operator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-9 pr-3 py-1.5 text-xs font-bold text-stone-800 placeholder-stone-400 outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
            />
          </div>

          {viewMode === 'entries' && (
            <div className="flex items-center gap-1 text-xs font-bold text-stone-500">
              <span className="text-[10px] uppercase font-black tracking-widest text-stone-400 mr-1">Shift:</span>
              {(['ALL', 'I', 'II', 'III'] as const).map(sh => (
                <button
                  key={sh}
                  onClick={() => setSelectedShiftFilter(sh)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-black uppercase transition-all cursor-pointer",
                    selectedShiftFilter === sh
                      ? "bg-stone-900 text-white"
                      : "bg-stone-100 hover:bg-stone-200 text-stone-700"
                  )}
                >
                  {sh === 'ALL' ? 'All' : `Sh ${sh}`}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* VIEW 1: MACHINE MATRIX TABLE */}
      {viewMode === 'machines' && (
        <div className={cn("mt-2.5 overflow-x-auto rounded-xl border border-stone-200/80", isTvMode && "flex-1 overflow-hidden flex flex-col justify-between")}>
          <table className={cn("w-full border-collapse text-left", isTvMode ? "text-sm md:text-base h-full" : "text-xs")}>
            <thead>
              <tr className="bg-stone-900 text-stone-50 uppercase tracking-wider font-black border-b border-stone-800">
                <th className={cn("text-left", isTvMode ? "py-2 px-3 w-16" : "py-1.5 px-2 w-14")}>Frame</th>
                <th className={cn("text-left", isTvMode ? "py-2 px-3 min-w-[100px]" : "py-1.5 px-2 min-w-[90px]")}>Count</th>
                <th className={cn("text-center", isTvMode ? "py-2 px-2 w-16" : "py-1.5 px-1.5 w-14")}>STD GPS</th>
                <th className={cn("text-right", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>Target (Kg)</th>
                <th className={cn("text-center border-l border-stone-800 bg-stone-800/50", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>Shift I (Kg / Eff)</th>
                <th className={cn("text-center border-l border-stone-800 bg-stone-800/50", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>Shift II (Kg / Eff)</th>
                <th className={cn("text-center border-l border-stone-800 bg-stone-800/50", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>Shift III (Kg / Eff)</th>
                <th className={cn("text-right border-l border-stone-800 bg-emerald-950/60 text-emerald-300 font-black", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>Total (Kg)</th>
                <th className={cn("text-center border-l border-stone-800", isTvMode ? "py-2 px-2" : "py-1.5 px-1.5")}>Avg GPS</th>
                <th className={cn("text-center border-l border-stone-800", isTvMode ? "py-2 px-2" : "py-1.5 px-1.5")}>Overall Eff</th>
                <th className={cn("text-right border-l border-stone-800 text-amber-300 font-black", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>Incentive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {machineData
                .filter(m => !searchQuery.trim() ||
                  m.frameNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
                  m.count.toLowerCase().includes(searchQuery.toLowerCase()))
                .map((m) => {
                  const isEffGood = m.eff >= 95;
                  const isEffWarning = m.eff >= 90 && m.eff < 95;

                  return (
                    <tr key={m.frameNo} className="hover:bg-stone-50/80 transition-colors group">
                      <td className={cn("font-black text-stone-900 flex items-center gap-1.5", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className={cn("font-black", isTvMode ? "text-base" : "text-xs")}>{m.frameNo}</span>
                      </td>
                      <td className={cn("font-bold text-stone-800", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>
                        <span className="px-1.5 py-0.5 bg-stone-100 rounded text-[10.5px] font-black border border-stone-200/80">
                          {m.count}
                        </span>
                      </td>
                      <td className={cn("text-center font-mono tabular-nums text-stone-500 font-bold", isTvMode ? "py-2 px-2 text-sm" : "py-1.5 px-1.5")}>
                        {m.stdGps}
                      </td>
                      <td className={cn("text-right font-mono tabular-nums font-bold text-stone-700", isTvMode ? "py-2 px-3 text-sm" : "py-1.5 px-2")}>
                        {m.target.toLocaleString('en-IN')}
                      </td>

                      {/* Shift I */}
                      <td className={cn("text-center border-l border-stone-100", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>
                        <div className={cn("font-mono tabular-nums font-black text-stone-900", isTvMode ? "text-sm" : "text-xs")}>
                          {m.shifts.I.actual} <span className="text-[9px] font-normal text-stone-400">kg</span>
                        </div>
                        <div className="text-[9.5px] font-black text-emerald-700">
                          {m.shifts.I.eff > 0 ? `${m.shifts.I.eff.toFixed(1)}%` : '-'}
                          {m.shifts.I.gps > 0 && <span className="text-stone-400 ml-0.5">({m.shifts.I.gps})</span>}
                        </div>
                        {m.shifts.I.workers.length > 0 && (
                          <div className="text-[8.5px] font-bold text-stone-500 truncate max-w-[110px] mx-auto">
                            {m.shifts.I.workers.join(', ')}
                          </div>
                        )}
                      </td>

                      {/* Shift II */}
                      <td className={cn("text-center border-l border-stone-100", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>
                        <div className={cn("font-mono tabular-nums font-black text-stone-900", isTvMode ? "text-sm" : "text-xs")}>
                          {m.shifts.II.actual} <span className="text-[9px] font-normal text-stone-400">kg</span>
                        </div>
                        <div className="text-[9.5px] font-black text-emerald-700">
                          {m.shifts.II.eff > 0 ? `${m.shifts.II.eff.toFixed(1)}%` : '-'}
                          {m.shifts.II.gps > 0 && <span className="text-stone-400 ml-0.5">({m.shifts.II.gps})</span>}
                        </div>
                        {m.shifts.II.workers.length > 0 && (
                          <div className="text-[8.5px] font-bold text-stone-500 truncate max-w-[110px] mx-auto">
                            {m.shifts.II.workers.join(', ')}
                          </div>
                        )}
                      </td>

                      {/* Shift III */}
                      <td className={cn("text-center border-l border-stone-100", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>
                        <div className={cn("font-mono tabular-nums font-black text-stone-900", isTvMode ? "text-sm" : "text-xs")}>
                          {m.shifts.III.actual} <span className="text-[9px] font-normal text-stone-400">kg</span>
                        </div>
                        <div className="text-[9.5px] font-black text-emerald-700">
                          {m.shifts.III.eff > 0 ? `${m.shifts.III.eff.toFixed(1)}%` : '-'}
                          {m.shifts.III.gps > 0 && <span className="text-stone-400 ml-0.5">({m.shifts.III.gps})</span>}
                        </div>
                        {m.shifts.III.workers.length > 0 && (
                          <div className="text-[8.5px] font-bold text-stone-500 truncate max-w-[110px] mx-auto">
                            {m.shifts.III.workers.join(', ')}
                          </div>
                        )}
                      </td>

                      {/* Total Prod */}
                      <td className={cn("text-right font-mono tabular-nums font-black text-stone-900 border-l border-stone-100 bg-emerald-50/40", isTvMode ? "py-2 px-3 text-base" : "py-1.5 px-2 text-xs")}>
                        {m.actual.toLocaleString('en-IN')}
                      </td>

                      {/* Avg GPS */}
                      <td className={cn("text-center font-mono tabular-nums font-black text-stone-800 border-l border-stone-100", isTvMode ? "py-2 px-2" : "py-1.5 px-1.5")}>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded font-bold",
                          m.avgGps >= m.stdGps ? "text-emerald-700 bg-emerald-50" : "text-stone-700"
                        )}>
                          {m.avgGps}
                        </span>
                      </td>

                      {/* Overall Efficiency */}
                      <td className={cn("text-center border-l border-stone-100", isTvMode ? "py-2 px-2" : "py-1.5 px-1.5")}>
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10.5px] font-black tabular-nums border",
                          isEffGood ? "bg-emerald-50 text-emerald-800 border-emerald-200" :
                          isEffWarning ? "bg-amber-50 text-amber-800 border-amber-200" :
                          "bg-red-50 text-red-800 border-red-200"
                        )}>
                          {m.eff}%
                        </span>
                      </td>

                      {/* Total Machine Incentive */}
                      <td className={cn("text-right font-mono tabular-nums font-black text-stone-900 border-l border-stone-100", isTvMode ? "py-2 px-3" : "py-1.5 px-2")}>
                        {m.totalIncentive > 0 ? (
                          <span className="text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            ₹{m.totalIncentive.toLocaleString('en-IN')}
                          </span>
                        ) : (
                          <span className="text-stone-300">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>

            {/* Table Footer Totals */}
            <tfoot>
              <tr className="bg-stone-900 text-white font-black border-t-2 border-stone-900 text-xs uppercase">
                <td className={cn("font-black", isTvMode ? "py-2 px-3" : "py-1.5 px-2")} colSpan={2}>
                  Mill Grand Total (All 6 Machines)
                </td>
                <td className={cn("text-center text-stone-400", isTvMode ? "py-2 px-2" : "py-1.5 px-1.5")}>-</td>
                <td className={cn("text-right font-mono tabular-nums text-stone-300", isTvMode ? "py-2 px-3 text-sm" : "py-1.5 px-2")}>
                  {overallTotals.target.toLocaleString('en-IN')} kg
                </td>
                <td className={cn("text-center border-l border-stone-800 font-mono tabular-nums text-stone-200", isTvMode ? "py-2 px-3 text-sm" : "py-1.5 px-2")}>
                  {overallTotals.shI.toLocaleString('en-IN')} kg
                </td>
                <td className={cn("text-center border-l border-stone-800 font-mono tabular-nums text-stone-200", isTvMode ? "py-2 px-3 text-sm" : "py-1.5 px-2")}>
                  {overallTotals.shII.toLocaleString('en-IN')} kg
                </td>
                <td className={cn("text-center border-l border-stone-800 font-mono tabular-nums text-stone-200", isTvMode ? "py-2 px-3 text-sm" : "py-1.5 px-2")}>
                  {overallTotals.shIII.toLocaleString('en-IN')} kg
                </td>
                <td className={cn("text-right border-l border-stone-800 font-mono tabular-nums text-emerald-400 font-black", isTvMode ? "py-2 px-3 text-base" : "py-1.5 px-2 text-sm")}>
                  {overallTotals.actual.toLocaleString('en-IN')} kg
                </td>
                <td className={cn("text-center border-l border-stone-800 font-mono tabular-nums text-stone-200", isTvMode ? "py-2 px-2" : "py-1.5 px-1.5")}>
                  {overallTotals.avgGps}
                </td>
                <td className={cn("text-center border-l border-stone-800", isTvMode ? "py-2 px-2" : "py-1.5 px-1.5")}>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500 text-stone-950 font-black text-xs">
                    {overallTotals.eff}%
                  </span>
                </td>
                <td className={cn("text-right border-l border-stone-800 font-mono tabular-nums text-amber-400 font-black", isTvMode ? "py-2 px-3 text-base" : "py-1.5 px-2 text-xs")}>
                  ₹{overallTotals.totalIncentive.toLocaleString('en-IN')}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* VIEW 2: DETAILED SHIFT ENTRIES TABLE */}
      {viewMode === 'entries' && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200/80">
          <table className={cn("w-full border-collapse text-left", isTvMode ? "text-lg" : "text-xs")}>
            <thead>
              <tr className="bg-stone-900 text-stone-50 uppercase tracking-wider font-black">
                <th className="py-3 px-3 text-left">Frame</th>
                <th className="py-3 px-2 text-center">Shift</th>
                <th className="py-3 px-3 text-left">Count</th>
                <th className="py-3 px-3 text-right">Target (Kg)</th>
                <th className="py-3 px-3 text-right">Actual (Kg)</th>
                <th className="py-3 px-3 text-right">Variance</th>
                <th className="py-3 px-2 text-center">GPS Target</th>
                <th className="py-3 px-2 text-center">GPS Actual</th>
                <th className="py-3 px-2 text-center">40s GPS</th>
                <th className="py-3 px-2 text-center">Eff %</th>
                <th className="py-3 px-2 text-center">Breaks EM</th>
                <th className="py-3 px-3 text-left">Assigned Sider(s)</th>
                <th className="py-3 px-3 text-right">Incentive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {filteredEntries.map((entry, idx) => {
                const variance = (entry.productionActual || 0) - (entry.productionTarget || 0);
                const inc = calculateIncentive(entry, rules, report.date);
                const assignedWorkers = (entry.siderIds && entry.siderIds.length > 0)
                  ? entry.siderIds.map(id => resolveWorker(id, entry.siderName, workers).name).filter(Boolean).join(', ')
                  : (entry.siderName || (entry.siderId ? resolveWorker(entry.siderId, undefined, workers).name : 'Unassigned'));

                return (
                  <tr key={`${entry.frameNo}-${entry.shift}-${idx}`} className="hover:bg-stone-50/80 transition-colors">
                    <td className="py-2.5 px-3 font-black text-stone-900">{entry.frameNo}</td>
                    <td className="py-2.5 px-2 text-center">
                      <span className="px-2 py-0.5 bg-stone-100 rounded-md font-black text-[11px] border border-stone-200">
                        {entry.shift}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-stone-700">{entry.count}</td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-stone-500">
                      {Math.round(entry.productionTarget || 0)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-black text-stone-900">
                      {Math.round(entry.productionActual || 0)}
                    </td>
                    <td className={cn(
                      "py-2.5 px-3 text-right font-mono tabular-nums font-bold",
                      variance >= 0 ? "text-emerald-700" : "text-red-600"
                    )}>
                      {variance >= 0 ? `+${Math.round(variance)}` : Math.round(variance)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-stone-400">
                      {Math.round(entry.gpsTarget || 0)}
                    </td>
                    <td className={cn(
                      "py-2.5 px-2 text-center font-mono tabular-nums font-black",
                      (entry.gpsActual || 0) >= (entry.gpsTarget || 0) ? "text-emerald-700" : "text-stone-700"
                    )}>
                      {Math.round(entry.gpsActual || 0)}
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums font-bold text-stone-600">
                      {(() => {
                        const factor = countConversions.find(c => isCountNameMatching(c.count, entry.count))?.multiplicationFactor ?? 1.0;
                        const val = (entry.gps40sCon && entry.gps40sCon > 0) ? entry.gps40sCon : ((entry.gpsActual || 0) > 0 ? Math.round(entry.gpsActual * factor) : 0);
                        return val > 0 ? val : '-';
                      })()}
                    </td>
                    <td className="py-2.5 px-2 text-center font-bold">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-black",
                        (entry.efficiency || 0) >= 95 ? "bg-emerald-50 text-emerald-800" :
                        (entry.efficiency || 0) >= 90 ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-800"
                      )}>
                        {Math.round(entry.efficiency || 0)}%
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center font-mono tabular-nums text-stone-600">
                      {entry.doffEmt ? entry.doffEmt.toFixed(1) : '-'}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-stone-800 max-w-[150px] truncate">
                      {assignedWorkers}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums font-black text-stone-900">
                      {inc > 0 ? <span className="text-amber-700 font-bold">₹{inc}</span> : <span className="text-stone-300">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 3: RUNNING COUNTS SUMMARY */}
      {viewMode === 'counts' && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200/80">
          <table className={cn("w-full border-collapse text-left", isTvMode ? "text-lg" : "text-xs")}>
            <thead>
              <tr className="bg-stone-900 text-stone-50 uppercase tracking-wider font-black">
                <th className="py-3 px-4 text-left">Yarn Count</th>
                <th className="py-3 px-4 text-left">Active Machines</th>
                <th className="py-3 px-3 text-center">STD GPSS</th>
                <th className="py-3 px-3 text-center">Achieved Avg GPSS</th>
                <th className="py-3 px-3 text-center">40s Converted GPSS</th>
                <th className="py-3 px-4 text-right">Total Production (Kg)</th>
                <th className="py-3 px-3 text-center">Mill Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {runningCountsData.map((item) => (
                <tr key={item.count} className="hover:bg-stone-50/80 transition-colors">
                  <td className="py-3 px-4 font-black text-stone-900 text-sm">
                    {item.count}
                  </td>
                  <td className="py-3 px-4 font-bold text-stone-600">
                    {item.frames}
                  </td>
                  <td className="py-3 px-3 text-center font-mono tabular-nums text-stone-500 font-bold">
                    {item.stdGps}
                  </td>
                  <td className="py-3 px-3 text-center font-mono tabular-nums font-black text-emerald-700">
                    {item.avgGps}
                  </td>
                  <td className="py-3 px-3 text-center font-mono tabular-nums font-black text-stone-900">
                    {item.avg40sGps}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums font-black text-stone-900">
                    {item.totalProduction.toLocaleString('en-IN')} kg
                  </td>
                  <td className="py-3 px-3 text-center">
                    <span className="px-2 py-0.5 bg-stone-100 text-stone-800 rounded-full font-bold text-[11px]">
                      {item.sharePercent}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* VIEW 4: WORKER ALLOCATIONS & PAYOUTS */}
      {viewMode === 'workers' && (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-stone-200/80">
          <table className={cn("w-full border-collapse text-left", isTvMode ? "text-lg" : "text-xs")}>
            <thead>
              <tr className="bg-stone-900 text-stone-50 uppercase tracking-wider font-black">
                <th className="py-3 px-4 text-left">T.No</th>
                <th className="py-3 px-4 text-left">Employee Name</th>
                <th className="py-3 px-3 text-left">Designation</th>
                <th className="py-3 px-2 text-center">Shift</th>
                <th className="py-3 px-3 text-left">Assigned Frame</th>
                <th className="py-3 px-3 text-left">Count</th>
                <th className="py-3 px-3 text-center">GPSS</th>
                <th className="py-3 px-4 text-right">Daily Payout</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-medium">
              {workerAllocationData.map((w, idx) => (
                <tr key={`${w.tNo}-${w.shift}-${w.machine}-${idx}`} className="hover:bg-stone-50/80 transition-colors">
                  <td className="py-2.5 px-4 font-mono font-bold text-stone-600">
                    {w.tNo}
                  </td>
                  <td className="py-2.5 px-4 font-black text-stone-900">
                    {w.name}
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-stone-100 text-stone-700">
                      {w.role}
                    </span>
                  </td>
                  <td className="py-2.5 px-2 text-center font-bold text-stone-800">
                    Shift {w.shift}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-stone-700">
                    {w.machine}
                  </td>
                  <td className="py-2.5 px-3 font-bold text-stone-600">
                    {w.count}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono tabular-nums font-bold text-stone-800">
                    {w.gps > 0 ? w.gps : '-'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums font-black text-stone-900">
                    {w.incentive > 0 ? (
                      <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-bold">
                        ₹{w.incentive}
                      </span>
                    ) : (
                      <span className="text-stone-300">₹0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Print Signature Footer Block */}
      <div className="hidden print-signatures">
        <div className="print-signature-box">
          Prepared By
        </div>
        <div className="print-signature-box">
          Shift Supervisor
        </div>
        <div className="print-signature-box">
          Mill Manager / Accounts
        </div>
      </div>
    </div>
  );
};
