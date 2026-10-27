'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DailyReport, CountConversion, Sider, Shift } from '../types';
import { cn, resolveWorker } from '../lib/utils';
import { 
  Activity, Gauge, Users, Zap, Calendar, ChevronLeft, ChevronRight, 
  Layers, CheckCircle2, TrendingUp, UserCheck, ShieldCheck, Play, Pause,
  Sparkles
} from 'lucide-react';

interface CountWiseFramesProps {
  report: DailyReport;
  workers?: Sider[];
  countConversions?: CountConversion[];
  isTvMode?: boolean;
  activeCountIndex?: number;
  onSelectCountIndex?: (index: number) => void;
  onPagesDetermined?: (pagesCount: number) => void;
  tvPageInterval?: number;
  onSelectDate?: (date: string) => void;
  availableDates?: string[];
}

export interface FrameTelemetryItem {
  frameNo: string;
  count: string;
  stdGps: number;
  actualGps: number;
  gps40sCon: number;
  productionKg: number;
  targetProdKg: number;
  efficiency: number;
  targetRatio: number;
  siderNames: string;
  gaiterName: string;
}

export interface CountGroup {
  name: string;
  frames: FrameTelemetryItem[];
  avgStdGps: number;
  avgActualGps: number;
  avg40sGps: number;
  totalProdKg: number;
  avgEfficiency: number;
  gpsAchievement: number;
  factor: number;
}

const normalizeCount = (c: string): string => {
  return (c || '').trim().toLowerCase().replace(/[-/\s_]/g, '');
};

const isCountMatch = (a: string, b: string): boolean => {
  if (!a || !b) return false;
  const na = normalizeCount(a);
  const nb = normalizeCount(b);
  return na === nb || na.includes(nb) || nb.includes(na);
};

/**
 * 4-Spindle Roll Animation representing a 4-spindle ring frame section.
 * Features 4 high-speed rolling yarn bobbins with rolling diagonal thread windings and drive tape.
 * Clean rectangular mill geometry without any surrounding circles.
 */
