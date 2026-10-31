import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { IncentiveRule, ProductionEntry, Sider, DailyReport, Shift } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function parseUniversalDateParts(dateStr: string): { day: number; month: number; year: number } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  const parts = clean.split(/[/.-]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const d = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return { day: d, month: m, year: y };
      }
    } else {
      // DD-MM-YYYY or DD/MM/YYYY
      const d = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      const y = parseInt(parts[2], 10);
      if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return { day: d, month: m, year: y };
      }
    }
  }
  const fallback = new Date(dateStr);
  if (!isNaN(fallback.getTime()) && fallback.getFullYear() > 1990) {
    return {
      day: fallback.getDate(),
      month: fallback.getMonth() + 1,
      year: fallback.getFullYear()
    };
  }
  return null;
}

export function getYesterdayUniversalDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function shiftUniversalDate(dateStr: string, deltaDays: number): string {
  if (!dateStr) return getYesterdayUniversalDate();
  const parts = parseUniversalDateParts(dateStr);
  const d = parts ? new Date(parts.year, parts.month - 1, parts.day) : new Date();
  d.setDate(d.getDate() + deltaDays);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export function normalizeCountName(c: string): string {
  return (c || '').trim().toLowerCase().replace(/[-/\s_]/g, '');
}

export function isCountNameMatching(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizeCountName(a);
  const nb = normalizeCountName(b);
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function parseUniversalDate(dateStr: string): Date {
  const parts = parseUniversalDateParts(dateStr);
  if (parts) {
    return new Date(parts.year, parts.month - 1, parts.day);
  }
  const fallback = new Date(dateStr);
  return isNaN(fallback.getTime()) ? new Date(0) : fallback;
}

export function normalizeToCanonicalDate(dateStr: string): string {
  const parts = parseUniversalDateParts(dateStr);
  if (!parts) return dateStr;
  return `${parts.day.toString().padStart(2, '0')}/${parts.month.toString().padStart(2, '0')}/${parts.year}`;
}

export function parseDDMMYYYY(dateStr: string): Date {
  return parseUniversalDate(dateStr);
}

export function getActiveRule(
  count: string, 
  department: string | undefined, 
  rules: IncentiveRule[], 
  reportDate?: string,
  shed?: string
): IncentiveRule | null {
  const normalize = (c: string) => (c || "").toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");
  const targetCountNorm = normalize(count || "");
  if (!targetCountNorm) return null;

  // Filter rules by shed if specified: prioritize exact shed, fallback to All Sheds
  let candidateRules = rules;
  if (shed && shed !== 'All Sheds') {
    const shedSpecific = rules.filter(r => r.shed === shed);
    if (shedSpecific.length > 0) {
      const hasMatch = shedSpecific.some(r => isCountNameMatching(r.count, count));
      if (hasMatch) {
        candidateRules = shedSpecific;
      }
    }
  }

  // Find all candidate rules matching count and department
  let matchingRules = candidateRules.filter(r => {
    const deptMatch = (r.department || 'Sider') === (department || 'Sider');
    if (!deptMatch) return false;
    return isCountNameMatching(r.count, count) || normalize(r.count) === targetCountNorm;
  });

  // If no exact match, try fuzzy matching
  if (matchingRules.length === 0) {
    const sortedRules = [...candidateRules].sort((a, b) => b.count.length - a.count.length);
    matchingRules = sortedRules.filter(r => {
      const deptMatch = (r.department || 'Sider') === (department || 'Sider');
      if (!deptMatch) return false;

      const rNorm = normalize(r.count);
      if (!rNorm) return false;

      if (targetCountNorm.startsWith(rNorm) || rNorm.startsWith(targetCountNorm)) {
        const shorter = rNorm.length < targetCountNorm.length ? rNorm : targetCountNorm;
        const longer = rNorm.length < targetCountNorm.length ? targetCountNorm : rNorm;
        const nextChar = longer[shorter.length];
        return !nextChar || isNaN(parseInt(nextChar));
      }
      return false;
    });
  }

  if (matchingRules.length === 0) return null;

  // Choose the rule based on reportDate
  if (reportDate) {
    const targetTime = parseDDMMYYYY(reportDate).getTime();
    const eligibleRules = matchingRules.filter(r => {
      if (!r.effectiveDate) return true; // rules without effective date apply as fallback/oldest
      const ruleTime = parseDDMMYYYY(r.effectiveDate).getTime();
      return ruleTime <= targetTime;
    });

    if (eligibleRules.length > 0) {
      eligibleRules.sort((a, b) => {
        if (!a.effectiveDate && !b.effectiveDate) return 0;
        if (!a.effectiveDate) return 1;
        if (!b.effectiveDate) return -1;
        return parseDDMMYYYY(b.effectiveDate).getTime() - parseDDMMYYYY(a.effectiveDate).getTime();
      });
      return eligibleRules[0];
    }
  }

  // If no reportDate, sort by effectiveDate descending to find the newest config
  const sorted = [...matchingRules].sort((a, b) => {
    if (!a.effectiveDate && !b.effectiveDate) return 0;
    if (!a.effectiveDate) return 1;
    if (!b.effectiveDate) return -1;
    return parseDDMMYYYY(b.effectiveDate).getTime() - parseDDMMYYYY(a.effectiveDate).getTime();
  });
  return sorted[0] || null;
}

export function calculateIncentive(entry: ProductionEntry, rules: IncentiveRule[], reportDate?: string, shed?: string): number {
  const effectiveShed = entry.shed || shed;
  const rule = getActiveRule(entry.count, 'Sider', rules, reportDate, effectiveShed);
  if (rule && rule.payouts && rule.payouts.length > 0) {
    const sortedPayouts = [...rule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
    const bestPayout = sortedPayouts.find((p) => entry.gpsActual >= p.gpsThreshold);
    if (bestPayout) return bestPayout.amount;
    return 0;
  }

  if (entry.incentiveAmount !== undefined && entry.incentiveAmount !== null && entry.incentiveAmount > 0) {
    return entry.incentiveAmount;
  }

  return 0;
}

export function resolveWorker(id: string, name: string | undefined, workers: Sider[]): Sider {
  const cleanId = String(id || "").trim();
  const cleanName = String(name || "").trim();

  // 1. Try exact/case-insensitive ID or Ticket No match
  if (cleanId) {
    const normId = cleanId.toUpperCase();
    let w = workers.find(x => (x.id || "").trim().toUpperCase() === normId);
    if (w) return w;

    // 2. Try match by Ticket No case-insensitive
    w = workers.find(x => (x.tNo || "").trim().toUpperCase() === normId);
    if (w) return w;
  }

  // 3. Try matching by Name (case-insensitive)
  if (cleanName) {
    const normName = cleanName.toLowerCase().trim();
    let w = workers.find(x => x.name.trim().toLowerCase() === normName);
    if (w) return w;

    // Substring contains match (fuzzy containment)
    const isValidNameSearch = normName.length >= 3 && 
                              normName !== "n/a" && 
                              normName !== "unknown" && 
                              !/^[-._\s]+$/.test(normName);
    if (isValidNameSearch) {
      w = workers.find(x => {
        const nm1 = x.name.trim().toLowerCase();
        return nm1.includes(normName) || normName.includes(nm1);
      });
      if (w) return w;
    }
  }

  // 4. Try matching cleanId against names or tNos
  if (cleanId) {
    const normId = cleanId.toLowerCase();
    let w = workers.find(x => 
      x.name.trim().toLowerCase() === normId || 
      (x.tNo || "").trim().toLowerCase() === normId
    );
    if (w) return w;

    // Substring contains match for ID on name
    const isValidIdSearch = normId.length >= 3 && 
                            normId !== "n/a" && 
                            normId !== "unknown" && 
                            !/^[-._\s]+$/.test(normId);
    if (isValidIdSearch) {
      w = workers.find(x => {
        const nm1 = x.name.trim().toLowerCase();
        return nm1.includes(normId) || normId.includes(nm1);
      });
      if (w) return w;
    }
  }

  const isIdUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanId);
  const isNameUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanName);

  const fallbackTNo = isIdUUID ? "" : (cleanId || "N/A");
  const fallbackName = isNameUUID ? "Unregistered" : (cleanName || (isIdUUID ? `Worker ${cleanId.slice(0, 4).toUpperCase()}` : cleanId) || "Unknown Worker");

  // Fallback
  return {
    id: cleanId || cleanName || "UNKNOWN",
    name: fallbackName,
    tNo: fallbackTNo,
    department: 'Sider'
  };
}

export function mergeDuplicateWorkers(rawWorkers: Sider[]): Sider[] {
  if (!rawWorkers || !Array.isArray(rawWorkers)) return [];
  const groups = new Map<string, Sider[]>();
  
  rawWorkers.forEach(w => {
    if (!w || !w.name) return;
    const nameKey = w.name.trim().toLowerCase();
    if (!groups.has(nameKey)) {
      groups.set(nameKey, []);
    }
    groups.get(nameKey)!.push(w);
  });

  const mergedList: Sider[] = [];
  groups.forEach((groupWorkers, nameKey) => {
    // Find the best worker in the group to represent the name
    let bestWorker = groupWorkers[0];
    for (const w of groupWorkers) {
      if (w.tNo && w.tNo.length < 15 && !w.tNo.includes('-')) {
        bestWorker = w;
        break; 
      }
    }
    const cleanTNo = groupWorkers.find(w => w.tNo && w.tNo.length < 15 && !w.tNo.includes('-'))?.tNo || bestWorker.tNo;
    mergedList.push({
      ...bestWorker,
      tNo: cleanTNo
    });
  });

  return mergedList;
}

export function compressImage(base64Str: string, maxWidth = 350, maxHeight = 350, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    if (!base64Str || !base64Str.startsWith('data:image')) {
      resolve(base64Str);
      return;
    }
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
      } else {
        if (height > maxHeight) {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Fill canvas background with white to handle transparent PNGs nicely when saving as JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        try {
          const compressed = canvas.toDataURL('image/jpeg', quality);
          resolve(compressed);
        } catch {
          resolve(base64Str);
        }
      } else {
        resolve(base64Str);
      }
    };
    img.onerror = () => {
      resolve(base64Str);
    };
  });
}

