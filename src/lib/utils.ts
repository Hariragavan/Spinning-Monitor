import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { IncentiveRule, ProductionEntry, Sider, DailyReport, Shift, Shed, MachineEmData, IotMachineAllocationPeriod } from "../types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeShed(val: any, defaultShed: Shed = 'Shed 1'): Shed {
  if (!val) return defaultShed;
  const str = String(val).toLowerCase().trim();
  const cleaned = str.replace(/[\s\-_]/g, '');
  if (cleaned.includes('kttm')) return 'KTTM';
  if (cleaned.includes('shed3') || cleaned.includes('shed03') || cleaned.includes('unit3') || cleaned.includes('shediii') || str === '3' || str.endsWith('3')) return 'Shed 3';
  if (cleaned.includes('shed2') || cleaned.includes('shed02') || cleaned.includes('unit2') || cleaned.includes('shedii') || str === '2' || str.endsWith('2')) return 'Shed 2';
  if (cleaned.includes('shed1') || cleaned.includes('shed01') || cleaned.includes('unit1') || cleaned.includes('shedi') || str === '1' || str.endsWith('1')) return 'Shed 1';
  return defaultShed;
}

export function isSameShed(shedA?: string | null, shedB?: string | null): boolean {
  if (!shedA || !shedB) return false;
  return normalizeShed(shedA) === normalizeShed(shedB);
}

/**
 * Returns the exact mill shed for a machine frame number:
 * - K01-K06 (or containing KT) -> KTTM
 * - SP023 -> Shed 3
 * - SP001 - SP024 (1 to 24) -> Shed 1
 * - SP025 - SP044 (25 to 44) -> Shed 2
 * - SP045 - SP056 (45+) -> Shed 3
 */
export function getMachineShed(frameNo: any, fallbackShed: Shed = 'Shed 1'): Shed {
  if (!frameNo) return fallbackShed;
  const f = String(frameNo).trim().toUpperCase();
  if (f.startsWith('K') || f.includes('KT')) return 'KTTM';
  if (f === 'SP023' || f === '23') return 'Shed 3';
  const numMatch = f.match(/\d+/);
  if (numMatch) {
    const num = parseInt(numMatch[0], 10);
    if (num >= 1 && num <= 24) return 'Shed 1';
    if (num >= 25 && num <= 44) return 'Shed 2';
    if (num >= 45) return 'Shed 3';
  }
  return fallbackShed;
}

