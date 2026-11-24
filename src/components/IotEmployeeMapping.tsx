'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users, Search, Plus, Upload, Download, RefreshCw, Edit2, Trash2,
  CheckCircle2, XCircle, AlertTriangle, Cpu, Radio, Shield, Copy,
  Check, ArrowRight, Layers, FileJson, Sparkles, Filter, X
} from 'lucide-react';
import { Sider } from '@/types';
import { DeviceHealth } from '@/types/iot';
import { cn } from '@/lib/utils';

export interface IotEmployeeRecord {
  _id?: string;
  employeeId: string;
  employeeName: string;
  name?: string;
  department?: string;
  tNo?: string | null;
  active: boolean;
  assignedDeviceIds: string[];
  assignedDevices?: Array<{ deviceId: string; machineId?: string; side?: string }>;
  lastSeen?: string | null;
  lastLoginAt?: string | null;
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
  const [unmappedCards, setUnmappedCards] = useState<string[]>([]);
  const [availableDevices, setAvailableDevices] = useState<DeviceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active' | 'inactive' | 'assigned' | 'unassigned'>('all');

  // Add / Edit Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<IotEmployeeRecord | null>(null);
  const [formCardId, setFormCardId] = useState('');
  const [formName, setFormName] = useState('');
  const [formDept, setFormDept] = useState('Sider');
  const [formActive, setFormActive] = useState(true);
  const [formDeviceIds, setFormDeviceIds] = useState<string[]>([]);
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

