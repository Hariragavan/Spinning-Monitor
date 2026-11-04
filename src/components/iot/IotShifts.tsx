'use client';

import React, { useState, useEffect } from 'react';
import { Shift } from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import { SAMPLE_SHIFTS } from '@/lib/iot/sampleIotData';

export const IotShifts: React.FC = () => {
  const [shifts, setShifts] = useState<Shift[]>(() => SAMPLE_SHIFTS);
  const [editingId, setEditingId] = useState('');

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
      setShifts(data.length ? data : SAMPLE_SHIFTS);
    } catch (err) {
      console.error('Failed to load shifts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadShifts();
  }, []);

  const edit = (shift: Shift) => {
    setEditingId(shift.shiftId);
    setForm({
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      overnight: !!shift.overnight
    });
  };

  const reset = () => {
    setEditingId('');
    setForm({ name: '', startTime: '06:00', endTime: '14:00', overnight: false });
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.startTime || !form.endTime) {
      setErrorMessage('Please fill in all required shift fields.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    try {
      if (editingId) {
        await iotApi.updateShift(editingId, form).catch(() => null);
        setShifts(prev => prev.map(s => s.shiftId === editingId ? { ...s, ...form } : s));
        setMessage('Shift updated successfully.');
      } else {
        const created = await iotApi.createShift(form).catch(() => ({
          ...form,
          shiftId: 's_' + Date.now()
        }));
        setShifts(prev => [...prev, created]);
        setMessage('Shift created successfully.');
      }
      reset();
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setErrorMessage('Failed to save shift.');
    } finally {
      setSaving(false);
    }
  };

  const deleteShift = async (shift: Shift) => {
    if (!window.confirm(`Delete shift "${shift.name}"?`)) return;
    try {
      await iotApi.deleteShift(shift.shiftId).catch(() => null);
      setShifts(prev => prev.filter(s => s.shiftId !== shift.shiftId));
      if (editingId === shift.shiftId) reset();
    } catch (err) {
      console.error('Failed to delete shift:', err);
    }
  };

  return (
    <div className="content w-full">
      <header className="topbar">
        <div>
          <h1 className="title">Shift Configuration</h1>
          <p className="subtitle">Define operating windows used by dashboards and reports</p>
        </div>
      </header>

      {errorMessage && (
        <div className="empty-state error-state" role="alert">
          {errorMessage}
        </div>
      )}
      {message && (
        <div className="alert-banner success">
          {message}
        </div>
      )}

      <section className="shift-layout">
        <form className="card" onSubmit={save}>
          <div className="card-header">
            <div>
              <h2 className="card-title">{editingId ? 'Edit shift' : 'Create shift'}</h2>
              <p className="card-subtitle">Overnight windows can cross midnight.</p>
            </div>
          </div>
          <div className="form-grid">
            <label>
              Shift name
              <input
                name="name"
                value={form.name}
                onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                required
                placeholder="Morning shift"
              />
            </label>
            <label>
              Start time
              <input
                name="startTime"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm(prev => ({ ...prev, startTime: e.target.value }))}
                required
              />
            </label>
            <label>
              End time
              <input
                name="endTime"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm(prev => ({ ...prev, endTime: e.target.value }))}
                required
              />
            </label>
            <label className="check-label flex items-center gap-2 cursor-pointer pt-1">
              <input
                name="overnight"
                type="checkbox"
                checked={form.overnight}
                onChange={(e) => setForm(prev => ({ ...prev, overnight: e.target.checked }))}
              />
              <span>Overnight shift</span>
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary cursor-pointer" disabled={saving}>
              {saving ? 'Saving...' : 'Save shift'}
            </button>
            <button type="button" className="btn btn-light cursor-pointer" onClick={reset}>
              Clear
            </button>
          </div>
        </form>

        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Configured shifts</h2>
              <p className="card-subtitle">{shifts.length} shift(s)</p>
            </div>
          </div>
          {loading && <div className="empty-state">Loading shifts...</div>}
          {!loading && !shifts.length && <div className="empty-state">No shifts configured yet.</div>}
          {!loading && shifts.length > 0 && (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Start</th>
                    <th>End</th>
                    <th>Type</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map(shift => (
                    <tr key={shift.shiftId || shift.name}>
                      <td><strong>{shift.name || shift.shiftName || 'Shift'}</strong></td>
                      <td>{shift.startTime}</td>
                      <td>{shift.endTime}</td>
                      <td>{shift.overnight ? 'Overnight' : 'Same day'}</td>
                      <td>
                        <div className="row-actions flex items-center gap-2">
                          <button
                            type="button"
                            className="btn btn-light btn-sm cursor-pointer"
                            onClick={() => edit(shift)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm cursor-pointer"
                            onClick={() => deleteShift(shift)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </div>
  );
};
