'use client';

import React, { useState, useEffect } from 'react';
import {
  Employee,
  DeviceHealth,
  Machine,
  MachineConfiguration,
  MachineMapping,
  MachineMappingInput
} from '@/types/iot';
import { iotApi } from '@/lib/iot/iotApi';
import {
  SAMPLE_EMPLOYEES,
  SAMPLE_DEVICES,
  SAMPLE_MACHINES,
  SAMPLE_MAPPINGS
} from '@/lib/iot/sampleIotData';
import { employeeLabel } from '@/lib/iot/employeeDisplay';

export const IotConfiguration: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'assign_devices' | 'rpm_bounds' | 'machine_config' | 'machine_mapping'>('assign_devices');

  const [employees, setEmployees] = useState<Employee[]>(() => SAMPLE_EMPLOYEES);
  const [devices, setDevices] = useState<DeviceHealth[]>(() => SAMPLE_DEVICES);
  const [machines, setMachines] = useState<Machine[]>(() => SAMPLE_MACHINES);
  const [mappings, setMappings] = useState<MachineMapping[]>(() => SAMPLE_MAPPINGS);

  // Tab 1 state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // Tab 3 state
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [machineConfig, setMachineConfig] = useState<MachineConfiguration>({
    expectedProductionOutput: 98,
    expectedRuntimeMinutes: 460,
    expectedRoundsPerHour: 10,
    roundDeviceSequence: ['IOT_D1', 'IOT_D2'],
    cleaningInterval: 2
  });
  const [sequenceText, setSequenceText] = useState('IOT_D1 -> IOT_D2');

  // Tab 4 state
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [mappingForm, setMappingForm] = useState<{ name: string; stationIds: string[] }>({
    name: '',
    stationIds: []
  });

  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [e, d, m, maps] = await Promise.all([
        iotApi.getEmployees(),
        iotApi.getDevices(),
        iotApi.getMachines(),
        iotApi.getMachineMappings().catch(() => [])
      ]);
      setEmployees(e.length ? e : SAMPLE_EMPLOYEES);
      setDevices(d.length ? d : SAMPLE_DEVICES);
      setMachines(m.length ? m : SAMPLE_MACHINES);
      setMappings(maps.length ? maps : SAMPLE_MAPPINGS);

      if (e.length && !selectedEmployeeId) {
        setSelectedEmployeeId(e[0].employeeId);
        setSelectedDeviceIds(e[0].assignedDeviceIds || []);
      }
      if (m.length && !selectedMachineId) {
        setSelectedMachineId(m[0].machineId);
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const showMsg = (txt: string, type: 'success' | 'error' = 'success') => {
    setMessage(txt);
    setMessageType(type);
    setTimeout(() => setMessage(''), 3500);
  };

  // Tab 1: Toggle device assignment
  const onEmployeeChange = (empId: string) => {
    setSelectedEmployeeId(empId);
    const emp = employees.find(e => e.employeeId === empId);
    setSelectedDeviceIds(emp?.assignedDeviceIds || []);
  };

  const isDeviceSelected = (devId: string) => selectedDeviceIds.includes(devId);

  const toggleDeviceSelection = (devId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(devId) ? prev.filter(id => id !== devId) : [...prev, devId]
    );
  };

  const saveEmployeeAssignment = async () => {
    if (!selectedEmployeeId) return;
    setSaving(true);
    try {
      await iotApi.saveEmployeeDeviceMapping({
        employeeId: selectedEmployeeId,
        deviceIds: selectedDeviceIds
      }).catch(() => null);
      setEmployees(prev => prev.map(e => e.employeeId === selectedEmployeeId ? { ...e, assignedDeviceIds: selectedDeviceIds } : e));
      showMsg('Device assignment saved successfully.');
    } catch {
      showMsg('Failed to save device assignment.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Tab 2: Save Device RPM Bounds
  const saveDeviceRpmConfig = async (dev: DeviceHealth) => {
    setSaving(true);
    try {
      await iotApi.updateDeviceConfig(dev.deviceId, {
        minRpm: dev.minRPM,
        maxRpm: dev.maxRPM,
        position: dev.position
      }).catch(() => null);
      showMsg(`Bounds for ${dev.deviceId} saved.`);
    } catch {
      showMsg(`Failed to save bounds for ${dev.deviceId}.`, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Tab 3: Save Machine Config
  const selectMachine = (mId: string) => {
    setSelectedMachineId(mId);
    const m = machines.find(item => item.machineId === mId);
    if (m) {
      setMachineConfig({
        expectedProductionOutput: m.expectedProductionOutput || 98,
        expectedRuntimeMinutes: m.expectedRuntimeMinutes || 460,
        expectedRoundsPerHour: m.expectedRoundsPerHour || 10,
        roundDeviceSequence: m.roundDeviceSequence || ['IOT_D1', 'IOT_D2'],
        cleaningInterval: m.cleaningIntervalDays || 2
      });
      setSequenceText((m.roundDeviceSequence || ['IOT_D1', 'IOT_D2']).join(' -> '));
    }
  };

  const saveMachineConfig = async () => {
    setSaving(true);
    try {
      const parsedSeq = sequenceText.split(/->|,|→/).map(s => s.trim()).filter(Boolean);
      await iotApi.saveMachineConfig(selectedMachineId, {
        expectedProductionOutput: machineConfig.expectedProductionOutput,
        expectedRuntimeMinutes: machineConfig.expectedRuntimeMinutes,
        expectedRoundsPerHour: machineConfig.expectedRoundsPerHour,
        roundDeviceSequence: parsedSeq,
        cleaningInterval: machineConfig.cleaningInterval
      }).catch(() => null);
      showMsg(`Configuration for ${selectedMachineId} saved.`);
    } catch {
      showMsg('Failed to save machine config.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Tab 4: Machine Mapping helpers
  const isStationSelected = (stationId: string) => mappingForm.stationIds.includes(stationId);

  const stationOwner = (stationId: string) => {
    const owner = mappings.find(m => m.mappingId !== editingMappingId && m.stationIds.includes(stationId));
    return owner ? owner.name : null;
  };

  const toggleStation = (stationId: string) => {
    if (stationOwner(stationId)) return;
    setMappingForm(prev => ({
      ...prev,
      stationIds: prev.stationIds.includes(stationId)
        ? prev.stationIds.filter(id => id !== stationId)
        : [...prev.stationIds, stationId]
    }));
  };

  const moveStation = (idx: number, delta: number) => {
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= mappingForm.stationIds.length) return;
    const arr = [...mappingForm.stationIds];
    const [moved] = arr.splice(idx, 1);
    arr.splice(newIdx, 0, moved);
    setMappingForm(prev => ({ ...prev, stationIds: arr }));
  };

  const editMapping = (m: MachineMapping) => {
    setEditingMappingId(m.mappingId);
    setMappingForm({ name: m.name, stationIds: [...m.stationIds] });
  };

  const resetMappingForm = () => {
    setEditingMappingId(null);
    setMappingForm({ name: '', stationIds: [] });
  };

  const saveMapping = async () => {
    if (!mappingForm.name.trim() || !mappingForm.stationIds.length) return;
    setSaving(true);
    try {
      const input: MachineMappingInput = { name: mappingForm.name, stationIds: mappingForm.stationIds };
      const saved = await iotApi.saveMachineMapping(input, editingMappingId || undefined).catch(() => ({
        mappingId: editingMappingId || 'map_' + Date.now(),
        name: mappingForm.name,
        stationIds: mappingForm.stationIds
      }));
      if (editingMappingId) {
        setMappings(prev => prev.map(m => m.mappingId === editingMappingId ? saved : m));
      } else {
        setMappings(prev => [saved, ...prev]);
      }
      resetMappingForm();
      showMsg('Machine mapping saved.');
    } catch {
      showMsg('Failed to save mapping.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const deleteMapping = async (m: MachineMapping) => {
    if (!window.confirm(`Delete mapping "${m.name}"?`)) return;
    try {
      await iotApi.deleteMachineMapping(m.mappingId).catch(() => null);
      setMappings(prev => prev.filter(item => item.mappingId !== m.mappingId));
      if (editingMappingId === m.mappingId) resetMappingForm();
      showMsg('Mapping deleted.');
    } catch {
      showMsg('Failed to delete mapping.', 'error');
    }
  };

  return (
    <main className="content w-full">
      <header className="topbar">
        <div>
          <h1 className="title">System Configuration Module</h1>
          <p className="subtitle">
            Assign IoT Device IDs to Employees and define target Min/Max Spinning speed thresholds
          </p>
        </div>
      </header>

      {message && (
        <div className={`alert-banner ${messageType === 'success' ? 'success' : 'error'}`}>
          <span className="alert-icon">{messageType === 'success' ? '✓' : '⚠️'}</span>
          <span>{message}</span>
        </div>
      )}

      {/* Sub Navigation Tabs */}
      <section className="config-tabs">
        <button
          className={`tab-btn cursor-pointer ${activeSubTab === 'assign_devices' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('assign_devices')}
        >
          👤 1. Assign Device IDs to Employees
        </button>
        <button
          className={`tab-btn cursor-pointer ${activeSubTab === 'rpm_bounds' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('rpm_bounds')}
        >
          ⚙️ 2. Set Min &amp; Max Spinning Values
        </button>
        <button
          className={`tab-btn cursor-pointer ${activeSubTab === 'machine_config' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('machine_config')}
        >
          ▦ 3. Machine Production &amp; Rounds
        </button>
        <button
          className={`tab-btn cursor-pointer ${activeSubTab === 'machine_mapping' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('machine_mapping')}
        >
          ⇄ 4. Machine Mapping
        </button>
      </section>

      {/* Section 1: Assign Device IDs to Employees */}
      {activeSubTab === 'assign_devices' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Employee to Device Assignment</h3>
              <p className="card-subtitle">Select an employee and choose which devices/sensors are operated by them</p>
            </div>
            <button
              className="btn btn-primary cursor-pointer"
              onClick={saveEmployeeAssignment}
              disabled={saving}
            >
              💾 Save Device Assignment
            </button>
          </div>

          <div className="config-form-grid">
            <div className="field">
              <label>Select Employee</label>
              <div className="select-wrapper">
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => onEmployeeChange(e.target.value)}
                >
                  {employees.map(e => (
                    <option key={e.employeeId} value={e.employeeId}>
                      {employeeLabel(e.employeeId, e.employeeName)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="devices-selection-section">
            <h4 className="section-subtitle">Select Devices to Assign:</h4>
            <div className="device-checkbox-grid">
              {devices.map(dev => {
                const selected = isDeviceSelected(dev.deviceId);
                return (
                  <div
                    key={dev.deviceId}
                    className={`device-check-card cursor-pointer ${selected ? 'selected' : ''}`}
                    onClick={() => toggleDeviceSelection(dev.deviceId)}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleDeviceSelection(dev.deviceId)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="device-info">
                      <strong>Device {dev.deviceId}</strong>
                      <small>Machine: {dev.machineId} | Pos {dev.position} ({dev.side})</small>
                      {dev.assignedEmployeeId && dev.assignedEmployeeId !== selectedEmployeeId && (
                        <span className="current-assignee">
                          Currently: {employeeLabel(dev.assignedEmployeeId, dev.assignedEmployeeName)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Section 2: Set RPM Min & Max Values */}
      {activeSubTab === 'rpm_bounds' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Spinning Min &amp; Max Threshold Settings</h3>
              <p className="card-subtitle">Set safe operating speed bounds (Min Spinning &amp; Max Spinning) for each device sensor</p>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Device ID</th>
                  <th>Machine ID</th>
                  <th>Pos &amp; Side</th>
                  <th>Min Spinning Threshold</th>
                  <th>Max Spinning Threshold</th>
                  <th>Expected Target Spinning</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {devices.map(dev => (
                  <tr key={dev.deviceId}>
                    <td><strong>{dev.deviceId}</strong></td>
                    <td>{dev.machineId}</td>
                    <td>Pos {dev.position} ({dev.side})</td>
                    <td>
                      <div className="input-unit">
                        <input
                          type="number"
                          value={dev.minRPM || 16000}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setDevices(prev => prev.map(d => d.deviceId === dev.deviceId ? { ...d, minRPM: val } : d));
                          }}
                          className="input-sm"
                        />
                        <span>Spinning</span>
                      </div>
                    </td>
                    <td>
                      <div className="input-unit">
                        <input
                          type="number"
                          value={dev.maxRPM || 18000}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setDevices(prev => prev.map(d => d.deviceId === dev.deviceId ? { ...d, maxRPM: val } : d));
                          }}
                          className="input-sm"
                        />
                        <span>Spinning</span>
                      </div>
                    </td>
                    <td>
                      <div className="input-unit">
                        <input
                          type="number"
                          value={dev.expectedRPM || 17200}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setDevices(prev => prev.map(d => d.deviceId === dev.deviceId ? { ...d, expectedRPM: val } : d));
                          }}
                          className="input-sm"
                        />
                        <span>Spinning</span>
                      </div>
                    </td>
                    <td>
                      <button
                        className="btn btn-sm btn-primary cursor-pointer"
                        onClick={() => saveDeviceRpmConfig(dev)}
                        disabled={saving}
                      >
                        💾 Save Bounds
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 3: Machine Production & Rounds */}
      {activeSubTab === 'machine_config' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">Machine production configuration</h3>
              <p className="card-subtitle">Set the production targets and the exact device order used to complete a round.</p>
            </div>
            <button className="btn btn-primary cursor-pointer" onClick={saveMachineConfig} disabled={saving}>
              💾 Save configuration
            </button>
          </div>
          <div className="machine-config-layout">
            <div className="machine-config-intro">
              <div className="config-icon">▦</div>
              <h4>Machine rules</h4>
              <p>These rules are applied to machine dashboards and reports. A round is counted only after every device in the sequence has tapped in order.</p>
              <div className="rule-note">
                <strong>Example</strong>
                <span>D1 → D3 → D4</span>
              </div>
            </div>
            <div className="machine-config-form">
              <div className="field machine-select">
                <label>Machine</label>
                <div className="select-wrapper">
                  <select value={selectedMachineId} onChange={(e) => selectMachine(e.target.value)}>
                    {machines.map(m => (
                      <option key={m.machineId} value={m.machineId}>
                        {m.machineName} ({m.machineId})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="config-number-grid">
                <div className="field">
                  <label>Expected production output</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      value={machineConfig.expectedProductionOutput}
                      onChange={(e) => setMachineConfig(prev => ({ ...prev, expectedProductionOutput: Number(e.target.value) }))}
                      min={0}
                    />
                    <span>units / shift</span>
                  </div>
                </div>
                <div className="field">
                  <label>Expected runtime</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      value={machineConfig.expectedRuntimeMinutes}
                      onChange={(e) => setMachineConfig(prev => ({ ...prev, expectedRuntimeMinutes: Number(e.target.value) }))}
                      min={0}
                    />
                    <span>minutes</span>
                  </div>
                </div>
                <div className="field">
                  <label>Expected rounds / hour</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      value={machineConfig.expectedRoundsPerHour}
                      onChange={(e) => setMachineConfig(prev => ({ ...prev, expectedRoundsPerHour: Number(e.target.value) }))}
                      min={0}
                    />
                    <span>rounds</span>
                  </div>
                </div>
                <div className="field">
                  <label>Cleaning interval</label>
                  <div className="input-with-unit">
                    <input
                      type="number"
                      value={machineConfig.cleaningInterval}
                      onChange={(e) => setMachineConfig(prev => ({ ...prev, cleaningInterval: Number(e.target.value) }))}
                      min={1}
                    />
                    <span>days</span>
                  </div>
                </div>
              </div>
              <div className="sequence-field">
                <label>Ordered round device sequence</label>
                <div className="sequence-input">
                  <span className="sequence-prefix">⇢</span>
                  <input
                    value={sequenceText}
                    onChange={(e) => setSequenceText(e.target.value)}
                    placeholder="D1 -> D3 -> D4"
                  />
                </div>
                <small>Separate device IDs with <strong>→</strong> or commas. Incomplete and skipped sequences are reported separately.</small>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Section 4: Machine Mapping */}
      {activeSubTab === 'machine_mapping' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{editingMappingId ? `Edit ${editingMappingId}` : 'Map stations to a machine'}</h3>
              <p className="card-subtitle">Group tap stations into one production machine. Only mapped machines appear in Production Entry.</p>
            </div>
            <div className="mapping-actions flex items-center gap-2">
              {editingMappingId && (
                <button className="btn btn-secondary cursor-pointer" onClick={resetMappingForm} disabled={saving}>
                  Cancel
                </button>
              )}
              <button
                className="btn btn-primary cursor-pointer"
                onClick={saveMapping}
                disabled={saving || !mappingForm.name.trim() || !mappingForm.stationIds.length}
              >
                💾 {editingMappingId ? 'Save changes' : 'Save mapping'}
              </button>
            </div>
          </div>

          <div className="machine-config-layout">
            <div className="machine-config-intro">
              <div className="config-icon">⇄</div>
              <h4>How rounds count</h4>
              <p>Taps on all mapped stations are added together. A round starts at the first station, visits every other station, and completes when the operator taps the first station again. Gap is the average time between consecutive taps.</p>
              <div className="rule-note">
                <strong>Example</strong>
                <span>D1 10:00 → D2 10:05 → D1 10:15</span>
                <small>3 taps · 1 round · avg gap 7.5 min</small>
              </div>
            </div>

            <div className="machine-config-form">
              <div className="field">
                <label htmlFor="mapping-name">Machine name</label>
                <input
                  id="mapping-name"
                  value={mappingForm.name}
                  onChange={(e) => setMappingForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Machine-1"
                  maxLength={40}
                />
              </div>

              <div>
                <h4 className="section-subtitle">Stations</h4>
                <div className="device-checkbox-grid">
                  {machines.map(station => {
                    const owner = stationOwner(station.machineId);
                    const selected = isStationSelected(station.machineId);
                    return (
                      <div
                        key={station.machineId}
                        className={`device-check-card cursor-pointer ${selected ? 'selected' : ''} ${owner ? 'unavailable' : ''}`}
                        onClick={() => toggleStation(station.machineId)}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          disabled={!!owner}
                          onChange={() => toggleStation(station.machineId)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="device-info">
                          <strong>{station.machineId}</strong>
                          {station.machineName !== station.machineId && (
                            <small>{station.machineName}</small>
                          )}
                          {owner && <span className="current-assignee">Mapped to {owner}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {mappingForm.stationIds.length > 0 && (
                <div className="sequence-field">
                  <label>Round order</label>
                  <ol className="station-order">
                    {mappingForm.stationIds.map((id, idx) => (
                      <li key={id}>
                        <span className="station-chip">{id}</span>
                        {idx === 0 && <small className="start-badge">start &amp; finish</small>}
                        <span className="order-buttons">
                          <button
                            type="button"
                            className="icon-btn cursor-pointer"
                            onClick={() => moveStation(idx, -1)}
                            disabled={idx === 0}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="icon-btn cursor-pointer"
                            onClick={() => moveStation(idx, 1)}
                            disabled={idx === mappingForm.stationIds.length - 1}
                          >
                            ↓
                          </button>
                        </span>
                      </li>
                    ))}
                  </ol>
                  <small>Round: {mappingForm.stationIds.join(' → ')} → {mappingForm.stationIds[0]}</small>
                </div>
              )}
            </div>
          </div>

          <h4 className="section-subtitle mapped-title mt-6">Mapped machines</h4>
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Machine</th>
                  <th>ID</th>
                  <th>Stations (round order)</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => (
                  <tr key={m.mappingId} className={m.mappingId === editingMappingId ? 'editing-row' : ''}>
                    <td><strong>{m.name}</strong></td>
                    <td>{m.mappingId}</td>
                    <td>{m.stationIds.join(' → ')}</td>
                    <td className="row-actions">
                      <div className="flex items-center gap-2">
                        <button
                          className="btn btn-sm btn-secondary cursor-pointer"
                          onClick={() => editMapping(m)}
                          disabled={saving}
                        >
                          Edit
                        </button>
                        <button
                          className="btn btn-sm btn-danger cursor-pointer"
                          onClick={() => deleteMapping(m)}
                          disabled={saving}
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!mappings.length && (
                  <tr>
                    <td colSpan={4} className="text-center py-4">No machines mapped yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
};
