import { DailyReport, Sider, IncentiveRule, Shift } from '../types';
import { calculateIncentive, resolveWorker, getGaiterIncentive, parseUniversalDateParts } from './utils';

export interface FrozenMonthAbstractItem {
  id: string;
  name: string;
  tNo: string;
  amount: number;
  workedDaysCount: number;
  gpsAcc?: number;
  duties?: number;
}

export interface FrozenMonthRecord {
  monthKey: string; // e.g. "2026-07"
  month: number; // 1-12
  year: number; // e.g. 2026
  frozenAt: string; // "03/08/2026, 11:30 AM"
  frozenBy?: string;
  note?: string;
  siderAbstract: FrozenMonthAbstractItem[];
  aiAbstract: FrozenMonthAbstractItem[];
  // Map of date (DD/MM/YYYY) -> workerKey (tNo || id) -> incentive amount
  dailyWorkerIncentives: Record<string, Record<string, number>>;
}

export function getMonthKey(month: number, year: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function computeFrozenMonthRecord(
  month: number,
  year: number,
  history: DailyReport[],
  workers: Sider[],
  rules: IncentiveRule[],
  frozenBy?: string
): FrozenMonthRecord {
  const monthKey = getMonthKey(month, year);
  
  // Filter history for selected month and year
  const filteredHistory = history.filter(report => {
    if (!report || !report.date) return false;
    const parts = parseUniversalDateParts(report.date);
    if (!parts) return false;
    return parts.month === month && parts.year === year;
  });

  // 1. Sider Abstract Calculation
  const siderTotalsMap = new Map<string, {
    id: string;
    name: string;
    tNo: string;
    amount: number;
    workedDays: Set<string>;
    gpsAcc: number;
  }>();

  workers.forEach(w => {
    const key = w.tNo || w.id;
    if (key) {
      siderTotalsMap.set(key, {
        id: w.id,
        name: w.name,
        tNo: w.tNo,
        amount: 0,
        workedDays: new Set<string>(),
        gpsAcc: 0
      });
    }
  });

  const dailyWorkerIncentives: Record<string, Record<string, number>> = {};

  filteredHistory.forEach(report => {
    if (!report) return;
    const dateStr = report.date;
    dailyWorkerIncentives[dateStr] = dailyWorkerIncentives[dateStr] || {};

    const dailyIncentives = new Map<string, { worker: Sider; amount: number; gps: number }>();

    if (report.entries) {
      report.entries.forEach(entry => {
        const assignedIds = new Set<string>();
        if (entry.siderId) assignedIds.add(entry.siderId);
        if (entry.siderIds) {
          entry.siderIds.forEach(id => {
            if (id) assignedIds.add(id);
          });
        }

        const amount = calculateIncentive(entry, rules, report.date);

        assignedIds.forEach(id => {
          const worker = resolveWorker(id, entry.siderName, workers);
          const tNo = worker.tNo || worker.id;
          if (!tNo) return;

          const existing = dailyIncentives.get(tNo) || { worker, amount: 0, gps: 0 };
          existing.amount += amount;
          existing.gps += entry.gpsActual;
          dailyIncentives.set(tNo, existing);
        });
      });
    }

    // Gaiters
    const shifts: Shift[] = ['I', 'II', 'III'];
    shifts.forEach(shift => {
      const shiftEntries = (report.entries || []).filter(e => e.shift === shift);
      if (shiftEntries.length === 0) return;

      const shiftGaiterIds = report.gaiters?.[shift] || [];
      const incentive = getGaiterIncentive(report, shift, rules, workers);
      const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);

      shiftGaiterIds.forEach(gid => {
        const worker = resolveWorker(gid, undefined, workers);
        const tNo = worker.tNo || worker.id;
        if (!tNo) return;

        const existing = dailyIncentives.get(tNo) || { worker, amount: 0, gps: 0 };
        existing.amount += incentive;
        existing.gps += minGpsEntry ? minGpsEntry.gpsActual : 0;
        dailyIncentives.set(tNo, existing);
      });
    });

    // Cap daily at 120 and add to monthly totals
    dailyIncentives.forEach((val, key) => {
      const cappedAmount = Math.min(120, val.amount);
      dailyWorkerIncentives[dateStr][key] = cappedAmount;

      if (siderTotalsMap.has(key)) {
        const curr = siderTotalsMap.get(key)!;
        curr.amount += cappedAmount;
        curr.workedDays.add(report.date);
        curr.gpsAcc += val.gps;
      } else {
        const workedDays = new Set<string>();
        workedDays.add(report.date);
        siderTotalsMap.set(key, {
          id: val.worker.id || key,
          name: val.worker.name || key,
          tNo: val.worker.tNo || key,
          amount: cappedAmount,
          workedDays,
          gpsAcc: val.gps
        });
      }
    });
  });

  const siderAbstract: FrozenMonthAbstractItem[] = Array.from(siderTotalsMap.values())
    .filter(item => item.amount > 0 || item.workedDays.size > 0)
    .map(item => ({
      id: item.id,
      name: item.name,
      tNo: item.tNo,
      amount: item.amount,
      workedDaysCount: item.workedDays.size,
      gpsAcc: item.gpsAcc
    }));

  // 2. AI Linkconer Abstract Calculation
  const aiTotalsMap = new Map<string, {
    id: string;
    name: string;
    tNo: string;
    amount: number;
    duties: number;
    workedDays: Set<string>;
  }>();

  const aiWorkers = workers.filter(w => w.department === 'AI Linkconer');
  aiWorkers.forEach(w => {
    const key = w.tNo || w.id;
    if (key) {
      aiTotalsMap.set(key, {
        id: w.id,
        name: w.name,
        tNo: w.tNo,
        amount: 0,
        duties: 0,
        workedDays: new Set<string>()
      });
    }
  });

  filteredHistory.forEach(report => {
    if (!report) return;

    const shifts: Shift[] = ['I', 'II', 'III'];
    shifts.forEach(shift => {
      const shiftAiConeIds = report.aiCones?.[shift] || [];
      shiftAiConeIds.forEach(id => {
        if (!id) return;
        const targetIdLower = String(id).toLowerCase().trim();
        const worker = workers.find(w =>
          w.id.toLowerCase().trim() === targetIdLower ||
          w.tNo.toLowerCase().trim() === targetIdLower ||
          w.name.toLowerCase().trim() === targetIdLower
        );
        if (!worker) return;

        const tNo = worker.tNo || id;

        const shiftEntries = (report.entries || []).filter(e => e.shift === shift);
        const utilEntries = shiftEntries.filter(e => typeof e.utility === 'number' && !isNaN(e.utility) && e.utility > 0);
        const avgUtility = utilEntries.length > 0
          ? utilEntries.reduce((acc, curr) => acc + curr.utility, 0) / utilEntries.length
          : 0;

        const aiRules = rules.filter(r => r.department === 'AI Linkconer');
        let matchedRule = aiRules.find(r =>
          shiftEntries.some(e => {
            const rNorm = r.count.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
            const eNorm = (e.count || '').toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
            return rNorm && eNorm && (rNorm.startsWith(eNorm) || eNorm.startsWith(rNorm));
          })
        );
        if (!matchedRule) {
          matchedRule = aiRules[0];
        }

        let incentive = 0;
        if (matchedRule) {
          const sortedPayouts = [...matchedRule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
          const bestPayout = sortedPayouts.find(p => Math.round(avgUtility) >= p.gpsThreshold);
          incentive = bestPayout ? bestPayout.amount : 0;
        }

        if (aiTotalsMap.has(tNo)) {
          const current = aiTotalsMap.get(tNo)!;
          current.amount += incentive;
          current.duties += 1;
          current.workedDays.add(report.date);
        } else {
          const workedDays = new Set<string>();
          workedDays.add(report.date);
          aiTotalsMap.set(tNo, {
            id: worker.id || id,
            name: worker.name || id,
            tNo,
            amount: incentive,
            duties: 1,
            workedDays
          });
        }
      });
    });
  });

  const aiAbstract: FrozenMonthAbstractItem[] = Array.from(aiTotalsMap.values())
    .filter(item => item.amount > 0 || item.duties > 0)
    .map(item => ({
      id: item.id,
      name: item.name,
      tNo: item.tNo,
      amount: item.amount,
      workedDaysCount: item.workedDays.size,
      duties: item.duties
    }));

  const nowStr = new Date().toLocaleString('en-IN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return {
    monthKey,
    month,
    year,
    frozenAt: nowStr,
    frozenBy,
    siderAbstract,
    aiAbstract,
    dailyWorkerIncentives
  };
}
