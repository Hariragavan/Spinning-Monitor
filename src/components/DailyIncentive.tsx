import React, { useMemo, useState } from 'react';
import { DailyReport, Sider, IncentiveRule, ProductionEntry, Shift } from '../types';
import { Coins, User, Zap, Target, ArrowRight, ShieldCheck, Award, Edit3, Save, X, Plus, Calendar, Trash2, Printer, Download, FileSpreadsheet } from 'lucide-react';
import { cn, calculateIncentive, calculateSiderSlotIncentive, resolveWorker, getActiveRule, getGaiterIncentive, parseUniversalDateParts, parseUniversalDate } from '../lib/utils';
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

export const DailyIncentive: React.FC<DailyIncentiveProps> = ({ report, workers, rules, onUpdateEntry, onSelectDate, isTvMode = false, onChangeReportDate, shed }) => {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editData, setEditData] = useState<Partial<ProductionEntry>>({});
  const [isAddingMode, setIsAddingMode] = useState(false);
  const [newEntry, setNewEntry] = useState<Partial<ProductionEntry>>({
    frameNo: '',
    shift: 'I',
    gpsActual: 0,
    incentiveAmount: 0,
    siderName: '',
    siderId: '',
    count: '40s'
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

  const incentiveData = useMemo(() => {
    const flatResults: any[] = [];

    report.entries.forEach((entry, entryIdx) => {
      // Determine which workers are assigned
      const assignedIds = new Set<string>();
      if (entry.siderId) assignedIds.add(entry.siderId);
      if (entry.siderIds) {
        entry.siderIds.forEach(id => {
          if (id) assignedIds.add(id);
        });
      }

      const activeIds = Array.from(assignedIds);
      
      if (activeIds.length === 0) {
        flatResults.push({
          ...entry,
          entryIndex: entryIdx,
          worker: null,
          incentive: 0
        });
      } else {
        const numSlots = entry.siderIds?.length || (entry.siderId ? 1 : 2);
        const workerPayoutMap = new Map<string, number>();
        for (let sIdx = 0; sIdx < numSlots; sIdx++) {
          const wId = entry.siderIds?.[sIdx] || (sIdx === 0 ? entry.siderId : '');
          if (!wId) continue;
          const payout = calculateSiderSlotIncentive(entry, sIdx, report, rules, workers, shed);
          workerPayoutMap.set(wId, (workerPayoutMap.get(wId) || 0) + payout);
        }

        activeIds.forEach(id => {
          const worker = workers.find(w => w.id === id || w.tNo === id || w.name === id);
          const payout = workerPayoutMap.get(id) || 0;
          flatResults.push({
            ...entry,
            entryIndex: entryIdx,
            worker,
            incentive: payout
          });
        });
      }
    });

    return flatResults;
  }, [report, workers, rules, shed]);

  const totalIncentive = useMemo(() => {
    const workerDailyPayouts = new Map<string, number>();

    // Sider operator entries
    incentiveData.forEach(item => {
      const key = item.worker?.tNo || item.worker?.id || item.siderId || 'UNASSIGNED';
      if (key === 'UNASSIGNED') return;
      workerDailyPayouts.set(key, (workerDailyPayouts.get(key) || 0) + item.incentive);
    });

    // Sider gaiter entries
    gaiterData.forEach(item => {
      const key = item.tNo || item.id || 'UNASSIGNED';
      if (key === 'UNASSIGNED') return;
      workerDailyPayouts.set(key, (workerDailyPayouts.get(key) || 0) + item.incentive);
    });

    // Sum up capped worker payouts (capped at 120 each)
    let companyTotal = 0;
    workerDailyPayouts.forEach((amount) => {
      companyTotal += Math.min(120, amount);
    });

    // Also add unassigned machine incentives (if any)
    const unassignedOperatorsTotal = incentiveData
      .filter(item => !item.worker)
      .reduce((acc, curr) => acc + curr.incentive, 0);

    return companyTotal + unassignedOperatorsTotal;
  }, [incentiveData, gaiterData]);

  const startEdit = (idx: number, entry: ProductionEntry) => {
    setEditingIdx(idx);
    setEditData({ ...entry });
  };

  const handleSave = () => {
    if (editData) {
      onUpdateEntry(editData);
      setEditingIdx(null);
    }
  };

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
      count: '40s'
    });
  };

  const exportToExcel = () => {
    const rows: any[] = incentiveData.map((d, i) => ({
      'S.No': i + 1,
      'T.No': d.worker?.tNo || d.siderId || '—',
      'Operator Name': d.worker?.name || d.siderName || 'UNASSIGNED',
      'Machine': d.frameNo,
      'Shift': d.shift,
      'Count': d.count,
      'GPSS': d.gpsActual,
      'Incentive (INR)': d.incentive
    }));

    gaiterData.forEach((g, i) => {
      rows.push({
        'S.No': incentiveData.length + i + 1,
        'T.No': g.tNo || g.id,
        'Operator Name': `${g.name} (GAITER)`,
        'Machine': 'ALL / SHIFT',
        'Shift': g.shift,
        'Count': 'MIN GPS',
        'GPSS': g.minGpsInShift,
        'Incentive (INR)': g.incentive
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
      { wch: 12 },
      { wch: 8 },
      { wch: 12 },
      { wch: 10 },
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
    
    incentiveData.forEach((d, i) => {
      csv += `${i + 1},"${d.worker?.tNo || d.siderId || ''}","${d.worker?.name || d.siderName || 'UNASSIGNED'}","${d.frameNo}","${d.shift}","${d.count}",${d.gpsActual},${d.incentive}\n`;
    });

    gaiterData.forEach((g, i) => {
      csv += `${incentiveData.length + i + 1},"${g.tNo || g.id}","${g.name} (GAITER)","ALL","${g.shift}","MIN GPS",${g.minGpsInShift},${g.incentive}\n`;
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
                <th className={cn("border-r-2 border-stone-900 text-left", isTvMode ? "px-4 py-3 w-[120px]" : "px-3 py-1.5 w-[100px]")}>MC No</th>
                <th className={cn("border-r-2 border-stone-900 text-center", isTvMode ? "px-3 py-3 w-[60px]" : "px-2 py-1.5 w-[50px]")}>Sh</th>
                <th className={cn("border-r-2 border-stone-900 text-center", isTvMode ? "px-4 py-3 w-[110px]" : "px-3 py-1.5 w-[90px]")}>Count</th>
                <th className={cn("border-r-2 border-stone-900 text-center", isTvMode ? "px-4 py-3 w-[110px]" : "px-3 py-1.5 w-[90px]")}>GPSS</th>
                <th className={cn("border-r-2 border-stone-900 text-right", isTvMode ? "px-4 py-3 w-[160px]" : "px-3 py-1.5 w-[130px]")}>Incentive</th>
                {!isTvMode && <th className="px-2 py-1.5 font-black text-center bg-stone-200 w-[50px] no-print"></th>}
              </tr>
            </thead>
            <tbody>
              {incentiveData.length > 0 || gaiterData.length > 0 ? (
                <>
                  {incentiveData.map((data, idx) => (
                    <tr key={`entry-${idx}`} className={cn("border-b border-stone-200 group hover:bg-stone-50 transition-colors", isTvMode ? "text-base md:text-lg" : "text-xs md:text-sm")}>
                      <td className={cn("border-r-2 border-stone-900 font-bold text-stone-900 tabular-nums whitespace-nowrap", isTvMode ? "px-4 py-3 text-lg md:text-xl font-black" : "px-3 py-1.5")}>
                        {editingIdx === idx ? (
                           <input 
                            className="w-full bg-yellow-50 outline-none p-1 font-bold text-xs"
                            value={editData.siderId || ''}
                            onChange={e => setEditData({...editData, siderId: e.target.value})}
                           />
                        ) : (data.worker?.tNo || data.siderId)}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 font-bold text-stone-900 uppercase whitespace-nowrap", isTvMode ? "px-4 py-3 text-base md:text-xl font-black" : "px-3 py-1.5")}>
                        {editingIdx === idx ? (
                           <input 
                            className="w-full bg-yellow-50 outline-none p-1 font-bold text-xs"
                            value={editData.siderName || ''}
                            onChange={e => setEditData({...editData, siderName: e.target.value})}
                           />
                        ) : (data.worker?.name || data.siderName)}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-stone-900 font-bold text-center whitespace-nowrap", isTvMode ? "px-4 py-3 text-base md:text-lg font-black" : "px-3 py-1.5")}>
                        {data.frameNo}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-bold text-stone-900", isTvMode ? "px-3 py-3 text-base md:text-lg font-black" : "px-2 py-1.5")}>
                        {data.shift === 'II' ? '2' : data.shift === 'III' ? '3' : '1'}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center text-stone-700 font-bold whitespace-nowrap", isTvMode ? "px-4 py-3 text-base md:text-lg" : "px-3 py-1.5")}>
                        {data.count}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-bold text-stone-900 tabular-nums", isTvMode ? "px-4 py-3 text-lg md:text-xl font-black" : "px-3 py-1.5")}>
                        {editingIdx === idx ? (
                          <input 
                            type="number"
                            className="w-full bg-yellow-50 outline-none p-1 font-bold text-center text-xs"
                            value={editData.gpsActual || 0}
                            onChange={e => setEditData({...editData, gpsActual: Number(e.target.value)})}
                          />
                        ) : (Math.round(data.gpsActual) || '')}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-right font-black text-stone-900 tabular-nums", isTvMode ? "px-4 py-3 text-xl md:text-2xl text-emerald-800" : "px-3 py-1.5 text-sm md:text-base")}>
                        {editingIdx === idx ? (
                           <input 
                            type="number"
                            className="w-full bg-yellow-50 outline-none p-1 font-black text-right text-xs"
                            value={editData.incentiveAmount || 0}
                            onChange={e => setEditData({...editData, incentiveAmount: Number(e.target.value)})}
                           />
                        ) : (data.incentive > 0 ? `₹${data.incentive.toLocaleString()}` : (
                           <span className="text-stone-300 font-medium italic">0</span>
                        ))}
                      </td>
                      {!isTvMode && (
                        <td className="px-2 py-1.5 text-center bg-stone-50/50 no-print">
                          {editingIdx === idx ? (
                            <div className="flex items-center justify-center gap-1.5">
                               <button onClick={handleSave} className="text-emerald-600 hover:scale-110 transition-transform"><Save size={16} /></button>
                               <button onClick={() => setEditingIdx(null)} className="text-stone-400 hover:scale-110 transition-transform"><X size={16} /></button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => startEdit(idx, data)}
                              className="text-stone-400 hover:text-emerald-600 transition-colors p-1"
                            >
                              <Edit3 size={14} />
                            </button>
                          )}
                        </td>
                      )}
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
                      <td colSpan={2} className={cn("border-r-2 border-stone-900 text-amber-700 font-black text-center uppercase tracking-wider bg-amber-50/50", isTvMode ? "px-4 py-3 text-sm md:text-base" : "px-3 py-1.5 text-xs")}>
                        Shift Support ({data.shift === 'II' ? '2' : data.shift === 'III' ? '3' : '1'})
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center text-stone-500 font-bold", isTvMode ? "px-4 py-3 text-sm md:text-base" : "px-3 py-1.5 text-xs")}>
                        Min Shift GPS
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-black text-amber-700 tabular-nums", isTvMode ? "px-4 py-3 text-lg md:text-xl" : "px-3 py-1.5")}>
                        {Math.round(data.minGpsInShift)}
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-right font-black text-stone-900 tabular-nums", isTvMode ? "px-4 py-3 text-xl md:text-2xl text-emerald-800" : "px-3 py-1.5 text-sm md:text-base")}>
                        {data.incentive > 0 ? `₹${data.incentive.toLocaleString()}` : <span className="text-stone-300 font-medium italic">0</span>}
                      </td>
                      {!isTvMode && (
                        <td className="px-2 py-1.5 text-center bg-amber-50/50 no-print">
                          <Zap size={14} className="mx-auto text-amber-500" />
                        </td>
                      )}
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
                      <td
                        colSpan={2}
                        className={cn("border-r-2 border-stone-900 text-purple-700 font-black text-center uppercase tracking-wider bg-purple-50/50", isTvMode ? "px-4 py-3 text-sm md:text-base" : "px-3 py-1.5 text-xs")}
                      >
                        AI Cone Support (
                        {data.shift === "II"
                          ? "2"
                          : data.shift === "III"
                            ? "3"
                            : "1"}
                        )
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center text-stone-500 font-bold", isTvMode ? "px-4 py-3 text-sm md:text-base" : "px-3 py-1.5 text-xs leading-none")}>
                        Avg Shift Util
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-center font-black text-purple-700 tabular-nums", isTvMode ? "px-4 py-3 text-lg md:text-xl" : "px-3 py-1.5")}>
                        {Math.round(data.avgUtilityInShift)}%
                      </td>
                      <td className={cn("border-r-2 border-stone-900 text-right font-black text-stone-950 tabular-nums", isTvMode ? "px-4 py-3 text-xl md:text-2xl text-purple-900" : "px-3 py-1.5 text-sm md:text-base")}>
                        {data.incentive > 0 ? (
                          `₹${data.incentive.toLocaleString()}`
                        ) : (
                          <span className="text-stone-300 font-medium italic">
                            0
                          </span>
                        )}
                      </td>
                      {!isTvMode && (
                        <td className="px-2 py-1.5 text-center bg-purple-50/50 no-print">
                          <Zap size={14} className="mx-auto text-purple-500" />
                        </td>
                      )}
                    </tr>
                  ))}

                  <tr className="bg-stone-50 border-t-4 border-stone-900 font-black">
                    <td colSpan={6} className={cn("text-center text-rose-600 border-r-2 border-stone-900 uppercase tracking-wider", isTvMode ? "px-6 py-4 text-lg md:text-2xl" : "px-4 py-2.5 text-xs md:text-sm")}>
                      Total Incentive Amount For the Day
                    </td>
                    <td colSpan={isTvMode ? 1 : 2} className={cn("text-right text-rose-600 tabular-nums font-mono print:col-span-1", isTvMode ? "px-6 py-4 text-2xl md:text-3xl font-black" : "px-4 py-2.5 text-sm md:text-lg")}>
                      ₹{totalIncentive.toLocaleString()}
                    </td>
                  </tr>
                </>
              ) : (
                <tr>
                  <td colSpan={8} className="px-8 py-24 text-center">
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
