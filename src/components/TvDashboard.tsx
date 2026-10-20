'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Play, Pause, ChevronLeft, ChevronRight, Maximize, Minimize, 
  X, Activity, Trophy, BarChart3, Table, TrendingUp, Grid3X3, 
  Calendar, Clock, Check, Users, Gauge, Layers, Star, Zap,
  Award, ArrowUpRight, Sparkles, Medal, UserCheck, Coins, FileText, Target,
  Wrench, AlertTriangle, ArrowLeft, RefreshCw, ChevronDown
} from 'lucide-react';
import { DailyReport, Sider, IncentiveRule, Shift, SystemSettings, MachineEmData, CountConversion, FrozenMonthRecord, Shed } from '../types';
import { cn, parseUniversalDateParts, parseUniversalDate } from '../lib/utils';
import { ensureSixMachines, createDefaultReportForShed, getTodayUniversalDate } from '../lib/parser';

// Import the 17 core application components
import { KPIStats } from './KPIStats';
import { PerformanceChart } from './PerformanceChart';
import { ReportView } from './ReportView';
import { DailyIncentive } from './DailyIncentive';
import { MachineDailyIncentive } from './MachineDailyIncentive';
import { RunningCountIncentives } from './RunningCountIncentives';
import { MonthlyGrid } from './MonthlyGrid';
import { MonthAbstract } from './MonthAbstract';
import { SiderMonthlyPerformance } from './SiderMonthlyPerformance';
import { OperatorEmFormat } from './OperatorEmFormat';
import { AiMonthlyGrid } from './AiMonthlyGrid';
import { AiMonthAbstract } from './AiMonthAbstract';
import { AiMonthlyPerformance } from './AiMonthlyPerformance';
import { BestShift } from './BestShift';
import { BestSider } from './BestSider';
import { BestOperatorsEm } from './BestOperatorsEm';
import { EmOutliersCompare } from './EmOutliersCompare';
import { FitterMonthlyPerformance } from './FitterMonthlyPerformance';

export interface TvSubPageDef {
  id: string; // matches component routing key
  title: string;
  shortTitle: string;
  defaultSeconds: number;
  description: string;
}

export interface TvMainPageDef {
  id: string;
  chapterNumber: number;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  subPages: TvSubPageDef[];
}

// Definition of the 10 Main Pages and their 17 Sub-Pages
export const TV_MAIN_PAGES: TvMainPageDef[] = [
  {
    id: 'main-dashboard',
    chapterNumber: 1,
    title: 'Live Plant Operations',
    subtitle: 'Real-time production, active efficiency & frame speed',
    icon: Gauge,
    subPages: [
      {
        id: 'dashboard',
        title: 'Plant KPI & Production Velocity',
        shortTitle: 'KPI Telemetry',
        defaultSeconds: 15,
        description: 'Plant target vs actual kg, GPS averages, breakages & machine performance'
      }
    ]
  },
  {
    id: 'main-statement',
    chapterNumber: 2,
    title: 'Daily Production Statement',
    subtitle: 'Technical shift statement across all ring frames (K01–K06)',
    icon: FileText,
    subPages: [
      {
        id: 'reports',
        title: 'Full Frame Shift Production Ledger',
        shortTitle: 'Production Statement',
        defaultSeconds: 20,
        description: 'Shift I, II, III production kg, GPS, efficiency %, EMT doff & idle stats'
      }
    ]
  },
  {
    id: 'main-incentives',
    chapterNumber: 3,
    title: 'Daily Incentive Intelligence',
    subtitle: 'Operator performance rewards and frame distribution',
    icon: Coins,
    subPages: [
      {
        id: 'daily-incentive',
        title: 'Worker-Wise Daily Incentive Breakdown',
        shortTitle: 'Worker Breakdown',
        defaultSeconds: 15,
        description: 'Individual sider earnings, GPS vs threshold, shift duties & gaiter pay'
      },
      {
        id: 'daily-incentive-machine',
        title: 'Machine-Wise Frame Incentive Summary',
        shortTitle: 'Machine Allocation',
        defaultSeconds: 15,
        description: 'Machine frame (K01–K06) payouts, sider allocations & frame incentive sums'
      }
    ]
  },
  {
    id: 'main-counts',
    chapterNumber: 4,
    title: 'Running Count GPS Rules',
    subtitle: 'Standard GPS target matrix & count incentive tiers',
    icon: Layers,
    subPages: [
      {
        id: 'running-count-incentives',
        title: 'GPS to Payout Tier Reference Matrix',
        shortTitle: 'GPS Tier Matrix',
        defaultSeconds: 15,
        description: 'Active yarn counts (30s, 32s, 34s, 40s) GPS threshold & payout rules'
      }
    ]
  },
  {
    id: 'main-monthly-payroll',
    chapterNumber: 5,
    title: 'Monthly Sider Payroll & Grid',
    subtitle: 'Month-to-date calendar tracking & payroll abstract',
    icon: Calendar,
    subPages: [
      {
        id: 'month-view',
        title: 'Monthly Sider Incentive Calendar Grid',
        shortTitle: 'Monthly Grid',
        defaultSeconds: 0, // Omitted by default, enabled via settings
        description: '30-day color-coded worker calendar grid showing daily performance'
      },
      {
        id: 'month-abstract',
        title: 'Monthly Sider Payroll Abstract',
        shortTitle: 'Payroll Abstract',
        defaultSeconds: 0, // Omitted by default, enabled via settings
        description: 'Cumulative monthly payout, worked days, accumulated GPS & duty totals'
      }
    ]
  },
  {
    id: 'main-sider-performance',
    chapterNumber: 6,
    title: 'Sider Monthly Performance',
    subtitle: 'Individual worker trends, duty history & GPS curves',
    icon: TrendingUp,
    subPages: [
      {
        id: 'sider-monthly-performance',
        title: 'Sider Performance Profile Cards',
        shortTitle: 'Performance Cards',
        defaultSeconds: 15,
        description: 'Auto-cycling performance cards for each sider pair with historical stats'
      }
    ]
  },
  {
    id: 'main-em-quality',
    chapterNumber: 7,
    title: 'End-Break Quality (EM) & Outliers',
    subtitle: 'Spindle breakages per minute, frame outliers & top operators',
    icon: AlertTriangle,
    subPages: [
      {
        id: 'operator-em-format',
        title: 'Machine-Wise EM Format Table',
        shortTitle: 'EM Table',
        defaultSeconds: 15,
        description: 'Machine EM % across shifts with high-limit threshold highlighting'
      },
      {
        id: 'best-operators-em',
        title: 'Top 2 Lowest Breakage Operators',
        shortTitle: 'Best 2 Operators EM',
        defaultSeconds: 15,
        description: 'Comparison of the top 2 operators maintaining the cleanest frames'
      },
      {
        id: 'em-outliers-compare',
        title: 'EM Top vs Bottom Outliers Comparison',
        shortTitle: 'Outliers Compare',
        defaultSeconds: 15,
        description: 'Side-by-side analysis of best vs worst frames for floor supervision'
      }
    ]
  },
  {
    id: 'main-ai-coner',
    chapterNumber: 8,
    title: 'AI Linkconer Automation',
    subtitle: 'Winding & package automation unit telemetry',
    icon: Zap,
    subPages: [
      {
        id: 'ai-month-view',
        title: 'AI Linkconer Monthly Grid',
        shortTitle: 'AI Monthly Grid',
        defaultSeconds: 0, // Omitted by default, enabled via settings
        description: 'Monthly calendar grid specifically for AI Linkconer operators'
      },
      {
        id: 'ai-month-abstract',
        title: 'AI Linkconer Payroll Abstract',
        shortTitle: 'AI Payroll Abstract',
        defaultSeconds: 0, // Omitted by default, enabled via settings
        description: 'Monthly payroll abstract for AI Linkconer winding operators'
      },
      {
        id: 'ai-monthly-performance',
        title: 'AI Linkconer Operator Performance',
        shortTitle: 'AI Operator Cards',
        defaultSeconds: 15,
        description: 'Individual operator performance profile cards for AI Linkconer'
      }
    ]
  },
  {
    id: 'main-champions',
    chapterNumber: 9,
    title: 'Mill Champions & Shift Awards',
    subtitle: 'Plant leaderboards, winning shift of the day & monthly stars',
    icon: Trophy,
    subPages: [
      {
        id: 'best-shift',
        title: 'Best Shift of the Day Award',
        shortTitle: 'Best Shift',
        defaultSeconds: 15,
        description: 'Winning shift banner: highest GPS, lowest breakage & full team roster'
      },
      {
        id: 'best',
        title: 'Best Siders of the Month Leaderboard',
        shortTitle: 'Best Siders',
        defaultSeconds: 15,
        description: 'Monthly worker leaderboard with podium photos, badge & incentive stats'
      }
    ]
  },
  {
    id: 'main-maintenance',
    chapterNumber: 10,
    title: 'Mechanical Maintenance Team',
    subtitle: 'Fitter staff duty allocation and maintenance monitoring',
    icon: Wrench,
    subPages: [
      {
        id: 'fitter-monthly-performance',
        title: 'Fitter Monthly Maintenance Performance',
        shortTitle: 'Fitter Performance',
        defaultSeconds: 15,
        description: 'Monthly maintenance duties and technical performance for mechanical fitters'
      }
    ]
  },
  {
    id: 'main-multi-shed',
    chapterNumber: 11,
    title: 'Multi-Shed Comparison',
    subtitle: 'Cross-shed performance comparison, production totals & 40s GPS',
    icon: Grid3X3,
    subPages: [
      {
        id: 'sheds',
        title: 'Multi-Shed Comparison',
        shortTitle: 'Multi-Shed',
        defaultSeconds: 20,
        description: 'Comparative overview of Shed 1, Shed 2, Shed 3, and KTTM'
      }
    ]
  },
  {
    id: 'main-shift-comparison',
    chapterNumber: 12,
    title: 'Three-Shift Production & Efficiency Comparison',
    subtitle: 'Shift I, Shift II & Shift III comparative telemetry, GPS & output breakdown',
    icon: Clock,
    subPages: [
      {
        id: 'shift-comparison',
        title: 'Three-Shift Performance Comparison',
        shortTitle: 'Shift Comparison',
        defaultSeconds: 20,
        description: 'Comparative telemetry across Shift I, Shift II, and Shift III for the selected date'
      }
    ]
  }
];

