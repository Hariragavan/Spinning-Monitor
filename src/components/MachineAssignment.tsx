import React, { useState, useMemo } from 'react';
import { Sider, Shift, ProductionEntry, DailyReport } from '../types';
import { 
  UserCheck, 
  Zap, 
  Activity, 
  Users, 
  Calendar, 
  Filter, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Cpu, 
  Layers, 
  Sparkles, 
  RotateCcw,
  AlertCircle
} from 'lucide-react';
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
  assignMachineGaiter?: (entryIndex: number | number[], gaiterId: string) => void;
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
  assignMachineGaiter,
  assignAiCone = () => {},
  assignFitter = () => {},
  dates,
  selectedDate,
  onSelectDate,
  onCopyAllocations,
  onChangeReportDate,
  isSupervisorMode = false,
}) => {
  const [selectedShift, setSelectedShift] = useState<Shift | 'ALL'>('I');
  const [showCopyPanel, setShowCopyPanel] = useState(false);
  const [chosenCopyDate, setChosenCopyDate] = useState('');
  const [chosenCopyShift, setChosenCopyShift] = useState<Shift | 'ALL'>('ALL');
  const [batchGaiterModalOpen, setBatchGaiterModalOpen] = useState(false);
  const [selectedBatchGaiter, setSelectedBatchGaiter] = useState('');

  const shifts: Shift[] = ['I', 'II', 'III'];

  // Map original indices to preserve references
  const mappedEntriesWithIndex = entries.map((entry, idx) => ({ entry, idx }));
  
  const filteredEntriesWithIndex = selectedShift === 'ALL'
    ? mappedEntriesWithIndex
    : mappedEntriesWithIndex.filter(item => item.entry.shift === selectedShift);

  // Helper to parse dates
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

  // Safe machine gaiter update
  const handleAssignMachineGaiter = (entryIdx: number, gaiterId: string) => {
    if (assignMachineGaiter) {
      assignMachineGaiter(entryIdx, gaiterId);
    } else {
      const entry = entries[entryIdx];
      if (!entry) return;
      const targetShift = entry.shift;
      const curGaiters = gaiters[targetShift] || [];
      const updated = Array.from(new Set([...curGaiters, gaiterId].filter(Boolean)));
      assignGaiter(targetShift, updated);
    }
  };

  // Batch assign gaiter to all filtered machines
  const handleBatchAssignGaiter = () => {
    if (!selectedBatchGaiter) return;
    const indices = filteredEntriesWithIndex.map(item => item.idx);
    if (assignMachineGaiter) {
      assignMachineGaiter(indices, selectedBatchGaiter);
    } else {
      const targetShift = selectedShift !== 'ALL' ? selectedShift : 'I';
      assignGaiter(targetShift, [selectedBatchGaiter]);
    }
    setBatchGaiterModalOpen(false);
    setSelectedBatchGaiter('');
  };

  // Handle "Same as LH" (Both sides)
  const handleCopyLhToRh = (idx: number, lhId: string) => {
    if (!lhId) return;
    assignWorker(idx, lhId, 1);
  };

  // Department-specific worker groupings
  const aiLinkconerWorkers = workers.filter(w => w.department?.toLowerCase().includes('ai'));
  const otherAiWorkers = workers.filter(w => !w.department?.toLowerCase().includes('ai'));

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

  const gaiterDeptWorkers = workers.filter(w => w.department?.toLowerCase().includes('gaiter'));
  const otherGaiterWorkers = workers.filter(w => !w.department?.toLowerCase().includes('gaiter'));

  // Check the maximum number of siders needed across all machines in the current view (supports 1, 2, 3, or 4 siders)
  const maxSidesInView = useMemo(() => {
    let maxSides = 2;
    filteredEntriesWithIndex.forEach(({ entry }) => {
      const configured = machineSiderCounts[entry.frameNo];
      if (configured !== undefined && configured > maxSides) {
        maxSides = configured;
      }
    });
    return maxSides;
  }, [filteredEntriesWithIndex, machineSiderCounts]);

  // Calculate allocation statistics for current view
  const totalMachinesInView = filteredEntriesWithIndex.length;
  const staffedLhCount = filteredEntriesWithIndex.filter(({ entry }) => (entry.siderIds?.[0] || entry.siderId)).length;
  const rhNeededCount = filteredEntriesWithIndex.filter(({ entry }) => (machineSiderCounts[entry.frameNo] ?? 2) >= 2).length;
  const staffedRhCount = filteredEntriesWithIndex.filter(({ entry }) => (machineSiderCounts[entry.frameNo] ?? 2) >= 2 && entry.siderIds?.[1]).length;
  const s3NeededCount = filteredEntriesWithIndex.filter(({ entry }) => (machineSiderCounts[entry.frameNo] ?? 2) >= 3).length;
  const staffedS3Count = filteredEntriesWithIndex.filter(({ entry }) => (machineSiderCounts[entry.frameNo] ?? 2) >= 3 && entry.siderIds?.[2]).length;
  const s4NeededCount = filteredEntriesWithIndex.filter(({ entry }) => (machineSiderCounts[entry.frameNo] ?? 2) >= 4).length;
  const staffedS4Count = filteredEntriesWithIndex.filter(({ entry }) => (machineSiderCounts[entry.frameNo] ?? 2) >= 4 && entry.siderIds?.[3]).length;
  const staffedGaiterCount = filteredEntriesWithIndex.filter(({ entry }) => entry.gaiterId || gaiters[entry.shift]?.[0]).length;

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
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
      {/* ========================================================================= */}
      {/* 1. TOP HEADER: DATE & ROSTER COPY HELPER                                 */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs p-4 md:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
            <Calendar size={18} />
          </div>
          <div>
            <h1 className="text-base md:text-lg font-black text-stone-900 uppercase tracking-tight">
              MACHINE ALLOCATION ROSTER
            </h1>
            <p className="text-[10px] text-stone-400 font-bold uppercase tracking-wider leading-none mt-0.5">
              Assign Siders (LH & RH), Gaiters & Top AI Linkconer
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto items-stretch sm:items-center">
          {/* Target Date Calendar Picker */}
          <div>
            <label className="block text-[9px] font-black text-stone-400 uppercase tracking-wider mb-1 ml-1">
              ALLOCATION DATE
            </label>
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
                  className="px-3 py-2 bg-stone-900 text-white hover:bg-black rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 whitespace-nowrap cursor-pointer shadow-xs"
                  title="Change date of current report"
                >
                  Rename
                </button>
              )}
            </div>
          </div>

          {/* Quick Copy Previous Day Button */}
          {defaultCopyDate && (
            <div className="flex flex-col justify-end">
              <label className="block text-[9px] font-black text-transparent uppercase tracking-wider mb-1 hidden sm:block">
                Copy
              </label>
              <button
                type="button"
                onClick={handleQuickCopy}
                className="px-4 py-2 bg-stone-900 hover:bg-black text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-xs active:scale-95"
                title={`Copy roster from ${defaultCopyDate}`}
              >
                <Copy size={13} className="text-amber-400" />
                <span>Copy from {defaultCopyDate}</span>
              </button>
            </div>
          )}

          {otherDates.length > 1 && (
            <div className="flex flex-col justify-end">
              <label className="block text-[9px] font-black text-transparent uppercase tracking-wider mb-1 hidden sm:block">
                Options
              </label>
              <button
                type="button"
                onClick={() => setShowCopyPanel(!showCopyPanel)}
                className="px-3 py-2 bg-stone-100 border border-stone-200 text-stone-700 hover:bg-stone-200 rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                {showCopyPanel ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>Options</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* CUSTOM COPY PANEL COLLAPSIBLE */}
      {showCopyPanel && (
        <div className="bg-white border border-stone-200 rounded-2xl p-5 grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2 duration-200 shadow-2xs">
          <div>
            <label className="block text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1.5">
              Copy From Date
            </label>
            <select
              value={activeCopyDate}
              onChange={(e) => setChosenCopyDate(e.target.value)}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold uppercase text-stone-800 outline-none focus:border-emerald-500"
            >
              {otherDates.map(d => (
                <option key={d} value={d}>
                  {d} {d === defaultCopyDate ? '(Previous Day)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1.5">
              Apply To Shift
            </label>
            <select
              value={chosenCopyShift}
              onChange={(e) => setChosenCopyShift(e.target.value as Shift | 'ALL')}
              className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold uppercase text-stone-800 outline-none focus:border-emerald-500"
            >
              <option value="ALL">ALL SHIFTS</option>
              <option value="I">SHIFT I Only</option>
              <option value="II">SHIFT II Only</option>
              <option value="III">SHIFT III Only</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleCustomCopy}
              className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Check size={14} />
              <span>Execute Copy</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CONFLICT WARNINGS                                                        */}
      {/* ========================================================================= */}
      {duplicates.length > 0 && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0 border border-rose-200">
              <Zap size={20} className="text-rose-600 fill-rose-600 animate-pulse" />
            </div>
            <div>
              <h3 className="text-sm font-black text-rose-950 uppercase tracking-tight">
                Active Allocation Conflicts Detected ({duplicates.length})
              </h3>
              <p className="text-[11px] font-bold text-rose-700 mt-0.5">
                Workers allocated to multiple duties on {selectedDate}. Use buttons below to clear conflicts.
              </p>
            </div>
          </div>

          <div className="divide-y divide-rose-200/50">
            {duplicates.map((dup) => (
              <div key={dup.workerId} className="py-3 first:pt-0 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-black text-stone-900 uppercase flex items-center gap-2">
                    <span>{dup.workerName}</span>
                    <span className="text-stone-400 font-bold font-mono">({dup.tNo})</span>
                    <span className="bg-rose-200/60 text-rose-800 text-[9px] font-black uppercase px-1.5 py-0.5 rounded">
                      Double Booked
                    </span>
                  </h4>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {dup.allotments.map((alloc, aIdx) => (
                      <span key={aIdx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-rose-200 text-stone-700 rounded-md text-[10px] font-black uppercase">
                        <span className="w-1.5 h-1.5 bg-rose-500 rounded-full"></span>
                        {alloc.shift}: {alloc.detail}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {dup.allotments.map((alloc, aIdx) => {
                    const shiftValue = alloc.shift as Shift;
                    return (
                      <button
                        key={aIdx}
                        type="button"
                        onClick={() => {
                          if (alloc.role === 'OPERATOR') {
                            const frameNo = alloc.detail.replace('Frame ', '').trim();
                            const entryIdx = entries.findIndex(e => e.frameNo === frameNo && e.shift === shiftValue);
                            if (entryIdx !== -1) {
                              const entry = entries[entryIdx];
                              if (entry.siderIds) {
                                const foundIdx = entry.siderIds.indexOf(dup.workerId);
                                if (foundIdx !== -1) assignWorker(entryIdx, "", foundIdx);
                              } else {
                                assignWorker(entryIdx, "", 0);
                              }
                            }
                          } else if (alloc.role === 'GAITER') {
                            const entryIdx = entries.findIndex(e => e.gaiterId === dup.workerId && e.shift === shiftValue);
                            if (entryIdx !== -1) {
                              handleAssignMachineGaiter(entryIdx, "");
                            } else {
                              const currentGaiters = gaiters[shiftValue] || [];
                              assignGaiter(shiftValue, currentGaiters.map(id => id === dup.workerId ? "" : id));
                            }
                          } else if (alloc.role === 'AI LINKCONER') {
                            assignAiCone(shiftValue, [""]);
                          }
                        }}
                        className="px-3 py-1.5 bg-white hover:bg-rose-600 hover:text-white text-rose-700 border border-rose-200 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                      >
                        Clear {alloc.role}: {alloc.detail}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. SECTION 1: AI LINKCONER ALLOCATION (TOP AS REQUESTED)                 */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-slate-900 rounded-2xl p-5 text-white shadow-sm border border-purple-800/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-purple-800/50 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center border border-purple-400/20">
              <Cpu size={18} />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-black uppercase tracking-wider text-white">
                AI LINKCONER ALLOCATIONS
              </h2>
              <p className="text-[11px] text-purple-200 font-medium">
                1 dedicated Linkconer operator per shift
              </p>
            </div>
          </div>
          <span className="px-3 py-1 bg-purple-500/20 text-purple-200 border border-purple-400/30 rounded-full text-[10px] font-black uppercase tracking-wider self-start sm:self-auto">
            TOP PRIORITY ALLOCATION
          </span>
        </div>

        {/* 3 Shift Cards side-by-side */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {shifts.map(shift => {
            const currentSelected = aiCones[shift]?.[0] || '';
            const assignedWorker = workers.find(w => w.id === currentSelected);

            return (
              <div 
                key={`ai-cone-${shift}`} 
                className={cn(
                  "p-3.5 rounded-xl border transition-all",
                  selectedShift === shift 
                    ? "bg-purple-950/70 border-purple-400 ring-2 ring-purple-400/30" 
                    : "bg-white/10 backdrop-blur-xs border-white/10 hover:border-purple-400/40"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wider text-purple-200">
                    <span className="w-5 h-5 rounded-md bg-purple-400 text-purple-950 flex items-center justify-center text-[10px] font-black">
                      {shift}
                    </span>
                    Shift {shift} Linkconer
                  </span>
                  {assignedWorker && (
                    <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                      T.No {assignedWorker.tNo}
                    </span>
                  )}
                </div>

                <div className="relative">
                  <select
                    value={currentSelected}
                    onChange={(e) => assignAiCone(shift, [e.target.value || ''])}
                    className="w-full px-3 py-2 bg-purple-950/90 border border-purple-400/40 rounded-lg text-xs font-bold text-white focus:ring-2 focus:ring-purple-400 focus:outline-none cursor-pointer appearance-none"
                  >
                    <option value="" className="bg-stone-900 text-stone-400">-- No Linkconer Assigned --</option>
                    {aiLinkconerWorkers.length > 0 && (
                      <optgroup label="AI Linkconer Department" className="bg-stone-900 text-purple-300 font-bold">
                        {aiLinkconerWorkers.map(w => (
                          <option key={w.id} value={w.id} className="bg-stone-900 text-white">
                            {w.name} ({w.tNo})
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="All Other Workers" className="bg-stone-900 text-stone-400">
                      {otherAiWorkers.map(w => (
                        <option key={w.id} value={w.id} className="bg-stone-900 text-white">
                          {w.name} ({w.tNo}) {w.department ? `[${w.department}]` : ''}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-purple-400">
                    <Zap size={13} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. SECTION 2: SHIFT SELECTION BAR (TO SEPARATE BY SHIFT)                 */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-stone-200 shadow-2xs">
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
            <Filter size={15} className="text-emerald-700" />
            <span>SELECT SHIFT FOR MACHINE ALLOCATIONS</span>
          </h3>
          <p className="text-[11px] text-stone-500 font-medium mt-0.5">
            Switch shifts below to allocate LH Sider, RH Sider & Gaiter per machine
          </p>
        </div>

        {/* Shift Tabs */}
        <div className="inline-flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200 self-stretch sm:self-auto justify-center">
          {(['I', 'II', 'III', 'ALL'] as (Shift | 'ALL')[]).map(s => {
            const isSelected = selectedShift === s;
            const countForShift = s === 'ALL' 
              ? entries.length 
              : entries.filter(e => e.shift === s).length;

            return (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedShift(s)}
                className={cn(
                  "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                  isSelected
                    ? "bg-stone-900 text-white shadow-xs"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50"
                )}
              >
                <span>{s === 'ALL' ? 'ALL SHIFTS' : `SHIFT ${s}`}</span>
                <span className={cn(
                  "text-[10px] font-mono px-1.5 py-0.2 rounded font-bold",
                  isSelected ? "bg-white/20 text-white" : "bg-stone-200 text-stone-600"
                )}>
                  {countForShift}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. SECTION 3: RINGFRAME MACHINE ALLOCATION TABLE                         */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
        {/* Table Subheader with Staffing Metrics & Batch Fill Helper */}
        <div className="p-4 md:p-5 border-b border-stone-100 bg-stone-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
              <Users size={16} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
                <span>RINGFRAME MACHINE ALLOCATIONS</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black font-mono">
                  {selectedShift === 'ALL' ? 'ALL SHIFTS' : `SHIFT ${selectedShift}`}
                </span>
              </h3>
              <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                Staffing: {staffedLhCount}/{totalMachinesInView} LH · {staffedRhCount}/{rhNeededCount} RH
                {s3NeededCount > 0 && ` · ${staffedS3Count}/${s3NeededCount} S3`}
                {s4NeededCount > 0 && ` · ${staffedS4Count}/${s4NeededCount} S4`}
                 · {staffedGaiterCount}/{totalMachinesInView} Gaiters
              </p>
            </div>
          </div>

          {/* Batch Gaiter Quick Fill Action */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setBatchGaiterModalOpen(true)}
              className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-2xs cursor-pointer transition-all active:scale-95"
              title="Apply 1 gaiter to all machines in this shift view"
            >
              <Zap size={13} />
              <span>Batch Fill Gaiter ({selectedShift === 'ALL' ? 'All' : `Shift ${selectedShift}`})</span>
            </button>
          </div>
        </div>

        {/* ALLOCATION GRID */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-100 text-[10px] font-black uppercase tracking-wider text-stone-500">
                <th className="px-4 py-3 w-16">SHIFT</th>
                <th className="px-4 py-3 w-32">MACHINE</th>
                <th className="px-4 py-3 min-w-[210px]">
                  <span className="flex items-center gap-1 text-emerald-800">
                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                    LH SIDER (50% LEFT)
                  </span>
                </th>
                <th className="px-4 py-3 min-w-[240px]">
                  <span className="flex items-center gap-1 text-blue-800">
                    <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                    RH SIDER (50% RIGHT)
                  </span>
                </th>
                {maxSidesInView >= 3 && (
                  <th className="px-4 py-3 min-w-[200px]">
                    <span className="flex items-center gap-1 text-purple-800">
                      <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                      SIDER 3 (S3)
                    </span>
                  </th>
                )}
                {maxSidesInView >= 4 && (
                  <th className="px-4 py-3 min-w-[200px]">
                    <span className="flex items-center gap-1 text-indigo-800">
                      <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                      SIDER 4 (S4)
                    </span>
                  </th>
                )}
                <th className="px-4 py-3 min-w-[210px]">
                  <span className="flex items-center gap-1 text-amber-800">
                    <span className="w-2 h-2 rounded-full bg-amber-600"></span>
                    GAITER ALLOCATION
                  </span>
                </th>
                <th className="px-4 py-3 text-right w-36">COVERAGE STATUS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs">
              {filteredEntriesWithIndex.length === 0 ? (
                <tr>
                  <td colSpan={4 + (maxSidesInView >= 3 ? 1 : 0) + (maxSidesInView >= 4 ? 1 : 0)} className="py-12 text-center text-stone-400 italic">
                    No machine entries found for {selectedShift === 'ALL' ? 'any shift' : `Shift ${selectedShift}`}.
                  </td>
                </tr>
              ) : (
                filteredEntriesWithIndex.map(({ entry, idx }) => {
                  const targetSides = machineSiderCounts[entry.frameNo] !== undefined 
                    ? machineSiderCounts[entry.frameNo] 
                    : 2;

                  const lhWorkerId = entry.siderIds?.[0] || entry.siderId || '';
                  const rhWorkerId = entry.siderIds?.[1] || '';
                  const s3WorkerId = entry.siderIds?.[2] || '';
                  const s4WorkerId = entry.siderIds?.[3] || '';
                  const machineGaiterId = entry.gaiterId || (gaiters[entry.shift]?.[0] || '');

                  const activeAssignedSlots = [
                    lhWorkerId,
                    targetSides >= 2 ? rhWorkerId : null,
                    targetSides >= 3 ? s3WorkerId : null,
                    targetSides >= 4 ? s4WorkerId : null,
                  ].filter(Boolean) as string[];

                  const assignedCount = activeAssignedSlots.length;
                  const isSidersFull = assignedCount >= targetSides;
                  const isBothSides = targetSides === 2 && Boolean(lhWorkerId && rhWorkerId && lhWorkerId === rhWorkerId);
                  const isFullCrew = isSidersFull && Boolean(machineGaiterId);
                  const isStaffedWithoutGaiter = isSidersFull && !machineGaiterId;

                  return (
                    <tr 
                      key={`assign-row-${entry.shift}-${entry.frameNo}-${idx}`}
                      className="hover:bg-stone-50/60 transition-colors group"
                    >
                      {/* SHIFT */}
                      <td className="px-4 py-3.5 align-middle">
                        <span className="w-7 h-7 flex items-center justify-center bg-stone-900 text-stone-50 rounded-lg text-xs font-black shadow-2xs font-mono">
                          {entry.shift}
                        </span>
                      </td>

                      {/* MACHINE */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-sm text-stone-900">
                              {entry.frameNo}
                            </span>
                          </div>
                          {entry.count && (
                            <span className="inline-block mt-0.5 font-mono text-[10px] font-bold text-stone-400">
                              {entry.count}
                            </span>
                          )}
                          <div className="mt-1">
                            <span className={cn(
                              "text-[9px] font-black uppercase px-1.5 py-0.5 rounded border tracking-wider",
                              targetSides === 4 
                                ? "bg-indigo-50 text-indigo-800 border-indigo-200" 
                                : targetSides === 3 
                                ? "bg-purple-50 text-purple-800 border-purple-200" 
                                : targetSides === 1 
                                ? "bg-stone-100 text-stone-600 border-stone-200" 
                                : "bg-blue-50 text-blue-800 border-blue-200"
                            )}>
                              {targetSides} Sider{targetSides > 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* LH SIDER (50% LEFT / SLOT 0) */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="relative">
                          <select
                            value={lhWorkerId}
                            onChange={(e) => assignWorker(idx, e.target.value, 0)}
                            className="w-full px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all cursor-pointer font-mono"
                          >
                            <option value="">-- No LH Sider Assigned --</option>
                            {siderDeptWorkers.length > 0 && (
                              <optgroup label="Sider / Ringframe Department">
                                {siderDeptWorkers.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.tNo})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="All Other Workers">
                              {otherSiderWorkers.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name} ({w.tNo}) {w.department ? `[${w.department}]` : ''}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                        </div>
                      </td>

                      {/* RH SIDER (50% RIGHT / SLOT 1) + BOTH SIDES SHORTCUT */}
                      <td className="px-4 py-3.5 align-middle">
                        {targetSides >= 2 ? (
                          <div className="flex items-center gap-1.5">
                            <div className="relative flex-1">
                              <select
                                value={rhWorkerId}
                                onChange={(e) => assignWorker(idx, e.target.value, 1)}
                                className={cn(
                                  "w-full px-3 py-2 border rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all cursor-pointer font-mono",
                                  isBothSides 
                                    ? "bg-emerald-50/70 border-emerald-300 text-emerald-950 font-black" 
                                    : "bg-stone-50 border-stone-200"
                                )}
                              >
                                <option value="">-- No RH Sider Assigned --</option>
                                {siderDeptWorkers.length > 0 && (
                                  <optgroup label="Sider / Ringframe Department">
                                    {siderDeptWorkers.map((w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.name} ({w.tNo})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="All Other Workers">
                                  {otherSiderWorkers.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name} ({w.tNo}) {w.department ? `[${w.department}]` : ''}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>

                            {/* Quick Both Sides Button */}
                            <button
                              type="button"
                              onClick={() => handleCopyLhToRh(idx, lhWorkerId)}
                              disabled={!lhWorkerId || isBothSides}
                              className={cn(
                                "px-2.5 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap border shrink-0",
                                isBothSides
                                  ? "bg-emerald-600 text-white border-emerald-600 cursor-default"
                                  : lhWorkerId
                                  ? "bg-white hover:bg-stone-100 text-stone-700 border-stone-200 active:scale-95"
                                  : "bg-stone-100 text-stone-300 border-stone-200 cursor-not-allowed"
                              )}
                              title={isBothSides ? "Both sides managed by same sider" : "Click to assign LH Sider to RH side (100% Both Sides)"}
                            >
                              {isBothSides ? '= Both' : '+ Both'}
                            </button>
                          </div>
                        ) : (
                          <div className="px-3 py-2 bg-stone-100/60 border border-dashed border-stone-200 rounded-xl text-center text-stone-400 text-xs font-bold italic">
                            1 Side (LH Only)
                          </div>
                        )}
                      </td>

                      {/* SIDER 3 (SLOT 2) - WHEN SHOWN */}
                      {maxSidesInView >= 3 && (
                        <td className="px-4 py-3.5 align-middle">
                          {targetSides >= 3 ? (
                            <div className="relative">
                              <select
                                value={s3WorkerId}
                                onChange={(e) => assignWorker(idx, e.target.value, 2)}
                                className="w-full px-3 py-2 bg-purple-50/50 border border-purple-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all cursor-pointer font-mono"
                              >
                                <option value="">-- No S3 Sider Assigned --</option>
                                {siderDeptWorkers.length > 0 && (
                                  <optgroup label="Sider / Ringframe Department">
                                    {siderDeptWorkers.map((w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.name} ({w.tNo})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="All Other Workers">
                                  {otherSiderWorkers.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name} ({w.tNo}) {w.department ? `[${w.department}]` : ''}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>
                          ) : (
                            <div className="px-3 py-2 text-center text-stone-300 text-xs font-medium italic">
                              —
                            </div>
                          )}
                        </td>
                      )}

                      {/* SIDER 4 (SLOT 3) - WHEN SHOWN */}
                      {maxSidesInView >= 4 && (
                        <td className="px-4 py-3.5 align-middle">
                          {targetSides >= 4 ? (
                            <div className="relative">
                              <select
                                value={s4WorkerId}
                                onChange={(e) => assignWorker(idx, e.target.value, 3)}
                                className="w-full px-3 py-2 bg-indigo-50/50 border border-indigo-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all cursor-pointer font-mono"
                              >
                                <option value="">-- No S4 Sider Assigned --</option>
                                {siderDeptWorkers.length > 0 && (
                                  <optgroup label="Sider / Ringframe Department">
                                    {siderDeptWorkers.map((w) => (
                                      <option key={w.id} value={w.id}>
                                        {w.name} ({w.tNo})
                                      </option>
                                    ))}
                                  </optgroup>
                                )}
                                <optgroup label="All Other Workers">
                                  {otherSiderWorkers.map((w) => (
                                    <option key={w.id} value={w.id}>
                                      {w.name} ({w.tNo}) {w.department ? `[${w.department}]` : ''}
                                    </option>
                                  ))}
                                </optgroup>
                              </select>
                            </div>
                          ) : (
                            <div className="px-3 py-2 text-center text-stone-300 text-xs font-medium italic">
                              —
                            </div>
                          )}
                        </td>
                      )}

                      {/* GAITER ALLOCATION (PER MACHINE) */}
                      <td className="px-4 py-3.5 align-middle">
                        <div className="relative">
                          <select
                            value={machineGaiterId}
                            onChange={(e) => handleAssignMachineGaiter(idx, e.target.value)}
                            className="w-full px-3 py-2 bg-amber-50/40 border border-amber-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none transition-all cursor-pointer font-mono"
                          >
                            <option value="">-- No Gaiter Assigned --</option>
                            {gaiterDeptWorkers.length > 0 && (
                              <optgroup label="Gaiter Department">
                                {gaiterDeptWorkers.map((w) => (
                                  <option key={w.id} value={w.id}>
                                    {w.name} ({w.tNo})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                            <optgroup label="All Other Workers">
                              {otherGaiterWorkers.map((w) => (
                                <option key={w.id} value={w.id}>
                                  {w.name} ({w.tNo}) {w.department ? `[${w.department}]` : ''}
                                </option>
                              ))}
                            </optgroup>
                          </select>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-amber-500">
                            <Zap size={13} />
                          </div>
                        </div>
                      </td>

                      {/* COVERAGE STATUS */}
                      <td className="px-4 py-3.5 align-middle text-right">
                        {isFullCrew && isBothSides ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-[10px] font-black uppercase">
                            <Check size={11} className="stroke-[3]" />
                            <span>Both Sides + Gaiter</span>
                          </span>
                        ) : isFullCrew ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-black uppercase">
                            <Check size={11} className="stroke-[3]" />
                            <span>{targetSides}/{targetSides} Full Crew</span>
                          </span>
                        ) : isStaffedWithoutGaiter && isBothSides ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-black uppercase">
                            <span>Both (No Gaiter)</span>
                          </span>
                        ) : isStaffedWithoutGaiter ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-[10px] font-black uppercase">
                            <span>{targetSides}/{targetSides} Staffed</span>
                          </span>
                        ) : assignedCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-[10px] font-black uppercase">
                            <span>Partial ({assignedCount}/{targetSides})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-stone-100 text-stone-400 rounded-lg text-[10px] font-bold uppercase">
                            <span>Unassigned</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. BATCH GAITER ASSIGN MODAL                                              */}
      {/* ========================================================================= */}
      {batchGaiterModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center">
                  <Zap size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-stone-900 uppercase">
                    BATCH APPLY SHIFT GAITER
                  </h3>
                  <p className="text-[10px] text-stone-400 font-bold uppercase">
                    Target: {selectedShift === 'ALL' ? 'All Active Shifts' : `Shift ${selectedShift}`} ({filteredEntriesWithIndex.length} Machines)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBatchGaiterModalOpen(false)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Choose Gaiter to Assign:
                </label>
                <select
                  value={selectedBatchGaiter}
                  onChange={(e) => setSelectedBatchGaiter(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 outline-none focus:border-amber-500 font-mono"
                >
                  <option value="">-- Select Gaiter Operator --</option>
                  {gaiterDeptWorkers.length > 0 && (
                    <optgroup label="Gaiter Department">
                      {gaiterDeptWorkers.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name} ({w.tNo})
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="All Other Workers">
                    {otherGaiterWorkers.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.tNo}) {w.department ? `[${w.department}]` : ''}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <span className="block text-[10px] text-stone-400 mt-1">
                  This will set the chosen gaiter for all {filteredEntriesWithIndex.length} ringframes in the current view in one single click.
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setBatchGaiterModalOpen(false)}
                className="px-4 py-2 text-stone-500 font-bold text-xs cursor-pointer hover:text-stone-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedBatchGaiter}
                onClick={handleBatchAssignGaiter}
                className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer"
              >
                Apply to All Machines
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
