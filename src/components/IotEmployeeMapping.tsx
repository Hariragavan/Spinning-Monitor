'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, Search, Plus, Upload, Download, RefreshCw, Edit2, Trash2,
  CheckCircle2, AlertTriangle, Radio, Copy,
  Check, FileJson, X, Clock, Activity, HardDrive, CheckCircle
} from 'lucide-react';
import { Sider } from '@/types';
import { cn } from '@/lib/utils';

export interface IotDeviceStatus {
  deviceId: string;
  status: 'ACTIVE' | 'INACTIVE';
  lastTapTime: string | null;
  diffMinutes: number | null;
  lastEmployeeId: string | null;
  lastEmployeeName: string | null;
  shift?: number | null;
  shiftDate?: string | null;
}

export interface IotEmployeeRecord {
  _id?: string;
  employeeId: string;
  employeeName: string;
  name?: string;
  department?: string;
  tNo?: string | null;
  active: boolean;
  isRegistered?: boolean;
  assignedDeviceIds?: string[];
  detectedDevices?: string[];
  lastDevice?: string | null;
  lastTapTime?: string | null;
  tapsCount?: number;
  lastShift?: number | null;
  lastShiftDate?: string | null;
  tapAgeMinutes?: number | null;
  tapStatus?: 'ACTIVE' | 'INACTIVE';
  loginStatus?: string;
  updatedAt?: string | null;
}

export interface IotEmployeeMappingProps {
  millWorkers?: Sider[];
  onRefreshWorkers?: () => void;
}

