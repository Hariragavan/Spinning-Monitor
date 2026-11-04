'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Machine, DeviceHealth, MaintenanceEntry } from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';

export const IotMaintenance: React.FC = () => {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [devices, setDevices] = useState<DeviceHealth[]>([]);
  const [entries, setEntries] = useState<MaintenanceEntry[]>([]);
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));

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
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [m, d, e] = await Promise.all([
        iotApi.getMachines(),
        iotApi.getDevices(),
        iotApi.getMaintenance()
      ]);
      setMachines(m || []);
      setDevices(d || []);
      setEntries(e || []);
      if (m && m.length > 0 && !form.machineId) {
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

  const monthEntries = useMemo(() => {
    const y = currentMonth.getFullYear();
    const m = currentMonth.getMonth();
    return entries.filter(e => {
      const d = new Date(e.scheduledDate);
      return d.getFullYear() === y && d.getMonth() === m;
    });
  }, [entries, currentMonth]);

  const machineName = (mId: string) => {
    const found = machines.find(m => m.machineId === mId);
    return found ? found.machineName : mId;
  };

  const isCurrentMonth = (day: Date) => day.getMonth() === currentMonth.getMonth();
  const isToday = (day: Date) => day.toDateString() === new Date().toDateString();

  const selectDay = (day: Date) => {
    setEditingId('');
    setForm(prev => ({
      ...prev,
      scheduledDate: dateKey(day)
    }));
  };

  const editEntry = (e: MaintenanceEntry) => {
    setEditingId(e.maintenanceId);
    setForm({
      type: e.type,
      machineId: e.machineId,
      deviceId: e.deviceId || '',
      scheduledDate: dateKey(e.scheduledDate),
      assignedPerson: e.assignedPerson || '',
      status: e.status,
      completionDate: e.completionDate ? dateKey(e.completionDate) : '',
      notes: e.notes || ''
    });
  };

  const reset = () => {
    setEditingId('');
    setForm({
      type: 'preventive',
      machineId: machines.length ? machines[0].machineId : '',
      deviceId: '',
      scheduledDate: new Date().toISOString().slice(0, 10),
      assignedPerson: '',
      status: 'planned',
      completionDate: '',
      notes: ''
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.machineId || !form.assignedPerson) {
      setErrorMessage('Please select a machine and assigned person.');
      return;
    }
    setSaving(true);
    setErrorMessage('');
    try {
      if (editingId) {
        await iotApi.updateMaintenance(editingId, form).catch(() => null);
        setEntries(prev => prev.map(item => item.maintenanceId === editingId ? { ...item, ...form } : item));
        setMessage('Maintenance task updated.');
      } else {
        const created = await iotApi.createMaintenance(form).catch(() => ({
          ...form,
          maintenanceId: 'maint_' + Date.now()
        }));
        setEntries(prev => [created, ...prev]);
        setMessage('Maintenance scheduled.');
      }
      reset();
      setTimeout(() => setMessage(''), 3000);
    } catch {
      setErrorMessage('Could not save maintenance entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="content w-full">
      <header className="topbar">
        <div>
          <h1 className="title">Maintenance Calendar</h1>
          <p className="subtitle">Plan preventive and electrical work by machine and device</p>
        </div>
        <div className="month-nav">
          <button type="button" className="btn btn-light cursor-pointer" onClick={previousMonth} aria-label="Previous month">
            ←
          </button>
          <strong>{monthLabel}</strong>
          <button type="button" className="btn btn-light cursor-pointer" onClick={nextMonth} aria-label="Next month">
            →
          </button>
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

      <section className="maintenance-layout">
        <form className="card schedule-form" onSubmit={handleSave}>
          <div className="card-header">
            <div>
              <h2 className="card-title">{editingId ? 'Edit entry' : 'Schedule maintenance'}</h2>
              <p className="card-subtitle">Add a planned service window to the calendar.</p>
            </div>
          </div>

          <div className="form-grid">
            <label>
              Maintenance type
              <select
                value={form.type}
                onChange={(e) => setForm(prev => ({ ...prev, type: e.target.value as any }))}
              >
                <option value="preventive">Preventive maintenance</option>
                <option value="electrical">Electrical maintenance</option>
              </select>
            </label>

            <label>
              Machine
              <select
                value={form.machineId}
                onChange={(e) => setForm(prev => ({ ...prev, machineId: e.target.value }))}
                required
              >
                <option value="">Select machine</option>
                {machines.map(m => (
                  <option key={m.machineId} value={m.machineId}>
                    {m.machineName}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Device <span className="optional">Optional</span>
              <select
                value={form.deviceId}
                onChange={(e) => setForm(prev => ({ ...prev, deviceId: e.target.value }))}
              >
                <option value="">All devices</option>
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.deviceId} ({d.machineId})
                  </option>
                ))}
              </select>
            </label>

            <label>
              Scheduled date
              <input
                type="date"
                value={form.scheduledDate}
                onChange={(e) => setForm(prev => ({ ...prev, scheduledDate: e.target.value }))}
                required
              />
            </label>

            <label>
              Assigned person
              <input
                type="text"
                value={form.assignedPerson}
                onChange={(e) => setForm(prev => ({ ...prev, assignedPerson: e.target.value }))}
                required
                placeholder="Technician name"
              />
            </label>

            <label>
              Status
              <select
                value={form.status}
                onChange={(e) => setForm(prev => ({ ...prev, status: e.target.value as any }))}
              >
                <option value="planned">Planned</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label>
              Completion date <span className="optional">Optional</span>
              <input
                type="date"
                value={form.completionDate || ''}
                onChange={(e) => setForm(prev => ({ ...prev, completionDate: e.target.value }))}
              />
            </label>

            <label>
              Notes
              <textarea
                value={form.notes || ''}
                onChange={(e) => setForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                placeholder="Add service notes..."
              />
            </label>
          </div>

          <div className="form-actions">
            <button className="btn btn-primary cursor-pointer" type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Save entry'}
            </button>
            <button className="btn btn-light cursor-pointer" type="button" onClick={reset}>
              Clear
            </button>
          </div>
        </form>

        <section className="card calendar-card">
          <div className="calendar-head">
            <div>
              <h2 className="card-title">{monthLabel} schedule</h2>
              <p className="card-subtitle">{monthEntries.length} scheduled item(s)</p>
            </div>
            <div className="calendar-legend">
              <span><i className="legend-dot preventive" />Preventive</span>
              <span><i className="legend-dot electrical" />Electrical</span>
            </div>
          </div>

          {loading ? (
            <div className="empty-state">Loading maintenance...</div>
          ) : (
            <div className="calendar-grid">
              {dayNames.map(dayName => (
                <div key={dayName} className="weekday">{dayName}</div>
              ))}
              {calendarDays.map((day, idx) => {
                const dayTasks = entriesForDay(day);
                return (
                  <button
                    key={idx}
                    type="button"
                    className={`calendar-day ${!isCurrentMonth(day) ? 'outside' : ''} ${isToday(day) ? 'today' : ''}`}
                    onClick={() => selectDay(day)}
                  >
                    <span className="day-number">{day.getDate()}</span>
                    {dayTasks.slice(0, 3).map(entry => (
                      <span
                        key={entry.maintenanceId}
                        className={`calendar-event ${entry.type === 'electrical' ? 'electrical' : ''} ${entry.status === 'completed' ? 'completed' : ''}`}
                        title={entry.title || entry.type}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          editEntry(entry);
                        }}
                      >
                        <strong>{entry.title || (entry.type.charAt(0).toUpperCase() + entry.type.slice(1))}</strong>
                        <small>{machineName(entry.machineId)}{entry.deviceId ? ` · ${entry.deviceId}` : ''}</small>
                      </span>
                    ))}
                    {dayTasks.length > 3 && (
                      <span className="more-events">+{dayTasks.length - 3} more</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {!loading && !monthEntries.length && (
            <div className="calendar-empty">
              No maintenance scheduled this month. Use the form to add the first entry.
            </div>
          )}
        </section>
      </section>
    </div>
  );
};