export interface TvDashboardProps {
  dailyReport: DailyReport;
  history: DailyReport[];
  allShedsHistory?: DailyReport[];
  workers: Sider[];
  rules: IncentiveRule[];
  selectedShed: string;
  onSelectShed: (shed: any) => void;
  machineEm: MachineEmData;
  settings: SystemSettings;
  onExit: () => void;
  onSelectDate?: (date: string) => void;
  availableDates?: string[];
  countConversions?: CountConversion[];
  frozenMonths?: Record<string, FrozenMonthRecord>;
  selectedMonth?: number;
  selectedYear?: number;
}

export const TvDashboard: React.FC<TvDashboardProps> = ({
  dailyReport,
  history,
  allShedsHistory,
  workers,
  rules,
  selectedShed,
  onSelectShed,
  machineEm,
  settings,
  onExit,
  onSelectDate,
  availableDates = [],
  countConversions = [],
  frozenMonths = {},
  selectedMonth: propMonth,
  selectedYear: propYear
}) => {
  // 1. Controls & Hover States
  const [showControls, setShowControls] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [isShedDropdownOpen, setIsShedDropdownOpen] = useState(false);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shedDropdownRef = useRef<HTMLDivElement | null>(null);

  // Click-outside listener for shed selection dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (shedDropdownRef.current && !shedDropdownRef.current.contains(event.target as Node)) {
        setIsShedDropdownOpen(false);
      }
    };
    if (isShedDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isShedDropdownOpen]);

  // Auto-request fullscreen on launch
  useEffect(() => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
  }, []);

  // 2. Real-time Digital Clock
  const [currentTime, setCurrentTime] = useState('');
  const [currentDateStr, setCurrentDateStr] = useState('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
      setCurrentDateStr(now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // 3. Active Main Pages & Sub-pages based on settings
  const activeMainPages = useMemo(() => {
    return TV_MAIN_PAGES.map(main => {
      const activeSubPages = main.subPages.filter(sub => {
        const configuredSecs = settings.tvPageIntervals?.[sub.id] ?? settings.tvSlideIntervals?.[sub.id];
        const isExplicitlyDisabled = settings.tvSlideEnabled?.[sub.id] === false || configuredSecs === 0;
        if (isExplicitlyDisabled) return false;
        const secs = configuredSecs !== undefined ? configuredSecs : sub.defaultSeconds;
        return secs > 0;
      });
      return {
        ...main,
        subPages: activeSubPages
      };
    }).filter(main => main.subPages.length > 0);
  }, [settings.tvPageIntervals, settings.tvSlideIntervals, settings.tvSlideEnabled]);

  // Fallback if all pages omitted
  const availableMainPages = activeMainPages.length > 0 ? activeMainPages : TV_MAIN_PAGES;

  // 4. Navigation pointers: Main Page index & Sub Page index
  const [mainIndex, setMainIndex] = useState(0);
  const [subIndex, setSubIndex] = useState(0);
  const [subPagesCount, setSubPagesCount] = useState(1);

  // Ensure indices are within bounds
  const currentMain = availableMainPages[mainIndex] || availableMainPages[0];
  const safeSubIndex = Math.min(subIndex, Math.max(0, currentMain.subPages.length - 1));
  const currentSub = currentMain.subPages[safeSubIndex] || currentMain.subPages[0];

  // 5. Calculate Duration for Current Sub-Page
  const currentSubDuration = useMemo(() => {
    if (!currentSub) return 15;
    const configuredSecs = settings.tvPageIntervals?.[currentSub.id] ?? settings.tvSlideIntervals?.[currentSub.id];
    const baseSecs = configuredSecs !== undefined ? configuredSecs : currentSub.defaultSeconds;
    return Math.max(5, baseSecs) * Math.max(1, subPagesCount);
  }, [currentSub, settings.tvPageIntervals, settings.tvSlideIntervals, subPagesCount]);

  const [timeRemaining, setTimeRemaining] = useState(currentSubDuration);

  // Reset timer on subpage change
  useEffect(() => {
    setTimeRemaining(currentSubDuration);
  }, [currentSub?.id, currentSubDuration]);

  // 6. Navigation Helpers
  const goToNext = useCallback(() => {
    if (safeSubIndex < currentMain.subPages.length - 1) {
      setSubIndex(safeSubIndex + 1);
    } else {
      const nextMainIdx = (mainIndex + 1) % availableMainPages.length;
      setMainIndex(nextMainIdx);
      setSubIndex(0);
    }
    setSubPagesCount(1);
  }, [safeSubIndex, currentMain.subPages.length, mainIndex, availableMainPages.length]);

  const goToPrev = useCallback(() => {
    if (safeSubIndex > 0) {
      setSubIndex(safeSubIndex - 1);
    } else {
      const prevMainIdx = (mainIndex - 1 + availableMainPages.length) % availableMainPages.length;
      setMainIndex(prevMainIdx);
      const prevMain = availableMainPages[prevMainIdx];
      setSubIndex(Math.max(0, prevMain.subPages.length - 1));
    }
    setSubPagesCount(1);
  }, [safeSubIndex, mainIndex, availableMainPages]);

  // 7. Auto-Rotation Timer
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          goToNext();
          return currentSubDuration;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPaused, goToNext, currentSubDuration]);

  // 8. Auto-Hide Floating Controls on Mouse Inactivity
  const handleUserActivity = useCallback(() => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 3500);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [handleUserActivity]);

  // 9. Keyboard Controls (Space = Pause/Play, Left/Right = Prev/Next, Esc = Exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPaused(p => !p);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, onExit]);

  // 10. Target Month & Year computation
  // Respect propMonth/propYear (if selected) or the month/year of the active dailyReport, falling back to current calendar month/year
  const targetMonth = useMemo(() => {
    if (propMonth && propMonth > 0) return propMonth;
    const dateParts = parseUniversalDateParts(dailyReport?.date);
    if (dateParts && dateParts.month > 0) return dateParts.month;
    return new Date().getMonth() + 1;
  }, [propMonth, dailyReport?.date]);

  const targetYear = useMemo(() => {
    if (propYear && propYear > 0) return propYear;
    const dateParts = parseUniversalDateParts(dailyReport?.date);
    if (dateParts && dateParts.year > 0) return dateParts.year;
    return new Date().getFullYear();
  }, [propYear, dailyReport?.date]);

  // 11. Safety Fallback: Use dailyReport, ensure 6 machines so frames are always populated cleanly
  const safeDailyReport = useMemo(() => {
    const report = dailyReport || createDefaultReportForShed(selectedShed, getTodayUniversalDate());
    return ensureSixMachines(report, selectedShed);
  }, [dailyReport, selectedShed]);

  // Calculate Progress Percentage for the active sub-page
  const progressPercent = Math.max(0, Math.min(100, ((currentSubDuration - timeRemaining) / currentSubDuration) * 100));

  // Available sheds including KTTM
  const SHEDS_LIST: Shed[] = ['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'];

  // 12. Multi-shed comparison calculation across all 4 sheds (strictly matched to safeDailyReport.date)
  const shedComparison = useMemo(() => {
    const sheds: Shed[] = ['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'];
    const targetDate = safeDailyReport.date;
    const targetParts = parseUniversalDateParts(targetDate);
    
    // Unified search pool prioritizing safeDailyReport
    const pool = [
      ...(safeDailyReport ? [safeDailyReport] : []),
      ...((allShedsHistory && allShedsHistory.length > 0) ? allShedsHistory : []),
      ...(history && history.length > 0 ? history : [])
    ];

    return sheds.map(shedName => {
      // Find report strictly matching this shed on the exact same selected date
      const reportForShed = pool.find(r => {
        const s = r.shed || 'Shed 1';
        if (s !== shedName) return false;
        if (r.date === targetDate) return true;
        if (targetParts) {
          const rp = parseUniversalDateParts(r.date);
          return rp && rp.year === targetParts.year && rp.month === targetParts.month && rp.day === targetParts.day;
        }
        return false;
      });

      // If no report exists for this shed on this exact date, report strictly as idle/zero for the selected date
      if (!reportForShed) {
        return {
          shed: shedName,
          target: 0,
          actual: 0,
          efficiency: 0,
          frames: 0,
          avgGps: 0,
          avg40sGps: 0,
          active: false,
          reportDate: targetDate
        };
      }

      const sList = reportForShed.summaries || [];
      const entries = reportForShed.entries || [];

      const tProd = reportForShed.totalProductionTarget || sList.reduce((a, b) => a + (b.targetProd || 0), 0) || entries.reduce((a, b) => a + (b.productionTarget || 0), 0);
      const aProd = reportForShed.totalProductionActual || sList.reduce((a, b) => a + (b.actualProd || 0), 0) || entries.reduce((a, b) => a + (b.productionActual || 0), 0);
      const eff = tProd > 0 ? (aProd / tProd) * 100 : (aProd > 0 ? 100 : 0);
      
      let gps = sList.length > 0 ? sList.reduce((a, b) => a + (b.avgGps || 0), 0) / sList.length : 0;
      if (gps === 0 && entries.length > 0) {
        const validGps = entries.filter(e => (e.gpsActual || 0) > 0);
        if (validGps.length > 0) gps = validGps.reduce((a, b) => a + (b.gpsActual || 0), 0) / validGps.length;
      }
      
      const valid40s = entries.filter(e => (e.gps40sCon || 0) > 0);
      const gps40s = valid40s.length > 0 
        ? valid40s.reduce((a, b) => a + (b.gps40sCon || 0), 0) / valid40s.length 
        : (gps > 0 ? gps : 0);

      const frameCount = sList.length > 0 ? sList.length : (new Set(entries.map(e => e.frameNo))).size;

      return {
        shed: shedName,
        target: Math.round(tProd),
        actual: Math.round(aProd),
        efficiency: Number(eff.toFixed(1)),
        frames: frameCount,
        avgGps: Number(gps.toFixed(1)),
        avg40sGps: Number(gps40s.toFixed(1)),
        active: aProd > 0 || entries.length > 0,
        reportDate: reportForShed.date || targetDate
      };
    });
  }, [allShedsHistory, history, safeDailyReport]);

  const shedAggregate = useMemo(() => {
    const totalActual = shedComparison.reduce((a, b) => a + b.actual, 0);
    const totalTarget = shedComparison.reduce((a, b) => a + b.target, 0);
    const overallEff = totalTarget > 0 ? Number(((totalActual / totalTarget) * 100).toFixed(1)) : 0;
    const activeSheds = shedComparison.filter(s => s.active);
    const avg40sGps = activeSheds.length > 0
      ? Number((activeSheds.reduce((a, b) => a + b.avg40sGps, 0) / activeSheds.length).toFixed(1))
      : 0;
    const leadingShed = [...activeSheds].sort((a, b) => b.efficiency - a.efficiency)[0] || null;

    return { totalActual, totalTarget, overallEff, avg40sGps, leadingShed };
  }, [shedComparison]);

  // 13. Three-Shift Comparison Calculation (Chapter 12)
  const shiftComparison = useMemo(() => {
    const shiftsConfig: { shift: Shift; title: string; timing: string }[] = [
      { shift: 'I', title: 'Shift I', timing: '07:00 – 15:00' },
      { shift: 'II', title: 'Shift II', timing: '15:00 – 23:00' },
      { shift: 'III', title: 'Shift III', timing: '23:00 – 07:00' }
    ];

    // Determine mill current shift based on current hour
    const now = new Date();
    const currentHour = now.getHours();
    let currentMillShift: Shift = 'I';
    if (currentHour >= 7 && currentHour < 15) {
      currentMillShift = 'I';
    } else if (currentHour >= 15 && currentHour < 23) {
      currentMillShift = 'II';
    } else {
      currentMillShift = 'III';
    }

    const isToday = safeDailyReport.date === getTodayUniversalDate();
    const entries = safeDailyReport.entries || [];
    const shiftOrder: Record<Shift, number> = { 'I': 1, 'II': 2, 'III': 3 };
    const currentShiftOrder = shiftOrder[currentMillShift];

    const results = shiftsConfig.map(({ shift, title, timing }) => {
      const shiftEntries = entries.filter(e => e.shift === shift);
      const isCurrent = isToday && shift === currentMillShift;
      
      let status: 'CURRENT' | 'COMPLETED' | 'UPCOMING' = 'COMPLETED';
      if (isToday) {
        if (shift === currentMillShift) {
          status = 'CURRENT';
        } else if (shiftOrder[shift] < currentShiftOrder) {
          status = 'COMPLETED';
        } else {
          status = shiftEntries.some(e => (e.productionActual || 0) > 0) ? 'COMPLETED' : 'UPCOMING';
        }
      } else {
        status = shiftEntries.length > 0 && shiftEntries.some(e => (e.productionActual || 0) > 0) ? 'COMPLETED' : 'UPCOMING';
      }

      const actualKg = Math.round(shiftEntries.reduce((acc, e) => acc + (e.productionActual || 0), 0));
      const targetKg = Math.round(shiftEntries.reduce((acc, e) => acc + (e.productionTarget || 0), 0));
      const efficiency = targetKg > 0 ? Number(((actualKg / targetKg) * 100).toFixed(1)) : (actualKg > 0 ? 100 : 0);

      // Average GPS & 40s Converted GPS
      const validGps = shiftEntries.filter(e => (e.gpsActual || 0) > 0);
      const avgGps = validGps.length > 0 
        ? Number((validGps.reduce((acc, e) => acc + e.gpsActual, 0) / validGps.length).toFixed(1)) 
        : 0;

      const valid40sGps = shiftEntries.filter(e => (e.gps40sCon || 0) > 0);
      const avg40sGps = valid40sGps.length > 0 
        ? Number((valid40sGps.reduce((acc, e) => acc + e.gps40sCon, 0) / valid40sGps.length).toFixed(1)) 
        : (avgGps > 0 ? avgGps : 0);

      // EMT Doff (EM), Natural EMT (Breaks), Idle %
      const validDoffEmt = shiftEntries.filter(e => (e.doffEmt || 0) > 0);
      const avgDoffEmt = validDoffEmt.length > 0 
        ? Number((validDoffEmt.reduce((acc, e) => acc + (e.doffEmt || 0), 0) / validDoffEmt.length).toFixed(2)) 
        : 0;

      const validNaturalEmt = shiftEntries.filter(e => (e.naturalEmt || 0) > 0);
      const avgNaturalEmt = validNaturalEmt.length > 0 
        ? Number((validNaturalEmt.reduce((acc, e) => acc + (e.naturalEmt || 0), 0) / validNaturalEmt.length).toFixed(1)) 
        : 0;

      const validIdle = shiftEntries.filter(e => (e.idlePercent || 0) > 0);
      const avgIdlePercent = validIdle.length > 0 
        ? Number((validIdle.reduce((acc, e) => acc + (e.idlePercent || 0), 0) / validIdle.length).toFixed(1)) 
        : 0;

      // Frames running count
      const frameSet = new Set<string>();
      shiftEntries.forEach(e => { if (e.frameNo) frameSet.add(e.frameNo); });
      const framesCount = frameSet.size;

      // Top Sider performer for this shift
      const siderMap: Record<string, { name: string; actualKg: number; gps40sSum: number; count: number }> = {};
      shiftEntries.forEach(e => {
        const name = (e.siderName || '').trim();
        if (!name || name.toLowerCase() === 'unassigned') return;
        if (!siderMap[name]) {
          siderMap[name] = { name, actualKg: 0, gps40sSum: 0, count: 0 };
        }
        siderMap[name].actualKg += (e.productionActual || 0);
        if (e.gps40sCon) {
          siderMap[name].gps40sSum += e.gps40sCon;
          siderMap[name].count += 1;
        }
      });

      const sidersSorted = Object.values(siderMap).sort((a, b) => b.actualKg - a.actualKg);
      const topSider = sidersSorted.length > 0 ? {
        name: sidersSorted[0].name,
        actualKg: Math.round(sidersSorted[0].actualKg),
        avg40sGps: sidersSorted[0].count > 0 ? Number((sidersSorted[0].gps40sSum / sidersSorted[0].count).toFixed(1)) : 0
      } : null;

      // Crew on duty: Gaiters & Fitters
      const resolveName = (idOrName: string) => {
        if (!idOrName) return '';
        const w = workers.find(item => item.id === idOrName || item.tNo === idOrName || item.name.toLowerCase() === idOrName.toLowerCase());
        return w ? w.name : idOrName;
      };

      const gaiters = (safeDailyReport.gaiters?.[shift] || []).filter(Boolean).map(resolveName);
      const fitters = (safeDailyReport.fitters?.[shift] || []).filter(Boolean).map(resolveName);

      return {
        shift,
        title,
        timing,
        isCurrent,
        status,
        actualKg,
        targetKg,
        efficiency,
        avgGps,
        avg40sGps,
        avgDoffEmt,
        avgNaturalEmt,
        avgIdlePercent,
        framesCount,
        sidersCount: Object.keys(siderMap).length,
        topSider,
        gaiters,
        fitters,
        isWinningShift: false
      };
    });

    // Mark winning shift (highest actual production)
    const activeShifts = results.filter(s => s.actualKg > 0);
    if (activeShifts.length > 0) {
      const highestActual = Math.max(...activeShifts.map(s => s.actualKg));
      const winner = results.find(s => s.actualKg === highestActual);
      if (winner) winner.isWinningShift = true;
    }

    return results;
  }, [safeDailyReport, workers]);

  const shiftAggregate = useMemo(() => {
    const totalActual = shiftComparison.reduce((a, b) => a + b.actualKg, 0);
    const totalTarget = shiftComparison.reduce((a, b) => a + b.targetKg, 0);
    const overallEff = totalTarget > 0 ? Number(((totalActual / totalTarget) * 100).toFixed(1)) : (totalActual > 0 ? 100 : 0);
    const activeShifts = shiftComparison.filter(s => s.actualKg > 0);
    const avg40sGps = activeShifts.length > 0 
      ? Number((activeShifts.reduce((a, b) => a + b.avg40sGps, 0) / activeShifts.length).toFixed(1)) 
      : 0;
    const winningShift = shiftComparison.find(s => s.isWinningShift) || null;

    return { totalActual, totalTarget, overallEff, avg40sGps, winningShift };
  }, [shiftComparison]);

  return (
    <div className="fixed inset-0 z-[99990] bg-stone-100 text-stone-900 flex flex-col h-screen w-screen overflow-hidden font-sans select-none">
      
      {/* 1. TOP BROADCAST HEADER (White Theme, High-Visibility for TV Displays) */}
      <header className="h-16 md:h-18 bg-white border-b border-stone-200/90 px-6 flex items-center justify-between shrink-0 shadow-2xs relative z-40">
        
        {/* Left: Mill Branding + Live Dot + Click Shed Selection Button */}
        <div className="flex items-center gap-5 min-w-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-2xs">
              <currentMain.icon size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 leading-none">
                <span className="text-xs font-black uppercase tracking-wider text-emerald-700">SpinMonitor AI</span>
                <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-[10px] font-black uppercase text-emerald-800 tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  Live TV
                </span>
              </div>
              <h2 className="text-base md:text-lg font-black tracking-tight text-stone-900 uppercase truncate mt-0.5 leading-tight">
                {currentMain.title}
              </h2>
            </div>
          </div>

          <div className="h-6 w-px bg-stone-200 hidden sm:block" />

          {/* Click-to-Open Shed Selector Dropdown Button (Includes Shed 1, Shed 2, Shed 3, KTTM) */}
          <div 
            ref={shedDropdownRef}
            className="relative"
          >
            <button
              onClick={() => setIsShedDropdownOpen(prev => !prev)}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-900 text-sm font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span>{selectedShed}</span>
              <ChevronDown size={15} className={cn("text-stone-400 transition-transform duration-200", isShedDropdownOpen && "rotate-180")} />
            </button>

            {/* Click Selection Dropdown Menu */}
            {isShedDropdownOpen && (
              <div className="absolute top-full left-0 mt-2 w-44 bg-white rounded-2xl border border-stone-200 shadow-xl py-1.5 z-50">
                {SHEDS_LIST.map(shed => {
                  const isSelected = selectedShed === shed;
                  return (
                    <button
                      key={shed}
                      onClick={() => {
                        onSelectShed(shed);
                        setIsShedDropdownOpen(false);
                      }}
                      className={cn(
                        "w-full px-4 py-2.5 text-sm font-bold text-left flex items-center justify-between transition-colors cursor-pointer",
                        isSelected ? "bg-emerald-50 text-emerald-700 font-black" : "text-stone-700 hover:bg-stone-100"
                      )}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={cn("w-2 h-2 rounded-full", isSelected ? "bg-emerald-600" : "bg-stone-300")} />
                        <span>{shed}</span>
                      </div>
                      {isSelected && <Check size={16} className="text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Static Report Date Indicator (Date selection removed as requested) */}
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-stone-50 border border-stone-200 text-stone-900 text-sm font-black uppercase tracking-wider shadow-2xs">
            <Calendar size={15} className="text-emerald-600" />
            <span>{safeDailyReport.date}</span>
            {safeDailyReport.date === getTodayUniversalDate() ? (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800 hidden sm:inline-block">
                Current Date
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 hidden sm:inline-block">
                Selected Date
              </span>
            )}
          </div>
        </div>

        {/* Center: Main Chapter & Sub-Page Badge */}
        <div className="flex items-center gap-3 px-3 truncate min-w-0">
          <span className="text-xs md:text-sm font-black uppercase tracking-wider text-stone-500">
            Chapter {currentMain.chapterNumber} of {availableMainPages.length}
          </span>
          <span className="text-stone-300">•</span>
          <span className="text-sm md:text-base font-black uppercase tracking-tight text-emerald-700 truncate">
            {currentSub.title}
          </span>

          {/* Sub-page stepper pills if Chapter has multiple subpages */}
          {currentMain.subPages.length > 1 && (
            <div className="hidden md:flex items-center gap-2 ml-2">
              {currentMain.subPages.map((sp, idx) => (
                <button
                  key={sp.id}
                  onClick={() => {
                    setSubIndex(idx);
                    setSubPagesCount(1);
                  }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                    idx === safeSubIndex
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-stone-100 text-stone-600 hover:text-stone-900"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", idx === safeSubIndex ? "bg-white" : "bg-stone-400")} />
                  <span>{sp.shortTitle}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Countdown Timer, Clock & Date */}
        <div className="flex items-center gap-5 shrink-0">
          {/* Subpage Countdown Badge */}
          <div className="flex items-center gap-3 bg-stone-50 px-3.5 py-1.5 rounded-2xl border border-stone-200">
            <div className="text-right">
              <div className="text-[10px] font-black uppercase tracking-widest text-stone-400 leading-tight">Next Page</div>
              <div className="text-base md:text-lg font-black text-emerald-700 tabular-nums leading-tight">{timeRemaining}s</div>
            </div>
            <div className="relative w-7 h-7 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" className="stroke-stone-200" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="14" fill="none"
                  className="stroke-emerald-600 transition-all duration-1000 ease-linear"
                  strokeWidth="3.5"
                  strokeDasharray={88}
                  strokeDashoffset={88 - (88 * progressPercent) / 100}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* Live Digital Clock */}
          <div className="text-right hidden sm:block">
            <div className="text-base md:text-xl font-black text-stone-900 tabular-nums tracking-tight leading-tight">{currentTime}</div>
            <div className="text-xs font-bold text-stone-500 uppercase tracking-wider leading-tight">{currentDateStr}</div>
          </div>
        </div>
      </header>

      {/* 2. PROGRESS LINE (Directly below header, snug to text) */}
      <div className="w-full h-0.5 bg-stone-200 relative z-30 overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-emerald-600 via-teal-500 to-emerald-400 transition-all duration-1000 ease-linear"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* 3. MAIN TV STAGE (Renders Active View Component) */}
      <main className="flex-1 overflow-y-auto bg-stone-100 text-stone-900 relative">
        <div className="w-full h-full p-3 md:p-5 lg:p-6">
          {(() => {
            switch (currentSub.id) {
              case 'dashboard':
                return (
                  <div className="space-y-5">
                    <KPIStats report={safeDailyReport} isTvMode={true} />
                    <div className="bg-white p-5 md:p-6 rounded-3xl border border-stone-200 shadow-2xs">
                      <div className="flex items-center justify-between pb-3.5 mb-3.5 border-b border-stone-100">
                        <div>
                          <h3 className="text-lg md:text-xl font-black uppercase text-stone-900 tracking-tight">
                            Machine GPS & Efficiency Performance <span className="text-emerald-700 font-serif italic text-base">({selectedShed})</span>
                          </h3>
                          <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
                            Real-time Gram Per Spindle (GPS) & Output Velocity
                          </p>
                        </div>
                        <span className="px-3 py-1 bg-stone-100 text-stone-800 rounded-xl text-xs font-black border border-stone-200">
                          Date: {safeDailyReport.date}
                        </span>
                      </div>
                      <PerformanceChart report={safeDailyReport} />
                    </div>
                  </div>
                );

              case 'reports':
                return (
                  <div className="w-full max-w-full">
                    <ReportView report={safeDailyReport} isTvMode={true} />
                  </div>
                );

              case 'daily-incentive':
                return (
                  <DailyIncentive
                    report={safeDailyReport}
                    workers={workers}
                    rules={rules}
                    isTvMode={true}
                    onSelectDate={onSelectDate}
                    onUpdateEntry={() => {}}
                  />
                );

              case 'daily-incentive-machine':
                return (
                  <MachineDailyIncentive
                    report={safeDailyReport}
                    workers={workers}
                    rules={rules}
                    isTvMode={true}
                    onSelectDate={onSelectDate}
                    machineSiderCounts={settings.machineSiderCounts}
                  />
                );

              case 'running-count-incentives':
                return (
                  <RunningCountIncentives
                    rules={rules}
                    report={safeDailyReport}
                    history={history}
                    isTvMode={true}
                    onSelectDate={onSelectDate}
                  />
                );

              case 'month-view':
                return (
                  <MonthlyGrid
                    history={history}
                    workers={workers}
                    rules={rules}
                    machineEm={machineEm}
                    type="gps"
                    selectedMonth={targetMonth}
                    selectedYear={targetYear}
                    onMonthChange={() => {}}
                    onYearChange={() => {}}
                    isTvMode={true}
                    onPagesDetermined={setSubPagesCount}
                    tvPageInterval={settings.tvPageIntervals?.['month-view']}
                    frozenMonths={frozenMonths}
                  />
                );

              case 'month-abstract':
                return (
                  <MonthAbstract
                    history={history}
                    workers={workers}
                    rules={rules}
                    month={targetMonth}
                    year={targetYear}
                    isTvMode={true}
                    onPagesDetermined={setSubPagesCount}
                    tvPageInterval={settings.tvPageIntervals?.['month-abstract']}
                    frozenMonths={frozenMonths}
                  />
                );

              case 'sider-monthly-performance':
                return (
                  <SiderMonthlyPerformance
                    history={history}
                    workers={workers}
                    rules={rules}
                    month={targetMonth}
                    year={targetYear}
                    machineEm={machineEm}
                    isTvMode={true}
                  />
                );

              case 'operator-em-format':
                return (
                  <OperatorEmFormat
                    history={history}
                    workers={workers}
                    rules={rules}
                    machineEm={machineEm}
                    onUpdateMachineEm={async () => {}}
                    settings={settings}
                    month={targetMonth}
                    year={targetYear}
                    isTvMode={true}
                    onPagesDetermined={setSubPagesCount}
                    tvPageInterval={settings.tvPageIntervals?.['operator-em-format']}
                  />
                );

              case 'best-operators-em':
                return (
                  <BestOperatorsEm
                    history={history}
                    workers={workers}
                    rules={rules}
                    machineEm={machineEm}
                    month={targetMonth}
                    year={targetYear}
                    isTvMode={true}
                  />
                );

              case 'em-outliers-compare':
                return (
                  <EmOutliersCompare
                    history={history}
                    workers={workers}
                    machineEm={machineEm}
                    month={targetMonth}
                    year={targetYear}
                    isTvMode={true}
                  />
                );

              case 'ai-month-view':
                return (
                  <AiMonthlyGrid
                    history={history}
                    workers={workers}
                    rules={rules}
                    selectedMonth={targetMonth}
                    selectedYear={targetYear}
                    onMonthChange={() => {}}
                    onYearChange={() => {}}
                    isTvMode={true}
                  />
                );

              case 'ai-month-abstract':
                return (
                  <AiMonthAbstract
                    history={history}
                    workers={workers}
                    rules={rules}
                    month={targetMonth}
                    year={targetYear}
                    isTvMode={true}
                    onPagesDetermined={setSubPagesCount}
                    tvPageInterval={settings.tvPageIntervals?.['ai-month-abstract']}
                    frozenMonths={frozenMonths}
                  />
                );

              case 'ai-monthly-performance':
                return (
                  <AiMonthlyPerformance
                    history={history}
                    workers={workers}
                    rules={rules}
                    month={targetMonth}
                    year={targetYear}
                    isTvMode={true}
                  />
                );

              case 'best-shift':
                return (
                  <BestShift
                    report={safeDailyReport}
                    workers={workers}
                    rules={rules}
                    isTvMode={true}
                  />
                );

              case 'best':
                return (
                  <BestSider
                    history={history}
                    workers={workers}
                    rules={rules}
                    month={targetMonth}
                    year={targetYear}
                    showMonthOnTv={settings.tvShowBestSiderMonth}
                    isTvMode={true}
                  />
                );

              case 'fitter-monthly-performance':
                return (
                  <FitterMonthlyPerformance
                    history={history}
                    workers={workers}
                    month={targetMonth}
                    year={targetYear}
                    isTvMode={true}
                  />
                );

              case 'sheds':
                return (
                  <div className="flex flex-col h-full justify-between gap-5 animate-in fade-in duration-300">
                    {/* Title & Active Date Header */}
                    <div className="bg-white px-7 py-5 rounded-3xl border border-stone-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 animate-pulse" />
                          <span className="text-xs font-black text-emerald-700 uppercase tracking-widest">
                            Live Mill Telemetry
                          </span>
                        </div>
                        <h3 className="text-2xl md:text-3xl font-black uppercase text-stone-900 tracking-tight">
                          Multi-Shed Production Intelligence
                        </h3>
                        <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mt-0.5">
                          Cross-shed performance comparison • Shed 1, Shed 2, Shed 3 & KTTM
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-5 py-2.5 bg-stone-100 text-stone-900 rounded-2xl text-sm font-black border border-stone-200">
                          Date: {safeDailyReport.date}
                        </span>
                      </div>
                    </div>

                    {/* 4 Sheds Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 flex-1 min-h-0">
                      {shedComparison.map((s) => {
                        const isSelected = selectedShed === s.shed;
                        return (
                          <div 
                            key={s.shed} 
                            onClick={() => onSelectShed(s.shed)}
                            className={cn(
                              "rounded-3xl p-6 border flex flex-col justify-between shadow-2xs transition-all relative overflow-hidden bg-white cursor-pointer hover:border-emerald-300",
                              isSelected 
                                ? "border-emerald-500 ring-4 ring-emerald-500/20 shadow-md" 
                                : "border-stone-200/90"
                            )}
                            title={`Click to switch to ${s.shed}`}
                          >
                            {/* Card Header */}
                            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                              <div>
                                <h4 className="text-2xl md:text-3xl font-black text-stone-900 uppercase font-serif tracking-tight">
                                  {s.shed}
                                </h4>
                                <span className="text-xs text-stone-400 font-bold uppercase tracking-wider block">
                                  {s.frames > 0 ? `${s.frames} Frames Logged` : 'Production Unit'}
                                  {s.reportDate ? ` • ${s.reportDate}` : ''}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <span className="px-2.5 py-1 rounded-full text-xs font-black uppercase bg-emerald-50 text-emerald-800 border border-emerald-200">
                                    Viewing
                                  </span>
                                )}
                                <span className={cn(
                                  "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider",
                                  s.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500"
                                )}>
                                  {s.active ? 'ACTIVE' : 'IDLE'}
                                </span>
                              </div>
                            </div>

                            {/* Main Numbers */}
                            <div className="my-4 space-y-3.5">
                              {/* Actual Production (HUGE) */}
                              <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
                                <span className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1">
                                  Actual Production
                                </span>
                                <div className="flex items-baseline gap-2">
                                  <span className="text-4xl md:text-5xl lg:text-6xl font-black font-mono text-emerald-700 tracking-tight">
                                    {s.actual.toLocaleString('en-IN')}
                                  </span>
                                  <span className="text-lg font-bold text-stone-400 font-sans">Kg</span>
                                </div>
                              </div>

                              {/* Target Production */}
                              <div className="bg-stone-50 px-4 py-3 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                                <span className="text-stone-500 text-xs md:text-sm font-black uppercase tracking-wider">Target:</span>
                                <span className="font-mono font-black text-stone-900 text-base md:text-lg">
                                  {s.target.toLocaleString('en-IN')} Kg
                                </span>
                              </div>

                              {/* 40s Converted GPS */}
                              <div className="bg-stone-50 px-4 py-3 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                                <span className="text-stone-500 text-xs md:text-sm font-black uppercase tracking-wider">40s Converted GPS:</span>
                                <span className="font-mono font-black text-sky-700 text-lg md:text-xl">
                                  {s.avg40sGps > 0 ? s.avg40sGps : '-'}
                                </span>
                              </div>

                              {/* Average GPS */}
                              <div className="bg-stone-50 px-4 py-3 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                                <span className="text-stone-500 text-xs md:text-sm font-black uppercase tracking-wider">Average GPS:</span>
                                <span className="font-mono font-black text-stone-900 text-lg md:text-xl">
                                  {s.avgGps > 0 ? s.avgGps : '-'}
                                </span>
                              </div>

                              {/* Plant Efficiency */}
                              <div className="bg-stone-50 px-4 py-3 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                                <span className="text-stone-500 text-xs md:text-sm font-black uppercase tracking-wider">Plant Eff %:</span>
                                <span className={cn(
                                  "font-black text-xl md:text-2xl font-mono",
                                  s.efficiency >= 95 ? "text-emerald-700" : s.efficiency > 0 ? "text-amber-700" : "text-stone-400"
                                )}>
                                  {s.efficiency > 0 ? `${s.efficiency}%` : '-'}
                                </span>
                              </div>
                            </div>

                            {/* Efficiency Progress Bar */}
                            <div className="mt-2">
                              <div className="w-full bg-stone-100 h-3 rounded-full overflow-hidden border border-stone-200/60">
                                <div 
                                  className={cn(
                                    "h-full rounded-full transition-all duration-1000",
                                    s.efficiency >= 95 ? "bg-emerald-500" : "bg-amber-500"
                                  )}
                                  style={{ width: `${Math.min(100, s.efficiency)}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Combined Mill Status Bar */}
                    <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-6">
                        <div>
                          <span className="text-[10px] md:text-xs font-black uppercase text-stone-400 tracking-wider block">
                            Combined Mill Actual
                          </span>
                          <span className="text-2xl md:text-3xl font-black font-mono text-emerald-700">
                            {shedAggregate.totalActual.toLocaleString('en-IN')} <span className="text-sm font-bold text-stone-400">Kg</span>
                          </span>
                        </div>
                        <div className="h-8 w-px bg-stone-200" />
                        <div>
                          <span className="text-[10px] md:text-xs font-black uppercase text-stone-400 tracking-wider block">
                            Combined Mill Target
                          </span>
                          <span className="text-xl md:text-2xl font-bold font-mono text-stone-800">
                            {shedAggregate.totalTarget.toLocaleString('en-IN')} <span className="text-sm font-bold text-stone-400">Kg</span>
                          </span>
                        </div>
                        <div className="h-8 w-px bg-stone-200 hidden sm:block" />
                        <div className="hidden sm:block">
                          <span className="text-[10px] md:text-xs font-black uppercase text-stone-400 tracking-wider block">
                            Overall Efficiency
                          </span>
                          <span className={cn(
                            "text-2xl md:text-3xl font-black font-mono",
                            shedAggregate.overallEff >= 95 ? "text-emerald-700" : "text-amber-700"
                          )}>
                            {shedAggregate.overallEff}%
                          </span>
                        </div>
                        <div className="h-8 w-px bg-stone-200 hidden md:block" />
                        <div className="hidden md:block">
                          <span className="text-[10px] md:text-xs font-black uppercase text-stone-400 tracking-wider block">
                            Average 40s GPS
                          </span>
                          <span className="text-xl md:text-2xl font-black font-mono text-sky-700">
                            {shedAggregate.avg40sGps}
                          </span>
                        </div>
                      </div>

                      {shedAggregate.leadingShed && (
                        <div className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 px-4 py-2 rounded-2xl">
                          <Trophy size={20} className="text-emerald-700 shrink-0" />
                          <div>
                            <span className="text-[10px] font-black uppercase text-emerald-700 tracking-wider block">Leading Shed</span>
                            <span className="text-sm md:text-base font-black text-emerald-950 uppercase">
                              {shedAggregate.leadingShed.shed} ({shedAggregate.leadingShed.efficiency}%)
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );

              case 'shift-comparison':
                return (
                  <div className="space-y-4 md:space-y-6 flex flex-col h-full">
                    {/* Top Header Banner */}
                    <div className="bg-white rounded-3xl p-5 md:p-6 border border-stone-200 shadow-2xs flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-100 text-emerald-800 tracking-wider">
                            Chapter 12 • Shift Telemetry
                          </span>
                          <span className="text-stone-400 font-bold">•</span>
                          <span className="text-xs font-black uppercase tracking-wider text-stone-500">
                            Live Mill Operations
                          </span>
                        </div>
                        <h3 className="text-xl md:text-2xl font-black text-stone-900 uppercase font-serif tracking-tight">
                          Three-Shift Production & Efficiency Comparison
                        </h3>
                        <p className="text-xs font-bold text-stone-500 uppercase tracking-wider mt-0.5">
                          Shift I (07:00–15:00) • Shift II (15:00–23:00) • Shift III (23:00–07:00) Output Breakdown
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="px-4 py-2 bg-stone-100 text-stone-900 rounded-2xl text-xs md:text-sm font-black border border-stone-200">
                          Shed: {selectedShed}
                        </span>
                        <span className="px-4 py-2 bg-stone-100 text-stone-900 rounded-2xl text-xs md:text-sm font-black border border-stone-200">
                          Date: {safeDailyReport.date}
                        </span>
                      </div>
                    </div>

                    {/* 3 Shift Cards Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5 md:gap-6 flex-1 min-h-0">
                      {shiftComparison.map((s) => {
                        const shiftColors = {
                          'I': {
                            accent: 'emerald',
                            borderActive: 'border-emerald-500 ring-4 ring-emerald-500/20',
                            text: 'text-emerald-700',
                            badge: 'bg-emerald-100 text-emerald-800',
                            bar: 'bg-emerald-500'
                          },
                          'II': {
                            accent: 'sky',
                            borderActive: 'border-sky-500 ring-4 ring-sky-500/20',
                            text: 'text-sky-700',
                            badge: 'bg-sky-100 text-sky-800',
                            bar: 'bg-sky-500'
                          },
                          'III': {
                            accent: 'amber',
                            borderActive: 'border-amber-500 ring-4 ring-amber-500/20',
                            text: 'text-amber-700',
                            badge: 'bg-amber-100 text-amber-800',
                            bar: 'bg-amber-500'
                          }
                        }[s.shift];

                        return (
                          <div 
                            key={s.shift}
                            className={cn(
                              "rounded-3xl p-6 border flex flex-col justify-between shadow-2xs transition-all relative overflow-hidden bg-white",
                              s.isCurrent 
                                ? shiftColors.borderActive + " shadow-md"
                                : "border-stone-200/90"
                            )}
                          >
                            {/* Card Top / Header */}
                            <div>
                              <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                                <div>
                                  <div className="flex items-center gap-2">
                                    <h4 className="text-2xl md:text-3xl font-black text-stone-900 uppercase font-serif tracking-tight">
                                      {s.title}
                                    </h4>
                                    {s.isWinningShift && (
                                      <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-300">
                                        <Trophy size={11} className="text-amber-700" /> Best Shift
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-xs text-stone-400 font-bold uppercase tracking-wider block mt-0.5">
                                    {s.timing} • {s.framesCount > 0 ? `${s.framesCount} Frames Logged` : 'No frames'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  {s.isCurrent ? (
                                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                                      <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                                      Live Shift
                                    </span>
                                  ) : s.status === 'COMPLETED' ? (
                                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-stone-100 text-stone-700 border border-stone-200">
                                      Completed
                                    </span>
                                  ) : (
                                    <span className="px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-stone-50 text-stone-400 border border-stone-200">
                                      Upcoming
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* Main Production Numbers */}
                              <div className="my-4 space-y-3">
                                {/* Actual Production (HUGE) */}
                                <div className="bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="text-xs font-black text-stone-500 uppercase tracking-wider">
                                      Actual Production
                                    </span>
                                    <span className="text-xs font-bold text-stone-400 font-mono">
                                      Target: {s.targetKg.toLocaleString('en-IN')} Kg
                                    </span>
                                  </div>
                                  <div className="flex items-baseline gap-2">
                                    <span className={cn("text-4xl md:text-5xl lg:text-6xl font-black font-mono tracking-tight", shiftColors.text)}>
                                      {s.actualKg.toLocaleString('en-IN')}
                                    </span>
                                    <span className="text-lg font-bold text-stone-400 font-sans">Kg</span>
                                  </div>
                                </div>

                                {/* Metrics Breakdown Rows */}
                                <div className="grid grid-cols-2 gap-2.5">
                                  {/* Shift Efficiency */}
                                  <div className="bg-stone-50 px-3.5 py-2.5 rounded-2xl border border-stone-200/80">
                                    <span className="text-[10px] md:text-xs text-stone-500 font-black uppercase tracking-wider block">
                                      Efficiency
                                    </span>
                                    <span className={cn(
                                      "font-black text-xl md:text-2xl font-mono",
                                      s.efficiency >= 95 ? "text-emerald-700" : s.efficiency > 0 ? "text-amber-700" : "text-stone-400"
                                    )}>
                                      {s.efficiency > 0 ? `${s.efficiency}%` : '-'}
                                    </span>
                                  </div>

                                  {/* 40s Converted GPS */}
                                  <div className="bg-stone-50 px-3.5 py-2.5 rounded-2xl border border-stone-200/80">
                                    <span className="text-[10px] md:text-xs text-stone-500 font-black uppercase tracking-wider block">
                                      40s GPS
                                    </span>
                                    <span className="font-mono font-black text-sky-700 text-xl md:text-2xl">
                                      {s.avg40sGps > 0 ? s.avg40sGps : '-'}
                                    </span>
                                  </div>

                                  {/* Average GPS */}
                                  <div className="bg-stone-50 px-3.5 py-2.5 rounded-2xl border border-stone-200/80">
                                    <span className="text-[10px] md:text-xs text-stone-500 font-black uppercase tracking-wider block">
                                      Average GPS
                                    </span>
                                    <span className="font-mono font-black text-stone-900 text-base md:text-lg">
                                      {s.avgGps > 0 ? s.avgGps : '-'}
                                    </span>
                                  </div>

                                  {/* EMT & Idle */}
                                  <div className="bg-stone-50 px-3.5 py-2.5 rounded-2xl border border-stone-200/80">
                                    <span className="text-[10px] md:text-xs text-stone-500 font-black uppercase tracking-wider block">
                                      Doff EM / Idle %
                                    </span>
                                    <span className="font-mono font-black text-stone-900 text-base md:text-lg">
                                      {s.avgDoffEmt > 0 ? s.avgDoffEmt : '0'} / {s.avgIdlePercent > 0 ? `${s.avgIdlePercent}%` : '0%'}
                                    </span>
                                  </div>
                                </div>

                                {/* Efficiency Progress Bar */}
                                <div className="mt-1">
                                  <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden border border-stone-200/60">
                                    <div 
                                      className={cn(
                                        "h-full rounded-full transition-all duration-1000",
                                        s.efficiency >= 95 ? "bg-emerald-500" : "bg-amber-500"
                                      )}
                                      style={{ width: `${Math.min(100, s.efficiency)}%` }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Card Bottom / Crew & Top Performer */}
                            <div className="pt-3 border-t border-stone-100 space-y-2 mt-auto">
                              {/* Top Sider of Shift */}
                              <div className="flex items-center justify-between text-xs bg-stone-50 px-3 py-2 rounded-xl border border-stone-200/60">
                                <span className="font-bold text-stone-500 uppercase tracking-wider">Top Sider:</span>
                                {s.topSider ? (
                                  <span className="font-black text-stone-900 truncate max-w-[160px]">
                                    {s.topSider.name} <span className="text-emerald-700 font-mono">({s.topSider.actualKg} Kg)</span>
                                  </span>
                                ) : (
                                  <span className="text-stone-400 font-medium">None logged</span>
                                )}
                              </div>

                              {/* Gaiters & Fitters */}
                              <div className="flex items-center justify-between text-[11px] text-stone-600 px-1">
                                <div>
                                  <span className="font-bold text-stone-400 uppercase tracking-wider">Gaiter: </span>
                                  <span className="font-semibold text-stone-800">
                                    {s.gaiters.length > 0 ? s.gaiters.join(', ') : 'None'}
                                  </span>
                                </div>
                                <div>
                                  <span className="font-bold text-stone-400 uppercase tracking-wider">Fitter: </span>
                                  <span className="font-semibold text-stone-800">
                                    {s.fitters.length > 0 ? s.fitters.join(', ') : 'None'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Bottom Combined Day Telemetry & Production Share */}
                    <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-2xs space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-6">
                          <div>
                            <span className="text-[10px] md:text-xs font-black uppercase text-stone-400 tracking-wider block">
                              Day Total Production
                            </span>
                            <span className="text-2xl md:text-3xl font-black font-mono text-emerald-700">
                              {shiftAggregate.totalActual.toLocaleString('en-IN')} <span className="text-sm font-bold text-stone-400">Kg</span>
                            </span>
                          </div>
                          <div className="h-8 w-px bg-stone-200" />
                          <div>
                            <span className="text-[10px] md:text-xs font-black uppercase text-stone-400 tracking-wider block">
                              Day Target
                            </span>
                            <span className="text-xl md:text-2xl font-bold font-mono text-stone-800">
                              {shiftAggregate.totalTarget.toLocaleString('en-IN')} <span className="text-sm font-bold text-stone-400">Kg</span>
                            </span>
                          </div>
                          <div className="h-8 w-px bg-stone-200 hidden sm:block" />
                          <div className="hidden sm:block">
                            <span className="text-[10px] md:text-xs font-black uppercase text-stone-400 tracking-wider block">
                              Day Efficiency
                            </span>
                            <span className={cn(
                              "text-2xl md:text-3xl font-black font-mono",
                              shiftAggregate.overallEff >= 95 ? "text-emerald-700" : "text-amber-700"
                            )}>
                              {shiftAggregate.overallEff}%
                            </span>
                          </div>
                          <div className="h-8 w-px bg-stone-200 hidden md:block" />
                          <div className="hidden md:block">
                            <span className="text-[10px] md:text-xs font-black uppercase text-stone-400 tracking-wider block">
                              Day 40s GPS
                            </span>
                            <span className="text-xl md:text-2xl font-black font-mono text-sky-700">
                              {shiftAggregate.avg40sGps}
                            </span>
                          </div>
                        </div>

                        {shiftAggregate.winningShift && (
                          <div className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 px-4 py-2 rounded-2xl">
                            <Trophy size={20} className="text-amber-700 shrink-0" />
                            <div>
                              <span className="text-[10px] font-black uppercase text-amber-700 tracking-wider block">Best Shift of Day</span>
                              <span className="text-sm md:text-base font-black text-amber-950 uppercase">
                                {shiftAggregate.winningShift.title} ({shiftAggregate.winningShift.actualKg.toLocaleString('en-IN')} Kg • {shiftAggregate.winningShift.efficiency}%)
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 3-Color Shift Share Stacked Bar */}
                      {shiftAggregate.totalActual > 0 && (
                        <div className="space-y-1.5 pt-1 border-t border-stone-100">
                          <div className="flex items-center justify-between text-[11px] font-bold text-stone-500 uppercase tracking-wider">
                            <span>Shift Output Contribution</span>
                            <div className="flex items-center gap-4">
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                                Shift I ({((shiftComparison[0].actualKg / shiftAggregate.totalActual) * 100).toFixed(1)}%)
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                                Shift II ({((shiftComparison[1].actualKg / shiftAggregate.totalActual) * 100).toFixed(1)}%)
                              </span>
                              <span className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                Shift III ({((shiftComparison[2].actualKg / shiftAggregate.totalActual) * 100).toFixed(1)}%)
                              </span>
                            </div>
                          </div>
                          <div className="w-full bg-stone-100 h-3 rounded-full overflow-hidden flex border border-stone-200/60">
                            <div 
                              className="bg-emerald-500 h-full transition-all duration-1000"
                              style={{ width: `${(shiftComparison[0].actualKg / shiftAggregate.totalActual) * 100}%` }}
                              title={`Shift I: ${shiftComparison[0].actualKg} Kg`}
                            />
                            <div 
                              className="bg-sky-500 h-full transition-all duration-1000"
                              style={{ width: `${(shiftComparison[1].actualKg / shiftAggregate.totalActual) * 100}%` }}
                              title={`Shift II: ${shiftComparison[1].actualKg} Kg`}
                            />
                            <div 
                              className="bg-amber-500 h-full transition-all duration-1000"
                              style={{ width: `${(shiftComparison[2].actualKg / shiftAggregate.totalActual) * 100}%` }}
                              title={`Shift III: ${shiftComparison[2].actualKg} Kg`}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );

              default:
                return (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-stone-400 font-bold uppercase tracking-widest text-sm">
                      Select a valid TV view
                    </p>
                  </div>
                );
            }
          })()}
        </div>
      </main>

      {/* 4. FLOATING BROADCAST CONTROLS (White Theme, Auto-hides on idle mouse) */}
      <div 
        className={cn(
          "fixed bottom-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300 pointer-events-auto",
          showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
        )}
      >
        <div className="flex items-center bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl border border-stone-200 shadow-2xl gap-3">
          {/* Previous Subpage Button */}
          <button
            onClick={goToPrev}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 transition-all cursor-pointer"
            title="Previous Subpage (Left Arrow)"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Pause / Resume Button */}
          <button
            onClick={() => setIsPaused(p => !p)}
            className={cn(
              "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-xs",
              isPaused 
                ? "bg-amber-500 text-stone-950 hover:bg-amber-400" 
                : "bg-emerald-600 text-white hover:bg-emerald-700"
            )}
            title="Toggle Play/Pause (Spacebar)"
          >
            {isPaused ? <Play size={13} className="fill-current" /> : <Pause size={13} className="fill-current" />}
            <span>{isPaused ? 'Paused' : 'Playing'}</span>
          </button>

          {/* Next Subpage Button */}
          <button
            onClick={goToNext}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 hover:text-stone-900 transition-all cursor-pointer"
            title="Next Subpage (Right Arrow)"
          >
            <ChevronRight size={18} />
          </button>

          <div className="w-px h-5 bg-stone-200 mx-1" />

          {/* Exit TV Mode Button */}
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-rose-50 text-stone-700 hover:text-rose-700 border border-stone-200 hover:border-rose-200 text-xs font-black uppercase tracking-wider transition-all cursor-pointer"
            title="Exit TV Mode (Escape)"
          >
            <X size={14} />
            <span>Exit TV</span>
          </button>
        </div>
      </div>

    </div>
  );
};