  // Load employee mappings and devices
  const loadData = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    setRefreshing(true);
    try {
      const [empRes, devRes] = await Promise.all([
        fetch('/api/iot/employees', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ success: false })),
        fetch('/api/iot/master/devices', { cache: 'no-store' }).then(r => r.json()).catch(() => ({ success: false }))
      ]);

      if (empRes?.success && Array.isArray(empRes.data)) {
        setEmployees(empRes.data);
        if (Array.isArray(empRes.unmappedCards)) {
          setUnmappedCards(empRes.unmappedCards);
        }
      }

      if (devRes?.success && Array.isArray(devRes.data)) {
        setAvailableDevices(devRes.data);
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
  }, []);

  const copyToClipboard = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedId(text);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Open Add Modal
  const openAddModal = (presetCardId?: string) => {
    setEditingEmployee(null);
    setFormCardId(presetCardId || '');
    setFormName('');
    setFormDept('Sider');
    setFormActive(true);
    setFormDeviceIds([]);
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
    setFormDeviceIds(emp.assignedDeviceIds || []);
    setFormError(null);

    // Try finding matching mill worker
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

  // Save single employee
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
          active: formActive,
          assignedDeviceIds: formDeviceIds
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

  // Delete employee
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
          active: !emp.active,
          assignedDeviceIds: emp.assignedDeviceIds
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
      // 1. Try JSON parsing
      if (raw.startsWith('{')) {
        const json = JSON.parse(raw);
        for (const [k, v] of Object.entries(json)) {
          if (k && v) parsedEntries[String(k).trim()] = String(v).trim();
        }
      } else {
        // 2. Try line by line key=value format (e.g. 3157579526=Sambari(24673))
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

      setBulkSuccessMsg(`Successfully imported and updated ${data.updatedCount || Object.keys(parsedEntries).length} employee mappings!`);
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

  // Export JSON file (matches employee-names.json)
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
        (e.department && e.department.toLowerCase().includes(q))
      );
    }

    // Status filter
    if (filterMode === 'active') {
      result = result.filter(e => e.active);
    } else if (filterMode === 'inactive') {
      result = result.filter(e => !e.active);
    } else if (filterMode === 'assigned') {
      result = result.filter(e => e.assignedDeviceIds && e.assignedDeviceIds.length > 0);
    } else if (filterMode === 'unassigned') {
      result = result.filter(e => !e.assignedDeviceIds || e.assignedDeviceIds.length === 0);
    }

    return result;
  }, [employees, searchTerm, filterMode]);

  // Statistics
  const stats = useMemo(() => {
    return {
      total: employees.length,
      active: employees.filter(e => e.active).length,
      assigned: employees.filter(e => e.assignedDeviceIds && e.assignedDeviceIds.length > 0).length,
      unmapped: unmappedCards.length
    };
  }, [employees, unmappedCards]);

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
                    Live System
                  </span>
                </h1>
                <p className="text-xs font-medium text-stone-500 mt-0.5">
                  Link hardware RFID card IDs to employee names, mill ticket numbers, and assigned ring frame devices.
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
              Add RFID Card
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

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-stone-100">
          <div className="bg-stone-50/70 border border-stone-200/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-stone-500 uppercase tracking-wider">Total RFID Cards</div>
            <div className="text-2xl font-black text-stone-900 mt-1">{stats.total}</div>
          </div>
          <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Active Employees</div>
            <div className="text-2xl font-black text-emerald-800 mt-1">{stats.active}</div>
          </div>
          <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-3">
            <div className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">Device Assigned</div>
            <div className="text-2xl font-black text-blue-800 mt-1">{stats.assigned}</div>
          </div>
          <div className={cn(
            "rounded-xl p-3 border",
            stats.unmapped > 0 ? "bg-amber-50/70 border-amber-200/80" : "bg-stone-50/70 border-stone-200/60"
          )}>
            <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider flex items-center justify-between">
              <span>Detected Unmapped</span>
              {stats.unmapped > 0 && <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />}
            </div>
            <div className="text-2xl font-black text-amber-900 mt-1">{stats.unmapped}</div>
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
                Unregistered RFID Cards Tapped on Machines ({unmappedCards.length})
              </h2>
              <p className="text-xs text-amber-800 mt-0.5">
                The following RFID card IDs were tapped on machine devices during recent shifts but have not been assigned to an employee name yet:
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
          {(['all', 'active', 'inactive', 'assigned', 'unassigned'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setFilterMode(mode)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all capitalize cursor-pointer",
                filterMode === mode
                  ? "bg-white text-stone-900 shadow-2xs"
                  : "text-stone-500 hover:text-stone-800"
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white rounded-2xl border border-stone-200/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50/80 border-b border-stone-200/80 text-[10px] font-black text-stone-500 uppercase tracking-wider">
                <th className="py-3 px-4">RFID Card ID</th>
                <th className="py-3 px-4">Employee Display Name</th>
                <th className="py-3 px-4">Ticket / Role</th>
                <th className="py-3 px-4">Assigned Devices</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs font-medium text-stone-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-400 font-medium">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-600 mb-2" />
                    Loading IoT employee mappings...
                  </td>
                </tr>
              ) : filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-stone-400">
                    <Users className="w-8 h-8 mx-auto text-stone-300 mb-2" />
                    No RFID employees match your search or filter.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const hasDevices = emp.assignedDeviceIds && emp.assignedDeviceIds.length > 0;
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
                          {emp.loginStatus === 'LOGGED_IN' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-ping" />
                              Logged In
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

                      {/* Assigned Devices */}
                      <td className="py-3.5 px-4">
                        {hasDevices ? (
                          <div className="flex flex-wrap gap-1 max-w-xs">
                            {emp.assignedDeviceIds.map(devId => (
                              <span
                                key={devId}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-mono text-[10px] font-bold border border-blue-200"
                              >
                                <Cpu className="w-2.5 h-2.5" />
                                {devId}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-stone-400 text-[11px] italic">Not assigned</span>
                        )}
                      </td>

                      {/* Active Toggle Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleActive(emp)}
                          className={cn(
                            "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer",
                            emp.active
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                              : "bg-stone-100 text-stone-500 border border-stone-200 hover:bg-stone-200"
                          )}
                        >
                          <span className={cn("w-1.5 h-1.5 rounded-full", emp.active ? "bg-emerald-500" : "bg-stone-400")} />
                          {emp.active ? 'Active' : 'Inactive'}
                        </button>
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
                    {editingEmployee ? 'Edit Employee RFID Mapping' : 'Add New Employee RFID Mapping'}
                  </h3>
                  <p className="text-[11px] text-stone-500">
                    {editingEmployee ? `Update ID: ${editingEmployee.employeeId}` : 'Register a new RFID card number'}
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

              {/* RFID Card ID */}
              <div>
                <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5">
                  RFID Card ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formCardId}
                  onChange={e => setFormCardId(e.target.value)}
                  placeholder="e.g. 3157579526"
                  disabled={!!editingEmployee}
                  className="w-full px-3.5 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-xs font-mono font-bold text-stone-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:opacity-60"
                  required
                />
              </div>

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

              {/* Assigned Devices (IoT hardware nodes) */}
              {availableDevices.length > 0 && (
                <div>
                  <label className="block text-xs font-bold text-stone-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Assigned Hardware Devices ({formDeviceIds.length} selected)</span>
                    <button
                      type="button"
                      onClick={() => setFormDeviceIds([])}
                      className="text-[10px] text-stone-500 hover:text-stone-800 font-semibold"
                    >
                      Clear Selection
                    </button>
                  </label>
                  <div className="max-h-36 overflow-y-auto p-2 bg-stone-50 border border-stone-200 rounded-xl grid grid-cols-2 gap-1.5">
                    {availableDevices.map(dev => {
                      const isSelected = formDeviceIds.includes(dev.deviceId);
                      return (
                        <button
                          key={dev.deviceId}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setFormDeviceIds(formDeviceIds.filter(id => id !== dev.deviceId));
                            } else {
                              setFormDeviceIds([...formDeviceIds, dev.deviceId]);
                            }
                          }}
                          className={cn(
                            "px-2.5 py-1.5 rounded-lg text-left text-[11px] font-mono font-bold flex items-center justify-between border transition-all cursor-pointer",
                            isSelected
                              ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                              : "bg-white text-stone-700 border-stone-200/80 hover:bg-stone-100"
                          )}
                        >
                          <span className="truncate">{dev.deviceId}</span>
                          {dev.machineId && (
                            <span className={cn("text-[9px] font-sans px-1 rounded", isSelected ? "bg-emerald-800 text-white" : "text-stone-500")}>
                              {dev.machineId}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

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
                    Paste raw JSON mapping or key=value lines from employee-names.json
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
                      setBulkJsonText(`{\n  "3157579526": "Sambari(24673)",\n  "562288134": "Mangal(33786)",\n  "621665542": "Rahul(34257)"\n}`);
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
                This will unassign this card from all devices.
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
