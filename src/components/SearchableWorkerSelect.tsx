'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X, Check, User, ChevronDown } from 'lucide-react';
import { Sider } from '../types';
import { cn } from '../lib/utils';

export interface SearchableWorkerSelectProps {
  value: string;
  onChange: (workerId: string) => void;
  workers: Sider[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  priorityDeptFilter?: (w: Sider) => boolean;
  priorityLabel?: string;
  otherLabel?: string;
}

export const SearchableWorkerSelect: React.FC<SearchableWorkerSelectProps> = ({
  value,
  onChange,
  workers,
  placeholder = '-- Select Employee --',
  className,
  disabled = false,
  priorityDeptFilter,
  priorityLabel = 'Department Staff',
  otherLabel = 'All Other Staff'
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Selected worker resolution
  const selectedWorker = useMemo(() => {
    if (!value) return null;
    const clean = String(value).trim().toUpperCase();
    return workers.find(w => 
      (w.id && w.id.toUpperCase() === clean) ||
      (w.tNo && w.tNo.toUpperCase() === clean) ||
      (w.name && w.name.toUpperCase() === clean)
    ) || null;
  }, [value, workers]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Split and filter workers based on search and priority department
  const { priorityMatches, otherMatches, totalMatches } = useMemo(() => {
    const q = search.trim().toLowerCase();

    const matchesQuery = (w: Sider) => {
      if (!q) return true;
      const name = (w.name || '').toLowerCase();
      const tNo = (w.tNo || '').toLowerCase();
      const dept = (w.department || '').toLowerCase();
      return name.includes(q) || tNo.includes(q) || dept.includes(q);
    };

    const filtered = workers.filter(matchesQuery);

    if (priorityDeptFilter) {
      const pri: Sider[] = [];
      const oth: Sider[] = [];
      filtered.forEach(w => {
        if (priorityDeptFilter(w)) pri.push(w);
        else oth.push(w);
      });
      return { priorityMatches: pri, otherMatches: oth, totalMatches: filtered.length };
    }

    return { priorityMatches: filtered, otherMatches: [], totalMatches: filtered.length };
  }, [workers, search, priorityDeptFilter]);

  const handleSelect = (workerId: string) => {
    onChange(workerId);
    setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          "w-full px-3 py-2 border rounded-xl text-xs font-bold text-stone-800 transition-all flex items-center justify-between gap-1.5 text-left outline-none cursor-pointer font-mono",
          disabled && "opacity-50 cursor-not-allowed bg-stone-100",
          !disabled && isOpen && "bg-white border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs",
          !disabled && !isOpen && "bg-stone-50 hover:bg-white border-stone-200",
          className
        )}
      >
        <span className="truncate flex-1">
          {selectedWorker ? (
            <span className="font-bold flex items-center gap-1.5 truncate text-stone-900">
              <span className="truncate">{selectedWorker.name}</span>
              <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200 text-[10px] font-mono shrink-0">
                #{selectedWorker.tNo}
              </span>
            </span>
          ) : (
            <span className="text-stone-400 font-sans font-normal italic truncate">
              {placeholder}
            </span>
          )}
        </span>

        <span className="flex items-center gap-1 shrink-0 text-stone-400">
          {selectedWorker && !disabled && (
            <span
              onClick={handleClear}
              className="p-0.5 hover:text-stone-700 hover:bg-stone-200/80 rounded transition cursor-pointer"
              title="Clear selection"
            >
              <X size={12} />
            </span>
          )}
          <ChevronDown size={13} className={cn("transition-transform duration-150", isOpen && "rotate-180")} />
        </span>
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-white border border-stone-200 rounded-2xl shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
          {/* Search Input Box */}
          <div className="p-2 border-b border-stone-100 bg-stone-50/70">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or token no..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-stone-200 rounded-xl outline-none focus:border-emerald-500 text-stone-900 placeholder-stone-400 font-sans"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* List Options */}
          <div className="max-h-60 overflow-y-auto p-1.5 space-y-1">
            {/* Unassigned / Clear Option */}
            <button
              type="button"
              onClick={() => handleSelect('')}
              className={cn(
                "w-full px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors flex items-center justify-between cursor-pointer",
                !value ? "bg-stone-100 text-stone-900 font-bold" : "text-stone-500 hover:bg-stone-50 hover:text-stone-800"
              )}
            >
              <span className="italic">{placeholder}</span>
              {!value && <Check size={12} className="text-stone-600" />}
            </button>

            {totalMatches === 0 ? (
              <div className="py-6 text-center text-stone-400 text-xs italic">
                No matching employee found
              </div>
            ) : (
              <>
                {/* Priority Group */}
                {priorityMatches.length > 0 && (
                  <div>
                    {otherMatches.length > 0 && (
                      <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-800 bg-emerald-50/70 rounded-md my-1">
                        {priorityLabel} ({priorityMatches.length})
                      </div>
                    )}
                    {priorityMatches.map(w => {
                      const isSelected = selectedWorker?.id === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => handleSelect(w.id)}
                          className={cn(
                            "w-full px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors flex items-center justify-between cursor-pointer group",
                            isSelected
                              ? "bg-emerald-600 text-white font-black"
                              : "hover:bg-emerald-50/70 text-stone-800"
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-bold truncate uppercase">{w.name}</span>
                            <span className={cn(
                              "text-[10px] font-mono px-1.5 py-0.2 rounded font-black",
                              isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-emerald-800 border border-emerald-200"
                            )}>
                              #{w.tNo}
                            </span>
                          </div>
                          {isSelected && <Check size={13} className="text-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Other Group */}
                {otherMatches.length > 0 && (
                  <div className="pt-1">
                    <div className="px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-stone-500 bg-stone-100 rounded-md my-1">
                      {otherLabel} ({otherMatches.length})
                    </div>
                    {otherMatches.map(w => {
                      const isSelected = selectedWorker?.id === w.id;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          onClick={() => handleSelect(w.id)}
                          className={cn(
                            "w-full px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors flex items-center justify-between cursor-pointer group",
                            isSelected
                              ? "bg-emerald-600 text-white font-black"
                              : "hover:bg-stone-100 text-stone-800"
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-bold truncate uppercase">{w.name}</span>
                            <span className={cn(
                              "text-[10px] font-mono px-1.5 py-0.2 rounded font-black",
                              isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600 border border-stone-200"
                            )}>
                              #{w.tNo}
                            </span>
                            {w.department && (
                              <span className={cn(
                                "text-[9px] uppercase font-bold px-1 rounded",
                                isSelected ? "text-emerald-100" : "text-stone-400"
                              )}>
                                [{w.department}]
                              </span>
                            )}
                          </div>
                          {isSelected && <Check size={13} className="text-white shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

