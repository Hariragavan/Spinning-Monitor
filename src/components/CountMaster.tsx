'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { CountConversion, DailyReport, Shed } from '../types';
import { 
  Hash, Plus, Trash2, Save, Info, Calculator, Edit2, Check, ArrowRight,
  Layers, Activity
} from 'lucide-react';
import { cn, getYesterdayUniversalDate, isCountNameMatching } from '../lib/utils';

interface CountMasterProps {
  conversions: CountConversion[];
  onSave: (conversion: CountConversion) => void;
  onDelete: (count: string, shed?: string) => void;
  currentShed?: string;
  report?: DailyReport;
  allReports?: DailyReport[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  availableDates?: string[];
}

export const CountMaster: React.FC<CountMasterProps> = ({ 
  conversions, 
  onSave, 
  onDelete,
  currentShed = 'Shed 1',
  report,
  allReports = [],
  selectedDate,
}) => {
  // Active Shed Tab Filter
  const [selectedShedTab, setSelectedShedTab] = useState<string>(() => {
    return currentShed || 'Shed 1';
  });

  // Selected Date from prop or report
  const activeDate = selectedDate || report?.date || getYesterdayUniversalDate();

  // View Mode: 'date' (counts for selected date) or 'all' (master registry)
  const [viewMode, setViewMode] = useState<'date' | 'all'>('date');

  // Left Form State
  const [targetShed, setTargetShed] = useState<string>(() => {
    return currentShed && currentShed !== 'All Sheds' ? currentShed : 'Shed 1';
  });
  const [newCount, setNewCount] = useState('');
  const [newFactor, setNewFactor] = useState('');
  const [description, setDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Quick Verification State
  const [testGps, setTestGps] = useState<string>('160');

  // Inline Row Factors State for immediate Apply
  const [rowFactors, setRowFactors] = useState<Record<string, string>>({});
  const [appliedRowKey, setAppliedRowKey] = useState<string | null>(null);

  // Sync selectedShedTab when top navigation currentShed changes
  useEffect(() => {
    if (currentShed && currentShed !== 'All') {
      setSelectedShedTab(currentShed);
    }
  }, [currentShed]);

  // Sync target shed with selected tab if not "All Sheds"
  useEffect(() => {
    if (selectedShedTab !== 'All Sheds') {
      setTargetShed(selectedShedTab);
    }
  }, [selectedShedTab]);

  // Sync inline row factors when conversions update
  useEffect(() => {
    const map: Record<string, string> = {};
    conversions.forEach(c => {
      const shedKey = c.shed || 'Shed 1';
      const key = `${c.count}__${shedKey}`;
      map[key] = c.multiplicationFactor !== undefined ? (c.multiplicationFactor === 0 ? '' : String(c.multiplicationFactor)) : '1.0';
    });
    setRowFactors(prev => ({ ...map, ...prev }));
  }, [conversions]);

  // Filter all master conversions strictly by selected shed tab
  const filteredConversions = conversions.filter(c => {
    if (selectedShedTab === 'All Sheds') return true;
    const s = c.shed || 'Shed 1';
    return s === selectedShedTab;
  });

  // Detect running counts for activeDate and selectedShedTab
  const { dateRunningCounts, dateHasData } = useMemo(() => {
    const pool: DailyReport[] = [];
    if (report && report.date === activeDate) pool.push(report);
    (allReports || []).forEach(r => {
      if (r.date === activeDate && !pool.some(p => p.shed === r.shed && p.date === r.date)) {
        pool.push(r);
      }
    });

    const relevant = pool.filter(r => selectedShedTab === 'All Sheds' || (r.shed || 'Shed 1') === selectedShedTab);

    // Strict deduplication map: countKey -> count details
    const countMap = new Map<string, {
      count: string;
      shed: string;
      frames: Set<string>;
      gpsValues: number[];
      totalProd: number;
    }>();

    let foundData = false;

    relevant.forEach(rep => {
      const repShed = rep.shed || 'Shed 1';
      
      // From entries
      (rep.entries || []).forEach(e => {
        const c = (e.count || '').trim();
        if (!c || c === '-' || c === '0') return;
        foundData = true;
        const key = `${c.toLowerCase()}__${repShed.toLowerCase()}`;
        if (!countMap.has(key)) {
          countMap.set(key, {
            count: c,
            shed: repShed,
            frames: new Set(),
            gpsValues: [],
            totalProd: 0
          });
        }
        const item = countMap.get(key)!;
        if (e.frameNo) item.frames.add(e.frameNo);
        if (e.gpsActual && e.gpsActual > 0) item.gpsValues.push(e.gpsActual);
        item.totalProd += e.productionActual || 0;
      });

      // From summaries
      (rep.summaries || []).forEach(s => {
        const c = (s.count || '').trim();
        if (!c || c === '-' || c === '0') return;
        foundData = true;
        const key = `${c.toLowerCase()}__${repShed.toLowerCase()}`;
        if (!countMap.has(key)) {
          countMap.set(key, {
            count: c,
            shed: repShed,
            frames: new Set(),
            gpsValues: [],
            totalProd: 0
          });
        }
        const item = countMap.get(key)!;
        if (s.frameNo) item.frames.add(s.frameNo);
        if (s.avgGps && s.avgGps > 0) item.gpsValues.push(s.avgGps);
        item.totalProd += s.actualProd || 0;
      });
    });

    if (!foundData) {
      return { dateRunningCounts: [], dateHasData: false };
    }

    const list = Array.from(countMap.values()).map(item => {
      const framesArr = Array.from(item.frames).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      const avgGps = item.gpsValues.length > 0
        ? Math.round(item.gpsValues.reduce((a, b) => a + b, 0) / item.gpsValues.length)
        : 0;

      // Match configured factor
      const matchedConv = conversions.find(c => 
        isCountNameMatching(c.count, item.count) &&
        ((c.shed || 'Shed 1') === item.shed || (c.shed || '') === 'All Sheds')
      );
      const factor = matchedConv?.multiplicationFactor ?? (item.count.toLowerCase().includes('40') ? 1.0 : 1.0);

      return {
        count: item.count,
        shed: item.shed,
        frames: framesArr,
        frameCount: framesArr.length,
        avgGps,
        totalProd: Math.round(item.totalProd),
        factor,
        converted40s: (avgGps > 0 && factor > 0) ? Math.round(avgGps * factor) : 0,
        description: matchedConv?.description || ''
      };
    });

    return { dateRunningCounts: list, dateHasData: true };
  }, [allReports, report, activeDate, selectedShedTab, conversions]);

  const handleSaveForm = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCount.trim() || !newFactor) return;

    const parsedFactor = parseFloat(newFactor);
    if (isNaN(parsedFactor)) return;

    const effectiveShed = targetShed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1');

    onSave({
      count: newCount.trim(),
      multiplicationFactor: parsedFactor,
      description: description.trim(),
      shed: effectiveShed
    });

    setNewCount('');
    setNewFactor('');
    setDescription('');
    setIsEditing(false);
  };

