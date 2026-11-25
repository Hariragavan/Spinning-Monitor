'use client';

import React, { useState, useMemo } from 'react';
import { DailyReport, Sider, Shed } from '../types';
import { cn, findDuplicatesInReport, parseUniversalDate, parseUniversalDateParts, normalizeShed } from '../lib/utils';
import { AlertTriangle, Printer, Download, ArrowUpRight, Database, Calendar, Search, CheckCircle2, ShieldAlert } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AssignmentAuditProps {
  history: DailyReport[];
  workers: Sider[];
  currentShed?: Shed;
  onSelectShed?: (shed: Shed) => void;
  onEditDate?: (date: string) => void;
  initialMonth?: number;
  initialYear?: number;
}

export const AssignmentAudit: React.FC<AssignmentAuditProps> = ({
  history = [],
  workers = [],
  currentShed,
  onSelectShed,
  onEditDate,
  initialMonth,
  initialYear
}) => {
  const [selectedShedTab, setSelectedShedTab] = useState<string>(currentShed || 'All Sheds');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Default date range: current / selected month
  const { defaultFrom, defaultTo } = useMemo(() => {
    const targetYear = initialYear || new Date().getFullYear();
    const targetMonth = initialMonth ? initialMonth - 1 : new Date().getMonth();
    const firstDay = new Date(targetYear, targetMonth, 1);
    const lastDay = new Date(targetYear, targetMonth + 1, 0);

    const pad = (n: number) => n.toString().padStart(2, '0');
    return {
      defaultFrom: `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`,
      defaultTo: `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`
    };
  }, [initialMonth, initialYear]);

  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);

  // Sync tab if parent currentShed changes
  React.useEffect(() => {
    if (currentShed && (currentShed as string) !== 'All' && (currentShed as string) !== 'All Sheds') {
      setSelectedShedTab(currentShed);
    }
  }, [currentShed]);

  // Handle shed selection
  const handleShedChange = (s: string) => {
    setSelectedShedTab(s);
    if (onSelectShed && s !== 'All Sheds') {
      onSelectShed(s as Shed);
    }
  };

  // Find duplicate allocations across reports within date range & shed
  const duplicateAllocations = useMemo(() => {
    const results: Array<{
      date: string;
      shed: string;
      workerId: string;
      workerName: string;
      tNo: string;
      allotments: Array<{ shift: string; detail: string }>;
    }> = [];

    const targetNorm = normalizeShed(selectedShedTab || 'All Sheds');

    // Sort history by date descending
    const sortedHistory = [...history].sort((a, b) => {
      return parseUniversalDate(b.date).getTime() - parseUniversalDate(a.date).getTime();
    });

    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    sortedHistory.forEach(report => {
      if (!report || !report.date) return;
      const rDate = parseUniversalDate(report.date);
      if (start && rDate < start) return;
      if (end && rDate > end) return;

      const rShed = report.shed || 'Shed 1';
      if (selectedShedTab !== 'All Sheds' && normalizeShed(rShed) !== targetNorm) return;

      const dups = findDuplicatesInReport(report, workers);
      dups.forEach(d => {
        results.push({
          ...d,
          shed: rShed,
          date: report.date
        });
      });
    });

    return results;
  }, [history, workers, fromDate, toDate, selectedShedTab]);

  // Filtered by search query (worker name or ticket no)
  const filteredDuplicates = useMemo(() => {
    if (!searchQuery.trim()) return duplicateAllocations;
    const q = searchQuery.toLowerCase().trim();
    return duplicateAllocations.filter(d =>
      (d.workerName && d.workerName.toLowerCase().includes(q)) ||
      (d.tNo && d.tNo.toLowerCase().includes(q)) ||
      (d.date && d.date.includes(q))
    );
  }, [duplicateAllocations, searchQuery]);

  // Quick range helper
  const setQuickRange = (type: 'thisMonth' | 'last30' | 'all') => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');

    if (type === 'thisMonth') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setFromDate(`${first.getFullYear()}-${pad(first.getMonth() + 1)}-${pad(first.getDate())}`);
      setToDate(`${last.getFullYear()}-${pad(last.getMonth() + 1)}-${pad(last.getDate())}`);
    } else if (type === 'last30') {
      const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      setFromDate(`${past.getFullYear()}-${pad(past.getMonth() + 1)}-${pad(past.getDate())}`);
      setToDate(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    } else if (type === 'all') {
      setFromDate('');
      setToDate('');
    }
  };

  // Export to Excel
  const handleExportExcel = () => {
    const headers = [["S. NO", "Date", "Shed", "Ticket No", "Worker Name", "Conflict Details"]];
    const rows = filteredDuplicates.map((d, i) => [
      i + 1,
      d.date,
      d.shed,
      d.tNo,
      d.workerName,
      d.allotments.map(det => `Shift ${det.shift}: ${det.detail}`).join(' | ')
    ]);
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([...headers, ...rows]);
    XLSX.utils.book_append_sheet(wb, ws, "Duplicate Assignments");
    XLSX.writeFile(wb, `Duplicate_Assignments_Report_${fromDate || 'All'}_to_${toDate || 'All'}.xlsx`);
  };

  // Summary Metrics
  const uniqueDatesCount = useMemo(() => new Set(duplicateAllocations.map(d => d.date)).size, [duplicateAllocations]);
  const uniqueWorkersCount = useMemo(() => new Set(duplicateAllocations.map(d => d.workerId || d.workerName)).size, [duplicateAllocations]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-16">
      {/* Printable Sheet Header */}
      <div className="hidden print-only mb-4 border-b-2 border-black pb-3 text-center">
        <h1 className="text-xl font-black uppercase tracking-tight text-black">
          {selectedShedTab.toUpperCase()} — DUPLICATE ASSIGNMENT &amp; CONFLICT AUDIT LEDGER
        </h1>
        <div className="flex justify-between items-center text-xs font-bold mt-2 pt-1 border-t border-stone-300 text-black">
          <span>Shed: <strong>{selectedShedTab.toUpperCase()}</strong></span>
          <span>Period: <strong>{fromDate || 'All'} to {toDate || 'All'}</strong></span>
          <span>Total Conflicts: <strong>{duplicateAllocations.length}</strong></span>
        </div>
      </div>

      {/* HEADER SECTION */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl border border-stone-200/80 shadow-xs no-print">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-rose-100 text-rose-700">
                <ShieldAlert size={20} />
              </span>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight uppercase">
                  Duplicate Assignment Audit
                </h1>
                <p className="text-xs text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                  Automated shift conflict detection & double-allocation audit ledger
                </p>
              </div>
            </div>
          </div>

          {/* SHED TABS */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
              {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleShedChange(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    selectedShedTab === s ? "bg-white text-stone-900 shadow-xs font-black" : "text-stone-500 hover:text-stone-800"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>

            <button
              onClick={handleExportExcel}
              disabled={filteredDuplicates.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
            >
              <Download size={14} /> Export Excel
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-xs cursor-pointer"
            >
              <Printer size={14} /> Print Audit
            </button>
          </div>
        </div>

        {/* METRIC KPI CARDS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-stone-100">
          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">Total Conflicts</span>
            <span className={cn(
              "text-2xl font-black font-mono mt-1 block",
              duplicateAllocations.length > 0 ? "text-rose-600" : "text-emerald-700"
            )}>
              {duplicateAllocations.length}
            </span>
            <span className="text-[10px] text-stone-500 font-bold uppercase mt-0.5 block">Shift Assignments</span>
          </div>

          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">Conflicted Workers</span>
            <span className="text-2xl font-black font-mono text-stone-900 mt-1 block">
              {uniqueWorkersCount}
            </span>
            <span className="text-[10px] text-stone-500 font-bold uppercase mt-0.5 block">Unique Siders / Operators</span>
          </div>

          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">Conflict Dates</span>
            <span className="text-2xl font-black font-mono text-stone-900 mt-1 block">
              {uniqueDatesCount}
            </span>
            <span className="text-[10px] text-stone-500 font-bold uppercase mt-0.5 block">Distinct Days</span>
          </div>

          <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block">Audit Status</span>
            <div className="flex items-center gap-1.5 mt-2">
              {duplicateAllocations.length === 0 ? (
                <>
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span className="text-xs font-black text-emerald-800 uppercase tracking-wider">Clean / Zero Conflicts</span>
                </>
              ) : (
                <>
                  <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                  <span className="text-xs font-black text-rose-800 uppercase tracking-wider">Attention Needed</span>
                </>
              )}
            </div>
            <span className="text-[10px] text-stone-500 font-bold uppercase mt-0.5 block">System Verification</span>
          </div>
        </div>

        {/* DATE RANGE & SEARCH CONTROLS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 pt-6 border-t border-stone-100">
          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">From Date</label>
            <input
              type="date"
              value={fromDate}
              onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
              onChange={e => setFromDate(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-xs cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">To Date</label>
            <input
              type="date"
              value={toDate}
              onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
              onChange={e => setToDate(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3.5 py-2 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-xs cursor-pointer"
            />
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1.5">Quick Presets / Search</label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setQuickRange('thisMonth')}
                className="px-2.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
              >
                Month
              </button>
              <button
                type="button"
                onClick={() => setQuickRange('last30')}
                className="px-2.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
              >
                30 Days
              </button>
              <button
                type="button"
                onClick={() => setQuickRange('all')}
                className="px-2.5 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
              >
                All
              </button>
              <div className="relative flex-1">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  placeholder="Filter name / tNo..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl pl-8 pr-3 py-2 text-stone-800 font-bold text-xs outline-none focus:border-stone-900 transition-colors"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* AUDIT TABLE */}
      <div className="bg-white rounded-3xl border border-stone-200/80 shadow-xs overflow-hidden">
        <div className="p-6 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-stone-900 uppercase tracking-tight">
              Audit Conflict Log ({filteredDuplicates.length})
            </h3>
            <p className="text-[11px] text-stone-400 font-bold uppercase tracking-widest mt-0.5">
              Filter: {selectedShedTab} • Period: {fromDate || 'Start'} to {toDate || 'End'}
            </p>
          </div>
          {duplicateAllocations.length > 0 && (
            <span className="px-3 py-1 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl font-black text-[10px] uppercase tracking-wider inline-flex items-center gap-1.5 self-start sm:self-auto">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
              {filteredDuplicates.length} conflicts shown
            </span>
          )}
        </div>

        {filteredDuplicates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-stone-50 border-b border-stone-200 text-stone-600 font-black uppercase tracking-wider text-[10.5px]">
                  <th className="px-5 py-3.5 w-14 text-center">S.No</th>
                  <th className="px-5 py-3.5 w-32">Date</th>
                  <th className="px-5 py-3.5 w-24">Shed</th>
                  <th className="px-5 py-3.5 w-32">Ticket No</th>
                  <th className="px-5 py-3.5">Worker Name</th>
                  <th className="px-5 py-3.5">Duplicate Allocation Details</th>
                  {onEditDate && <th className="px-5 py-3.5 w-36 text-center no-print">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filteredDuplicates.map((dup, idx) => (
                  <tr key={`${dup.date}-${dup.workerId}-${idx}`} className="hover:bg-rose-50/40 transition-colors">
                    <td className="px-5 py-3.5 text-stone-400 font-bold text-center font-mono">{idx + 1}</td>
                    <td className="px-5 py-3.5 font-black text-stone-900 font-mono">{dup.date}</td>
                    <td className="px-5 py-3.5 font-bold text-stone-600">{dup.shed}</td>
                    <td className="px-5 py-3.5">
                      <span className="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded font-mono font-black text-[11px]">
                        {dup.tNo}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-black text-stone-900 uppercase">{dup.workerName}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-2">
                        {dup.allotments.map((detail, dIdx) => (
                          <span
                            key={dIdx}
                            className="px-2.5 py-1 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg font-black text-[10px] uppercase tracking-wide flex items-center gap-1.5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                            Shift {detail.shift}: {detail.detail}
                          </span>
                        ))}
                      </div>
                    </td>
                    {onEditDate && (
                      <td className="px-5 py-3.5 text-center no-print">
                        <button
                          type="button"
                          onClick={() => onEditDate(dup.date)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-900 hover:bg-black text-white rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                          title={`Navigate to Machine Allocation on ${dup.date}`}
                        >
                          <span>Edit Allocation</span>
                          <ArrowUpRight size={12} className="text-emerald-400" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-20 text-center px-4">
            <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center rounded-2xl mx-auto mb-3 shadow-2xs">
              <CheckCircle2 size={24} />
            </div>
            <h4 className="text-base font-black text-stone-900 uppercase tracking-tight">Perfect Allocation Database</h4>
            <p className="text-xs text-stone-500 font-bold uppercase tracking-wider mt-1 max-w-md mx-auto">
              No duplicate worker assignments or shift conflicts found for {selectedShedTab} in the selected period ({fromDate || 'Start'} to {toDate || 'End'}).
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
