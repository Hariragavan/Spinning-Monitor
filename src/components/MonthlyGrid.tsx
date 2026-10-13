import React, { useMemo, useEffect, useState } from 'react';
import { DailyReport, Sider, IncentiveRule, ProductionEntry, MachineEmData, FrozenMonthRecord } from '../types';
import { Calendar, LayoutGrid, Target, ArrowRight, Printer, ArrowUpDown, ArrowUp, ArrowDown, Sparkles, ChevronRight, Lock, Unlock, Download, FileSpreadsheet } from 'lucide-react';
import { cn, calculateIncentive, resolveWorker, getGaiterIncentive, parseUniversalDateParts } from '../lib/utils';
import { motion } from 'motion/react';
import { getMonthKey } from '../lib/frozenMonths';
import * as XLSX from 'xlsx';

interface MonthlyGridProps {
  history: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  machineEm?: MachineEmData;
  type: 'gps' | 'production';
  onEditDate?: (date: string) => void;
  selectedMonth: number;
  selectedYear: number;
  onMonthChange: (month: number) => void;
  onYearChange: (year: number) => void;
  isTvMode?: boolean;
  onPagesDetermined?: (pages: number) => void;
  tvPageInterval?: number;
  emHighLimit?: number;
  frozenMonths?: Record<string, FrozenMonthRecord>;
  onToggleFreezeMonth?: (month: number, year: number) => void;
}

