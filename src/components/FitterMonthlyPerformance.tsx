import React, { useState, useMemo, useEffect } from 'react';
import { DailyReport, Sider, Shift, ProductionEntry } from '../types';
import { Calendar, User, Printer, Tv, Monitor, ChevronRight, Activity, Wrench, Edit3, Save, X, Percent, AlertCircle } from 'lucide-react';
import { parseUniversalDateParts, parseUniversalDate, cn } from '../lib/utils';
import { CalendarMonthPicker } from './CalendarPickers';

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
  const [selectedYear, setSelectedYear] = useState<number>(year || currentYearNum);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('ALL');
  const [isPrintingAll, setIsPrintingAll] = useState<boolean>(false);

  useEffect(() => {
    if (isPrintingAll) {
      const timer = setTimeout(() => {
        window.print();
        setIsPrintingAll(false);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isPrintingAll]);

  const formatDisplayDate = (d: string) => {
    const p = parseUniversalDateParts(d);
    if (!p) return d;
    return `${p.day.toString().padStart(2, '0')}/${p.month.toString().padStart(2, '0')}/${p.year}`;
  };

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

  // Aggregate fitter performance data
  const getFitterMonthlyRows = (workerId: string): { rows: FitterDailyPerformanceRow[]; avgIdle: number; avgSlip: number; avgRogue: number; avgUtil: number } => {
    // 1. Group valid active reports by date
    const dateMap = new Map<string, DailyReport[]>();

    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;

      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;

      if (rDateStr < fromDate || rDateStr > toDate) return;

      const entries = report.entries || [];
      // Filter out blank placeholder reports that have zero production and no logged telemetry
      const hasActualActivity = (report.totalProductionActual && report.totalProductionActual > 0) ||
        (report.totalProductionTarget && report.totalProductionTarget > 0) ||
        entries.some(e => (e.productionActual || 0) > 0 || (e.utility || 0) > 0 || (e.idlePercent || 0) > 0 || (e.slipPercent || 0) > 0);

      if (!hasActualActivity) return;

      if (!dateMap.has(report.date)) {
        dateMap.set(report.date, []);
      }
      dateMap.get(report.date)!.push(report);
    });

    const rows: FitterDailyPerformanceRow[] = [];

    dateMap.forEach((reportsForDate, date) => {
      let shiftsWorked = 3;

      // If a specific fitter is selected, check if they worked on this date
      if (workerId !== 'ALL') {
        const shiftsPresent = new Set<Shift>();
        reportsForDate.forEach(report => {
          (['I', 'II', 'III'] as Shift[]).forEach(shift => {
            if ((report.fitters?.[shift] || []).includes(workerId)) {
              shiftsPresent.add(shift);
            }
          });
          (report.entries || []).forEach(e => {
            if (e.siderId === workerId || (e.siderIds && e.siderIds.includes(workerId))) {
              shiftsPresent.add(e.shift);
            }
          });
        });

        if (shiftsPresent.size === 0) {
          // Fitter was not on duty on this date
          return;
        }
        shiftsWorked = shiftsPresent.size;
      }

      // Collect all entries across the reports for this date
      const allEntries: ProductionEntry[] = [];
      reportsForDate.forEach(r => {
        if (r.entries) allEntries.push(...r.entries);
      });

      const validIdle = allEntries.filter(e => typeof e.idlePercent === 'number' && !isNaN(e.idlePercent) && e.idlePercent > 0);
      const validSlip = allEntries.filter(e => typeof e.slipPercent === 'number' && !isNaN(e.slipPercent) && e.slipPercent > 0);
      const validRogue = allEntries.filter(e => typeof e.worstPercent === 'number' && !isNaN(e.worstPercent) && e.worstPercent > 0);
      const validUtil = allEntries.filter(e => typeof e.utility === 'number' && !isNaN(e.utility) && e.utility > 0);

      const allWithIdle = allEntries.filter(e => typeof e.idlePercent === 'number' && !isNaN(e.idlePercent));
      const allWithSlip = allEntries.filter(e => typeof e.slipPercent === 'number' && !isNaN(e.slipPercent));
      const allWithRogue = allEntries.filter(e => typeof e.worstPercent === 'number' && !isNaN(e.worstPercent));

      const idle = validIdle.length > 0
        ? validIdle.reduce((s, e) => s + (e.idlePercent || 0), 0) / validIdle.length
        : (allWithIdle.length > 0 ? allWithIdle.reduce((s, e) => s + (e.idlePercent || 0), 0) / allWithIdle.length : 0);

      const slip = validSlip.length > 0
        ? validSlip.reduce((s, e) => s + (e.slipPercent || 0), 0) / validSlip.length
        : (allWithSlip.length > 0 ? allWithSlip.reduce((s, e) => s + (e.slipPercent || 0), 0) / allWithSlip.length : 0);

      const rogue = validRogue.length > 0
        ? validRogue.reduce((s, e) => s + (e.worstPercent || 0), 0) / validRogue.length
        : (allWithRogue.length > 0 ? allWithRogue.reduce((s, e) => s + (e.worstPercent || 0), 0) / allWithRogue.length : 0);

      const util = validUtil.length > 0
        ? validUtil.reduce((s, e) => s + (e.utility || 0), 0) / validUtil.length
        : 0;

      rows.push({
        date,
        idlePercent: Number(idle.toFixed(2)),
        slipPercent: Number(slip.toFixed(2)),
        roguePercent: Number(rogue.toFixed(2)),
        dayUtilization: Number(util.toFixed(2)),
        shiftsLogged: shiftsWorked
      });
    });

    const sorted = rows.sort((a, b) => {
      return parseUniversalDate(a.date).getTime() - parseUniversalDate(b.date).getTime();
    });

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

  const activeData = useMemo(() => {
    return getFitterMonthlyRows(selectedWorkerId);
  }, [selectedWorkerId, history, fromDate, toDate]);

  const selectedWorkerObj = useMemo(() => {
    return workers.find(w => w.id === selectedWorkerId);
  }, [selectedWorkerId, workers]);

  const reportMonthYear = useMemo(() => {
    return new Date(selectedYear, selectedMonth - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [selectedMonth, selectedYear]);

  // Handle saving edited metrics
  const handleSaveMetrics = () => {
    if (!editingDate) return;
    const existingReport = history.find(r => r.date === editingDate);
    if (!existingReport) return;

    const updatedEntries: ProductionEntry[] = (existingReport.entries || []).map(e => ({
      ...e,
      idlePercent: editForm.idlePercent,
      slipPercent: editForm.slipPercent,
      worstPercent: editForm.roguePercent,
      utility: editForm.dayUtilization > 0 ? editForm.dayUtilization : e.utility
    }));

    const updatedReport: DailyReport = {
      ...existingReport,
      entries: updatedEntries
    };

    onUpdateReport?.(updatedReport);
    setEditingDate(null);
  };

  return (
    <div className={cn("space-y-4 animate-in fade-in duration-500", isPrintingAll && "print:hidden")}>
      {/* FILTER CONTROLS PANEL */}
      {!activeTv && (
        <div className="bg-white rounded-2xl border border-stone-200/90 p-4 md:p-5 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4 no-print">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            <CalendarMonthPicker
              month={selectedMonth}
              year={selectedYear}
              onChange={(m, y) => {
                setSelectedMonth(m);
                setSelectedYear(y);
              }}
            />

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-stone-400">Fitter:</span>
              <select
                value={selectedWorkerId}
                onChange={(e) => setSelectedWorkerId(e.target.value)}
                className="px-3 py-1.5 border border-stone-200 rounded-xl font-bold text-stone-800 text-xs bg-stone-50 outline-none cursor-pointer focus:border-blue-500 transition-colors max-w-[260px] truncate"
              >
                <option value="ALL">ALL FITTERS (Plant-Wide Average)</option>
                {fitterWorkers.map(w => (
                  <option key={w.id} value={w.id}>
                    [{w.tNo}] {w.name.toUpperCase()} {w.department ? `(${w.department})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={() => setLocalTvMode(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl text-xs font-bold border border-stone-200 cursor-pointer transition-all"
            >
              <Monitor size={13} />
              <span>Full Screen</span>
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
            >
              <Printer size={13} />
              <span>Print Report</span>
            </button>
            <button
              onClick={() => setIsPrintingAll(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer active:scale-95"
              title="Print Mill Summary + All Individual Fitter Performance Records"
            >
              <Printer size={13} />
              <span>Print All Fitters</span>
            </button>
          </div>
        </div>
      )}

      {/* KPI METRICS CARDS */}
      <div className={cn(
        "grid grid-cols-2 md:grid-cols-4 no-print",
        activeTv ? "gap-5 mb-5" : "gap-3"
      )}>
        <div className={cn(
          "bg-white rounded-2xl border border-stone-200/90 shadow-2xs flex items-center",
          activeTv ? "p-5 md:p-6 rounded-3xl gap-4" : "p-3.5 gap-3"
        )}>
          <div className={cn(
            "rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0",
            activeTv ? "w-14 h-14 rounded-2xl" : "w-9 h-9"
          )}>
            <Percent size={activeTv ? 26 : 16} />
          </div>
          <div>
            <p className={cn("font-black uppercase tracking-wider text-stone-400 leading-none", activeTv ? "text-xs md:text-sm" : "text-[10px]")}>Plant Utilisation</p>
            <p className={cn("font-black text-blue-900 tabular-nums mt-1", activeTv ? "text-3xl md:text-4xl lg:text-5xl" : "text-lg")}>{activeData.avgUtil}%</p>
          </div>
        </div>

        <div className={cn(
          "bg-white rounded-2xl border border-stone-200/90 shadow-2xs flex items-center",
          activeTv ? "p-5 md:p-6 rounded-3xl gap-4" : "p-3.5 gap-3"
        )}>
          <div className={cn(
            "rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0",
            activeTv ? "w-14 h-14 rounded-2xl" : "w-9 h-9"
          )}>
            <Activity size={activeTv ? 26 : 16} />
          </div>
          <div>
            <p className={cn("font-black uppercase tracking-wider text-stone-400 leading-none", activeTv ? "text-xs md:text-sm" : "text-[10px]")}>Average Slip %</p>
            <p className={cn("font-black text-amber-900 tabular-nums mt-1", activeTv ? "text-3xl md:text-4xl lg:text-5xl" : "text-lg")}>{activeData.avgSlip}%</p>
          </div>
        </div>

        <div className={cn(
          "bg-white rounded-2xl border border-stone-200/90 shadow-2xs flex items-center",
          activeTv ? "p-5 md:p-6 rounded-3xl gap-4" : "p-3.5 gap-3"
        )}>
          <div className={cn(
            "rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0",
            activeTv ? "w-14 h-14 rounded-2xl" : "w-9 h-9"
          )}>
            <AlertCircle size={activeTv ? 26 : 16} />
          </div>
          <div>
            <p className={cn("font-black uppercase tracking-wider text-stone-400 leading-none", activeTv ? "text-xs md:text-sm" : "text-[10px]")}>Average Idle %</p>
            <p className={cn("font-black text-rose-900 tabular-nums mt-1", activeTv ? "text-3xl md:text-4xl lg:text-5xl" : "text-lg")}>{activeData.avgIdle}%</p>
          </div>
        </div>

        <div className={cn(
          "bg-white rounded-2xl border border-stone-200/90 shadow-2xs flex items-center",
          activeTv ? "p-5 md:p-6 rounded-3xl gap-4" : "p-3.5 gap-3"
        )}>
          <div className={cn(
            "rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0",
            activeTv ? "w-14 h-14 rounded-2xl" : "w-9 h-9"
          )}>
            <Wrench size={activeTv ? 26 : 16} />
          </div>
          <div>
            <p className={cn("font-black uppercase tracking-wider text-stone-400 leading-none", activeTv ? "text-xs md:text-sm" : "text-[10px]")}>Average Rogue %</p>
            <p className={cn("font-black text-purple-900 tabular-nums mt-1", activeTv ? "text-3xl md:text-4xl lg:text-5xl" : "text-lg")}>{activeData.avgRogue}%</p>
          </div>
        </div>
      </div>

      {/* EDIT MODAL */}
      {editingDate && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-xl max-w-md w-full p-5 space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h4 className="text-sm font-black uppercase text-stone-900">Update Mechanical Telemetry</h4>
                <p className="text-[10px] text-stone-400 font-bold uppercase">{editingDate}</p>
              </div>
              <button
                onClick={() => setEditingDate(null)}
                className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">Slip %</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.slipPercent}
                  onChange={e => setEditForm(f => ({ ...f, slipPercent: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 border border-stone-200 rounded-xl font-bold text-stone-900 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">Idle %</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.idlePercent}
                  onChange={e => setEditForm(f => ({ ...f, idlePercent: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 border border-stone-200 rounded-xl font-bold text-stone-900 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">Rogue %</label>
                <input
                  type="number"
                  step="0.01"
                  value={editForm.roguePercent}
                  onChange={e => setEditForm(f => ({ ...f, roguePercent: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 border border-stone-200 rounded-xl font-bold text-stone-900 outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase text-stone-400 mb-1">Utilisation (U%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editForm.dayUtilization}
                  onChange={e => setEditForm(f => ({ ...f, dayUtilization: parseFloat(e.target.value) || 0 }))}
                  className="w-full px-3 py-1.5 border border-stone-200 rounded-xl font-bold text-stone-900 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <button
                onClick={() => setEditingDate(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-stone-600 hover:bg-stone-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMetrics}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5"
              >
                <Save size={13} />
                <span>Save Metrics</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN LEDGER CARD */}
      <div className={cn(
        "bg-white border border-stone-200/90 shadow-xs overflow-hidden",
        activeTv ? "rounded-3xl" : "rounded-2xl"
      )}>
        <div className={cn(
          "border-b border-stone-100 flex items-center justify-between",
          activeTv ? "p-6" : "p-4"
        )}>
          <div>
            <h3 className={cn("font-black uppercase tracking-tight text-stone-900 flex items-center gap-2", activeTv ? "text-xl md:text-2xl" : "text-xs")}>
              <Wrench size={activeTv ? 24 : 14} className="text-blue-600" />
              <span>Fitter Mechanical Diagnostics Ledger</span>
            </h3>
            <p className={cn("text-stone-400 font-bold uppercase tracking-wider mt-1", activeTv ? "text-xs md:text-sm" : "text-[10px]")}>
              {reportMonthYear} • {selectedWorkerObj ? `${selectedWorkerObj.name} [${selectedWorkerObj.tNo}]` : 'All Plant Fitters'}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[60vh]">
          <table className={cn("w-full text-left border-collapse", activeTv ? "text-lg md:text-xl" : "text-xs")}>
            <thead>
              <tr className={cn(
                "bg-stone-50 text-stone-700 uppercase tracking-wider font-black border-b border-stone-200 sticky top-0 z-10",
                activeTv ? "h-14 text-base md:text-lg" : "h-9 text-[10px]"
              )}>
                <th className={activeTv ? "px-6 py-3" : "px-4 py-1"}>Date</th>
                <th className={cn("text-center", activeTv ? "px-6 py-3" : "px-4 py-1")}>Shifts Logged</th>
                <th className={cn("text-center", activeTv ? "px-6 py-3" : "px-4 py-1")}>Utilisation (U%)</th>
                <th className={cn("text-center", activeTv ? "px-6 py-3" : "px-4 py-1")}>Slip %</th>
                <th className={cn("text-center", activeTv ? "px-6 py-3" : "px-4 py-1")}>Idle %</th>
                <th className={cn("text-center", activeTv ? "px-6 py-3" : "px-4 py-1")}>Rogue %</th>
                {!activeTv && onUpdateReport && <th className="px-4 py-1 text-center w-20 no-print">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-bold">
              {activeData.rows.map((row) => (
                <tr key={row.date} className={cn("hover:bg-blue-50/20 transition-colors", activeTv ? "h-14" : "h-10")}>
                  <td className={cn("font-black text-stone-900 flex items-center gap-1.5", activeTv ? "px-6 py-3.5" : "px-4 py-1")}>
                    <ChevronRight size={activeTv ? 18 : 13} className="text-blue-600 shrink-0" />
                    <span>{row.date}</span>
                  </td>
                  <td className={cn("text-center font-bold text-stone-500 tabular-nums", activeTv ? "px-6 py-3.5" : "px-4 py-1")}>
                    {row.shiftsLogged} shifts
                  </td>
                  <td className={cn("text-center font-black text-blue-900 tabular-nums", activeTv ? "px-6 py-3.5 text-xl md:text-2xl" : "px-4 py-1")}>
                    {row.dayUtilization}%
                  </td>
                  <td className={cn("text-center font-black text-amber-800 tabular-nums", activeTv ? "px-6 py-3.5 text-xl md:text-2xl" : "px-4 py-1")}>
                    {row.slipPercent}%
                  </td>
                  <td className={cn("text-center font-black text-rose-800 tabular-nums", activeTv ? "px-6 py-3.5 text-xl md:text-2xl" : "px-4 py-1")}>
                    {row.idlePercent}%
                  </td>
                  <td className={cn("text-center font-black text-purple-800 tabular-nums", activeTv ? "px-6 py-3.5 text-xl md:text-2xl" : "px-4 py-1")}>
                    {row.roguePercent}%
                  </td>
                  {!activeTv && onUpdateReport && (
                    <td className="px-4 py-1 text-center no-print">
                      <button
                        onClick={() => {
                          setEditingDate(row.date);
                          setEditForm({
                            date: row.date,
                            idlePercent: row.idlePercent,
                            slipPercent: row.slipPercent,
                            roguePercent: row.roguePercent,
                            dayUtilization: row.dayUtilization
                          });
                        }}
                        className="p-1 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
                        title="Edit Metrics"
                      >
                        <Edit3 size={13} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}

              {activeData.rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400 font-bold uppercase tracking-widest text-xs">
                    No fitter maintenance logs recorded for {reportMonthYear}
                  </td>
                </tr>
              )}
            </tbody>
            {activeData.rows.length > 0 && (
              <tfoot>
                <tr className="bg-stone-50 font-black border-t-2 border-stone-200 h-10 sticky bottom-0 z-10">
                  <td className="px-4 py-2 uppercase tracking-wider text-stone-700 text-xs font-black">
                    Plant Period Average
                  </td>
                  <td className="px-4 py-2 text-center text-stone-400 text-xs">-</td>
                  <td className="px-4 py-2 text-center font-black text-blue-900 tabular-nums">{activeData.avgUtil}%</td>
                  <td className="px-4 py-2 text-center font-black text-amber-900 tabular-nums">{activeData.avgSlip}%</td>
                  <td className="px-4 py-2 text-center font-black text-rose-900 tabular-nums">{activeData.avgIdle}%</td>
                  <td className="px-4 py-2 text-center font-black text-purple-900 tabular-nums">{activeData.avgRogue}%</td>
                  {onUpdateReport && <td className="no-print"></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* PRINT ALL CONTAINER */}
      {isPrintingAll && (
        <div className="print-all-container hidden print:block text-black bg-white font-sans w-full p-0">
          {/* PAGE 1: MILL-WIDE FITTER PERFORMANCE MONTHLY ABSTRACT */}
          <div className="print-page-break p-5 border-2 border-black rounded-lg min-h-[250mm] flex flex-col justify-between mb-8 text-black bg-white">
            <div>
              <div className="text-center pb-2 border-b-2 border-black mb-3">
                <img
                  src="/scm-logo-horizontal.png"
                  alt="SCM Textile Spinners"
                  className="h-9 w-auto max-w-[180px] object-contain mx-auto mb-1.5"
                />
                <h1 className="text-2xl font-black text-black uppercase tracking-tight">Mill-Wide Fitter Monthly Performance Abstract</h1>
                <div className="mt-1 text-[10px] font-black text-stone-600 uppercase tracking-wider flex justify-between items-center px-4">
                  <span>
                    Month: <span className="text-black font-extrabold text-sm">{reportMonthYear}</span>
                  </span>
                  <span className="text-stone-700 font-extrabold">
                    Consolidated Mechanical &amp; Maintenance Performance
                  </span>
                </div>
              </div>

              <table className="w-full text-center border-collapse border border-black mb-3">
                <thead>
                  <tr className="bg-stone-100 border-b-2 border-black text-black text-xs font-black uppercase">
                    <th className="border border-black px-3 py-1.5 text-center w-14">S. NO</th>
                    <th className="border border-black px-3 py-1.5 text-left w-24">TK NO</th>
                    <th className="border border-black px-3 py-1.5 text-left">FITTER NAME</th>
                    <th className="border border-black px-3 py-1.5 text-center w-28">DAYS LOGGED</th>
                    <th className="border border-black px-3 py-1.5 text-center w-24">UTILISATION %</th>
                    <th className="border border-black px-3 py-1.5 text-center w-24">SLIP %</th>
                    <th className="border border-black px-3 py-1.5 text-center w-24">IDLE %</th>
                    <th className="border border-black px-3 py-1.5 text-center w-24">ROGUE %</th>
                  </tr>
                </thead>
                <tbody>
                  {fitterWorkers.map((fitter, idx) => {
                    const fData = getFitterMonthlyRows(fitter.id);
                    return (
                      <tr key={fitter.id} className="border-b border-black text-xs font-bold">
                        <td className="border border-black px-3 py-1.5 text-center">{idx + 1}</td>
                        <td className="border border-black px-3 py-1.5 text-left font-mono font-black">{fitter.tNo || '—'}</td>
                        <td className="border border-black px-3 py-1.5 text-left uppercase">{fitter.name}</td>
                        <td className="border border-black px-3 py-1.5 text-center">{fData.rows.length}</td>
                        <td className="border border-black px-3 py-1.5 text-center font-mono font-black">{fData.avgUtil}%</td>
                        <td className="border border-black px-3 py-1.5 text-center font-mono">{fData.avgSlip}%</td>
                        <td className="border border-black px-3 py-1.5 text-center font-mono">{fData.avgIdle}%</td>
                        <td className="border border-black px-3 py-1.5 text-center font-mono">{fData.avgRogue}%</td>
                      </tr>
                    );
                  })}
                  {fitterWorkers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="border border-black text-center py-4 text-xs font-bold uppercase text-stone-500">
                        No fitters registered in this department
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              {/* Plant Summary block */}
              {(() => {
                const plantData = getFitterMonthlyRows('ALL');
                return (
                  <div className="p-3 border-2 border-black bg-stone-50 rounded-lg flex items-center justify-between mb-3">
                    <div className="text-left">
                      <span className="text-[9px] font-black tracking-widest text-stone-500 uppercase">Plant Overall Metrics</span>
                      <div className="text-black font-black uppercase text-base mt-0.5">Mill Maintenance Performance Average</div>
                      <p className="text-[9px] font-bold text-stone-500 uppercase mt-0.5">
                        Consolidated across all ({fitterWorkers.length}) fitters for {reportMonthYear}.
                      </p>
                    </div>
                    <div className="flex gap-6 items-center">
                      <div className="text-center">
                        <span className="block text-[8px] font-black text-stone-500 uppercase tracking-widest">Plant Utilisation</span>
                        <span className="text-lg font-black text-black">{plantData.avgUtil}%</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[8px] font-black text-stone-500 uppercase tracking-widest">Avg Slip</span>
                        <span className="text-lg font-black text-black">{plantData.avgSlip}%</span>
                      </div>
                      <div className="bg-black text-white px-4 py-2 rounded text-center">
                        <span className="block text-[8px] font-black text-stone-300 uppercase tracking-widest">Avg Idle</span>
                        <span className="text-xl font-extrabold font-mono">{plantData.avgIdle}%</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

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

          {/* PAGES 2+: INDIVIDUAL FITTER PERFORMANCE RECORDS */}
          {fitterWorkers.map((fitter, idx) => {
            const fData = getFitterMonthlyRows(fitter.id);
            return (
              <div key={`print-fitter-${fitter.id}-${idx}`} className="print-page-break p-4 px-5 border-2 border-black rounded-lg min-h-[250mm] flex flex-col justify-between text-black bg-white mb-8">
                <div>
                  <div className="text-center pb-1.5 border-b border-black mb-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-stone-500 block mb-0.5">FITTER WISE HISTORY — PERFORMANCE &amp; MAINTENANCE AUDIT</span>
                    <h1 className="text-lg md:text-xl font-black text-black uppercase tracking-tight">FITTER MONTHLY PERFORMANCE RECORD</h1>
                    
                    <div className="mt-1.5 flex justify-center gap-6 text-[13px] font-bold text-stone-600 uppercase tracking-wider">
                      <div>FITTER NAME: <span className="text-black font-extrabold text-[14px]">{fitter.name}</span></div>
                      <div>TK. NO: <span className="text-black font-extrabold text-[14px]">{fitter.tNo || '—'}</span></div>
                      <div>PERIOD: <span className="text-black font-extrabold text-[14px]">{reportMonthYear}</span></div>
                    </div>
                  </div>

                  <table className="w-full text-center border-collapse border border-black mb-2">
                    <thead>
                      <tr className="bg-stone-50 border-b border-black text-[11.5px] font-black uppercase text-black">
                        <th className="border border-black px-1.5 py-1 text-center w-12">S.NO</th>
                        <th className="border border-black px-1.5 py-1 text-center w-28">DATE</th>
                        <th className="border border-black px-1.5 py-1 text-center w-24">SHIFTS LOGGED</th>
                        <th className="border border-black px-1.5 py-1 text-center w-28">UTILISATION %</th>
                        <th className="border border-black px-1.5 py-1 text-center w-24">SLIP %</th>
                        <th className="border border-black px-1.5 py-1 text-center w-24">IDLE %</th>
                        <th className="border border-black px-1.5 py-1 text-center w-24">ROGUE %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fData.rows.map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-black text-[11px] leading-tight font-bold text-black">
                          <td className="border border-black px-1.5 py-1 text-center font-bold text-black">{rIdx + 1}</td>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-bold text-black">{formatDisplayDate(row.date)}</td>
                          <td className="border border-black px-1.5 py-1 text-center font-bold text-black">{row.shiftsLogged}</td>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-bold text-black">{row.dayUtilization}%</td>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-bold text-black">{row.slipPercent}%</td>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-bold text-black">{row.idlePercent}%</td>
                          <td className="border border-black px-1.5 py-1 text-center font-mono font-bold text-black">{row.roguePercent}%</td>
                        </tr>
                      ))}
                      {fData.rows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="border border-black text-center py-2 text-[11px] text-stone-500 font-bold uppercase tracking-wider">
                            No shift duties recorded for this fitter in this period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  {/* Summary block */}
                  <div className="p-2 px-3 border border-black bg-stone-50 rounded flex justify-between items-center mb-2">
                    <div className="text-left">
                      <span className="text-[10px] font-black tracking-widest text-stone-500 uppercase">Performance Summary</span>
                      <div className="text-black font-black uppercase text-[13px] mt-0.5">Fitter Monthly Performance Record</div>
                      <p className="text-[11.5px] font-semibold text-stone-500 uppercase mt-0.5 leading-normal">
                        Includes {fData.rows.length} working days monitored.
                      </p>
                    </div>
                    <div className="flex gap-4 items-center">
                      <div className="text-center">
                        <span className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">Avg Utilisation</span>
                        <span className="text-[14px] font-black text-black">{fData.avgUtil}%</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">Avg Slip</span>
                        <span className="text-[14px] font-black text-black">{fData.avgSlip}%</span>
                      </div>
                      <div className="border border-black px-2.5 py-1 bg-black text-white text-center rounded">
                        <span className="block text-[10px] font-black text-stone-300 uppercase tracking-widest">Avg Idle</span>
                        <span className="text-[16px] font-black font-mono">{fData.avgIdle}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures block */}
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
