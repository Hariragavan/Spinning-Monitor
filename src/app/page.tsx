'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { KPIStats } from '@/components/KPIStats';
import { ReportView } from '@/components/ReportView';
import { UploadSection } from '@/components/UploadSection';
import { CountMaster } from '@/components/CountMaster';
import { BestSider } from '@/components/BestSider';
import { BestOperatorsEm } from '@/components/BestOperatorsEm';
import { EmOutliersCompare } from '@/components/EmOutliersCompare';
import { WorkerMaster } from '@/components/WorkerMaster';
import { MachineMaster, STANDARD_12_MACHINES } from '@/components/MachineMaster';
import { BestShift } from '@/components/BestShift';
import { DailyIncentive } from '@/components/DailyIncentive';
import { MachineDailyIncentive } from '@/components/MachineDailyIncentive';
import { MonthlyGrid } from '@/components/MonthlyGrid';
import { MonthAbstract } from '@/components/MonthAbstract';
import { MachineAssignment } from '@/components/MachineAssignment';
import { IncentiveMaster } from '@/components/IncentiveMaster';
import { RunningCountIncentives } from '@/components/RunningCountIncentives';
import { IncentiveLedgerReport } from '@/components/IncentiveLedgerReport';
import { SiderMonthlyPerformance } from '@/components/SiderMonthlyPerformance';
import { AiMonthlyGrid } from '@/components/AiMonthlyGrid';
import { AiMonthAbstract } from '@/components/AiMonthAbstract';
import { AiMonthlyPerformance } from '@/components/AiMonthlyPerformance';
import { FitterMonthlyPerformance } from '@/components/FitterMonthlyPerformance';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OperatorEmFormat } from '@/components/OperatorEmFormat';
import { PerformanceChart } from '@/components/PerformanceChart';
import { Sidebar } from '@/components/Sidebar';
import { MasterDataTable } from '@/components/MasterDataTable';

import { DailyReport, Sider, IncentiveRule, Shift, CountConversion, SystemSettings, ProductionEntry, FrameDailySummary, MachineEmData, FrozenMonthRecord, MachineMasterItem } from '@/types';
import { getMonthKey, computeFrozenMonthRecord } from '@/lib/frozenMonths';
import { cn, mergeDuplicateWorkers, calculateIncentive, getGaiterIncentive, resolveWorker, parseUniversalDate, parseUniversalDateParts } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { ensureSixMachines, mockData, createDefaultReportForShed, getTodayUniversalDate } from '@/lib/parser';
import { syncFromGoogleSheet, syncMachineEmFromGoogleSheet } from '@/lib/googleSheets';

import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, Gauge, Activity, RefreshCw, Database, Trash2, UserCheck, Users,
  LayoutDashboard, FileUp, Settings, TrendingUp, Coins, Trophy, BarChart3,
  Monitor, Zap, Star, AlertTriangle, X, CloudUpload, Loader2, Grid3X3,
  FileText, Check, MessageSquare, Play, Wrench, RotateCcw, History, Menu,
  ArrowLeft, Table
} from 'lucide-react';

const DEFAULT_COUNT_CONVERSIONS: CountConversion[] = [
  { count: '32/1-CH-CY', multiplicationFactor: 0.7155, description: '32/1 Comb Hosiery Compact Weft' },
  { count: '34/1CHY-OCY', multiplicationFactor: 0.7836, description: '34/1 Comb Hosiery Compact Compact' },
  { count: '30/1CH', multiplicationFactor: 0.6495, description: '30/1 Comb Hosiery' },
  { count: '20/1-CW-WVG', multiplicationFactor: 0.3536, description: '20/1 Carded Weft Weaving' },
  { count: '40s', multiplicationFactor: 1.0, description: 'Default 40s Standard Count' }
];

const DEFAULT_INCENTIVE_RULES: IncentiveRule[] = [
  {
    count: '40s Count',
    payouts: [
      { gpsThreshold: 140, amount: 100, fromGps: 140, toGps: 140, conditionText: 'for GPSS 140', ruleText: 'Rs 100 for GPSS 140' },
      { gpsThreshold: 135, amount: 90, fromGps: 135, toGps: 140, conditionText: 'for GPS 135 to 140', ruleText: 'Rs 90 for GPS 135 to 140' },
      { gpsThreshold: 130, amount: 80, fromGps: 130, toGps: 135, conditionText: 'for 130 to 135', ruleText: 'Rs 80 for 130 to 135' },
      { gpsThreshold: 128, amount: 70, fromGps: 128, toGps: 130, conditionText: 'for 128 to 130', ruleText: 'Rs 70 for 128 to 130' },
      { gpsThreshold: 125, amount: 60, fromGps: 125, toGps: 128, conditionText: 'for 125 to 128', ruleText: 'Rs 60 for 125 to 128' },
      { gpsThreshold: 120, amount: 50, fromGps: 120, toGps: 125, conditionText: 'for 120 to 125', ruleText: 'Rs 50 for 120 to 125' },
      { gpsThreshold: 115, amount: 40, fromGps: 115, toGps: 120, conditionText: 'for 115 to 120', ruleText: 'Rs 40 for 115 to 120' },
      { gpsThreshold: 110, amount: 30, fromGps: 110, toGps: 115, conditionText: 'for 110 to 115', ruleText: 'Rs 30 for 110 to 115' }
    ]
  },
  {
    count: '030/1-PH-PC',
    payouts: [
      { gpsThreshold: 210, amount: 100, fromGps: 210, toGps: 210, conditionText: 'for GPSS 210', ruleText: 'Rs 100 for GPSS 210' },
      { gpsThreshold: 200, amount: 90, fromGps: 200, toGps: 210, conditionText: 'for GPS 200 to 210', ruleText: 'Rs 90 for GPS 200 to 210' },
      { gpsThreshold: 195, amount: 80, fromGps: 195, toGps: 200, conditionText: 'for 195 to 200', ruleText: 'Rs 80 for 195 to 200' },
      { gpsThreshold: 190, amount: 70, fromGps: 190, toGps: 195, conditionText: 'for 190 to 195', ruleText: 'Rs 70 for 190 to 195' },
      { gpsThreshold: 185, amount: 60, fromGps: 185, toGps: 190, conditionText: 'for 185 to 190', ruleText: 'Rs 60 for 185 to 190' },
      { gpsThreshold: 180, amount: 50, fromGps: 180, toGps: 185, conditionText: 'for 180 to 185', ruleText: 'Rs 50 for 180 to 185' }
    ]
  },
  {
    count: '34/1-PH-PV',
    payouts: [
      { gpsThreshold: 140, amount: 100, fromGps: 140, toGps: 140, conditionText: 'for GPSS 140', ruleText: 'Rs 100 for GPSS 140' },
      { gpsThreshold: 135, amount: 90, fromGps: 135, toGps: 140, conditionText: 'for GPS 135 to 140', ruleText: 'Rs 90 for GPS 135 to 140' },
      { gpsThreshold: 130, amount: 80, fromGps: 130, toGps: 135, conditionText: 'for 130 to 135', ruleText: 'Rs 80 for 130 to 135' },
      { gpsThreshold: 125, amount: 70, fromGps: 125, toGps: 130, conditionText: 'for 125 to 130', ruleText: 'Rs 70 for 125 to 130' },
      { gpsThreshold: 120, amount: 60, fromGps: 120, toGps: 125, conditionText: 'for 120 to 125', ruleText: 'Rs 60 for 120 to 125' },
      { gpsThreshold: 115, amount: 50, fromGps: 115, toGps: 120, conditionText: 'for 115 to 120', ruleText: 'Rs 50 for 115 to 120' }
    ]
  },
  {
    count: '32/1-CH-CY',
    payouts: [
      { gpsThreshold: 210, amount: 60 },
      { gpsThreshold: 220, amount: 80 },
      { gpsThreshold: 225, amount: 85 },
      { gpsThreshold: 230, amount: 90 },
      { gpsThreshold: 235, amount: 95 },
      { gpsThreshold: 240, amount: 110 }
    ]
  },
  {
    count: '34/1CHY-OCY',
    payouts: [
      { gpsThreshold: 190, amount: 60 },
      { gpsThreshold: 200, amount: 80 },
      { gpsThreshold: 205, amount: 85 },
      { gpsThreshold: 210, amount: 90 },
      { gpsThreshold: 220, amount: 95 },
      { gpsThreshold: 230, amount: 110 }
    ]
  },
  {
    count: '30/1CH',
    payouts: [
      { gpsThreshold: 310, amount: 60 },
      { gpsThreshold: 315, amount: 66 },
      { gpsThreshold: 318, amount: 68 },
      { gpsThreshold: 325, amount: 70 },
      { gpsThreshold: 335, amount: 80 },
      { gpsThreshold: 345, amount: 85 },
      { gpsThreshold: 355, amount: 90 },
      { gpsThreshold: 365, amount: 95 },
      { gpsThreshold: 375, amount: 100 },
      { gpsThreshold: 385, amount: 110 }
    ]
  },
  {
    count: '20/1-CW-WVG',
    payouts: [
      { gpsThreshold: 310, amount: 60 },
      { gpsThreshold: 315, amount: 66 },
      { gpsThreshold: 318, amount: 68 },
      { gpsThreshold: 325, amount: 70 },
      { gpsThreshold: 335, amount: 80 },
      { gpsThreshold: 345, amount: 85 },
      { gpsThreshold: 355, amount: 90 },
      { gpsThreshold: 365, amount: 95 },
      { gpsThreshold: 375, amount: 100 },
      { gpsThreshold: 385, amount: 110 }
    ]
  },
  {
    count: '26/1-CHY',
    payouts: [
      { gpsThreshold: 295, amount: 80 },
      { gpsThreshold: 300, amount: 90 },
      { gpsThreshold: 305, amount: 100 },
      { gpsThreshold: 310, amount: 110 },
      { gpsThreshold: 315, amount: 115 },
      { gpsThreshold: 320, amount: 120 }
    ]
  }
];

