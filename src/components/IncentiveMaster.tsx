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
  amount: number | string;
  fromGps: number | string;
  toGps: string; // string so it can hold "GPSS Target" or number as string
}

interface IncentiveMasterProps {
  rules: IncentiveRule[];
  onUpdate: (rules: IncentiveRule[]) => void;
  countConversions?: CountConversion[];
  onNavigateToMatrix?: () => void;
  frozenMonths?: Record<string, FrozenMonthRecord>;
  onToggleFreezeMonth?: (month: number, year: number) => void;
  currentShed?: string;
}

export const IncentiveMaster: React.FC<IncentiveMasterProps> = ({
  rules,
  onUpdate,
  countConversions = [],
  onNavigateToMatrix,
  frozenMonths = {},
  onToggleFreezeMonth,
  currentShed = 'Shed 1'
}) => {
  // Active Shed Tab Filter
  const [selectedShedTab, setSelectedShedTab] = useState<string>(() => {
    return currentShed || 'Shed 1';
  });

  // Builder Target Shed
  const [builderShed, setBuilderShed] = useState<string>(() => {
    return currentShed && currentShed !== 'All Sheds' ? currentShed : 'Shed 1';
  });

  // Active selected count for the Builder
  const [selectedCount, setSelectedCount] = useState<string>(() => {
    if (rules.length > 0) {
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
  const [newCountShed, setNewCountShed] = useState<string>('Shed 1');
  const [newCountError, setNewCountError] = useState<string | null>(null);

  // Sync selectedShedTab when top navigation currentShed changes
  useEffect(() => {
    if (currentShed && currentShed !== 'All') {
      setSelectedShedTab(currentShed);
    }
  }, [currentShed]);

  // Distinct counts from Count Master belonging strictly to the selected shed
  const availableShedConversions = React.useMemo(() => {
    if (selectedShedTab === 'All Sheds') {
      return countConversions;
    }
    return countConversions.filter(c => !c.shed || c.shed === 'All Sheds' || c.shed === selectedShedTab);
  }, [countConversions, selectedShedTab]);

  const availableCountNames = React.useMemo(() => {
    const seen = new Set<string>();
    const list: { count: string; shed: string; factor: number }[] = [];
    availableShedConversions.forEach(c => {
      const trimmed = (c.count || '').trim();
      if (trimmed && !seen.has(trimmed.toLowerCase())) {
        seen.add(trimmed.toLowerCase());
        list.push({ count: trimmed, shed: c.shed || selectedShedTab, factor: c.multiplicationFactor });
      }
    });
    return list;
  }, [availableShedConversions, selectedShedTab]);

  // Sync builderShed and selectedCount when shed tab or available counts change
  useEffect(() => {
    if (selectedShedTab !== 'All Sheds') {
      setBuilderShed(selectedShedTab);
      setNewCountShed(selectedShedTab);
    }
    if (availableCountNames.length > 0) {
      const exists = availableCountNames.some(c => c.count.toLowerCase().trim() === selectedCount.toLowerCase().trim());
      if (!exists) {
        setSelectedCount(availableCountNames[0].count);
      }
    }
  }, [selectedShedTab, availableCountNames, selectedCount]);

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

  // Sync builder when selectedCount, builderShed, or rules change
  useEffect(() => {
    if (!selectedCount) return;
    const effectiveShed = builderShed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1');
    const activeRule = rules.find(r => 
      r.count.toLowerCase().trim() === selectedCount.toLowerCase().trim() &&
      (r.shed || 'Shed 1') === effectiveShed
    ) || rules.find(r => 
      r.count.toLowerCase().trim() === selectedCount.toLowerCase().trim() &&
      r.shed === 'All Sheds'
    );


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
  }, [selectedCount, builderShed, selectedShedTab, rules]);

  // Handle slot modifications in builder
  const handleUpdateSlotAmount = (index: number, val: number | string) => {
    setBuilderSlots(prev => prev.map((s, idx) => idx === index ? { ...s, amount: val } : s));
  };

  const handleUpdateSlotFrom = (index: number, val: number | string) => {
    setBuilderSlots(prev => {
      const next = [...prev];
      next[index] = { ...next[index], fromGps: val };
      if (index + 1 < next.length) {
        next[index + 1] = { ...next[index + 1], toGps: String(val) };
      }
      return next;
    });
  };

  const handleUpdateSlotTo = (index: number, val: string) => {
    if (val !== '' && !isNaN(Number(val)) && Number(val) < 0) return;
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
    const newAmount = lastSlot ? (typeof lastSlot.amount === 'number' ? Math.max(10, lastSlot.amount - 10) : 50) : 50;
    const newFrom = lastSlot ? (typeof lastSlot.fromGps === 'number' ? Math.max(50, lastSlot.fromGps - 5) : 175) : 175;
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

  // Save slots from builder strictly for builderShed
  const handleSaveBuilder = () => {
    if (!selectedCount) return;

    const payouts: IncentivePayout[] = builderSlots.map((s, idx) => {
      const toVal = parseFloat(s.toGps);
      const isTop = idx === 0 || s.toGps === 'GPSS Target';
      const fromNum = typeof s.fromGps === 'string' ? (parseFloat(s.fromGps) || 0) : s.fromGps;
      const amountNum = typeof s.amount === 'string' ? (parseFloat(s.amount) || 0) : s.amount;
      const condText = isTop ? `for GPSS ${fromNum}` : `for GPS ${fromNum} to ${s.toGps}`;
      const ruleTxt = `Rs ${amountNum} ${condText}`;

      return {
        gpsThreshold: fromNum,
        amount: amountNum,
        fromGps: fromNum,
        toGps: isNaN(toVal) ? undefined : toVal,
        conditionText: condText,
        ruleText: ruleTxt
      };
    });

    payouts.sort((a, b) => b.gpsThreshold - a.gpsThreshold);

    const targetShed = builderShed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1');
    const cleanCount = selectedCount.trim();

    const cleanRule: IncentiveRule = {
      count: cleanCount,
      payouts,
      department: 'Sider',
      shed: targetShed
    };

    // Filter out existing rule for THIS count in THIS shed only
    const updatedRules = [
      ...rules.filter(r => !(
        r.count.toLowerCase().trim() === cleanCount.toLowerCase() && 
        (r.shed || 'Shed 1') === targetShed &&
        (r.department || 'Sider') === 'Sider'
      )),
      cleanRule
    ];

    onUpdate(updatedRules);
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

    const targetShed = newCountShed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1');

    const exists = rules.some(r => 
      r.count.toUpperCase() === clean &&
      (r.shed || 'Shed 1') === targetShed
    );
    if (exists) {
      setNewCountError(`Count rule "${clean}" for ${targetShed} already exists.`);
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
      department: 'Sider',
      shed: targetShed
    };

    onUpdate([...rules, newRule]);
    setSelectedCount(clean);
    setBuilderShed(targetShed);
    setNewCountModalOpen(false);
    setNewCountInput('');
    setNewCountError(null);
  };

  // Delete an entire count rule for a shed
  const handleDeleteRule = (ruleCount: string, ruleShed?: string) => {
    const targetShed = ruleShed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1');
    if (confirm(`Delete incentive rule for count "${ruleCount}" in ${targetShed}?`)) {
      const remaining = rules.filter(r => !(
        r.count.toLowerCase().trim() === ruleCount.toLowerCase().trim() && 
        (r.shed || 'Shed 1') === targetShed
      ));
      onUpdate(remaining);
      if (selectedCount === ruleCount) {
        const next = remaining.find(r => (r.shed || 'Shed 1') === targetShed) || remaining[0];
        if (next) {
          setSelectedCount(next.count);
          setBuilderShed(next.shed || 'Shed 1');
        }
      }
    }
  };

  // Delete an individual slot from a rule card
  const handleDeleteSlotFromRule = (ruleCount: string, ruleShed: string | undefined, slotIdx: number) => {
    const targetShed = ruleShed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1');
    const targetRule = rules.find(r => 
      r.count.toLowerCase().trim() === ruleCount.toLowerCase().trim() && 
      (r.shed || 'Shed 1') === targetShed
    );
    if (!targetRule) return;

    if (targetRule.payouts.length <= 1) {
      handleDeleteRule(ruleCount, ruleShed);
      return;
    }

    if (confirm(`Delete Slot ${slotIdx + 1} from ${ruleCount} (${targetShed})?`)) {
      const updatedPayouts = targetRule.payouts.filter((_, idx) => idx !== slotIdx);
      const updatedRules = rules.map(r => 
        (r.count.toLowerCase().trim() === ruleCount.toLowerCase().trim() && (r.shed || 'Shed 1') === targetShed)
          ? { ...r, payouts: updatedPayouts } 
          : r
      );
      onUpdate(updatedRules);
    }
  };

  // Filter rules strictly by selected shed tab, showing only counts from that shed's Count Master
  const filteredRules = React.useMemo(() => {
    return availableCountNames.map(cItem => {
      const match = rules.find(r => 
        r.count.toLowerCase().trim() === cItem.count.toLowerCase() &&
        (selectedShedTab === 'All Sheds' || (r.shed || 'Shed 1') === selectedShedTab || r.shed === 'All Sheds')
      );
      if (match) return match;
      // Default starter rule for counts in Count Master without a custom incentive rule yet
      return {
        count: cItem.count,
        shed: selectedShedTab === 'All Sheds' ? cItem.shed : selectedShedTab,
        department: 'Sider',
        payouts: [
          { gpsThreshold: 140, amount: 100, fromGps: 140, toGps: 140, conditionText: 'for GPSS 140', ruleText: 'Rs 100 for GPSS 140' },
          { gpsThreshold: 135, amount: 90, fromGps: 135, toGps: 140, conditionText: 'for GPS 135 to 140', ruleText: 'Rs 90 for GPS 135 to 140' },
          { gpsThreshold: 130, amount: 80, fromGps: 130, toGps: 135, conditionText: 'for 130 to 135', ruleText: 'Rs 80 for 130 to 135' },
          { gpsThreshold: 125, amount: 70, fromGps: 125, toGps: 130, conditionText: 'for 125 to 130', ruleText: 'Rs 70 for 125 to 130' },
          { gpsThreshold: 120, amount: 60, fromGps: 120, toGps: 125, conditionText: 'for 120 to 125', ruleText: 'Rs 60 for 120 to 125' },
          { gpsThreshold: 115, amount: 50, fromGps: 115, toGps: 120, conditionText: 'for 115 to 120', ruleText: 'Rs 50 for 115 to 120' }
        ]
      } as IncentiveRule;
    });
  }, [availableCountNames, rules, selectedShedTab]);

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

        {/* TOP RIGHT: SHED TABS, QUICK COUNT PILLS & MATRIX BUTTON */}
        <div className="flex flex-col items-start lg:items-end gap-2.5">
          {/* Shed Filter Bar */}
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

          {/* Quick Select Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {filteredRules.map((rule) => {
              const isSelected = rule.count.toLowerCase().trim() === selectedCount.toLowerCase().trim() && (rule.shed || 'All Sheds') === builderShed;
              return (
                <button
                  key={`${rule.count}-${rule.shed || 'All'}`}
                  type="button"
                  onClick={() => {
                    setSelectedCount(rule.count);
                    if (rule.shed) setBuilderShed(rule.shed);
                  }}
                  className={cn(
                    "px-3.5 py-1 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer shadow-2xs flex items-center gap-1.5",
                    isSelected
                      ? "bg-stone-900 text-white shadow-xs scale-102"
                      : "bg-white text-stone-700 hover:text-stone-950 hover:bg-stone-50 border border-stone-200"
                  )}
                >
                  <span>{rule.count}</span>
                  {rule.shed && rule.shed !== 'All Sheds' && (
                    <span className="px-1 py-0.2 bg-stone-200 text-stone-700 rounded text-[9px] font-bold">
                      {rule.shed}
                    </span>
                  )}
                  <span className="opacity-70">({rule.payouts.length} Slots)</span>
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

          {/* ASSIGN SHED ROW */}
          <div className="mb-3">
            <label className="text-[10px] font-black uppercase tracking-wider text-stone-600 block mb-1">
              ASSIGN SHED *
            </label>
            <select
              value={builderShed}
              onChange={(e) => setBuilderShed(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black text-stone-900 focus:bg-white focus:border-emerald-500 outline-none transition-all cursor-pointer font-mono"
            >
              {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(sh => (
                <option key={sh} value={sh}>{sh}</option>
              ))}
            </select>
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
              onChange={(e) => {
                setSelectedCount(e.target.value);
              }}
              className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-black text-stone-900 focus:bg-white focus:border-emerald-500 outline-none transition-all cursor-pointer font-mono"
            >
              {availableCountNames.map(c => (
                <option key={c.count} value={c.count}>
                  {c.count} {c.shed && c.shed !== 'All Sheds' ? `(${c.shed})` : ''}
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
                          min="0"
                          placeholder="0"
                          value={slot.amount === 0 ? '' : slot.amount}
                          onFocus={() => {
                            if (slot.amount === 0 || slot.amount === '0') {
                              handleUpdateSlotAmount(idx, '');
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === '-' || e.key === 'Minus') e.preventDefault();
                          }}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') {
                              handleUpdateSlotAmount(idx, '');
                            } else {
                              const parsed = parseFloat(val);
                              if (!isNaN(parsed) && parsed >= 0) {
                                handleUpdateSlotAmount(idx, val);
                              }
                            }
                          }}
                          className="w-full pl-7 pr-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-bold text-stone-900 focus:bg-white focus:border-emerald-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* FROM GPS INPUT */}
                    <div className="col-span-3">
                      <input
                        type="number"
                        min="0"
                        placeholder="0"
                        value={slot.fromGps === 0 ? '' : slot.fromGps}
                        onFocus={() => {
                          if (slot.fromGps === 0 || slot.fromGps === '0') {
                            handleUpdateSlotFrom(idx, '');
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === '-' || e.key === 'Minus') e.preventDefault();
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '') {
                            handleUpdateSlotFrom(idx, '');
                          } else {
                            const parsed = parseFloat(val);
                            if (!isNaN(parsed) && parsed >= 0) {
                              handleUpdateSlotFrom(idx, val);
                            }
                          }
                        }}
                        className="w-full px-2 py-1.5 bg-stone-50 border border-stone-200 rounded-lg text-xs font-mono font-bold text-stone-900 focus:bg-white focus:border-emerald-500 outline-none"
                      />
                    </div>

                    {/* TO GPS INPUT */}
                    <div className="col-span-3">
                      <input
                        type="text"
                        placeholder="GPSS Target"
                        value={slot.toGps}
                        onFocus={() => {
                          if (slot.toGps === '0') {
                            handleUpdateSlotTo(idx, '');
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === '-' || e.key === 'Minus') e.preventDefault();
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val.includes('-')) {
                            handleUpdateSlotTo(idx, val);
                          }
                        }}
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
          {filteredRules.length === 0 ? (
            <div className="bg-white rounded-2xl p-10 border border-stone-200 text-center text-stone-400">
              <p className="text-sm font-bold text-stone-700">No incentive rules configured for {selectedShedTab}.</p>
              <p className="text-xs text-stone-400 mt-1">Select a different shed tab above or use the Builder on the left to configure rules for {selectedShedTab}.</p>
            </div>
          ) : (
            filteredRules.map((rule) => {
              const isSelected = rule.count.toLowerCase().trim() === selectedCount.toLowerCase().trim() && (rule.shed || 'All Sheds') === builderShed;
              const sortedPayouts = [...rule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);

              return (
                <div
                  key={`${rule.count}-${rule.shed || 'All'}`}

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
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-black text-stone-900 tracking-tight font-mono">
                          {rule.count}
                        </h3>
                        <span className="px-2 py-0.5 bg-stone-100 text-stone-700 rounded-md text-[10px] font-bold font-mono">
                          {rule.shed || 'All Sheds'}
                        </span>
                      </div>
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
                        if (rule.shed) setBuilderShed(rule.shed);
                        handleAddBuilderSlot();
                      }}
                      className="px-2.5 py-1 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      + Add Slot
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCount(rule.count);
                        if (rule.shed) setBuilderShed(rule.shed);
                      }}
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

                    <button
                      type="button"
                      onClick={() => handleDeleteRule(rule.count, rule.shed)}
                      className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors cursor-pointer border border-stone-200 hover:border-red-200"
                      title="Delete Count Rule"
                    >
                      <Trash2 size={14} />
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
                                onClick={() => handleDeleteSlotFromRule(rule.count, rule.shed, idx)}
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
          })
        )}
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

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 mb-1">
                  Assign Shed *
                </label>
                <select
                  value={newCountShed}
                  onChange={(e) => setNewCountShed(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold outline-none focus:border-emerald-500 font-mono"
                >
                  {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(sh => (
                    <option key={sh} value={sh}>{sh}</option>
                  ))}
                </select>
              </div>

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
              </div>
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
