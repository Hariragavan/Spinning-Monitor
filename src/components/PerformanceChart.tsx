import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { DailyReport } from '../types';
import { cn } from '../lib/utils';

interface PerformanceChartProps {
  report: DailyReport;
  isTvMode?: boolean;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ report, isTvMode = false }) => {
  const [ready, setReady] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    let frameId: number;
    let attempts = 0;
    const checkDimensions = () => {
      attempts++;
      if (containerRef.current && containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
        setReady(true);
      } else if (attempts < 20) {
        frameId = requestAnimationFrame(checkDimensions);
      } else {
        // Fallback after frame attempts
        setReady(true);
      }
    };
    frameId = requestAnimationFrame(checkDimensions);
    return () => cancelAnimationFrame(frameId);
  }, []);

  const chartData = report.summaries.map(s => ({
    name: s.frameNo,
    Target: s.targetProd,
    Actual: s.actualProd,
    Efficiency: s.avgUtil // Using avgUtil for efficiency trends
  }));

  return (
    <div ref={containerRef} className={cn("grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12", isTvMode && "gap-6 mb-6")}>
      <div className={cn("bg-white rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md", isTvMode ? "p-8 md:p-10" : "p-8")}>
        <h3 className={cn("font-black text-stone-900 uppercase tracking-tight mb-6", isTvMode ? "text-2xl md:text-3xl" : "text-sm")}>
          Production Analysis (Actual vs Target)
        </h3>
        <div className={cn("w-full relative min-w-0", isTvMode ? "h-[450px] lg:h-[500px]" : "h-[300px]")}>
          {ready ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" stroke="#78716c" fontSize={isTvMode ? 16 : 10} fontWeight={isTvMode ? 800 : 600} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#78716c" fontSize={isTvMode ? 16 : 10} fontWeight={isTvMode ? 800 : 600} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1c1917', border: 'none', borderRadius: '12px', color: '#fafaf9' }}
                  itemStyle={{ color: '#fafaf9' }}
                  cursor={{ fill: '#f5f5f4' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '24px', fontSize: isTvMode ? '14px' : '10px', fontWeight: '900', textTransform: 'uppercase' }} />
                <Bar dataKey="Target" fill="#e7e5e4" radius={[6, 6, 0, 0]} barSize={isTvMode ? 52 : 32} />
                <Bar dataKey="Actual" fill="#047857" radius={[6, 6, 0, 0]} barSize={isTvMode ? 52 : 32} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full bg-stone-100/60 rounded-2xl animate-pulse" />
          )}
        </div>
      </div>

      <div className={cn("bg-white rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md", isTvMode ? "p-8 md:p-10" : "p-8")}>
        <h3 className={cn("font-black text-stone-900 uppercase tracking-tight mb-6", isTvMode ? "text-2xl md:text-3xl" : "text-sm")}>
          Efficiency Trends (%)
        </h3>
        <div className={cn("w-full relative min-w-0", isTvMode ? "h-[450px] lg:h-[500px]" : "h-[300px]")}>
          {ready ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={100} minHeight={100}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" stroke="#78716c" fontSize={isTvMode ? 16 : 10} fontWeight={isTvMode ? 800 : 600} tickLine={false} axisLine={false} dy={10} />
                <YAxis stroke="#78716c" fontSize={isTvMode ? 16 : 10} fontWeight={isTvMode ? 800 : 600} tickLine={false} axisLine={false} domain={[0, 110]} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1c1917', border: 'none', borderRadius: '12px', color: '#fafaf9' }}
                  itemStyle={{ color: '#fafaf9' }}
                />
                <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '24px', fontSize: isTvMode ? '14px' : '10px', fontWeight: '900', textTransform: 'uppercase' }} />
                <Line type="monotone" dataKey="Efficiency" stroke="#047857" strokeWidth={isTvMode ? 5 : 3} dot={{ r: isTvMode ? 6 : 4, fill: '#047857', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 9, strokeWidth: 0 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="w-full h-full bg-stone-100/60 rounded-2xl animate-pulse" />
          )}
        </div>
      </div>
    </div>
  );
};