  const handleEditRow = (rule: CountConversion) => {
    setNewCount(rule.count);
    setNewFactor(rule.multiplicationFactor === 0 ? '' : String(rule.multiplicationFactor));
    setDescription(rule.description || '');
    setTargetShed(rule.shed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1'));
    setIsEditing(true);
  };

  const handleApplyRowFactor = (countName: string, shedName: string, rawVal: string, desc?: string) => {
    const parsed = parseFloat(rawVal);
    if (isNaN(parsed) || parsed < 0) return;

    const effectiveShed = shedName || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1');
    const rowKey = `${countName}__${effectiveShed}`;

    onSave({
      count: countName.trim(),
      multiplicationFactor: parsed,
      description: desc || `40s Factor for ${countName}`,
      shed: effectiveShed
    });

    setAppliedRowKey(rowKey);
    setTimeout(() => {
      setAppliedRowKey(null);
    }, 2000);
  };

  // Quick Verification Calculation
  const factorForCalc = parseFloat(newFactor) || 1.0;
  const testGpsNum = parseFloat(testGps) || 0;
  const quick40sResult = (testGpsNum * factorForCalc).toFixed(2);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* HEADER SECTION (Without Date Picker) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight">
            COUNT MASTER
          </h1>
          <p className="text-xs font-semibold text-stone-400 mt-0.5 tracking-wider uppercase">
            Running Counts & 40s Multiplication Factors (Syncs Across All Screens)
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Formula pill */}
          <div className="font-mono text-xs font-semibold text-stone-600 bg-stone-50 px-3.5 py-1.5 rounded-xl border border-stone-200">
            Formula: 40s GPS = Actual GPS × Multiplication Factor
          </div>

