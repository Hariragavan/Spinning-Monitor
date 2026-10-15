import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Play, Pause, ChevronLeft, ChevronRight, Maximize, Minimize, 
  X, Activity, Trophy, BarChart3, Table, TrendingUp, Grid3X3, 
  Calendar, Clock, Check, Users, Gauge, Layers, Star, Zap,
  Award, ArrowUpRight, Sparkles, Medal, UserCheck, Coins, FileText, Target
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, Legend, ResponsiveContainer, Cell 
} from 'recharts';
import { DailyReport, Sider, IncentiveRule, Shift, SystemSettings, MachineEmData } from '../types';
import { cn } from '../lib/utils';
import { CalendarDatePicker } from './CalendarPickers';

interface TvDashboardProps {
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
  availableDates = []
}) => {
  // Available slides (All in White Theme)
  const allSlides = useMemo(() => [
    { id: 'overview', title: 'Daily Production & Efficiency Broadcast', icon: Activity, defaultSeconds: 15 },
    { id: 'charts', title: 'Machine Analytics & Efficiency Charts', icon: BarChart3, defaultSeconds: 20 },
    { id: 'table', title: 'Machine GPS & Executive Efficiency Ledger', icon: Table, defaultSeconds: 20 },
    { id: 'top-workers', title: 'Top 5 Star Sider Champions', icon: Trophy, defaultSeconds: 15 },
    { id: 'champions', title: 'Best Shift Award & Shift Telemetry', icon: Star, defaultSeconds: 15 },
    { id: 'sheds', title: 'Multi-Shed Production Intelligence', icon: Grid3X3, defaultSeconds: 15 },
    { id: 'monthly', title: 'Month-to-Date Production Volume Trends', icon: TrendingUp, defaultSeconds: 15 },
    { id: 'running-counts', title: 'Running Counts & Production Telemetry', icon: Layers, defaultSeconds: 20 },
    { id: 'daily-incentive', title: 'Daily Operator Incentive Ledger & Payouts', icon: Coins, defaultSeconds: 20 },
    { id: 'monthly-report', title: 'Monthly Production Master Report', icon: FileText, defaultSeconds: 20 }
  ], []);

  // Filter only enabled slides
  const activeSlides = useMemo(() => {
    return allSlides.filter(slide => {
      if (settings.tvSlideEnabled && settings.tvSlideEnabled[slide.id] === false) {
        return false;
      }
      return true;
    });
  }, [allSlides, settings.tvSlideEnabled]);

  const slidesToUse = activeSlides.length > 0 ? activeSlides : allSlides;

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [timeRemaining, setTimeRemaining] = useState(15);
  const [currentSlideDuration, setCurrentSlideDuration] = useState(15);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState<string>('');
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeSlide = slidesToUse[currentSlideIndex] || slidesToUse[0];

  // Live Clock
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Set duration when slide changes
  useEffect(() => {
    const configuredSeconds = settings.tvSlideIntervals?.[activeSlide.id] || activeSlide.defaultSeconds;
    const duration = Math.max(5, configuredSeconds);
    setCurrentSlideDuration(duration);
    setTimeRemaining(duration);
  }, [activeSlide.id, settings.tvSlideIntervals]);

  // Slideshow Timer
  useEffect(() => {
    if (!isPlaying) return;

    const timer = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          setCurrentSlideIndex(idx => (idx + 1) % slidesToUse.length);
          const nextIndex = (currentSlideIndex + 1) % slidesToUse.length;
          const nextSlide = slidesToUse[nextIndex];
          const nextDur = settings.tvSlideIntervals?.[nextSlide.id] || nextSlide.defaultSeconds;
          return Math.max(5, nextDur);
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPlaying, slidesToUse.length, currentSlideIndex, settings.tvSlideIntervals]);

  // Auto-request fullscreen on mount
  useEffect(() => {
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {}
  }, []);

  // Fullscreen detection & listener
  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  // Keyboard navigation (Space: pause/play, Arrows: prev/next, Esc: exit)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setCurrentSlideIndex(idx => (idx + 1) % slidesToUse.length);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentSlideIndex(idx => (idx - 1 + slidesToUse.length) % slidesToUse.length);
      } else if (e.key === 'Escape') {
        onExit();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [slidesToUse.length, onExit]);

  // Hide controls on inactivity
  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // -------------------------------------------------------------
  // Data Aggregations
  // -------------------------------------------------------------
  const summaries = dailyReport.summaries || [];
  const entries = dailyReport.entries || [];

  const totalTarget = dailyReport.totalProductionTarget || summaries.reduce((s, m) => s + (m.targetProd || 0), 0);
  const totalActual = dailyReport.totalProductionActual || summaries.reduce((s, m) => s + (m.actualProd || 0), 0);
  const overallEfficiency = totalTarget > 0 ? (totalActual / totalTarget) * 100 : 0;
  const variance = totalActual - totalTarget;

  const avgGps = summaries.length > 0 
    ? summaries.reduce((s, m) => s + (m.avgGps || 0), 0) / summaries.length 
    : 0;

  const stdGpsAvg = summaries.length > 0
    ? summaries.reduce((s, m) => s + (m.stdGps || 0), 0) / summaries.length
    : 0;

  // Shift aggregates
  const shiftAggs = useMemo(() => {
    const shifts: Shift[] = ['I', 'II', 'III'];
    return shifts.map(sh => {
      const shiftEntries = entries.filter(e => e.shift === sh);
      const actualKg = shiftEntries.reduce((s, e) => s + (e.productionActual || 0), 0);
      const targetKg = shiftEntries.reduce((s, e) => s + (e.productionTarget || 0), 0);
      const eff = targetKg > 0 ? (actualKg / targetKg) * 100 : 0;
      const validGps = shiftEntries.map(e => e.gpsActual || 0).filter(v => v > 0);
      const avgShiftGps = validGps.length > 0 ? validGps.reduce((a, b) => a + b, 0) / validGps.length : 0;
      const validUtil = shiftEntries.map(e => e.utility || 0).filter(v => v > 0);
      const avgUtil = validUtil.length > 0 ? validUtil.reduce((a, b) => a + b, 0) / validUtil.length : 0;

      return {
        shift: sh,
        actualKg,
        targetKg,
        efficiency: eff,
        avgGps: avgShiftGps,
        avgUtil,
        activeFrames: shiftEntries.length
      };
    });
  }, [entries]);

  // Best Shift
  const bestShift = useMemo(() => {
    if (shiftAggs.length === 0) return null;
    return [...shiftAggs].sort((a, b) => b.efficiency - a.efficiency)[0];
  }, [shiftAggs]);

  // Machine Level Chart Data
  const machineChartData = useMemo(() => {
    return summaries
      .map(s => ({
        machine: s.frameNo,
        count: s.count || '40s',
        target: Math.round(s.targetProd || 0),
        actual: Math.round(s.actualProd || 0),
        efficiency: s.targetProd && s.targetProd > 0 ? Number(((s.actualProd / s.targetProd) * 100).toFixed(1)) : 0,
        gps: Number((s.avgGps || 0).toFixed(1)),
        stdGps: Number((s.stdGps || 0).toFixed(1))
      }))
      .sort((a, b) => a.machine.localeCompare(b.machine, undefined, { numeric: true }));
  }, [summaries]);

  // Top 5 Operators / Siders
  const topOperators = useMemo(() => {
    const operatorMap = new Map<string, { worker: Sider; totalKg: number; duties: number; incentive: number; sumGps: number; gpsCount: number }>();

    entries.forEach(entry => {
      const wId = entry.siderIds?.[0] || entry.siderId;
      const wName = entry.siderName;
      if (!wId && !wName) return;

      const worker = workers.find(w => w.id === wId || w.tNo === wId || w.name === wName) || {
        id: wId || 'unknown',
        name: wName || wId || 'Operator',
        tNo: (entry as any).siderTicketNo || entry.siderId || 'T-N/A'
      };

      const key = worker.tNo || worker.name;
      const existing = operatorMap.get(key) || { worker, totalKg: 0, duties: 0, incentive: 0, sumGps: 0, gpsCount: 0 };
      existing.totalKg += entry.productionActual || 0;
      existing.duties += 1;
      existing.incentive += entry.incentiveAmount || 0;
      if (entry.gpsActual && entry.gpsActual > 0) {
        existing.sumGps += entry.gpsActual;
        existing.gpsCount += 1;
      }
      operatorMap.set(key, existing);
    });

    return Array.from(operatorMap.values())
      .sort((a, b) => b.incentive !== a.incentive ? b.incentive - a.incentive : b.totalKg - a.totalKg)
      .slice(0, 5);
  }, [entries, workers]);

  // Monthly 15-day trend data
  const monthlyTrendData = useMemo(() => {
    const currentShedHistory = history.filter(r => (r.shed || 'Shed 1') === selectedShed);
    return currentShedHistory
      .slice(-15)
      .map(r => ({
        date: r.date.split('/').slice(0, 2).join('/'),
        fullDate: r.date,
        target: Math.round(r.totalProductionTarget || 0),
        actual: Math.round(r.totalProductionActual || 0),
        efficiency: r.totalProductionTarget > 0 ? Number(((r.totalProductionActual / r.totalProductionTarget) * 100).toFixed(1)) : 0
      }));
  }, [history, selectedShed]);

  // Multi-shed comparison
  const shedComparison = useMemo(() => {
    const sheds = ['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'] as const;
    return sheds.map(shedName => {
      const reportForShed = history.find(r => r.date === dailyReport.date && (r.shed || 'Shed 1') === shedName) 
        || (selectedShed === shedName ? dailyReport : null);

      if (!reportForShed) {
        return {
          shed: shedName,
          target: 0,
          actual: 0,
          efficiency: 0,
          frames: 0,
          avgGps: 0,
          active: false
        };
      }

      const tProd = reportForShed.totalProductionTarget || 0;
      const aProd = reportForShed.totalProductionActual || 0;
      const eff = tProd > 0 ? (aProd / tProd) * 100 : 0;
      const sList = reportForShed.summaries || [];
      const gps = sList.length > 0 ? sList.reduce((a, b) => a + (b.avgGps || 0), 0) / sList.length : 0;

      return {
        shed: shedName,
        target: Math.round(tProd),
        actual: Math.round(aProd),
        efficiency: Number(eff.toFixed(1)),
        frames: sList.length,
        avgGps: Number(gps.toFixed(1)),
        active: aProd > 0
      };
    });
  }, [history, dailyReport, selectedShed]);

  // Slide 8: Running counts data
  const runningCountsData = useMemo(() => {
    const countMap = new Map<string, { count: string; frames: Set<string>; actualKg: number; targetKg: number; sumGps: number; gpsEntries: number; sumEff: number; effEntries: number }>();

    entries.forEach(e => {
      const c = e.count?.trim() || 'Standard';
      const existing = countMap.get(c) || { count: c, frames: new Set<string>(), actualKg: 0, targetKg: 0, sumGps: 0, gpsEntries: 0, sumEff: 0, effEntries: 0 };
      if (e.frameNo) existing.frames.add(e.frameNo);
      existing.actualKg += e.productionActual || 0;
      existing.targetKg += e.productionTarget || 0;
      if (e.gpsActual && e.gpsActual > 0) {
        existing.sumGps += e.gpsActual;
        existing.gpsEntries += 1;
      }
      if (e.efficiency && e.efficiency > 0) {
        existing.sumEff += e.efficiency;
        existing.effEntries += 1;
      }
      countMap.set(c, existing);
    });

    return Array.from(countMap.values()).map(item => ({
      count: item.count,
      framesCount: item.frames.size,
      actualKg: Math.round(item.actualKg),
      targetKg: Math.round(item.targetKg),
      avgGps: item.gpsEntries > 0 ? Number((item.sumGps / item.gpsEntries).toFixed(1)) : 0,
      avgEff: item.effEntries > 0 ? Number((item.sumEff / item.effEntries).toFixed(1)) : 0,
      achievement: item.targetKg > 0 ? Number(((item.actualKg / item.targetKg) * 100).toFixed(1)) : 0
    })).sort((a, b) => b.actualKg - a.actualKg);
  }, [entries]);

  // Slide 9: Daily incentive report data
  const dailyIncentiveReportData = useMemo(() => {
    let totalIncentive = 0;
    const shiftPayouts = { I: 0, II: 0, III: 0 };
    const operatorIncentives = new Map<string, { worker: Sider; frameNo: string; shift: Shift; count: string; gps: number; incentive: number }>();

    entries.forEach(e => {
      const inc = e.incentiveAmount || 0;
      totalIncentive += inc;
      if (e.shift in shiftPayouts) {
        shiftPayouts[e.shift] += inc;
      }
      const wId = e.siderIds?.[0] || e.siderId;
      const wName = e.siderName;
      if (wId || wName) {
        const worker = workers.find(w => w.id === wId || w.tNo === wId || w.name === wName) || {
          id: wId || 'unknown',
          name: wName || wId || 'Operator',
          tNo: (e as any).siderTicketNo || e.siderId || 'T-N/A'
        };
        const key = `${worker.tNo || worker.name}-${e.shift}-${e.frameNo}`;
        operatorIncentives.set(key, {
          worker,
          frameNo: e.frameNo,
          shift: e.shift,
          count: e.count || '40s',
          gps: e.gpsActual || 0,
          incentive: inc
        });
      }
    });

    const topEarners = Array.from(operatorIncentives.values())
      .filter(item => item.incentive > 0)
      .sort((a, b) => b.incentive - a.incentive)
      .slice(0, 10);

    return {
      totalIncentive,
      shiftPayouts,
      topEarners,
      eligibleCount: operatorIncentives.size
    };
  }, [entries, workers]);

  // Slide 10: Monthly production report data
  const monthlyProductionReportData = useMemo(() => {
    const currentShedHistory = history.filter(r => (r.shed || 'Shed 1') === selectedShed);
    const totalActualKg = currentShedHistory.reduce((acc, r) => acc + (r.totalProductionActual || 0), 0);
    const totalTargetKg = currentShedHistory.reduce((acc, r) => acc + (r.totalProductionTarget || 0), 0);
    const overallEff = totalTargetKg > 0 ? Number(((totalActualKg / totalTargetKg) * 100).toFixed(1)) : 0;

    const shiftTotals = {
      I: { kg: 0, gpsSum: 0, count: 0 },
      II: { kg: 0, gpsSum: 0, count: 0 },
      III: { kg: 0, gpsSum: 0, count: 0 }
    };

    currentShedHistory.forEach(r => {
      (r.entries || []).forEach(e => {
        if (e.shift in shiftTotals) {
          shiftTotals[e.shift].kg += e.productionActual || 0;
          if (e.gpsActual) {
            shiftTotals[e.shift].gpsSum += e.gpsActual;
            shiftTotals[e.shift].count += 1;
          }
        }
      });
    });

    const shiftData = [
      { shift: 'Shift I', kg: Math.round(shiftTotals.I.kg), avgGps: shiftTotals.I.count > 0 ? Number((shiftTotals.I.gpsSum / shiftTotals.I.count).toFixed(1)) : 0 },
      { shift: 'Shift II', kg: Math.round(shiftTotals.II.kg), avgGps: shiftTotals.II.count > 0 ? Number((shiftTotals.II.gpsSum / shiftTotals.II.count).toFixed(1)) : 0 },
      { shift: 'Shift III', kg: Math.round(shiftTotals.III.kg), avgGps: shiftTotals.III.count > 0 ? Number((shiftTotals.III.gpsSum / shiftTotals.III.count).toFixed(1)) : 0 }
    ];

    const dailyRecords = currentShedHistory.map(r => ({
      date: r.date,
      target: Math.round(r.totalProductionTarget || 0),
      actual: Math.round(r.totalProductionActual || 0),
      eff: r.totalProductionTarget > 0 ? Number(((r.totalProductionActual / r.totalProductionTarget) * 100).toFixed(1)) : 0
    }));

    return {
      daysLogged: currentShedHistory.length,
      totalActualKg: Math.round(totalActualKg),
      totalTargetKg: Math.round(totalTargetKg),
      overallEff,
      shiftData,
      dailyRecords: dailyRecords.slice(-10)
    };
  }, [history, selectedShed]);

  return (
    <div 
      onMouseMove={handleMouseMove}
      className="min-h-screen h-screen w-full bg-stone-50 text-stone-900 flex flex-col justify-between overflow-hidden select-none font-sans relative"
    >
      {/* ---------------- TOP PROGRESS BAR ---------------- */}
      <div className="w-full bg-stone-200 h-1.5 shrink-0 overflow-hidden">
        <div 
          className="bg-emerald-600 h-full transition-all duration-1000 ease-linear shadow-xs"
          style={{ width: `${((currentSlideDuration - timeRemaining) / currentSlideDuration) * 100}%` }}
        />
      </div>

      {/* ---------------- TOP BROADCAST HEADER (WHITE THEME) ---------------- */}
      <header className="h-16 bg-white border-b border-stone-200/90 px-6 flex items-center justify-between z-30 shrink-0 shadow-xs">
        {/* Left: Mill Branding & Status */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-sm shadow-emerald-600/30">
            <activeSlide.icon size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-black uppercase tracking-tight text-stone-900 font-serif">
                SCM <span className="text-emerald-700 font-sans">SpinMonitor TV</span>
              </h1>
              <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live Broadcast
              </span>
            </div>
            <p className="text-[11px] text-stone-500 font-bold uppercase tracking-wider">
              {activeSlide.title}
            </p>
          </div>
        </div>

        {/* Center: Shed Selector Pills */}
        <div className="hidden md:flex items-center bg-stone-100 p-1 rounded-2xl border border-stone-200/90 gap-1 shadow-2xs">
          {(['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'] as const).map(shed => {
            const isSelected = selectedShed === shed;
            return (
              <button
                key={shed}
                onClick={() => onSelectShed(shed)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                  isSelected
                    ? "bg-emerald-600 text-white shadow-xs scale-105"
                    : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 font-bold"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-white" : "bg-stone-400")} />
                {shed}
              </button>
            );
          })}
        </div>

        {/* Right: Interactive Date Selection, Clock & Countdown */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="flex items-center gap-1.5 bg-stone-100 p-0.5 rounded-xl border border-stone-200 shadow-2xs">
            <CalendarDatePicker
              value={dailyReport.date}
              onChange={(newDate) => {
                if (onSelectDate) onSelectDate(newDate);
              }}
              className="shrink-0"
            />
            {availableDates && availableDates.length > 1 && (
              <select
                value={dailyReport.date}
                onChange={(e) => {
                  if (onSelectDate) onSelectDate(e.target.value);
                }}
                className="text-xs bg-white text-stone-800 font-bold px-2 py-1.5 rounded-lg border border-stone-200 hover:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer hidden sm:block max-w-[125px] truncate"
                title="Select date for TV mode"
              >
                {availableDates.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2 bg-emerald-50 px-3.5 py-1.5 rounded-xl border border-emerald-200 text-xs font-mono font-black text-emerald-800 shadow-2xs">
            <Clock size={13} className="animate-spin text-emerald-600" style={{ animationDuration: '6s' }} />
            <span>{currentTime || '--:--:--'}</span>
          </div>

          <button
            onClick={onExit}
            className="p-2 rounded-xl bg-stone-100 hover:bg-rose-50 hover:text-rose-600 text-stone-500 transition-colors border border-stone-200 cursor-pointer shadow-2xs"
            title="Exit TV Mode (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* ---------------- MAIN SLIDE CONTENT (WHITE THEME) ---------------- */}
      <main className="flex-1 overflow-hidden p-6 relative flex flex-col justify-center">
        {/* ========================================================= */}
        {/* SLIDE 1: DAILY OVERVIEW & BROADCAST                       */}
        {/* ========================================================= */}
        {activeSlide.id === 'overview' && (
          <div className="h-full flex flex-col justify-between space-y-5 animate-in fade-in duration-500">
            {/* Top Stat Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-3xl p-5 border border-stone-200/90 flex flex-col justify-between shadow-2xs">
                <span className="text-[11px] font-black uppercase tracking-widest text-stone-400">Target Production</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl lg:text-4xl font-black font-mono text-stone-900 tracking-tight">
                    {totalTarget.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs font-bold text-stone-400 uppercase">Kg</span>
                </div>
                <div className="mt-3 text-[11px] font-bold text-stone-500 flex items-center gap-1">
                  <Layers size={13} className="text-emerald-600" />
                  <span>Standard Shift Target</span>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-emerald-200 flex flex-col justify-between shadow-2xs relative overflow-hidden">
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700">Actual Production</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl lg:text-4xl font-black font-mono text-emerald-600 tracking-tight">
                    {totalActual.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 uppercase">Kg</span>
                </div>
                <div className="mt-3 text-[11px] font-bold text-emerald-700/80 flex items-center gap-1">
                  <TrendingUp size={13} />
                  <span>Output Delivered</span>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-stone-200/90 flex flex-col justify-between shadow-2xs">
                <span className="text-[11px] font-black uppercase tracking-widest text-stone-400">Plant Efficiency</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className={cn(
                    "text-3xl lg:text-4xl font-black font-mono tracking-tight",
                    overallEfficiency >= 95 ? "text-emerald-600" : overallEfficiency >= 90 ? "text-amber-600" : "text-rose-600"
                  )}>
                    {overallEfficiency.toFixed(1)}%
                  </span>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded-full border",
                    overallEfficiency >= 95 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-amber-50 text-amber-700 border-amber-200"
                  )}>
                    {overallEfficiency >= 95 ? 'EXCELLENT' : overallEfficiency >= 90 ? 'OPTIMAL' : 'REVIEW'}
                  </span>
                </div>
                <div className="mt-3 w-full bg-stone-100 h-2 rounded-full overflow-hidden border border-stone-200/60">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, overallEfficiency)}%` }}
                  />
                </div>
              </div>

              <div className="bg-white rounded-3xl p-5 border border-stone-200/90 flex flex-col justify-between shadow-2xs">
                <span className="text-[11px] font-black uppercase tracking-widest text-stone-400">Average GPS / STD GPS</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl lg:text-4xl font-black font-mono text-stone-900 tracking-tight">
                    {avgGps.toFixed(1)}
                  </span>
                  <span className="text-xs font-bold text-stone-400 font-mono">/ {stdGpsAvg.toFixed(1)} STD</span>
                </div>
                <div className="mt-3 text-[11px] font-bold text-stone-500 flex items-center justify-between">
                  <span>Variance:</span>
                  <span className={cn("font-mono font-black", variance >= 0 ? "text-emerald-600" : "text-rose-600")}>
                    {variance >= 0 ? `+${variance.toFixed(1)}` : variance.toFixed(1)} Kg
                  </span>
                </div>
              </div>
            </div>

            {/* Middle Row: Shift Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1 min-h-0">
              {shiftAggs.map((shiftData) => {
                const shiftName = shiftData.shift === 'I' ? 'Shift I (Morning)' : shiftData.shift === 'II' ? 'Shift II (Evening)' : 'Shift III (Night)';
                const isBest = bestShift && bestShift.shift === shiftData.shift;

                return (
                  <div 
                    key={shiftData.shift} 
                    className={cn(
                      "rounded-3xl p-6 border flex flex-col justify-between relative shadow-2xs transition-all",
                      isBest 
                        ? "bg-white border-amber-300 ring-2 ring-amber-400/20" 
                        : "bg-white border-stone-200/90"
                    )}
                  >
                    {isBest && (
                      <div className="absolute top-4 right-4 bg-amber-100 text-amber-900 border border-amber-300 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-2xs">
                        <Trophy size={12} className="text-amber-600 fill-amber-500" />
                        Best Shift Today
                      </div>
                    )}

                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                        <h3 className="text-base font-black uppercase tracking-wider text-stone-900 font-serif">
                          {shiftName}
                        </h3>
                      </div>
                      <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">
                        Telemetry & Production Output
                      </p>
                    </div>

                    <div className="my-4 space-y-3">
                      <div className="flex items-baseline justify-between border-b border-stone-100 pb-2">
                        <span className="text-xs font-bold text-stone-500 uppercase">Delivered Output:</span>
                        <div className="text-right">
                          <span className="text-2xl font-black font-mono text-stone-900">{shiftData.actualKg.toLocaleString('en-IN', { maximumFractionDigits: 1 })}</span>
                          <span className="text-xs font-bold text-stone-400 ml-1">/ {shiftData.targetKg.toLocaleString('en-IN', { maximumFractionDigits: 1 })} Kg</span>
                        </div>
                      </div>

                      <div className="flex items-baseline justify-between border-b border-stone-100 pb-2">
                        <span className="text-xs font-bold text-stone-500 uppercase">Efficiency %:</span>
                        <span className={cn(
                          "text-xl font-black font-mono",
                          shiftData.efficiency >= 95 ? "text-emerald-600" : "text-amber-600"
                        )}>
                          {shiftData.efficiency.toFixed(1)}%
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className="text-xs font-bold text-stone-500 uppercase">Average GPS:</span>
                        <span className="text-xl font-black font-mono text-stone-900">
                          {shiftData.avgGps.toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <div className="w-full bg-stone-100 h-2.5 rounded-full overflow-hidden border border-stone-200/60">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-1000", isBest ? "bg-amber-500" : "bg-emerald-500")}
                        style={{ width: `${Math.min(100, shiftData.efficiency)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bottom Row: Shed Notice */}
            <div className="bg-white rounded-2xl px-6 py-3 border border-stone-200/90 shadow-2xs flex items-center justify-between text-xs font-bold text-stone-500">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span>Current Shed: <strong className="text-stone-900 uppercase font-black">{selectedShed}</strong></span>
              </div>
              <div className="flex items-center gap-4">
                <span>Active Frames: <strong className="text-stone-900">{summaries.length} Spinning Machines</strong></span>
                <span>Data Freshness: <strong className="text-emerald-700">Live Cloud Verified</strong></span>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 2: MACHINE ANALYTICS & CHARTS                       */}
        {/* ========================================================= */}
        {activeSlide.id === 'charts' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={18} className="text-emerald-600" />
                <h3 className="text-base font-black uppercase tracking-wider text-stone-900">Machine Production Target vs Actual ({selectedShed})</h3>
              </div>
              <span className="text-xs text-stone-500 font-bold uppercase tracking-wider">Frames Production Volume (Kg)</span>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-stone-200/90 flex-1 min-h-[340px] shadow-2xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={machineChartData} margin={{ top: 15, right: 20, left: 0, bottom: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="machine" stroke="#6b7280" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', color: '#111827', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', paddingBottom: '16px', fontWeight: 'bold' }} />
                  <Bar dataKey="target" name="Target (Kg)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual (Kg)" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl px-6 py-3 border border-stone-200/90 shadow-2xs flex items-center justify-between text-xs font-bold text-stone-500">
              <span>Overall Output: <strong className="text-stone-900">{totalActual.toFixed(1)} Kg</strong></span>
              <span>Efficiency Index: <strong className="text-emerald-700 font-mono font-black">{overallEfficiency.toFixed(1)}%</strong></span>
              <span>Showing {machineChartData.length} Spinning Machines in {selectedShed}</span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 3: MACHINE GPS & EFFICIENCY PERFORMANCE TABLE       */}
        {/* ========================================================= */}
        {activeSlide.id === 'table' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Table size={18} className="text-emerald-600" />
                <h3 className="text-base font-black uppercase tracking-wider text-stone-900">Machine GPS &amp; Efficiency Performance ({selectedShed})</h3>
              </div>
              <span className="text-xs text-stone-500 font-bold uppercase tracking-wider">Date: {dailyReport.date}</span>
            </div>

            <div className="bg-white rounded-3xl border border-stone-200/90 flex-1 overflow-hidden flex flex-col shadow-2xs">
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-stone-100 text-stone-700 font-black text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-stone-200">
                      <th className="py-2.5 px-3">Frame</th>
                      <th className="py-2.5 px-3">Count</th>
                      <th className="py-2.5 px-3 text-right">Target (Kg)</th>
                      <th className="py-2.5 px-3 text-right font-black text-emerald-800">Actual (Kg)</th>
                      <th className="py-2.5 px-3 text-right">Variance</th>
                      <th className="py-2.5 px-3 text-right">Efficiency %</th>
                      <th className="py-2.5 px-3 text-right">STD GPS</th>
                      <th className="py-2.5 px-3 text-right font-black text-stone-900">Avg GPS</th>
                      <th className="py-2.5 px-3 text-right">Avg Util%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {summaries.map((s, idx) => {
                      const eff = s.targetProd && s.targetProd > 0 ? (s.actualProd / s.targetProd) * 100 : 0;
                      const diff = (s.actualProd || 0) - (s.targetProd || 0);

                      return (
                        <tr key={s.frameNo || idx} className="hover:bg-emerald-50/40 transition-colors font-medium">
                          <td className="py-2 px-3 font-black text-stone-900">{s.frameNo}</td>
                          <td className="py-2 px-3 text-stone-700">{s.count || '40s'}</td>
                          <td className="py-2 px-3 text-right font-mono text-stone-600">{s.targetProd?.toFixed(1) || '0.0'}</td>
                          <td className="py-2 px-3 text-right font-mono font-black text-emerald-700">{s.actualProd?.toFixed(1) || '0.0'}</td>
                          <td className={cn("py-2 px-3 text-right font-mono font-bold", diff >= 0 ? "text-emerald-600" : "text-rose-600")}>
                            {diff >= 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)}
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold">
                            <span className={cn(
                              "px-2 py-0.5 rounded-full text-[10px]",
                              eff >= 95 ? "bg-emerald-100 text-emerald-800 font-black" : "bg-stone-100 text-stone-700"
                            )}>
                              {eff.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-stone-500">{s.stdGps?.toFixed(1) || '—'}</td>
                          <td className="py-2 px-3 text-right font-mono font-black text-stone-900">{s.avgGps?.toFixed(1) || '—'}</td>
                          <td className="py-2 px-3 text-right font-mono text-stone-700">{s.avgUtil ? `${s.avgUtil.toFixed(1)}%` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-stone-900 text-white font-black text-xs z-10">
                    <tr>
                      <td className="py-2.5 px-3 uppercase tracking-wider" colSpan={2}>Grand Total ({summaries.length} M/C)</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-300">{totalTarget.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-300">{totalActual.toFixed(1)}</td>
                      <td className={cn("py-2.5 px-3 text-right font-mono", variance >= 0 ? "text-emerald-300" : "text-rose-300")}>
                        {variance >= 0 ? `+${variance.toFixed(1)}` : variance.toFixed(1)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-300">{overallEfficiency.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-right font-mono text-stone-400">{stdGpsAvg.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-amber-300">{avgGps.toFixed(1)}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-stone-400">—</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 4: TOP 5 WORKERS / STAR PERFORMERS (NEW DEDICATED)  */}
        {/* ========================================================= */}
        {activeSlide.id === 'top-workers' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-stone-200 gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-300 flex items-center justify-center text-amber-700 shadow-2xs">
                  <Trophy size={22} className="text-amber-600 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black uppercase tracking-wider text-stone-900 font-serif">
                    Top 5 Star Siders &amp; Operator Champions
                  </h3>
                  <p className="text-xs text-stone-400 font-bold uppercase tracking-wider">
                    Highest Production Volume &amp; Daily Incentive Achievers ({selectedShed})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-xs font-black uppercase tracking-wider shadow-2xs">
                  Date: {dailyReport.date}
                </span>
              </div>
            </div>

            {/* Top 5 Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 flex-1 min-h-0">
              {topOperators.length === 0 ? (
                <div className="col-span-5 bg-white rounded-3xl p-12 text-center border border-stone-200/90 flex flex-col items-center justify-center">
                  <Users size={48} className="text-stone-300 mb-3" />
                  <h4 className="text-base font-black text-stone-700 uppercase">No Sider Allocations Recorded</h4>
                  <p className="text-xs text-stone-400 font-bold mt-1">Assign operators in Machine Allocation to see the top performers leaderboard.</p>
                </div>
              ) : (
                topOperators.map((item, index) => {
                  const rank = index + 1;
                  const isGold = rank === 1;
                  const isSilver = rank === 2;
                  const isBronze = rank === 3;

                  return (
                    <div
                      key={item.worker.id || item.worker.tNo || index}
                      className={cn(
                        "rounded-3xl p-5 border flex flex-col justify-between relative shadow-2xs transition-all duration-300 hover:shadow-md",
                        isGold ? "bg-white border-amber-300 ring-4 ring-amber-400/20" :
                        isSilver ? "bg-white border-slate-300 ring-2 ring-slate-400/20" :
                        isBronze ? "bg-white border-amber-200" :
                        "bg-white border-stone-200/90"
                      )}
                    >
                      {/* Rank Badge */}
                      <div className="flex items-center justify-between gap-1 mb-3">
                        <span className={cn(
                          "px-2.5 py-1 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow-2xs",
                          isGold ? "bg-amber-500 text-white" :
                          isSilver ? "bg-slate-500 text-white" :
                          isBronze ? "bg-amber-700 text-white" :
                          "bg-emerald-600 text-white"
                        )}>
                          {isGold && <CrownIcon />}
                          <span>Rank #{rank}</span>
                        </span>

                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200">
                          {item.duties} {item.duties === 1 ? 'Duty' : 'Duties'}
                        </span>
                      </div>

                      {/* Photo / Avatar */}
                      <div className="flex flex-col items-center text-center my-2">
                        <div className={cn(
                          "w-20 h-20 sm:w-24 sm:h-24 rounded-full p-1 border-2 overflow-hidden shadow-sm flex items-center justify-center bg-stone-50 mb-3",
                          isGold ? "border-amber-400 ring-4 ring-amber-200/50" :
                          isSilver ? "border-slate-300" :
                          "border-stone-200"
                        )}>
                          {item.worker.photoUrl ? (
                            <img 
                              src={item.worker.photoUrl} 
                              alt={item.worker.name} 
                              className="w-full h-full object-cover rounded-full"
                            />
                          ) : (
                            <div className="w-full h-full rounded-full bg-stone-100 flex items-center justify-center text-stone-400 font-black text-xl font-mono">
                              {item.worker.name.charAt(0)}
                            </div>
                          )}
                        </div>

                        <h4 className="text-base font-black text-stone-900 leading-snug line-clamp-1 uppercase">
                          {item.worker.name}
                        </h4>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200 text-xs font-mono font-bold mt-1">
                          <span>T.No:</span>
                          <strong className="text-stone-900">{item.worker.tNo || 'N/A'}</strong>
                        </div>
                      </div>

                      {/* Stats Box */}
                      <div className="bg-stone-50/80 rounded-2xl p-3 border border-stone-200/80 space-y-2 mt-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-stone-500 uppercase text-[10px]">Production:</span>
                          <span className="font-mono font-black text-emerald-700 text-sm">
                            {item.totalKg.toLocaleString('en-IN', { maximumFractionDigits: 1 })} <span className="text-[10px] text-stone-500">Kg</span>
                          </span>
                        </div>

                        <div className="flex items-center justify-between text-xs border-t border-stone-200/60 pt-1.5">
                          <span className="font-bold text-stone-500 uppercase text-[10px]">Incentive:</span>
                          <span className="font-mono font-black text-amber-700 text-sm">
                            ₹{Math.round(item.incentive)}
                          </span>
                        </div>

                        {item.gpsCount > 0 && (
                          <div className="flex items-center justify-between text-xs border-t border-stone-200/60 pt-1.5">
                            <span className="font-bold text-stone-500 uppercase text-[10px]">Avg GPS:</span>
                            <span className="font-mono font-bold text-stone-800 text-xs">
                              {(item.sumGps / item.gpsCount).toFixed(1)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Note */}
            <div className="bg-white rounded-2xl px-6 py-3 border border-stone-200/90 shadow-2xs flex items-center justify-between text-xs font-bold text-stone-500">
              <span>Performance Standard: <strong className="text-stone-900">SCM Plant Quality &amp; Machine Allocation Ledger</strong></span>
              <span>Incentive Status: <strong className="text-emerald-700">Calculated &amp; Approved for Payout</strong></span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 5: BEST SHIFT AWARD                                 */}
        {/* ========================================================= */}
        {activeSlide.id === 'champions' && (
          <div className="h-full flex flex-col justify-between space-y-5 animate-in fade-in duration-500">
            {/* Best Shift Award Banner */}
            <div className="bg-gradient-to-r from-amber-50 via-white to-emerald-50 rounded-3xl p-6 sm:p-8 border border-amber-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div className="w-16 h-16 rounded-3xl bg-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/30 shrink-0">
                  <Trophy size={32} className="stroke-[2.5]" />
                </div>
                <div>
                  <span className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full">
                    Award of the Day
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-black text-stone-900 uppercase tracking-tight mt-1 font-serif">
                    Best Shift: <span className="text-amber-600 font-sans">{bestShift ? `Shift ${bestShift.shift}` : 'All Shifts Equal'}</span>
                  </h2>
                  <p className="text-xs text-stone-500 font-bold uppercase tracking-wider mt-0.5">
                    Highest Production Efficiency &amp; Minimum Doff/Break Interruptions
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <span className="text-xs font-bold text-stone-400 uppercase block">Shift Efficiency</span>
                  <span className="text-3xl sm:text-4xl font-black font-mono text-emerald-600">
                    {bestShift ? `${bestShift.efficiency.toFixed(1)}%` : '0%'}
                  </span>
                </div>
                <div className="text-right border-l border-stone-200 pl-6">
                  <span className="text-xs font-bold text-stone-400 uppercase block">Shift Output</span>
                  <span className="text-3xl sm:text-4xl font-black font-mono text-stone-900">
                    {bestShift ? Math.round(bestShift.actualKg).toLocaleString('en-IN') : 0} <span className="text-xs text-stone-400">Kg</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Shift Performance Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 flex-1 min-h-0">
              {shiftAggs.map(sh => (
                <div key={sh.shift} className="bg-white rounded-3xl p-6 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                  <div className="flex items-center justify-between pb-3 border-b border-stone-100">
                    <div>
                      <h4 className="text-lg font-black uppercase text-stone-900">Shift {sh.shift}</h4>
                      <p className="text-[11px] text-stone-400 font-bold uppercase">Performance Summary</p>
                    </div>
                    <span className="px-3 py-1 bg-stone-100 text-stone-700 rounded-xl text-xs font-black">
                      {sh.efficiency.toFixed(1)}% Eff
                    </span>
                  </div>

                  <div className="my-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500 font-bold uppercase">Target:</span>
                      <span className="font-mono font-bold text-stone-800">{sh.targetKg.toFixed(1)} Kg</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500 font-bold uppercase">Actual Achieved:</span>
                      <span className="font-mono font-black text-emerald-700">{sh.actualKg.toFixed(1)} Kg</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500 font-bold uppercase">Average GPS:</span>
                      <span className="font-mono font-black text-stone-900">{sh.avgGps.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-stone-500 font-bold uppercase">Average Util%:</span>
                      <span className="font-mono font-bold text-stone-800">{sh.avgUtil.toFixed(1)}%</span>
                    </div>
                  </div>

                  <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden border border-stone-200/60">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, sh.efficiency)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 6: MULTI-SHED COMPARATIVE INTELLIGENCE              */}
        {/* ========================================================= */}
        {activeSlide.id === 'sheds' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Grid3X3 size={18} className="text-emerald-600" />
                <h3 className="text-base font-black uppercase tracking-wider text-stone-900">Multi-Shed Production Intelligence</h3>
              </div>
              <span className="text-xs text-stone-500 font-bold uppercase tracking-wider">Date: {dailyReport.date}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 min-h-0">
              {shedComparison.map((s) => (
                <div 
                  key={s.shed} 
                  className={cn(
                    "rounded-3xl p-6 border flex flex-col justify-between shadow-2xs transition-all",
                    selectedShed === s.shed 
                      ? "bg-white border-emerald-400 ring-4 ring-emerald-400/20" 
                      : "bg-white border-stone-200/90"
                  )}
                >
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div>
                      <h4 className="text-xl font-black text-stone-900 uppercase font-serif">{s.shed}</h4>
                      <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Production Unit</span>
                    </div>
                    <span className={cn(
                      "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase",
                      s.active ? "bg-emerald-100 text-emerald-800" : "bg-stone-100 text-stone-500"
                    )}>
                      {s.active ? 'ACTIVE' : 'IDLE'}
                    </span>
                  </div>

                  <div className="my-4 space-y-3">
                    <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80">
                      <span className="text-[10px] font-bold text-stone-400 uppercase block">Actual Production</span>
                      <span className="text-2xl font-black font-mono text-emerald-700">{s.actual.toLocaleString('en-IN')} <span className="text-xs font-sans text-stone-400">Kg</span></span>
                    </div>

                    <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                      <span className="text-stone-500 text-xs font-bold uppercase">Target:</span>
                      <span className="font-mono font-bold text-stone-800 text-xs">{s.target.toLocaleString('en-IN')} Kg</span>
                    </div>

                    <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                      <span className="text-stone-500 text-xs font-bold uppercase">Average GPS:</span>
                      <span className="font-bold text-stone-900 text-xs">{s.avgGps}</span>
                    </div>

                    <div className="bg-stone-50 p-3 rounded-2xl border border-stone-200/80 flex items-center justify-between">
                      <span className="text-stone-500 text-xs font-bold uppercase">Plant Eff %:</span>
                      <span className={cn("font-black text-sm", s.efficiency >= 95 ? "text-emerald-700" : "text-amber-700")}>
                        {s.efficiency}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <div className="w-full bg-stone-100 h-2 rounded-full overflow-hidden border border-stone-200/60">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-1000", s.efficiency >= 95 ? "bg-emerald-500" : "bg-amber-500")}
                        style={{ width: `${Math.min(100, s.efficiency)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 7: MONTHLY PRODUCTION TRENDS                        */}
        {/* ========================================================= */}
        {activeSlide.id === 'monthly' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-600" />
                <h3 className="text-base font-black uppercase tracking-wider text-stone-900">Monthly Cumulative Production &amp; Efficiency Trends</h3>
                <span className="bg-emerald-50 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">{selectedShed}</span>
              </div>
              <span className="text-xs text-stone-500 font-bold uppercase tracking-wider">Last 15 Production Days</span>
            </div>

            <div className="bg-white rounded-3xl p-6 border border-stone-200/90 flex-1 min-h-[300px] shadow-2xs">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrendData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis dataKey="date" stroke="#6b7280" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                  <YAxis stroke="#6b7280" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', color: '#111827', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', paddingBottom: '16px', fontWeight: 'bold' }} />
                  <Bar dataKey="target" name="Target (Kg)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual Production (Kg)" fill="#059669" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl px-6 py-3 border border-stone-200/90 shadow-2xs flex items-center justify-between text-xs font-bold text-stone-500">
              <span>Historical Days Logged: <strong className="text-stone-900">{monthlyTrendData.length} Days</strong></span>
              <span>Average Daily Production: <strong className="text-emerald-700">{monthlyTrendData.length > 0 ? (monthlyTrendData.reduce((a, b) => a + b.actual, 0) / monthlyTrendData.length).toFixed(1) : 0} Kg</strong></span>
              <span>Tracking System: <strong className="text-stone-900">Active Production Database</strong></span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 8: RUNNING COUNTS & PRODUCTION TELEMETRY             */}
        {/* ========================================================= */}
        {activeSlide.id === 'running-counts' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            {/* Header banner */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-emerald-600" />
                <h3 className="text-base font-black uppercase tracking-wider text-stone-900">Running Counts &amp; Production Telemetry</h3>
                <span className="bg-emerald-50 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">{selectedShed}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="bg-stone-100 text-stone-700 text-xs px-3 py-1 rounded-xl font-bold border border-stone-200">
                  Active Counts: <strong className="text-stone-900">{runningCountsData.length}</strong>
                </span>
                <span className="bg-emerald-50 text-emerald-800 text-xs px-3 py-1 rounded-xl font-bold border border-emerald-200">
                  Total Output: <strong className="text-emerald-700">{runningCountsData.reduce((acc, c) => acc + c.actualKg, 0).toLocaleString()} Kg</strong>
                </span>
              </div>
            </div>

            {/* Split layout: Chart on left, Table on right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
              {/* Left: Production volume by Count Recharts Bar Chart */}
              <div className="lg:col-span-6 bg-white rounded-3xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                    <BarChart3 size={15} className="text-emerald-600" />
                    <span>Count-Wise Production Volume (Kg)</span>
                  </h4>
                  <span className="text-[10px] text-stone-400 font-bold uppercase tracking-wider">Target vs Actual</span>
                </div>
                <div className="flex-1 min-h-[260px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={runningCountsData} margin={{ top: 10, right: 15, left: -10, bottom: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="count" stroke="#6b7280" fontSize={11} fontWeight={800} tickLine={false} />
                      <YAxis stroke="#6b7280" fontSize={10} fontWeight={700} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', color: '#111827', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }} />
                      <Bar dataKey="targetKg" name="Target (Kg)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actualKg" name="Actual (Kg)" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right: Detailed Count Metrics Table */}
              <div className="lg:col-span-6 bg-white rounded-3xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                    <Table size={15} className="text-emerald-600" />
                    <span>Running Counts Operational Breakdown</span>
                  </h4>
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 uppercase">Live Mills</span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-stone-100 text-[10px] font-black uppercase text-stone-400 tracking-wider">
                        <th className="py-2 px-3">Count</th>
                        <th className="py-2 px-2 text-center">Frames</th>
                        <th className="py-2 px-2 text-right">Target Kg</th>
                        <th className="py-2 px-2 text-right">Actual Kg</th>
                        <th className="py-2 px-2 text-right">Avg GPS</th>
                        <th className="py-2 px-3 text-right">Efficiency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-xs">
                      {runningCountsData.map((item, idx) => (
                        <tr key={idx} className="hover:bg-stone-50/80 transition-colors">
                          <td className="py-2.5 px-3">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-black bg-stone-100 text-stone-800 border border-stone-200">
                              {item.count}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center font-bold text-stone-600">
                            {item.framesCount}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-stone-500">
                            {item.targetKg.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-black text-emerald-700">
                            {item.actualKg.toLocaleString()}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-stone-700">
                            {item.avgGps}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="font-mono font-black text-stone-900 text-xs">{item.avgEff}%</span>
                              <div className="w-12 bg-stone-100 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className={cn("h-full rounded-full", item.avgEff >= 95 ? "bg-emerald-500" : "bg-amber-500")}
                                  style={{ width: `${Math.min(100, item.avgEff)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] font-bold text-stone-500 mt-2">
                  <span>Count Variety: <strong className="text-stone-800">{runningCountsData.length} Spun Types</strong></span>
                  <span>Average Performance: <strong className="text-emerald-700">{(runningCountsData.reduce((acc, c) => acc + c.avgEff, 0) / (runningCountsData.length || 1)).toFixed(1)}% Eff</strong></span>
                </div>
              </div>
            </div>

            {/* Bottom Status Pill */}
            <div className="bg-white rounded-2xl px-6 py-2.5 border border-stone-200/90 shadow-2xs flex items-center justify-between text-xs font-bold text-stone-500">
              <span>Telemetry: <strong className="text-stone-900">Live Frame Count Sensor Telemetry</strong></span>
              <span>Total Active Spindles: <strong className="text-emerald-700">{(runningCountsData.reduce((acc, c) => acc + c.framesCount, 0) * 1200).toLocaleString()} Spindles</strong></span>
              <span>Unit: <strong className="text-stone-900">{selectedShed}</strong></span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 9: DAILY OPERATOR INCENTIVE LEDGER & PAYOUTS         */}
        {/* ========================================================= */}
        {activeSlide.id === 'daily-incentive' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <Coins size={18} className="text-amber-600" />
                <h3 className="text-base font-black uppercase tracking-wider text-stone-900">Daily Operator Incentive Ledger &amp; Payouts</h3>
                <span className="bg-amber-50 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-amber-200">{selectedShed}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-stone-500 uppercase tracking-wider">Date: <strong className="text-stone-900 font-mono">{dailyReport.date}</strong></span>
                <span className="bg-emerald-600 text-white text-xs px-3.5 py-1 rounded-xl font-black uppercase tracking-wider shadow-sm shadow-emerald-600/30">
                  Total Payout: ₹{dailyIncentiveReportData.totalIncentive.toLocaleString()}
                </span>
              </div>
            </div>

            {/* Top 3 Shift Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Total Payout</span>
                  <span className="text-2xl font-black text-stone-900 font-mono">₹{dailyIncentiveReportData.totalIncentive.toLocaleString()}</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                  <Coins size={20} />
                </div>
              </div>
              {(['I', 'II', 'III'] as Shift[]).map(shift => (
                <div key={shift} className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center justify-between">
                  <div>
                    <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Shift {shift} Payout</span>
                    <span className="text-2xl font-black text-emerald-700 font-mono">₹{(dailyIncentiveReportData.shiftPayouts[shift] || 0).toLocaleString()}</span>
                  </div>
                  <span className="w-8 h-8 rounded-lg bg-stone-100 text-stone-700 flex items-center justify-center text-xs font-black">
                    {shift}
                  </span>
                </div>
              ))}
            </div>

            {/* Split View: Leaderboard table on left, chart on right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
              {/* Left: Top Sider Incentive Earners Table */}
              <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                    <Trophy size={15} className="text-amber-500" />
                    <span>Top Sider Incentive Earners</span>
                  </h4>
                  <span className="text-[10px] font-bold text-stone-400 uppercase">Top 10 High Performers</span>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-stone-100 text-[10px] font-black uppercase text-stone-400 tracking-wider">
                        <th className="py-2 px-2 text-center w-10">#</th>
                        <th className="py-2 px-3">Operator Name</th>
                        <th className="py-2 px-2 text-center">T.No</th>
                        <th className="py-2 px-2 text-center">Shift</th>
                        <th className="py-2 px-2 text-center">Frame</th>
                        <th className="py-2 px-2 text-right">GPS</th>
                        <th className="py-2 px-3 text-right">Incentive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 text-xs">
                      {dailyIncentiveReportData.topEarners.map((item, idx) => (
                        <tr key={idx} className="hover:bg-amber-50/40 transition-colors">
                          <td className="py-2.5 px-2 text-center font-black">
                            {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-stone-900 truncate max-w-[150px]">
                            {item.worker.name}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-stone-500 text-[11px]">
                            {item.worker.tNo}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <span className="px-1.5 py-0.5 rounded bg-stone-100 text-stone-700 font-bold text-[10px]">
                              {item.shift}
                            </span>
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono font-bold text-stone-600">
                            {item.frameNo}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-stone-700">
                            {item.gps}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300 font-mono font-black text-xs">
                              ₹{item.incentive}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right: Payout by Shift Recharts Bar Chart */}
              <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                    <BarChart3 size={15} className="text-emerald-600" />
                    <span>Shift-Wise Payout Comparison</span>
                  </h4>
                  <span className="text-[10px] text-stone-400 font-bold uppercase">₹ Total</span>
                </div>

                <div className="flex-1 min-h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[
                      { shift: 'Shift I', amount: dailyIncentiveReportData.shiftPayouts.I },
                      { shift: 'Shift II', amount: dailyIncentiveReportData.shiftPayouts.II },
                      { shift: 'Shift III', amount: dailyIncentiveReportData.shiftPayouts.III }
                    ]} margin={{ top: 10, right: 15, left: -10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="shift" stroke="#6b7280" fontSize={11} fontWeight={800} tickLine={false} />
                      <YAxis stroke="#6b7280" fontSize={10} fontWeight={700} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', color: '#111827', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                      <Bar dataKey="amount" name="Payout (₹)" fill="#d97706" radius={[6, 6, 0, 0]}>
                        <Cell fill="#059669" />
                        <Cell fill="#0284c7" />
                        <Cell fill="#7c3aed" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-[11px] font-bold text-stone-500">
                  <span>Eligible Operators: <strong className="text-stone-800">{dailyIncentiveReportData.topEarners.length} Operators</strong></span>
                  <span>Avg per Earner: <strong className="text-emerald-700">₹{dailyIncentiveReportData.topEarners.length > 0 ? Math.round(dailyIncentiveReportData.totalIncentive / dailyIncentiveReportData.topEarners.length) : 0}</strong></span>
                </div>
              </div>
            </div>

            {/* Bottom Status */}
            <div className="bg-white rounded-2xl px-6 py-2.5 border border-stone-200/90 shadow-2xs flex items-center justify-between text-xs font-bold text-stone-500">
              <span>Payroll Integration: <strong className="text-stone-900">Direct Incentive Ledger Verified</strong></span>
              <span>Gaiter &amp; AI Cone Roles: <strong className="text-emerald-700">Synchronized &amp; Included</strong></span>
              <span>Status: <strong className="text-emerald-700">Approved for Payout</strong></span>
            </div>
          </div>
        )}

        {/* ========================================================= */}
        {/* SLIDE 10: MONTHLY PRODUCTION MASTER REPORT                 */}
        {/* ========================================================= */}
        {activeSlide.id === 'monthly-report' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <div className="flex items-center gap-2">
                <FileText size={18} className="text-emerald-600" />
                <h3 className="text-base font-black uppercase tracking-wider text-stone-900">Monthly Production Master Report</h3>
                <span className="bg-emerald-50 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-200">{selectedShed}</span>
              </div>
              <span className="text-xs text-stone-500 font-bold uppercase tracking-wider">
                Full Month Trajectory &amp; Telemetry
              </span>
            </div>

            {/* 4 Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Total Actual Output</span>
                  <span className="text-2xl font-black text-emerald-700 font-mono">{monthlyProductionReportData.totalActualKg.toLocaleString()} <span className="text-xs font-sans text-stone-500">Kg</span></span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <TrendingUp size={20} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Target Production</span>
                  <span className="text-2xl font-black text-stone-800 font-mono">{monthlyProductionReportData.totalTargetKg.toLocaleString()} <span className="text-xs font-sans text-stone-500">Kg</span></span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-stone-100 text-stone-600 flex items-center justify-center">
                  <Target size={20} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Plant Efficiency</span>
                  <span className="text-2xl font-black text-stone-900 font-mono">{monthlyProductionReportData.overallEff}%</span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Gauge size={20} />
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Working Days</span>
                  <span className="text-2xl font-black text-stone-900 font-mono">{monthlyProductionReportData.daysLogged} <span className="text-xs font-sans text-stone-500">Days</span></span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
                  <Calendar size={20} />
                </div>
              </div>
            </div>

            {/* Split View: Chart on Left, Shift Breakdown & Recent Log on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0">
              {/* Left: Monthly Trend Chart */}
              <div className="lg:col-span-7 bg-white rounded-3xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2">
                    <BarChart3 size={15} className="text-emerald-600" />
                    <span>Daily Production Volume vs Target (Kg)</span>
                  </h4>
                  <span className="text-[10px] text-stone-400 font-bold uppercase">Chronological Output</span>
                </div>

                <div className="flex-1 min-h-[220px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyProductionReportData.dailyRecords} margin={{ top: 10, right: 15, left: -10, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                      <XAxis dataKey="date" stroke="#6b7280" fontSize={10} fontWeight={700} tickLine={false} />
                      <YAxis stroke="#6b7280" fontSize={10} fontWeight={700} tickLine={false} axisLine={false} />
                      <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', color: '#111827', boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1)' }} />
                      <Legend verticalAlign="top" align="right" wrapperStyle={{ fontSize: '10px', textTransform: 'uppercase', fontWeight: 'bold' }} />
                      <Bar dataKey="target" name="Target (Kg)" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actual" name="Actual (Kg)" fill="#059669" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right: Shift Aggregates & Recent Days Table */}
              <div className="lg:col-span-5 bg-white rounded-3xl p-5 border border-stone-200/90 shadow-2xs flex flex-col justify-between overflow-hidden">
                <div>
                  <h4 className="text-xs font-black uppercase tracking-wider text-stone-800 flex items-center gap-2 mb-3">
                    <Layers size={15} className="text-emerald-600" />
                    <span>Monthly Shift-Wise Totals</span>
                  </h4>
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    {monthlyProductionReportData.shiftData.map(s => (
                      <div key={s.shift} className="p-2.5 rounded-xl bg-stone-50 border border-stone-200 text-center">
                        <span className="text-[10px] font-black uppercase text-stone-500 block">{s.shift}</span>
                        <span className="text-sm font-black text-stone-900 font-mono block mt-0.5">{s.kg.toLocaleString()} <span className="text-[9px] text-stone-400">kg</span></span>
                        <span className="text-[10px] font-bold text-emerald-700 block mt-0.5">{s.avgGps} GPS</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <span className="text-[10px] font-black uppercase text-stone-400 tracking-wider block mb-2">Recent Recorded Days</span>
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-stone-100 text-[10px] font-black uppercase text-stone-400">
                        <th className="py-1 px-2">Date</th>
                        <th className="py-1 px-2 text-right">Target</th>
                        <th className="py-1 px-2 text-right">Actual</th>
                        <th className="py-1 px-2 text-right">Efficiency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {monthlyProductionReportData.dailyRecords.slice(-5).map((r, i) => (
                        <tr key={i} className="hover:bg-stone-50/80">
                          <td className="py-1.5 px-2 font-mono font-bold text-stone-800">{r.date}</td>
                          <td className="py-1.5 px-2 text-right font-mono text-stone-500">{r.target.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-black text-emerald-700">{r.actual.toLocaleString()}</td>
                          <td className="py-1.5 px-2 text-right font-mono font-black text-stone-800">{r.eff}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="pt-2 border-t border-stone-100 text-[10px] font-bold text-stone-400 flex items-center justify-between">
                  <span>Mill Unit: {selectedShed}</span>
                  <span className="text-emerald-700 font-bold">Monthly Master Telemetry OK</span>
                </div>
              </div>
            </div>

            {/* Bottom Status */}
            <div className="bg-white rounded-2xl px-6 py-2.5 border border-stone-200/90 shadow-2xs flex items-center justify-between text-xs font-bold text-stone-500">
              <span>Monthly Data Source: <strong className="text-stone-900">Synchronized Cloud Telemetry</strong></span>
              <span>Overall Achievement: <strong className="text-emerald-700">{monthlyProductionReportData.overallEff}% of Planned Production</strong></span>
              <span>Executive Reporting: <strong className="text-stone-900">Active</strong></span>
            </div>
          </div>
        )}
      </main>

      {/* ---------------- TV FLOATING CONTROLS HUD (WHITE THEME) ---------------- */}
      <footer 
        className={cn(
          "px-6 py-3 bg-white/95 border-t border-stone-200 flex items-center justify-between gap-4 shrink-0 transition-opacity duration-300 backdrop-blur-md shadow-lg",
          showControls ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {/* Slide navigation pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {slidesToUse.map((slide, idx) => {
            const isCurrent = idx === currentSlideIndex;
            return (
              <button
                key={slide.id}
                onClick={() => {
                  setCurrentSlideIndex(idx);
                }}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shrink-0",
                  isCurrent 
                    ? "bg-emerald-600 text-white shadow-xs" 
                    : "bg-stone-100 hover:bg-stone-200 text-stone-700"
                )}
              >
                <span>{idx + 1}. {slide.title.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Playback Controls & Countdown */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-stone-600 bg-stone-100 px-2.5 py-1 rounded-lg border border-stone-200 font-bold">
            Next in <strong className="text-emerald-700">{timeRemaining}s</strong>
          </span>

          <button
            onClick={() => setCurrentSlideIndex(idx => (idx - 1 + slidesToUse.length) % slidesToUse.length)}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition-colors cursor-pointer"
            title="Previous Slide (Left Arrow)"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={() => setIsPlaying(p => !p)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-xs"
            title="Play / Pause Slideshow (Spacebar)"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={() => setCurrentSlideIndex(idx => (idx + 1) % slidesToUse.length)}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition-colors cursor-pointer"
            title="Next Slide (Right Arrow)"
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-200 transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </footer>
    </div>
  );
};

// Simple crown icon helper for #1 ranking
const CrownIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14v2H5v-2z" />
  </svg>
);
