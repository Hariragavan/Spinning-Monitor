import React, { useState } from 'react';
import { Sider, Shift, ProductionEntry, DailyReport } from '../types';
import { UserCheck, Zap, Activity, Users, Calendar, Filter, Copy, Check, ChevronDown, ChevronUp, Smartphone, Share2, QrCode, X, ExternalLink } from 'lucide-react';
import { cn, findDuplicatesInReport } from '../lib/utils';
import { CalendarDatePicker } from './CalendarPickers';

interface MachineAssignmentProps {
  workers: Sider[];
  entries: ProductionEntry[];
  gaiters: Record<Shift, string[]>;
  aiCones?: Record<Shift, string[]>;
  fitters?: Record<Shift, string[]>;
  machineSiderCounts: Record<string, number>;
  gaiterCounts: Record<Shift, number>;
  assignWorker: (entryIndex: number, siderId: string, slotIndex: number) => void;
  assignGaiter: (shift: Shift, gaiterIds: string[]) => void;
  assignAiCone?: (shift: Shift, aiConeIds: string[]) => void;
  assignFitter?: (shift: Shift, fitterIds: string[]) => void;
  dates: string[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onCopyAllocations: (sourceDate: string, targetShift?: Shift | 'ALL') => void;
  onChangeReportDate?: (oldDate: string, newDate: string) => void;
  isSupervisorMode?: boolean;
}

export const MachineAssignment: React.FC<MachineAssignmentProps> = ({
  workers,
  entries,
  gaiters,
  aiCones = { I: [], II: [], III: [] },
  fitters = { I: [], II: [], III: [] },
  machineSiderCounts = {},
  gaiterCounts = { I: 1, II: 1, III: 1 },
  assignWorker,
  assignGaiter,
  assignAiCone = () => {},
  assignFitter = () => {},
  dates,
  selectedDate,
  onSelectDate,
  onCopyAllocations,
  onChangeReportDate,
  isSupervisorMode = false,
}) => {
  const [selectedShift, setSelectedShift] = useState<Shift | 'ALL'>('ALL');
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [chosenCopyDate, setChosenCopyDate] = useState('');
  const [chosenCopyShift, setChosenCopyShift] = useState<Shift | 'ALL'>('ALL');
  const shifts: Shift[] = ['I', 'II', 'III'];
  const activeGaiterShifts = selectedShift === 'ALL' ? shifts : [selectedShift as Shift];

  // We map indices of the original entries array to preserve them
  const mappedEntriesWithIndex = entries.map((entry, idx) => ({ entry, idx }));
  
  const filteredEntriesWithIndex = selectedShift === 'ALL'
    ? mappedEntriesWithIndex
    : mappedEntriesWithIndex.filter(item => item.entry.shift === selectedShift);

  // Helper to parse DD/MM/YYYY into JS Date safely
  const parseDateString = (dateStr: string): Date => {
    if (!dateStr) return new Date(0);
    const clean = dateStr.trim();
    const parts = clean.split(/[/.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        const year = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const day = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return new Date(year, month, day);
        }
      } else {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
          return new Date(year, month, day);
        }
      }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  const selectedDateObj = parseDateString(selectedDate);
  const otherDates = dates.filter(d => d !== selectedDate);

  // Find chronologically closest previous date
  let defaultCopyDate = '';
  let minDiff = Infinity;

  otherDates.forEach(d => {
    const dObj = parseDateString(d);
    const diff = selectedDateObj.getTime() - dObj.getTime();
    if (diff > 0 && diff < minDiff) {
      minDiff = diff;
      defaultCopyDate = d;
    }
  });

  // Fallback if no prior date, just pick the most recent other date
  if (!defaultCopyDate && otherDates.length > 0) {
    const sorted = [...otherDates].sort((a, b) => parseDateString(b).getTime() - parseDateString(a).getTime());
    defaultCopyDate = sorted[0];
  }

  const activeCopyDate = chosenCopyDate || defaultCopyDate || (otherDates[0] || '');

  const handleQuickCopy = () => {
    if (!defaultCopyDate) return;
    const shiftLabel = selectedShift === 'ALL' ? 'all shifts' : `Shift ${selectedShift}`;
    if (window.confirm(`Copy allocations from previous day (${defaultCopyDate}) to ${selectedDate} for ${shiftLabel}?`)) {
      onCopyAllocations(defaultCopyDate, selectedShift);
    }
  };

  const handleCustomCopy = () => {
    if (!activeCopyDate) return;
    const shiftLabel = chosenCopyShift === 'ALL' ? 'all shifts' : `Shift ${chosenCopyShift}`;
    if (window.confirm(`Copy allocations from ${activeCopyDate} to ${selectedDate} for ${shiftLabel}?`)) {
      onCopyAllocations(activeCopyDate, chosenCopyShift);
      setShowCopyPanel(false);
    }
  };

  const currentReport = {
    date: selectedDate,
    entries,
    gaiters,
    aiCones,
    timestamp: 0,
    summaries: [],
    totalProductionTarget: 0,
    totalProductionActual: 0,
  } as DailyReport;
  const duplicates = findDuplicatesInReport(currentReport, workers);

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
      {/* Active Duplicate Allocations Warnings & Resolvers */}
      {duplicates.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-[2.5rem] p-10 space-y-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
              <Zap size={22} className="text-rose-600 fill-rose-600 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-black text-rose-950 uppercase tracking-tight">Active Allocation Conflicts Detected</h3>
              <p className="text-xs font-bold text-rose-600 uppercase tracking-widest mt-1">
                The following worker is assigned to multiple active duties on {selectedDate}. Use the quick resolve buttons to correct the statements.
              </p>
            </div>
          </div>

          <div className="divide-y divide-rose-200/40">
            {duplicates.map((dup) => (
              <div key={dup.workerId} className="py-6 first:pt-0 last:pb-0 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div>
                  <h4 className="text-sm font-black text-stone-900 uppercase flex items-center gap-2">
                    {dup.workerName} 
                    <span className="text-stone-400 font-bold">({dup.tNo})</span>
                    <span className="bg-rose-100 text-rose-700 text-[9px] font-black uppercase px-2 py-0.5 rounded-md border border-rose-200">Duplicate</span>
                  </h4>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {dup.allotments.map((alloc, aIdx) => (
                      <span key={aIdx} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200/60 text-stone-700 rounded-xl text-xs font-black uppercase tracking-tight shadow-sm">
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                        {alloc.shift}: {alloc.detail}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  {dup.allotments.map((alloc, aIdx) => {
                    const buttonLabel = alloc.role === 'OPERATOR' 
                      ? `Clear Operator: ${alloc.detail}` 
                      : alloc.role === 'GAITER' 
                      ? `Clear Gaiter Role` 
                      : `Clear AI Cone Role`;

                    const shiftValue = alloc.shift as Shift;

                    return (
                      <button
                        key={aIdx}
                        onClick={() => {
                          if (alloc.role === 'OPERATOR') {
                            const frameNo = alloc.detail.replace('Frame ', '').trim();
                            const entryIdx = entries.findIndex(e => e.frameNo === frameNo && e.shift === shiftValue);
                            if (entryIdx !== -1) {
                              const entry = entries[entryIdx];
                              let slotIdx = 0;
                              if (entry.siderIds) {
                                const foundIdx = entry.siderIds.indexOf(dup.workerId);
                                if (foundIdx !== -1) slotIdx = foundIdx;
                              } else if (entry.siderId === dup.workerId) {
                                slotIdx = 0;
                              }
                              assignWorker(entryIdx, "", slotIdx);
                            }
                          } else if (alloc.role === 'GAITER') {
                            const currentGaiters = gaiters[shiftValue] || [];
                            const newGaiters = currentGaiters.map(id => id === dup.workerId ? "" : id);
                            assignGaiter(shiftValue, newGaiters);
                          } else if (alloc.role === 'AI LINKCONER') {
                            if (assignAiCone) {
                              const currentCones = aiCones[shiftValue] || [];
                              const newCones = currentCones.map(id => id === dup.workerId ? "" : id);
                              assignAiCone(shiftValue, newCones);
                            }
                          }
                        }}
                        className="px-4 py-2.5 bg-white hover:bg-rose-500 hover:text-white text-rose-700 border border-rose-200 hover:border-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm hover:shadow-rose-600/10"
                      >
                        {buttonLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Date & Shift Filtering Controls */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <Filter size={18} />
          </div>
          <div>
            <h3 className="text-base font-black text-stone-900 uppercase tracking-tight">Allocation Selector</h3>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider leading-none mt-0.5">Select date and shift wise filter</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">
          {/* Target Date Calendar Picker */}
          <div className="flex-1 sm:flex-none">
            <label className="block text-[9px] font-black text-stone-400 uppercase tracking-wider mb-1 ml-1">Sider Assigned Date</label>
            <div className="flex items-center gap-2">
              <CalendarDatePicker
                value={selectedDate}
                onChange={(newDate) => {
                  if (newDate && newDate !== selectedDate) {
                    onSelectDate(newDate);
                  }
                }}
              />
              {onChangeReportDate && (
                <button
                  type="button"
                  onClick={() => {
                    const newDateStr = prompt("Enter new date for this report (DD/MM/YYYY):", selectedDate);
                    if (newDateStr && newDateStr.trim()) {
                      onChangeReportDate(selectedDate, newDateStr.trim());
                    }
                  }}
                  className="px-3 py-1.5 bg-stone-900 text-white hover:bg-stone-800 rounded-xl text-[10px] font-black uppercase tracking-wider border border-stone-800 hover:border-stone-700 transition-all active:scale-95 whitespace-nowrap cursor-pointer"
                  title="Change date of current report"
                >
                  Rename Date
                </button>
              )}
            </div>
          </div>

          {/* Shift Wise Dropdown */}
          <div className="flex-1 sm:flex-none">
            <label className="block text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1.5 ml-1">Target Shift</label>
            <div className="relative">
              <select
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value as Shift | 'ALL')}
                className="w-full sm:w-48 px-5 py-3.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-wider text-stone-700 focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all cursor-pointer appearance-none"
              >
                <option value="ALL">ALL SHIFTS</option>
                <option value="I">SHIFT I</option>
                <option value="II">SHIFT II</option>
                <option value="III">SHIFT III</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                <span className="text-xs">⚙️</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Copy Allocation Quick-bar / Dialog */}
      {otherDates.length > 0 && (
        <div className="bg-stone-50 rounded-[2rem] border border-stone-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 text-[10px] font-black uppercase tracking-wider text-amber-800 rounded-lg">
                📋 Roster Helper
              </span>
              <p className="text-xs text-stone-500 font-bold uppercase tracking-wide">
                Assigning same persons for 6 days? Quickly carry forward shift patterns.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {defaultCopyDate && (
                <button
                  onClick={handleQuickCopy}
                  className="px-5 py-3 bg-stone-900 text-white rounded-xl text-xs font-black uppercase tracking-wider hover:bg-stone-800/95 active:scale-95 transition-all shadow-md flex items-center gap-2"
                >
                  <Copy size={13} className="text-amber-400" />
                  Copy {selectedShift === 'ALL' ? 'ALL' : `Shift ${selectedShift}`} from {defaultCopyDate}
                </button>
              )}
              
              <button
                onClick={() => setShowCopyPanel(!showCopyPanel)}
                className="px-5 py-3 bg-white border border-stone-200 text-stone-700 hover:bg-stone-50 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-colors"
              >
                {showCopyPanel ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                Custom Copy Options
              </button>
            </div>
          </div>

          {showCopyPanel && (
            <div className="bg-white border border-stone-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-6 animate-in slide-in-from-top-2 duration-200">
              {/* Source Date Select */}
              <div>
                <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Copy From Date</label>
                <div className="relative">
                  <select
                    value={activeCopyDate}
                    onChange={(e) => setChosenCopyDate(e.target.value)}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold uppercase tracking-wider text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
                  >
                    {otherDates.map(d => (
                      <option key={d} value={d}>
                        {d} {d === defaultCopyDate ? '(Previous Day)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Source Shift Select */}
              <div>
                <label className="block text-[10px] font-black text-stone-400 uppercase tracking-widest mb-1.5">Apply To Shift</label>
                <div className="relative">
                  <select
                    value={chosenCopyShift}
                    onChange={(e) => setChosenCopyShift(e.target.value as Shift | 'ALL')}
                    className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold uppercase tracking-wider text-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500/20"
                  >
                    <option value="ALL">ALL SHIFTS</option>
                    <option value="I">SHIFT I Only</option>
                    <option value="II">SHIFT II Only</option>
                    <option value="III">SHIFT III Only</option>
                  </select>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-end">
                <button
                  onClick={handleCustomCopy}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-colors shadow-lg shadow-emerald-600/15"
                >
                  <Check size={14} />
                  Execute Allocation Copy
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Gaiter Assignment Section */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
        <div className="p-4 md:p-5 border-b border-stone-100 bg-amber-50/30 flex justify-between items-center">
          <div>
            <h2 className="text-base md:text-lg font-black text-stone-900 tracking-tight uppercase">Shift Gaiter Allocation</h2>
            <p className="text-[10px] font-bold text-amber-700 uppercase tracking-wider mt-0.5">Gaiters help all operators in the selected shift</p>
          </div>
          <div className="bg-amber-100 text-amber-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-amber-200">
            <Zap size={14} />
            <span className="text-[10px] font-black uppercase tracking-wider">Support Role</span>
          </div>
        </div>
        
        <div className={cn(
          "p-4 md:p-5 grid gap-4 md:gap-5",
          activeGaiterShifts.length === 1 ? "grid-cols-1 max-w-md" : "grid-cols-1 md:grid-cols-3"
        )}>
          {activeGaiterShifts.map(shift => {
            const gaiterDeptWorkers = workers.filter(w => w.department?.toLowerCase().includes('gaiter'));
            const otherGaiterWorkers = workers.filter(w => !w.department?.toLowerCase().includes('gaiter'));

            return (
              <div key={shift} className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-stone-600 uppercase tracking-wider mb-1">
                  <span className="bg-stone-900 text-white w-5 h-5 flex items-center justify-center rounded text-[10px]">
                    {shift}
                  </span>
                  Shift {shift} Gaiters
                </label>
                
                <div className="space-y-2">
                  {Array.from({ length: Math.max(gaiterCounts[shift] ?? 1, (gaiters[shift] || []).length) }).map((_, gIdx) => (
                    <div key={gIdx} className="relative">
                      <select
                        value={gaiters[shift]?.[gIdx] || ''}
                        onChange={(e) => {
                          const currentCount = Math.max(gaiterCounts[shift] ?? 1, (gaiters[shift] || []).length);
                          const newGaiters = Array.from({ length: currentCount }, (_, i) => (gaiters[shift]?.[i] || ""));
                          newGaiters[gIdx] = e.target.value || "";
                          assignGaiter(shift, newGaiters);
                        }}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-xs font-bold text-stone-800 focus:ring-2 focus:ring-amber-500/10 focus:border-amber-500 outline-none transition-all cursor-pointer appearance-none shadow-xs"
                      >
                        <option value="">-- No Gaiter Assigned --</option>
                        {gaiterDeptWorkers.length > 0 && (
                          <optgroup label="Gaiter Department">
                            {gaiterDeptWorkers.map((worker) => (
                              <option key={worker.id} value={worker.id}>
                                {worker.name} ({worker.tNo})
                              </option>
                            ))}
                          </optgroup>
                        )}
                        <optgroup label={gaiterDeptWorkers.length > 0 ? "All Other Workers" : "All Workers"}>
                          {(gaiterDeptWorkers.length > 0 ? otherGaiterWorkers : workers).map((worker) => (
                            <option key={worker.id} value={worker.id}>
                              {worker.name} ({worker.tNo}) {worker.department ? `[${worker.department}]` : ''}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-amber-500">
                        <Zap size={13} />
                      </div>
                    </div>
                  ))}
                  {(gaiterCounts[shift] ?? 1) === 0 && (
                    <p className="text-[10px] text-stone-400 font-bold uppercase italic text-center p-2.5 border border-dashed border-stone-200 rounded-xl">No gaiters configured in settings</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Shift AI Cone Assignments */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden mb-6">
        <div className="bg-purple-50/50 p-4 md:p-5 border-b border-purple-100 flex items-center justify-between flex-wrap gap-3">
          <div className="text-left">
            <h2 className="text-base md:text-lg font-black text-purple-900 uppercase tracking-tight flex items-center gap-2">
              <Users size={18} className="text-purple-600 shrink-0" />
              <span>Shift AI Cone Allocations</span>
            </h2>
            <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mt-0.5">Select AI Linkconer operator per shift</p>
          </div>
          <div className="bg-purple-100 text-purple-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-purple-200 shrink-0">
            <Zap size={14} />
            <span className="text-[10px] font-black uppercase tracking-wider">AI Role</span>
          </div>
        </div>
        
        <div className={cn(
          "p-4 md:p-5 grid gap-4 md:gap-5",
          activeGaiterShifts.length === 1 ? "grid-cols-1 max-w-md" : "grid-cols-1 md:grid-cols-3"
        )}>
          {activeGaiterShifts.map(shift => {
            const currentSelected = aiCones[shift]?.[0] || '';
            const aiLinkconerWorkers = workers.filter(w => w.department?.toLowerCase().includes('ai'));
            const otherWorkers = workers.filter(w => !w.department?.toLowerCase().includes('ai'));

            return (
              <div key={shift} className="space-y-2">
                <label className="flex items-center gap-1.5 text-[10px] font-black text-stone-600 uppercase tracking-wider mb-1">
                  <span className="bg-purple-900 text-white w-5 h-5 flex items-center justify-center rounded text-[10px]">
                    {shift}
                  </span>
                  Shift {shift} AI Cone
                </label>
                
                <div className="relative">
                  <select
                    value={currentSelected}
                    onChange={(e) => {
                      assignAiCone(shift, [e.target.value || ""]);
                    }}
                    className="w-full px-3 py-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-stone-800 focus:ring-2 focus:ring-purple-500/10 focus:border-purple-500 outline-none transition-all cursor-pointer appearance-none shadow-xs"
                  >
                    <option value="">-- No Worker Assigned --</option>
                    {aiLinkconerWorkers.length > 0 && (
                      <optgroup label="AI Linkconer Department">
                        {aiLinkconerWorkers.map((worker) => (
                          <option key={worker.id} value={worker.id}>
                            {worker.name} ({worker.tNo})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label={aiLinkconerWorkers.length > 0 ? "All Other Workers" : "All Workers"}>
                      {(aiLinkconerWorkers.length > 0 ? otherWorkers : workers).map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.name} ({worker.tNo}) {worker.department ? `[${worker.department}]` : ''}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-purple-500">
                    <Zap size={13} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily Shift Assignments - Ringframe Machine Sider Allocations */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm overflow-hidden">
        <div className="p-4 md:p-5 border-b border-stone-100 bg-stone-50/50 flex justify-between items-center flex-wrap gap-3">
          <div>
            <h2 className="text-base md:text-lg font-black text-stone-900 tracking-tight uppercase flex items-center gap-2">
              <Users size={18} className="text-emerald-700 shrink-0" />
              <span>Ringframe Machine Sider Allocations</span>
            </h2>
            <p className="text-[10px] font-bold text-stone-500 uppercase tracking-wider mt-0.5">
              Assign Siders to Ringframes ({selectedShift === 'ALL' ? 'All Shifts' : `Shift ${selectedShift}`})
            </p>
          </div>
          <div className="bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-xl flex items-center gap-1.5 border border-emerald-200 shrink-0">
            <UserCheck size={14} />
            <span className="text-[10px] font-black uppercase tracking-wider">Live Assignment</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-stone-50/70 border-b border-stone-100">
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-stone-500 w-20">Shift</th>
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-stone-500 w-28">Machine</th>
                <th className="px-4 py-2 text-left text-[10px] font-black uppercase tracking-wider text-stone-500">Assign Sider Operator(s)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filteredEntriesWithIndex.map(({ entry, idx }) => {
                const siderDeptWorkers = workers.filter(w => 
                  w.department?.toLowerCase().includes('sider') || 
                  w.department?.toLowerCase().includes('ring') ||
                  w.department?.toLowerCase().includes('spin')
                );
                const otherSiderWorkers = workers.filter(w => 
                  !w.department?.toLowerCase().includes('sider') && 
                  !w.department?.toLowerCase().includes('ring') &&
                  !w.department?.toLowerCase().includes('spin')
                );

                return (
                  <tr key={`assign-entry-${entry.shift}-${entry.frameNo}-${idx}`} className="hover:bg-emerald-50/20 transition-colors">
                    <td className="px-4 py-2.5 align-top pt-3">
                      <span className="w-6 h-6 flex items-center justify-center bg-stone-900 text-stone-50 rounded text-[11px] font-black shadow-xs">
                        {entry.shift}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 align-top pt-3">
                      <div className="flex items-center gap-1.5">
                        <div className="w-6 h-6 rounded bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                          <Activity size={14} />
                        </div>
                        <span className="font-black text-stone-900 text-xs md:text-sm">{entry.frameNo}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="space-y-1.5 max-w-xl">
                        {Array.from({ length: Math.max((machineSiderCounts[entry.frameNo] !== undefined ? machineSiderCounts[entry.frameNo] : 2), (entry.siderIds || []).length) }).map((_, slotIdx) => (
                          <div key={slotIdx} className="relative">
                            <select
                              value={entry.siderIds?.[slotIdx] || (slotIdx === 0 ? entry.siderId : '') || ''}
                              onChange={(e) => assignWorker(idx, e.target.value, slotIdx)}
                              className="w-full px-3 py-1.5 bg-white border border-stone-200 rounded-lg text-xs font-bold text-stone-800 focus:ring-2 focus:ring-emerald-500/10 focus:border-emerald-600 outline-none transition-all cursor-pointer appearance-none shadow-xs"
                            >
                              <option value="">-- {slotIdx === 0 ? 'LH Side Operator (50% or 100%)' : slotIdx === 1 ? 'RH Side Operator (50% or 100%)' : `Sider Slot ${slotIdx + 1}`} --</option>
                              {siderDeptWorkers.length > 0 && (
                                <optgroup label="Sider / Ringframe Department">
                                  {siderDeptWorkers.map((worker) => (
                                    <option key={worker.id} value={worker.id}>
                                      {worker.name} ({worker.tNo})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              <optgroup label={siderDeptWorkers.length > 0 ? "All Other Workers" : "All Workers"}>
                                {(siderDeptWorkers.length > 0 ? otherSiderWorkers : workers).map((worker) => (
                                  <option key={worker.id} value={worker.id}>
                                    {worker.name} ({worker.tNo}) {worker.department ? `[${worker.department}]` : ''}
                                  </option>
                                ))}
                              </optgroup>
                            </select>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                              <Users size={14} />
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filteredEntriesWithIndex.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-12 text-center text-sm font-bold text-stone-400 uppercase tracking-widest">
                    No machine entries found for the selected shift
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
