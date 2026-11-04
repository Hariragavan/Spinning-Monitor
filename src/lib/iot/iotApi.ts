import {
  SpinfoOverviewResponse,
  SpinfoMachineDetailResponse,
  Employee,
  Machine,
  MachineMapping,
  MachineMappingInput,
  DeviceHealth,
  EmployeeMetric,
  Shift,
  MaintenanceEntry,
  ReportFilter,
  ReportResponse,
  ProductionEntryInput,
  ProductionReportRow,
  ProductionReportFilter
} from '@/types/iot';
import {
  SAMPLE_EMPLOYEES,
  SAMPLE_MACHINES,
  SAMPLE_MAPPINGS,
  SAMPLE_DEVICES,
  SAMPLE_SHIFTS,
  SAMPLE_MAINTENANCE,
  SAMPLE_PRODUCTION_ENTRIES,
  SAMPLE_EMPLOYEE_METRICS,
  getSampleSpinfoOverview,
  getSampleMachineDetail
} from './sampleIotData';

// Storage keys for persisting edits locally when backend is offline
const STORAGE_PREFIX = 'scm_iot_';

function getStored<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function setStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {}
}

const DEFAULT_BACKEND_URL = '/api/iot';

async function fetchWithFallback<T>(url: string, options?: RequestInit, fallback?: T): Promise<T> {
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Company-Slug': 'scm',
        ...(options?.headers || {})
      }
    });
    if (res.ok) {
      const json = await res.json();
      if (json && typeof json === 'object') {
        if ('data' in json && json.data !== null && json.data !== undefined) {
          return json.data as T;
        }
        if (json.data === null && fallback !== undefined) {
          return fallback;
        }
        return json as T;
      }
    }
  } catch {
    // API not reachable, proceed to fallback
  }
  if (fallback !== undefined) return fallback;
  throw new Error(`API call failed to ${url}`);
}

