'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, RefreshCw, Search, Link2, Unlink, Sparkles, CheckCircle2, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MachineMasterItem, MachineEmData } from '@/types';

// The 46 IoT Machines available from iot_machines / iot_em
const IOT_MACHINES_LIST = Array.from({ length: 46 }, (_, i) => `RF${String(i + 1).padStart(2, '0')}`);

interface IotMachineMatchingSettingsProps {
  machines: MachineMasterItem[];
  currentMappings?: Record<string, string>;
  mappingsByDate?: Record<string, Record<string, string>>;
  machineEm: MachineEmData;
  activeDate?: string;
  onSaveMappings: (mappings: Record<string, string>, date?: string) => Promise<void>;
  onMachineEmUpdated: (newEmData: MachineEmData) => void;
}

export const IotMachineMatchingSettings: React.FC<IotMachineMatchingSettingsProps> = ({
  machines,
  currentMappings = {},
  mappingsByDate = {},
  machineEm,
  activeDate,
  onSaveMappings,
  onMachineEmUpdated
}) => {
  // Only Shed 1, Shed 2, Shed 3 are involved (KTTM is strictly excluded)
  const [selectedShed, setSelectedShed] = useState<'Shed 1' | 'Shed 2' | 'Shed 3'>('Shed 1');

  // Selected Date for assignment (defaults to activeDate or today YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return activeDate || new Date().toISOString().slice(0, 10);
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [recentlySynced, setRecentlySynced] = useState<string | null>(null);

  // Live EM by IoT machine: { [iotMachineNo]: { emTotal, emLeft, emRight, shift, hour, date } }
  const [iotLiveEmMap, setIotLiveEmMap] = useState<Record<string, {
    machineNo: string;
    emTotal: number;
    shift: number;
    hour: number;
    date: string;
  }>>({});

  // Continuous Carry-Forward Resolution Algorithm:
  // Finds the most recent mapping on or before targetDate
  const resolveEffectiveMapping = useCallback((targetDate: string): { mapping: Record<string, string>; sourceDate: string } => {
    if (mappingsByDate && Object.keys(mappingsByDate).length > 0) {
      const dates = Object.keys(mappingsByDate).filter(d => d <= targetDate).sort().reverse();
      if (dates.length > 0 && mappingsByDate[dates[0]]) {
        return { mapping: mappingsByDate[dates[0]], sourceDate: dates[0] };
      }
    }
    return { mapping: currentMappings || {}, sourceDate: targetDate };
  }, [mappingsByDate, currentMappings]);

  // Active mappings for the selected date
  const [mappings, setMappings] = useState<Record<string, string>>(() => {
    return resolveEffectiveMapping(selectedDate).mapping;
  });

  const effectiveSource = useMemo(() => {
    return resolveEffectiveMapping(selectedDate);
  }, [resolveEffectiveMapping, selectedDate]);

  // When date changes, update mapping using carry-forward logic
  useEffect(() => {
    const eff = resolveEffectiveMapping(selectedDate);
    setMappings(eff.mapping);
  }, [selectedDate, resolveEffectiveMapping]);

  // Load latest EM for all 46 IoT machines
  const loadIotEmData = useCallback(async () => {
    try {
      const res = await fetch(`/api/iot/em/live-by-machine?_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setIotLiveEmMap(json.data);
        }
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    loadIotEmData();
  }, [loadIotEmData]);

  // Track allocated IoT machines to enforce STRICT 1-TO-1 UNIQUE ALLOCATION
  const allocatedIotToFrame = useMemo(() => {
    const map = new Map<string, string>();
    for (const [frame, iotNo] of Object.entries(mappings)) {
      if (iotNo && iotNo !== 'NONE') {
        map.set(iotNo, frame);
      }
    }
    return map;
  }, [mappings]);

  // Filter spinning machines strictly by selected shed (Shed 1, 2, or 3 only)
  const shedMachines = useMemo(() => {
    return machines
      .filter(m => (m.shed || 'Shed 1') === selectedShed)
      .sort((a, b) => {
        const aRf = a.rfNo || (a as any).frameNo || '';
        const bRf = b.rfNo || (b as any).frameNo || '';
        return aRf.localeCompare(bRf, undefined, { numeric: true });
      });
  }, [machines, selectedShed]);

  // Search filtered
  const filteredMachines = useMemo(() => {
    if (!searchQuery.trim()) return shedMachines;
    const q = searchQuery.toLowerCase().trim();
    return shedMachines.filter(m => {
      const rf = (m.rfNo || (m as any).frameNo || '').toLowerCase();
      const mapped = (mappings[rf] || '').toLowerCase();
      return rf.includes(q) || mapped.includes(q);
    });
  }, [shedMachines, searchQuery, mappings]);

  // Sync EM for updated mappings into spinning monitor for selectedDate
  const syncMappingsToSpinning = useCallback(async (newMappings: Record<string, string>, highlightMachine?: string) => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/iot/em/sync-to-spinning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappings: newMappings, date: selectedDate })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.machineEm) {
          onMachineEmUpdated(json.machineEm);
          if (highlightMachine) {
            setRecentlySynced(highlightMachine);
            setTimeout(() => setRecentlySynced(null), 3000);
          }
        }
      }
      await onSaveMappings(newMappings, selectedDate);
      await loadIotEmData();
    } catch (err) {
      console.error('Failed to sync IoT EM to spinning:', err);
    } finally {
      setIsSyncing(false);
    }
  }, [selectedDate, onMachineEmUpdated, onSaveMappings, loadIotEmData]);

  // Assign an IoT machine: GUARANTEES STRICT 1-TO-1 UNIQUE ALLOCATION
  const handleAssignMachine = async (spinningFrameNo: string, iotMachineNo: string) => {
    const updated = { ...mappings };

    if (!iotMachineNo || iotMachineNo === 'NONE') {
      delete updated[spinningFrameNo];
    } else {
      // If this IoT machine is already assigned to another frame, remove it from that frame
      for (const [otherFrame, assignedIot] of Object.entries(updated)) {
        if (assignedIot === iotMachineNo && otherFrame !== spinningFrameNo) {
          delete updated[otherFrame];
        }
      }
      updated[spinningFrameNo] = iotMachineNo;
    }

    setMappings(updated);
    await syncMappingsToSpinning(updated, spinningFrameNo);
  };

  // Auto-match for the current shed: matches only available unassigned IoT machines 1-to-1
  const handleAutoMatchShed = async () => {
    const updated = { ...mappings };
    shedMachines.forEach(m => {
      const rf = (m.rfNo || (m as any).frameNo || '').trim();
      const numeric = parseInt(rf.replace(/\D/g, ''), 10);
      if (!isNaN(numeric) && numeric >= 1 && numeric <= 46) {
        const iotId = `RF${String(numeric).padStart(2, '0')}`;
        // Ensure not already taken by another frame
        const currentOwner = updated[rf];
        const takenBy = Object.entries(updated).find(([f, id]) => id === iotId && f !== rf);
        if (!takenBy || currentOwner === iotId) {
          updated[rf] = iotId;
        }
      }
    });
    setMappings(updated);
    await syncMappingsToSpinning(updated);
  };

  // Clear mappings for current shed
  const handleClearShed = async () => {
    const updated = { ...mappings };
    shedMachines.forEach(m => {
      const rf = (m.rfNo || (m as any).frameNo || '').trim();
      delete updated[rf];
    });
    setMappings(updated);
    await syncMappingsToSpinning(updated);
  };

  // Total mapped count in current shed
  const mappedCountInShed = useMemo(() => {
    return shedMachines.filter(m => {
      const rf = m.rfNo || (m as any).frameNo || '';
      return Boolean(mappings[rf]);
    }).length;
  }, [shedMachines, mappings]);

  return (
    <div className="bg-stone-50/80 p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xs space-y-6">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 bg-blue-500/10 border border-blue-300 text-blue-700 rounded-2xl flex items-center justify-center shrink-0 shadow-2xs">
            <Activity size={22} className="text-blue-600" />
          </div>
          <div>
            <h3 className="text-lg sm:text-xl font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
              <span>IoT Machine Matching & EM Settings</span>
              <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                1-to-1 Allocation · Table: iot_em
              </span>
            </h3>
            <p className="text-xs text-stone-500 font-bold mt-0.5">
              Assign spinning machines to IoT machines. Persistent per date with continuous carry-forward until changed.
            </p>
          </div>
        </div>

        {/* TOP ACTIONS */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleAutoMatchShed}
            disabled={isSyncing || shedMachines.length === 0}
            className="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            title="Automatically match spinning frame numbers with corresponding RF numbers"
          >
            <Sparkles size={13} className="text-blue-200" />
            <span>Auto-Match {selectedShed}</span>
          </button>

          <button
            onClick={() => syncMappingsToSpinning(mappings)}
            disabled={isSyncing}
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            title="Pull latest EM from iot_em for all mapped machines and update spinning dashboard"
          >
            <RefreshCw size={13} className={cn("text-emerald-200", isSyncing && "animate-spin")} />
            <span>{isSyncing ? 'Syncing EM...' : 'Sync Mapped EM'}</span>
          </button>

          {mappedCountInShed > 0 && (
            <button
              onClick={handleClearShed}
              disabled={isSyncing}
              className="px-3 py-2 bg-white hover:bg-stone-100 text-stone-600 border border-stone-200 rounded-xl text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1"
              title="Clear all mappings in this shed"
            >
              <Unlink size={12} />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* DATE SELECTOR & CARRY-FORWARD BANNER */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-stone-200 shadow-2xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-blue-600" />
            <span className="text-xs font-bold text-stone-700">Assignment Date:</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="border border-stone-300 rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-stone-800 bg-stone-50 outline-hidden focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {effectiveSource.sourceDate !== selectedDate ? (
            <span className="text-[10.5px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200">
              ⚡ Continuous: Inherited from <strong>{effectiveSource.sourceDate}</strong> until changed
            </span>
          ) : (
            <span className="text-[10.5px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
              ✓ Configured specifically for <strong>{selectedDate}</strong>
            </span>
          )}
        </div>

        <span className="text-[11px] font-mono font-bold text-stone-500">
          Strict 1-to-1 IoT Allocation Active
        </span>
      </div>

      {/* SHED TABS (SHED 1, SHED 2, SHED 3 ONLY - KTTM EXCLUDED) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex p-1 bg-white border border-stone-200 rounded-2xl shadow-2xs gap-1">
          {(['Shed 1', 'Shed 2', 'Shed 3'] as const).map(shed => {
            const isSelected = selectedShed === shed;
            const shedCount = machines.filter(m => (m.shed || 'Shed 1') === shed).length;
            const shedMapped = machines.filter(m => {
              const rf = m.rfNo || (m as any).frameNo || '';
              return (m.shed || 'Shed 1') === shed && Boolean(mappings[rf]);
            }).length;

            return (
              <button
                key={shed}
                onClick={() => setSelectedShed(shed)}
                className={cn(
                  "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2",
                  isSelected
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                )}
              >
                <span>{shed}</span>
                <span className={cn(
                  "px-2 py-0.5 rounded-full text-[10px] font-mono",
                  isSelected ? "bg-white/20 text-white font-bold" : "bg-stone-100 text-stone-600 font-semibold"
                )}>
                  {shedMapped}/{shedCount} Mapped
                </span>
              </button>
            );
          })}
        </div>

        {/* SEARCH BAR */}
        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            placeholder={`Search ${selectedShed} machine or RF...`}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-stone-800 placeholder-stone-400 outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-2xs"
          />
        </div>
      </div>

      {/* INFO STRIP */}
      <div className="bg-blue-50/70 border border-blue-200/80 rounded-2xl p-3.5 text-xs text-blue-900 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">ℹ️</span>
          <span>
            Selecting an IoT machine assigns that frame to pull End Mending (EM) from <strong>iot_em</strong>.
            Only <strong>EM telemetry</strong> is updated in the Spinning Monitor dashboard.
          </span>
        </div>
        <span className="text-[11px] font-mono font-bold text-blue-700 bg-white px-2.5 py-0.5 rounded-lg border border-blue-200 shrink-0">
          {mappedCountInShed} of {shedMachines.length} frames assigned
        </span>
      </div>

      {/* MACHINE MATCHING LIST */}
      {filteredMachines.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-stone-200 shadow-2xs">
          <p className="text-sm font-bold text-stone-400">No spinning frames found in {selectedShed}.</p>
          <p className="text-xs text-stone-400 mt-1">Register machines in Machine Master or upload a statement to assign IoT mappings.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredMachines.map(m => {
            const rf = (m.rfNo || (m as any).frameNo || 'M').trim();
            const currentIot = mappings[rf] || '';
            const liveEmData = currentIot ? iotLiveEmMap[currentIot] : null;
            const isJustSynced = recentlySynced === rf;

            return (
              <div
                key={rf}
                className={cn(
                  "bg-white rounded-2xl p-4 border transition-all shadow-2xs hover:shadow-md flex flex-col justify-between gap-3",
                  currentIot ? "border-blue-200 bg-blue-50/20" : "border-stone-200",
                  isJustSynced && "ring-2 ring-emerald-500 bg-emerald-50/30"
                )}
              >
                {/* MACHINE ROW HEADER */}
                <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-xl bg-stone-900 text-stone-50 font-black font-mono text-xs shadow-2xs">
                      {rf}
                    </span>
                    <div>
                      <span className="text-[10.5px] font-bold text-stone-500 uppercase tracking-wider">
                        {selectedShed}
                      </span>
                      {m.description && (
                        <p className="text-[10px] text-stone-400 truncate max-w-[120px] font-medium leading-none mt-0.5">
                          {m.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* LIVE EM BADGE (ONLY EM IS SHOWN) */}
                  <div className="text-right">
                    {currentIot && liveEmData ? (
                      <div className="inline-flex flex-col items-end">
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black font-mono bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>EM: {liveEmData.emTotal.toFixed(2)} min</span>
                        </span>
                        <span className="text-[9px] text-stone-400 font-mono mt-0.5">
                          Shift {liveEmData.shift} · Hr {liveEmData.hour}
                        </span>
                      </div>
                    ) : currentIot ? (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                        Mapped to {currentIot}
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-stone-100 text-stone-400">
                        No IoT EM
                      </span>
                    )}
                  </div>
                </div>

                {/* IOT DROPDOWN SELECTOR (STRICT 1-TO-1 UNIQUE ALLOCATION) */}
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] font-bold text-stone-600 flex items-center gap-1">
                    <Link2 size={12} className={currentIot ? "text-blue-600" : "text-stone-400"} />
                    <span>IoT Machine:</span>
                  </label>

                  <select
                    value={currentIot || 'NONE'}
                    onChange={(e) => handleAssignMachine(rf, e.target.value)}
                    disabled={isSyncing}
                    className={cn(
                      "text-xs font-mono font-bold rounded-xl px-3 py-1.5 border transition-all cursor-pointer outline-hidden focus:ring-2 focus:ring-blue-500/20 max-w-[180px]",
                      currentIot
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                        : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"
                    )}
                  >
                    <option value="NONE" className="bg-white text-stone-700 font-sans">
                      — Unassigned —
                    </option>
                    {IOT_MACHINES_LIST.map(iotNo => {
                      const emInfo = iotLiveEmMap[iotNo];
                      const emLabel = emInfo ? ` (${emInfo.emTotal.toFixed(1)}m)` : '';
                      const assignedTo = allocatedIotToFrame.get(iotNo);
                      const isAssignedToOther = assignedTo && assignedTo !== rf;

                      return (
                        <option
                          key={iotNo}
                          value={iotNo}
                          className={cn(
                            "bg-white font-mono",
                            isAssignedToOther ? "text-amber-800 bg-amber-50 font-bold" : "text-stone-900"
                          )}
                        >
                          {iotNo} {emLabel} {isAssignedToOther ? `[Allocated to ${assignedTo}]` : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
export default IotMachineMatchingSettings;
