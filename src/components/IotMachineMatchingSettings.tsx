'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Activity, RefreshCw, Search, Link2, Unlink, Sparkles, CheckCircle2, Calendar, Clock, Database, ChevronRight } from 'lucide-react';
import { cn, getTodayDateString, resolveEffectiveMappingForDate } from '@/lib/utils';
import { MachineMasterItem, MachineEmData, IotMachineAllocationPeriod } from '@/types';

// The actual 46 live IoT hardware machines from the API (RF03, RF04, RF09..RF14, RF19..RF56)
export const DEFAULT_LIVE_IOT_MACHINES: string[] = [
  'RF03', 'RF04', 'RF09', 'RF10', 'RF11',
  'RF12', 'RF13', 'RF14', 'RF19', 'RF20',
  'RF21', 'RF22', 'RF23', 'RF24', 'RF25',
  'RF26', 'RF27', 'RF28', 'RF29', 'RF30',
  'RF31', 'RF32', 'RF33', 'RF34', 'RF35',
  'RF36', 'RF37', 'RF38', 'RF39', 'RF40',
  'RF41', 'RF42', 'RF43', 'RF44', 'RF45',
  'RF46', 'RF47', 'RF48', 'RF49', 'RF50',
  'RF51', 'RF52', 'RF53', 'RF54', 'RF55',
  'RF56'
];

export interface IotLiveTelemetryItem {
  machineNo: string;
  emTotal: number;
  emLeft?: number;
  emRight?: number;
  speed?: number;
  runStatus?: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE';
  statusBadge?: string;
  count?: string;
  shift?: number;
  hour?: number;
  date?: string;
  updatedAt?: string;
}

interface IotMachineMatchingSettingsProps {
  machines: MachineMasterItem[];
  currentMappings?: Record<string, string>;
  mappingsByDate?: Record<string, Record<string, string>>;
  allocationPeriods?: IotMachineAllocationPeriod[];
  machineEm: MachineEmData;
  activeDate?: string;
  onSaveMappings: (mappings: Record<string, string>, date?: string, updatedPeriods?: IotMachineAllocationPeriod[]) => Promise<void>;
  onMachineEmUpdated: (newEmData: MachineEmData) => void;
  onDeletePeriod?: (periodId: string) => Promise<void>;
}

