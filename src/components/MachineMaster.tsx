import React, { useState, useEffect } from 'react';
import { 
  RotateCcw, Plus, Edit2, Trash2, Save, Check, AlertCircle 
} from 'lucide-react';
import { MachineMasterItem, Sider, CountConversion, Shed } from '../types';
import { cn } from '../lib/utils';

export const STANDARD_MACHINES_BY_SHED: Record<string, MachineMasterItem[]> = {
  'Shed 1': [],
  'Shed 2': [],
  'Shed 3': [],
  'KTTM': [],
};

export const ALL_STANDARD_MACHINES: MachineMasterItem[] = [];

export const STANDARD_12_MACHINES = ALL_STANDARD_MACHINES;

export const SHED_REAL_COUNTS: Record<string, string[]> = {
  'Shed 1': ['030/1-PH-PC', '040/1-PH-PC', '34/1-PH-PV', '042/1-CH-NY', '038/1-CH-NY', '034/1-PH-PC'],
  'Shed 2': ['32/1-CH-CY', '34/1CHY-OCY', '30/1CH', '20/1-CW-WVG'],
  'Shed 3': ['26/1-CHY', '40s'],
  'KTTM': ['60s CW', '40s'],
};

interface MachineMasterProps {
  machines: MachineMasterItem[];
  onSaveMachine: (machine: MachineMasterItem) => void;
  onDeleteMachine: (id: string) => void;
  onResetStandardMachines: (shed?: string) => void;
  workers?: Sider[];
  countConversions?: CountConversion[];
  currentShed?: Shed | string;
}

