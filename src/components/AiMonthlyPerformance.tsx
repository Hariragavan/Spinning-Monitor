import React, { useState, useMemo, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift } from '../types';
import { Calendar, User, Printer, Coins, Tv, Monitor, ChevronRight, Activity, Award } from 'lucide-react';
import { parseUniversalDateParts, parseUniversalDate } from '../lib/utils';

interface AiMonthlyPerformanceProps {
  history: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  isTvMode?: boolean;
  month?: number;
  year?: number;
}

interface AiPerformanceRow {
  date: string;
  shift: Shift;
  count: string;
  utility: number;
  incentive: number;
}

export const AiMonthlyPerformance: React.FC<AiMonthlyPerformanceProps> = ({
  history,
  workers,
  rules,
  isTvMode: appIsTvMode = false,
  month,
  year
}) => {
  const [localTvMode, setLocalTvMode] = useState<boolean>(false);
  const activeTv = appIsTvMode || localTvMode;

  const today = new Date();
  const currentMonthNum = today.getMonth() + 1;
  const currentYearNum = today.getFullYear();
  
  const [selectedMonth, setSelectedMonth] = useState<number>(month || currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(year || 2026); // Default historical context
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

  const { fromDate, toDate } = useMemo(() => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    return {
      fromDate: `${selectedYear}-${pad(selectedMonth)}-${pad(firstDay.getDate())}`,
      toDate: `${selectedYear}-${pad(selectedMonth)}-${pad(lastDay.getDate())}`
    };
  }, [selectedMonth, selectedYear]);

  const monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const getWorkerMonthlyLedger = (workerId: string) => {
    const targetWorker = workers.find(w => w.id === workerId || w.tNo === workerId);
    if (!targetWorker) return { rows: [], total: 0 };

    const rows: AiPerformanceRow[] = [];

    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;

      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;

      if (rDateStr < fromDate || rDateStr > toDate) return;

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
          // Average Utilisation for this shift
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

          // Determine count or matching rule labels
          let matchedCount = '-';
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
            matchedCount = matchedRule.count;
          }

          // Compute incentive amount
          let incentive = 0;
          if (matchedRule) {
            const sortedPayouts = [...matchedRule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
            const bestPayout = sortedPayouts.find(p => Math.round(avgUtility) >= p.gpsThreshold);
            incentive = bestPayout ? bestPayout.amount : 0;
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

    // Sort by Date then Shift
    const sorted = rows.sort((a, b) => {
      const timeA = parseUniversalDate(a.date).getTime();
      const timeB = parseUniversalDate(b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;

      const shiftsVal = { 'I': 1, 'II': 2, 'III': 3 };
      return shiftsVal[a.shift] - shiftsVal[b.shift];
    });

    const total = sorted.reduce((sum, item) => sum + item.incentive, 0);

    return { rows: sorted, total };
  };

  // Map workers who have logged AI Cone duties during the selected period
  const activeWorkersWithData = useMemo(() => {
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

  const [tvWorkerIndex, setTvWorkerIndex] = useState<number>(() => {
    const saved = localStorage.getItem('spin_tv_ai_worker_index');
    return saved ? parseInt(saved, 10) : 0;
  });

  const advancedOnMount = React.useRef(false);

  useEffect(() => {
    if (activeTv && activeWorkersWithData.length > 0) {
      if (!advancedOnMount.current) {
        setTvWorkerIndex(prev => {
          const currentIdx = prev % activeWorkersWithData.length;
          const nextIdx = (currentIdx + 1) % activeWorkersWithData.length;
          localStorage.setItem('spin_tv_ai_worker_index', nextIdx.toString());
          return currentIdx;
        });
        advancedOnMount.current = true;
      }
    } else {
      advancedOnMount.current = false;
    }
  }, [activeTv, activeWorkersWithData.length]);

  useEffect(() => {
    if (!activeTv || activeWorkersWithData.length <= 1) return;

    const timer = setInterval(() => {
      setTvWorkerIndex(prev => {
        const next = (prev + 1) % activeWorkersWithData.length;
        localStorage.setItem('spin_tv_ai_worker_index', next.toString());
        return next;
      });
    }, 15000);

    return () => clearInterval(timer);
  }, [activeTv, activeWorkersWithData.length]);

  useEffect(() => {
    if (!selectedWorkerId && activeWorkersWithData.length > 0) {
      setSelectedWorkerId(activeWorkersWithData[0].worker.id);
    }
  }, [activeWorkersWithData, selectedWorkerId]);

  const activeWorkerData = useMemo(() => {
    return activeWorkersWithData.find(d => d.worker.id === selectedWorkerId);
  }, [activeWorkersWithData, selectedWorkerId]);

  const currentTvWorker = activeWorkersWithData[tvWorkerIndex] || null;

  return (
    <div className="bg-stone-50 min-h-screen text-stone-900 pb-16">
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">KTTM SPINNING MILLS - UNIT 01</h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">AI Linkconer Monthly Performance Ledger</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Department: <strong>AI Auto Coner / Linkconer</strong></span>
          <span>Status: <strong>Official Monthly Statement</strong></span>
        </div>
      </div>

      {/* HEADER SECTION */}
      {!activeTv && (
        <div className="bg-white border-b border-stone-250 p-6 no-print shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="text-purple-700 font-extrabold uppercase text-xs tracking-wider flex items-center gap-1.5">
                <Activity size={14} className="animate-pulse" /> Live AI Operator Ledger System
              </span>
              <h1 className="text-4xl font-serif italic text-stone-900 font-black tracking-tight mt-1">
                AI Linkconer Monthly Performance
              </h1>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto">
              <button
                onClick={() => setLocalTvMode(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-purple-700 hover:bg-purple-950 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-sm transition-all cursor-pointer"
              >
                <Tv size={16} /> Simulate TV Slide
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

      {/* FILTER TOOLS PANEL */}
      {!activeTv && (
        <div className="max-w-7xl mx-auto px-6 mt-6 no-print">
          <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-sm flex flex-col md:flex-row items-center gap-6">
            
            <div className="w-full md:w-auto flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700">
                <Calendar size={18} />
              </div>
              <div className="flex-1 md:flex-initial flex gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    setSelectedMonth(Number(e.target.value));
                    setSelectedWorkerId('');
                  }}
                  className="px-3 py-2 border-2 border-stone-200 focus:border-stone-400 rounded-xl font-bold text-stone-800 text-sm outline-none cursor-pointer"
                >
                  {monthOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => {
                    setSelectedYear(Number(e.target.value));
                    setSelectedWorkerId('');
                  }}
                  className="px-3 py-2 border-2 border-stone-200 focus:border-stone-400 rounded-xl font-bold text-stone-800 text-sm outline-none cursor-pointer"
                >
                  <option value={2025}>2025</option>
                  <option value={2026}>2026</option>
                  <option value={2027}>2027</option>
                </select>
              </div>
            </div>

            <div className="w-full md:flex-1 flex flex-col md:flex-row items-center gap-3">
              <div className="w-full md:w-auto flex items-center gap-3 shrink-0">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700">
                  <User size={18} />
                </div>
                <span className="font-bold text-stone-600 text-xs uppercase tracking-wider">Active operator:</span>
              </div>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="w-full px-4 py-2 border-2 border-stone-200 focus:border-stone-400 rounded-xl font-black text-stone-900 text-sm outline-none uppercase tracking-wide cursor-pointer bg-white"
              >
                {activeWorkersWithData.length === 0 ? (
                  <option value="">No active AI Linkconer duties for {monthOptions.find(m => m.value === selectedMonth)?.label} {selectedYear}</option>
                ) : (
                  activeWorkersWithData.map(d => (
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

      {/* RENDER TV VIEW */}
      {activeTv ? (
        <div className="p-8 select-none">
          <div className="flex items-center justify-between border-b pb-4 mb-6 border-stone-300">
            <div>
              <span className="bg-purple-800 text-white font-extrabold text-[10px] uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                <Monitor size={12} className="shrink-0" /> TV MODE AUTOMATED SYSTEM
              </span>
              <h2 className="text-4xl font-black italic tracking-wide text-stone-900 uppercase mt-2">
                AI Linkconer Performance Charts
              </h2>
            </div>
            
            <div className="text-right flex items-center gap-4">
              <div className="bg-white border rounded-2xl p-2.5 px-4 shadow-sm">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Slide Display range</p>
                <p className="text-xl font-extrabold text-stone-900 uppercase italic">
                  {monthOptions.find(m => m.value === selectedMonth)?.label} {selectedYear}
                </p>
              </div>
              <div className="bg-white border rounded-2xl p-2.5 px-4 shadow-sm">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Rotating Group</p>
                <div className="flex items-center gap-1.5 text-xl font-extrabold text-purple-900">
                  <span>OPERATOR {tvWorkerIndex + 1}</span>
                  <span className="text-stone-300">/</span>
                  <span>{activeWorkersWithData.length}</span>
                </div>
              </div>
              {localTvMode && (
                <button
                  onClick={() => setLocalTvMode(false)}
                  className="p-3 bg-red-100 hover:bg-red-200 text-red-800 font-extrabold text-[11px] uppercase tracking-wider rounded-2xl cursor-pointer font-black"
                >
                  Exit TV
                </button>
              )}
            </div>
          </div>

          {activeWorkersWithData.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-24 bg-white border border-stone-200 rounded-[2.5rem]">
              <span className="text-stone-400 text-lg uppercase font-black tracking-widest">No active performance logging found for this period.</span>
            </div>
          ) : (
            <div className="max-w-[98%] mx-auto w-full">
              {currentTvWorker && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                  
                  {/* Left Column: Photo & Profile Details */}
                  <div className="xl:col-span-4 bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-md flex flex-col items-center text-center relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-2 bg-purple-700" />
                    
                    {currentTvWorker.worker.photoUrl ? (
                      <img 
                        src={currentTvWorker.worker.photoUrl} 
                        alt={currentTvWorker.worker.name}
                        className="w-88 h-88 rounded-[2.5rem] object-cover ring-[12px] ring-purple-50 border-4 border-purple-500 shadow-lg mb-6 transform transition-all duration-300 hover:scale-[1.03]"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-88 h-88 rounded-[2.5rem] bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-800 font-serif italic text-[9rem] font-black mb-6 shadow-md">
                        {currentTvWorker.worker.name.charAt(0).toUpperCase()}
                      </div>
                    )}

                    <span className="bg-purple-900 text-white font-extrabold text-[14px] px-4 py-1.5 rounded-full uppercase tracking-wider">
                      TICKET NO: {currentTvWorker.worker.tNo}
                    </span>

                    <h2 className="text-4xl font-serif italic font-black text-stone-900 uppercase mt-4 leading-tight">
                      {currentTvWorker.worker.name}
                    </h2>
                    
                    <p className="text-sm font-black text-stone-400 uppercase tracking-widest mt-1">
                      AI Linkconer Operator Profile
                    </p>

                    <div className="w-full border-t border-stone-150 my-6" />

                    <div className="w-full grid grid-cols-2 gap-4">
                      <div className="bg-stone-50 p-4 rounded-2xl flex flex-col items-center">
                        <span className="text-[13px] text-stone-500 uppercase font-bold tracking-wider">Duties Logged</span>
                        <span className="text-4xl font-black text-stone-800 mt-1">{currentTvWorker.workingDays}</span>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-2xl flex flex-col items-center">
                        <span className="text-[13px] text-stone-500 uppercase font-bold tracking-wider">Total Amount</span>
                        <span className="text-3xl font-black text-purple-950 mt-1.5 font-mono">₹{Math.round(currentTvWorker.total).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="w-full mt-6 bg-purple-50/20 border border-purple-100 p-4 rounded-2xl text-left">
                      <p className="text-[13px] font-extrabold uppercase text-purple-700 tracking-wider">Payout Audit Period</p>
                      <p className="text-sm text-stone-600 mt-1 font-bold leading-relaxed">
                        Statements compiled from daily logs between {fromDate.split('-').reverse().join('/')} and {toDate.split('-').reverse().join('/')}.
                      </p>
                    </div>
                  </div>

                  {/* Right Column: Daily History Detail Table (Showing max 12 rows for zero vertical scroll screen fit) */}
                  <div className="xl:col-span-8 bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-md">
                    <div className="flex items-center justify-between pb-6 border-b border-stone-150 mb-6 font-extrabold">
                      <h3 className="text-2xl font-extrabold text-stone-900 uppercase tracking-tight flex items-center gap-2">
                        <Activity size={24} className="text-purple-700 shrink-0" /> Daily Duties History Logs
                      </h3>
                      <span className="text-sm text-stone-500 uppercase tracking-widest">
                        Showing {Math.min(15, currentTvWorker.rows.length)} shifts
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-stone-50 text-stone-700 uppercase tracking-widest text-[16px] border-b border-stone-250 h-14">
                            <th className="px-4 py-3 border-r border-stone-200">Date</th>
                            <th className="px-4 py-3 border-r border-stone-200 text-center">Shift</th>
                            <th className="px-4 py-3 border-r border-stone-200 text-center">Shift Utilisation (U%)</th>
                            <th className="px-4 py-3 text-center">Incentive Amt</th>
                          </tr>
                        </thead>
                        <tbody>
                          {currentTvWorker.rows.slice(-15).map((row, idx) => {
                            const isLowUtility = Math.round(row.utility) < 94;
                            return (
                              <tr key={idx} className={`border-b border-stone-100 h-14 hover:bg-stone-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/20'}`}>
                                <td style={{ fontSize: '18px' }} className="px-4 py-3 border-r border-stone-100 font-bold text-stone-900 flex items-center gap-1.5">
                                  <ChevronRight size={18} className="text-purple-700 shrink-0" />
                                  {row.date}
                                </td>
                                <td style={{ fontSize: '18px' }} className="px-4 py-3 border-r border-stone-100 text-center font-bold text-stone-700">{row.shift}</td>
                                <td 
                                  style={{ fontSize: '22px', color: isLowUtility ? '#dc2626' : '#6b21a8' }} 
                                  className="px-4 py-3 border-r border-stone-100 text-center font-extrabold"
                                >
                                  {Math.round(row.utility)}%
                                </td>
                                <td 
                                  style={{ fontSize: '22px' }} 
                                  className="px-4 py-3 text-center font-black text-purple-900 font-mono"
                                >
                                  ₹{Math.round(row.incentive).toLocaleString()}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                        
                        <tfoot>
                          <tr className="bg-purple-950 text-white font-black">
                            <td colSpan={3} className="px-4 py-5 rounded-bl-3xl uppercase text-[16px] tracking-widest text-right border-r border-purple-900">
                              GRAND TOTAL (ACTUAL MONTH PAYOUT):
                            </td>
                            <td className="px-4 py-5 rounded-br-3xl text-center font-mono text-[24px] text-amber-300">
                              ₹{Math.round(currentTvWorker.total).toLocaleString()}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>

                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* STANDARD VIEW */
        <div className="max-w-7xl mx-auto px-6 mt-6">
          {activeWorkersWithData.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-24 bg-white border border-stone-200 rounded-[2.5rem] text-center shadow-sm">
              <Calendar size={60} className="text-stone-300 mb-4" />
              <h2 className="text-xl font-extrabold uppercase text-stone-700">No AI Operator Duties Logs Found</h2>
              <p className="text-stone-400 text-xs mt-1 uppercase max-w-sm">
                Adjust your month/year filters above to find active assignments in other cycles.
              </p>
            </div>
          ) : !activeWorkerData ? (
            <div className="flex flex-col items-center justify-center p-24 bg-white border border-stone-200 rounded-[2.5rem] text-center shadow-sm">
              <User size={60} className="text-stone-300 mb-4" />
              <h2 className="text-xl font-extrabold uppercase text-stone-700">No Operator selected</h2>
              <p className="text-stone-400 text-xs mt-1 uppercase">
                Choose an operator from the Master profile list atop this diagnostics ledger.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
              
              {/* Profile card panel */}
              <div className="lg:col-span-1 bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-sm flex flex-col items-center text-center relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-2 bg-purple-700" />
                
                {activeWorkerData.worker.photoUrl ? (
                  <img 
                    src={activeWorkerData.worker.photoUrl} 
                    alt={activeWorkerData.worker.name}
                    className="w-88 h-88 rounded-[2.5rem] object-cover ring-[12px] ring-purple-50 border-4 border-purple-500 shadow-lg mb-6 transform transition-all duration-300 hover:scale-[1.03]"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-88 h-88 rounded-[2.5rem] bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-800 font-serif italic text-[9rem] font-black mb-6 shadow-md">
                    {activeWorkerData.worker.name.charAt(0).toUpperCase()}
                  </div>
                )}

                <span className="bg-purple-900 text-white font-extrabold text-[14px] px-4 py-1.5 rounded-full uppercase tracking-wider">
                  TICKET NO: {activeWorkerData.worker.tNo}
                </span>

                <h2 className="text-4xl font-serif italic font-black text-stone-900 uppercase mt-4 leading-tight">
                  {activeWorkerData.worker.name}
                </h2>
                
                <p className="text-sm font-black text-stone-400 uppercase tracking-widest mt-1">
                  AI Linkconer Operator Profile
                </p>

                <div className="w-full border-t border-stone-150 my-6" />

                <div className="w-full grid grid-cols-2 gap-4">
                  <div className="bg-stone-50 p-4 rounded-2xl flex flex-col items-center">
                    <span className="text-[13px] text-stone-500 uppercase font-bold tracking-wider">Duties Logged</span>
                    <span className="text-4xl font-black text-stone-800 mt-1">{activeWorkerData.workingDays}</span>
                  </div>
                  <div className="bg-purple-50 p-4 rounded-2xl flex flex-col items-center">
                    <span className="text-[13px] text-stone-500 uppercase font-bold tracking-wider">Total Amount</span>
                    <span className="text-3xl font-black text-purple-950 mt-1.5 font-mono">₹{Math.round(activeWorkerData.total).toLocaleString()}</span>
                  </div>
                </div>

                <div className="w-full mt-6 bg-purple-50/20 border border-purple-100 p-4 rounded-2xl text-left">
                  <p className="text-[13px] font-extrabold uppercase text-purple-700 tracking-wider">Payout Audit Period</p>
                  <p className="text-sm text-stone-600 mt-1 font-bold leading-relaxed">
                    Statements compiled from daily logs between {fromDate.split('-').reverse().join('/')} and {toDate.split('-').reverse().join('/')}.
                  </p>
                </div>
              </div>

              {/* Duty Ledger Details */}
              <div className="lg:col-span-2 bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-sm">
                <div className="flex items-center justify-between pb-6 border-b border-stone-150 mb-6 font-extrabold">
                  <h3 className="text-2xl font-extrabold text-stone-900 uppercase tracking-tight flex items-center gap-2">
                    <Activity size={24} className="text-purple-700 shrink-0" /> Daily Duties History Logs
                  </h3>
                  <span className="text-sm text-stone-500 uppercase tracking-widest">
                    Showing {activeWorkerData.rows.length} shifts
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-stone-50 text-stone-700 uppercase tracking-widest text-[16px] border-b border-stone-200 h-14">
                        <th className="px-4 py-3 border-r border-stone-200">Date</th>
                        <th className="px-4 py-3 border-r border-stone-200 text-center">Shift</th>
                        <th className="px-4 py-3 border-r border-stone-200 text-center">Shift Utilisation (U%)</th>
                        <th className="px-4 py-3 text-center">Incentive Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeWorkerData.rows.map((row, idx) => {
                        const isLowUtility = Math.round(row.utility) < 94;
                        return (
                          <tr key={idx} className={`border-b border-stone-100 h-14 hover:bg-stone-50/50 transition-colors ${idx % 2 === 0 ? 'bg-white' : 'bg-stone-50/20'}`}>
                            <td style={{ fontSize: '18px' }} className="px-4 py-3 border-r border-stone-100 font-bold text-stone-900 flex items-center gap-1.5">
                              <ChevronRight size={18} className="text-purple-700 shrink-0" />
                              {row.date}
                            </td>
                            <td style={{ fontSize: '18px' }} className="px-4 py-3 border-r border-stone-100 text-center font-bold text-stone-700">{row.shift}</td>
                            <td 
                              style={{ fontSize: '22px', color: isLowUtility ? '#dc2626' : '#6b21a8' }} 
                              className="px-4 py-3 border-r border-stone-100 text-center font-extrabold"
                            >
                              {Math.round(row.utility)}%
                            </td>
                            <td 
                              style={{ fontSize: '22px' }} 
                              className="px-4 py-3 text-center font-black text-purple-900 font-mono"
                            >
                              ₹{Math.round(row.incentive).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    
                    <tfoot>
                      <tr className="bg-purple-950 text-white font-black">
                        <td colSpan={3} className="px-4 py-5 rounded-bl-3xl uppercase text-[16px] tracking-widest text-right border-r border-purple-900">
                          GRAND TOTAL EARNED:
                        </td>
                        <td className="px-4 py-5 rounded-br-3xl text-center font-mono text-[24px] text-amber-300">
                          ₹{Math.round(activeWorkerData.total).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
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