export const IotEmployeeMapping: React.FC<IotEmployeeMappingProps> = ({
  millWorkers = [],
  onRefreshWorkers
}) => {
  const [employees, setEmployees] = useState<IotEmployeeRecord[]>([]);
  const [devices, setDevices] = useState<IotDeviceStatus[]>([]);
  const [unmappedCards, setUnmappedCards] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'inactive' | 'unregistered'>('all');

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<IotEmployeeRecord | null>(null);
  const [formCardId, setFormCardId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDept, setFormDept] = useState('Sider');
  const [formActive, setFormActive] = useState(true);
  const [selectedMillWorkerId, setSelectedMillWorkerId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [formSaving, setFormSaving] = useState(false);

  // Bulk Import Modal state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkJsonText, setBulkJsonText] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccessMsg, setBulkSuccessMsg] = useState<string | null>(null);

  // Delete Confirm Modal state
  const [deleteTarget, setDeleteTarget] = useState<IotEmployeeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Copy feedback
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const formatTapTime = (timeStr?: string | null) => {
    if (!timeStr) return 'No tap recorded';
    try {
      const d = new Date(timeStr);
      if (isNaN(d.getTime())) return timeStr;
      return d.toLocaleString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
    } catch {
      return timeStr;
    }
  };

  const formatTimeAgo = (minutes?: number | null) => {
    if (minutes === null || minutes === undefined) return '';
    if (minutes < 1) return 'Just now';
    if (minutes === 1) return '1 min ago';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  // Load employee mappings and hardware devices from API
  const loadData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setRefreshing(true);
    try {
      const empRes = await fetch('/api/iot/employees', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ success: false }));

      if (empRes?.success && Array.isArray(empRes.data)) {
        setEmployees(empRes.data);
        if (Array.isArray(empRes.unmappedCards)) {
          setUnmappedCards(empRes.unmappedCards);
        }
        if (Array.isArray(empRes.devices)) {
          setDevices(empRes.devices);
        }
      }
    } catch (err) {
      console.error('Error loading IoT employees:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds to update active/inactive 10-minute states
    const interval = setInterval(() => {
      loadData(true);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Open Add Modal
  const openAddModal = (presetCardId?: string) => {
    setEditingEmployee(null);
    setFormCardId(presetCardId || (unmappedCards.length > 0 ? unmappedCards[0] : ''));
    setFormName('');
    setFormDept('Sider');
    setFormActive(true);
    setSelectedMillWorkerId('');
    setFormError(null);
    setModalOpen(true);
  };

  // Open Edit Modal
  const openEditModal = (emp: IotEmployeeRecord) => {
    setEditingEmployee(emp);
    setFormCardId(emp.employeeId);
    setFormName(emp.employeeName);
    setFormDept(emp.department || 'Sider');
    setFormActive(emp.active !== false);
    setFormError(null);

    // Match worker in mill worker master
    const matched = millWorkers.find(w =>
      (emp.tNo && String(w.tNo) === String(emp.tNo)) ||
      (w.name && emp.employeeName.toLowerCase().includes(w.name.toLowerCase()))
    );
    setSelectedMillWorkerId(matched ? matched.id : '');
    setModalOpen(true);
  };

  // Quick pick mill worker in modal
  const handleSelectMillWorker = (workerId: string) => {
    setSelectedMillWorkerId(workerId);
    const w = millWorkers.find(x => x.id === workerId);
    if (w) {
      const cleanName = w.name.trim();
      const ticket = w.tNo ? `(${w.tNo})` : '';
      setFormName(`${cleanName}${ticket}`);
      if (w.department) setFormDept(w.department);
    }
  };

  // Save single employee mapping
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanCardId = formCardId.trim();
    const cleanName = formName.trim();

    if (!cleanCardId) {
      setFormError('RFID Card ID is required');
      return;
    }
    if (!cleanName) {
      setFormError('Employee name is required');
      return;
    }

    setFormSaving(true);
    try {
      const res = await fetch('/api/iot/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: cleanCardId,
          employeeName: cleanName,
          name: cleanName,
          department: formDept,
          active: formActive
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to save employee');
      }

      setModalOpen(false);
      await loadData(true);
      if (onRefreshWorkers) onRefreshWorkers();
    } catch (err: any) {
      setFormError(err.message || 'Error saving employee');
    } finally {
      setFormSaving(false);
    }
  };

  // Delete employee mapping
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/iot/employees?employeeId=${encodeURIComponent(deleteTarget.employeeId)}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Failed to delete employee');
      }
      setDeleteTarget(null);
      await loadData(true);
    } catch (err: any) {
      alert(err.message || 'Failed to delete employee');
    } finally {
      setDeleting(false);
    }
  };

  // Toggle active status directly
  const handleToggleActive = async (emp: IotEmployeeRecord) => {
    try {
      await fetch('/api/iot/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          active: !emp.active
        })
      });
      setEmployees(prev => prev.map(item => item.employeeId === emp.employeeId ? { ...item, active: !item.active } : item));
    } catch (err) {
      console.error('Error toggling active status:', err);
    }
  };

  // Run Bulk Import
  const handleRunBulkImport = async () => {
    setBulkError(null);
    setBulkSuccessMsg(null);

    const raw = bulkJsonText.trim();
    if (!raw) {
      setBulkError('Please enter JSON text or key=value mappings');
      return;
    }

    let parsedEntries: Record<string, string> = {};

    try {
      if (raw.startsWith('{')) {
        const json = JSON.parse(raw);
        for (const [k, v] of Object.entries(json)) {
          if (k && v) parsedEntries[String(k).trim()] = String(v).trim();
        }
      } else {
        const lines = raw.split(/\r?\n/);
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
          if (trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const k = trimmed.slice(0, idx).trim();
            const v = trimmed.slice(idx + 1).trim();
            if (k && v) parsedEntries[k] = v;
          } else if (trimmed.includes(':')) {
            const idx = trimmed.indexOf(':');
            const k = trimmed.slice(0, idx).replace(/["']/g, '').trim();
            const v = trimmed.slice(idx + 1).replace(/[",']/g, '').trim();
            if (k && v) parsedEntries[k] = v;
          }
        }
      }

      if (Object.keys(parsedEntries).length === 0) {
        throw new Error('No valid mapping pairs found. Format must be JSON {"id": "Name(Ticket)"} or "id=Name(Ticket)"');
      }

      setBulkImporting(true);
      const res = await fetch('/api/iot/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'bulk_import',
          entries: parsedEntries
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Bulk import failed');
      }

      setBulkSuccessMsg(`Successfully updated ${data.updatedCount || Object.keys(parsedEntries).length} employee mappings!`);
      setTimeout(() => {
        setBulkModalOpen(false);
        setBulkSuccessMsg(null);
        setBulkJsonText('');
      }, 1500);

      await loadData(true);
      if (onRefreshWorkers) onRefreshWorkers();
    } catch (err: any) {
      setBulkError(err.message || 'Failed to parse or import data');
    } finally {
      setBulkImporting(false);
    }
  };

  // Export JSON file
  const handleExportJson = () => {
    const exportMap: Record<string, string> = {};
    for (const emp of employees) {
      if (emp.employeeId && emp.employeeName) {
        exportMap[emp.employeeId] = emp.employeeName;
      }
    }
    const blob = new Blob([JSON.stringify(exportMap, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employee-names-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Filtered employees list
  const filteredEmployees = useMemo(() => {
    let result = employees;

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(e =>
        e.employeeId.toLowerCase().includes(q) ||
        e.employeeName.toLowerCase().includes(q) ||
        (e.tNo && String(e.tNo).toLowerCase().includes(q)) ||
        (e.department && e.department.toLowerCase().includes(q)) ||
        (e.detectedDevices && e.detectedDevices.some(d => d.toLowerCase().includes(q)))
      );
    }

    // Status filter
    if (filterMode === 'active') {
      result = result.filter(e => e.tapStatus === 'ACTIVE');
    } else if (filterMode === 'inactive') {
      result = result.filter(e => e.tapStatus === 'INACTIVE');
    } else if (filterMode === 'unregistered') {
      result = result.filter(e => e.isRegistered === false);
    }

    return result;
  }, [employees, searchTerm, filterMode]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: employees.length,
      activeNow: employees.filter(e => e.tapStatus === 'ACTIVE').length,
      inactive: employees.filter(e => e.tapStatus === 'INACTIVE').length,
      unmapped: unmappedCards.length,
      devicesCount: devices.length
    };
  }, [employees, unmappedCards, devices]);

  return (
    <div className="space-y-6 w-full">
      {/* Top Banner / Header */}
      <div className="bg-white rounded-2xl border border-stone-200/80 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <Radio className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-black text-stone-900 tracking-tight flex items-center gap-2">
                  IoT RFID Employee Mapping
                  <span className="text-[11px] font-bold px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full">
                    Live Telemetry
                  </span>
                </h1>
                <p className="text-xs font-medium text-stone-500 mt-0.5">
                  Displays only RFID cards tapped on hardware devices (IOT_D1, IOT_D2). Status active within 10 minutes of tap.
                </p>
              </div>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => openAddModal()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Register RFID Card
            </button>
            <button
              onClick={() => setBulkModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-stone-900 hover:bg-black active:bg-stone-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              Bulk Import JSON
            </button>
            <button
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition-all border border-stone-200/80 cursor-pointer"
              title="Download employee-names.json"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
            <button
              onClick={() => loadData(false)}
              disabled={refreshing}
              className="inline-flex items-center justify-center w-9 h-9 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition-all border border-stone-200/80 cursor-pointer disabled:opacity-50"
              title="Refresh employee data"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Real Hardware Devices Status Cards (IOT_D1, IOT_D2) */}
        <div className="mt-5 pt-5 border-t border-stone-100">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-stone-700">
              <HardDrive className="w-4 h-4 text-emerald-600" />
              <span>Connected Hardware Devices (Auto-Detected)</span>
            </div>
            <span className="text-[11px] font-semibold text-stone-400">
              Active = Tapped within 10 min | Inactive = &gt;10 min idle
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {devices.map(dev => {
              const isActive = dev.status === 'ACTIVE';
              return (
                <div
                  key={dev.deviceId}
                  className={cn(
                    "p-3.5 rounded-xl border transition-all",
                    isActive
                      ? "bg-emerald-50/70 border-emerald-300 shadow-xs"
                      : "bg-stone-50/80 border-stone-200"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        "w-7 h-7 rounded-lg flex items-center justify-center font-mono font-black text-xs",
                        isActive ? "bg-emerald-600 text-white" : "bg-stone-200 text-stone-700"
                      )}>
                        {dev.deviceId.replace('IOT_', '')}
                      </div>
                      <div>
                        <div className="font-mono font-black text-sm text-stone-900">{dev.deviceId}</div>
                        <div className="text-[10px] text-stone-500 font-semibold">Hardware Telemetry Node</div>
                      </div>
                    </div>

                    <div className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5",
                      isActive
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "bg-stone-200 text-stone-600"
                    )}>
                      <span className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        isActive ? "bg-white animate-pulse" : "bg-stone-400"
                      )} />
                      {isActive ? 'Active' : 'Inactive'}
                    </div>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-stone-200/60 text-xs space-y-1">
                    <div className="flex items-center justify-between text-stone-600">
                      <span className="text-[11px] text-stone-400 font-medium">Last Tap:</span>
                      <span className="font-mono font-bold text-stone-800">
                        {dev.lastTapTime ? `${formatTimeAgo(dev.diffMinutes)} (${new Date(dev.lastTapTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : 'None detected'}
                      </span>
                    </div>
                    {dev.lastEmployeeName && (
                      <div className="flex items-center justify-between text-stone-600">
                        <span className="text-[11px] text-stone-400 font-medium">Operator:</span>
                        <span className="font-semibold text-stone-900 truncate max-w-[150px]">
                          {dev.lastEmployeeName}
                        </span>
                      </div>
                    )}
                    {dev.shift && (
                      <div className="flex items-center justify-between text-stone-600">
                        <span className="text-[11px] text-stone-400 font-medium">Shift:</span>
                        <span className="font-bold text-emerald-700 bg-white px-1.5 py-0.5 rounded border border-stone-200 text-[10px]">
                          Shift {dev.shift} {dev.shiftDate ? `(${dev.shiftDate})` : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-stone-100">
          <div className="bg-stone-50/70 border border-stone-200/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Tapped RFID Cards</div>
            <div className="text-2xl font-black text-stone-900 mt-1">{stats.total}</div>
          </div>
          <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Active (&le; 10m)</div>
            <div className="text-2xl font-black text-emerald-800 mt-1">{stats.activeNow}</div>
          </div>
          <div className="bg-stone-100/60 border border-stone-200/80 rounded-xl p-3">
            <div className="text-[10px] font-bold text-stone-600 uppercase tracking-wider">Inactive (&gt; 10m)</div>
            <div className="text-2xl font-black text-stone-800 mt-1">{stats.inactive}</div>
          </div>
          <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Hardware Devices</div>
            <div className="text-2xl font-black text-blue-800 mt-1">{stats.devicesCount}</div>
          </div>
        </div>
      </div>

      {/* Unmapped Cards Quick Banner */}
      {unmappedCards.length > 0 && (
        <div className="bg-amber-50 border border-amber-200/90 rounded-2xl p-4 shadow-2xs">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-amber-100 rounded-xl text-amber-800 shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xs font-black text-amber-900 uppercase tracking-wider">
                Unregistered RFID Cards Tapped on Devices ({unmappedCards.length})
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                The following RFID cards were tapped on hardware devices during shifts but have not been mapped to an employee name yet. Click to register:
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                {unmappedCards.map(cardId => (
                  <button
                    key={cardId}
                    onClick={() => openAddModal(cardId)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-amber-100/70 active:bg-amber-200/70 text-amber-900 border border-amber-300 rounded-lg text-xs font-mono font-bold shadow-2xs transition-all cursor-pointer"
                  >
                    <span>{cardId}</span>
                    <Plus className="w-3.5 h-3.5 text-amber-700" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by RFID card, employee name, ticket no..."
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-stone-200 rounded-xl text-xs font-medium text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all shadow-2xs"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200/80 self-start sm:self-auto">
          {([
            { id: 'all', label: `All (${employees.length})` },
            { id: 'active', label: `Active (${stats.activeNow})` },
            { id: 'inactive', label: `Inactive (${stats.inactive})` },
            { id: 'unregistered', label: `Unregistered (${stats.unmapped})` }
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setFilterMode(tab.id as any)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all capitalize cursor-pointer",
                filterMode === tab.id
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-800"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main RFID Table */}
      <div className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200/80 text-[10px] font-black text-stone-500 uppercase tracking-wider">
                <th className="py-3 px-4">RFID Card ID</th>
                <th className="py-3 px-4">Employee Display Name</th>
                <th className="py-3 px-4">Ticket / Role</th>
                <th className="py-3 px-4">Detected Devices</th>
                <th className="py-3 px-4">Last Detected Tap</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs font-medium text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400 font-medium">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                    Loading available taped RFID records...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-stone-400">
                    <Users className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                    No RFID cards match your search or filter.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const isActive = emp.tapStatus === 'ACTIVE';
                  const detectedDevs = emp.detectedDevices && emp.detectedDevices.length > 0
                    ? emp.detectedDevices
                    : (emp.lastDevice ? [emp.lastDevice] : []);

                  return (
                    <tr key={emp.employeeId} className="hover:bg-stone-50/60 transition-colors">
                      {/* RFID Card ID */}
                      <td className="py-3.5 px-4 font-mono font-bold text-stone-900 whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 bg-stone-100 hover:bg-stone-200/80 px-2.5 py-1 rounded-lg border border-stone-200/70 transition-all">
                          <Radio className="w-3 h-3 text-emerald-600" />
                          <span>{emp.employeeId}</span>
                          <button
                            onClick={() => copyToClipboard(emp.employeeId)}
                            className="text-stone-400 hover:text-stone-700 ml-1"
                            title="Copy RFID ID"
                          >
                            {copiedId === emp.employeeId ? (
                              <Check className="w-3 h-3 text-emerald-600" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Display Name */}
                      <td className="py-3.5 px-4 font-bold text-stone-900">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{emp.employeeName}</span>
                          {!emp.isRegistered && (
                            <span className="px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300">
                              Unregistered
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Ticket / Department */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {emp.tNo ? (
                            <span className="px-2 py-0.5 rounded-md bg-stone-100 text-stone-700 font-mono font-bold text-[11px] border border-stone-200">
                              TK #{emp.tNo}
                            </span>
                          ) : (
                            <span className="text-stone-400 text-[11px]">—</span>
                          )}
                          <span className="text-[11px] text-stone-500 font-semibold px-2 py-0.5 rounded-md bg-stone-50 border border-stone-200/60">
                            {emp.department || 'Sider'}
                          </span>
                        </div>
                      </td>

                      {/* Detected Devices (IOT_D1, IOT_D2) */}
                      <td className="py-3.5 px-4">
                        {detectedDevs.length > 0 ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {detectedDevs.map(devId => (
                              <span
                                key={devId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono text-[10px] font-black border border-blue-200"
                              >
                                <HardDrive className="w-2.5 h-2.5 text-blue-600" />
                                {devId}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-stone-400 text-[11px] italic">None</span>
                        )}
                      </td>

                      {/* Last Detected Tap */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {emp.lastTapTime ? (
                          <div>
                            <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-stone-800">
                              <Clock className="w-3 h-3 text-stone-400" />
                              <span>{formatTapTime(emp.lastTapTime)}</span>
                              {emp.lastDevice && (
                                <span className="text-[10px] bg-stone-100 text-stone-600 px-1.5 py-0.2 rounded border border-stone-200">
                                  on {emp.lastDevice}
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-stone-400 font-semibold mt-0.5">
                              {formatTimeAgo(emp.tapAgeMinutes)} · {emp.tapsCount || 0} shift taps
                            </div>
                          </div>
                        ) : (
                          <span className="text-stone-400 text-[11px]">No tap detected</span>
                        )}
                      </td>

                      {/* Status (10-minute rule) */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                          isActive
                            ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                            : "bg-stone-100 text-stone-500 border-stone-200"
                        )}>
                          <span className={cn(
                            "w-1.5 h-1.5 rounded-full",
                            isActive ? "bg-emerald-500 animate-pulse" : "bg-stone-400"
                          )} />
                          {isActive ? 'Active (<= 10m)' : 'Inactive (> 10m)'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(emp)}
                            className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-600 hover:text-stone-900 transition-colors cursor-pointer"
                            title="Edit mapping"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(emp)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-stone-400 hover:text-red-600 transition-colors cursor-pointer"
                            title="Delete mapping"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-stone-900">
                    {editingEmployee ? 'Edit Employee RFID Mapping' : 'Register Tapped RFID Card'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    {editingEmployee ? `Update ID: ${editingEmployee.employeeId}` : 'Map an RFID card detected on hardware devices'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="p-5 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                  {formError}
                </div>
              )}

              {/* RFID Card ID Selector / Input */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  RFID Card ID <span className="text-red-500">*</span>
                </label>
                {!editingEmployee && unmappedCards.length > 0 ? (
                  <div className="space-y-2">
                    <select
                      value={formCardId}
                      onChange={e => setFormCardId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    >
                      <option value="">-- Choose Detected Unmapped Card --</option>
                      {unmappedCards.map(cId => (
                        <option key={cId} value={cId}>
                          {cId} (Tapped on device)
                        </option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={formCardId}
                      onChange={e => setFormCardId(e.target.value)}
                      placeholder="Or enter RFID number manually"
                      className="w-full px-3.5 py-2 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 focus:outline-none"
                    />
                  </div>
                ) : (
                  <input
                    type="text"
                    value={formCardId}
                    onChange={e => setFormCardId(e.target.value)}
                    placeholder="e.g. 3157579526"
                    disabled={!!editingEmployee}
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:opacity-60"
                    required
                  />
                )}
              </div>

              {/* Auto-detected devices & Last tap info in Edit mode */}
              {editingEmployee && (
                <div className="p-3 bg-stone-50 rounded-xl border border-stone-200 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-stone-500 uppercase">Detected Devices (API):</span>
                    <div className="flex items-center gap-1">
                      {editingEmployee.detectedDevices && editingEmployee.detectedDevices.length > 0 ? (
                        editingEmployee.detectedDevices.map(d => (
                          <span key={d} className="px-2 py-0.5 rounded bg-blue-100 text-blue-800 font-mono text-[10px] font-black">
                            {d}
                          </span>
                        ))
                      ) : (
                        <span className="font-mono text-stone-600">{editingEmployee.lastDevice || 'None'}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-stone-500 uppercase">Last Tap Detected:</span>
                    <span className="font-mono font-bold text-stone-800">
                      {formatTapTime(editingEmployee.lastTapTime)}
                    </span>
                  </div>
                </div>
              )}

              {/* Quick-Pick Mill Worker Helper */}
              {millWorkers.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Auto-Fill from Mill Worker Master</span>
                    <span className="text-[10px] text-emerald-600 font-bold">Recommended</span>
                  </label>
                  <select
                    value={selectedMillWorkerId}
                    onChange={e => handleSelectMillWorker(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="">-- Choose a Spinning Sider --</option>
                    {millWorkers.map(w => (
                      <option key={w.id} value={w.id}>
                        {w.name} {w.tNo ? `(TK #${w.tNo})` : ''} - {w.department || 'Sider'}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Employee Display Name */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Sambari(24673) or Mangal(33786)"
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  required
                />
                <p className="text-[10px] text-stone-500 mt-1">
                  Format: <code>Name(TicketNumber)</code> enables automatic ticket parsing across all reports.
                </p>
              </div>

              {/* Department */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Department
                  </label>
                  <select
                    value={formDept}
                    onChange={e => setFormDept(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-semibold text-stone-900 focus:outline-none"
                  >
                    <option value="Sider">Sider</option>
                    <option value="Gaiter">Gaiter</option>
                    <option value="AI Linkconer">AI Linkconer</option>
                    <option value="Fitter">Fitter</option>
                    <option value="Oiler">Oiler</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                    Active Status
                  </label>
                  <button
                    type="button"
                    onClick={() => setFormActive(!formActive)}
                    className={cn(
                      "w-full px-3.5 py-2.5 rounded-xl text-xs font-bold border flex items-center justify-center gap-2 transition-all cursor-pointer",
                      formActive
                        ? "bg-emerald-50 text-emerald-800 border-emerald-300"
                        : "bg-stone-100 text-stone-500 border-stone-200"
                    )}
                  >
                    <span className={cn("w-2 h-2 rounded-full", formActive ? "bg-emerald-500" : "bg-stone-400")} />
                    {formActive ? 'Active in System' : 'Inactive'}
                  </button>
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-[11px] text-blue-800 flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Hardware devices (IOT_D1, IOT_D2) and tap activities are automatically detected from the live telemetry API for each shift completed.
                </span>
              </div>

              {/* Form Actions */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSaving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {formSaving ? 'Saving...' : editingEmployee ? 'Update Mapping' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Import JSON Modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-stone-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-stone-900 text-white flex items-center justify-center font-bold">
                  <FileJson className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-stone-900">
                    Bulk Import Employee Names JSON
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    Paste raw JSON mapping or key=value lines matching employee-names.json
                  </p>
                </div>
              </div>
              <button
                onClick={() => setBulkModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {bulkError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs font-semibold rounded-xl">
                  {bulkError}
                </div>
              )}
              {bulkSuccessMsg && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold rounded-xl flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {bulkSuccessMsg}
                </div>
              )}

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-stone-700 uppercase tracking-wider">
                  <span>Input JSON or Key=Value</span>
                  <button
                    type="button"
                    onClick={() => {
                      setBulkJsonText(`{\n  "3157579526": "Sambari(24673)",\n  "562288134": "Mangal(33786)",\n  "2717865393": "Operator(27178)"\n}`);
                    }}
                    className="text-[10px] text-emerald-600 hover:text-emerald-700 lowercase font-bold"
                  >
                    Insert Example
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={bulkJsonText}
                  onChange={e => setBulkJsonText(e.target.value)}
                  placeholder={`{\n  "3157579526": "Sambari(24673)",\n  "562288134": "Mangal(33786)"\n}\n\n// OR line-by-line:\n3157579526=Sambari(24673)\n562288134=Mangal(33786)`}
                  className="w-full p-3.5 bg-stone-900 text-emerald-400 font-mono text-xs rounded-xl border border-stone-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-xs text-stone-600 space-y-1">
                <p className="font-bold text-stone-800">Supported Formats:</p>
                <p>1. JSON object: <code>{`{"3157579526": "Sambari(24673)"}`}</code></p>
                <p>2. Key=Value lines: <code>3157579526=Sambari(24673)</code></p>
                <p className="text-[11px] text-stone-500">
                  Note: Existing employees with these RFID IDs will have their names updated and propagated to all assigned machines automatically.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
                <button
                  type="button"
                  onClick={() => setBulkModalOpen(false)}
                  className="px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleRunBulkImport}
                  disabled={bulkImporting}
                  className="px-5 py-2 bg-stone-900 hover:bg-black active:bg-stone-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {bulkImporting ? 'Importing...' : 'Update Mappings'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl border border-stone-200 shadow-2xl max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-black text-stone-900">Delete Employee Mapping?</h3>
              <p className="text-xs text-stone-500 mt-1">
                Are you sure you want to remove RFID mapping for <strong>{deleteTarget.employeeName}</strong> ({deleteTarget.employeeId})?
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