export interface AllotmentDetail {
  shift: string;
  role: string;
  detail: string;
}

export interface DuplicateAllocation {
  date: string;
  workerId: string;
  workerName: string;
  tNo: string;
  allotments: AllotmentDetail[];
}

export function findDuplicatesInReport(report: DailyReport, workers: Sider[]): DuplicateAllocation[] {
  if (!report) return [];
  const allocationsMap = new Map<string, AllotmentDetail[]>();

  // 1. Operators assigned to machines
  if (report.entries) {
    report.entries.forEach(entry => {
      const assignedIds = new Set<string>();
      if (entry.siderId) assignedIds.add(entry.siderId);
      if (entry.siderIds) {
        entry.siderIds.forEach(id => { if (id) assignedIds.add(id); });
      }

      assignedIds.forEach(id => {
        const worker = resolveWorker(id, entry.siderName, workers);
        const key = worker.id || id;
        const normalizedKey = String(key).trim().toUpperCase();
        if (!key || 
            normalizedKey === "" || 
            normalizedKey === "-" || 
            normalizedKey === "--" || 
            normalizedKey === "UNKNOWN" || 
            normalizedKey === "N/A" || 
            normalizedKey === "UNREGISTERED" || 
            normalizedKey === "NO SIDER" || 
            normalizedKey === "PRIMARY" ||
            normalizedKey === "UNASSIGNED"
        ) return;

        const current = allocationsMap.get(key) || [];
        current.push({
          shift: entry.shift,
          role: 'OPERATOR',
          detail: `Frame ${entry.frameNo}`
        });
        allocationsMap.set(key, current);
      });
    });
  }

  // 2. Gaiters
  if (report.gaiters) {
    (Object.keys(report.gaiters) as ('I' | 'II' | 'III')[]).forEach(shift => {
      const ids = report.gaiters?.[shift] || [];
      ids.forEach(id => {
        const worker = resolveWorker(id, undefined, workers);
        const key = worker.id || id;
        const normalizedKey = String(key).trim().toUpperCase();
        if (!key || 
            normalizedKey === "" || 
            normalizedKey === "-" || 
            normalizedKey === "--" || 
            normalizedKey === "UNKNOWN" || 
            normalizedKey === "N/A" || 
            normalizedKey === "UNREGISTERED" || 
            normalizedKey === "NO SIDER" || 
            normalizedKey === "PRIMARY" ||
            normalizedKey === "UNASSIGNED"
        ) return;

        const current = allocationsMap.get(key) || [];
        current.push({
          shift,
          role: 'GAITER',
          detail: 'Gaiter Duty'
        });
        allocationsMap.set(key, current);
      });
    });
  }

  // 3. AI Cones
  if (report.aiCones) {
    (Object.keys(report.aiCones) as ('I' | 'II' | 'III')[]).forEach(shift => {
      const ids = report.aiCones?.[shift] || [];
      ids.forEach(id => {
        const worker = resolveWorker(id, undefined, workers);
        const key = worker.id || id;
        const normalizedKey = String(key).trim().toUpperCase();
        if (!key || 
            normalizedKey === "" || 
            normalizedKey === "-" || 
            normalizedKey === "--" || 
            normalizedKey === "UNKNOWN" || 
            normalizedKey === "N/A" || 
            normalizedKey === "UNREGISTERED" || 
            normalizedKey === "NO SIDER" || 
            normalizedKey === "PRIMARY" ||
            normalizedKey === "UNASSIGNED"
        ) return;

        const current = allocationsMap.get(key) || [];
        current.push({
          shift,
          role: 'AI LINKCONER',
          detail: 'AI Linkconer Duty'
        });
        allocationsMap.set(key, current);
      });
    });
  }

  const duplicates: DuplicateAllocation[] = [];
  allocationsMap.forEach((allotments, workerId) => {
    if (allotments.length > 1) {
      // An operator can be allocated to up to 2 machines (both sides or single side) in the SAME shift
      const shifts = new Set(allotments.map(a => a.shift));
      const roles = new Set(allotments.map(a => a.role));
      const operatorFrames = new Set(
        allotments.filter(a => a.role === 'OPERATOR').map(a => a.detail)
      );

      const isValidDoubleAllocation = 
        shifts.size === 1 && 
        roles.size === 1 && 
        roles.has('OPERATOR') && 
        operatorFrames.size <= 2;

      if (!isValidDoubleAllocation) {
        const worker = resolveWorker(workerId, undefined, workers);
        duplicates.push({
          date: report.date,
          workerId,
          workerName: worker.name,
          tNo: worker.tNo,
          allotments
        });
      }
    }
  });

  return duplicates;
}

