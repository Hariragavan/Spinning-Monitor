import React from 'react';
import { TrendingUp, Zap, Activity, Gauge } from 'lucide-react';
import { DailyReport } from '../types';
import { cn } from '../lib/utils';
import { motion } from 'motion/react';

interface KPIStatsProps {
  report: DailyReport;
  isTvMode?: boolean;
  lastSyncDate?: string | null;
}

export const KPIStats: React.FC<KPIStatsProps> = ({ report, isTvMode = false, lastSyncDate }) => {
  const hasEntries = report.entries.length > 0;
  
  // Use aggregate totals for more accurate overall metrics if available
  const overallEfficiency = report.totalProductionTarget > 0 
    ? (report.totalProductionActual / report.totalProductionTarget) * 100 
    : (hasEntries ? report.entries.reduce((acc, curr) => acc + curr.efficiency, 0) / report.entries.length : 0);

  const overallUtilization = hasEntries 
    ? report.entries.reduce((acc, curr) => acc + curr.utility, 0) / report.entries.length 
    : 0;

  const avg40sGps = hasEntries 
    ? report.entries.reduce((acc, curr) => acc + (curr.gps40sCon || 0), 0) / report.entries.length 
    : 0;

  const stats = [
    { 
      label: 'Overall Efficiency', 
      value: `${Math.round(overallEfficiency)}%`, 
      icon: Zap, 
      color: 'text-amber-500',
      bgColor: 'bg-amber-50',
      borderColor: 'border-amber-100',
      gradient: 'from-amber-500/10 to-transparent'
    },
    { 
      label: 'Avg Utilization', 
      value: `${Math.round(overallUtilization)}%`, 
      icon: Activity, 
      color: 'text-violet-500',
      bgColor: 'bg-violet-50',
      borderColor: 'border-violet-100',
      gradient: 'from-violet-500/10 to-transparent'
    },
    { 
      label: 'Total Production', 
      value: `${Math.round(report.totalProductionActual).toLocaleString()} kg`, 
      icon: TrendingUp, 
      color: 'text-emerald-500',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-100',
      gradient: 'from-emerald-500/10 to-transparent'
    },
    { 
      label: '40s GPS Average', 
      value: `${Math.round(avg40sGps)}`, 
      icon: Gauge, 
      color: 'text-sky-500',
      bgColor: 'bg-sky-50',
      borderColor: 'border-sky-100',
      gradient: 'from-sky-500/10 to-transparent'
    },
  ];

  return (
    <div className={cn(
      "grid grid-cols-2 lg:grid-cols-4",
      isTvMode ? "gap-4 mb-4" : "gap-3 md:gap-4 mb-4"
    )}>
      {stats.map((stat, i) => (
        <motion.div 
          key={i}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className={cn(
            "relative overflow-hidden bg-white rounded-2xl border border-stone-200/90 shadow-2xs transition-all hover:shadow-md flex flex-col justify-between group",
            isTvMode ? "p-4.5 min-h-[115px]" : "p-3.5 md:p-4 min-h-[95px]"
          )}
        >
          {/* Background Decorative Gradient */}
          <div className={cn("absolute -right-12 -top-12 w-32 h-32 rounded-full bg-gradient-to-br blur-2xl opacity-40 group-hover:opacity-60 transition-opacity", stat.gradient)} />
          
          <div className="relative z-10 flex justify-between items-center mb-2">
            <span className={cn("font-sans text-stone-500 font-black uppercase tracking-wider", isTvMode ? "text-xs" : "text-[10px]")}>
              {stat.label}
            </span>
            <div 
              className={cn(
                "rounded-xl border shadow-2xs flex items-center justify-center shrink-0", 
                stat.bgColor, 
                stat.borderColor,
                isTvMode ? "p-2.5" : "p-2"
              )}
            >
              <stat.icon size={isTvMode ? 22 : 17} className={stat.color} />
            </div>
          </div>
          
          <div className="relative z-10 flex items-baseline justify-between mt-auto">
            <div 
              className={cn(
                "font-black text-stone-900 tracking-tight tabular-nums leading-none", 
                isTvMode ? "text-3xl md:text-4xl" : "text-2xl md:text-3xl"
              )}
            >
              {stat.value}
            </div>
            <div className="flex items-center gap-1.5">
              <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", stat.color.replace('text-', 'bg-'))} />
              <span className={cn("font-bold text-stone-400 uppercase tracking-widest", isTvMode ? "text-[11px]" : "text-[9px]")}>
                Live
              </span>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
};

