'use client';

import React, { useState, useEffect } from 'react';
import {
  Employee,
  DeviceHealth,
  Machine,
  MachineConfiguration,
  MachineMapping,
  MachineMappingInput,
  EmployeeMetric
} from '@/types/iot';
import { Sider, MachineMasterItem, SystemSettings } from '@/types';
import { iotApi } from '@/lib/iot/iotApi';
import { apiClient } from '@/lib/api';
import { employeeLabel } from '@/lib/iot/employeeDisplay';

export interface IotConfigurationProps {
  workers?: Sider[];
  machines?: MachineMasterItem[];
  systemSettings?: SystemSettings;
  onUpdateSettings?: (settings: SystemSettings) => Promise<void>;
}

export const IotConfiguration: React.FC<IotConfigurationProps> = ({
  workers = [],
  machines: machinesProp = [],
  systemSettings,
  onUpdateSettings
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'assign_devices' | 'rpm_bounds' | 'machine_config' | 'device_mapping' | 'machine_mapping'>('assign_devices');

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [devices, setDevices] = useState<DeviceHealth[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [mappings, setMappings] = useState<MachineMapping[]>([]);
  const [employeeMetrics, setEmployeeMetrics] = useState<EmployeeMetric[]>([]);
  const [deviceOperators, setDeviceOperators] = useState<Record<string, { employeeId: string; employeeName: string }>>({});

  // Production Machine Mapping State (Tab 5)
  const [productionMappings, setProductionMappings] = useState<Record<string, string>>({});
  const [masterWorkers, setMasterWorkers] = useState<Sider[]>(workers);
  const [productionFrames, setProductionFrames] = useState<MachineMasterItem[]>(machinesProp);

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
      const [e, d, m, maps, perf] = await Promise.all([
        iotApi.getEmployees(),
        iotApi.getDevices(),
        iotApi.getMachines(),
        iotApi.getMachineMappings().catch(() => []),
        iotApi.getEmployeePerformance().catch(() => [])
      ]);
      setEmployees(e || []);
      setDevices(d || []);
      setMachines(m || []);
      setMappings(maps || []);
      setEmployeeMetrics(perf || []);

      if (e && e.length > 0 && !selectedEmployeeId) {
        setSelectedEmployeeId(e[0].employeeId);
        setSelectedDeviceIds(e[0].assignedDeviceIds || []);
      }
      if (m && m.length > 0 && !selectedMachineId) {
        const first = m[0];
        setSelectedMachineId(first.machineId);
        setMachineConfig({
          expectedProductionOutput: first.expectedOutput ?? first.expectedProductionOutput ?? 98,
          expectedRuntimeMinutes: first.expectedRunDurationMinutes ?? first.expectedRuntimeMinutes ?? 460,
          expectedRoundsPerHour: first.expectedRoundsPerHour ?? 10,
          roundDeviceSequence: first.roundDeviceSequence || ['IOT_D1', 'IOT_D2'],
          cleaningInterval: first.cleaningIntervalDays ?? 2
        });
        setSequenceText((first.roundDeviceSequence || ['IOT_D1', 'IOT_D2']).join(' -> '));
      }

      // Load Production Machines & Employee Master for Tab 5
      try {
        let currentFrames = machinesProp;
        if (!currentFrames || currentFrames.length === 0) {
          const mRes = await fetch('/api/machines').then(r => r.json()).catch(() => null);
          if (mRes?.data && Array.isArray(mRes.data)) {
            currentFrames = mRes.data;
            setProductionFrames(mRes.data);
          }
        }

        let currentWorkersList = workers;
        if (!currentWorkersList || currentWorkersList.length === 0) {
          const wRes = await fetch('/api/workers').then(r => r.json()).catch(() => null);
          if (wRes?.data && Array.isArray(wRes.data)) {
            currentWorkersList = wRes.data;
            setMasterWorkers(wRes.data);
          }
        }

        // Load existing mappings from settings
        let settingsData = systemSettings;
        if (!settingsData) {
          const sRes = await fetch('/api/settings').then(r => r.json()).catch(() => null);
          if (sRes?.data) settingsData = sRes.data;
        }

        const rawMap = settingsData?.iotMachineMapping || settingsData?.machineToMachineMapping || {};
        const pMap: Record<string, string> = {};
        Object.entries(rawMap).forEach(([k, v]) => {
          if (k && v) {
            pMap[k.trim().toUpperCase()] = v.trim().toUpperCase();
            pMap[v.trim().toUpperCase()] = k.trim().toUpperCase();
          }
        });
        setProductionMappings(pMap);

        if (settingsData?.iotDeviceOperatorMapping) {
          setDeviceOperators(settingsData.iotDeviceOperatorMapping);
        }
      } catch (e) {
        console.error('Failed to load production mapping dependencies:', e);
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
    }
  };

  const handleProductionFrameSelect = (iotKey: string, frameNo: string) => {
    setProductionMappings(prev => {
      const updated = { ...prev };
      const cleanKey = iotKey.trim().toUpperCase();
      if (!frameNo) {
        delete updated[cleanKey];
      } else {
        updated[cleanKey] = frameNo.trim().toUpperCase();
      }
      return updated;
    });
  };

  const saveProductionAssignments = async () => {
    setSaving(true);
    try {
      // Build clean mapping: { [spinningFrame]: iotMachine }
      const cleanIotMap: Record<string, string> = {};
      const pairs: { spinningFrame: string; iotMachine: string }[] = [];

      mappings.forEach(m => {
        const iotName = m.name?.trim().toUpperCase();
        const iotId = m.mappingId?.trim().toUpperCase();
        const mappedFrame = productionMappings[iotName] || productionMappings[iotId];
        if (mappedFrame && mappedFrame !== 'NONE') {
          cleanIotMap[mappedFrame] = iotName || iotId;
          pairs.push({ spinningFrame: mappedFrame, iotMachine: iotName || iotId });
        }
      });

      const updatedSettings: SystemSettings = {
        ...(systemSettings || {
          autoUpdateEnabled: false,
          lastSyncDate: null,
          tvInterval: 15,
          tvSubInterval: 5,
          machineSiderCounts: {},
          gaiterCounts: { I: 1, II: 1, III: 1 }
        }),
        iotMachineMapping: cleanIotMap,
        machineToMachineMapping: cleanIotMap,
        machinePairs: pairs,
        iotDeviceOperatorMapping: deviceOperators
      };

      if (onUpdateSettings) {
        await onUpdateSettings(updatedSettings);
      } else {
        await apiClient.saveSettings(updatedSettings);
      }

      showMsg('Production machine assignments saved successfully.');
    } catch (err: any) {
      showMsg('Failed to save machine assignments: ' + (err?.message || 'Error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // Resolve operator associated with each specific IoT hardware device
  const resolveDeviceOperator = (
    stationId: string,
    defaultSide: 'LH' | 'RH' = 'LH'
  ) => {
    const cleanStation = stationId.trim().toUpperCase();

    // 1. Check local state override
    const override = deviceOperators[cleanStation];

    // 2. Find device object in devices list
    const devObj = devices.find(d => 
      (d.deviceId && d.deviceId.trim().toUpperCase() === cleanStation) ||
      (d.machineId && d.machineId.trim().toUpperCase() === cleanStation)
    );

    // Normalize side
    let side: string = defaultSide;
    if (devObj?.side) {
      const sUpper = devObj.side.toUpperCase();
      if (sUpper.includes('RIGHT') || sUpper === 'RH') side = 'RH';
      else if (sUpper.includes('LEFT') || sUpper === 'LH') side = 'LH';
      else side = devObj.side;
    }

    // 3. Extract raw operator identifier and name from device object (API has assignedEmployeeName / assignedEmployeeId)
    let rawName = override?.employeeName || devObj?.assignedEmployeeName || (devObj as any)?.employeeName || (devObj as any)?.operatorName || '';
    let rawId = override?.employeeId || devObj?.assignedEmployeeId || (devObj as any)?.employeeId || (devObj as any)?.operatorId || '';

    // 4. Fallback: check employees list for assignedDeviceIds
    if (!rawName) {
      const emp = employees.find(e => 
        e.assignedDeviceIds && e.assignedDeviceIds.some(did => 
          did.trim().toUpperCase() === cleanStation || 
          (devObj?.deviceId && did.trim().toUpperCase() === devObj.deviceId.trim().toUpperCase())
        )
      );
      if (emp) {
        rawName = emp.employeeName;
        rawId = emp.employeeId;
      }
    }

    // 5. Fallback: check employee metrics
    if (!rawName) {
      const met = employeeMetrics.find(m => 
        m.machineId && (
          m.machineId.trim().toUpperCase() === cleanStation ||
          (devObj?.deviceId && m.machineId.trim().toUpperCase() === devObj.deviceId.trim().toUpperCase())
        )
      );
      if (met) {
        rawName = met.employeeName || '';
        rawId = met.employeeId || '';
      }
    }

    // 6. Parse Name(Token) format, e.g. "Sambari(24673)" or numeric "1819705349"
    let extractedName = rawName ? String(rawName).trim() : '';
    let extractedToken = rawId ? String(rawId).trim() : '';

    const parenMatch = extractedName.match(/^([^\(]+)\s*\(([0-9A-Za-z]+)\)$/);
    if (parenMatch) {
      extractedName = parenMatch[1].trim();
      extractedToken = parenMatch[2].trim();
    }

    // 7. Match with masterWorkers (Employee Master) for official Photo & Token
    const matchedWorker = masterWorkers.find(w => {
      const wTok = (w.tNo || '').trim().toLowerCase();
      const wId = (w.id || '').trim().toLowerCase();
      const wName = (w.name || '').trim().toLowerCase();

      const cTok = extractedToken.toLowerCase();
      const cRawId = rawId ? String(rawId).trim().toLowerCase() : '';
      const cName = extractedName.toLowerCase();

      return (
        (cTok && (wTok === cTok || wId === cTok)) ||
        (cRawId && (wTok === cRawId || wId === cRawId)) ||
        (cName && wName === cName)
      );
    });

    const displayName = matchedWorker?.name || extractedName || (rawId ? `Operator #${rawId}` : 'Unassigned');
    const displayToken = matchedWorker?.tNo || extractedToken || rawId || '';
    const photoUrl = matchedWorker?.photoUrl;
    const isAssigned = Boolean(
      matchedWorker ||
      (extractedName && extractedName.toLowerCase() !== 'unassigned' && extractedName !== 'null') ||
      (extractedToken && extractedToken.toLowerCase() !== 'unassigned' && extractedToken !== 'null')
    );

    return {
      deviceId: stationId,
      side,
      rawName,
      rawId,
      displayName,
      displayToken,
      photoUrl,
      isAssigned,
      matchedWorker
    };
  };

  const handleAssignDeviceOperator = async (
    deviceId: string,
    employeeId: string,
    employeeName: string
  ) => {
    const cleanStation = deviceId.trim().toUpperCase();
    const updatedDevOps = {
      ...deviceOperators,
      [cleanStation]: { employeeId, employeeName }
    };
    setDeviceOperators(updatedDevOps);

    // Update in local devices state
    setDevices(prev => prev.map(d => {
      if (
        (d.deviceId && d.deviceId.toUpperCase() === cleanStation) ||
        (d.machineId && d.machineId.toUpperCase() === cleanStation)
      ) {
        return {
          ...d,
          assignedEmployeeId: employeeId,
          assignedEmployeeName: employeeName
        };
      }
      return d;
    }));

    // Update backend device config & employee assignments if online
    try {
      await iotApi.updateDeviceConfig(deviceId, {
        assignedEmployeeId: employeeId,
        assignedEmployeeName: employeeName
      }).catch(() => null);

      if (employeeId) {
        await iotApi.assignDevicesToEmployee(employeeId, [deviceId], employeeName).catch(() => null);
      }
    } catch (_) {}

    // Update settings
    if (onUpdateSettings && systemSettings) {
      await onUpdateSettings({
        ...systemSettings,
        iotDeviceOperatorMapping: updatedDevOps
      });
    }

    showMsg(`Device ${deviceId} assigned to ${employeeName || employeeId}`);
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
      const emp = employees.find(e => e.employeeId === selectedEmployeeId);
      await iotApi.saveEmployeeDeviceMapping({
        employeeId: selectedEmployeeId,
        deviceIds: selectedDeviceIds,
        employeeName: emp?.employeeName
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
        minRPM: dev.minRPM ?? dev.minRpm ?? 16000,
        maxRPM: dev.maxRPM ?? dev.maxRpm ?? 18000,
        expectedRPM: dev.expectedRPM ?? 17200,
        minRpm: dev.minRPM ?? dev.minRpm ?? 16000,
        maxRpm: dev.maxRPM ?? dev.maxRpm ?? 18000,
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
        expectedProductionOutput: m.expectedOutput ?? m.expectedProductionOutput ?? 98,
        expectedRuntimeMinutes: m.expectedRunDurationMinutes ?? m.expectedRuntimeMinutes ?? 460,
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
      const selectedMachine = machines.find(m => m.machineId === selectedMachineId);
      await Promise.all([
        iotApi.saveMachineConfig(selectedMachineId, {
          name: selectedMachine?.machineName || selectedMachineId,
          expectedOutput: Number(machineConfig.expectedProductionOutput) || 0,
          expectedRunDurationMinutes: Number(machineConfig.expectedRuntimeMinutes) || 0,
          expectedRoundsPerHour: Number(machineConfig.expectedRoundsPerHour) || 0,
          roundDeviceSequence: parsedSeq
        }),
        iotApi.updateCleaningSchedule(selectedMachineId, {
          cleaningIntervalDays: Math.max(1, Number(machineConfig.cleaningInterval) || 2)
        })
      ]);
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
    <div className="content w-full">
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
          className={`tab-btn cursor-pointer ${activeSubTab === 'device_mapping' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('device_mapping')}
        >
          📡 4. Device Mapping
        </button>
        <button
          className={`tab-btn cursor-pointer ${activeSubTab === 'machine_mapping' ? 'active' : ''}`}
          onClick={() => setActiveSubTab('machine_mapping')}
        >
          🔄 5. Machine Mapping
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

      {/* Section 4: Device Mapping (Renamed from Machine Mapping) */}
      {activeSubTab === 'device_mapping' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">{editingMappingId ? `Edit ${editingMappingId}` : 'Map Devices & Stations to IoT Machine'}</h3>
              <p className="card-subtitle">Group hardware sensor and RFID tap stations into an IoT machine profile. Only mapped devices report patrol rounds.</p>
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
                💾 {editingMappingId ? 'Save changes' : 'Save device mapping'}
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
                    <td colSpan={4} className="text-center py-4">No device mappings created yet. Group device stations above first.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Section 5: Machine Mapping (IoT Machine to Production Machine) */}
      {activeSubTab === 'machine_mapping' && (
        <section className="card">
          <div className="card-header">
            <div>
              <h3 className="card-title">IoT Machine to Production Machine Assignment</h3>
              <p className="card-subtitle">
                Assign each IoT Machine profile to its physical spinning production frame (e.g. SP009, SP44). 
                Operators for each device are automatically detected from the IoT API for the current live shift and matched with Employee Master.
              </p>
            </div>
            <div className="mapping-actions flex items-center gap-2">
              <button
                className="btn btn-primary cursor-pointer"
                onClick={saveProductionAssignments}
                disabled={saving}
              >
                💾 Save Machine Assignments
              </button>
            </div>
          </div>

          <div className="table-wrapper mt-4">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '22%' }}>IoT Machine</th>
                  <th style={{ width: '25%' }}>Production Machine (SP009..)</th>
                  <th style={{ width: '40%' }}>Live Shift Operators per Device (Auto-Detected from API)</th>
                  <th style={{ width: '13%' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {mappings.map(m => {
                  const iotKey = (m.mappingId || m.name || '').trim().toUpperCase();
                  const currentSelectedFrame = productionMappings[iotKey] || productionMappings[m.name?.trim().toUpperCase()] || '';

                  // Every IoT Machine typically manages 2 devices (e.g. IOT_D1 Left and IOT_D2 Right)
                  const stations = (m.stationIds && m.stationIds.length > 0) 
                    ? m.stationIds 
                    : ['IOT_D1', 'IOT_D2'];

                  // Unique available frames list
                  const allFrames = Array.from(new Set([
                    ...productionFrames.map(pf => pf.rfNo || (pf as any).frameNo).filter(Boolean),
                    'SP009', 'SP010', 'SP011', 'SP012', 'SP013', 'SP014', 'SP015', 'SP016', 'SP017', 'SP018',
                    'SP024', 'SP028', 'SP039', 'SP040', 'SP041', 'SP042', 'SP043', 'SP044',
                    'SP023', 'SP045', 'SP046', 'SP047', 'SP048', 'SP049', 'SP050', 'SP051', 'SP052', 'SP053', 'SP054', 'SP055',
                    'K01', 'K02', 'K03', 'K04', 'K05', 'K06'
                  ])).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

                  return (
                    <tr key={m.mappingId}>
                      {/* 1. IoT Machine Name & Connected Devices */}
                      <td>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <strong className="text-stone-900 text-sm font-black">{m.name}</strong>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-stone-100 border border-stone-200 text-stone-600">
                              {m.mappingId}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 mt-0.5">
                            <span className="text-[11px] font-semibold text-stone-500">
                              {stations.length} {stations.length === 1 ? 'Device' : 'Devices'}:
                            </span>
                            {stations.map((st, idx) => (
                              <span key={st} className="px-1.5 py-0.5 rounded bg-cyan-50 border border-cyan-200 text-[10px] font-mono font-bold text-cyan-800">
                                {st} ({idx === 0 ? 'LH' : 'RH'})
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* 2. Production Machine Assignment Dropdown */}
                      <td>
                        <select
                          value={currentSelectedFrame}
                          onChange={(e) => handleProductionFrameSelect(iotKey, e.target.value)}
                          className="w-full px-3 py-2 bg-stone-50 border border-stone-300 rounded-xl text-xs font-black text-stone-900 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all cursor-pointer"
                        >
                          <option value="">-- Assign Production Frame --</option>
                          {allFrames.map(f => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 3. Connected Devices & Operators (from IoT API & Master) */}
                      <td>
                        <div className="space-y-2">
                          {stations.map((st, sIdx) => {
                            const devInfo = resolveDeviceOperator(st, sIdx === 0 ? 'LH' : 'RH');
                            return (
                              <div 
                                key={st} 
                                className="flex items-center justify-between gap-3 p-2 bg-stone-50 hover:bg-stone-100/90 rounded-xl border border-stone-200 transition-all"
                              >
                                {/* Device Side & ID Badge + Operator */}
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="flex flex-col items-center shrink-0">
                                    <span className="px-2 py-0.5 rounded bg-cyan-100 text-cyan-900 text-[10px] font-mono font-black border border-cyan-300">
                                      {devInfo.deviceId}
                                    </span>
                                    <span className="text-[9px] font-black text-stone-500 uppercase mt-0.5">
                                      {devInfo.side} SIDE
                                    </span>
                                  </div>

                                  {/* Operator Photo */}
                                  <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-emerald-500 shadow-2xs shrink-0 flex items-center justify-center bg-stone-100">
                                    {devInfo.photoUrl ? (
                                      <img 
                                        src={devInfo.photoUrl} 
                                        alt={devInfo.displayName} 
                                        className="w-full h-full object-cover" 
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-emerald-100 text-emerald-800 text-[11px] font-black">
                                        {devInfo.isAssigned && devInfo.displayName ? devInfo.displayName.slice(0, 2).toUpperCase() : '👤'}
                                      </div>
                                    )}
                                  </div>

                                  {/* Operator Name & Token */}
                                  <div className="min-w-0">
                                    <div className="text-xs font-black text-stone-900 truncate">
                                      {devInfo.displayName}
                                    </div>
                                    <div className="text-[10px] font-mono font-bold text-emerald-700">
                                      {devInfo.isAssigned && devInfo.displayToken ? `T.No: ${devInfo.displayToken}` : 'No operator'}
                                    </div>
                                  </div>
                                </div>

                                {/* Quick Operator Selector to Reassign */}
                                <div className="shrink-0">
                                  <select
                                    value={devInfo.matchedWorker?.id || devInfo.rawId || ''}
                                    onChange={(e) => {
                                      const selId = e.target.value;
                                      const matched = masterWorkers.find(w => w.id === selId || w.tNo === selId);
                                      const emp = employees.find(em => em.employeeId === selId);
                                      const oName = matched?.name || emp?.employeeName || selId;
                                      handleAssignDeviceOperator(devInfo.deviceId, selId, oName);
                                    }}
                                    className="text-[10px] font-bold px-2 py-1 bg-white border border-stone-300 rounded-lg text-stone-700 hover:border-emerald-500 outline-none cursor-pointer max-w-[125px] truncate"
                                    title="Assign or reassign operator for this device"
                                  >
                                    <option value="">(Change Operator)</option>
                                    {masterWorkers.map(w => (
                                      <option key={w.id} value={w.id}>
                                        {w.name} ({w.tNo || w.id})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </td>

                      {/* 4. Mapping Status */}
                      <td>
                        {currentSelectedFrame ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            {currentSelectedFrame} Linked
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200">
                            Unassigned
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {!mappings.length && (
                  <tr>
                    <td colSpan={4} className="text-center py-8 text-stone-500">
                      <p className="text-sm font-bold">No IoT Machine Profiles Found</p>
                      <p className="text-xs text-stone-400 mt-1">
                        Please create an IoT Machine profile and map devices in <strong>Tab 4: Device Mapping</strong> first.
                      </p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
