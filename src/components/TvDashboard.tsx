import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Play, Pause, ChevronLeft, ChevronRight, Maximize, Minimize, X, 
  Activity, TrendingUp, BarChart3, Users, Trophy, Gauge, Layers, 
  Calendar, Clock, Zap, Star, AlertCircle, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { 
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { DailyReport, Sider, IncentiveRule, Shift, MachineEmData, SystemSettings } from '../types';
import { cn } from '../lib/utils';

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
  onExit
}) => {
  // Available slides
  const allSlides = useMemo(() => [
    { id: 'overview', title: 'Daily Production & Efficiency Overview', icon: Activity, defaultSeconds: 15 },
    { id: 'charts', title: 'Machine Production & Efficiency Charts', icon: BarChart3, defaultSeconds: 15 },
    { id: 'table', title: 'Machine GPS & Performance Table', icon: Gauge, defaultSeconds: 20 },
    { id: 'champions', title: 'Operator & Shift Champions', icon: Trophy, defaultSeconds: 15 },
    { id: 'sheds', title: 'Shed-Wise Comparative Summary', icon: Layers, defaultSeconds: 15 },
    { id: 'monthly', title: 'Monthly Cumulative Trends', icon: TrendingUp, defaultSeconds: 15 },
  ], []);

  // Filter slides enabled by settings
  const activeSlides = useMemo(() => {
    return allSlides.filter(s => settings.tvSlideEnabled?.[s.id] !== false);
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
          // Advance to next slide
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

      // Calculate shift EM
      const shiftNumStr = sh === 'I' ? '1' : sh === 'II' ? '2' : '3';
      let emSum = 0;
      let emCount = 0;
      const dateEm = machineEm[dailyReport.date];
      if (dateEm) {
        Object.values(dateEm).forEach(mShifts => {
          const val = mShifts[shiftNumStr];
          if (typeof val === 'number') {
            emSum += val;
            emCount++;
          }
        });
      }
      const avgEm = emCount > 0 ? emSum / emCount : 0;

      return {
        shift: sh,
        actualKg,
        targetKg,
        eff,
        avgShiftGps,
        avgUtil,
        avgEm
      };
    });
  }, [entries, machineEm, dailyReport.date]);

  // Machine chart data
  const machineChartData = useMemo(() => {
    return summaries.map(s => {
      const eff = s.targetProd > 0 ? (s.actualProd / s.targetProd) * 100 : s.avgUtil || 0;
      return {
        machine: s.frameNo,
        target: Math.round(s.targetProd),
        actual: Math.round(s.actualProd),
        efficiency: Math.round(eff * 10) / 10,
        gps: Math.round((s.avgGps || 0) * 10) / 10,
        stdGps: Math.round(s.stdGps || 0)
      };
    });
  }, [summaries]);

  // Best Shift Winner
  const bestShift = useMemo(() => {
    if (shiftAggs.length === 0) return null;
    return [...shiftAggs].sort((a, b) => b.eff - a.eff)[0];
  }, [shiftAggs]);

  // Top Operators
  const topOperators = useMemo(() => {
    const operatorMap = new Map<string, { worker: Sider; totalKg: number; duties: number; incentive: number }>();

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
      const existing = operatorMap.get(key) || { worker, totalKg: 0, duties: 0, incentive: 0 };
      existing.totalKg += entry.productionActual || 0;
      existing.duties += 1;
      existing.incentive += entry.incentiveAmount || 0;
      operatorMap.set(key, existing);
    });

    return Array.from(operatorMap.values())
      .sort((a, b) => b.incentive !== a.incentive ? b.incentive - a.incentive : b.totalKg - a.totalKg)
      .slice(0, 5);
  }, [entries, workers]);

  // Sheds comparative summary
  const shedsSummary = useMemo(() => {
    const shedNames: ('Shed 1' | 'Shed 2' | 'Shed 3' | 'KTTM')[] = ['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'];
    return shedNames.map(sName => {
      const rep = history.find(r => r.date === dailyReport.date && (r.shed || 'Shed 1') === sName) || (
        (dailyReport.shed || 'Shed 1') === sName ? dailyReport : null
      );

      const sTarget = rep ? (rep.totalProductionTarget || rep.summaries.reduce((a, b) => a + (b.targetProd || 0), 0)) : 0;
      const sActual = rep ? (rep.totalProductionActual || rep.summaries.reduce((a, b) => a + (b.actualProd || 0), 0)) : 0;
      const sEff = sTarget > 0 ? (sActual / sTarget) * 100 : 0;
      const sAvgGps = rep && rep.summaries.length > 0 
        ? rep.summaries.reduce((a, b) => a + (b.avgGps || 0), 0) / rep.summaries.length 
        : 0;
      const mCount = rep ? rep.summaries.length : 0;

      return {
        shed: sName,
        target: Math.round(sTarget),
        actual: Math.round(sActual),
        efficiency: Math.round(sEff * 10) / 10,
        avgGps: Math.round(sAvgGps * 10) / 10,
        machines: mCount,
        isActive: sName === selectedShed
      };
    });
  }, [history, dailyReport, selectedShed]);

  // Monthly Trend Data
  const monthlyTrendData = useMemo(() => {
    const sorted = [...history]
      .filter(r => (r.shed || 'Shed 1') === selectedShed)
      .sort((a, b) => {
        const da = a.date.split('/').reverse().join('');
        const db = b.date.split('/').reverse().join('');
        return da.localeCompare(db);
      })
      .slice(-15); // Last 15 days

    return sorted.map(r => {
      const t = r.totalProductionTarget || r.summaries.reduce((a, b) => a + (b.targetProd || 0), 0);
      const a = r.totalProductionActual || r.summaries.reduce((a, b) => a + (b.actualProd || 0), 0);
      const eff = t > 0 ? (a / t) * 100 : 0;
      return {
        date: r.date.split('/').slice(0, 2).join('/'),
        target: Math.round(t),
        actual: Math.round(a),
        efficiency: Math.round(eff * 10) / 10
      };
    });
  }, [history, selectedShed]);

  const progressPercent = Math.min(100, Math.max(0, ((currentSlideDuration - timeRemaining) / currentSlideDuration) * 100));

  return (
    <div 
      onMouseMove={handleMouseMove}
      className="fixed inset-0 z-[1000] bg-stone-950 text-white flex flex-col overflow-hidden select-none font-sans"
    >
      {/* ---------------- TOP SLIM PROGRESS BAR ---------------- */}
      <div className="w-full h-1.5 bg-stone-900 overflow-hidden relative">
        <div 
          className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-400 transition-all duration-1000 ease-linear shadow-lg shadow-emerald-500/50"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* ---------------- TV TOP HEADER ---------------- */}
      <header className="px-6 py-3.5 bg-stone-900/90 border-b border-stone-800 flex items-center justify-between gap-4 shrink-0 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-lg shadow-emerald-900/50 font-black text-lg">
            S
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-black uppercase tracking-tight text-white">
                Spinning Monitor <span className="text-emerald-400">TV Dashboard</span>
              </h1>
              <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Broadcast
              </span>
            </div>
            <p className="text-[11px] text-stone-400 font-bold uppercase tracking-wider">
              {activeSlide.title}
            </p>
          </div>
        </div>

        {/* Center: Shed Selector Pills */}
        <div className="hidden md:flex items-center bg-stone-950 p-1 rounded-2xl border border-stone-800 gap-1 shadow-inner">
          {(['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'] as const).map(shed => {
            const isSelected = selectedShed === shed;
            return (
              <button
                key={shed}
                onClick={() => onSelectShed(shed)}
                className={cn(
                  "px-3.5 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5",
                  isSelected
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/50 scale-105"
                    : "text-stone-400 hover:text-white hover:bg-stone-800"
                )}
              >
                <span className={cn("w-1.5 h-1.5 rounded-full", isSelected ? "bg-white" : "bg-stone-600")} />
                {shed}
              </button>
            );
          })}
        </div>

        {/* Right: Date, Clock & Countdown */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-stone-950 px-3 py-1.5 rounded-xl border border-stone-800 text-xs font-mono font-bold text-stone-300">
            <Calendar size={13} className="text-emerald-400" />
            <span>{dailyReport.date}</span>
          </div>

          <div className="flex items-center gap-2 bg-stone-950 px-3.5 py-1.5 rounded-xl border border-emerald-500/30 text-xs font-mono font-black text-emerald-400 shadow-inner">
            <Clock size={13} className="animate-spin text-emerald-400" style={{ animationDuration: '6s' }} />
            <span>{currentTime || '--:--:--'}</span>
          </div>

          <button
            onClick={onExit}
            className="p-2 rounded-xl bg-stone-800 hover:bg-rose-950 hover:text-rose-400 text-stone-400 transition-colors border border-stone-700 cursor-pointer"
            title="Exit TV Mode (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* ---------------- MAIN SLIDE CONTENT ---------------- */}
      <main className="flex-1 overflow-hidden p-6 relative flex flex-col justify-center">
        {/* SLIDE 1: DAILY OVERVIEW */}
        {activeSlide.id === 'overview' && (
          <div className="h-full flex flex-col justify-between space-y-5 animate-in fade-in duration-500">
            {/* Top Stat Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-stone-900/90 rounded-2xl p-5 border border-stone-800 flex flex-col justify-between shadow-xl">
                <span className="text-[11px] font-black uppercase tracking-widest text-stone-400">Target Production</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl lg:text-4xl font-black font-mono text-white tracking-tight">
                    {totalTarget.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs font-bold text-stone-400 uppercase">Kg</span>
                </div>
                <div className="mt-3 text-[11px] font-bold text-stone-400 flex items-center gap-1">
                  <Layers size={13} className="text-emerald-400" />
                  <span>Standard Shift Target</span>
                </div>
              </div>

              <div className="bg-stone-900/90 rounded-2xl p-5 border border-emerald-500/40 flex flex-col justify-between shadow-xl shadow-emerald-950/20 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
                <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">Actual Production</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className="text-3xl lg:text-4xl font-black font-mono text-emerald-400 tracking-tight">
                    {totalActual.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
                  </span>
                  <span className="text-xs font-bold text-emerald-300 uppercase">Kg</span>
                </div>
                <div className="mt-3 text-[11px] font-bold text-emerald-400/80 flex items-center gap-1">
                  <TrendingUp size={13} />
                  <span>Output Delivered</span>
                </div>
              </div>

              <div className="bg-stone-900/90 rounded-2xl p-5 border border-stone-800 flex flex-col justify-between shadow-xl">
                <span className="text-[11px] font-black uppercase tracking-widest text-stone-400">Plant Efficiency</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className={cn(
                    "text-3xl lg:text-4xl font-black font-mono tracking-tight",
                    overallEfficiency >= 95 ? "text-emerald-400" : overallEfficiency >= 90 ? "text-amber-400" : "text-rose-400"
                  )}>
                    {overallEfficiency.toFixed(1)}%
                  </span>
                  <span className={cn(
                    "text-[10px] font-black uppercase px-2 py-0.5 rounded-full",
                    overallEfficiency >= 95 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-amber-500/20 text-amber-300"
                  )}>
                    {overallEfficiency >= 95 ? 'EXCELLENT' : overallEfficiency >= 90 ? 'OPTIMAL' : 'REVIEW'}
                  </span>
                </div>
                <div className="mt-3 w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                    style={{ width: `${Math.min(100, overallEfficiency)}%` }}
                  />
                </div>
              </div>

              <div className="bg-stone-900/90 rounded-2xl p-5 border border-stone-800 flex flex-col justify-between shadow-xl">
                <span className="text-[11px] font-black uppercase tracking-widest text-stone-400">Production Variance</span>
                <div className="flex items-baseline justify-between mt-2">
                  <span className={cn(
                    "text-3xl lg:text-4xl font-black font-mono tracking-tight flex items-center gap-1",
                    variance >= 0 ? "text-emerald-400" : "text-rose-400"
                  )}>
                    {variance >= 0 ? <ArrowUpRight size={24} /> : <ArrowDownRight size={24} />}
                    {Math.abs(variance).toFixed(1)}
                  </span>
                  <span className="text-xs font-bold text-stone-400 uppercase">Kg</span>
                </div>
                <div className="mt-3 text-[11px] font-bold text-stone-400 flex items-center gap-1">
                  <span>{variance >= 0 ? "Above scheduled quota" : "Deficit to target quota"}</span>
                </div>
              </div>
            </div>

            {/* Shift Breakdown Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {shiftAggs.map(sh => (
                <div 
                  key={sh.shift}
                  className="bg-stone-900/90 rounded-2xl p-6 border border-stone-800 shadow-xl flex flex-col justify-between hover:border-emerald-500/40 transition-all"
                >
                  <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-4">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 font-black text-sm flex items-center justify-center border border-emerald-500/30">
                        {sh.shift}
                      </span>
                      <div>
                        <h4 className="text-sm font-black uppercase tracking-wider text-white">Shift {sh.shift}</h4>
                        <span className="text-[10px] text-stone-400 font-bold uppercase">8 Hours Operation</span>
                      </div>
                    </div>
                    <span className={cn(
                      "text-xs font-black font-mono px-2.5 py-1 rounded-lg",
                      sh.eff >= 95 ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-stone-800 text-stone-300"
                    )}>
                      {sh.eff.toFixed(1)}% Eff
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
                    <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80">
                      <span className="text-[10px] font-bold text-stone-500 block uppercase">Actual Prod</span>
                      <span className="text-lg font-black font-mono text-white">{sh.actualKg.toFixed(1)} <span className="text-xs text-stone-400">Kg</span></span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80">
                      <span className="text-[10px] font-bold text-stone-500 block uppercase">Average GPS</span>
                      <span className="text-lg font-black font-mono text-emerald-400">{sh.avgShiftGps.toFixed(1)}</span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80">
                      <span className="text-[10px] font-bold text-stone-500 block uppercase">Utility %</span>
                      <span className="text-lg font-black font-mono text-white">{sh.avgUtil.toFixed(1)}%</span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80">
                      <span className="text-[10px] font-bold text-stone-500 block uppercase">Shift EM %</span>
                      <span className="text-lg font-black font-mono text-blue-400">{sh.avgEm > 0 ? `${sh.avgEm.toFixed(1)}%` : '--'}</span>
                    </div>
                  </div>

                  <div className="w-full bg-stone-800 h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                      style={{ width: `${Math.min(100, sh.eff)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Quick Bar */}
            <div className="bg-stone-900/60 rounded-2xl px-6 py-3 border border-stone-800/80 flex items-center justify-between text-xs font-bold text-stone-400">
              <div className="flex items-center gap-6">
                <span>Mill: <strong className="text-white">SCM Spinning Mills</strong></span>
                <span>Active Shed: <strong className="text-emerald-400">{selectedShed}</strong></span>
                <span>Active Machines: <strong className="text-white">{summaries.length} Frames</strong></span>
                <span>Avg Mill GPSS: <strong className="text-emerald-400">{avgGps.toFixed(1)}</strong> (Std: {stdGpsAvg.toFixed(1)})</span>
              </div>
              <span className="text-[10px] text-stone-500 uppercase tracking-widest">
                Data Synced via MongoDB
              </span>
            </div>
          </div>
        )}

        {/* SLIDE 2: CHARTS */}
        {activeSlide.id === 'charts' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
              {/* Actual vs Target Production Bar Chart */}
              <div className="bg-stone-900/90 rounded-2xl p-5 border border-stone-800 flex flex-col justify-between shadow-xl">
                <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-2">
                  <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <BarChart3 size={16} className="text-emerald-400" />
                    Machine Production: Actual vs Target (Kg)
                  </h3>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{selectedShed}</span>
                </div>
                <div className="flex-1 w-full min-h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={machineChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#292524" vertical={false} />
                      <XAxis dataKey="machine" stroke="#78716c" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                      <YAxis stroke="#78716c" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c', borderRadius: '12px', color: '#fafaf9' }}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', paddingBottom: '12px' }} />
                      <Bar dataKey="target" name="Target (Kg)" fill="#44403c" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actual" name="Actual (Kg)" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Machine Efficiency & GPS Line Chart */}
              <div className="bg-stone-900/90 rounded-2xl p-5 border border-stone-800 flex flex-col justify-between shadow-xl">
                <div className="flex items-center justify-between mb-4 border-b border-stone-800 pb-2">
                  <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <TrendingUp size={16} className="text-teal-400" />
                    Efficiency (%) & GPS vs Standard GPS
                  </h3>
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{selectedShed}</span>
                </div>
                <div className="flex-1 w-full min-h-[260px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={machineChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#292524" vertical={false} />
                      <XAxis dataKey="machine" stroke="#78716c" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                      <YAxis stroke="#78716c" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} domain={[0, 110]} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c', borderRadius: '12px', color: '#fafaf9' }}
                      />
                      <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', paddingBottom: '12px' }} />
                      <Line type="monotone" dataKey="efficiency" name="Efficiency %" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} />
                      <Line type="monotone" dataKey="gps" name="Actual GPS" stroke="#38bdf8" strokeWidth={2.5} dot={{ r: 3, fill: '#38bdf8' }} />
                      <Line type="monotone" dataKey="stdGps" name="STD GPS" stroke="#fbbf24" strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Bottom Machine Highlights */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-stone-900 p-3.5 rounded-xl border border-stone-800 flex items-center justify-between text-xs">
                <span className="text-stone-400 font-bold uppercase">Top Producer Frame</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {machineChartData.length > 0 ? [...machineChartData].sort((a, b) => b.actual - a.actual)[0]?.machine : '--'}
                </span>
              </div>
              <div className="bg-stone-900 p-3.5 rounded-xl border border-stone-800 flex items-center justify-between text-xs">
                <span className="text-stone-400 font-bold uppercase">Highest Efficiency</span>
                <span className="font-mono font-black text-emerald-400 text-sm">
                  {machineChartData.length > 0 ? `${[...machineChartData].sort((a, b) => b.efficiency - a.efficiency)[0]?.efficiency}%` : '--'}
                </span>
              </div>
              <div className="bg-stone-900 p-3.5 rounded-xl border border-stone-800 flex items-center justify-between text-xs">
                <span className="text-stone-400 font-bold uppercase">Active Machines Monitored</span>
                <span className="font-mono font-black text-white text-sm">{machineChartData.length} Frames</span>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 3: MACHINE PERFORMANCE TABLE */}
        {activeSlide.id === 'table' && (
          <div className="h-full flex flex-col justify-between space-y-3 animate-in fade-in duration-500 overflow-hidden">
            <div className="flex items-center justify-between border-b border-stone-800 pb-2.5">
              <div className="flex items-center gap-2">
                <Gauge size={18} className="text-emerald-400" />
                <h3 className="text-base font-black uppercase tracking-wider text-white">Machine GPS &amp; Efficiency Performance</h3>
                <span className="bg-stone-800 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-mono font-bold">{selectedShed}</span>
              </div>
              <span className="text-xs text-stone-400 font-bold">Total: {summaries.length} Machines</span>
            </div>

            <div className="flex-1 overflow-auto rounded-2xl border border-stone-800 bg-stone-900/90 shadow-2xl">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-stone-950 text-stone-400 font-black text-[11px] uppercase tracking-wider sticky top-0 z-10 border-b border-stone-800">
                    <th className="py-3 px-3.5">RF No</th>
                    <th className="py-3 px-3">Count</th>
                    <th className="py-3 px-3 text-right">Std GPS</th>
                    <th className="py-3 px-3 text-right">Target (Kg)</th>
                    <th className="py-3 px-3 text-right text-emerald-400">Actual (Kg)</th>
                    <th className="py-3 px-3 text-right">GPS I</th>
                    <th className="py-3 px-3 text-right">GPS II</th>
                    <th className="py-3 px-3 text-right">GPS III</th>
                    <th className="py-3 px-3 text-right text-emerald-300">Avg GPS</th>
                    <th className="py-3 px-3 text-right">Util %</th>
                    <th className="py-3 px-3 text-right text-blue-400">EM I</th>
                    <th className="py-3 px-3 text-right text-blue-400">EM II</th>
                    <th className="py-3 px-3 text-right text-blue-400">EM III</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/80 font-mono">
                  {summaries.map((m, idx) => {
                    const eff = m.targetProd > 0 ? (m.actualProd / m.targetProd) * 100 : m.avgUtil || 0;
                    const isHigh = m.avgGps >= m.stdGps && m.stdGps > 0;
                    const mEm = machineEm[dailyReport.date]?.[m.frameNo] || {};

                    return (
                      <tr key={idx} className="hover:bg-stone-800/60 transition-colors">
                        <td className="py-2.5 px-3.5 font-black text-white flex items-center gap-1.5 font-sans">
                          <span className={cn("w-2 h-2 rounded-full", isHigh ? "bg-emerald-400" : "bg-stone-600")} />
                          {m.frameNo}
                        </td>
                        <td className="py-2.5 px-3 text-stone-300 font-sans font-bold">{m.count}</td>
                        <td className="py-2.5 px-3 text-right text-stone-400 font-bold">{Math.round(m.stdGps)}</td>
                        <td className="py-2.5 px-3 text-right text-stone-400 font-bold">{Math.round(m.targetProd)}</td>
                        <td className="py-2.5 px-3 text-right font-black text-emerald-400">{Math.round(m.actualProd)}</td>
                        <td className="py-2.5 px-3 text-right text-stone-300">{Math.round(m.shiftGps?.I || 0)}</td>
                        <td className="py-2.5 px-3 text-right text-stone-300">{Math.round(m.shiftGps?.II || 0)}</td>
                        <td className="py-2.5 px-3 text-right text-stone-300">{Math.round(m.shiftGps?.III || 0)}</td>
                        <td className={cn("py-2.5 px-3 text-right font-black", isHigh ? "text-emerald-400" : "text-amber-400")}>
                          {(m.avgGps || 0).toFixed(1)}
                        </td>
                        <td className={cn("py-2.5 px-3 text-right font-black", eff >= 95 ? "text-emerald-400" : "text-stone-300")}>
                          {eff.toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right text-blue-300">{mEm['1'] ? mEm['1'].toFixed(1) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-blue-300">{mEm['2'] ? mEm['2'].toFixed(1) : '-'}</td>
                        <td className="py-2.5 px-3 text-right text-blue-300">{mEm['3'] ? mEm['3'].toFixed(1) : '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* SLIDE 4: OPERATOR & SHIFT CHAMPIONS */}
        {activeSlide.id === 'champions' && (
          <div className="h-full flex flex-col justify-between space-y-5 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-0">
              {/* Best Shift Award Banner */}
              <div className="bg-gradient-to-br from-amber-950/60 via-stone-900 to-stone-900 rounded-3xl p-6 border border-amber-500/40 shadow-2xl flex flex-col justify-between relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                <div>
                  <div className="flex items-center gap-2 text-amber-400 text-xs font-black uppercase tracking-widest mb-3">
                    <Trophy size={16} />
                    <span>Mill Shift Champion</span>
                  </div>
                  <h3 className="text-4xl lg:text-5xl font-black uppercase tracking-tight text-white">
                    Shift {bestShift?.shift || 'I'}
                  </h3>
                  <p className="text-xs text-amber-300/80 font-bold mt-2">
                    Delivered the highest plant efficiency &amp; output across {selectedShed} today.
                  </p>
                </div>

                <div className="my-6 space-y-3">
                  <div className="bg-stone-950/80 p-3.5 rounded-2xl border border-stone-800 flex items-center justify-between text-xs font-bold">
                    <span className="text-stone-400 uppercase">Shift Production</span>
                    <span className="text-lg font-mono font-black text-amber-300">{bestShift ? `${bestShift.actualKg.toFixed(1)} Kg` : '--'}</span>
                  </div>
                  <div className="bg-stone-950/80 p-3.5 rounded-2xl border border-stone-800 flex items-center justify-between text-xs font-bold">
                    <span className="text-stone-400 uppercase">Efficiency Level</span>
                    <span className="text-lg font-mono font-black text-emerald-400">{bestShift ? `${bestShift.eff.toFixed(1)}%` : '--'}</span>
                  </div>
                  <div className="bg-stone-950/80 p-3.5 rounded-2xl border border-stone-800 flex items-center justify-between text-xs font-bold">
                    <span className="text-stone-400 uppercase">Average Shift GPS</span>
                    <span className="text-lg font-mono font-black text-white">{bestShift ? bestShift.avgShiftGps.toFixed(1) : '--'}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-wider text-amber-400">
                  <Star size={14} className="fill-amber-400" />
                  <span>Shift Excellence Award</span>
                </div>
              </div>

              {/* Top Operators Podium */}
              <div className="col-span-1 md:col-span-2 bg-stone-900/90 rounded-3xl p-6 border border-stone-800 shadow-2xl flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={18} className="text-emerald-400" />
                    <h3 className="text-base font-black uppercase tracking-wider text-white">Top Operator Champions</h3>
                  </div>
                  <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Incentive Leaderboard</span>
                </div>

                <div className="space-y-3 flex-1 overflow-auto">
                  {topOperators.map((item, idx) => {
                    const isFirst = idx === 0;
                    const isSecond = idx === 1;
                    const isThird = idx === 2;

                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "flex items-center justify-between p-3.5 rounded-2xl border transition-all",
                          isFirst ? "bg-amber-950/40 border-amber-500/40 shadow-lg shadow-amber-950/20" :
                          isSecond ? "bg-stone-800/80 border-stone-700" :
                          isThird ? "bg-stone-800/50 border-stone-700/60" :
                          "bg-stone-950/60 border-stone-800"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span className={cn(
                            "w-8 h-8 rounded-xl font-black text-xs flex items-center justify-center shrink-0",
                            isFirst ? "bg-amber-400 text-stone-950 shadow-md shadow-amber-400/30" :
                            isSecond ? "bg-stone-300 text-stone-900" :
                            isThird ? "bg-amber-700 text-white" :
                            "bg-stone-800 text-stone-400"
                          )}>
                            #{idx + 1}
                          </span>

                          <div className="w-10 h-10 rounded-xl overflow-hidden bg-stone-800 shrink-0 border border-stone-700">
                            {item.worker.photoUrl ? (
                              <img src={item.worker.photoUrl} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs font-black text-stone-500 uppercase">
                                {item.worker.name.charAt(0)}
                              </div>
                            )}
                          </div>

                          <div>
                            <h4 className="text-sm font-black uppercase tracking-tight text-white">{item.worker.name}</h4>
                            <span className="text-[10px] text-stone-400 font-mono font-bold">TK: {item.worker.tNo}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 font-mono text-right">
                          <div>
                            <span className="text-[9px] text-stone-500 block uppercase font-sans">Produced</span>
                            <span className="text-xs font-bold text-stone-300">{item.totalKg.toFixed(1)} Kg</span>
                          </div>
                          <div>
                            <span className="text-[9px] text-stone-500 block uppercase font-sans">Incentive</span>
                            <span className="text-sm font-black text-emerald-400">₹{item.incentive.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {topOperators.length === 0 && (
                    <div className="py-12 text-center text-stone-500 text-xs font-bold uppercase tracking-wider">
                      No operator incentive allocations logged for today.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* SLIDE 5: SHEDS COMPARATIVE SUMMARY */}
        {activeSlide.id === 'sheds' && (
          <div className="h-full flex flex-col justify-between space-y-5 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-emerald-400" />
                <h3 className="text-base font-black uppercase tracking-wider text-white">Shed-Wise Mill Performance Comparison</h3>
              </div>
              <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Date: {dailyReport.date}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 flex-1">
              {shedsSummary.map(s => (
                <div 
                  key={s.shed}
                  onClick={() => onSelectShed(s.shed)}
                  className={cn(
                    "rounded-3xl p-6 border flex flex-col justify-between transition-all cursor-pointer shadow-xl",
                    s.isActive 
                      ? "bg-gradient-to-b from-emerald-950/60 via-stone-900 to-stone-900 border-emerald-500 shadow-emerald-950/30 ring-2 ring-emerald-500/50" 
                      : "bg-stone-900/90 border-stone-800 hover:border-stone-700"
                  )}
                >
                  <div className="flex items-center justify-between border-b border-stone-800 pb-3 mb-4">
                    <div>
                      <h4 className="text-lg font-black uppercase tracking-tight text-white">{s.shed}</h4>
                      <span className="text-[10px] text-stone-400 font-bold uppercase">{s.machines} Machines Active</span>
                    </div>
                    {s.isActive && (
                      <span className="bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase px-2 py-0.5 rounded-full border border-emerald-500/30">
                        Current
                      </span>
                    )}
                  </div>

                  <div className="space-y-3 font-mono my-2 text-xs">
                    <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80 flex items-center justify-between">
                      <span className="text-stone-500 uppercase font-sans">Target Prod</span>
                      <span className="font-bold text-stone-300">{s.target.toLocaleString()} Kg</span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80 flex items-center justify-between">
                      <span className="text-stone-500 uppercase font-sans">Actual Prod</span>
                      <span className="font-black text-emerald-400">{s.actual.toLocaleString()} Kg</span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80 flex items-center justify-between">
                      <span className="text-stone-500 uppercase font-sans">Average GPS</span>
                      <span className="font-bold text-white">{s.avgGps}</span>
                    </div>
                    <div className="bg-stone-950 p-3 rounded-xl border border-stone-800/80 flex items-center justify-between">
                      <span className="text-stone-500 uppercase font-sans">Plant Eff %</span>
                      <span className={cn("font-black text-sm", s.efficiency >= 95 ? "text-emerald-400" : "text-amber-400")}>
                        {s.efficiency}%
                      </span>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                      <div 
                        className={cn("h-full rounded-full transition-all duration-1000", s.efficiency >= 95 ? "bg-emerald-400" : "bg-amber-400")}
                        style={{ width: `${Math.min(100, s.efficiency)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SLIDE 6: MONTHLY TRENDS */}
        {activeSlide.id === 'monthly' && (
          <div className="h-full flex flex-col justify-between space-y-4 animate-in fade-in duration-500">
            <div className="flex items-center justify-between border-b border-stone-800 pb-3">
              <div className="flex items-center gap-2">
                <TrendingUp size={18} className="text-emerald-400" />
                <h3 className="text-base font-black uppercase tracking-wider text-white">Monthly Cumulative Production &amp; Efficiency Trends</h3>
                <span className="bg-stone-800 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-bold">{selectedShed}</span>
              </div>
              <span className="text-xs text-stone-400 font-bold uppercase tracking-wider">Last 15 Production Days</span>
            </div>

            <div className="bg-stone-900/90 rounded-3xl p-6 border border-stone-800 flex-1 min-h-[300px] shadow-2xl">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyTrendData} margin={{ top: 20, right: 20, left: 0, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#292524" vertical={false} />
                  <XAxis dataKey="date" stroke="#78716c" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                  <YAxis stroke="#78716c" fontSize={11} fontWeight={700} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#1c1917', border: '1px solid #44403c', borderRadius: '12px', color: '#fafaf9' }}
                  />
                  <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', paddingBottom: '16px' }} />
                  <Bar dataKey="target" name="Target (Kg)" fill="#44403c" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual Production (Kg)" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-stone-900/60 rounded-2xl px-6 py-3 border border-stone-800/80 flex items-center justify-between text-xs font-bold text-stone-400">
              <span>Historical Days Logged: <strong className="text-white">{monthlyTrendData.length} Days</strong></span>
              <span>Average Daily Production: <strong className="text-emerald-400">{monthlyTrendData.length > 0 ? (monthlyTrendData.reduce((a, b) => a + b.actual, 0) / monthlyTrendData.length).toFixed(1) : 0} Kg</strong></span>
              <span>Tracking System: <strong className="text-white">Active Production Database</strong></span>
            </div>
          </div>
        )}
      </main>

      {/* ---------------- TV FLOATING CONTROLS HUD ---------------- */}
      <footer 
        className={cn(
          "px-6 py-3 bg-stone-900/95 border-t border-stone-800 flex items-center justify-between gap-4 shrink-0 transition-opacity duration-300 backdrop-blur-md",
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
                    ? "bg-emerald-600 text-white shadow-md shadow-emerald-900/40" 
                    : "bg-stone-800/80 hover:bg-stone-800 text-stone-400 hover:text-white"
                )}
              >
                <span>{idx + 1}. {slide.title.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Playback Controls & Countdown */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] font-mono text-stone-400 bg-stone-950 px-2.5 py-1 rounded-lg border border-stone-800">
            Next in <strong className="text-emerald-400">{timeRemaining}s</strong>
          </span>

          <button
            onClick={() => setCurrentSlideIndex(idx => (idx - 1 + slidesToUse.length) % slidesToUse.length)}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
            title="Previous Slide (Left Arrow)"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            onClick={() => setIsPlaying(p => !p)}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-md shadow-emerald-900/40"
            title="Play / Pause Slideshow (Spacebar)"
          >
            {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>

          <button
            onClick={() => setCurrentSlideIndex(idx => (idx + 1) % slidesToUse.length)}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
            title="Next Slide (Right Arrow)"
          >
            <ChevronRight size={16} />
          </button>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-stone-800 hover:bg-stone-700 text-stone-300 transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
          </button>
        </div>
      </footer>
    </div>
  );
};