export function isWorkerInList(idOrName: string, workers: Sider[]): boolean {
  if (!idOrName) return false;
  const clean = String(idOrName).trim().toLowerCase();
  return workers.some(w => 
    (w.id && w.id.trim().toLowerCase() === clean) ||
    (w.tNo && w.tNo.trim().toLowerCase() === clean) ||
    (w.name && w.name.trim().toLowerCase() === clean)
  );
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

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

export function extractCountNumber(c: string): number | null {
  if (!c || typeof c !== 'string') return null;
  // Match digits followed by '/' (e.g. 040/1 or 40/1)
  const slashMatch = c.match(/0*(\d{2,3})\s*\//);
  if (slashMatch) {
    const num = parseInt(slashMatch[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  // Match digits followed by 's' (e.g. 40s, 60s, 30S)
  const sMatch = c.match(/0*(\d{2,3})\s*s\b/i);
  if (sMatch) {
    const num = parseInt(sMatch[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  // Match 2 or 3 digits
  const generalMatch = c.match(/\b0*(\d{2,3})\b/) || c.match(/0*(\d{2,3})/);
  if (generalMatch) {
    const num = parseInt(generalMatch[1], 10);
    if (!isNaN(num) && num > 0) return num;
  }
  return null;
}

export function isCountNameMatching(a: string, b: string): boolean {
  if (!a || !b) return false;
  const na = normalizeCountName(a);
  const nb = normalizeCountName(b);
  if (na === nb) return true;

  // Exact match or specialized yarn variant check
  if ((na.includes('micro') && !nb.includes('micro')) || (!na.includes('micro') && nb.includes('micro'))) return false;
  if ((na.includes('kttm') && !nb.includes('kttm')) || (!na.includes('kttm') && nb.includes('kttm'))) return false;
  if ((na.includes('phpc') && !nb.includes('phpc')) || (!na.includes('phpc') && nb.includes('phpc'))) return false;
  if ((na.includes('phpv') && !nb.includes('phpv')) || (!na.includes('phpv') && nb.includes('phpv'))) return false;
  if ((na.includes('chny') && !nb.includes('chny')) || (!na.includes('chny') && nb.includes('chny'))) return false;

  if (na.includes(nb) || nb.includes(na)) return true;

  const numA = extractCountNumber(a);
  const numB = extractCountNumber(b);
  if (numA !== null && numB !== null && numA === numB) {
    return true;
  }
  return false;
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

  // Filter rules strictly by shed if specified: prioritize exact shed, fallback to All Sheds only
  let candidateRules = rules;
  if (shed) {
    const activeNorm = normalizeShed(shed);
    candidateRules = rules.filter(r => 
      normalizeShed(r.shed) === activeNorm || r.shed === 'All Sheds'
    );
  }

  // Find all candidate rules matching count and department
  let matchingRules = candidateRules.filter(r => {
    const deptMatch = (r.department || 'Sider') === (department || 'Sider');
    if (!deptMatch) return false;
    return isCountNameMatching(r.count, count) || normalize(r.count) === targetCountNorm;
  });

  // If still no exact or string-contained match, match by yarn count number within candidate rules
  if (matchingRules.length === 0) {
    const targetNum = extractCountNumber(count);
    if (targetNum !== null) {
      matchingRules = candidateRules.filter(r => {
        const deptMatch = (r.department || 'Sider') === (department || 'Sider');
        if (!deptMatch) return false;
        return extractCountNumber(r.count) === targetNum;
      });
    }
  }

  // If still no match, try fuzzy matching within candidate rules
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

  // Return the active rule!
  // When an incentive rule is updated for a count in a shed, it applies dynamically across ALL data.
  // Priority:
  // 1. Exact shed match over 'All Sheds'
  // 2. Freshly edited rules (without effectiveDate) or newest effectiveDate
  const sorted = [...matchingRules].sort((a, b) => {
    if (shed && normalizeShed(a.shed) === normalizeShed(shed) && normalizeShed(b.shed) !== normalizeShed(shed)) return -1;
    if (shed && normalizeShed(b.shed) === normalizeShed(shed) && normalizeShed(a.shed) !== normalizeShed(shed)) return 1;

    // Prefer exact count name match over alias match
    const aExact = normalize(a.count) === targetCountNorm;
    const bExact = normalize(b.count) === targetCountNorm;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;

    if (!a.effectiveDate && b.effectiveDate) return -1;
    if (a.effectiveDate && !b.effectiveDate) return 1;

    if (a.effectiveDate && b.effectiveDate) {
      return parseUniversalDate(b.effectiveDate).getTime() - parseUniversalDate(a.effectiveDate).getTime();
    }
    return 0;
  });

  return sorted[0] || null;
}

export function calculateIncentive(entry: ProductionEntry, rules: IncentiveRule[], reportDate?: string, shed?: string): number {
  const effectiveShed = entry.shed || shed;
  const rule = getActiveRule(entry.count, 'Sider', rules, reportDate, effectiveShed);
  if (rule && rule.payouts && rule.payouts.length > 0) {
    const sortedPayouts = [...rule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
    const actualGps = Math.round(Number(entry.gpsActual || 0));
    const rawGps = Number(entry.gpsActual || 0);
    const bestPayout = sortedPayouts.find((p) => {
      const threshold = p.fromGps !== undefined ? p.fromGps : p.gpsThreshold;
      return actualGps >= threshold || rawGps >= threshold;
    });
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

  // RULE EXEMPTION: "this rule is for the 1,2,3 sheds, no rule for kttm"
  const shedLower = (report.shed || '').toLowerCase();
  const isKttm = shedLower.includes('kttm');
  if (isKttm) {
    return [];
  }

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
      const roles = new Set(allotments.map(a => a.role));

      // Pure support roles (Gaiter or AI Linkconer) supporting shifts are not ringframe double-allocation conflicts
      if (roles.size === 1 && (roles.has('GAITER') || roles.has('AI LINKCONER'))) {
        return;
      }

      // Check for actual conflicts honoring the incentive allocation rules:
      // 1. Cross-role clash in the same shift (e.g. assigned as OPERATOR and GAITER at the same time)
      // 2. Machine allocation limit in any single shift:
      //    Incentive rule allows up to 2 machines (both sides or single side) in a shift.
      //    Assigning more than 2 machines in the same shift is an invalid allocation.
      const shifts: Shift[] = ['I', 'II', 'III'];
      let hasConflict = false;

      shifts.forEach(shift => {
        const shiftAllots = allotments.filter(a => a.shift === shift);
        const shiftRoles = new Set(shiftAllots.map(a => a.role));
        if (shiftRoles.size > 1) {
          hasConflict = true;
        }

        const shiftFrames = new Set(
          shiftAllots.filter(a => a.role === 'OPERATOR').map(a => a.detail)
        );
        if (shiftFrames.size > 2) {
          hasConflict = true;
        }
      });

      if (hasConflict) {
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

export function getGaiterIncentive(
  report: DailyReport,
  shift: Shift,
  rules: IncentiveRule[],
  workers: Sider[],
  gaiterId?: string,
  shed?: string
): number {
  if (!report || !report.entries) return 0;

  const effectiveShed = report.shed || shed || '';
  const shedLower = effectiveShed.toLowerCase();
  const isKttm = shedLower.includes('kttm');

  const shiftEntries = report.entries.filter(e => {
    if (e.shift !== shift) return false;
    if (effectiveShed && e.shed && normalizeShed(e.shed) !== normalizeShed(effectiveShed)) return false;
    return true;
  });

  if (shiftEntries.length === 0) return 0;

  // KTTM Shed: Regular rules
  if (isKttm) {
    const incentives: number[] = [];
    shiftEntries.forEach(entry => {
      const numSlots = entry.siderIds?.length || 1;
      const baseIncentive = calculateIncentive(entry, rules, report.date, effectiveShed);

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
  }

  // Shed 1, 2, 3:
  // "and for gaiter give him least amount of gps of which machine he assigned for
  // like the 3rd machine gps amount is the lowest so give him that lowest amount to him
  // this whole rule is for each shifts and for 1,2,3 sheds"
  let assignedEntries: ProductionEntry[] = [];

  if (gaiterId) {
    const cleanGaiterId = String(gaiterId).trim();
    const gaiterWorker = resolveWorker(cleanGaiterId, undefined, workers);

    const matchesGaiter = (id?: string, name?: string) => {
      if (!id && !name) return false;
      if (id && cleanGaiterId && id.trim().toLowerCase() === cleanGaiterId.toLowerCase()) return true;
      if (gaiterWorker) {
        if (id && gaiterWorker.id && id.trim().toLowerCase() === gaiterWorker.id.toLowerCase()) return true;
        if (id && gaiterWorker.tNo && id.trim().toLowerCase() === gaiterWorker.tNo.toLowerCase()) return true;
        if (name && gaiterWorker.name && name.trim().toLowerCase() === gaiterWorker.name.toLowerCase()) return true;
      }
      return false;
    };

    assignedEntries = shiftEntries.filter(e => matchesGaiter(e.gaiterId, e.gaiterName));
  }

  // Fallback to all shift machines if no per-machine gaiter allocation was specified
  if (assignedEntries.length === 0) {
    assignedEntries = shiftEntries;
  }

  const machineIncentives: number[] = [];
  assignedEntries.forEach(e => {
    if (e.gpsActual !== undefined && e.gpsActual !== null) {
      const baseIncentive = calculateIncentive(e, rules, report.date, effectiveShed);
      machineIncentives.push(baseIncentive);
    }
  });

  if (machineIncentives.length === 0) return 0;

  const lowest = Math.min(...machineIncentives);
  return lowest > 0 ? lowest : 0;
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
 * strictly honoring the updated mill allocation rules:
 * - KTTM shed:
 *   If worker assigned for 1 side: 50% of machine amount.
 *   If worker assigned for 2 sides: 100% of machine amount (each slot gets 50%).
 *   No 3rd and 4th side in KTTM.
 * - Shed 1, Shed 2, Shed 3:
 *   (sides)(incentive)
 *   (1) -> 0%
 *   (2) -> 0% (one operator assigned to both sides: no incentive)
 *   (3) -> 75% + 25%: 75% from 1st 2-side machine + 25% from 3rd side machine
 *   (4) -> 75% + 50%: 75% from 1st 2-side machine + 50% from 3rd & 4th side machine
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

  const rawSlotWorker = (entry.siderIds && entry.siderIds.length > slotIdx) 
    ? (entry.siderIds[slotIdx] || '') 
    : (slotIdx === 0 ? (entry.siderId || '') : '');
  if (!rawSlotWorker) return 0;

  const cleanWorkerId = String(rawSlotWorker).trim();
  const upperWorkerId = cleanWorkerId.toUpperCase();
  const invalidMarkers = ['UNASSIGNED', '-', '--', 'NO SIDER', 'NONE', 'N/A', 'NULL', 'UNDEFINED', '0'];
  if (!cleanWorkerId || invalidMarkers.includes(upperWorkerId)) {
    return 0;
  }

  const worker = resolveWorker(rawSlotWorker, entry.siderName, workers);
  const targetId = (worker.tNo || worker.id || cleanWorkerId).trim().toUpperCase();
  if (!targetId || invalidMarkers.includes(targetId)) {
    return 0;
  }

  const effectiveShed = entry.shed || report.shed || shed || '';
  const shedLower = effectiveShed.toLowerCase();
  const isKttm = shedLower.includes('kttm') || (entry.frameNo || '').toUpperCase().startsWith('K');

  // Base slab incentive for the current entry from Incentive Master rules based on its GPSS
  const baseIncentive = calculateIncentive(entry, rules, report.date, effectiveShed);
  if (baseIncentive <= 0) return 0;

  // Check matching on THIS entry
  const raw0 = (entry.siderIds && entry.siderIds.length > 0 ? (entry.siderIds[0] || '') : (entry.siderId || '')).trim();
  const raw1 = (entry.siderIds && entry.siderIds.length > 1 ? (entry.siderIds[1] || '') : '').trim();

  const is0Match = Boolean(raw0 && !invalidMarkers.includes(raw0.toUpperCase()) && (() => {
    const w0 = resolveWorker(raw0, entry.siderName, workers);
    return (w0.tNo && worker.tNo && w0.tNo.toUpperCase() === worker.tNo.toUpperCase()) ||
           (w0.id && worker.id && w0.id.toUpperCase() === worker.id.toUpperCase()) ||
           (w0.name && worker.name && w0.name.toLowerCase().trim() === worker.name.toLowerCase().trim());
  })());

  const is1Match = Boolean(raw1 && !invalidMarkers.includes(raw1.toUpperCase()) && (() => {
    const w1 = resolveWorker(raw1, undefined, workers);
    return (w1.tNo && worker.tNo && w1.tNo.toUpperCase() === worker.tNo.toUpperCase()) ||
           (w1.id && worker.id && w1.id.toUpperCase() === worker.id.toUpperCase()) ||
           (w1.name && worker.name && w1.name.toLowerCase().trim() === worker.name.toLowerCase().trim());
  })());

  // Ensure this specific slot matches the worker being evaluated
  if (slotIdx === 0 && !is0Match) return 0;
  if (slotIdx === 1 && !is1Match) return 0;

  // Determine whether worker worked slot 0, slot 1, or both on this machine
  const sidesOnThisMachine = (is0Match && is1Match) ? 2 : (is0Match || is1Match ? 1 : 0);
  if (sidesOnThisMachine === 0) return 0;

  // KTTM RULE: "if worker assigned for 1 side 50% , 2sides 100% no 3rd and 4th side"
  if (isKttm) {
    if (!worker || (!worker.id && !worker.tNo && !worker.name)) return 0;
    if (sidesOnThisMachine === 1) {
      return Math.round(baseIncentive * 0.5);
    }
    return Math.round(baseIncentive / 2);
  }

  // SHED 1, 2, 3 RULE:
  // Find all machine allocations for this worker in this shift
  const targetShift = entry.shift;
  const workerMachines: {
    frameNo: string;
    sides: number;
    baseIncentive: number;
  }[] = [];

  report.entries.forEach(e => {
    if (e.shift !== targetShift) return;
    if (effectiveShed && e.shed && normalizeShed(e.shed) !== normalizeShed(effectiveShed)) return;
    const eRaw0 = (e.siderIds && e.siderIds.length > 0 ? (e.siderIds[0] || '') : (e.siderId || '')).trim();
    const eRaw1 = (e.siderIds && e.siderIds.length > 1 ? (e.siderIds[1] || '') : '').trim();

    const m0 = Boolean(eRaw0 && !invalidMarkers.includes(eRaw0.toUpperCase()) && (() => {
      const w0 = resolveWorker(eRaw0, e.siderName, workers);
      return (w0.tNo && worker.tNo && w0.tNo.toUpperCase() === worker.tNo.toUpperCase()) ||
             (w0.id && worker.id && w0.id.toUpperCase() === worker.id.toUpperCase()) ||
             (w0.name && worker.name && w0.name.toLowerCase().trim() === worker.name.toLowerCase().trim());
    })());

    const m1 = Boolean(eRaw1 && !invalidMarkers.includes(eRaw1.toUpperCase()) && (() => {
      const w1 = resolveWorker(eRaw1, undefined, workers);
      return (w1.tNo && worker.tNo && w1.tNo.toUpperCase() === worker.tNo.toUpperCase()) ||
             (w1.id && worker.id && w1.id.toUpperCase() === worker.id.toUpperCase()) ||
             (w1.name && worker.name && w1.name.toLowerCase().trim() === worker.name.toLowerCase().trim());
    })());

    if (m0 || m1) {
      const eBase = calculateIncentive(e, rules, report.date, e.shed || report.shed || effectiveShed);
      workerMachines.push({
        frameNo: e.frameNo,
        sides: (m0 && m1) ? 2 : 1,
        baseIncentive: eBase
      });
    }
  });

  const totalSidesInShift = workerMachines.reduce((sum, m) => sum + m.sides, 0);

  // If worker is assigned 2 sides or only 1 side (<= 2): normal workload -> NO INCENTIVE (0%)
  // (sides)(incentive)
  // (1)(0)
  // (2)(0)
  if (totalSidesInShift <= 2) {
    return 0;
  }

  // Find 2-sided machines worked by this operator
  const twoSideMachines = workerMachines.filter(m => m.sides === 2);

  if (sidesOnThisMachine === 2) {
    const isFirstTwoSide = twoSideMachines.length > 0 && twoSideMachines[0].frameNo === entry.frameNo;
    if (isFirstTwoSide) {
      // (3) or (4) sides: 75% from 1st 2-side machine (split across 2 slots)
      const totalMachineInc = Math.round(baseIncentive * 0.75);
      return slotIdx === 0 
        ? Math.floor(totalMachineInc / 2) 
        : (totalMachineInc - Math.floor(totalMachineInc / 2));
    } else {
      // (4) sides: 2nd 2-side machine (3rd and 4th sides): 50% from 2nd machine
      const totalMachineInc = Math.round(baseIncentive * 0.5);
      return slotIdx === 0 
        ? Math.floor(totalMachineInc / 2) 
        : (totalMachineInc - Math.floor(totalMachineInc / 2));
    }
  }

  // Operator worked 1 side on this machine:
  // (3) sides: 25% from 3rd side machine
  // (4) sides: 25% each from 3rd and 4th side machines (total 50%)
  if (totalSidesInShift === 3) {
    return Math.round(baseIncentive * 0.25);
  }

  if (totalSidesInShift >= 4) {
    return Math.round(baseIncentive * 0.25);
  }

  return 0;
}

function isValidDevice(dev?: string | null): boolean {
  if (!dev) return false;
  const d = dev.trim().toUpperCase();
  return d !== '' && d !== 'NONE' && d !== 'UNASSIGNED' && d !== 'NULL' && d !== '0';
}

/**
 * Resolves an IoT device assigned to a spinning frame through machine matching.
 * Supports exact match, numeric digits, and all standard prefixes (SP021, 21, SP21, RF03).
 */
export function resolveMappedDevice(
  mapping: Record<string, string> | undefined,
  frameNo: string
): string | undefined {
  if (!mapping || !frameNo) return undefined;
  const clean = frameNo.trim();
  const upper = clean.toUpperCase();

  // 1. Direct match
  if (mapping[clean] && isValidDevice(mapping[clean])) return mapping[clean].trim().toUpperCase();
  if (mapping[upper] && isValidDevice(mapping[upper])) return mapping[upper].trim().toUpperCase();

  // 2. Numeric / prefix variants
  const digits = upper.match(/\d+/);
  if (digits) {
    const rawNum = digits[0];
    const num = String(parseInt(rawNum, 10));
    const p2 = rawNum.padStart(2, '0');
    const p3 = rawNum.padStart(3, '0');
    const numVariants = [
      rawNum,
      num,
      p2,
      p3,
      `SP${p3}`,
      `SP${p2}`,
      `SP${num}`,
      `RF${p2}`,
      `RF${num}`,
      `K${p2}`,
      `K${num}`
    ];
    for (const v of numVariants) {
      if (mapping[v] && isValidDevice(mapping[v])) {
        return mapping[v].trim().toUpperCase();
      }
    }

    // 3. Match keys in mapping whose digits match
    const intTarget = parseInt(rawNum, 10);
    for (const [key, dev] of Object.entries(mapping)) {
      if (!isValidDevice(dev)) continue;
      const keyDigits = key.toUpperCase().match(/\d+/);
      if (keyDigits && parseInt(keyDigits[0], 10) === intTarget) {
        return dev.trim().toUpperCase();
      }
    }
  }

  return undefined;
}

/**
 * Resolves the physical spinning frame mapped to an IoT device.
 */
export function resolveMappedFrame(
  mapping: Record<string, string> | undefined,
  deviceNo: string
): string | undefined {
  if (!mapping || !deviceNo) return undefined;
  const clean = deviceNo.trim();
  const upper = clean.toUpperCase();

  for (const [frame, dev] of Object.entries(mapping)) {
    if (!isValidDevice(dev)) continue;
    const cleanDev = dev.trim().toUpperCase();
    if (cleanDev === upper) return frame;
    const devDigits = cleanDev.match(/\d+/);
    const upperDigits = upper.match(/\d+/);
    if (devDigits && upperDigits && parseInt(devDigits[0], 10) === parseInt(upperDigits[0], 10)) {
      return frame;
    }
  }
  return undefined;
}

/**
 * Universal lookup for Machine EM values.
 * Resolves regardless of date format (DD/MM/YYYY vs YYYY-MM-DD),
 * frame variants (SP021 vs 21 vs RF21), or shift format (I vs 1 vs "1").
 */
export function getMachineEmValue(
  machineEmData: MachineEmData | undefined,
  date: string,
  frameNo: string,
  shift: Shift | string | number,
  mapping?: Record<string, string>
): number | undefined {
  if (!machineEmData || !date || !frameNo) return undefined;

  // 1. Normalize shift to '1', '2', '3'
  let sKey = '1';
  const shiftStr = String(shift).trim().toUpperCase();
  if (shiftStr === 'I' || shiftStr === '1' || shiftStr.includes('1')) sKey = '1';
  else if (shiftStr === 'II' || shiftStr === '2' || shiftStr.includes('2')) sKey = '2';
  else if (shiftStr === 'III' || shiftStr === '3' || shiftStr.includes('3')) sKey = '3';

  // 2. Date candidates: exact, canonical (DD/MM/YYYY), ISO (YYYY-MM-DD), d/m/yyyy, etc.
  const canonical = normalizeToCanonicalDate(date);
  const parts = parseUniversalDateParts(date);
  const dateCandidates = new Set<string>([date, canonical]);
  if (parts) {
    const iso = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const ddmmyyyy = `${String(parts.day).padStart(2, '0')}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
    const dmmyyyy = `${parts.day}/${parts.month}/${parts.year}`;
    const d_mm_yyyy = `${parts.day}/${String(parts.month).padStart(2, '0')}/${parts.year}`;
    dateCandidates.add(iso);
    dateCandidates.add(ddmmyyyy);
    dateCandidates.add(dmmyyyy);
    dateCandidates.add(d_mm_yyyy);
  }

  // 3. Frame candidates: exact, trimmed, digits, padded, and registered device mappings
  const cleanFrame = frameNo.trim();
  const upperFrame = cleanFrame.toUpperCase();
  const digits = upperFrame.match(/\d+/);
  const frameCandidates = new Set<string>([frameNo, cleanFrame, upperFrame]);

  if (digits) {
    const raw = digits[0];
    const num = String(parseInt(raw, 10));
    const p2 = raw.padStart(2, '0');
    const p3 = raw.padStart(3, '0');
    frameCandidates.add(raw);
    frameCandidates.add(num);
    frameCandidates.add(p2);
    frameCandidates.add(p3);
    frameCandidates.add(`SP${p3}`);
    frameCandidates.add(`SP${p2}`);
    frameCandidates.add(`SP${num}`);
    frameCandidates.add(`K${p2}`);
    frameCandidates.add(`K${num}`);
    // If caller explicitly queried an RF device (e.g. RF03), include RF candidates
    if (upperFrame.startsWith('RF')) {
      frameCandidates.add(`RF${p2}`);
      frameCandidates.add(`RF${num}`);
    }
  }

  // If a mapping is provided, also check the registered device or mapped spinning frame
  if (mapping && Object.keys(mapping).length > 0) {
    // 3a. Forward mapping: frame -> device (e.g. SP021 -> RF03, 21 -> RF03)
    const mappedDevice = resolveMappedDevice(mapping, frameNo);
    if (mappedDevice) {
      frameCandidates.add(mappedDevice);
      const devDigits = mappedDevice.match(/\d+/);
      if (devDigits) {
        frameCandidates.add(`RF${devDigits[0].padStart(2, '0')}`);
        frameCandidates.add(String(parseInt(devDigits[0], 10)));
      }
    }

    // 3b. Inverse mapping: device -> frame (e.g. RF03 -> SP021)
    const mappedFrame = resolveMappedFrame(mapping, frameNo);
    if (mappedFrame) {
      frameCandidates.add(mappedFrame);
      frameCandidates.add(mappedFrame.trim().toUpperCase());
    }
  }

  for (const d of dateCandidates) {
    const dateObj = machineEmData[d];
    if (!dateObj) continue;
    for (const f of frameCandidates) {
      const fObj = dateObj[f];
      if (fObj) {
        const val = fObj[sKey] ?? (fObj as any)[Number(sKey)];
        if (val !== undefined && val !== null) {
          const numVal = Number(val);
          if (!isNaN(numVal)) return numVal;
        }
      }
    }
  }

  return undefined;
}

/**
 * Resolves the active machine-to-IoT mapping for a specific date using date-range periods,
 * with fallbacks to date-keyed mappings and current settings.
 */
export function resolveEffectiveMappingForDate(
  targetDate: string,
  periods: IotMachineAllocationPeriod[] = [],
  fallbackByDate: Record<string, Record<string, string>> = {},
  fallbackCurrent: Record<string, string> = {}
): Record<string, string> {
  if (!targetDate) return fallbackCurrent || {};

  const parts = parseUniversalDateParts(targetDate);
  const targetIso = parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : targetDate.slice(0, 10);
  const targetCanonical = normalizeToCanonicalDate(targetDate);

  // 1. Check exact date-keyed mappings first (explicit assignment for that exact day takes precedence!)
  if (fallbackByDate) {
    if (fallbackByDate[targetDate] !== undefined) return fallbackByDate[targetDate] || {};
    if (fallbackByDate[targetCanonical] !== undefined) return fallbackByDate[targetCanonical] || {};
    if (fallbackByDate[targetIso] !== undefined) return fallbackByDate[targetIso] || {};
  }

  // 2. Check allocation periods (date-to-date validity ranges)
  if (periods && periods.length > 0) {
    const sorted = [...periods].sort((a, b) => b.fromDate.localeCompare(a.fromDate));
    for (const p of sorted) {
      const pFrom = p.fromDate;
      const pTo = p.toDate;
      if (targetIso >= pFrom && (!pTo || targetIso <= pTo)) {
        return p.mappings || {};
      }
    }
    // If target is newer than all periods, use latest
    if (sorted[0] && targetIso >= sorted[0].fromDate) {
      return sorted[0].mappings || {};
    }
  }

  // 3. Fallback: Carry-forward from most recent prior date mapping in fallbackByDate
  if (fallbackByDate) {
    const priorDates = Object.keys(fallbackByDate).filter(d => {
      const dp = parseUniversalDateParts(d);
      const diso = dp ? `${dp.year}-${String(dp.month).padStart(2, '0')}-${String(dp.day).padStart(2, '0')}` : d;
      return diso <= targetIso;
    }).sort().reverse();
    if (priorDates.length > 0 && fallbackByDate[priorDates[0]]) {
      return fallbackByDate[priorDates[0]] || {};
    }
  }

  return fallbackCurrent || {};
}

/**
 * Helper to get the previous calendar day in YYYY-MM-DD format.
 */
export function getPreviousDayIso(isoDate: string): string {
  if (!isoDate) return isoDate;
  const parts = parseUniversalDateParts(isoDate);
  const target = parts
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    : new Date(isoDate);
  target.setUTCDate(target.getUTCDate() - 1);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Helper to get the next calendar day in YYYY-MM-DD format.
 */
export function getNextDayIso(isoDate: string): string {
  if (!isoDate) return isoDate;
  const parts = parseUniversalDateParts(isoDate);
  const target = parts
    ? new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
    : new Date(isoDate);
  target.setUTCDate(target.getUTCDate() + 1);
  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(target.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Updates or creates allocation period rows in the settings table.
 * Preserves date-to-date validity ranges:
 * - If targetDate is ongoing (>= active fromDate):
 *   Closes previous period with toDate = previousDay(targetDate).
 *   Creates new period starting at targetDate with toDate = null.
 * - If targetDate === existing active period's fromDate:
 *   Updates the active period's mappings in place.
 * - If targetDate is historical (< active fromDate):
 *   Updates or inserts a period strictly for targetDate without overwriting any surrounding days.
 * - If no periods exist:
 *   Creates initial period starting from targetDate (or start of month) to null.
 */
export function calculateUpdatedAllocationPeriods(
  existingPeriods: IotMachineAllocationPeriod[] = [],
  newMappings: Record<string, string>,
  targetDate: string,
  shed?: string
): IotMachineAllocationPeriod[] {
  const parts = parseUniversalDateParts(targetDate);
  const targetIso = parts
    ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
    : targetDate.slice(0, 10);
  const now = new Date().toISOString();

  // Clean empty or 'NONE' mappings
  const cleanMappings: Record<string, string> = {};
  for (const [k, v] of Object.entries(newMappings || {})) {
    if (v && v !== 'NONE' && v !== 'None' && v !== 'unassigned') {
      cleanMappings[k.trim()] = v.trim().toUpperCase();
    }
  }

  let periods: IotMachineAllocationPeriod[] = (existingPeriods || []).map(p => ({
    ...p,
    mappings: { ...(p.mappings || {}) }
  }));

  if (periods.length === 0) {
    const monthStart = `${targetIso.slice(0, 7)}-01`;
    const fromDate = targetIso < monthStart ? targetIso : monthStart;
    return [{
      id: `period_${Date.now()}`,
      fromDate,
      toDate: null,
      shed: shed || 'All',
      mappings: cleanMappings,
      createdAt: now,
      updatedAt: now
    }];
  }

  // Sort periods ascending by fromDate
  periods.sort((a, b) => a.fromDate.localeCompare(b.fromDate));

  // Find active ongoing period (toDate === null)
  const activeOngoingIdx = periods.findIndex(p => !p.toDate);

  if (activeOngoingIdx !== -1) {
    const active = periods[activeOngoingIdx];
    if (targetIso === active.fromDate) {
      active.mappings = cleanMappings;
      active.updatedAt = now;
      if (shed && shed !== 'All') active.shed = shed;
      return periods;
    } else if (targetIso > active.fromDate) {
      // Close active period at previous day
      active.toDate = getPreviousDayIso(targetIso);
      active.updatedAt = now;

      // Add new period starting at targetIso
      periods.push({
        id: `period_${Date.now()}`,
        fromDate: targetIso,
        toDate: null,
        shed: shed || 'All',
        mappings: cleanMappings,
        createdAt: now,
        updatedAt: now
      });
      return periods.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    } else {
      // Target is earlier than active fromDate (historical date)
      // Check if targetIso falls within an existing historical period
      const hitIdx = periods.findIndex(p => p.fromDate <= targetIso && p.toDate && targetIso <= p.toDate);
      if (hitIdx !== -1) {
        const hit = periods[hitIdx];
        if (hit.fromDate === targetIso && hit.toDate === targetIso) {
          hit.mappings = cleanMappings;
          hit.updatedAt = now;
        } else if (hit.fromDate === targetIso && hit.toDate && hit.toDate > targetIso) {
          hit.fromDate = getNextDayIso(targetIso);
          hit.updatedAt = now;
          periods.push({
            id: `period_${Date.now()}`,
            fromDate: targetIso,
            toDate: targetIso,
            shed: shed || hit.shed || 'All',
            mappings: cleanMappings,
            createdAt: now,
            updatedAt: now
          });
        } else if (hit.fromDate < targetIso && hit.toDate === targetIso) {
          hit.toDate = getPreviousDayIso(targetIso);
          hit.updatedAt = now;
          periods.push({
            id: `period_${Date.now()}`,
            fromDate: targetIso,
            toDate: targetIso,
            shed: shed || hit.shed || 'All',
            mappings: cleanMappings,
            createdAt: now,
            updatedAt: now
          });
        } else if (hit.fromDate < targetIso && hit.toDate && hit.toDate > targetIso) {
          const origTo = hit.toDate;
          hit.toDate = getPreviousDayIso(targetIso);
          hit.updatedAt = now;
          periods.push({
            id: `period_${Date.now()}_single`,
            fromDate: targetIso,
            toDate: targetIso,
            shed: shed || hit.shed || 'All',
            mappings: cleanMappings,
            createdAt: now,
            updatedAt: now
          });
          periods.push({
            id: `period_${Date.now()}_tail`,
            fromDate: getNextDayIso(targetIso),
            toDate: origTo,
            shed: hit.shed || 'All',
            mappings: { ...(hit.mappings || {}) },
            createdAt: now,
            updatedAt: now
          });
        }
        return periods.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
      }

      // If outside existing historical periods, add standalone single-day period
      periods.push({
        id: `period_${Date.now()}`,
        fromDate: targetIso,
        toDate: targetIso,
        shed: shed || 'All',
        mappings: cleanMappings,
        createdAt: now,
        updatedAt: now
      });
      return periods.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
    }
  }

  // If no ongoing period, add new ongoing period starting at targetIso
  periods.push({
    id: `period_${Date.now()}`,
    fromDate: targetIso,
    toDate: null,
    shed: shed || 'All',
    mappings: cleanMappings,
    createdAt: now,
    updatedAt: now
  });

  return periods.sort((a, b) => a.fromDate.localeCompare(b.fromDate));
}

export interface OperatorShiftEmResult {
  shift: Shift;
  totalSides: number;
  totalEm: number;
  totalGps: number;
  machinesDetail: {
    frameNo: string;
    sides: number;
    machineEm: number;
    assignedEm: number;
    gps: number;
    count?: string;
  }[];
}

/**
 * Calculates the total End Mending (EM) and sides assigned to an operator in a given DailyReport.
 * Supports:
 * - 1 side (half machine): machineEm / 2
 * - 2 sides (1 full machine): machineEm
 * - 3 sides (1 full machine + 1 half machine): machineEm_1 + (machineEm_2 / 2)
 * - 4 sides (2 full machines): machineEm_1 + machineEm_2
 * - Multi-machine side sums
 */
export function computeOperatorShiftEm(
  targetWorker: Sider | string,
  report: DailyReport,
  machineEmData: MachineEmData | undefined,
  workers: Sider[] = [],
  mapping?: Record<string, string>
): OperatorShiftEmResult | null {
  if (!report || !report.entries || report.entries.length === 0) return null;

  // Resolve target worker keys (id, tNo, clean lowercase name)
  let targetId = '';
  let targetTNo = '';
  let targetName = '';

  if (typeof targetWorker === 'string') {
    const clean = targetWorker.trim().toLowerCase();
    const resolved = workers.find(w =>
      (w.id && w.id.toLowerCase() === clean) ||
      (w.tNo && w.tNo.toLowerCase() === clean) ||
      (w.name && w.name.toLowerCase().trim() === clean)
    );
    if (resolved) {
      targetId = resolved.id.toLowerCase();
      targetTNo = (resolved.tNo || '').toLowerCase();
      targetName = resolved.name.toLowerCase().trim();
    } else {
      targetId = clean;
      targetTNo = clean;
    }
  } else if (targetWorker) {
    targetId = (targetWorker.id || '').toLowerCase();
    targetTNo = (targetWorker.tNo || '').toLowerCase();
    targetName = (targetWorker.name || '').toLowerCase().trim();
  }

  const matchesWorker = (idOrName?: string | null): boolean => {
    if (!idOrName) return false;
    const clean = String(idOrName).trim().toLowerCase();
    if (clean === '-' || clean === '--' || clean === 'unassigned' || clean === 'none' || clean === 'null' || clean === '0') return false;
    if (targetId && clean === targetId) return true;
    if (targetTNo && clean === targetTNo) return true;
    if (targetName && clean === targetName) return true;
    return false;
  };

  const isAssignedWorker = (val?: string | null): boolean => {
    if (!val) return false;
    const clean = String(val).trim().toLowerCase();
    return clean !== '' && clean !== '-' && clean !== '--' && clean !== 'unassigned' && clean !== 'none' && clean !== 'null' && clean !== '0';
  };

  const machinesDetail: OperatorShiftEmResult['machinesDetail'] = [];
  let totalSides = 0;
  let totalEm = 0;
  let totalGps = 0;

  report.entries.forEach(entry => {
    const slot0 = entry.siderIds?.[0] || entry.siderId;
    const slot1 = entry.siderIds?.[1];

    const slot0Match = matchesWorker(slot0) || (entry.siderName && matchesWorker(entry.siderName));
    const slot1Match = matchesWorker(slot1);

    if (!slot0Match && !slot1Match) return;

    let sides = 0;
    if (slot0Match && slot1Match) {
      sides = 2;
    } else if (slot0Match) {
      // If slot 1 has another valid assigned worker, this worker ran 1 side only
      const otherInSlot1 = isAssignedWorker(slot1) && !slot1Match;
      sides = otherInSlot1 ? 1 : 2;
    } else if (slot1Match) {
      // If slot 0 has another valid assigned worker, this worker ran 1 side only
      const otherInSlot0 = isAssignedWorker(slot0) && !slot0Match;
      sides = otherInSlot0 ? 1 : 2;
    }

    if (sides <= 0) return;

    const frame = entry.frameNo || (entry as any).machineId || '';
    const shift = entry.shift || (report as any).shift || 'I';
    let machineEm = getMachineEmValue(machineEmData, report.date, frame, shift, mapping);
    if (machineEm === undefined) {
      machineEm = entry.doffEmt ?? 0;
    }

    // Full machine EM represents 2 sides.
    // 1 side = machineEm / 2
    // 2 sides = machineEm
    const assignedEm = sides === 2 ? machineEm : Number(((machineEm / 2) * sides).toFixed(3));
    const gpsPart = Number(((entry.gpsActual || 0) * (sides / 2)).toFixed(3));

    totalSides += sides;
    totalEm += assignedEm;
    totalGps += gpsPart;

    machinesDetail.push({
      frameNo: frame,
      sides,
      machineEm,
      assignedEm,
      gps: entry.gpsActual || 0,
      count: entry.count
    });
  });

  if (totalSides === 0) return null;

  return {
    shift: (report.entries[0]?.shift || (report as any).shift || 'I') as Shift,
    totalSides,
    totalEm: Number(totalEm.toFixed(3)),
    totalGps: Number(totalGps.toFixed(3)),
    machinesDetail
  };
}
