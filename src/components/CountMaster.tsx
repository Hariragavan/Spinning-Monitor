import React, { useState } from 'react';
import { CountConversion } from '../types';
import { Hash, Plus, Trash2, Save, Info, Calculator } from 'lucide-react';

interface CountMasterProps {
  conversions: CountConversion[];
  onSave: (conversion: CountConversion) => void;
  onDelete: (count: string) => void;
}

export const CountMaster: React.FC<CountMasterProps> = ({ conversions, onSave, onDelete }) => {
  const [newCount, setNewCount] = useState('');
  const [newFactor, setNewFactor] = useState('');
  const [description, setDescription] = useState('');

  const handleSave = () => {
    if (!newCount || !newFactor) return;
    onSave({
      count: newCount,
      multiplicationFactor: parseFloat(newFactor),
      description
    });
    setNewCount('');
    setNewFactor('');
    setDescription('');
  };

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-black text-stone-900 tracking-tighter uppercase">Count Master</h2>
          <p className="text-xs text-stone-400 font-bold uppercase tracking-[0.2em] mt-1">GPSS Conversion Factors for 40s Standard</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Entry Form */}
        <div className="lg:col-span-1">
          <div className="bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm sticky top-32">
            <h3 className="text-sm font-black uppercase tracking-widest text-stone-900 mb-6 flex items-center gap-2">
              <Plus size={16} className="text-emerald-600" />
              Add Count Factor
            </h3>
            
            <div className="space-y-6">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Count Name</label>
                <input 
                  type="text"
                  placeholder="e.g. 30/1CH"
                  value={newCount}
                  onChange={(e) => setNewCount(e.target.value)}
                  className="w-full px-5 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-bold text-stone-700"
                />
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Multiplication Factor</label>
                <div className="relative">
                  <input 
                    type="number"
                    step="0.0001"
                    placeholder="e.g. 0.5197"
                    value={newFactor}
                    onChange={(e) => setNewFactor(e.target.value)}
                    className="w-full px-5 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-bold text-stone-700 pr-12"
                  />
                  <Calculator size={18} className="absolute right-5 top-1/2 -translate-y-1/2 text-stone-300" />
                </div>
                <p className="mt-2 text-[10px] text-stone-400 italic">40s GPS = Actual GPS × Factor</p>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Description (Optional)</label>
                <input 
                  type="text"
                  placeholder="e.g. Special Blend"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-5 py-3 bg-stone-50 border border-stone-200 rounded-2xl focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all font-bold text-stone-700"
                />
              </div>

              <button 
                onClick={handleSave}
                disabled={!newCount || !newFactor}
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:bg-stone-800 transition-all shadow-xl shadow-stone-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed mt-4"
              >
                <Save size={16} />
                Save Count Rule
              </button>
            </div>

            <div className="mt-8 p-6 bg-stone-50 rounded-2xl border border-stone-100">
              <div className="flex gap-3 text-stone-400">
                <Info size={16} className="shrink-0" />
                <p className="text-[10px] font-bold uppercase leading-relaxed tracking-tight">
                  Count Master rules act as a fallback. The system prioritizes values found in the 'Running Count' section of uploaded Excel files.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Factors List */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-[2.5rem] border border-stone-200 shadow-sm overflow-hidden">
            <div className="p-8 border-b border-stone-100 flex justify-between items-center bg-stone-50/50">
              <h3 className="text-xl font-bold uppercase tracking-tight text-stone-800">Count Conversion Registry</h3>
              <span className="px-4 py-1.5 bg-stone-200 text-stone-600 rounded-full text-[10px] font-black uppercase tracking-widest">
                {conversions.length} ACTIVE RULES
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-stone-50/50 border-b border-stone-100">
                    <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-stone-400 text-left">Count Name</th>
                    <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-stone-400 text-center">Factor</th>
                    <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-stone-400 text-left">Description</th>
                    <th className="px-8 py-5 text-[11px] font-black uppercase tracking-widest text-stone-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {conversions.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-8 py-12 text-center text-stone-400 italic">
                        No custom conversions defined. Default formula: (Count/40)^1.5 will be used.
                      </td>
                    </tr>
                  ) : (
                    conversions.map((rule) => (
                      <tr key={rule.count} className="hover:bg-stone-50/30 transition-all group">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-stone-100 rounded-lg flex items-center justify-center text-stone-400">
                              <Hash size={16} />
                            </div>
                            <span className="font-bold text-stone-900">{rule.count}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-center">
                          <span className="px-4 py-1 bg-emerald-50 text-emerald-700 rounded-lg font-black font-mono">
                            × {rule.multiplicationFactor.toFixed(4)}
                          </span>
                        </td>
                        <td className="px-8 py-6 text-sm text-stone-500 font-medium italic">
                          {rule.description || '—'}
                        </td>
                        <td className="px-8 py-6 text-right">
                          <button 
                            onClick={() => onDelete(rule.count)}
                            className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
