import React, { useMemo, useState, useEffect } from 'react';
import { DailyReport, Sider, IncentiveRule, Shift, ProductionEntry } from '../types';
import { Trophy, Star, Activity, Coins, Zap, Target, Calendar, Printer } from 'lucide-react';
import { motion } from 'motion/react';
import { cn, calculateIncentive, resolveWorker, getGaiterIncentive } from '../lib/utils';

interface BestShiftProps {
  report: DailyReport;
  workers: Sider[];
  rules: IncentiveRule[];
  isTvMode?: boolean;
}

export const BestShift: React.FC<BestShiftProps> = ({ report, workers, rules, isTvMode }) => {
  // Live ticking clock for TV view
  const [tickerTime, setTickerTime] = useState(new Date());
  useEffect(() => {
    if (!isTvMode) return;
    const interval = setInterval(() => {
      setTickerTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, [isTvMode]);

  const bestShiftData = useMemo(() => {
    if (!report || !report.entries || report.entries.length === 0) return null;

    const hasAssignments = (shift: Shift, entries: ProductionEntry[]) => {
      const hasSider = entries.some(e => 
        (e.siderId && e.siderId.trim() !== '') || 
        (e.siderName && e.siderName.trim() !== '' && e.siderName.toLowerCase().trim() !== 'unassigned') || 
        (e.siderIds && e.siderIds.some(id => id && id.trim() !== ''))
      );
      const hasGaiter = !!(report.gaiters?.[shift] && report.gaiters[shift].some(id => id && id.trim() !== ''));
      const hasAiCone = !!(report.aiCones?.[shift] && report.aiCones[shift].some(id => id && id.trim() !== ''));
      return hasSider || hasGaiter || hasAiCone;
    };

    const shifts: Shift[] = ['I', 'II', 'III'];
    const shiftStats = shifts.map(shift => {
      const entries = report.entries.filter(e => e.shift === shift);
      if (entries.length === 0) return { shift, totalProduction: 0, avgGps: 0, entries: [], hasAssigned: false };
      const totalProduction = entries.reduce((acc, e) => acc + (e.productionActual || 0), 0);
      const avgGps = entries.reduce((acc, e) => acc + (e.gpsActual || 0), 0) / entries.length;
      const hasAssigned = hasAssignments(shift, entries);
      return { shift, totalProduction, avgGps, entries, hasAssigned };
    });

    const activeShifts = shiftStats.filter(s => s.hasAssigned);
    const candidateShifts = activeShifts.length > 0 ? activeShifts : shiftStats;

    // Determine best shift based on total production as requested
    const best = candidateShifts.reduce((prev, curr) => curr.totalProduction > prev.totalProduction ? curr : prev, candidateShifts[0]);
    
    if (!best || (best.totalProduction === 0 && best.avgGps === 0)) return null;

    // Find all workers in this shift
    const workerStats: any[] = [];
    
    // Siders
    const siderMap = new Map<string, { entries: ProductionEntry[]; resolvedWorker: Sider }>();
    best.entries.forEach(entry => {
      const assignedIds = new Set<string>();
      if (entry.siderId) assignedIds.add(entry.siderId);
      if (entry.siderIds) entry.siderIds.forEach(id => id && assignedIds.add(id));
      
      // Fallback if no specific IDs are set but siderName is present
      if (assignedIds.size === 0 && entry.siderName && entry.siderName.toLowerCase().trim() !== 'unassigned') {
        const nameMatchWorker = workers.find(w => 
          w.name.toLowerCase().trim() === entry.siderName!.toLowerCase().trim()
        );
        if (nameMatchWorker) {
          assignedIds.add(nameMatchWorker.id);
        } else {
          assignedIds.add(entry.siderName);
        }
      }

      assignedIds.forEach(id => {
        const resolved = resolveWorker(id, entry.siderName, workers);
        const resolvedKey = resolved.id;
        if (!siderMap.has(resolvedKey)) {
          siderMap.set(resolvedKey, { entries: [], resolvedWorker: resolved });
        }
        siderMap.get(resolvedKey)!.entries.push(entry);
      });
    });

    siderMap.forEach((data, rKey) => {
      const worker = data.resolvedWorker;
      const totalIncentive = Math.min(120, data.entries.reduce((acc, e) => acc + calculateIncentive(e, rules), 0));
      const avgGps = data.entries.reduce((acc, e) => acc + (e.gpsActual || 0), 0) / data.entries.length;
      const avg40sGps = data.entries.reduce((acc, e) => acc + (e.gps40sCon || 0), 0) / data.entries.length;
      
      const avgEm = data.entries.reduce((acc, e) => {
        const summary = report.summaries?.find(s => s.frameNo === e.frameNo);
        return acc + (summary?.shiftDoffEmt[best.shift] || 0);
      }, 0) / data.entries.length;

      const avgDoffTime = data.entries.reduce((acc, e) => {
        const summary = report.summaries?.find(s => s.frameNo === e.frameNo);
        return acc + (summary?.shiftAvgDoffTime[best.shift] || 0);
      }, 0) / data.entries.length;

      workerStats.push({
        name: worker.name,
        tNo: worker.tNo,
        efficiency: avgEm,
        incentive: totalIncentive,
        doffTime: avgDoffTime,
        gps: avgGps,
        gps40s: avg40sGps,
        type: 'Sider'
      });
    });

    // Gaiter(s)
    const gaiterIds = report.gaiters?.[best.shift] || [];
    gaiterIds.forEach(gid => {
      const worker = resolveWorker(gid, undefined, workers);
      const shiftEntries = report.entries.filter(e => e.shift === best.shift);
      if (shiftEntries.length > 0) {
        const minGpsEntry = shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]);
        const incentive = Math.min(120, getGaiterIncentive(report, best.shift, rules, workers));

        const totalShiftDoffTime = shiftEntries.reduce((acc, e) => {
           const summary = report.summaries?.find(s => s.frameNo === e.frameNo);
           return acc + (summary?.shiftAvgDoffTime[best.shift] || 0);
        }, 0);
        const avgShiftDoffTime = totalShiftDoffTime / shiftEntries.length;

        workerStats.push({
          name: worker.name,
          tNo: worker.tNo,
          efficiency: null, 
          incentive: incentive,
          doffTime: avgShiftDoffTime, 
          gps: minGpsEntry.gpsActual,
          gps40s: minGpsEntry.gps40sCon,
          type: 'Gaiter'
        });
      }
    });

    return {
      shift: best.shift,
      date: report.date,
      workers: workerStats.sort((a, b) => b.incentive - a.incentive)
    };
  }, [report, workers, rules]);

  const shiftVal = bestShiftData?.shift || 'I';
  const shiftEntries = useMemo(() => report?.entries?.filter(e => e.shift === shiftVal) || [], [report, shiftVal]);
  const totalProduction = useMemo(() => Math.round(shiftEntries.reduce((acc, curr) => acc + (curr.productionActual || 0), 0)), [shiftEntries]);

  // AI Linkconers assigned inside this winning shift
  const aiLinkconers = useMemo(() => {
    if (!report) return [];
    const aiIds = report.aiCones?.[shiftVal] || [];
    return aiIds.map(id => resolveWorker(id, undefined, workers)).filter(Boolean);
  }, [report, shiftVal, workers]);

  // AI Linkconer Shift-wide performance calculations (matches implementation in AiMonthlyGrid)
  const aiMetrics = useMemo(() => {
    const utilEntries = shiftEntries.filter(e => typeof e.utility === 'number' && !isNaN(e.utility) && (e.utility || 0) > 0);
    const avgUtility = utilEntries.length > 0
      ? utilEntries.reduce((acc, curr) => acc + (curr.utility || 0), 0) / utilEntries.length
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

    let aiIncentive = 0;
    if (matchedRule) {
      const sortedPayouts = [...matchedRule.payouts].sort((a, b) => b.gpsThreshold - a.gpsThreshold);
      const bestPayout = sortedPayouts.find(p => Math.round(avgUtility) >= p.gpsThreshold);
      aiIncentive = bestPayout ? bestPayout.amount : 0;
    }

    return { avgUtility, aiIncentive };
  }, [shiftEntries, rules]);

  // Shift performance KPIs across the Ringframes
  const shiftPlatformKPIs = useMemo(() => {
    if (!report || !report.summaries || report.summaries.length === 0) {
      return { shiftAvgUtil: 0, shiftAvgEff: 0, shiftAvgGps: 0, shiftTotalDoffs: 0 };
    }
    const summaries = report.summaries;
    
    // Overall Frame Utilisation
    let totalUtil = 0;
    let countUtil = 0;
    summaries.forEach(s => {
      const u = s.shiftUtil?.[shiftVal];
      if (typeof u === 'number' && u > 0) {
        totalUtil += u;
        countUtil++;
      }
    });
    const shiftAvgUtil = countUtil > 0 ? totalUtil / countUtil : 0;

    // Sider frames actual GPS & EM efficiency
    const rfEntries = shiftEntries.filter(e => {
      const f = (e.frameNo || '').toUpperCase().trim();
      return f.startsWith('K0') || f.startsWith('K1') || f.startsWith('K2');
    });
    const shiftAvgGps = rfEntries.length > 0
      ? rfEntries.reduce((acc, curr) => acc + (curr.gpsActual || 0), 0) / rfEntries.length
      : 0;
    const shiftAvgEff = rfEntries.length > 0
      ? rfEntries.reduce((acc, curr) => acc + (curr.efficiency || 0), 0) / rfEntries.length
      : 0;

    // Overall doff counter
    let totalDoffs = 0;
    summaries.forEach(s => {
      const d = s.shiftNoOfDoff?.[shiftVal];
      if (typeof d === 'number' && d > 0) {
        totalDoffs += d;
      }
    });

    return { shiftAvgUtil, shiftAvgEff, shiftAvgGps, shiftTotalDoffs: totalDoffs };
  }, [report, shiftEntries, shiftVal]);

  if (!bestShiftData || bestShiftData.workers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-stone-400 bg-white rounded-[3rem] border border-stone-200 shadow-sm">
        <Trophy size={64} className="mb-6 opacity-20" />
        <p className="font-black uppercase tracking-widest text-sm">No Shift Data for {report?.date}</p>
      </div>
    );
  }

  // Helper to map and resolve machine slots matching exact original structure
  const getSlotData = (machineName: string, slotIdx: number) => {
    if (machineName === 'Gaiter') {
      const gaiterIds = report.gaiters?.[shiftVal] || [];
      const workerId = gaiterIds[slotIdx] || '';
      const worker = workerId ? workers.find(w => w.id === workerId || w.tNo === workerId) : null;

      const minGpsEntry = shiftEntries.length > 0 
        ? shiftEntries.reduce((min, curr) => curr.gpsActual < min.gpsActual ? curr : min, shiftEntries[0]) 
        : null;

      let gps = 0;
      let incentive = 0;
      if (minGpsEntry) {
        gps = minGpsEntry.gpsActual;
        incentive = getGaiterIncentive(report, shiftVal, rules, workers);
      }

      return {
        label: 'Gaiter',
        workerName: worker?.name || '',
        workerTNo: worker?.tNo || '',
        workerPhoto: worker?.photoUrl || null,
        gpsValue: gps,
        incentiveValue: worker ? incentive : 0,
        assigned: !!worker,
        countName: minGpsEntry?.count || ''
      };
    } else {
      const entry = shiftEntries.find(e => e.frameNo === machineName);
      if (entry) {
        let workerId = entry.siderIds?.[slotIdx] || (slotIdx === 0 ? entry.siderId : '');
        // Fallback if no specific workerId is set but siderName is present
        if (!workerId && slotIdx === 0 && entry.siderName && entry.siderName.toLowerCase().trim() !== 'unassigned') {
          workerId = entry.siderName;
        }

        const worker = workerId ? resolveWorker(workerId, entry.siderName, workers) : null;

        const isAssigned = !!worker;
        const baseIncentive = calculateIncentive(entry, rules);
        const incentive = isAssigned ? baseIncentive : 0;

        return {
          label: machineName,
          workerName: worker ? worker.name : '',
          workerTNo: worker ? worker.tNo : '',
          workerPhoto: worker ? worker.photoUrl : null,
          gpsValue: entry.gpsActual,
          incentiveValue: incentive,
          assigned: isAssigned,
          countName: entry.count || ''
        };
      } else {
        return {
          label: machineName,
          workerName: '',
          workerTNo: '',
          workerPhoto: null,
          gpsValue: 0,
          incentiveValue: 0,
          assigned: false,
          countName: ''
        };
      }
    }
  };

  const gridItems = useMemo(() => {
    const frameNos = Array.from(new Set(shiftEntries.map(e => e.frameNo))).filter(Boolean).sort();
    const items: { machine: string; slot: number }[] = [];
    frameNos.forEach(frame => {
      items.push({ machine: frame, slot: 0 });
      const entry = shiftEntries.find(e => e.frameNo === frame);
      if (entry && entry.siderIds && entry.siderIds.length > 1) {
        items.push({ machine: frame, slot: 1 });
      }
    });
    items.push({ machine: 'Gaiter', slot: 0 });
    items.push({ machine: 'Gaiter', slot: 1 });
    return items;
  }, [shiftEntries]);

  /* ==========================================
     1. TV mode view: Optimized for 50-inch TV
     ========================================== */
  if (isTvMode) {
    return (
      <div className="fixed inset-0 z-[100] bg-white text-stone-900 flex flex-col justify-between overflow-hidden p-6 font-sans select-none">
        
        {/* Header Ribbon */}
        <div className="flex justify-between items-center bg-stone-50 border border-stone-200 rounded-[2rem] p-4 px-8 shadow-md">
          <div className="flex items-center gap-5">
            <div className="h-16 w-16 bg-gradient-to-br from-amber-500 to-yellow-400 rounded-2xl flex items-center justify-center shadow-md">
              <Trophy size={36} className="text-stone-950" fill="currentColor" />
            </div>
            <div>
              <h1 className="text-3xl font-black uppercase tracking-tight text-stone-900">
                Best Shift Of The Day
              </h1>
              <p className="text-amber-700 font-extrabold text-xs uppercase tracking-[0.25em]">
                SpinMonitor Excellence Program • Live TV Console
              </p>
            </div>
          </div>

          {/* Quick Stats Pill */}
          <div className="flex gap-4">
            <div className="bg-amber-50 border border-amber-200 px-6 py-2.5 rounded-2xl flex items-center gap-3">
              <span className="text-stone-500 font-extrabold text-xs uppercase tracking-widest">SHIFT</span>
              <span className="text-amber-800 text-3xl font-black font-mono leading-none">{shiftVal}</span>
            </div>
            <div className="bg-emerald-55 border border-emerald-200 px-6 py-2.5 rounded-2xl flex items-center gap-3">
              <span className="text-stone-500 font-extrabold text-xs uppercase tracking-widest">PRODUCTION</span>
              <span className="text-emerald-850 text-3xl font-black font-mono leading-none tabular-nums">
                {totalProduction.toLocaleString()} KG
              </span>
            </div>
          </div>

          {/* Clock Info */}
          <div className="text-right">
            <span className="text-lg font-extrabold text-stone-550 uppercase tracking-widest block">{report.date}</span>
            <span className="text-2xl font-black text-amber-600 font-mono tabular-nums leading-none">
              {tickerTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </span>
          </div>
        </div>

        {/* Widescreen split content: 8/12th grid, 4/12th sidebar */}
        <div className="grid grid-cols-12 gap-6 flex-1 h-0 min-h-0 my-5">
          
          {/* Grid View (Left 8 Columns) */}
          <div className="col-span-8 grid grid-cols-3 grid-rows-3 gap-4 h-full">
            {gridItems.map((item, idx) => {
              const data = getSlotData(item.machine, item.slot);
              return (
                <div 
                  key={`tv-card-${idx}`}
                  className={cn(
                    "flex bg-stone-50 border rounded-3xl overflow-hidden shadow-md h-full transition-all duration-300",
                    data.assigned ? "border-stone-200" : "border-stone-100 opacity-40 bg-stone-100/40"
                  )}
                >
                  {/* Left Column: Machine ID */}
                  <div className="w-16 md:w-20 bg-stone-100 border-r border-stone-200 flex flex-col justify-center items-center shrink-0">
                    <span className="text-[10px] text-stone-500 font-black uppercase tracking-wider mb-1">M/C</span>
                    <span className="text-stone-850 text-xl font-black font-sans leading-none">{data.label}</span>
                  </div>

                  {/* Center Column: Photo */}
                  <div className="w-24 md:w-32 bg-stone-50 border-r border-stone-200 flex items-center justify-center shrink-0 relative overflow-hidden">
                    {data.workerPhoto ? (
                      <div className="w-full h-full relative">
                        <img 
                          src={data.workerPhoto} 
                          alt={data.workerName} 
                          className="w-full h-full object-cover" 
                          referrerPolicy="no-referrer"
                        />
                        <div className="absolute bottom-0 inset-x-0 bg-stone-900/80 p-1 text-center text-[10px] font-black uppercase tracking-tight truncate text-stone-100">
                          {data.workerName.split(' ')[0]}
                        </div>
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center">
                        <div className="w-10 h-10 rounded-full bg-stone-200/80 border border-stone-300 flex items-center justify-center text-stone-500 mb-1">
                          <Star className="text-amber-500/80" size={16} fill="currentColor" />
                        </div>
                        <span className="text-[10px] text-stone-700 font-extrabold truncate max-w-full uppercase leading-none">
                          {data.assigned ? data.workerName : 'VACANT'}
                        </span>
                        {data.assigned && (
                          <span className="text-[8px] text-amber-600 font-bold font-mono tracking-tight block mt-1">
                            {data.workerTNo}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Metrics stack */}
                  <div className="flex flex-col flex-1 h-full min-w-0">
                    {/* GPS */}
                    <div className="h-1/2 border-b border-stone-200 flex flex-col justify-center px-4">
                      {data.assigned && data.countName && (
                        <div className="text-[10px] text-purple-700 font-extrabold uppercase tracking-widest truncate leading-none mb-1">
                          {data.countName}
                        </div>
                      )}
                      <span className="text-[9px] text-stone-500 font-black uppercase tracking-widest leading-none mb-1">GPS</span>
                      <span className="text-xl md:text-2xl font-black text-amber-600 font-mono tracking-tight leading-none">
                        {data.assigned && data.gpsValue > 0 ? Math.round(data.gpsValue) : '-'}
                      </span>
                    </div>
                    {/* Incentive payout */}
                    <div className="h-1/2 flex flex-col justify-center px-4 bg-emerald-50">
                      <span className="text-[9px] text-stone-500 font-black uppercase tracking-widest leading-none mb-1">Incentive</span>
                      <span className="text-xl md:text-2xl font-black text-emerald-800 font-mono tracking-tight leading-none">
                        {data.assigned && data.incentiveValue > 0 ? `₹${Math.round(data.incentiveValue)}` : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Sidebar View (Right 4 Columns of TV mode) */}
          <div className="col-span-4 flex flex-col gap-5 h-full">
            
            {/* Card 1: AI LINKCONER */}
            <div className="bg-stone-50 border border-stone-200 rounded-[2rem] p-6 flex flex-col justify-between flex-1 h-0 min-h-0 shadow-md">
              <div className="flex flex-col justify-between flex-1 h-full">
                <div>
                  <div className="flex items-center gap-3 border-b border-stone-200 pb-3 mb-4">
                    <div className="h-10 w-10 bg-purple-100 border border-purple-200 rounded-xl flex items-center justify-center text-purple-700">
                      <Zap size={20} fill="currentColor" />
                    </div>
                    <div>
                      <h2 className="text-lg font-black text-stone-900 uppercase tracking-tight">AI Linkconer (AI Cone)</h2>
                      <p className="text-stone-500 text-[9px] font-black uppercase tracking-widest">Selected Shift Allocation</p>
                    </div>
                  </div>

                  {/* Assigned AI Workers List */}
                  {aiLinkconers.length > 0 ? (
                    <div className="space-y-3">
                      {aiLinkconers.map((w, index) => (
                        <div key={`ai-tv-${index}`} className="flex items-center gap-5 bg-stone-100/55 p-4 rounded-3xl border border-stone-200">
                          <div className="w-44 md:w-56 h-56 md:h-72 rounded-[2rem] bg-purple-100 border border-purple-200 flex items-center justify-center overflow-hidden shrink-0 shadow-md">
                            {w.photoUrl ? (
                              <img src={w.photoUrl} alt={w.name} className="w-full h-full object-cover scale-105" referrerPolicy="no-referrer" />
                            ) : (
                              <Star className="text-purple-600" size={72} fill="currentColor" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1 py-2">
                            <p style={{ fontSize: '32px' }} className="text-3xl font-black text-stone-900 uppercase truncate mb-3">{w.name}</p>
                            <p style={{ fontSize: '20px' }} className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-2 rounded-2xl text-[18px] font-black uppercase tracking-widest border border-purple-200">
                              TK NO: {w.tNo || "N/A"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-stone-100/30 border border-stone-200 rounded-2xl p-5 text-center text-stone-500 flex flex-col items-center justify-center my-1 select-none">
                      <Star className="opacity-40 text-purple-500 mb-1.5" size={20} />
                      <p className="text-[10px] font-black uppercase tracking-widest">No Dedicated AI Linkconer</p>
                    </div>
                  )}
                </div>

                {/* Performance Indicator of AI Linkconers */}
                <div className="mt-4 pt-4 border-t border-stone-200">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Utilization */}
                    <div className="bg-stone-100/80 p-3 rounded-2xl text-center border border-stone-200">
                      <span style={{ fontSize: '15px' }} className="text-[9px] text-stone-500 font-black uppercase tracking-widest block mb-1">UTILISATION</span>
                      <span style={{ fontSize: '35px' }} className="text-2xl font-black text-purple-700 font-mono tracking-tight leading-none text-[35px]">
                        {aiMetrics.avgUtility > 0 ? `${aiMetrics.avgUtility.toFixed(1)}%` : '-'}
                      </span>
                      {aiMetrics.avgUtility > 0 && (
                        <div className="w-full bg-stone-200 h-1 rounded-full mt-2 overflow-hidden">
                          <div 
                            className="bg-purple-600 h-full rounded-full" 
                            style={{ width: `${Math.min(100, aiMetrics.avgUtility)}%` }}
                          />
                        </div>
                      )}
                    </div>
                    {/* Incentive */}
                    <div className="bg-stone-100/80 p-3 rounded-2xl text-center border border-stone-200">
                      <span style={{ fontSize: '15px' }} className="text-[9px] text-stone-500 font-black uppercase tracking-widest block mb-1">INCENTIVE</span>
                      <span style={{ fontSize: '35px' }} className="text-2xl font-black text-emerald-800 font-mono tracking-tight leading-none text-[35px]">
                        {aiMetrics.aiIncentive > 0 ? `₹${aiMetrics.aiIncentive}` : '₹0'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: SHIFT PERFORMANCE & UTILISATION */}
            <div className="bg-stone-50 border border-stone-200 rounded-[2rem] p-6 flex flex-col justify-between flex-1 h-0 min-h-0 shadow-md">
              <div className="flex flex-col justify-between flex-1 h-full">
                
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-stone-200 pb-3 mb-4">
                  <div className="flex-1">
                    <h3 style={{ fontSize: '25px' }} className="text-lg font-black text-stone-900 uppercase tracking-tight">Shift Utilisation</h3>
                    <p className="text-stone-500 text-[9px] font-black uppercase tracking-widest">Sider & Frame Metrics</p>
                  </div>
                  <div className="h-10 w-10 bg-indigo-100 border border-indigo-200 rounded-xl flex items-center justify-center text-indigo-700">
                    <Activity size={20} />
                  </div>
                </div>

                {/* Utilization Stats Rows */}
                <div className="space-y-3 flex-1 flex flex-col justify-center">
                  {/* Average Frame Utilisation */}
                  <div className="flex justify-between items-center bg-stone-100/50 p-2.5 rounded-2xl border border-stone-200">
                    <span style={{ fontSize: '18px' }} className="text-xs font-black text-stone-850 uppercase tracking-wide truncate">Frame Utilisation</span>
                    <span style={{ fontSize: '32px' }} className="text-2xl font-black text-indigo-700 font-mono tracking-tighter shrink-0 pl-2">
                      {shiftPlatformKPIs.shiftAvgUtil > 0 ? `${shiftPlatformKPIs.shiftAvgUtil.toFixed(1)}%` : '0%'}
                    </span>
                  </div>

                  {/* Average Sider Efficiency */}
                  <div className="flex justify-between items-center bg-stone-100/50 p-2.5 rounded-2xl border border-stone-200">
                    <span style={{ fontSize: '18px' }} className="text-xs font-black text-stone-850 uppercase tracking-wide truncate">Average Efficiency</span>
                    <span style={{ fontSize: '32px' }} className="text-2xl font-black text-emerald-800 font-mono tracking-tighter shrink-0 pl-2">
                      {shiftPlatformKPIs.shiftAvgEff > 0 ? `${shiftPlatformKPIs.shiftAvgEff.toFixed(1)}%` : '0%'}
                    </span>
                  </div>
                </div>

              </div>
            </div>
          </div>
        </div>

        {/* Footer info line */}
        <div className="flex justify-between items-center text-stone-500 border-t border-stone-200 pt-3 px-2 text-[10px] font-mono font-bold uppercase tracking-widest">
          <span>SPINMONITOR SYSTEM SCREEN INGEST • TV CAPABLE</span>
          <span>LIVE CLOUD BROADCAST • SYSTEM ONLINE</span>
        </div>
      </div>
    );
  }

  /* ==========================================
     2. Standard printable/desktop dashboard view
     ========================================== */
  return (
    <div className="bg-white space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 w-full px-6 md:px-16 lg:px-24 mx-auto pb-20 max-w-7xl">
      
      {/* Target Title Announcement */}
      <div className="text-center no-print mt-4">
        <span className="inline-flex items-center gap-2 bg-yellow-105 text-yellow-850 px-4 py-1.5 rounded-full font-black uppercase tracking-widest text-xs border border-yellow-200">
          <Trophy size={14} className="text-amber-500 animate-bounce" fill="currentColor" /> Winning Shift Announcement
        </span>
      </div>

      <div className="border-4 border-stone-950 p-2 md:p-6 bg-white shadow-2xl relative">
        {/* Decorative inner margin */}
        <div className="absolute inset-0 border border-stone-200 pointer-events-none margin-2" />

        {/* Heading Header */}
        <div className="text-center py-6 border-b-4 border-stone-950 uppercase tracking-tight">
          <h1 className="text-4xl md:text-6xl font-black text-stone-900 tracking-tighter">
            Best Shift Of the Day
          </h1>
          <p className="text-xs font-black tracking-widest mt-2 text-stone-500 uppercase">
            SpinMonitor Excellence Program • {report.date}
          </p>
        </div>

        {/* Shift Badge & Production Row */}
        <div className="grid grid-cols-2 border-stone-950 border-b-4 text-center font-black text-lg md:text-3xl">
          <div className="bg-[#fdeed6] py-4 border-r-4 border-stone-950 flex flex-col md:flex-row items-center justify-center gap-2 uppercase">
            <span className="text-[12px] md:text-lg font-extrabold text-stone-500 tracking-widest">Shift :</span>
            <span className="text-stone-950 text-2xl md:text-4xl font-black">{shiftVal}</span>
          </div>
          <div className="bg-[#fdeed6] py-4 flex flex-col md:flex-row items-center justify-center gap-2 uppercase">
            <span className="text-[12px] md:text-lg font-extrabold text-stone-500 tracking-widest">Production :</span>
            <span className="text-stone-950 text-2xl md:text-4xl font-black tabular-nums">{totalProduction.toLocaleString()} kg</span>
          </div>
        </div>

        {/* Sider 3x3 Block Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 border-t border-l border-stone-950 bg-white">
          {gridItems.map((item, idx) => {
            const data = getSlotData(item.machine, item.slot);

            return (
              <div key={`best-slot-${idx}`} className="flex h-36 md:h-44 border-b border-r border-stone-950 bg-white">
                <div className="w-16 md:w-20 flex items-center justify-center font-black text-stone-950 bg-white border-r-2 border-stone-950 uppercase tracking-tighter text-xs md:text-lg shrink-0 overflow-hidden text-center p-1">
                  {data.label}
                </div>

                <div className="w-28 md:w-44 bg-yellow-300 border-r-2 border-stone-950 flex items-center justify-center shrink-0 relative overflow-hidden group">
                  {data.workerPhoto ? (
                    <img 
                      src={data.workerPhoto} 
                      alt={data.workerName || 'Worker'} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-105 duration-500"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-yellow-300 flex flex-col items-center justify-center p-2 text-center select-none font-black font-sans">
                      <div className="w-10 h-10 md:w-14 md:h-14 rounded-full border-2 border-stone-950/20 flex items-center justify-center text-stone-950/30 mb-1">
                        <Star className="text-yellow-600/60" size={18} fill="currentColor" />
                      </div>
                      <span className="text-[10px] md:text-sm text-stone-950 leading-none truncate max-w-full uppercase tracking-tighter">
                        {data.assigned ? data.workerName : 'Photo'}
                      </span>
                      {data.assigned && (
                        <span className="text-[8px] md:text-[10px] text-stone-700 font-bold block mt-0.5 tracking-tight">
                          {data.workerTNo}
                        </span>
                      )}
                    </div>
                  )}
                  {data.assigned && data.workerPhoto && (
                    <div className="absolute bottom-0 inset-x-0 bg-stone-950/70 py-1 text-center text-white text-[8px] md:text-[10px] font-black uppercase truncate max-w-full font-sans">
                      {data.workerName}
                    </div>
                  )}
                </div>

                <div className="flex flex-col flex-1 h-full min-w-[100px] border-r-0">
                  <div className="h-1/2 border-b-2 border-stone-950 flex flex-col items-center justify-center bg-white px-1">
                    {data.assigned && data.countName && (
                      <span className="text-[9px] md:text-[10px] text-purple-700 font-black uppercase tracking-widest font-sans truncate max-w-full leading-none mb-0.5">
                        {data.countName}
                      </span>
                    )}
                    <span className="text-[9px] md:text-[11px] text-stone-400 font-black uppercase tracking-widest font-sans leading-none mb-1">GPS</span>
                    <span className="font-extrabold text-stone-900 tabular-nums text-sm md:text-2xl leading-none">
                      {data.assigned && data.gpsValue > 0 ? Math.round(data.gpsValue) : '-'}
                    </span>
                  </div>
                  <div className="h-1/2 flex flex-col items-center justify-center bg-white">
                    <span className="text-[9px] md:text-[11px] text-stone-400 font-black uppercase tracking-widest font-sans">Amount</span>
                    <span className="font-extrabold text-stone-950 tabular-nums text-sm md:text-2xl text-rose-600">
                      {data.assigned && data.incentiveValue > 0 ? (
                        `₹${Math.round(data.incentiveValue).toLocaleString()}`
                      ) : (
                        <span className="text-stone-300 font-normal italic text-xs">0</span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* NEW SECTION: AI LINKCONER ON ONE SIDE & SHIFT UTILISATION REPORT */}
        <div className="grid grid-cols-1 md:grid-cols-2 border-t-4 border-stone-950 bg-white">
          
          {/* AI LINKCONER COMPONENT SIDE */}
          <div className="p-5 border-r pb-6 border-b md:border-b-0 border-stone-950 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 bg-purple-100 rounded-xl flex items-center justify-center text-purple-700">
                  <Zap size={16} fill="currentColor" />
                </div>
                <h3 className="text-base font-black uppercase tracking-tight text-stone-900">
                  AI Linkconer Allocation
                </h3>
              </div>

              {aiLinkconers.length > 0 ? (
                <div className="space-y-3">
                  {aiLinkconers.map((w, i) => (
                    <div key={`ai-list-${i}`} className="flex items-center gap-5 bg-stone-50 border border-stone-200 p-4 rounded-3xl">
                      <div className="h-22 w-22 rounded-2xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0 overflow-hidden border border-purple-200 shadow-sm">
                        {w.photoUrl ? (
                          <img src={w.photoUrl} alt={w.name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Star size={32} fill="currentColor" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-black text-stone-900 uppercase truncate mb-1">{w.name}</p>
                        <p className="text-xs font-bold uppercase tracking-widest text-stone-500">TK No: {w.tNo || "N/A"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-stone-50 border border-dashed border-stone-200 text-stone-400 p-4 rounded-xl text-center text-xs font-extrabold uppercase tracking-widest">
                  No Dedicated AI Linkconer Assigned
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-5 border-t border-stone-200 pt-4">
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-center">
                <span className="text-[9px] text-stone-400 font-black uppercase tracking-widest block mb-0.5">M/C Utilisation</span>
                <span className="text-xl font-black text-purple-700 font-mono tracking-tight block">
                  {aiMetrics.avgUtility > 0 ? `${aiMetrics.avgUtility.toFixed(1)}%` : '-'}
                </span>
              </div>
              <div className="bg-stone-50 p-3 rounded-xl border border-stone-200 text-center">
                <span className="text-[9px] text-stone-400 font-black uppercase tracking-widest block mb-0.5">Incentive Amount</span>
                <span className="text-xl font-black text-emerald-600 font-mono tracking-tight block">
                  {aiMetrics.aiIncentive > 0 ? `₹${aiMetrics.aiIncentive}` : '₹0'}
                </span>
              </div>
            </div>
          </div>

          {/* SHIFT UTILISATION SUMMARY GRAPH SIDE */}
          <div className="p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-8 w-8 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-700">
                  <Activity size={16} />
                </div>
                <h3 className="text-base font-black uppercase tracking-tight text-stone-900">
                  Shift Utilisation & KPI Stats
                </h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                
                {/* Frame utilization block */}
                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                  <span className="text-[9px] text-stone-400 font-black uppercase tracking-widest block mb-0.5">Frame Utilisation</span>
                  <span className="text-xl font-black text-indigo-700 font-mono tracking-tight block">
                    {shiftPlatformKPIs.shiftAvgUtil > 0 ? `${shiftPlatformKPIs.shiftAvgUtil.toFixed(1)}%` : '0.0%'}
                  </span>
                </div>

                {/* Avg EM efficiency */}
                <div className="bg-stone-50 border border-stone-200 p-3 rounded-xl">
                  <span className="text-[9px] text-stone-400 font-black uppercase tracking-widest block mb-0.5">Average Efficiency</span>
                  <span className="text-xl font-black text-emerald-600 font-mono tracking-tight block">
                    {shiftPlatformKPIs.shiftAvgEff > 0 ? `${shiftPlatformKPIs.shiftAvgEff.toFixed(1)}%` : '0.0%'}
                  </span>
                </div>

              </div>
            </div>

            <div className="text-[10px] text-stone-400 font-black uppercase tracking-widest leading-none mt-5 pt-3 border-t border-stone-200 text-center select-none">
              SpinMonitor Announcer Station • Live Data Stream
            </div>
          </div>

        </div>

      </div>

      {/* Buttons */}
      {!isTvMode && (
        <div className="flex justify-center items-center gap-4 py-4 no-print">
          <button 
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-stone-950 text-white px-6 py-3 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-stone-800 transition-all active:scale-95 shadow-lg"
          >
            <Printer size={15} className="text-yellow-400" /> Print Announcement
          </button>
        </div>
      )}
    </div>
  );
};

