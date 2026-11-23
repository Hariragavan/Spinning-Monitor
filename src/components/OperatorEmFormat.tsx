import React, { useState, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { 
  FileText, 
  Users, 
  Settings, 
  Grid3X3, 
  Download, 
  Upload, 
  Edit, 
  Eye,
  Activity,
  RefreshCw, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  Calendar,
  X,
  Check
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { DailyReport, Sider, IncentiveRule, MachineEmData, SystemSettings, Shift, MachineMasterItem, Shed } from '../types';
import { syncMachineEmFromGoogleSheet } from '../lib/googleSheets';
import { cn, parseUniversalDateParts, parseUniversalDate, normalizeToCanonicalDate, getMachineEmValue, resolveMappedDevice, computeOperatorShiftEm, normalizeShed, resolveEffectiveMappingForDate, getMachineShed } from '../lib/utils';
import { CalendarMonthPicker, CalendarDatePicker } from './CalendarPickers';

// Shift and Date pure helpers declared outside component to ensure zero TDZ or hoist issues
const mapShiftToNum = (shift: Shift | string | number): string => {
  const s = String(shift || '').trim().toUpperCase();
  if (s === 'I' || s === '1' || s.includes('1')) return '1';
  if (s === 'II' || s === '2' || s.includes('2')) return '2';
  if (s === 'III' || s === '3' || s.includes('3')) return '3';
  return '1';
};

const mapNumToShift = (num: string): Shift => {
  if (num === '1') return 'I';
  if (num === '2') return 'II';
  if (num === '3') return 'III';
  return 'I';
};

const dateToInputString = (dStr: string): string => {
  if (!dStr) return '';
  const parts = parseUniversalDateParts(dStr);
  if (!parts) return '';
  const mStr = parts.month.toString().padStart(2, '0');
  const dStr2 = parts.day.toString().padStart(2, '0');
  return `${parts.year}-${mStr}-${dStr2}`;
};

const inputStringToDate = (val: string): string => {
  if (!val) return '';
  const parts = val.split('-');
  if (parts.length !== 3) return '';
  return `${parseInt(parts[2])}/${parseInt(parts[1]).toString().padStart(2, '0')}/${parts[0]}`;
};

const shifts: ('1' | '2' | '3')[] = ['1', '2', '3'];

interface OperatorEmFormatProps {
  history: DailyReport[];
  allHistory?: DailyReport[];
  workers: Sider[];
  allWorkers?: Sider[];
  rules: IncentiveRule[];
  machineEm: MachineEmData;
  onUpdateMachineEm: (newData: MachineEmData, sheetUrl?: string) => Promise<void>;
  settings: SystemSettings;
  isTvMode?: boolean;
  month?: number;
  year?: number;
  tvPageInterval?: number;
  onPagesDetermined?: (pages: number) => void;
  machines?: MachineMasterItem[];
  currentShed?: Shed | string;
  onSelectShed?: (shed: Shed) => void;
}

export const OperatorEmFormat: React.FC<OperatorEmFormatProps> = ({
  history,
  allHistory,
  workers,
  allWorkers,
  rules,
  machineEm,
  onUpdateMachineEm,
  settings,
  isTvMode: appIsTvMode = false,
  month,
  year,
  tvPageInterval,
  onPagesDetermined,
  machines: machinesProp = [],
  currentShed,
  onSelectShed
}) => {
  const safeSettings = settings || ({} as Partial<SystemSettings>);
  const [localTvMode, setLocalTvMode] = useState<boolean>(false);
  const activeTv = appIsTvMode || localTvMode;

  const [activeShedTab, setActiveShedTab] = useState<string>(currentShed || 'Shed 1');

  React.useEffect(() => {
    if (currentShed) {
      setActiveShedTab(currentShed);
    }
  }, [currentShed]);

  const handleShedChange = (s: string) => {
    setActiveShedTab(s);
    if (onSelectShed) {
      onSelectShed(s as Shed);
    }
  };

  // Live EM background refresh state from MongoDB
  const [liveMachineEm, setLiveMachineEm] = useState<MachineEmData | null>(null);
  const effectiveMachineEm = useMemo(() => {
    return liveMachineEm || machineEm || {};
  }, [liveMachineEm, machineEm]);

  // Scope history and workers to the active shed
  const effectiveHistory = useMemo(() => {
    const targetNorm = normalizeShed(activeShedTab || 'Shed 1');
    const source = allHistory && allHistory.length > 0 ? allHistory : (history || []);
    return (source || []).filter(r => !r || !r.shed || normalizeShed(r.shed) === targetNorm);
  }, [allHistory, history, activeShedTab]);

  const effectiveWorkers = useMemo(() => {
    const targetNorm = normalizeShed(activeShedTab || 'Shed 1');
    const source = allWorkers && allWorkers.length > 0 ? allWorkers : (workers || []);
    return (source || []).filter(w => !w || !w.shed || normalizeShed(w.shed) === targetNorm);
  }, [allWorkers, workers, activeShedTab]);

  const [activeSubTab, setActiveSubTab] = useState<'grid' | 'individual' | 'abstract' | 'operator-monthly-em' | 'daily-em-report'>(
    appIsTvMode ? 'operator-monthly-em' : 'grid'
  );

  // Grid / Monthly select state
  const [selectedMonth, setSelectedMonth] = useState<number>(month || new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(year || new Date().getFullYear());

  // Effect to sync select boxes when month or year props change (e.g., from TV rotation settings)
  React.useEffect(() => {
    if (month) {
      setSelectedMonth(month);
    }
  }, [month]);

  React.useEffect(() => {
    if (year) {
      setSelectedYear(year);
    }
  }, [year]);

  // Calendar dates for the selected month and year (01/11/2026, etc)
  const calendarDates = useMemo(() => {
    const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
    const dates: string[] = [];
    const pad = (n: number) => n.toString().padStart(2, '0');
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(`${pad(d)}/${pad(selectedMonth)}/${selectedYear}`);
    }
    return dates;
  }, [selectedMonth, selectedYear]);

  // Available dates in effectiveHistory and effectiveMachineEm belonging strictly to the selected month and year
  const selectedMonthHistoryDates = useMemo(() => {
    const datesSet = new Set<string>();

    (effectiveHistory || []).forEach(r => {
      if (!r || !r.date) return;
      const parts = parseUniversalDateParts(r.date);
      if (parts && parts.month === selectedMonth && parts.year === selectedYear) {
        datesSet.add(normalizeToCanonicalDate(r.date));
      }
    });

    Object.keys(effectiveMachineEm || {}).forEach(dStr => {
      const parts = parseUniversalDateParts(dStr);
      if (parts && parts.month === selectedMonth && parts.year === selectedYear) {
        datesSet.add(normalizeToCanonicalDate(dStr));
      }
    });

    // Ensure today's date is present when viewing current month/year for live telemetry
    const now = new Date();
    if (selectedMonth === (now.getMonth() + 1) && selectedYear === now.getFullYear()) {
      const pad = (n: number) => n.toString().padStart(2, '0');
      datesSet.add(`${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`);
    }

    return Array.from(datesSet).sort((a, b) => {
      return parseUniversalDate(a).getTime() - parseUniversalDate(b).getTime();
    });
  }, [effectiveHistory, effectiveMachineEm, selectedMonth, selectedYear]);

  // Selected date for daily EM report (clamped strictly to selected month)
  const [selectedDailyEmDate, setSelectedDailyEmDate] = useState<string>('');
  const dailyReportRef = useRef<HTMLDivElement>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  // Automatically sync selectedDailyEmDate to latest available date in selected month
  React.useEffect(() => {
    if (selectedMonthHistoryDates.length > 0) {
      setSelectedDailyEmDate(selectedMonthHistoryDates[selectedMonthHistoryDates.length - 1]);
    } else {
      const pad = (n: number) => n.toString().padStart(2, '0');
      setSelectedDailyEmDate(`01/${pad(selectedMonth)}/${selectedYear}`);
    }
  }, [selectedMonth, selectedYear, selectedMonthHistoryDates]);

  // Individual ledger state
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>('');
  
  // Date range for individual view (synced automatically to the selected month)
  const pad = (n: number) => n.toString().padStart(2, '0');
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const [fromDate, setFromDate] = useState<string>(`${selectedYear}-${pad(selectedMonth)}-01`);
  const [toDate, setToDate] = useState<string>(`${selectedYear}-${pad(selectedMonth)}-${pad(daysInMonth)}`);

  React.useEffect(() => {
    const p = (n: number) => n.toString().padStart(2, '0');
    const dCount = new Date(selectedYear, selectedMonth, 0).getDate();
    setFromDate(`${selectedYear}-${p(selectedMonth)}-01`);
    setToDate(`${selectedYear}-${p(selectedMonth)}-${p(dCount)}`);
  }, [selectedMonth, selectedYear]);

  // Registered IoT devices & spinning frame mappings for the selected month
  const registeredInfoForMonth = useMemo(() => {
    const days = new Date(selectedYear, selectedMonth, 0).getDate();
    const p = (n: number) => n.toString().padStart(2, '0');
    const endOfMonthIso = `${selectedYear}-${p(selectedMonth)}-${p(days)}`;

    const frameToDevice: Record<string, string> = {};
    const deviceToFrame: Record<string, string> = {};

    // 1. From iotMachineMappingByDate for any date in this month
    const mappingsByDate = safeSettings?.iotMachineMappingByDate || {};
    for (const [dKey, map] of Object.entries(mappingsByDate)) {
      const parts = parseUniversalDateParts(dKey);
      if (parts && parts.month === selectedMonth && parts.year === selectedYear && map) {
        for (const [frame, device] of Object.entries(map)) {
          if (device && device !== 'NONE' && device !== 'None' && device !== 'unassigned') {
            const cleanDev = device.trim().toUpperCase();
            frameToDevice[frame] = cleanDev;
            deviceToFrame[cleanDev] = frame;
          }
        }
      }
    }

    // 2. Carry-forward from most recent mapping on or before end of this month
    if (Object.keys(mappingsByDate).length > 0) {
      const priorDates = Object.keys(mappingsByDate)
        .filter(d => {
          const dParts = parseUniversalDateParts(d);
          if (!dParts) return false;
          const dIso = `${dParts.year}-${p(dParts.month)}-${p(dParts.day)}`;
          return dIso <= endOfMonthIso;
        })
        .sort()
        .reverse();

      if (priorDates.length > 0 && mappingsByDate[priorDates[0]]) {
        for (const [frame, device] of Object.entries(mappingsByDate[priorDates[0]])) {
          if (device && device !== 'NONE' && device !== 'None' && device !== 'unassigned') {
            const cleanDev = device.trim().toUpperCase();
            if (!frameToDevice[frame]) frameToDevice[frame] = cleanDev;
            if (!deviceToFrame[cleanDev]) deviceToFrame[cleanDev] = frame;
          }
        }
      }
    }

    // 3. Fallback to settings.iotMachineMapping
    const activeMap = safeSettings?.iotMachineMapping || {};
    for (const [frame, device] of Object.entries(activeMap)) {
      if (device && device !== 'NONE' && device !== 'None' && device !== 'unassigned') {
        const cleanDev = device.trim().toUpperCase();
        if (!frameToDevice[frame]) frameToDevice[frame] = cleanDev;
        if (!deviceToFrame[cleanDev]) deviceToFrame[cleanDev] = frame;
      }
    }

    return {
      frameToDevice,
      deviceToFrame,
      registeredFrames: Object.keys(frameToDevice),
      registeredDevices: Object.keys(deviceToFrame)
    };
  }, [safeSettings?.iotMachineMapping, safeSettings?.iotMachineMappingByDate, selectedMonth, selectedYear]);

  // Sync state
  const [sheetUrl, setSheetUrl] = useState<string>('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ success: boolean; message: string; dates?: string[] } | null>(null);

  // Side breakdown details (Left EM, Right EM, Total EM)
  const [liveMachineEmDetails, setLiveMachineEmDetails] = useState<Record<string, Record<string, Record<string, any>>>>({});

  // Active EM Side Details modal state (Left EM, Right EM, Total EM)
  const [activeEmDetail, setActiveEmDetail] = useState<{
    date: string;
    machine: string;
    mappedIot?: string;
    shift: Shift | number | string;
    emTotal: number;
    emLeft?: number;
    emRight?: number;
    breaksLeft?: number;
    breaksRight?: number;
    totalBreaks?: number;
    unit?: string;
    loading?: boolean;
    isMultiMachine?: boolean;
    totalSides?: number;
    combinedAvgEm?: number;
    machines?: {
      frameNo: string;
      sides: number;
      sideLabel: 'LH' | 'RH' | 'LH, RH';
      assignedEm: number;
      gps: number;
      count: string;
      emLeft?: number;
      emRight?: number;
      mappedIot?: string;
    }[];
  } | null>(null);

  // Manual cell edit state
  const [editingCell, setEditingCell] = useState<{
    date: string;
    machine: string;
    shift: string;
    value: string;
  } | null>(null);

  // Search state for operator monthly EM
  const [operatorSearchQuery, setOperatorSearchQuery] = useState('');

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

  // Machines, existingMachinesSet, and isMachineExisted are declared below selectedMonthDates
  // to ensure they accurately filter candidate machines by whether they have data in the selected month.

  // Fast map of: date -> shift -> Set of assigned machines
  const assignedMachinesByDateAndShift = useMemo(() => {
    const map = new Map<string, Map<string, Set<string>>>();

    (effectiveHistory || []).forEach(report => {
      if (!report || !report.date || !Array.isArray(report.entries)) return;
      const canonicalDate = normalizeToCanonicalDate(report.date);
      const isoDate = (() => {
        const parts = parseUniversalDateParts(report.date);
        return parts ? `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}` : report.date;
      })();

      const datesToRecord = [report.date, canonicalDate, isoDate];

      report.entries.forEach(entry => {
        if (!entry) return;
        const rawFrame = entry.frameNo || (entry as any).machineId;
        if (rawFrame === null || rawFrame === undefined) return;
        const frame = String(rawFrame).trim();
        if (!frame) return;

        // Check if an operator is assigned to this machine
        const hasAssignedSider = (
          (Array.isArray(entry.siderIds) && entry.siderIds.some(id => id && String(id).trim() !== '-' && String(id).trim() !== '--' && String(id).toLowerCase().trim() !== 'unassigned' && String(id).toLowerCase().trim() !== 'none' && String(id).trim() !== '0')) ||
          (entry.siderId && String(entry.siderId).trim() !== '-' && String(entry.siderId).trim() !== '--' && String(entry.siderId).toLowerCase().trim() !== 'unassigned' && String(entry.siderId).toLowerCase().trim() !== 'none' && String(entry.siderId).trim() !== '0') ||
          (entry.siderName && String(entry.siderName).toLowerCase().trim() !== 'unassigned' && String(entry.siderName).trim() !== '' && String(entry.siderName).trim() !== '-')
        );

        if (!hasAssignedSider) return;

        const sKey = mapShiftToNum(entry.shift || (report as any).shift || '1');

        datesToRecord.forEach(d => {
          if (!d) return;
          if (!map.has(d)) map.set(d, new Map());
          const shiftMap = map.get(d)!;
          if (!shiftMap.has(sKey)) shiftMap.set(sKey, new Set());
          const frameSet = shiftMap.get(sKey)!;

          const clean = frame.toUpperCase();
          frameSet.add(clean);
          const digits = clean.match(/\d+/);
          if (digits) {
            frameSet.add(digits[0]);
            frameSet.add(String(parseInt(digits[0], 10)));
            frameSet.add(`RF${digits[0].padStart(2, '0')}`);
            frameSet.add(`SP${digits[0].padStart(2, '0')}`);
            frameSet.add(`SP${digits[0].padStart(3, '0')}`);
          }
        });
      });
    });

    return map;
  }, [effectiveHistory]);

  // Check if a machine actually ran and was uploaded in the Daily Report for this date and shift
  const isMachineRunOnShift = useCallback((date: string, shift: string, machine: any): boolean => {
    if (!date || machine === null || machine === undefined) return false;
    const cleanMachine = String(machine).trim().toUpperCase();
    if (!cleanMachine) return false;

    const targetNorm = normalizeShed(activeShedTab || 'Shed 1');
    const canonical = normalizeToCanonicalDate(date);
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const todayCanonical = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
    const isToday = canonical === todayCanonical;

    const dateMapping = resolveEffectiveMappingForDate(
      date,
      safeSettings?.iotMachineAllocationPeriods,
      safeSettings?.iotMachineMappingByDate,
      safeSettings?.iotMachineMapping
    );

    const mappedDev = resolveMappedDevice(dateMapping, cleanMachine);
    const hasMappedDev = !!(mappedDev && mappedDev !== 'NONE' && mappedDev !== 'unassigned');
    const isKttm = cleanMachine.startsWith('K') || targetNorm === 'KTTM';

    // If machine has recorded/live EM telemetry data on this date & shift, it definitely ran!
    // But for KTTM machines: strictly only if explicitly mapped to an IoT device in settings!
    if (!isKttm || hasMappedDev) {
      const emVal = getMachineEmValue(effectiveMachineEm, date, cleanMachine, shift, dateMapping);
      if (emVal !== undefined && emVal !== null) {
        return true;
      }
    }

    // For today: if machine is mapped to an active IoT device, it runs live
    if (isToday && hasMappedDev) {
      return true;
    }

    const report = (effectiveHistory || []).find(r => r && r.date && normalizeToCanonicalDate(r.date) === canonical);
    if (!report || !Array.isArray(report.entries) || report.entries.length === 0) {
      return false; // No report uploaded for this date -> machine did NOT run
    }

    const sKey = mapShiftToNum(shift);
    const mDigits = cleanMachine.match(/\d+/);
    const mNum = mDigits ? parseInt(mDigits[0], 10) : null;

    const isCleanK = cleanMachine.startsWith('K');

    const entry = report.entries.find(e => {
      if (!e) return false;
      const eShift = mapShiftToNum(e.shift || (report as any).shift || '1');
      if (eShift !== sKey) return false;

      // Shed verification: report or entry shed must match active tab if present
      if (report.shed && normalizeShed(report.shed) !== targetNorm) return false;
      if (e.shed && normalizeShed(e.shed) !== targetNorm) return false;

      const rawFrame = e.frameNo || (e as any).machineId;
      if (rawFrame === null || rawFrame === undefined) return false;
      const cleanFrame = String(rawFrame).trim().toUpperCase();
      if (cleanFrame === cleanMachine) return true;

      // Prevent cross-matching between KTTM (Kxx) and Ring Frames (SPxx / xx)
      const isEntryK = cleanFrame.startsWith('K');
      if (isCleanK !== isEntryK) return false;

      const eDigits = cleanFrame.match(/\d+/);
      if (mNum !== null && eDigits && parseInt(eDigits[0], 10) === mNum) {
        return true;
      }
      return false;
    });

    if (!entry) return false;

    // Check if machine was active/ran on this shift (assigned sider, production, gps, or count)
    const hasAssignedWorker = (
      (Array.isArray(entry.siderIds) && entry.siderIds.some(id => id && String(id).trim() !== '-' && String(id).trim() !== '--' && String(id).toLowerCase().trim() !== 'unassigned' && String(id).toLowerCase().trim() !== 'none' && String(id).trim() !== '0')) ||
      (entry.siderId && String(entry.siderId).trim() !== '-' && String(entry.siderId).trim() !== '--' && String(entry.siderId).toLowerCase().trim() !== 'unassigned' && String(entry.siderId).toLowerCase().trim() !== 'none' && String(entry.siderId).trim() !== '0') ||
      (entry.siderName && String(entry.siderName).toLowerCase().trim() !== 'unassigned' && String(entry.siderName).trim() !== '' && String(entry.siderName).trim() !== '-')
    );

    const hasProd = (entry.productionActual !== undefined && entry.productionActual > 0) || (entry.gpsActual !== undefined && entry.gpsActual > 0);
    const hasCount = Boolean(entry.count && entry.count.trim() !== '' && entry.count.trim() !== '-');

    return hasAssignedWorker || hasProd || hasCount;
  }, [effectiveHistory, safeSettings, effectiveMachineEm]);

  const isMachineAssignedOnShift = isMachineRunOnShift;

  // Active dates for the selected Month & Year (strictly for selectedMonth and selectedYear)
  const selectedMonthDates = useMemo(() => {
    if (selectedMonthHistoryDates.length > 0) {
      return selectedMonthHistoryDates;
    }
    return calendarDates;
  }, [selectedMonthHistoryDates, calendarDates]);

  // Helper to deduplicate machine lists: removes bare numeric machines (e.g. '9', '10') if a prefixed equivalent exists (e.g. 'SP009', 'SP010')
  const deduplicateMachines = useCallback((rawList: string[]): string[] => {
    const filtered = rawList.filter(item => {
      const trimmed = item.trim();
      if (!trimmed || trimmed === '-' || trimmed === '0') return false;
      const isPureNumber = /^\d+$/.test(trimmed);
      if (isPureNumber) {
        const num = parseInt(trimmed, 10);
        const hasPrefixed = rawList.some(other => {
          const otherTrim = other.trim();
          if (/^\d+$/.test(otherTrim)) return false;
          const m = otherTrim.match(/\d+/);
          return m && parseInt(m[0], 10) === num;
        });
        if (hasPrefixed) return false;
      }
      return true;
    });

    return filtered;
  }, []);

  // Machines list: Show ALL master machines for each shed wise (strictly isolated per shed matching Machine Matrix upload order)
  const machines = useMemo(() => {
    const targetNorm = normalizeShed(activeShedTab || 'Shed 1');
    const seen = new Set<string>();
    const candidateList: string[] = [];

    const addClean = (val: any) => {
      if (val === null || val === undefined) return;
      const clean = String(val).trim();
      if (!clean || clean === '-' || clean === '0' || clean.toUpperCase() === 'M' || clean.toUpperCase() === 'MC') return;
      if (/^\d+$/.test(clean)) return; // Ignore bare unpadded numbers
      const lower = clean.toLowerCase();
      // Filter out grand totals, empty, dashes, and IoT device identifiers (RFxx)
      if (
        lower.includes('grand') ||
        lower.includes('total') ||
        lower.includes('rf no') ||
        lower.startsWith('rf')
      ) {
        return;
      }

      const upper = clean.toUpperCase();
      if (!seen.has(upper)) {
        seen.add(upper);
        candidateList.push(clean);
      }
    };

    // 1. Gather all reports for this month belonging to activeShedTab
    const monthReports = (effectiveHistory || []).filter(report => {
      if (!report || !report.date) return false;
      if (report.shed && normalizeShed(report.shed) !== targetNorm) return false;
      const parts = parseUniversalDateParts(report.date);
      return parts && parts.month === selectedMonth && parts.year === selectedYear;
    });

    // Sort reports so the most recent report (e.g. today's statement) comes first
    // This ensures today's upload row order from Machine Matrix is preserved at the top of candidateList!
    const sortedReports = [...monthReports].sort((a, b) => {
      const pA = parseUniversalDateParts(a.date);
      const pB = parseUniversalDateParts(b.date);
      if (!pA || !pB) return 0;
      const tA = new Date(pA.year, pA.month - 1, pA.day).getTime();
      const tB = new Date(pB.year, pB.month - 1, pB.day).getTime();
      return tB - tA;
    });

    sortedReports.forEach(report => {
      // In the exact same extraction order as MasterDataTable Machine Matrix:
      const frames = Array.from(new Set([
        ...(report.summaries?.map(s => s.frameNo) || []),
        ...(report.entries?.map(e => e.frameNo) || [])
      ])).filter(Boolean);

      frames.forEach(f => addClean(f));
    });

    // 2. If candidateList has no reports uploaded for this month yet: include shed registry from machinesProp
    if (candidateList.length === 0) {
      (machinesProp || [])
        .filter(m => {
          if (!m) return false;
          const mShed = normalizeShed(m.shed || 'Shed 1');
          return mShed === targetNorm;
        })
        .forEach(m => addClean(m.rfNo || (m as any).frameNo || (m as any).machineId));
    }

    return deduplicateMachines(candidateList);
  }, [
    machinesProp,
    activeShedTab,
    effectiveHistory,
    selectedMonth,
    selectedYear,
    deduplicateMachines
  ]);

  // Set of verified existing machine frame numbers for active shed
  const existingMachinesSet = useMemo(() => {
    const targetNorm = normalizeShed(activeShedTab || 'Shed 1');
    const isKttmTab = targetNorm === 'KTTM';
    const s = new Set<string>();

    (machines || []).forEach(m => {
      const clean = String(m || '').trim().toUpperCase();
      if (!clean) return;
      s.add(clean);
      const digits = clean.match(/\d+/);
      if (digits) {
        if (isKttmTab) {
          s.add(`K${digits[0]}`);
          s.add(`K${digits[0].padStart(2, '0')}`);
        } else {
          s.add(digits[0]);
          s.add(String(parseInt(digits[0], 10)));
          s.add(`RF${digits[0].padStart(2, '0')}`);
          s.add(`SP${digits[0].padStart(2, '0')}`);
          s.add(`SP${digits[0].padStart(3, '0')}`);
        }
      }
    });
    return s;
  }, [machines, activeShedTab]);

  const isMachineExisted = useCallback((frameNo: any): boolean => {
    if (frameNo === null || frameNo === undefined) return false;
    const clean = String(frameNo).trim().toUpperCase();
    if (!clean) return false;
    const targetNorm = normalizeShed(activeShedTab || 'Shed 1');

    const isKttmTab = targetNorm === 'KTTM';
    const isCleanK = clean.startsWith('K');

    // Strict tab check
    if (isKttmTab !== isCleanK) return false;

    if (!machines || machines.length === 0) return true; // If machine list is empty, do not block
    if (existingMachinesSet.has(clean)) return true;
    const digits = clean.match(/\d+/);
    if (digits) {
      if (isKttmTab) {
        if (existingMachinesSet.has(`K${digits[0]}`) || existingMachinesSet.has(`K${digits[0].padStart(2, '0')}`)) {
          return true;
        }
      } else {
        if (existingMachinesSet.has(digits[0]) || existingMachinesSet.has(String(parseInt(digits[0], 10)))) {
          return true;
        }
      }
    }
    return false;
  }, [existingMachinesSet, machines, activeShedTab]);

  // Live EM background refresh from MongoDB
  const [isRefreshingEm, setIsRefreshingEm] = useState(false);
  const [lastLiveEmTime, setLastLiveEmTime] = useState<string>('');

  const handleRefreshLiveEm = async () => {
    if (isRefreshingEm) return;
    setIsRefreshingEm(true);
    try {
      const res = await fetch(`/api/machine-em?force=true&syncHistory=true&_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          // Update live EM data locally without triggering unnecessary write-backs
          setLiveMachineEm(json.data);
          if (json.details) {
            setLiveMachineEmDetails(json.details);
          }
          setLastLiveEmTime(new Date().toLocaleTimeString());
        }
      }
    } catch (e) {
      console.warn('Failed to refresh EM:', e);
    } finally {
      setIsRefreshingEm(false);
    }
  };

  // Inspect Left EM, Right EM, and Total EM for clicked machine box
  const handleOpenEmDetail = async (date: string, machine: string, shift: Shift | number | string, val?: number, mappedIot?: string) => {
    const sKey = mapShiftToNum(shift);
    const cleanDate = normalizeToCanonicalDate(date);
    const dVariants = [date, cleanDate];
    const mVariants = [
      machine,
      machine.toUpperCase().trim(),
      machine.replace(/^SP0*/i, ''),
      machine.replace(/^RF0*/i, '')
    ];

    let foundDetail: any = null;
    for (const d of dVariants) {
      if (!liveMachineEmDetails[d]) continue;
      for (const m of mVariants) {
        if (liveMachineEmDetails[d][m]?.[sKey]) {
          foundDetail = liveMachineEmDetails[d][m][sKey];
          break;
        }
      }
      if (foundDetail) break;
    }

    if (foundDetail) {
      setActiveEmDetail({
        date,
        machine,
        mappedIot: foundDetail.mappedIot || mappedIot,
        shift,
        emTotal: Number(foundDetail.emTotal ?? (val || 0)),
        emLeft: Number(foundDetail.emLeft || 0),
        emRight: Number(foundDetail.emRight || 0),
        breaksLeft: foundDetail.endBreakCountLeft,
        breaksRight: foundDetail.endBreakCountRight,
        totalBreaks: foundDetail.totalEndBreaks,
        unit: foundDetail.unit || 'min',
        loading: false
      });
      return;
    }

    // Set initial with known val and loading true
    setActiveEmDetail({
      date,
      machine,
      mappedIot,
      shift,
      emTotal: Number(val || 0),
      loading: true
    });

    try {
      const res = await fetch(`/api/machine-em/detail?date=${encodeURIComponent(date)}&machine=${encodeURIComponent(machine)}&shift=${encodeURIComponent(sKey)}&_t=${Date.now()}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          const d = json.data;
          setActiveEmDetail({
            date,
            machine,
            mappedIot: d.mappedIot || mappedIot,
            shift,
            emTotal: Number(d.emTotal ?? (val || 0)),
            emLeft: Number(d.emLeft || 0),
            emRight: Number(d.emRight || 0),
            breaksLeft: d.endBreakCountLeft,
            breaksRight: d.endBreakCountRight,
            totalBreaks: d.totalEndBreaks,
            unit: d.unit || 'min',
            loading: false
          });
          return;
        }
      }
    } catch (_) {}

    setActiveEmDetail(prev => prev ? { ...prev, loading: false } : null);
  };

  // Inspect Grouped EM Breakdown for multi-machine operator duties (combining 2 sides of M1 and 3rd side of M2)
  const handleOpenGroupedEmDetail = (group: {
    id: string;
    date: string;
    shift: Shift;
    totalSides: number;
    avgEm: number;
    machines: {
      frameNo: string;
      sides: number;
      sideLabel: 'LH' | 'RH' | 'LH, RH';
      assignedEm: number;
      gps: number;
      count: string;
      emLeft?: number;
      emRight?: number;
      mappedIot?: string;
    }[];
  }) => {
    if (group.machines.length === 1) {
      const m = group.machines[0];
      handleOpenEmDetail(group.date, m.frameNo, group.shift, m.assignedEm, m.mappedIot);
      return;
    }

    setActiveEmDetail({
      date: group.date,
      machine: group.machines.map(m => m.frameNo).join(', '),
      shift: group.shift,
      emTotal: group.avgEm,
      unit: 'min',
      loading: false,
      isMultiMachine: true,
      totalSides: group.totalSides,
      combinedAvgEm: group.avgEm,
      machines: group.machines
    });
  };

  // Periodic 45-second background auto-refresh for live Machine EM
  React.useEffect(() => {
    let isMounted = true;
    handleRefreshLiveEm();
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (isMounted) {
        handleRefreshLiveEm();
      }
    }, 45000);
    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, []);

  // Sync Google Sheet handler
  const handleSync = async () => {
    if (!sheetUrl) return;
    setIsSyncing(true);
    setSyncStatus(null);
    try {
      const syncedData = await syncMachineEmFromGoogleSheet(sheetUrl);
      
      // Update Google Sheet URL in setting
      await onUpdateMachineEm(syncedData, sheetUrl);
      
      // Save local setting just in case
      const localSettings = localStorage.getItem('spin_settings');
      if (localSettings) {
        const parsed = JSON.parse(localSettings);
        parsed.machineEmGoogleSheetUrl = sheetUrl;
        parsed.lastMachineEmSyncDate = new Date().toLocaleString();
        localStorage.setItem('spin_settings', JSON.stringify(parsed));
      }

      const sortedDates = Object.keys(syncedData).sort((a, b) => {
        return parseUniversalDate(a).getTime() - parseUniversalDate(b).getTime();
      });

      setSyncStatus({
        success: true,
        message: `Successfully synchronized ${sortedDates.length} days of Machine EM data from the spreadsheet.`,
        dates: sortedDates
      });
    } catch (err) {
      console.error(err);
      setSyncStatus({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to connect to Google Sheet. Please check permission settings.'
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Cell Update handler
  const handleCellUpdate = async () => {
    if (!editingCell) return;
    const { date, machine, shift, value } = editingCell;
    const parsedVal = parseFloat(value);
    
    if (isNaN(parsedVal)) {
      alert('Please enter a valid numeric EM value.');
      return;
    }

    const updated = JSON.parse(JSON.stringify(effectiveMachineEm)) as MachineEmData;
    
    // Register under all date variants so whichever lookup format is used, it resolves properly
    const dateKeys = Array.from(new Set([
      date,
      normalizeToCanonicalDate(date)
    ]));
    const dParts = parseUniversalDateParts(date);
    if (dParts) {
      dateKeys.push(`${dParts.year}-${String(dParts.month).padStart(2, '0')}-${String(dParts.day).padStart(2, '0')}`);
    }

    const targetMachines = new Set<string>([machine]);
    const registeredDev = registeredInfoForMonth.frameToDevice[machine];
    if (registeredDev) targetMachines.add(registeredDev);

    for (const d of dateKeys) {
      if (!updated[d]) updated[d] = {};
      for (const m of targetMachines) {
        if (!updated[d][m]) updated[d][m] = {};
        updated[d][m][shift] = parsedVal;
        (updated[d][m] as any)[Number(shift)] = parsedVal;
      }
    }

    await onUpdateMachineEm(updated);
    setEditingCell(null);
  };

  // 1. Calculate Grand Totals and dynamic average of Column EM (only for assigned & available machines)
  const calculateColAverage = (date: string, shift: string): string => {
    let sum = 0;
    let count = 0;
    const dateMapping = resolveEffectiveMappingForDate(
      date,
      safeSettings?.iotMachineAllocationPeriods,
      safeSettings?.iotMachineMappingByDate,
      safeSettings?.iotMachineMapping
    );

    (machines || []).forEach(m => {
      // Only include if machine is available and assigned on this shift
      if (!isMachineAssignedOnShift(date, shift, m)) return;
      // Machine MUST be assigned to an IoT device on this date!
      const mappedDev = resolveMappedDevice(dateMapping, m);
      if (!mappedDev || mappedDev === 'NONE') return;

      const val = getMachineEmValue(effectiveMachineEm, date, m, shift, dateMapping);
      if (val !== undefined && val !== null) {
        sum += val;
        count++;
      }
    });
    return count > 0 ? (sum / count).toFixed(2) : '-';
  };

  // 2. Individual Sider Log calculation: Combined rows by Date & Shift with 3-Side Average
  const individualEmLedger = useMemo(() => {
    if (!selectedWorkerId) return [];
    
    const start = fromDate ? new Date(fromDate) : null;
    const end = toDate ? new Date(toDate) : null;
    if (start) start.setHours(0, 0, 0, 0);
    if (end) end.setHours(23, 59, 59, 999);

    const shiftGroups: {
      id: string;
      date: string;
      shift: Shift;
      totalSides: number;
      avgEm: number;
      machines: {
        frameNo: string;
        shift: Shift;
        sides: number;
        sideLabel: 'LH' | 'RH' | 'LH, RH';
        gps: number;
        count: string;
        assignedEm: number;
        emLeft?: number;
        emRight?: number;
        mappedIot?: string;
      }[];
    }[] = [];

    const selectedWorker = (effectiveWorkers || []).find(w => w && (w.id === selectedWorkerId || w.tNo === selectedWorkerId));

    // Search active daily reports
    (effectiveHistory || []).forEach(report => {
      // Filter by date range
      if (!report || !report.date) return;
      const rDate = parseUniversalDate(report.date);
      
      if (start && rDate < start) return;
      if (end && rDate > end) return;

      const dateMapping = resolveEffectiveMappingForDate(
        report.date,
        safeSettings?.iotMachineAllocationPeriods,
        safeSettings?.iotMachineMappingByDate,
        safeSettings?.iotMachineMapping
      );
      const shiftRes = computeOperatorShiftEm(selectedWorker || selectedWorkerId, report, effectiveMachineEm, effectiveWorkers, dateMapping, liveMachineEmDetails);
      if (shiftRes && Array.isArray(shiftRes.machinesDetail) && shiftRes.machinesDetail.length > 0) {
        const validMachines = shiftRes.machinesDetail
          .filter(m => m && isMachineExisted(m.frameNo))
          .map(m => {
            const mappedDev = dateMapping[m.frameNo] || dateMapping[m.frameNo.toUpperCase()] || '';
            return {
              frameNo: m.frameNo,
              shift: m.shift || shiftRes.shift,
              sides: m.sides,
              sideLabel: m.sideLabel,
              gps: m.gps,
              count: m.count || '',
              assignedEm: m.assignedEm,
              emLeft: m.emLeft,
              emRight: m.emRight,
              mappedIot: mappedDev
            };
          });

        if (validMachines.length > 0) {
          // Group by shift if worker worked multiple shifts or same shift
          const byShift: Record<string, typeof validMachines> = {};
          validMachines.forEach(vm => {
            const shKey = vm.shift || shiftRes.shift;
            if (!byShift[shKey]) byShift[shKey] = [];
            byShift[shKey].push(vm);
          });

          Object.entries(byShift).forEach(([sh, mList]) => {
            const totalSidesInShift = mList.reduce((s, m) => s + m.sides, 0);
            const totalEmWeighted = mList.reduce((s, m) => s + (m.assignedEm * m.sides), 0);
            const avgEmForShift = totalSidesInShift > 0 ? Number((totalEmWeighted / totalSidesInShift).toFixed(3)) : 0;

            shiftGroups.push({
              id: `${report.date}-${sh}`,
              date: report.date,
              shift: sh as Shift,
              totalSides: totalSidesInShift,
              avgEm: avgEmForShift,
              machines: mList
            });
          });
        }
      }
    });

    // Sort chronological
    return shiftGroups.sort((a, b) => {
      return parseUniversalDate(a.date).getTime() - parseUniversalDate(b.date).getTime();
    });
  }, [effectiveHistory, effectiveMachineEm, selectedWorkerId, fromDate, toDate, effectiveWorkers, registeredInfoForMonth, isMachineExisted, liveMachineEmDetails, safeSettings]);

  // Aggregate stats for individual view
  const individualStats = useMemo(() => {
    if (individualEmLedger.length === 0) return { totalShifts: 0, avgGps: 0, avgEm: 0 };
    const totalShifts = individualEmLedger.length;
    let sumGps = 0;
    let totalMachineCount = 0;
    let sumEm = 0;

    individualEmLedger.forEach(group => {
      group.machines.forEach(m => {
        sumGps += m.gps;
        totalMachineCount += 1;
      });
      sumEm += group.avgEm;
    });

    return {
      totalShifts,
      avgGps: totalMachineCount > 0 ? sumGps / totalMachineCount : 0,
      avgEm: totalShifts > 0 ? sumEm / totalShifts : 0
    };
  }, [individualEmLedger]);

  // 3. Consolidated Monthly Operator EM Abstract
  const monthlyAbstract = useMemo(() => {
    const siderData: Record<string, {
      id: string;
      name: string;
      tNo: string;
      shifts: number;
      totalGps: number;
      totalEm: number;
      emCount: number;
    }> = {};

    // Initialize all active workers
    (effectiveWorkers || []).forEach(w => {
      if (!w || !w.id) return;
      siderData[w.id] = {
        id: w.id,
        name: w.name || 'Unknown',
        tNo: w.tNo || '-',
        shifts: 0,
        totalGps: 0,
        totalEm: 0,
        emCount: 0
      };
    });

    // Process all history reports in the target month
    (effectiveHistory || []).forEach(report => {
      if (!report || !report.date || !Array.isArray(report.entries)) return;
      const parts = parseUniversalDateParts(report.date);
      if (!parts) return;
      if (parts.month !== selectedMonth || parts.year !== selectedYear) return;

      const dateMapping = resolveEffectiveMappingForDate(
        report.date,
        safeSettings?.iotMachineAllocationPeriods,
        safeSettings?.iotMachineMappingByDate,
        safeSettings?.iotMachineMapping
      );

      (effectiveWorkers || []).forEach(worker => {
        if (!worker || !worker.id) return;
        const shiftRes = computeOperatorShiftEm(worker, report, effectiveMachineEm, effectiveWorkers, dateMapping, liveMachineEmDetails);
        if (shiftRes && shiftRes.totalSides > 0) {
          if (!siderData[worker.id]) {
            siderData[worker.id] = {
              id: worker.id,
              name: worker.name || 'Unknown',
              tNo: worker.tNo || '-',
              shifts: 0,
              totalGps: 0,
              totalEm: 0,
              emCount: 0
            };
          }
          const rec = siderData[worker.id];
          rec.shifts += 1;
          rec.totalGps += shiftRes.totalGps;
          if (shiftRes.totalEm > 0) {
            rec.totalEm += shiftRes.totalEm;
            rec.emCount += 1;
          }
        }
      });
    });

    // Convert to list & calculate averages
    return Object.values(siderData)
      .filter(w => w.shifts > 0)
      .map(w => ({
        ...w,
        avgGps: w.shifts > 0 ? (w.totalGps / w.shifts) : 0,
        avgEm: w.emCount > 0 ? (w.totalEm / w.emCount) : 0
      }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [effectiveHistory, effectiveWorkers, effectiveMachineEm, selectedMonth, selectedYear, registeredInfoForMonth]);

  // Operator Monthly EM grid data
  const operatorEmGridData = useMemo(() => {
    const lookup: Record<string, Record<string, number>> = {};
    const lookupSum: Record<string, Record<string, number>> = {};
    const shiftCount: Record<string, Record<string, number>> = {};

    (effectiveHistory || []).forEach(report => {
      if (!report || !report.date || !Array.isArray(report.entries)) return;
      const parts = parseUniversalDateParts(report.date);
      if (!parts || parts.month !== selectedMonth || parts.year !== selectedYear) return;
      const dateStr = normalizeToCanonicalDate(report.date);

      if (!lookup[dateStr]) {
        lookup[dateStr] = {};
        lookupSum[dateStr] = {};
        shiftCount[dateStr] = {};
      }

      const dateMapping = resolveEffectiveMappingForDate(
        report.date,
        safeSettings?.iotMachineAllocationPeriods,
        safeSettings?.iotMachineMappingByDate,
        safeSettings?.iotMachineMapping
      );

      (effectiveWorkers || []).forEach(worker => {
        if (!worker || !worker.id) return;
        const shiftRes = computeOperatorShiftEm(worker, report, effectiveMachineEm, effectiveWorkers, dateMapping, liveMachineEmDetails);
        if (shiftRes && shiftRes.totalSides > 0 && shiftRes.totalEm > 0) {
          lookupSum[dateStr][worker.id] = (lookupSum[dateStr][worker.id] || 0) + shiftRes.totalEm;
          shiftCount[dateStr][worker.id] = (shiftCount[dateStr][worker.id] || 0) + 1;
          lookup[dateStr][worker.id] = Number((lookupSum[dateStr][worker.id] / shiftCount[dateStr][worker.id]).toFixed(2));
          if (worker.tNo) {
            lookup[dateStr][worker.tNo] = lookup[dateStr][worker.id];
          }
        }
      });
    });

    const rows = (effectiveWorkers || []).map(worker => {
      const dateValues: Record<string, number | null> = {};
      let totalEmSum = 0;
      let totalEmCount = 0;

      calendarDates.forEach(dateStr => {
        const val = worker ? (lookup[dateStr]?.[worker.id] ?? (worker.tNo ? lookup[dateStr]?.[worker.tNo] : undefined)) : undefined;
        if (val !== undefined && val !== null) {
          dateValues[dateStr] = val;
          totalEmSum += val;
          totalEmCount++;
        } else {
          dateValues[dateStr] = null;
        }
      });

      const averageEm = totalEmCount > 0 ? Number((totalEmSum / totalEmCount).toFixed(3)) : null;

      return {
        worker,
        dateValues,
        averageEm,
        daysWorked: totalEmCount
      };
    });

    // Sort by Ticket number (tNo) ascending and filter out workers with no EM data
    return rows
      .filter(r => r && r.averageEm !== null)
      .sort((a, b) => {
        const aTNo = parseInt(String(a.worker?.tNo || '0'), 10) || 0;
        const bTNo = parseInt(String(b.worker?.tNo || '0'), 10) || 0;
        return aTNo - bTNo;
      });
  }, [effectiveHistory, effectiveWorkers, effectiveMachineEm, calendarDates, selectedMonth, selectedYear, registeredInfoForMonth]);

  // Excel Export: Operator Monthly EM
  const exportOperatorMonthlyToExcel = () => {
    if (operatorEmGridData.length === 0) return;
    
    const headers = ['TNo', 'Sider Name', ...calendarDates];
    const dataRows = operatorEmGridData.map(row => {
      const r: any[] = [row.worker?.tNo || '-', String(row.worker?.name || '').toUpperCase()];
      calendarDates.forEach(dateStr => {
        const val = row.dateValues[dateStr];
        r.push(val !== null ? val : '');
      });
      return r;
    });
    
    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sider Monthly EM');
    XLSX.writeFile(wb, `Sider_Monthly_EM_${monthsList[selectedMonth - 1].label}_${selectedYear}.xlsx`);
  };

  // Daily EM Report Rows: Displays the data based on each assigned production machine
  const dailyEmRows = useMemo(() => {
    if (!selectedDailyEmDate) return [];
    
    const canonicalSelected = normalizeToCanonicalDate(selectedDailyEmDate);
    const targetNorm = normalizeShed(activeShedTab || 'Shed 1');

    const reportsForDate = (effectiveHistory || []).filter(r => {
      if (!r || !r.date || normalizeToCanonicalDate(r.date) !== canonicalSelected) return false;
      if (r.shed && normalizeShed(r.shed) !== targetNorm) return false;
      return true;
    });
    if (reportsForDate.length === 0) return [];

    const list: {
      siderName: string;
      tNo?: string;
      shift: Shift;
      mcNo: string;
      count: string;
      gps: number;
      em: number;
    }[] = [];

    reportsForDate.forEach(report => {
      if (!Array.isArray(report.entries)) return;

      report.entries.forEach(entry => {
        if (!entry) return;
        if (entry.shed && normalizeShed(entry.shed) !== targetNorm) return;

        const rawFrame = entry.frameNo || (entry as any).machineId;
        if (rawFrame === null || rawFrame === undefined) return;
        const frameNo = String(rawFrame).trim();
        if (!frameNo) return;

        // 1. Machine existence check (do not show machines that do not exist in the active registry)
        if (!isMachineExisted(frameNo)) return;

      // 2. Resolve all siders assigned to this machine entry
      const assignedIds: string[] = [];
      if (Array.isArray(entry.siderIds) && entry.siderIds.length > 0) {
        entry.siderIds.forEach(id => {
          if (id && String(id).trim() !== '-' && String(id).trim() !== '--' && String(id).toLowerCase().trim() !== 'unassigned' && String(id).toLowerCase().trim() !== 'none' && String(id).trim() !== '0') {
            assignedIds.push(String(id).trim());
          }
        });
      } else if (entry.siderId && String(entry.siderId).trim() !== '-' && String(entry.siderId).trim() !== '--' && String(entry.siderId).toLowerCase().trim() !== 'unassigned' && String(entry.siderId).toLowerCase().trim() !== 'none' && String(entry.siderId).trim() !== '0') {
        assignedIds.push(String(entry.siderId).trim());
      }

      // Check name match as fallback if no IDs are linked
      if (assignedIds.length === 0 && entry.siderName && entry.siderName.toLowerCase().trim() !== 'unassigned' && entry.siderName.trim() !== '') {
        const nameMatchWorker = (effectiveWorkers || []).find(w => 
          w && w.name && w.name.toLowerCase().trim() === String(entry.siderName).toLowerCase().trim()
        );
        if (nameMatchWorker && nameMatchWorker.id) {
          assignedIds.push(nameMatchWorker.id);
        }
      }

      // 3. Do not show if machine was not assigned to any operator
      if (assignedIds.length === 0 && (!entry.siderName || entry.siderName.toLowerCase().trim() === 'unassigned' || entry.siderName.trim() === '')) {
        return;
      }

      // Get EM for this assigned production machine (resolves from iot_em via machine-to-machine allocation)
      const dateMapping = resolveEffectiveMappingForDate(
        report.date,
        safeSettings?.iotMachineAllocationPeriods,
        safeSettings?.iotMachineMappingByDate,
        safeSettings?.iotMachineMapping
      );
      const mappedDev = resolveMappedDevice(dateMapping, frameNo);
      let emValue = mappedDev ? getMachineEmValue(effectiveMachineEm, report.date, frameNo, entry.shift, dateMapping) : undefined;
      if (emValue === undefined) {
        emValue = entry.doffEmt ?? 0;
      }

      // Resolve side-specific telemetry detail if available
      let emLeft: number | undefined = undefined;
      let emRight: number | undefined = undefined;
      let emAvg: number | undefined = undefined;

      const detailsSource = liveMachineEmDetails || (effectiveMachineEm as any)?._details;
      if (detailsSource) {
        const canonical = normalizeToCanonicalDate(report.date);
        const dVariants = [report.date, canonical];
        const mVariants = [frameNo, frameNo.toUpperCase().trim(), frameNo.replace(/^SP0*/i, ''), frameNo.replace(/^RF0*/i, '')];
        const sKey = mapShiftToNum(entry.shift);

        for (const d of dVariants) {
          if (!detailsSource[d]) continue;
          for (const m of mVariants) {
            const detail = detailsSource[d][m]?.[sKey] || detailsSource[d][m]?.[Number(sKey)];
            if (detail) {
              if (typeof detail.emLeft === 'number') emLeft = detail.emLeft;
              if (typeof detail.emRight === 'number') emRight = detail.emRight;
              if (typeof detail.emAvg === 'number') emAvg = detail.emAvg;
              break;
            }
          }
          if (emLeft !== undefined || emRight !== undefined || emAvg !== undefined) break;
        }
      }

      const slot0 = entry.siderIds?.[0] || entry.siderId;
      const slot1 = entry.siderIds?.[1];

      const getSideAllocationAndEm = (wIdOrName: string) => {
        const clean = String(wIdOrName).trim().toLowerCase();
        const slot0Clean = slot0 ? String(slot0).trim().toLowerCase() : '';
        const slot1Clean = slot1 ? String(slot1).trim().toLowerCase() : '';
        const isSlot0 = slot0Clean !== '' && (slot0Clean === clean || (entry.siderName && entry.siderName.toLowerCase().trim() === clean));
        const isSlot1 = slot1Clean !== '' && slot1Clean === clean;

        let sideLabel: 'LH' | 'RH' | 'LH, RH' = 'LH, RH';
        if (isSlot0 && isSlot1) {
          sideLabel = 'LH, RH';
        } else if (isSlot0) {
          const hasOtherInSlot1 = slot1Clean !== '' && slot1Clean !== '-' && !isSlot1;
          sideLabel = hasOtherInSlot1 ? 'LH' : 'LH, RH';
        } else if (isSlot1) {
          sideLabel = 'RH';
        }

        let dutyEm = emValue;
        if (sideLabel === 'LH') {
          dutyEm = (emLeft !== undefined && emLeft > 0) ? emLeft : (emAvg ?? emValue);
        } else if (sideLabel === 'RH') {
          dutyEm = (emRight !== undefined && emRight > 0) ? emRight : (emAvg ?? emValue);
        } else {
          // Both sides (LH, RH): Average of Left and Right EM (never total sum)
          if (emLeft !== undefined && emRight !== undefined && (emLeft > 0 || emRight > 0)) {
            dutyEm = Number(((emLeft + emRight) / 2).toFixed(2));
          } else {
            dutyEm = emAvg ?? emValue;
          }
        }

        return { sideLabel, dutyEm: Number(dutyEm.toFixed(2)) };
      };

      const uniqueAssignedIds = Array.from(new Set(assignedIds));

      if (uniqueAssignedIds.length > 0) {
        uniqueAssignedIds.forEach(id => {
          const worker = (effectiveWorkers || []).find(w => 
            w && (
              (w.id && String(w.id).toLowerCase() === String(id).toLowerCase()) || 
              (w.tNo && String(w.tNo).toLowerCase() === String(id).toLowerCase())
            )
          );
          const name = worker ? worker.name : (entry.siderName || 'Unassigned');
          if (name && name.toLowerCase().trim() !== 'unassigned') {
            const { sideLabel, dutyEm } = getSideAllocationAndEm(id);
            list.push({
              siderName: name,
              tNo: worker?.tNo,
              shift: entry.shift,
              mcNo: `${frameNo} (${sideLabel})`,
              count: entry.count || '-',
              gps: entry.gpsActual || 0,
              em: dutyEm
            });
          }
        });
      } else if (entry.siderName && entry.siderName.toLowerCase().trim() !== 'unassigned' && entry.siderName.trim() !== '') {
        const worker = (effectiveWorkers || []).find(w => w && w.name && w.name.toLowerCase().trim() === String(entry.siderName).toLowerCase().trim());
        const { sideLabel, dutyEm } = getSideAllocationAndEm(entry.siderName);
        list.push({
          siderName: entry.siderName,
          tNo: worker?.tNo,
          shift: entry.shift,
          mcNo: `${frameNo} (${sideLabel})`,
          count: entry.count || '-',
          gps: entry.gpsActual || 0,
          em: dutyEm
        });
      }
    });
  });

  // Deduplicate any identical entries (same Sider, same Shift, same Machine and side)
  const seenRowKeys = new Set<string>();
  const deduplicatedList: typeof list = [];
  list.forEach(item => {
    const rowKey = `${item.shift}_${item.mcNo.toUpperCase().trim()}_${item.siderName.toUpperCase().trim()}`;
    if (!seenRowKeys.has(rowKey)) {
      seenRowKeys.add(rowKey);
      deduplicatedList.push(item);
    }
  });

  // Sort by Shift (I, II, III), then MC NO (numeric ascending), then Sider Name
  return deduplicatedList.sort((a, b) => {
    const shiftOrder: Record<Shift, number> = { 'I': 1, 'II': 2, 'III': 3 };
    const aOrder = shiftOrder[a.shift] || 99;
    const bOrder = shiftOrder[b.shift] || 99;
    if (aOrder !== bOrder) return aOrder - bOrder;

    const aMc = a.mcNo.localeCompare(b.mcNo, undefined, { numeric: true });
    if (aMc !== 0) return aMc;

    return a.siderName.localeCompare(b.siderName);
  });
}, [effectiveHistory, selectedDailyEmDate, effectiveMachineEm, effectiveWorkers, registeredInfoForMonth, isMachineExisted, activeShedTab]);

  const exportDailyEmToExcel = () => {
    if (dailyEmRows.length === 0) return;
    
    const headers = ['Sider Name', 'TNo', 'Shift', 'MC NO', 'Count', 'GPS', 'EM'];
    const dataRows = dailyEmRows.map(row => [
      row.siderName.toUpperCase(),
      row.tNo || '-',
      row.shift,
      row.mcNo,
      row.count,
      row.gps,
      row.em
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Daily EM Report');
    XLSX.writeFile(wb, `Daily_EM_Report_${selectedDailyEmDate.replace(/\//g, '_')}.xlsx`);
  };

  const exportDailyEmToPdf = async () => {
    if (!dailyReportRef.current || dailyEmRows.length === 0) return;
    setIsExportingPdf(true);
    
    try {
      const element = dailyReportRef.current;
      
      const canvas = await html2canvas(element, {
        scale: 2, // Crisp desktop-grade rendering on export
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('daily-em-report-pdf-container');
          if (clonedElement) {
            clonedElement.style.width = '1000px';
            clonedElement.style.maxWidth = '1000px';
            clonedElement.style.padding = '40px';
            clonedElement.style.borderRadius = '0';
            clonedElement.style.border = 'none';
            clonedElement.style.boxShadow = 'none';
            
            const tableWrappers = clonedElement.getElementsByClassName('overflow-x-auto');
            for (let i = 0; i < tableWrappers.length; i++) {
              (tableWrappers[i] as HTMLElement).style.overflow = 'visible';
              (tableWrappers[i] as HTMLElement).style.width = '100%';
              (tableWrappers[i] as HTMLElement).style.maxWidth = 'none';
            }
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
      });
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const margin = 15;
      const contentWidth = pdfWidth - (margin * 2);
      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const contentHeight = (imgHeight * contentWidth) / imgWidth;
      
      let heightLeft = contentHeight;
      let position = margin;
      
      pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight);
      heightLeft -= (pdfHeight - margin * 2);
      
      while (heightLeft > 0) {
        position = heightLeft - contentHeight + margin;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', margin, position, contentWidth, contentHeight);
        heightLeft -= (pdfHeight - margin * 2);
      }
      
      const formattedDate = selectedDailyEmDate ? selectedDailyEmDate.replace(/\//g, '_') : 'Report';
      pdf.save(`Daily_EM_Report_Statement_${formattedDate}.pdf`);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsExportingPdf(false);
    }
  };

  // Only updated dates (dates with at least one EM data value for any worker)
  const updatedDates = useMemo(() => {
    const datesWithData = new Set<string>();
    
    // Check which calendar dates actually have some non-null EM value across any worker
    operatorEmGridData.forEach(row => {
      calendarDates.forEach(dateStr => {
        if (row.dateValues[dateStr] !== null) {
          datesWithData.add(dateStr);
        }
      });
    });

    // Sort chronologically
    return Array.from(datesWithData).sort((a, b) => {
      return parseUniversalDate(a).getTime() - parseUniversalDate(b).getTime();
    });
  }, [operatorEmGridData, calendarDates]);

  // TV Slideshow navigation parameters: 15 items per page
  const [tvPageIndex, setTvPageIndex] = useState(0);
  const tvItemsPerPage = 15;
  const tvTotalPages = Math.ceil(operatorEmGridData.length / tvItemsPerPage) || 1;

  React.useEffect(() => {
    if (!activeTv || tvTotalPages <= 1) return;
    const interval = setInterval(() => {
      setTvPageIndex(prev => (prev + 1) % tvTotalPages);
    }, (tvPageInterval || 15) * 1000);
    return () => clearInterval(interval);
  }, [activeTv, tvTotalPages, tvPageInterval]);

  React.useEffect(() => {
    if (activeTv && onPagesDetermined) {
      onPagesDetermined(tvTotalPages);
    }
  }, [activeTv, tvTotalPages, onPagesDetermined]);

  React.useEffect(() => {
    if (tvPageIndex >= tvTotalPages) {
      setTvPageIndex(0);
    }
  }, [tvTotalPages, tvPageIndex]);

  const displayedTvItems = useMemo(() => {
    const start = tvPageIndex * tvItemsPerPage;
    return operatorEmGridData.slice(start, start + tvItemsPerPage);
  }, [operatorEmGridData, tvPageIndex, tvItemsPerPage]);

  const filteredOperatorGridData = useMemo(() => {
    if (!operatorSearchQuery.trim()) return operatorEmGridData;
    const query = operatorSearchQuery.toLowerCase().trim();
    return operatorEmGridData.filter(row => 
      row.worker.name.toLowerCase().includes(query) || 
      row.worker.tNo.toLowerCase().includes(query)
    );
  }, [operatorEmGridData, operatorSearchQuery]);

  // Excel Export: Machine EM Grid
  const exportGridToExcel = () => {
    if (selectedMonthDates.length === 0) {
      alert('No data available to export for this month.');
      return;
    }

    const dataRows: any[] = [];
    
    // Row 1: Merged Dates Row
    // Column 0 is "Row Labels". Then 3 cells for each date
    const r1 = ['Row Labels'];
    selectedMonthDates.forEach(date => {
      r1.push(date, '', '');
    });
    dataRows.push(r1);

    // Row 2: Shift Labels Row
    const r2 = [''];
    selectedMonthDates.forEach(() => {
      r2.push('1', '2', '3');
    });
    dataRows.push(r2);

    // Rows 3-8: Machines
    machines.forEach(machine => {
      const activeDev = resolveMappedDevice(safeSettings?.iotMachineMapping, machine) 
        || safeSettings?.iotMachineMapping?.[machine] 
        || registeredInfoForMonth.frameToDevice[machine];
      const row: any[] = [activeDev ? `${machine} (${activeDev})` : machine];
      selectedMonthDates.forEach(date => {
        const dateMapping = resolveEffectiveMappingForDate(
          date,
          safeSettings?.iotMachineAllocationPeriods,
          safeSettings?.iotMachineMappingByDate,
          safeSettings?.iotMachineMapping
        );
        const mappedDev = resolveMappedDevice(dateMapping, machine);
        const isIotAssigned = Boolean(mappedDev && mappedDev !== 'NONE');

        shifts.forEach(shift => {
          const isAssigned = isMachineAssignedOnShift(date, shift, machine);
          const val = (isAssigned && isIotAssigned)
            ? getMachineEmValue(effectiveMachineEm, date, machine, shift, dateMapping)
            : undefined;
          row.push(val !== undefined ? val : '');
        });
      });
      dataRows.push(row);
    });

    // Row 9: Grand Total
    const rTotal: any[] = ['Grand Total'];
    selectedMonthDates.forEach(date => {
      shifts.forEach(shift => {
        const avg = calculateColAverage(date, shift);
        rTotal.push(avg !== '-' ? parseFloat(avg) : '');
      });
    });
    dataRows.push(rTotal);

    // Create Sheet
    const ws = XLSX.utils.aoa_to_sheet(dataRows);
    
    // Add Merges: Row 0 merges 3 columns for each date
    const merges: XLSX.Range[] = [];
    selectedMonthDates.forEach((_, idx) => {
      const startCol = 1 + idx * 3;
      merges.push({
        s: { r: 0, c: startCol },
        e: { r: 0, c: startCol + 2 }
      });
    });
    ws['!merges'] = merges;

    // Build Workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Machine EM Format');
    
    // Save
    XLSX.writeFile(wb, `Operator_EM_Format_${monthsList[selectedMonth - 1].label}_${selectedYear}.xlsx`);
  };

  // Excel Export: Sider Ledger
  const exportLedgerToExcel = () => {
    if (individualEmLedger.length === 0) return;
    const worker = workers.find(w => w.id === selectedWorkerId);
    const workerName = worker?.name || 'Operator';
    
    const excelData: any[] = [];
    individualEmLedger.forEach((group, idx) => {
      group.machines.forEach((m, mIdx) => {
        excelData.push({
          'S.No': mIdx === 0 ? idx + 1 : '',
          'Date': mIdx === 0 ? group.date : '',
          'Shift': mIdx === 0 ? group.shift : '',
          'Assigned Machine': `${m.frameNo} (${m.sideLabel})`,
          'Yarn Count': m.count,
          'Actual GPS': m.gps,
          'EM Value': mIdx === 0 ? group.avgEm : ''
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ledger');
    XLSX.writeFile(wb, `${workerName}_EM_Ledger_${fromDate}_to_${toDate}.xlsx`);
  };

  // Excel Export: Monthly Abstract
  const exportAbstractToExcel = () => {
    if (monthlyAbstract.length === 0) return;
    
    const excelData = monthlyAbstract.map((item, idx) => ({
      'S.No': idx + 1,
      'Ticket Number': item.tNo,
      'Operator Name': item.name,
      'Total Shifts': item.shifts,
      'Average GPS': parseFloat(item.avgGps.toFixed(3)),
      'Average EM': parseFloat(item.avgEm.toFixed(2))
    }));

    const ws = XLSX.utils.json_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Operator EM Monthly Abstract');
    XLSX.writeFile(wb, `Operator_EM_Abstract_${monthsList[selectedMonth - 1].label}_${selectedYear}.xlsx`);
  };

  if (activeTv) {
    const tvDatesToRender = updatedDates.length > 0 ? updatedDates : calendarDates;

    return (
      <div className="w-full h-full bg-white rounded-3xl border border-stone-200 p-6 xl:p-8 text-stone-900 font-sans flex flex-col justify-between gap-4 overflow-hidden shadow-xs animate-in fade-in duration-300">
        {/* Header */}
        <div className="flex justify-between items-center border-b border-stone-200 pb-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-black text-emerald-600 uppercase tracking-widest">
              Sider Monthly EM Statement
            </span>
            <h1 className="text-4xl md:text-5xl font-serif italic text-stone-900">
              Sider EM for the Month Of {monthsList[selectedMonth - 1].label} {selectedYear}
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {localTvMode && (
              <button
                onClick={() => setLocalTvMode(false)}
                className="px-5 py-2.5 bg-red-50 text-red-700 hover:bg-red-100 font-black text-sm uppercase tracking-wider rounded-xl cursor-pointer border border-red-200 transition-colors"
              >
                Exit TV Mode
              </button>
            )}
            <div className="flex items-center gap-4 bg-white px-6 py-3 rounded-2xl border border-stone-200 shadow-sm">
              <span className="text-sm font-bold text-stone-500 uppercase tracking-wider">
                Page {tvPageIndex + 1} of {tvTotalPages}
              </span>
              <div className="h-4 w-[1px] bg-stone-200" />
              <span className="text-sm font-black text-emerald-600 uppercase tracking-wider animate-pulse">
                Auto-rotating
              </span>
            </div>
          </div>
        </div>

        {/* Grid Display */}
        <div className="flex-1 overflow-x-auto bg-white rounded-[2rem] border border-stone-200 p-8 shadow-sm">
          {displayedTvItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[50vh] text-stone-400">
              <AlertCircle size={48} className="text-stone-300 mb-4 stroke-1" />
              <p className="font-serif italic text-xl text-stone-500">No active operator assignments found for this month.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-center border-collapse text-sm border border-stone-200">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 bg-stone-50">
                    <th className="p-4 text-left font-black uppercase tracking-wider text-[24px] text-stone-800 w-[110px] border border-stone-200 bg-stone-50">TNo</th>
                    <th className="p-4 text-left font-black uppercase tracking-wider text-[24px] text-stone-800 w-[200px] border border-stone-200 bg-stone-50">Sider Name</th>
                    {tvDatesToRender.map(dateStr => {
                      const dp = parseUniversalDateParts(dateStr);
                      const dayNum = dp ? dp.day : dateStr;
                      return (
                        <th key={dateStr} className="p-2.5 font-black text-[24px] text-stone-800 border border-stone-200 w-[45px] bg-stone-50">
                          {dayNum}
                        </th>
                      );
                    })}
                    <th className="p-4 font-black uppercase tracking-wider text-[24px] text-emerald-700 w-[95px] border border-stone-200 bg-emerald-50">Avg EM</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedTvItems.map(({ worker, dateValues, averageEm }) => (
                    <tr key={worker.id} className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors">
                      <td className="p-3 text-left font-mono font-bold text-[24px] text-stone-600 border border-stone-200 bg-stone-50/20">{worker.tNo}</td>
                      <td className="p-3 text-left font-bold text-[24px] text-stone-900 border border-stone-200 truncate bg-stone-50/20 uppercase">{worker.name.toUpperCase()}</td>
                      {tvDatesToRender.map(dateStr => {
                        const val = dateValues[dateStr];
                        const isRed = val !== null && val > 3;
                        const isGreen = val !== null && val < 2.5;
                        return (
                          <td 
                            key={dateStr} 
                            className={`p-2 font-mono text-[24px] border border-stone-200 text-center ${
                              val !== null 
                                ? (isRed ? 'text-red-600 font-extrabold bg-red-50/20' : isGreen ? 'text-green-600 font-extrabold bg-green-50/20' : 'text-stone-800 font-bold bg-emerald-50/10') 
                                : 'text-stone-300'
                            }`}
                          >
                            {val !== null ? val.toFixed(1) : ''}
                          </td>
                        );
                      })}
                      <td className={`p-3 font-mono font-black text-[24px] border border-stone-200 ${averageEm !== null ? (averageEm > 3 ? 'text-red-600 bg-red-50/20 font-extrabold' : averageEm < 2.5 ? 'text-green-600 bg-green-50/20 font-extrabold' : 'text-emerald-750 bg-emerald-50') : 'text-stone-400'}`}>
                        {averageEm !== null ? averageEm.toFixed(2) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Bottom Page Indicator */}
        {tvTotalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-2 pb-2">
            {Array.from({ length: tvTotalPages }).map((_, idx) => (
              <button
                key={idx}
                onClick={() => setTvPageIndex(idx)}
                className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                  idx === tvPageIndex ? 'w-8 bg-emerald-600' : 'w-2.5 bg-stone-200 hover:bg-stone-300'
                }`}
                title={`Go to page ${idx + 1}`}
              />
            ))}
            <span className="text-xs font-bold text-stone-500 ml-3">
              Page {tvPageIndex + 1} of {tvTotalPages}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col gap-6 no-print">
      {/* Sub-tab selection menu */}
      <div className="flex bg-stone-100 p-1.5 rounded-2xl no-print max-w-5xl self-center w-full shadow-sm">
        <button
          onClick={() => setActiveSubTab('grid')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'grid'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Grid3X3 size={15} /> Machine EM Grid
        </button>
        <button
          onClick={() => setActiveSubTab('individual')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'individual'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <FileText size={15} /> Individual EM Ledger
        </button>
        <button
          onClick={() => setActiveSubTab('abstract')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'abstract'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Users size={15} /> Monthly Operator EM Abstract
        </button>
        <button
          onClick={() => setActiveSubTab('operator-monthly-em')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'operator-monthly-em'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Users size={15} /> Sider Monthly EM Grid
        </button>
        <button
          onClick={() => setActiveSubTab('daily-em-report')}
          className={`flex-1 flex items-center justify-center gap-2 py-3.5 text-[10px] sm:text-xs font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
            activeSubTab === 'daily-em-report'
              ? 'bg-white text-stone-900 shadow-sm border border-stone-200'
              : 'text-stone-500 hover:text-stone-900'
          }`}
        >
          <Calendar size={15} /> Daily EM Report
        </button>
      </div>

      <AnimatePresence mode="wait">
        {activeSubTab === 'grid' && (
          <motion.div
            key="grid"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header control block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                  <div className="flex items-center gap-1 bg-stone-100 p-1 rounded-xl">
                    {(['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleShedChange(s)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer ${
                          normalizeShed(activeShedTab) === normalizeShed(s)
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'text-stone-500 hover:text-stone-900 hover:bg-stone-200/60'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
                <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Machine EM Statement ({activeShedTab})</h2>
              </div>

              {/* Month/Year selector */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                  }}
                />

                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-2xl text-emerald-800 text-[10px] font-bold uppercase tracking-wider md:mt-4 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Live EM Active{lastLiveEmTime ? ` · ${lastLiveEmTime}` : ''}</span>
                </div>

                <button
                  onClick={handleRefreshLiveEm}
                  disabled={isRefreshingEm}
                  className="flex items-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-blue-700 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                  title="Refresh live EM data from IoT telemetry"
                >
                  <RefreshCw size={14} className={isRefreshingEm ? "animate-spin" : ""} />
                  <span>{isRefreshingEm ? "Syncing..." : "Sync Live EM"}</span>
                </button>

                <button
                  onClick={exportGridToExcel}
                  className="flex items-center gap-2 bg-stone-950 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-850 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4"
                >
                  <Download size={14} /> Export Grid
                </button>
              </div>
            </div>

            {/* Grid Table display */}
            <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm overflow-x-auto relative">
              {selectedMonthDates.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center text-stone-400">
                  <Calendar size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500">No machine EM entries matched this month.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Machine EM entries will appear here once telemetry data is loaded.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs text-stone-600">
                    <thead>
                      {/* Date Header Row */}
                      <tr className="border-b border-stone-200">
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 bg-stone-50 border-r border-stone-200 min-w-[120px]">
                          Row Labels
                        </th>
                        {selectedMonthDates.map(date => (
                          <th 
                            key={date} 
                            colSpan={3} 
                            className="p-3 text-center font-black uppercase tracking-wider text-[10px] text-stone-850 bg-stone-50/50 border-r border-stone-200"
                          >
                            {date}
                          </th>
                        ))}
                      </tr>

                      {/* Shift Header Row */}
                      <tr className="border-b border-stone-100 bg-stone-50/30">
                        <th className="p-3 font-bold text-stone-400 text-center border-r border-stone-200"></th>
                        {selectedMonthDates.map(date => (
                          <React.Fragment key={`shifts-${date}`}>
                            <th className="p-2 text-center font-bold text-stone-500 border-r border-stone-100 w-[60px]">1</th>
                            <th className="p-2 text-center font-bold text-stone-500 border-r border-stone-100 w-[60px]">2</th>
                            <th className="p-2 text-center font-bold text-stone-500 border-r border-stone-200 w-[60px]">3</th>
                          </React.Fragment>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {machines.length === 0 ? (
                        <tr>
                          <td
                            colSpan={1 + selectedMonthDates.length * 3}
                            className="p-12 text-center text-stone-400 font-medium italic bg-stone-50/20"
                          >
                            No machines with data or assignments found for {activeShedTab} in {monthsList.find(m => m.value === selectedMonth)?.label} {selectedYear}.
                          </td>
                        </tr>
                      ) : (
                        machines.map(machine => {
                          return (
                            <tr key={machine} className="border-b border-stone-100 hover:bg-stone-50/50 transition-colors">
                              <td className="p-3 font-bold text-stone-900 border-r border-stone-200 bg-stone-50/30">
                                <span>{machine}</span>
                              </td>
                              {selectedMonthDates.map(date => {
                                const dateMapping = resolveEffectiveMappingForDate(
                                  date,
                                  safeSettings?.iotMachineAllocationPeriods,
                                  safeSettings?.iotMachineMappingByDate,
                                  safeSettings?.iotMachineMapping
                                );
                                const mappedDev = resolveMappedDevice(dateMapping, machine);

                                return (
                                  <React.Fragment key={`val-${machine}-${date}`}>
                                    {shifts.map(shift => {
                                      const isKttm = machine.startsWith('K') || normalizeShed(activeShedTab) === 'KTTM';
                                      const hasMappedDev = !!(mappedDev && mappedDev !== 'NONE' && mappedDev !== 'unassigned');
                                      const emFromData = (!isKttm || hasMappedDev)
                                        ? getMachineEmValue(effectiveMachineEm, date, machine, shift, dateMapping)
                                        : undefined;
                                      const ran = isMachineRunOnShift(date, shift, machine);
                                      // Only read EM value if machine actually ran / was uploaded on this date & shift
                                      const val = ran ? (emFromData !== undefined && emFromData !== null ? emFromData : undefined) : undefined;
                                      const hasVal = val !== undefined && val !== null;

                                      const now = new Date();
                                      const pad = (n: number) => n.toString().padStart(2, '0');
                                      const todayCanonical = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
                                      const isToday = normalizeToCanonicalDate(date) === todayCanonical;

                                      // Check if a saved daily report exists with entries for this date & shift
                                      const report = (effectiveHistory || []).find(r => r && r.date && normalizeToCanonicalDate(r.date) === normalizeToCanonicalDate(date));
                                      const hasSavedReport = !!(report && Array.isArray(report.entries) && report.entries.some(e => e && mapShiftToNum(e.shift) === shift));

                                      // Determine if this shift is over vs live
                                      // For live telemetry on today, show in green text; when saved report exists or on past dates, show saved EM in normal text
                                      const isLive = isToday && !hasSavedReport;

                                      return (
                                        <td 
                                          key={`cell-${machine}-${date}-${shift}`}
                                          onClick={() => {
                                            handleOpenEmDetail(date, machine, shift, val, mappedDev);
                                          }}
                                          className={`p-2.5 text-center font-mono border-r border-stone-100 transition-all hover:bg-emerald-50 hover:text-emerald-800 cursor-pointer relative group ${
                                            hasVal
                                              ? isLive
                                                ? 'text-green-600 font-extrabold bg-green-50/40'
                                                : 'text-stone-900 font-bold'
                                              : ran
                                              ? 'text-stone-400 bg-stone-50/10'
                                              : 'text-stone-300 bg-stone-50/20'
                                          }`}
                                          title={
                                            hasVal
                                              ? `${machine} · Shift ${shift} · ${date}: ${typeof val === 'number' ? val.toFixed(2) : val} (${isLive ? 'LIVE' : 'Saved EM'})`
                                              : `${machine} · Shift ${shift} · ${date} (${ran ? 'Running' : 'Not Run'})`
                                          }
                                        >
                                          <span className={isLive && hasVal ? 'text-green-600 font-extrabold inline-flex items-center justify-center gap-1' : ''}>
                                            {hasVal ? (typeof val === 'number' ? val.toFixed(2) : val) : '-'}
                                            {isLive && hasVal && (
                                              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" title="Live Telemetry" />
                                            )}
                                          </span>
                                          {hasVal && (
                                            <div className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-[8px] text-green-600 transition-opacity">
                                              <Eye size={8} />
                                            </div>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </React.Fragment>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}

                      {/* Grand Total Row */}
                      {machines.length > 0 && (
                        <tr className="bg-stone-100/50 font-bold border-t-2 border-stone-200 text-stone-900">
                          <td className="p-4 font-bold uppercase tracking-wider text-[10px] text-stone-850 border-r border-stone-200">
                            Grand Total
                          </td>
                          {selectedMonthDates.map(date => (
                            <React.Fragment key={`total-${date}`}>
                              {shifts.map(shift => {
                                const avg = calculateColAverage(date, shift);
                                const now = new Date();
                                const pad = (n: number) => n.toString().padStart(2, '0');
                                const todayCanonical = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
                                const isToday = normalizeToCanonicalDate(date) === todayCanonical;
                                const report = (effectiveHistory || []).find(r => r && r.date && normalizeToCanonicalDate(r.date) === normalizeToCanonicalDate(date));
                                const hasSavedReport = !!(report && Array.isArray(report.entries) && report.entries.some(e => e && mapShiftToNum(e.shift) === shift));
                                const curMinutes = now.getHours() * 60 + now.getMinutes();
                                const isLive = isToday && !hasSavedReport;

                                return (
                                  <td 
                                    key={`col-total-${date}-${shift}`}
                                    className={`p-3 text-center font-mono border-r border-stone-100 ${
                                      isLive ? 'text-green-600 font-extrabold bg-green-50/50' : 'text-stone-900 font-bold bg-stone-100/50'
                                    }`}
                                  >
                                    <span className={isLive && avg !== '-' ? 'inline-flex items-center justify-center gap-1 text-green-600 font-extrabold' : ''}>
                                      {avg}
                                      {isLive && avg !== '-' && (
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" title="Live Shift" />
                                      )}
                                    </span>
                                  </td>
                                );
                              })}
                            </React.Fragment>
                          ))}
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'individual' && (
          <motion.div
            key="individual"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header / Select control block */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                  <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Operator EM Ledger</h2>
                </div>

                {/* Worker Selector */}
                <div className="flex flex-col gap-1 min-w-[240px]">
                  <label className="text-[9px] font-black uppercase tracking-wider text-stone-400">Select Operator</label>
                  <select
                    value={selectedWorkerId}
                    onChange={(e) => setSelectedWorkerId(e.target.value)}
                    className="bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold rounded-xl px-4 py-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                  >
                    <option value="">-- Choose Operator --</option>
                    {workers.map(w => (
                      <option key={w.id} value={w.id}>{w.name} ({w.tNo})</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Date Filters */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                  }}
                />

                <CalendarDatePicker
                  label="From Date"
                  value={fromDate}
                  onChange={(_, iso) => setFromDate(iso || fromDate)}
                />

                <CalendarDatePicker
                  label="To Date"
                  value={toDate}
                  onChange={(_, iso) => setToDate(iso || toDate)}
                />

                <button
                  onClick={exportLedgerToExcel}
                  disabled={individualEmLedger.length === 0}
                  className="flex items-center gap-2 bg-stone-950 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-850 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  <Download size={14} /> Export Ledger
                </button>
              </div>
            </div>

            {/* Individual Table display */}
            <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative">
              {!selectedWorkerId ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <Users size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500 font-medium">No operator selected.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Please select an operator in the dropdown menu to view their ledger.</p>
                </div>
              ) : individualEmLedger.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <FileText size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500 font-medium">No ledger entries match this date range.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Verify dates and worker active schedules.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-stone-50 border border-stone-200/60 p-5 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block mb-1">Total Shifts worked</span>
                      <span className="text-3xl font-bold text-stone-900">{individualStats.totalShifts}</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-200/60 p-5 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block mb-1">Average Actual GPS</span>
                      <span className="text-3xl font-bold text-emerald-600">{individualStats.avgGps.toFixed(3)}</span>
                    </div>
                    <div className="bg-stone-50 border border-stone-200/60 p-5 rounded-2xl">
                      <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block mb-1">Average EM Value</span>
                      <span className="text-3xl font-bold text-indigo-600">{individualStats.avgEm.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Table */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs text-stone-600">
                      <thead>
                        <tr className="border-b border-stone-200 text-stone-400 bg-stone-50/50">
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 w-[80px]">S.No</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850">Date</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 text-center">Shift</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 text-center">Machine</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850">Count</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 text-right">Actual GPS</th>
                          <th className="p-3 font-black uppercase tracking-wider text-[10px] text-stone-850 text-right">EM Value</th>
                        </tr>
                      </thead>
                      <tbody>
                        {individualEmLedger.map((group, groupIdx) => {
                          const rowSpan = group.machines.length;
                          return group.machines.map((m, mIdx) => {
                            const isFirst = mIdx === 0;
                            return (
                              <tr 
                                key={`${group.id}-${m.frameNo}-${mIdx}`} 
                                className={cn(
                                  "border-b border-stone-100 hover:bg-stone-50/40 transition-colors",
                                  mIdx > 0 && "bg-stone-50/15"
                                )}
                              >
                                {isFirst && (
                                  <>
                                    <td rowSpan={rowSpan} className="p-3 font-medium text-stone-400 align-middle border-r border-stone-100/60">
                                      {groupIdx + 1}
                                    </td>
                                    <td rowSpan={rowSpan} className="p-3 font-bold text-stone-800 align-middle border-r border-stone-100/60">
                                      {group.date}
                                    </td>
                                    <td rowSpan={rowSpan} className="p-3 text-center font-bold text-stone-700 align-middle border-r border-stone-100/60">
                                      <span className="px-2 py-0.5 rounded-lg bg-stone-100 text-stone-800 text-xs font-mono">
                                        {group.shift}
                                      </span>
                                    </td>
                                  </>
                                )}
                                <td className="p-3 text-center font-bold text-stone-700">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="font-mono text-stone-900">{m.frameNo}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 font-semibold uppercase">
                                      {m.sideLabel}
                                    </span>
                                  </span>
                                </td>
                                <td className="p-3 font-mono text-stone-500">
                                  {m.count || '-'}
                                </td>
                                <td className="p-3 text-right font-mono text-stone-600 font-bold">
                                  {m.gps.toFixed(3)}
                                </td>
                                {isFirst && (() => {
                                  const now = new Date();
                                  const pad = (n: number) => n.toString().padStart(2, '0');
                                  const todayCanonical = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
                                  const isToday = normalizeToCanonicalDate(group.date) === todayCanonical;
                                  const shiftNum = mapShiftToNum(group.shift);
                                  const report = (effectiveHistory || []).find(r => r && r.date && normalizeToCanonicalDate(r.date) === todayCanonical);
                                  const hasSavedReport = !!(report && Array.isArray(report.entries) && report.entries.some(e => e && mapShiftToNum(e.shift) === shiftNum));
                                  const isGroupLive = isToday && !hasSavedReport;

                                  return (
                                    <td 
                                      rowSpan={rowSpan}
                                      onClick={() => handleOpenGroupedEmDetail(group)}
                                      className={`p-3 text-right font-mono transition-colors align-middle border-l border-stone-100/60 cursor-pointer ${
                                        isGroupLive
                                          ? 'text-emerald-600 font-black bg-emerald-50/30 hover:bg-emerald-50'
                                          : 'text-stone-900 font-bold hover:bg-stone-50/70'
                                      }`}
                                      title={`Click to view EM breakdown for ${group.totalSides} sides (${isGroupLive ? 'Live Telemetry' : 'Saved EM'})`}
                                    >
                                      <span className="inline-flex items-center justify-end gap-1.5">
                                        <span className={`text-sm ${isGroupLive ? 'font-black text-emerald-600' : 'font-bold text-stone-900'}`}>
                                          {group.avgEm.toFixed(2)}
                                        </span>
                                        {isGroupLive && (
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" title="Live Telemetry" />
                                        )}
                                        <Eye size={12} className={isGroupLive ? "text-emerald-500 opacity-80" : "text-stone-400 opacity-60"} />
                                      </span>
                                    </td>
                                  );
                                })()}
                              </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'abstract' && (
          <motion.div
            key="abstract"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header control block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Operator EM Monthly Abstract</h2>
              </div>

              {/* Month/Year selector */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                  }}
                />

                <button
                  onClick={exportAbstractToExcel}
                  disabled={monthlyAbstract.length === 0}
                  className="flex items-center gap-2 bg-stone-950 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-850 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  <Download size={14} /> Export Abstract
                </button>
              </div>
            </div>

            {/* Abstract Table display */}
            <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm overflow-x-auto relative">
              {monthlyAbstract.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <Users size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500">No shift records exist for this month.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Complete assignments and upload data first.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs text-stone-600">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-400 bg-stone-50/50">
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 w-[80px]">S.No</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850">Ticket Number</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850">Operator Name</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 text-center">Total Shifts Worked</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 text-right">Average GPS</th>
                        <th className="p-4 font-black uppercase tracking-wider text-[10px] text-stone-850 text-right">Average EM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlyAbstract.map((item, idx) => (
                        <tr key={item.id} className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors">
                          <td className="p-4 font-medium text-stone-400">{idx + 1}</td>
                          <td className="p-4 font-bold text-stone-800">{item.tNo}</td>
                          <td className="p-4 font-bold text-stone-900">{item.name}</td>
                          <td className="p-4 text-center font-bold text-stone-700 bg-stone-50/30">{item.shifts}</td>
                          <td className="p-4 text-right font-mono text-stone-600 font-bold">{item.avgGps.toFixed(3)}</td>
                          <td className="p-4 text-right font-mono text-indigo-600 font-black">{item.avgEm.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'operator-monthly-em' && (
          <motion.div
            key="operator-monthly-em"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header control block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Sider Monthly EM Statement</h2>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                  }}
                />

                <div className="flex flex-col gap-1 min-w-[200px]">
                  <label className="text-[9px] font-black uppercase tracking-wider text-stone-400">Search Operator</label>
                  <input
                    type="text"
                    placeholder="Name or Ticket No..."
                    value={operatorSearchQuery}
                    onChange={(e) => setOperatorSearchQuery(e.target.value)}
                    className="bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold rounded-xl px-4 py-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none placeholder:text-stone-300"
                  />
                </div>

                <button
                  onClick={exportOperatorMonthlyToExcel}
                  disabled={operatorEmGridData.length === 0}
                  className="flex items-center gap-2 bg-stone-950 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-850 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  <Download size={14} /> Export Sheet
                </button>
              </div>
            </div>

            {/* Main Table Grid */}
            <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm overflow-x-auto relative">
              {filteredOperatorGridData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <Users size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500">No matching operators found.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Try checking selected month/year or search keywords.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-center text-[15px] text-stone-600 border border-stone-200">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500 bg-stone-50">
                        <th className="p-3 text-left font-black uppercase tracking-wider text-[13px] text-stone-800 w-[100px] border border-stone-200">TNo</th>
                        <th className="p-3 text-left font-black uppercase tracking-wider text-[13px] text-stone-800 w-[180px] border border-stone-200">Sider Name</th>
                        {calendarDates.map(dateStr => {
                          const dp = parseUniversalDateParts(dateStr);
                          const dayNum = dp ? dp.day : dateStr;
                          return (
                            <th key={dateStr} className="p-1 font-black text-[13px] text-stone-800 border border-stone-200 w-[35px] text-center bg-stone-50">
                              {dayNum}
                            </th>
                          );
                        })}
                        <th className="p-3 font-black uppercase tracking-wider text-[13px] text-emerald-700 w-[80px] border border-stone-200 bg-emerald-50">Avg EM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredOperatorGridData.map(({ worker, dateValues, averageEm }) => (
                        <tr key={worker.id} className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors">
                          <td className="p-3 text-left font-mono font-bold text-stone-500 border border-stone-200 bg-stone-50/20">{worker.tNo}</td>
                          <td className="p-3 text-left font-bold text-stone-900 border border-stone-200 truncate bg-stone-50/20 uppercase">{worker.name.toUpperCase()}</td>
                          {calendarDates.map(dateStr => {
                            const val = dateValues[dateStr];
                            const isRed = val !== null && val > 3;
                            const isGreen = val !== null && val < 2.5;
                            return (
                              <td 
                                key={dateStr} 
                                className={`p-1 font-mono border border-stone-200 text-center ${
                                  val !== null 
                                    ? (isRed ? 'text-red-600 font-extrabold bg-red-50/20' : isGreen ? 'text-green-600 font-extrabold bg-green-50/20' : 'text-stone-800 font-bold bg-emerald-50/10') 
                                    : 'text-stone-300'
                                }`}
                              >
                                {val !== null ? val.toFixed(1) : ''}
                              </td>
                            );
                          })}
                          <td className={`p-3 font-mono font-black border border-stone-200 ${averageEm !== null ? (averageEm > 3 ? 'text-red-600 bg-red-50/20 font-extrabold' : averageEm < 2.5 ? 'text-green-600 bg-green-50/20 font-extrabold' : 'text-emerald-700 bg-emerald-50') : 'text-stone-400'}`}>
                            {averageEm !== null ? averageEm.toFixed(2) : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {activeSubTab === 'daily-em-report' && (
          <motion.div
            key="daily-em-report"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="flex flex-col gap-6"
          >
            {/* Header control block */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-8 rounded-[2.5rem] border border-stone-200 shadow-sm">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Operator EM Format</span>
                <h2 className="font-serif italic text-3xl tracking-tighter text-stone-900">Daily EM Report Statement</h2>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-4">
                <CalendarMonthPicker
                  month={selectedMonth}
                  year={selectedYear}
                  onChange={(m, y) => {
                    setSelectedMonth(m);
                    setSelectedYear(y);
                  }}
                />

                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-black uppercase tracking-wider text-stone-400">Select Date</label>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const availableList = selectedMonthHistoryDates.length > 0 ? selectedMonthHistoryDates : calendarDates;
                        const currentCanonical = normalizeToCanonicalDate(selectedDailyEmDate);
                        const currentIdx = availableList.indexOf(currentCanonical);
                        if (currentIdx > 0) {
                          setSelectedDailyEmDate(availableList[currentIdx - 1]);
                        }
                      }}
                      disabled={(selectedMonthHistoryDates.length || calendarDates.length) <= 1}
                      className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-750 hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-50"
                      title="Previous available date in selected month"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <input
                      type="date"
                      value={dateToInputString(selectedDailyEmDate)}
                      onChange={(e) => {
                        const newDateStr = inputStringToDate(e.target.value);
                        if (newDateStr) setSelectedDailyEmDate(newDateStr);
                      }}
                      className="bg-stone-50 border border-stone-200 text-stone-700 text-xs font-bold rounded-xl px-4 py-2.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                    />
                    <button
                      onClick={() => {
                        const availableList = selectedMonthHistoryDates.length > 0 ? selectedMonthHistoryDates : calendarDates;
                        const currentCanonical = normalizeToCanonicalDate(selectedDailyEmDate);
                        const currentIdx = availableList.indexOf(currentCanonical);
                        if (currentIdx !== -1 && currentIdx < availableList.length - 1) {
                          setSelectedDailyEmDate(availableList[currentIdx + 1]);
                        }
                      }}
                      disabled={(selectedMonthHistoryDates.length || calendarDates.length) <= 1}
                      className="p-2.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-750 hover:bg-stone-100 transition-colors cursor-pointer disabled:opacity-50"
                      title="Next available date in selected month"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-2xl text-emerald-800 text-[10px] font-bold uppercase tracking-wider md:mt-4 shadow-2xs">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Live EM Active{lastLiveEmTime ? ` · ${lastLiveEmTime}` : ''}</span>
                </div>

                <button
                  onClick={handleRefreshLiveEm}
                  disabled={isRefreshingEm}
                  className="flex items-center gap-2 bg-blue-600 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-blue-700 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                  title="Refresh live EM data from IoT telemetry"
                >
                  <RefreshCw size={14} className={isRefreshingEm ? "animate-spin" : ""} />
                  <span>{isRefreshingEm ? "Syncing..." : "Sync Live EM"}</span>
                </button>

                <button
                  onClick={exportDailyEmToExcel}
                  disabled={dailyEmRows.length === 0}
                  className="flex items-center gap-2 bg-stone-900 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-stone-800 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  <Download size={14} /> Export Excel
                </button>

                <button
                  onClick={exportDailyEmToPdf}
                  disabled={dailyEmRows.length === 0 || isExportingPdf}
                  className="flex items-center gap-2 bg-red-700 text-white font-black text-xs uppercase tracking-wider px-5 py-3 rounded-2xl hover:bg-red-800 active:scale-95 transition-all cursor-pointer shadow-sm md:mt-4 disabled:opacity-50"
                >
                  {isExportingPdf ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Exporting PDF...
                    </>
                  ) : (
                    <>
                      <FileText size={14} /> Export PDF (Portrait)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Daily EM Report Table Display */}
            <div 
              id="daily-em-report-pdf-container"
              ref={dailyReportRef}
              className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm relative flex flex-col items-center"
            >
              {/* Report Header Title Block to match user's custom design request */}
              <div className="w-full max-w-4xl border-b border-stone-200 pb-6 mb-6 flex flex-col items-center text-center">
                <h1 className="text-3xl font-serif italic text-stone-900 tracking-tight">Daily Em Report</h1>
                <div className="text-lg font-mono font-bold text-stone-600 mt-2 bg-stone-50 px-4 py-1 rounded-full border border-stone-100 shadow-xs">
                  {selectedDailyEmDate || 'No Date Selected'}
                </div>
                {dailyEmRows.length > 0 && (
                  <div className="flex flex-wrap items-center justify-center gap-3 mt-3">
                    <span className="px-3.5 py-1 rounded-full bg-stone-100 text-stone-700 text-xs font-bold border border-stone-200">
                      Total Machine Duties: <strong className="font-mono text-stone-900 ml-1">{dailyEmRows.length}</strong>
                    </span>
                    <span className="px-4 py-1 rounded-full bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs">
                      Selected Date Total Average EM: <strong className="font-mono text-emerald-700 text-sm ml-1.5">{(dailyEmRows.reduce((sum, r) => sum + (r.em || 0), 0) / dailyEmRows.length).toFixed(2)} min</strong>
                    </span>
                  </div>
                )}
              </div>

              {dailyEmRows.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-stone-400">
                  <AlertCircle size={40} className="stroke-1 text-stone-300 mb-3" />
                  <p className="font-serif italic text-lg text-stone-500">No shift records exist for {selectedDailyEmDate || 'the selected date'}.</p>
                  <p className="text-[10px] font-black uppercase tracking-wider mt-1 text-stone-400">Please select a different date from the controls above.</p>
                </div>
              ) : (
                <div className="overflow-x-auto w-full max-w-4xl">
                  <table className="w-full border-collapse text-left text-stone-700 border border-stone-200 shadow-xs rounded-2xl overflow-hidden">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 text-stone-800 font-bold">
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 font-extrabold uppercase tracking-wider">TNo</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 font-extrabold uppercase tracking-wider">Sider Name</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 text-center font-extrabold uppercase tracking-wider">Shift</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 text-center font-extrabold uppercase tracking-wider">MC NO</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 text-center font-extrabold uppercase tracking-wider">Count</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-r border-stone-200 border-b border-stone-200 text-right font-extrabold uppercase tracking-wider">GPS</th>
                        <th style={{ fontSize: '15px' }} className="p-4 border-b border-stone-200 text-right font-extrabold uppercase tracking-wider text-emerald-800 bg-emerald-50/50">EM</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dailyEmRows.map((row, idx) => {
                        const now = new Date();
                        const pad = (n: number) => n.toString().padStart(2, '0');
                        const todayCanonical = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
                        const isSelectedDateToday = normalizeToCanonicalDate(selectedDailyEmDate) === todayCanonical;
                        const shiftNum = mapShiftToNum(row.shift);
                        const report = (effectiveHistory || []).find(r => r && r.date && normalizeToCanonicalDate(r.date) === todayCanonical);
                        const hasSavedReport = !!(report && Array.isArray(report.entries) && report.entries.some(e => e && mapShiftToNum(e.shift) === shiftNum));
                        const isRowLive = isSelectedDateToday && !hasSavedReport;

                        return (
                          <tr 
                            key={`${row.siderName}-${row.mcNo}-${row.shift}-${idx}`} 
                            className="border-b border-stone-100 hover:bg-stone-50/30 transition-colors"
                          >
                            <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 font-mono text-stone-600">
                              {row.tNo || '-'}
                            </td>
                            <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 font-bold text-stone-900 uppercase">
                              {row.siderName.toUpperCase()}
                            </td>
                            <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 text-center font-bold text-stone-500">{row.shift}</td>
                            <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 text-center font-mono font-bold text-stone-800 bg-stone-50/30">{row.mcNo}</td>
                            <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 text-center font-semibold text-stone-600">{row.count || '-'}</td>
                            <td style={{ fontSize: '17px' }} className="p-4 border-r border-stone-200 text-right font-mono text-stone-600 font-medium">
                              {row.gps ? Math.round(row.gps) : '-'}
                            </td>
                            <td style={{ fontSize: '17px' }} className={`p-4 text-right font-mono font-black border-l border-stone-100 ${row.em !== null ? (isRowLive ? 'text-emerald-600 bg-emerald-50/30 font-black' : row.em > 3 ? 'text-red-600 font-extrabold bg-red-50/20' : row.em < 2.5 ? 'text-green-600 font-extrabold bg-green-50/20' : 'text-stone-800 bg-emerald-50/20') : 'text-stone-400'}`}>
                              <span className={isRowLive && row.em !== null ? 'inline-flex items-center justify-end gap-1.5' : ''}>
                                {row.em !== null ? row.em.toFixed(2) : '-'}
                                {isRowLive && row.em !== null && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" title="Live Shift Telemetry" />
                                )}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    {dailyEmRows.length > 0 && (() => {
                      const now = new Date();
                      const pad = (n: number) => n.toString().padStart(2, '0');
                      const todayCanonical = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
                      const isSelectedDateToday = normalizeToCanonicalDate(selectedDailyEmDate) === todayCanonical;
                      const report = (effectiveHistory || []).find(r => r && r.date && normalizeToCanonicalDate(r.date) === todayCanonical);
                      const isLive = isSelectedDateToday && (!report || !report.entries || report.entries.length === 0);

                      return (
                        <tfoot>
                          <tr className="bg-stone-100 font-black border-t-2 border-stone-200">
                            <td colSpan={6} style={{ fontSize: '15px' }} className="p-4 text-right uppercase tracking-wider text-stone-800 font-bold border-r border-stone-200">
                              Average EM:
                            </td>
                            <td style={{ fontSize: '17px' }} className={`p-4 text-right font-mono font-extrabold ${isLive ? 'text-emerald-700 bg-emerald-50/50' : 'text-stone-900'}`}>
                              <span className={isLive ? 'inline-flex items-center justify-end gap-1.5' : ''}>
                                {(dailyEmRows.reduce((sum, r) => sum + (r.em || 0), 0) / dailyEmRows.length).toFixed(2)}
                                {isLive && (
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" title="Live Shift" />
                                )}
                              </span>
                            </td>
                          </tr>
                        </tfoot>
                      );
                    })()}
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Machine EM Side Details Modal (Left EM, Right EM, Total EM) */}
      {activeEmDetail && (
        <div 
          className="fixed inset-0 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50"
          onClick={() => setActiveEmDetail(null)}
        >
          <motion.div 
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white p-7 rounded-[2rem] border border-stone-200 shadow-2xl max-w-md w-full flex flex-col gap-5"
          >
            {/* Modal Header */}
            <div className="flex justify-between items-start">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200 shadow-xs">
                  <Activity size={18} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">
                    {activeEmDetail.isMultiMachine 
                      ? `Operator Shift EM Breakdown (${activeEmDetail.totalSides || 3} Sides)` 
                      : 'Machine EM Breakdown'}
                  </span>
                  <h3 className="text-xl font-black text-stone-900 uppercase tracking-tight font-sans flex items-center gap-2">
                    {activeEmDetail.isMultiMachine ? (
                      activeEmDetail.machines?.map((m, idx) => (
                        <span key={m.frameNo} className="inline-flex items-center gap-1">
                          {idx > 0 && <span className="text-stone-300 font-normal">&amp;</span>}
                          <span>Frame <span className="font-mono text-emerald-800">{m.frameNo}</span></span>
                        </span>
                      ))
                    ) : (
                      <>Frame <span className="font-mono text-emerald-800">{activeEmDetail.machine}</span></>
                    )}
                  </h3>
                </div>
              </div>
              <button 
                onClick={() => setActiveEmDetail(null)}
                className="p-1.5 rounded-full text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Context Badge (Date, Shift, IoT Machine) */}
            <div className="bg-stone-50 p-3.5 rounded-2xl border border-stone-200/80 flex items-center justify-between text-xs text-stone-600">
              <div className="flex items-center gap-1.5">
                <Calendar size={13} className="text-stone-400" />
                <span className="font-bold text-stone-900">{activeEmDetail.date}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-lg bg-stone-200/80 font-bold text-stone-800 text-[11px] font-mono">
                  Shift {activeEmDetail.shift}
                </span>
              </div>
            </div>

            {activeEmDetail.isMultiMachine && activeEmDetail.machines ? (
              <div className="space-y-3.5">
                {activeEmDetail.machines.map((m, mIdx) => {
                  const isTwoSides = m.sides === 2;
                  return (
                    <div key={`${m.frameNo}-${mIdx}`} className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-stone-900 text-stone-50 font-mono text-xs font-bold">
                            Frame {m.frameNo}
                          </span>
                          <span className="text-xs font-bold text-stone-600 uppercase">
                            {m.sideLabel} ({m.sides} {m.sides === 1 ? 'Side' : 'Sides'})
                          </span>
                        </div>
                        <span className="text-xs font-mono font-bold text-stone-500">
                          Avg: <strong className="text-stone-900">{m.assignedEm.toFixed(2)} min</strong>
                        </span>
                      </div>

                      {isTwoSides ? (
                        <div className="grid grid-cols-2 gap-2.5">
                          <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-100 flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Left Side (LH)</span>
                            <span className="font-mono text-lg font-black text-blue-950 mt-0.5">
                              {m.emLeft !== undefined ? m.emLeft.toFixed(2) : m.assignedEm.toFixed(2)}
                              <span className="text-[10px] font-normal text-blue-600 ml-1">min</span>
                            </span>
                          </div>
                          <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700">Right Side (RH)</span>
                            <span className="font-mono text-lg font-black text-indigo-950 mt-0.5">
                              {m.emRight !== undefined ? m.emRight.toFixed(2) : m.assignedEm.toFixed(2)}
                              <span className="text-[10px] font-normal text-indigo-600 ml-1">min</span>
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/80 flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                            3rd Side EM ({m.sideLabel})
                          </span>
                          <span className="font-mono text-lg font-black text-amber-950">
                            {m.assignedEm.toFixed(2)}
                            <span className="text-xs font-normal text-amber-700 ml-1">min</span>
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Overall Weighted 3-Side Average EM Highlight */}
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-5 rounded-2xl text-white shadow-md shadow-emerald-600/20 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-emerald-100 text-xs font-bold uppercase tracking-wider">
                    <span>Combined Shift Average EM</span>
                    <span className="text-[10px] font-mono text-emerald-200 px-2 py-0.5 rounded bg-white/10">
                      Average of {activeEmDetail.totalSides || 3} Sides
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <div className="font-mono text-3xl font-black text-white tracking-tight">
                      {(activeEmDetail.combinedAvgEm ?? activeEmDetail.emTotal).toFixed(2)}
                      <span className="text-sm font-normal text-emerald-100 ml-1.5">min</span>
                    </div>
                    <div className="text-[11px] text-emerald-100/90 font-medium text-right">
                      {activeEmDetail.machines.map(m => `${m.assignedEm.toFixed(2)}×${m.sides}`).join(' + ')} ÷ {activeEmDetail.totalSides || 3}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Sides Grid: Left EM & Right EM for single machine */}
                <div className="grid grid-cols-2 gap-3">
                  {/* Left Side */}
                  <div className="bg-gradient-to-br from-blue-50/80 to-blue-50/20 p-4 rounded-2xl border border-blue-100 flex flex-col">
                    <div className="flex items-center justify-between text-blue-700 text-[11px] font-bold uppercase tracking-wider mb-2">
                      <span>Left Side EM</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-100/80 text-[10px] font-mono">Side L</span>
                    </div>
                    <div className="font-mono text-2xl font-black text-blue-950">
                      {activeEmDetail.emLeft !== undefined ? activeEmDetail.emLeft.toFixed(2) : '-'}
                      <span className="text-xs font-normal text-blue-600 ml-1">min</span>
                    </div>
                    {activeEmDetail.breaksLeft !== undefined && (
                      <div className="text-[11px] text-blue-700/80 mt-1 font-medium">
                        {activeEmDetail.breaksLeft} end breaks
                      </div>
                    )}
                  </div>

                  {/* Right Side */}
                  <div className="bg-gradient-to-br from-indigo-50/80 to-indigo-50/20 p-4 rounded-2xl border border-indigo-100 flex flex-col">
                    <div className="flex items-center justify-between text-indigo-700 text-[11px] font-bold uppercase tracking-wider mb-2">
                      <span>Right Side EM</span>
                      <span className="px-1.5 py-0.5 rounded bg-indigo-100/80 text-[10px] font-mono">Side R</span>
                    </div>
                    <div className="font-mono text-2xl font-black text-indigo-950">
                      {activeEmDetail.emRight !== undefined ? activeEmDetail.emRight.toFixed(2) : '-'}
                      <span className="text-xs font-normal text-indigo-600 ml-1">min</span>
                    </div>
                    {activeEmDetail.breaksRight !== undefined && (
                      <div className="text-[11px] text-indigo-700/80 mt-1 font-medium">
                        {activeEmDetail.breaksRight} end breaks
                      </div>
                    )}
                  </div>
                </div>

                {/* Average Machine EM Highlight (Side L & Side R Average) */}
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 p-4 rounded-2xl text-white shadow-sm shadow-emerald-600/20 flex flex-col gap-1">
                  <div className="flex items-center justify-between text-emerald-100 text-xs font-bold uppercase tracking-wider">
                    <span>Machine Average EM</span>
                    <span className="text-[10px] font-mono text-emerald-200">(Side L + Side R) / 2</span>
                  </div>
                  <div className="flex items-baseline justify-between mt-1">
                    <div className="font-mono text-3xl font-black text-white tracking-tight">
                      {((activeEmDetail.emLeft !== undefined && activeEmDetail.emRight !== undefined && (activeEmDetail.emLeft > 0 || activeEmDetail.emRight > 0))
                        ? ((activeEmDetail.emLeft + activeEmDetail.emRight) / 2)
                        : (activeEmDetail.emTotal > 0 ? (activeEmDetail.emTotal / 2) : 0)).toFixed(2)}
                      <span className="text-sm font-normal text-emerald-100 ml-1.5">min</span>
                    </div>
                    <div className="text-xs text-emerald-100 font-medium">
                      Total: {activeEmDetail.emTotal.toFixed(2)} min
                    </div>
                  </div>
                </div>

                {/* Total Machine EM Breakdown */}
                <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-2xl text-stone-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-600 uppercase tracking-wider">Total Combined EM</span>
                  <span className="font-mono text-base font-black text-stone-900">{activeEmDetail.emTotal.toFixed(2)} min</span>
                </div>
              </>
            )}

            {/* Close Button */}
            <div className="flex justify-end mt-1">
              <button
                type="button"
                onClick={() => setActiveEmDetail(null)}
                className="w-full py-3 rounded-xl bg-stone-900 hover:bg-stone-850 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-xs active:scale-95"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export { getMachineEmValue, resolveMappedDevice };
