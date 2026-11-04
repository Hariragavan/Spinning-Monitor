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
import {
  Settings, Users, Gauge, Radio, Layers, Plus, Edit2, Trash2,
  CheckCircle2, AlertCircle, Save, X, RefreshCw
} from 'lucide-react';

export const IotConfiguration: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'assign_devices' | 'rpm_bounds' | 'machine_config' | 'machine_mapping'>('assign_devices');

  const [employees, setEmployees] = useState<Employee[]>(() => SAMPLE_EMPLOYEES);
  const [devices, setDevices] = useState<DeviceHealth[]>(() => SAMPLE_DEVICES);
  const [machines, setMachines] = useState<Machine[]>(() => SAMPLE_MACHINES);
  const [mappings, setMappings] = useState<MachineMapping[]>(() => SAMPLE_MAPPINGS);

  // 1. Assign devices state
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<string[]>([]);

  // 2. Machine Config state
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [machineConfig, setMachineConfig] = useState<MachineConfiguration>({
    expectedProductionOutput: 98,
    expectedRuntimeMinutes: 460,
    expectedRoundsPerHour: 10,
    roundDeviceSequence: ['DEV_M1_01', 'DEV_M1_02', 'DEV_M1_03'],
    cleaningInterval: 2
  });

  // 3. Machine Mapping state
  const [editingMappingId, setEditingMappingId] = useState<string | null>(null);
  const [mappingName, setMappingName] = useState('');
  const [mappingStations, setMappingStations] = useState<string[]>([]);

  // 4. RPM bounds editing state
  const [editingDevice, setEditingDevice] = useState<DeviceHealth | null>(null);

  // Status feedback
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    try {
      const [e, d, m, maps] = await Promise.all([
        iotApi.getEmployees(),
        iotApi.getDevices(),
        iotApi.getMachines(),
        iotApi.getMachineMappings()
      ]);
      setEmployees(e);
      setDevices(d);
      setMachines(m);
      setMappings(maps);

      if (e.length && !selectedEmployeeId) {
        setSelectedEmployeeId(e[0].employeeId);
        setSelectedDeviceIds(e[0].assignedDeviceIds || []);
      }
      if (m.length && !selectedMachineId) {
        setSelectedMachineId(m[0].machineId);
        setMachineConfig({
          expectedProductionOutput: m[0].expectedProductionOutput || 98,
          expectedRuntimeMinutes: m[0].expectedRuntimeMinutes || 460,
          expectedRoundsPerHour: m[0].expectedRoundsPerHour || 10,
          roundDeviceSequence: m[0].roundDeviceSequence || ['DEV_M1_01', 'DEV_M1_02'],
          cleaningInterval: m[0].cleaningIntervalDays || 2
        });
      }
    } catch (err) {
      console.error('Failed to load configuration:', err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // When selected employee changes, update selected device IDs
  useEffect(() => {
    const emp = employees.find(e => e.employeeId === selectedEmployeeId);
    if (emp) {
      setSelectedDeviceIds(emp.assignedDeviceIds || []);
    }
  }, [selectedEmployeeId, employees]);

  // When selected machine changes, update machine config
  useEffect(() => {
    const mach = machines.find(m => m.machineId === selectedMachineId);
    if (mach) {
      setMachineConfig({
        expectedProductionOutput: mach.expectedProductionOutput || 98,
        expectedRuntimeMinutes: mach.expectedRuntimeMinutes || 460,
        expectedRoundsPerHour: mach.expectedRoundsPerHour || 10,
        roundDeviceSequence: mach.roundDeviceSequence || ['DEV_M1_01', 'DEV_M1_02'],
        cleaningInterval: mach.cleaningIntervalDays || 2
      });
    }
  }, [selectedMachineId, machines]);

  // Handle Save Employee Device Assignments
  const handleSaveAssignments = async () => {
    if (!selectedEmployeeId) return;
    setSaving(true);
    try {
      const emp = employees.find(e => e.employeeId === selectedEmployeeId);
      await iotApi.assignDevicesToEmployee(selectedEmployeeId, selectedDeviceIds, emp?.employeeName);
      setEmployees(prev => prev.map(e => e.employeeId === selectedEmployeeId ? { ...e, assignedDeviceIds: selectedDeviceIds } : e));
      setMessage('Device assignments saved successfully.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setErrorMessage('Failed to save device assignment.');
    } finally {
      setSaving(false);
    }
  };

  // Toggle device selection for employee assignment
  const toggleDeviceSelection = (deviceId: string) => {
    setSelectedDeviceIds(prev =>
      prev.includes(deviceId) ? prev.filter(id => id !== deviceId) : [...prev, deviceId]
    );
  };

  // Handle Save Machine Config
  const handleSaveMachineConfig = async () => {
    setSaving(true);
    try {
      setMachines(prev => prev.map(m => m.machineId === selectedMachineId ? {
        ...m,
        expectedProductionOutput: machineConfig.expectedProductionOutput,
        expectedRuntimeMinutes: machineConfig.expectedRuntimeMinutes,
        expectedRoundsPerHour: machineConfig.expectedRoundsPerHour,
        roundDeviceSequence: machineConfig.roundDeviceSequence,
        cleaningIntervalDays: machineConfig.cleaningInterval
      } : m));
      setMessage(`Configuration for ${selectedMachineId} updated.`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setErrorMessage('Failed to update machine config.');
    } finally {
      setSaving(false);
    }
  };

  // Handle Save Machine Mapping
  const handleSaveMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mappingName || !mappingStations.length) return;
    setSaving(true);
    try {
      const input: MachineMappingInput = { name: mappingName, stationIds: mappingStations };
      const saved = await iotApi.saveMachineMapping(input, editingMappingId || undefined);
      if (editingMappingId) {
        setMappings(prev => prev.map(m => m.mappingId === editingMappingId ? saved : m));
      } else {
        setMappings(prev => [saved, ...prev]);
      }
      setEditingMappingId(null);
      setMappingName('');
      setMappingStations([]);
      setMessage('Machine mapping saved.');
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setErrorMessage('Failed to save mapping.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMapping = async (mappingId: string) => {
    if (!window.confirm('Delete this machine mapping?')) return;
    try {
      await iotApi.deleteMachineMapping(mappingId);
      setMappings(prev => prev.filter(m => m.mappingId !== mappingId));
    } catch (err) {
      console.error('Failed to delete mapping:', err);
    }
  };

  // Handle Save Device Bounds
  const handleSaveDeviceBounds = async () => {
    if (!editingDevice) return;
    try {
      const updated = await iotApi.updateDeviceConfig(editingDevice.deviceId, {
        minRpm: editingDevice.minRpm,
        maxRpm: editingDevice.maxRpm,
        position: editingDevice.position
      });
      setDevices(prev => prev.map(d => d.deviceId === updated.deviceId ? updated : d));
      setEditingDevice(null);
      setMessage(`Device ${updated.deviceId} bounds updated.`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) {
      setErrorMessage('Failed to update device bounds.');
    }
  };

  return (
    <div className="dashboard-page w-full space-y-5 pb-10">
      {/* Header */}
      <div className="bg-white rounded-3xl p-5 border border-stone-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-700 bg-stone-100 px-2.5 py-0.5 rounded-full border border-stone-200">
              System Administration
            </span>
            <span className="text-stone-300">/</span>
            <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">
              IoT Sensor Configuration
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-black text-stone-900 tracking-tight mt-1">
            System Configuration & Device Management
          </h1>
          <p className="text-xs text-stone-500">
            Assign station devices to operators, set RPM safety bounds, configure ring frame parameters and logical machine mappings
          </p>
        </div>
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

      {/* Sub Tabs */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-3xl border border-stone-200 shadow-2xs overflow-x-auto no-scrollbar">
        {[
          { id: 'assign_devices', label: '1. Assign Devices to Employee', icon: Users },
          { id: 'rpm_bounds', label: '2. RPM Bounds & Sensor Health', icon: Radio },
          { id: 'machine_config', label: '3. Machine Parameters & Standards', icon: Gauge },
          { id: 'machine_mapping', label: '4. Tap Station to Machine Mapping', icon: Layers }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-2 rounded-2xl font-bold text-xs whitespace-nowrap transition-all cursor-pointer flex items-center gap-2 ${
                isActive
                  ? 'bg-stone-900 text-white shadow-xs'
                  : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
              }`}
            >
              <Icon size={14} className={isActive ? 'text-cyan-400' : 'text-stone-400'} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Sub Tab 1: Assign Devices to Employee */}
      {activeSubTab === 'assign_devices' && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
                Operator Tap Station Assignments
              </h2>
              <p className="text-xs text-stone-500">
                Select an operator and check the physical tap station devices they patrol on their shift
              </p>
            </div>

            <button
              onClick={handleSaveAssignments}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Save size={14} />
              <span>Save Assignments</span>
            </button>
          </div>

          {/* Select Employee */}
          <div className="max-w-md space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Select Operator / Employee</label>
            <select
              value={selectedEmployeeId}
              onChange={(e) => setSelectedEmployeeId(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none cursor-pointer"
            >
              {employees.map(e => (
                <option key={e.employeeId} value={e.employeeId}>{e.employeeName} ({e.employeeId})</option>
              ))}
            </select>
          </div>

          {/* Device Checklist */}
          <div className="space-y-2 pt-2">
            <span className="text-xs font-black uppercase text-stone-700 tracking-wider block">
              Available Station Devices ({devices.length}) · {selectedDeviceIds.length} Selected
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {devices.map(dev => {
                const isSelected = selectedDeviceIds.includes(dev.deviceId);
                return (
                  <div
                    key={dev.deviceId}
                    onClick={() => toggleDeviceSelection(dev.deviceId)}
                    className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-cyan-50/80 border-cyan-400 shadow-2xs ring-1 ring-cyan-500/20'
                        : 'bg-stone-50 border-stone-200 hover:bg-white'
                    }`}
                  >
                    <div>
                      <span className="font-mono font-bold text-xs text-stone-900 block">{dev.deviceId}</span>
                      <span className="text-[11px] text-stone-500">{dev.machineId} · {dev.position}</span>
                    </div>

                    <div className={`w-5 h-5 rounded-lg flex items-center justify-center border ${
                      isSelected ? 'bg-cyan-600 border-cyan-600 text-white' : 'border-stone-300 bg-white'
                    }`}>
                      {isSelected && <CheckCircle2 size={13} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 2: RPM Bounds & Sensor Health */}
      {activeSubTab === 'rpm_bounds' && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
                RPM Safety Bounds & Sensor Telemetry Status
              </h2>
              <p className="text-xs text-stone-500">
                Calibrate speed boundary limits and inspect sensor battery & signal levels
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-[10px] font-black uppercase text-stone-400">
                  <th className="pb-3">Device ID</th>
                  <th className="pb-3">Frame</th>
                  <th className="pb-3">Position</th>
                  <th className="pb-3">Current RPM</th>
                  <th className="pb-3">Min RPM Limit</th>
                  <th className="pb-3">Max RPM Limit</th>
                  <th className="pb-3">Battery</th>
                  <th className="pb-3">Signal</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {devices.map(d => (
                  <tr key={d.deviceId} className="hover:bg-stone-50">
                    <td className="py-3 font-mono font-bold text-stone-900">{d.deviceId}</td>
                    <td className="py-3 font-bold text-stone-800">{d.machineId}</td>
                    <td className="py-3 text-stone-600">{d.position || 'Headstock'}</td>
                    <td className="py-3 font-mono font-black text-stone-900">{d.rpm || 0}</td>
                    <td className="py-3 font-mono text-stone-600">{d.minRpm || 15000}</td>
                    <td className="py-3 font-mono text-stone-600">{d.maxRpm || 17200}</td>
                    <td className="py-3 font-mono text-stone-700">{d.batteryLevel || 95}%</td>
                    <td className="py-3 font-mono text-stone-700">{d.signalStrength || -60} dBm</td>
                    <td className="py-3">
                      <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-black uppercase ${
                        d.status === 'HEALTHY' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => setEditingDevice(d)}
                        className="px-2.5 py-1 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-[11px] cursor-pointer"
                      >
                        Calibrate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub Tab 3: Machine Parameters & Standards */}
      {activeSubTab === 'machine_config' && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
                Ring Frame Operating Parameters
              </h2>
              <p className="text-xs text-stone-500">
                Configure baseline targets, cleaning interval and tap device patrol sequence for each ring frame
              </p>
            </div>

            <button
              onClick={handleSaveMachineConfig}
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 rounded-2xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Save size={14} />
              <span>Update Frame Settings</span>
            </button>
          </div>

          <div className="max-w-md space-y-1.5">
            <label className="text-xs font-bold text-stone-700">Select Ring Frame</label>
            <select
              value={selectedMachineId}
              onChange={(e) => setSelectedMachineId(e.target.value)}
              className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-bold text-stone-800 outline-none cursor-pointer"
            >
              {machines.map(m => (
                <option key={m.machineId} value={m.machineId}>{m.machineName} ({m.machineId})</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700">Target Production (kg / shift)</label>
              <input
                type="number"
                value={machineConfig.expectedProductionOutput}
                onChange={(e) => setMachineConfig(prev => ({ ...prev, expectedProductionOutput: Number(e.target.value) }))}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-mono font-bold outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700">Expected Runtime (minutes)</label>
              <input
                type="number"
                value={machineConfig.expectedRuntimeMinutes}
                onChange={(e) => setMachineConfig(prev => ({ ...prev, expectedRuntimeMinutes: Number(e.target.value) }))}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-mono font-bold outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700">Expected Rounds / Hour</label>
              <input
                type="number"
                value={machineConfig.expectedRoundsPerHour}
                onChange={(e) => setMachineConfig(prev => ({ ...prev, expectedRoundsPerHour: Number(e.target.value) }))}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-mono font-bold outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-stone-700">Cleaning Interval (days)</label>
              <input
                type="number"
                value={machineConfig.cleaningInterval}
                onChange={(e) => setMachineConfig(prev => ({ ...prev, cleaningInterval: Number(e.target.value) }))}
                className="w-full bg-stone-50 border border-stone-200 rounded-2xl px-3.5 py-2 text-xs font-mono font-bold outline-none"
              />
            </div>
          </div>
        </div>
      )}

      {/* Sub Tab 4: Machine Mapping */}
      {activeSubTab === 'machine_mapping' && (
        <div className="bg-white rounded-3xl p-6 border border-stone-200 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-100">
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-stone-900">
                Physical Tap Stations Grouped into Logical Machines
              </h2>
              <p className="text-xs text-stone-500">
                Group physical sensor stations (e.g. DEV_M1_01, DEV_M1_02, DEV_M1_03) into logical production machines
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSaveMapping} className="p-4 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-800">
              {editingMappingId ? 'Edit Machine Mapping' : 'Create New Machine Mapping'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">Mapping Name</label>
                <input
                  type="text"
                  placeholder="e.g. RF01 - Ring Frame 1"
                  value={mappingName}
                  onChange={(e) => setMappingName(e.target.value)}
                  required
                  className="w-full bg-white border border-stone-200 rounded-xl px-3 py-2 text-xs font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-stone-700 block mb-1">
                  Assign Station Devices ({mappingStations.length} selected)
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-white rounded-xl border border-stone-200">
                  {devices.map(d => {
                    const isChecked = mappingStations.includes(d.deviceId);
                    return (
                      <button
                        type="button"
                        key={d.deviceId}
                        onClick={() => setMappingStations(prev => isChecked ? prev.filter(x => x !== d.deviceId) : [...prev, d.deviceId])}
                        className={`px-2 py-1 rounded-lg text-[10px] font-mono font-bold cursor-pointer transition-all ${
                          isChecked ? 'bg-cyan-600 text-white shadow-2xs' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                        }`}
                      >
                        {d.deviceId}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              {editingMappingId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingMappingId(null);
                    setMappingName('');
                    setMappingStations([]);
                  }}
                  className="px-4 py-1.5 rounded-xl bg-stone-200 hover:bg-stone-300 text-stone-700 font-bold text-xs cursor-pointer"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs cursor-pointer"
              >
                {saving ? 'Saving...' : editingMappingId ? 'Update Mapping' : 'Add Machine Mapping'}
              </button>
            </div>
          </form>

          {/* Existing Mappings List */}
          <div className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wider text-stone-800">
              Active Configured Mappings ({mappings.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {mappings.map(m => (
                <div key={m.mappingId} className="p-4 bg-stone-50 rounded-2xl border border-stone-200 flex items-center justify-between">
                  <div>
                    <h4 className="font-black text-sm text-stone-900">{m.name}</h4>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {m.stationIds.map(st => (
                        <span key={st} className="px-2 py-0.5 rounded-md bg-stone-200/80 font-mono text-[10px] text-stone-700">
                          {st}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        setEditingMappingId(m.mappingId);
                        setMappingName(m.name);
                        setMappingStations(m.stationIds);
                      }}
                      className="p-1.5 rounded-lg bg-white border border-stone-200 hover:bg-stone-100 text-stone-700 cursor-pointer"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      onClick={() => handleDeleteMapping(m.mappingId)}
                      className="p-1.5 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 cursor-pointer"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Edit Device Bounds Modal */}
      {editingDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl shadow-2xl border border-stone-200 max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <h3 className="text-base font-black text-stone-900">
                Calibrate {editingDevice.deviceId}
              </h3>
              <button
                onClick={() => setEditingDevice(null)}
                className="p-1.5 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-stone-700 block mb-1">Mount Position</label>
                <input
                  type="text"
                  value={editingDevice.position || ''}
                  onChange={(e) => setEditingDevice({ ...editingDevice, position: e.target.value })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Minimum RPM Threshold</label>
                <input
                  type="number"
                  value={editingDevice.minRpm || 15000}
                  onChange={(e) => setEditingDevice({ ...editingDevice, minRpm: Number(e.target.value) })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-bold text-stone-700 block mb-1">Maximum RPM Threshold</label>
                <input
                  type="number"
                  value={editingDevice.maxRpm || 17200}
                  onChange={(e) => setEditingDevice({ ...editingDevice, maxRpm: Number(e.target.value) })}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-2 font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3">
              <button
                onClick={() => setEditingDevice(null)}
                className="px-4 py-2 rounded-xl bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDeviceBounds}
                className="px-5 py-2 rounded-xl bg-cyan-700 hover:bg-cyan-800 text-white font-bold text-xs cursor-pointer"
              >
                Save Limits
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

