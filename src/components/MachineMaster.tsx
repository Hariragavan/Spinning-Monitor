'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { 
  RotateCcw, Plus, Edit2, Trash2, Save, Check, AlertCircle,
  Layers, Activity, RefreshCw
} from 'lucide-react';
import { MachineMasterItem, Sider, CountConversion, Shed, DailyReport } from '../types';
import { cn, getYesterdayUniversalDate, normalizeShed, getMachineShed } from '../lib/utils';

export const STANDARD_MACHINES_BY_SHED: Record<string, MachineMasterItem[]> = {
  'Shed 1': [
    { id: 'm-sp009-shed-1', rfNo: 'SP009', description: 'RING FRAME SP009 (Shed 1)', shed: 'Shed 1', count: '21/1-CW-SY', stdGps: 340 },
    { id: 'm-sp010-shed-1', rfNo: 'SP010', description: 'RING FRAME SP010 (Shed 1)', shed: 'Shed 1', count: '24/1-CH-SY', stdGps: 340 },
    { id: 'm-sp011-shed-1', rfNo: 'SP011', description: 'RING FRAME SP011 (Shed 1)', shed: 'Shed 1', count: '24/1-CH-SY', stdGps: 340 },
    { id: 'm-sp012-shed-1', rfNo: 'SP012', description: 'RING FRAME SP012 (Shed 1)', shed: 'Shed 1', count: '30/1--DY', stdGps: 330 },
    { id: 'm-sp013-shed-1', rfNo: 'SP013', description: 'RING FRAME SP013 (Shed 1)', shed: 'Shed 1', count: '30/1--DY', stdGps: 330 },
    { id: 'm-sp014-shed-1', rfNo: 'SP014', description: 'RING FRAME SP014 (Shed 1)', shed: 'Shed 1', count: '30/1--DY', stdGps: 330 },
    { id: 'm-sp015-shed-1', rfNo: 'SP015', description: 'RING FRAME SP015 (Shed 1)', shed: 'Shed 1', count: '32/1-CW-SY', stdGps: 330 },
    { id: 'm-sp016-shed-1', rfNo: 'SP016', description: 'RING FRAME SP016 (Shed 1)', shed: 'Shed 1', count: '32/1-CW-SY', stdGps: 330 },
    { id: 'm-sp017-shed-1', rfNo: 'SP017', description: 'RING FRAME SP017 (Shed 1)', shed: 'Shed 1', count: '40/1CHY', stdGps: 310 },
    { id: 'm-sp018-shed-1', rfNo: 'SP018', description: 'RING FRAME SP018 (Shed 1)', shed: 'Shed 1', count: '40/1CHY', stdGps: 310 },
    { id: 'm-sp021-shed-1', rfNo: 'SP021', description: 'RING FRAME SP021 (Shed 1)', shed: 'Shed 1', count: '030/1-PH-PC', stdGps: 340 },
    { id: 'm-sp022-shed-1', rfNo: 'SP022', description: 'RING FRAME SP022 (Shed 1)', shed: 'Shed 1', count: '030/1-PH-PC', stdGps: 340 },
    { id: 'm-sp023-shed-1', rfNo: 'SP023', description: 'RING FRAME SP023 (Shed 1)', shed: 'Shed 1', count: '040/1-PH-PC', stdGps: 310 },
    { id: 'm-sp024-shed-1', rfNo: 'SP024', description: 'RING FRAME SP024 (Shed 1)', shed: 'Shed 1', count: '040/1-PH-PC', stdGps: 310 },
    { id: 'm-sp025-shed-1', rfNo: 'SP025', description: 'RING FRAME SP025 (Shed 1)', shed: 'Shed 1', count: '34/1-PH-PV', stdGps: 330 },
    { id: 'm-sp026-shed-1', rfNo: 'SP026', description: 'RING FRAME SP026 (Shed 1)', shed: 'Shed 1', count: '34/1-PH-PV', stdGps: 330 },
    { id: 'm-sp027-shed-1', rfNo: 'SP027', description: 'RING FRAME SP027 (Shed 1)', shed: 'Shed 1', count: '042/1-CH-NY', stdGps: 305 },
    { id: 'm-sp028-shed-1', rfNo: 'SP028', description: 'RING FRAME SP028 (Shed 1)', shed: 'Shed 1', count: '042/1-CH-NY', stdGps: 305 },
    { id: 'm-sp029-shed-1', rfNo: 'SP029', description: 'RING FRAME SP029 (Shed 1)', shed: 'Shed 1', count: '038/1-CH-NY', stdGps: 320 },
    { id: 'm-sp030-shed-1', rfNo: 'SP030', description: 'RING FRAME SP030 (Shed 1)', shed: 'Shed 1', count: '034/1-PH-PC', stdGps: 330 }
  ],
  'Shed 2': [
    { id: 'm-sp031-shed-2', rfNo: 'SP031', description: 'RING FRAME SP031 (Shed 2)', shed: 'Shed 2', count: '32/1-CH-CY', stdGps: 340 },
    { id: 'm-sp032-shed-2', rfNo: 'SP032', description: 'RING FRAME SP032 (Shed 2)', shed: 'Shed 2', count: '32/1-CH-CY', stdGps: 340 },
    { id: 'm-sp033-shed-2', rfNo: 'SP033', description: 'RING FRAME SP033 (Shed 2)', shed: 'Shed 2', count: '32/1-CH-CY', stdGps: 340 },
    { id: 'm-sp034-shed-2', rfNo: 'SP034', description: 'RING FRAME SP034 (Shed 2)', shed: 'Shed 2', count: '34/1CHY-OCY', stdGps: 330 },
    { id: 'm-sp035-shed-2', rfNo: 'SP035', description: 'RING FRAME SP035 (Shed 2)', shed: 'Shed 2', count: '34/1CHY-OCY', stdGps: 330 },
    { id: 'm-sp036-shed-2', rfNo: 'SP036', description: 'RING FRAME SP036 (Shed 2)', shed: 'Shed 2', count: '30/1CH', stdGps: 355 },
    { id: 'm-sp037-shed-2', rfNo: 'SP037', description: 'RING FRAME SP037 (Shed 2)', shed: 'Shed 2', count: '30/1CH', stdGps: 355 },
    { id: 'm-sp038-shed-2', rfNo: 'SP038', description: 'RING FRAME SP038 (Shed 2)', shed: 'Shed 2', count: '30/1CH', stdGps: 355 },
    { id: 'm-sp039-shed-2', rfNo: 'SP039', description: 'RING FRAME SP039 (Shed 2)', shed: 'Shed 2', count: '20/1-CW-WVG', stdGps: 375 },
    { id: 'm-sp040-shed-2', rfNo: 'SP040', description: 'RING FRAME SP040 (Shed 2)', shed: 'Shed 2', count: '20/1-CW-WVG', stdGps: 375 }
  ],
  'Shed 3': [
    { id: 'm-sp041-shed-3', rfNo: 'SP041', description: 'RING FRAME SP041 (Shed 3)', shed: 'Shed 3', count: '26/1-CHY', stdGps: 360 },
    { id: 'm-sp042-shed-3', rfNo: 'SP042', description: 'RING FRAME SP042 (Shed 3)', shed: 'Shed 3', count: '26/1-CHY', stdGps: 360 },
    { id: 'm-sp043-shed-3', rfNo: 'SP043', description: 'RING FRAME SP043 (Shed 3)', shed: 'Shed 3', count: '26/1-CHY', stdGps: 360 },
    { id: 'm-sp044-shed-3', rfNo: 'SP044', description: 'RING FRAME SP044 (Shed 3)', shed: 'Shed 3', count: '50s Compact', stdGps: 325 },
    { id: 'm-sp045-shed-3', rfNo: 'SP045', description: 'RING FRAME SP045 (Shed 3)', shed: 'Shed 3', count: '50s Compact', stdGps: 325 },
    { id: 'm-sp046-shed-3', rfNo: 'SP046', description: 'RING FRAME SP046 (Shed 3)', shed: 'Shed 3', count: '60s Super Combed', stdGps: 310 },
    { id: 'm-sp047-shed-3', rfNo: 'SP047', description: 'RING FRAME SP047 (Shed 3)', shed: 'Shed 3', count: '60s Super Combed', stdGps: 310 },
    { id: 'm-sp048-shed-3', rfNo: 'SP048', description: 'RING FRAME SP048 (Shed 3)', shed: 'Shed 3', count: '40s Micro Weft', stdGps: 340 },
    { id: 'm-sp049-shed-3', rfNo: 'SP049', description: 'RING FRAME SP049 (Shed 3)', shed: 'Shed 3', count: '40s Micro Weft', stdGps: 340 },
    { id: 'm-sp050-shed-3', rfNo: 'SP050', description: 'RING FRAME SP050 (Shed 3)', shed: 'Shed 3', count: '40s Micro Weft', stdGps: 340 }
  ],
  'KTTM': [
    { id: 'm-k01-kttm', rfNo: 'K01', description: 'KTTM RXI 240 - K01', shed: 'KTTM', count: '60s CW', stdGps: 310 },
    { id: 'm-k02-kttm', rfNo: 'K02', description: 'KTTM RXI 240 - K02', shed: 'KTTM', count: '60s CW', stdGps: 310 },
    { id: 'm-k03-kttm', rfNo: 'K03', description: 'KTTM RXI 240 - K03', shed: 'KTTM', count: '60s CW', stdGps: 310 },
    { id: 'm-k04-kttm', rfNo: 'K04', description: 'KTTM RXI 240 - K04', shed: 'KTTM', count: '40s KTTM', stdGps: 345 },
    { id: 'm-k05-kttm', rfNo: 'K05', description: 'KTTM RXI 240 - K05', shed: 'KTTM', count: '40s KTTM', stdGps: 345 },
    { id: 'm-k06-kttm', rfNo: 'K06', description: 'KTTM RXI 240 - K06', shed: 'KTTM', count: '40s KTTM', stdGps: 345 },
    { id: 'm-k07-kttm', rfNo: 'K07', description: 'KTTM RXI 240 - K07', shed: 'KTTM', count: '80s Compact', stdGps: 280 },
    { id: 'm-k08-kttm', rfNo: 'K08', description: 'KTTM RXI 240 - K08', shed: 'KTTM', count: '80s Compact', stdGps: 280 },
    { id: 'm-k09-kttm', rfNo: 'K09', description: 'KTTM RXI 240 - K10', shed: 'KTTM', count: '100s Dobby', stdGps: 250 },
    { id: 'm-k10-kttm', rfNo: 'K10', description: 'KTTM RXI 240 - K10', shed: 'KTTM', count: '100s Dobby', stdGps: 250 }
  ]
};