export function isDateOnOrAfter01_07_2026(dateStr?: string): boolean {
  if (!dateStr) return false;
  const date = parseDDMMYYYY(dateStr);
  if (!date || isNaN(date.getTime())) return false;
  
  // Date 01/07/2026 (Month is 0-indexed, so 6 is July)
  const targetDate = new Date(2026, 6, 1);
  return date.getTime() >= targetDate.getTime();
}

export function getGaiterIncentive(report: DailyReport, shift: Shift, rules: IncentiveRule[], workers: Sider[]): number {
  if (!report || !report.entries) return 0;

  const shiftEntries = report.entries.filter(e => e.shift === shift);
  if (shiftEntries.length === 0) return 0;

  const isOnOrAfterNewRule = isDateOnOrAfter01_07_2026(report.date);

  if (isOnOrAfterNewRule) {
    const incentives: number[] = [];

    shiftEntries.forEach(entry => {
      const numSlots = entry.siderIds?.length || 1;
      const baseIncentive = calculateIncentive(entry, rules, report.date);

      let hasWorker = false;
      for (let slotIdx = 0; slotIdx < numSlots; slotIdx++) {
        const workerId = entry.siderIds?.[slotIdx] || (slotIdx === 0 ? entry.siderId : '');
        const cleanId = String(workerId || "").trim().toUpperCase();
        if (workerId && 
            cleanId !== "" && 
            cleanId !== "-" && 
            cleanId !== "--" && 
            cleanId !== "UNKNOWN" && 
            cleanId !== "N/A" && 
            cleanId !== "UNREGISTERED" && 
            cleanId !== "NO SIDER" && 
            cleanId !== "PRIMARY" &&
            cleanId !== "UNASSIGNED"
        ) {
          hasWorker = true;
          break;
        }
      }

      if (hasWorker && baseIncentive > 0) {
        incentives.push(baseIncentive);
      }
    });

    if (incentives.length > 0) {
      return Math.min(...incentives);
    }
    return 0;
  } else {
    const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);
    if (!minGpsEntry) return 0;
    
    const fakeEntry: ProductionEntry = {
      ...minGpsEntry,
      frameNo: 'GAITER_CALC'
    } as ProductionEntry;
    return calculateIncentive(fakeEntry, rules, report.date);
  }
}

