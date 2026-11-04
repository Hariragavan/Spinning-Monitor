'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Machine, DeviceHealth, MaintenanceEntry } from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  SAMPLE_MACHINES,
  SAMPLE_DEVICES,
  SAMPLE_MAINTENANCE
} from '@/lib/iot/sampleIotData';
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, Plus, Wrench, CheckCircle2,
  Clock, AlertCircle, X, Check, Save, User, RefreshCw
} from 'lucide-react';

export const IotMaintenance: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>(() => SAMPLE_MACHINES);
  const [devices, setDevices] = useState<DeviceHealth[]>(() => SAMPLE_DEVICES);
  const [entries, setEntries] = useState<MaintenanceEntry[]>(() => SAMPLE_MAINTENANCE);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  // Modal / Form state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [form, setForm] = useState<Omit<MaintenanceEntry, 'maintenanceId'>>({
    type: 'preventive',
    machineId: '',
    deviceId: '',
    scheduledDate: new Date().toISOString().slice(0, 10),
    assignedPerson: '',
    status: 'planned',
    completionDate: '',
    notes: ''
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, d, e] = await Promise.all([
        iotApi.getMachines(),
        iotApi.getDevices(),
        iotApi.getMaintenance()
      ]);
      setMachines(m);
      setDevices(d);
      setEntries(e);
      if (m.length && !form.machineId) {
        setForm(prev => ({ ...prev, machineId: m[0].machineId }));
      }
    } catch (err) {
      console.error('Failed to load maintenance:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Calendar helpers
  const monthLabel = useMemo(() => {
    return currentMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }, [currentMonth]);

  const previousMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const start = new Date(firstDay);
    start.setDate(firstDay.getDate() - firstDay.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const d = new Date(start);
      d.setDate(start.getDate() + index);
      return d;
    });
  }, [currentMonth]);

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const dateKey = (d: Date | string) => {
    if (d instanceof Date) {
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    const match = d?.match(/^\d{4}-\d{2}-\d{2}/);
    return match ? match[0] : '';
  };

  const entriesForDay = (day: Date) => {
    const key = dateKey(day);
    return entries.filter(e => dateKey(e.scheduledDate) === key);
  };

  const openNewForDay = (day: Date) => {
    setEditingId('');
    setForm({
      type: 'preventive',
      machineId: machines[0]?.machineId || 'RF01',
      deviceId: '',
      scheduledDate: dateKey(day),
      assignedPerson: '',
      status: 'planned',
      completionDate: '',
      notes: ''
    });
    setModalOpen(true);
  };

  const openEdit = (entry: MaintenanceEntry) => {
    setEditingId(entry.maintenanceId);
    setForm({
      type: entry.type,
      machineId: entry.machineId,
      deviceId: entry.deviceId || '',
      scheduledDate: entry.scheduledDate.slice(0, 10),
      assignedPerson: entry.assignedPerson,
      status: entry.status,
      completionDate: entry.completionDate || '',
      notes: entry.notes || ''
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.machineId || !form.scheduledDate || !form.assignedPerson) return;
    setSaving(true);
    try {
      const updated = await iotApi.saveMaintenance(form, editingId || undefined);
      if (editingId) {
        setEntries(prev => prev.map(m => m.maintenanceId === editingId ? updated : m));
      } else {
        setEntries(prev => [updated, ...prev]);
      }
      setModalOpen(false);
      setMessage('Maintenance record saved successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      console.error('Failed to save maintenance:', err);
    } finally {
      setSaving(false);
    }
  };

  // Mark completed shortcut
  const markCompleted = async (entry: MaintenanceEntry) => {
    const today = new Date().toISOString().slice(0, 10);
    try {
      const updated = await iotApi.saveMaintenance({
        ...entry,
        status: 'completed',
        completionDate: today
      }, entry.maintenanceId);
      setEntries(prev => prev.map(m => m.maintenanceId === entry.maintenanceId ? updated : m));
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  return (
    <div className="dashboard-page w-full space-y-5 pb-10">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200">
              Plant Engineering
            </span>
            <span className="text-stone-300">/</span>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
              Asset Reliability
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight mt-1">
            Maintenance & Cleaning Calendar
          </h1>
          <p className="text-xs text-stone-500">
            Schedule preventive inspections, electrical calibrations, ring rail servicing and cleaning cycles
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setEditingId('');
              setForm({
                type: 'preventive',
                machineId: machines[0]?.machineId || 'RF01',
                deviceId: '',
                scheduledDate: new Date().toISOString().slice(0, 10),
                assignedPerson: '',
                status: 'planned',
                completionDate: '',
                notes: ''
              });
              setModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
          >
            <Plus size={14} />
            <span>Schedule Maintenance</span>
          </button>
        </div>
      </div>

      {message && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {/* Calendar Card */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-5">
        {/* Month Navigation */}
        <div className="flex items-center justify-between pb-4 border-b border-stone-100">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-2xl border border-amber-200">
              <CalendarIcon size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-stone-900 tracking-tight">
                {monthLabel}
              </h2>
              <span className="text-xs text-stone-500 font-medium">
                {entries.length} total scheduled tasks
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={previousMonth}
              className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
              className="px-3 py-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 gap-1 text-center font-black uppercase text-[10px] text-stone-400 tracking-wider">
          {dayNames.map(d => (
            <div key={d} className="py-2">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1.5">
          {calendarDays.map((day, idx) => {
            const isCurMonth = day.getMonth() === currentMonth.getMonth();
            const isToday = day.toDateString() === new Date().toDateString();
            const dayEntries = entriesForDay(day);

            return (
              <div
                key={idx}
                onClick={() => openNewForDay(day)}
                className={`min-h-[95px] p-2 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between group ${
                  isToday
                    ? 'bg-amber-50/60 border-amber-300 ring-1 ring-amber-400/30'
                    : isCurMonth
                    ? 'bg-stone-50/70 border-stone-200/80 hover:bg-white hover:border-amber-300'
                    : 'bg-stone-50/30 border-stone-100 text-stone-300 opacity-60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-mono font-bold ${
                    isToday ? 'w-5 h-5 rounded-full bg-amber-600 text-white flex items-center justify-center font-black text-[11px]' : 'text-stone-700'
                  }`}>
                    {day.getDate()}
                  </span>
                  {dayEntries.length > 0 && (
                    <span className="text-[9px] font-black text-amber-700 font-mono">
                      {dayEntries.length} task{dayEntries.length > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {/* Entry badges */}
                <div className="space-y-1 mt-1 overflow-hidden">
                  {dayEntries.slice(0, 2).map(e => (
                    <div
                      key={e.maintenanceId}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openEdit(e);
                      }}
                      className={`px-1.5 py-0.5 rounded-lg text-[9.5px] font-bold truncate flex items-center justify-between border ${
                        e.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-900 border-emerald-200'
                          : e.type === 'electrical'
                          ? 'bg-blue-100 text-blue-900 border-blue-200'
                          : 'bg-amber-100 text-amber-900 border-amber-200'
                      }`}
                    >
                      <span className="truncate">{e.machineId} · {e.title || e.type}</span>
                    </div>
                  ))}
                  {dayEntries.length > 2 && (
                    <span className="text-[9px] text-stone-400 font-bold block">
                      +{dayEntries.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Task List Table */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-4">
        <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
          All Maintenance Tasks ({entries.length})
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-[10px] font-black uppercase text-stone-400">
                <th className="pb-3">Machine</th>
                <th className="pb-3">Type</th>
                <th className="pb-3">Title / Task</th>
                <th className="pb-3">Scheduled</th>
                <th className="pb-3">Assigned Person</th>
                <th className="pb-3">Status</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {entries.map(e => (
                <tr key={e.maintenanceId} className="hover:bg-stone-50">
                  <td className="py-3 font-black text-stone-900">{e.machineId}</td>
                  <td className="py-3 font-bold uppercase text-[10px]">
                    <span className={`px-2 py-0.5 rounded-md ${e.type === 'electrical' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>
                      {e.type}
                    </span>
                  </td>
                  <td className="py-3 text-stone-700 font-medium">{e.title || 'Routine Maintenance'}</td>
                  <td className="py-3 font-mono text-stone-600">{e.scheduledDate}</td>
                  <td className="py-3 font-bold text-stone-800">{e.assignedPerson}</td>
                  <td className="py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      e.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-stone-100 text-stone-700'
                    }`}>
                      {e.status}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {e.status !== 'completed' && (
                        <button
                          onClick={() => markCompleted(e)}
                          title="Mark as Completed"
                          className="px-2.5 py-1 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-[10px] cursor-pointer flex items-center gap-1"
                        >
                          <Check size={11} />
                          <span>Complete</span>
                        </button>
                      )}
                      <button
                        onClick={() => openEdit(e)}
                        className="px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[10px] cursor-pointer"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Schedule / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <form onSubmit={handleSave} className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-black text-stone-900">
                {editingId ? 'Edit Maintenance Task' : 'Schedule Maintenance'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Machine</label>
                <select
                  value={form.machineId}
                  onChange={(e) => setForm(prev => ({ ...prev, machineId: e.target.value }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold cursor-pointer"
                >
                  {machines.map(m => (
                    <option key={m.machineId} value={m.machineId}>{m.machineName} ({m.machineId})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Maintenance Type</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold cursor-pointer"
                >
                  <option value="preventive">Preventive Maintenance</option>
                  <option value="electrical">Electrical / Inverter Service</option>
                  <option value="cleaning">Bi-Weekly Deep Cleaning</option>
                </select>
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Task Title / Notes</label>
                <input
                  type="text"
                  placeholder="e.g. Ring rail alignment & apron replacement"
                  value={form.title || ''}
                  onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Scheduled Date</label>
                  <input
                    type="date"
                    value={form.scheduledDate}
                    onChange={(e) => setForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                    required
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Assigned Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Senthil (Fitter)"
                    value={form.assignedPerson}
                    onChange={(e) => setForm(prev => ({ ...prev, assignedPerson: e.target.value }))}
                    required
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value }))}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold cursor-pointer"
                  >
                    <option value="planned">Planned</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">Completion Date (optional)</label>
                  <input
                    type="date"
                    value={form.completionDate || ''}
                    onChange={(e) => setForm(prev => ({ ...prev, completionDate: e.target.value }))}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-stone-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer"
              >
                {saving ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

