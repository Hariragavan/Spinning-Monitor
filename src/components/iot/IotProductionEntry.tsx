'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  MachineMapping,
  Shift,
  Employee,
  ProductionReportRow,
  ProductionEntryInput
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  SAMPLE_MAPPINGS,
  SAMPLE_SHIFTS,
  SAMPLE_EMPLOYEES,
  SAMPLE_PRODUCTION_ENTRIES
} from '@/lib/iot/sampleIotData';
import {
  FileText, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, RefreshCw,
  Clock, Calendar, Users, Gauge, Download, X, Save
} from 'lucide-react';

export const IotProductionEntry: React.FC = () => {
  const [machines, setMachines] = useState<MachineMapping[]>(() => SAMPLE_MAPPINGS);
  const [shifts, setShifts] = useState<Shift[]>(() => SAMPLE_SHIFTS);
  const [employees, setEmployees] = useState<Employee[]>(() => SAMPLE_EMPLOYEES);
  const [todayEntries, setTodayEntries] = useState<ProductionReportRow[]>(() => SAMPLE_PRODUCTION_ENTRIES);

  // Form state
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftId, setShiftId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [speed, setSpeed] = useState<number | ''>(16700);
  const [counts, setCounts] = useState<number | ''>(40);
  const [productionOutput, setProductionOutput] = useState<number | ''>('');
  const [wastePercent, setWastePercent] = useState<number | ''>(1.4);
  const [runtimeMinutes, setRuntimeMinutes] = useState<number | ''>(460);
  const [notes, setNotes] = useState('');

  // Status feedback
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Edit Modal
  const [editingRow, setEditingRow] = useState<ProductionReportRow | null>(null);
  const [editForm, setEditForm] = useState({
    speed: 0,
    counts: 0,
    productionOutput: 0,
    wastePercent: 0,
    notes: ''
  });

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const [shfs, emps, maps, entries] = await Promise.all([
        iotApi.getShifts(),
        iotApi.getEmployees(),
        iotApi.getMachineMappings(),
        iotApi.getProductionReport({ date: shiftDate })
      ]);
      setShifts(shfs);
      setEmployees(emps);
      setMachines(maps);
      setTodayEntries(entries);

      if (shfs.length && !shiftId) setShiftId(shfs[0].shiftId);
      if (maps.length && !machineId) setMachineId(maps[0].mappingId);
      if (emps.length && !employeeId) setEmployeeId(emps[0].employeeId);
    } catch (err) {
      console.error('Failed to load initial production data:', err);
      setErrorMessage('Could not load configuration data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, [shiftDate]);

  // Check recent entry warning (<45 mins)
  const recentEntryWarning = useMemo(() => {
    if (!machineId || !todayEntries.length) return false;
    const sameMach = todayEntries.filter(e => e.machineId === machineId);
    if (!sameMach.length) return false;
    const last = sameMach[0];
    const diff = (Date.now() - new Date(last.enteredAt).getTime()) / 60000;
    return diff < 45;
  }, [machineId, todayEntries]);

  // Submit new entry
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machineId || !shiftId || !employeeId || productionOutput === '') {
      setErrorMessage('Please fill in all required fields.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setMessage('');

    const emp = employees.find(e => e.employeeId === employeeId);

    const input: ProductionEntryInput = {
      date: shiftDate,
      shiftId,
      machineId,
      employeeId,
      employeeName: emp?.employeeName || employeeId,
      counts: counts !== '' ? Number(counts) : null,
      speed: speed !== '' ? Number(speed) : null,
      productionOutput: Number(productionOutput),
      targetOutput: 98.4,
      wastePercent: wastePercent !== '' ? Number(wastePercent) : 1.4,
      runtimeMinutes: runtimeMinutes !== '' ? Number(runtimeMinutes) : 460,
      notes
    };

    try {
      const created = await iotApi.createProductionEntry(input);
      setTodayEntries(prev => [created, ...prev]);
      setMessage(`Production entry logged successfully for ${machineId}.`);
      setProductionOutput('');
      setNotes('');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error('Failed to create entry:', err);
      setErrorMessage('Failed to save production entry.');
    } finally {
      setSaving(false);
    }
  };

  // Open Edit Modal
  const openEdit = (row: ProductionReportRow) => {
    setEditingRow(row);
    setEditForm({
      speed: row.speed || 16700,
      counts: row.counts || 40,
      productionOutput: row.productionOutput || 0,
      wastePercent: row.wastePercent || 1.4,
      notes: row.notes || ''
    });
  };

  // Save Edit
  const handleSaveEdit = async () => {
    if (!editingRow) return;
    try {
      await iotApi.updateProductionEntry(editingRow.entryId, {
        speed: editForm.speed,
        counts: editForm.counts,
        productionOutput: editForm.productionOutput,
        wastePercent: editForm.wastePercent,
        notes: editForm.notes
      });
      setTodayEntries(prev => prev.map(r => r.entryId === editingRow.entryId ? {
        ...r,
        speed: editForm.speed,
        counts: editForm.counts,
        productionOutput: editForm.productionOutput,
        wastePercent: editForm.wastePercent,
        notes: editForm.notes
      } : r));
      setEditingRow(null);
    } catch (err) {
      console.error('Failed to update entry:', err);
    }
  };

  // Delete Entry
  const handleDelete = async (entryId: string) => {
    if (!window.confirm('Delete this production record?')) return;
    try {
      await iotApi.deleteProductionEntry(entryId);
      setTodayEntries(prev => prev.filter(r => r.entryId !== entryId));
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (!todayEntries.length) return;
    const headers = ['Entry ID', 'Date', 'Shift', 'Machine', 'Operator', 'Count', 'Speed (RPM)', 'Output (kg)', 'Waste %', 'Runtime (min)', 'Notes'];
    const rows = todayEntries.map(r => [
      r.entryId,
      r.date,
      r.shiftName || r.shiftId,
      r.machineId,
      r.employeeName,
      r.counts || '',
      r.speed || '',
      r.productionOutput,
      r.wastePercent || '',
      r.runtimeMinutes || '',
      `"${r.notes || ''}"`
    ]);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `production_entries_${shiftDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="dashboard-page w-full space-y-5 pb-10">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Operations & Logs
            </span>
            <span className="text-stone-300">/</span>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
              Floor Data Entry
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight mt-1">
            Shift Production Entry
          </h1>
          <p className="text-xs text-stone-500">
            Log physical frame output (kg), counts, machine velocity and operator shift production
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCsv}
            disabled={!todayEntries.length}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs transition-all cursor-pointer disabled:opacity-40"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {message && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle size={16} className="text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {recentEntryWarning && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold flex items-center gap-2">
          <AlertCircle size={16} className="text-amber-600 shrink-0" />
          <span>Notice: A production entry for {machineId} was already recorded within the last 45 minutes.</span>
        </div>
      )}

      {/* Entry Form Card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-5">
        <h2 className="text-sm font-black uppercase tracking-wider text-stone-900 flex items-center gap-2">
          <Plus size={16} className="text-emerald-600" />
          <span>New Shift Production Record</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Shift Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Date</label>
            <input
              type="date"
              value={shiftDate}
              onChange={(e) => setShiftDate(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Shift Select */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Shift</label>
            <select
              value={shiftId}
              onChange={(e) => setShiftId(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none focus:border-emerald-500 cursor-pointer"
            >
              {shifts.map(s => (
                <option key={s.shiftId} value={s.shiftId}>{s.name} ({s.startTime} - {s.endTime})</option>
              ))}
            </select>
          </div>

          {/* Machine Mapping Select */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Machine Frame</label>
            <select
              value={machineId}
              onChange={(e) => setMachineId(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none focus:border-emerald-500 cursor-pointer"
            >
              {machines.map(m => (
                <option key={m.mappingId} value={m.mappingId}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Operator Select */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Assigned Operator</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none focus:border-emerald-500 cursor-pointer"
            >
              {employees.map(e => (
                <option key={e.employeeId} value={e.employeeId}>{e.employeeName} ({e.employeeId})</option>
              ))}
            </select>
          </div>

          {/* Production Output (kg) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Actual Production Output (kg) *</label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 94.5"
              value={productionOutput}
              onChange={(e) => setProductionOutput(e.target.value === '' ? '' : Number(e.target.value))}
              required
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-black text-stone-900 outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Yarn Count */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Yarn Count (s)</label>
            <input
              type="number"
              placeholder="e.g. 40"
              value={counts}
              onChange={(e) => setCounts(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Speed (RPM) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Spindle Speed (RPM)</label>
            <input
              type="number"
              placeholder="e.g. 16700"
              value={speed}
              onChange={(e) => setSpeed(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Waste % */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Shift Waste %</label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 1.4"
              value={wastePercent}
              onChange={(e) => setWastePercent(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        </div>

        {/* Notes & Submit */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
          <input
            type="text"
            placeholder="Operational notes, doffing remarks, or maintenance reason..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="flex-1 w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2.5 text-xs text-stone-800 outline-none focus:border-emerald-500"
          />

          <button
            type="submit"
            disabled={saving}
            className="w-full sm:w-auto px-6 py-2.5 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-black text-xs shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            <span>Save Production Entry</span>
          </button>
        </div>
      </form>

      {/* Today's Entries Table */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
            Recorded Entries for {shiftDate} ({todayEntries.length})
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-[10px] font-black uppercase text-stone-400">
                <th className="pb-3">Machine</th>
                <th className="pb-3">Shift</th>
                <th className="pb-3">Operator</th>
                <th className="pb-3">Count</th>
                <th className="pb-3">Speed (RPM)</th>
                <th className="pb-3">Output (kg)</th>
                <th className="pb-3">Waste %</th>
                <th className="pb-3">Notes</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {todayEntries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-stone-400 font-medium">
                    No production entries recorded for this date yet. Use the form above to add an entry.
                  </td>
                </tr>
              ) : (
                todayEntries.map((row) => (
                  <tr key={row.entryId} className="hover:bg-stone-50/80">
                    <td className="py-3 font-black text-stone-900">{row.machineId}</td>
                    <td className="py-3 font-bold text-stone-700">{row.shiftName || row.shiftId}</td>
                    <td className="py-3 font-bold text-stone-800">{row.employeeName}</td>
                    <td className="py-3 font-mono text-stone-600">{row.counts ? `${row.counts}s` : '-'}</td>
                    <td className="py-3 font-mono font-bold text-stone-800">{row.speed || '-'}</td>
                    <td className="py-3 font-mono font-black text-emerald-700 text-sm">{row.productionOutput} kg</td>
                    <td className="py-3 font-mono text-stone-600">{row.wastePercent || 1.4}%</td>
                    <td className="py-3 text-stone-500 max-w-[150px] truncate">{row.notes || '-'}</td>
                    <td className="py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(row)}
                          className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(row.entryId)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Entry Modal */}
      {editingRow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-black text-stone-900">
                Edit Entry · {editingRow.machineId}
              </h3>
              <button
                onClick={() => setEditingRow(null)}
                className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Production Output (kg)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editForm.productionOutput}
                  onChange={(e) => setEditForm(prev => ({ ...prev, productionOutput: Number(e.target.value) }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Spindle Speed (RPM)</label>
                <input
                  type="number"
                  value={editForm.speed}
                  onChange={(e) => setEditForm(prev => ({ ...prev, speed: Number(e.target.value) }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Waste %</label>
                <input
                  type="number"
                  step="0.1"
                  value={editForm.wastePercent}
                  onChange={(e) => setEditForm(prev => ({ ...prev, wastePercent: Number(e.target.value) }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Notes</label>
                <input
                  type="text"
                  value={editForm.notes}
                  onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <button
                onClick={() => setEditingRow(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

