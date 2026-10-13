import React, { useState, useMemo, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift, ProductionEntry, MachineEmData } from '../types';
import { calculateIncentive, getGaiterIncentive, parseUniversalDateParts, parseUniversalDate } from '../lib/utils';
import { Calendar, User, Search, Printer, Coins, Tv, Monitor, ChevronRight, Activity, Award, Download, FileSpreadsheet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { CalendarMonthPicker } from './CalendarPickers';

interface SiderMonthlyPerformanceProps {
  history: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  isTvMode?: boolean;
  month?: number;
  year?: number;
  machineEm?: MachineEmData;
  tvPageInterval?: number;
  emHighLimit?: number;
}

interface SiderPerformanceRow {
  date: string;
  shift: Shift;
  frameNo: string;
  count: string;
  gps: number;
  incentive: number;
  role: 'OPERATOR' | 'GAITER';
  em?: number;
}

export const SiderMonthlyPerformance: React.FC<SiderMonthlyPerformanceProps> = ({
  history,
  workers,
  rules,
  isTvMode: appIsTvMode = false,
  month,
  year,
  machineEm,
  tvPageInterval,
  emHighLimit = 4
}) => {
  // We can let the user trigger a local TV simulation inside the page or rely on the parent isTvMode
  const [localTvMode, setLocalTvMode] = useState<boolean>(false);
  const activeTv = appIsTvMode || localTvMode;

  // Selected Workers Month
  const today = new Date();
  const currentMonthNum = today.getMonth() + 1; // 1-12
  const currentYearNum = today.getFullYear();
  
  const [selectedMonth, setSelectedMonth] = useState<number>(month || currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(year || 2026); // Match default 2026 data context
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');

  useEffect(() => {
    if (month) {
      setSelectedMonth(month);
    }
  }, [month]);

  useEffect(() => {
    if (year) {
      setSelectedYear(year);
    }
  }, [year]);

  // Default date ranges based on selected month and year
  const { fromDate, toDate } = useMemo(() => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    return {
      fromDate: `${selectedYear}-${pad(selectedMonth)}-${pad(firstDay.getDate())}`,
      toDate: `${selectedYear}-${pad(selectedMonth)}-${pad(lastDay.getDate())}`
    };
  }, [selectedMonth, selectedYear]);

  // Months lists
  const monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  // Helper helper to fetch ledger for ANY worker in a date range
  const getWorkerMonthlyLedger = (workerId: string) => {
    const targetWorker = workers.find(w => w.id === workerId || w.tNo === workerId);
    if (!targetWorker) return { rows: [], total: 0 };

    const rows: SiderPerformanceRow[] = [];

    history.forEach(report => {
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;
      
      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;

      if (rDateStr < fromDate || rDateStr > toDate) return;

      // Machine assignments
      if (report.entries) {
        report.entries.forEach(entry => {
          const sIds = new Set<string>();
          if (entry.siderId) sIds.add(entry.siderId);
          if (entry.siderIds) {
            entry.siderIds.forEach(id => { if (id) sIds.add(id); });
          }

          const isTNoReal = (t: string) => {
            if (!t) return false;
            const clean = t.trim();
            if (clean === "" || clean.toLowerCase() === "n/a" || clean.toLowerCase() === "unknown") return false;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false;
            if (clean.startsWith('T-') || clean.startsWith('w-')) return false;
            return true;
          };

          const hasTNoConflict = Array.from(sIds).some(id => 
            isTNoReal(id) && isTNoReal(targetWorker.tNo) && id.trim().toUpperCase() !== targetWorker.tNo.trim().toUpperCase()
          );

          const hasDirectId = sIds.has(targetWorker.id) || sIds.has(targetWorker.tNo);
          const hasNameMatch = !hasTNoConflict && entry.siderName && entry.siderName.toLowerCase().trim() === targetWorker.name.toLowerCase().trim();
          const hasTNoMatch = !hasTNoConflict && entry.siderId && entry.siderId === targetWorker.tNo;

          if (hasDirectId || hasNameMatch || hasTNoMatch) {
            const incentive = calculateIncentive(entry, rules, report.date);
            const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;
            let emValue = machineEm?.[report.date]?.[entry.frameNo]?.[shiftNum];
            if (emValue === undefined) {
              emValue = entry.doffEmt || 0;
            }
            rows.push({
              date: report.date,
              shift: entry.shift,
              frameNo: entry.frameNo,
              count: entry.count,
              gps: entry.gpsActual,
              incentive: incentive,
              role: 'OPERATOR',
              em: emValue
            });
          }
        });
      }

      // Gaiter assignments
      const shifts: Shift[] = ['I', 'II', 'III'];
      shifts.forEach(shift => {
        const shiftEntries = report.entries?.filter(e => e.shift === shift) || [];
        if (shiftEntries.length === 0) return;

        const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);
        const shiftGaiters = report.gaiters?.[shift] || [];

        if (shiftGaiters.includes(targetWorker.id) || shiftGaiters.includes(targetWorker.tNo)) {
          const incentive = getGaiterIncentive(report, shift, rules, workers);
          rows.push({
            date: report.date,
            shift,
            frameNo: 'GAITER',
            count: minGpsEntry.count,
            gps: minGpsEntry.gpsActual,
            incentive,
            role: 'GAITER'
          });
        }
      });
    });

    // Sort by Date then Shift
    const sorted = rows.sort((a, b) => {
      const timeA = parseUniversalDate(a.date).getTime();
      const timeB = parseUniversalDate(b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;

      const shiftsVal = { 'I': 1, 'II': 2, 'III': 3 };
      if (a.shift !== b.shift) return shiftsVal[a.shift] - shiftsVal[b.shift];
      return a.frameNo.localeCompare(b.frameNo);
    });

    // Apply 120 daily cap on individual rows
    const dailyAccumulator = new Map<string, number>();
    const cappedSorted = sorted.map(row => {
      const allocated = dailyAccumulator.get(row.date) || 0;
      const remaining = Math.max(0, 120 - allocated);
      const capped = Math.min(row.incentive, remaining);
      dailyAccumulator.set(row.date, allocated + capped);
      return {
        ...row,
        incentive: capped
      };
    });

    const total = cappedSorted.reduce((sum, item) => sum + item.incentive, 0);

    return { rows: cappedSorted, total };
  };

  // Get only the workers who actually WORKED in this month range
  const activeSidersWithData = useMemo(() => {
    return workers
      .map(w => {
        const { rows, total } = getWorkerMonthlyLedger(w.id);
        return {
          worker: w,
          rows,
          total,
          workingDays: rows.length
        };
      })
      .filter(item => item.workingDays > 0)
      .sort((a, b) => {
        const aNum = parseInt(a.worker.tNo);
        const bNum = parseInt(b.worker.tNo);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.worker.name.localeCompare(b.worker.name);
      });
  }, [workers, history, fromDate, toDate, rules]);

  // Sider pairs calculation for TV screen (takes 2 siders at a time)
  const tvSiderPairs = useMemo(() => {
    const pairs = [];
    for (let i = 0; i < activeSidersWithData.length; i += 2) {
      pairs.push({
        sider1: activeSidersWithData[i],
        sider2: activeSidersWithData[i + 1] || null
      });
    }
    return pairs;
  }, [activeSidersWithData]);

  // Rotator Index for TV Mode
  const [pairIndex, setPairIndex] = useState<number>(() => {
    const saved = localStorage.getItem('spin_tv_sider_pair_index');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Track if we advanced the index on mount
  const advancedOnMount = React.useRef(false);

  useEffect(() => {
    if (activeTv && tvSiderPairs.length > 0) {
      if (!advancedOnMount.current) {
        setPairIndex(prev => {
          const currentIdx = prev % tvSiderPairs.length;
          const nextIdx = (currentIdx + 1) % tvSiderPairs.length;
          localStorage.setItem('spin_tv_sider_pair_index', nextIdx.toString());
          return currentIdx;
        });
        advancedOnMount.current = true;
      }
    } else {
      advancedOnMount.current = false;
    }
  }, [activeTv, tvSiderPairs.length]);

  // Auto-cycle effect
  useEffect(() => {
    if (!activeTv || tvSiderPairs.length <= 1) return;

    // Interval customized in settings
    const timer = setInterval(() => {
      setPairIndex(prev => {
        const next = (prev + 1) % tvSiderPairs.length;
        localStorage.setItem('spin_tv_sider_pair_index', next.toString());
        return next;
      });
    }, (tvPageInterval || 15) * 1000);

    return () => clearInterval(timer);
  }, [activeTv, tvSiderPairs.length, tvPageInterval]);

  // Keep selected worker ID synced
  useEffect(() => {
    if (!selectedWorkerId && activeSidersWithData.length > 0) {
      setSelectedWorkerId(activeSidersWithData[0].worker.id);
    }
  }, [activeSidersWithData, selectedWorkerId]);

  const activeWorkerData = useMemo(() => {
    return activeSidersWithData.find(d => d.worker.id === selectedWorkerId);
  }, [activeSidersWithData, selectedWorkerId]);

  // Active pair to display in TV Mode
  const currentPair = tvSiderPairs[pairIndex] || null;

  const exportToExcel = () => {
    const monthLabel = monthOptions.find(m => m.value === selectedMonth)?.label || selectedMonth;
    const wb = XLSX.utils.book_new();

    const summaryRows = activeSidersWithData.map((item, idx) => ({
      'S.No': idx + 1,
      'TK No': item.worker.tNo || '—',
      'Sider Name': item.worker.name,
      'Days Worked': item.workingDays,
      'Total Monthly Incentive (INR)': item.total
    }));

    const ws = XLSX.utils.json_to_sheet(summaryRows);
    ws['!cols'] = [
      { wch: 8 },
      { wch: 12 },
      { wch: 30 },
      { wch: 14 },
      { wch: 28 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Sider Monthly Performance');
    XLSX.writeFile(wb, `Sider_Monthly_Performance_${monthLabel}_${selectedYear}.xlsx`);
  };

  return (
    <div className="bg-stone-50 min-h-screen text-stone-900 pb-16">
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">KTTM SPINNING MILLS - UNIT 01</h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">Sider Monthly Performance Cycles</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Month: <strong>{monthOptions.find(m => m.value === selectedMonth)?.label} {selectedYear}</strong></span>
          <span>Active Workers: <strong>{activeSidersWithData.length}</strong></span>
        </div>
      </div>

      {/* HEADER SECTION (HIDED IN TV MODE) */}
      {!activeTv && (
        <div className="bg-white border-b border-stone-250 p-6 no-print shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="text-emerald-700 font-extrabold uppercase text-xs tracking-wider flex items-center gap-1.5">
                <Activity size={14} className="animate-pulse" /> Live Sider Ledger System
              </span>
              <h1 className="text-4xl font-serif italic text-stone-900 font-black tracking-tight mt-1">
                Sider Monthly Performance
              </h1>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto">
              <button
                onClick={() => setLocalTvMode(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-[#404040] hover:bg-black text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-sm transition-all cursor-pointer"
              >
                <Tv size={16} /> Simulate TV Slide (Pairs 2x)
              </button>
              <button
                onClick={exportToExcel}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-2xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                title="Export performance to Excel"
              >
                <FileSpreadsheet size={15} /> Export Excel
              </button>
              <button
                onClick={() => window.print()}
                className="p-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-full transition-all shadow-sm cursor-pointer"
                title="Print Report"
              >
                <Printer size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILTER TOOLS PANEL (ONLY IN INTERACTIVE / NON-TV MODE) */}
      {!activeTv && (
        <div className="max-w-7xl mx-auto px-6 mt-6 no-print">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row items-center gap-6">
            
            {/* Month/Year selector */}
            <div className="w-full md:w-auto flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-100/50 flex items-center justify-center text-emerald-700">
                <Calendar size={18} />
              </div>
              <div className="flex-1 md:flex-initial">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                    setSelectedWorkerId('');
                  }}
                />
              </div>
            </div>

            {/* Worker Selector dropdown filtered to only active workers who did duty */}
            <div className="w-full md:flex-1 flex flex-col md:flex-row items-center gap-3">
              <div className="w-full md:w-auto flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-2xl bg-[#eff6ff] border border-blue-100 flex items-center justify-center text-blue-700">
                  <User size={18} />
                </div>
                <span className="font-bold text-stone-600 text-xs uppercase tracking-wider">Active Worker:</span>
              </div>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="w-full px-4 py-2 border-2 border-stone-200 focus:border-stone-400 rounded-xl font-black text-stone-900 text-sm outline-none uppercase tracking-wide cursor-pointer bg-white"
              >
                {activeSidersWithData.length === 0 ? (
                  <option value="">No Active Personnel for {monthOptions.find(m => m.value === selectedMonth)?.label} {selectedYear}</option>
                ) : (
                  activeSidersWithData.map(d => (
                    <option key={d.worker.id} value={d.worker.id}>
                      [{d.worker.tNo}] {d.worker.name.toUpperCase()} — {d.workingDays} Duties (Total: ₹{Math.round(d.total).toLocaleString()})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* RENDER ACTIVE TV CYCLE VIEW */}
      {activeTv ? (
        <div className="p-8 select-none">
          {/* Header sequence indicator */}
          <div className="flex items-center justify-between border-b pb-4 mb-6 border-stone-300">
            <div>
              <span className="bg-emerald-600 text-white font-extrabold text-[10px] uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                <Monitor size={12} className="shrink-0" /> TV MODE AUTOMATED SYSTEM
              </span>
              <h2 className="text-4xl font-black italic tracking-wide text-stone-900 uppercase mt-2">
                Sider Monthly Performance Cycles
              </h2>
            </div>
            
            <div className="text-right flex items-center gap-4">
              <div className="bg-white border rounded-2xl p-2.5 px-4 shadow-sm">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Slide Display Range</p>
                <p className="text-xl font-extrabold text-stone-900 uppercase italic">
                  {monthOptions.find(m => m.value === selectedMonth)?.label} {selectedYear}
                </p>
              </div>
              <div className="bg-white border rounded-2xl p-2.5 px-4 shadow-sm">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Rotating Sider Group</p>
                <div className="flex items-center gap-1.5 text-xl font-extrabold text-emerald-800">
                  <span>PAIR {pairIndex + 1}</span>
                  <span className="text-stone-300">/</span>
                  <span>{tvSiderPairs.length}</span>
                </div>
              </div>
              {localTvMode && (
                <button
                  onClick={() => setLocalTvMode(false)}
                  className="p-3 bg-red-100 hover:bg-red-200 text-red-800 font-extrabold text-[11px] uppercase tracking-wider rounded-2xl cursor-pointer"
                >
                  Exit TV
                </button>
              )}
            </div>
          </div>

          {activeSidersWithData.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-24 bg-white border border-stone-200 rounded-[2.5rem]">
              <span className="text-stone-400 text-lg uppercase font-black tracking-widest">No worker performance logging found for this period.</span>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              
              {/* SIDER 1 TAB */}
              {currentPair && currentPair.sider1 && (
                <div className="bg-white rounded-[2.5rem] border border-stone-300 shadow-lg p-6">
                  {/* Top Stats Profile */}
                  <div className="flex items-center justify-between border-b pb-4 mb-4 border-stone-200 bg-[#eefcf3] p-4 rounded-3xl">
                    <div className="flex items-center gap-6">
                      {currentPair.sider1.worker.photoUrl ? (
                        <img 
                          src={currentPair.sider1.worker.photoUrl} 
                          alt={currentPair.sider1.worker.name}
                          className="w-48 h-48 rounded-[2.5rem] object-cover ring-4 ring-emerald-100 border border-emerald-500 shadow-md shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-48 h-48 rounded-[2.5rem] bg-emerald-100 border border-emerald-250 flex items-center justify-center text-emerald-800 font-black text-5xl shrink-0 shadow-inner">
                          {currentPair.sider1.worker.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: '20px' }} className="bg-stone-800 text-white font-extrabold px-2 py-0.5 rounded-md">
                            TK: {currentPair.sider1.worker.tNo}
                          </span>
                        </div>
                        <h3 style={{ fontSize: '30px' }} className="font-black text-stone-900 uppercase mt-0.5 leading-none">
                          {currentPair.sider1.worker.name}
                        </h3>
                      </div>
                    </div>

                    <div className="text-center">
                      <p style={{ fontSize: '14px' }} className="font-black uppercase text-stone-500 tracking-wider">Accumulated Payout</p>
                      <p style={{ fontSize: '36px' }} className="font-black text-emerald-800 tabular-nums">
                        ₹{Math.round(currentPair.sider1.total).toLocaleString()}
                      </p>
                      <p style={{ fontSize: '14px' }} className="font-bold text-stone-600 uppercase tracking-tighter">
                        {currentPair.sider1.workingDays} active days logged
                      </p>
                    </div>
                  </div>

                  {/* Performance Log Grid */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-center text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-100 text-stone-800 uppercase tracking-widest h-12 border-b border-stone-200">
                          <th style={{ fontSize: '20px' }} className="px-4 py-2 border-r border-stone-200 text-center">Date</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">Shift</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">Alloted Rf</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">Count</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">GPS</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">EM</th>
                          <th style={{ fontSize: '20px' }} className="px-4 py-2 text-center">Incentive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPair.sider1.rows.slice(-15).map((row, index) => (
                          <tr key={index} className={`border-b border-stone-150 h-12 ${index % 2 === 0 ? 'bg-white' : 'bg-stone-50'}`}>
                            <td style={{ fontSize: '20px' }} className="px-4 py-2 border-r border-stone-150 font-black text-stone-900 text-center">{row.date}</td>
                            <td style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-150 text-center font-bold text-stone-800">{row.shift}</td>
                            <td style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-150 font-black text-stone-700 text-center">{row.frameNo}</td>
                            <td style={{ fontSize: '20px', fontWeight: 'bold' }} className="px-3 py-2 border-r border-stone-150 text-center text-stone-800">{row.count}</td>
                            <td style={{ fontSize: '20px', fontWeight: 'normal' }} className="px-3 py-2 border-r border-stone-150 text-center text-blue-900 font-mono tracking-tight">{Math.round(row.gps)}</td>
                            <td style={{ fontSize: '20px', fontWeight: 'bold' }} className={`px-3 py-2 border-r border-stone-150 text-center font-mono tracking-tight ${row.em !== undefined ? (row.em > (emHighLimit - 1) ? 'text-red-600 font-extrabold' : row.em < 2.5 ? 'text-green-600 font-extrabold' : 'text-stone-800 font-medium') : 'text-stone-450'}`}>{row.em !== undefined ? row.em.toFixed(2) : '-'}</td>
                            <td style={{ fontSize: '20px', color: '#7a2800' }} className="px-4 py-2 text-center font-black font-mono">
                              {row.em !== undefined && row.em > (emHighLimit - 0.5) ? (
                                <div className="inline-block relative px-2.5 py-1">
                                  <span className="absolute inset-0 border-2 border-red-600 rounded-[50%/50%] pointer-events-none transform scale-y-95 scale-x-105" />
                                  <span className="relative z-10 text-red-600">₹{Math.round(row.incentive).toLocaleString()}</span>
                                </div>
                              ) : (
                                `₹${Math.round(row.incentive).toLocaleString()}`
                              )}
                            </td>
                          </tr>
                        ))}
                        {currentPair.sider1.rows.length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                              No shift entries recorded
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {currentPair.sider1.rows.length > 0 && (
                        <tfoot>
                          <tr className="bg-stone-900 text-white font-black">
                            <td colSpan={6} style={{ fontSize: '18px' }} className="px-4 py-3 rounded-bl-3xl font-black uppercase tracking-widest text-right border-r border-stone-800">
                              GRAND TOTAL (ACTUAL MONTH PAYOUT):
                            </td>
                            <td style={{ fontSize: '20px' }} className="px-4 py-3 rounded-br-3xl font-black text-center font-mono text-emerald-400">
                              ₹{Math.round(currentPair.sider1.total).toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    {/* All records are scrollable and displayed */}
                  </div>
                </div>
              )}

              {/* SIDER 2 TAB */}
              {currentPair && currentPair.sider2 && (
                <div className="bg-white rounded-[2.5rem] border border-stone-300 shadow-lg p-6">
                  {/* Top Stats Profile */}
                  <div className="flex items-center justify-between border-b pb-4 mb-4 border-stone-200 bg-[#eefcf3] p-4 rounded-3xl">
                    <div className="flex items-center gap-6">
                      {currentPair.sider2.worker.photoUrl ? (
                        <img 
                          src={currentPair.sider2.worker.photoUrl} 
                          alt={currentPair.sider2.worker.name}
                          className="w-48 h-48 rounded-[2.5rem] object-cover ring-4 ring-emerald-100 border border-emerald-500 shadow-md shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-48 h-48 rounded-[2.5rem] bg-emerald-100 border border-emerald-250 flex items-center justify-center text-emerald-800 font-black text-5xl shrink-0 shadow-inner">
                          {currentPair.sider2.worker.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span style={{ fontSize: '20px' }} className="bg-stone-800 text-white font-extrabold px-2 py-0.5 rounded-md">
                            TK: {currentPair.sider2.worker.tNo}
                          </span>
                        </div>
                        <h3 style={{ fontSize: '30px' }} className="font-black text-stone-900 uppercase mt-0.5 leading-none">
                          {currentPair.sider2.worker.name}
                        </h3>
                      </div>
                    </div>

                    <div className="text-center">
                      <p style={{ fontSize: '12px' }} className="font-black uppercase text-stone-500 tracking-wider">Accumulated Payout</p>
                      <p style={{ fontSize: '35px' }} className="font-black text-emerald-800 tabular-nums">
                        ₹{Math.round(currentPair.sider2.total).toLocaleString()}
                      </p>
                      <p style={{ fontSize: '13px' }} className="font-bold text-stone-600 uppercase tracking-tighter">
                        {currentPair.sider2.workingDays} active days logged
                      </p>
                    </div>
                  </div>

                  {/* Performance Log Grid */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-center text-xs border-collapse">
                      <thead>
                        <tr className="bg-stone-100 text-stone-800 uppercase tracking-widest h-12 border-b border-stone-200">
                          <th style={{ fontSize: '20px' }} className="px-4 py-2 border-r border-stone-200 text-center">Date</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">Shift</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">Alloted Rf</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">Count</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">GPS</th>
                          <th style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-200 text-center">EM</th>
                          <th style={{ fontSize: '20px' }} className="px-4 py-2 text-center">Incentive</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentPair.sider2.rows.slice(-15).map((row, index) => (
                          <tr key={index} className={`border-b border-stone-150 h-12 ${index % 2 === 0 ? 'bg-white' : 'bg-stone-50'}`}>
                            <td style={{ fontSize: '20px' }} className="px-4 py-2 border-r border-stone-150 font-black text-stone-900 text-center">{row.date}</td>
                            <td style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-150 text-center font-bold text-stone-800">{row.shift}</td>
                            <td style={{ fontSize: '20px' }} className="px-3 py-2 border-r border-stone-150 font-black text-stone-700 text-center">{row.frameNo}</td>
                            <td style={{ fontSize: '20px', fontWeight: 'bold' }} className="px-3 py-2 border-r border-stone-150 text-center text-stone-800">{row.count}</td>
                            <td style={{ fontSize: '20px', fontWeight: 'normal' }} className="px-3 py-2 border-r border-stone-150 text-center text-blue-900 font-mono tracking-tight">{Math.round(row.gps)}</td>
                            <td style={{ fontSize: '20px', fontWeight: 'bold' }} className={`px-3 py-2 border-r border-stone-150 text-center font-mono tracking-tight ${row.em !== undefined ? (row.em > (emHighLimit - 1) ? 'text-red-600 font-extrabold' : row.em < 2.5 ? 'text-green-600 font-extrabold' : 'text-stone-800 font-medium') : 'text-stone-450'}`}>{row.em !== undefined ? row.em.toFixed(2) : '-'}</td>
                            <td style={{ fontSize: '20px', color: '#7a2800' }} className="px-4 py-2 text-center font-black font-mono">
                              {row.em !== undefined && row.em > (emHighLimit - 0.5) ? (
                                <div className="inline-block relative px-2.5 py-1">
                                  <span className="absolute inset-0 border-2 border-red-600 rounded-[50%/50%] pointer-events-none transform scale-y-95 scale-x-105" />
                                  <span className="relative z-10 text-red-600">₹{Math.round(row.incentive).toLocaleString()}</span>
                                </div>
                              ) : (
                                `₹${Math.round(row.incentive).toLocaleString()}`
                              )}
                            </td>
                          </tr>
                        ))}
                        {currentPair.sider2.rows.length === 0 && (
                          <tr>
                            <td colSpan={7} className="text-center py-8 text-[11px] font-bold text-stone-400 uppercase tracking-wider">
                              No shift entries recorded
                            </td>
                          </tr>
                        )}
                      </tbody>
                      {currentPair.sider2.rows.length > 0 && (
                        <tfoot>
                          <tr className="bg-stone-900 text-white font-black">
                            <td colSpan={6} style={{ fontSize: '18px' }} className="px-4 py-3 rounded-bl-3xl font-black uppercase tracking-widest text-right border-r border-stone-800">
                              GRAND TOTAL (ACTUAL MONTH PAYOUT):
                            </td>
                            <td style={{ fontSize: '20px' }} className="px-4 py-3 rounded-br-3xl font-black text-center font-mono text-emerald-400">
                              ₹{Math.round(currentPair.sider2.total).toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                    {/* All records are scrollable and displayed */}
                  </div>
                </div>
              )}

              {/* FALLBACK IN CASE ONLY 1 SIDER ON LAST ROTATION SLIDE */}
              {currentPair && !currentPair.sider2 && (
                <div className="bg-[#fcf8f2] rounded-[2.5rem] border border-amber-200/60 p-12 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
                  <Award size={64} className="text-amber-500 mb-4 animate-bounce" />
                  <h4 className="text-2xl font-serif italic text-amber-900 font-black">End of Rotation Slide Pair</h4>
                  <p className="text-[10px] text-stone-500 uppercase tracking-widest font-black mt-2 leading-relaxed">
                    Total Siders on Shift: {activeSidersWithData.length} (Odd item displayed individually).
                    <br />The program auto-rolls to Page 1 at next lapse.
                  </p>
                </div>
              )}

            </div>
          )}
        </div>
      ) : (
        /* INTERACTIVE STANDARD DESKTOP MODE */
        <div className="max-w-7xl mx-auto px-6 mt-6">
          {activeSidersWithData.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-24 bg-white border border-stone-200 rounded-[2.5rem] text-center shadow-sm">
              <Calendar size={60} className="text-stone-300 mb-4" />
              <h2 className="text-xl font-extrabold uppercase text-stone-700">No Logged Labour in Selected Month</h2>
              <p className="text-stone-400 text-xs mt-1 uppercase max-w-sm">
                No workers have active production or gaiter logs recorded during {monthOptions.find(m => m.value === selectedMonth)?.label} {selectedYear}. Please adjust your filters above.
              </p>
            </div>
          ) : !activeWorkerData ? (
            <div className="flex flex-col items-center justify-center p-24 bg-white border border-stone-200 rounded-[2.5rem] text-center shadow-sm">
              <User size={60} className="text-stone-300 mb-4" />
              <h2 className="text-xl font-extrabold uppercase text-stone-700">No Worker Selected</h2>
              <p className="text-stone-400 text-xs mt-1 uppercase">
                Please pick an active operator profile from the filter selection bar above.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* LEFT PROFILE CARD */}
              <div className="lg:col-span-1 bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-2 bg-emerald-700" />
                
                {activeWorkerData.worker.photoUrl ? (
                  <img 
                    src={activeWorkerData.worker.photoUrl} 
                    alt={activeWorkerData.worker.name}
                    className="w-44 h-44 rounded-[2.5rem] object-cover ring-8 ring-emerald-50 border-2 border-emerald-500 shadow-lg mb-6 transform transition-all duration-300 hover:scale-[1.03]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-44 h-44 rounded-[2.5rem] bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-800 font-serif italic text-6xl font-black mb-6 shadow-md">
                    {activeWorkerData.worker.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <span className="bg-stone-900 text-white font-extrabold text-xs px-3 py-1 rounded-full uppercase tracking-wider">
                  TICKET NO: {activeWorkerData.worker.tNo}
                </span>

                <h2 className="text-3xl font-serif italic font-black text-stone-900 uppercase mt-3 leading-tight">
                  {activeWorkerData.worker.name}
                </h2>
                
                <p className="text-xs font-black text-stone-400 uppercase tracking-widest mt-1">
                  Spinning Operator Profile
                </p>

                <div className="w-full border-t border-stone-150 my-6" />

                <div className="w-full grid grid-cols-2 gap-4">
                  <div className="bg-stone-50 p-4 rounded-2xl flex flex-col items-center">
                    <span className="text-[10px] text-stone-500 uppercase font-bold tracking-wider">Duties Logged</span>
                    <span className="text-3xl font-black text-stone-800 mt-1">{activeWorkerData.workingDays}</span>
                  </div>
                  <div className="bg-emerald-50/50 p-4 rounded-2xl flex flex-col items-center">
                    <span className="text-[10px] text-stone-500 uppercase font-bold tracking-wider">Total Amount</span>
                    <span className="text-2xl font-black text-emerald-800 mt-1.5 font-mono">₹{Math.round(activeWorkerData.total).toLocaleString()}</span>
                  </div>
                </div>

                <div className="w-full mt-6 bg-blue-50/40 border border-blue-100 p-4 rounded-2xl text-left">
                  <p className="text-[10px] font-extrabold uppercase text-blue-700 tracking-wider">Payout Audit Period</p>
                  <p className="text-xs text-stone-600 mt-1 font-bold leading-relaxed">
                    Statements compiled from daily logs between {fromDate.split('-').reverse().join('/')} and {toDate.split('-').reverse().join('/')}.
                  </p>
                </div>
              </div>

              {/* RIGHT PERFORMANCE LEDGER TABLE */}
              <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-sm">
                <div className="flex items-center justify-between pb-6 border-b border-stone-150 mb-6">
                  <h3 className="text-xl font-extrabold text-stone-900 uppercase tracking-tight flex items-center gap-2">
                    <Activity size={20} className="text-emerald-700 shrink-0" /> Duty Statement Details
                  </h3>
                  <span className="text-xs text-stone-500 font-bold uppercase tracking-widest">
                    Showing {activeWorkerData.rows.length} shifts
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-stone-50 text-stone-700 uppercase tracking-widest text-xs border-b border-stone-200">
                        <th className="px-4 py-3 border-r border-stone-200">Date</th>
                        <th className="px-4 py-3 border-r border-stone-200 text-center">Shift</th>
                        <th className="px-4 py-3 border-r border-stone-200">Alloted Rf (Frame)</th>
                        <th className="px-4 py-3 border-r border-stone-200 text-center">Count</th>
                        <th className="px-4 py-3 border-r border-stone-200 text-right">GPS</th>
                        <th className="px-4 py-3 border-r border-stone-200 text-right">EM</th>
                        <th className="px-4 py-3 text-right">Incentive Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeWorkerData.rows.map((row, idx) => (
                        <tr key={idx} className={`border-b border-stone-100 hover:bg-stone-50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/30'}`}>
                          <td style={{ fontSize: '14px' }} className="px-4 py-3.5 border-r border-stone-100 font-bold text-stone-900 flex items-center gap-1.5">
                            <ChevronRight size={14} className="text-emerald-700 shrink-0" />
                            {row.date}
                          </td>
                          <td style={{ fontSize: '14px' }} className="px-4 py-3.5 border-r border-stone-100 text-center font-bold text-stone-700">{row.shift}</td>
                          <td style={{ fontSize: '14px' }} className="px-4 py-3.5 border-r border-stone-100 font-black text-stone-800">
                            {row.role === 'GAITER' ? (
                              <span className="bg-blue-50 text-blue-700 text-[10px] font-extrabold px-2.5 py-1 rounded-lg uppercase tracking-wider border border-blue-100/50">
                                GAITER DUTY
                              </span>
                            ) : (
                              row.frameNo
                            )}
                          </td>
                          <td style={{ fontSize: '14px', fontWeight: 'bold' }} className="px-4 py-3.5 border-r border-stone-100 text-center text-stone-800">{row.count}</td>
                          <td style={{ fontSize: '14px', fontWeight: 'normal' }} className="px-4 py-3.5 border-r border-stone-100 text-right text-blue-900 font-mono tracking-tight">{Math.round(row.gps)}</td>
                          <td style={{ fontSize: '14px', fontWeight: 'bold' }} className={`px-4 py-3.5 border-r border-stone-100 text-right font-mono tracking-tight ${row.em !== undefined ? (row.em > (emHighLimit - 1) ? 'text-red-600 font-extrabold' : row.em < 2.5 ? 'text-green-600 font-extrabold' : 'text-stone-850 font-medium') : 'text-stone-440'}`}>{row.em !== undefined ? row.em.toFixed(2) : '-'}</td>
                          <td style={{ fontSize: '14px', color: '#7a2800' }} className="px-4 py-3.5 text-right font-extrabold font-mono">
                            {row.em !== undefined && row.em > (emHighLimit - 0.5) ? (
                              <div className="inline-block relative px-2 py-0.5">
                                <span className="absolute inset-0 border-2 border-red-600 rounded-[50%/50%] pointer-events-none transform scale-y-95 scale-x-105" />
                                <span className="relative z-10 text-red-600">₹{Math.round(row.incentive).toLocaleString()}</span>
                              </div>
                            ) : (
                              `₹${Math.round(row.incentive).toLocaleString()}`
                            )}
                          </td>
                        </tr>
                      ))}
                      {activeWorkerData.rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="text-center py-16 text-xs font-black text-stone-400 uppercase tracking-widest leading-relaxed">
                            No matching duty shifts logged in range.
                          </td>
                        </tr>
                      )}
                    </tbody>
                    
                    {/* TOTAL FOOTER BAR */}
                    {activeWorkerData.rows.length > 0 && (
                      <tfoot>
                        <tr className="bg-stone-900 text-white">
                          <td colSpan={6} className="px-4 py-4 rounded-bl-3xl font-black uppercase text-xs tracking-widest text-right border-r border-stone-800">
                            GRAND TOTAL SPECIFIC PAYOUT:
                          </td>
                          <td className="px-4 py-4 rounded-br-3xl font-black text-center font-mono text-lg text-emerald-400">
                            ₹{Math.round(activeWorkerData.total).toLocaleString()}
                          </td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                </div>
              </div>

            </div>
          )}
        </div>
      )}
    </div>
  );
};