export const MonthlyGrid: React.FC<MonthlyGridProps> = ({ 
  history, 
  workers, 
  rules,
  machineEm,
  type: initialType, 
  onEditDate,
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
  isTvMode = false,
  onPagesDetermined,
  tvPageInterval,
  emHighLimit = 4,
  frozenMonths,
  onToggleFreezeMonth
}) => {
  const monthKey = getMonthKey(selectedMonth, selectedYear);
  const frozenRecord = frozenMonths?.[monthKey];
  const isFrozen = !!frozenRecord;
  const [viewMode, setViewMode] = React.useState<'machine' | 'worker'>('worker');
  const [metricType, setMetricType] = React.useState<'gps' | 'production' | 'incentive'>('incentive');
  const [sortField, setSortField] = React.useState<'total' | 'tNo' | 'label' | 'averageEm' | 'default'>('total');
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc');

  // Generate days for the selected month
  const gridDays = useMemo(() => {
    const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
    return Array.from({ length: lastDay }, (_, i) => i + 1);
  }, [selectedMonth, selectedYear]);

  // Find the last day with data/reports in the selected month
  const lastActiveDay = useMemo(() => {
    let maxDay = 0;
    history.forEach(report => {
      if (!report || !report.date) return;
      const parts = parseUniversalDateParts(report.date);
      if (parts && parts.month === selectedMonth && parts.year === selectedYear) {
        if (parts.day > maxDay) {
          maxDay = parts.day;
        }
      }
    });

    const today = new Date();
    const isCurrentMonthYear = today.getMonth() + 1 === selectedMonth && today.getFullYear() === selectedYear;

    if (isCurrentMonthYear) {
      // If we are looking at the current month/year, we should show up to today's date (or maxDay if there's somehow a future report)
      return Math.max(maxDay, today.getDate());
    } else {
      // If looking at a past/future month, use maxDay if we have reports, otherwise default to the last day of that month
      if (maxDay > 0) {
        return maxDay;
      } else {
        return new Date(selectedYear, selectedMonth, 0).getDate();
      }
    }
  }, [history, selectedMonth, selectedYear]);

  // TV mode only wants last 15 days of reports to increase readability and fit on a 50-inch screen
  const displayedDays = useMemo(() => {
    if (isTvMode) {
      const start = Math.max(1, lastActiveDay - 14);
      const days: number[] = [];
      for (let d = start; d <= lastActiveDay; d++) {
        days.push(d);
      }
      return days;
    }
    return gridDays;
  }, [isTvMode, gridDays, lastActiveDay]);

  const dataMonthDisplay = useMemo(() => {
    return new Date(selectedYear, selectedMonth - 1).toLocaleString('default', { month: 'long', year: 'numeric' });
  }, [selectedMonth, selectedYear]);

  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' }
  ];

  const years = [2025, 2026, 2027];
  
  // Extract all machine numbers
  const machineNos = useMemo(() => {
    const nos = new Set<string>();
    history.forEach(report => {
      if (report.summaries) report.summaries.forEach(s => nos.add(s.frameNo));
      if (report.entries) report.entries.forEach(e => {
        if (e.frameNo && e.frameNo !== 'K00') nos.add(e.frameNo);
      });
    });
    return Array.from(nos).sort();
  }, [history]);

  // Extract all unique siders from BOTH current workers AND history
  const historyWorkersList = useMemo(() => {
    const siderMap = new Map<string, { id: string; name: string; tNo: string }>();
    
    // Helper to check if a string is a valid UUID
    const isUUID = (str: string) => {
      if (!str) return false;
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str.trim());
    };

    // 1. Seed with Master Workers (Absolute Source of Truth)
    workers.forEach(w => {
      siderMap.set(w.id, { 
        id: w.id, 
        name: w.name, 
        tNo: isUUID(w.tNo) ? "" : (w.tNo || "") 
      });
    });

    // 2. Process History to find missing workers or entries
    history.forEach(report => {
      if (!report || !report.entries) return;
      report.entries.forEach(e => {
        const assignedIds = new Set<string>();
        if (e.siderId) assignedIds.add(String(e.siderId).trim());
        if (e.siderIds) e.siderIds.forEach(id => {
          if (id) assignedIds.add(String(id).trim());
        });

        if (assignedIds.size === 0) return;
        
        assignedIds.forEach(idVal => {
          const worker = resolveWorker(idVal, e.siderName, workers);
          const key = worker.id;
          if (!key) return;

          const entryName = worker.name || e.siderName?.trim() || '';
          const isNameUUID = isUUID(entryName);
          const isTNoUUID = isUUID(worker.tNo);
          const cleanTNo = isTNoUUID ? "" : (worker.tNo || "");

          if (!siderMap.has(key)) {
            // New worker found in history
            siderMap.set(key, {
              id: worker.id,
              name: isNameUUID ? "Unregistered" : (entryName || `Worker ${worker.id.slice(0, 4).toUpperCase()}`),
              tNo: cleanTNo
            });
          } else {
            // Existing worker: update details/name if empty or custom worker fallback, and entryName is real
            const current = siderMap.get(key)!;
            const isCurrentNameUUID = isUUID(current.name);
            const isCurrentTNoUUID = isUUID(current.tNo);
            
            let updatedName = current.name;
            let updatedTNo = current.tNo;

            if ((isCurrentNameUUID || !current.name || current.name.startsWith('Worker ')) && !isNameUUID && entryName) {
              updatedName = entryName;
            }
            if ((isCurrentTNoUUID || !current.tNo) && !isTNoUUID && cleanTNo) {
              updatedTNo = cleanTNo;
            }

            siderMap.set(key, {
              ...current,
              name: updatedName,
              tNo: updatedTNo
            });
          }
        });
      });

      // 3. Process Gaiters
      if (report.gaiters) {
        const shifts: (keyof typeof report.gaiters)[] = ['I', 'II', 'III'];
        shifts.forEach(shift => {
          const gaiterIds = report.gaiters?.[shift] || [];
          gaiterIds.forEach(gidVal => {
            if (!gidVal) return;
            const worker = resolveWorker(gidVal, undefined, workers);
            const key = worker.id;
            if (!key) return;

            const isTNoUUID = isUUID(worker.tNo);
            const cleanTNo = isTNoUUID ? "" : (worker.tNo || "");
            const isNameUUID = isUUID(worker.name);

            if (!siderMap.has(key)) {
              siderMap.set(key, {
                id: worker.id,
                name: isNameUUID ? "Unregistered" : (worker.name || `Worker ${worker.id.slice(0, 4).toUpperCase()}`),
                tNo: cleanTNo
              });
            }
          });
        });
      }
    });
    
    const finalWorkers = Array.from(siderMap.values());

    // Try to sort by TK No if it's numeric, otherwise by name
    return finalWorkers.sort((a, b) => {
      if (!a.tNo && b.tNo) return 1;
      if (a.tNo && !b.tNo) return -1;
      if (!a.tNo && !b.tNo) return a.name.localeCompare(b.name);

      const aNum = parseInt(a.tNo);
      const bNum = parseInt(b.tNo);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.tNo.localeCompare(b.tNo);
    });
  }, [history, workers]);

  const getMetricByDay = (day: number, workerId: string, machineId: string, tNo: string, workerName?: string) => {
    const dateStr = `${day.toString().padStart(2, '0')}/${selectedMonth.toString().padStart(2, '0')}/${selectedYear}`;
    const report = history.find(r => r.date === dateStr);
    if (!report) return null;

    if (viewMode === 'machine') {
      const summary = report.summaries.find(s => s.frameNo === machineId);
      if (summary) {
        if (metricType === 'gps') return summary.avgGps;
        if (metricType === 'production') return summary.actualProd;
      }
      const entries = report.entries.filter(e => e.frameNo === machineId);
      if (entries.length === 0) return null;
      if (metricType === 'gps') return entries.reduce((acc, curr) => acc + curr.gpsActual, 0) / entries.length;
      if (metricType === 'production') return entries.reduce((acc, curr) => acc + curr.productionActual, 0);
      if (metricType === 'incentive') return entries.reduce((acc, curr) => acc + calculateIncentive(curr, rules), 0);
    } else {
      // 1. Calculate Machine Assignments
      const entries = report.entries.filter(e => {
        const assignedIds = new Set<string>();
        if (e.siderId) assignedIds.add(String(e.siderId).trim());
        if (e.siderIds) e.siderIds.forEach(id => {
          if (id) assignedIds.add(String(id).trim());
        });

        let matches = false;
        assignedIds.forEach(idVal => {
          const resolved = resolveWorker(idVal, e.siderName, workers);
          const normWorkerName = (workerName || '').toLowerCase().trim();
          const normResolvedName = (resolved.name || '').toLowerCase().trim();

          // Helper to check if a string is a real, non-placeholder ticket number
          const isTNoReal = (t: string) => {
            if (!t) return false;
            const clean = t.trim();
            if (clean === "" || clean.toLowerCase() === "n/a" || clean.toLowerCase() === "unknown") return false;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false;
            if (clean.startsWith('T-') || clean.startsWith('w-')) return false;
            return true;
          };

          const hasTNoConflict = isTNoReal(resolved.tNo) && isTNoReal(tNo) && resolved.tNo.trim().toUpperCase() !== tNo.trim().toUpperCase();

          let idMatches = resolved.id === workerId || (isTNoReal(resolved.tNo) && isTNoReal(tNo) && resolved.tNo.trim().toUpperCase() === tNo.trim().toUpperCase());
          
          if (!idMatches && !hasTNoConflict && normResolvedName && normWorkerName) {
            if (normResolvedName === normWorkerName) {
              idMatches = true;
            } else {
              const words1 = normResolvedName.split(/\s+/).filter(Boolean);
              const words2 = normWorkerName.split(/\s+/).filter(Boolean);
              if (words1.length > 0 && words2.length > 0) {
                const isSubset = (shortWords: string[], longWords: string[]) => {
                  return shortWords.every(sw => longWords.includes(sw));
                };
                if (words1.length <= words2.length) {
                  idMatches = isSubset(words1, words2);
                } else {
                  idMatches = isSubset(words2, words1);
                }
              }
            }
          }
          
          if (idMatches) matches = true;
        });

        return matches;
      });
      
      let totalValue = 0;
      let hasData = false;

      if (entries.length > 0) {
        hasData = true;
        if (metricType === 'gps') totalValue = entries.reduce((acc, curr) => acc + curr.gpsActual, 0) / entries.length;
        else if (metricType === 'production') totalValue = entries.reduce((acc, curr) => acc + curr.productionActual, 0);
        else if (metricType === 'incentive') totalValue = entries.reduce((acc, curr) => acc + calculateIncentive(curr, rules), 0);
      }

      // 2. Add Gaiter Incentives if in Incentive mode
      if (metricType === 'incentive' && report.gaiters) {
        const shifts: (keyof typeof report.gaiters)[] = ['I', 'II', 'III'];
        shifts.forEach(shift => {
          const gaiterIds = report.gaiters[shift] || [];
          const isGaiter = gaiterIds.some(gid => {
            const resolved = resolveWorker(gid, undefined, workers);
            const normWorkerName = (workerName || '').toLowerCase().trim();
            const normResolvedName = (resolved.name || '').toLowerCase().trim();
            
            // Helper to check if a string is a real, non-placeholder ticket number
            const isTNoReal = (t: string) => {
              if (!t) return false;
              const clean = t.trim();
              if (clean === "" || clean.toLowerCase() === "n/a" || clean.toLowerCase() === "unknown") return false;
              if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false;
              if (clean.startsWith('T-') || clean.startsWith('w-')) return false;
              return true;
            };

            const hasTNoConflict = isTNoReal(resolved.tNo) && isTNoReal(tNo) && resolved.tNo.trim().toUpperCase() !== tNo.trim().toUpperCase();

            let idMatches = resolved.id === workerId || (isTNoReal(resolved.tNo) && isTNoReal(tNo) && resolved.tNo.trim().toUpperCase() === tNo.trim().toUpperCase());
            
            if (!idMatches && !hasTNoConflict && normResolvedName && normWorkerName) {
              if (normResolvedName === normWorkerName) {
                idMatches = true;
              } else {
                const words1 = normResolvedName.split(/\s+/).filter(Boolean);
                const words2 = normWorkerName.split(/\s+/).filter(Boolean);
                if (words1.length > 0 && words2.length > 0) {
                  const isSubset = (shortWords: string[], longWords: string[]) => {
                    return shortWords.every(sw => longWords.includes(sw));
                  };
                  if (words1.length <= words2.length) {
                    idMatches = isSubset(words1, words2);
                  } else {
                    idMatches = isSubset(words2, words1);
                  }
                }
              }
            }
            return idMatches;
          });
          
          if (isGaiter) {
            const gaiterIncentive = getGaiterIncentive(report, shift, rules, workers);
            totalValue += gaiterIncentive;
            hasData = true;
          }
        });
      }

      if (metricType === 'incentive') {
        if (isFrozen && frozenRecord && frozenRecord.dailyWorkerIncentives?.[report.date]) {
          const key = tNo || workerId;
          if (key && frozenRecord.dailyWorkerIncentives[report.date][key] !== undefined) {
            return frozenRecord.dailyWorkerIncentives[report.date][key];
          }
        }
        totalValue = Math.min(120, totalValue);
      }

      return hasData ? totalValue : null;
    }
    return null;
  };

  const getEmValueByDay = (day: number, workerId: string, machineId: string, tNo: string, workerName?: string): number | null => {
    const dateStr = `${day.toString().padStart(2, '0')}/${selectedMonth.toString().padStart(2, '0')}/${selectedYear}`;
    const report = history.find(r => r.date === dateStr);
    if (!report) return null;

    if (viewMode === 'machine') {
      const entries = report.entries.filter(e => e.frameNo === machineId);
      if (entries.length === 0) return null;
      const ems = entries.map(e => {
        const shiftNum = e.shift === 'I' ? 1 : e.shift === 'II' ? 2 : 3;
        let emVal = machineEm?.[dateStr]?.[e.frameNo]?.[shiftNum];
        if (emVal === undefined) emVal = e.doffEmt;
        return emVal || 0;
      });
      return Math.max(...ems);
    } else {
      const entries = report.entries.filter(e => {
        const assignedIds = new Set<string>();
        if (e.siderId) assignedIds.add(String(e.siderId).trim());
        if (e.siderIds) e.siderIds.forEach(id => {
          if (id) assignedIds.add(String(id).trim());
        });

        let matches = false;
        assignedIds.forEach(idVal => {
          const resolved = resolveWorker(idVal, e.siderName, workers);
          const normWorkerName = (workerName || '').toLowerCase().trim();
          const normResolvedName = (resolved.name || '').toLowerCase().trim();

          const isTNoReal = (t: string) => {
            if (!t) return false;
            const clean = t.trim();
            if (clean === "" || clean.toLowerCase() === "n/a" || clean.toLowerCase() === "unknown") return false;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false;
            if (clean.startsWith('T-') || clean.startsWith('w-')) return false;
            return true;
          };

          const hasTNoConflict = isTNoReal(resolved.tNo) && isTNoReal(tNo) && resolved.tNo.trim().toUpperCase() !== tNo.trim().toUpperCase();

          let idMatches = resolved.id === workerId || (isTNoReal(resolved.tNo) && isTNoReal(tNo) && resolved.tNo.trim().toUpperCase() === tNo.trim().toUpperCase());
          
          if (!idMatches && !hasTNoConflict && normResolvedName && normWorkerName) {
            if (normResolvedName === normWorkerName) {
              idMatches = true;
            } else {
              const words1 = normResolvedName.split(/\s+/).filter(Boolean);
              const words2 = normWorkerName.split(/\s+/).filter(Boolean);
              if (words1.length > 0 && words2.length > 0) {
                const isSubset = (shortWords: string[], longWords: string[]) => {
                  return shortWords.every(sw => longWords.includes(sw));
                };
                if (words1.length <= words2.length) {
                  idMatches = isSubset(words1, words2);
                } else {
                  idMatches = isSubset(words2, words1);
                }
              }
            }
          }
          
          if (idMatches) matches = true;
        });

        return matches;
      });

      if (entries.length === 0) return null;
      const ems = entries.map(e => {
        const shiftNum = e.shift === 'I' ? 1 : e.shift === 'II' ? 2 : 3;
        let emVal = machineEm?.[dateStr]?.[e.frameNo]?.[shiftNum];
        if (emVal === undefined) emVal = e.doffEmt;
        return emVal || 0;
      });
      return Math.max(...ems);
    }
  };

  const rowsWithTotals = useMemo(() => {
    const rawRows = viewMode === 'machine' 
      ? machineNos.map(n => ({ id: n, label: n, tNo: '-', type: 'machine' })) 
      : historyWorkersList.map(w => ({ id: w.id, label: w.name, tNo: w.tNo, type: 'worker' }));

    const mapped = rawRows.map(row => {
      let total = 0;
      let emSum = 0;
      let emCount = 0;
      gridDays.forEach(day => {
        const val = getMetricByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
        if (val) {
          total += val;
        }
        const emVal = getEmValueByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
        if (emVal !== null && emVal > 0) {
          emSum += emVal;
          emCount += 1;
        }
      });
      const averageEm = emCount > 0 ? (emSum / emCount) : 0;
      return { ...row, total, averageEm };
    });

    let filtered = mapped;
    if (viewMode === 'worker') {
      const activeWorkerIds = new Set(workers.map(w => w.id));
      filtered = mapped.filter(row => {
        const isActive = activeWorkerIds.has(row.id);
        const hasWorkThisMonth = row.total > 0;
        return isActive || hasWorkThisMonth;
      });
    }

    if (isTvMode) {
      const tvFiltered = filtered.filter(row => row.total > 0);
      return tvFiltered.sort((a, b) => b.total - a.total);
    }

    if (sortField === 'total') {
      return filtered.sort((a, b) => {
        return sortDirection === 'asc' ? a.total - b.total : b.total - a.total;
      });
    } else if (sortField === 'averageEm') {
      return filtered.sort((a, b) => {
        return sortDirection === 'asc' ? a.averageEm - b.averageEm : b.averageEm - a.averageEm;
      });
    } else if (sortField === 'tNo') {
      return filtered.sort((a, b) => {
        const aTNoClean = a.tNo === '-' ? "" : a.tNo;
        const bTNoClean = b.tNo === '-' ? "" : b.tNo;
        if (!aTNoClean && bTNoClean) return 1;
        if (aTNoClean && !bTNoClean) return -1;
        if (!aTNoClean && !bTNoClean) return a.label.localeCompare(b.label);

        const aNum = parseInt(aTNoClean);
        const bNum = parseInt(bTNoClean);
        if (!isNaN(aNum) && !isNaN(bNum)) {
          return sortDirection === 'asc' ? aNum - bNum : bNum - aNum;
        }
        return sortDirection === 'asc' ? aTNoClean.localeCompare(bTNoClean) : bTNoClean.localeCompare(aTNoClean);
      });
    } else if (sortField === 'label') {
      return filtered.sort((a, b) => {
        return sortDirection === 'asc' ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label);
      });
    }

    return filtered;
  }, [viewMode, machineNos, historyWorkersList, displayedDays, gridDays, history, selectedMonth, selectedYear, isTvMode, metricType, rules, sortField, sortDirection, workers, machineEm]);

  // TV view paging parameters: 15 siders/workers per page
  const [currentTvPage, setCurrentTvPage] = useState(0);
  const itemsPerPage = 15;
  const totalTvPages = useMemo(() => {
    return Math.max(1, Math.ceil(rowsWithTotals.length / itemsPerPage));
  }, [rowsWithTotals]);

  useEffect(() => {
    if (!isTvMode || totalTvPages <= 1) return;
    const timer = setInterval(() => {
      setCurrentTvPage(prev => (prev + 1) % totalTvPages);
    }, (tvPageInterval || 15) * 1000); // respects set page timer!
    return () => clearInterval(timer);
  }, [isTvMode, totalTvPages, tvPageInterval]);

  useEffect(() => {
    if (currentTvPage >= totalTvPages) {
      setCurrentTvPage(0);
    }
  }, [totalTvPages, currentTvPage]);

  useEffect(() => {
    if (isTvMode && onPagesDetermined) {
      onPagesDetermined(totalTvPages);
    }
  }, [isTvMode, totalTvPages, onPagesDetermined]);

  const pageStartIndex = currentTvPage * itemsPerPage;
  const currentTvPageItems = useMemo(() => {
    if (isTvMode) {
      return rowsWithTotals.slice(pageStartIndex, pageStartIndex + itemsPerPage);
    }
    return rowsWithTotals;
  }, [rowsWithTotals, isTvMode, pageStartIndex, itemsPerPage]);

  if (isTvMode) {
    return (
      <div className="bg-white p-6 md:p-8 xl:p-12 min-h-screen text-stone-900 font-sans overflow-hidden">
        {/* Top Header */}
        <div className="text-center mb-10 relative">
          <div className="flex items-center justify-center gap-2 text-emerald-700 font-extrabold text-sm uppercase tracking-widest mb-2">
            <Sparkles size={16} className="animate-spin text-amber-500" />
            Sider Daily Incentive Ledger {totalTvPages > 1 && `(Page ${currentTvPage + 1} of ${totalTvPages})`}
          </div>
          <h1 className="text-4xl md:text-5xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-emerald-800 via-teal-700 to-emerald-950 drop-shadow-sm pb-3">
            Sider Monthly Report - {dataMonthDisplay}
          </h1>
          <p className="text-stone-500 font-extrabold text-xs uppercase tracking-widest mb-2">
            Last 15 Days Ledger View (15 Siders Per Page)
          </p>
          {metricType === 'incentive' && (
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 bg-red-50/80 border border-red-200/60 px-4 py-2 rounded-2xl shadow-sm">
              <div className="relative w-8 h-4 flex items-center justify-center">
                <span className="absolute inset-0 border-2 border-red-600 rounded-[50%/50%] transform scale-y-90 scale-x-110" />
              </div>
              <span className="text-red-700 font-black text-xs uppercase tracking-wider">EM High (&gt; {emHighLimit.toFixed(1)})</span>
            </div>
          )}
          <div className="bg-gradient-to-r from-transparent via-emerald-600 to-transparent h-1.5 w-1/2 mx-auto rounded-full mt-3" />
        </div>

        {/* Centered Beautiful TV Table Panel */}
        <div className="max-w-[98%] mx-auto">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            key={`tv-page-${currentTvPage}`}
            transition={{ duration: 0.6 }}
            className="bg-stone-50/50 rounded-[2rem] border-2 border-emerald-900/15 p-6 shadow-xl"
          >
            <table className="w-full border-collapse table-fixed font-sans">
              <thead>
                <tr className="bg-emerald-800 text-white border-b-2 border-emerald-900 text-[19px] font-black h-14">
                  <th className="px-2 text-center w-20 rounded-tl-xl border-r border-emerald-700/50">S. NO</th>
                  <th className="px-2 text-center w-28 border-r border-emerald-700/50">TK No</th>
                  <th className="px-4 text-left border-r border-emerald-700/50">Name of Operator</th>
                  {displayedDays.map(day => (
                    <th key={day} className="px-1 text-center border-r border-emerald-700/50 w-24">
                      Day {day}
                    </th>
                  ))}
                  <th className="px-4 text-center w-28 border-r border-emerald-700/50">Avg EM</th>
                  <th className="px-4 text-right w-32 rounded-tr-xl">Total</th>
                </tr>
              </thead>
              <tbody>
                {currentTvPageItems.map((row, idx) => (
                  <motion.tr 
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: idx * 0.04 }}
                    key={row.id} 
                    className="border-b border-stone-200/80 h-14 hover:bg-stone-100/50 transition-colors"
                  >
                    <td className="px-2 text-center text-[18px] font-extrabold text-stone-500 border-r border-stone-200/40">{pageStartIndex + idx + 1}</td>
                    <td className="px-2 text-center text-[18px] font-black text-emerald-700 font-mono border-r border-stone-200/40">{row.tNo || "N/A"}</td>
                    <td className="px-4 text-left text-[18px] font-bold uppercase tracking-tight text-stone-900 truncate border-r border-stone-200/40">
                      {row.label}
                    </td>
                    {displayedDays.map(day => {
                      const val = getMetricByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
                      const emVal = getEmValueByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
                      const hasHighEm = emVal !== null && emVal > emHighLimit;
                      return (
                        <td key={day} className="px-1 text-center text-[19px] font-bold font-mono border-r border-stone-200/30">
                          {val ? (
                            metricType === 'incentive' && hasHighEm ? (
                              <div className="inline-block relative px-2.5 py-1">
                                <span className="absolute inset-0 border-2 border-red-600 rounded-[50%/50%] pointer-events-none transform scale-y-90 scale-x-110" />
                                <span className="relative z-10 text-red-600 font-black">₹{Math.round(val)}</span>
                              </div>
                            ) : (
                              <span className="text-stone-700">₹{Math.round(val)}</span>
                            )
                          ) : '-'}
                        </td>
                      );
                    })}
                    <td className="px-4 text-center text-[19px] font-black text-blue-900 font-mono bg-blue-50/30 border-r border-stone-200/40">
                      {row.averageEm > 0 ? row.averageEm.toFixed(2) : '-'}
                    </td>
                    <td className="px-4 text-right text-[20px] font-black text-emerald-950 font-mono bg-emerald-50">
                      {row.total > 0 ? `₹${Math.round(row.total).toLocaleString()}` : '-'}
                    </td>
                  </motion.tr>
                ))}

                {/* Fill empty placeholder if page has fewer items than 15 */}
                {currentTvPageItems.length < 15 && Array.from({ length: 15 - currentTvPageItems.length }).map((_, i) => (
                  <tr key={`empty-fill-${i}`} className="border-b border-stone-100 h-14">
                    <td className="px-2 border-r border-stone-100">&nbsp;</td>
                    <td className="px-2 border-r border-stone-100">&nbsp;</td>
                    <td className="px-4 border-r border-stone-100">&nbsp;</td>
                    {displayedDays.map(day => (
                      <td key={`empty-day-${day}`} className="px-1 border-r border-stone-100">&nbsp;</td>
                    ))}
                    <td className="px-4 border-r border-stone-100 bg-stone-50/10">&nbsp;</td>
                    <td className="px-4 bg-stone-50/20">&nbsp;</td>
                  </tr>
                ))}

                {/* TV mode page summary total row */}
                <tr className="bg-emerald-50 font-black h-14 border-t-2 border-emerald-800 text-emerald-900">
                  <td colSpan={3} className="px-4 text-right text-[17px] uppercase tracking-wider border-r border-stone-200/50">Page Total:</td>
                  {displayedDays.map(day => {
                    const dayTotal = currentTvPageItems.reduce((acc, row) => {
                      const val = getMetricByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
                      return acc + (val || 0);
                    }, 0);
                    return (
                      <td key={`total-${day}`} className="px-1 text-center text-[19px] font-black font-mono border-r border-emerald-700/50 text-emerald-800">
                        {dayTotal > 0 ? `₹${Math.round(dayTotal)}` : '-'}
                      </td>
                    );
                  })}
                  <td className="px-4 text-center text-[19px] font-black text-blue-900 font-mono bg-blue-50/20 border-r border-stone-200/50 text-emerald-800">
                    {(() => {
                      const activeRows = currentTvPageItems.filter(r => r.averageEm > 0);
                      const pageAvgEm = activeRows.length > 0 
                        ? (activeRows.reduce((sum, r) => sum + r.averageEm, 0) / activeRows.length)
                        : 0;
                      return pageAvgEm > 0 ? pageAvgEm.toFixed(2) : '-';
                    })()}
                  </td>
                  <td className="px-4 text-right text-[20px] font-black text-amber-800 font-mono bg-amber-50">
                    ₹{Math.round(currentTvPageItems.reduce((acc, row) => acc + row.total, 0)).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </motion.div>
        </div>

        {/* Page Indicators */}
        {totalTvPages > 1 && (
          <div className="flex justify-center gap-3 mt-6">
            {Array.from({ length: totalTvPages }).map((_, i) => (
              <button
                key={i}
                onChange={() => setCurrentTvPage(i)}
                onClick={() => setCurrentTvPage(i)}
                className={cn(
                  "w-3.5 h-3.5 rounded-full transition-all duration-300 pointer-events-auto cursor-pointer",
                  currentTvPage === i 
                    ? "bg-emerald-600 w-10 shadow-[0_0_12px_rgba(5,150,105,0.4)]" 
                    : "bg-stone-300 hover:bg-stone-400"
                )}
                title={`Go to Page ${i + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full overflow-hidden monthly-incentive-grid">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 border-2 border-green-800 rounded-sm no-print">
        <div className="flex gap-4">
          <select 
            value={selectedMonth}
            onChange={(e) => onMonthChange(Number(e.target.value))}
            className="bg-white border-2 border-green-800 px-4 py-2 rounded-md font-bold text-green-900"
          >
            {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select 
            value={selectedYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
            className="bg-white border-2 border-green-800 px-4 py-2 rounded-md font-bold text-green-900"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          {!isTvMode && (
            <>
              <button
                onClick={() => {
                  if (sortField === 'total') {
                    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('total');
                    setSortDirection('desc');
                  }
                }}
                className={cn(
                  "px-4 py-2 border-2 text-xs font-bold rounded-md uppercase tracking-wider transition-all flex items-center gap-1.5 bg-white cursor-pointer select-none",
                  sortField === 'total'
                    ? "bg-rose-50 border-rose-600 text-rose-700 hover:bg-rose-100/80"
                    : "border-green-800 text-green-900 hover:bg-stone-50"
                )}
              >
                <span>Sort: Total</span>
                {sortField === 'total' ? (
                  sortDirection === 'asc' ? <ArrowUp size={14} className="text-rose-700" /> : <ArrowDown size={14} className="text-rose-700" />
                ) : (
                  <ArrowUpDown size={14} className="text-stone-400" />
                )}
              </button>

              <button
                onClick={() => {
                  if (sortField === 'averageEm') {
                    setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                  } else {
                    setSortField('averageEm');
                    setSortDirection('desc');
                  }
                }}
                className={cn(
                  "px-4 py-2 border-2 text-xs font-bold rounded-md uppercase tracking-wider transition-all flex items-center gap-1.5 bg-white cursor-pointer select-none",
                  sortField === 'averageEm'
                    ? "bg-blue-50 border-blue-600 text-blue-700 hover:bg-blue-100/80"
                    : "border-green-800 text-green-900 hover:bg-stone-50"
                )}
              >
                <span>Sort: Avg EM</span>
                {sortField === 'averageEm' ? (
                  sortDirection === 'asc' ? <ArrowUp size={14} className="text-blue-700" /> : <ArrowDown size={14} className="text-blue-700" />
                ) : (
                  <ArrowUpDown size={14} className="text-stone-400" />
                )}
              </button>
            </>
          )}
          {!isTvMode && (
            <button
              onClick={() => {
                if (isFrozen) {
                  if (confirm(`Unfreeze ${dataMonthDisplay}? Live calculations will resume.`)) {
                    onToggleFreezeMonth?.(selectedMonth, selectedYear);
                  }
                } else {
                  if (confirm(`Freeze ${dataMonthDisplay}? This locks the payout figures for Accounts submission.`)) {
                    onToggleFreezeMonth?.(selectedMonth, selectedYear);
                  }
                }
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 font-bold rounded-md uppercase text-xs transition-all shadow-md cursor-pointer",
                isFrozen 
                  ? "bg-amber-600 hover:bg-amber-700 text-white"
                  : "bg-emerald-800 hover:bg-emerald-900 text-white"
              )}
            >
              {isFrozen ? <Unlock size={16} /> : <Lock size={16} />}
              {isFrozen ? "Unfreeze Month" : "Freeze Month (Accounts)"}
            </button>
          )}
          <button 
            onClick={() => setViewMode(viewMode === 'machine' ? 'worker' : 'machine')}
            className="px-4 py-2 bg-green-800 text-white font-bold rounded-md uppercase text-xs"
          >
            Switch to {viewMode === 'machine' ? 'Siders' : 'Machines'}
          </button>
          {!isTvMode && (
            <>
              <button 
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 text-white font-bold rounded-md uppercase text-xs hover:bg-black transition-all shadow-md cursor-pointer active:scale-95"
              >
                <Printer size={15} />
                Print Report
              </button>
              <button 
                onClick={() => {
                  const wb = XLSX.utils.book_new();
                  const rows = rowsWithTotals.map(row => {
                    const obj: any = {
                      'TK No': row.tNo || 'N/A',
                      'Name / Machine': row.label
                    };
                    displayedDays.forEach(day => {
                      const val = getMetricByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
                      obj[`Day ${day}`] = val ? Math.round(val) : '';
                    });
                    obj['Avg EM'] = row.averageEm > 0 ? parseFloat(row.averageEm.toFixed(2)) : '';
                    obj['Total Payout (INR)'] = Math.round(row.total);
                    return obj;
                  });

                  const ws = XLSX.utils.json_to_sheet(rows);
                  XLSX.utils.book_append_sheet(wb, ws, `${viewMode === 'machine' ? 'Machines' : 'Siders'} Monthly`);
                  XLSX.writeFile(wb, `Monthly_Incentive_Grid_${dataMonthDisplay}_${selectedYear}.xlsx`);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-md uppercase text-xs transition-all shadow-md cursor-pointer active:scale-95"
                title="Download 31-day matrix as Excel (.xlsx)"
              >
                <FileSpreadsheet size={15} />
                Export Excel
              </button>
              <button 
                onClick={() => {
                  let csv = `SPINMONITOR AI - MONTHLY INCENTIVE GRID (${dataMonthDisplay} ${selectedYear})\n\n`;
                  csv += `TK No,Name,` + displayedDays.map(d => `Day ${d}`).join(',') + `,Avg EM,Total Payout\n`;

                  rowsWithTotals.forEach(row => {
                    const dayValues = displayedDays.map(day => {
                      const val = getMetricByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
                      return val ? Math.round(val) : '';
                    }).join(',');
                    csv += `"${row.tNo || ''}","${row.label}",${dayValues},${row.averageEm > 0 ? row.averageEm.toFixed(2) : ''},${Math.round(row.total)}\n`;
                  });

                  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement('a');
                  link.href = url;
                  link.download = `Monthly_Incentive_Grid_${dataMonthDisplay}_${selectedYear}.csv`;
                  link.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 font-bold rounded-md uppercase text-xs transition-all shadow-xs cursor-pointer active:scale-95"
                title="Download 31-day matrix as CSV"
              >
                <Download size={15} />
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      <div className="text-center py-2 bg-white relative flex flex-col items-center justify-center gap-2">
        {isFrozen && frozenRecord && (
          <div className="w-full max-w-4xl mx-auto my-1 p-2 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center justify-center gap-2 text-amber-900 text-xs font-bold no-print">
            <Lock size={16} className="text-amber-600" />
            <span>
              🔒 Data Frozen for Accounts Submission (Snapshot saved on {frozenRecord.frozenAt}) — Future Machine / Rule changes will not affect these payout numbers.
            </span>
          </div>
        )}
        <h2 className="text-lg font-bold text-stone-900 border-b-2 border-stone-900 inline-block px-12">
          Sider Incentive Report for the Month Of {dataMonthDisplay} {isTvMode && "(Last 15 Days TV View)"}
        </h2>
        {metricType === 'incentive' && (
          <div className="md:absolute md:right-4 flex items-center gap-2 bg-red-50 border border-red-200/60 px-3 py-1 rounded-full shadow-sm">
            <div className="relative w-8 h-4 flex items-center justify-center">
              <span className="absolute inset-0 border-2 border-red-600 rounded-[50%/50%] transform scale-y-90 scale-x-110" />
            </div>
            <span className="text-red-700 font-black text-[10px] uppercase tracking-wider">EM High (&gt; {emHighLimit.toFixed(1)})</span>
          </div>
        )}
      </div>

      <div className="bg-white overflow-hidden shadow-inner">
        <div className="overflow-x-auto">
          <table className={cn("w-full text-center border-collapse table-fixed border border-green-800", isTvMode ? "min-w-full" : "min-w-[2000px]")}>
            <thead>
              <tr className="bg-white border-b border-green-800 h-10 select-none">
                <th 
                  onClick={() => {
                    if (isTvMode) return;
                    if (sortField === 'tNo') {
                      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('tNo');
                      setSortDirection('asc');
                    }
                  }}
                  className={cn(
                    "w-20 px-1 py-1 text-[16px] font-bold text-stone-900 sticky left-0 z-20 bg-white border-r border-green-800",
                    !isTvMode && "cursor-pointer hover:bg-stone-50"
                  )}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>TK No</span>
                    {!isTvMode && sortField === 'tNo' && (
                      sortDirection === 'asc' ? <ArrowUp size={12} className="text-emerald-700 font-extrabold shrink-0" /> : <ArrowDown size={12} className="text-emerald-700 font-extrabold shrink-0" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => {
                    if (isTvMode) return;
                    if (sortField === 'label') {
                      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('label');
                      setSortDirection('asc');
                    }
                  }}
                  className={cn(
                    "w-48 px-2 py-1 text-[16px] font-bold text-stone-900 sticky left-20 z-20 bg-white border-r border-green-800 text-left",
                    !isTvMode && "cursor-pointer hover:bg-stone-50"
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span>Name</span>
                    {!isTvMode && sortField === 'label' && (
                      sortDirection === 'asc' ? <ArrowUp size={12} className="text-emerald-700 font-extrabold shrink-0" /> : <ArrowDown size={12} className="text-emerald-700 font-extrabold shrink-0" />
                    )}
                  </div>
                </th>
                {displayedDays.map(day => (
                  <th 
                    key={day} 
                    onClick={() => {
                      if (!isTvMode) {
                        const dateStr = `${day.toString().padStart(2, '0')}/${selectedMonth.toString().padStart(2, '0')}/${selectedYear}`;
                        onEditDate?.(dateStr);
                      }
                    }}
                    className={cn(
                      "px-0.5 py-1 text-[16px] font-bold text-stone-900 border-r border-green-800 bg-white hover:bg-stone-50 transition-colors group",
                      !isTvMode && "cursor-pointer"
                    )}
                  >
                    <div className="group-hover:scale-110 group-hover:text-emerald-700 transition-all font-black">{day}</div>
                  </th>
                ))}
                <th 
                  onClick={() => {
                    if (isTvMode) return;
                    if (sortField === 'averageEm') {
                      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('averageEm');
                      setSortDirection('desc');
                    }
                  }}
                  className={cn(
                    "w-24 px-2 py-1 text-[16px] font-bold text-blue-600 bg-blue-50/50 sticky right-24 z-20 border-l border-green-800",
                    !isTvMode && "cursor-pointer hover:bg-blue-100/60"
                  )}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Avg EM</span>
                    {sortField === 'averageEm' ? (
                      sortDirection === 'asc' ? <ArrowUp size={12} className="text-blue-600 font-extrabold shrink-0" /> : <ArrowDown size={12} className="text-blue-600 font-extrabold shrink-0" />
                    ) : (
                      <ArrowUpDown size={12} className="text-blue-300 shrink-0" />
                    )}
                  </div>
                </th>
                <th 
                  onClick={() => {
                    if (isTvMode) return;
                    if (sortField === 'total') {
                      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
                    } else {
                      setSortField('total');
                      setSortDirection('desc');
                    }
                  }}
                  className={cn(
                    "w-24 px-2 py-1 text-[16px] font-bold text-rose-600 bg-rose-50/50 sticky right-0 z-20 border-l border-green-800",
                    !isTvMode && "cursor-pointer hover:bg-rose-100/60"
                  )}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>Total</span>
                    {sortField === 'total' ? (
                      sortDirection === 'asc' ? <ArrowUp size={12} className="text-rose-600 font-extrabold shrink-0" /> : <ArrowDown size={12} className="text-rose-600 font-extrabold shrink-0" />
                    ) : (
                      <ArrowUpDown size={12} className="text-rose-300 shrink-0" />
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rowsWithTotals.map((row, idx) => {
                return (
                  <tr key={row.id} className="border-b border-green-800 h-8 hover:bg-stone-50 transition-colors">
                    <td className="px-1 py-0.5 text-[16px] font-bold text-stone-900 sticky left-0 z-10 border-r border-green-800 bg-white">
                      {row.tNo || "N/A"}
                    </td>
                    <td className="px-2 py-0.5 text-[16px] font-bold text-stone-900 sticky left-20 z-10 border-r border-green-800 uppercase truncate text-left bg-white">
                      {row.label}
                    </td>
                    {displayedDays.map(day => {
                      const val = getMetricByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
                      const emVal = getEmValueByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
                      const hasHighEm = emVal !== null && emVal > emHighLimit;
                      return (
                        <td key={day} className="px-0.5 py-0.5 text-[16px] border-r border-green-800 tabular-nums font-medium">
                          {val ? (
                            metricType === 'incentive' && hasHighEm ? (
                              <div className="inline-block relative px-2.5 py-1">
                                <span className="absolute inset-0 border-2 border-red-600 rounded-[50%/50%] pointer-events-none transform scale-y-90 scale-x-110" />
                                <span className="relative z-10 text-red-600 font-extrabold">{Math.round(val)}</span>
                              </div>
                            ) : (
                              <span className="text-stone-700">{Math.round(val)}</span>
                            )
                          ) : ''}
                        </td>
                      );
                    })}
                    <td className="px-2 py-0.5 text-[16px] font-bold text-blue-600 bg-white sticky right-24 z-10 border-l border-green-800 tabular-nums">
                      {row.averageEm > 0 ? row.averageEm.toFixed(2) : ''}
                    </td>
                    <td className="px-2 py-0.5 text-[16px] font-bold text-rose-600 bg-white sticky right-0 z-10 border-l border-green-800 tabular-nums">
                      {row.total > 0 ? Math.round(row.total).toLocaleString() : ''}
                    </td>
                  </tr>
                );
              })}
              {/* Total Row */}
              <tr className="bg-white font-bold border-t-2 border-green-800 h-10">
                <td colSpan={1} className="px-1 py-1 text-[16px] font-bold text-rose-600 sticky left-0 z-10 bg-white border-r border-green-800"></td>
                <td className="px-2 py-1 text-[16px] font-bold text-rose-600 sticky left-20 z-10 border-r border-green-800 text-left bg-white uppercase">
                  Total
                </td>
                {displayedDays.map(day => {
                  const dayTotal = rowsWithTotals.reduce((acc, row) => {
                    const val = getMetricByDay(day, row.id, row.id, row.tNo, row.type === 'worker' ? row.label : undefined);
                    return acc + (val || 0);
                  }, 0);
                  return (
                    <td key={`total-${day}`} className="px-0.5 py-1 text-[16px] font-bold text-rose-600 border-r border-green-800 tabular-nums">
                      {dayTotal > 0 ? Math.round(dayTotal) : ''}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-[16px] font-bold text-blue-600 bg-white sticky right-24 z-20 border-l border-green-800 tabular-nums">
                  {(() => {
                    const activeRows = rowsWithTotals.filter(r => r.averageEm > 0);
                    const overallAvg = activeRows.length > 0 
                      ? (activeRows.reduce((sum, r) => sum + r.averageEm, 0) / activeRows.length)
                      : 0;
                    return overallAvg > 0 ? overallAvg.toFixed(2) : '';
                  })()}
                </td>
                <td className="px-2 py-1 text-[16px] font-black text-rose-600 bg-white sticky right-0 z-20 border-l border-green-800 tabular-nums">
                  {Math.round(rowsWithTotals.reduce((acc, row) => acc + row.total, 0)).toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Print Signature Footer Block */}
      <div className="hidden print-signatures">
        <div className="print-signature-box">
          Shift Supervisor
        </div>
        <div className="print-signature-box">
          Accounts Head
        </div>
        <div className="print-signature-box">
          Mill General Manager
        </div>
      </div>
      
      <div className="flex justify-center items-center py-4 text-[10px] font-bold text-stone-400 uppercase tracking-widest no-print">
        <span>SpinMonitor AI Monthly Incentive Ledger • Consolidated Report</span>
      </div>
    </div>
  );
};
