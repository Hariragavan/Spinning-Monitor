import React, { useState, useEffect } from 'react';
import { 
  Bookmark, Layers, Plus, Edit2, Trash2, Save, X, 
  ArrowRight, Check, AlertCircle, Sparkles, Unlock, Lock,
  ShieldAlert, Coins
} from 'lucide-react';
import { IncentiveRule, IncentivePayout, CountConversion, FrozenMonthRecord } from '../types';
import { cn } from '../lib/utils';

interface BuilderSlotItem {
  id: string;
  amount: number;
  fromGps: number;
  toGps: string; // string so it can hold "GPSS Target" or number as string
}

interface IncentiveMasterProps {
  rules: IncentiveRule[];
  onUpdate: (rules: IncentiveRule[]) => void;
  countConversions?: CountConversion[];
  onNavigateToMatrix?: () => void;
  frozenMonths?: Record<string, FrozenMonthRecord>;
  onToggleFreezeMonth?: (month: number, year: number) => void;
}

export const IncentiveMaster: React.FC<IncentiveMasterProps> = ({
  rules,
  onUpdate,
  countConversions = [],
  onNavigateToMatrix,
  frozenMonths = {},
  onToggleFreezeMonth
}) => {
  // Active selected count for the Builder
  const [selectedCount, setSelectedCount] = useState<string>(() => {
    if (rules.length > 0) {
      // Prefer 030/1-PH-PC if exists, else first rule
      const found = rules.find(r => r.count.includes('030') || r.count.includes('30'));
      return found ? found.count : rules[0].count;
    }
    return '030/1-PH-PC';
  });

  // Builder Slots State
  const [builderSlots, setBuilderSlots] = useState<BuilderSlotItem[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Modal for adding a new count rule
  const [newCountModalOpen, setNewCountModalOpen] = useState(false);
  const [newCountInput, setNewCountInput] = useState('');
  const [newCountError, setNewCountError] = useState<string | null>(null);

  // Helper to get formatted condition text
  const getSlotConditionText = (payout: IncentivePayout, idx: number, allPayouts: IncentivePayout[]): string => {
    if (payout.conditionText) return payout.conditionText;
    const from = payout.fromGps !== undefined ? payout.fromGps : payout.gpsThreshold;
    if (idx === 0) {
      return `for GPSS ${from}`;
    }
    const nextSlot = allPayouts[idx - 1];
    const to = payout.toGps !== undefined ? payout.toGps : (nextSlot ? (nextSlot.fromGps || nextSlot.gpsThreshold) : from + 5);
    return `for GPS ${from} to ${to}`;
  };

  const getSlotRuleFormat = (payout: IncentivePayout, idx: number, allPayouts: IncentivePayout[]): string => {
    if (payout.ruleText) return payout.ruleText;
    const cond = getSlotConditionText(payout, idx, allPayouts);
    return `Rs ${payout.amount} ${cond}`;
  };

  // Sync builder when selectedCount or rules change
  useEffect(() => {
    const activeRule = rules.find(r => r.count.toLowerCase().trim() === selectedCount.toLowerCase().trim());
    if (activeRule && activeRule.payouts && activeRule.payouts.length > 0) {
      // Sort descending by gpsThreshold
      const sorted = [...activeRule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
      const items: BuilderSlotItem[] = sorted.map((p, idx) => {
        const from = p.fromGps !== undefined ? p.fromGps : p.gpsThreshold;
        let toStr = 'GPSS Target';
        if (idx > 0) {
          const prev = sorted[idx - 1];
          const prevFrom = prev.fromGps !== undefined ? prev.fromGps : prev.gpsThreshold;
          toStr = String(p.toGps !== undefined ? p.toGps : prevFrom);
        }
        return {
          id: `slot-${idx}-${Date.now()}`,
          amount: p.amount,
          fromGps: from,
          toGps: toStr
        };
      });
      setBuilderSlots(items);
    } else {
      // Default 6 starter slots for new or empty rule
      setBuilderSlots([
        { id: 's1', amount: 100, fromGps: 210, toGps: 'GPSS Target' },
        { id: 's2', amount: 90, fromGps: 200, toGps: '210' },
        { id: 's3', amount: 80, fromGps: 195, toGps: '200' },
        { id: 's4', amount: 70, fromGps: 190, toGps: '195' },
        { id: 's5', amount: 60, fromGps: 185, toGps: '190' },
        { id: 's6', amount: 50, fromGps: 180, toGps: '185' },
      ]);
    }
  }, [selectedCount, rules]);

  // Handle slot modifications in builder
  const handleUpdateSlotAmount = (index: number, val: number) => {
    setBuilderSlots(prev => prev.map((s, idx) => idx === index ? { ...s, amount: val } : s));
  };

  const handleUpdateSlotFrom = (index: number, val: number) => {
    setBuilderSlots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], fromGps: val };
      // Also update the next tier's "toGps" if applicable
      if (index + 1 < next.length) {
        next[index + 1] = { ...next[index + 1], toGps: String(val) };
      }
      return next;
    });
  };

  const handleUpdateSlotTo = (index: number, val: string) => {
    setBuilderSlots(prev => prev.map((s, idx) => idx === index ? { ...s, toGps: val } : s));
  };

  const handleDeleteBuilderSlot = (index: number) => {
    if (builderSlots.length <= 1) {
      alert('A count rule must have at least 1 slot.');
      return;
    }
    setBuilderSlots(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleAddBuilderSlot = () => {
    const lastSlot = builderSlots[builderSlots.length - 1];
    const newAmount = lastSlot ? Math.max(10, lastSlot.amount - 10) : 50;
    const newFrom = lastSlot ? Math.max(50, lastSlot.fromGps - 5) : 175;
    const newTo = lastSlot ? String(lastSlot.fromGps) : '180';

    setBuilderSlots(prev => [
      ...prev,
      {
        id: `slot-${prev.length + 1}-${Date.now()}`,
        amount: newAmount,
        fromGps: newFrom,
        toGps: newTo
      }
    ]);
  };

  // Save slots from builder into rules
  const handleSaveBuilder = () => {
    if (!selectedCount) return;

    // Convert builder slots to payouts
    const payouts: IncentivePayout[] = builderSlots.map((s, idx) => {
      const toVal = parseFloat(s.toGps);
      const isTop = idx === 0 || s.toGps === 'GPSS Target';
      const condText = isTop ? `for GPSS ${s.fromGps}` : `for GPS ${s.fromGps} to ${s.toGps}`;
      const ruleTxt = `Rs ${s.amount} ${condText}`;

      return {
        gpsThreshold: s.fromGps,
        amount: s.amount,
        fromGps: s.fromGps,
        toGps: isNaN(toVal) ? undefined : toVal,
        conditionText: condText,
        ruleText: ruleTxt
      };
    });

    // Sort descending by gpsThreshold
    payouts.sort((a, b) => b.gpsThreshold - a.gpsThreshold);

    const exists = rules.some(r => r.count.toLowerCase().trim() === selectedCount.toLowerCase().trim());
    let newRules: IncentiveRule[];

    if (exists) {
      newRules = rules.map(r => 
        r.count.toLowerCase().trim() === selectedCount.toLowerCase().trim()
          ? { ...r, payouts, department: r.department || 'Sider' }
          : r
      );
    } else {
      newRules = [
        ...rules,
        {
          count: selectedCount,
          payouts,
          department: 'Sider'
        }
      ];
    }

    onUpdate(newRules);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  // Add new count rule
  const handleCreateNewCount = () => {
    const clean = newCountInput.trim().toUpperCase();
    if (!clean) {
      setNewCountError('Please enter a count name.');
      return;
    }

    const exists = rules.some(r => r.count.toUpperCase() === clean);
    if (exists) {
      setNewCountError(`Count rule "${clean}" already exists.`);
      return;
    }

    // Default starter slots
    const starterPayouts: IncentivePayout[] = [
      { gpsThreshold: 140, amount: 100, fromGps: 140, toGps: 140, conditionText: 'for GPSS 140', ruleText: 'Rs 100 for GPSS 140' },
      { gpsThreshold: 135, amount: 90, fromGps: 135, toGps: 140, conditionText: 'for GPS 135 to 140', ruleText: 'Rs 90 for GPS 135 to 140' },
      { gpsThreshold: 130, amount: 80, fromGps: 130, toGps: 135, conditionText: 'for 130 to 135', ruleText: 'Rs 80 for 130 to 135' },
      { gpsThreshold: 125, amount: 70, fromGps: 125, toGps: 130, conditionText: 'for 125 to 130', ruleText: 'Rs 70 for 125 to 130' },
      { gpsThreshold: 120, amount: 60, fromGps: 120, toGps: 125, conditionText: 'for 120 to 125', ruleText: 'Rs 60 for 120 to 125' },
      { gpsThreshold: 115, amount: 50, fromGps: 115, toGps: 120, conditionText: 'for 115 to 120', ruleText: 'Rs 50 for 115 to 120' }
    ];

    const newRule: IncentiveRule = {
      count: clean,
      payouts: starterPayouts,
      department: 'Sider'
    };

    onUpdate([...rules, newRule]);
    setSelectedCount(clean);
    setNewCountModalOpen(false);
    setNewCountInput('');
    setNewCountError(null);
  };

  // Delete an individual slot from a rule card
  const handleDeleteSlotFromRule = (ruleCount: string, slotIdx: number) => {
    const targetRule = rules.find(r => r.count === ruleCount);
    if (!targetRule) return;

    if (targetRule.payouts.length <= 1) {
      if (confirm(`Count "${ruleCount}" will have 0 slots. Do you want to delete this count rule entirely?`)) {
        onUpdate(rules.filter(r => r.count !== ruleCount));
        if (selectedCount === ruleCount) {
          const next = rules.find(r => r.count !== ruleCount);
          if (next) setSelectedCount(next.count);
        }
      }
      return;
    }

    if (confirm(`Delete Slot ${slotIdx + 1} from ${ruleCount}?`)) {
      const updatedPayouts = targetRule.payouts.filter((_, idx) => idx !== slotIdx);
      const updatedRules = rules.map(r => r.count === ruleCount ? { ...r, payouts: updatedPayouts } : r);
      onUpdate(updatedRules);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* HEADER SECTION */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight">
            INCENTIVE MASTER
          </h1>
          <p className="text-xs font-semibold text-stone-400 mt-0.5 tracking-wider uppercase">
            COUNT-WISE MULTI-SLOT GPS INCENTIVE RULES (5+ SLOTS PER COUNT · GPS ONLY)
          </p>
        </div>

        {/* TOP RIGHT: QUICK COUNT PILLS & MATRIX BUTTON */}
        <div className="flex flex-col items-end gap-2.5">
          {/* Quick Select Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {rules.map((rule) => {
              const isSelected = rule.count.toLowerCase().trim() === selectedCount.toLowerCase().trim();
              return (
                <button
                  key={rule.count}
                  type="button"
                  onClick={() => setSelectedCount(rule.count)}
                  className={cn(
                    "px-3.5 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-2xs",
                    isSelected
                      ? "bg-stone-900 text-white shadow-xs scale-102"
                      : "bg-white text-stone-700 hover:text-stone-950 hover:bg-stone-50 border border-stone-200"
                  )}
                >
                  {rule.count} ({rule.payouts.length} Slots)
                </button>
              );
            })}
          </div>

          {/* Running Count Incentive Matrix Button */}
          <button
            type="button"
            onClick={onNavigateToMatrix}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-300 rounded-xl text-xs font-black transition-colors cursor-pointer shadow-2xs"
          >
            <span>Running Count Incentive Matrix (TV)</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>

      {/* TWO COLUMN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: COUNT GPS SLOT BUILDER */}
        <div className="lg:col-span-5 bg-white p-5 rounded-2xl border border-stone-200 shadow-2xs">
          {/* BUILDER HEADER */}
          <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
            <div className="flex items-center gap-2">
              <Layers size={18} className="text-emerald-600" />
              <h2 className="text-xs font-black uppercase tracking-wider text-stone-900">
                COUNT GPS SLOT BUILDER ({builderSlots.length} SLOTS)
              </h2>
            </div>

            <button
              type="button"
              onClick={handleAddBuilderSlot}
              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-black transition-colors cursor-pointer"
            >
              <Plus size={13} />
              <span>Add Slot</span>
            </button>
          </div>

          {/* SELECT COUNT ROW */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-stone-600">
                SELECT COUNT *
              </label>
              <button
                type="button"
                onClick={() => setNewCountModalOpen(true)}
                className="text-[11px] font-black text-emerald-600 hover:text-emerald-700 cursor-pointer"
              >
                + New Count Rule
              </button>
            </div>

            <select
              value={selectedCount}
              onChange={(e) => setSelectedCount(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black text-stone-900 focus:bg-white focus:border-emerald-500 outline-none transition-all cursor-pointer font-mono"
            >
              {rules.map(r => (
                <option key={r.count} value={r.count}>
                  {r.count}
                </option>
              ))}
            </select>
          </div>

          {/* SLOTS TABLE HEADER */}
          <div className="grid grid-cols-12 gap-2 text-[10px] font-black uppercase tracking-wider text-stone-400 pb-2 border-b border-stone-100 px-1">
            <div className="col-span-2">SLOT</div>
            <div className="col-span-3">RS (₹) *</div>
            <div className="col-span-3">FROM GPS *</div>
            <div className="col-span-3">TO GPS</div>
            <div className="col-span-1 text-center"></div>
          </div>

          {/* SLOTS LIST */}
          <div className="divide-y divide-stone-100 max-h-[500px] overflow-y-auto pr-1 space-y-2 pt-2">
            {builderSlots.map((slot, idx) => {
              const ruleFormat = idx === 0 || slot.toGps === 'GPSS Target'
                ? `Rs ${slot.amount} for GPSS ${slot.fromGps}`
                : `Rs ${slot.amount} for GPS ${slot.fromGps} to ${slot.toGps}`;

              return (
                <div key={slot.id || idx} className="pt-2 pb-2">
                  <div className="grid grid-cols-12 gap-2 items-center">
                    {/* SLOT BADGE */}
                    <div className="col-span-2">
                      <span className="w-8 py-1 rounded-md bg-stone-900 text-white font-mono font-bold text-[11px] flex items-center justify-center">
                        S{idx + 1}
                      </span>
                    </div>

                    {/* RS INPUT */}
                    <div className="col-span-3">
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-stone-400">
                          Rs
                        </span>
                        <input
                          type="number"
                          value={slot.amount}
                          onChange={(e) => handleUpdateSlotAmount(idx, parseFloat(e.target.value) || 0)}
                          className="w-full pl-7 pr-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-bold text-stone-900 focus:bg-white focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* FROM GPS INPUT */}
                    <div className="col-span-3">
                      <input
                        type="number"
                        value={slot.fromGps}
                        onChange={(e) => handleUpdateSlotFrom(idx, parseFloat(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-bold text-stone-900 focus:bg-white focus:border-emerald-500 outline-none"
                      />
                    </div>

                    {/* TO GPS INPUT */}
                    <div className="col-span-3">
                      <input
                        type="text"
                        value={slot.toGps}
                        onChange={(e) => handleUpdateSlotTo(idx, e.target.value)}
                        placeholder="GPSS Target"
                        className="w-full px-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-bold text-stone-500 focus:bg-white focus:border-emerald-500 outline-none"
                      />
                    </div>

                    {/* DELETE ICON */}
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteBuilderSlot(idx)}
                        className="text-stone-300 hover:text-red-500 p-1 transition-colors cursor-pointer"
                        title="Delete Slot"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* RULE FORMAT SUBTITLE */}
                  <div className="flex items-center justify-between text-[10px] text-stone-400 font-mono mt-1 px-1">
                    <span>Rule Format:</span>
                    <span className="text-stone-600 font-bold">{ruleFormat}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* BUILDER ACTION BUTTONS */}
          <div className="mt-4 space-y-2 pt-2 border-t border-stone-100">
            <button
              type="button"
              onClick={handleAddBuilderSlot}
              className="w-full py-2.5 rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 text-emerald-800 text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus size={14} />
              <span>+ ADD MORE SLOT (SLOT #{builderSlots.length + 1})</span>
            </button>

            <button
              type="button"
              onClick={handleSaveBuilder}
              className="w-full py-3 bg-stone-900 hover:bg-black text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
            >
              <Save size={15} />
              <span>SAVE {builderSlots.length} GPS SLOTS FOR {selectedCount}</span>
            </button>

            {saveSuccess && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 animate-in fade-in">
                <Check size={14} />
                <span>Slots successfully updated for {selectedCount}!</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: COUNT RULES CARDS LIST */}
        <div className="lg:col-span-7 space-y-5">
          {rules.map((rule) => {
            const isSelected = rule.count.toLowerCase().trim() === selectedCount.toLowerCase().trim();
            const sortedPayouts = [...rule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);

            return (
              <div
                key={rule.count}
                className={cn(
                  "bg-white rounded-2xl p-5 shadow-2xs transition-all",
                  isSelected
                    ? "border-2 border-emerald-400 ring-2 ring-emerald-50"
                    : "border border-stone-200 hover:border-stone-300"
                )}
              >
                {/* CARD HEADER */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-100 mb-3">
                  <div className="flex items-center gap-2.5">
                    <Bookmark size={18} className="text-emerald-600 shrink-0" />
                    <div>
                      <h3 className="text-base font-black text-stone-900 tracking-tight font-mono">
                        {rule.count}
                      </h3>
                      <p className="text-[11px] font-mono text-stone-500 font-medium">
                        {rule.payouts.length} GPS Slots Configured · Incentive Based Only on GPS
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCount(rule.count);
                        handleAddBuilderSlot();
                      }}
                      className="px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      + Add Slot
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedCount(rule.count)}
                      className={cn(
                        "px-3 py-1 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs",
                        isSelected
                          ? "bg-emerald-600 text-white"
                          : "bg-stone-900 hover:bg-black text-white"
                      )}
                    >
                      <Edit2 size={12} />
                      <span>Edit {rule.payouts.length} Slots</span>
                    </button>
                  </div>
                </div>

                {/* TABLE OF SLOTS */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="text-[10px] font-black uppercase tracking-wider text-stone-400 border-b border-stone-100">
                        <th className="py-2 px-3">SLOT</th>
                        <th className="py-2 px-3">INCENTIVE AMOUNT</th>
                        <th className="py-2 px-3">GPS / GPSS CONDITION</th>
                        <th className="py-2 px-3">INCENTIVE RULE FORMAT</th>
                        <th className="py-2 px-3 text-right">ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 font-mono">
                      {sortedPayouts.map((payout, idx) => {
                        const condText = getSlotConditionText(payout, idx, sortedPayouts);
                        const ruleText = getSlotRuleFormat(payout, idx, sortedPayouts);

                        return (
                          <tr key={idx} className="hover:bg-stone-50/60 transition-colors">
                            <td className="py-2.5 px-3 font-bold text-stone-500">
                              Slot {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-emerald-600">
                              Rs {payout.amount}
                            </td>
                            <td className="py-2.5 px-3 font-bold text-stone-800">
                              {condText}
                            </td>
                            <td className="py-2.5 px-3 text-stone-600 font-medium">
                              {ruleText}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleDeleteSlotFromRule(rule.count, idx)}
                                className="text-stone-300 hover:text-red-500 transition-colors cursor-pointer"
                                title="Delete Slot"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* NEW COUNT RULE MODAL */}
      {newCountModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl w-full max-w-md p-6 animate-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100 mb-4">
              <h3 className="text-sm font-black text-stone-900 uppercase">
                Create New Count Rule
              </h3>
              <button
                type="button"
                onClick={() => setNewCountModalOpen(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X size={16} />
              </button>
            </div>

            {newCountError && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs font-bold">
                {newCountError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-stone-700 mb-1">
                Count Identifier / Name *
              </label>
              <input
                type="text"
                placeholder="e.g. 30s KWH or 24/1-CH"
                value={newCountInput}
                onChange={(e) => setNewCountInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold uppercase outline-none focus:border-emerald-500"
              />
              <span className="block text-[10px] text-stone-400 mt-1 font-medium">
                This rule will be configured with 6 initial slots that you can edit immediately.
              </span>
            </div>

            <div className="mt-5 flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setNewCountModalOpen(false)}
                className="px-4 py-2 text-stone-500 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateNewCount}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-xs"
              >
                Create Count Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
