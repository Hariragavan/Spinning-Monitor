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
import { cn } from '../lib/utils';

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
  }
];

export interface TvDashboardProps {
  dailyReport: DailyReport;
  history: DailyReport[];
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
        const configuredSecs = settings.tvPageIntervals?.[sub.id];
        const secs = configuredSecs !== undefined ? configuredSecs : sub.defaultSeconds;
        return secs > 0;
      });
      return {
        ...main,
        subPages: activeSubPages
      };
    }).filter(main => main.subPages.length > 0);
  }, [settings.tvPageIntervals]);

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
    const configuredSecs = settings.tvPageIntervals?.[currentSub.id];
    const baseSecs = configuredSecs !== undefined ? configuredSecs : currentSub.defaultSeconds;
    return Math.max(5, baseSecs) * Math.max(1, subPagesCount);
  }, [currentSub, settings.tvPageIntervals, subPagesCount]);

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
  const targetMonth = useMemo(() => {
    if (settings.tvMonth && settings.tvMonth > 0) return settings.tvMonth;
    return propMonth || (new Date().getMonth() + 1);
  }, [settings.tvMonth, propMonth]);

  const targetYear = useMemo(() => {
    if (settings.tvYear && settings.tvYear > 0) return settings.tvYear;
    return propYear || new Date().getFullYear();
  }, [settings.tvYear, propYear]);

  // 11. Safety Fallback: Use latest populated report if active is blank
  const safeDailyReport = useMemo(() => {
    if (dailyReport && dailyReport.entries && dailyReport.entries.length > 0) {
      return dailyReport;
    }
    const populated = history.find(r => r.entries && r.entries.length > 0);
    return populated || dailyReport;
  }, [dailyReport, history]);

  // Calculate Progress Percentage for the active sub-page
  const progressPercent = Math.max(0, Math.min(100, ((currentSubDuration - timeRemaining) / currentSubDuration) * 100));

  // Available sheds including KTTM
  const SHEDS_LIST: Shed[] = ['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'];

  return (
    <div className="fixed inset-0 z-[99990] bg-stone-100 text-stone-900 flex flex-col h-screen w-screen overflow-hidden font-sans select-none">
      
      {/* 1. TOP BROADCAST HEADER (White Theme, Snug & Compact) */}
      <header className="h-14 bg-white border-b border-stone-200/90 px-5 flex items-center justify-between shrink-0 shadow-2xs relative z-40">
        
        {/* Left: Mill Branding + Live Dot + Hover Shed Selection Button */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 shadow-2xs">
              <currentMain.icon size={18} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 leading-none">
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700">SpinMonitor AI</span>
                <span className="flex items-center gap-1 px-1.5 py-0.2 rounded-full bg-emerald-100 text-[8px] font-black uppercase text-emerald-800 tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                  Live TV
                </span>
              </div>
              <h2 className="text-sm font-black tracking-tight text-stone-900 uppercase truncate mt-0.5 leading-tight">
                {currentMain.title}
              </h2>
            </div>
          </div>

          <div className="h-4 w-px bg-stone-200 hidden sm:block" />

          {/* Hover Shed Selector Dropdown Button (Includes Shed 1, Shed 2, Shed 3, KTTM) */}
          <div 
            className="relative"
            onMouseEnter={() => setIsShedDropdownOpen(true)}
            onMouseLeave={() => setIsShedDropdownOpen(false)}
          >
            <button
              onClick={() => setIsShedDropdownOpen(prev => !prev)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-900 text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span>{selectedShed}</span>
              <ChevronDown size={13} className={cn("text-stone-400 transition-transform duration-200", isShedDropdownOpen && "rotate-180")} />
            </button>

            {/* Hover Selection Dropdown Menu */}
            {isShedDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-36 bg-white rounded-xl border border-stone-200 shadow-xl py-1 z-50">
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
                        "w-full px-3 py-2 text-xs font-bold text-left flex items-center justify-between transition-colors cursor-pointer",
                        isSelected ? "bg-emerald-50 text-emerald-700 font-black" : "text-stone-700 hover:bg-stone-100"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-emerald-600" : "bg-stone-300")} />
                        <span>{shed}</span>
                      </div>
                      {isSelected && <Check size={13} className="text-emerald-600" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Center: Main Chapter & Sub-Page Badge */}
        <div className="flex items-center gap-2 px-2 truncate min-w-0">
          <span className="text-[11px] font-black uppercase tracking-wider text-stone-400">
            Chapter {currentMain.chapterNumber} of {availableMainPages.length}
          </span>
          <span className="text-stone-300">•</span>
          <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700 truncate">
            {currentSub.title}
          </span>

          {/* Sub-page stepper dots if Chapter has multiple subpages */}
          {currentMain.subPages.length > 1 && (
            <div className="hidden md:flex items-center gap-1.5 ml-2">
              {currentMain.subPages.map((sp, idx) => (
                <button
                  key={sp.id}
                  onClick={() => {
                    setSubIndex(idx);
                    setSubPagesCount(1);
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer",
                    idx === safeSubIndex
                      ? "bg-emerald-600 text-white shadow-2xs"
                      : "bg-stone-100 text-stone-500 hover:text-stone-800"
                  )}
                >
                  <span className={cn("w-1 h-1 rounded-full", idx === safeSubIndex ? "bg-white" : "bg-stone-400")} />
                  <span>{sp.shortTitle}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Countdown Timer, Clock & Date */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Subpage Countdown Badge */}
          <div className="flex items-center gap-2 bg-stone-50 px-2.5 py-1 rounded-xl border border-stone-200">
            <div className="text-right">
              <div className="text-[8px] font-black uppercase tracking-widest text-stone-400 leading-tight">Next Page</div>
              <div className="text-xs font-black text-emerald-700 tabular-nums leading-tight">{timeRemaining}s</div>
            </div>
            <div className="relative w-5 h-5 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="14" fill="none" className="stroke-stone-200" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="14" fill="none"
                  className="stroke-emerald-600 transition-all duration-1000 ease-linear"
                  strokeWidth="3"
                  strokeDasharray={88}
                  strokeDashoffset={88 - (88 * progressPercent) / 100}
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* Live Digital Clock */}
          <div className="text-right hidden sm:block">
            <div className="text-sm font-black text-stone-900 tabular-nums tracking-tight leading-tight">{currentTime}</div>
            <div className="text-[9px] font-bold text-stone-400 uppercase tracking-widest leading-tight">{currentDateStr}</div>
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
