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
import { MachineMaster, STANDARD_12_MACHINES, ALL_STANDARD_MACHINES, STANDARD_MACHINES_BY_SHED } from '@/components/MachineMaster';
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
import { Sidebar, ALL_NAV_ITEMS } from '@/components/Sidebar';
import { MasterDataTable } from '@/components/MasterDataTable';
import { TvDashboard, TV_MAIN_PAGES } from '@/components/TvDashboard';

import { DailyReport, Sider, IncentiveRule, Shift, CountConversion, SystemSettings, ProductionEntry, FrameDailySummary, MachineEmData, FrozenMonthRecord, MachineMasterItem, Shed } from '@/types';
import { getMonthKey, computeFrozenMonthRecord } from '@/lib/frozenMonths';
import { cn, mergeDuplicateWorkers, calculateIncentive, getGaiterIncentive, resolveWorker, parseUniversalDate, parseUniversalDateParts, normalizeToCanonicalDate, generateUUID } from '@/lib/utils';
import { apiClient } from '@/lib/api';
import { ensureSixMachines, mockData, createDefaultReportForShed, getTodayUniversalDate } from '@/lib/parser';
import { CalendarDatePicker, CalendarMonthPicker } from '@/components/CalendarPickers';
import { syncFromGoogleSheet, syncMachineEmFromGoogleSheet } from '@/lib/googleSheets';

import { motion, AnimatePresence } from 'motion/react';
import {
  Calendar, Gauge, Activity, RefreshCw, Database, Trash2, UserCheck, Users,
  LayoutDashboard, FileUp, Settings, TrendingUp, Coins, Trophy, BarChart3,
  Monitor, Zap, Star, AlertTriangle, X, CloudUpload, Loader2, Grid3X3,
  FileText, Check, MessageSquare, Play, Wrench, RotateCcw, History, Menu,
  ArrowLeft, Table, Search
} from 'lucide-react';

const DEFAULT_COUNT_CONVERSIONS: CountConversion[] = [
  // Shed 1 Counts (Matching Mill Standards & User Screenshot)
  { count: '030/1-PH-PC', multiplicationFactor: 0.539, description: '30/1 Poly Hosiery PC Yarn', shed: 'Shed 1' },
  { count: '040/1-PH-PC', multiplicationFactor: 0.803, description: '40/1 Poly Hosiery PC Yarn', shed: 'Shed 1' },
  { count: '34/1-PH-PV', multiplicationFactor: 0.54, description: '34/1 Poly Viscose Yarn', shed: 'Shed 1' },
  { count: '042/1-CH-NY', multiplicationFactor: 0.7235, description: '42/1 Comb Hosiery NY', shed: 'Shed 1' },
  { count: '038/1-CH-NY', multiplicationFactor: 0.6641, description: '38/1 Comb Hosiery NY', shed: 'Shed 1' },
  { count: '034/1-PH-PC', multiplicationFactor: 0.54, description: 'Auto-imported count (034/1-PH-PC)', shed: 'Shed 1' },
  
  // Shed 2 Counts
  { count: '32/1-CH-CY', multiplicationFactor: 0.7155, description: '32/1 Comb Hosiery Compact Weft', shed: 'Shed 2' },
  { count: '34/1CHY-OCY', multiplicationFactor: 0.7836, description: '34/1 Comb Hosiery Compact Compact', shed: 'Shed 2' },
  { count: '30/1CH', multiplicationFactor: 0.6495, description: '30/1 Comb Hosiery', shed: 'Shed 2' },
  { count: '20/1-CW-WVG', multiplicationFactor: 0.3536, description: '20/1 Carded Weft Weaving', shed: 'Shed 2' },
  
  // Shed 3 Counts
  { count: '26/1-CHY', multiplicationFactor: 0.585, description: '26/1 Comb Hosiery Yarn', shed: 'Shed 3' },
  { count: '40s', multiplicationFactor: 1.0, description: '40s Standard Count', shed: 'Shed 3' },

  // KTTM Counts
  { count: '60s CW', multiplicationFactor: 1.837, description: '60s Combed Warp', shed: 'KTTM' },
  { count: '40s', multiplicationFactor: 1.0, description: 'Default 40s Standard Count', shed: 'KTTM' },

  // Universal / All Sheds
  { count: '40s', multiplicationFactor: 1.0, description: 'Default 40s Standard Count', shed: 'All Sheds' }
];