          {/* SHED FILTER BAR */}
          <div className="inline-flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
            {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(s => {
              const isSelected = selectedShedTab === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSelectedShedTab(s)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                    isSelected 
                      ? "bg-white text-emerald-800 shadow-xs font-black" 
                      : "text-stone-500 hover:text-stone-800"
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* TWO COLUMN GRID LAYOUT: LEFT FORM & RIGHT AVAILABLE COUNTS TABLE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: ADD / UPDATE COUNT FACTOR FORM */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs sticky top-28">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-5">
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
              {isEditing ? (
                <>
                  <Edit2 size={15} className="text-emerald-600" />
                  <span>EDIT COUNT FACTOR</span>
                </>
              ) : (
                <>
                  <Plus size={15} className="text-emerald-600" />
                  <span>+ ADD / UPDATE COUNT FACTOR</span>
                </>
              )}
            </h3>
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setNewCount('');
                  setNewFactor('');
                  setDescription('');
                }}
                className="text-[11px] font-bold text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          <form onSubmit={handleSaveForm} className="space-y-4">
            {/* TARGET SHED SELECTOR */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-stone-600 mb-1">
                ASSIGN SHED *
              </label>
              <select
                value={targetShed}
                onChange={(e) => setTargetShed(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black text-stone-900 focus:bg-white focus:border-emerald-500 outline-none transition-all cursor-pointer font-mono"
              >
                {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(sh => (
                  <option key={sh} value={sh}>
                    {sh}
                  </option>
                ))}
              </select>
            </div>

            {/* COUNT NAME */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-stone-600 mb-1">
                COUNT NAME *
              </label>
              <input
                type="text"
                placeholder="e.g. 40s, 040/1-PH-PC, 030/1-PH-PC"
                value={newCount}
                onChange={(e) => setNewCount(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:border-emerald-500 outline-none transition-all font-mono"
                required
              />
            </div>

            {/* MULTIPLICATION FACTOR */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-stone-600 mb-1">
                40s MULTIPLICATION FACTOR *
              </label>
              <div className="relative">
                <input
                  type="number"
                  step="0.0001"
                  min="0"
                  placeholder="e.g. 1.0000 or 0.6400"
                  value={newFactor}
                  onFocus={(e) => {
                    if (e.target.value === '0') setNewFactor('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === '-' || e.key === 'Minus') e.preventDefault();
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '' || parseFloat(val) >= 0) {
                      setNewFactor(val);
                    }
                  }}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:border-emerald-500 outline-none transition-all font-mono pr-10"
                  required
                />
                <Calculator size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              </div>
              <p className="mt-1 text-[10px] text-stone-400 italic">
                Formula: 40s GPS = Actual GPS × Factor
              </p>
            </div>

            {/* DESCRIPTION */}
            <div>
              <label className="block text-[10px] font-black uppercase tracking-wider text-stone-600 mb-1">
                DESCRIPTION (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. 40/1 Poly Hosiery PC Yarn"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-900 focus:bg-white focus:border-emerald-500 outline-none transition-all"
              />
            </div>

            {/* SAVE BUTTON */}
            <button
              type="submit"
              disabled={!newCount.trim() || !newFactor}
              className="w-full py-3 bg-stone-900 hover:bg-black text-white rounded-xl font-black uppercase tracking-wider text-xs transition-all shadow-xs flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer mt-2"
            >
              <Save size={14} />
              <span>{isEditing ? 'UPDATE COUNT RULE' : 'SAVE COUNT RULE'}</span>
            </button>
          </form>

          {/* QUICK 40s GPS VERIFICATION */}
          <div className="mt-6 pt-5 border-t border-stone-100">
            <h4 className="text-[11px] font-black uppercase tracking-wider text-stone-700 mb-2.5">
              Quick 40s GPS Verification
            </h4>
            <div className="flex items-center gap-2 p-3 bg-stone-50 border border-stone-200 rounded-xl">
              <input
                type="number"
                min="0"
                placeholder="0"
                value={testGps}
                onFocus={(e) => {
                  if (e.target.value === '0') setTestGps('');
                }}
                onKeyDown={(e) => {
                  if (e.key === '-' || e.key === 'Minus') e.preventDefault();
                }}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === '' || parseFloat(val) >= 0) {
                    setTestGps(val);
                  }
                }}
                className="w-16 px-2 py-1 bg-white border border-stone-300 rounded-lg text-xs font-mono font-black text-center text-stone-900 outline-none focus:border-emerald-500"
              />
              <span className="text-xs font-mono font-bold text-stone-400">×</span>
              <span className="text-xs font-mono font-bold text-stone-600">
                {factorForCalc.toFixed(4)}
              </span>
              <span className="text-xs font-mono font-bold text-stone-400">=</span>
              <span className="text-xs font-mono font-black text-emerald-700">
                {quick40sResult} (40s GPS)
              </span>
            </div>
          </div>

          {/* INFO CALLOUT */}
          <div className="mt-5 p-4 bg-emerald-50/60 rounded-xl border border-emerald-100">
            <div className="flex gap-2.5 text-stone-500">
              <Info size={16} className="shrink-0 text-emerald-600 mt-0.5" />
              <p className="text-[11px] font-medium leading-relaxed">
                Updating any count factor automatically updates 40s Converted GPSS across all shifts, reports, and master tables immediately.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: AVAILABLE COUNTS TABLE */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
          {/* HEADER */}
          <div className="p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-stone-900">
                  AVAILABLE COUNTS {viewMode === 'date' ? `(${activeDate})` : '(ALL REGISTERED)'}
                </h3>
                {selectedShedTab !== 'All Sheds' && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black uppercase font-mono">
                    {selectedShedTab}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                {viewMode === 'date' 
                  ? `Showing detected counts running on ${activeDate}. Multiple frames are deduplicated to show one row per count.`
                  : `Showing all master counts registered across ${selectedShedTab}.`}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* Toggle View Mode between Date Counts & All Registered */}
              <div className="inline-flex items-center bg-stone-200/80 p-0.5 rounded-lg border border-stone-300">
                <button
                  type="button"
                  onClick={() => setViewMode('date')}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer",
                    viewMode === 'date' ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
                  )}
                >
                  On Date ({dateRunningCounts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('all')}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer",
                    viewMode === 'all' ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
                  )}
                >
                  All Master ({filteredConversions.length})
                </button>
              </div>
            </div>
          </div>

          {/* TABLE CONTENT */}
          <div className="overflow-x-auto">
            {viewMode === 'date' ? (
              /* DATE RUNNING COUNTS TABLE (Shows empty if no data on selected date) */
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-100 text-[10px] font-black uppercase tracking-wider text-stone-400">
                    <th className="px-5 py-3.5">RUNNING COUNT</th>
                    <th className="px-5 py-3.5">RUNNING FRAMES</th>
                    <th className="px-5 py-3.5 text-center">ACTUAL GPSS</th>
                    <th className="px-5 py-3.5">40s CONVERSION FACTOR</th>
                    <th className="px-5 py-3.5 text-center">40s CONV. GPSS</th>
                    <th className="px-5 py-3.5 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {dateRunningCounts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center">
                        <div className="max-w-sm mx-auto text-stone-400">
                          <Layers size={24} className="mx-auto mb-2 text-stone-300" />
                          <p className="font-bold text-xs uppercase tracking-wider text-stone-500">
                            No count data for {activeDate} {selectedShedTab !== 'All Sheds' ? `(${selectedShedTab})` : ''}
                          </p>
                          <p className="text-[11px] text-stone-400 mt-1">
                            Upload a production statement for {activeDate} to detect active running counts.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    dateRunningCounts.map((item) => {
                      const rowKey = `${item.count}__${item.shed}`;
                      const currentVal = rowFactors[rowKey] !== undefined ? rowFactors[rowKey] : String(item.factor);
                      const isApplied = appliedRowKey === rowKey;
                      const factorNum = parseFloat(currentVal) || item.factor;
                      const live40sGps = item.avgGps > 0 ? Math.round(item.avgGps * factorNum) : 0;

                      return (
                        <tr key={rowKey} className="hover:bg-stone-50/50 transition-colors">
                          {/* COUNT NAME */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-stone-900 text-sm">
                                {item.count}
                              </span>
                              <span className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-[9px] font-bold">
                                {item.shed}
                              </span>
                            </div>
                          </td>

                          {/* RUNNING FRAMES (DEDUPLICATED) */}
                          <td className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-black text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 text-xs font-mono">
                                {item.frameCount} {item.frameCount === 1 ? 'Frame' : 'Frames'}
                              </span>
                              <span className="text-[11px] font-mono text-stone-500 font-bold truncate max-w-[140px]" title={item.frames.join(', ')}>
                                ({item.frames.join(', ')})
                              </span>
                            </div>
                          </td>

                          {/* ACTUAL GPSS */}
                          <td className="px-5 py-4 text-center">
                            <span className="font-mono font-black text-stone-900 text-sm">
                              {item.avgGps > 0 ? item.avgGps : '-'}
                            </span>
                          </td>

                          {/* 40s FACTOR EDITABLE */}
                          <td className="px-5 py-4">
                            <div className="inline-flex items-center gap-1.5 p-1 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                              <span className="text-xs font-mono font-bold text-emerald-800 pl-1.5">
                                ×
                              </span>
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={currentVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRowFactors(prev => ({ ...prev, [rowKey]: val }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleApplyRowFactor(item.count, item.shed, currentVal, item.description);
                                  }
                                }}
                                className="w-20 px-2 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                              <button
                                type="button"
                                onClick={() => handleApplyRowFactor(item.count, item.shed, currentVal, item.description)}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs",
                                  isApplied
                                    ? "bg-emerald-600 text-white"
                                    : "bg-stone-900 hover:bg-black text-white"
                                )}
                              >
                                {isApplied ? (
                                  <span className="flex items-center gap-1">
                                    <Check size={11} /> Saved
                                  </span>
                                ) : (
                                  'Apply'
                                )}
                              </button>
                            </div>
                          </td>

                          {/* 40s CONVERTED GPSS */}
                          <td className="px-5 py-4 text-center">
                            <div className="font-mono font-black text-emerald-700 text-sm">
                              {live40sGps > 0 ? live40sGps : '-'}
                            </div>
                            <div className="text-[10px] text-stone-400 font-mono">
                              ({item.avgGps} × {factorNum.toFixed(4)})
                            </div>
                          </td>

                          {/* ACTION */}
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setNewCount(item.count);
                                setNewFactor(String(factorNum));
                                setTargetShed(item.shed);
                                setIsEditing(true);
                              }}
                              className="px-2.5 py-1 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                              title="Edit in Form"
                            >
                              <Edit2 size={13} className="inline mr-1" /> Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            ) : (
              /* ALL REGISTERED MASTER CONVERSIONS TABLE */
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-stone-50/80 border-b border-stone-100 text-[10px] font-black uppercase tracking-wider text-stone-400">
                    <th className="px-5 py-3.5">COUNT NAME</th>
                    <th className="px-5 py-3.5">40s CONVERSION FACTOR (EDITABLE)</th>
                    <th className="px-5 py-3.5">DESCRIPTION</th>
                    <th className="px-5 py-3.5 text-right">ACTIONS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 text-xs">
                  {filteredConversions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-stone-400 italic">
                        No custom conversions defined for {selectedShedTab}. Add a rule on the left.
                      </td>
                    </tr>
                  ) : (
                    filteredConversions.map((rule) => {
                      const rowKey = `${rule.count}__${rule.shed || 'Shed 1'}`;
                      const currentVal = rowFactors[rowKey] ?? String(rule.multiplicationFactor ?? 1.0);
                      const isApplied = appliedRowKey === rowKey;

                      return (
                        <tr key={rowKey} className="hover:bg-stone-50/50 transition-colors group">
                          {/* COUNT NAME */}
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 bg-stone-100 rounded-md flex items-center justify-center text-stone-400">
                                <Hash size={13} />
                              </div>
                              <span className="font-mono font-black text-stone-900">
                                {rule.count}
                              </span>
                              {rule.shed && rule.shed !== 'All Sheds' && (
                                <span className="px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded text-[9px] font-bold">
                                  {rule.shed}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 40s CONVERSION FACTOR */}
                          <td className="px-5 py-4">
                            <div className="inline-flex items-center gap-1.5 p-1 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                              <span className="text-xs font-mono font-bold text-emerald-800 pl-1.5">
                                ×
                              </span>
                              <input
                                type="number"
                                step="0.0001"
                                min="0"
                                value={currentVal}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRowFactors(prev => ({ ...prev, [rowKey]: val }));
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleApplyRowFactor(rule.count, rule.shed || 'Shed 1', currentVal, rule.description);
                                  }
                                }}
                                className="w-24 px-2 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-black text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                              />
                              <button
                                type="button"
                                onClick={() => handleApplyRowFactor(rule.count, rule.shed || 'Shed 1', currentVal, rule.description)}
                                className={cn(
                                  "px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs",
                                  isApplied
                                    ? "bg-emerald-600 text-white"
                                    : "bg-stone-900 hover:bg-black text-white"
                                )}
                              >
                                {isApplied ? (
                                  <span className="flex items-center gap-1">
                                    <Check size={11} /> Saved
                                  </span>
                                ) : (
                                  'Apply'
                                )}
                              </button>
                            </div>
                          </td>

                          {/* DESCRIPTION */}
                          <td className="px-5 py-4 text-stone-500 font-medium">
                            {rule.description || '-'}
                          </td>

                          {/* ACTIONS */}
                          <td className="px-5 py-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleEditRow(rule)}
                                className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                                title="Edit in Form"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Delete conversion for count "${rule.count}" in ${rule.shed || 'Shed 1'}?`)) {
                                    onDelete(rule.count, rule.shed);
                                  }
                                }}
                                className="p-1.5 text-stone-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Delete Rule"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