export const FourSpindleRollAnimation: React.FC<{
  className?: string;
}> = ({ className }) => {
  const spindleCenters = [11, 29, 47, 65];

  return (
    <div className={cn("inline-flex items-center select-none shrink-0", className)}>
      <svg
        viewBox="0 0 76 33"
        className="h-7 w-auto overflow-visible"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <style>{`
            @keyframes rollYarnDown {
              0% { transform: translateY(0px); }
              100% { transform: translateY(8px); }
            }
            @keyframes tapeDriveRoll {
              0% { stroke-dashoffset: 0; }
              100% { stroke-dashoffset: 12; }
            }
            .spindle-yarn-scroll {
              animation: rollYarnDown 0.38s linear infinite;
            }
            .spindle-tape-scroll {
              animation: tapeDriveRoll 0.38s linear infinite;
            }
          `}</style>

          {/* 4 Clip paths for the 4 tapered bobbin cop bodies */}
          {spindleCenters.map((cx, idx) => (
            <clipPath key={`clip-${idx}`} id={`bobbin-clip-${idx}`}>
              <path d={`M ${cx - 3.5} 7 L ${cx + 3.5} 7 L ${cx + 4.5} 24 L ${cx - 4.5} 24 Z`} />
            </clipPath>
          ))}
        </defs>

        {/* 1. Spindle Rail Foundation (bottom structural line) */}
        <line x1="3" y1="30.5" x2="73" y2="30.5" stroke="#64748b" strokeWidth="2" strokeLinecap="round" />
        <line x1="5" y1="31.5" x2="71" y2="31.5" stroke="#94a3b8" strokeWidth="0.8" />

        {/* 2. 4-Spindle Drive Tape connecting the wharves */}
        <line
          x1="5"
          y1="25.5"
          x2="71"
          y2="25.5"
          stroke="#059669"
          strokeWidth="1.2"
          strokeDasharray="3 2"
          className="spindle-tape-scroll"
        />

        {/* 3. The 4 Spindles */}
        {spindleCenters.map((cx, idx) => (
          <g key={idx}>
            {/* Top Steel Spindle Blade Tip */}
            <line x1={cx} y1={1.5} x2={cx} y2={5} stroke="#334155" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx={cx} cy={1.5} r="0.8" fill="#0f172a" />

            {/* Bobbin Top Crown Collar */}
            <path d={`M ${cx - 3} 5 L ${cx + 3} 5 L ${cx + 3.5} 7 L ${cx - 3.5} 7 Z`} fill="#64748b" />

            {/* Wound Yarn Cop Body (Clipped to tapered bobbin) */}
            <g clipPath={`url(#bobbin-clip-${idx})`}>
              {/* Base Yarn Body (Emerald Green) */}
              <rect x={cx - 6} y={6} width={12} height={19} fill="#059669" />

              {/* Animated Rolling Thread Windings (Moving down continuously) */}
              <g className="spindle-yarn-scroll">
                {[-12, -4, 4, 12, 20, 28].map((yOffset, sIdx) => (
                  <g key={sIdx}>
                    {/* White highlight yarn coil */}
                    <line
                      x1={cx - 6}
                      y1={yOffset}
                      x2={cx + 6}
                      y2={yOffset + 3.5}
                      stroke="#ffffff"
                      strokeWidth="1.1"
                      strokeOpacity="0.85"
                    />
                    {/* Deep green shadow coil */}
                    <line
                      x1={cx - 6}
                      y1={yOffset + 2}
                      x2={cx + 6}
                      y2={yOffset + 5.5}
                      stroke="#064e3b"
                      strokeWidth="1"
                      strokeOpacity="0.75"
                    />
                  </g>
                ))}
              </g>

              {/* 3D Cylindrical Light Reflection Overlay */}
              <rect x={cx - 1.5} y={7} width={2.2} height={17} fill="#ffffff" fillOpacity="0.32" />
              <line x1={cx - 4} y1={7} x2={cx - 4.8} y2={24} stroke="#064e3b" strokeWidth="0.8" strokeOpacity="0.6" />
              <line x1={cx + 4} y1={7} x2={cx + 4.8} y2={24} stroke="#064e3b" strokeWidth="0.8" strokeOpacity="0.6" />
            </g>

            {/* Spindle Wharve (Pulleys connected to tape) */}
            <path
              d={`M ${cx - 4.5} 24 L ${cx + 4.5} 24 L ${cx + 4} 27 L ${cx - 4} 27 Z`}
              fill="#475569"
              stroke="#1e293b"
              strokeWidth="0.5"
            />

            {/* Bolster Pin going into rail */}
            <line x1={cx} y1={27} x2={cx} y2={30} stroke="#334155" strokeWidth="2.2" strokeLinecap="round" />
          </g>
        ))}
      </svg>
    </div>
  );
};

// Backward-compatible alias
export const ThreadSpindleSpinIcon = FourSpindleRollAnimation;

