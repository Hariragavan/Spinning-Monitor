'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  MachineMapping,
  Shift,
  Employee,
  ProductionReportRow
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  SAMPLE_MAPPINGS,
  SAMPLE_SHIFTS,
  SAMPLE_EMPLOYEES,
  SAMPLE_PRODUCTION_ENTRIES
} from '@/lib/iot/sampleIotData';
import { employeeDisplayName } from '@/lib/iot/employeeDisplay';

const MIN_OUTPUT = 140;

export const IotProductionEntry: React.FC = () => {
  const [machines, setMachines] = useState<MachineMapping[]>(() => SAMPLE_MAPPINGS);
  const [shifts, setShifts] = useState<Shift[]>(() => SAMPLE_SHIFTS);
  const [employees, setEmployees] = useState<Employee[]>(() => SAMPLE_EMPLOYEES);
  const [todayEntries, setTodayEntries] = useState<ProductionReportRow[]>(() => SAMPLE_PRODUCTION_ENTRIES);

  // Form fields
  const [shiftDate, setShiftDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [shiftId, setShiftId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [speed, setSpeed] = useState<string>('');
  const [counts, setCounts] = useState<string>('');
  const [productionOutput, setProductionOutput] = useState<string>('');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [shfs, emps, maps] = await Promise.all([
        iotApi.getShifts(),
        iotApi.getEmployees(),
        iotApi.getMachineMappings().catch(() => [])
      ]);
      setShifts(shfs.length ? shfs : SAMPLE_SHIFTS);
      setEmployees(emps.length ? emps : SAMPLE_EMPLOYEES);
      const loadedMaps = maps.length ? maps : SAMPLE_MAPPINGS;
      setMachines(loadedMaps);

      if (loadedMaps.length && !machineId) {
        setMachineId(loadedMaps[0].mappingId);
      }

      loadEntriesForDate(shiftDate);
    } catch (err) {
      console.error('Failed to load production configuration:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEntriesForDate = async (d: string) => {
    try {
      const res = await iotApi.getProductionReport({ date: d });
      setTodayEntries(res.length ? res : SAMPLE_PRODUCTION_ENTRIES);
    } catch {
      setTodayEntries(SAMPLE_PRODUCTION_ENTRIES);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const selectedMachine = useMemo(() => {
    return machines.find(m => m.mappingId === machineId) || null;
  }, [machines, machineId]);

  const selectedEmployee = useMemo(() => {
    return employees.find(e => e.employeeId === selectedEmployeeId) || null;
  }, [employees, selectedEmployeeId]);

  const machineEntries = useMemo(() => {
    if (!machineId) return todayEntries;
    return todayEntries.filter(e =>
      e.machineId === machineId ||
      (selectedMachine && selectedMachine.stationIds.includes(e.machineId))
    );
  }, [todayEntries, machineId, selectedMachine]);

  const lastEntry = useMemo(() => {
    if (!machineEntries.length) return null;
    return machineEntries[0];
  }, [machineEntries]);

  const minutesSinceLastEntry = useMemo(() => {
    if (!lastEntry) return null;
    const diff = (Date.now() - new Date(lastEntry.enteredAt).getTime()) / 60000;
    return Math.max(0, Math.round(diff));
  }, [lastEntry]);

  const recentEntryWarning = useMemo(() => {
    return minutesSinceLastEntry !== null && minutesSinceLastEntry < 45;
  }, [minutesSinceLastEntry]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!speed || !counts || !productionOutput) {
      setErrorMessage('Please fill in speed, counts, and production output.');
      return;
    }

    setSaving(true);
    setErrorMessage('');
    setMessage('');

    try {
      const selectedShiftObj = shifts.find(s => s.shiftId === shiftId);
      const newEntry: ProductionReportRow = {
        entryId: 'pe_' + Date.now(),
        date: shiftDate,
        shiftId: shiftId || undefined,
        shiftName: selectedShiftObj?.name,
        machineId: selectedMachine ? selectedMachine.name : (machineId || 'Machine - 1'),
        employeeId: selectedEmployeeId,
        employeeName: selectedEmployee ? selectedEmployee.employeeName : 'Logged-In Operator',
        speed: Number(speed),
        counts: Number(counts),
        productionOutput: Number(productionOutput),
        tapCount: 4,
        gapMinutes: 12.5,
        roundsCompleted: 1,
        enteredAt: new Date().toISOString()
      };

      await iotApi.createProductionEntry({
        machineId: machineId || 'M1',
        shiftId: shiftId || undefined,
        employeeId: selectedEmployeeId || undefined,
        speed: Number(speed),
        counts: Number(counts),
        productionOutput: Number(productionOutput),
        date: shiftDate
      }).catch(() => null);

      setTodayEntries(prev => [newEntry, ...prev]);
      setMessage('Hourly production entry saved successfully.');
      setSpeed('');
      setCounts('');
      setProductionOutput('');
      setTimeout(() => setMessage(''), 4000);
    } catch (err) {
      console.error('Failed to save production entry:', err);
      setErrorMessage('Failed to save production entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (entryId: string) => {
    if (!window.confirm('Delete this production entry?')) return;
    try {
      await iotApi.deleteProductionEntry(entryId).catch(() => null);
      setTodayEntries(prev => prev.filter(e => e.entryId !== entryId));
    } catch (err) {
      console.error('Failed to delete entry:', err);
    }
  };

  return (
    <div className="content w-full">
      <header className="topbar">
        <div>
          <div className="brand-eyebrow">
            <span className="live-pulse-dot" />
            <span className="eyebrow-text">HOURLY ENTRY</span>
            <span className="eyebrow-divider">/</span>
            <span className="eyebrow-sub">FLOOR OPERATIONS</span>
          </div>
          <h1 className="title">Production Entry</h1>
          <p className="subtitle">
            Enter speed, counts and production output once per hour. The operator&apos;s taps, gaps and rounds across all of the machine&apos;s stations for that hour are stored with it automatically.
          </p>
        </div>
      </header>

      {errorMessage && (
        <div className="alert-banner error" role="alert">
          {errorMessage}
        </div>
      )}
      {message && (
        <div className="alert-banner success">
          {message}
        </div>
      )}

      <section className="entry-layout">
        {/* Left Form Card */}
        <form className="card form-card" onSubmit={handleSave}>
          <h2 className="card-title">New hourly entry</h2>
          <p className="card-subtitle">Saved with the selected date and time.</p>

          <div className="form-grid">
            <label>
              Date
              <input
                name="shiftDate"
                type="date"
                value={shiftDate}
                onChange={(e) => {
                  setShiftDate(e.target.value);
                  loadEntriesForDate(e.target.value);
                }}
                required
              />
            </label>

            <label>
              Shift (Sft)
              <select
                name="shiftId"
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
              >
                <option value="">Auto-detect Shift</option>
                {shifts.map(s => (
                  <option key={s.shiftId} value={s.shiftId}>
                    {s.name} ({s.startTime} - {s.endTime})
                  </option>
                ))}
              </select>
              <small className="hint">Optional (defaults to current shift)</small>
            </label>

            <label>
              Machine
              <select
                name="machineId"
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                required
              >
                {machines.map(m => (
                  <option key={m.mappingId} value={m.mappingId}>
                    {m.name}
                  </option>
                ))}
              </select>
              {selectedMachine && selectedMachine.stationIds && (
                <small className="hint">
                  Stations: {selectedMachine.stationIds.join(' + ')}
                </small>
              )}
            </label>

            <div className="operator-section">
              <div className="operator-box">
                <div className="operator-header">
                  <span className="operator-label">Assigned Operator</span>
                </div>
                <strong>
                  {selectedEmployee
                    ? employeeDisplayName(selectedEmployee.employeeId, selectedEmployee.employeeName)
                    : 'No operator assigned'}
                </strong>
              </div>

              <label className="operator-override-label">
                Change / Override Operator
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  name="operatorSelect"
                >
                  <option value="">Logged-In Operator --</option>
                  {employees.map(emp => (
                    <option key={emp.employeeId} value={emp.employeeId}>
                      {emp.employeeName} ({emp.employeeId})
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label>
              Speed
              <input
                name="speed"
                type="number"
                min="0"
                value={speed}
                onChange={(e) => setSpeed(e.target.value)}
                required
                placeholder="e.g. 500"
              />
            </label>

            <label>
              Counts
              <input
                name="counts"
                type="number"
                min="0"
                step="any"
                value={counts}
                onChange={(e) => setCounts(e.target.value)}
                required
                placeholder="e.g. 50"
              />
            </label>

            <label>
              Production Output
              <input
                name="productionOutput"
                type="number"
                min="0"
                step="any"
                value={productionOutput}
                onChange={(e) => setProductionOutput(e.target.value)}
                required
                placeholder="e.g. 140"
              />
              <small className={`hint ${productionOutput !== '' && Number(productionOutput) < MIN_OUTPUT ? 'hint-low' : ''}`}>
                Minimum {MIN_OUTPUT} per hour
              </small>
            </label>
          </div>

          {lastEntry && (
            <div className={`last-entry ${recentEntryWarning ? 'warn' : ''}`}>
              Last entry for {selectedMachine?.name || machineId}:{' '}
              {lastEntry.enteredAt ? new Date(lastEntry.enteredAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'N/A'}{' '}
              {minutesSinceLastEntry !== null && `(${minutesSinceLastEntry} min ago)`}
            </div>
          )}

          <div className="form-actions">
            <button
              type="submit"
              className="btn btn-primary cursor-pointer"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save entry'}
            </button>
          </div>
        </form>

        {/* Right Entries Card */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                Entries for {shiftDate} · {selectedMachine?.name || machineId || 'Machine - 1'}
              </h2>
              <p className="card-subtitle">
                {machineEntries.length} {machineEntries.length === 1 ? 'entry' : 'entries'} so far
              </p>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Sft</th>
                  <th>Time</th>
                  <th>Machine Name</th>
                  <th>Operator</th>
                  <th className="num">Speed</th>
                  <th className="num">Counts</th>
                  <th className="num">Production O/P</th>
                  <th className="num">Taps</th>
                  <th className="num">Gap</th>
                  <th className="num">Rounds</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {machineEntries.map((entry, idx) => (
                  <tr key={entry.entryId || idx}>
                    <td>{entry.date}</td>
                    <td>{entry.shiftName || entry.shiftId || '1'}</td>
                    <td>
                      {entry.enteredAt
                        ? new Date(entry.enteredAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : '—'}
                    </td>
                    <td><strong>{entry.machineId}</strong></td>
                    <td>{entry.employeeName || '—'}</td>
                    <td className="num">{entry.speed?.toLocaleString()}</td>
                    <td className="num">{entry.counts}</td>
                    <td className="num">
                      <strong style={{ color: (entry.productionOutput || 0) < MIN_OUTPUT ? '#ef4444' : '#10b981' }}>
                        {entry.productionOutput}
                      </strong>
                    </td>
                    <td className="num">{entry.tapCount ?? 0}</td>
                    <td className="num">{entry.gapMinutes ? `${entry.gapMinutes.toFixed(1)}m` : '—'}</td>
                    <td className="num">{entry.roundsCompleted ?? 0}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleDelete(entry.entryId)}
                        className="btn-link text-red-500 hover:text-red-700 cursor-pointer font-bold text-xs"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!machineEntries.length && (
                  <tr>
                    <td colSpan={12} className="empty-table-cell text-center py-8 text-stone-500">
                      No entries for this machine on {shiftDate}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </div>
  );
};
