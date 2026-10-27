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
    <div className="space-y-4 animate-in fade-in duration-500">
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
    </div>
  );
};