/**
 * Universal UUID generator that safely runs in all environments,
 * including non-secure HTTP contexts (e.g. LAN access over IP http://192.168.x.x)
 * where modern browsers disable crypto.randomUUID.
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Calculates the exact sider/operator incentive for a specific machine entry and slot,
 * strictly honoring the mill allocation rules:
 * - KTTM shed: NO WORKLOAD RESTRICTION. Standard Incentive Master slab rate applies directly.
 * - Shed 1, Shed 2, Shed 3:
 *   1. One operator works for both sides of one machine: NO INCENTIVE (0%)
 *   2. Worked additional machine left or right side: 25% incentive on the additional machine side
 *   3. Worked both machines both sides: 50% incentive total (25% on LH and 25% on RH of the additional machine)
 */
export function calculateSiderSlotIncentive(
  entry: ProductionEntry,
  slotIdx: number,
  report: DailyReport,
  rules: IncentiveRule[],
  workers: Sider[],
  shed?: string
): number {
  if (!entry || !report || !report.entries) return 0;

  const workerId = entry.siderIds?.[slotIdx] || (slotIdx === 0 ? entry.siderId : '');
  if (!workerId) return 0;

  const cleanWorkerId = String(workerId).trim();
  const upperWorkerId = cleanWorkerId.toUpperCase();
  const invalidMarkers = ['UNASSIGNED', '-', '--', 'NO SIDER', 'NONE', 'N/A', 'NULL', 'UNDEFINED', '0'];
  if (!cleanWorkerId || invalidMarkers.includes(upperWorkerId)) {
    return 0;
  }

  const worker = resolveWorker(workerId, entry.siderName, workers);
  const targetId = (worker.tNo || worker.id || workerId).trim().toUpperCase();
  if (!targetId || invalidMarkers.includes(targetId)) {
    return 0;
  }

  const effectiveShed = entry.shed || report.shed || shed || '';
  const shedLower = effectiveShed.toLowerCase();
  const isKttm = shedLower.includes('kttm') || (entry.frameNo || '').toUpperCase().startsWith('K');

  // Base slab incentive for the current entry from Incentive Master rules
  const baseIncentive = calculateIncentive(entry, rules, report.date, effectiveShed);
  if (baseIncentive <= 0) return 0;

  // RULE EXEMPTION: "this rule is for the 1,2,3 sheds, no rule for kttm"
  if (isKttm) {
    if (!worker || (!worker.id && !worker.tNo && !worker.name)) return 0;
    const numSlots = entry.siderIds?.length || (entry.siderId ? 1 : 2);
    if (numSlots > 1) {
      return Math.round(baseIncentive / numSlots);
    }
    return baseIncentive;
  }

  // FOR SHED 1, 2, 3:
  const targetShift = entry.shift;

  // Find all machine allocations for this worker in this shift
  const workerMachines: {
    frameNo: string;
    entry: ProductionEntry;
    sides: number;
    baseIncentive: number;
    match0: boolean;
    match1: boolean;
  }[] = [];

  report.entries.forEach(e => {
    if (e.shift !== targetShift) return;
    const raw0 = (e.siderIds?.[0] || e.siderId || '').trim();
    const raw1 = (e.siderIds?.[1] || '').trim();

    const is0Invalid = !raw0 || invalidMarkers.includes(raw0.toUpperCase());
    const is1Invalid = !raw1 || invalidMarkers.includes(raw1.toUpperCase());

    const id0 = is0Invalid ? '' : raw0.toUpperCase();
    const id1 = is1Invalid ? '' : raw1.toUpperCase();

    const match0 = Boolean(
      id0 && (
        id0 === targetId ||
        (worker.id && id0 === worker.id.toUpperCase()) ||
        (worker.tNo && id0 === worker.tNo.toUpperCase()) ||
        (worker.name && e.siderName && e.siderName.toLowerCase().trim() === worker.name.toLowerCase().trim())
      )
    );
    const match1 = Boolean(
      id1 && (
        id1 === targetId ||
        (worker.id && id1 === worker.id.toUpperCase()) ||
        (worker.tNo && id1 === worker.tNo.toUpperCase())
      )
    );

    if (match0 || match1) {
      const eBase = calculateIncentive(e, rules, report.date, e.shed || report.shed || effectiveShed);
      workerMachines.push({
        frameNo: e.frameNo,
        entry: e,
        sides: (match0 && match1) ? 2 : 1,
        baseIncentive: eBase,
        match0,
        match1
      });
    }
  });

  const totalSides = workerMachines.reduce((sum, m) => sum + m.sides, 0);
  const distinctMachineCount = workerMachines.length;

  // Rule 1: "one operator works for both side of one machine no incentive"
  // (also if totalSides <= 2, i.e. 1 side or 2 sides -> NO INCENTIVE)
  if (distinctMachineCount <= 1 || totalSides <= 2) {
    return 0;
  }

  // Rule 2: "if worked additional machine left or right side give 25% of incentive"
  // (Worker works both sides on one machine, and 1 side on an additional machine: totalSides === 3)
  if (distinctMachineCount === 2 && totalSides === 3) {
    const additionalMachine = workerMachines.find(m => m.sides === 1);
    // Only the additional machine side earns the 25% incentive!
    if (additionalMachine && entry.frameNo === additionalMachine.frameNo) {
      return Math.round(baseIncentive * 0.25);
    }
    // The base machine (which had 2 sides) has NO incentive (0%)
    return 0;
  }

  // Rule 3: "if worked both machine both sides give then 50% incentive"
  // (Worker works both sides of 2 machines: totalSides >= 4)
  if (distinctMachineCount >= 2 && totalSides >= 4) {
    // Sort by baseIncentive descending so the worker receives the optimal 50% bonus on the earning machine
    const sortedByIncentive = [...workerMachines].sort((a, b) => b.baseIncentive - a.baseIncentive);
    const earningMachine = sortedByIncentive[0];

    if (entry.frameNo === earningMachine.frameNo) {
      // The additional machine gives 50% total: 25% on LH (slot 0) and 25% on RH (slot 1)
      return Math.round(baseIncentive * 0.25);
    }
    // The base machine gives NO incentive (0%)
    return 0;
  }

  return 0;
}
