import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LineChart, Line } from 'recharts';
import { DailyReport } from '../types';
import { cn } from '../lib/utils';

interface PerformanceChartProps {
  report: DailyReport;
  isTvMode?: boolean;
}

const ChartContainer: React.FC<{
  minHeight: number;
  children: (dim: { width: number; height: number }) => React.ReactNode;
}> = ({ minHeight, children }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight || minHeight;
      if (w > 20 && h > 20) {
        setSize({ width: w, height: h });
      } else {
        setSize(null);
      }
    };

    measure();
    const ro = new ResizeObserver(() => {
      measure();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [minHeight]);

  return (
    <div ref={containerRef} className="w-full relative min-w-0 flex-1" style={{ minHeight, height: minHeight }}>
      {size ? (
        children(size)
      ) : (
        <div className="w-full h-full bg-stone-100/60 rounded-2xl animate-pulse" />
      )}
    </div>
  );
};

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ report, isTvMode = false }) => {
  const chartHeight = isTvMode ? 450 : 300;

  const chartData = (report.summaries || []).map(s => ({
    name: s.frameNo,
    Target: s.targetProd,
    Actual: s.actualProd,
    Efficiency: s.avgUtil // Using avgUtil for efficiency trends
  }));

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12 min-w-0", isTvMode && "gap-6 mb-6")}>
      <div className={cn("bg-white rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md min-w-0 flex flex-col", isTvMode ? "p-8 md:p-10" : "p-8")}>
        <h3 className={cn("font-black text-stone-900 uppercase tracking-tight mb-6", isTvMode ? "text-2xl md:text-3xl" : "text-sm")}>
          Production Analysis (Actual vs Target)
        </h3>
        <ChartContainer minHeight={chartHeight}>
          {({ width, height }) => (
            <BarChart width={width} height={height} data={chartData}>
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
          )}
        </ChartContainer>
      </div>

      <div className={cn("bg-white rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md min-w-0 flex flex-col", isTvMode ? "p-8 md:p-10" : "p-8")}>
        <h3 className={cn("font-black text-stone-900 uppercase tracking-tight mb-6", isTvMode ? "text-2xl md:text-3xl" : "text-sm")}>
          Efficiency Trends (%)
        </h3>
        <ChartContainer minHeight={chartHeight}>
          {({ width, height }) => (
            <LineChart width={width} height={height} data={chartData}>
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
          )}
        </ChartContainer>
      </div>
    </div>
  );
};