export const IotMachineMatchingSettings: React.FC<IotMachineMatchingSettingsProps> = ({
  machines,
  currentMappings = {},
  mappingsByDate = {},
  allocationPeriods = [],
  machineEm,
  activeDate,
  onSaveMappings,
  onMachineEmUpdated,
  onDeletePeriod
}) => {
  // Only Shed 1, Shed 2, Shed 3 are involved (KTTM is strictly excluded)
  const [selectedShed, setSelectedShed] = useState<'Shed 1' | 'Shed 2' | 'Shed 3'>('Shed 1');

  // Selected Date for assignment (defaults to activeDate or today YYYY-MM-DD)
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return activeDate || getTodayDateString();
  });

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [recentlySynced, setRecentlySynced] = useState<string | null>(null);

  // Live telemetry by IoT machine: { [iotMachineNo]: IotLiveTelemetryItem }
  const [iotLiveEmMap, setIotLiveEmMap] = useState<Record<string, IotLiveTelemetryItem>>({});

  // Dynamic live IoT machine IDs detected directly from the live API
  const [availableIotMachines, setAvailableIotMachines] = useState<string[]>(DEFAULT_LIVE_IOT_MACHINES);

  // Continuous Carry-Forward Resolution Algorithm using date-range periods & date maps
  const resolveEffectiveMapping = useCallback((targetDate: string): { mapping: Record<string, string>; sourceDate: string } => {
    const eff = resolveEffectiveMappingForDate(targetDate, allocationPeriods, mappingsByDate, currentMappings);
    return { mapping: eff, sourceDate: targetDate };
  }, [allocationPeriods, mappingsByDate, currentMappings]);

  // Active mappings for the selected date
  const [mappings, setMappings] = useState<Record<string, string>>(() => {
    return resolveEffectiveMapping(selectedDate).mapping;
  });

  // Dynamic list of IoT machines in dropdown: ONLY machines from the live API + any currently mapped device
  const dropdownIotMachines = useMemo(() => {
    const listSet = new Set<string>(availableIotMachines);
    // If a device is already saved in mappings, ensure it appears in dropdown so user can see or unassign it
    Object.values(mappings).forEach(dev => {
      if (dev && dev !== 'NONE' && dev !== 'None' && dev !== 'unassigned') {
        listSet.add(dev.trim().toUpperCase());
      }
    });
    return Array.from(listSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [availableIotMachines, mappings]);

  // When date changes, update mapping using carry-forward logic
  useEffect(() => {
    const eff = resolveEffectiveMapping(selectedDate);
    setMappings(eff.mapping);
  }, [selectedDate, resolveEffectiveMapping]);

  // Load latest EM and live status for all 46 IoT machines
  const loadIotEmData = useCallback(async () => {
    try {
      const emData: Record<string, IotLiveTelemetryItem> = {};

      // 1. Fetch live status so speed, runStatus, and current real-time telemetry are guaranteed
      try {
        const statusRes = await fetch(`/api/iot/status?_t=${Date.now()}`);
        if (statusRes.ok) {
          const statusJson = await statusRes.json();
          const list = statusJson.machines || statusJson.data?.machines || [];
          if (Array.isArray(list) && list.length > 0) {
            const detectedLive: string[] = [];
            for (const m of list) {
              const mId = m.machine || m.machineId;
              if (!mId) continue;
              const cleanId = String(mId).trim().toUpperCase();
              detectedLive.push(cleanId);
              emData[cleanId] = {
                machineNo: cleanId,
                emTotal: Number(m.emTotal || 0),
                emLeft: Number(m.emLeft || 0),
                emRight: Number(m.emRight || 0),
                speed: Number(m.speed ?? 0),
                runStatus: m.runStatus || 'STOP',
                statusBadge: m.statusBadge || 'Stopped',
                count: m.count || '',
                shift: statusJson.shift || 1,
                hour: 1,
                date: statusJson.shiftDate || new Date().toISOString().slice(0, 10),
                updatedAt: m.lastUpdated || new Date().toISOString()
              };
              const num = parseInt(cleanId.replace(/\D/g, ''), 10);
              if (!isNaN(num)) {
                const p2 = `RF${String(num).padStart(2, '0')}`;
                if (!emData[p2]) emData[p2] = emData[cleanId];
              }
            }
            if (detectedLive.length > 0) {
              const uniqueLive = Array.from(new Set<string>(detectedLive)).sort((a, b) =>
                a.localeCompare(b, undefined, { numeric: true })
              );
              setAvailableIotMachines(uniqueLive);
            }
          }
        }
      } catch (_) {}

      // 2. Also fetch live-by-machine from database
      try {
        const res = await fetch(`/api/iot/em/live-by-machine?_t=${Date.now()}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            for (const [mId, val] of Object.entries(json.data as Record<string, any>)) {
              const cleanId = mId.toUpperCase();
              const existing: Partial<IotLiveTelemetryItem> = emData[cleanId] || {};
              emData[cleanId] = {
                machineNo: cleanId,
                emTotal: typeof val.emTotal === 'number' && val.emTotal > 0 ? val.emTotal : (existing.emTotal || 0),
                emLeft: typeof val.emLeft === 'number' ? val.emLeft : (existing.emLeft || 0),
                emRight: typeof val.emRight === 'number' ? val.emRight : (existing.emRight || 0),
                speed: typeof val.speed === 'number' ? val.speed : (existing.speed || 0),
                runStatus: val.runStatus || existing.runStatus || 'STOP',
                statusBadge: val.statusBadge || existing.statusBadge || 'Stopped',
                count: val.count || existing.count || '',
                shift: val.shift || existing.shift || 1,
                hour: val.hour || existing.hour || 1,
                date: val.date || existing.date || new Date().toISOString().slice(0, 10),
                updatedAt: val.updatedAt || existing.updatedAt || new Date().toISOString()
              };
              const num = parseInt(cleanId.replace(/\D/g, ''), 10);
              if (!isNaN(num)) {
                const p2 = `RF${String(num).padStart(2, '0')}`;
                if (!emData[p2]) emData[p2] = emData[cleanId];
              }
            }
          }
        }
      } catch (_) {}

      if (Object.keys(emData).length > 0) {
        setIotLiveEmMap(emData);
      }
    } catch (err) {
      console.error('Error loading IoT live EM/status data:', err);
    }
  }, []);

  useEffect(() => {
    loadIotEmData();
    const interval = setInterval(loadIotEmData, 45000);
    return () => clearInterval(interval);
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

  // Auto-match for the current shed: matches only available unassigned live IoT machines 1-to-1
  const handleAutoMatchShed = async () => {
    const updated = { ...mappings };
    const liveSet = new Set(availableIotMachines);

    shedMachines.forEach(m => {
      const rf = (m.rfNo || (m as any).frameNo || '').trim();
      const numeric = parseInt(rf.replace(/\D/g, ''), 10);
      if (!isNaN(numeric)) {
        const iotId = `RF${String(numeric).padStart(2, '0')}`;
        // Only match if this IoT machine actually exists in the live API!
        if (liveSet.has(iotId)) {
          const currentOwner = updated[rf];
          const takenBy = Object.entries(updated).find(([f, id]) => id === iotId && f !== rf);
          if (!takenBy || currentOwner === iotId) {
            updated[rf] = iotId;
          }
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

  // Sorted list of allocation periods for table display (newest first)
  const periodsList = useMemo(() => {
    return [...allocationPeriods].sort((a, b) => b.fromDate.localeCompare(a.fromDate));
  }, [allocationPeriods]);

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
                {availableIotMachines.length} Live Machines from API · 1-to-1 Allocation
              </span>
            </h3>
            <p className="text-xs text-stone-500 font-bold mt-0.5">
              Assign spinning machines to IoT machines. Persistent date-to-date tracking saved in settings until changed.
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

          <span className="text-[10.5px] font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-200 flex items-center gap-1">
            <Clock size={12} />
            <span>Persisted Date-to-Date · Saves pairs until changed</span>
          </span>
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

                  {/* LIVE TELEMETRY & EM BADGE */}
                  <div className="text-right">
                    {currentIot && liveEmData ? (
                      <div className="inline-flex flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider border font-mono",
                            liveEmData.runStatus === 'RUN' ? "bg-emerald-100 text-emerald-800 border-emerald-300" :
                            liveEmData.runStatus === 'DOFF' ? "bg-blue-100 text-blue-800 border-blue-300" :
                            liveEmData.runStatus === 'OFFLINE' ? "bg-amber-100 text-amber-800 border-amber-300" :
                            "bg-stone-100 text-stone-700 border-stone-300"
                          )}>
                            {liveEmData.runStatus || 'STOP'}
                          </span>
                          {typeof liveEmData.speed === 'number' && liveEmData.speed > 0 && (
                            <span className="text-[10px] font-mono font-bold text-stone-600 bg-stone-100 px-1.5 py-0.5 rounded">
                              {liveEmData.speed} rpm
                            </span>
                          )}
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black font-mono bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs flex items-center gap-1">
                          <CheckCircle2 size={11} className="text-emerald-600" />
                          <span>EM: {liveEmData.emTotal.toFixed(2)} min</span>
                        </span>
                        <span className="text-[9px] text-stone-400 font-mono">
                          Shift {liveEmData.shift || 1} · {liveEmData.date}
                        </span>
                      </div>
                    ) : currentIot ? (
                      <span className="px-2.5 py-1 rounded-xl text-[10px] font-bold font-mono bg-blue-50 text-blue-700 border border-blue-200">
                        Mapped to {currentIot}
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-xl text-[10px] font-medium bg-stone-100 text-stone-400 border border-stone-200">
                        No IoT Assigned
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
                      "text-xs font-mono font-bold rounded-xl px-3 py-1.5 border transition-all cursor-pointer outline-hidden focus:ring-2 focus:ring-blue-500/20 max-w-[200px]",
                      currentIot
                        ? "bg-blue-600 text-white border-blue-600 shadow-2xs"
                        : "bg-white text-stone-700 border-stone-300 hover:border-stone-400"
                    )}
                  >
                    <option value="NONE" className="bg-white text-stone-700 font-sans">
                      — Unassigned —
                    </option>
                    {dropdownIotMachines.map(iotNo => {
                      const emInfo = iotLiveEmMap[iotNo];
                      const emLabel = emInfo && emInfo.emTotal > 0 ? ` · ${emInfo.emTotal.toFixed(1)}m` : '';
                      const statusLabel = emInfo?.runStatus ? ` · ${emInfo.runStatus}` : '';
                      const speedLabel = emInfo?.speed ? ` · ${emInfo.speed}rpm` : '';
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
                          {iotNo}{statusLabel}{speedLabel}{emLabel} {isAssignedToOther ? `[Allocated to ${assignedTo}]` : ''}
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

      {/* ALLOCATION PERIODS HISTORY TABLE (DATE-TO-DATE AUDIT & PERSISTENCE) */}
      <div className="bg-white rounded-3xl border border-stone-200 p-6 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-stone-100 pb-4">
          <div>
            <h4 className="text-base font-black text-stone-900 uppercase tracking-tight flex items-center gap-2">
              <Calendar size={18} className="text-blue-600" />
              <span>Machine to IoT Allocation Periods History</span>
            </h4>
            <p className="text-xs text-stone-500 font-semibold mt-0.5">
              Persistent date-to-date tracking saved in settings table. Preserves machine pairs from day to day until changed.
            </p>
          </div>
          <span className="text-[11px] font-mono font-bold px-2.5 py-1 rounded-xl bg-stone-100 text-stone-700 border border-stone-200 shrink-0">
            {periodsList.length} Allocation {periodsList.length === 1 ? 'Period' : 'Periods'} Recorded
          </span>
        </div>

        {periodsList.length === 0 ? (
          <div className="text-center py-8 text-stone-400 font-semibold text-xs">
            No allocation periods recorded yet. Select an IoT machine above to create the initial active allocation period.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50/80 text-[11px] font-black uppercase text-stone-600 tracking-wider">
                  <th className="py-3 px-3">#</th>
                  <th className="py-3 px-3">Date Range</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Shed</th>
                  <th className="py-3 px-3">Pairs</th>
                  <th className="py-3 px-3">Machine Mappings</th>
                  <th className="py-3 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {periodsList.map((p, idx) => {
                  const isActive = !p.toDate;
                  const pairEntries = Object.entries(p.mappings || {});
                  return (
                    <tr key={p.id || idx} className={cn("hover:bg-stone-50/60 transition-colors", isActive && "bg-blue-50/20")}>
                      <td className="py-3 px-3 font-mono font-bold text-stone-500">{idx + 1}</td>
                      <td className="py-3 px-3 font-mono font-black text-stone-900 whitespace-nowrap">
                        <span className="text-blue-700">{p.fromDate}</span>
                        <span className="mx-1.5 text-stone-400">→</span>
                        {isActive ? (
                          <span className="text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                            Present (Active)
                          </span>
                        ) : (
                          <span className="text-stone-700">{p.toDate}</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Active Until Changed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-stone-100 text-stone-600 border border-stone-200">
                            Archived
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-bold text-stone-700">{p.shed || 'All'}</td>
                      <td className="py-3 px-3 font-mono font-bold text-stone-800">{pairEntries.length} frames</td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-md">
                          {pairEntries.slice(0, 10).map(([f, d]) => (
                            <span key={f} className="inline-flex items-center gap-1 font-mono text-[10.5px] px-2 py-0.5 rounded-lg bg-stone-100 text-stone-800 border border-stone-200">
                              <span className="font-bold">{f}</span>
                              <span className="text-stone-400">↔</span>
                              <span className="font-black text-blue-700">{d}</span>
                            </span>
                          ))}
                          {pairEntries.length > 10 && (
                            <span className="text-[10px] font-bold text-stone-400 self-center">
                              +{pairEntries.length - 10} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => {
                              setSelectedDate(p.fromDate);
                              setMappings(p.mappings || {});
                            }}
                            className="px-2.5 py-1 text-[11px] font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 cursor-pointer transition-colors"
                            title="Load this period's mappings into editor"
                          >
                            Load
                          </button>
                          {onDeletePeriod && (
                            <button
                              onClick={() => onDeletePeriod(p.id)}
                              className="px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 cursor-pointer transition-colors"
                              title="Delete this period row"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default IotMachineMatchingSettings;