export const CountWiseFrames: React.FC<CountWiseFramesProps> = ({
  report,
  workers = [],
  countConversions = [],
  isTvMode = false,
  activeCountIndex: propActiveCountIndex,
  onSelectCountIndex,
  onPagesDetermined,
  tvPageInterval = 15,
  onSelectDate,
  availableDates = []
}) => {
  const [internalIndex, setInternalIndex] = useState(0);
  const activeCountIndex = propActiveCountIndex !== undefined ? propActiveCountIndex : internalIndex;

  const handleSelectCountIndex = (idx: number) => {
    setInternalIndex(idx);
    if (onSelectCountIndex) {
      onSelectCountIndex(idx);
    }
  };

  const [isAutoCyclingPaused, setIsAutoCyclingPaused] = useState(false);

  // 1. Group Frames by Running Count
  const countGroups: CountGroup[] = useMemo(() => {
    const countSet = new Set<string>();

    (report.summaries || []).forEach(s => {
      const c = (s.count || '').trim();
      if (c && c !== '-' && c !== '0') countSet.add(c);
    });
    (report.entries || []).forEach(e => {
      const c = (e.count || '').trim();
      if (c && c !== '-' && c !== '0') countSet.add(c);
    });

    const uniqueCountNames = Array.from(countSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (uniqueCountNames.length === 0) {
      return [];
    }

    return uniqueCountNames.map(countName => {
      // Find all frames with this count
      const summaryFrames = (report.summaries || []).filter(s => s.count === countName && s.frameNo);
      const entryFrames = (report.entries || []).filter(e => e.count === countName && e.frameNo);

      // Frame is considered actively running if it has positive production, GPS, utilization or non-dummy target
      const runningSummaryFrames = summaryFrames.filter(s => (s.actualProd || 0) > 0 || (s.targetProd || 0) > 0 || (s.avgGps || 0) > 0 || (s.avgUtil || 0) > 0);
      const runningEntryFrames = entryFrames.filter(e => (e.productionActual || 0) > 0 || (e.productionTarget || 0) > 0 || (e.gpsActual || 0) > 0 || (e.efficiency || 0) > 0);

      let allFrameNos = Array.from(new Set([
        ...runningSummaryFrames.map(s => s.frameNo),
        ...runningEntryFrames.map(e => e.frameNo)
      ])).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

      // Fallback if data is planned without actual logs yet: include frames if count is not default 40s dummy
      if (allFrameNos.length === 0 && countName !== '40s') {
        allFrameNos = Array.from(new Set([
          ...summaryFrames.map(s => s.frameNo),
          ...entryFrames.map(e => e.frameNo)
        ])).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      }

      // IF NO FRAME IS RUNNING THIS COUNT, DO NOT SHOW IT!
      if (allFrameNos.length === 0) return null;

      const conversion = countConversions.find(c => isCountMatch(c.count, countName));
      const factor = conversion?.multiplicationFactor ?? (entryFrames[0]?.gpsActual && entryFrames[0]?.gps40sCon ? Number((entryFrames[0].gps40sCon / entryFrames[0].gpsActual).toFixed(4)) : 1.0);

      // Group std GPS
      let groupStdGps = 160;
      if (summaryFrames.length > 0 && summaryFrames[0].stdGps > 0) {
        groupStdGps = summaryFrames[0].stdGps;
      } else if (entryFrames.length > 0 && entryFrames[0].gpsTarget > 0) {
        groupStdGps = entryFrames[0].gpsTarget;
      }

      // Build each machine frame item
      const frames: FrameTelemetryItem[] = allFrameNos.map(fNo => {
        const s = summaryFrames.find(sm => sm.frameNo === fNo);
        const entries = entryFrames.filter(en => en.frameNo === fNo);

        const stdGps = s?.stdGps && s.stdGps > 0 
          ? s.stdGps 
          : entries[0]?.gpsTarget && entries[0].gpsTarget > 0 
          ? entries[0].gpsTarget 
          : groupStdGps;

        // Actual GPS average across shifts
        let actualGps = 0;
        if (s && s.avgGps > 0) {
          actualGps = s.avgGps;
        } else if (entries.length > 0) {
          const validEntries = entries.filter(e => e.gpsActual > 0);
          if (validEntries.length > 0) {
            actualGps = validEntries.reduce((acc, curr) => acc + curr.gpsActual, 0) / validEntries.length;
          }
        }

        // Production KG
        const prodKg = s?.actualProd && s.actualProd > 0
          ? s.actualProd
          : entries.reduce((acc, curr) => acc + (curr.productionActual || 0), 0);

        const targetProd = s?.targetProd && s.targetProd > 0
          ? s.targetProd
          : entries.reduce((acc, curr) => acc + (curr.productionTarget || 0), 0);

        // Efficiency %
        const eff = s?.avgUtil && s.avgUtil > 0
          ? s.avgUtil
          : targetProd > 0 
          ? (prodKg / targetProd) * 100 
          : (entries[0]?.efficiency || 95.0);

        // 40s Converted GPS
        let gps40sCon = 0;
        const valid40s = entries.filter(e => (e.gps40sCon || 0) > 0);
        if (valid40s.length > 0) {
          gps40sCon = valid40s.reduce((acc, curr) => acc + curr.gps40sCon, 0) / valid40s.length;
        } else {
          gps40sCon = actualGps * factor;
        }

        const targetRatio = stdGps > 0 ? Math.round((actualGps / stdGps) * 100) : 0;

        // Assigned Crew lookups
        const sidersSet = new Set<string>();
        entries.forEach(e => {
          if (e.siderIds && e.siderIds.length > 0) {
            e.siderIds.filter(Boolean).forEach(id => {
              const w = resolveWorker(id, undefined, workers);
              if (w?.name) sidersSet.add(`${w.name}${w.tNo ? ` (${w.tNo})` : ''}`);
            });
          } else if (e.siderId) {
            const w = resolveWorker(e.siderId, e.siderName, workers);
            if (w?.name) sidersSet.add(`${w.name}${w.tNo ? ` (${w.tNo})` : ''}`);
          }
        });

        // Machine gaiter
        let gaiterNameStr = '';
        const gaiterId = entries[0]?.gaiterId || report.gaiters?.[entries[0]?.shift || 'I']?.[0];
        if (gaiterId) {
          const gw = resolveWorker(gaiterId, entries[0]?.gaiterName, workers);
          if (gw?.name) gaiterNameStr = `${gw.name}${gw.tNo ? ` (${gw.tNo})` : ''}`;
        }

        return {
          frameNo: fNo,
          count: countName,
          stdGps,
          actualGps,
          gps40sCon,
          productionKg: prodKg,
          targetProdKg: targetProd,
          efficiency: eff,
          targetRatio,
          siderNames: sidersSet.size > 0 ? Array.from(sidersSet).join(' · ') : 'Unassigned',
          gaiterName: gaiterNameStr || 'Unassigned'
        };
      });

      // Group totals
      const fCount = frames.length || 1;
      const avgStd = frames.reduce((a, b) => a + b.stdGps, 0) / fCount;
      const avgActual = frames.reduce((a, b) => a + b.actualGps, 0) / fCount;
      const avg40s = frames.reduce((a, b) => a + b.gps40sCon, 0) / fCount;
      const totalProd = frames.reduce((a, b) => a + b.productionKg, 0);
      const avgEff = frames.reduce((a, b) => a + b.efficiency, 0) / fCount;
      const gpsAch = avgStd > 0 ? Math.round((avgActual / avgStd) * 100) : 0;

      return {
        name: countName,
        frames,
        avgStdGps: avgStd,
        avgActualGps: avgActual,
        avg40sGps: avg40s,
        totalProdKg: totalProd,
        avgEfficiency: avgEff,
        gpsAchievement: gpsAch,
        factor
      };
    }).filter((g): g is CountGroup => g !== null && g.frames.length > 0);
  }, [report, workers, countConversions]);

  // Report pages count to parent TV dashboard
  useEffect(() => {
    if (onPagesDetermined && countGroups.length > 0) {
      onPagesDetermined(countGroups.length);
    }
  }, [onPagesDetermined, countGroups.length]);

  // 2. Auto-cycling through count subpages in TV mode if not controlled externally
  useEffect(() => {
    if (!isTvMode || isAutoCyclingPaused || countGroups.length <= 1 || propActiveCountIndex !== undefined) return;

    const intervalTime = Math.max(5, tvPageInterval) * 1000;
    const timer = setInterval(() => {
      handleSelectCountIndex((activeCountIndex + 1) % countGroups.length);
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isTvMode, isAutoCyclingPaused, countGroups.length, tvPageInterval, propActiveCountIndex, activeCountIndex]);

  // Safe active count group
  const safeIndex = Math.min(activeCountIndex, Math.max(0, countGroups.length - 1));
  const activeGroup = countGroups[safeIndex] || countGroups[0];

  if (!activeGroup || countGroups.length === 0) {
    return (
      <div className="w-full bg-white rounded-3xl border border-stone-200 p-12 text-center shadow-2xs">
        <Activity size={36} className="text-stone-300 mx-auto mb-3" />
        <h3 className="text-base font-black text-stone-700 uppercase tracking-tight">
          No Count Telemetry Available
        </h3>
        <p className="text-xs text-stone-400 font-bold mt-1">
          Upload a daily production statement to visualize count-wise frame telemetry.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(
      "w-full transition-all duration-300 font-sans space-y-4 md:space-y-5",
      isTvMode ? "p-3 md:p-5 max-w-[1720px] mx-auto" : "p-4 md:p-6 lg:p-8 max-w-7xl mx-auto"
    )}>
      {/* ========================================================================= */}
      {/* 1. TOP HEADER & TELEMETRY SUMMARY DUAL-CARD (WHITE & GREY THEME)          */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-3xl border border-stone-200 shadow-2xs p-4 md:p-5 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-stone-100">
          {/* Left Title & Status */}
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 md:w-12 md:h-12 rounded-2xl bg-blue-500/10 border border-blue-300 text-blue-700 flex items-center justify-center shrink-0 shadow-2xs">
              <Activity size={24} className="text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-emerald-100 border border-emerald-300 text-emerald-800 text-[10px] font-black uppercase font-mono tracking-wider">
                  PART {safeIndex + 1} OF {countGroups.length}
                </span>
                <span className="text-stone-300 text-xs">•</span>
                <span className="text-[11px] font-bold text-stone-400 font-mono uppercase tracking-wider">
                  DATE: {report.date || 'TODAY'}
                </span>
                {report.shed && (
                  <>
                    <span className="text-stone-300 text-xs">•</span>
                    <span className="text-[11px] font-black text-stone-600 uppercase">
                      {report.shed} LIVE TELEMETRY
                    </span>
                  </>
                )}
              </div>
              <h2 className="text-lg md:text-xl lg:text-2xl font-black text-stone-900 tracking-tight uppercase mt-1">
                Spinning Ring Frame Telemetry & Crew Roster
              </h2>
            </div>
          </div>

          {/* Right: Active Count Header Card & Dials */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Active Count Banner Card */}
            <div className="bg-stone-50 border border-stone-200 rounded-2xl px-4 py-2 flex items-center gap-3 shadow-2xs">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block">
                  ACTIVE RUNNING COUNT ({activeGroup.frames.length} {activeGroup.frames.length === 1 ? 'FRAME' : 'FRAMES'})
                </span>
                <span className="text-lg md:text-xl font-black text-stone-900 font-mono tracking-tight block">
                  {activeGroup.name}
                </span>
              </div>
              <div className="pl-3 border-l border-stone-200 text-right">
                <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block">
                  40S CONV
                </span>
                <span className="text-xs font-black text-emerald-700 font-mono block">
                  ×{activeGroup.factor.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Dials / Quick Metrics */}
            <div className="flex items-center gap-2">
              {/* Achievement Dial */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-3 py-2 text-center min-w-[90px]">
                <div className="text-base md:text-lg font-black text-emerald-800 font-mono leading-none">
                  {activeGroup.gpsAchievement}%
                </div>
                <div className="text-[9px] font-black uppercase tracking-wider text-emerald-700 mt-1 leading-tight">
                  GPS ACH ({Math.round(activeGroup.avgActualGps)}/{Math.round(activeGroup.avgStdGps)})
                </div>
              </div>

              {/* Efficiency */}
              <div className="bg-blue-50 border border-blue-200 rounded-2xl px-3 py-2 text-center min-w-[85px]">
                <div className="text-base md:text-lg font-black text-blue-800 font-mono leading-none">
                  {activeGroup.avgEfficiency.toFixed(1)}%
                </div>
                <div className="text-[9px] font-black uppercase tracking-wider text-blue-700 mt-1 leading-tight">
                  COUNT UTIL
                </div>
              </div>

              {/* 40s Converted Output */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-3 py-2 text-center min-w-[95px]">
                <div className="text-base md:text-lg font-black text-indigo-900 font-mono leading-none">
                  {activeGroup.avg40sGps.toFixed(1)} <span className="text-[10px] font-bold text-indigo-700">40s</span>
                </div>
                <div className="text-[9px] font-black uppercase tracking-wider text-indigo-700 mt-1 leading-tight">
                  {Math.round(activeGroup.totalProdKg).toLocaleString()} KG TOTAL
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Count Navigation Tabs / Pills */}
        <div className="pt-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-stone-400 mr-1 flex items-center gap-1">
              <Layers size={13} />
              <span>RUNNING COUNTS:</span>
            </span>
            {countGroups.map((group, idx) => {
              const isSelected = idx === safeIndex;
              return (
                <button
                  key={group.name}
                  onClick={() => handleSelectCountIndex(idx)}
                  className={cn(
                    "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer font-mono flex items-center gap-1.5 shadow-2xs",
                    isSelected
                      ? "bg-emerald-600 text-white shadow-emerald-600/20 scale-[1.02]"
                      : "bg-stone-100 hover:bg-stone-200/80 text-stone-700 border border-stone-200/60"
                  )}
                >
                  <span className={cn(
                    "px-1.5 py-0.2 rounded text-[10px] font-bold",
                    isSelected ? "bg-white/20 text-white" : "bg-stone-200 text-stone-600"
                  )}>
                    PART {idx + 1}
                  </span>
                  <span>{group.name}</span>
                  <span className="text-[10px] opacity-80">({group.frames.length} RF)</span>
                </button>
              );
            })}
          </div>

          {/* Pause / Play Controls in TV Mode */}
          {isTvMode && countGroups.length > 1 && (
            <div className="flex items-center gap-1 text-[11px] text-stone-500 font-bold">
              <button
                onClick={() => setIsAutoCyclingPaused(!isAutoCyclingPaused)}
                className="px-2.5 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 flex items-center gap-1 transition-all cursor-pointer"
                title={isAutoCyclingPaused ? 'Resume auto rotation' : 'Pause auto rotation'}
              >
                {isAutoCyclingPaused ? <Play size={11} className="text-emerald-600" /> : <Pause size={11} />}
                <span>{isAutoCyclingPaused ? 'Paused' : 'Auto Cycle'}</span>
              </button>
              <button
                onClick={() => handleSelectCountIndex((safeIndex - 1 + countGroups.length) % countGroups.length)}
                className="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-700 transition-all cursor-pointer"
              >
                <ChevronLeft size={13} />
              </button>
              <button
                onClick={() => handleSelectCountIndex((safeIndex + 1) % countGroups.length)}
                className="w-6 h-6 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center text-stone-700 transition-all cursor-pointer"
              >
                <ChevronRight size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. MACHINE FRAMES GRID FOR ACTIVE COUNT (CLEAN WHITE & GREY THEME)       */}
      {/* ========================================================================= */}
      <div className={cn(
        "grid gap-4 md:gap-5 transition-all duration-300",
        activeGroup.frames.length === 1 && countGroups.length > 1
          ? "grid-cols-1 lg:grid-cols-2"
          : activeGroup.frames.length === 1
          ? "grid-cols-1 max-w-2xl mx-auto"
          : activeGroup.frames.length === 2
          ? "grid-cols-1 md:grid-cols-2"
          : activeGroup.frames.length <= 4
          ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      )}>
        {activeGroup.frames.map(frame => {
          const isHighAchiever = frame.targetRatio >= 90;
          const isModerate = frame.targetRatio >= 75 && frame.targetRatio < 90;

          return (
            <div
              key={frame.frameNo}
              className="bg-stone-100 hover:bg-stone-100/90 rounded-2xl border-2 border-stone-300 shadow-xs hover:shadow-md hover:border-emerald-400 transition-all p-4 md:p-5 flex flex-col justify-between"
            >
              {/* Card Header: Frame No & Status */}
              <div>
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-stone-200">
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-xl bg-stone-900 text-white font-mono font-black text-sm flex items-center justify-center shadow-xs">
                      {frame.frameNo.replace(/\D/g, '') || frame.frameNo}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-black text-stone-900 text-sm md:text-base">
                          {frame.frameNo}
                        </span>
                        <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] font-black uppercase">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                          <span>RUNNING</span>
                        </span>
                      </div>
                      <span className="text-[10px] font-mono font-bold text-stone-500 block mt-0.5">
                        {frame.count} · ×{activeGroup.factor.toFixed(4)}
                      </span>
                    </div>
                  </div>

                  {/* Top Right: Animated 4-Spindle Roll Animation (No circles) */}
                  <div
                    className="flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white border border-stone-300 shadow-2xs group hover:border-emerald-400 transition-all cursor-default"
                    title={`Machine ${frame.frameNo} - 4-Spindle Roll Active`}
                  >
                    <FourSpindleRollAnimation />
                    <span className="text-[10px] font-black uppercase font-mono tracking-wider text-emerald-800 hidden sm:inline-block">
                      SPINNING
                    </span>
                  </div>
                </div>

                {/* 4 Core Telemetry Metrics */}
                <div className="grid grid-cols-4 gap-2 text-center py-2.5 px-2 bg-white rounded-xl border border-stone-200 shadow-2xs mb-3">
                  {/* STD GPS */}
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block">
                      STD GPS
                    </span>
                    <span className="text-sm md:text-base font-black text-stone-700 font-mono block mt-0.5">
                      {frame.stdGps.toFixed(1)}
                    </span>
                  </div>

                  {/* ACTUAL GPS */}
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block">
                      ACTUAL GPS
                    </span>
                    <span className="text-sm md:text-base font-black text-amber-600 font-mono block mt-0.5">
                      {frame.actualGps.toFixed(1)}
                    </span>
                  </div>

                  {/* 40S GPS */}
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block">
                      40S GPS
                    </span>
                    <span className="text-sm md:text-base font-black text-blue-600 font-mono block mt-0.5">
                      {frame.gps40sCon.toFixed(1)}
                    </span>
                  </div>

                  {/* PROD / EFF */}
                  <div>
                    <span className="text-[9px] font-black uppercase tracking-wider text-stone-400 block">
                      PROD / EFF
                    </span>
                    <span className="text-xs md:text-sm font-black text-stone-900 font-mono block mt-0.5 truncate">
                      {Math.round(frame.productionKg)} KG
                    </span>
                    <span className="text-[9px] font-bold text-emerald-600 block leading-tight">
                      {frame.efficiency.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Target Ratio Progress Bar */}
                <div className="mb-4">
                  <div className="flex items-center justify-between text-[10px] font-bold text-stone-500 mb-1">
                    <span>GPS Target Ratio</span>
                    <span className="font-mono font-black">{frame.targetRatio}%</span>
                  </div>
                  <div className="w-full h-2 bg-stone-200 rounded-full overflow-hidden border border-stone-300/40">
                    <div 
                      className={cn(
                        "h-full rounded-full transition-all duration-700 ease-out",
                        isHighAchiever ? "bg-emerald-500" : isModerate ? "bg-amber-500" : "bg-rose-500"
                      )}
                      style={{ width: `${Math.min(100, frame.targetRatio)}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Bottom: Assigned Crew Section */}
              <div className="pt-3 border-t border-stone-200 space-y-2">
                {/* Sider Box */}
                <div className="flex items-center gap-2 p-2 rounded-xl bg-white border border-stone-200 shadow-2xs">
                  <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                    S
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] font-black uppercase text-stone-400 block tracking-wider leading-none">
                      ASSIGNED SIDER (LH / RH)
                    </span>
                    <span className="text-xs font-bold text-stone-800 truncate block mt-0.5">
                      {frame.siderNames}
                    </span>
                  </div>
                </div>

                {/* Gaiter Box */}
                <div className="flex items-center gap-2 p-2 rounded-xl bg-amber-50/80 border border-amber-200 shadow-2xs">
                  <span className="w-6 h-6 rounded-lg bg-amber-500 text-white font-black text-[10px] flex items-center justify-center shrink-0">
                    G
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="text-[9px] font-black uppercase text-amber-700 block tracking-wider leading-none">
                      ASSIGNED GAITER
                    </span>
                    <span className="text-xs font-bold text-stone-800 truncate block mt-0.5">
                      {frame.gaiterName}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* If 1 frame in this count and multiple counts exist, render Running Counts Comparison on right (Matches Image 2) */}
        {activeGroup.frames.length === 1 && countGroups.length > 1 && (
          <div className="bg-white rounded-2xl border border-stone-200/90 shadow-2xs p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-200">
                    <TrendingUp size={16} />
                  </div>
                  <div>
                    <h4 className="text-sm md:text-base font-black text-stone-900 uppercase tracking-tight">
                      {report.shed || 'Mill'} Running Counts Comparison
                    </h4>
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                      {countGroups.length} Active Counts Telemetry Overview
                    </span>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300">
                  {countGroups.length} Counts Active
                </span>
              </div>

              {/* List of Counts */}
              <div className="space-y-3">
                {countGroups.map((cg, cIdx) => {
                  const isCurrent = cIdx === safeIndex;
                  const ratio = cg.avgStdGps > 0 ? Math.min(100, Math.round((cg.avgActualGps / cg.avgStdGps) * 100)) : 0;
                  return (
                    <div
                      key={cg.name}
                      onClick={() => handleSelectCountIndex(cIdx)}
                      className={cn(
                        "p-3.5 rounded-xl border transition-all cursor-pointer",
                        isCurrent
                          ? "bg-emerald-50/60 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs"
                          : "bg-stone-50/70 hover:bg-stone-100/80 border-stone-200/80"
                      )}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase",
                            isCurrent ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-700"
                          )}>
                            PART {cIdx + 1}
                          </span>
                          <span className="font-mono font-black text-xs md:text-sm text-stone-900">
                            {cg.name}
                          </span>
                          <span className="text-[10px] text-stone-500 font-mono">
                            ({cg.frames.length} RF: {cg.frames.map(f => f.frameNo).join(', ')})
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="font-mono font-black text-xs md:text-sm text-emerald-700">
                            {cg.avgActualGps.toFixed(1)} GPS
                          </span>
                          <span className="text-stone-300 mx-1.5">•</span>
                          <span className="font-mono font-bold text-xs text-stone-700">
                            {Math.round(cg.totalProdKg).toLocaleString()} KG
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="w-full h-2 bg-stone-200/70 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500 font-bold mt-4">
              <span>Click any part to jump directly</span>
              <span className="text-emerald-700 font-mono font-black">Auto-cycling active</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