export const MachineMaster: React.FC<MachineMasterProps> = ({
  machines,
  onSaveMachine,
  onDeleteMachine,
  onResetStandardMachines,
  workers = [],
  countConversions = [],
  currentShed = 'Shed 1'
}) => {
  const [selectedShedTab, setSelectedShedTab] = useState<string>(currentShed || 'All Sheds');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    rfNo: string;
    description: string;
    shed: string;
    count: string;
  }>({
    rfNo: '',
    description: '',
    shed: currentShed || 'Shed 1',
    count: '32/1-CH-CY'
  });
  const [error, setError] = useState<string | null>(null);

  // Sync tab with currentShed if currentShed prop changes
  useEffect(() => {
    if (currentShed && currentShed !== 'All') {
      setSelectedShedTab(currentShed);
    }
  }, [currentShed]);

  // Get available counts specifically for the chosen shed (no dummy names)
  const getAvailableCountsForShed = (targetShed: string): string[] => {
    const s = targetShed && targetShed !== 'All Sheds' ? targetShed : 'Shed 1';
    
    // Counts defined in Count Master for this shed (or All Sheds)
    const fromConversions = countConversions
      .filter(c => c.shed === s || c.shed === 'All Sheds')
      .map(c => c.count.trim());

    // Counts currently running on machines in this shed
    const fromMachines = machines
      .filter(m => (m.shed || 'Shed 1') === s)
      .map(m => m.count.trim());

    // Real standard counts for this specific shed
    const defaults = SHED_REAL_COUNTS[s] || ['40s'];

    const combined = Array.from(new Set([
      ...defaults,
      ...fromConversions,
      ...fromMachines
    ].filter(Boolean)));

    return combined.length > 0 ? combined : defaults;
  };

  const activeFormShed = formData.shed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : (currentShed || 'Shed 1'));
  const availableCountsForShed = Array.from(new Set([
    ...getAvailableCountsForShed(activeFormShed),
    ...(formData.count ? [formData.count] : [])
  ].filter(Boolean)));

  // Filter machines based on selected shed tab
  const filteredMachines = machines.filter(m => {
    if (selectedShedTab === 'All Sheds') return true;
    return (m.shed || 'Shed 1') === selectedShedTab;
  });

  const handleStartEdit = (machine: MachineMasterItem) => {
    setEditingId(machine.id);
    const mShed = machine.shed || currentShed || 'Shed 1';
    const shedCounts = getAvailableCountsForShed(mShed);
    setFormData({
      rfNo: machine.rfNo,
      description: machine.description || '',
      shed: mShed,
      count: machine.count || shedCounts[0] || '40s'
    });
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    const activeShed = selectedShedTab !== 'All Sheds' ? selectedShedTab : (currentShed || 'Shed 1');
    const shedCounts = getAvailableCountsForShed(activeShed);
    setFormData({
      rfNo: '',
      description: '',
      shed: activeShed,
      count: shedCounts[0] || '40s'
    });
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rfNo.trim()) {
      setError('RF No / Machine Name is required.');
      return;
    }

    const cleanRfNo = formData.rfNo.trim().toUpperCase();
    const cleanShed = formData.shed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : (currentShed || 'Shed 1'));

    // Check duplicate RF No across same or other sheds
    const duplicate = machines.find(m => m.id !== editingId && m.rfNo.toUpperCase() === cleanRfNo);
    if (duplicate) {
      setError(`Machine "${cleanRfNo}" already exists in ${duplicate.shed || 'registry'}. Each machine must be unique.`);
      return;
    }

    const existing = machines.find(m => m.id === editingId);
    const item: MachineMasterItem = {
      id: editingId || `m-${cleanRfNo.toLowerCase()}-${Date.now()}`,
      rfNo: cleanRfNo,
      description: formData.description?.trim() || `RING FRAME ${cleanRfNo} - ${cleanShed.toUpperCase()}`,
      shed: cleanShed,
      count: formData.count,
      stdGps: existing?.stdGps ?? 0,
      actualGps: existing?.actualGps ?? 0,
      productionKg: existing?.productionKg ?? 0,
      assignedSider: existing?.assignedSider || '-',
      assignedGaiter: existing?.assignedGaiter || '-'
    };

    onSaveMachine(item);
    handleCancelEdit();
  };  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight">
            MACHINE MASTER
          </h1>
          <p className="text-xs font-semibold text-stone-400 mt-0.5">
            Configure Ring Frame Numbers (RF No), Running Counts & Crew Properties per Shed
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* SHED TABS */}
          <div className="inline-flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
            {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedShedTab(s)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  selectedShedTab === s ? "bg-white text-emerald-800 shadow-xs" : "text-stone-500 hover:text-stone-800"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onResetStandardMachines(selectedShedTab === 'All Sheds' ? undefined : selectedShedTab)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 text-stone-700 hover:text-stone-950 text-xs font-bold hover:bg-stone-50 transition-all shadow-2xs cursor-pointer self-start sm:self-center"
          >
            <RotateCcw size={14} className="text-stone-500" />
            <span>Reset {selectedShedTab === 'All Sheds' ? 'All' : selectedShedTab} Machines</span>
          </button>
        </div>
      </div>

      {/* TWO COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: MACHINE ADD/EDIT FORM */}
        <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-black text-emerald-700 uppercase tracking-wider flex items-center gap-2">
              {editingId ? (
                <>
                  <Edit2 size={16} />
                  EDIT RING FRAME {formData.rfNo}
                </>
              ) : (
                <>
                  <Plus size={16} />
                  ADD RING FRAME
                </>
              )}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-xs font-bold text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-bold flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* SHED / UNIT SELECTOR */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                SHED / UNIT *
              </label>
              <select
                value={formData.shed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1')}
                onChange={(e) => {
                  const newShed = e.target.value;
                  const newShedCounts = getAvailableCountsForShed(newShed);
                  setFormData(prev => ({
                    ...prev,
                    shed: newShed,
                    count: newShedCounts.includes(prev.count) ? prev.count : (newShedCounts[0] || '40s')
                  }));
                }}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-emerald-500 outline-none transition-all cursor-pointer"
              >
                {['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(sh => (
                  <option key={sh} value={sh}>{sh}</option>
                ))}
              </select>
            </div>

            {/* RF NO */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                RF NO / MACHINE NAME *
              </label>
              <input
                type="text"
                placeholder="e.g. 01, RF-1"
                value={formData.rfNo}
                onChange={(e) => setFormData(prev => ({ ...prev, rfNo: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all uppercase"
              />
              <span className="block text-[10px] text-stone-400 font-medium mt-1">
                Enter unique machine identifier for this shed
              </span>
            </div>

            {/* DESCRIPTION / LOCATION */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                DESCRIPTION / LOCATION (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. Ring Frame 1"
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 placeholder-stone-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
              />
            </div>

            {/* RUNNING COUNT */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                RUNNING COUNT ({activeFormShed}) *
              </label>
              <select
                value={formData.count}
                onChange={(e) => setFormData(prev => ({ ...prev, count: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-emerald-500 outline-none transition-all cursor-pointer font-mono"
              >
                {availableCountsForShed.map(cnt => (
                  <option key={cnt} value={cnt}>{cnt}</option>
                ))}
              </select>
              <span className="block text-[10px] text-stone-400 font-medium mt-1">
                Active yarn counts registered for {activeFormShed}
              </span>
            </div>

            {/* AUTOMATED TELEMETRY INFO */}
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-100 rounded-xl text-emerald-900 text-xs flex items-start gap-2.5">
              <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-emerald-950">Automated Production Statement Telemetry</p>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                  Actual GPS, Target GPS, and Production (kg) are automatically ingested from your uploaded Excel production statements for each machine across all sheds (Shed 1, Shed 2, Shed 3, and KTTM).
                </p>
              </div>
            </div>

            {/* SAVE BUTTON */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 bg-stone-900 hover:bg-black text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
              >
                <Save size={15} />
                <span>SAVE MACHINE</span>
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: ACTIVE RING FRAME MACHINES LIST */}
        <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex items-center justify-between pb-4 border-b border-stone-100 mb-3">
            <h2 className="text-xs font-black uppercase tracking-wider text-stone-800">
              ACTIVE RING FRAME (RF) MACHINES {selectedShedTab !== 'All Sheds' ? `— ${selectedShedTab}` : ''}
            </h2>
            <span className="text-xs font-black text-stone-500 font-mono">
              {filteredMachines.length} TOTAL
            </span>
          </div>

          <div className="divide-y divide-stone-100">
            {filteredMachines.map((m, idx) => (
              <div 
                key={m.id || m.rfNo}
                className={cn(
                  "py-3.5 flex items-center justify-between gap-3 transition-colors rounded-xl px-2 -mx-2 hover:bg-stone-50/70",
                  editingId === m.id && "bg-emerald-50/50 border border-emerald-200"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-mono font-bold text-stone-400 w-5 shrink-0 text-right">
                    {idx + 1}.
                  </span>
                  
                  {/* GREEN PILL BADGE */}
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black font-mono shrink-0">
                    {m.rfNo}
                  </span>

                  {/* SHED BADGE */}
                  <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-bold shrink-0">
                    {m.shed || 'Shed 1'}
                  </span>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-black text-stone-900 tracking-tight">
                        RF No: {m.rfNo}
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 font-medium truncate mt-0.5">
                      {m.description || `RING FRAME ${m.rfNo}`} · Running Count: <span className="font-bold text-emerald-700">{m.count}</span>
                    </p>
                  </div>
                </div>

                {/* ROW ACTION BUTTONS */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(m)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 rounded-lg transition-colors cursor-pointer"
                    title="Edit Machine"
                  >
                    <Edit2 size={13} />
                    <span>Edit</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`Delete machine ${m.rfNo}?`)) {
                        onDeleteMachine(m.id);
                      }
                    }}
                    className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete Machine"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}

            {filteredMachines.length === 0 && (
              <div className="py-12 text-center text-stone-400 font-bold text-xs uppercase tracking-wider">
                No active machines found for {selectedShedTab}. Click &quot;Reset {selectedShedTab} Machines&quot; above to load presets.
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
