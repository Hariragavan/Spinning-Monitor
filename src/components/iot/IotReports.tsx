'use client';

import React, { useState, useEffect } from 'react';
import {
  Machine,
  Employee,
  Shift,
  ReportFilter,
  ReportResponse
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  BarChart3, FileSpreadsheet, Printer, Download, RefreshCw, Gauge,
  Users, Clock, Wrench, ShieldCheck, Filter, AlertTriangle
} from 'lucide-react';

export const IotReports: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  const [activeReportType, setActiveReportType] = useState<ReportFilter['reportType']>('rpm_efficiency');
  const [machineId, setMachineId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [shiftId, setShiftId] = useState('');
  const [fromDate, setFromDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [reportResult, setReportResult] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const reportsList: { id: ReportFilter['reportType']; name: string; icon: string }[] = [
    { id: 'rpm_efficiency', name: '1. Spinning & Machine Efficiency', icon: '⚙' },
    { id: 'employee_productivity', name: '2. Employee Productivity & Gaps', icon: '👤' },
    { id: 'downtime_modes', name: '3. Machine Downtime & Modes', icon: '⏱' },
    { id: 'duty_coverage', name: '4. Device & Tap Duty Coverage', icon: '✦' },
    { id: 'cleaning_maintenance', name: '5. Cleaning & Maintenance Schedule', icon: '📅' }
  ];

  const loadReport = async () => {
    setLoading(true);
    try {
      const res = await iotApi.getReports({
        reportType: activeReportType,
        machineId: machineId || undefined,
        employeeId: employeeId || undefined,
        shiftId: shiftId || undefined,
        from: fromDate,
        to: toDate
      });
      setReportResult(res);
    } catch (err) {
      console.error('Failed to load report:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const [m, e, s] = await Promise.all([
        iotApi.getMachines(),
        iotApi.getEmployees(),
        iotApi.getShifts()
      ]);
      setMachines(m);
      setEmployees(e);
      setShifts(s);
    };
    init();
  }, []);

  useEffect(() => {
    loadReport();
  }, [activeReportType, machineId, employeeId, shiftId, fromDate, toDate]);

  // Export CSV
  const handleExportCsv = () => {
    if (!reportResult?.data?.length) return;
    const items = reportResult.data;
    const headers = Object.keys(items[0]);
    const csvRows = [
      headers.join(','),
      ...items.map(row => headers.map(fieldName => JSON.stringify(row[fieldName] ?? '')).join(','))
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeReportType}_${fromDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="dashboard-page w-full space-y-5 pb-10">
      {/* Top Header */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
              Analytical Auditing
            </span>
            <span className="text-stone-300">/</span>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
              Executive Telemetry Statements
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight mt-1">
            IoT Machine & Operations Reports
          </h1>
          <p className="text-xs text-stone-500">
            Exportable tabular analytics for machine efficiency, patrol gaps, downtime, sensor coverage and maintenance
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={!reportResult?.data?.length}
            className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-40"
          >
            <Download size={14} className="text-teal-400" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-all cursor-pointer"
          >
            <Printer size={14} />
            <span>Print</span>
          </button>
        </div>
      </div>

      {/* Report Type Selector Tabs */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-3xl border border-stone-200 shadow-2xs overflow-x-auto no-scrollbar">
        {reportsList.map((rep) => (
          <button
            key={rep.id}
            onClick={() => setActiveReportType(rep.id)}
            className={`px-4 py-2 rounded-2xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
              activeReportType === rep.id
                ? 'bg-stone-900 text-white shadow-xs'
                : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
            }`}
          >
            <span>{rep.icon}</span>
            <span>{rep.name}</span>
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-3xl p-4 border border-stone-200 shadow-xs grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-stone-500">Machine</label>
          <select
            value={machineId}
            onChange={(e) => setMachineId(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-bold text-stone-800 outline-none cursor-pointer"
          >
            <option value="">All Machines</option>
            {machines.map(m => (
              <option key={m.machineId} value={m.machineId}>{m.machineName} ({m.machineId})</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-stone-500">Operator</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-bold text-stone-800 outline-none cursor-pointer"
          >
            <option value="">All Employees</option>
            {employees.map(e => (
              <option key={e.employeeId} value={e.employeeId}>{e.employeeName} ({e.employeeId})</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-stone-500">Shift</label>
          <select
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-bold text-stone-800 outline-none cursor-pointer"
          >
            <option value="">All Shifts</option>
            {shifts.map(s => (
              <option key={s.shiftId} value={s.shiftId}>{s.name}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-stone-500">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-stone-800 outline-none"
          />
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-stone-500">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-stone-800 outline-none"
          />
        </div>
      </div>

      {/* Summary KPI Strip */}
      {reportResult?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(reportResult.summary).map(([key, val]) => (
            <div key={key} className="bg-white p-4 rounded-3xl border border-stone-200 shadow-xs">
              <span className="text-[9.5px] font-black uppercase tracking-wider text-stone-400 block">
                {key.replace(/([A-Z])/g, ' $1')}
              </span>
              <div className="text-2xl font-black text-stone-900 mt-1 font-mono">
                {val}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
            {reportResult?.title || 'Report Statement'}
          </h2>
          <span className="text-xs text-stone-500 font-medium">
            {reportResult?.data?.length || 0} rows found
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 space-y-3">
            <RefreshCw size={24} className="animate-spin text-stone-600" />
            <span className="text-xs text-stone-500">Generating report statement...</span>
          </div>
        ) : reportResult?.data?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-[10px] font-black uppercase text-stone-400">
                  {Object.keys(reportResult.data[0]).map(h => (
                    <th key={h} className="pb-3 px-2">
                      {h.replace(/([A-Z])/g, ' $1')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {reportResult.data.map((row, idx) => (
                  <tr key={idx} className="hover:bg-stone-50">
                    {Object.entries(row).map(([k, v], cellIdx) => (
                      <td key={cellIdx} className="py-3 px-2 font-mono text-stone-800">
                        {String(v)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-12 text-center text-stone-400 font-medium text-xs">
            No records found matching the specified filters.
          </div>
        )}
      </div>
    </div>
  );
};