export const iotApi = {
  baseUrl: DEFAULT_BACKEND_URL,

  // 1. Telemetry / SPinFO
  async getSpinfoOverview(filter?: {
    fromDate?: string;
    toDate?: string;
    shift?: string;
    operator?: string;
  }): Promise<SpinfoOverviewResponse> {
    const params = new URLSearchParams();
    if (filter?.fromDate) params.set('fromDate', filter.fromDate);
    if (filter?.toDate) params.set('toDate', filter.toDate);
    if (filter?.shift) params.set('shift', filter.shift);
    if (filter?.operator) params.set('operator', filter.operator);

    const fallback = getSampleSpinfoOverview(filter);
    return fetchWithFallback<SpinfoOverviewResponse>(
      `${this.baseUrl}/spinfo/overview?${params.toString()}`,
      { method: 'GET' },
      fallback
    );
  },

  async getSpinfoMachineDetail(machineId: string, filter?: {
    fromDate?: string;
    toDate?: string;
    shift?: string;
  }): Promise<SpinfoMachineDetailResponse> {
    const params = new URLSearchParams();
    if (filter?.fromDate) params.set('fromDate', filter.fromDate);
    if (filter?.toDate) params.set('toDate', filter.toDate);
    if (filter?.shift) params.set('shift', filter.shift);

    const fallback = getSampleMachineDetail(machineId);
    return fetchWithFallback<SpinfoMachineDetailResponse>(
      `${this.baseUrl}/machine/${encodeURIComponent(machineId)}?${params.toString()}`,
      { method: 'GET' },
      fallback
    );
  },

  async getMachineDetail(machineId: string, filter?: {
    fromDate?: string;
    toDate?: string;
    shift?: string;
  }): Promise<SpinfoMachineDetailResponse> {
    return this.getSpinfoMachineDetail(machineId, filter);
  },

  async syncSpinfo(): Promise<{ success: boolean; message: string; overview: SpinfoOverviewResponse }> {
    const overview = getSampleSpinfoOverview();
    return fetchWithFallback(
      `${this.baseUrl}/spinfo/sync?limit=100`,
      { method: 'GET' },
      { success: true, message: 'Telemetry synchronized', overview }
    );
  },

  // 2. Employees & Machine Operators
  async getEmployees(): Promise<Employee[]> {
    const stored = getStored<Employee[]>('employees', SAMPLE_EMPLOYEES);
    const res = await fetchWithFallback<{ success: boolean; data: Employee[] }>(
      `${this.baseUrl}/master/employees`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return res.data || stored;
  },

  async getEmployeePerformance(filter?: {
    employeeId?: string;
    machineId?: string;
    date?: string;
    shiftName?: string;
  }): Promise<EmployeeMetric[]> {
    const params = new URLSearchParams();
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.date) params.set('date', filter.date);
    if (filter?.shiftName) params.set('shiftName', filter.shiftName);

    let list = getStored<EmployeeMetric[]>('employee_metrics', SAMPLE_EMPLOYEE_METRICS);
    if (filter?.employeeId) {
      list = list.filter(m => m.employeeId === filter.employeeId);
    }
    if (filter?.machineId) {
      list = list.filter(m => m.machineId === filter.machineId);
    }

    const res = await fetchWithFallback<{ success: boolean; data: EmployeeMetric[] }>(
      `${this.baseUrl}/dashboard/employee?${params.toString()}`,
      { method: 'GET' },
      { success: true, data: list }
    );
    return res.data || list;
  },

  // 3. Machines & Mappings
  async getMachines(): Promise<Machine[]> {
    const stored = getStored<Machine[]>('machines', SAMPLE_MACHINES);
    const res = await fetchWithFallback<{ success: boolean; data: Machine[] }>(
      `${this.baseUrl}/master/machines`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return res.data || stored;
  },

  async getMachineMappings(): Promise<MachineMapping[]> {
    const stored = getStored<MachineMapping[]>('mappings', SAMPLE_MAPPINGS);
    const res = await fetchWithFallback<{ success: boolean; data: MachineMapping[] }>(
      `${this.baseUrl}/master/machine-mappings`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return res.data || stored;
  },

  async saveMachineMapping(mapping: MachineMappingInput, mappingId?: string): Promise<MachineMapping> {
    const mappings = await this.getMachineMappings();
    let updated: MachineMapping;
    if (mappingId) {
      updated = { mappingId, name: mapping.name, stationIds: mapping.stationIds, updatedAt: new Date().toISOString() };
      const next = mappings.map(m => m.mappingId === mappingId ? updated : m);
      setStored('mappings', next);
    } else {
      updated = { mappingId: `map_${Date.now()}`, name: mapping.name, stationIds: mapping.stationIds, createdAt: new Date().toISOString() };
      setStored('mappings', [updated, ...mappings]);
    }
    try {
      if (mappingId) {
        await fetch(`${this.baseUrl}/master/machine-mappings/${encodeURIComponent(mappingId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mapping)
        });
      } else {
        await fetch(`${this.baseUrl}/master/machine-mappings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mapping)
        });
      }
    } catch {}
    return updated;
  },

  async deleteMachineMapping(mappingId: string): Promise<boolean> {
    const mappings = await this.getMachineMappings();
    const next = mappings.filter(m => m.mappingId !== mappingId);
    setStored('mappings', next);
    try {
      await fetch(`${this.baseUrl}/master/machine-mappings/${encodeURIComponent(mappingId)}`, { method: 'DELETE' });
    } catch {}
    return true;
  },

  // 4. Devices
  async getDevices(): Promise<DeviceHealth[]> {
    const stored = getStored<DeviceHealth[]>('devices', SAMPLE_DEVICES);
    const res = await fetchWithFallback<{ success: boolean; data: DeviceHealth[] }>(
      `${this.baseUrl}/master/devices`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return res.data || stored;
  },

  async updateDeviceConfig(deviceId: string, payload: Partial<DeviceHealth>): Promise<DeviceHealth> {
    const devices = await this.getDevices();
    const updated = devices.map(d => d.deviceId === deviceId ? { ...d, ...payload } : d);
    setStored('devices', updated);
    try {
      await fetch(`${this.baseUrl}/master/devices/${encodeURIComponent(deviceId)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch {}
    return updated.find(d => d.deviceId === deviceId)!;
  },

  async assignDevicesToEmployee(employeeId: string, deviceIds: string[], employeeName?: string): Promise<boolean> {
    const employees = await this.getEmployees();
    const updated = employees.map(e => e.employeeId === employeeId ? { ...e, assignedDeviceIds: deviceIds } : e);
    setStored('employees', updated);
    try {
      await fetch(`${this.baseUrl}/master/employees/${encodeURIComponent(employeeId)}/assign-devices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds, employeeName })
      });
    } catch {}
    return true;
  },

  // 5. Shifts
  async getShifts(): Promise<Shift[]> {
    const stored = getStored<Shift[]>('shifts', SAMPLE_SHIFTS);
    const res = await fetchWithFallback<{ success: boolean; data: Shift[] }>(
      `${this.baseUrl}/master/shifts`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return res.data || stored;
  },

  async saveShift(shift: Omit<Shift, 'shiftId'>, shiftId?: string): Promise<Shift> {
    const shifts = await this.getShifts();
    let updated: Shift;
    if (shiftId) {
      updated = { shiftId, ...shift };
      const next = shifts.map(s => s.shiftId === shiftId ? updated : s);
      setStored('shifts', next);
    } else {
      updated = { shiftId: `shift_${Date.now()}`, ...shift };
      setStored('shifts', [...shifts, updated]);
    }
    try {
      if (shiftId) {
        await fetch(`${this.baseUrl}/master/shifts/${encodeURIComponent(shiftId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shift)
        });
      } else {
        await fetch(`${this.baseUrl}/master/shifts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shift)
        });
      }
    } catch {}
    return updated;
  },

  async deleteShift(shiftId: string): Promise<boolean> {
    const shifts = await this.getShifts();
    const next = shifts.filter(s => s.shiftId !== shiftId);
    setStored('shifts', next);
    try {
      await fetch(`${this.baseUrl}/master/shifts/${encodeURIComponent(shiftId)}`, { method: 'DELETE' });
    } catch {}
    return true;
  },

  // 6. Maintenance
  async getMaintenance(): Promise<MaintenanceEntry[]> {
    const stored = getStored<MaintenanceEntry[]>('maintenance', SAMPLE_MAINTENANCE);
    const res = await fetchWithFallback<{ success: boolean; data: MaintenanceEntry[] }>(
      `${this.baseUrl}/master/maintenance`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return res.data || stored;
  },

  async saveMaintenance(entry: Omit<MaintenanceEntry, 'maintenanceId'>, maintenanceId?: string): Promise<MaintenanceEntry> {
    const list = await this.getMaintenance();
    let updated: MaintenanceEntry;
    if (maintenanceId) {
      updated = { maintenanceId, ...entry };
      const next = list.map(m => m.maintenanceId === maintenanceId ? updated : m);
      setStored('maintenance', next);
    } else {
      updated = { maintenanceId: `mnt_${Date.now()}`, ...entry };
      setStored('maintenance', [updated, ...list]);
    }
    try {
      if (maintenanceId) {
        await fetch(`${this.baseUrl}/master/maintenance/${encodeURIComponent(maintenanceId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
      } else {
        await fetch(`${this.baseUrl}/master/maintenance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(entry)
        });
      }
    } catch {}
    return updated;
  },

  // 7. Production Entries
  async getProductionReport(filter?: ProductionReportFilter): Promise<ProductionReportRow[]> {
    const stored = getStored<ProductionReportRow[]>('production_entries', SAMPLE_PRODUCTION_ENTRIES);
    let list = [...stored];
    if (filter?.date) list = list.filter(r => r.date === filter.date);
    if (filter?.shiftId) list = list.filter(r => r.shiftId === filter.shiftId);
    if (filter?.machineId) list = list.filter(r => r.machineId === filter.machineId);
    if (filter?.employeeId) list = list.filter(r => r.employeeId === filter.employeeId);

    const params = new URLSearchParams();
    if (filter?.date) params.set('date', filter.date);
    if (filter?.shiftId) params.set('shiftId', filter.shiftId);
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);

    const res = await fetchWithFallback<{ success: boolean; data: ProductionReportRow[] }>(
      `${this.baseUrl}/production/report?${params.toString()}`,
      { method: 'GET' },
      { success: true, data: list }
    );
    return res.data || list;
  },

  async createProductionEntry(entry: ProductionEntryInput): Promise<ProductionReportRow> {
    const stored = getStored<ProductionReportRow[]>('production_entries', SAMPLE_PRODUCTION_ENTRIES);
    const newRow: ProductionReportRow = {
      entryId: `pe_${Date.now()}`,
      date: entry.date,
      enteredAt: new Date().toISOString(),
      shiftId: entry.shiftId,
      shiftName: entry.shiftId === 'shift_1' ? 'Shift 1' : entry.shiftId === 'shift_2' ? 'Shift 2' : 'Shift 3',
      machineId: entry.machineId,
      machineName: entry.machineId,
      employeeId: entry.employeeId,
      employeeName: entry.employeeName || entry.employeeId,
      counts: entry.counts,
      speed: entry.speed,
      productionOutput: entry.productionOutput || 0,
      targetOutput: entry.targetOutput || 98.4,
      wastePercent: entry.wastePercent || 1.4,
      runtimeMinutes: entry.runtimeMinutes || 460,
      notes: entry.notes
    };
    const next = [newRow, ...stored];
    setStored('production_entries', next);
    try {
      await fetch(`${this.baseUrl}/production/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
    } catch {}
    return newRow;
  },

  async updateProductionEntry(entryId: string, entry: Partial<ProductionEntryInput>): Promise<boolean> {
    const stored = getStored<ProductionReportRow[]>('production_entries', SAMPLE_PRODUCTION_ENTRIES);
    const next = stored.map(r => r.entryId === entryId ? { ...r, ...entry, productionOutput: entry.productionOutput ?? r.productionOutput } : r);
    setStored('production_entries', next);
    try {
      await fetch(`${this.baseUrl}/production/entries/${encodeURIComponent(entryId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
    } catch {}
    return true;
  },

  async deleteProductionEntry(entryId: string): Promise<boolean> {
    const stored = getStored<ProductionReportRow[]>('production_entries', SAMPLE_PRODUCTION_ENTRIES);
    const next = stored.filter(r => r.entryId !== entryId);
    setStored('production_entries', next);
    try {
      await fetch(`${this.baseUrl}/production/entries/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
    } catch {}
    return true;
  },

  // 8. Reports (5 types)
  async getReports(filter: ReportFilter): Promise<ReportResponse> {
    const overview = getSampleSpinfoOverview();

    switch (filter.reportType) {
      case 'rpm_efficiency': {
        const rows = overview.machines.map(m => ({
          machineId: m.machineId,
          count: m.count,
          runStatus: m.runStatus,
          currentRpm: m.spindleSpeedCurrent,
          targetRpm: 16700,
          efficiencyPercent: Math.round((m.shiftProduction / (m.shiftTargetProduction || 1)) * 100),
          shiftProduction: m.shiftProduction,
          shiftTarget: m.shiftTargetProduction,
          wastePercent: m.shiftWaste
        }));
        return {
          success: true,
          reportType: 'rpm_efficiency',
          title: 'Spinning & Machine Efficiency Report',
          data: rows,
          summary: {
            totalMachines: rows.length,
            averageEfficiency: Math.round(rows.reduce((s, r) => s + r.efficiencyPercent, 0) / rows.length),
            averageRpm: Math.round(rows.reduce((s, r) => s + r.currentRpm, 0) / rows.length),
            totalProduction: rows.reduce((s, r) => s + r.shiftProduction, 0).toFixed(1)
          }
        };
      }
      case 'employee_productivity': {
        const rows = SAMPLE_EMPLOYEE_METRICS.map(emp => ({
          employeeId: emp.employeeId,
          employeeName: emp.employeeName,
          assignedMachine: emp.machineId,
          roundsCompleted: emp.roundsCompleted,
          expectedRounds: emp.expectedRounds || 16,
          completionPercent: Math.round((emp.roundsCompleted / (emp.expectedRounds || 16)) * 100),
          averageGapMinutes: emp.avgGapMinutes,
          status: emp.activeStatus
        }));
        return {
          success: true,
          reportType: 'employee_productivity',
          title: 'Employee Productivity & Patrol Gaps Report',
          data: rows,
          summary: {
            totalOperators: rows.length,
            averageRounds: (rows.reduce((s, r) => s + r.roundsCompleted, 0) / rows.length).toFixed(1),
            averageGapMinutes: (rows.reduce((s, r) => s + r.averageGapMinutes, 0) / rows.length).toFixed(1)
          }
        };
      }
      case 'downtime_modes': {
        const rows = overview.machines.map(m => ({
          machineId: m.machineId,
          runMinutes: m.runStatus === 'STOP' ? 240 : 445,
          doffMinutes: 20,
          mendingMinutes: m.totalEndBreakCount * 3,
          stoppageMinutes: m.runStatus === 'STOP' ? 210 : 15,
          totalEndBreaks: m.totalEndBreakCount,
          status: m.runStatus
        }));
        return {
          success: true,
          reportType: 'downtime_modes',
          title: 'Machine Downtime & Operating Modes Report',
          data: rows,
          summary: {
            totalDowntimeHours: (rows.reduce((s, r) => s + r.stoppageMinutes, 0) / 60).toFixed(1),
            totalEndBreaks: rows.reduce((s, r) => s + r.totalEndBreaks, 0)
          }
        };
      }
      case 'duty_coverage': {
        const devices = await this.getDevices();
        const rows = devices.map(d => ({
          deviceId: d.deviceId,
          machineId: d.machineId,
          position: d.position || 'Station',
          status: d.status,
          batteryLevel: `${d.batteryLevel || 95}%`,
          signalStrength: `${d.signalStrength || -60} dBm`,
          lastSeen: d.lastSeen
        }));
        return {
          success: true,
          reportType: 'duty_coverage',
          title: 'Device & Tap Station Duty Coverage Report',
          data: rows,
          summary: {
            totalDevices: rows.length,
            healthyDevices: rows.filter(r => r.status === 'HEALTHY').length,
            coveragePercent: 98
          }
        };
      }
      case 'cleaning_maintenance': {
        const maintenance = await this.getMaintenance();
        const rows = maintenance.map(m => ({
          maintenanceId: m.maintenanceId,
          machineId: m.machineId,
          type: m.type.toUpperCase(),
          title: m.title || 'Routine Maintenance',
          scheduledDate: m.scheduledDate,
          assignedPerson: m.assignedPerson,
          status: m.status.toUpperCase(),
          completionDate: m.completionDate || '-'
        }));
        return {
          success: true,
          reportType: 'cleaning_maintenance',
          title: 'Cleaning & Maintenance Schedule Report',
          data: rows,
          summary: {
            totalScheduled: rows.length,
            completed: rows.filter(r => r.status === 'COMPLETED').length,
            pending: rows.filter(r => r.status === 'PLANNED').length
          }
        };
      }
      default:
        return {
          success: true,
          reportType: filter.reportType,
          title: 'Report',
          data: []
        };
    }
  }
};