export const ALL_STANDARD_MACHINES: MachineMasterItem[] = Object.values(STANDARD_MACHINES_BY_SHED).flat();

export const STANDARD_12_MACHINES = ALL_STANDARD_MACHINES;

export const SHED_REAL_COUNTS: Record<string, string[]> = {
  'Shed 1': ['030/1-PH-PC', '040/1-PH-PC', '34/1-PH-PV', '042/1-CH-NY', '038/1-CH-NY', '034/1-PH-PC'],
  'Shed 2': ['32/1-CH-CY', '34/1CHY-OCY', '30/1CH', '20/1-CW-WVG'],
  'Shed 3': ['26/1-CHY', '40s Micro Weft', '50s Compact', '60s Super Combed'],
  'KTTM': ['60s CW', '40s KTTM', '80s Compact', '100s Dobby'],
};

interface MachineMasterProps {
  machines: MachineMasterItem[];
  onSaveMachine: (machine: MachineMasterItem) => void;
  onDeleteMachine: (id: string) => void;
  onResetStandardMachines: (shed?: string) => void;
  workers?: Sider[];
  countConversions?: CountConversion[];
  currentShed?: Shed | string;
  report?: DailyReport;
  allReports?: DailyReport[];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
  availableDates?: string[];
}

export const MachineMaster: React.FC<MachineMasterProps> = ({
  machines,
  onSaveMachine,
  onDeleteMachine,
  onResetStandardMachines,
  workers = [],
  countConversions = [],
  currentShed = 'Shed 1',
  report,
  allReports = [],
  selectedDate
}) => {
  const [selectedShedTab, setSelectedShedTab] = useState<string>(currentShed || 'All Sheds');
  const activeDate = selectedDate || report?.date || getYesterdayUniversalDate();
  const [viewMode, setViewMode] = useState<'date' | 'all'>('date');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    rfNo: string;
    description: string;
    shed: string;
    count: string;
  }>({
    rfNo: '',
    description: '',
    shed: currentShed || 'Shed 1',
    count: ''
  });
  const [error, setError] = useState<string | null>(null);
  const [isSyncingReports, setIsSyncingReports] = useState(false);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  const handleSyncFromReports = async () => {
    try {
      setIsSyncingReports(true);
      setError(null);
      const res = await fetch('/api/machines?syncFromReports=true&startFresh=true');
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        await onResetStandardMachines(selectedShedTab === 'All Sheds' ? undefined : selectedShedTab);
        setSyncSuccessMessage(`Successfully started fresh and synchronized ${json.data.length} machines cleanly separated by shed.`);
        setTimeout(() => setSyncSuccessMessage(null), 5000);
      } else {
        setError(json.error || 'Failed to sync machines');
      }
    } catch (e: any) {
      setError(e?.message || 'Error communicating with machines server API');
    } finally {
      setIsSyncingReports(false);
    }
  };

  // Sync tab with currentShed if currentShed prop changes
  useEffect(() => {
    if (currentShed && currentShed !== 'All') {
      setSelectedShedTab(currentShed);
    }
  }, [currentShed]);

  // Find machine telemetry and running counts detected on activeDate
  const { dateMachineMap, activeDateHasData } = useMemo(() => {
    const map = new Map<string, { count: string; actualGps: number; stdGps: number; prodKg: number; shed: string; rfNo: string }>();
    const pool: DailyReport[] = [];
    if (report && report.date === activeDate) pool.push(report);
    (allReports || []).forEach(r => {
      if (r.date === activeDate && !pool.some(p => p.shed === r.shed && p.date === r.date)) {
        pool.push(r);
      }
    });

    const relevant = pool.filter(r => selectedShedTab === 'All Sheds' || (r.shed || 'Shed 1') === selectedShedTab);
    let foundData = false;

    relevant.forEach(rep => {
      const repShed = rep.shed || 'Shed 1';
      (rep.entries || []).forEach(e => {
        const rf = (e.frameNo || '').trim().toUpperCase();
        if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return;
        foundData = true;
        const key = `${rf}__${repShed.toLowerCase()}`;
        const existing = map.get(key);
        map.set(key, {
          rfNo: e.frameNo || rf,
          count: (e.count || '').trim() || existing?.count || '',
          actualGps: e.gpsActual || existing?.actualGps || 0,
          stdGps: e.gpsTarget || existing?.stdGps || 0,
          prodKg: (existing?.prodKg || 0) + (e.productionActual || 0),
          shed: repShed
        });
      });

      (rep.summaries || []).forEach(s => {
        const rf = (s.frameNo || '').trim().toUpperCase();
        if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return;
        foundData = true;
        const key = `${rf}__${repShed.toLowerCase()}`;
        const existing = map.get(key);
        map.set(key, {
          rfNo: s.frameNo || rf,
          count: (s.count || '').trim() || existing?.count || '',
          actualGps: s.avgGps || existing?.actualGps || 0,
          stdGps: s.stdGps || existing?.stdGps || 0,
          prodKg: s.actualProd || existing?.prodKg || 0,
          shed: repShed
        });
      });
    });

    return { dateMachineMap: map, activeDateHasData: foundData };
  }, [allReports, report, activeDate, selectedShedTab]);

  // Get available counts specifically for the chosen shed (only available registered / running counts)
  const getAvailableCountsForShed = (targetShed: string): string[] => {
    const s = targetShed && targetShed !== 'All Sheds' ? targetShed : 'Shed 1';
    const normS = normalizeShed(s);
    
    // 1. Counts defined in Count Master for this shed (or All Sheds)
    const fromConversions = countConversions
      .filter(c => {
        if (!c || !c.count) return false;
        const cShed = normalizeShed(c.shed || 'Shed 1');
        return cShed === normS || c.shed === 'All Sheds';
      })
      .map(c => (c.count || '').trim())
      .filter(c => c && !['all', '40s'].includes(c.toLowerCase()));

    // 2. Counts currently running on date reports/telemetry for this shed
    const fromDateTelemetry: string[] = [];
    dateMachineMap.forEach((data, key) => {
      const [, shedLower] = key.split('__');
      if (shedLower === s.toLowerCase() && data.count) {
        fromDateTelemetry.push(data.count.trim());
      }
    });

    // 3. Counts assigned to registered machines in this shed
    const fromMachines = machines
      .filter(m => normalizeShed(m.shed || 'Shed 1') === normS)
      .map(m => (m.count || '').trim())
      .filter(Boolean);

    const combined = Array.from(new Set([
      ...fromConversions,
      ...fromDateTelemetry,
      ...fromMachines
    ].filter(Boolean)));

    return combined;
  };

  const activeFormShed = formData.shed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : (currentShed || 'Shed 1'));
  const availableCountsForShed = useMemo(() => {
    const counts = getAvailableCountsForShed(activeFormShed);
    // If editing a machine, keep its existing count in list even if not in master
    if (editingId && formData.count && !counts.includes(formData.count)) {
      return [formData.count, ...counts];
    }
    return counts;
  }, [countConversions, machines, dateMachineMap, activeFormShed, editingId, formData.count]);

  // Auto-select first available count if formData.count is empty or not in available list
  useEffect(() => {
    if (editingId) return;
    const counts = getAvailableCountsForShed(activeFormShed);
    if (counts.length > 0 && (!formData.count || !counts.includes(formData.count))) {
      setFormData(prev => ({ ...prev, count: counts[0] }));
    }
  }, [activeFormShed, countConversions, machines, editingId]);

  // Master registered machines filtered strictly by shed (no cross-shed machines)
  const masterMachines = useMemo(() => {
    const targetNorm = normalizeShed(selectedShedTab || 'All Sheds');
    return machines.filter(m => {
      const rf = (m.rfNo || (m as any).frameNo || '').trim().toUpperCase();
      if (!rf || rf === 'M' || rf === 'MC' || !rf.match(/\d+/)) return false;
      const trueShed = getMachineShed(rf, m.shed);
      if (selectedShedTab === 'All Sheds') return true;
      return trueShed === targetNorm;
    });
  }, [machines, selectedShedTab]);

  // Date-specific machines: If no data on date, returns empty!
  const dateMachines = useMemo(() => {
    if (!activeDateHasData) return [];

    const targetNorm = normalizeShed(selectedShedTab || 'All Sheds');
    const items: MachineMasterItem[] = [];
    dateMachineMap.forEach((data, key) => {
      const [rfUpper] = key.split('__');
      const trueShed = getMachineShed(rfUpper, data.shed);
      if (selectedShedTab !== 'All Sheds' && trueShed !== targetNorm) return;

      const existingRegistered = machines.find(m => {
        const mRf = (m.rfNo || (m as any).frameNo || '').trim().toUpperCase();
        return mRf === rfUpper && getMachineShed(mRf, m.shed) === trueShed;
      });

      items.push({
        id: existingRegistered?.id || `m-${rfUpper.toLowerCase()}-${trueShed.toLowerCase().replace(/\s+/g, '-')}`,
        rfNo: data.rfNo || rfUpper,
        description: existingRegistered?.description || `RING FRAME ${data.rfNo || rfUpper} (${trueShed})`,
        shed: trueShed,
        count: data.count || existingRegistered?.count || '030/1-PH-PC',
        actualGps: data.actualGps,
        stdGps: data.stdGps,
        productionKg: data.prodKg,
        assignedSider: existingRegistered?.assignedSider || '-',
        assignedGaiter: existingRegistered?.assignedGaiter || '-'
      });
    });

    return items.sort((a, b) => (a.rfNo || '').localeCompare(b.rfNo || '', undefined, { numeric: true }));
  }, [activeDateHasData, dateMachineMap, machines, selectedShedTab]);

  // Effective list shown in table based on viewMode (falls back to master machines if date statement not uploaded)
  const displayMachines = (viewMode === 'date' && dateMachines.length > 0) ? dateMachines : masterMachines;

  const handleStartEdit = (machine: MachineMasterItem) => {
    setEditingId(machine.id);
    const mShed = getMachineShed(machine.rfNo || (machine as any).frameNo, machine.shed || currentShed || 'Shed 1');
    const shedCounts = getAvailableCountsForShed(mShed);
    const rf = (machine.rfNo || (machine as any).frameNo || '').trim().toUpperCase();
    const key = `${rf}__${mShed.toLowerCase()}`;
    const dateData = dateMachineMap.get(key);
    setFormData({
      rfNo: machine.rfNo || (machine as any).frameNo || '',
      description: machine.description || '',
      shed: mShed,
      count: dateData?.count || machine.count || shedCounts[0] || ''
    });
    setError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    const activeShed = selectedShedTab !== 'All Sheds' ? selectedShedTab : (currentShed || 'Shed 1');
    const shedCounts = getAvailableCountsForShed(activeShed);
    setFormData({
      rfNo: '',
      description: '',
      shed: activeShed,
      count: shedCounts[0] || ''
    });
    setError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.rfNo.trim()) {
      setError('RF No / Machine Name is required.');
      return;
    }

    const cleanRfNo = formData.rfNo.trim().toUpperCase();
    if (cleanRfNo === 'M' || cleanRfNo === 'MC' || !cleanRfNo.match(/\d+/)) {
      setError('Please enter a valid machine number containing digits (e.g., 01, RF-02, K03). "M" cannot be registered as a machine.');
      return;
    }
    const cleanShed = getMachineShed(cleanRfNo, formData.shed || (selectedShedTab !== 'All Sheds' ? selectedShedTab : (currentShed || 'Shed 1')));
    const finalCount = formData.count || availableCountsForShed[0] || '';

    // Check duplicate RF No across same or other sheds
    const duplicate = machines.find(m => {
      const mRf = (m.rfNo || (m as any).frameNo || '').trim().toUpperCase();
      return m.id !== editingId && mRf === cleanRfNo;
    });
    if (duplicate && duplicate.id !== editingId) {
      setError(`Machine "${cleanRfNo}" already exists in ${duplicate.shed || 'registry'}. Each machine must be unique.`);
      return;
    }

    const existing = machines.find(m => m.id === editingId);
    const item: MachineMasterItem = {
      id: editingId || `m-${cleanRfNo.toLowerCase()}-${Date.now()}`,
      rfNo: cleanRfNo,
      description: formData.description?.trim() || `RING FRAME ${cleanRfNo} - ${cleanShed.toUpperCase()}`,
      shed: cleanShed,
      count: finalCount,
      stdGps: existing?.stdGps ?? 0,
      actualGps: existing?.actualGps ?? 0,
      productionKg: existing?.productionKg ?? 0,
      assignedSider: existing?.assignedSider || '-',
      assignedGaiter: existing?.assignedGaiter || '-'
    };

    onSaveMachine(item);
    handleCancelEdit();
  };

  return (
    <div className="space-y-6 w-full">
      {/* HEADER SECTION (Without Date Picker) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs">
        <div>
          <h1 className="text-2xl font-black text-stone-900 uppercase tracking-tight">
            MACHINE MASTER
          </h1>
          <p className="text-xs font-semibold text-stone-400 mt-0.5">
            Configure Ring Frame Numbers (RF No), Running Counts & Crew Properties per Shed
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* SHED TABS */}
          <div className="inline-flex items-center bg-stone-100 p-1 rounded-xl border border-stone-200">
            {['All Sheds', 'Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedShedTab(s)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer",
                  selectedShedTab === s ? "bg-white text-emerald-800 shadow-xs font-black" : "text-stone-500 hover:text-stone-800"
                )}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={isSyncingReports}
            onClick={handleSyncFromReports}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shadow-2xs cursor-pointer self-start sm:self-center disabled:opacity-50"
            title="Scan uploaded reports from DB and rebuild clean all master machines separated by shed"
          >
            <RefreshCw size={14} className={cn("text-white", isSyncingReports && "animate-spin")} />
            <span>{isSyncingReports ? 'Starting Fresh...' : 'Start Fresh (Sync DB)'}</span>
          </button>

          <button
            type="button"
            onClick={() => onResetStandardMachines(selectedShedTab === 'All Sheds' ? undefined : selectedShedTab)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-stone-200 text-stone-700 hover:text-stone-950 text-xs font-bold hover:bg-stone-50 transition-all shadow-2xs cursor-pointer self-start sm:self-center"
          >
            <RotateCcw size={14} className="text-stone-500" />
            <span>Reset {selectedShedTab === 'All Sheds' ? 'All' : selectedShedTab} Machines</span>
          </button>
        </div>
      </div>

      {syncSuccessMessage && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-bold flex items-center gap-2 shadow-2xs">
          <Check size={16} className="text-emerald-600 shrink-0" />
          <span>{syncSuccessMessage}</span>
        </div>
      )}

      {/* TWO COLUMN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start w-full">
        {/* LEFT COLUMN: MACHINE ADD/EDIT FORM */}
        <div className="lg:col-span-4 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs sticky top-28">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-black text-emerald-700 uppercase tracking-wider flex items-center gap-2">
              {editingId ? (
                <>
                  <Edit2 size={16} />
                  EDIT RING FRAME {formData.rfNo}
                </>
              ) : (
                <>
                  <Plus size={16} />
                  ADD RING FRAME
                </>
              )}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={handleCancelEdit}
                className="text-xs font-bold text-stone-500 hover:text-stone-800 cursor-pointer"
              >
                Cancel
              </button>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-bold rounded-xl flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* SHED */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                ASSIGN SHED *
              </label>
              <select
                value={formData.shed}
                onChange={(e) => {
                  const newShed = e.target.value;
                  const newShedCounts = getAvailableCountsForShed(newShed);
                  setFormData(prev => ({
                    ...prev,
                    shed: newShed,
                    count: newShedCounts.includes(prev.count) ? prev.count : (newShedCounts[0] || '')
                  }));
                }}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-emerald-500 outline-none transition-all cursor-pointer font-mono"
              >
                {['Shed 1', 'Shed 2', 'Shed 3', 'KTTM'].map(sh => (
                  <option key={sh} value={sh}>{sh}</option>
                ))}
              </select>
            </div>

            {/* RF NO */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                RF NO / MACHINE NAME *
              </label>
              <input
                type="text"
                placeholder="e.g. 01, RF-1"
                value={formData.rfNo}
                onChange={(e) => setFormData(prev => ({ ...prev, rfNo: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 placeholder-stone-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all uppercase"
              />
              <span className="block text-[10px] text-stone-400 font-medium mt-1">
                Enter unique machine identifier for this shed
              </span>
            </div>

            {/* DESCRIPTION / LOCATION */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                DESCRIPTION / LOCATION (OPTIONAL)
              </label>
              <input
                type="text"
                placeholder="e.g. Ring Frame 1"
                value={formData.description || ''}
                onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-medium text-stone-800 placeholder-stone-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
              />
            </div>

            {/* RUNNING COUNT */}
            <div>
              <label className="block text-[11px] font-black uppercase tracking-wider text-stone-700 mb-1">
                RUNNING COUNT ({activeFormShed}) *
              </label>
              <select
                value={formData.count}
                onChange={(e) => setFormData(prev => ({ ...prev, count: e.target.value }))}
                className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-800 focus:bg-white focus:border-emerald-500 outline-none transition-all cursor-pointer font-mono"
              >
                {availableCountsForShed.length === 0 ? (
                  <option value="">No counts available for {activeFormShed}</option>
                ) : (
                  availableCountsForShed.map(cnt => (
                    <option key={cnt} value={cnt}>{cnt}</option>
                  ))
                )}
              </select>
              <span className="block text-[10px] text-stone-400 font-medium mt-1">
                {availableCountsForShed.length > 0 
                  ? `Showing ${availableCountsForShed.length} available count${availableCountsForShed.length > 1 ? 's' : ''} for ${activeFormShed}`
                  : `No yarn counts registered for ${activeFormShed}. Please add counts in Count Master.`}
              </span>
            </div>

            {/* AUTOMATED TELEMETRY INFO */}
            <div className="p-3.5 bg-emerald-50/80 border border-emerald-100 rounded-xl text-emerald-900 text-xs flex items-start gap-2.5">
              <Check size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-bold text-emerald-950">Automated Production Statement Telemetry</p>
                <p className="text-[11px] text-emerald-800 leading-relaxed font-medium">
                  Actual GPS, Target GPS, and Production (kg) are automatically ingested from your uploaded Excel production statements for each machine across all sheds.
                </p>
              </div>
            </div>

            {/* SAVE BUTTON */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full py-3 bg-stone-900 hover:bg-black text-white font-black rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
              >
                <Save size={15} />
                <span>SAVE MACHINE</span>
              </button>
            </div>
          </form>
        </div>

        {/* RIGHT COLUMN: ACTIVE RING FRAME MACHINES LIST */}
        <div className="lg:col-span-8 bg-white p-6 rounded-2xl border border-stone-200 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-stone-100 mb-3 gap-2">
            <div>
              <h2 className="text-xs font-black uppercase tracking-wider text-stone-800">
                MACHINES {viewMode === 'date' ? `(${activeDate})` : '(ALL REGISTERED)'} {selectedShedTab !== 'All Sheds' ? `— ${selectedShedTab}` : ''}
              </h2>
              <p className="text-[11px] text-stone-500 font-medium mt-0.5">
                {viewMode === 'date'
                  ? (dateMachines.length > 0
                      ? `Showing detected machines on ${activeDate}.`
                      : `No statement uploaded on ${activeDate}. Showing ${masterMachines.length} master registered machines for ${selectedShedTab}.`)
                  : `Showing all master registered machines across ${selectedShedTab}.`}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* View Toggle */}
              <div className="inline-flex items-center bg-stone-200/80 p-0.5 rounded-lg border border-stone-300">
                <button
                  type="button"
                  onClick={() => setViewMode('date')}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer",
                    viewMode === 'date' ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
                  )}
                >
                  On Date ({dateMachines.length})
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('all')}
                  className={cn(
                    "px-2.5 py-1 text-[10px] font-black uppercase tracking-wider rounded-md transition-all cursor-pointer",
                    viewMode === 'all' ? "bg-white text-stone-900 shadow-2xs" : "text-stone-600 hover:text-stone-900"
                  )}
                >
                  All Master ({masterMachines.length})
                </button>
              </div>
            </div>
          </div>

          <div className="divide-y divide-stone-100">
            {displayMachines.length === 0 ? (
              <div className="py-16 text-center">
                <div className="w-12 h-12 rounded-2xl bg-stone-100 border border-stone-200 text-stone-400 flex items-center justify-center mx-auto mb-3">
                  <Layers size={22} className="text-stone-400" />
                </div>
                <p className="text-xs font-black uppercase tracking-wider text-stone-500">
                  {viewMode === 'date' 
                    ? `No machine data for ${activeDate} ${selectedShedTab !== 'All Sheds' ? `(${selectedShedTab})` : ''}`
                    : `No registered machines for ${selectedShedTab}`}
                </p>
                <p className="text-[11px] text-stone-400 mt-1">
                  {viewMode === 'date'
                    ? `Upload a production statement for ${activeDate} to view active machines.`
                    : `Click "Reset ${selectedShedTab} Machines" above or add a machine on the left.`}
                </p>
              </div>
            ) : (
              displayMachines.map((m, idx) => {
                const rfNo = m.rfNo || (m as any).frameNo || 'M';
                const mShed = m.shed || 'Shed 1';
                const key = `${rfNo.trim().toUpperCase()}__${mShed.toLowerCase()}`;
                const dateData = dateMachineMap.get(key);
                const runningCount = dateData?.count || m.count || '030/1-PH-PC';

                return (
                  <div 
                    key={m.id || rfNo}
                    className={cn(
                      "py-3.5 flex items-center justify-between gap-3 transition-colors rounded-xl px-2 -mx-2 hover:bg-stone-50/70",
                      editingId === m.id && "bg-emerald-50/50 border border-emerald-200"
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-mono font-bold text-stone-400 w-5 shrink-0 text-right">
                        {idx + 1}.
                      </span>
                      
                      {/* GREEN PILL BADGE */}
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-black font-mono shrink-0">
                        {rfNo}
                      </span>

                      {/* SHED BADGE */}
                      <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 border border-stone-200 text-[10px] font-bold shrink-0">
                        {mShed}
                      </span>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-black text-stone-900 tracking-tight">
                            RF No: {rfNo}
                          </span>
                        </div>
                        <div className="text-[11px] text-stone-500 font-medium truncate mt-0.5 flex flex-wrap items-center gap-2">
                          <span>Running Count:</span>
                          <span className="font-bold text-emerald-800 bg-emerald-50/80 px-2 py-0.5 rounded-md border border-emerald-200">
                            {runningCount}
                          </span>
                          {dateData && (
                            <span className="text-[10px] font-mono font-bold text-stone-400">
                              (GPS: {dateData.actualGps} | {dateData.prodKg} kg)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* ROW ACTION BUTTONS */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleStartEdit(m)}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-200/60 rounded-lg transition-colors cursor-pointer"
                        title="Edit Machine"
                      >
                        <Edit2 size={13} />
                        <span>Edit</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Delete machine ${rfNo}?`)) {
                            onDeleteMachine(m.id);
                          }
                        }}
                        className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Delete Machine"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