const DEFAULT_WORKERS: Sider[] = [
  { id: 'w-fd0262', name: 'AMARESH PANDA', tNo: 'FD0262', department: 'Gaiter', assignedMachine: 'SP023', photoUrl: '' },
  { id: 'w-fd0426', name: 'SUBASH CHANDRA', tNo: 'FD0426', department: 'Gaiter', assignedMachine: 'SP023', photoUrl: '' },
  { id: 'w-fd0483', name: 'CHITRASEN NAIK', tNo: 'FD0483', department: 'Gaiter', assignedMachine: 'SP023', photoUrl: '' },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [machineEm, setMachineEm] = useState<MachineEmData>({});
  const [frozenMonths, setFrozenMonths] = useState<Record<string, FrozenMonthRecord>>({});
  const [workers, setWorkers] = useState<Sider[]>(DEFAULT_WORKERS);
  const [machines, setMachines] = useState<MachineMasterItem[]>(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem('spinning_machines');
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        } catch {}
      }
    }
    return STANDARD_12_MACHINES;
  });
  const [incentiveRules, setIncentiveRules] = useState<IncentiveRule[]>(DEFAULT_INCENTIVE_RULES);
  const [countConversions, setCountConversions] = useState<CountConversion[]>(DEFAULT_COUNT_CONVERSIONS);
  const [dailyReport, setDailyReport] = useState<DailyReport>(mockData);
  const [reportHistory, setReportHistory] = useState<DailyReport[]>([]);
  const [selectedShed, setSelectedShed] = useState<'Shed 1' | 'Shed 2' | 'Shed 3'>('Shed 1');

  const currentShedHistory = useMemo(() => {
    return reportHistory.filter(r => (r.shed || 'Shed 1') === selectedShed);
  }, [reportHistory, selectedShed]);

  const activeDailyReport = useMemo(() => {
    if (dailyReport && (dailyReport.shed || 'Shed 1') === selectedShed) {
      return dailyReport;
    }
    const todayStr = getTodayUniversalDate();
    const todayMatch = currentShedHistory.find(r => r.date === todayStr);
    if (todayMatch) return todayMatch;

    const match = currentShedHistory.find(r => r.date === dailyReport?.date);
    if (match) return match;

    if (currentShedHistory.length > 0) {
      const sorted = [...currentShedHistory].sort((a, b) => parseUniversalDate(b.date).getTime() - parseUniversalDate(a.date).getTime());
      return sorted[0];
    }
    return createDefaultReportForShed(selectedShed, todayStr);
  }, [dailyReport, selectedShed, currentShedHistory]);

  const todayFormatted = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  }, []);

  const [settings, setSettings] = useState<SystemSettings>({
    googleSheetUrl: 'https://docs.google.com/spreadsheets/d/1hRAJzrd6YeOymi86nx8CI_gacJe9m93H/edit?usp=sharing',
    autoUpdateEnabled: false,
    lastSyncDate: null,
    bestSiderOverrideId: null,
    tvInterval: 15,
    tvSubInterval: 5,
    machineSiderCounts: { SP023: 2, SP045: 2, SP046: 2, SP047: 2, SP048: 2, SP049: 2, SP050: 2, SP051: 2, SP052: 2, SP053: 2, SP054: 2, SP055: 2, K01: 2, K02: 2, K03: 2, K04: 2, K05: 2, K06: 2 },
    gaiterCounts: { I: 1, II: 1, III: 1 },
    tvShowBestSiderMonth: true,
    emHighLimit: 4,
    whatsAppProdPhone: '+919944711575',
    whatsAppEmPhone: '+919944711575',
    whatsAppIncentivePhone: '+919944711575',
    tvPageIntervals: {
      'dashboard': 15,
      'daily-incentive': 15,
      'daily-incentive-machine': 15,
      'reports': 20,
      'running-count-incentives': 15,
      'month-view': 0,
      'month-abstract': 0,
      'sider-monthly-performance': 15,
      'operator-em-format': 15,
      'ai-month-view': 0,
      'ai-month-abstract': 0,
      'ai-monthly-performance': 15,
      'best-shift': 15,
      'best': 15,
      'best-operators-em': 15,
      'em-outliers-compare': 15
    }
  });

  const [isTvMode, setIsTvMode] = useState(false);
  const [tvStarted, setTvStarted] = useState(false);
  const [isSupervisorMode, setIsSupervisorMode] = useState(false);
  const [subPagesCount, setSubPagesCount] = useState(1);
  const [isSystemReady, setIsSystemReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const [rollbackDate, setRollbackDate] = useState(() => getTodayUniversalDate());
  const [rollbackMode, setRollbackMode] = useState<'after' | 'upto' | 'august'>('after');
  const [clearMonth, setClearMonth] = useState(() => String(new Date().getMonth() + 1).padStart(2, '0'));
  const [clearYear, setClearYear] = useState(() => String(new Date().getFullYear()));

  const [syncResultModal, setSyncResultModal] = useState<{ show: boolean; title: string; message: string; success: boolean } | null>(null);
  const [whatsAppToast, setWhatsAppToast] = useState<{ show: boolean; url: string; phone: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Load Initial Data from MongoDB
  useEffect(() => {
    async function loadData() {
      try {
        const data = await apiClient.fetchInitialData();
        if (data.dailyReport) setDailyReport(ensureSixMachines(data.dailyReport));
        if (data.history && data.history.length > 0) setReportHistory(data.history);
        if (data.workers && data.workers.length > 0) setWorkers(mergeDuplicateWorkers(data.workers));
        if (data.rules && data.rules.length > 0) setIncentiveRules(data.rules);
        if (data.counts && data.counts.length > 0) setCountConversions(data.counts);
        if (data.settings) setSettings(prev => ({ ...prev, ...data.settings }));
        if (data.machineEm) setMachineEm(data.machineEm);
        if (data.frozenMonths) setFrozenMonths(data.frozenMonths);
        setIsSystemReady(true);
      } catch (err: any) {
        console.error('Failed to load initial data from MongoDB:', err);
        setLastError(err?.message || 'Database connection error');
        setIsSystemReady(true);
      }
    }
    loadData();
  }, []);

  // URL Parameter Routing
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tv') === 'true' || params.get('mode') === 'tv') {
      setIsTvMode(true);
    }
    const tabParam = params.get('tab') || params.get('view') || params.get('page');
    if (tabParam === 'supervisor' || params.get('supervisor') === 'true') {
      setIsSupervisorMode(true);
      setActiveTab('assignments');
    } else if (tabParam) {
      setActiveTab(tabParam);
    }
  }, []);

  // ESC key to exit TV mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isTvMode) {
        setIsTvMode(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isTvMode]);

  // Synchronize month/year with active dailyReport
  useEffect(() => {
    if (dailyReport && dailyReport.date) {
      const parts = parseUniversalDateParts(dailyReport.date);
      if (parts && parts.year > 2000) {
        setSelectedMonth(parts.month);
        setSelectedYear(parts.year);
      }
    }
  }, [dailyReport.date]);

  // TV Mode Page Rotation
  useEffect(() => {
    if (!isTvMode || !tvStarted) return;

    const baseSequence = [
      'dashboard', 'daily-incentive', 'daily-incentive-machine', 'reports',
      'running-count-incentives', 'month-view', 'month-abstract',
      'sider-monthly-performance', 'fitter-monthly-performance',
      'operator-em-format', 'ai-month-view', 'ai-month-abstract',
      'ai-monthly-performance', 'best-shift', 'best',
      'best-operators-em', 'em-outliers-compare'
    ];

    const activeSequence = baseSequence.filter(tabId => {
      const seconds = settings.tvPageIntervals?.[tabId] !== undefined ? settings.tvPageIntervals[tabId] : 15;
      return seconds > 0;
    });

    if (activeSequence.length === 0) {
      if (activeTab !== 'dashboard') setActiveTab('dashboard');
      return;
    }

    const currentIntervalSecs = (settings.tvPageIntervals?.[activeTab] !== undefined)
      ? settings.tvPageIntervals[activeTab]
      : 15;

    const effectiveDuration = (currentIntervalSecs || 15) * 1000;

    const timeout = setTimeout(() => {
      const currentIndex = activeSequence.indexOf(activeTab);
      const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % activeSequence.length;
      setActiveTab(activeSequence[nextIndex]);
    }, effectiveDuration);

    return () => clearTimeout(timeout);
  }, [isTvMode, tvStarted, activeTab, settings.tvPageIntervals, subPagesCount]);

  // Manual Sync to MongoDB
  const forceSync = async () => {
    setIsManualSyncing(true);
    setSaveStatus('saving');
    try {
      await Promise.all([
        apiClient.saveDailyReport(dailyReport),
        apiClient.saveReportHistory(reportHistory),
        apiClient.saveWorkers(workers),
        apiClient.saveRules(incentiveRules),
        apiClient.saveSettings(settings),
        apiClient.saveMachineEm(machineEm)
      ]);
      setSaveStatus('saved');
      setSyncResultModal({
        show: true,
        title: 'Sync Complete',
        message: 'All daily statements, worker allocations, and system settings have been securely saved to MongoDB.',
        success: true
      });
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (err: any) {
      setSaveStatus('error');
      setLastError(err?.message || 'Sync failed');
      setSyncResultModal({
        show: true,
        title: 'Sync Error',
        message: `Failed to save changes to MongoDB: ${err?.message || 'Connection error'}`,
        success: false
      });
    } finally {
      setIsManualSyncing(false);
    }
  };

  // Google Sheets Sync
  const syncData = async () => {
    if (!settings.googleSheetUrl && !settings.machineEmGoogleSheetUrl) return;
    try {
      const now = new Date().toLocaleString();
      let updatedSettings = { ...settings };

      if (settings.googleSheetUrl) {
        const { workers: newWorkers, rules: newRules } = await syncFromGoogleSheet(settings.googleSheetUrl);
        if (newWorkers.length > 0) {
          const mergedWorkers = mergeDuplicateWorkers([...workers, ...newWorkers]);
          setWorkers(mergedWorkers);
          await apiClient.saveWorkers(mergedWorkers);
        }
        if (newRules.length > 0) {
          setIncentiveRules(newRules);
          await apiClient.saveRules(newRules);
        }
        updatedSettings.lastSyncDate = now;
      }

      if (settings.machineEmGoogleSheetUrl) {
        try {
          const syncedEm = await syncMachineEmFromGoogleSheet(settings.machineEmGoogleSheetUrl);
          if (syncedEm && Object.keys(syncedEm).length > 0) {
            const mergedEm = { ...machineEm, ...syncedEm };
            setMachineEm(mergedEm);
            await apiClient.saveMachineEm(mergedEm);
            updatedSettings.lastMachineEmSyncDate = now;
          }
        } catch (emErr) {
          console.error('Failed to sync Machine EM from Google Sheet:', emErr);
        }
      }

      setSettings(updatedSettings);
      await apiClient.saveSettings(updatedSettings);
      alert('Google Sheet data synchronized successfully to MongoDB!');
    } catch (err: any) {
      console.error(err);
      alert('Error syncing from Google Sheets. Check console and URL.');
    }
  };

  // WhatsApp Message Generators
  const generateWhatsAppMessage = (report: DailyReport) => {
    const dateStr = report.date || new Date().toLocaleDateString('en-GB');
    const machineData: Record<string, { actual: number; target: number; sumEff: number; count: number; counts: string[] }> = {};

    if (report.entries && Array.isArray(report.entries)) {
      report.entries.forEach(e => {
        if (!e.frameNo) return;
        if (!machineData[e.frameNo]) {
          machineData[e.frameNo] = { actual: 0, target: 0, sumEff: 0, count: 0, counts: [] };
        }
        machineData[e.frameNo].actual += e.productionActual || 0;
        machineData[e.frameNo].target += e.productionTarget || 0;
        if (e.efficiency) {
          machineData[e.frameNo].sumEff += e.efficiency;
          machineData[e.frameNo].count += 1;
        }
        if (e.count && !machineData[e.frameNo].counts.includes(e.count)) {
          machineData[e.frameNo].counts.push(e.count);
        }
      });
    }

    const totalTarget = Math.round(report.totalProductionTarget || Object.values(machineData).reduce((sum, m) => sum + m.target, 0));
    const totalActual = Math.round(report.totalProductionActual || Object.values(machineData).reduce((sum, m) => sum + m.actual, 0));
    const overallEff = totalTarget > 0 ? ((totalActual / totalTarget) * 100).toFixed(1) : '0';

    let text = `*📢 SPINMONITOR AI - DAILY PRODUCTION STATEMENT*\n`;
    text += `*Date:* ${dateStr}\n\n`;
    text += `*PRODUCTION SUMMARY:*\n`;
    text += `• Total Target: *${totalTarget.toLocaleString('en-IN')} Kg*\n`;
    text += `• Total Actual: *${totalActual.toLocaleString('en-IN')} Kg*\n`;
    text += `• Avg Efficiency: *${overallEff}%*\n\n`;

    const sortedFrames = Object.keys(machineData).sort();
    if (sortedFrames.length > 0) {
      text += `*MACHINE PERFORMANCE:*\n`;
      sortedFrames.forEach(frame => {
        const m = machineData[frame];
        const eff = m.count > 0 ? (m.sumEff / m.count).toFixed(1) : '0';
        const countsStr = m.counts.join(', ') || '40s';
        text += `• *${frame}* (${countsStr}): *${Math.round(m.actual).toLocaleString('en-IN')}* / ${Math.round(m.target).toLocaleString('en-IN')} Kg | *${eff}%* Eff\n`;
      });
    }

    text += `\n_Generated automatically by SpinMonitor AI_`;
    return encodeURIComponent(text);
  };

  const generateEmStatementMessage = (report: DailyReport) => {
    const dateStr = report.date || new Date().toLocaleDateString('en-GB');
    let text = `*⚠️ SPINMONITOR AI - DAILY EM STATEMENT*\n`;
    text += `*Date:* ${dateStr}\n\n`;
    text += `*HIGH EM / BREAKS DETECTED:*\n`;

    const highEmEntries: { frameNo: string; shift: Shift; emValue: number; siders: string }[] = [];
    const highLimit = settings.emHighLimit ?? 4;

    if (report.entries && Array.isArray(report.entries)) {
      report.entries.forEach(e => {
        const shiftNum = e.shift === 'I' ? 1 : e.shift === 'II' ? 2 : 3;
        let emValue = machineEm?.[report.date]?.[e.frameNo]?.[shiftNum];
        if (emValue === undefined) emValue = e.doffEmt;

        if (emValue !== undefined && emValue > highLimit) {
          const assignedSiders = e.siderIds ? e.siderIds.map(id => {
            const w = workers.find(work => work.id === id);
            return w ? `${w.name} (${w.tNo})` : '';
          }).filter(Boolean).join(', ') : (e.siderId ? (workers.find(work => work.id === e.siderId)?.name || '') : '');

          highEmEntries.push({
            frameNo: e.frameNo,
            shift: e.shift,
            emValue,
            siders: assignedSiders || e.siderName || 'Unassigned'
          });
        }
      });
    }

    if (highEmEntries.length > 0) {
      highEmEntries.forEach(item => {
        text += `• *Frame ${item.frameNo}* (Shift ${item.shift}): *${item.emValue.toFixed(1)} EM* (Limit: ${highLimit})\n  Operator: ${item.siders}\n`;
      });
    } else {
      text += `✅ All machines operating within safe EM threshold (< ${highLimit} EM).\n`;
    }

    text += `\n_Generated automatically by SpinMonitor AI_`;
    return encodeURIComponent(text);
  };

  const generateIncentiveStatementMessage = (report: DailyReport) => {
    const dateStr = report.date || new Date().toLocaleDateString('en-GB');
    let text = `*💰 SPINMONITOR AI - DAILY INCENTIVE STATEMENT*\n`;
    text += `*Date:* ${dateStr}\n\n`;
    text += `*INCENTIVE LEDGER SUMMARY:*\n`;

    const workerIncentives: Record<string, { name: string; tNo: string; amount: number; roles: string[] }> = {};

    if (report.entries && Array.isArray(report.entries)) {
      report.entries.forEach(entry => {
        const payout = calculateIncentive(entry, incentiveRules, report.date);
        if (payout <= 0) return;

        const assignedIds = new Set<string>();
        if (entry.siderId) assignedIds.add(entry.siderId);
        if (entry.siderIds) entry.siderIds.forEach(id => { if (id) assignedIds.add(id); });

        assignedIds.forEach(id => {
          const workerObj = resolveWorker(id, entry.siderName, workers);
          const key = workerObj.tNo || workerObj.id;
          if (!workerIncentives[key]) {
            workerIncentives[key] = { name: workerObj.name, tNo: workerObj.tNo, amount: 0, roles: [] };
          }
          workerIncentives[key].amount += payout;
          if (!workerIncentives[key].roles.includes('Operator')) {
            workerIncentives[key].roles.push('Operator');
          }
        });
      });
    }

    const shifts: Shift[] = ['I', 'II', 'III'];
    shifts.forEach(shift => {
      const gaiters = report.gaiters?.[shift] || [];
      const payout = getGaiterIncentive(report, shift, incentiveRules, workers);
      if (payout <= 0) return;

      gaiters.forEach(gid => {
        const workerObj = resolveWorker(gid, undefined, workers);
        const key = workerObj.tNo || workerObj.id;
        if (!workerIncentives[key]) {
          workerIncentives[key] = { name: workerObj.name, tNo: workerObj.tNo, amount: 0, roles: [] };
        }
        workerIncentives[key].amount += payout;
        if (!workerIncentives[key].roles.includes('Gaiter')) {
          workerIncentives[key].roles.push('Gaiter');
        }
      });
    });

    const sortedKeys = Object.keys(workerIncentives).sort((a, b) => {
      const aNum = parseInt(workerIncentives[a].tNo);
      const bNum = parseInt(workerIncentives[b].tNo);
      if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
      return a.localeCompare(b);
    });

    let totalPayout = 0;
    if (sortedKeys.length > 0) {
      sortedKeys.forEach(key => {
        const item = workerIncentives[key];
        const cappedAmount = Math.min(120, item.amount);
        totalPayout += cappedAmount;
        text += `• *T.No ${item.tNo}* - ${item.name} (${item.roles.join('/')}): *₹${Math.round(cappedAmount)}*\n`;
      });
      text += `\n*Total Daily Payout:* *₹${Math.round(totalPayout)}*\n`;
    } else {
      text += `No incentives earned for this date.\n`;
    }

    text += `\n_Generated automatically by SpinMonitor AI_`;
    return encodeURIComponent(text);
  };

  // Assignments Handlers
  const assignWorkerToMachine = (entryIndex: number, siderId: string, slotIndex: number = 0) => {
    if (siderId) {
      let conflictMsg: string | null = null;
      const worker = workers.find(w => w.id === siderId);
      const name = worker ? worker.name : siderId;

      dailyReport.entries.forEach((entry, idx) => {
        if (idx === entryIndex) return;
        if (entry.siderId === siderId || (entry.siderIds && entry.siderIds.includes(siderId))) {
          conflictMsg = `${name} is already assigned to Machine ${entry.frameNo} in Shift ${entry.shift} today.`;
        }
      });

      if (dailyReport.gaiters) {
        (['I', 'II', 'III'] as Shift[]).forEach(shift => {
          const gaiterIds = dailyReport.gaiters?.[shift] || [];
          if (gaiterIds.includes(siderId)) {
            conflictMsg = `${name} is already assigned as a Gaiter in Shift ${shift} today.`;
          }
        });
      }

      if (dailyReport.aiCones) {
        (['I', 'II', 'III'] as Shift[]).forEach(shift => {
          const aiConeIds = dailyReport.aiCones?.[shift] || [];
          if (aiConeIds.includes(siderId)) {
            conflictMsg = `${name} is already assigned as an AI Linkconer in Shift ${shift} today.`;
          }
        });
      }

      if (conflictMsg) {
        alert(`Duplicate Allocation Blocked:\n\n${conflictMsg}\n\nA worker can only be allotted once per day and cannot work in another shift/machine.`);
        return;
      }
    }

    setDailyReport(prev => {
      const newEntries = [...prev.entries];
      const worker = workers.find(w => w.id === siderId);
      const entry = { ...newEntries[entryIndex] };

      const siderIds = [...(entry.siderIds || [])];
      siderIds[slotIndex] = siderId || '';

      if (slotIndex === 0) {
        entry.siderId = siderId || '';
        entry.siderName = worker ? worker.name : '';
      }

      entry.siderIds = siderIds.map(id => id || '');
      newEntries[entryIndex] = entry;
      const updated = { ...prev, entries: newEntries, timestamp: Date.now() };
      apiClient.saveDailyReport(updated).catch(() => {});
      return updated;
    });
  };

  const assignGaiter = (shift: Shift, gaiterIds: string[]) => {
    const activeIds = gaiterIds.filter(id => id);
    let conflictMsg: string | null = null;

    activeIds.forEach(siderId => {
      const worker = workers.find(w => w.id === siderId);
      const name = worker ? worker.name : siderId;

      (['I', 'II', 'III'] as Shift[]).forEach(s => {
        if (s === shift) return;
        if ((dailyReport.gaiters?.[s] || []).includes(siderId)) {
          conflictMsg = `${name} is already assigned as a Gaiter in Shift ${s} today.`;
        }
      });

      dailyReport.entries.forEach(entry => {
        if (entry.siderId === siderId || (entry.siderIds && entry.siderIds.includes(siderId))) {
          conflictMsg = `${name} is already assigned to Machine ${entry.frameNo} in Shift ${entry.shift} today.`;
        }
      });
    });

    if (conflictMsg) {
      alert(`Duplicate Allocation Blocked:\n\n${conflictMsg}\n\nA worker can only be allotted once per day.`);
      return;
    }

    setDailyReport(prev => {
      const updated = {
        ...prev,
        gaiters: {
          ...(prev.gaiters || { I: [], II: [], III: [] }),
          [shift]: gaiterIds.map(id => id || '')
        } as Record<Shift, string[]>,
        timestamp: Date.now()
      };
      apiClient.saveDailyReport(updated).catch(() => {});
      return updated;
    });
  };

  const assignAiCone = (shift: Shift, aiConeIds: string[]) => {
    setDailyReport(prev => {
      const updated = {
        ...prev,
        aiCones: {
          ...(prev.aiCones || { I: [], II: [], III: [] }),
          [shift]: aiConeIds.map(id => id || '')
        } as Record<Shift, string[]>,
        timestamp: Date.now()
      };
      apiClient.saveDailyReport(updated).catch(() => {});
      return updated;
    });
  };

  const assignFitter = (shift: Shift, fitterIds: string[]) => {
    setDailyReport(prev => {
      const updated = {
        ...prev,
        fitters: {
          ...(prev.fitters || { I: [], II: [], III: [] }),
          [shift]: fitterIds.map(id => id || '')
        } as Record<Shift, string[]>,
        timestamp: Date.now()
      };
      apiClient.saveDailyReport(updated).catch(() => {});
      return updated;
    });
  };

  const copyAllocationsFromReport = (sourceDate: string, targetShift?: Shift | 'ALL') => {
    const sourceReport = reportHistory.find(r => r.date === sourceDate);
    if (!sourceReport) {
      alert(`Source report for date ${sourceDate} not found.`);
      return;
    }

    setDailyReport(prev => {
      const newEntries = prev.entries.map(targetEntry => {
        if (targetShift && targetShift !== 'ALL' && targetEntry.shift !== targetShift) return targetEntry;
        const sourceEntry = sourceReport.entries.find(e => e.frameNo === targetEntry.frameNo && e.shift === targetEntry.shift);
        if (sourceEntry) {
          return {
            ...targetEntry,
            siderId: sourceEntry.siderId || '',
            siderName: sourceEntry.siderName || '',
            siderIds: sourceEntry.siderIds ? [...sourceEntry.siderIds] : []
          };
        }
        return targetEntry;
      });

      const updated = {
        ...prev,
        entries: newEntries,
        gaiters: sourceReport.gaiters ? { ...sourceReport.gaiters } : prev.gaiters,
        aiCones: sourceReport.aiCones ? { ...sourceReport.aiCones } : prev.aiCones,
        fitters: sourceReport.fitters ? { ...sourceReport.fitters } : prev.fitters,
        timestamp: Date.now()
      };
      apiClient.saveDailyReport(updated).catch(() => {});
      return updated;
    });
  };

  const createBlankReport = (date: string) => {
    const existing = currentShedHistory.find(r => r.date === date);
    if (existing) {
      setDailyReport(existing);
      return;
    }

    const newReport: DailyReport = createDefaultReportForShed(selectedShed, date);

    setReportHistory(prev => [...prev.filter(r => !(r.date === date && (r.shed || 'Shed 1') === selectedShed)), newReport]);
    setDailyReport(newReport);
    apiClient.saveDailyReport(newReport).catch(() => {});
    alert(`Blank report created for ${date} in ${selectedShed}`);
  };

  const changeReportDate = (oldDate: string, newDate: string) => {
    if (oldDate === newDate) return;
    if (!/^\d{2}\/\d{2}\/\d{4}$/.test(newDate)) {
      alert('Invalid date format. Please use DD/MM/YYYY');
      return;
    }

    setReportHistory(prev => prev.map(r => r.date === oldDate ? { ...r, date: newDate, timestamp: Date.now() } : r));
    setDailyReport(prev => prev.date === oldDate ? { ...prev, date: newDate, timestamp: Date.now() } : prev);
    apiClient.saveDailyReport({ ...dailyReport, date: newDate }).catch(() => {});
    alert(`Changed report date to ${newDate}`);
  };

  // Master Data CRUD
  const addWorker = async (worker: Omit<Sider, 'id'>) => {
    const newWorker: Sider = { ...worker, id: crypto.randomUUID() };
    const updated = [...workers, newWorker];
    setWorkers(updated);
    await apiClient.saveWorker(newWorker);
  };

  const updateWorker = async (worker: Sider) => {
    const updated = workers.map(w => w.id === worker.id ? worker : w);
    setWorkers(updated);
    await apiClient.saveWorker(worker);
  };

  const deleteWorker = async (id: string) => {
    const updated = workers.filter(w => w.id !== id);
    setWorkers(updated);
    await apiClient.deleteWorker(id);
  };

  const clearAllWorkers = async () => {
    if (window.confirm('Are you SURE you want to delete ALL workers? This cannot be undone.')) {
      setWorkers([]);
      await apiClient.clearAllWorkers();
    }
  };

  const bulkDeleteWorkers = async (ids: string[]) => {
    const updated = workers.filter(w => !ids.includes(w.id));
    setWorkers(updated);
    await apiClient.saveWorkers(updated);
  };

  const importWorkers = async (imported: Sider[], mode: 'replace' | 'merge') => {
    let updated: Sider[] = [];
    if (mode === 'replace') {
      updated = imported;
    } else {
      const map = new Map<string, Sider>();
      workers.forEach(w => map.set(w.tNo || w.id, w));
      imported.forEach(w => map.set(w.tNo || w.id, w));
      updated = Array.from(map.values());
    }
    setWorkers(updated);
    await apiClient.saveWorkers(updated);
  };

  const saveMachine = (machine: MachineMasterItem) => {
    setMachines(prev => {
      const exists = prev.some(m => m.id === machine.id || m.rfNo === machine.rfNo);
      const updated = exists 
        ? prev.map(m => (m.id === machine.id || m.rfNo === machine.rfNo) ? machine : m)
        : [...prev, machine];
      if (typeof window !== 'undefined') {
        localStorage.setItem('spinning_machines', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const deleteMachine = (id: string) => {
    setMachines(prev => {
      const updated = prev.filter(m => m.id !== id);
      if (typeof window !== 'undefined') {
        localStorage.setItem('spinning_machines', JSON.stringify(updated));
      }
      return updated;
    });
  };

  const resetStandardMachines = () => {
    setMachines(STANDARD_12_MACHINES);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spinning_machines', JSON.stringify(STANDARD_12_MACHINES));
    }
    alert('Reset all machines to Standard 12 Machines (SP023, SP045–SP055)');
  };

  const saveCountConversion = async (conv: CountConversion) => {
    const updated = [...countConversions.filter(c => c.count !== conv.count), conv];
    setCountConversions(updated);
    await apiClient.saveCountConversion(conv);
  };

  const deleteCountConversion = async (count: string) => {
    const updated = countConversions.filter(c => c.count !== count);
    setCountConversions(updated);
    await apiClient.deleteCountConversion(count);
  };

  const updateIncentiveRulesOnline = async (newRules: IncentiveRule[]) => {
    setIncentiveRules(newRules);
    await apiClient.saveRules(newRules);
  };

  const handleToggleFreezeMonth = useCallback(async (m: number, y: number) => {
    const monthKey = getMonthKey(m, y);
    const existing = frozenMonths[monthKey];
    if (existing) {
      const copy = { ...frozenMonths };
      delete copy[monthKey];
      setFrozenMonths(copy);
      await apiClient.toggleFreezeMonth(existing, true);
    } else {
      const rec = computeFrozenMonthRecord(m, y, reportHistory, workers, incentiveRules, 'admin');
      const next = { ...frozenMonths, [monthKey]: rec };
      setFrozenMonths(next);
      await apiClient.toggleFreezeMonth(rec, false);
    }
  }, [frozenMonths, reportHistory, workers, incentiveRules]);

  const seedHistoricalData = async () => {
    await apiClient.seedHistoricalApril();
    const refreshed = await apiClient.fetchInitialData();
    if (refreshed.history) setReportHistory(refreshed.history);
    alert('April historical reports imported into MongoDB successfully!');
  };

  const clearAllHistory = async () => {
    if (window.confirm('Are you SURE you want to delete ALL historical records?')) {
      setReportHistory([]);
      await apiClient.clearAllHistory();
    }
  };

  const clearMonthData = async () => {
    if (window.confirm(`Delete all data for month ${clearMonth}/${clearYear}?`)) {
      await apiClient.clearMonthData(clearMonth, clearYear);
      const refreshed = await apiClient.fetchInitialData();
      if (refreshed.history) setReportHistory(refreshed.history);
      alert('Month data deleted.');
    }
  };

  const handleRollbackData = async (targetCutoff: string, mode: 'after' | 'upto' | 'august') => {
    if (window.confirm(`Execute rollback with cutoff ${targetCutoff}?`)) {
      await apiClient.rollbackData(targetCutoff, mode);
      const refreshed = await apiClient.fetchInitialData();
      if (refreshed.history) setReportHistory(refreshed.history);
      alert('Rollback executed.');
    }
  };

  const downloadBackup = async () => {
    const backup = await apiClient.exportBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `spinmonitor_backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);
        await apiClient.importBackup(json);
        const refreshed = await apiClient.fetchInitialData();
        if (refreshed.dailyReport) setDailyReport(refreshed.dailyReport);
        if (refreshed.history) setReportHistory(refreshed.history);
        if (refreshed.workers) setWorkers(refreshed.workers);
        if (refreshed.rules) setIncentiveRules(refreshed.rules);
        if (refreshed.counts) setCountConversions(refreshed.counts);
        alert('Database restored from JSON successfully!');
      } catch (err: any) {
        alert(`Failed to import JSON: ${err?.message}`);
      }
    };
    reader.readAsText(file);
  };

  const configurableMachines = useMemo(() => {
    const list = new Set<string>();
    (machines || []).forEach(m => {
      if (m.rfNo) list.add(m.rfNo);
    });
    (activeDailyReport.entries || []).forEach(e => {
      if (e.frameNo) list.add(e.frameNo);
    });
    Object.keys(settings.machineSiderCounts || {}).forEach(k => {
      if (k) list.add(k);
    });
    if (list.size === 0) {
      ['SP023', 'SP025', 'SP026', 'SP027', 'SP029', 'SP030', 'SP031', 'SP032', 'SP033', 'SP034', 'SP035', 'SP036', 'SP037', 'SP038', 'SP045', 'SP046', 'SP047', 'SP048', 'SP049', 'SP050', 'SP051', 'SP052', 'SP053', 'SP054', 'SP055', 'SP056'].forEach(m => list.add(m));
    }
    return Array.from(list).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [machines, activeDailyReport.entries, settings.machineSiderCounts]);

  const updateMachineSides = (rfNo: string, newSides: number) => {
    const updatedCounts = {
      ...(settings.machineSiderCounts || {}),
      [rfNo]: Math.max(1, Math.min(3, newSides))
    };
    const updated = { ...settings, machineSiderCounts: updatedCounts };
    setSettings(updated);
    apiClient.saveSettings(updated).catch(() => {});
  };

  const setAllMachinesSides = (sides: number) => {
    const updatedCounts = { ...(settings.machineSiderCounts || {}) };
    configurableMachines.forEach(rfNo => {
      updatedCounts[rfNo] = sides;
    });
    const updated = { ...settings, machineSiderCounts: updatedCounts };
    setSettings(updated);
    apiClient.saveSettings(updated).catch(() => {});
  };

  const getClearMonthName = (m: string | number) => {
    const num = Number(m);
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return months[num - 1] || String(m);
  };

  // Nav Items definition
  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { id: 'all-data', icon: Table, label: 'Master Data Table' },
    { id: 'daily-incentive', icon: Coins, label: 'Daily Incentive' },
    { id: 'daily-incentive-machine', icon: Grid3X3, label: 'Daily Incentive - Machine Wise' },
    { id: 'assignments', icon: UserCheck, label: 'Assignments' },
    { id: 'reports', icon: TrendingUp, label: 'Daily Statement' },
    { id: 'month-view', icon: Calendar, label: 'Monthly Incentive' },
    { id: 'month-abstract', icon: BarChart3, label: 'Monthly Abstract' },
    { id: 'incentive-ledger-report', icon: FileText, label: 'Incentive Ledger & Abstract' },
    { id: 'sider-monthly-performance', icon: FileText, label: 'Sider Monthly Performance' },
    { id: 'operator-em-format', icon: FileText, label: 'Operator EM Format' },
    { id: 'ai-month-view', icon: Calendar, label: 'AI Monthly Incentive' },
    { id: 'ai-month-abstract', icon: BarChart3, label: 'AI Monthly Abstract' },
    { id: 'ai-monthly-performance', icon: FileText, label: 'AI Monthly Performance' },
    { id: 'fitter-monthly-performance', icon: Wrench, label: 'Fitter Monthly Performance' },
    { id: 'running-count-incentives', icon: Coins, label: 'Incentive Amount Based in GPS' },
    { id: 'performance', icon: Gauge, label: 'Machine Performance' },
    { id: 'best-shift', icon: Star, label: 'Best Shift' },
    { id: 'best', icon: Trophy, label: 'Best Sider' },
    { id: 'best-operators-em', icon: Trophy, label: 'Best 2 Operators EM Table' },
    { id: 'em-outliers-compare', icon: AlertTriangle, label: 'EM Outliers Compare' },
    { id: 'counts', icon: Gauge, label: 'Count Master' },
    { id: 'incentive-master', icon: Coins, label: 'Incentive Master' },
    { id: 'workers', icon: Users, label: 'Employee Master' },
    { id: 'machine-master', icon: Wrench, label: 'Machine Master' },
    { id: 'upload', icon: FileUp, label: 'Upload Data' },
    { id: 'settings', icon: Settings, label: 'Settings' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 10 }} 
            animate={{ opacity: 1, y: 0 }} 
            className={cn(
              isTvMode 
                ? "h-screen w-full flex flex-col justify-between p-4 bg-stone-100 overflow-hidden select-none" 
                : "space-y-3.5 pb-6 relative"
            )}
          >
            {/* TV Broadcast Banner (TV Mode only) */}
            {isTvMode ? (
              <div className="flex justify-between items-center bg-stone-900 text-white px-5 py-2.5 rounded-2xl shadow-md border border-stone-800 shrink-0 mb-2">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-2 bg-emerald-500 rounded-full" />
                  <h1 className="text-xl md:text-2xl font-black tracking-tight uppercase text-white font-serif">
                    SCM <span className="text-emerald-400 font-sans text-base font-bold ml-1">PRODUCTION MONITOR</span>
                  </h1>
                  <span className="px-3 py-0.5 bg-emerald-950/80 text-emerald-400 rounded-xl text-xs font-black border border-emerald-800/80 ml-2">
                    {selectedShed}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs font-bold">
                  <div className="flex items-center gap-2 bg-stone-800 px-3 py-1.5 rounded-xl border border-stone-700">
                    <Calendar size={13} className="text-emerald-400" />
                    <span>Date: <strong className="text-white">{activeDailyReport.date}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 bg-emerald-900/60 text-emerald-300 px-3 py-1.5 rounded-xl border border-emerald-700/60">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>55&quot; TV CONSOLE</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-between items-end relative z-10 px-1">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <div className="h-6 w-2 bg-emerald-700 rounded-full" />
                    <h2 className="text-xl md:text-2xl font-black tracking-tight uppercase text-stone-900">
                      Production Overview <span className="text-emerald-600 font-serif italic text-lg md:text-xl ml-1">({selectedShed})</span>
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 text-stone-500 font-bold text-[11px] uppercase tracking-wider">
                    <div className="flex items-center gap-1.5 bg-white px-3 py-1 rounded-full border border-stone-200 shadow-2xs">
                      <Calendar size={12} className="text-emerald-600" />
                      <span>Sider Assigned Date: <strong className="text-stone-800">{activeDailyReport.date}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full border border-emerald-200 shadow-2xs">
                      <Activity size={12} />
                      <span>{selectedShed} Active</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* KPI Strip */}
            <div className="relative z-10 shrink-0">
              <KPIStats report={activeDailyReport} isTvMode={isTvMode} lastSyncDate={settings.lastSyncDate} />
            </div>

            {/* Master Data Table */}
            <div className={cn("relative z-10", isTvMode ? "flex-1 min-h-0 overflow-hidden" : "")}>
              <MasterDataTable
                report={activeDailyReport}
                workers={workers}
                rules={incentiveRules}
                isTvMode={isTvMode}
                onSelectDate={(date) => {
                  const r = currentShedHistory.find(rep => rep.date === date);
                  if (r) setDailyReport(r);
                  else createBlankReport(date);
                }}
                availableDates={Array.from(new Set([activeDailyReport.date, ...currentShedHistory.map(r => r.date)].filter(Boolean)))}
              />
            </div>
          </motion.div>
        );

      case 'all-data':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-16">
            <MasterDataTable
              report={activeDailyReport}
              workers={workers}
              rules={incentiveRules}
              isTvMode={isTvMode}
              onSelectDate={(date) => {
                const r = currentShedHistory.find(rep => rep.date === date);
                if (r) setDailyReport(r);
                else createBlankReport(date);
              }}
              availableDates={Array.from(new Set([activeDailyReport.date, ...currentShedHistory.map(r => r.date)].filter(Boolean)))}
            />
          </motion.div>
        );

      case 'reports':
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={cn('flex justify-center', isTvMode ? 'p-0' : 'py-6')}>
            <div className={cn('w-full', !isTvMode && 'max-w-7xl')}>
              <ReportView report={activeDailyReport} isTvMode={isTvMode} />
            </div>
          </motion.div>
        );

      case 'daily-incentive':
        return (
          <DailyIncentive
            report={activeDailyReport}
            workers={workers}
            rules={incentiveRules}
            isTvMode={isTvMode}
            onUpdateEntry={(entry) => {
              setDailyReport(prev => {
                const newEntries = prev.entries.map(e => e.frameNo === entry.frameNo && e.shift === entry.shift ? { ...e, ...entry, shed: selectedShed } : e);
                const updated = { ...prev, shed: selectedShed, entries: newEntries, timestamp: Date.now() };
                apiClient.saveDailyReport(updated).catch(() => {});
                return updated;
              });
            }}
            onSelectDate={(date) => {
              const report = currentShedHistory.find(r => r.date === date);
              if (report) setDailyReport(report);
              else createBlankReport(date);
            }}
            onChangeReportDate={changeReportDate}
          />
        );

      case 'daily-incentive-machine':
        return (
          <MachineDailyIncentive
            report={activeDailyReport}
            workers={workers}
            rules={incentiveRules}
            isTvMode={isTvMode}
            onSelectDate={(date) => {
              const report = currentShedHistory.find(r => r.date === date);
              if (report) setDailyReport(report);
              else createBlankReport(date);
            }}
            machineSiderCounts={settings.machineSiderCounts}
          />
        );

      case 'assignments':
        return (
          <MachineAssignment
            workers={workers}
            entries={activeDailyReport.entries}
            gaiters={activeDailyReport.gaiters || { I: [], II: [], III: [] }}
            aiCones={activeDailyReport.aiCones || { I: [], II: [], III: [] }}
            fitters={activeDailyReport.fitters || { I: [], II: [], III: [] }}
            machineSiderCounts={settings.machineSiderCounts}
            gaiterCounts={settings.gaiterCounts}
            assignWorker={assignWorkerToMachine}
            assignGaiter={assignGaiter}
            assignAiCone={assignAiCone}
            assignFitter={assignFitter}
            dates={Array.from(new Set([activeDailyReport.date, ...currentShedHistory.map(r => r.date)]))}
            selectedDate={activeDailyReport.date}
            onSelectDate={(date) => {
              const report = currentShedHistory.find(r => r.date === date);
              if (report) setDailyReport(report);
              else createBlankReport(date);
            }}
            onCopyAllocations={copyAllocationsFromReport}
            onChangeReportDate={changeReportDate}
            isSupervisorMode={isSupervisorMode}
          />
        );

      case 'month-view': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <MonthlyGrid
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            machineEm={machineEm}
            type="gps"
            selectedMonth={tvActiveMonth}
            selectedYear={tvActiveYear}
            onMonthChange={setSelectedMonth}
            onYearChange={setSelectedYear}
            isTvMode={isTvMode}
            onPagesDetermined={setSubPagesCount}
            tvPageInterval={settings.tvPageIntervals?.['month-view']}
            emHighLimit={settings.emHighLimit}
            frozenMonths={frozenMonths}
            onToggleFreezeMonth={handleToggleFreezeMonth}
            onEditDate={(date) => {
              const report = currentShedHistory.find(r => r.date === date);
              if (report) setDailyReport(report);
              else createBlankReport(date);
              setActiveTab('daily-incentive');
            }}
          />
        );
      }

      case 'ai-month-view': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <AiMonthlyGrid
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            selectedMonth={tvActiveMonth}
            selectedYear={tvActiveYear}
            onMonthChange={setSelectedMonth}
            onYearChange={setSelectedYear}
            isTvMode={isTvMode}
            frozenMonths={frozenMonths}
            onToggleFreezeMonth={handleToggleFreezeMonth}
            onEditDate={(date) => {
              const report = currentShedHistory.find(r => r.date === date);
              if (report) setDailyReport(report);
              else createBlankReport(date);
              setActiveTab('daily-incentive');
            }}
          />
        );
      }

      case 'month-abstract': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <MonthAbstract
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            month={tvActiveMonth}
            year={tvActiveYear}
            isTvMode={isTvMode}
            onPagesDetermined={setSubPagesCount}
            tvPageInterval={settings.tvPageIntervals?.['month-abstract']}
            frozenMonths={frozenMonths}
            onToggleFreezeMonth={handleToggleFreezeMonth}
          />
        );
      }

      case 'ai-month-abstract': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <AiMonthAbstract
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            month={tvActiveMonth}
            year={tvActiveYear}
            isTvMode={isTvMode}
            onPagesDetermined={setSubPagesCount}
            tvPageInterval={settings.tvPageIntervals?.['ai-month-abstract']}
            frozenMonths={frozenMonths}
            onToggleFreezeMonth={handleToggleFreezeMonth}
          />
        );
      }

      case 'incentive-ledger-report':
        return (
          <IncentiveLedgerReport
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            machineEm={machineEm}
            initialMonth={selectedMonth}
            initialYear={selectedYear}
            onEditDate={(date) => {
              const report = currentShedHistory.find(r => r.date === date);
              if (report) setDailyReport(report);
              else createBlankReport(date);
              setActiveTab('assignments');
            }}
          />
        );

      case 'sider-monthly-performance': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <SiderMonthlyPerformance
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            isTvMode={isTvMode}
            month={tvActiveMonth}
            year={tvActiveYear}
            machineEm={machineEm}
            tvPageInterval={settings.tvPageIntervals?.['sider-monthly-performance']}
            emHighLimit={settings.emHighLimit}
          />
        );
      }

      case 'operator-em-format': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <OperatorEmFormat
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            machineEm={machineEm}
            onUpdateMachineEm={async (newData, sheetUrl) => {
              setMachineEm(newData);
              await apiClient.saveMachineEm(newData);
              if (sheetUrl) {
                const nextSettings = {
                  ...settings,
                  machineEmGoogleSheetUrl: sheetUrl,
                  lastMachineEmSyncDate: new Date().toLocaleString()
                };
                setSettings(nextSettings);
                await apiClient.saveSettings(nextSettings);
              }
            }}
            settings={settings}
            isTvMode={isTvMode}
            month={tvActiveMonth}
            year={tvActiveYear}
            tvPageInterval={settings.tvPageIntervals?.['operator-em-format']}
            onPagesDetermined={setSubPagesCount}
          />
        );
      }

      case 'ai-monthly-performance': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <AiMonthlyPerformance
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            isTvMode={isTvMode}
            month={tvActiveMonth}
            year={tvActiveYear}
          />
        );
      }

      case 'fitter-monthly-performance': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <FitterMonthlyPerformance
            history={currentShedHistory}
            workers={workers}
            isTvMode={isTvMode}
            month={tvActiveMonth}
            year={tvActiveYear}
            onUpdateReport={(updatedReport) => {
              setReportHistory(prev => prev.map(r => r.date === updatedReport.date && (r.shed || 'Shed 1') === selectedShed ? updatedReport : r));
              if (dailyReport.date === updatedReport.date) setDailyReport(updatedReport);
              apiClient.saveDailyReport(updatedReport).catch(() => {});
            }}
          />
        );
      }

      case 'running-count-incentives':
        return (
          <RunningCountIncentives
            rules={incentiveRules}
            isTvMode={isTvMode}
            report={activeDailyReport}
            history={currentShedHistory}
            onSelectDate={(date) => {
              const report = currentShedHistory.find(r => r.date === date);
              if (report) setDailyReport(report);
              else createBlankReport(date);
            }}
          />
        );

      case 'performance':
        return (
          <div className="bg-white p-8 rounded-3xl border border-stone-200">
            <h3 className="text-xl font-black uppercase text-stone-900 mb-6">Machine GPS & Efficiency Performance ({selectedShed})</h3>
            <PerformanceChart report={activeDailyReport} />
          </div>
        );

      case 'best-shift':
        return <BestShift report={activeDailyReport} workers={workers} rules={incentiveRules} isTvMode={isTvMode} />;

      case 'best': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <BestSider
            history={currentShedHistory}
            workers={workers}
            isTvMode={isTvMode}
            rules={incentiveRules}
            month={tvActiveMonth}
            year={tvActiveYear}
            showMonthOnTv={settings.tvShowBestSiderMonth !== false}
          />
        );
      }

      case 'best-operators-em': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <BestOperatorsEm
            history={currentShedHistory}
            workers={workers}
            rules={incentiveRules}
            machineEm={machineEm}
            isTvMode={isTvMode}
            month={tvActiveMonth}
            year={tvActiveYear}
          />
        );
      }

      case 'em-outliers-compare': {
        const tvActiveMonth = (isTvMode && settings.tvMonth && settings.tvMonth > 0) ? settings.tvMonth : selectedMonth;
        const tvActiveYear = (isTvMode && settings.tvYear && settings.tvYear > 0) ? settings.tvYear : selectedYear;
        return (
          <EmOutliersCompare
            history={currentShedHistory}
            workers={workers}
            machineEm={machineEm}
            isTvMode={isTvMode}
            month={tvActiveMonth}
            year={tvActiveYear}
          />
        );
      }

      case 'counts':
        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm gap-4">
              <div className="flex items-center gap-3">
                <Database size={18} className="text-emerald-600" />
                <div>
                  <h4 className="text-xs font-black text-stone-800 uppercase tracking-wider">Count Master Database (MongoDB Live)</h4>
                  <p className="text-[10px] text-stone-500 font-bold">🟢 Online Auto-Update Enabled (Changes sync instantly to MongoDB database)</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded-xl self-start sm:self-center">
                <CloudUpload size={12} /> Live MongoDB Sync Active
              </div>
            </div>
            <CountMaster
              conversions={countConversions}
              onSave={saveCountConversion}
              onDelete={deleteCountConversion}
            />
          </div>
        );

      case 'incentive-master':
        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm gap-4">
              <div className="flex items-center gap-3">
                <Database size={18} className="text-emerald-600" />
                <div>
                  <h4 className="text-xs font-black text-stone-800 uppercase tracking-wider">Incentive Master Database (MongoDB Live)</h4>
                  <p className="text-[10px] text-stone-500 font-bold">🟢 Online Auto-Update Enabled (Changes sync instantly to MongoDB database)</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded-xl self-start sm:self-center">
                <CloudUpload size={12} /> Live MongoDB Sync Active
              </div>
            </div>
            <IncentiveMaster
              rules={incentiveRules}
              onUpdate={updateIncentiveRulesOnline}
              countConversions={countConversions}
              onNavigateToMatrix={() => setActiveTab('running-count-incentives')}
              frozenMonths={frozenMonths}
              onToggleFreezeMonth={handleToggleFreezeMonth}
            />
          </div>
        );

      case 'workers':
        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm gap-4">
              <div className="flex items-center gap-3">
                <Database size={18} className="text-emerald-600" />
                <div>
                  <h4 className="text-xs font-black text-stone-800 uppercase tracking-wider">Employee Master Database (MongoDB Live)</h4>
                  <p className="text-[10px] text-stone-500 font-bold">🟢 Online Auto-Update Enabled (Changes sync instantly to MongoDB database)</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded-xl self-start sm:self-center">
                <CloudUpload size={12} /> Live MongoDB Sync Active
              </div>
            </div>
            <WorkerMaster
              workers={workers}
              onDelete={deleteWorker}
              onUpdate={updateWorker}
              onAdd={addWorker}
              onBulkDelete={bulkDeleteWorkers}
              onImportWorkers={importWorkers}
            />
          </div>
        );

      case 'machine-master':
        return (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-2xl shadow-sm gap-4">
              <div className="flex items-center gap-3">
                <Database size={18} className="text-emerald-600" />
                <div>
                  <h4 className="text-xs font-black text-stone-800 uppercase tracking-wider">Ring Frame Machine Master Registry</h4>
                  <p className="text-[10px] text-stone-500 font-bold">🟢 Active Hardware Configuration (Ring Frame Numbers, Counts & Crew Assignment)</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider rounded-xl self-start sm:self-center">
                <Wrench size={12} /> Machine Telemetry Active
              </div>
            </div>
            <MachineMaster
              machines={machines}
              onSaveMachine={saveMachine}
              onDeleteMachine={deleteMachine}
              onResetStandardMachines={resetStandardMachines}
              workers={workers}
              countConversions={countConversions}
            />
          </div>
        );

      case 'upload':
        return (
          <UploadSection
            initialShed={selectedShed}
            onUploadSuccess={async (reportOrReports) => {
              if (Array.isArray(reportOrReports)) {
                for (const r of reportOrReports) {
                  await apiClient.saveDailyReport(r);
                }
                const refreshed = await apiClient.fetchInitialData();
                if (refreshed.history) setReportHistory(refreshed.history);
                if (refreshed.dailyReport) setDailyReport(refreshed.dailyReport);
                alert(`Monthly statements uploaded and stored in MongoDB for ${reportOrReports[0]?.shed || selectedShed}!`);
              } else {
                await apiClient.saveDailyReport(reportOrReports);
                setDailyReport(reportOrReports);
                setReportHistory(prev => [
                  ...prev.filter(r => !(r.date === reportOrReports.date && (r.shed || 'Shed 1') === (reportOrReports.shed || selectedShed))),
                  reportOrReports
                ]);
                alert(`Daily Statement uploaded and stored in MongoDB for ${reportOrReports.shed || selectedShed}!`);
              }
              setActiveTab('dashboard');
            }}
            onWorkersUpdate={async (newWorkers) => {
              const updated = mergeDuplicateWorkers([...workers, ...newWorkers]);
              setWorkers(updated);
              await apiClient.saveWorkers(updated);
            }}
            onMachineEmUpdate={async (newEmData) => {
              const merged = { ...machineEm, ...newEmData };
              setMachineEm(merged);
              await apiClient.saveMachineEm(merged);
            }}
            countConversions={countConversions}
          />
        );

      case 'settings':
        return (
          <div className="bg-white p-10 rounded-[3rem] border border-stone-200 shadow-sm max-w-4xl mx-auto space-y-12">
            <div>
              <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tight mb-8">System Access</h2>
              <div className="p-8 bg-emerald-50 rounded-[2.5rem] border border-emerald-100 flex flex-col md:flex-row items-center justify-between gap-6">
                <div>
                  <h3 className="text-lg font-black text-emerald-900 uppercase tracking-tight">Supervisor Assignment Link</h3>
                  <p className="text-xs text-emerald-600 font-bold mt-1">Direct link for supervisors to access ONLY the machine allocation screen.</p>
                </div>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}${window.location.pathname}?view=supervisor`;
                    navigator.clipboard.writeText(url);
                    alert('Supervisor link copied to clipboard!');
                  }}
                  className="px-8 py-3 bg-emerald-700 text-white rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 hover:bg-emerald-800 transition-all shadow-lg shadow-emerald-700/20"
                >
                  <FileUp size={14} /> Copy Supervisor Link
                </button>
              </div>
            </div>

            <div>
              <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tight mb-8">Data Synchronization & Google Sheets</h2>
              <div className="space-y-6">
                <div className="p-6 bg-stone-50 rounded-2xl border border-stone-100">
                  <label className="block text-[11px] font-black text-stone-400 uppercase tracking-widest mb-4">Google Sheet URL</label>
                  <div className="flex gap-4">
                    <input
                      type="text"
                      className="flex-1 bg-white border border-stone-200 rounded-xl px-4 py-3 text-sm font-bold"
                      value={settings.googleSheetUrl}
                      onChange={(e) => setSettings(prev => ({ ...prev, googleSheetUrl: e.target.value }))}
                    />
                    <button
                      onClick={syncData}
                      className="px-6 py-3 bg-stone-900 text-white rounded-xl font-black uppercase text-[10px] tracking-widest flex items-center gap-2 cursor-pointer"
                    >
                      <RefreshCw size={14} /> Sync Now
                    </button>
                  </div>
                </div>

                {/* WhatsApp Dispatch Section */}
                <div className="p-6 bg-white rounded-2xl border border-stone-200 space-y-4">
                  <h4 className="text-sm font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                    <MessageSquare size={18} className="text-emerald-600" /> WhatsApp Notifications & Dispatch
                  </h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                      <div>
                        <div className="text-xs font-bold">1. Daily Production Statement</div>
                        <div className="text-[10px] text-stone-400 font-bold">{settings.whatsAppProdPhone}</div>
                      </div>
                      <button
                        onClick={() => {
                          const phone = (settings.whatsAppProdPhone || '+919944711575').replace(/[^0-9+]/g, '');
                          const url = `https://api.whatsapp.com/send?phone=${phone}&text=${generateWhatsAppMessage(dailyReport)}`;
                          window.open(url, '_blank');
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                      >
                        <Play size={10} /> Send Now
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                      <div>
                        <div className="text-xs font-bold">2. Daily EM Statement</div>
                        <div className="text-[10px] text-stone-400 font-bold">{settings.whatsAppEmPhone}</div>
                      </div>
                      <button
                        onClick={() => {
                          const phone = (settings.whatsAppEmPhone || '+919944711575').replace(/[^0-9+]/g, '');
                          const url = `https://api.whatsapp.com/send?phone=${phone}&text=${generateEmStatementMessage(dailyReport)}`;
                          window.open(url, '_blank');
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                      >
                        <Play size={10} /> Send Now
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-stone-50 rounded-xl">
                      <div>
                        <div className="text-xs font-bold">3. Daily Incentive Ledger</div>
                        <div className="text-[10px] text-stone-400 font-bold">{settings.whatsAppIncentivePhone}</div>
                      </div>
                      <button
                        onClick={() => {
                          const phone = (settings.whatsAppIncentivePhone || '+919944711575').replace(/[^0-9+]/g, '');
                          const url = `https://api.whatsapp.com/send?phone=${phone}&text=${generateIncentiveStatementMessage(dailyReport)}`;
                          window.open(url, '_blank');
                        }}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer"
                      >
                        <Play size={10} /> Send Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Shift Gaiter Allocation */}
            <div>
              <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tight mb-8">Shift Gaiter Allocation</h2>
              <div className="p-10 bg-amber-50 rounded-[3rem] border border-amber-100 grid grid-cols-1 md:grid-cols-3 gap-8">
                {(['I', 'II', 'III'] as Shift[]).map(shift => (
                  <div key={shift} className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm">
                    <div className="flex items-center gap-3 mb-6 border-b border-amber-50 pb-4">
                      <Zap size={18} className="text-amber-500" />
                      <h4 className="text-sm font-black text-amber-900 uppercase tracking-widest">Shift {shift} Gaiters</h4>
                    </div>
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          const current = settings.gaiterCounts?.[shift] || 1;
                          if (current > 0) {
                            const updated = { ...settings, gaiterCounts: { ...settings.gaiterCounts, [shift]: current - 1 } };
                            setSettings(updated);
                            apiClient.saveSettings(updated);
                          }
                        }}
                        className="w-10 h-10 rounded-xl bg-amber-100/50 border border-amber-200 flex items-center justify-center text-amber-700 font-black cursor-pointer"
                      >
                        -
                      </button>
                      <span className="text-3xl font-black text-amber-900 tabular-nums">{settings.gaiterCounts?.[shift] ?? 1}</span>
                      <button
                        onClick={() => {
                          const current = settings.gaiterCounts?.[shift] || 1;
                          if (current < 5) {
                            const updated = { ...settings, gaiterCounts: { ...settings.gaiterCounts, [shift]: current + 1 } };
                            setSettings(updated);
                            apiClient.saveSettings(updated);
                          }
                        }}
                        className="w-10 h-10 rounded-xl bg-amber-100/50 border border-amber-200 flex items-center justify-center text-amber-700 font-black cursor-pointer"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Machine Configuration: Sides per Machine (LH & RH Allocation) */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tight">Machine Configuration</h2>
                  <p className="text-xs text-stone-500 font-bold uppercase tracking-wider mt-1">Spinning Frame Operator &amp; Side Allotment Master</p>
                </div>
              </div>

              <div className="p-8 sm:p-10 bg-gradient-to-b from-blue-50/70 via-indigo-50/40 to-slate-50/70 rounded-[3rem] border border-blue-200/80 shadow-xs">
                {/* Header Row */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-blue-100">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Activity size={18} className="text-blue-600" />
                      <h3 className="text-base sm:text-lg font-black text-blue-950 uppercase tracking-wider">
                        Sides Per Machine (LH &amp; RH Allocation)
                      </h3>
                    </div>
                    <p className="text-xs text-blue-900/80 font-medium leading-relaxed italic">
                      All machines default to 2 sides: LH and RH. Same sider on both sides earns 100% full machine incentive. Sider on 1 side earns 50%.
                    </p>
                  </div>

                  {/* Quick Action Buttons */}
                  <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                    <button
                      onClick={() => setAllMachinesSides(2)}
                      className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-2xl text-xs font-black uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                    >
                      <Check size={13} className="text-blue-300" />
                      <span>2 Sides / Machine (LH &amp; RH)</span>
                    </button>
                    <button
                      onClick={() => setAllMachinesSides(1)}
                      className="px-3.5 py-2 bg-white hover:bg-blue-50 text-blue-900 border border-blue-200/80 rounded-2xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                    >
                      <span>1 Side / Machine</span>
                    </button>
                  </div>
                </div>

                {/* Grid of Machine Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 gap-3.5 sm:gap-4 mt-8">
                  {configurableMachines.map(rfNo => {
                    const currentSides = settings.machineSiderCounts?.[rfNo] !== undefined 
                      ? settings.machineSiderCounts[rfNo] 
                      : 2;

                    return (
                      <div
                        key={rfNo}
                        className="bg-white rounded-2xl p-4 border border-blue-100/90 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between group"
                      >
                        {/* Card Top: Pulse icon, RF No, Badge */}
                        <div className="flex items-center justify-between gap-1 mb-4 pb-2 border-b border-blue-50">
                          <div className="flex items-center gap-1.5">
                            <Activity size={14} className="text-blue-600 animate-pulse" />
                            <span className="font-black text-stone-900 text-xs sm:text-sm tracking-tight">{rfNo}</span>
                          </div>
                          <span
                            className={cn(
                              "text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md tracking-wider transition-colors",
                              currentSides === 2 
                                ? "bg-blue-100 text-blue-800 border border-blue-200/60"
                                : currentSides === 1
                                ? "bg-stone-100 text-stone-700 border border-stone-200/60"
                                : "bg-purple-100 text-purple-800 border border-purple-200/60"
                            )}
                          >
                            {currentSides === 2 ? 'LH+RH' : currentSides === 1 ? 'LH' : `${currentSides} SIDES`}
                          </span>
                        </div>

                        {/* Stepper Control */}
                        <div className="flex items-center justify-between gap-2 my-2 px-1">
                          <button
                            onClick={() => updateMachineSides(rfNo, currentSides - 1)}
                            disabled={currentSides <= 1}
                            className={cn(
                              "w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm transition-all",
                              currentSides <= 1
                                ? "bg-stone-100 text-stone-300 border border-stone-200 cursor-not-allowed"
                                : "bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 active:scale-90 cursor-pointer shadow-2xs"
                            )}
                          >
                            -
                          </button>

                          <div className="text-center">
                            <span className="text-2xl sm:text-3xl font-black text-blue-950 tabular-nums block leading-none">
                              {currentSides}
                            </span>
                            <span className="text-[9px] font-black uppercase tracking-wider text-blue-700/70 mt-1 block">
                              {currentSides === 2 ? 'LH & RH' : currentSides === 1 ? 'LH ONLY' : `${currentSides} Sides`}
                            </span>
                          </div>

                          <button
                            onClick={() => updateMachineSides(rfNo, currentSides + 1)}
                            disabled={currentSides >= 3}
                            className={cn(
                              "w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm transition-all",
                              currentSides >= 3
                                ? "bg-stone-100 text-stone-300 border border-stone-200 cursor-not-allowed"
                                : "bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 active:scale-90 cursor-pointer shadow-2xs"
                            )}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Footer Note */}
                <div className="mt-8 pt-5 border-t border-blue-100/80 flex items-center justify-center gap-2 text-center text-blue-900/70 text-xs font-bold uppercase tracking-wider">
                  <Monitor size={14} className="text-blue-600 shrink-0" />
                  <span>Adjust how many operators are assigned to one spinning frame. Defaults to 2 sides (LH &amp; RH).</span>
                </div>
              </div>
            </div>

            {/* Backup & Recovery */}
            <div>
              <h2 className="text-3xl font-black text-stone-900 uppercase tracking-tight mb-2">MongoDB Backup & Recovery</h2>
              <div className="p-8 bg-amber-50 rounded-[2.5rem] border border-amber-200 grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                <div className="p-6 bg-white rounded-2xl border border-amber-100 shadow-sm flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-black text-amber-900 uppercase tracking-widest mb-2">Export Current Database</h4>
                    <p className="text-xs text-stone-500 font-semibold mb-6">Download full JSON snapshot from MongoDB.</p>
                  </div>
                  <button
                    onClick={downloadBackup}
                    className="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Database size={14} /> Export JSON Backup
                  </button>
                </div>

                <div className="p-6 bg-white rounded-2xl border border-stone-200 shadow-sm flex flex-col justify-between">
                  <div>
                    <h4 className="text-sm font-black text-stone-900 uppercase tracking-widest mb-2">Import / Restore Backup</h4>
                    <p className="text-xs text-stone-500 font-semibold mb-6">Upload JSON file to restore into MongoDB.</p>
                  </div>
                  <label className="w-full py-3 bg-stone-900 hover:bg-black text-white rounded-xl font-black uppercase text-xs tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-md">
                    <FileUp size={14} /> Import JSON Backup
                    <input type="file" accept=".json" className="hidden" onChange={handleImportJSON} />
                  </label>
                </div>
              </div>
            </div>

            {/* Danger Zone */}
            <div className="p-10 bg-red-50 rounded-[3rem] border border-red-100 border-dashed">
              <h2 className="text-2xl font-black text-red-900 uppercase tracking-tight mb-2">Danger Zone</h2>
              <p className="text-[10px] font-bold text-red-700/60 uppercase tracking-widest mb-8">Database Operations</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <button
                  onClick={clearAllWorkers}
                  className="flex flex-col items-start gap-4 p-6 bg-white rounded-2xl border border-red-200 hover:bg-red-50 transition-all text-left cursor-pointer"
                >
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                    <Users size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-stone-900 uppercase tracking-widest">Delete Worker Master</h4>
                    <p className="text-[10px] text-stone-400 font-bold mt-1 uppercase tracking-tight">Clear all employees from MongoDB</p>
                  </div>
                </button>

                <button
                  onClick={clearAllHistory}
                  className="flex flex-col items-start gap-4 p-6 bg-white rounded-2xl border border-red-200 hover:bg-red-50 transition-all text-left cursor-pointer"
                >
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center text-red-600">
                    <Trash2 size={20} />
                  </div>
                  <div>
                    <h4 className="text-sm font-black text-stone-900 uppercase tracking-widest">Clear Incentive History</h4>
                    <p className="text-[10px] text-stone-400 font-bold mt-1 uppercase tracking-tight">Wipe all daily reports & historical incentives</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-row h-screen overflow-hidden">
        {/* Left Sidebar Navigation */}
        {!isTvMode && !isSupervisorMode && (
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onTvMode={() => setIsTvMode(true)}
            onSeedData={seedHistoricalData}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(prev => !prev)}
          />
        )}

        {/* Right Main Content Column */}
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          {/* Top Utility Header Bar */}
          {!isTvMode && !isSupervisorMode && (
            <header className="bg-white border-b border-stone-200/80 px-4 h-14 flex items-center justify-between no-print shadow-xs z-30 shrink-0 gap-3">
              {/* Left Section: SCM & Tab name when sidebar is closed (hidden when sidebar is open) */}
              <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                {isSidebarCollapsed && (
                  <div className="flex flex-col min-w-0 transition-all duration-300">
                    <span className="font-serif italic text-lg font-black tracking-tight text-stone-900 leading-none">
                      SCM
                    </span>
                    <span className="text-[11px] font-bold text-stone-700 mt-0.5 truncate">
                      {navItems.find(item => item.id === activeTab)?.label || activeTab}
                    </span>
                  </div>
                )}
              </div>

              {/* Center Section: Horizontal Slide Bar for Shed 1, Shed 2, Shed 3 */}
              <div className="flex-1 flex justify-center px-2">
                <div className="inline-flex items-center bg-stone-100/90 p-1 rounded-2xl border border-stone-200/90 shadow-2xs">
                  {(['Shed 1', 'Shed 2', 'Shed 3'] as const).map(shed => {
                    const isSelected = selectedShed === shed;
                    return (
                      <button
                        key={shed}
                        onClick={() => setSelectedShed(shed)}
                        className={cn(
                          "relative px-3.5 py-1 rounded-xl text-xs transition-all duration-200 cursor-pointer flex items-center gap-1.5",
                          isSelected
                            ? "bg-emerald-600 text-white shadow-xs font-black"
                            : "text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 font-bold"
                        )}
                      >
                        <span className={cn("w-1.5 h-1.5 rounded-full transition-colors", isSelected ? "bg-white" : "bg-stone-400")} />
                        <span>{shed}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right Section: Plain today's date, Export/Import, TV mode */}
              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                {/* Plain Today's Date */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 bg-stone-100 text-stone-700 rounded-xl text-xs font-bold border border-stone-200/80 shrink-0">
                  <Calendar size={12} className="text-emerald-600" />
                  <span>{todayFormatted}</span>
                </div>

                <div className="h-4 w-px bg-stone-200 mx-0.5 hidden sm:block" />

                <button
                  onClick={() => setIsTvMode(true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-700 rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-emerald-100 transition-all border border-emerald-200 cursor-pointer shadow-2xs"
                >
                  <Monitor size={12} /> <span className="hidden sm:inline">TV Mode</span>
                </button>
              </div>
            </header>
          )}

          {isSupervisorMode && !isTvMode && (
            <header className="bg-white border-b border-stone-200 px-4 py-3 flex items-center justify-between no-print shadow-sm z-30 shrink-0">
              <div className="flex items-center gap-3">
                <h1 className="font-serif italic text-lg tracking-tight text-stone-900 leading-none">
                  Supervisor <span className="text-emerald-600">Access</span>
                </h1>
                <div className="px-2.5 py-0.5 bg-amber-100 text-amber-700 rounded-lg text-[9px] font-black uppercase tracking-widest border border-amber-200">
                  Machine Allocation Mode
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border bg-emerald-50 text-emerald-700 border-emerald-100">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[9px] font-black uppercase tracking-widest">Live MongoDB Syncing</span>
                </div>
                <button
                  onClick={() => {
                    setIsSupervisorMode(false);
                    window.history.replaceState({}, '', window.location.pathname);
                  }}
                  className="text-stone-400 hover:text-stone-900 text-[10px] font-black uppercase tracking-widest px-2 cursor-pointer"
                >
                  Exit
                </button>
              </div>
            </header>
          )}

          <main className="flex-1 overflow-y-auto">
            <div className={cn(isTvMode ? 'w-full h-full p-0 overflow-hidden' : 'w-full max-w-full p-2.5 md:p-3.5 lg:p-4.5 h-full relative')}>
              {!isSystemReady && (
                <div className="absolute inset-0 z-[100] bg-white flex flex-col items-center justify-center text-center p-10">
                  <div className="w-20 h-20 bg-stone-100 rounded-[2rem] flex items-center justify-center text-stone-300 mb-6 animate-pulse">
                    <RefreshCw size={40} className="animate-spin text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-black text-stone-900 uppercase tracking-tighter mb-2">Connecting to MongoDB</h2>
                  <p className="text-stone-400 font-bold uppercase tracking-[0.3em] text-[10px]">Loading Spinning Mill Data...</p>
                </div>
              )}

              {isTvMode && !tvStarted && isSystemReady && (
                <div className="absolute inset-0 z-[100] bg-stone-900 flex flex-col items-center justify-center text-center p-10">
                  <div className="w-24 h-24 bg-emerald-600 rounded-[2rem] flex items-center justify-center text-white mb-8 shadow-2xl shadow-emerald-500/20 animate-bounce">
                    <Gauge size={48} />
                  </div>
                  <h2 className="text-5xl font-black text-white uppercase tracking-tighter mb-4 italic">TV DASHBOARD READY</h2>
                  <p className="text-stone-400 font-bold uppercase tracking-[0.3em] mb-12 text-sm">Rotating Views with MongoDB Live Data</p>
                  <div className="flex flex-wrap items-center justify-center gap-4">
                    <button
                      onClick={() => {
                        setTvStarted(true);
                        try { document.documentElement.requestFullscreen(); } catch {}
                      }}
                      className="px-14 py-5 bg-white text-stone-900 rounded-2xl font-black uppercase tracking-widest text-base hover:bg-emerald-500 hover:text-white transition-all shadow-2xl active:scale-95 group flex items-center gap-4 cursor-pointer"
                    >
                      Start Live Monitoring
                      <Activity size={22} className="group-hover:rotate-12 transition-transform" />
                    </button>
                    <button
                      onClick={() => {
                        setIsTvMode(false);
                        setTvStarted(false);
                        setActiveTab('dashboard');
                      }}
                      className="px-8 py-5 bg-stone-800 text-stone-300 hover:text-white hover:bg-stone-700 rounded-2xl font-black uppercase tracking-widest text-base transition-all border border-stone-700 active:scale-95 flex items-center gap-2.5 cursor-pointer"
                    >
                      <ArrowLeft size={20} />
                      Back to Dashboard
                    </button>
                  </div>
                </div>
              )}

              {/* Floating Back to Dashboard Button & Shed Selector in TV Mode */}
              {isTvMode && (
                <>
                  <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] no-print">
                    <div className="flex items-center bg-stone-900/90 p-1.5 rounded-2xl border border-stone-700/80 shadow-2xl backdrop-blur-md gap-1">
                      {(['Shed 1', 'Shed 2', 'Shed 3'] as const).map(shed => {
                        const isSelected = selectedShed === shed;
                        return (
                          <button
                            key={shed}
                            onClick={() => setSelectedShed(shed)}
                            className={cn(
                              "px-4 py-2 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-2",
                              isSelected
                                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/30 scale-105"
                                : "text-stone-300 hover:text-white hover:bg-stone-800 font-bold"
                            )}
                          >
                            <span className={cn("w-2 h-2 rounded-full", isSelected ? "bg-white" : "bg-stone-500")} />
                            {shed}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="fixed top-5 right-5 z-[9999] no-print">
                    <button
                      onClick={() => {
                        setIsTvMode(false);
                        setTvStarted(false);
                        setActiveTab('dashboard');
                        try {
                          if (document.fullscreenElement) {
                            document.exitFullscreen();
                          }
                        } catch {}
                      }}
                      className="flex items-center gap-2.5 px-5 py-3 bg-stone-900/90 hover:bg-black text-white rounded-2xl font-black uppercase tracking-widest text-xs shadow-2xl backdrop-blur-md border border-stone-700/80 hover:scale-105 active:scale-95 transition-all cursor-pointer group"
                      title="Exit TV Mode & Return to Dashboard"
                    >
                      <ArrowLeft size={16} className="text-emerald-400 group-hover:-translate-x-1 transition-transform" />
                      <span>Back to Dashboard</span>
                    </button>
                  </div>
                </>
              )}

              <AnimatePresence mode="wait">
                <div key={activeTab} className={cn(isTvMode && 'h-full')}>
                  {renderContent()}
                </div>
              </AnimatePresence>
            </div>
          </main>
        </div>

        {/* Sync Result Feedback Alert Modal */}
        <AnimatePresence>
          {syncResultModal && syncResultModal.show && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[999] no-print">
              <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} className="bg-white rounded-[2.5rem] max-w-md w-full shadow-2xl border border-stone-200 overflow-hidden">
                <div className={cn('p-8 flex items-center gap-4 text-white', syncResultModal.success ? 'bg-emerald-600' : 'bg-red-600')}>
                  <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center shrink-0">
                    {syncResultModal.success ? <Check size={28} className="text-white stroke-[3.5]" /> : <AlertTriangle size={28} className="text-white stroke-[3.5]" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-black uppercase tracking-wider">{syncResultModal.title}</h3>
                    <p className="text-[10px] font-bold opacity-80 uppercase tracking-widest mt-0.5">MongoDB Database Action</p>
                  </div>
                </div>
                <div className="p-8 space-y-6">
                  <p className="text-sm font-bold text-stone-700 leading-relaxed">{syncResultModal.message}</p>
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => setSyncResultModal(null)}
                      className={cn(
                        'px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest text-white transition-all shadow-md active:scale-95 cursor-pointer',
                        syncResultModal.success ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
                      )}
                    >
                      OK, Got It!
                    </button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ErrorBoundary>
  );
}
