import React, { useState, useMemo, useEffect } from 'react';
import { DailyReport, Sider, Shift, ProductionEntry } from '../types';
import { Calendar, User, Printer, Tv, Monitor, ChevronRight, Activity, Wrench, Plus, Edit3, Save, X, AlertCircle } from 'lucide-react';
import { parseUniversalDateParts, parseUniversalDate } from '../lib/utils';

interface FitterMonthlyPerformanceProps {
  history: DailyReport[];
  workers: Sider[];
  isTvMode?: boolean;
  month?: number;
  year?: number;
  onUpdateReport?: (updatedReport: DailyReport) => void;
}

interface FitterDailyPerformanceRow {
  date: string;
  idlePercent: number;
  slipPercent: number;
  roguePercent: number;
  dayUtilization: number;
  shiftsLogged: number;
}

export const FitterMonthlyPerformance: React.FC<FitterMonthlyPerformanceProps> = ({
  history,
  workers,
  isTvMode: appIsTvMode = false,
  month,
  year,
  onUpdateReport
}) => {
  const [localTvMode, setLocalTvMode] = useState<boolean>(false);
  const activeTv = appIsTvMode || localTvMode;

  const today = new Date();
  const currentMonthNum = today.getMonth() + 1;
  const currentYearNum = today.getFullYear();

  const [selectedMonth, setSelectedMonth] = useState<number>(month || currentMonthNum);
  const [selectedYear, setSelectedYear] = useState<number>(year || 2026);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('ALL');

  // State for manual metric entry / editing
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{
    date: string;
    idlePercent: number;
    slipPercent: number;
    roguePercent: number;
    dayUtilization: number;
  }>({
    date: '',
    idlePercent: 0,
    slipPercent: 0,
    roguePercent: 0,
    dayUtilization: 0
  });

  useEffect(() => {
    if (month) setSelectedMonth(month);
  }, [month]);

  useEffect(() => {
    if (year) setSelectedYear(year);
  }, [year]);

  const monthOptions = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const fitterWorkers = useMemo(() => {
    const list = workers.filter(w => w.department === 'Fitter' || (w.department && w.department.toLowerCase().includes('fitter')));
    return list.length > 0 ? list : workers;
  }, [workers]);

  const { fromDate, toDate } = useMemo(() => {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    return {
      fromDate: `${selectedYear}-${pad(selectedMonth)}-${pad(firstDay.getDate())}`,
      toDate: `${selectedYear}-${pad(selectedMonth)}-${pad(lastDay.getDate())}`
    };
  }, [selectedMonth, selectedYear]);

  // Aggregate fitter performance data for a selected fitter or overall fitters
  const getFitterMonthlyRows = (workerId: string): { rows: FitterDailyPerformanceRow[]; avgIdle: number; avgSlip: number; avgRogue: number; avgUtil: number } => {
    const rows: FitterDailyPerformanceRow[] = [];

    const targetWorker = workerId !== 'ALL' ? workers.find(w => w.id === workerId || w.tNo === workerId) : null;

    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;

      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;

      if (rDateStr < fromDate || rDateStr > toDate) return;

      // All reports in date range are included for Fitter performance monitoring
      let shiftsWorked = 3;

      // Extract entries for this report
      const entries = report.entries || [];
      const validIdle = entries.filter(e => typeof e.idlePercent === 'number' && !isNaN(e.idlePercent));
      const validSlip = entries.filter(e => typeof e.slipPercent === 'number' && !isNaN(e.slipPercent));
      const validRogue = entries.filter(e => typeof e.worstPercent === 'number' && !isNaN(e.worstPercent));
      const validUtil = entries.filter(e => typeof e.utility === 'number' && !isNaN(e.utility) && e.utility > 0);

      const idle = validIdle.length > 0 ? validIdle.reduce((s, e) => s + (e.idlePercent || 0), 0) / validIdle.length : 0;
      const slip = validSlip.length > 0 ? validSlip.reduce((s, e) => s + (e.slipPercent || 0), 0) / validSlip.length : 0;
      const rogue = validRogue.length > 0 ? validRogue.reduce((s, e) => s + (e.worstPercent || 0), 0) / validRogue.length : 0;
      const util = validUtil.length > 0 ? validUtil.reduce((s, e) => s + (e.utility || 0), 0) / validUtil.length : 0;

      rows.push({
        date: report.date,
        idlePercent: Number(idle.toFixed(2)),
        slipPercent: Number(slip.toFixed(2)),
        roguePercent: Number(rogue.toFixed(2)),
        dayUtilization: Number(util.toFixed(2)),
        shiftsLogged: shiftsWorked
      });
    });

    // Sort rows by Date ascending
    const sorted = rows.sort((a, b) => {
      return parseUniversalDate(a.date).getTime() - parseUniversalDate(b.date).getTime();
    });

    // Limit to the last 15 days
    const last15Rows = sorted.slice(-15);

    const count = last15Rows.length;
    const avgIdle = count > 0 ? last15Rows.reduce((a, b) => a + b.idlePercent, 0) / count : 0;
    const avgSlip = count > 0 ? last15Rows.reduce((a, b) => a + b.slipPercent, 0) / count : 0;
    const avgRogue = count > 0 ? last15Rows.reduce((a, b) => a + b.roguePercent, 0) / count : 0;
    const avgUtil = count > 0 ? last15Rows.reduce((a, b) => a + b.dayUtilization, 0) / count : 0;

    return {
      rows: last15Rows,
      avgIdle: Number(avgIdle.toFixed(2)),
      avgSlip: Number(avgSlip.toFixed(2)),
      avgRogue: Number(avgRogue.toFixed(2)),
      avgUtil: Number(avgUtil.toFixed(2))
    };
  };

  const activeWorkersWithData = useMemo(() => {
    return fitterWorkers.map(w => {
      const data = getFitterMonthlyRows(w.id);
      return {
        worker: w,
        ...data,
        workingDays: data.rows.length
      };
    }).filter(item => item.workingDays > 0);
  }, [fitterWorkers, history, fromDate, toDate]);

  const activeData = useMemo(() => {
    return getFitterMonthlyRows(selectedWorkerId);
  }, [selectedWorkerId, history, fromDate, toDate]);

  const selectedWorkerObj = useMemo(() => {
    return workers.find(w => w.id === selectedWorkerId);
  }, [selectedWorkerId, workers]);

  // TV mode index rotation
  const [tvWorkerIndex, setTvWorkerIndex] = useState<number>(0);

  useEffect(() => {
    if (!activeTv || activeWorkersWithData.length <= 1) return;
    const timer = setInterval(() => {
      setTvWorkerIndex(prev => (prev + 1) % activeWorkersWithData.length);
    }, 15000);
    return () => clearInterval(timer);
  }, [activeTv, activeWorkersWithData.length]);

  const currentTvWorker = activeWorkersWithData[tvWorkerIndex] || null;

  // Handle saving edited metrics for a specific report date
  const handleSaveMetrics = () => {
    if (!editingDate) return;
    const existingReport = history.find(r => r.date === editingDate);
    if (!existingReport) return;

    // Update all entries on this report with the new idle %, slip %, rogue %, utility
    const updatedEntries: ProductionEntry[] = (existingReport.entries || []).map(e => ({
      ...e,
      idlePercent: editForm.idlePercent,
      slipPercent: editForm.slipPercent,
      worstPercent: editForm.roguePercent,
      utility: editForm.dayUtilization > 0 ? editForm.dayUtilization : e.utility
    }));

    const updatedSummaries = (existingReport.summaries || []).map(s => ({
      ...s,
      avgUtil: editForm.dayUtilization > 0 ? editForm.dayUtilization : s.avgUtil,
      shiftIdle: { I: editForm.idlePercent, II: editForm.idlePercent, III: editForm.idlePercent },
      shiftSlip: { I: editForm.slipPercent, II: editForm.slipPercent, III: editForm.slipPercent },
      shiftWorst: { I: editForm.roguePercent, II: editForm.roguePercent, III: editForm.roguePercent }
    }));

    const updatedReport: DailyReport = {
      ...existingReport,
      entries: updatedEntries,
      summaries: updatedSummaries,
      timestamp: Date.now()
    };

    if (onUpdateReport) {
      onUpdateReport(updatedReport);
    }
    setEditingDate(null);
  };

  const startEditing = (row: FitterDailyPerformanceRow) => {
    setEditingDate(row.date);
    setEditForm({
      date: row.date,
      idlePercent: row.idlePercent,
      slipPercent: row.slipPercent,
      roguePercent: row.roguePercent,
      dayUtilization: row.dayUtilization
    });
  };

  return (
    <div className="bg-stone-50 min-h-screen text-stone-900 pb-16">
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-6 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black keep-size">KTTM SPINNING MILLS - UNIT 01</h1>
        <h2 className="text-base font-extrabold uppercase tracking-wider text-black keep-size mt-0.5">Fitter Maintenance & Monthly Performance Ledger</h2>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Department: <strong>Maintenance & Fitting</strong></span>
          <span>Status: <strong>Official Monthly Statement</strong></span>
        </div>
      </div>

      {/* HEADER SECTION */}
      {!activeTv && (
        <div className="bg-white border-b border-stone-250 p-6 no-print shadow-sm">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <span className="text-blue-700 font-extrabold uppercase text-xs tracking-wider flex items-center gap-1.5">
                <Wrench size={14} className="animate-pulse" /> Fitter Maintenance & Performance Ledger
              </span>
              <h1 className="text-4xl font-serif italic text-stone-900 font-black tracking-tight mt-1">
                Fitter Monthly Performance
              </h1>
            </div>

            <div className="flex items-center gap-3 self-end md:self-auto">
              <button
                onClick={() => setLocalTvMode(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-700 hover:bg-blue-900 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-sm transition-all cursor-pointer"
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
              <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
                <Calendar size={18} />
              </div>
              <div className="flex-1 md:flex-initial flex gap-2">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  className="px-3 py-2 border-2 border-stone-200 focus:border-stone-400 rounded-xl font-bold text-stone-800 text-sm outline-none cursor-pointer"
                >
                  {monthOptions.map(m => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
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
                <div className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
                  <User size={18} />
                </div>
                <span className="font-bold text-stone-600 text-xs uppercase tracking-wider">Select Fitter:</span>
              </div>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="w-full px-4 py-2 border-2 border-stone-200 focus:border-stone-400 rounded-xl font-black text-stone-900 text-sm outline-none uppercase tracking-wide cursor-pointer bg-white"
              >
                <option value="ALL">ALL FITTERS (Overall Plant Average)</option>
                {fitterWorkers.map(w => (
                  <option key={w.id} value={w.id}>
                    [{w.tNo}] {w.name.toUpperCase()} {w.department ? `(${w.department})` : ''}
                  </option>
                ))}
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
              <span className="bg-blue-800 text-white font-extrabold text-[10px] uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1">
                <Monitor size={12} className="shrink-0" /> FITTER MONITORING TV SLIDE
              </span>
              <h2 className="text-4xl font-black italic tracking-wide text-stone-900 uppercase mt-2">
                Fitter Monthly Performance
              </h2>
            </div>
            
            <div className="text-right flex items-center gap-4">
              <div className="bg-white border rounded-2xl p-2.5 px-4 shadow-sm">
                <p className="text-[10px] text-stone-500 uppercase tracking-widest font-bold">Display Period</p>
                <p className="text-xl font-extrabold text-stone-900 uppercase italic">
                  {monthOptions.find(m => m.value === selectedMonth)?.label} {selectedYear}
                </p>
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

          <div className="max-w-[98%] mx-auto w-full">
            {currentTvWorker && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
                {/* Left Column: Fitter Card */}
                <div className="xl:col-span-4 bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-md flex flex-col items-center text-center relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-2 bg-blue-700" />
                  
                  {currentTvWorker.worker.photoUrl ? (
                    <img 
                      src={currentTvWorker.worker.photoUrl} 
                      alt={currentTvWorker.worker.name}
                      className="w-88 h-88 rounded-[2.5rem] object-cover ring-[12px] ring-blue-50 border-4 border-blue-500 shadow-lg mb-6"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-88 h-88 rounded-[2.5rem] bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800 font-serif italic text-[9rem] font-black mb-6 shadow-md">
                      {currentTvWorker.worker.name.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <span className="bg-blue-900 text-white font-extrabold text-[14px] px-4 py-1.5 rounded-full uppercase tracking-wider">
                    TICKET NO: {currentTvWorker.worker.tNo}
                  </span>

                  <h2 className="text-4xl font-serif italic font-black text-stone-900 uppercase mt-4 leading-tight">
                    {currentTvWorker.worker.name}
                  </h2>
                  
                  <p className="text-sm font-black text-blue-600 uppercase tracking-widest mt-1">
                    Designation: Fitter
                  </p>

                  <div className="w-full border-t border-stone-150 my-6" />

                  <div className="w-full grid grid-cols-2 gap-4">
                    <div className="bg-stone-50 p-4 rounded-2xl flex flex-col items-center">
                      <span className="text-[13px] text-stone-500 uppercase font-bold tracking-wider">Idle %</span>
                      <span className="text-3xl font-black text-amber-700 mt-1">{currentTvWorker.avgIdle}%</span>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl flex flex-col items-center">
                      <span className="text-[13px] text-stone-500 uppercase font-bold tracking-wider">Slip %</span>
                      <span className="text-3xl font-black text-purple-700 mt-1">{currentTvWorker.avgSlip}%</span>
                    </div>
                    <div className="bg-stone-50 p-4 rounded-2xl flex flex-col items-center">
                      <span className="text-[13px] text-stone-500 uppercase font-bold tracking-wider">Rogue %</span>
                      <span className="text-3xl font-black text-red-700 mt-1">{currentTvWorker.avgRogue}%</span>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-2xl flex flex-col items-center">
                      <span className="text-[13px] text-stone-500 uppercase font-bold tracking-wider">Day Utilisation</span>
                      <span className="text-3xl font-black text-blue-950 mt-1">{currentTvWorker.avgUtil}%</span>
                    </div>
                  </div>
                </div>

                {/* Right Column: Table matching Excel screenshot */}
                <div className="xl:col-span-8 bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-md">
                  <div className="flex items-center justify-between pb-6 border-b border-stone-150 mb-6 font-extrabold">
                    <h3 className="text-2xl font-extrabold text-stone-900 uppercase tracking-tight flex items-center gap-2">
                      <Activity size={24} className="text-blue-700 shrink-0" /> Fitter Performance Table
                    </h3>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse border border-stone-400">
                      <thead>
                        <tr className="bg-stone-200 text-stone-900 font-black uppercase tracking-wider text-[18px] border-b-2 border-stone-900">
                          <th className="px-6 py-4 border-r border-stone-400 text-center">Date</th>
                          <th className="px-6 py-4 border-r border-stone-400 text-center">Average of IDLE%</th>
                          <th className="px-6 py-4 border-r border-stone-400 text-center">Average of SLIP%</th>
                          <th className="px-6 py-4 border-r border-stone-400 text-center">Average of WORST% (Rougue %)</th>
                          <th className="px-6 py-4 text-center">Day Utilisation (U%)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentTvWorker.rows.map((row, idx) => (
                          <tr key={idx} className={`border-b border-stone-300 ${idx % 2 === 0 ? 'bg-stone-100/60' : 'bg-stone-200/40'}`}>
                            <td className="px-6 py-3 border-r border-stone-300 font-black text-stone-900 text-center text-[18px]">
                              {row.date}
                            </td>
                            <td className="px-6 py-3 border-r border-stone-300 text-center font-bold text-amber-800 text-[18px]">
                              {row.idlePercent}%
                            </td>
                            <td className="px-6 py-3 border-r border-stone-300 text-center font-bold text-purple-800 text-[18px]">
                              {row.slipPercent}%
                            </td>
                            <td className="px-6 py-3 border-r border-stone-300 text-center font-bold text-red-700 text-[18px]">
                              {row.roguePercent}%
                            </td>
                            <td className="px-6 py-3 text-center font-black text-blue-900 text-[20px]">
                              {row.dayUtilization}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-stone-900 text-white font-black text-[20px]">
                          <td className="px-6 py-4 border-r border-stone-700 text-center">AVERAGE</td>
                          <td className="px-6 py-4 border-r border-stone-700 text-center text-amber-300">{currentTvWorker.avgIdle}%</td>
                          <td className="px-6 py-4 border-r border-stone-700 text-center text-purple-300">{currentTvWorker.avgSlip}%</td>
                          <td className="px-6 py-4 border-r border-stone-700 text-center text-red-300">{currentTvWorker.avgRogue}%</td>
                          <td className="px-6 py-4 text-center text-blue-300">{currentTvWorker.avgUtil}%</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* STANDARD VIEW */
        <div className="max-w-7xl mx-auto px-6 mt-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-700 flex items-center justify-center font-black">
                <Activity size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400 tracking-widest">Avg Idle %</p>
                <p className="text-3xl font-black text-amber-700 mt-0.5">{activeData.avgIdle}%</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-black">
                <Activity size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400 tracking-widest">Avg Slip %</p>
                <p className="text-3xl font-black text-purple-700 mt-0.5">{activeData.avgSlip}%</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-red-50 text-red-700 flex items-center justify-center font-black">
                <AlertCircle size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400 tracking-widest">Avg Rogue %</p>
                <p className="text-3xl font-black text-red-700 mt-0.5">{activeData.avgRogue}%</p>
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-stone-200 shadow-sm flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-black">
                <Wrench size={24} />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase text-stone-400 tracking-widest">Avg Day Utilisation</p>
                <p className="text-3xl font-black text-blue-900 mt-0.5">{activeData.avgUtil}%</p>
              </div>
            </div>
          </div>

          {/* Table matched to user Excel screenshot */}
          <div className="bg-white rounded-[2.5rem] border border-stone-200 p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-stone-200 mb-6">
              <div>
                <h3 className="text-2xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
                  <Wrench size={24} className="text-blue-700" />
                  {selectedWorkerObj ? `${selectedWorkerObj.name.toUpperCase()} (${selectedWorkerObj.tNo})` : 'All Fitters'} - Daily Performance Ledger
                </h3>
                <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mt-1">
                  Monthly performance monitoring table with Idle %, Slip %, Rogue % and Day Utilisation
                </p>
              </div>
            </div>

            {/* EDITING FORM MODAL / PANEL */}
            {editingDate && (
              <div className="mb-8 p-6 bg-blue-50/70 border-2 border-blue-200 rounded-3xl space-y-4 animate-in fade-in duration-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-black uppercase text-blue-900 flex items-center gap-2">
                    <Edit3 size={16} /> Edit Fitter Metrics for Date: {editingDate}
                  </h4>
                  <button onClick={() => setEditingDate(null)} className="text-stone-400 hover:text-stone-700">
                    <X size={18} />
                  </button>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-stone-600 block mb-1">Idle %</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      className="w-full bg-white border border-stone-300 rounded-xl px-4 py-2 font-bold text-sm outline-none focus:border-blue-500"
                      value={editForm.idlePercent}
                      onChange={(e) => setEditForm(prev => ({ ...prev, idlePercent: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-stone-600 block mb-1">Slip %</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      className="w-full bg-white border border-stone-300 rounded-xl px-4 py-2 font-bold text-sm outline-none focus:border-blue-500"
                      value={editForm.slipPercent}
                      onChange={(e) => setEditForm(prev => ({ ...prev, slipPercent: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-stone-600 block mb-1">Rogue %</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      className="w-full bg-white border border-stone-300 rounded-xl px-4 py-2 font-bold text-sm outline-none focus:border-blue-500"
                      value={editForm.roguePercent}
                      onChange={(e) => setEditForm(prev => ({ ...prev, roguePercent: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-wider text-stone-600 block mb-1">Day Utilisation (U%)</label>
                    <input 
                      type="number" 
                      step="0.01" 
                      className="w-full bg-white border border-stone-300 rounded-xl px-4 py-2 font-bold text-sm outline-none focus:border-blue-500"
                      value={editForm.dayUtilization}
                      onChange={(e) => setEditForm(prev => ({ ...prev, dayUtilization: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button 
                    onClick={() => setEditingDate(null)}
                    className="px-5 py-2.5 bg-stone-200 text-stone-700 text-xs font-black uppercase tracking-wider rounded-xl hover:bg-stone-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleSaveMetrics}
                    className="px-5 py-2.5 bg-blue-600 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-blue-700 flex items-center gap-1.5 cursor-pointer"
                  >
                    <Save size={14} /> Save Metrics
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              {/* Exact format from the user's Excel sheet */}
              <table className="w-full text-left border-collapse border-2 border-stone-800 font-sans">
                <thead>
                  <tr className="bg-stone-300 text-stone-900 font-black uppercase text-center text-sm border-b-2 border-stone-800">
                    <th className="px-6 py-3.5 border-r-2 border-stone-800">Date</th>
                    <th className="px-6 py-3.5 border-r-2 border-stone-800">Average of IDLE%</th>
                    <th className="px-6 py-3.5 border-r-2 border-stone-800">Average of SLIP%</th>
                    <th className="px-6 py-3.5 border-r-2 border-stone-800">Average of WORST% (Rougue %)</th>
                    <th className="px-6 py-3.5 border-r-2 border-stone-800">Day Utilisation (U%)</th>
                    <th className="px-4 py-3.5 no-print w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {activeData.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-stone-400 font-bold uppercase tracking-wider">
                        No report entries found for {monthOptions.find(m => m.value === selectedMonth)?.label} {selectedYear}
                      </td>
                    </tr>
                  ) : (
                    activeData.rows.map((row, idx) => (
                      <tr key={idx} className={`border-b border-stone-400 hover:bg-blue-50/40 transition-colors ${idx % 2 === 0 ? 'bg-stone-200/50' : 'bg-stone-100/50'}`}>
                        <td className="px-6 py-3 border-r-2 border-stone-800 font-bold text-stone-900 text-center">
                          {row.date}
                        </td>
                        <td className="px-6 py-3 border-r-2 border-stone-800 text-center font-bold text-stone-900">
                          {row.idlePercent}%
                        </td>
                        <td className="px-6 py-3 border-r-2 border-stone-800 text-center font-bold text-stone-900">
                          {row.slipPercent}%
                        </td>
                        <td className="px-6 py-3 border-r-2 border-stone-800 text-center font-bold text-stone-900">
                          {row.roguePercent}%
                        </td>
                        <td className="px-6 py-3 border-r-2 border-stone-800 text-center font-black text-stone-900 text-base">
                          {row.dayUtilization}%
                        </td>
                        <td className="px-4 py-3 text-center no-print">
                          <button
                            onClick={() => startEditing(row)}
                            className="p-1.5 text-stone-500 hover:text-blue-700 hover:bg-blue-100 rounded-lg transition-all cursor-pointer"
                            title="Edit Idle%, Slip%, Rogue%, Utilisation"
                          >
                            <Edit3 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {activeData.rows.length > 0 && (
                  <tfoot>
                    <tr className="bg-stone-800 text-white font-black uppercase text-sm">
                      <td className="px-6 py-4 border-r-2 border-stone-700 text-center">AVERAGE</td>
                      <td className="px-6 py-4 border-r-2 border-stone-700 text-center text-amber-300">{activeData.avgIdle}%</td>
                      <td className="px-6 py-4 border-r-2 border-stone-700 text-center text-purple-300">{activeData.avgSlip}%</td>
                      <td className="px-6 py-4 border-r-2 border-stone-700 text-center text-red-300">{activeData.avgRogue}%</td>
                      <td className="px-6 py-4 border-r-2 border-stone-700 text-center text-blue-300 text-base">{activeData.avgUtil}%</td>
                      <td className="no-print"></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
