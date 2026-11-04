'use client';

import React, { useState, useEffect } from 'react';
import { Shift } from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import { SAMPLE_SHIFTS } from '@/lib/iot/sampleIotData';
import {
  Clock, Plus, Edit2, Trash2, CheckCircle2, AlertCircle, Save, X, RefreshCw
} from 'lucide-react';

export const IotShifts: React.FC = () => {
  const [shifts, setShifts] = useState<Shift[]>(() => SAMPLE_SHIFTS);
  const [editingId, setEditingId] = useState('');
  const [modalOpen, setModalOpen] = useState(false);

  const [form, setForm] = useState<Omit<Shift, 'shiftId'>>({
    name: '',
    startTime: '06:00',
    endTime: '14:00',
    overnight: false
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadShifts = async () => {
    setLoading(true);
    try {
      const data = await iotApi.getShifts();
      setShifts(data);
    } catch (err) {
      console.error('Failed to load shifts:', err);
      setErrorMessage('Could not load shifts from storage.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const openNew = () => {
    setEditingId('');
    setForm({ name: '', startTime: '06:00', endTime: '14:00', overnight: false });
    setModalOpen(true);
  };

  const openEdit = (shift: Shift) => {
    setEditingId(shift.shiftId);
    setForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      overnight: !!shift.overnight
    });
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.startTime || !form.endTime) return;
    setSaving(true);
    try {
      const updated = await iotApi.saveShift(form, editingId || undefined);
      if (editingId) {
        setShifts(prev => prev.map(s => s.shiftId === editingId ? updated : s));
        setMessage(`Shift "${updated.name}" updated successfully.`);
      } else {
        setShifts(prev => [...prev, updated]);
        setMessage(`Shift "${updated.name}" created successfully.`);
      }
      setModalOpen(false);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setErrorMessage('Failed to save shift.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (shift: Shift) => {
    if (!window.confirm(`Delete shift "${shift.name}"? This action cannot be undone.`)) return;
    try {
      await iotApi.deleteShift(shift.shiftId);
      setShifts(prev => prev.filter(s => s.shiftId !== shift.shiftId));
      setMessage(`Shift "${shift.name}" deleted.`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setErrorMessage('Failed to delete shift.');
    }
  };

  return (
    <div className="dashboard-page w-full space-y-5 pb-10">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-700 bg-cyan-50 px-2.5 py-0.5 rounded-full border border-cyan-200">
              Mill Master
            </span>
            <span className="text-stone-300">/</span>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
              Shift Timings
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight mt-1">
            Shift Timing Configuration
          </h1>
          <p className="text-xs text-stone-500">
            Configure shift windows, overnight flags, and rotational shift schedules for ring frame operations
          </p>
        </div>

        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
        >
          <Plus size={14} className="text-cyan-400" />
          <span>Add New Shift</span>
        </button>
      </div>

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

      {/* Shifts Table Card */}
      <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100">
          <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
            Active Shifts ({shifts.length})
          </h2>
          <span className="text-xs text-stone-500">
            Standard 8-Hour Operational Cycles
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-[10px] font-black uppercase text-stone-400">
                <th className="pb-3">Shift Name</th>
                <th className="pb-3">Start Time</th>
                <th className="pb-3">End Time</th>
                <th className="pb-3">Overnight Flag</th>
                <th className="pb-3">Duration</th>
                <th className="pb-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {shifts.map(shift => (
                <tr key={shift.shiftId} className="hover:bg-stone-50">
                  <td className="py-3 font-black text-stone-900 text-sm">{shift.name}</td>
                  <td className="py-3 font-mono font-bold text-stone-800">{shift.startTime}</td>
                  <td className="py-3 font-mono font-bold text-stone-800">{shift.endTime}</td>
                  <td className="py-3">
                    {shift.overnight ? (
                      <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-violet-100 text-violet-800 border border-violet-200">
                        Overnight
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase bg-stone-100 text-stone-600">
                        Day Cycle
                      </span>
                    )}
                  </td>
                  <td className="py-3 font-mono text-stone-600">8.0 hrs</td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openEdit(shift)}
                        className="p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(shift)}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Shift Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <form onSubmit={handleSave} className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-black text-stone-900">
                {editingId ? 'Edit Shift' : 'Create New Shift'}
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
                <label className="font-bold text-stone-700 block mb-1">Shift Name</label>
                <input
                  type="text"
                  placeholder="e.g. Shift 1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-stone-700 block mb-1">Start Time</label>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                    required
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold"
                  />
                </div>

                <div>
                  <label className="font-bold text-stone-700 block mb-1">End Time</label>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                    required
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.overnight}
                    onChange={(e) => setForm({ ...form, overnight: e.target.checked })}
                    className="rounded text-cyan-600 focus:ring-cyan-500 w-4 h-4 cursor-pointer"
                  />
                  <span className="font-bold text-stone-700">Overnight Shift (crosses midnight)</span>
                </label>
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
                className="px-5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs cursor-pointer"
              >
                {saving ? 'Saving...' : editingId ? 'Update Shift' : 'Add Shift'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