const DEFAULT_INCENTIVE_RULES: IncentiveRule[] = [
  // Shed 1 Rules
  {
    count: '030/1-PH-PC',
    department: 'Sider',
    shed: 'Shed 1',
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
    count: '040/1-PH-PC',
    department: 'Sider',
    shed: 'Shed 1',
    payouts: [
      { gpsThreshold: 160, amount: 100, fromGps: 160, toGps: 160, conditionText: 'for GPSS 160', ruleText: 'Rs 100 for GPSS 160' },
      { gpsThreshold: 155, amount: 90, fromGps: 155, toGps: 160, conditionText: 'for GPS 155 to 160', ruleText: 'Rs 90 for GPS 155 to 160' },
      { gpsThreshold: 150, amount: 80, fromGps: 150, toGps: 155, conditionText: 'for 150 to 155', ruleText: 'Rs 80 for 150 to 155' },
      { gpsThreshold: 145, amount: 70, fromGps: 145, toGps: 150, conditionText: 'for 145 to 150', ruleText: 'Rs 70 for 145 to 150' },
      { gpsThreshold: 140, amount: 60, fromGps: 140, toGps: 145, conditionText: 'for 140 to 145', ruleText: 'Rs 60 for 140 to 145' },
      { gpsThreshold: 135, amount: 50, fromGps: 135, toGps: 140, conditionText: 'for 135 to 140', ruleText: 'Rs 50 for 135 to 140' }
    ]
  },
  {
    count: '34/1-PH-PV',
    department: 'Sider',
    shed: 'Shed 1',
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
    count: '042/1-CH-NY',
    department: 'Sider',
    shed: 'Shed 1',
    payouts: [
      { gpsThreshold: 150, amount: 100, fromGps: 150, toGps: 150, conditionText: 'for GPSS 150', ruleText: 'Rs 100 for GPSS 150' },
      { gpsThreshold: 145, amount: 90, fromGps: 145, toGps: 150, conditionText: 'for 145 to 150', ruleText: 'Rs 90 for 145 to 150' },
      { gpsThreshold: 140, amount: 80, fromGps: 140, toGps: 145, conditionText: 'for 140 to 145', ruleText: 'Rs 80 for 140 to 145' },
      { gpsThreshold: 135, amount: 70, fromGps: 135, toGps: 140, conditionText: 'for 135 to 140', ruleText: 'Rs 70 for 135 to 140' }
    ]
  },
  {
    count: '038/1-CH-NY',
    department: 'Sider',
    shed: 'Shed 1',
    payouts: [
      { gpsThreshold: 160, amount: 100, fromGps: 160, toGps: 160, conditionText: 'for GPSS 160', ruleText: 'Rs 100 for GPSS 160' },
      { gpsThreshold: 155, amount: 90, fromGps: 155, toGps: 160, conditionText: 'for 155 to 160', ruleText: 'Rs 90 for 155 to 160' },
      { gpsThreshold: 150, amount: 80, fromGps: 150, toGps: 155, conditionText: 'for 150 to 155', ruleText: 'Rs 80 for 150 to 155' }
    ]
  },
  {
    count: '034/1-PH-PC',
    department: 'Sider',
    shed: 'Shed 1',
    payouts: [
      { gpsThreshold: 180, amount: 100, fromGps: 180, toGps: 180, conditionText: 'for GPSS 180', ruleText: 'Rs 100 for GPSS 180' },
      { gpsThreshold: 175, amount: 90, fromGps: 175, toGps: 180, conditionText: 'for 175 to 180', ruleText: 'Rs 90 for 175 to 180' },
      { gpsThreshold: 170, amount: 80, fromGps: 170, toGps: 175, conditionText: 'for 170 to 175', ruleText: 'Rs 80 for 170 to 175' }
    ]
  },
  {
    count: '40s',
    department: 'Sider',
    shed: 'Shed 1',
    payouts: [
      { gpsThreshold: 140, amount: 100, fromGps: 140, toGps: 140, conditionText: 'for GPSS 140', ruleText: 'Rs 100 for GPSS 140' },
      { gpsThreshold: 135, amount: 90, fromGps: 135, toGps: 140, conditionText: 'for GPS 135 to 140', ruleText: 'Rs 90 for GPS 135 to 140' },
      { gpsThreshold: 130, amount: 80, fromGps: 130, toGps: 135, conditionText: 'for 130 to 135', ruleText: 'Rs 80 for 130 to 135' },
      { gpsThreshold: 125, amount: 70, fromGps: 125, toGps: 130, conditionText: 'for 125 to 130', ruleText: 'Rs 70 for 125 to 130' },
      { gpsThreshold: 120, amount: 60, fromGps: 120, toGps: 125, conditionText: 'for 120 to 125', ruleText: 'Rs 60 for 120 to 125' },
      { gpsThreshold: 115, amount: 50, fromGps: 115, toGps: 120, conditionText: 'for 115 to 120', ruleText: 'Rs 50 for 115 to 120' }
    ]
  },

  // Shed 2 Rules
  {
    count: '32/1-CH-CY',
    department: 'Sider',
    shed: 'Shed 2',
    payouts: [
      { gpsThreshold: 240, amount: 110, fromGps: 240, toGps: 240, conditionText: 'for GPSS 240', ruleText: 'Rs 110 for GPSS 240' },
      { gpsThreshold: 235, amount: 95, fromGps: 235, toGps: 240, conditionText: 'for 235 to 240', ruleText: 'Rs 95 for 235 to 240' },
      { gpsThreshold: 230, amount: 90, fromGps: 230, toGps: 235, conditionText: 'for 230 to 235', ruleText: 'Rs 90 for 230 to 235' },
      { gpsThreshold: 225, amount: 85, fromGps: 225, toGps: 230, conditionText: 'for 225 to 230', ruleText: 'Rs 85 for 225 to 230' },
      { gpsThreshold: 220, amount: 80, fromGps: 220, toGps: 225, conditionText: 'for 220 to 225', ruleText: 'Rs 80 for 220 to 225' },
      { gpsThreshold: 210, amount: 60, fromGps: 210, toGps: 220, conditionText: 'for 210 to 220', ruleText: 'Rs 60 for 210 to 220' }
    ]
  },
  {
    count: '34/1CHY-OCY',
    department: 'Sider',
    shed: 'Shed 2',
    payouts: [
      { gpsThreshold: 230, amount: 110, fromGps: 230, toGps: 230, conditionText: 'for GPSS 230', ruleText: 'Rs 110 for GPSS 230' },
      { gpsThreshold: 220, amount: 95, fromGps: 220, toGps: 230, conditionText: 'for 220 to 230', ruleText: 'Rs 95 for 220 to 230' },
      { gpsThreshold: 210, amount: 90, fromGps: 210, toGps: 220, conditionText: 'for 210 to 220', ruleText: 'Rs 90 for 210 to 220' },
      { gpsThreshold: 205, amount: 85, fromGps: 205, toGps: 210, conditionText: 'for 205 to 210', ruleText: 'Rs 85 for 205 to 210' },
      { gpsThreshold: 200, amount: 80, fromGps: 200, toGps: 205, conditionText: 'for 200 to 205', ruleText: 'Rs 80 for 200 to 205' },
      { gpsThreshold: 190, amount: 60, fromGps: 190, toGps: 200, conditionText: 'for 190 to 200', ruleText: 'Rs 60 for 190 to 200' }
    ]
  },
  {
    count: '30/1CH',
    department: 'Sider',
    shed: 'Shed 2',
    payouts: [
      { gpsThreshold: 385, amount: 110, fromGps: 385, toGps: 385, conditionText: 'for GPSS 385', ruleText: 'Rs 110 for GPSS 385' },
      { gpsThreshold: 375, amount: 100, fromGps: 375, toGps: 385, conditionText: 'for 375 to 385', ruleText: 'Rs 100 for 375 to 385' },
      { gpsThreshold: 365, amount: 95, fromGps: 365, toGps: 375, conditionText: 'for 365 to 375', ruleText: 'Rs 95 for 365 to 375' },
      { gpsThreshold: 355, amount: 90, fromGps: 355, toGps: 365, conditionText: 'for 355 to 365', ruleText: 'Rs 90 for 355 to 365' },
      { gpsThreshold: 345, amount: 85, fromGps: 345, toGps: 355, conditionText: 'for 345 to 355', ruleText: 'Rs 85 for 345 to 355' },
      { gpsThreshold: 335, amount: 80, fromGps: 335, toGps: 345, conditionText: 'for 335 to 345', ruleText: 'Rs 80 for 335 to 345' }
    ]
  },
  {
    count: '20/1-CW-WVG',
    department: 'Sider',
    shed: 'Shed 2',
    payouts: [
      { gpsThreshold: 385, amount: 110, fromGps: 385, toGps: 385, conditionText: 'for GPSS 385', ruleText: 'Rs 110 for GPSS 385' },
      { gpsThreshold: 365, amount: 95, fromGps: 365, toGps: 385, conditionText: 'for 365 to 385', ruleText: 'Rs 95 for 365 to 385' },
      { gpsThreshold: 345, amount: 85, fromGps: 345, toGps: 365, conditionText: 'for 345 to 365', ruleText: 'Rs 85 for 345 to 365' },
      { gpsThreshold: 325, amount: 70, fromGps: 325, toGps: 345, conditionText: 'for 325 to 345', ruleText: 'Rs 70 for 325 to 345' },
      { gpsThreshold: 310, amount: 60, fromGps: 310, toGps: 325, conditionText: 'for 310 to 325', ruleText: 'Rs 60 for 310 to 325' }
    ]
  },

  // Shed 3 Rules
  {
    count: '26/1-CHY',
    department: 'Sider',
    shed: 'Shed 3',
    payouts: [
      { gpsThreshold: 320, amount: 120, fromGps: 320, toGps: 320, conditionText: 'for GPSS 320', ruleText: 'Rs 120 for GPSS 320' },
      { gpsThreshold: 315, amount: 115, fromGps: 315, toGps: 320, conditionText: 'for 315 to 320', ruleText: 'Rs 115 for 315 to 320' },
      { gpsThreshold: 310, amount: 110, fromGps: 310, toGps: 315, conditionText: 'for 310 to 315', ruleText: 'Rs 110 for 310 to 315' },
      { gpsThreshold: 305, amount: 100, fromGps: 305, toGps: 310, conditionText: 'for 305 to 310', ruleText: 'Rs 100 for 305 to 310' },
      { gpsThreshold: 300, amount: 90, fromGps: 300, toGps: 305, conditionText: 'for 300 to 305', ruleText: 'Rs 90 for 300 to 305' },
      { gpsThreshold: 295, amount: 80, fromGps: 295, toGps: 300, conditionText: 'for 295 to 300', ruleText: 'Rs 80 for 295 to 300' }
    ]
  },
  {
    count: '40s',
    department: 'Sider',
    shed: 'Shed 3',
    payouts: [
      { gpsThreshold: 140, amount: 100, fromGps: 140, toGps: 140, conditionText: 'for GPSS 140', ruleText: 'Rs 100 for GPSS 140' },
      { gpsThreshold: 135, amount: 90, fromGps: 135, toGps: 140, conditionText: 'for 135 to 140', ruleText: 'Rs 90 for 135 to 140' },
      { gpsThreshold: 130, amount: 80, fromGps: 130, toGps: 135, conditionText: 'for 130 to 135', ruleText: 'Rs 80 for 130 to 135' }
    ]
  },

  // KTTM Rules
  {
    count: '60s CW',
    department: 'Sider',
    shed: 'KTTM',
    payouts: [
      { gpsThreshold: 120, amount: 110, fromGps: 120, toGps: 120, conditionText: 'for GPSS 120', ruleText: 'Rs 110 for GPSS 120' },
      { gpsThreshold: 115, amount: 95, fromGps: 115, toGps: 120, conditionText: 'for 115 to 120', ruleText: 'Rs 95 for 115 to 120' },
      { gpsThreshold: 110, amount: 85, fromGps: 110, toGps: 115, conditionText: 'for 110 to 115', ruleText: 'Rs 85 for 110 to 115' },
      { gpsThreshold: 105, amount: 75, fromGps: 105, toGps: 110, conditionText: 'for 105 to 110', ruleText: 'Rs 75 for 105 to 110' }
    ]
  },
  {
    count: '40s',
    department: 'Sider',
    shed: 'KTTM',
    payouts: [
      { gpsThreshold: 140, amount: 100, fromGps: 140, toGps: 140, conditionText: 'for GPSS 140', ruleText: 'Rs 100 for GPSS 140' },
      { gpsThreshold: 135, amount: 90, fromGps: 135, toGps: 140, conditionText: 'for 135 to 140', ruleText: 'Rs 90 for 135 to 140' }
    ]
  },

  // Universal Gaiter Rule
  {
    count: 'All',
    department: 'Gaiter',
    shed: 'All Sheds',
    payouts: [
      { gpsThreshold: 340, amount: 90, fromGps: 340, toGps: 340, conditionText: 'for GPSS 340', ruleText: 'Rs 90 for GPSS 340' },
      { gpsThreshold: 320, amount: 70, fromGps: 320, toGps: 340, conditionText: 'for 320 to 340', ruleText: 'Rs 70 for 320 to 340' },
      { gpsThreshold: 300, amount: 50, fromGps: 300, toGps: 320, conditionText: 'for 300 to 320', ruleText: 'Rs 50 for 300 to 320' }
    ]
  }
];

