import React, { useState, useEffect } from 'react';
import { CountConversion } from '../types';
import { Hash, Plus, Trash2, Save, Info, Calculator, Edit2, Check, ArrowRight } from 'lucide-react';
import { cn } from '../lib/utils';

interface CountMasterProps {
  conversions: CountConversion[];
  onSave: (conversion: CountConversion) => void;
  onDelete: (count: string, shed?: string) => void;
  currentShed?: string;
}

export const CountMaster: React.FC<CountMasterProps> = ({ 
  conversions, 
  onSave, 
  onDelete,
  currentShed = 'Shed 1'
}) => {
  // Active Shed Tab Filter
  const [selectedShedTab, setSelectedShedTab] = useState<string>(() => {
    return currentShed || 'Shed 1';
  });

  // Left Form State
  const [targetShed, setTargetShed] = useState<string>(() => {
    return currentShed && currentShed !== 'All Sheds' ? currentShed : 'Shed 1';
  });
  const [newCount, setNewCount] = useState('');
  const [newFactor, setNewFactor] = useState('');
  const [description, setDescription] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Quick Verification State
  const [testGps, setTestGps] = useState<number>(160);

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
      map[key] = c.multiplicationFactor !== undefined ? String(c.multiplicationFactor) : '1.0';
    });
    setRowFactors(map);
  }, [conversions]);

  // Filter conversions strictly by selected shed tab
  const filteredConversions = conversions.filter(c => {
    if (selectedShedTab === 'All Sheds') return true;
    const s = c.shed || 'Shed 1';
    return s === selectedShedTab;
  });

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
    setNewFactor(String(rule.multiplicationFactor));
    setDescription(rule.description || '');
    setTargetShed(rule.shed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : 'Shed 1'));
    setIsEditing(true);
  };

  const handleApplyRowFactor = (rule: CountConversion) => {
    const effectiveShed = selectedShedTab !== 'All Sheds' ? selectedShedTab : (rule.shed || 'Shed 1');
    const rowKey = `${rule.count}__${rule.shed || 'Shed 1'}`;
    const rawVal = rowFactors[rowKey] !== undefined ? rowFactors[rowKey] : (rowFactors[`${rule.count}__${effectiveShed}`] ?? String(rule.multiplicationFactor ?? 1.0));
    const parsed = parseFloat(rawVal);
    if (isNaN(parsed)) return;

    onSave({
      count: rule.count.trim(),
      multiplicationFactor: parsed,
      description: rule.description,
      shed: effectiveShed
    });

    setAppliedRowKey(rowKey);
    setTimeout(() => {
      setAppliedRowKey(null);
    }, 2000);
  };


  // Quick Verification Calculation
  const factorForCalc = parseFloat(newFactor) || 1.0;
  const quick40sResult = (testGps * factorForCalc).toFixed(2);

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-in fade-in duration-300">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight">
            COUNT MASTER
          </h1>
          <p className="text-xs font-semibold text-stone-400 mt-0.5 tracking-wider uppercase">
            GPSS Conversion Factors for 40s Standard (Edit directly in table or form)
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

      {/* TWO COLUMN GRID LAYOUT */}
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
                  placeholder="e.g. 1.0000 or 0.6400"
                  value={newFactor}
                  onChange={(e) => setNewFactor(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:bg-white focus:border-emerald-500 outline-none transition-all font-mono pr-10"
                  required
                />
                <Calculator size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400" />
              </div>
              <p className="mt-1 text-[10px] text-stone-400 italic">
                40s GPS = Actual GPS × Factor
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
                value={testGps}
                onChange={(e) => setTestGps(Number(e.target.value) || 0)}
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
                You can change any count's 40s conversion factor directly in the table on the right or using this form. Updating 40s or 040/1-PH-PC automatically updates all 40s Ring Frame calculations across all shifts.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: COUNT CONVERSION REGISTRY TABLE */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden">
          {/* REGISTRY HEADER */}
          <div className="p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-stone-50/50">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black uppercase tracking-wider text-stone-900">
                  COUNT CONVERSION REGISTRY
                </h3>
                {selectedShedTab !== 'All Sheds' && (
                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-md text-[10px] font-black uppercase font-mono">
                    {selectedShedTab}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                Type a new factor in any row and click Apply (or press Enter) to update immediately
              </p>
            </div>

            <span className="px-3 py-1 bg-stone-200 text-stone-700 rounded-full text-[10px] font-black uppercase tracking-wider shrink-0 self-start sm:self-auto">
              {filteredConversions.length} ACTIVE RULES
            </span>
          </div>

          {/* TABLE */}
          <div className="overflow-x-auto">
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
                      No custom conversions defined for {selectedShedTab}. Add a rule on the left or switch shed filter.
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

                        {/* 40s CONVERSION FACTOR (EDITABLE PILL + APPLY BUTTON) */}
                        <td className="px-5 py-4">
                          <div className="inline-flex items-center gap-1.5 p-1 bg-emerald-50/80 border border-emerald-200 rounded-xl">
                            <span className="text-xs font-mono font-bold text-emerald-800 pl-1.5">
                              ×
                            </span>
                            <input
                              type="number"
                              step="0.0001"
                              value={currentVal}
                              onChange={(e) => {
                                const val = e.target.value;
                                setRowFactors(prev => ({ ...prev, [rowKey]: val }));
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  handleApplyRowFactor(rule);
                                }
                              }}
                              className="w-20 px-1.5 py-1 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-black text-emerald-950 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-center"
                            />
                            <button
                              type="button"
                              onClick={() => handleApplyRowFactor(rule)}
                              className={cn(
                                "px-2.5 py-1 rounded-lg text-[11px] font-black transition-all cursor-pointer flex items-center gap-1",
                                isApplied
                                  ? "bg-emerald-600 text-white"
                                  : "bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs"
                              )}
                            >
                              <Check size={12} />
                              <span>{isApplied ? 'Saved!' : 'Apply'}</span>
                            </button>
                          </div>
                        </td>

                        {/* DESCRIPTION */}
                        <td className="px-5 py-4 text-stone-500 text-xs">
                          {rule.description || '—'}
                        </td>

                        {/* ACTIONS */}
                        <td className="px-5 py-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleEditRow(rule)}
                              className="p-1.5 text-stone-400 hover:text-stone-800 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                              title="Edit in form"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                if (confirm(`Delete conversion factor for count "${rule.count}" (${rule.shed || 'All Sheds'})?`)) {
                                  onDelete(rule.count, rule.shed);
                                }
                              }}
                              className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="Delete rule"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
