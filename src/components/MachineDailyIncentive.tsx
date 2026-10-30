import React, { useMemo, useState } from 'react';
import { DailyReport, Sider, IncentiveRule, ProductionEntry, Shift } from '../types';
import { Coins, Printer, Calendar, ArrowRight, Zap, Target, Award, Download, FileSpreadsheet } from 'lucide-react';
import { cn, calculateIncentive, calculateSiderSlotIncentive, getGaiterIncentive, parseUniversalDateParts } from '../lib/utils';
import * as XLSX from 'xlsx';

interface MachineDailyIncentiveProps {
  report: DailyReport;
  workers: Sider[];
  rules: IncentiveRule[];
  onSelectDate: (date: string) => void;
  machineSiderCounts: Record<string, number>;
  isTvMode?: boolean;
  shed?: string;
}

export const MachineDailyIncentive: React.FC<MachineDailyIncentiveProps> = ({
  report,
  workers,
  rules,
  onSelectDate,
  machineSiderCounts = {},
  isTvMode = false,
  shed
}) => {
  // Determine if current shed is KTTM (or frame belongs to KTTM)
  const isKttmShed = useMemo(() => {
    const s = (shed || report.shed || report.entries?.[0]?.shed || '').toLowerCase();
    return s.includes('kttm');
  }, [shed, report.shed, report.entries]);

  const checkIsKttmFrame = (frameNo: string) => {
    if (isKttmShed) return true;
    const fUpper = String(frameNo || '').trim().toUpperCase();
    return fUpper.startsWith('K');
  };

  // Convert date to YYYY-MM-DD for <input type="date">
  const dateForInput = useMemo(() => {
    if (!report.date) return '';
    const parts = parseUniversalDateParts(report.date);
    if (!parts) return '';
    const mStr = parts.month.toString().padStart(2, '0');
    const dStr = parts.day.toString().padStart(2, '0');
    return `${parts.year}-${mStr}-${dStr}`;
  }, [report.date]);

  // Convert YYYY-MM-DD to DD/MM/YYYY for application state
  const handleDateChange = (isoDate: string) => {
    if (!isoDate) return;
    const parts = isoDate.split('-');
    if (parts.length !== 3) return;
    const formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
    onSelectDate(formattedDate);
  };

  // Get active unique frame numbers
  const machines = useMemo(() => {
    const unique = Array.from(new Set(report.entries.map(e => e.frameNo))).filter(Boolean).sort();
    return unique;
  }, [report.entries]);

  // Process data for the machine-wise rows
  const tableRows = useMemo(() => {
    const rows: {
      frameNo: string;
      slotIdx: number;
      totalSlots?: number;
      isKttm: boolean;
      displayCount: string;
      shiftsData: Record<Shift, {
        gps: number;
        name: string;
        incentive: number;
        assigned: boolean;
      }>;
    }[] = [];

    machines.forEach(frameNo => {
      const isKttm = checkIsKttmFrame(frameNo);
      // For KTTM, default to 1 slot (single whole-machine sider) if not explicitly set
      // For other sheds, default to 2 slots (LH and RH)
      const defaultSlots = isKttm ? 1 : 2;
      const numSlots = machineSiderCounts[frameNo] !== undefined ? machineSiderCounts[frameNo] : defaultSlots;
      
      // Compute machine-wide counts
      const machineEntries = report.entries.filter(e => e.frameNo === frameNo);
      const uniqueCounts = Array.from(new Set(machineEntries.map(e => e.count).filter(Boolean)));
      const displayCount = uniqueCounts.join(', ') || '40s';

      for (let slotIdx = 0; slotIdx < numSlots; slotIdx++) {
        const shiftsData = {} as Record<Shift, {
          gps: number;
          name: string;
          incentive: number;
          assigned: boolean;
        }>;

        const shiftsList: Shift[] = ['I', 'II', 'III'];
        shiftsList.forEach(shift => {
          const entry = report.entries.find(e => e.frameNo === frameNo && e.shift === shift);
          if (entry) {
            const workerId = entry.siderIds?.[slotIdx] || (slotIdx === 0 ? entry.siderId : '');
            const worker = workerId ? workers.find(w => w.id === workerId) : null;
            
            let incentive = 0;
            if (worker) {
              incentive = calculateSiderSlotIncentive(entry, slotIdx, report, rules, workers);
            }

            shiftsData[shift] = {
              gps: entry.gpsActual,
              name: worker ? worker.name : '',
              incentive,
              assigned: !!worker
            };
          } else {
            shiftsData[shift] = {
              gps: 0,
              name: '',
              incentive: 0,
              assigned: false
            };
          }
        });

        rows.push({
          frameNo,
          slotIdx,
          totalSlots: numSlots,
          isKttm,
          displayCount,
          shiftsData
        });
      }
    });

    return rows;
  }, [machines, report.entries, workers, rules, machineSiderCounts, isKttmShed]);

  // Process data for gaiters rows
  const gaiterRows = useMemo(() => {
    const shiftsList: Shift[] = ['I', 'II', 'III'];
    
    // Find the max number of gaiter slots assigned in any of the shifts
    const maxGaiters = Math.max(
      report.gaiters?.I?.length || 0,
      report.gaiters?.II?.length || 0,
      report.gaiters?.III?.length || 0,
      1
    );

    const rows: {
      gaiterIdx: number;
      shiftsData: Record<Shift, {
        gps: number;
        name: string;
        incentive: number;
        assigned: boolean;
      }>;
    }[] = [];

    // For each gaiter slot index
    for (let gIdx = 0; gIdx < maxGaiters; gIdx++) {
      const shiftsData = {} as Record<Shift, {
        gps: number;
        name: string;
        incentive: number;
        assigned: boolean;
      }>;

      shiftsList.forEach(shift => {
        const shiftGaiters = report.gaiters?.[shift] || [];
        const workerId = shiftGaiters[gIdx] || '';
        const worker = workerId ? workers.find(w => w.id === workerId) : null;

        if (worker) {
          const shiftEntries = report.entries.filter(e => e.shift === shift);
          const minGpsEntry = shiftEntries.length > 0 
            ? shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]) 
            : null;

          const gps = minGpsEntry ? minGpsEntry.gpsActual : 0;
          const incentive = getGaiterIncentive(report, shift, rules, workers);

          shiftsData[shift] = {
            gps,
            name: worker.name,
            incentive,
            assigned: true
          };
        } else {
          shiftsData[shift] = {
            gps: 0,
            name: '',
            incentive: 0,
            assigned: false
          };
        }
      });

      rows.push({
        gaiterIdx: gIdx,
        shiftsData
      });
    }

    return rows;
  }, [report, workers, rules]);

  // Compute AI Linkconer shift data (Average utilisation, Name, computed incentive)
  const aiconerShiftData = useMemo(() => {
    const shiftsList: Shift[] = ['I', 'II', 'III'];
    const data = {} as Record<Shift, {
      utility: number;
      name: string;
      incentive: number;
      assigned: boolean;
    }>;

    shiftsList.forEach(shift => {
      const shiftEntries = report.entries.filter(e => e.shift === shift);
      const utilEntries = shiftEntries.filter(e => typeof e.utility === 'number' && !isNaN(e.utility) && e.utility > 0);
      const avgUtility = utilEntries.length > 0
        ? utilEntries.reduce((acc, curr) => acc + curr.utility, 0) / utilEntries.length
        : 0;

      const workerId = report.aiCones?.[shift]?.[0] || '';
      const targetIdLower = String(workerId).toLowerCase().trim();
      const worker = workerId ? workers.find(w => 
        w.id.toLowerCase().trim() === targetIdLower || 
        w.tNo.toLowerCase().trim() === targetIdLower ||
        w.name.toLowerCase().trim() === targetIdLower
      ) : null;

      let incentive = 0;
      if (worker) {
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
        if (matchedRule) {
          const sortedPayouts = [...matchedRule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
          const bestPayout = sortedPayouts.find(p => Math.round(avgUtility) >= p.gpsThreshold);
          incentive = bestPayout ? bestPayout.amount : 0;
        }
      }

      data[shift] = {
        utility: avgUtility,
        name: worker ? worker.name : '',
        incentive,
        assigned: !!worker
      };
    });

    return data;
  }, [report, workers, rules]);

  // Compute shift-wise totals
  const shiftTotals = useMemo(() => {
    const totals = {
      I: 0,
      II: 0,
      III: 0
    };

    tableRows.forEach(row => {
      totals.I += row.shiftsData.I.incentive;
      totals.II += row.shiftsData.II.incentive;
      totals.III += row.shiftsData.III.incentive;
    });

    gaiterRows.forEach(row => {
      totals.I += row.shiftsData.I.incentive;
      totals.II += row.shiftsData.II.incentive;
      totals.III += row.shiftsData.III.incentive;
    });

    // Add AI Linkconer incentives to the totals
    totals.I += aiconerShiftData.I.incentive;
    totals.II += aiconerShiftData.II.incentive;
    totals.III += aiconerShiftData.III.incentive;

    return totals;
  }, [tableRows, gaiterRows, aiconerShiftData]);

  const grandTotal = shiftTotals.I + shiftTotals.II + shiftTotals.III;

  const exportToExcel = () => {
    const dataRows: any[] = [];
    tableRows.forEach(row => {
      const rfLabel = (!row.isKttm && (row.totalSlots || 0) > 1)
        ? `${row.frameNo} (${row.slotIdx === 0 ? 'LH' : row.slotIdx === 1 ? 'RH' : `S${row.slotIdx + 1}`})`
        : row.frameNo;

      dataRows.push({
        'Rf No': rfLabel,
        'Count': row.displayCount,
        'Shift 1 GPS': row.shiftsData.I.gps > 0 ? Math.round(row.shiftsData.I.gps) : '-',
        'Shift 1 Operator': row.shiftsData.I.name || '-',
        'Shift 1 Incentive (INR)': row.shiftsData.I.incentive,
        'Shift 2 GPS': row.shiftsData.II.gps > 0 ? Math.round(row.shiftsData.II.gps) : '-',
        'Shift 2 Operator': row.shiftsData.II.name || '-',
        'Shift 2 Incentive (INR)': row.shiftsData.II.incentive,
        'Shift 3 GPS': row.shiftsData.III.gps > 0 ? Math.round(row.shiftsData.III.gps) : '-',
        'Shift 3 Operator': row.shiftsData.III.name || '-',
        'Shift 3 Incentive (INR)': row.shiftsData.III.incentive,
        'Total Machine Payout (INR)': row.shiftsData.I.incentive + row.shiftsData.II.incentive + row.shiftsData.III.incentive
      });
    });

    dataRows.push({
      'Rf No': 'TOTAL',
      'Count': '',
      'Shift 1 GPS': '',
      'Shift 1 Operator': '',
      'Shift 1 Incentive (INR)': shiftTotals.I,
      'Shift 2 GPS': '',
      'Shift 2 Operator': '',
      'Shift 2 Incentive (INR)': shiftTotals.II,
      'Shift 3 GPS': '',
      'Shift 3 Operator': '',
      'Shift 3 Incentive (INR)': shiftTotals.III,
      'Total Machine Payout (INR)': grandTotal
    });

    const ws = XLSX.utils.json_to_sheet(dataRows);
    ws['!cols'] = [
      { wch: 10 },
      { wch: 16 },
      { wch: 12 },
      { wch: 22 },
      { wch: 14 },
      { wch: 12 },
      { wch: 22 },
      { wch: 14 },
      { wch: 12 },
      { wch: 22 },
      { wch: 14 },
      { wch: 18 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Machine Incentive Daily');
    const safeDate = (report.date || 'live').replace(/[/\\?%*:|"<>]/g, '-');
    XLSX.writeFile(wb, `Machine_Daily_Incentive_${safeDate}.xlsx`);
  };

  const exportToCSV = () => {
    const safeDate = (report.date || 'live').replace(/[/\\?%*:|"<>]/g, '-');
    const shedTitle = (report.shed || shed || 'SPINNING MILLS').toUpperCase();
    let csv = `${shedTitle} - MACHINE WISE DAILY INCENTIVE (${report.date})\n\n`;
    csv += `Rf No,Count,Shift 1 GPS,Shift 1 Operator,Shift 1 Incentive,Shift 2 GPS,Shift 2 Operator,Shift 2 Incentive,Shift 3 GPS,Shift 3 Operator,Shift 3 Incentive,Total Machine Payout\n`;

    tableRows.forEach(row => {
      const rfLabel = (!row.isKttm && (row.totalSlots || 0) > 1)
        ? `${row.frameNo} (${row.slotIdx === 0 ? 'LH' : row.slotIdx === 1 ? 'RH' : `S${row.slotIdx + 1}`})`
        : row.frameNo;
      const tot = row.shiftsData.I.incentive + row.shiftsData.II.incentive + row.shiftsData.III.incentive;
      csv += `"${rfLabel}","${row.displayCount}",${row.shiftsData.I.gps > 0 ? Math.round(row.shiftsData.I.gps) : 0},"${row.shiftsData.I.name || ''}",${row.shiftsData.I.incentive},${row.shiftsData.II.gps > 0 ? Math.round(row.shiftsData.II.gps) : 0},"${row.shiftsData.II.name || ''}",${row.shiftsData.II.incentive},${row.shiftsData.III.gps > 0 ? Math.round(row.shiftsData.III.gps) : 0},"${row.shiftsData.III.name || ''}",${row.shiftsData.III.incentive},${tot}\n`;
    });

    csv += `TOTAL,,,,${shiftTotals.I},,,${shiftTotals.II},,,${shiftTotals.III},${grandTotal}\n`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Machine_Daily_Incentive_${safeDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full px-2 mx-auto pb-12">
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">
          {(report.shed || shed || 'SPINNING MILLS').toUpperCase()}
        </h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">Machine Wise Daily Incentive Statement</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Date: <strong>{report.date}</strong></span>
          <span>Shift I: <strong>₹{shiftTotals.I.toLocaleString()}</strong> | Shift II: <strong>₹{shiftTotals.II.toLocaleString()}</strong> | Shift III: <strong>₹{shiftTotals.III.toLocaleString()}</strong></span>
          <span>Total Payout: <strong>₹{grandTotal.toLocaleString()}</strong></span>
        </div>
      </div>
      
      {/* Title / Action Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-2 border-b-2 border-stone-200 pb-2 gap-3 no-print">
        <div className="text-left">
          <h2 className="text-xl md:text-2xl font-black text-stone-900 border-b-4 border-stone-900 inline-block px-2 pb-1 uppercase tracking-tight">
            Daily Incentive Statement - Machine Wise
          </h2>
          <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mt-1 px-2">
            Machine wise incentive - Daily
          </p>
          {!isTvMode && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-1.5 bg-stone-950 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider text-[11px] hover:bg-stone-800 transition-all active:scale-95 shadow-xs cursor-pointer"
              >
                <Printer size={13} className="text-emerald-400" /> Print
              </button>
              <button 
                onClick={exportToExcel}
                className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider text-[11px] transition-all active:scale-95 cursor-pointer shadow-xs"
                title="Download as Microsoft Excel"
              >
                <FileSpreadsheet size={13} /> Excel (.xlsx)
              </button>
              <button 
                onClick={exportToCSV}
                className="flex items-center gap-1.5 bg-stone-100 text-stone-700 hover:bg-stone-200 border border-stone-200 px-3 py-1.5 rounded-lg font-black uppercase tracking-wider text-[11px] transition-all active:scale-95 cursor-pointer shadow-xs"
                title="Download as CSV"
              >
                <Download size={13} /> CSV
              </button>
            </div>
          )}
        </div>

        {/* Date Selector */}
        <div className="flex flex-col items-start lg:items-end gap-1 text-right">
          <div className="flex border-2 border-stone-900 divide-x-2 divide-stone-900 overflow-hidden rounded-lg font-bold shadow-xs">
            <div className="bg-yellow-400 px-3 py-1.5 text-center uppercase tracking-tight text-xs font-black flex items-center justify-center">
              Sider Assigned Date
            </div>
            <div className="relative flex-1 min-w-[150px]">
              <input 
                type="date"
                className="w-full bg-white px-3 py-1.5 text-center whitespace-nowrap tabular-nums text-xs md:text-sm font-bold outline-none focus:bg-stone-50 transition-colors cursor-pointer no-print"
                value={dateForInput}
                onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                onChange={(e) => handleDateChange(e.target.value)}
              />
              <div className="hidden print-only absolute inset-0 bg-white items-center justify-center font-black flex text-xs">
                {report.date}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Machine Wise Incentive Grid */}
      <div className="bg-white overflow-hidden shadow-lg border border-stone-200 rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-2 border-stone-900 border-collapse text-left">
            <thead>
              {/* Shift Headers Row */}
              <tr className="border-b-2 border-stone-900 text-center font-black bg-stone-100 uppercase tracking-wider">
                <th colSpan={2} className="px-2 py-1.5 border-r-2 border-stone-900"></th>
                <th colSpan={3} className={cn("border-r-2 border-stone-900 text-stone-900 bg-stone-50", isTvMode ? "px-4 py-3 text-base md:text-lg font-black" : "px-2 py-1.5 text-xs md:text-sm")}>
                  Shift 1 (I)
                </th>
                <th colSpan={3} className={cn("border-r-2 border-stone-900 text-stone-900 bg-stone-100", isTvMode ? "px-4 py-3 text-base md:text-lg font-black" : "px-2 py-1.5 text-xs md:text-sm")}>
                  Shift 2 (II)
                </th>
                <th colSpan={3} className={cn("text-stone-900 bg-stone-50", isTvMode ? "px-4 py-3 text-base md:text-lg font-black" : "px-2 py-1.5 text-xs md:text-sm")}>
                  Shift 3 (III)
                </th>
              </tr>
              {/* Detail Headers Row */}
              <tr className={cn("border-b-2 border-stone-900 bg-stone-200 uppercase tracking-wider font-black text-center", isTvMode ? "text-sm md:text-base" : "text-xs")}>
                <th className={cn("border-r-2 border-stone-900 text-left min-w-[70px]", isTvMode ? "px-3 py-2.5" : "px-2 py-1.5")}>Rf no</th>
                <th className={cn("border-r-2 border-stone-900 text-left min-w-[90px]", isTvMode ? "px-3 py-2.5" : "px-2 py-1.5")}>Count</th>
                
                {/* Shift 1 Details */}
                <th className={cn("border-r border-stone-300 w-[70px]", isTvMode ? "px-2 py-2.5" : "px-1.5 py-1.5")}>GPS</th>
                <th className={cn("border-r border-stone-300 min-w-[110px] text-left", isTvMode ? "px-3 py-2.5" : "px-2 py-1.5")}>Name</th>
                <th className={cn("border-r-2 border-stone-900 w-[95px] text-right", isTvMode ? "px-3 py-2.5" : "px-2 py-1.5")}>Incentive</th>
                
                {/* Shift 2 Details */}
                <th className={cn("border-r border-stone-300 w-[70px]", isTvMode ? "px-2 py-2.5" : "px-1.5 py-1.5")}>GPS</th>
                <th className={cn("border-r border-stone-300 min-w-[110px] text-left", isTvMode ? "px-3 py-2.5" : "px-2 py-1.5")}>Name</th>
                <th className={cn("border-r-2 border-stone-900 w-[95px] text-right", isTvMode ? "px-3 py-2.5" : "px-2 py-1.5")}>Incentive</th>
                
                {/* Shift 3 Details */}
                <th className={cn("border-r border-stone-300 w-[70px]", isTvMode ? "px-2 py-2.5" : "px-1.5 py-1.5")}>GPS</th>
                <th className={cn("border-r border-stone-300 min-w-[110px] text-left", isTvMode ? "px-3 py-2.5" : "px-2 py-1.5")}>Name</th>
                <th className={cn("w-[95px] text-right", isTvMode ? "px-3 py-2.5" : "px-2 py-1.5")}>Incentive</th>
              </tr>
            </thead>
            <tbody>
              {/* Machine Rows */}
              {tableRows.map((row, idx) => (
                <tr 
                  key={`mach-${row.frameNo}-${row.slotIdx}-${idx}`}
                  className={cn("border-b border-stone-200 hover:bg-stone-50 transition-colors font-bold text-stone-800", isTvMode ? "text-base md:text-lg" : "text-xs md:text-sm")}
                >
                  {/* Machine Rf No */}
                  <td className={cn("border-r-2 border-stone-900 font-black text-stone-900 bg-stone-50/50 uppercase", isTvMode ? "px-3 py-2 text-lg md:text-xl font-black" : "px-2 py-1")}>
                    <div className="flex items-center gap-1">
                      <span>{row.frameNo}</span>
                      {!row.isKttm && (row.totalSlots || 0) > 1 && (
                        <span className={cn(
                          "text-[9px] px-1 py-0.2 rounded font-black tracking-tight",
                          row.slotIdx === 0 ? "bg-blue-100 text-blue-800" :
                          row.slotIdx === 1 ? "bg-indigo-100 text-indigo-800" :
                          row.slotIdx === 2 ? "bg-purple-100 text-purple-800" :
                          "bg-pink-100 text-pink-800"
                        )}>
                          {row.slotIdx === 0 ? 'LH' : row.slotIdx === 1 ? 'RH' : `S${row.slotIdx + 1}`}
                        </span>
                      )}
                    </div>
                  </td>
                  {/* Count */}
                  <td className={cn("border-r-2 border-stone-900 text-stone-600 bg-stone-50/20 truncate max-w-[110px]", isTvMode ? "px-3 py-2 text-base md:text-lg font-bold" : "px-2 py-1")} title={row.displayCount}>
                    {row.displayCount}
                  </td>

                  {/* Shift 1 Data */}
                  <td className={cn("border-r border-stone-300 text-center tabular-nums text-stone-700", isTvMode ? "px-2 py-2 text-base md:text-lg font-bold" : "px-1.5 py-1")}>
                    {row.shiftsData.I.gps > 0 ? Math.round(row.shiftsData.I.gps) : '-'}
                  </td>
                  <td className={cn(
                    "border-r border-stone-300 uppercase truncate max-w-[120px]",
                    isTvMode ? "px-3 py-2 text-base md:text-lg" : "px-2 py-1",
                    row.shiftsData.I.assigned ? "text-stone-900 font-black" : "text-stone-300 italic"
                  )}>
                    {row.shiftsData.I.name || '-'}
                  </td>
                  <td className={cn("border-r-2 border-stone-900 text-right tabular-nums font-black text-indigo-900", isTvMode ? "px-3 py-2 text-lg md:text-xl" : "px-2 py-1 text-xs md:text-sm")}>
                    {row.shiftsData.I.assigned && row.shiftsData.I.incentive > 0 ? (
                      `₹${row.shiftsData.I.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>

                  {/* Shift 2 Data */}
                  <td className={cn("border-r border-stone-300 text-center tabular-nums text-stone-700", isTvMode ? "px-2 py-2 text-base md:text-lg font-bold" : "px-1.5 py-1")}>
                    {row.shiftsData.II.gps > 0 ? Math.round(row.shiftsData.II.gps) : '-'}
                  </td>
                  <td className={cn(
                    "border-r border-stone-300 uppercase truncate max-w-[120px]",
                    isTvMode ? "px-3 py-2 text-base md:text-lg" : "px-2 py-1",
                    row.shiftsData.II.assigned ? "text-stone-900 font-black" : "text-stone-300 italic"
                  )}>
                    {row.shiftsData.II.name || '-'}
                  </td>
                  <td className={cn("border-r-2 border-stone-900 text-right tabular-nums font-black text-indigo-900", isTvMode ? "px-3 py-2 text-lg md:text-xl" : "px-2 py-1 text-xs md:text-sm")}>
                    {row.shiftsData.II.assigned && row.shiftsData.II.incentive > 0 ? (
                      `₹${row.shiftsData.II.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>

                  {/* Shift 3 Data */}
                  <td className={cn("border-r border-stone-300 text-center tabular-nums text-stone-700", isTvMode ? "px-2 py-2 text-base md:text-lg font-bold" : "px-1.5 py-1")}>
                    {row.shiftsData.III.gps > 0 ? Math.round(row.shiftsData.III.gps) : '-'}
                  </td>
                  <td className={cn(
                    "border-r border-stone-300 uppercase truncate max-w-[120px]",
                    isTvMode ? "px-3 py-2 text-base md:text-lg" : "px-2 py-1",
                    row.shiftsData.III.assigned ? "text-stone-900 font-black" : "text-stone-300 italic"
                  )}>
                    {row.shiftsData.III.name || '-'}
                  </td>
                  <td className={cn("text-right tabular-nums font-black text-indigo-900", isTvMode ? "px-3 py-2 text-lg md:text-xl" : "px-2 py-1 text-xs md:text-sm")}>
                    {row.shiftsData.III.assigned && row.shiftsData.III.incentive > 0 ? (
                      `₹${row.shiftsData.III.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>
                </tr>
              ))}

              {/* Gaiter Rows */}
              {gaiterRows.map((row, gIdx) => (
                <tr 
                  key={`gaiter-row-${gIdx}`}
                  className={cn("border-b border-stone-200 bg-amber-50/15 hover:bg-stone-100/30 transition-colors font-bold text-stone-800", isTvMode ? "text-base md:text-lg" : "text-xs md:text-sm")}
                >
                  <td className={cn("border-r-2 border-stone-900 font-black text-stone-900 bg-amber-50 uppercase flex items-center gap-1", isTvMode ? "px-3 py-2 text-lg" : "px-2 py-1")}>
                    <Zap size={14} className="text-amber-500 shrink-0" /> Gaiter
                  </td>
                  <td className={cn("border-r-2 border-stone-900 text-amber-700 bg-amber-50/30 font-black uppercase tracking-wider", isTvMode ? "px-3 py-2 text-xs" : "px-2 py-1 text-[10px]")}>
                    Support
                  </td>

                  {/* Shift 1 Gaiter */}
                  <td className={cn("border-r border-stone-300 text-center tabular-nums text-amber-700", isTvMode ? "px-2 py-2 text-base md:text-lg font-bold" : "px-1.5 py-1")}>
                    {row.shiftsData.I.gps > 0 ? Math.round(row.shiftsData.I.gps) : '-'}
                  </td>
                  <td className={cn(
                    "border-r border-stone-300 uppercase truncate max-w-[120px]",
                    isTvMode ? "px-3 py-2 text-base md:text-lg" : "px-2 py-1",
                    row.shiftsData.I.assigned ? "text-amber-950 font-black" : "text-stone-300 italic"
                  )}>
                    {row.shiftsData.I.name || '-'}
                  </td>
                  <td className={cn("border-r-2 border-stone-900 text-right tabular-nums font-black text-amber-800", isTvMode ? "px-3 py-2 text-lg md:text-xl" : "px-2 py-1 text-xs md:text-sm")}>
                    {row.shiftsData.I.assigned && row.shiftsData.I.incentive > 0 ? (
                      `₹${row.shiftsData.I.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>

                  {/* Shift 2 Gaiter */}
                  <td className={cn("border-r border-stone-300 text-center tabular-nums text-amber-700", isTvMode ? "px-2 py-2 text-base md:text-lg font-bold" : "px-1.5 py-1")}>
                    {row.shiftsData.II.gps > 0 ? Math.round(row.shiftsData.II.gps) : '-'}
                  </td>
                  <td className={cn(
                    "border-r border-stone-300 uppercase truncate max-w-[120px]",
                    isTvMode ? "px-3 py-2 text-base md:text-lg" : "px-2 py-1",
                    row.shiftsData.II.assigned ? "text-amber-950 font-black" : "text-stone-300 italic"
                  )}>
                    {row.shiftsData.II.name || '-'}
                  </td>
                  <td className={cn("border-r-2 border-stone-900 text-right tabular-nums font-black text-amber-800", isTvMode ? "px-3 py-2 text-lg md:text-xl" : "px-2 py-1 text-xs md:text-sm")}>
                    {row.shiftsData.II.assigned && row.shiftsData.II.incentive > 0 ? (
                      `₹${row.shiftsData.II.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>

                  {/* Shift 3 Gaiter */}
                  <td className={cn("border-r border-stone-300 text-center tabular-nums text-amber-700", isTvMode ? "px-2 py-2 text-base md:text-lg font-bold" : "px-1.5 py-1")}>
                    {row.shiftsData.III.gps > 0 ? Math.round(row.shiftsData.III.gps) : '-'}
                  </td>
                  <td className={cn(
                    "border-r border-stone-300 uppercase truncate max-w-[120px]",
                    isTvMode ? "px-3 py-2 text-base md:text-lg" : "px-2 py-1",
                    row.shiftsData.III.assigned ? "text-amber-950 font-black" : "text-stone-300 italic"
                  )}>
                    {row.shiftsData.III.name || '-'}
                  </td>
                  <td className={cn("text-right tabular-nums font-black text-amber-800", isTvMode ? "px-3 py-2 text-lg md:text-xl" : "px-2 py-1 text-xs md:text-sm")}>
                    {row.shiftsData.III.assigned && row.shiftsData.III.incentive > 0 ? (
                      `₹${row.shiftsData.III.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>
                </tr>
              ))}

              {/* Shift wise Sums Row */}
              <tr className={cn("bg-stone-100 border-t-2 border-stone-900 font-black text-stone-900", isTvMode ? "text-base md:text-lg" : "text-xs md:text-sm")}>
                <td colSpan={2} className={cn("border-r-2 border-stone-900 uppercase tracking-tight text-stone-700 text-center font-black", isTvMode ? "px-3 py-3 text-sm md:text-base" : "px-2 py-1.5 text-xs")}>
                  Total Incentive Amount
                </td>

                {/* Shift 1 Sum */}
                <td colSpan={2} className={cn("border-r border-stone-300 text-right text-stone-600 font-bold uppercase", isTvMode ? "px-3 py-3 text-sm" : "px-2 py-1.5 text-xs")}>
                  Shift I Total:
                </td>
                <td className={cn("border-r-2 border-stone-900 text-right tabular-nums bg-yellow-400 text-stone-950 font-black", isTvMode ? "px-3 py-3 text-base md:text-lg font-black" : "px-2 py-1.5 text-xs md:text-sm")}>
                  ₹{shiftTotals.I.toLocaleString()}
                </td>

                {/* Shift 2 Sum */}
                <td colSpan={2} className={cn("border-r border-stone-300 text-right text-stone-600 font-bold uppercase", isTvMode ? "px-3 py-3 text-sm" : "px-2 py-1.5 text-xs")}>
                  Shift II Total:
                </td>
                <td className={cn("border-r-2 border-stone-900 text-right tabular-nums bg-yellow-400 text-stone-950 font-black", isTvMode ? "px-3 py-3 text-base md:text-lg font-black" : "px-2 py-1.5 text-xs md:text-sm")}>
                  ₹{shiftTotals.II.toLocaleString()}
                </td>

                {/* Shift 3 Sum */}
                <td colSpan={2} className={cn("border-r border-stone-300 text-right text-stone-600 font-bold uppercase", isTvMode ? "px-3 py-3 text-sm" : "px-2 py-1.5 text-xs")}>
                  Shift III Total:
                </td>
                <td className={cn("text-right tabular-nums bg-yellow-400 text-stone-950 font-black", isTvMode ? "px-3 py-3 text-base md:text-lg font-black" : "px-2 py-1.5 text-xs md:text-sm")}>
                  ₹{shiftTotals.III.toLocaleString()}
                </td>
              </tr>

              {/* Grand Total Row */}
              <tr className="bg-stone-900 font-black text-white">
                <td colSpan={8} className={cn("text-center uppercase tracking-wider text-rose-400 font-black", isTvMode ? "px-4 py-3.5 text-base md:text-lg" : "px-3 py-2 text-xs md:text-sm")}>
                  Total Incentive Amount for the Day
                </td>
                <td colSpan={3} className={cn("text-right tabular-nums font-black bg-rose-600 text-white leading-none", isTvMode ? "px-4 py-3.5 text-lg md:text-2xl" : "px-3 py-2 text-sm md:text-base")}>
                  ₹{grandTotal.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* AI Linkconer Table */}
      <div className="mt-4 space-y-2">
        <div className="flex items-center gap-1.5">
          <Zap className="text-purple-600 shrink-0" size={18} />
          <h3 className="text-sm md:text-base font-black text-stone-900 uppercase tracking-tight">Table for AI Linkconer</h3>
        </div>
        
        <div className="bg-white overflow-hidden shadow-lg border border-stone-200 rounded-xl">
          <div className="overflow-x-auto">
            <table className="w-full border-2 border-stone-900 border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-stone-900 text-center font-black bg-stone-100 uppercase tracking-wider">
                  <th colSpan={2} className="px-2 py-1.5 border-r-2 border-stone-900"></th>
                  <th colSpan={3} className="px-2 py-1.5 border-r-2 border-stone-900 text-purple-950 text-xs md:text-sm bg-purple-50">
                    Shift 1 (I)
                  </th>
                  <th colSpan={3} className="px-2 py-1.5 border-r-2 border-stone-900 text-purple-950 text-xs md:text-sm bg-purple-100/45">
                    Shift 2 (II)
                  </th>
                  <th colSpan={3} className="px-2 py-1.5 text-purple-950 text-xs md:text-sm bg-purple-50">
                    Shift 3 (III)
                  </th>
                </tr>
                <tr className="border-b-2 border-stone-900 text-xs bg-stone-200 uppercase tracking-wider font-black text-center">
                  <th className="px-2 py-1.5 border-r-2 border-stone-900 text-left min-w-[90px]">Linkconer No</th>
                  <th className="px-2 py-1.5 border-r-2 border-stone-900 w-[60px]"></th>
                  
                  {/* Shift 1 Details */}
                  <th className="px-1.5 py-1.5 border-r border-stone-300 w-[60px] text-center">U%</th>
                  <th className="px-2 py-1.5 border-r border-stone-300 min-w-[100px] text-left">Name</th>
                  <th className="px-2 py-1.5 border-r-2 border-stone-900 w-[80px] text-right">Incentive</th>
                  
                  {/* Shift 2 Details */}
                  <th className="px-1.5 py-1.5 border-r border-stone-300 w-[60px] text-center">U%</th>
                  <th className="px-2 py-1.5 border-r border-stone-300 min-w-[100px] text-left">Name</th>
                  <th className="px-2 py-1.5 border-r-2 border-stone-900 w-[80px] text-right">Incentive</th>
                  
                  {/* Shift 3 Details */}
                  <th className="px-1.5 py-1.5 border-r border-stone-300 w-[60px] text-center">U%</th>
                  <th className="px-2 py-1.5 border-r border-stone-300 min-w-[100px] text-left">Name</th>
                  <th className="px-2 py-1.5 w-[80px] text-right">Incentive</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b-2 border-stone-900 text-xs md:text-sm hover:bg-purple-50/20 transition-colors font-bold text-stone-800">
                  {/* Linkconer No Column */}
                  <td className="px-2 py-1.5 border-r-2 border-stone-900 font-black text-purple-900 bg-purple-50/20 uppercase">
                    1 to 6
                  </td>
                  {/* Empty Spacer Column */}
                  <td className="px-2 py-1.5 border-r-2 border-stone-900 text-stone-300 bg-stone-50/20 text-center font-black">
                    -
                  </td>

                  {/* Shift 1 Data */}
                  <td className="px-1.5 py-1.5 border-r border-stone-300 text-center tabular-nums text-purple-700 font-black">
                    {aiconerShiftData.I.assigned ? `${Math.round(aiconerShiftData.I.utility)}%` : '-'}
                  </td>
                  <td className={cn(
                    "px-2 py-1.5 border-r border-stone-300 uppercase truncate max-w-[120px]",
                    aiconerShiftData.I.assigned ? "text-stone-900 font-black" : "text-stone-300 italic"
                  )}>
                    {aiconerShiftData.I.name || '-'}
                  </td>
                  <td className="px-2 py-1.5 border-r-2 border-stone-900 text-right tabular-nums text-xs md:text-sm font-black text-purple-900">
                    {aiconerShiftData.I.assigned && aiconerShiftData.I.incentive > 0 ? (
                      `₹${aiconerShiftData.I.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>

                  {/* Shift 2 Data */}
                  <td className="px-1.5 py-1.5 border-r border-stone-300 text-center tabular-nums text-purple-700 font-black">
                    {aiconerShiftData.II.assigned ? `${Math.round(aiconerShiftData.II.utility)}%` : '-'}
                  </td>
                  <td className={cn(
                    "px-2 py-1.5 border-r border-stone-300 uppercase truncate max-w-[120px]",
                    aiconerShiftData.II.assigned ? "text-stone-900 font-black" : "text-stone-300 italic"
                  )}>
                    {aiconerShiftData.II.name || '-'}
                  </td>
                  <td className="px-2 py-1.5 border-r-2 border-stone-900 text-right tabular-nums text-xs md:text-sm font-black text-purple-900">
                    {aiconerShiftData.II.assigned && aiconerShiftData.II.incentive > 0 ? (
                      `₹${aiconerShiftData.II.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>

                  {/* Shift 3 Data */}
                  <td className="px-1.5 py-1.5 border-r border-stone-300 text-center tabular-nums text-purple-700 font-black">
                    {aiconerShiftData.III.assigned ? `${Math.round(aiconerShiftData.III.utility)}%` : '-'}
                  </td>
                  <td className={cn(
                    "px-2 py-1.5 border-r border-stone-300 uppercase truncate max-w-[120px]",
                    aiconerShiftData.III.assigned ? "text-stone-900 font-black" : "text-stone-300 italic"
                  )}>
                    {aiconerShiftData.III.name || '-'}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-xs md:text-sm font-black text-purple-900">
                    {aiconerShiftData.III.assigned && aiconerShiftData.III.incentive > 0 ? (
                      `₹${aiconerShiftData.III.incentive.toLocaleString()}`
                    ) : (
                      <span className="text-stone-300 font-normal italic text-xs">0</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

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

      {/* Footer metadata */}
      <div className="flex justify-between items-center px-4 pt-4 text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] no-print">
        <span>SpinMonitor AI Industrial Suite • Machine-wise Statement</span>
        <span>Sider Assigned Date: {report.date}</span>
      </div>
    </div>
  );
};