const DEFAULT_WORKERS: Sider[] = [];

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
    return [];
  });
  const [incentiveRules, setIncentiveRules] = useState<IncentiveRule[]>(DEFAULT_INCENTIVE_RULES);
  const [countConversions, setCountConversions] = useState<CountConversion[]>(DEFAULT_COUNT_CONVERSIONS);
  const [dailyReport, setDailyReport] = useState<DailyReport>(mockData);
  const [reportHistory, setReportHistory] = useState<DailyReport[]>([]);
  const [selectedShed, setSelectedShed] = useState<Shed>('Shed 1');

  const currentShedHistory = useMemo(() => {
    return reportHistory.filter(r => (r.shed || 'Shed 1') === selectedShed);
  }, [reportHistory, selectedShed]);

  const currentShedWorkers = useMemo(() => {
    return workers.filter(w => !w.shed || w.shed === selectedShed);
  }, [workers, selectedShed]);

  const currentShedMachines = useMemo(() => {
    return machines.filter(m => !m.shed || m.shed === selectedShed);
  }, [machines, selectedShed]);


  const activeDailyReport = useMemo(() => {
    // 1. If dailyReport belongs to selected shed, use it
    if (dailyReport && (dailyReport.shed || 'Shed 1') === selectedShed) {
      return dailyReport;
    }

    // 2. Check if a report for dailyReport.date exists in selected shed
    const targetDate = dailyReport?.date || getTodayUniversalDate();
    const sameDateMatch = currentShedHistory.find(r => r.date === targetDate);
    if (sameDateMatch) return sameDateMatch;

    // 3. If target date is today, check if current shed history has a report for today
    const todayStr = getTodayUniversalDate();
    if (targetDate === todayStr) {
      const todayMatch = currentShedHistory.find(r => r.date === todayStr);
      if (todayMatch) return todayMatch;
    }

    // 4. Fresh report for selected shed and targetDate
    return createDefaultReportForShed(selectedShed, targetDate);
  }, [dailyReport, selectedShed, currentShedHistory]);

  const availableReportDates = useMemo(() => {
    const dateSet = new Set<string>();
    if (activeDailyReport?.date) dateSet.add(activeDailyReport.date);
    currentShedHistory.forEach(r => {
      if (r.date) dateSet.add(r.date);
    });
    dateSet.add(getTodayUniversalDate());

    return Array.from(dateSet).filter(Boolean).sort((a, b) => {
      const pA = a.split('/').map(Number);
      const pB = b.split('/').map(Number);
      if (pA.length === 3 && pB.length === 3) {
        const timeA = new Date(pA[2], pA[1] - 1, pA[0]).getTime();
        const timeB = new Date(pB[2], pB[1] - 1, pB[0]).getTime();
        return timeB - timeA;
      }
      return b.localeCompare(a);
    });
  }, [activeDailyReport?.date, currentShedHistory]);

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
    machineSiderCounts: {},
    gaiterCounts: { I: 1, II: 1, III: 1 },
    tvShowBestSiderMonth: true,
    emHighLimit: 4,
    whatsAppProdPhone: '+919944711575',
    whatsAppEmPhone: '+919944711575',
    whatsAppIncentivePhone: '+919944711575',
    tvSlideIntervals: {
      'overview': 15,
      'charts': 20,
      'table': 20,
      'top-workers': 15,
      'champions': 15,
      'sheds': 15,
      'shift-comparison': 20,
      'monthly': 15,
      'running-counts': 20,
      'daily-incentive': 20,
      'monthly-report': 20
    },
    tvSlideEnabled: {
      'overview': true,
      'charts': true,
      'table': true,
      'top-workers': true,
      'champions': true,
      'sheds': true,
      'shift-comparison': true,
      'monthly': true,
      'running-counts': true,
      'daily-incentive': true,
      'monthly-report': true
    },
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
      'em-outliers-compare': 15,
      'sheds': 20,
      'shift-comparison': 20
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

  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    type: 'all' | 'month' | 'workers';
    title: string;
    description: string;
    targetInfo?: string;
    isProcessing?: boolean;
  }>({
    isOpen: false,
    type: 'all',
    title: '',
    description: ''
  });

  const [syncResultModal, setSyncResultModal] = useState<{ show: boolean; title: string; message: string; success: boolean } | null>(null);
  const [whatsAppToast, setWhatsAppToast] = useState<{ show: boolean; url: string; phone: string } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Settings Machine Configuration filter state
  const [settingsMachineShed, setSettingsMachineShed] = useState<string>('All');
  const [settingsMachineSearch, setSettingsMachineSearch] = useState<string>('');

  // Load Initial Data from MongoDB
  useEffect(() => {
    async function loadData() {
      try {
        const data = await apiClient.fetchInitialData();
        const loadedHistory = data.history && data.history.length > 0 ? data.history : [];
        const loadedWorkers = data.workers && data.workers.length > 0 ? data.workers : [];
        const loadedMachineEm = data.machineEm || {};

        setWorkers(loadedWorkers);
        setMachineEm(loadedMachineEm);
        setReportHistory(loadedHistory);

        if (data.dailyReport) setDailyReport(ensureSixMachines(data.dailyReport));
        if (data.machines && data.machines.length > 0) {
          setMachines(data.machines);
          if (typeof window !== 'undefined') {
            localStorage.setItem('spinning_machines', JSON.stringify(data.machines));
          }
        }
        if (data.rules && data.rules.length > 0) setIncentiveRules(data.rules);
        if (data.counts && data.counts.length > 0) setCountConversions(data.counts);
        if (data.settings) {
          setSettings(prev => ({ 
            ...prev, 
            ...data.settings,
            gaiterCounts: {
              I: data.settings.gaiterCounts?.I ?? 1,
              II: data.settings.gaiterCounts?.II ?? 1,
              III: 1
            }
          }));
        }
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


  // Manual Sync to MongoDB
  const forceSync = async () => {
    setIsManualSyncing(true);
    setSaveStatus('saving');
    try {
      await Promise.all([
        apiClient.saveDailyReport(dailyReport),
        apiClient.saveReportHistory(reportHistory),
        apiClient.saveWorkers(workers),
        apiClient.saveMachines(machines),
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

  const createBlankReport = (date: string, silent = false) => {
    const existing = currentShedHistory.find(r => r.date === date);
    if (existing) {
      setDailyReport(existing);
      return;
    }

    const newReport: DailyReport = createDefaultReportForShed(selectedShed, date);

    setReportHistory(prev => [...prev.filter(r => !(r.date === date && (r.shed || 'Shed 1') === selectedShed)), newReport]);
    setDailyReport(newReport);
    apiClient.saveDailyReport(newReport).catch(() => {});
    if (!silent) {
      alert(`Blank report created for ${date} in ${selectedShed}`);
    }
  };

  const handleTopDateChange = (newDate: string) => {
    if (!newDate) return;
    const existing = currentShedHistory.find(r => r.date === newDate);
    if (existing) {
      setDailyReport(existing);
    } else {
      createBlankReport(newDate, true);
    }
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
    try {
      const newWorker: Sider = { ...worker, id: generateUUID() };
      const updated = [...workers, newWorker];
      setWorkers(updated);
      await apiClient.saveWorker(newWorker);
    } catch (err: any) {
      console.error('Error adding worker:', err);
      alert(`Error saving worker: ${err?.message || 'Unknown error'}`);
    }
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

  const saveMachine = async (machine: MachineMasterItem) => {
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
    await apiClient.saveMachine(machine);
  };

  const deleteMachine = async (id: string) => {
    setMachines(prev => {
      const updated = prev.filter(m => m.id !== id);
      if (typeof window !== 'undefined') {
        localStorage.setItem('spinning_machines', JSON.stringify(updated));
      }
      return updated;
    });
    await apiClient.deleteMachine(id);
  };

  const resetStandardMachines = async (shed?: string) => {
    let newMachines: MachineMasterItem[];
    if (shed) {
      newMachines = machines.filter(m => m.shed !== shed);
    } else {
      newMachines = [];
    }
    setMachines(newMachines);
    if (typeof window !== 'undefined') {
      localStorage.setItem('spinning_machines', JSON.stringify(newMachines));
    }
    await apiClient.saveMachines(newMachines);
    alert(shed ? `Cleared machines for ${shed}` : 'Cleared all machines');
  };

  const saveCountConversion = async (conv: CountConversion) => {
    const convShed = conv.shed || selectedShed || 'Shed 1';
    const cleanCount = conv.count.trim();
    const cleanConv: CountConversion = {
      ...conv,
      count: cleanCount,
      shed: convShed
    };
    setCountConversions(prev => {
      const filtered = prev.filter(c => !(
        c.count.trim().toLowerCase() === cleanCount.toLowerCase() &&
        (c.shed || 'Shed 1') === convShed
      ));
      return [...filtered, cleanConv];
    });
    await apiClient.saveCountConversion(cleanConv);
  };

  const deleteCountConversion = async (count: string, shed?: string) => {
    const targetShed = shed && shed !== 'All' && shed !== 'All Sheds' ? shed : undefined;
    const cleanCount = count.trim().toLowerCase();
    setCountConversions(prev => prev.filter(c => {
      if (c.count.trim().toLowerCase() !== cleanCount) return true;
      if (targetShed && (c.shed || 'Shed 1') !== targetShed) return true;
      return false;
    }));
    await apiClient.deleteCountConversion(count, targetShed);
  };

  const updateIncentiveRulesOnline = async (newRules: IncentiveRule[]) => {
    const fallbackShed = selectedShed || 'Shed 1';
    const seen = new Set<string>();
    const normalized: IncentiveRule[] = [];
    for (const r of newRules) {
      if (!r || !r.count) continue;
      const cleanCount = r.count.trim();
      const s = r.shed || fallbackShed;
      const d = r.department || 'Sider';
      const key = `${cleanCount.toLowerCase()}__${d.toLowerCase()}__${s.toLowerCase()}`;
      if (!seen.has(key)) {

        seen.add(key);
        normalized.push({
          ...r,
          count: cleanCount,
          shed: s,
          department: d
        });
      }
    }
    setIncentiveRules(normalized);
    await apiClient.saveRules(normalized);
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

  const availableYears = useMemo(() => {
    const yearSet = new Set<string>();
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 3; y <= currentYear + 2; y++) {
      yearSet.add(String(y));
    }
    reportHistory.forEach(r => {
      const parts = parseUniversalDateParts(r.date);
      if (parts && parts.year) yearSet.add(String(parts.year));
    });
    return Array.from(yearSet).sort((a, b) => Number(b) - Number(a));
  }, [reportHistory]);

  const promptDeleteAllData = () => {
    setDeleteConfirmModal({
      isOpen: true,
      type: 'all',
      title: 'Delete All Data',
      description: 'Are you sure you want to delete ALL historical records? This will permanently wipe all daily production entries, machine statistics, and incentive records across all sheds.',
      targetInfo: 'Entire historical database (All Sheds & All Months)'
    });
  };

  const promptDeleteMonthData = () => {
    const monthName = getClearMonthName(clearMonth);
    setDeleteConfirmModal({
      isOpen: true,
      type: 'month',
      title: 'Delete Monthly Data',
      description: `Are you sure you want to delete all historical records for ${monthName} ${clearYear}? Only reports belonging to this specific month and year will be deleted.`,
      targetInfo: `Target Period: ${monthName} ${clearYear} (${clearMonth}/${clearYear})`
    });
  };

  const promptDeleteWorkers = () => {
    setDeleteConfirmModal({
      isOpen: true,
      type: 'workers',
      title: 'Delete Worker Master',
      description: 'Are you sure you want to delete ALL employee records? This will remove all worker profiles, verification photos, and machine assignments from the database.',
      targetInfo: `Total Staff: ${workers.length} registered employees`
    });
  };

  const executeConfirmedDelete = async () => {
    setDeleteConfirmModal(prev => ({ ...prev, isProcessing: true }));
    try {
      if (deleteConfirmModal.type === 'all') {
        setReportHistory([]);
        await apiClient.clearAllHistory();
        setDeleteConfirmModal(prev => ({ ...prev, isOpen: false, isProcessing: false }));
        setSyncResultModal({
          show: true,
          title: 'All Data Cleared',
          message: 'All daily reports and incentive history records have been permanently cleared from MongoDB.',
          success: true
        });
      } else if (deleteConfirmModal.type === 'month') {
        await apiClient.clearMonthData(clearMonth, clearYear);
        const targetMonth = Number(clearMonth);
        const targetYear = Number(clearYear);
        setReportHistory(prev => prev.filter(r => {
          const parts = parseUniversalDateParts(r.date);
          return !(parts && parts.month === targetMonth && parts.year === targetYear);
        }));
        const refreshed = await apiClient.fetchInitialData();
        if (refreshed.history) setReportHistory(refreshed.history);
        setDeleteConfirmModal(prev => ({ ...prev, isOpen: false, isProcessing: false }));
        setSyncResultModal({
          show: true,
          title: 'Month Data Cleared',
          message: `All records for ${getClearMonthName(clearMonth)} ${clearYear} have been deleted from MongoDB.`,
          success: true
        });
      } else if (deleteConfirmModal.type === 'workers') {
        setWorkers([]);
        await apiClient.clearAllWorkers();
        setDeleteConfirmModal(prev => ({ ...prev, isOpen: false, isProcessing: false }));
        setSyncResultModal({
          show: true,
          title: 'Workers Cleared',
          message: 'All worker master profiles have been removed from MongoDB.',
          success: true
        });
      }
    } catch (err: any) {
      alert(`Delete operation failed: ${err?.message || 'Unknown error'}`);
      setDeleteConfirmModal(prev => ({ ...prev, isProcessing: false }));
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

  const updateTvSubPageDuration = (subId: string, seconds: number) => {
    const updated: SystemSettings = {
      ...settings,
      tvPageIntervals: {
        ...(settings.tvPageIntervals || {}),
        [subId]: Math.max(0, seconds)
      },
      tvSlideIntervals: {
        ...(settings.tvSlideIntervals || {}),
        [subId]: Math.max(0, seconds)
      },
      tvSlideEnabled: {
        ...(settings.tvSlideEnabled || {}),
        [subId]: seconds > 0
      }
    };
    setSettings(updated);
    apiClient.saveSettings(updated).catch(() => {});
  };

  const toggleTvSubPageEnabled = (subId: string, defaultSecs: number) => {
    const configuredSecs = settings.tvPageIntervals?.[subId] ?? settings.tvSlideIntervals?.[subId];
    const isCurrentlyEnabled = settings.tvSlideEnabled?.[subId] !== false && (configuredSecs === undefined || configuredSecs > 0);
    const newSecs = isCurrentlyEnabled ? 0 : (configuredSecs && configuredSecs > 0 ? configuredSecs : Math.max(5, defaultSecs || 15));
    updateTvSubPageDuration(subId, newSecs);
  };

  const setAllTvSubPagesDuration = (seconds: number) => {
    const newPageIntervals = { ...(settings.tvPageIntervals || {}) };
    const newSlideIntervals = { ...(settings.tvSlideIntervals || {}) };
    const newSlideEnabled = { ...(settings.tvSlideEnabled || {}) };

    TV_MAIN_PAGES.forEach(main => {
      main.subPages.forEach(sub => {
        newPageIntervals[sub.id] = seconds;
        newSlideIntervals[sub.id] = seconds;
        newSlideEnabled[sub.id] = seconds > 0;
      });
    });

    const updated: SystemSettings = {
      ...settings,
      tvInterval: seconds,
      tvSubInterval: seconds,
      tvPageIntervals: newPageIntervals,
      tvSlideIntervals: newSlideIntervals,
      tvSlideEnabled: newSlideEnabled
    };
    setSettings(updated);
    apiClient.saveSettings(updated).catch(() => {});
  };

  const resetTvTimingsToDefault = () => {
    const newPageIntervals: Record<string, number> = {};
    const newSlideIntervals: Record<string, number> = {};
    const newSlideEnabled: Record<string, boolean> = {};

    TV_MAIN_PAGES.forEach(main => {
      main.subPages.forEach(sub => {
        newPageIntervals[sub.id] = sub.defaultSeconds;
        newSlideIntervals[sub.id] = sub.defaultSeconds;
        newSlideEnabled[sub.id] = sub.defaultSeconds > 0;
      });
    });

    const updated: SystemSettings = {
      ...settings,
      tvInterval: 15,
      tvSubInterval: 5,
      tvPageIntervals: newPageIntervals,
      tvSlideIntervals: newSlideIntervals,
      tvSlideEnabled: newSlideEnabled
    };
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
            className="space-y-3.5 pb-6 relative"
          >
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

            {/* KPI Strip */}
            <div className="relative z-10 shrink-0">
              <KPIStats report={activeDailyReport} isTvMode={false} lastSyncDate={settings.lastSyncDate} />
            </div>

            {/* Machine GPS & Efficiency Performance */}
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-stone-200 shadow-sm relative z-10 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-5 border-b border-stone-100 gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
                    <Gauge size={22} />
                  </div>
                  <div>
                    <h3 className="text-lg md:text-xl font-black uppercase text-stone-900 tracking-tight">
                      Machine GPS & Efficiency Performance <span className="text-emerald-600 font-serif italic text-base">({selectedShed})</span>
                    </h3>
                    <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest mt-0.5">
                      Gram Per Spindle (GPS) & Production Efficiency Monitoring
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-3.5 py-1 bg-stone-100 text-stone-700 rounded-xl text-xs font-black border border-stone-200">
                    Date: {activeDailyReport.date}
                  </span>
                </div>
              </div>
              <PerformanceChart report={activeDailyReport} />
            </div>
          </motion.div>
        );

      case 'all-data':
        return (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 pb-16">
            <MasterDataTable
              report={activeDailyReport}
              workers={currentShedWorkers}
              rules={incentiveRules}
              isTvMode={isTvMode}
              onSelectDate={handleTopDateChange}
              availableDates={availableReportDates}
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
            workers={currentShedWorkers}
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
            onSelectDate={handleTopDateChange}
            onChangeReportDate={changeReportDate}
          />
        );

      case 'daily-incentive-machine':
        return (
          <MachineDailyIncentive
            report={activeDailyReport}
            workers={currentShedWorkers}
            rules={incentiveRules}
            isTvMode={isTvMode}
            onSelectDate={handleTopDateChange}
            machineSiderCounts={settings.machineSiderCounts}
          />
        );

      case 'assignments':
        return (
          <MachineAssignment
            workers={currentShedWorkers}
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
            dates={availableReportDates}
            selectedDate={activeDailyReport.date}
            onSelectDate={handleTopDateChange}
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
            workers={currentShedWorkers}
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
            workers={currentShedWorkers}
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
            workers={currentShedWorkers}
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
            workers={currentShedWorkers}
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
            workers={currentShedWorkers}
            rules={incentiveRules}
            machineEm={machineEm}
            initialMonth={selectedMonth}
            initialYear={selectedYear}
            onEditDate={(date) => {
              handleTopDateChange(date);
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
            workers={currentShedWorkers}
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
            workers={currentShedWorkers}
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
            workers={currentShedWorkers}
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
            workers={currentShedWorkers}
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
            onSelectDate={handleTopDateChange}
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
        return <BestShift report={activeDailyReport} workers={currentShedWorkers} rules={incentiveRules} isTvMode={isTvMode} />;

      case 'best':
        return (
          <BestSider
            history={currentShedHistory}
            workers={currentShedWorkers}
            isTvMode={isTvMode}
            rules={incentiveRules}
            month={selectedMonth}
            year={selectedYear}
            showMonthOnTv={settings.tvShowBestSiderMonth !== false}
          />
        );

      case 'best-operators-em':
        return (
          <BestOperatorsEm
            history={currentShedHistory}
            workers={currentShedWorkers}
            rules={incentiveRules}
            machineEm={machineEm}
            isTvMode={isTvMode}
            month={selectedMonth}
            year={selectedYear}
          />
        );

      case 'em-outliers-compare':
        return (
          <EmOutliersCompare
            history={currentShedHistory}
            workers={currentShedWorkers}
            machineEm={machineEm}
            isTvMode={isTvMode}
            month={selectedMonth}
            year={selectedYear}
          />
        );

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
              currentShed={selectedShed}
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
              currentShed={selectedShed}
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
              currentShed={selectedShed}
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
              currentShed={selectedShed}
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
                let hasEm = false;
                let mergedEm = { ...machineEm };
                for (const r of reportOrReports) {
                  await apiClient.saveDailyReport(r);
                  if (r.emData) {
                    Object.entries(r.emData).forEach(([dStr, mData]) => {
                      mergedEm[dStr] = { ...(mergedEm[dStr] || {}), ...mData };
                    });
                    hasEm = true;
                  }
                }
                if (hasEm) {
                  setMachineEm(mergedEm);
                  await apiClient.saveMachineEm(mergedEm);
                }
                const refreshed = await apiClient.fetchInitialData();
                if (refreshed.history) setReportHistory(refreshed.history);
                if (refreshed.dailyReport) setDailyReport(refreshed.dailyReport);
                const distinctSheds = Array.from(new Set(reportOrReports.map(r => r.shed))).filter(Boolean);
                alert(`Data successfully uploaded and stored in MongoDB for ${distinctSheds.length > 1 ? distinctSheds.join(', ') : (reportOrReports[0]?.shed || selectedShed)}!`);
              } else {
                await apiClient.saveDailyReport(reportOrReports);
                if (reportOrReports.emData) {
                  const mergedEm = { ...machineEm };
                  Object.entries(reportOrReports.emData).forEach(([dStr, mData]) => {
                    mergedEm[dStr] = { ...(mergedEm[dStr] || {}), ...mData };
                  });
                  setMachineEm(mergedEm);
                  await apiClient.saveMachineEm(mergedEm);
                }
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
          <div className="bg-white p-6 sm:p-10 rounded-[3rem] border border-stone-200 shadow-sm max-w-5xl mx-auto space-y-10">
            {/* System Settings Header & Save Action */}
            <div className="bg-stone-50/70 p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-emerald-500/10 border border-emerald-300 text-emerald-700 rounded-2xl flex items-center justify-center shrink-0">
                    <Settings size={22} className="text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-stone-900 uppercase tracking-tight">
                      System & Mill Settings
                    </h3>
                    <p className="text-xs text-stone-500 font-bold mt-0.5">
                      Configure crew allocations, automated alerts, and Google Sheets integrations
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      try {
                        await apiClient.saveSettings(settings);
                        alert('System settings have been successfully saved and updated to MongoDB!');
                      } catch {
                        alert('Failed to save settings. Please check your MongoDB connection.');
                      }
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-md shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <Check size={16} />
                    <span>Save & Update Settings</span>
                  </button>
                </div>
              </div>
            </div>

            {/* TV Dashboard Pages & Sub-Pages Rotation Timing Configuration */}
            <div className="bg-stone-50/70 p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xs space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-emerald-500/10 border border-emerald-300 text-emerald-700 rounded-2xl flex items-center justify-center shrink-0">
                    <Monitor size={22} className="text-emerald-600" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-stone-900 uppercase tracking-tight">
                      TV Dashboard Pages & Sub-Pages Rotation Timing
                    </h3>
                    <p className="text-xs text-stone-500 font-bold mt-0.5">
                      Configure rotation duration (in seconds) for each of the {TV_MAIN_PAGES.length} Main Chapters and {TV_MAIN_PAGES.reduce((acc, m) => acc + m.subPages.length, 0)} Sub-Pages, or toggle views on/off
                    </p>
                  </div>
                </div>

                {/* Preset Timing Buttons */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setAllTvSubPagesDuration(10)}
                    className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                    title="Set all active views to 10 seconds"
                  >
                    Fast (10s)
                  </button>
                  <button
                    onClick={() => setAllTvSubPagesDuration(15)}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                    title="Set all active views to standard 15 seconds"
                  >
                    Standard (15s)
                  </button>
                  <button
                    onClick={() => setAllTvSubPagesDuration(25)}
                    className="px-3 py-1.5 bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-2xs"
                    title="Set all active views to 25 seconds"
                  >
                    Detailed (25s)
                  </button>
                  <button
                    onClick={resetTvTimingsToDefault}
                    className="px-3 py-1.5 bg-stone-100 hover:bg-stone-200 text-stone-700 border border-stone-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shadow-2xs"
                    title="Reset all views to factory default seconds"
                  >
                    <RotateCcw size={12} /> Defaults
                  </button>
                </div>
              </div>

              {/* TV Broadcast Controls & Target Month Selection */}
              <div className="bg-white p-5 rounded-2xl border border-stone-200/90 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-stone-400 block mb-1">
                      TV Target Month
                    </label>
                    <select
                      value={settings.tvMonth || 9}
                      onChange={(e) => {
                        const updated = { ...settings, tvMonth: Number(e.target.value) };
                        setSettings(updated);
                        apiClient.saveSettings(updated).catch(() => {});
                      }}
                      className="text-xs bg-stone-50 border border-stone-200 text-stone-800 font-bold px-3 py-1.5 rounded-xl cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((mName, idx) => (
                        <option key={mName} value={idx + 1}>
                          {mName}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-black uppercase text-stone-400 block mb-1">
                      TV Target Year
                    </label>
                    <select
                      value={settings.tvYear || 2026}
                      onChange={(e) => {
                        const updated = { ...settings, tvYear: Number(e.target.value) };
                        setSettings(updated);
                        apiClient.saveSettings(updated).catch(() => {});
                      }}
                      className="text-xs bg-stone-50 border border-stone-200 text-stone-800 font-bold px-3 py-1.5 rounded-xl cursor-pointer focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      {[2024, 2025, 2026, 2027, 2028].map(yr => (
                        <option key={yr} value={yr}>
                          {yr}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Cycle Summary Calculations */}
                {(() => {
                  let totalSecs = 0;
                  let activeSubCount = 0;
                  let activeChapterCount = 0;

                  TV_MAIN_PAGES.forEach(main => {
                    let chapterHasActive = false;
                    main.subPages.forEach(sub => {
                      const configured = settings.tvPageIntervals?.[sub.id] ?? settings.tvSlideIntervals?.[sub.id];
                      const isEnabled = settings.tvSlideEnabled?.[sub.id] !== false && (configured === undefined ? sub.defaultSeconds > 0 : configured > 0);
                      const secs = configured !== undefined ? configured : sub.defaultSeconds;
                      if (isEnabled && secs > 0) {
                        totalSecs += secs;
                        activeSubCount++;
                        chapterHasActive = true;
                      }
                    });
                    if (chapterHasActive) activeChapterCount++;
                  });

                  const mins = Math.floor(totalSecs / 60);
                  const remSecs = totalSecs % 60;

                  return (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-black uppercase tracking-wider">
                        {activeChapterCount} / {TV_MAIN_PAGES.length} Chapters Active
                      </span>
                      <span className="px-3 py-1.5 rounded-xl bg-blue-50 text-blue-800 border border-blue-200 text-xs font-black uppercase tracking-wider">
                        {activeSubCount} / {TV_MAIN_PAGES.reduce((acc, m) => acc + m.subPages.length, 0)} Sub-Pages Rotating
                      </span>
                      <span className="px-3 py-1.5 rounded-xl bg-stone-100 text-stone-900 border border-stone-300 text-xs font-black uppercase tracking-wider font-mono">
                        Cycle: {mins}m {remSecs}s
                      </span>
                    </div>
                  );
                })()}
              </div>

              {/* TV Chapters and Sub-Pages Timing Cards */}
              <div className="space-y-4">
                {TV_MAIN_PAGES.map((chapter) => {
                  const ChapterIcon = chapter.icon;
                  
                  // Compute total duration for this chapter
                  let chapterSecs = 0;
                  let activeSubsInChapter = 0;
                  chapter.subPages.forEach(sub => {
                    const configured = settings.tvPageIntervals?.[sub.id] ?? settings.tvSlideIntervals?.[sub.id];
                    const isEnabled = settings.tvSlideEnabled?.[sub.id] !== false && (configured === undefined ? sub.defaultSeconds > 0 : configured > 0);
                    const secs = configured !== undefined ? configured : sub.defaultSeconds;
                    if (isEnabled && secs > 0) {
                      chapterSecs += secs;
                      activeSubsInChapter++;
                    }
                  });

                  return (
                    <div
                      key={chapter.id}
                      className="bg-white rounded-2xl border border-stone-200 shadow-2xs overflow-hidden transition-all hover:border-stone-300"
                    >
                      {/* Chapter Bar */}
                      <div className="p-4 bg-stone-50/80 border-b border-stone-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-8 h-8 rounded-xl bg-white border border-stone-200 text-stone-700 text-xs font-black flex items-center justify-center shrink-0 shadow-2xs">
                            {chapter.chapterNumber}
                          </span>
                          <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0 shadow-2xs">
                            <ChapterIcon size={16} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-black text-stone-900 uppercase tracking-tight truncate">
                                {chapter.title}
                              </h4>
                            </div>
                            <p className="text-[11px] text-stone-400 font-bold truncate">
                              {chapter.subtitle}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <span className={cn(
                            "text-[10px] font-black uppercase px-2.5 py-1 rounded-lg border",
                            activeSubsInChapter > 0 
                              ? "bg-emerald-50 text-emerald-800 border-emerald-200" 
                              : "bg-stone-100 text-stone-500 border-stone-200"
                          )}>
                            {activeSubsInChapter} of {chapter.subPages.length} Sub-Pages Active
                          </span>
                          <span className="text-xs font-black px-2.5 py-1 rounded-lg bg-stone-100 text-stone-800 border border-stone-200 font-mono">
                            {chapterSecs}s total
                          </span>
                        </div>
                      </div>

                      {/* Sub-Pages Configuration List */}
                      <div className="divide-y divide-stone-100">
                        {chapter.subPages.map((sub, sIdx) => {
                          const configured = settings.tvPageIntervals?.[sub.id] ?? settings.tvSlideIntervals?.[sub.id];
                          const isEnabled = settings.tvSlideEnabled?.[sub.id] !== false && (configured === undefined ? sub.defaultSeconds > 0 : configured > 0);
                          const currentSecs = configured !== undefined ? configured : sub.defaultSeconds;

                          return (
                            <div
                              key={sub.id}
                              className={cn(
                                "p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors",
                                isEnabled ? "bg-white" : "bg-stone-50/60 opacity-60"
                              )}
                            >
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="w-6 h-6 rounded-lg bg-stone-100 text-stone-500 text-[10px] font-black flex items-center justify-center shrink-0">
                                  {chapter.chapterNumber}.{sIdx + 1}
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-black text-stone-900 uppercase tracking-tight">
                                      {sub.title}
                                    </span>
                                    <span className={cn(
                                      "text-[9px] font-black uppercase px-2 py-0.5 rounded-md",
                                      isEnabled ? "bg-emerald-100 text-emerald-800" : "bg-stone-200 text-stone-600"
                                    )}>
                                      {isEnabled ? `${currentSecs}s duration` : 'Disabled'}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-stone-400 font-medium mt-0.5 truncate max-w-lg">
                                    {sub.description}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-3 shrink-0 self-end md:self-auto">
                                {/* Enable / Disable Toggle */}
                                <button
                                  onClick={() => toggleTvSubPageEnabled(sub.id, sub.defaultSeconds)}
                                  className={cn(
                                    "px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-2xs",
                                    isEnabled
                                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                      : "bg-stone-200 text-stone-600 hover:bg-stone-300 border border-stone-300"
                                  )}
                                  title={isEnabled ? "Disable this sub-page from rotation" : "Enable this sub-page in rotation"}
                                >
                                  {isEnabled ? <Check size={12} /> : <X size={12} />}
                                  <span>{isEnabled ? 'Enabled' : 'Disabled'}</span>
                                </button>

                                {/* Seconds Stepper */}
                                <div className="flex items-center gap-1 bg-stone-50 p-1 rounded-xl border border-stone-200">
                                  <button
                                    onClick={() => updateTvSubPageDuration(sub.id, Math.max(5, currentSecs - 5))}
                                    disabled={!isEnabled || currentSecs <= 5}
                                    className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 font-black text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center shadow-2xs"
                                  >
                                    -5s
                                  </button>

                                  <div className="w-14 text-center">
                                    <span className="text-sm font-black text-stone-900 tabular-nums font-mono">
                                      {isEnabled ? `${currentSecs}s` : '0s'}
                                    </span>
                                  </div>

                                  <button
                                    onClick={() => updateTvSubPageDuration(sub.id, Math.min(120, (currentSecs || 5) + 5))}
                                    disabled={!isEnabled || currentSecs >= 120}
                                    className="w-8 h-8 rounded-lg bg-white border border-stone-200 text-stone-700 hover:bg-stone-100 font-black text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center shadow-2xs"
                                  >
                                    +5s
                                  </button>
                                </div>

                                {/* Quick Seconds Chips */}
                                <div className="hidden lg:flex items-center gap-1">
                                  {[10, 15, 20, 30].map(s => (
                                    <button
                                      key={s}
                                      onClick={() => updateTvSubPageDuration(sub.id, s)}
                                      disabled={!isEnabled}
                                      className={cn(
                                        "px-1.5 py-0.5 rounded text-[10px] font-black cursor-pointer transition-all",
                                        currentSecs === s && isEnabled
                                          ? "bg-emerald-600 text-white"
                                          : "bg-stone-100 text-stone-600 hover:bg-stone-200 disabled:opacity-40"
                                      )}
                                    >
                                      {s}s
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-stone-50/70 p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-200/80 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-amber-500/10 border border-amber-300 text-amber-700 rounded-2xl flex items-center justify-center shrink-0">
                    <Zap size={22} className="text-amber-600 fill-amber-500/20" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-stone-900 uppercase tracking-tight">
                      Shift Gaiter Crew Allocation
                    </h3>
                    <p className="text-xs text-stone-500 font-bold mt-0.5">
                      Configure standard number of gaiters deployed per shift for doff assistance and line continuity
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <span className="px-3.5 py-1.5 bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-black uppercase tracking-wider">
                    Total: {((settings.gaiterCounts?.I ?? 1) + (settings.gaiterCounts?.II ?? 1) + (settings.gaiterCounts?.III ?? 1))} Gaiters / Day
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
                {(['I', 'II', 'III'] as Shift[]).map(shift => {
                  const shiftName = shift === 'I' ? 'Shift I (Morning)' : shift === 'II' ? 'Shift II (Evening)' : 'Shift III (Night)';
                  const currentCount = settings.gaiterCounts?.[shift] ?? 1;

                  return (
                    <div
                      key={shift}
                      className="bg-white p-5 sm:p-6 rounded-2xl border border-stone-200/90 shadow-2xs hover:shadow-md hover:border-amber-300 transition-all flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-stone-100">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                          <h4 className="text-xs sm:text-sm font-black text-stone-800 uppercase tracking-wider">
                            {shiftName}
                          </h4>
                        </div>
                        <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-md bg-stone-100 text-stone-600 border border-stone-200">
                          {currentCount} Crew
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-4 py-2">
                        <button
                          onClick={() => {
                            if (currentCount > 0) {
                              const updated = {
                                ...settings,
                                gaiterCounts: { ...settings.gaiterCounts, [shift]: currentCount - 1 }
                              };
                              setSettings(updated);
                              apiClient.saveSettings(updated).catch(() => {});
                            }
                          }}
                          disabled={currentCount <= 0}
                          className={cn(
                            "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg transition-all",
                            currentCount <= 0
                              ? "bg-stone-100 text-stone-300 border border-stone-200 cursor-not-allowed"
                              : "bg-stone-100 hover:bg-amber-100 text-stone-800 hover:text-amber-900 border border-stone-200 active:scale-95 cursor-pointer shadow-2xs"
                          )}
                          title="Decrease gaiters"
                        >
                          -
                        </button>

                        <div className="text-center">
                          <span className="text-3xl sm:text-4xl font-black text-stone-900 tabular-nums block leading-none">
                            {currentCount}
                          </span>
                          <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 mt-1 block">
                            Allocated
                          </span>
                        </div>

                        <button
                          onClick={() => {
                            if (currentCount < 6) {
                              const updated = {
                                ...settings,
                                gaiterCounts: { ...settings.gaiterCounts, [shift]: currentCount + 1 }
                              };
                              setSettings(updated);
                              apiClient.saveSettings(updated).catch(() => {});
                            }
                          }}
                          disabled={currentCount >= 6}
                          className={cn(
                            "w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg transition-all",
                            currentCount >= 6
                              ? "bg-stone-100 text-stone-300 border border-stone-200 cursor-not-allowed"
                              : "bg-amber-600 hover:bg-amber-700 text-white border border-amber-600 active:scale-95 cursor-pointer shadow-sm shadow-amber-600/30"
                          )}
                          title="Increase gaiters"
                        >
                          +
                        </button>
                      </div>

                      <p className="text-[11px] text-stone-400 font-bold text-center mt-3 pt-2 border-t border-stone-100">
                        {currentCount === 0 ? 'No gaiter crew assigned' : `${currentCount} gaiter(s) earn pooled shift incentive`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Machine Configuration: Sides per Machine */}
            <div className="bg-stone-50/70 p-6 sm:p-8 rounded-3xl border border-stone-200 shadow-2xs space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200/80 pb-5">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 bg-blue-500/10 border border-blue-300 text-blue-700 rounded-2xl flex items-center justify-center shrink-0">
                    <Activity size={22} className="text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg sm:text-xl font-black text-stone-900 uppercase tracking-tight">
                      Machine Configuration & Side Allotments
                    </h3>
                    <p className="text-xs text-stone-500 font-bold mt-0.5">
                      Spinning Frame Operator & Side Allotment Master (LH & RH Allocation)
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setAllMachinesSides(2)}
                    className="px-3.5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                  >
                    <Check size={13} className="text-blue-300" />
                    <span>Set All 2 Sides (LH + RH)</span>
                  </button>
                  <button
                    onClick={() => setAllMachinesSides(1)}
                    className="px-3.5 py-2 bg-white hover:bg-stone-100 text-stone-800 border border-stone-300 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                  >
                    <span>Set All 1 Side</span>
                  </button>
                </div>
              </div>

              {/* Explanatory Banner */}
              <div className="bg-blue-50/80 border border-blue-200/70 rounded-2xl p-4 flex items-start gap-3">
                <Monitor size={18} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-950 font-medium leading-relaxed">
                  <strong>Standard Mill Rule:</strong> All frames default to 2 sides (Left Hand <code className="bg-white px-1 py-0.5 rounded border border-blue-200 font-mono text-[11px] font-bold">LH</code> & Right Hand <code className="bg-white px-1 py-0.5 rounded border border-blue-200 font-mono text-[11px] font-bold">RH</code>). Siders operating both sides receive 100% machine incentive. 1 side assignment earns 50%.
                </p>
              </div>

              {/* Shed Filter Tabs & Search Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="inline-flex p-1 bg-white border border-stone-200 rounded-2xl shadow-2xs gap-1">
                  {(['All', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'] as const).map(shedTab => {
                    const isSelected = settingsMachineShed === shedTab;
                    const countInTab = shedTab === 'All'
                      ? configurableMachines.length
                      : configurableMachines.filter(rf => {
                          const m = machines.find(x => x.rfNo === rf);
                          return (m?.shed || 'Shed 1') === shedTab;
                        }).length;

                    return (
                      <button
                        key={shedTab}
                        onClick={() => setSettingsMachineShed(shedTab)}
                        className={cn(
                          "px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer flex items-center gap-1.5",
                          isSelected
                            ? "bg-blue-600 text-white shadow-2xs"
                            : "text-stone-600 hover:text-stone-900 hover:bg-stone-100"
                        )}
                      >
                        <span>{shedTab}</span>
                        <span className={cn(
                          "px-1.5 py-0.5 rounded-md text-[10px]",
                          isSelected ? "bg-white/20 text-white" : "bg-stone-100 text-stone-500"
                        )}>
                          {countInTab}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="relative max-w-xs w-full">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                  <input
                    type="text"
                    placeholder="Search frame (e.g. SP023)..."
                    value={settingsMachineSearch}
                    onChange={(e) => setSettingsMachineSearch(e.target.value)}
                    className="w-full bg-white border border-stone-200 rounded-xl pl-9 pr-3 py-2 text-xs font-bold text-stone-800 placeholder-stone-400 outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Filtered Machine Cards Grid */}
              {(() => {
                const filtered = configurableMachines.filter(rfNo => {
                  const m = machines.find(x => x.rfNo === rfNo);
                  const mShed = m?.shed || 'Shed 1';
                  const matchesShed = settingsMachineShed === 'All' || mShed === settingsMachineShed;
                  const matchesSearch = !settingsMachineSearch || rfNo.toLowerCase().includes(settingsMachineSearch.toLowerCase());
                  return matchesShed && matchesSearch;
                });

                if (filtered.length === 0) {
                  return (
                    <div className="text-center py-12 bg-white rounded-2xl border border-stone-200">
                      <p className="text-sm font-bold text-stone-400">No spinning frames found matching filters.</p>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-4">
                    {filtered.map(rfNo => {
                      const m = machines.find(x => x.rfNo === rfNo);
                      const mShed = m?.shed || 'Shed 1';
                      const currentSides = settings.machineSiderCounts?.[rfNo] !== undefined 
                        ? settings.machineSiderCounts[rfNo] 
                        : 2;

                      return (
                        <div
                          key={rfNo}
                          className="bg-white rounded-2xl p-4 border border-stone-200 shadow-2xs hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between"
                        >
                          <div className="flex items-center justify-between gap-1 mb-3 pb-2 border-b border-stone-100">
                            <div>
                              <div className="font-black text-stone-900 text-sm tracking-tight">{rfNo}</div>
                              <span className="text-[9px] font-black uppercase text-stone-400">{mShed}</span>
                            </div>
                            <span
                              className={cn(
                                "text-[9px] font-black uppercase px-2 py-0.5 rounded-md tracking-wider",
                                currentSides === 2 
                                  ? "bg-blue-100 text-blue-800 border border-blue-200"
                                  : currentSides === 1
                                  ? "bg-stone-100 text-stone-700 border border-stone-200"
                                  : "bg-purple-100 text-purple-800 border border-purple-200"
                              )}
                            >
                              {currentSides === 2 ? 'LH + RH' : currentSides === 1 ? 'LH' : `${currentSides} SIDES`}
                            </span>
                          </div>

                          {/* Visual Side Pills */}
                          <div className="flex items-center justify-center gap-1.5 mb-3">
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors",
                              currentSides >= 1 ? "bg-blue-600 text-white" : "bg-stone-100 text-stone-400"
                            )}>
                              LH
                            </span>
                            <span className={cn(
                              "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider transition-colors",
                              currentSides >= 2 ? "bg-blue-600 text-white" : "bg-stone-100 text-stone-400"
                            )}>
                              RH
                            </span>
                            {currentSides >= 3 && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider bg-purple-600 text-white">
                                S3
                              </span>
                            )}
                          </div>

                          {/* Stepper Control */}
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-100">
                            <button
                              onClick={() => updateMachineSides(rfNo, currentSides - 1)}
                              disabled={currentSides <= 1}
                              className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm transition-all",
                                currentSides <= 1
                                  ? "bg-stone-100 text-stone-300 border border-stone-200 cursor-not-allowed"
                                  : "bg-stone-100 hover:bg-stone-200 text-stone-800 border border-stone-300 active:scale-90 cursor-pointer"
                              )}
                            >
                              -
                            </button>

                            <span className="text-xl font-black text-stone-900 tabular-nums">
                              {currentSides}
                            </span>

                            <button
                              onClick={() => updateMachineSides(rfNo, currentSides + 1)}
                              disabled={currentSides >= 3}
                              className={cn(
                                "w-8 h-8 rounded-xl flex items-center justify-center font-black text-sm transition-all",
                                currentSides >= 3
                                  ? "bg-stone-100 text-stone-300 border border-stone-200 cursor-not-allowed"
                                  : "bg-blue-600 hover:bg-blue-700 text-white active:scale-90 cursor-pointer shadow-xs"
                              )}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* WhatsApp Dispatch Section */}
            <div className="p-6 sm:p-8 bg-stone-50/70 rounded-3xl border border-stone-200 space-y-4">
              <h4 className="text-sm font-black text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                <MessageSquare size={18} className="text-emerald-600" /> WhatsApp Notifications & Dispatch
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-stone-200/80 shadow-2xs">
                  <div>
                    <div className="text-xs font-bold text-stone-800">1. Daily Production Statement</div>
                    <div className="text-[10px] text-stone-400 font-bold">{settings.whatsAppProdPhone}</div>
                  </div>
                  <button
                    onClick={() => {
                      const phone = (settings.whatsAppProdPhone || '+919944711575').replace(/[^0-9+]/g, '');
                      const url = `https://api.whatsapp.com/send?phone=${phone}&text=${generateWhatsAppMessage(dailyReport)}`;
                      window.open(url, '_blank');
                    }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:bg-emerald-700 transition-colors shadow-2xs"
                  >
                    <Play size={10} /> Send Now
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-stone-200/80 shadow-2xs">
                  <div>
                    <div className="text-xs font-bold text-stone-800">2. Daily EM Statement</div>
                    <div className="text-[10px] text-stone-400 font-bold">{settings.whatsAppEmPhone}</div>
                  </div>
                  <button
                    onClick={() => {
                      const phone = (settings.whatsAppEmPhone || '+919944711575').replace(/[^0-9+]/g, '');
                      const url = `https://api.whatsapp.com/send?phone=${phone}&text=${generateEmStatementMessage(dailyReport)}`;
                      window.open(url, '_blank');
                    }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:bg-emerald-700 transition-colors shadow-2xs"
                  >
                    <Play size={10} /> Send Now
                  </button>
                </div>

                <div className="flex items-center justify-between p-3.5 bg-white rounded-xl border border-stone-200/80 shadow-2xs">
                  <div>
                    <div className="text-xs font-bold text-stone-800">3. Daily Incentive Ledger</div>
                    <div className="text-[10px] text-stone-400 font-bold">{settings.whatsAppIncentivePhone}</div>
                  </div>
                  <button
                    onClick={() => {
                      const phone = (settings.whatsAppIncentivePhone || '+919944711575').replace(/[^0-9+]/g, '');
                      const url = `https://api.whatsapp.com/send?phone=${phone}&text=${generateIncentiveStatementMessage(dailyReport)}`;
                      window.open(url, '_blank');
                    }}
                    className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer hover:bg-emerald-700 transition-colors shadow-2xs"
                  >
                    <Play size={10} /> Send Now
                  </button>
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
            <div className="p-8 sm:p-10 bg-gradient-to-br from-red-50/90 via-rose-50/50 to-orange-50/30 rounded-3xl border-2 border-red-200/80 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-red-200/60">
                <div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-red-600 text-white flex items-center justify-center shadow-lg shadow-red-500/20">
                      <AlertTriangle size={20} />
                    </div>
                    <div>
                      <h2 className="text-xl sm:text-2xl font-black text-red-950 uppercase tracking-tight">Danger Zone</h2>
                      <p className="text-[11px] font-bold text-red-600 uppercase tracking-widest">Database Deletion Operations</p>
                    </div>
                  </div>
                </div>
                <span className="text-xs font-bold text-red-700 bg-red-100/80 px-3.5 py-1.5 rounded-full border border-red-200 self-start sm:self-auto flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Irreversible Actions
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. Delete Monthly Data */}
                <div className="bg-white rounded-2xl border-2 border-red-100 p-6 flex flex-col justify-between shadow-sm hover:border-red-300 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center border border-amber-200/60">
                        <Calendar size={20} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg">
                        Selective Month
                      </span>
                    </div>
                    <h4 className="text-base font-black text-stone-900 tracking-tight mb-1">Delete Particular Month</h4>
                    <p className="text-xs text-stone-500 mb-5">
                      Select a month and year to wipe only that period's production and incentive records.
                    </p>

                    <div className="space-y-3 mb-6 bg-stone-50 p-3.5 rounded-xl border border-stone-200">
                      <div>
                        <label className="text-[10px] font-black text-stone-500 uppercase tracking-wider block mb-1">Select Month</label>
                        <select
                          value={clearMonth}
                          onChange={(e) => setClearMonth(e.target.value)}
                          className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                        >
                          <option value="01">01 - January</option>
                          <option value="02">02 - February</option>
                          <option value="03">03 - March</option>
                          <option value="04">04 - April</option>
                          <option value="05">05 - May</option>
                          <option value="06">06 - June</option>
                          <option value="07">07 - July</option>
                          <option value="08">08 - August</option>
                          <option value="09">09 - September</option>
                          <option value="10">10 - October</option>
                          <option value="11">11 - November</option>
                          <option value="12">12 - December</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-black text-stone-500 uppercase tracking-wider block mb-1">Select Year</label>
                        <select
                          value={clearYear}
                          onChange={(e) => setClearYear(e.target.value)}
                          className="w-full bg-white border border-stone-300 rounded-lg px-3 py-2 text-xs font-bold text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500 cursor-pointer"
                        >
                          {availableYears.map(yr => (
                            <option key={yr} value={yr}>{yr}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={promptDeleteMonthData}
                    className="w-full py-3 px-4 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete {getClearMonthName(clearMonth)} Data
                  </button>
                </div>

                {/* 2. Delete All Data */}
                <div className="bg-white rounded-2xl border-2 border-red-200 p-6 flex flex-col justify-between shadow-sm hover:border-red-400 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-red-100 text-red-600 rounded-xl flex items-center justify-center border border-red-200">
                        <Trash2 size={20} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-red-100 text-red-800 rounded-lg">
                        Entire History
                      </span>
                    </div>
                    <h4 className="text-base font-black text-stone-900 tracking-tight mb-1">Delete All Data</h4>
                    <p className="text-xs text-stone-500 mb-5">
                      Wipe all daily reports, machine production entries, and historical incentive statements across all sheds.
                    </p>

                    <div className="p-3.5 bg-red-50/70 border border-red-200/60 rounded-xl mb-6">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
                        <p className="text-[11px] font-semibold text-red-800 leading-relaxed">
                          This will permanently delete all {reportHistory.length} recorded daily reports from the database.
                        </p>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={promptDeleteAllData}
                    className="w-full py-3 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md shadow-red-600/25 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Trash2 size={15} /> Delete All Data
                  </button>
                </div>

                {/* 3. Delete Worker Master */}
                <div className="bg-white rounded-2xl border-2 border-red-100 p-6 flex flex-col justify-between shadow-sm hover:border-red-300 transition-all">
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center border border-rose-200/60">
                        <Users size={20} />
                      </div>
                      <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 bg-rose-100 text-rose-800 rounded-lg">
                        Employees
                      </span>
                    </div>
                    <h4 className="text-base font-black text-stone-900 tracking-tight mb-1">Delete Worker Master</h4>
                    <p className="text-xs text-stone-500 mb-5">
                      Clear all registered employee records, verification photos, and profiles from MongoDB.
                    </p>

                    <div className="p-3.5 bg-stone-50 border border-stone-200 rounded-xl mb-6">
                      <p className="text-[11px] font-medium text-stone-600 leading-relaxed">
                        Currently registered: <strong className="text-stone-900 font-bold">{workers.length} employees</strong> in the master database.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={promptDeleteWorkers}
                    className="w-full py-3 px-4 bg-stone-800 hover:bg-black active:bg-stone-900 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Users size={15} /> Delete Worker Master
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  if (isTvMode) {
    return (
      <ErrorBoundary>
        <TvDashboard
          dailyReport={activeDailyReport}
          history={currentShedHistory}
          allShedsHistory={reportHistory}
          workers={currentShedWorkers}
          rules={incentiveRules}
          selectedShed={selectedShed}
          onSelectShed={setSelectedShed}
          machineEm={machineEm}
          settings={settings}
          onSelectDate={handleTopDateChange}
          availableDates={availableReportDates}
          countConversions={countConversions}
          frozenMonths={frozenMonths}
          selectedMonth={selectedMonth}
          selectedYear={selectedYear}
          onExit={() => {
            setIsTvMode(false);
            setTvStarted(false);
            try {
              if (document.fullscreenElement) {
                document.exitFullscreen();
              }
            } catch {}
          }}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-stone-100 text-stone-900 flex flex-row h-screen overflow-hidden">
        {/* Left Sidebar Navigation */}
        {!isSupervisorMode && (
          <Sidebar
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            onTvMode={() => {
              setIsTvMode(true);
              try {
                if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                  document.documentElement.requestFullscreen().catch(() => {});
                }
              } catch {}
            }}
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
              {/* Left Section: Active Page Name (Outside the menu section) */}
              <div className="flex items-center gap-2.5 min-w-0 shrink-0">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 border border-emerald-200/80 flex items-center justify-center text-emerald-700 shadow-2xs shrink-0">
                  {(() => {
                    const currentNav = ALL_NAV_ITEMS.find(item => item.id === activeTab);
                    const NavIcon = currentNav?.icon || LayoutDashboard;
                    return <NavIcon size={16} />;
                  })()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[9.5px] font-black uppercase tracking-widest text-stone-400 leading-none">
                    Page
                  </span>
                  <span className="text-xs sm:text-sm font-black text-stone-900 tracking-tight leading-tight truncate mt-0.5 max-w-[140px] sm:max-w-[200px]">
                    {ALL_NAV_ITEMS.find(item => item.id === activeTab)?.label || activeTab}
                  </span>
                </div>
              </div>

              {/* Center Section: Horizontal Slide Bar for Shed 1, Shed 2, Shed 3, KTTM */}
              <div className="flex-1 flex justify-center px-2">
                <div className="inline-flex items-center bg-stone-100/90 p-1 rounded-2xl border border-stone-200/90 shadow-2xs">
                  {(['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'] as const).map(shed => {
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

              {/* Right Section: Interactive Date Picker, Available Dates Dropdown, TV mode */}
              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                {/* Date Selection: Calendar Date Picker */}
                <div className="flex items-center gap-1.5 bg-stone-100/90 p-0.5 rounded-xl border border-stone-200/90 shadow-2xs">
                  <CalendarDatePicker
                    value={activeDailyReport.date}
                    onChange={(newDate) => handleTopDateChange(newDate)}
                    className="shrink-0"
                  />
                  {activeDailyReport.date !== getTodayUniversalDate() && (
                    <button
                      type="button"
                      onClick={() => handleTopDateChange(getTodayUniversalDate())}
                      className="px-2 py-1 text-[10px] font-black uppercase tracking-wider bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all shadow-2xs cursor-pointer hidden sm:inline-flex"
                      title="Jump to Today's Date"
                    >
                      Today
                    </button>
                  )}
                </div>

                <div className="h-4 w-px bg-stone-200 mx-0.5 hidden sm:block" />

                <button
                  onClick={() => {
                    setIsTvMode(true);
                    try {
                      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
                        document.documentElement.requestFullscreen().catch(() => {});
                      }
                    } catch {}
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-xl font-black uppercase tracking-widest text-[9px] hover:bg-emerald-100 transition-all border border-emerald-200 cursor-pointer shadow-2xs"
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
            <div className="w-full max-w-full p-2.5 md:p-3.5 lg:p-4.5 h-full relative">
              {!isSystemReady && (
                <div className="absolute inset-0 z-[100] bg-white flex flex-col items-center justify-center text-center p-10">
                  <div className="w-20 h-20 bg-stone-100 rounded-[2rem] flex items-center justify-center text-stone-300 mb-6 animate-pulse">
                    <RefreshCw size={40} className="animate-spin text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-black text-stone-900 uppercase tracking-tighter mb-2">Connecting to MongoDB</h2>
                  <p className="text-stone-400 font-bold uppercase tracking-[0.3em] text-[10px]">Loading Spinning Mill Data...</p>
                </div>
              )}

              <AnimatePresence mode="wait">
                <div key={activeTab}>
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

        {/* Danger Zone Delete Confirmation Modal */}
        <AnimatePresence>
          {deleteConfirmModal.isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-4 z-[1000] no-print"
              onClick={() => {
                if (!deleteConfirmModal.isProcessing) {
                  setDeleteConfirmModal(prev => ({ ...prev, isOpen: false }));
                }
              }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 15 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-3xl max-w-md w-full shadow-2xl border border-red-200 overflow-hidden relative"
              >
                {/* Header */}
                <div className="bg-gradient-to-r from-red-600 to-rose-700 p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 border border-white/20">
                      <AlertTriangle size={24} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-black uppercase tracking-wider">{deleteConfirmModal.title}</h3>
                      <p className="text-[10px] font-bold text-red-100 uppercase tracking-widest mt-0.5">Confirmation Required</p>
                    </div>
                  </div>
                  <button
                    disabled={deleteConfirmModal.isProcessing}
                    onClick={() => setDeleteConfirmModal(prev => ({ ...prev, isOpen: false }))}
                    className="p-1.5 rounded-xl hover:bg-white/20 text-white/80 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                  <p className="text-xs font-semibold text-stone-700 leading-relaxed">
                    {deleteConfirmModal.description}
                  </p>

                  {deleteConfirmModal.targetInfo && (
                    <div className="p-3 bg-red-50/80 border border-red-200 rounded-xl">
                      <span className="text-[10px] font-black uppercase tracking-wider text-red-700 block mb-0.5">Target Scope</span>
                      <p className="text-xs font-bold text-red-950">{deleteConfirmModal.targetInfo}</p>
                    </div>
                  )}

                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800">
                    <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                    <span className="text-[11px] font-bold">This operation is irreversible and cannot be undone.</span>
                  </div>

                  <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                      type="button"
                      disabled={deleteConfirmModal.isProcessing}
                      onClick={() => setDeleteConfirmModal(prev => ({ ...prev, isOpen: false }))}
                      className="px-4 py-2.5 rounded-xl border border-stone-200 text-stone-700 font-bold text-xs hover:bg-stone-100 transition-all cursor-pointer disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={deleteConfirmModal.isProcessing}
                      onClick={executeConfirmedDelete}
                      className="px-5 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-red-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      {deleteConfirmModal.isProcessing ? (
                        <>
                          <Loader2 size={14} className="animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 size={14} />
                          Yes, Delete Data
                        </>
                      )}
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
