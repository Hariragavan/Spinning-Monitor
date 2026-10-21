import React, { useState, useMemo, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift, ProductionEntry, MachineEmData } from '../types';
import { cn, calculateIncentive, resolveWorker, findDuplicatesInReport, getGaiterIncentive, parseUniversalDateParts, parseUniversalDate } from '../lib/utils';
import { Coins, Calendar, User, Search, Printer, FileText, ChevronRight, Download, Users, ArrowUpRight, BarChart3, Database } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface IncentiveLedgerReportProps {
  history: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  onEditDate?: (date: string) => void;
  machineEm?: MachineEmData;
  initialMonth?: number;
  initialYear?: number;
}

interface LedgerEntry {
  date: string;
  shift: Shift;
  frameNo: string;
  count: string;
  gps: number;
  incentive: number;
  role: 'OPERATOR' | 'GAITER';
  em?: number;
}

export const IncentiveLedgerReport: React.FC<IncentiveLedgerReportProps> = ({ history, workers, rules, onEditDate, machineEm, initialMonth, initialYear }) => {
  // Navigation between the sub-views
  const [activeSubTab, setActiveSubTab] = useState<'individual' | 'consolidated' | 'duplicates' | 'monthlyProduction' | 'machineWiseProduction'>('individual');

  // Printing all reports state
  const [isPrintingAll, setIsPrintingAll] = useState<boolean>(false);
  const [isPrintingAbstract, setIsPrintingAbstract] = useState<boolean>(false);
  const [omittedWorkerIds, setOmittedWorkerIds] = useState<Set<string>>(new Set());

  // Trigger print and reset when ready
  useEffect(() => {
    if (isPrintingAll || isPrintingAbstract) {
      const timer = setTimeout(() => {
        window.print();
        // Give time for print modal to open, then reset state
        setIsPrintingAll(false);
        setIsPrintingAbstract(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isPrintingAll, isPrintingAbstract]);

  // Allocation filter state
  const [allocationSearch, setAllocationSearch] = useState<string>('');

  // Individual View State
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  
  const parseDate = (dateStr: string): Date => {
    if (!dateStr) return new Date(0);
    const clean = dateStr.trim();
    const parts = clean.split(/[/.-]/);
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      } else {
        return new Date(parseInt(parts[2], 10), parseInt(parts[1], 10) - 1, parseInt(parts[0], 10));
      }
    }
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? new Date(0) : d;
  };

  // Set default date range to the initial or current month
  const { defaultFrom, defaultTo, calculatedMonth, calculatedYear } = useMemo(() => {
    const targetYear = initialYear || new Date().getFullYear();
    const targetMonth = initialMonth ? initialMonth - 1 : new Date().getMonth();
    
    const firstDay = new Date(targetYear, targetMonth, 1);
    const lastDay = new Date(targetYear, targetMonth + 1, 0);

    const pad = (n: number) => n.toString().padStart(2, '0');
    
    return {
      defaultFrom: `${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`,
      defaultTo: `${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`,
      calculatedMonth: targetMonth + 1,
      calculatedYear: targetYear
    };
  }, [initialMonth, initialYear]);

  const [fromDate, setFromDate] = useState<string>(defaultFrom);
  const [toDate, setToDate] = useState<string>(defaultTo);

  // Consolidated View State
  const [selectedMonth, setSelectedMonth] = useState<number>(initialMonth || calculatedMonth);
  const [selectedYear, setSelectedYear] = useState<number>(initialYear || calculatedYear);

  useEffect(() => {
    if (initialMonth) {
      setSelectedMonth(initialMonth);
    } else {
      setSelectedMonth(calculatedMonth);
    }
  }, [initialMonth, calculatedMonth]);

  useEffect(() => {
    if (initialYear) {
      setSelectedYear(initialYear);
    } else {
      setSelectedYear(calculatedYear);
    }
  }, [initialYear, calculatedYear]);

  useEffect(() => {
    setFromDate(defaultFrom);
    setToDate(defaultTo);
  }, [defaultFrom, defaultTo]);

  const monthsList = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' }
  ];

  const yearsList = [2025, 2026, 2027];

  // Helper to resolve worker's ticket number or ID
  const getWorkerDetails = (wId: string) => {
    return resolveWorker(wId, undefined, workers);
  };

  const duplicateAllocations = useMemo(() => {
    const results: any[] = [];
    
    // Sort history by date descending
    const sortedHistory = [...history].sort((a, b) => {
      return parseUniversalDate(b.date).getTime() - parseUniversalDate(a.date).getTime();
    });

    sortedHistory.forEach(report => {
      const dups = findDuplicatesInReport(report, workers);
      dups.forEach(d => {
        results.push({
          ...d,
          date: report.date
        });
      });
    });

    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    return results.filter(d => {
      if (!start || !end) return true;
      const dDate = parseUniversalDate(d.date);
      return dDate >= start && dDate <= end;
    });
  }, [history, workers, fromDate, toDate]);

  // 1. Calculate Ledger History for Selected Operator in Date Range
  const individualLedger = useMemo(() => {
    if (!selectedWorkerId) return [];

    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    
    // Normalize to midnight for absolute comparison
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    const results: LedgerEntry[] = [];
    const targetWorker = getWorkerDetails(selectedWorkerId);
    if (!targetWorker) return [];

    history.forEach(report => {
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;

      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;

      if (fromDate && rDateStr < fromDate) return;
      if (toDate && rDateStr > toDate) return;

      // Operator production logs
      if (report.entries) {
        report.entries.forEach(entry => {
          const assignedIds = new Set<string>();
          if (entry.siderId) assignedIds.add(entry.siderId);
          if (entry.siderIds) {
            entry.siderIds.forEach(id => { if (id) assignedIds.add(id); });
          }

          const isTNoReal = (t: string) => {
            if (!t) return false;
            const clean = t.trim();
            if (clean === "" || clean.toLowerCase() === "n/a" || clean.toLowerCase() === "unknown") return false;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false;
            if (clean.startsWith('T-') || clean.startsWith('w-')) return false;
            return true;
          };

          const hasTNoConflict = Array.from(assignedIds).some(id => 
            isTNoReal(id) && isTNoReal(targetWorker.tNo) && id.trim().toUpperCase() !== targetWorker.tNo.trim().toUpperCase()
          );

          const hasDirectId = assignedIds.has(targetWorker.id) || assignedIds.has(targetWorker.tNo);
          const hasNameMatch = !hasTNoConflict && entry.siderName && entry.siderName.toLowerCase().trim() === targetWorker.name.toLowerCase().trim();
          const hasTNoMatch = !hasTNoConflict && entry.siderId && entry.siderId === targetWorker.tNo;

          if (hasDirectId || hasNameMatch || hasTNoMatch) {
            const incentive = calculateIncentive(entry, rules, report.date);
            const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;
            let emValue = machineEm?.[report.date]?.[entry.frameNo]?.[shiftNum];
            if (emValue === undefined) {
              emValue = entry.doffEmt || 0;
            }
            results.push({
              date: report.date,
              shift: entry.shift,
              frameNo: entry.frameNo,
              count: entry.count,
              gps: entry.gpsActual,
              incentive: incentive,
              role: 'OPERATOR',
              em: emValue
            });
          }
        });
      }

      // Gaiter logs
      const shifts: Shift[] = ['I', 'II', 'III'];
      shifts.forEach(shift => {
        const shiftEntries = report.entries?.filter(e => e.shift === shift) || [];
        if (shiftEntries.length === 0) return;
        
        const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);
        const shiftGaiterIds = report.gaiters?.[shift] || [];

        const hasGaiterId = shiftGaiterIds.includes(targetWorker.id) || shiftGaiterIds.includes(targetWorker.tNo);
        if (hasGaiterId) {
          const incentive = getGaiterIncentive(report, shift, rules, workers);
          results.push({
            date: report.date,
            shift,
            frameNo: 'GAITER',
            count: minGpsEntry.count,
            gps: minGpsEntry.gpsActual,
            incentive,
            role: 'GAITER'
          });
        }
      });
    });

    // Sort by Date ascending, then Shift
    const sorted = results.sort((a, b) => {
      const timeA = parseUniversalDate(a.date).getTime();
      const timeB = parseUniversalDate(b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;
      
      const shiftsVal = { 'I': 1, 'II': 2, 'III': 3 };
      const valA = shiftsVal[a.shift as 'I' | 'II' | 'III'] || 0;
      const valB = shiftsVal[b.shift as 'I' | 'II' | 'III'] || 0;
      if (a.shift !== b.shift) return valA - valB;
      return String(a.frameNo || "").localeCompare(String(b.frameNo || ""));
    });

    const dailyAccumulator = new Map<string, number>();
    const cappedSorted = sorted.map(row => {
      const allocated = dailyAccumulator.get(row.date) || 0;
      const remaining = Math.max(0, 120 - allocated);
      const capped = Math.min(row.incentive, remaining);
      dailyAccumulator.set(row.date, allocated + capped);
      return {
        ...row,
        incentive: capped
      };
    });

    return cappedSorted;
  }, [selectedWorkerId, fromDate, toDate, history, rules, workers]);

  const individualTotal = useMemo(() => {
    return individualLedger.reduce((sum, item) => sum + item.incentive, 0);
  }, [individualLedger]);

  const individualEmAverage = useMemo(() => {
    const emEntries = individualLedger.filter(item => item.em !== undefined && item.em > 0);
    return emEntries.length > 0
      ? emEntries.reduce((sum, item) => sum + item.em!, 0) / emEntries.length
      : 0;
  }, [individualLedger]);

  // Filter and prepare workers list for the selection dropdown (excluding No T.No and zero-amount)
  const eligibleLedgerWorkers = useMemo(() => {
    // 1. Filter out No T.No and Unknown workers first
    const withTNo = workers.filter(w => {
      if (!w.tNo) return false;
      const clean = w.tNo.trim();
      const cleanLower = clean.toLowerCase();
      if (clean === "" || clean === "-" || cleanLower === "none" || cleanLower === "no t.no" || cleanLower === "no t. no" || cleanLower === "n/a" || cleanLower === "na") {
        return false;
      }
      if (w.name) {
        const nameLower = w.name.toLowerCase();
        if (nameLower.includes("unknown") || nameLower.includes("unregistered")) {
          return false;
        }
      }
      return true;
    });

    // 2. Filter out zero-amount workers in the current date range (fromDate to toDate)
    const activeWorkerIds = new Set<string>();

    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    history.forEach(report => {
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;

      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;

      if (fromDate && rDateStr < fromDate) return;
      if (toDate && rDateStr > toDate) return;

      // Operator entries
      if (report.entries) {
        report.entries.forEach(entry => {
          const payout = calculateIncentive(entry, rules, report.date);
          if (payout > 0) {
            if (entry.siderId) activeWorkerIds.add(entry.siderId);
            if (entry.siderIds) {
              entry.siderIds.forEach(id => { if (id) activeWorkerIds.add(id); });
            }
          }
        });
      }

      // Gaiters entries
      const shifts: Shift[] = ['I', 'II', 'III'];
      shifts.forEach(shift => {
        const shiftEntries = report.entries?.filter(e => e.shift === shift) || [];
        if (shiftEntries.length === 0) return;
        
        const payout = getGaiterIncentive(report, shift, rules, workers);
        if (payout > 0) {
          const shiftGaiters = report.gaiters?.[shift] || [];
          shiftGaiters.forEach(id => { if (id) activeWorkerIds.add(id); });
        }
      });
    });

    // Now filter our withTNo workers list to only those who have some entries with positive payout
    return withTNo
      .filter(w => activeWorkerIds.has(w.id) || activeWorkerIds.has(w.tNo))
      .sort((a,b) => {
        const aNum = parseInt(a.tNo);
        const bNum = parseInt(b.tNo);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.tNo.localeCompare(b.tNo);
      });
  }, [workers, history, fromDate, toDate, rules]);

  // Helper to calculate ledger for a given worker inside selected month/year dynamically for Print All
  const getWorkerLedgerForMonth = (workerId: string, month: number, year: number) => {
    // Collect all daily reports matching month and year
    const matchingReports = history.filter(report => {
      const parts = parseUniversalDateParts(report?.date);
      if (!parts) return false;
      return parts.month === month && parts.year === year;
    });

    const targetWorker = resolveWorker(workerId, undefined, workers);
    if (!targetWorker) return [];

    const results: LedgerEntry[] = [];

    matchingReports.forEach(report => {
      // Operator production logs
      if (report.entries) {
        report.entries.forEach(entry => {
          if (!entry) return;
          const assignedIds = new Set<string>();
          if (entry.siderId) assignedIds.add(entry.siderId);
          if (entry.siderIds) {
            entry.siderIds.forEach(id => { if (id) assignedIds.add(id); });
          }

          const isTNoReal = (t: string) => {
            if (!t) return false;
            const clean = t.trim();
            if (clean === "" || clean.toLowerCase() === "n/a" || clean.toLowerCase() === "unknown") return false;
            if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) return false;
            if (clean.startsWith('T-') || clean.startsWith('w-')) return false;
            return true;
          };

          const hasTNoConflict = Array.from(assignedIds).some(id => 
            isTNoReal(id) && isTNoReal(targetWorker.tNo) && id.trim().toUpperCase() !== targetWorker.tNo.trim().toUpperCase()
          );

          const hasDirectId = assignedIds.has(targetWorker.id) || assignedIds.has(targetWorker.tNo);
          const hasNameMatch = !hasTNoConflict && entry.siderName && entry.siderName.toLowerCase().trim() === targetWorker.name.toLowerCase().trim();
          const hasTNoMatch = !hasTNoConflict && entry.siderId && entry.siderId === targetWorker.tNo;

          if (hasDirectId || hasNameMatch || hasTNoMatch) {
            const incentive = calculateIncentive(entry, rules, report.date) || 0;
            const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;
            let emValue = machineEm?.[report.date]?.[entry.frameNo]?.[shiftNum];
            if (emValue === undefined) {
              emValue = entry.doffEmt || 0;
            }
            results.push({
              date: report.date,
              shift: entry.shift || 'I',
              frameNo: entry.frameNo || '—',
              count: entry.count || '—',
              gps: entry.gpsActual || 0,
              incentive: incentive,
              role: 'OPERATOR',
              em: emValue
            });
          }
        });
      }

      // Gaiter logs
      const shifts: Shift[] = ['I', 'II', 'III'];
      shifts.forEach(shift => {
        const shiftEntries = report.entries?.filter(e => e.shift === shift) || [];
        if (shiftEntries.length === 0) return;
        
        const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);
        const shiftGaiterIds = report.gaiters?.[shift] || [];

        const hasGaiterId = shiftGaiterIds.includes(targetWorker.id) || shiftGaiterIds.includes(targetWorker.tNo);
        if (hasGaiterId) {
          const incentive = getGaiterIncentive(report, shift, rules, workers) || 0;
          results.push({
            date: report.date,
            shift,
            frameNo: 'GAITER',
            count: minGpsEntry.count || '—',
            gps: minGpsEntry.gpsActual || 0,
            incentive,
            role: 'GAITER'
          });
        }
      });
    });

    // Sort by Date ascending, then Shift
    const sorted = results.sort((a, b) => {
      const timeA = parseUniversalDate(a.date).getTime();
      const timeB = parseUniversalDate(b.date).getTime();
      if (timeA !== timeB) return timeA - timeB;
      
      const shiftsVal = { 'I': 1, 'II': 2, 'III': 3 };
      const valA = shiftsVal[a.shift as 'I' | 'II' | 'III'] || 0;
      const valB = shiftsVal[b.shift as 'I' | 'II' | 'III'] || 0;
      if (a.shift !== b.shift) return valA - valB;
      return String(a.frameNo || "").localeCompare(String(b.frameNo || ""));
    });

    const dailyAccumulator = new Map<string, number>();
    const cappedSorted = sorted.map(row => {
      const allocated = dailyAccumulator.get(row.date) || 0;
      const remaining = Math.max(0, 120 - allocated);
      const capped = Math.min(row.incentive, remaining);
      dailyAccumulator.set(row.date, allocated + capped);
      return {
        ...row,
        incentive: capped
      };
    });

    return cappedSorted;
  };


  // 2. Calculate Consolidated Monthly Abstract for Accounts
  const consolidatedAbstract = useMemo(() => {
    // Collect all daily reports matching month and year
    const matchingReports = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      return parts.month === selectedMonth && parts.year === selectedYear;
    });

    // Create container structures map by worker Ticket Number
    const summaryMap = new Map<string, {
      workerId: string;
      name: string;
      tNo: string;
      workedDaysCount: Set<string>;
      totalIncentive: number;
      gpsAcc: number;
      gpsCount: number;
      entriesCount: number;
      emAcc: number;
      emCount: number;
    }>();

    // Seed all current workers
    workers.forEach(w => {
      summaryMap.set(w.tNo || w.id, {
        workerId: w.id,
        name: w.name,
        tNo: w.tNo,
        workedDaysCount: new Set<string>(),
        totalIncentive: 0,
        gpsAcc: 0,
        gpsCount: 0,
        entriesCount: 0,
        emAcc: 0,
        emCount: 0
      });
    });

    matchingReports.forEach(report => {
      if (!report.entries) return;

      const dailyIncentives = new Map<string, { workerObj: Sider; payout: number; gps: number; entryCount: number; emSum: number; emCount: number }>();

      report.entries.forEach(entry => {
        const assignedIds = new Set<string>();
        if (entry.siderId) assignedIds.add(entry.siderId);
        if (entry.siderIds) {
          entry.siderIds.forEach(id => { if (id) assignedIds.add(id); });
        }

        const payout = calculateIncentive(entry, rules, report.date);

        const shiftNum = entry.shift === 'I' ? 1 : entry.shift === 'II' ? 2 : 3;
        let emValue = machineEm?.[report.date]?.[entry.frameNo]?.[shiftNum];
        if (emValue === undefined) {
          emValue = entry.doffEmt;
        }
        const hasEm = emValue !== undefined && emValue > 0;

        assignedIds.forEach(id => {
          const workerObj = resolveWorker(id, entry.siderName, workers);
          const key = workerObj.tNo || workerObj.id;

          const existing = dailyIncentives.get(key) || { workerObj, payout: 0, gps: 0, entryCount: 0, emSum: 0, emCount: 0 };
          existing.payout += payout;
          existing.gps += entry.gpsActual;
          existing.entryCount += 1;
          if (hasEm) {
            existing.emSum += emValue!;
            existing.emCount += 1;
          }
          dailyIncentives.set(key, existing);
        });
      });

      // Also parse Gaiter allotments in this report
      const shifts: Shift[] = ['I', 'II', 'III'];
      shifts.forEach(shift => {
        const shiftEntries = report.entries?.filter(e => e.shift === shift) || [];
        if (shiftEntries.length === 0) return;
        
        const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);
        const shiftGaiters = report.gaiters?.[shift] || [];
        const payout = getGaiterIncentive(report, shift, rules, workers);

        shiftGaiters.forEach(gid => {
          const workerObj = resolveWorker(gid, undefined, workers);
          const key = workerObj.tNo || workerObj.id;

          const existing = dailyIncentives.get(key) || { workerObj, payout: 0, gps: 0, entryCount: 0, emSum: 0, emCount: 0 };
          existing.payout += payout;
          existing.gps += minGpsEntry.gpsActual;
          existing.entryCount += 1;
          dailyIncentives.set(key, existing);
        });
      });

      // Add capped daily values to the main summaryMap
      dailyIncentives.forEach((val, key) => {
        if (!summaryMap.has(key)) {
          summaryMap.set(key, {
            workerId: val.workerObj.id,
            name: val.workerObj.name,
            tNo: val.workerObj.tNo,
            workedDaysCount: new Set<string>(),
            totalIncentive: 0,
            gpsAcc: 0,
            gpsCount: 0,
            entriesCount: 0,
            emAcc: 0,
            emCount: 0
          });
        }

        const record = summaryMap.get(key)!;
        record.workedDaysCount.add(report.date);
        record.totalIncentive += Math.min(120, val.payout);
        record.gpsAcc += val.gps;
        record.gpsCount += val.entryCount;
        record.entriesCount += val.entryCount;
        record.emAcc += val.emSum;
        record.emCount += val.emCount;
      });
    });

    // Flatten maps and sort by Ticket Number
    return Array.from(summaryMap.values())
      .map(item => ({
        ...item,
        workingDays: item.workedDaysCount.size,
        avgGps: item.gpsCount > 0 ? Math.round(item.gpsAcc / item.gpsCount) : 0,
        avgEm: item.emCount > 0 ? (item.emAcc / item.emCount) : 0
      }))
      .filter(item => {
        // Must have worked days
        if (item.workingDays === 0) return false;
        
        // Remove zero amount person
        if (item.totalIncentive <= 0) return false;
        
        // Remove No T. No person
        if (!item.tNo) return false;
        const cleanTNo = item.tNo.trim();
        const cleanTNoLower = cleanTNo.toLowerCase();
        if (cleanTNo === '' || cleanTNo === '-' || cleanTNoLower === 'none' || cleanTNoLower === 'no t.no' || cleanTNoLower === 'no t. no' || cleanTNoLower === 'n/a' || cleanTNoLower === 'na') {
          return false;
        }

        // Remove Unknown / Unregistered worker
        if (item.name) {
          const nameLower = item.name.toLowerCase();
          if (nameLower.includes("unknown") || nameLower.includes("unregistered")) {
            return false;
          }
        }
        
        return true;
      })
      .sort((a, b) => {
        const aNum = parseInt(a.tNo);
        const bNum = parseInt(b.tNo);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return String(a.tNo || "").localeCompare(String(b.tNo || ""));
      });
  }, [selectedMonth, selectedYear, history, rules, workers]);

  const consolidatedTotalIncentive = useMemo(() => {
    return consolidatedAbstract.reduce((sum, item) => sum + item.totalIncentive, 0);
  }, [consolidatedAbstract]);

  const printedAbstract = useMemo(() => {
    return consolidatedAbstract
      .filter(row => !omittedWorkerIds.has(row.workerId))
      .sort((a, b) => b.totalIncentive - a.totalIncentive);
  }, [consolidatedAbstract, omittedWorkerIds]);

  const printedTotalIncentive = useMemo(() => {
    return printedAbstract.reduce((sum, item) => sum + item.totalIncentive, 0);
  }, [printedAbstract]);

  const abstractChunks = useMemo(() => {
    const remaining = [...printedAbstract];
    const chunks: any[][] = [];
    if (remaining.length === 0) return chunks;

    const M_nf = 18; // Max rows on non-final page
    const M_f = 13;  // Max rows on final page (with consolidation block)

    // 1. Determine the number of pages P
    let P = 1;
    while (true) {
      const maxCapacity = (P - 1) * M_nf + M_f;
      if (remaining.length <= maxCapacity) {
        break;
      }
      P++;
    }

    // 2. Distribute rows across P pages
    const pageSizes: number[] = [];
    let tempRemaining = remaining.length;

    if (P === 1) {
      pageSizes.push(tempRemaining);
    } else {
      // Find average size target
      const avg = Math.ceil(tempRemaining / P);
      if (avg > M_f) {
        // Final page gets max capacity M_f
        // Remaining are distributed as evenly as possible over the first P-1 pages
        let remainingForNonFinal = tempRemaining - M_f;
        const numNonFinal = P - 1;
        const baseSize = Math.floor(remainingForNonFinal / numNonFinal);
        const extra = remainingForNonFinal % numNonFinal;

        for (let i = 0; i < numNonFinal; i++) {
          pageSizes.push(baseSize + (i < extra ? 1 : 0));
        }
        pageSizes.push(M_f);
      } else {
        // Distribute evenly among all P pages
        const baseSize = Math.floor(tempRemaining / P);
        const extra = tempRemaining % P;
        for (let i = 0; i < P; i++) {
          pageSizes.push(baseSize + (i < extra ? 1 : 0));
        }
      }
    }

    // 3. Slice the remaining list into chunks based on calculated pageSizes
    let sliceStart = 0;
    for (const size of pageSizes) {
      chunks.push(remaining.slice(sliceStart, sliceStart + size));
      sliceStart += size;
    }

    return chunks;
  }, [printedAbstract]);

  // KTTM Ringframe Production Report Data for selected month & year
  const monthlyProductionData = useMemo(() => {
    // 1. Get matching reports for the selected month and year
    const matchingReports = history.filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      return parts.month === selectedMonth && parts.year === selectedYear;
    });

    // 2. Map of (frameNo + "||" + count) to aggregated values
    const groupMap = new Map<string, {
      frameNo: string;
      count: string;
      stdGps: number;
      totalStdProd: number;
      totalAchProd: number;
      gpsActualSum: number;
      gpsActualCount: number;
      gps40sSum: number;
      gps40sCount: number;
      avgUtilSum: number;
      avgUtilCount: number;
    }>();

    matchingReports.forEach(report => {
      // Aggregate from summaries if they have stdGps and targetProd
      if (report.summaries && report.summaries.length > 0) {
        report.summaries.forEach(s => {
          const key = `${s.frameNo}||${s.count}`;
          if (!groupMap.has(key)) {
            groupMap.set(key, {
              frameNo: s.frameNo,
              count: s.count,
              stdGps: s.stdGps,
              totalStdProd: 0,
              totalAchProd: 0,
              gpsActualSum: 0,
              gpsActualCount: 0,
              gps40sSum: 0,
              gps40sCount: 0,
              avgUtilSum: 0,
              avgUtilCount: 0
            });
          }
          const existing = groupMap.get(key)!;
          if (s.stdGps > 0 && existing.stdGps === 0) {
            existing.stdGps = s.stdGps;
          }
          existing.totalStdProd += s.targetProd || 0;
          existing.totalAchProd += s.actualProd || 0;
          if (s.avgGps > 0) {
            existing.gpsActualSum += s.avgGps;
            existing.gpsActualCount += 1;
          }
          if (s.avgUtil > 0) {
            existing.avgUtilSum += s.avgUtil;
            existing.avgUtilCount += 1;
          }
        });
      }

      // Also grab 40s GPS achieved from entries
      if (report.entries && report.entries.length > 0) {
        report.entries.forEach(e => {
          const key = `${e.frameNo}||${e.count}`;
          if (groupMap.has(key)) {
            const existing = groupMap.get(key)!;
            if (e.gps40sCon && e.gps40sCon > 0) {
              existing.gps40sSum += e.gps40sCon;
              existing.gps40sCount += 1;
            }
          }
        });
      }
    });

    // Convert map to array and sort by frameNo
    const rows = Array.from(groupMap.values()).map(g => {
      const avgGpsAch = g.gpsActualCount > 0 ? (g.gpsActualSum / g.gpsActualCount) : 0;
      const avgGps40s = g.gps40sCount > 0 ? (g.gps40sSum / g.gps40sCount) : 0;
      const avgUtil = g.avgUtilCount > 0 ? (g.avgUtilSum / g.avgUtilCount) : 0;
      
      // Calculate P% = (avgGpsAch / stdGps) * 100
      const pPercent = g.stdGps > 0 ? (avgGpsAch / g.stdGps) * 100 : 0;

      return {
        frameNo: g.frameNo,
        count: g.count,
        stdGps: g.stdGps,
        avgGpsAch,
        totalStdProd: g.totalStdProd,
        totalAchProd: g.totalAchProd,
        avgGps40s,
        avgUtil,
        pPercent
      };
    }).sort((a, b) => {
      return a.frameNo.localeCompare(b.frameNo, undefined, { numeric: true, sensitivity: 'base' });
    });

    return rows;
  }, [history, selectedMonth, selectedYear]);

  // KTTM Ringframe Daily/Monthly Production Report (Machine Wise) for selected month & year
  const machineWiseMonthlyData = useMemo(() => {
    // 1. Get number of days in selectedMonth/selectedYear
    const monthFrames = Array.from(new Set(
      history
        .filter(report => {
          if (!report || !report.date) return false;
          const parts = parseUniversalDateParts(report.date);
          return parts && parts.month === selectedMonth && parts.year === selectedYear;
        })
        .flatMap(r => [
          ...(r.summaries || []).map(s => s.frameNo),
          ...(r.entries || []).map(e => e.frameNo)
        ])
    )).filter(Boolean).sort();

    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const rows = [];
    let totalTarget = 0;
    let totalGrandTotal = 0;
    const totalsPerFrame: Record<string, number> = {};
    monthFrames.forEach(f => { totalsPerFrame[f] = 0; });

    for (let d = 1; d <= daysInMonth; d++) {
      const reportForDay = history.find(report => {
        if (!report || !report.date) return false;
        const parts = parseUniversalDateParts(report.date);
        return parts && parts.day === d && parts.month === selectedMonth && parts.year === selectedYear;
      });

      const dayStr = d.toString().padStart(2, '0');
      const monthStr = selectedMonth.toString().padStart(2, '0');
      const dateString = `${dayStr}/${monthStr}/${selectedYear}`;

      let target = 0;
      let grandTotal = 0;
      let hasData = false;
      const frameProd: Record<string, number> = {};
      monthFrames.forEach(f => { frameProd[f] = 0; });

      if (reportForDay) {
        hasData = true;
        if (reportForDay.summaries && reportForDay.summaries.length > 0) {
          reportForDay.summaries.forEach(s => {
            target += s.targetProd || 0;
          });
        } else if (reportForDay.entries && reportForDay.entries.length > 0) {
          const frameTargets = new Map<string, number>();
          reportForDay.entries.forEach(e => {
            frameTargets.set(e.frameNo, (frameTargets.get(e.frameNo) || 0) + (e.productionTarget || 0));
          });
          frameTargets.forEach(val => { target += val; });
        }

        const getMachineProd = (frame: string) => {
          let prod = 0;
          if (reportForDay.summaries && reportForDay.summaries.length > 0) {
            const summary = reportForDay.summaries.find(s => s.frameNo === frame);
            prod = summary ? (summary.actualProd || 0) : 0;
          } else if (reportForDay.entries && reportForDay.entries.length > 0) {
            reportForDay.entries.forEach(e => {
              if (e.frameNo === frame) {
                prod += e.productionActual || 0;
              }
            });
          }
          return prod;
        };

        monthFrames.forEach(frame => {
          const p = getMachineProd(frame);
          frameProd[frame] = p > 0 ? Math.round(p) : 0;
          grandTotal += frameProd[frame];
          totalsPerFrame[frame] = (totalsPerFrame[frame] || 0) + frameProd[frame];
        });
      }

      totalTarget += target;
      totalGrandTotal += grandTotal;

      rows.push({
        date: dateString,
        target: target > 0 ? Math.round(target) : 0,
        frameProd,
        grandTotal: grandTotal > 0 ? Math.round(grandTotal) : 0,
        eff: (target > 0 && grandTotal > 0) ? ((grandTotal / target) * 100) : 0,
        hasData
      });
    }

    const overallEff = totalTarget > 0 ? ((totalGrandTotal / totalTarget) * 100) : 0;

    return {
      frames: monthFrames,
      rows,
      totals: {
        target: Math.round(totalTarget),
        frameProd: totalsPerFrame,
        grandTotal: Math.round(totalGrandTotal),
        eff: overallEff
      }
    };
  }, [history, selectedMonth, selectedYear]);

  // 3. For Sider/Operator Allocation Register cross-check (by Date Shift Machine)
  const allocationReportData = useMemo(() => {
    interface RingframeRow {
      date: string;
      shiftLabel: string;
      shiftCode: Shift;
      ringframes: Record<string, string>;
      gaiter1: string;
      gaiter2: string;
      total: number;
    }

    interface AiConeRow {
      date: string;
      operatorShift1: string;
      operatorShift2: string;
      operatorShift3: string;
    }

    const ringframeRows: RingframeRow[] = [];
    const aiConeRows: AiConeRow[] = [];

    // Filter and sort reports chronologically
    const sortedReports = [...history].filter(report => {
      if (!report || !report.date) return false;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return false;
      const rYear = parts.year.toString();
      const rMonth = parts.month.toString().padStart(2, '0');
      const rDay = parts.day.toString().padStart(2, '0');
      const rDateStr = `${rYear}-${rMonth}-${rDay}`;
      
      if (fromDate && rDateStr < fromDate) return false;
      if (toDate && rDateStr > toDate) return false;
      return true;
    }).sort((a, b) => {
      return parseUniversalDate(a.date).getTime() - parseUniversalDate(b.date).getTime();
    });

    const frameHeaders = Array.from(new Set(
      sortedReports.flatMap(r => (r.entries || []).map(e => e.frameNo?.trim()).filter(Boolean) as string[])
    )).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

    sortedReports.forEach(report => {
      const shifts: Shift[] = ['I', 'II', 'III'];
      
      shifts.forEach((shift, sIdx) => {
        // ------------------ RINGFRAME ------------------
        const ringframes: Record<string, string> = {};
        let sidersCount = 0;

        frameHeaders.forEach(frame => {
          const entry = report.entries?.find(e => {
            if (e.shift !== shift) return false;
            const normEntryFrame = (e.frameNo || '').toUpperCase().trim().replace(/[\s-]/g, '');
            const normTargetFrame = frame.toUpperCase().replace(/[\s-]/g, '');
            return normEntryFrame === normTargetFrame;
          });

          if (entry) {
            const assignedIds: string[] = [];
            if (entry.siderIds) {
              entry.siderIds.forEach(id => { if (id) assignedIds.push(id); });
            } else if (entry.siderId) {
              assignedIds.push(entry.siderId);
            }
            const resolvedList = assignedIds.map(id => resolveWorker(id, entry.siderName, workers));
            const namesText = resolvedList.map(w => w.name).join(', ');
            ringframes[frame] = namesText;
            if (namesText) {
              sidersCount += resolvedList.length;
            }
          } else {
            ringframes[frame] = '';
          }
        });

        // Gaiters
        const gaiterIds = report.gaiters?.[shift] || [];
        const resolvedGaiters = gaiterIds.map(id => resolveWorker(id, undefined, workers));
        const gaiter1 = resolvedGaiters[0]?.name || '';
        const gaiter2 = resolvedGaiters[1]?.name || '';
        const gaitersCount = resolvedGaiters.length;

        const ringframeTotal = sidersCount + gaitersCount;

        ringframeRows.push({
          date: report.date,
          shiftLabel: (sIdx + 1).toString(),
          shiftCode: shift,
          ringframes,
          gaiter1,
          gaiter2,
          total: ringframeTotal
        });
      });

      // ------------------ AI CONE GRID (Consolidated into single row per date mapped to shifts I, II, III columns) ------------------
      const ai1Ids = report.aiCones?.['I'] || [];
      const resolvedAi1 = ai1Ids.map(id => resolveWorker(id, undefined, workers)).map(w => w.name);

      const ai2Ids = report.aiCones?.['II'] || [];
      const resolvedAi2 = ai2Ids.map(id => resolveWorker(id, undefined, workers)).map(w => w.name);

      const ai3Ids = report.aiCones?.['III'] || [];
      const resolvedAi3 = ai3Ids.map(id => resolveWorker(id, undefined, workers)).map(w => w.name);

      aiConeRows.push({
        date: report.date,
        operatorShift1: resolvedAi1.join(', '),
        operatorShift2: resolvedAi2.join(', '),
        operatorShift3: resolvedAi3.join(', ')
      });
    });

    const searchLower = allocationSearch.trim().toLowerCase();

    const filteredRingframeRows = ringframeRows.filter(row => {
      if (!searchLower) return true;
      return (
        row.date.toLowerCase().includes(searchLower) ||
        row.shiftLabel.includes(searchLower) ||
        Object.values(row.ringframes).some(val => val.toLowerCase().includes(searchLower)) ||
        row.gaiter1.toLowerCase().includes(searchLower) ||
        row.gaiter2.toLowerCase().includes(searchLower)
      );
    });

    const filteredAiConeRows = aiConeRows.filter(row => {
      if (!searchLower) return true;
      return (
        row.date.toLowerCase().includes(searchLower) ||
        row.operatorShift1.toLowerCase().includes(searchLower) ||
        row.operatorShift2.toLowerCase().includes(searchLower) ||
        row.operatorShift3.toLowerCase().includes(searchLower)
      );
    });

    return {
      frameHeaders,
      ringframeRows: filteredRingframeRows,
      aiConeRows: filteredAiConeRows,
      totalRingframeRawCount: ringframeRows.length,
      totalAiConeRawCount: aiConeRows.length
    };
  }, [history, fromDate, toDate, allocationSearch, workers]);

  const fDateStr = (dateStr: string) => {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Set selected worker and drill down from summary abstract report
  const handleDrilldown = (workerId: string) => {
    setSelectedWorkerId(workerId);
    
    // Set matching from/to dates based on selected month/year
    const firstDay = new Date(selectedYear, selectedMonth - 1, 1);
    const lastDay = new Date(selectedYear, selectedMonth, 0);
    const pad = (n: number) => n.toString().padStart(2, '0');
    
    setFromDate(`${firstDay.getFullYear()}-${pad(firstDay.getMonth() + 1)}-${pad(firstDay.getDate())}`);
    setToDate(`${lastDay.getFullYear()}-${pad(lastDay.getMonth() + 1)}-${pad(lastDay.getDate())}`);
    
    setActiveSubTab('individual');
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportToExcel = () => {
    // 1. Prepare Ringframe Allocation Rows for Excel
    const frameHeaders = allocationReportData.frameHeaders || [];
    const ringframeRows = allocationReportData.ringframeRows.map(row => {
      const obj: Record<string, any> = {
        'Date': row.date,
        'Shift': row.shiftCode, // Express actual shift code (I, II, III) or shift label (1, 2, 3)
      };
      frameHeaders.forEach(f => {
        obj[`${f} Sider`] = row.ringframes[f] || '';
      });
      obj['Gaiter 1'] = row.gaiter1 || '';
      obj['Gaiter 2'] = row.gaiter2 || '';
      obj['Total Workers'] = row.total || '';
      return obj;
    });

    // 2. Prepare AI Cone Allocation Rows for Excel in 3-column Shift Layout
    const aiConeRows = allocationReportData.aiConeRows.map(row => ({
      'Date': row.date,
      'Shift I Operator': row.operatorShift1 || '',
      'Shift II Operator': row.operatorShift2 || '',
      'Shift III Operator': row.operatorShift3 || ''
    }));

    // 3. Create a workbook
    const wb = XLSX.utils.book_new();

    // 4. Create worksheets
    const wsRingframe = XLSX.utils.json_to_sheet(ringframeRows);
    const wsAiCone = XLSX.utils.json_to_sheet(aiConeRows);

    // 5. Apply columns width padding
    wsRingframe['!cols'] = [
      { wch: 14 }, // Date
      { wch: 8 },  // Shift
      ...frameHeaders.map(() => ({ wch: 16 })),
      { wch: 16 }, // Gaiter 1
      { wch: 16 }, // Gaiter 2
      { wch: 14 }  // Total Siders/Gaiters
    ];

    wsAiCone['!cols'] = [
      { wch: 14 }, // Date
      { wch: 25 }, // Shift I Operator
      { wch: 25 }, // Shift II Operator
      { wch: 25 }  // Shift III Operator
    ];

    // 6. Append sheets to workbook
    XLSX.utils.book_append_sheet(wb, wsRingframe, 'Ringframe Allocations');
    XLSX.utils.book_append_sheet(wb, wsAiCone, 'AI Cone Allocations');

    // 7. Write and Save the spreadsheet
    const dateStr = `${fromDate || 'all'}_to_${toDate || 'all'}`;
    XLSX.writeFile(wb, `Machine_Allocations_${dateStr}.xlsx`);
  };

  const handleExportMonthlyProductionToExcel = () => {
    const monthName = monthsList.find(m => m.value === selectedMonth)?.label || '';
    const dateStr = `${monthName}_${selectedYear}`;

    // 1. Prepare rows
    const excelRows = monthlyProductionData.map(row => ({
      'Rf no': row.frameNo,
      'Count': row.count,
      'GPS STD': Math.round(row.stdGps),
      'GPS Ach': Number(row.avgGpsAch.toFixed(1)),
      'Production STD (Kg)': Math.round(row.totalStdProd),
      'Production Ach (Kg)': Math.round(row.totalAchProd),
      '40s GPS Ach': row.avgGps40s > 0 ? Number(row.avgGps40s.toFixed(1)) : '',
      'U%': Number(row.avgUtil.toFixed(1)),
      'P%': Number(row.pPercent.toFixed(1))
    }));

    // 2. Prepare Grand Total row
    const totalStdProdSum = monthlyProductionData.reduce((acc, r) => acc + r.totalStdProd, 0);
    const totalAchProdSum = monthlyProductionData.reduce((acc, r) => acc + r.totalAchProd, 0);
    const avgUtilSum = monthlyProductionData.reduce((acc, r) => acc + r.avgUtil, 0);
    const avgUtilAvg = monthlyProductionData.length > 0 ? avgUtilSum / monthlyProductionData.length : 0;
    const avgPSum = monthlyProductionData.reduce((acc, r) => acc + r.pPercent, 0);
    const avgPAvg = monthlyProductionData.length > 0 ? avgPSum / monthlyProductionData.length : 0;

    excelRows.push({
      'Rf no': 'Grand Total',
      'Count': '',
      'GPS STD': 0,
      'GPS Ach': 0,
      'Production STD (Kg)': Math.round(totalStdProdSum),
      'Production Ach (Kg)': Math.round(totalAchProdSum),
      '40s GPS Ach': 0,
      'U%': Number(avgUtilAvg.toFixed(1)),
      'P%': Number(avgPAvg.toFixed(1))
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Apply column widths
    ws['!cols'] = [
      { wch: 10 }, // Rf no
      { wch: 15 }, // Count
      { wch: 10 }, // GPS STD
      { wch: 10 }, // GPS Ach
      { wch: 20 }, // Production STD
      { wch: 20 }, // Production Ach
      { wch: 15 }, // 40s GPS Ach
      { wch: 10 }, // U%
      { wch: 10 }  // P%
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Production Report');
    XLSX.writeFile(wb, `KTTM_Ringframe_Production_Report_${dateStr}.xlsx`);
  };

  const handleExportMachineWiseProductionToExcel = () => {
    const monthName = monthsList.find(m => m.value === selectedMonth)?.label || '';
    const dateStr = `${monthName}_${selectedYear}`;

    // 1. Prepare rows
    const frames = machineWiseMonthlyData.frames;
    const excelRows = machineWiseMonthlyData.rows.map(row => {
      const obj: Record<string, any> = {
        'Date': row.date,
        'Target': row.target > 0 ? row.target : '',
      };
      frames.forEach(f => {
        const val = row.frameProd[f] || 0;
        obj[f] = val > 0 ? val : '';
      });
      obj['Grand Total'] = row.grandTotal > 0 ? row.grandTotal : '';
      obj['Eff%'] = row.eff > 0 ? Number(row.eff.toFixed(1)) : '';
      return obj;
    });

    // 2. Add Grand Total row
    const totals = machineWiseMonthlyData.totals;
    const totalsObj: Record<string, any> = {
      'Date': 'Grand Total',
      'Target': totals.target,
    };
    frames.forEach(f => {
      const val = totals.frameProd[f] || 0;
      totalsObj[f] = val > 0 ? val : '';
    });
    totalsObj['Grand Total'] = totals.grandTotal;
    totalsObj['Eff%'] = Number(totals.eff.toFixed(1));
    excelRows.push(totalsObj);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Column widths
    ws['!cols'] = [
      { wch: 15 }, // Date
      { wch: 12 }, // Target
      ...frames.map(() => ({ wch: 10 })),
      { wch: 15 }, // Grand Total
      { wch: 12 }  // Eff%
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Machine Wise Report');
    XLSX.writeFile(wb, `KTTM_Ringframe_Machine_Wise_Production_Report_${dateStr}.xlsx`);
  };

  const handleExportAbstractToExcel = () => {
    const monthName = monthsList.find(m => m.value === selectedMonth)?.label || '';
    const dateStr = `${monthName}_${selectedYear}`;

    // 1. Prepare rows
    const excelRows: any[] = consolidatedAbstract.map((row, idx) => ({
      'S. NO': idx + 1,
      'TNo': row.tNo || '—',
      'Operator / Sider Name': row.name,
      'Days Worked': row.workingDays,
      'EM Value': row.avgEm > 0 ? Number(row.avgEm.toFixed(2)) : '—',
      'Monthly Avg GPS': row.avgGps > 0 ? row.avgGps : '—',
      'Incentive Payout (INR)': row.totalIncentive
    }));

    // 2. Add Grand Total row
    excelRows.push({
      'S. NO': 'Total',
      'TNo': '',
      'Operator / Sider Name': '',
      'Days Worked': '',
      'EM Value': '',
      'Monthly Avg GPS': '',
      'Incentive Payout (INR)': consolidatedTotalIncentive
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(excelRows);

    // Apply column widths
    ws['!cols'] = [
      { wch: 8 },  // S. NO
      { wch: 12 }, // TNo
      { wch: 30 }, // Operator / Sider Name
      { wch: 15 }, // Days Worked
      { wch: 15 }, // EM Value
      { wch: 18 }, // Monthly Avg GPS
      { wch: 24 }  // Incentive Payout (INR)
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Incentive Abstract');
    XLSX.writeFile(wb, `KTTM_Ringframe_Operator_Incentive_Abstract_${dateStr}.xlsx`);
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className={(isPrintingAll || isPrintingAbstract) ? "print:hidden" : ""}>
        {/* Sub-tab selection menu */}
      <div className="flex bg-stone-100 p-1.5 rounded-2xl no-print max-w-4xl">
        <button
          onClick={() => setActiveSubTab('individual')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'individual'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <User size={15} /> Worker Ledger
        </button>
        <button
          onClick={() => setActiveSubTab('consolidated')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'consolidated'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Users size={15} /> Monthly Abstract
        </button>
        <button
          onClick={() => setActiveSubTab('monthlyProduction')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'monthlyProduction'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <BarChart3 size={15} /> Monthly Production
        </button>
        <button
          onClick={() => setActiveSubTab('machineWiseProduction')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'machineWiseProduction'
              ? 'bg-white text-stone-900 shadow-sm'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Database size={15} /> Machine Monthly Report
        </button>
        <button
          onClick={() => setActiveSubTab('duplicates')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'duplicates'
              ? 'bg-white text-rose-800 shadow-sm border border-rose-100'
              : 'text-stone-500 hover:text-rose-600'
          }`}
        >
          <span className="relative text-center">
            ⚠️ Duplicate Assignment Audit Ledger
          </span>
        </button>
      </div>

      {activeSubTab === 'individual' ? (
        /* INDIVIDUAL WORKER INCENTIVE LEDGER VIEW */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm no-print">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Operator dropdown */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Select Sider / Operator</label>
                <div className="relative">
                  <select
                    value={selectedWorkerId}
                    onChange={e => setSelectedWorkerId(e.target.value)}
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3.5 font-bold outline-none focus:border-stone-900 transition-colors text-stone-800 text-sm appearance-none cursor-pointer"
                  >
                    <option value="">-- Choose Operator --</option>
                    {eligibleLedgerWorkers.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.tNo ? `[${w.tNo}] ` : ''}{w.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                    <ChevronRight size={16} className="transform rotate-90" />
                  </div>
                </div>
              </div>

              {/* From Date */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                  onChange={e => setFromDate(e.target.value)}
                  className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-sm cursor-pointer"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                  onChange={e => setToDate(e.target.value)}
                  className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-sm cursor-pointer"
                />
              </div>
            </div>

            <button
              onClick={handlePrint}
              disabled={!selectedWorkerId}
              className="flex items-center gap-3 bg-stone-900 hover:bg-stone-800 text-white disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-stone-200 active:scale-95 whitespace-nowrap cursor-pointer"
            >
              <Printer size={16} /> Print Ledger
            </button>
          </div>

          <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative overflow-hidden">
            {selectedWorkerId ? (
              <div className="space-y-8">
                {/* Print layout header */}
                <div className="text-center pb-6 border-b-4 border-stone-950/15">
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">Worker Wise History — Supporting Documents for Payout</span>
                  <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tight">Sider Incentive Ledger Statement</h1>
                  
                  {/* Detailed specs of selected worker card */}
                  {(() => {
                    const detail = getWorkerDetails(selectedWorkerId);
                    if (!detail) return null;
                    const fParts = fromDate.split('-');
                    const tParts = toDate.split('-');
                    const displayFrom = fParts.length === 3 ? `${fParts[2]}/${fParts[1]}/${fParts[0]}` : fromDate;
                    const displayTo = tParts.length === 3 ? `${tParts[2]}/${tParts[1]}/${tParts[0]}` : toDate;
                    return (
                      <div className="mt-6 flex flex-wrap justify-center gap-8 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                        <div>Sider Name: <span className="text-stone-950 font-black text-sm">{detail.name}</span></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-stone-300 self-center" />
                        <div>TK. No: <span className="text-stone-950 font-black text-sm">{detail.tNo || '—'}</span></div>
                        <div className="w-1.5 h-1.5 rounded-full bg-stone-300 self-center" />
                        <div>Period: <span className="text-stone-950 font-black text-sm">{displayFrom} to {displayTo}</span></div>
                      </div>
                    );
                  })()}
                </div>

                {/* Ledger Data Table */}
                {individualLedger.length > 0 ? (
                  <div className="space-y-8">
                    {/* Main transaction ledger table */}
                    <div className="overflow-x-auto rounded-2xl border-2 border-stone-900/10 mb-6">
                      <table className="w-full text-center border-collapse">
                        <thead>
                          <tr className="bg-stone-50 border-b border-stone-900/10">
                            <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-left">S. NO</th>
                            <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-left">Date</th>
                            <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider">Shift</th>
                            <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider">Alloted RF (MC No)</th>
                            <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider">Count</th>
                            <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider">Achieved GPS</th>
                            <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider">EM</th>
                            <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-right">Incentive (Rs)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {individualLedger.map((item, idx) => {
                            const isRowDup = duplicateAllocations.some(
                              d => d.date === item.date && (d.workerId === selectedWorkerId || d.tNo === selectedWorkerId)
                            );
                            return (
                              <tr 
                                key={idx} 
                                className={cn(
                                  "border-b last:border-b-0 border-stone-100 hover:bg-stone-50/50 transition-colors",
                                  isRowDup && "bg-red-50 hover:bg-red-100/50"
                                )}
                              >
                                <td className="px-6 py-4 text-xs text-stone-400 font-bold text-left">{idx + 1}</td>
                                <td className="px-6 py-4 text-sm font-black text-stone-900 text-left font-mono">
                                  <div className="flex items-center gap-2">
                                    <span>{item.date}</span>
                                    {isRowDup && (
                                      <span className="bg-red-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded tracking-wider uppercase shrink-0 no-print">
                                        ⚠️ DUP
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-6 py-4 text-sm font-black text-stone-950">
                                  <span className="px-2 py-1 bg-stone-100 text-stone-800 rounded font-bold">{item.shift}</span>
                                </td>
                                <td className="px-6 py-4 text-sm font-black text-stone-700">
                                  {item.role === 'GAITER' ? (
                                    <span className="text-emerald-700 text-xs font-extrabold tracking-widest bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full uppercase">Gaiter Duty</span>
                                  ) : (
                                    item.frameNo
                                  )}
                                </td>
                                <td className="px-6 py-4 text-sm font-bold text-stone-600 font-mono">{item.count}</td>
                                <td className="px-6 py-4 text-sm font-black text-stone-900 tabular-nums font-mono">{item.gps}</td>
                                <td className="px-6 py-4 text-sm font-black text-stone-900 tabular-nums font-mono">{item.em !== undefined && item.em > 0 ? item.em.toFixed(2) : '—'}</td>
                                <td className="px-6 py-4 text-lg font-black text-emerald-800 text-right tabular-nums font-mono">₹{item.incentive}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Summary aggregates with stamp-payout box style */}
                    <div className="flex flex-col sm:flex-row items-center justify-between p-8 bg-stone-50 rounded-3xl border-2 border-stone-100 relative">
                      <div className="text-left mb-4 sm:mb-0">
                        <span className="text-[9px] font-black tracking-widest text-stone-400 uppercase">Payout Calculation Summary</span>
                        <div className="text-stone-900 font-black uppercase text-xl mt-1">Payable Incentive Record</div>
                        <p className="text-[10px] font-bold text-stone-400 uppercase mt-1 leading-relaxed">
                          Includes {individualLedger.filter(i => i.role === 'OPERATOR').length} Operator shifts &amp; {individualLedger.filter(i => i.role === 'GAITER').length} Gaiter duties under active frameworks
                        </p>
                      </div>
                      
                      <div className="flex gap-10 items-center">
                        <div className="bg-white border border-stone-200 px-6 py-4 rounded-2xl text-center shadow-sm">
                          <span className="block text-[8px] font-black text-stone-400 uppercase tracking-widest">EM Average</span>
                          <span className="text-2xl font-black text-stone-800 font-mono tabular-nums">
                            {individualEmAverage > 0 ? individualEmAverage.toFixed(2) : '—'}
                          </span>
                        </div>

                        <div className="bg-white border border-stone-200 px-6 py-4 rounded-2xl text-center shadow-sm">
                          <span className="block text-[8px] font-black text-stone-400 uppercase tracking-widest">Total Duties</span>
                          <span className="text-2xl font-black text-stone-800 font-mono tabular-nums">{individualLedger.length}</span>
                        </div>
                        
                        <div className="bg-emerald-900 px-8 py-5 rounded-2xl text-center text-white shadow-xl shadow-emerald-950/20">
                          <span className="block text-[8px] font-black text-emerald-300 uppercase tracking-widest">Total Amount</span>
                          <span className="text-4xl font-extrabold font-mono tabular-nums">₹{individualTotal}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-16 text-center bg-stone-50 rounded-2xl border-2 border-dashed border-stone-200">
                    <FileText size={40} className="mx-auto text-stone-300 mb-4" />
                    <h3 className="text-lg font-black text-stone-800 uppercase">No Data Found</h3>
                    <p className="text-stone-400 text-sm font-bold mt-1 uppercase tracking-wider">No assignments or gaiter entries were found for this operator in selected dates</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="py-24 text-center">
                <Search size={48} className="mx-auto text-stone-300 mb-6" />
                <h3 className="text-2xl font-black text-stone-900 uppercase">Select Operator</h3>
                <p className="text-stone-400 font-bold mt-2 uppercase tracking-wide text-xs">Please choose an operator and date range at the top to display ledger statements</p>
              </div>
            )}
          </div>
        </div>
      ) : activeSubTab === 'consolidated' ? (
        /* CONSOLIDATED MONTHLY SUMMARY ABSTRACT (FOR FORWARDING TO ACCOUNTS) */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm no-print">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
              {/* Select Month */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Choose Payout Month</label>
                <div className="relative">
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3.5 font-bold outline-none focus:border-stone-900 transition-colors text-stone-800 text-sm appearance-none cursor-pointer"
                  >
                    {monthsList.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                    <ChevronRight size={16} className="transform rotate-90" />
                  </div>
                </div>
              </div>

              {/* Select Year */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Choose Payout Year</label>
                <div className="relative">
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3.5 font-bold outline-none focus:border-stone-900 transition-colors text-stone-800 text-sm appearance-none cursor-pointer"
                  >
                    {yearsList.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                    <ChevronRight size={16} className="transform rotate-90" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleExportAbstractToExcel}
                className="flex items-center gap-3 bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-emerald-700/20 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Download size={16} /> Export Abstract to Excel
              </button>

              <button
                onClick={() => setIsPrintingAll(true)}
                className="flex items-center gap-3 bg-amber-600 hover:bg-amber-500 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-amber-500/20 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Printer size={16} /> Print All (Abstract + Ledgers)
              </button>

              <button
                onClick={() => setIsPrintingAbstract(true)}
                className="flex items-center gap-3 bg-stone-900 hover:bg-stone-800 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-stone-200 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Printer size={16} /> Print Abstract
              </button>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative overflow-hidden">
            <div className="space-y-8">
              {/* Report Header */}
              <div className="text-center pb-6 border-b-4 border-stone-950/15">
                <img
                  src="/scm-logo-horizontal.png"
                  alt="SCM Textile Spinners"
                  className="h-14 w-auto max-w-[260px] object-contain drop-shadow-2xs mx-auto mb-3"
                />
                <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tight">KTTM Ring frame Operator Incentive Abstract</h1>
                <div className="mt-3 text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                  Month: <span className="text-stone-950 font-black text-sm">{monthsList.find(m => m.value === selectedMonth)?.label} {selectedYear}</span>
                </div>
              </div>

              {/* Abstract Data Table */}
              {consolidatedAbstract.length > 0 ? (
                <div className="space-y-8">
                  <div className="overflow-x-auto rounded-2xl border-2 border-stone-900/10">
                    <table className="w-full text-center border-collapse">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-900/10">
                          <th className="px-4 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-center no-print w-16">
                            <input
                              type="checkbox"
                              checked={consolidatedAbstract.length > 0 && omittedWorkerIds.size === 0}
                              onChange={() => {
                                if (omittedWorkerIds.size > 0) {
                                  setOmittedWorkerIds(new Set());
                                } else {
                                  setOmittedWorkerIds(new Set(consolidatedAbstract.map(r => r.workerId)));
                                }
                              }}
                              className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                              title="Toggle all for Print All"
                            />
                          </th>
                          <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-left">S. NO</th>
                          <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-left">TNo</th>
                          <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-left">Operator / Sider Name</th>
                          <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider">Days Worked</th>
                          <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider">EM Value</th>
                          <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider">Monthly Avg GPS</th>
                          <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-right">Incentive Payout (INR)</th>
                          <th className="px-6 py-4 text-xs font-black text-stone-500 uppercase tracking-wider text-center no-print">Audit Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {consolidatedAbstract.map((row, idx) => {
                          const workerDups = duplicateAllocations.filter(
                            d => d.workerId === row.workerId || d.tNo === row.tNo
                          );
                          const hasDup = workerDups.length > 0;
                          return (
                            <tr 
                              key={row.workerId} 
                              className={cn(
                                "border-b last:border-b-0 border-stone-100 hover:bg-stone-50/50 transition-colors",
                                hasDup && "bg-red-50 hover:bg-red-100/40"
                              )}
                            >
                              <td className="px-4 py-4 text-center no-print w-16">
                                <input
                                  type="checkbox"
                                  checked={!omittedWorkerIds.has(row.workerId)}
                                  onChange={() => {
                                    setOmittedWorkerIds(prev => {
                                      const next = new Set(prev);
                                      if (next.has(row.workerId)) {
                                        next.delete(row.workerId);
                                      } else {
                                        next.add(row.workerId);
                                      }
                                      return next;
                                    });
                                  }}
                                  className="rounded border-stone-300 text-amber-600 focus:ring-amber-500 h-4 w-4 cursor-pointer"
                                  title="Include in Print All / Omit"
                                />
                              </td>
                              <td className="px-6 py-4 text-xs text-stone-400 font-bold text-left">{idx + 1}</td>
                              <td className="px-6 py-4 text-sm font-black text-stone-900 text-left font-mono">{row.tNo || '—'}</td>
                              <td className="px-6 py-4 text-sm font-black text-stone-800 text-left uppercase">
                                <div className="flex items-center gap-2">
                                  <span>{row.name}</span>
                                  {hasDup && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-red-100 border border-red-200 text-red-800 text-[9px] font-black uppercase tracking-wider rounded animate-pulse no-print">
                                      ⚠️ DUP ({workerDups.length})
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm font-bold text-stone-600 font-mono tabular-nums">{row.workingDays}</td>
                              <td className="px-6 py-4 text-sm font-black text-stone-700 font-mono tabular-nums">
                                {row.avgEm > 0 ? row.avgEm.toFixed(2) : '—'}
                              </td>
                              <td className="px-6 py-4 text-sm font-black text-emerald-800 font-mono tabular-nums">
                                {row.avgGps > 0 ? (
                                  <span className="bg-emerald-50 border border-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-black text-xs font-mono">{row.avgGps}</span>
                                ) : '—'}
                              </td>
                              <td className="px-6 py-4 text-lg font-black text-emerald-800 text-right font-mono tabular-nums">₹{row.totalIncentive}</td>
                              <td className="px-6 py-4 text-center no-print">
                              <button
                                onClick={() => handleDrilldown(row.workerId)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-stone-150 hover:bg-stone-200 text-stone-700 text-[10px] font-black uppercase tracking-wider rounded-lg border border-stone-200 transition-all cursor-pointer"
                              >
                                View History <ArrowUpRight size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      </tbody>
                    </table>
                  </div>

                  {/* Grand total summaries for accounts presentation */}
                  <div className="flex flex-col sm:flex-row items-center justify-between p-8 bg-[#e2efda]/50 rounded-3xl border-2 border-emerald-800/20 relative">
                    <div className="text-left mb-4 sm:mb-0">
                      <span className="text-[9px] font-black tracking-widest text-emerald-800 uppercase">Accounts Consolidation Total</span>
                      <div className="text-stone-900 font-black uppercase text-xl mt-1">Monthly Payroll Allocation</div>
                      <p className="text-[10px] font-bold text-stone-400 uppercase mt-1 leading-relaxed">
                        Total payout computation of all ({consolidatedAbstract.length}) operators registered in the selected schedule.
                      </p>
                    </div>
                    
                    <div className="flex gap-10 items-center">
                      <div className="bg-white border border-stone-200 px-6 py-4 rounded-2xl text-center shadow-sm">
                        <span className="block text-[8px] font-black text-stone-400 uppercase tracking-widest">Active Operators</span>
                        <span className="text-2xl font-black text-stone-800 font-mono tabular-nums">
                          {consolidatedAbstract.filter(c => c.totalIncentive > 0).length}
                        </span>
                      </div>
                      
                      <div className="bg-emerald-950 px-8 py-5 rounded-2xl text-center text-white shadow-xl shadow-emerald-950/20">
                        <span className="block text-[8px] font-black text-emerald-300 uppercase tracking-widest">Total Payout Release</span>
                        <span className="text-4xl font-extrabold font-mono tabular-nums">₹{consolidatedTotalIncentive}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 font-bold uppercase tracking-wider text-xs text-stone-400">
                  <Database size={40} className="mx-auto text-stone-300 mb-4 animate-bounce" />
                  No database entries or shifts logged for the selected period
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeSubTab === 'monthlyProduction' ? (
        /* MONTHLY PRODUCTION REPORT AS PER USER'S IMAGE */
        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm no-print">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
              {/* Select Month */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Choose Report Month</label>
                <div className="relative">
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3.5 font-bold outline-none focus:border-stone-900 transition-colors text-stone-800 text-sm appearance-none cursor-pointer"
                  >
                    {monthsList.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                    <ChevronRight size={16} className="transform rotate-90" />
                  </div>
                </div>
              </div>

              {/* Select Year */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Choose Report Year</label>
                <div className="relative">
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3.5 font-bold outline-none focus:border-stone-900 transition-colors text-stone-800 text-sm appearance-none cursor-pointer"
                  >
                    {yearsList.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                    <ChevronRight size={16} className="transform rotate-90" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleExportMonthlyProductionToExcel}
                className="flex items-center gap-3 bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-emerald-500/20 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Download size={16} /> Export to Excel
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-3 bg-stone-900 hover:bg-stone-800 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-stone-200 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Printer size={16} /> Print Report
              </button>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative overflow-hidden">
            <div className="space-y-8">
              {/* SCM TEXTILE SPINNERS Report Header Layout */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b-4 border-stone-950/15 gap-6">
                <div className="flex items-center gap-5">
                  <img
                    src="/scm-logo-horizontal.png"
                    alt="SCM Textile Spinners"
                    className="h-14 w-auto max-w-[260px] object-contain drop-shadow-2xs"
                  />
                  <div className="border-l-2 border-stone-300 pl-4">
                    <h2 className="text-lg md:text-xl font-sans font-extrabold tracking-tight text-stone-800">KTTM Ringframe Production Report</h2>
                  </div>
                </div>

                <div className="flex sm:flex-col sm:items-end justify-between text-sm font-bold text-stone-700 uppercase tracking-wider print:mt-0">
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 font-extrabold text-[10px]">Month:</span>
                    <span className="border-b-2 border-stone-900 pb-0.5 px-3 font-serif text-stone-950 font-black text-base">
                      {monthsList.find(m => m.value === selectedMonth)?.label.substring(0, 3)}-{selectedYear.toString().slice(-2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Data Table */}
              {monthlyProductionData.length > 0 ? (
                <div className="space-y-6">
                  <div className="overflow-x-auto rounded-xl">
                    <table className="w-full text-center border-collapse border-2 border-stone-800">
                      <thead>
                        <tr className="border-b-2 border-stone-800 text-stone-900 font-black text-[11px] sm:text-xs bg-stone-100">
                          <th rowSpan={2} className="border border-stone-400 px-3 py-3 text-center uppercase tracking-wider">Rf no</th>
                          <th rowSpan={2} className="border border-stone-400 px-3 py-3 text-left uppercase tracking-wider">Count</th>
                          <th colSpan={2} className="border border-stone-400 px-3 py-1.5 text-center uppercase tracking-wider">GPS</th>
                          <th colSpan={2} className="border border-stone-400 px-3 py-1.5 text-center uppercase tracking-wider">Production in Kg</th>
                          <th className="border border-stone-400 px-3 py-1.5 text-center uppercase tracking-wider">40s GPS</th>
                          <th rowSpan={2} className="border border-stone-400 px-3 py-3 text-center uppercase tracking-wider">U%</th>
                          <th rowSpan={2} className="border border-stone-400 px-3 py-3 text-center uppercase tracking-wider">P%</th>
                        </tr>
                        <tr className="border-b-2 border-stone-800 text-stone-800 font-extrabold text-[10px] bg-stone-50">
                          <th className="border border-stone-400 px-3 py-1.5 text-center uppercase tracking-widest">STD</th>
                          <th className="border border-stone-400 px-3 py-1.5 text-center uppercase tracking-widest">Ach</th>
                          <th className="border border-stone-400 px-3 py-1.5 text-center uppercase tracking-widest">STD</th>
                          <th className="border border-stone-400 px-3 py-1.5 text-center uppercase tracking-widest">Ach</th>
                          <th className="border border-stone-400 px-3 py-1.5 text-center uppercase tracking-widest">Ach</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monthlyProductionData.map((row, idx) => {
                          const showFrameNo = idx === 0 || row.frameNo !== monthlyProductionData[idx - 1].frameNo;
                          return (
                            <tr key={`monthly-prod-${row.frameNo}-${row.count}-${idx}`} className="hover:bg-stone-50/50 transition-colors text-xs font-semibold text-stone-900 border-b border-stone-300">
                              <td className="border border-stone-400 px-3 py-2.5 font-bold text-center bg-stone-50/30">
                                {showFrameNo ? row.frameNo : ""}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 text-left font-black tracking-tight">
                                {row.count}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 text-center font-mono text-stone-600">
                                {Math.round(row.stdGps)}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 text-center font-mono text-stone-950 font-black">
                                {row.avgGpsAch.toFixed(1)}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 text-center font-mono text-stone-600">
                                {Math.round(row.totalStdProd).toLocaleString('en-IN')}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 text-center font-mono text-stone-950 font-black bg-emerald-50/10">
                                {Math.round(row.totalAchProd).toLocaleString('en-IN')}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 text-center font-mono text-stone-600 bg-stone-50/20">
                                {row.avgGps40s > 0 ? row.avgGps40s.toFixed(1) : ""}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 text-center font-mono text-indigo-950 font-black bg-indigo-50/10">
                                {row.avgUtil.toFixed(1)}
                              </td>
                              <td className={`border border-stone-400 px-3 py-2.5 text-center font-mono font-black ${row.pPercent >= 100 ? "text-emerald-700" : "text-amber-800"}`}>
                                {row.pPercent.toFixed(1)}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Grand Total row */}
                        {(() => {
                          const totalStdProdSum = monthlyProductionData.reduce((acc, r) => acc + r.totalStdProd, 0);
                          const totalAchProdSum = monthlyProductionData.reduce((acc, r) => acc + r.totalAchProd, 0);
                          const avgUtilSum = monthlyProductionData.reduce((acc, r) => acc + r.avgUtil, 0);
                          const avgUtilAvg = monthlyProductionData.length > 0 ? avgUtilSum / monthlyProductionData.length : 0;
                          const avgPSum = monthlyProductionData.reduce((acc, r) => acc + r.pPercent, 0);
                          const avgPAvg = monthlyProductionData.length > 0 ? avgPSum / monthlyProductionData.length : 0;

                          return (
                            <tr className="border-t-2 border-b-2 border-stone-800 text-stone-950 font-black text-[12px] sm:text-xs bg-stone-100">
                              <td colSpan={2} className="border border-stone-400 px-3 py-3 text-right uppercase tracking-wider font-extrabold">
                                Grand Total
                              </td>
                              <td colSpan={2} className="border border-stone-400 px-3 py-3"></td>
                              <td className="border border-stone-400 px-3 py-3 text-center font-mono">
                                {Math.round(totalStdProdSum).toLocaleString('en-IN')}
                              </td>
                              <td className="border border-stone-400 px-3 py-3 text-center font-mono text-stone-950 font-black">
                                {Math.round(totalAchProdSum).toLocaleString('en-IN')}
                              </td>
                              <td className="border border-stone-400 px-3 py-3"></td>
                              <td className="border border-stone-400 px-3 py-3 text-center font-mono text-indigo-950 font-black">
                                {avgUtilAvg.toFixed(1)}
                              </td>
                              <td className="border border-stone-400 px-3 py-3 text-center font-mono font-black text-emerald-950">
                                {avgPAvg.toFixed(1)}
                              </td>
                            </tr>
                          );
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="py-24 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 font-bold uppercase tracking-wider text-xs text-stone-400">
                  <Database size={40} className="mx-auto text-stone-300 mb-4 animate-bounce" />
                  No production data logged for the selected period
                </div>
              )}
            </div>
          </div>
        </div>
      ) : activeSubTab === 'machineWiseProduction' ? (
        /* MACHINE WISE MONTHLY PRODUCTION REPORT AS REQUESTED */
        <div className="space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm no-print">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
              {/* Select Month */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Choose Report Month</label>
                <div className="relative">
                  <select
                    value={selectedMonth}
                    onChange={e => setSelectedMonth(Number(e.target.value))}
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3.5 font-bold outline-none focus:border-stone-900 transition-colors text-stone-800 text-sm appearance-none cursor-pointer"
                  >
                    {monthsList.map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                    <ChevronRight size={16} className="transform rotate-90" />
                  </div>
                </div>
              </div>

              {/* Select Year */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Choose Report Year</label>
                <div className="relative">
                  <select
                    value={selectedYear}
                    onChange={e => setSelectedYear(Number(e.target.value))}
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3.5 font-bold outline-none focus:border-stone-900 transition-colors text-stone-800 text-sm appearance-none cursor-pointer"
                  >
                    {yearsList.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-stone-400">
                    <ChevronRight size={16} className="transform rotate-90" />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleExportMachineWiseProductionToExcel}
                className="flex items-center gap-3 bg-emerald-700 hover:bg-emerald-600 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-emerald-500/20 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Download size={16} /> Export to Excel
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-3 bg-stone-900 hover:bg-stone-800 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-stone-200 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Printer size={16} /> Print Report
              </button>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative overflow-hidden">
            <div className="space-y-8">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b-4 border-stone-950/15 gap-6">
                <div className="flex items-center gap-5">
                  <img
                    src="/scm-logo-horizontal.png"
                    alt="SCM Textile Spinners"
                    className="h-14 w-auto max-w-[260px] object-contain drop-shadow-2xs"
                  />
                  <div className="border-l-2 border-stone-300 pl-4">
                    <h2 className="text-lg md:text-xl font-sans font-extrabold tracking-tight text-stone-800">KTTM Ringframe Production Report</h2>
                  </div>
                </div>

                <div className="flex sm:flex-col sm:items-end justify-between text-sm font-bold text-stone-700 uppercase tracking-wider print:mt-0">
                  <div className="flex items-center gap-2">
                    <span className="text-stone-400 font-extrabold text-[10px]">Month:</span>
                    <span className="border-b-2 border-stone-900 pb-0.5 px-3 font-serif text-stone-950 font-black text-base">
                      {monthsList.find(m => m.value === selectedMonth)?.label.substring(0, 3)}-{selectedYear.toString().slice(-2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Month Header centered */}
              <div className="text-center font-bold text-xl text-stone-900 py-2 border-y border-stone-200">
                Month &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; {monthsList.find(m => m.value === selectedMonth)?.label.substring(0, 3)}-{selectedYear.toString().slice(-2)}
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto rounded-xl">
                <table className="w-full text-center border-collapse border border-black">
                  <thead>
                    <tr className="bg-stone-50 text-stone-900 font-black text-xs border-b border-black">
                      <th className="border border-black px-3 py-2 text-left uppercase tracking-wider">Date</th>
                      <th className="border border-black px-3 py-2 uppercase tracking-wider">Target</th>
                      {machineWiseMonthlyData.frames.map(frame => (
                        <th key={frame} className="border border-black px-3 py-2 uppercase tracking-wider">{frame}</th>
                      ))}
                      <th className="border border-black px-3 py-2 uppercase tracking-wider font-bold">Grand Total</th>
                      <th className="border border-black px-3 py-2 uppercase tracking-wider font-bold">Eff%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {machineWiseMonthlyData.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-stone-50/50 transition-colors text-xs font-semibold text-stone-900 border-b border-stone-200">
                        <td className="border border-black px-3 py-1 text-left font-bold">{row.date}</td>
                        <td className="border border-black px-3 py-1 font-mono bg-stone-50/10">{row.target > 0 ? row.target.toLocaleString('en-IN') : '—'}</td>
                        {machineWiseMonthlyData.frames.map(frame => {
                          const val = row.frameProd[frame] || 0;
                          return (
                            <td key={frame} className="border border-black px-3 py-1 font-mono bg-stone-50/30">
                              {val > 0 ? val.toLocaleString('en-IN') : ''}
                            </td>
                          );
                        })}
                        <td className="border border-black px-3 py-1 font-mono font-bold bg-stone-100/50">{row.grandTotal > 0 ? row.grandTotal.toLocaleString('en-IN') : '—'}</td>
                        <td className={`border border-black px-3 py-1 font-mono font-bold ${row.eff >= 100 ? "text-emerald-700" : "text-amber-800"}`}>{row.eff > 0 ? row.eff.toFixed(1) : '—'}</td>
                      </tr>
                    ))}
                    {/* Totals row */}
                    <tr className="bg-stone-100 font-bold border-t border-black text-xs text-stone-950">
                      <td className="border border-black px-3 py-2.5 text-left font-black uppercase">Grand Total</td>
                      <td className="border border-black px-3 py-2.5 font-mono font-black">{machineWiseMonthlyData.totals.target > 0 ? machineWiseMonthlyData.totals.target.toLocaleString('en-IN') : '—'}</td>
                      {machineWiseMonthlyData.frames.map(frame => {
                        const val = machineWiseMonthlyData.totals.frameProd[frame] || 0;
                        return (
                          <td key={frame} className="border border-black px-3 py-2.5 font-mono font-black">
                            {val > 0 ? val.toLocaleString('en-IN') : ''}
                          </td>
                        );
                      })}
                      <td className="border border-black px-3 py-2.5 font-mono font-black">{machineWiseMonthlyData.totals.grandTotal > 0 ? machineWiseMonthlyData.totals.grandTotal.toLocaleString('en-IN') : '—'}</td>
                      <td className="border border-black px-3 py-2.5 font-mono font-black text-emerald-950">{machineWiseMonthlyData.totals.eff > 0 ? machineWiseMonthlyData.totals.eff.toFixed(1) : '—'}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : activeSubTab === ('allocation' as any) ? (
        /* SIDER ALLOCATION REGISTER / REPORT (FOR CROSS CHECKING) */
        <div className="space-y-8 animate-in fade-in duration-300">
          <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm no-print">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* From Date */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                  onChange={e => setFromDate(e.target.value)}
                  className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-sm cursor-pointer"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                  onChange={e => setToDate(e.target.value)}
                  className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-sm cursor-pointer"
                />
              </div>

              {/* Search input to filter the allocations in both registers */}
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">Search Allocation Register</label>
                <div className="relative">
                  <input
                    type="text"
                    value={allocationSearch}
                    onChange={e => setAllocationSearch(e.target.value)}
                    placeholder="Search name, ticket number, machine category..."
                    className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl pl-10 pr-4 py-3 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-sm"
                  />
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400">
                    <Search size={16} />
                  </div>
                  {allocationSearch && (
                    <button
                      onClick={() => setAllocationSearch('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 cursor-pointer text-xs uppercase font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                onClick={handleExportToExcel}
                className="flex items-center gap-3 bg-emerald-800 hover:bg-emerald-700 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-emerald-100 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Download size={16} /> Export Excel
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-3 bg-stone-900 hover:bg-stone-800 text-white px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-xl shadow-stone-200 active:scale-95 whitespace-nowrap cursor-pointer"
              >
                <Printer size={16} /> Print Register
              </button>
            </div>
          </div>

          <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative overflow-hidden space-y-10">
            {/* Header for printing */}
            <div className="text-center pb-6 border-b-4 border-stone-950/15">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 block mb-1">Cross-Reference supporting statement</span>
              <h1 className="text-3xl font-black text-stone-900 uppercase tracking-tight font-sans">Sider Duty &amp; Machine Allocation Register</h1>
              <div className="mt-3 text-[11px] font-bold text-stone-500 uppercase tracking-wider font-mono">
                Cross-Checking Dates: <span className="text-stone-950 font-black text-sm font-sans">
                  {fromDate ? fDateStr(fromDate) : '—'} to {toDate ? fDateStr(toDate) : '—'}
                </span>
              </div>
            </div>

            {/* TWO MAIN SECTIONS ARRANGED AS DISTINCT printable lists */}
            <div className="flex flex-col gap-14">
              
              {/* SECTION 1: RINGFRAME ALLOCATION LIST (Width constrained on screen, expanded for full scope) */}
              <div className="space-y-6">
                <div className="text-center pb-2">
                  <h2 className="text-2xl font-black text-stone-900 tracking-tight font-sans uppercase">Ringframe Allocation List</h2>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest font-mono">Standard Operator &amp; Gaiter Schedule</p>
                </div>

                {allocationReportData.ringframeRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-stone-400 shadow-sm max-h-[800px] overflow-y-auto pr-1 scrollbar-thin">
                    <table className="w-full text-center border-collapse">
                      <thead>
                        <tr className="bg-stone-100 text-stone-900 text-[10px] sm:text-xs font-extrabold uppercase font-sans tracking-wide">
                          <th rowSpan={2} className="border border-stone-400 px-3 py-2 text-center min-w-[100px] font-black">Date</th>
                          <th rowSpan={2} className="border border-stone-400 px-2 py-2 text-center w-12 font-black">Shift</th>
                          <th colSpan={Math.max(1, (allocationReportData.frameHeaders || []).length)} className="border border-stone-400 px-3 py-2 text-center bg-stone-200/50 font-black">Sider Name</th>
                          <th rowSpan={2} className="border border-stone-400 px-2 py-2 text-center min-w-[110px] font-black">Gaiter</th>
                          <th rowSpan={2} className="border border-stone-400 px-2 py-2 text-center min-w-[110px] font-black">Gaiter</th>
                          <th rowSpan={2} className="border border-stone-400 px-2 py-2 text-center w-16 font-black bg-stone-50/50">Total</th>
                        </tr>
                        <tr className="bg-stone-50 text-stone-700 text-[9px] sm:text-xs font-bold uppercase font-sans tracking-wide">
                          {(allocationReportData.frameHeaders && allocationReportData.frameHeaders.length > 0) ? (
                            allocationReportData.frameHeaders.map(frame => (
                              <th key={frame} className="border border-stone-400 px-2 py-1 min-w-[70px]">{frame}</th>
                            ))
                          ) : (
                            <th className="border border-stone-400 px-2 py-1 w-24">-</th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {allocationReportData.ringframeRows.map((row, idx) => {
                          const showDate = idx === 0 || row.date !== allocationReportData.ringframeRows[idx - 1].date;
                          return (
                            <tr key={idx} className="hover:bg-stone-50/55 transition-colors text-[10px] sm:text-xs h-10">
                              <td className="border border-stone-400 px-3 py-1.5 font-bold font-mono text-stone-900 text-center whitespace-nowrap bg-stone-50/20">
                                {showDate ? row.date : ''}
                              </td>
                              <td className="border border-stone-400 px-2 py-1.5 text-center font-black bg-stone-50/20">
                                {row.shiftLabel}
                              </td>
                              {(allocationReportData.frameHeaders && allocationReportData.frameHeaders.length > 0) ? (
                                allocationReportData.frameHeaders.map(frame => (
                                  <td key={frame} className="border border-stone-400 px-2 py-1.5 font-semibold text-stone-950 uppercase">
                                    {row.ringframes[frame] || ''}
                                  </td>
                                ))
                              ) : (
                                <td className="border border-stone-400 px-2 py-1.5 font-semibold text-stone-950 uppercase">-</td>
                              )}
                              <td className="border border-stone-400 px-2 py-1.5 font-semibold text-stone-950 uppercase">
                                {row.gaiter1 || ''}
                              </td>
                              <td className="border border-stone-400 px-2 py-1.5 font-semibold text-stone-950 uppercase">
                                {row.gaiter2 || ''}
                              </td>
                              <td className="border border-stone-400 px-2 py-1.5 font-black text-stone-950 font-mono bg-stone-100/40">
                                {row.total > 0 ? row.total : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-400">
                    No matching standard siders allocations found
                  </div>
                )}
              </div>

              {/* SECTION 2: AI CONE ALLOCATION LIST (Compact vertical alignment, page-break friendly) */}
              <div className="space-y-6 pt-6 border-t border-stone-200/50 max-w-4xl mx-auto w-full">
                <div className="text-center pb-2">
                  <h2 className="text-2xl font-black text-stone-900 tracking-tight font-sans uppercase">AI Cone Allocation List</h2>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest font-mono">Linkconer Line Assignment Registry</p>
                </div>

                {allocationReportData.aiConeRows.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-stone-400 shadow-sm min-h-[500px] max-h-[1000px] overflow-y-auto pr-1 scrollbar-thin">
                    <table className="w-full text-center border-collapse">
                      <thead>
                        <tr className="bg-stone-100 text-stone-900 text-[10px] sm:text-xs font-extrabold uppercase font-sans tracking-wide">
                          <th rowSpan={2} className="border border-stone-400 px-4 py-2 text-center w-40 font-black">Date</th>
                          <th colSpan={3} className="border border-stone-400 px-3 py-2 text-center font-black bg-stone-200/50">Shift</th>
                        </tr>
                        <tr className="bg-stone-50 text-stone-700 text-[10px] sm:text-xs font-bold uppercase font-sans tracking-wide">
                          <th className="border border-stone-400 px-3 py-2 w-1/3">I</th>
                          <th className="border border-stone-400 px-3 py-2 w-1/3">II</th>
                          <th className="border border-stone-400 px-3 py-2 w-1/3">III</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocationReportData.aiConeRows.map((row, idx) => {
                          return (
                            <tr key={idx} className="hover:bg-stone-50/55 transition-colors text-[10px] sm:text-xs h-12">
                              <td className="border border-stone-400 px-4 py-2.5 font-bold font-mono text-stone-900 text-center whitespace-nowrap bg-stone-50/20">
                                {row.date}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 font-semibold text-stone-950 uppercase text-center">
                                {row.operatorShift1 || ''}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 font-semibold text-stone-950 uppercase text-center">
                                {row.operatorShift2 || ''}
                              </td>
                              <td className="border border-stone-400 px-3 py-2.5 font-semibold text-stone-950 uppercase text-center">
                                {row.operatorShift3 || ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-12 text-center bg-stone-50 rounded-2xl border border-dashed border-stone-200 text-xs font-bold uppercase tracking-wider text-stone-400">
                    No matching AI linkconer allocations found
                  </div>
                )}
              </div>
            </div>

            {/* Footer Summary Aggregate box (print friendly) */}
            <div className="flex flex-col sm:flex-row items-center justify-between p-8 bg-stone-50 rounded-3xl border-2 border-stone-100 relative col-span-2">
              <div className="text-left mb-4 sm:mb-0">
                <span className="text-[9px] font-black tracking-widest text-stone-400 uppercase font-mono">Allocation Audit</span>
                <div className="text-stone-900 font-black uppercase text-lg mt-1 font-sans">Cross-check Duty Totals</div>
                <p className="text-[10px] font-bold text-stone-400 uppercase mt-1 leading-relaxed">
                  Date range contains {allocationReportData.totalRingframeRawCount} shift rows for standard siders/gaiters and {allocationReportData.totalAiConeRawCount} shift rows for AI Cone operator checks.
                </p>
              </div>
              
              <div className="flex gap-6 items-center">
                <div className="bg-white border border-stone-200 px-5 py-3 rounded-xl text-center shadow-sm">
                  <span className="block text-[8px] font-black text-stone-400 uppercase tracking-widest font-mono">Std Allotments</span>
                  <span className="text-xl font-black text-stone-800 font-mono tabular-nums">{allocationReportData.ringframeRows.length}</span>
                </div>
                
                <div className="bg-white border border-stone-200 px-5 py-3 rounded-xl text-center shadow-sm">
                  <span className="block text-[8px] font-black text-stone-400 uppercase tracking-widest font-mono">AI Allotments</span>
                  <span className="text-xl font-black text-stone-800 font-mono tabular-nums">{allocationReportData.aiConeRows.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {activeSubTab === 'duplicates' && (
        <div className="space-y-6">
          {/* Date Range Selection Filter */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm no-print">
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-xl">
              {/* From Date */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">From Date</label>
                <input
                  type="date"
                  value={fromDate}
                  onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                  onChange={e => setFromDate(e.target.value)}
                  className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-sm cursor-pointer"
                />
              </div>

              {/* To Date */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-stone-400 mb-2">To Date</label>
                <input
                  type="date"
                  value={toDate}
                  onClick={(e) => { try { (e.currentTarget as any).showPicker?.(); } catch {} }}
                  onChange={e => setToDate(e.target.value)}
                  className="w-full bg-stone-50 border-2 border-stone-200 rounded-2xl px-4 py-3 text-stone-800 font-bold outline-none focus:border-stone-900 transition-colors text-sm cursor-pointer"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl border-2 border-stone-900/10 p-8 shadow-sm">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
              <div>
                <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight">Duplicate Assignment Audit Ledger</h3>
                <p className="text-[11px] text-stone-400 font-bold uppercase tracking-widest leading-none mt-1.5 no-print">
                  Separate report highlighting double-allocated workers for selected date range
                </p>
                <p className="text-xs font-black text-stone-800 uppercase tracking-wider mt-1.5 hidden print:block">
                  Audit Period: {fromDate ? fromDate.split('-').reverse().join('/') : 'All'} to {toDate ? toDate.split('-').reverse().join('/') : 'All'}
                </p>
                <p className="text-[10px] text-rose-800 font-black uppercase tracking-wider mt-2.5 bg-rose-50 border border-rose-100/50 rounded-lg px-2.5 py-1 w-fit no-print flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Audit Range: {fromDate ? fromDate.split('-').reverse().join('/') : 'All'} - {toDate ? toDate.split('-').reverse().join('/') : 'All'}
                </p>
              </div>
              <div className="flex items-center gap-3 no-print">
                <button
                  onClick={() => {
                    const headers = [["S. NO", "Date", "Ticket No", "Worker Name", "Conflict Details"]];
                    const rows = duplicateAllocations.map((d, i) => [
                      i + 1,
                      d.date,
                      d.tNo,
                      d.workerName,
                      d.allotments.map((det: any) => `Shift ${det.shift}: ${det.detail}`).join(' | ')
                    ]);
                    const wb = XLSX.utils.book_new();
                    const ws = XLSX.utils.aoa_to_sheet([...headers, ...rows]);
                    XLSX.utils.book_append_sheet(wb, ws, "Duplicate Assignments");
                    XLSX.writeFile(wb, `Duplicate_Assignments_Report_${fromDate}_to_${toDate}.xlsx`);
                  }}
                  className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-emerald-800 shadow-sm transition-all cursor-pointer animate-in fade-in"
                >
                  <Download size={14} /> Export Report
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border border-stone-800 shadow-sm transition-all cursor-pointer"
                >
                  <Printer size={14} /> Print Report
                </button>
              </div>
            </div>

            {duplicateAllocations.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border-2 border-stone-900/10">
                <table className="w-full text-center border-collapse">
                  <thead>
                    <tr className="bg-stone-50 border-b border-stone-900/10 h-14">
                      <th className="px-6 text-xs font-black text-stone-500 uppercase tracking-wider text-left w-20">S. NO</th>
                      <th className="px-6 text-xs font-black text-stone-500 uppercase tracking-wider text-left w-36">Date</th>
                      <th className="px-6 text-xs font-black text-stone-500 uppercase tracking-wider text-left w-36">Ticket No</th>
                      <th className="px-6 text-xs font-black text-stone-500 uppercase tracking-wider text-left">Worker Name</th>
                      <th className="px-6 text-xs font-black text-stone-500 uppercase tracking-wider text-left">Duplicate Allocation Details</th>
                      {onEditDate && <th className="px-6 text-xs font-black text-stone-500 uppercase tracking-wider text-center no-print w-36">Action</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {duplicateAllocations.map((dup, idx) => (
                      <tr key={`${dup.date}-${dup.workerId}-${idx}`} className="bg-red-50/40 hover:bg-red-100/40 transition-colors h-14">
                        <td className="px-6 text-xs text-stone-400 font-bold text-left">{idx + 1}</td>
                        <td className="px-6 text-sm font-black text-stone-900 text-left font-mono">{dup.date}</td>
                        <td className="px-6 text-sm font-black text-emerald-800 text-left font-mono">{dup.tNo}</td>
                        <td className="px-6 text-sm font-black text-stone-850 text-left uppercase">{dup.workerName}</td>
                        <td className="px-6 text-xs text-left py-4">
                          <div className="flex flex-wrap gap-2">
                            {dup.allotments.map((detail: any, dIdx: number) => (
                              <span 
                                key={dIdx} 
                                className="px-2.5 py-1 bg-red-100 border border-red-200 text-red-900 rounded-lg font-black text-[10px] uppercase tracking-wide flex items-center gap-1.5"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                                Shift {detail.shift}: {detail.detail}
                              </span>
                            ))}
                          </div>
                        </td>
                        {onEditDate && (
                          <td className="px-6 text-center py-4 no-print">
                            <button
                              onClick={() => onEditDate(dup.date)}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm"
                            >
                              Edit Assignment <ArrowUpRight size={12} className="text-emerald-400" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-16 bg-stone-50 border border-dashed border-stone-200 rounded-2xl">
                <div className="w-12 h-12 bg-emerald-100 border border-emerald-200 text-emerald-700 flex items-center justify-center rounded-full mx-auto mb-3">
                  <Database size={18} />
                </div>
                <h4 className="text-sm font-black text-stone-800 uppercase tracking-wider">Perfect Allocation Database</h4>
                <p className="text-[10px] text-stone-400 font-bold uppercase mt-1">No duplicate worker assignments found for the selected date range!</p>
              </div>
            )}
          </div>
        </div>
      )}
      </div>

      {/* PRINT-ALL OVERLAY (ON-SCREEN INDICATION ONLY) */}
      {isPrintingAll && (
        <div className="print-all-preview-overlay fixed inset-0 bg-stone-900/95 backdrop-blur-md z-[100] flex flex-col items-center justify-center text-white no-print">
          <div className="text-center space-y-6 max-w-lg p-8 bg-stone-950/40 rounded-[2.5rem] border border-white/10 shadow-2xl">
            <div className="w-16 h-16 border-4 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <div className="space-y-3">
              <h2 className="text-2xl font-black uppercase tracking-widest text-amber-400">Preparing Accounts Package</h2>
              <p className="text-stone-300 text-xs font-bold uppercase tracking-wider leading-relaxed">
                Compiling the Monthly Abstract and individual ledger sheets for all {consolidatedAbstract.length} active operators.
              </p>
              <p className="text-amber-500/80 text-[10px] font-black uppercase tracking-widest animate-pulse">
                Print dialog will open automatically. Please select portrait orientation in print options.
              </p>
            </div>
            <button 
              onClick={() => setIsPrintingAll(false)}
              className="px-6 py-2.5 bg-stone-800 hover:bg-stone-700 text-stone-300 hover:text-white rounded-xl text-xs font-black uppercase tracking-wider border border-stone-700 transition-all cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* PRINT-ALL SPECIFIC CONTAINER (ONLY VISIBLE ON PAPER) */}
      {(isPrintingAll || isPrintingAbstract) && (
        <div className="print-all-container hidden print:block text-black bg-white font-sans w-full p-0">
          
          {/* PAGES: KTTM RING FRAME OPERATOR INCENTIVE ABSTRACT */}
          {abstractChunks.map((chunk, chunkIdx) => (
            <div key={`abstract-chunk-${chunkIdx}`} className="print-page-break p-5 border-2 border-black rounded-lg min-h-[238mm] flex flex-col mb-8">
              <div className="text-center pb-2 border-b-2 border-black mb-3">
                <img
                  src="/scm-logo-horizontal.png"
                  alt="SCM Textile Spinners"
                  className="h-9 w-auto max-w-[180px] object-contain mx-auto mb-1.5"
                />
                <h1 className="text-2xl font-black text-black uppercase tracking-tight">KTTM Ring frame Operator Incentive Abstract</h1>
                <div className="mt-1 text-[10px] font-black text-stone-600 uppercase tracking-wider flex justify-between items-center px-4">
                  <span>
                    Month: <span className="text-black font-extrabold text-sm">{monthsList.find(m => m.value === selectedMonth)?.label} {selectedYear}</span>
                  </span>
                  <span className="text-stone-700 font-extrabold">
                    Page {chunkIdx + 1} of {abstractChunks.length}
                  </span>
                </div>
              </div>

              <table className="w-full text-center border-collapse border border-black mb-3">
                <thead>
                  <tr className="bg-stone-100 border-b-2 border-black text-black text-xs font-black uppercase">
                    <th className="border border-black px-3 py-1.5 text-left">S. NO</th>
                    <th className="border border-black px-3 py-1.5 text-left">TNo</th>
                    <th className="border border-black px-3 py-1.5 text-left">Operator / Sider Name</th>
                    <th className="border border-black px-3 py-1.5">Days Worked</th>
                    <th className="border border-black px-3 py-1.5">EM Value</th>
                    <th className="border border-black px-3 py-1.5 text-right font-black">Incentive Payout (INR)</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((row, idx) => {
                    const previousCount = abstractChunks.slice(0, chunkIdx).reduce((sum, c) => sum + c.length, 0);
                    const absoluteIdx = previousCount + idx + 1;
                    return (
                      <tr key={`${row.workerId}-${row.tNo || idx}-${idx}`} className="border-b border-stone-400 text-sm">
                        <td className="border border-black px-3 py-1.5 text-left font-bold">{absoluteIdx}</td>
                        <td className="border border-black px-3 py-1.5 text-left font-mono font-black">{row.tNo || '—'}</td>
                        <td className="border border-black px-3 py-1.5 text-left uppercase font-bold">{row.name}</td>
                        <td className="border border-black px-3 py-1.5 font-bold">{row.workingDays}</td>
                        <td className="border border-black px-3 py-1.5 font-bold">{row.avgEm > 0 ? row.avgEm.toFixed(2) : '—'}</td>
                        <td className="border border-black px-3 py-1.5 text-right font-mono font-black">₹{row.totalIncentive}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Account Summary block and Signatures block are only shown on the very last page of the abstract */}
              {chunkIdx === abstractChunks.length - 1 && (
                <>
                  {/* Account Summary block */}
                  <div className="p-3 border-2 border-black bg-stone-50 rounded-lg flex items-center justify-between mb-3">
                    <div className="text-left">
                      <span className="text-[9px] font-black tracking-widest text-stone-500 uppercase">Accounts Consolidation Total</span>
                      <div className="text-black font-black uppercase text-base mt-0.5">Monthly Payroll Allocation</div>
                      <p className="text-[9px] font-bold text-stone-500 uppercase mt-0.5">
                        Total payout computation of all ({printedAbstract.length}) operators registered in the selected schedule.
                      </p>
                    </div>
                    <div className="flex gap-6 items-center">
                      <div className="text-center">
                        <span className="block text-[8px] font-black text-stone-500 uppercase tracking-widest">Active Operators</span>
                        <span className="text-lg font-black text-black">{printedAbstract.filter(c => c.totalIncentive > 0).length}</span>
                      </div>
                      <div className="bg-black text-white px-4 py-2 rounded text-center">
                        <span className="block text-[8px] font-black text-stone-300 uppercase tracking-widest">Total Payout Release</span>
                        <span className="text-xl font-extrabold font-mono">₹{printedTotalIncentive}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures block at bottom of first page */}
                  <div className="mt-auto pt-2 grid grid-cols-3 gap-6 text-center text-xs font-bold uppercase tracking-wider text-stone-700">
                    <div>
                      <div className="border-t border-black pt-1">AM/AM</div>
                    </div>
                    <div>
                      <div className="border-t border-black pt-1">GM</div>
                    </div>
                    <div>
                      <div className="border-t border-black pt-1">DIRECTOR</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}

          {/* PAGES 2+: INDIVIDUAL OPERATOR LEDGERS */}
          {isPrintingAll && printedAbstract.map((workerRow, idx) => {
            const workerLedger = getWorkerLedgerForMonth(workerRow.workerId, selectedMonth, selectedYear);
            const workerTotal = workerLedger.reduce((sum, item) => sum + item.incentive, 0);
            const emEntries = workerLedger.filter(item => item.em !== undefined && item.em > 0);
            const emAverage = emEntries.length > 0
              ? emEntries.reduce((sum, item) => sum + item.em!, 0) / emEntries.length
              : 0;

            return (
              <div key={`${workerRow.workerId}-${workerRow.tNo || idx}-${idx}`} className="print-page-break p-4 px-5 border-2 border-black rounded-lg min-h-[238mm] flex flex-col justify-between text-black bg-white">
                <div>
                  <div className="text-center pb-1.5 border-b border-black mb-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-stone-500 block mb-0.5">Worker Wise History — Supporting Documents for Payout</span>
                    <h1 className="text-lg md:text-xl font-black text-black uppercase tracking-tight">Sider Incentive Ledger Statement</h1>
                    
                    <div className="mt-1.5 flex justify-center gap-6 text-[13px] font-bold text-stone-600 uppercase tracking-wider">
                      <div>Sider Name: <span className="text-black font-extrabold text-[14px]">{workerRow.name}</span></div>
                      <div>TK. No: <span className="text-black font-extrabold text-[14px]">{workerRow.tNo || '—'}</span></div>
                      <div>Period: <span className="text-black font-extrabold text-[14px]">{monthsList.find(m => m.value === selectedMonth)?.label} {selectedYear}</span></div>
                    </div>
                  </div>

                  <table className="w-full text-center border-collapse border border-black mb-2">
                    <thead>
                      <tr className="bg-stone-50 border-b border-black text-[11.5px] font-black uppercase text-black">
                        <th className="border border-black px-1.5 py-1 text-left">S. NO</th>
                        <th className="border border-black px-1.5 py-1 text-left">Date</th>
                        <th className="border border-black px-1.5 py-1">Shift</th>
                        <th className="border border-black px-1.5 py-1">Alloted RF (MC No)</th>
                        <th className="border border-black px-1.5 py-1">Count</th>
                        <th className="border border-black px-1.5 py-1">Achieved GPS</th>
                        <th className="border border-black px-1.5 py-1">EM</th>
                        <th className="border border-black px-1.5 py-1 text-right">Incentive (Rs)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {workerLedger.map((item, idx) => (
                        <tr key={idx} className="border-b border-stone-300 text-[11px] leading-tight font-bold text-stone-900">
                          <td className="border border-black px-1.5 py-1 text-left font-bold text-stone-600">{idx + 1}</td>
                          <td className="border border-black px-1.5 py-1 text-left font-mono font-bold text-black">{item.date}</td>
                          <td className="border border-black px-1.5 py-1 font-bold text-black">{item.shift}</td>
                          <td className="border border-black px-1.5 py-1 text-black">
                            {item.role === 'GAITER' ? (
                              <span className="text-stone-700 text-[10px] font-bold uppercase tracking-wider">Gaiter Duty</span>
                            ) : (
                              item.frameNo
                            )}
                          </td>
                          <td className="border border-black px-1.5 py-1 text-stone-800 font-medium">{item.count}</td>
                          <td className="border border-black px-1.5 py-1 font-mono text-black">{item.gps}</td>
                          <td className="border border-black px-1.5 py-1 font-mono text-black">{item.em !== undefined && item.em > 0 ? item.em.toFixed(2) : '—'}</td>
                          <td className="border border-black px-1.5 py-1 font-mono font-black text-right">₹{item.incentive}</td>
                        </tr>
                      ))}
                      {workerLedger.length === 0 && (
                        <tr>
                          <td colSpan={8} className="border border-black text-center py-2 text-[11px] text-stone-500 font-bold uppercase tracking-wider">
                            No shift duties found for this period
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div>
                  {/* Individual Summary block */}
                  <div className="p-2 px-3 border border-black bg-stone-50 rounded flex justify-between items-center mb-2">
                    <div className="text-left">
                      <span className="text-[10px] font-black tracking-widest text-stone-500 uppercase">Payout Summary</span>
                      <div className="text-black font-black uppercase text-[13px] mt-0.5">Payable Incentive Record</div>
                      <p className="text-[11.5px] font-semibold text-stone-500 uppercase mt-0.5 leading-normal">
                        Includes {workerLedger.filter(i => i.role === 'OPERATOR').length} Operator shifts &amp; {workerLedger.filter(i => i.role === 'GAITER').length} Gaiter duties.
                      </p>
                    </div>
                    <div className="flex gap-4 items-center">
                      <div className="text-center">
                        <span className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">EM Average</span>
                        <span className="text-[14px] font-black text-black">{emAverage > 0 ? emAverage.toFixed(2) : '—'}</span>
                      </div>
                      <div className="text-center">
                        <span className="block text-[10px] font-black text-stone-500 uppercase tracking-widest">Total Duties</span>
                        <span className="text-[14px] font-black text-black">{workerLedger.length}</span>
                      </div>
                      <div className="border border-black px-2.5 py-1 bg-black text-white text-center rounded">
                        <span className="block text-[10px] font-black text-stone-300 uppercase tracking-widest">Total Amount</span>
                        <span className="text-[16px] font-black font-mono">₹{workerTotal}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signatures block for operator sheet */}
                  <div className="mt-1.5 pt-1.5 border-t border-stone-200 grid grid-cols-2 gap-4 text-center text-[11px] font-bold uppercase tracking-wider text-stone-700">
                    <div>
                      <div className="border-t border-black pt-1">Worker Signature</div>
                    </div>
                    <div>
                      <div className="border-t border-black pt-1">Authorised Signature</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PRINT STYLES */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          /* Reset parent layout limitations to allow multi-page breaking without truncation */
          html, body, #root, 
          #root > div, 
          #root > div > main, 
          #root > div > main > div,
          #root > div > main > div > div {
            overflow: visible !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;
            display: block !important;
            position: static !important;
          }

          body {
            background-color: white !important;
            color: black !important;
          }
          .no-print, button, select, input, nav, aside, header, footer {
            display: none !important;
          }
          .print-page-break {
            page-break-after: always !important;
            break-after: page !important;
            display: flex !important;
            flex-direction: column !important;
            min-height: 238mm !important; /* Allow exact A4 height but expand if content overflows naturally */
            box-sizing: border-box !important;
            background: white !important;
            color: black !important;
          }
          .print-page-break:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
          @page {
            size: A4 portrait !important;
            margin: 12mm 10mm 12mm 10mm !important;
          }
        }
      `}} />
    </div>
  );
};
