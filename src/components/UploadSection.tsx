import React, { useState } from 'react';
import { 
  Upload, FileCheck, AlertCircle, Loader2, Users, Gauge, 
  Contact, FileUp, Coins, Download, Info, X, Calendar, 
  CheckCircle2, ChevronRight, Hash 
} from 'lucide-react';
import { motion } from 'motion/react';
import * as XLSX from 'xlsx';
import { parseExcelReport, parseWorkerMaster } from '../lib/parser';
import { parseMachineEmWorkbook } from '../lib/googleSheets';
import { DailyReport, Sider, CountConversion, ProductionEntry, FrameDailySummary, MachineEmData, Shed } from '../types';
import { cn, parseUniversalDateParts } from '../lib/utils';
import { CalendarDatePicker } from './CalendarPickers';

interface UploadSectionProps {
  onUploadSuccess: (report: DailyReport | DailyReport[]) => void;
  onWorkersUpdate?: (workers: Sider[]) => void;
  onMachineEmUpdate?: (data: MachineEmData) => Promise<void>;
  countConversions?: CountConversion[];
  initialShed?: Shed;
}

interface ExtractedPreview {
  category: 'daily_report' | 'incentive_report' | 'machine_em' | 'worker_master';
  categoryTitle: string;
  fileName: string;
  shed: Shed;
  date: string;
  dailyReport?: DailyReport;
  monthlyReports?: DailyReport[];
  incentiveEntries?: ProductionEntry[];
  emData?: MachineEmData;
  workers?: Sider[];
}

