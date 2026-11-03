import React, { useMemo, useState } from 'react';
import { DailyReport, Sider, IncentiveRule, ProductionEntry, Shift } from '../types';
import { Coins, User, Zap, Target, ArrowRight, ShieldCheck, Award, Save, X, Plus, Calendar, Printer, Download, FileSpreadsheet } from 'lucide-react';
import { cn, calculateSiderSlotIncentive, resolveWorker, getActiveRule, getGaiterIncentive, parseUniversalDateParts, parseUniversalDate, normalizeShed } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface DailyIncentiveProps {
  report: DailyReport;
  workers: Sider[];
  rules: IncentiveRule[];
  onUpdateEntry: (entry: Partial<ProductionEntry>) => void;
  onSelectDate: (date: string) => void;
  isTvMode?: boolean;
  onChangeReportDate?: (oldDate: string, newDate: string) => void;
  shed?: string;
}

export const DailyIncentive: React.FC<DailyIncentiveProps> = ({ 
  report, 
  workers, 
  rules, 
  onUpdateEntry, 
  onSelectDate, 
  isTvMode = false, 
  onChangeReportDate, 
  shed 
}) => {
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newEntry, setNewEntry] = useState<Partial<ProductionEntry>>({
    frameNo: '',
    shift: 'I',
    gpsActual: 0,
    incentiveAmount: 0,
    siderName: '',
    siderId: '',
    count: ''
  });

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

  const gaiterData = useMemo(() => {
    const shifts: Shift[] = ['I', 'II', 'III'];
    const results: any[] = [];
    
    shifts.forEach(shift => {
      const shiftEntries = report.entries.filter(e => e.shift === shift);
      if (shiftEntries.length === 0) return;
      
      const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);
      const shiftGaiterIds = report.gaiters?.[shift] || [];
      
      shiftGaiterIds.forEach(gid => {
        const worker = workers.find(w => w.id === gid);
        if (!worker) return;

        const incentive = getGaiterIncentive(report, shift, rules, workers);

        results.push({
          id: gid,
          name: worker.name,
          tNo: worker.tNo,
          shift,
          role: 'GAITER',
          minGpsInShift: minGpsEntry.gpsActual,
          incentive
        });
      });
    });
    
    return results;
  }, [report, workers, rules]);

  const aiConeData = useMemo(() => {
    const shifts: Shift[] = ["I", "II", "III"];
    const results: any[] = [];

    shifts.forEach((shift) => {
      const shiftEntries = report.entries.filter((e) => e.shift === shift);

      const utilEntries = shiftEntries.filter((e) => typeof e.utility === "number" && !isNaN(e.utility) && e.utility > 0);
      const avgUtility =
        utilEntries.length > 0
          ? utilEntries.reduce((acc, curr) => acc + curr.utility, 0) /
            utilEntries.length
          : 0;

      const shiftAiConeIds = report.aiCones?.[shift] || [];

      shiftAiConeIds.forEach((id) => {
        if (!id) return;
        const targetIdLower = String(id).toLowerCase().trim();
        const worker = workers.find((w) => 
          w.id.toLowerCase().trim() === targetIdLower || 
          w.tNo.toLowerCase().trim() === targetIdLower ||
          w.name.toLowerCase().trim() === targetIdLower
        );
        if (!worker) return;

        // Find the best matching AI Linkconer incentive rule for this shift's entries on this date
        let matchedRule: IncentiveRule | null = null;
        for (const e of shiftEntries) {
          const rule = getActiveRule(e.count, 'AI Linkconer', rules, report.date);
          if (rule) {
            matchedRule = rule;
            break;
          }
        }

        // Fallback to any general AI Linkconer rule active for this date
        if (!matchedRule) {
          const aiRules = rules.filter((r) => r.department === "AI Linkconer");
          const eligible = aiRules.filter((r) => {
            if (!r.effectiveDate) return true;
            const timeRule = parseUniversalDate(r.effectiveDate).getTime();
            const timeReport = parseUniversalDate(report.date).getTime();
            return timeRule <= timeReport;
          });
          eligible.sort((a, b) => {
            if (!a.effectiveDate && !b.effectiveDate) return 0;
            if (!a.effectiveDate) return 1;
            if (!b.effectiveDate) return -1;
            const timeA = parseUniversalDate(a.effectiveDate).getTime();
            const timeB = parseUniversalDate(b.effectiveDate).getTime();
            return timeB - timeA;
          });
          matchedRule = eligible[0] || aiRules[0];
        }

        let incentive = 0;
        if (matchedRule) {
          const sortedPayouts = [...matchedRule.payouts].sort(
            (a, b) => b.gpsThreshold - a.gpsThreshold,
          );
          const bestPayout = sortedPayouts.find(
            (p) => Math.round(avgUtility) >= p.gpsThreshold,
          );
          incentive = bestPayout ? bestPayout.amount : 0;
        }

        results.push({
          id,
          name: worker.name,
          tNo: worker.tNo,
          shift,
          role: "AI_CONE",
          avgUtilityInShift: avgUtility,
          incentive,
        });
      });
    });

    return results;
  }, [report, workers, rules]);

  // Grouped operator incentive table:
  // Each operator appears ONLY ONCE per shift.
  // Worked machines formatted as e.g. "SP001, SP002 (LH)".
  // Unique counts and GPSS of worked machines, with total incentive.
  const groupedIncentiveData = useMemo(() => {
    const invalidMarkers = ['UNASSIGNED', '-', '--', 'NO SIDER', 'NONE', 'N/A', 'NULL', 'UNDEFINED', '0'];
    const shifts: Shift[] = ['I', 'II', 'III'];
    const groupedRows: {
      id: string;
      tNo: string;
      name: string;
      worker: Sider | null;
      mcNoDisplay: string;
      shift: Shift;
      countDisplay: string;
      gpssDisplay: string;
      incentive: number;
      isUnassigned: boolean;
    }[] = [];

    shifts.forEach(shift => {
      const activeNorm = normalizeShed(shed || report.shed);
      const shiftEntries = (report.entries || []).filter(e => 
        e.shift === shift && (!e.shed || normalizeShed(e.shed) === activeNorm)
      );
      if (shiftEntries.length === 0) return;

      const workerMap = new Map<string, {
        worker: Sider;
        tNo: string;
        name: string;
        shift: Shift;
        machineSlots: {
          entry: ProductionEntry;
          slotIdx: number;
          payout: number;
        }[];
      }>();

      shiftEntries.forEach(entry => {
        const numSlots = entry.siderIds?.length || (entry.siderId ? 1 : 2);
        let entryHasAssignedWorker = false;

        for (let sIdx = 0; sIdx < numSlots; sIdx++) {
          const rawId = (entry.siderIds && entry.siderIds.length > sIdx) 
            ? entry.siderIds[sIdx] 
            : (sIdx === 0 ? entry.siderId : '');
          if (!rawId) continue;
          const clean = String(rawId).trim();
          if (!clean || invalidMarkers.includes(clean.toUpperCase())) continue;

          const worker = resolveWorker(clean, entry.siderName, workers);
          // Strictly verify that the worker belongs to the current shed
          const isBelongingToCurrentShed = workers.length === 0 || workers.some(w => 
            (w.id && (w.id.toUpperCase() === clean.toUpperCase() || w.id === worker.id)) ||
            (w.tNo && (w.tNo.toUpperCase() === clean.toUpperCase() || w.tNo === worker.tNo)) ||
            (w.name && w.name.trim().toLowerCase() === worker.name.trim().toLowerCase())
          );
          if (!isBelongingToCurrentShed) {
            continue;
          }

          entryHasAssignedWorker = true;
          const workerKey = (worker.id || worker.tNo || worker.name || clean).toUpperCase();

          if (!workerMap.has(workerKey)) {
            workerMap.set(workerKey, {
              worker,
              tNo: worker.tNo || worker.id || clean,
              name: worker.name || clean,
              shift,
              machineSlots: []
            });
          }

          const payout = calculateSiderSlotIncentive(entry, sIdx, report, rules, workers, shed);
          workerMap.get(workerKey)!.machineSlots.push({
            entry,
            slotIdx: sIdx,
            payout
          });
        }

        // If this machine entry had NO worker assigned on either slot
        if (!entryHasAssignedWorker) {
          groupedRows.push({
            id: `unassigned-${entry.frameNo}-${shift}`,
            tNo: '—',
            name: 'UNASSIGNED',
            worker: null,
            mcNoDisplay: entry.frameNo,
            shift,
            countDisplay: entry.count || '—',
            gpssDisplay: entry.gpsActual !== undefined && entry.gpsActual !== null ? Math.round(entry.gpsActual).toString() : '—',
            incentive: 0,
            isUnassigned: true
          });
        }
      });

      // Aggregate each worker's machine slots for this shift
      workerMap.forEach((wData, workerKey) => {
        const frameMap = new Map<string, {
          frameNo: string;
          entry: ProductionEntry;
          slots: number[];
          payout: number;
        }>();

        wData.machineSlots.forEach(ms => {
          const fNo = ms.entry.frameNo;
          if (!frameMap.has(fNo)) {
            frameMap.set(fNo, {
              frameNo: fNo,
              entry: ms.entry,
              slots: [],
              payout: 0
            });
          }
          frameMap.get(fNo)!.slots.push(ms.slotIdx);
          frameMap.get(fNo)!.payout += ms.payout;
        });

        const mcLabels: string[] = [];
        const counts: string[] = [];
        const gpsList: number[] = [];
        let totalWorkerShiftIncentive = 0;

        frameMap.forEach((fData, fNo) => {
          const entry = fData.entry;
          const has0 = fData.slots.includes(0);
          const has1 = fData.slots.includes(1);

          let sideLabel = fNo;
          if (has0 && has1) {
            sideLabel = fNo; // Both sides worked
          } else if (has0) {
            sideLabel = `${fNo} (LH)`;
          } else if (has1) {
            sideLabel = `${fNo} (RH)`;
          } else if (fData.slots.length > 0) {
            sideLabel = `${fNo} (S${fData.slots[0] + 1})`;
          }
          mcLabels.push(sideLabel);

          if (entry.count) {
            counts.push(entry.count);
          }
          if (entry.gpsActual !== undefined && entry.gpsActual !== null) {
            gpsList.push(Math.round(entry.gpsActual));
          }

          totalWorkerShiftIncentive += fData.payout;
        });

        let countDisplay = '—';
        if (counts.length > 0) {
          const allSame = counts.every(c => c === counts[0]);
          countDisplay = allSame ? counts[0] : counts.join(', ');
        }

        const gpssDisplay = gpsList.length > 0 ? gpsList.join(', ') : '—';

        groupedRows.push({
          id: `${workerKey}-${shift}`,
          tNo: wData.tNo,
          name: wData.name,
          worker: wData.worker,
          mcNoDisplay: mcLabels.join(', '),
          shift,
          countDisplay,
          gpssDisplay,
          incentive: totalWorkerShiftIncentive,
          isUnassigned: false
        });
      });
    });

    // Sort: Shift I -> II -> III, assigned workers by T.No, unassigned at the end of each shift
    const shiftOrder: Record<string, number> = { 'I': 1, 'II': 2, 'III': 3 };
    groupedRows.sort((a, b) => {
      const sA = shiftOrder[a.shift] || 99;
      const sB = shiftOrder[b.shift] || 99;
      if (sA !== sB) return sA - sB;
      if (a.isUnassigned && !b.isUnassigned) return 1;
      if (!a.isUnassigned && b.isUnassigned) return -1;
      return (a.tNo || '').localeCompare(b.tNo || '', undefined, { numeric: true });
    });

    return groupedRows;
  }, [report, workers, rules, shed]);

  const totalIncentive = useMemo(() => {
    const opTotal = groupedIncentiveData.reduce((acc, row) => acc + (row.incentive || 0), 0);
    const gaiterTotal = gaiterData.reduce((acc, g) => acc + (g.incentive || 0), 0);
    const aiTotal = aiConeData.reduce((acc, a) => acc + (a.incentive || 0), 0);
    return opTotal + gaiterTotal + aiTotal;
  }, [groupedIncentiveData, gaiterData, aiConeData]);

  const handleAdd = () => {
    if (!newEntry.frameNo || !newEntry.siderId) {
      alert('T.No and MC No are required');
      return;
    }
    onUpdateEntry(newEntry);
    setIsAddingMode(false);
    setNewEntry({
      frameNo: '',
      shift: 'I',
      gpsActual: 0,
      incentiveAmount: 0,
      siderName: '',
      siderId: '',
      count: ''
    });
  };

  const exportToExcel = () => {
    const rows: any[] = groupedIncentiveData.map((d, i) => ({
      'S.No': i + 1,
      'T.No': d.tNo || '—',
      'Operator Name': d.name,
      'Machine': d.mcNoDisplay,
      'Shift': d.shift === 'II' ? '2' : d.shift === 'III' ? '3' : '1',
      'Count': d.countDisplay,
      'GPSS': d.gpssDisplay,
      'Incentive (INR)': d.incentive
    }));

    gaiterData.forEach((g) => {
      rows.push({
        'S.No': rows.length + 1,
        'T.No': g.tNo || g.id,
        'Operator Name': `${g.name} (GAITER)`,
        'Machine': 'ALL / SHIFT',
        'Shift': g.shift === 'II' ? '2' : g.shift === 'III' ? '3' : '1',
        'Count': 'MIN GPS',
        'GPSS': Math.round(g.minGpsInShift),
        'Incentive (INR)': g.incentive
      });
    });

    aiConeData.forEach((a) => {
      rows.push({
        'S.No': rows.length + 1,
        'T.No': a.tNo || a.id,
        'Operator Name': `${a.name} (AI CONE)`,
        'Machine': 'AI CONE SUPPORT',
        'Shift': a.shift === 'II' ? '2' : a.shift === 'III' ? '3' : '1',
        'Count': 'AVG UTIL',
        'GPSS': `${Math.round(a.avgUtilityInShift)}%`,
        'Incentive (INR)': a.incentive
      });
    });

    rows.push({
      'S.No': 'TOTAL',
      'T.No': '',
      'Operator Name': '',
      'Machine': '',
      'Shift': '',
      'Count': '',
      'GPSS': '',
      'Incentive (INR)': totalIncentive
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 28 },
      { wch: 24 },
      { wch: 8 },
      { wch: 16 },
      { wch: 14 },
      { wch: 16 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily Incentive');
    const safeDate = (report.date || 'live').replace(/[/\\?%*:|"<>]/g, '-');
    XLSX.writeFile(wb, `Daily_Incentive_Statement_${safeDate}.xlsx`);
  };

  const exportToCSV = () => {
    const safeDate = (report.date || 'live').replace(/[/\\?%*:|"<>]/g, '-');
    let csv = `KTTM SPINNING MILLS - DAILY INCENTIVE STATEMENT (${report.date})\n\n`;
    csv += `S.No,T.No,Operator Name,Machine,Shift,Count,GPSS,Incentive (INR)\n`;
    
    let sNo = 1;
    groupedIncentiveData.forEach((d) => {
      const tNo = d.tNo || '—';
      const name = d.name || 'UNASSIGNED';
      const shiftStr = d.shift === 'II' ? '2' : d.shift === 'III' ? '3' : '1';
      csv += `${sNo++},"${tNo}","${name}","${d.mcNoDisplay}","${shiftStr}","${d.countDisplay}","${d.gpssDisplay}",${d.incentive}\n`;
    });

    gaiterData.forEach((g) => {
      const shiftStr = g.shift === 'II' ? '2' : g.shift === 'III' ? '3' : '1';
      csv += `${sNo++},"${g.tNo || g.id}","${g.name} (GAITER)","ALL / SHIFT","${shiftStr}","MIN GPS",${Math.round(g.minGpsInShift)},${g.incentive}\n`;
    });

    aiConeData.forEach((a) => {
      const shiftStr = a.shift === 'II' ? '2' : a.shift === 'III' ? '3' : '1';
      csv += `${sNo++},"${a.tNo || a.id}","${a.name} (AI CONE)","AI CONE SUPPORT","${shiftStr}","AVG UTIL","${Math.round(a.avgUtilityInShift)}%",${a.incentive}\n`;
    });

    csv += `TOTAL,,,,,,,${totalIncentive}\n`;

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Daily_Incentive_Statement_${safeDate}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 w-full px-2 mx-auto pb-12">
      {/* Printable Sheet Header (Only visible on paper / print preview) */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">KTTM SPINNING MILLS - UNIT 01</h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">Daily Sider Incentive Statement</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Date: <strong>{report.date}</strong></span>
          <span>Shift Summary: <strong>Shifts I, II, III</strong></span>
          <span>Total Daily Payout: <strong>₹{totalIncentive.toLocaleString()}</strong></span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-2 border-b-2 border-stone-200 pb-2 gap-3 no-print">
        <div className="text-left">
          <h2 className="text-xl md:text-2xl font-black text-stone-900 border-b-4 border-stone-900 inline-block px-2 pb-1 uppercase tracking-tight">Daily Incentive Statement</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button 
              onClick={() => setIsAddingMode(true)}
              className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider text-[11px] hover:bg-emerald-700 transition-all shadow-sm active:scale-95 cursor-pointer"
            >
              <Plus size={13} /> Add Entry
            </button>
            {!isTvMode && (
              <>
                <button 
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 bg-stone-900 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-wider text-[11px] hover:bg-black transition-all active:scale-95 cursor-pointer shadow-xs"
                >
                  <Printer size={13} /> Print
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
              </>
            )}
          </div>
        </div>

        <div className="flex flex-col items-start lg:items-end gap-1 text-right">
          <div className="flex border-2 border-stone-900 divide-x-2 divide-stone-900 overflow-hidden rounded-lg font-bold shadow-xs">
            <div className="bg-yellow-400 px-3 py-1.5 text-center uppercase tracking-tight text-xs font-black flex items-center justify-center">Sider Assigned Date</div>
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
          <div className="flex flex-col items-start lg:items-end gap-0.5 no-print">
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">Switch date above to edit reports</p>
            {onChangeReportDate && (
              <button 
                onClick={() => {
                  const newDateStr = prompt("Enter new date for this report (DD/MM/YYYY):", report.date);
                  if (newDateStr) {
                    onChangeReportDate(report.date, newDateStr);
                  }
                }}
                className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 uppercase tracking-widest underline cursor-pointer"
              >
                Change Date of This Report
              </button>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isAddingMode && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-8"
          >
            <div className="bg-emerald-50 border-4 border-emerald-600 p-8 rounded-3xl grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 items-end">
              <div className="col-span-1">
                <label className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">T.No (Ticket)</label>
                <input 
                  type="text" 
                  className="w-full bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-sm font-bold uppercase"
                  placeholder="EX: 15734"
                  value={newEntry.siderId}
                  onChange={e => {
                    const val = e.target.value.trim();
                    const matchedWorker = workers.find(w => w.tNo === val);
                    setNewEntry({
                      ...newEntry, 
                      siderId: val,
                      siderName: matchedWorker ? matchedWorker.name : newEntry.siderName
                    });
                  }}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">Worker Name</label>
                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-sm font-bold uppercase"
                    placeholder="AUTO-POPULATED"
                    value={newEntry.siderName}
                    onChange={e => setNewEntry({...newEntry, siderName: e.target.value})}
                  />
                  {workers.some(w => w.tNo === newEntry.siderId) && (
                    <div className="absolute -top-6 right-0 text-[8px] font-black text-emerald-600 bg-white px-2 py-0.5 rounded-full border border-emerald-200 animate-bounce">
                      MATCH FOUND
                    </div>
                  )}
                </div>
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">MC No</label>
                <input 
                  type="text" 
                  className="w-full bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-sm font-bold uppercase"
                  placeholder="EX: RF01"
                  value={newEntry.frameNo}
                  onChange={e => setNewEntry({...newEntry, frameNo: e.target.value})}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">Shift</label>
                <select 
                  className="w-full bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-sm font-bold"
                  value={newEntry.shift}
                  onChange={e => setNewEntry({...newEntry, shift: e.target.value as Shift})}
                >
                  <option value="I">1</option>
                  <option value="II">2</option>
                  <option value="III">3</option>
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">Count</label>
                <input 
                  type="text" 
                  className="w-full bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-sm font-bold"
                  value={newEntry.count}
                  onChange={e => setNewEntry({...newEntry, count: e.target.value})}
                />
              </div>
              <div className="col-span-1">
                <label className="block text-[10px] font-black text-emerald-700 uppercase tracking-widest mb-1">GPSS</label>
                <input 
                  type="number" 
                  className="w-full bg-white border-2 border-emerald-200 rounded-xl px-4 py-2 text-sm font-bold"
                  value={newEntry.gpsActual}
                  onChange={e => setNewEntry({...newEntry, gpsActual: Number(e.target.value)})}
                />
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={handleAdd}
                  className="flex-1 bg-emerald-600 text-white p-2 rounded-xl flex items-center justify-center hover:bg-emerald-700"
                >
                  <Save size={20} />
                </button>
                <button 
                  onClick={() => setIsAddingMode(false)}
                  className="bg-stone-200 text-stone-600 p-2 rounded-xl flex items-center justify-center hover:bg-stone-300"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="bg-white overflow-hidden shadow-lg border border-stone-200 rounded-xl">
        <div className="overflow-x-auto">
          <table className="w-full border-2 border-stone-900 border-collapse">
            <thead>
              <tr className={cn("border-b-2 border-stone-900 font-black uppercase tracking-wider bg-stone-100", isTvMode ? "text-base md:text-lg" : "text-xs")}>
                <th className={cn("border-r-2 border-stone-900 text-left", isTvMode ? "px-4 py-3 w-[110px]" : "px-3 py-1.5 w-[90px]")}>T.No</th>
                <th className={cn("border-r-2 border-stone-900 text-left", isTvMode ? "px-4 py-3" : "px-3 py-1.5")}>Name</th>
                <th className={cn("border-r-2 border-stone-900 text-center", isTvMode ? "px-4 py-3 w-[200px]" : "px-3 py-1.5 w-[160px]")}>MC.No</th>
                <th className={cn("border-r-2 border-stone-900 text-center", isTvMode ? "px-3 py-3 w-[70px]" : "px-2 py-1.5 w-[60px]")}>Shift</th>
                <th className={cn("border-r-2 border-stone-900 text-center", isTvMode ? "px-4 py-3 w-[130px]" : "px-3 py-1.5 w-[110px]")}>Count</th>
                <th className={cn("border-r-2 border-stone-900 text-center", isTvMode ? "px-4 py-3 w-[120px]" : "px-3 py-1.5 w-[100px]")}>GPSS</th>
                <th className={cn("text-right", isTvMode ? "px-4 py-3 w-[160px]" : "px-3 py-1.5 w-[130px]")}>Incentive</th>
              </tr>
            </thead>
            <tbody>
              {groupedIncentiveData.length > 0 || gaiterData.length > 0 || aiConeData.length > 0 ? (
                <>
                  {groupedIncentiveData.map((data) => (
                    <tr key={data.id} className={cn("border-b border-stone-200 group hover:bg-stone-50 transition-colors", isTvMode ? "text-base md:text-lg" : "text-xs md:text-sm")}>
                      <td className={cn("border-r-2 border-stone-900 font-bold text-stone-900 tabular-nums whitespace-nowrap", isTvMode ? "px-4 py-3 text-lg md:text-xl font-black" : "px-3 py-1.5")}>
                        {data.tNo}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 font-bold text-stone-900 uppercase whitespace-nowrap", isTvMode ? "px-4 py-3 text-base md:text-xl font-black" : "px-3 py-1.5")}>
                        {data.isUnassigned ? (
                          <span className="text-stone-400 font-normal italic">UNASSIGNED</span>
                        ) : (
                          data.name
                        )}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-stone-900 font-bold text-center whitespace-nowrap", isTvMode ? "px-4 py-3 text-base md:text-lg font-black" : "px-3 py-1.5")}>
                        {data.mcNoDisplay}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-bold text-stone-900", isTvMode ? "px-3 py-3 text-base md:text-lg font-black" : "px-2 py-1.5")}>
                        {data.shift === 'II' ? '2' : data.shift === 'III' ? '3' : '1'}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center text-stone-700 font-bold whitespace-nowrap", isTvMode ? "px-4 py-3 text-base md:text-lg" : "px-3 py-1.5")}>
                        {data.countDisplay}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-bold text-stone-900 tabular-nums", isTvMode ? "px-4 py-3 text-lg md:text-xl font-black" : "px-3 py-1.5")}>
                        {data.gpssDisplay}
                      </td>
                      <td className={cn("text-right font-black text-stone-900 tabular-nums", isTvMode ? "px-4 py-3 text-xl md:text-2xl text-emerald-800" : "px-3 py-1.5 text-sm md:text-base")}>
                        {data.incentive > 0 ? `₹${data.incentive.toLocaleString()}` : (
                          <span className="text-stone-300 font-medium italic">0</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Render Gaiters */}
                  {gaiterData.map((data, gIdx) => (
                    <tr key={`gaiter-${data.id}-${data.shift}-${gIdx}`} className={cn("border-b border-stone-200 bg-amber-50/30 group hover:bg-amber-100/50 transition-colors", isTvMode ? "text-base md:text-lg" : "text-xs md:text-sm")}>
                      <td className={cn("border-r-2 border-stone-900 font-bold text-stone-900 tabular-nums whitespace-nowrap", isTvMode ? "px-4 py-3 text-lg md:text-xl font-black" : "px-3 py-1.5")}>
                        {data.tNo}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 font-bold text-stone-900 uppercase whitespace-nowrap italic", isTvMode ? "px-4 py-3 text-base md:text-xl font-black" : "px-3 py-1.5")}>
                        {data.name} <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded ml-1.5 not-italic font-black">GAITER</span>
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-amber-700 font-black text-center uppercase tracking-wider bg-amber-50/50", isTvMode ? "px-4 py-3 text-sm md:text-base" : "px-3 py-1.5 text-xs")}>
                        Shift Support
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-bold text-stone-900", isTvMode ? "px-3 py-3 text-base md:text-lg font-black" : "px-2 py-1.5")}>
                        {data.shift === 'II' ? '2' : data.shift === 'III' ? '3' : '1'}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center text-stone-500 font-bold", isTvMode ? "px-4 py-3 text-sm md:text-base" : "px-3 py-1.5 text-xs")}>
                        Min Shift GPS
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-black text-amber-700 tabular-nums", isTvMode ? "px-4 py-3 text-lg md:text-xl" : "px-3 py-1.5")}>
                        {Math.round(data.minGpsInShift)}
                      </td>
                      <td className={cn("text-right font-black text-stone-900 tabular-nums", isTvMode ? "px-4 py-3 text-xl md:text-2xl text-emerald-800" : "px-3 py-1.5 text-sm md:text-base")}>
                        {data.incentive > 0 ? `₹${data.incentive.toLocaleString()}` : <span className="text-stone-300 font-medium italic">0</span>}
                      </td>
                    </tr>
                  ))}

                  {/* Render AI Cone Allocations */}
                  {aiConeData.map((data, aIdx) => (
                    <tr
                      key={`ai-cone-${data.id}-${data.shift}-${aIdx}`}
                      className={cn("border-b border-stone-200 bg-purple-50/30 group hover:bg-purple-100/50 transition-colors", isTvMode ? "text-base md:text-lg" : "text-xs md:text-sm")}
                    >
                      <td className={cn("border-r-2 border-stone-900 font-bold text-stone-900 tabular-nums whitespace-nowrap", isTvMode ? "px-4 py-3 text-lg md:text-xl font-black" : "px-3 py-1.5")}>
                        {data.tNo}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 font-bold text-stone-900 uppercase whitespace-nowrap italic", isTvMode ? "px-4 py-3 text-base md:text-xl font-black" : "px-3 py-1.5")}>
                        {data.name}{" "}
                        <span className="text-[10px] bg-purple-200 text-purple-900 px-2 py-0.5 rounded ml-1.5 not-italic font-black">
                          AI CONE
                        </span>
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-purple-700 font-black text-center uppercase tracking-wider bg-purple-50/50", isTvMode ? "px-4 py-3 text-sm md:text-base" : "px-3 py-1.5 text-xs")}>
                        AI Cone Support
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-bold text-stone-900", isTvMode ? "px-3 py-3 text-base md:text-lg font-black" : "px-2 py-1.5")}>
                        {data.shift === "II" ? "2" : data.shift === "III" ? "3" : "1"}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center text-stone-500 font-bold", isTvMode ? "px-4 py-3 text-sm md:text-base" : "px-3 py-1.5 text-xs leading-none")}>
                        Avg Shift Util
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-black text-purple-700 tabular-nums", isTvMode ? "px-4 py-3 text-lg md:text-xl" : "px-3 py-1.5")}>
                        {Math.round(data.avgUtilityInShift)}%
                      </td>
                      <td className={cn("text-right font-black text-stone-950 tabular-nums", isTvMode ? "px-4 py-3 text-xl md:text-2xl text-purple-900" : "px-3 py-1.5 text-sm md:text-base")}>
                        {data.incentive > 0 ? (
                          `₹${data.incentive.toLocaleString()}`
                        ) : (
                          <span className="text-stone-300 font-medium italic">
                            0
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}

                  <tr className="bg-stone-50 border-t-4 border-stone-900 font-black">
                    <td colSpan={6} className={cn("text-center text-rose-600 border-r-2 border-stone-900 uppercase tracking-wider", isTvMode ? "px-6 py-4 text-lg md:text-2xl" : "px-4 py-2.5 text-xs md:text-sm")}>
                      Total Incentive Amount For the Day
                    </td>
                    <td className={cn("text-right text-rose-600 tabular-nums font-mono", isTvMode ? "px-6 py-4 text-2xl md:text-3xl font-black" : "px-4 py-2.5 text-sm md:text-lg font-black")}>
                      ₹{totalIncentive.toLocaleString()}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={7} className="px-8 py-24 text-center">
                    <div className="flex flex-col items-center justify-center opacity-20">
                      <Target size={48} className="mb-4" />
                      <p className="font-black tracking-widest uppercase text-sm">No Payout Data Found</p>
                      <button 
                        onClick={() => setIsAddingMode(true)}
                        className="mt-4 px-6 py-2 bg-stone-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"
                      >
                        Create Manual Entry
                      </button>
                    </div>
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
          Prepared By
        </div>
        <div className="print-signature-box">
          Shift Supervisor
        </div>
        <div className="print-signature-box">
          Mill Manager / Accounts
        </div>
      </div>
      
      <div className="flex justify-between items-center px-4 pt-4 text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] no-print">
        <span>SpinMonitor AI Industrial Suite • Management Entry Mode</span>
        <span>Sider Assigned Date: {report.date}</span>
      </div>
    </div>
  );
};
