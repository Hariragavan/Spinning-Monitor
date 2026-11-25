'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check, ChevronDown } from 'lucide-react';
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
  disabledOptionReason?: (w: Sider) => string | null | undefined;
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
  otherLabel = 'All Other Staff',
  disabledOptionReason
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [popoverCoords, setPopoverCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUpward: boolean;
    maxHeight: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
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

  // Compute viewport-safe coordinates so dropdown is never clipped by modal overflow-hidden
  const updatePosition = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const viewportW = window.innerWidth;
    const spaceBelow = viewportH - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxListH = Math.max(160, Math.min(280, (openUpward ? spaceAbove : spaceBelow) - 56));
    const width = Math.min(rect.width, viewportW - 16);
    const left = Math.max(8, Math.min(rect.left, viewportW - width - 8));

    setPopoverCoords({
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      left,
      width,
      openUpward,
      maxHeight: maxListH
    });
  }, []);

  // Click outside to close (respecting portaled popoverRef)
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!popoverRef.current || !popoverRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    if (isOpen) {
      updatePosition();
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', updatePosition);
      window.addEventListener('scroll', updatePosition, true);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen, updatePosition]);

  // Auto-focus search input when opened
  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setTimeout(() => {
        updatePosition();
        searchInputRef.current?.focus();
      }, 30);
    }
  }, [isOpen, updatePosition]);

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

      {/* Dropdown Popover (portaled to body so ancestor overflow-hidden never clips it) */}
      {isOpen && typeof document !== 'undefined' && popoverCoords && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: popoverCoords.top,
            left: popoverCoords.left,
            width: popoverCoords.width,
            transform: popoverCoords.openUpward ? 'translateY(-100%)' : undefined,
            zIndex: 9999
          }}
          className="bg-white border border-stone-200 rounded-2xl shadow-2xl overflow-hidden"
        >
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
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 cursor-pointer"
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>

          {/* List Options */}
          <div
            style={{ maxHeight: `${popoverCoords.maxHeight}px` }}
            className="overflow-y-auto p-1.5 space-y-1"
          >
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
                      const blockedReason = !isSelected && disabledOptionReason ? disabledOptionReason(w) : null;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          disabled={Boolean(blockedReason)}
                          onClick={() => !blockedReason && handleSelect(w.id)}
                          className={cn(
                            "w-full px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors flex items-center justify-between group",
                            blockedReason
                              ? "opacity-50 cursor-not-allowed bg-stone-50 text-stone-400"
                              : isSelected
                              ? "bg-emerald-600 text-white font-black cursor-pointer"
                              : "hover:bg-emerald-50/70 text-stone-800 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-bold truncate uppercase">{w.name}</span>
                            {w.tNo && (
                              <span className={cn(
                                "text-[10px] font-mono px-1.5 py-0.2 rounded font-black",
                                isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-emerald-800 border border-emerald-200"
                              )}>
                                #{w.tNo}
                              </span>
                            )}
                            {blockedReason && (
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                {blockedReason}
                              </span>
                            )}
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
                      const blockedReason = !isSelected && disabledOptionReason ? disabledOptionReason(w) : null;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          disabled={Boolean(blockedReason)}
                          onClick={() => !blockedReason && handleSelect(w.id)}
                          className={cn(
                            "w-full px-2.5 py-1.5 text-left text-xs rounded-lg transition-colors flex items-center justify-between group",
                            blockedReason
                              ? "opacity-50 cursor-not-allowed bg-stone-50 text-stone-400"
                              : isSelected
                              ? "bg-emerald-600 text-white font-black cursor-pointer"
                              : "hover:bg-stone-100 text-stone-800 cursor-pointer"
                          )}
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-bold truncate uppercase">{w.name}</span>
                            {w.tNo && (
                              <span className={cn(
                                "text-[10px] font-mono px-1.5 py-0.2 rounded font-black",
                                isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-stone-600 border border-stone-200"
                              )}>
                                #{w.tNo}
                              </span>
                            )}
                            {w.department && (
                              <span className={cn(
                                "text-[9px] uppercase font-bold px-1 rounded",
                                isSelected ? "text-emerald-100" : "text-stone-400"
                              )}>
                                [{w.department}]
                              </span>
                            )}
                            {blockedReason && (
                              <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 border border-amber-200 shrink-0">
                                {blockedReason}
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
        </div>,
        document.body
      )}
    </div>
  );
};