export const UploadSection: React.FC<UploadSectionProps> = ({
  onUploadSuccess,
  onWorkersUpdate,
  onMachineEmUpdate,
  countConversions = [],
  initialShed = 'Shed 1'
}) => {
  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [targetShed, setTargetShed] = useState<Shed>(initialShed);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [pendingReports, setPendingReports] = useState<Record<string, DailyReport>>({});
  const [showSuccess, setShowSuccess] = useState(false);
  const [previewModal, setPreviewModal] = useState<ExtractedPreview | null>(null);

  const downloadTemplate = (type: 'daily_report' | 'incentive' | 'worker' | 'em') => {
    let data: any[] = [];
    let filename = '';

    if (type === 'daily_report') {
      data = [
        ['KTTM SPINNING MILLS - PRODUCTION STATEMENT', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Date:', new Date().toLocaleDateString('en-GB'), '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['Rf no', 'Count', 'STD GPS', 'Target Prod', 'Shift I', 'Shift II', 'Shift III', 'Total Ach', 'GPS I', 'GPS II', 'GPS III', 'Total GPS', 'U% I', 'U% II', 'U% III', 'Total U%'],
        ['K01', '40s KWH', 108.5, 420.0, 138.0, 136.5, 142.0, 416.5, 107.2, 106.8, 109.1, 107.7, 98.2, 97.5, 98.9, 98.2],
        ['K02', '40s KWH', 108.5, 420.0, 135.0, 137.0, 140.0, 412.0, 106.5, 107.0, 108.5, 107.3, 97.5, 98.0, 98.5, 98.0],
        ['K03', '34s CH',  112.0, 450.0, 148.0, 149.0, 151.0, 448.0, 111.0, 111.5, 113.0, 111.8, 98.0, 98.2, 99.0, 98.4],
        ['K04', '34s CH',  112.0, 450.0, 147.0, 148.5, 150.0, 445.5, 110.8, 111.2, 112.5, 111.5, 97.8, 98.1, 98.8, 98.2],
        ['K05', '30s CW',  118.0, 480.0, 158.0, 159.0, 161.0, 478.0, 117.2, 117.5, 118.8, 117.8, 98.5, 98.6, 99.1, 98.7],
        ['K06', '30s CW',  118.0, 480.0, 156.0, 157.5, 160.0, 473.5, 116.5, 117.0, 118.2, 117.2, 98.1, 98.3, 98.8, 98.4],
        ['Total', '', '', 2700.0, 882.0, 887.5, 904.0, 2673.5, '', '', '', 111.5, '', '', '', 98.3],
        ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ['RUNNING COUNT GPSS', '', '', '', '', '', '', '', '', '', '', '', '', '40s GPSS', '', ''],
        ['40s KWH', '', '', '', '', '', '', '', '', '', '', '', '', 107.7, '', ''],
        ['34s CH',  '', '', '', '', '', '', '', '', '', '', '', '', 111.8, '', ''],
        ['30s CW',  '', '', '', '', '', '', '', '', '', '', '', '', 117.8, '', ''],
      ];
      filename = 'Production_Statement_Template.xlsx';
    } else if (type === 'incentive') {
      data = [
        ['Daily Incentive Amount', '', '', '', '', ''],
        ['Date:', new Date().toLocaleDateString('en-GB'), '', '', '', ''],
        ['', '', '', '', '', ''],
        ['T.No', 'Name', 'MC No', 'Shift', 'GPSS', 'Incentive Amount'],
        ['15734', 'PANKAJINI', 'K01', '1', '430', '110'],
        ['22692', 'SWEETI', 'K01', '2', '410', '100'],
        ['23847', 'BASUMATHI', 'K02', '1', '425', '105'],
        ['21903', 'MANJU', 'K02', '2', '415', '100'],
      ];
      filename = 'Incentive_Template.xlsx';
    } else if (type === 'em') {
      data = [
        ['Date:', new Date().toLocaleDateString('en-GB'), '', ''],
        ['Shift:', '1', '2', '3'],
        ['Machine', '', '', ''],
        ['K01', '52.3', '49.8', '51.2'],
        ['K02', '48.5', '47.0', '49.1'],
        ['K03', '50.1', '51.0', '50.4'],
        ['K04', '49.8', '48.9', '51.5'],
        ['K05', '51.2', '50.5', '49.8'],
        ['K06', '50.6', '49.4', '50.9'],
      ];
      filename = 'Machine_EM_Template.xlsx';
    } else {
      data = [
        ['Name', 'TicketNo'],
        ['PANKAJINI', '15734'],
        ['SWEETI', '22692'],
        ['BASUMATHI', '23847'],
        ['MANJU', '21903'],
      ];
      filename = 'Worker_Master_Template.xlsx';
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, filename);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, category: string) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so user can select the same file again if desired
    event.target.value = '';

    setIsUploading(category);
    setError(null);
    setShowSuccess(false);

    try {
      if (category === 'worker_master') {
        const newWorkers = await parseWorkerMaster(file);
        if (!newWorkers || newWorkers.length === 0) {
          throw new Error("No worker records found in the uploaded file.");
        }
        
        const [year, month, day] = selectedDate.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        setPreviewModal({
          category: 'worker_master',
          categoryTitle: 'Worker Master Update',
          fileName: file.name,
          shed: targetShed,
          date: formattedDate,
          workers: newWorkers
        });
      } else if (category === 'machine_em') {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const emData = parseMachineEmWorkbook(workbook);
        
        if (Object.keys(emData).length === 0) {
          throw new Error("No valid Machine EM data found. Please ensure the Excel format matches the template.");
        }
        
        const detectedDate = Object.keys(emData)[0] || `${selectedDate.split('-')[2]}/${selectedDate.split('-')[1]}/${selectedDate.split('-')[0]}`;

        setPreviewModal({
          category: 'machine_em',
          categoryTitle: 'Machine EM Update',
          fileName: file.name,
          shed: targetShed,
          date: detectedDate,
          emData: emData
        });
      } else {
        const reportData = await parseExcelReport(file, countConversions, targetShed);
        
        if (Array.isArray(reportData)) {
          // Monthly dataset
          const firstDate = reportData[0]?.date || `${selectedDate.split('-')[2]}/${selectedDate.split('-')[1]}/${selectedDate.split('-')[0]}`;
          setPreviewModal({
            category: category as any,
            categoryTitle: category === 'daily_report' ? 'Production Statement' : 'Incentive Amount Sheet',
            fileName: file.name,
            shed: targetShed,
            date: firstDate,
            monthlyReports: reportData.map(r => ({ ...r, shed: targetShed }))
          });
          return;
        }

        const report = reportData as DailyReport;
        let finalDate = selectedDate;
        if (report.date) {
          const parts = parseUniversalDateParts(report.date);
          if (parts) {
            const mStr = parts.month.toString().padStart(2, '0');
            const dStr = parts.day.toString().padStart(2, '0');
            const isoDate = `${parts.year}-${mStr}-${dStr}`;
            setSelectedDate(isoDate);
            finalDate = isoDate;
          }
        }

        const [year, month, day] = finalDate.split('-');
        const formattedDate = `${day}/${month}/${year}`;

        if (category === 'incentive_report') {
          const validEntries = report.entries.filter(e => 
            (e.incentiveAmount !== undefined && e.incentiveAmount > 0) || 
            (e.siderName && e.siderName.trim() !== '') ||
            (e.siderId && e.siderId.trim() !== '')
          );
          
          setPreviewModal({
            category: 'incentive_report',
            categoryTitle: 'Incentive Amount Sheet',
            fileName: file.name,
            shed: targetShed,
            date: formattedDate,
            dailyReport: {
              ...report,
              shed: targetShed,
              date: formattedDate
            },
            incentiveEntries: validEntries.length > 0 ? validEntries : report.entries
          });
        } else {
          setPreviewModal({
            category: 'daily_report',
            categoryTitle: 'Production Statement',
            fileName: file.name,
            shed: targetShed,
            date: formattedDate,
            dailyReport: {
              ...report,
              shed: targetShed,
              date: formattedDate
            }
          });
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to parse ${category} file. Please check the spreadsheet headers.`);
    } finally {
      setIsUploading(null);
    }
  };

  const handleConfirmPreview = async () => {
    if (!previewModal) return;
    const { category, shed, date, workers, emData, dailyReport, monthlyReports } = previewModal;

    try {
      if (category === 'worker_master' && workers) {
        if (onWorkersUpdate) onWorkersUpdate(workers);
      } else if (category === 'machine_em' && emData) {
        if (onMachineEmUpdate) await onMachineEmUpdate(emData);
      } else if (monthlyReports && monthlyReports.length > 0) {
        const withShed = monthlyReports.map(r => ({ ...r, shed }));
        onUploadSuccess(withShed);
      } else if (dailyReport) {
        const finalReport: DailyReport = {
          ...dailyReport,
          shed,
          date,
          entries: dailyReport.entries.map(e => ({ ...e, shed })),
          summaries: dailyReport.summaries.map(s => ({ ...s, shed })),
        };
        setPendingReports(prev => ({
          ...prev,
          [category]: finalReport
        }));
        onUploadSuccess(finalReport);
      }
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
      setPreviewModal(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to commit extracted data.');
    }
  };

  const handleSaveAll = () => {
    const reports = Object.values(pendingReports) as DailyReport[];
    if (reports.length === 0) return;

    const mergedEntries = new Map<string, ProductionEntry>();
    const mergedSummaries = new Map<string, FrameDailySummary>();
    let totalTarget = 0;
    let totalActual = 0;

    const dailyReport = pendingReports['daily_report'];
    const breakageReport = pendingReports['breakage_report'];
    const incentiveReport = pendingReports['incentive_report'];

    if (dailyReport && dailyReport.entries) {
      totalTarget = dailyReport.totalProductionTarget;
      totalActual = dailyReport.totalProductionActual;
      
      dailyReport.entries.forEach(entry => {
        if (!entry.frameNo || !entry.shift) return;
        const key = `${entry.frameNo}-${entry.shift}`;
        mergedEntries.set(key, { ...entry });
      });

      if (dailyReport.summaries) {
        dailyReport.summaries.forEach(summary => {
          if (!summary.frameNo) return;
          mergedSummaries.set(summary.frameNo, { ...summary });
        });
      }
    }

    if (breakageReport && !Array.isArray(breakageReport)) {
      if (!dailyReport) {
        totalActual = breakageReport.totalProductionActual;
      }

      breakageReport.entries.forEach(entry => {
        const key = `${entry.frameNo}-${entry.shift}`;
        const existing = mergedEntries.get(key);
        if (existing) {
          mergedEntries.set(key, {
            ...existing,
            naturalEmt: entry.naturalEmt,
            doffEmt: entry.doffEmt,
            idlePercent: entry.idlePercent,
            worstPercent: entry.worstPercent,
            slipPercent: entry.slipPercent,
            ukg: entry.ukg,
            restartBreaks: entry.restartBreaks,
          });
        } else {
          mergedEntries.set(key, { ...entry });
        }
      });

      breakageReport.summaries.forEach(summary => {
        const existing = mergedSummaries.get(summary.frameNo);
        if (existing) {
          mergedSummaries.set(summary.frameNo, {
            ...existing,
            shiftNaturalEmt: summary.shiftNaturalEmt,
            shiftRestartBreaks: summary.shiftRestartBreaks,
            shiftDoffEmt: summary.shiftDoffEmt,
            shiftIdle: summary.shiftIdle,
            shiftWorst: summary.shiftWorst,
            shiftSlip: summary.shiftSlip,
            shiftUkg: summary.shiftUkg,
            shiftNoOfDoff: summary.shiftNoOfDoff,
            shiftAvgDoffTime: summary.shiftAvgDoffTime,
            shiftNoOfStop: summary.shiftNoOfStop,
            shiftNormalStopMin: summary.shiftNormalStopMin,
            shiftProductionKg: summary.shiftProductionKg,
            shiftUtilizationPinter: summary.shiftUtilizationPinter,
          });
        } else {
          mergedSummaries.set(summary.frameNo, { ...summary });
        }
      });
    }

    if (incentiveReport && !Array.isArray(incentiveReport)) {
      incentiveReport.entries.forEach(entry => {
        const key = `${entry.frameNo}-${entry.shift}`;
        const existing = mergedEntries.get(key);
        if (existing) {
          mergedEntries.set(key, {
            ...existing,
            incentiveAmount: entry.incentiveAmount,
            siderName: entry.siderName || existing.siderName,
            siderId: entry.siderId || existing.siderId,
            gpsActual: entry.gpsActual || existing.gpsActual,
            count: entry.count || existing.count
          });
        } else {
          mergedEntries.set(key, { ...entry });
        }
      });
    }

    const finalReport: DailyReport = {
      date: reports[0].date,
      shed: targetShed,
      entries: Array.from(mergedEntries.values()).map(e => ({ ...e, shed: targetShed })),
      summaries: Array.from(mergedSummaries.values()).map(s => ({ ...s, shed: targetShed })),
      totalProductionTarget: totalTarget,
      totalProductionActual: totalActual
    };

    onUploadSuccess(finalReport);
    setPendingReports({});
    setShowSuccess(true);
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const uploadCategories = [
    { id: 'daily_report', title: 'Production Statement', icon: FileUp, color: 'text-emerald-500' },
    { id: 'incentive_report', title: 'Incentive Amount Sheet', icon: Coins, color: 'text-amber-500' },
    { id: 'machine_em', title: 'Machine EM Update', icon: Gauge, color: 'text-blue-500' },
    { id: 'worker_master', title: 'Worker Master Update', icon: Contact, color: 'text-rose-500' },
  ];

  const renderModalKpis = (modal: ExtractedPreview) => {
    if (modal.category === 'daily_report' && modal.dailyReport) {
      const rep = modal.dailyReport;
      const eff = rep.totalProductionTarget > 0 ? (rep.totalProductionActual / rep.totalProductionTarget) * 100 : 0;
      const avgGps = rep.summaries.length > 0 
        ? rep.summaries.reduce((a, b) => a + (b.avgGps || 0), 0) / rep.summaries.length 
        : 0;

      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Target Production</span>
            <span className="text-sm font-black text-stone-800 font-mono">{rep.totalProductionTarget.toFixed(1)} Kg</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Actual Production</span>
            <span className="text-sm font-black text-emerald-600 font-mono">{rep.totalProductionActual.toFixed(1)} Kg</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Plant Efficiency</span>
            <span className="text-sm font-black text-stone-900 font-mono">{eff.toFixed(1)}%</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Avg GPSS / Frames</span>
            <span className="text-sm font-black text-stone-900 font-mono">{avgGps.toFixed(1)} <span className="text-[10px] text-stone-400 font-sans">({rep.summaries.length} M/C)</span></span>
          </div>
        </div>
      );
    }

    if (modal.category === 'incentive_report') {
      const entries = modal.incentiveEntries || [];
      const totalAmount = entries.reduce((sum, e) => sum + (e.incentiveAmount || 0), 0);
      const uniqueSiders = new Set(entries.map(e => e.siderName || e.siderId).filter(Boolean)).size;
      const maxPayout = entries.length > 0 ? Math.max(...entries.map(e => e.incentiveAmount || 0)) : 0;

      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Total Incentive</span>
            <span className="text-sm font-black text-amber-600 font-mono">₹{totalAmount.toLocaleString()}</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Total Allocations</span>
            <span className="text-sm font-black text-stone-800 font-mono">{entries.length} Rows</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Siders Identified</span>
            <span className="text-sm font-black text-stone-800 font-mono">{uniqueSiders} Operators</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Top Incentive</span>
            <span className="text-sm font-black text-stone-800 font-mono">₹{maxPayout}</span>
          </div>
        </div>
      );
    }

    if (modal.category === 'machine_em' && modal.emData) {
      const dates = Object.keys(modal.emData);
      const machineSet = new Set<string>();
      let totalPoints = 0;
      let sumEm = 0;

      Object.values(modal.emData).forEach(mMap => {
        Object.entries(mMap).forEach(([mName, shifts]) => {
          machineSet.add(mName);
          Object.values(shifts).forEach(val => {
            if (typeof val === 'number') {
              totalPoints++;
              sumEm += val;
            }
          });
        });
      });

      const avgEm = totalPoints > 0 ? sumEm / totalPoints : 0;

      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Machines Logged</span>
            <span className="text-sm font-black text-blue-600 font-mono">{machineSet.size} Machines</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Total Shift Points</span>
            <span className="text-sm font-black text-stone-800 font-mono">{totalPoints} Values</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Average EM%</span>
            <span className="text-sm font-black text-stone-800 font-mono">{avgEm.toFixed(1)}%</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Dates In File</span>
            <span className="text-sm font-black text-stone-800 font-mono">{dates.length} Days</span>
          </div>
        </div>
      );
    }

    if (modal.category === 'worker_master' && modal.workers) {
      const workers = modal.workers;
      const withTNo = workers.filter(w => w.tNo && !w.tNo.startsWith('T-100')).length;

      return (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Total Workers</span>
            <span className="text-sm font-black text-rose-600 font-mono">{workers.length} Operators</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Verified Ticket Nos</span>
            <span className="text-sm font-black text-stone-800 font-mono">{withTNo} Siders</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Target Registry</span>
            <span className="text-sm font-black text-stone-800 font-mono">Master Database</span>
          </div>
          <div className="bg-white p-2.5 rounded-xl border border-stone-200">
            <span className="text-[10px] font-black uppercase tracking-wider text-stone-400 block">Assigned Shed</span>
            <span className="text-sm font-black text-emerald-600 font-mono">{modal.shed}</span>
          </div>
        </div>
      );
    }

    return null;
  };

  const renderModalTable = (modal: ExtractedPreview) => {
    // 1. Monthly reports dataset
    if (modal.monthlyReports && modal.monthlyReports.length > 0) {
      return (
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-stone-100/90 text-stone-600 font-black text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-stone-200">
              <th className="py-2.5 px-3">#</th>
              <th className="py-2.5 px-3">Date</th>
              <th className="py-2.5 px-3">Shed</th>
              <th className="py-2.5 px-3 text-right">Target Prod (Kg)</th>
              <th className="py-2.5 px-3 text-right text-emerald-800">Actual Prod (Kg)</th>
              <th className="py-2.5 px-3 text-right">Efficiency %</th>
              <th className="py-2.5 px-3 text-right">Frames</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {modal.monthlyReports.map((r, i) => {
              const eff = r.totalProductionTarget > 0 ? (r.totalProductionActual / r.totalProductionTarget) * 100 : 0;
              return (
                <tr key={i} className="hover:bg-emerald-50/40 transition-colors">
                  <td className="py-2 px-3 text-stone-400 font-mono">{i + 1}</td>
                  <td className="py-2 px-3 font-bold text-stone-900">{r.date}</td>
                  <td className="py-2 px-3 font-bold text-emerald-700">{r.shed || modal.shed}</td>
                  <td className="py-2 px-3 text-right font-mono text-stone-700">{r.totalProductionTarget.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-mono font-black text-emerald-700">{r.totalProductionActual.toFixed(1)}</td>
                  <td className="py-2 px-3 text-right font-mono font-bold text-stone-800">{eff.toFixed(1)}%</td>
                  <td className="py-2 px-3 text-right font-mono text-stone-600">{r.summaries.length}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="sticky bottom-0 bg-stone-900 text-white font-black text-xs z-10">
            <tr>
              <td className="py-2.5 px-3 uppercase tracking-wider" colSpan={3}>
                Total ({modal.monthlyReports.length} Days)
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                {modal.monthlyReports.reduce((s, r) => s + r.totalProductionTarget, 0).toFixed(1)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-emerald-300">
                {modal.monthlyReports.reduce((s, r) => s + r.totalProductionActual, 0).toFixed(1)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-white" colSpan={2}>—</td>
            </tr>
          </tfoot>
        </table>
      );
    }

    // 2. Production Statement Daily Report
    if (modal.category === 'daily_report' && modal.dailyReport) {
      return (
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-stone-100/90 text-stone-600 font-black text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-stone-200">
              <th className="py-2.5 px-3">Frame</th>
              <th className="py-2.5 px-3">Count</th>
              <th className="py-2.5 px-3 text-right">STD GPS</th>
              <th className="py-2.5 px-3 text-right">Target (Kg)</th>
              <th className="py-2.5 px-3 text-right">Shift I</th>
              <th className="py-2.5 px-3 text-right">Shift II</th>
              <th className="py-2.5 px-3 text-right">Shift III</th>
              <th className="py-2.5 px-3 text-right font-black text-emerald-800">Total Ach</th>
              <th className="py-2.5 px-3 text-right">GPS I</th>
              <th className="py-2.5 px-3 text-right">GPS II</th>
              <th className="py-2.5 px-3 text-right">GPS III</th>
              <th className="py-2.5 px-3 text-right font-bold text-stone-900">Avg GPS</th>
              <th className="py-2.5 px-3 text-right">U% I</th>
              <th className="py-2.5 px-3 text-right">U% II</th>
              <th className="py-2.5 px-3 text-right">U% III</th>
              <th className="py-2.5 px-3 text-right font-bold text-stone-900">Avg U%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {modal.dailyReport.summaries.map((s, idx) => (
              <tr key={s.frameNo || idx} className="hover:bg-emerald-50/40 transition-colors font-medium">
                <td className="py-2 px-3 font-black text-stone-900">{s.frameNo}</td>
                <td className="py-2 px-3 text-stone-700">{s.count || '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.stdGps?.toFixed(1) || '0.0'}</td>
                <td className="py-2 px-3 text-right font-mono font-bold text-stone-700">{s.targetProd?.toFixed(1) || '0.0'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftProductionKg?.I?.toFixed(1) || '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftProductionKg?.II?.toFixed(1) || '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftProductionKg?.III?.toFixed(1) || '—'}</td>
                <td className="py-2 px-3 text-right font-mono font-black text-emerald-700">{s.actualProd?.toFixed(1) || '0.0'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftGps?.I?.toFixed(1) || '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftGps?.II?.toFixed(1) || '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftGps?.III?.toFixed(1) || '—'}</td>
                <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">{s.avgGps?.toFixed(1) || '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftUtil?.I ? `${s.shiftUtil.I.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftUtil?.II ? `${s.shiftUtil.II.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-3 text-right font-mono text-stone-600">{s.shiftUtil?.III ? `${s.shiftUtil.III.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-3 text-right font-mono font-bold text-stone-900">{s.avgUtil ? `${s.avgUtil.toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-stone-900 text-white font-black text-xs z-10">
            <tr>
              <td className="py-2.5 px-3 uppercase tracking-wider" colSpan={3}>Grand Total</td>
              <td className="py-2.5 px-3 text-right font-mono text-amber-300">
                {modal.dailyReport.totalProductionTarget.toFixed(1)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-stone-400" colSpan={3}>—</td>
              <td className="py-2.5 px-3 text-right font-mono text-emerald-300">
                {modal.dailyReport.totalProductionActual.toFixed(1)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-stone-400" colSpan={3}>—</td>
              <td className="py-2.5 px-3 text-right font-mono text-white">
                {(modal.dailyReport.summaries.reduce((a, b) => a + (b.avgGps || 0), 0) / (modal.dailyReport.summaries.length || 1)).toFixed(1)}
              </td>
              <td className="py-2.5 px-3 text-right font-mono text-stone-400" colSpan={3}>—</td>
              <td className="py-2.5 px-3 text-right font-mono text-white">
                {(modal.dailyReport.summaries.reduce((a, b) => a + (b.avgUtil || 0), 0) / (modal.dailyReport.summaries.length || 1)).toFixed(1)}%
              </td>
            </tr>
          </tfoot>
        </table>
      );
    }

    // 3. Incentive Sheet Entries
    if (modal.category === 'incentive_report') {
      const entries = modal.incentiveEntries || [];
      return (
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-stone-100/90 text-stone-600 font-black text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-stone-200">
              <th className="py-2.5 px-4">#</th>
              <th className="py-2.5 px-4">T.No</th>
              <th className="py-2.5 px-4">Worker / Sider Name</th>
              <th className="py-2.5 px-4">Machine</th>
              <th className="py-2.5 px-4">Shift</th>
              <th className="py-2.5 px-4">Count</th>
              <th className="py-2.5 px-4 text-right">GPSS</th>
              <th className="py-2.5 px-4 text-right font-black text-amber-700">Incentive Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {entries.map((e, idx) => (
              <tr key={idx} className="hover:bg-amber-50/40 transition-colors font-medium">
                <td className="py-2 px-4 text-stone-400 font-mono">{idx + 1}</td>
                <td className="py-2 px-4 font-mono font-bold text-stone-900">{e.siderId || '—'}</td>
                <td className="py-2 px-4 font-black text-stone-800">{e.siderName || 'Unassigned'}</td>
                <td className="py-2 px-4 font-bold text-stone-700">{e.frameNo || '—'}</td>
                <td className="py-2 px-4">
                  <span className="px-2 py-0.5 rounded-md bg-stone-100 font-bold text-stone-700 text-[11px]">
                    Shift {e.shift}
                  </span>
                </td>
                <td className="py-2 px-4 text-stone-600">{e.count || '—'}</td>
                <td className="py-2 px-4 text-right font-mono text-stone-700">{e.gpsActual ? e.gpsActual.toFixed(1) : '—'}</td>
                <td className="py-2 px-4 text-right font-mono font-black text-amber-600">
                  ₹{(e.incentiveAmount || 0).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-stone-900 text-white font-black text-xs z-10">
            <tr>
              <td className="py-2.5 px-4 uppercase tracking-wider" colSpan={7}>
                Total Incentive ({entries.length} Records)
              </td>
              <td className="py-2.5 px-4 text-right font-mono text-amber-300 text-sm">
                ₹{entries.reduce((sum, e) => sum + (e.incentiveAmount || 0), 0).toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      );
    }

    // 4. Machine EM Update
    if (modal.category === 'machine_em' && modal.emData) {
      const emRows: { date: string; machine: string; s1: number | null; s2: number | null; s3: number | null; avg: number | null }[] = [];
      Object.entries(modal.emData).forEach(([dStr, machines]) => {
        Object.entries(machines).forEach(([mName, shifts]) => {
          const s1 = shifts['1'] !== undefined ? shifts['1'] : null;
          const s2 = shifts['2'] !== undefined ? shifts['2'] : null;
          const s3 = shifts['3'] !== undefined ? shifts['3'] : null;
          const vals = [s1, s2, s3].filter((v): v is number => v !== null);
          const avg = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
          emRows.push({ date: dStr, machine: mName, s1, s2, s3, avg });
        });
      });

      return (
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-stone-100/90 text-stone-600 font-black text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-stone-200">
              <th className="py-2.5 px-4">#</th>
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-4">Machine</th>
              <th className="py-2.5 px-4 text-right">Shift 1 EM%</th>
              <th className="py-2.5 px-4 text-right">Shift 2 EM%</th>
              <th className="py-2.5 px-4 text-right">Shift 3 EM%</th>
              <th className="py-2.5 px-4 text-right font-black text-blue-700">Machine Avg EM%</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {emRows.map((r, idx) => (
              <tr key={idx} className="hover:bg-blue-50/40 transition-colors font-medium">
                <td className="py-2 px-4 text-stone-400 font-mono">{idx + 1}</td>
                <td className="py-2 px-4 font-bold text-stone-800">{r.date}</td>
                <td className="py-2 px-4 font-black text-stone-900">{r.machine}</td>
                <td className="py-2 px-4 text-right font-mono text-stone-700">{r.s1 !== null ? `${r.s1.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-4 text-right font-mono text-stone-700">{r.s2 !== null ? `${r.s2.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-4 text-right font-mono text-stone-700">{r.s3 !== null ? `${r.s3.toFixed(1)}%` : '—'}</td>
                <td className="py-2 px-4 text-right font-mono font-black text-blue-600">
                  {r.avg !== null ? `${r.avg.toFixed(1)}%` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-stone-900 text-white font-black text-xs z-10">
            <tr>
              <td className="py-2.5 px-4 uppercase tracking-wider" colSpan={6}>
                Total Rows ({emRows.length} M/C records)
              </td>
              <td className="py-2.5 px-4 text-right font-mono text-blue-300">
                {emRows.length > 0 ? (emRows.reduce((sum, r) => sum + (r.avg || 0), 0) / emRows.length).toFixed(1) + '%' : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      );
    }

    // 5. Worker Master Update
    if (modal.category === 'worker_master' && modal.workers) {
      return (
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-stone-100/90 text-stone-600 font-black text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-stone-200">
              <th className="py-2.5 px-4">#</th>
              <th className="py-2.5 px-4">Photo</th>
              <th className="py-2.5 px-4">Ticket No (T.No)</th>
              <th className="py-2.5 px-4">Worker / Operator Name</th>
              <th className="py-2.5 px-4">System ID</th>
              <th className="py-2.5 px-4 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {modal.workers.map((w, idx) => (
              <tr key={w.id || idx} className="hover:bg-rose-50/40 transition-colors font-medium">
                <td className="py-2 px-4 text-stone-400 font-mono">{idx + 1}</td>
                <td className="py-2 px-4">
                  <div className="w-7 h-7 rounded-full bg-stone-100 border border-stone-200 overflow-hidden flex items-center justify-center">
                    {w.photoUrl ? (
                      <img src={w.photoUrl} alt={w.name} className="w-full h-full object-cover" />
                    ) : (
                      <Users size={12} className="text-stone-400" />
                    )}
                  </div>
                </td>
                <td className="py-2 px-4 font-mono font-black text-stone-900">{w.tNo || '—'}</td>
                <td className="py-2 px-4 font-bold text-stone-800">{w.name}</td>
                <td className="py-2 px-4 font-mono text-stone-500 text-[11px]">{w.id}</td>
                <td className="py-2 px-4 text-right">
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">
                    Active
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="sticky bottom-0 bg-stone-900 text-white font-black text-xs z-10">
            <tr>
              <td className="py-2.5 px-4 uppercase tracking-wider" colSpan={5}>
                Total Workers ({modal.workers.length} Operators)
              </td>
              <td className="py-2.5 px-4 text-right font-mono text-emerald-300">
                Ready
              </td>
            </tr>
          </tfoot>
        </table>
      );
    }

    return null;
  };

  return (
    <div className="max-w-4xl mx-auto mt-4 space-y-4">
      {/* Header & Date Picker & Shed Selector */}
      <div className="bg-white p-5 rounded-2xl border border-stone-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-stone-900 uppercase tracking-tight">Data Ingestion Center</h2>
          <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mt-0.5">Unified Production Telemetry Log</p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Target Shed Selector */}
          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-stone-500 mb-1">Upload To Shed</label>
            <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-xl border border-stone-200">
              {(['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'] as const).map(s => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTargetShed(s)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                    targetShed === s
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/50 font-bold"
                  )}
                >
                  <span className={cn("w-1.5 h-1.5 rounded-full", targetShed === s ? "bg-white" : "bg-stone-400")} />
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1">Sider Assigned Date</label>
            <CalendarDatePicker
              value={selectedDate}
              onChange={(_, iso) => setSelectedDate(iso || selectedDate)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {uploadCategories.map((cat) => (
          <div key={cat.id} className={cn(
            "bg-white p-5 rounded-2xl border shadow-xs transition-all group relative overflow-hidden",
            pendingReports[cat.id] ? "border-emerald-500 bg-emerald-50/10" : "border-stone-200"
          )}>
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform opacity-80",
              pendingReports[cat.id] ? "bg-emerald-100 text-emerald-600" : "bg-stone-50 " + cat.color
            )}>
              {pendingReports[cat.id] ? <FileCheck size={20} /> : <cat.icon size={20} />}
            </div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-black text-stone-900 uppercase tracking-tight">
                {cat.title}
                {pendingReports[cat.id] && <span className="ml-2 text-[9px] bg-emerald-500 text-white px-2 py-0.5 rounded-full align-middle">READY</span>}
              </h3>
              <button 
                onClick={() => downloadTemplate(
                  cat.id === 'daily_report' ? 'daily_report' :
                  cat.id === 'worker_master' ? 'worker' : 
                  cat.id === 'machine_em' ? 'em' : 'incentive'
                )}
                className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-emerald-600 hover:text-emerald-700 transition-colors cursor-pointer"
                title={`Download sample template for ${cat.title}`}
              >
                <Download size={12} />
                Template
              </button>
            </div>
            <p className="text-xs text-stone-500 font-medium leading-normal mb-4">
              {cat.id === 'daily_report' 
                ? 'Upload the KTTM Daily Production Statement for GPS and Efficiency totals.' 
                : cat.id === 'incentive_report'
                ? 'Upload Daily Incentive Amount sheet for manual sider payouts and assignments.'
                : cat.id === 'machine_em'
                ? 'Upload Machine EM spreadsheet to update efficiency values in the cloud.'
                : 'Upload employee registry to sync names and ticket numbers.'}
            </p>
            
            <div className="relative">
              <input 
                type="file" 
                className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                accept=".xlsx, .xls, .csv" 
                onChange={(e) => handleFileUpload(e, cat.id)}
                disabled={!!isUploading}
              />
              <button className={cn(
                "w-full py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer",
                isUploading === cat.id ? "bg-stone-100 text-stone-400" : 
                pendingReports[cat.id] ? "bg-emerald-600 text-white shadow-sm" :
                "bg-stone-900 text-stone-50 hover:bg-stone-800 shadow-xs"
              )}>
                {isUploading === cat.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="animate-spin" size={14} />
                    Processing...
                  </span>
                ) : pendingReports[cat.id] ? 'REPLACE FILE' : 'Upload Excel Sheet'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* SAVE ACTION BAR */}
      {Object.keys(pendingReports).length > 0 && (
        <motion.div 
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="bg-emerald-600 p-8 rounded-[3rem] flex flex-col md:flex-row items-center justify-between gap-6 shadow-2xl shadow-emerald-200 border-b-8 border-emerald-700"
        >
          <div className="flex items-center gap-4 text-white">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">
              <FileUp size={24} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase tracking-tight">Ready for Final Sync</h3>
              <p className="text-xs text-emerald-100/60 font-bold uppercase tracking-widest leading-relaxed">
                {Object.keys(pendingReports).length} Report(s) prepared for {pendingReports[Object.keys(pendingReports)[0]].date} ({targetShed})
              </p>
            </div>
          </div>
          <button
            onClick={handleSaveAll}
            className="w-full md:w-auto px-12 py-5 bg-stone-900 text-white hover:bg-black rounded-2xl text-[12px] font-black uppercase tracking-[0.3em] transition-all flex items-center justify-center gap-3 cursor-pointer"
          >
            <Upload size={18} className="text-emerald-400" />
            COMMIT & SAVE DATA
          </button>
        </motion.div>
      )}

      {/* Manual / Holiday Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-stone-900 p-10 rounded-[3rem] text-stone-50 overflow-hidden relative">
          <div className="relative z-10">
            <h3 className="text-xl font-black uppercase tracking-tight mb-4">Zero-Production Event</h3>
            <p className="text-sm text-stone-400 font-bold uppercase tracking-widest leading-relaxed mb-8">Mark today as a holiday or maintenance period with no recorded output.</p>
            <button
              onClick={() => {
                const [year, month, day] = selectedDate.split('-');
                const formattedDate = `${day}/${month}/${year}`;
                onUploadSuccess({
                  date: formattedDate,
                  shed: targetShed,
                  entries: [],
                  summaries: [],
                  totalProductionTarget: 0,
                  totalProductionActual: 0
                });
                setShowSuccess(true);
                setTimeout(() => setShowSuccess(false), 3000);
              }}
              disabled={!!isUploading}
              className="px-8 py-4 bg-white/10 hover:bg-white/20 border border-white/20 rounded-2xl text-[10px] font-black uppercase tracking-[0.3em] transition-all cursor-pointer"
            >
              Log Holiday Protocol
            </button>
          </div>
          <AlertCircle size={120} className="absolute -bottom-10 -right-10 text-white/5 rotate-12" />
        </div>

        <div className={cn(
          "p-10 rounded-[3rem] flex items-center justify-between transition-all duration-500",
          showSuccess ? "bg-emerald-500 text-white scale-[1.02]" : "bg-emerald-700/10 border border-emerald-100 text-emerald-900"
        )}>
          <div>
            <h3 className="text-xl font-black uppercase tracking-tight mb-2">
              {showSuccess ? "Upload Successful!" : "Ingestion Status"}
            </h3>
            <p className={cn(
              "text-xs font-bold uppercase tracking-widest leading-relaxed",
              showSuccess ? "text-emerald-100" : "text-emerald-900/50"
            )}>
              {showSuccess ? "The database has been updated with new telemetry." : "System ready for multi-tenant data sync. Pipeline active."}
            </p>
          </div>
          <motion.div
            animate={showSuccess ? { scale: [1, 1.2, 1], rotate: [0, 360] } : {}}
          >
            <FileCheck size={48} className={showSuccess ? "text-white" : "text-emerald-500/30"} />
          </motion.div>
        </div>
      </div>

      {error && (
        <div className="p-6 bg-red-50 border border-red-100 rounded-2xl flex items-center gap-4 text-red-600 animate-pulse">
           <AlertCircle size={20} />
           <span className="text-xs font-black uppercase tracking-widest">{error}</span>
        </div>
      )}

      {/* EXTRACTED DATA PREVIEW MODAL FOR ALL 4 UPLOADS */}
      {previewModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden text-stone-900">
            {/* MODAL HEADER */}
            <div className="p-5 border-b border-stone-200 flex items-center justify-between gap-4 bg-white">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs",
                  previewModal.category === 'daily_report' ? "bg-emerald-100 text-emerald-700" :
                  previewModal.category === 'incentive_report' ? "bg-amber-100 text-amber-700" :
                  previewModal.category === 'machine_em' ? "bg-blue-100 text-blue-700" :
                  "bg-rose-100 text-rose-700"
                )}>
                  {previewModal.category === 'daily_report' ? <FileUp size={20} /> :
                   previewModal.category === 'incentive_report' ? <Coins size={20} /> :
                   previewModal.category === 'machine_em' ? <Gauge size={20} /> :
                   <Contact size={20} />}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black text-stone-900 uppercase tracking-tight">
                      {previewModal.categoryTitle}
                    </h3>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Extracted Preview
                    </span>
                  </div>
                  <p className="text-[11px] font-medium text-stone-500">
                    Verify the extracted Excel records before committing to the database.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPreviewModal(null)}
                className="w-8 h-8 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-600 hover:text-stone-900 flex items-center justify-center transition-colors cursor-pointer"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            {/* TOP BAR: PROMINENT SHED NO & DATE */}
            <div className="bg-stone-50 border-b border-stone-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                {/* SHED SELECTION */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                    Shed No:
                  </span>
                  <div className="flex items-center bg-white p-0.5 rounded-xl border border-stone-200 shadow-2xs">
                    {(['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'] as const).map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setPreviewModal(prev => prev ? ({ ...prev, shed: s }) : null)}
                        className={cn(
                          "px-3 py-1 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center gap-1",
                          previewModal.shed === s
                            ? "bg-emerald-600 text-white shadow-2xs"
                            : "text-stone-600 hover:text-stone-900 font-bold hover:bg-stone-100"
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full", previewModal.shed === s ? "bg-white" : "bg-stone-400")} />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* DATE DISPLAY */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-stone-500">
                    Date:
                  </span>
                  <div className="px-3 py-1 bg-white border border-stone-200 rounded-xl text-xs font-black text-stone-800 shadow-2xs flex items-center gap-1.5">
                    <Calendar size={13} className="text-emerald-600" />
                    <span>{previewModal.date}</span>
                  </div>
                </div>
              </div>

              {/* SOURCE FILE */}
              <div className="flex items-center gap-2 text-stone-500">
                <span className="text-[10px] font-black uppercase tracking-wider">File:</span>
                <span className="px-2.5 py-1 bg-stone-200/70 rounded-lg text-[11px] font-mono font-bold text-stone-700 max-w-[220px] truncate" title={previewModal.fileName}>
                  {previewModal.fileName}
                </span>
              </div>
            </div>

            {/* KPI STAT SUMMARY STRIP */}
            <div className="px-5 py-3 border-b border-stone-100 bg-stone-50/50">
              {renderModalKpis(previewModal)}
            </div>

            {/* EXTRACTED DATA TABLE CONTAINER */}
            <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[52vh] p-5">
              <div className="border border-stone-200 rounded-2xl overflow-hidden shadow-2xs bg-white">
                {renderModalTable(previewModal)}
              </div>
            </div>

            {/* MODAL FOOTER */}
            <div className="p-4 bg-stone-50 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-stone-500 font-medium flex items-center gap-2">
                <Info size={14} className="text-stone-400 shrink-0" />
                <span>
                  Confirming will upload and apply this telemetry for <strong className="text-stone-900 font-bold">{previewModal.shed}</strong>.
                </span>
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPreviewModal(null)}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-xl border border-stone-300 text-stone-700 hover:bg-stone-100 font-black text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmPreview}
                  className="flex-1 sm:flex-none px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 size={15} />
                  Confirm & Save to {previewModal.shed}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
