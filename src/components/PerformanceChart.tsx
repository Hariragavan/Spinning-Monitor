import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line } from 'recharts';
import { DailyReport } from '../types';
import { cn } from '../lib/utils';

interface PerformanceChartProps {
  report: DailyReport;
  isTvMode?: boolean;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ report, isTvMode = false }) => {
  const chartData = report.summaries.map(s => ({
    name: s.frameNo,
    Target: s.targetProd,
    Actual: s.actualProd,
    Efficiency: s.avgUtil // Using avgUtil for efficiency trends
  }));

  return (
    <div className={cn("grid grid-cols-1 lg:grid-cols-2 gap-12 mb-12", isTvMode && "gap-8 mb-8")}>
      <div className={cn("bg-white rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md", isTvMode ? "p-10" : "p-8")}>
        <h3 className={cn("font-black text-stone-900 uppercase tracking-tight mb-8", isTvMode ? "text-xl" : "text-sm")}>Production Analysis (Actual vs Target)</h3>
        <div className={cn(isTvMode ? "h-[400px]" : "h-[300px]")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" stroke="#a8a29e" fontSize={isTvMode ? 12 : 10} fontWeight={600} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#a8a29e" fontSize={isTvMode ? 12 : 10} fontWeight={600} tickLine={false} axisLine={false} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1c1917', border: 'none', borderRadius: '12px', color: '#fafaf9' }}
                itemStyle={{ color: '#fafaf9' }}
                cursor={{ fill: '#f5f5f4' }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '24px', fontSize: isTvMode ? '12px' : '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              <Bar dataKey="Target" fill="#e7e5e4" radius={[6, 6, 0, 0]} barSize={isTvMode ? 40 : 32} />
              <Bar dataKey="Actual" fill="#047857" radius={[6, 6, 0, 0]} barSize={isTvMode ? 40 : 32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={cn("bg-white rounded-3xl border border-stone-200 shadow-sm transition-all hover:shadow-md", isTvMode ? "p-10" : "p-8")}>
        <h3 className={cn("font-black text-stone-900 uppercase tracking-tight mb-8", isTvMode ? "text-xl" : "text-sm")}>Efficiency Trends (%)</h3>
        <div className={cn(isTvMode ? "h-[400px]" : "h-[300px]")}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" stroke="#a8a29e" fontSize={isTvMode ? 12 : 10} fontWeight={600} tickLine={false} axisLine={false} dy={10} />
              <YAxis stroke="#a8a29e" fontSize={isTvMode ? 12 : 10} fontWeight={600} tickLine={false} axisLine={false} domain={[0, 110]} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1c1917', border: 'none', borderRadius: '12px', color: '#fafaf9' }}
                itemStyle={{ color: '#fafaf9' }}
              />
              <Legend verticalAlign="top" align="right" iconType="circle" wrapperStyle={{ paddingBottom: '24px', fontSize: isTvMode ? '12px' : '10px', fontWeight: 'bold', textTransform: 'uppercase' }} />
              <Line type="monotone" dataKey="Efficiency" stroke="#047857" strokeWidth={isTvMode ? 4 : 3} dot={{ r: isTvMode ? 4.5 : 4, fill: '#047857', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 8, strokeWidth: 0 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
