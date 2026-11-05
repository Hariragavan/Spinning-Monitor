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
  ProductionReportFilter,
  MachineRoundPerformance
} from '@/types/iot';
import {
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

export const IOT_REMOTE_API_BASE =
  process.env.NEXT_PUBLIC_IOT_REMOTE_API ||
  process.env.IOT_REMOTE_API ||
  'https://iot-machine-backend.onrender.com/api';

async function fetchWithFallback<T>(url: string, init?: RequestInit, fallback?: T): Promise<T> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const headers: Record<string, string> = {
      'X-Company-Slug': 'scm',
      ...((init?.headers as Record<string, string>) || {})
    };
    const res = await fetch(url, { ...init, headers, signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

export const iotApi = {
  baseUrl: IOT_REMOTE_API_BASE,

  // 1. Spinfo Overview & Machine Details
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
    params.set('_t', String(Date.now()));

    const emptyFallback: SpinfoOverviewResponse = {
      success: true,
      dataTime: new Date().toISOString().replace('T', ' ').slice(0, 19),
      shiftDate: filter?.fromDate || new Date().toISOString().slice(0, 10),
      shift: filter?.shift ? Number(filter.shift.replace(/\D/g, '')) || 1 : 1,
      frameStatus: { totalMachines: 0, reporting: 0, running: 0, runningPercent: 0, stopped: 0, doffing: 0, stoppedAndDoffing: 0, offline: 0, totalEndBreaks: 0, leftBreaks: 0, rightBreaks: 0 },
      performanceAndCare: { averageRpm: 0, totalEndBreaks: 0, outsideRpmCount: 0, productionYieldPercent: 0, productionYieldKg: 0, targetProductionKg: 0, yieldAchievedPercent: 0, completedRounds: 0, totalRoundsScheduled: 0, skippedRounds: 0, incompleteRounds: 0, totalDevices: 0, devicesInBounds: 0, sensorBoundBreaches: 0, speedBreachAlerts: 0, preventiveCleaningDue: 0, preventiveCleaningDueCount: 0, dueMachineNames: [] },
      hourlyProduction: { shiftTotalKg: 0, totalProduction: 0, totalTarget: 0, peakHour: 'H1', avgPerHourKg: 0, chart: [] },
      machines: []
    };

    // First try remote backend route if available
    try {
      const res = await fetch(`${this.baseUrl}/spinfo/overview?${params.toString()}`, {
        headers: { 'X-Company-Slug': 'scm' }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data && json.data.frameStatus) return json.data;
      }
    } catch {}

    // Fallback to local server endpoint which generates overview from live common stream or local DB
    const res = await fetchWithFallback<{ success: boolean; data: SpinfoOverviewResponse }>(
      `/api/iot/spinfo/overview?${params.toString()}`,
      { method: 'GET' },
      { success: true, data: emptyFallback }
    );
    return res.data || emptyFallback;
  },

  async getMachineDetail(
    machineId: string,
    filter?: {
      fromDate?: string;
      toDate?: string;
      shift?: string;
      operator?: string;
    }
  ): Promise<SpinfoMachineDetailResponse> {
    const params = new URLSearchParams();
    if (filter?.fromDate) params.set('fromDate', filter.fromDate);
    if (filter?.toDate) params.set('toDate', filter.toDate);
    if (filter?.shift) params.set('shift', filter.shift);
    if (filter?.operator) params.set('operator', filter.operator);

    const fallback: SpinfoMachineDetailResponse = getSampleMachineDetail(machineId);

    try {
      const res = await fetch(`${this.baseUrl}/spinfo/machine/${encodeURIComponent(machineId)}?${params.toString()}`, {
        headers: { 'X-Company-Slug': 'scm' }
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) return json.data;
      }
    } catch {}

    const res = await fetchWithFallback<{ success: boolean; data: SpinfoMachineDetailResponse }>(
      `/api/iot/spinfo/machine/${encodeURIComponent(machineId)}?${params.toString()}`,
      { method: 'GET' },
      { success: true, data: fallback }
    );
    return res.data || fallback;
  },

  async syncSpinfoData(): Promise<SpinfoOverviewResponse> {
    const fallback = getSampleSpinfoOverview();
    const res = await fetchWithFallback<{ success: boolean; data: SpinfoOverviewResponse }>(
      `/api/iot/spinfo/sync`,
      { method: 'POST' },
      { success: true, data: fallback }
    );
    return res.data || fallback;
  },

  // 2. Employees & Duty Tracking
  async getEmployees(): Promise<Employee[]> {
    const stored = getStored<Employee[]>('employees', []);
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
    shiftId?: string;
  }): Promise<EmployeeMetric[]> {
    const params = new URLSearchParams();
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.date) params.set('date', filter.date);
    if (filter?.shiftName && filter.shiftName !== 'All shifts') params.set('shiftName', filter.shiftName);
    if (filter?.shiftId && filter.shiftId.length === 24) params.set('shiftId', filter.shiftId);
    params.set('_t', String(Date.now()));

    let list = getStored<EmployeeMetric[]>('employee_metrics', []);
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
    const stored = getStored<Machine[]>('machines', []);
    const res = await fetchWithFallback<{ success: boolean; data: Machine[] }>(
      `${this.baseUrl}/master/machines`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return res.data || stored;
  },

  async getMachineMappings(): Promise<MachineMapping[]> {
    const stored = getStored<MachineMapping[]>('mappings', []);
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
          headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
          body: JSON.stringify(mapping)
        });
      } else {
        await fetch(`${this.baseUrl}/master/machine-mappings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
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
      await fetch(`${this.baseUrl}/master/machine-mappings/${encodeURIComponent(mappingId)}`, {
        method: 'DELETE',
        headers: { 'X-Company-Slug': 'scm' }
      });
    } catch {}
    return true;
  },

  async saveMachineConfig(machineId: string, config: any): Promise<any> {
    try {
      await fetch(`${this.baseUrl}/master/machines/${encodeURIComponent(machineId)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
        body: JSON.stringify(config)
      });
    } catch {}
    return config;
  },

  // 4. Devices
  async getDevices(): Promise<DeviceHealth[]> {
    const stored = getStored<DeviceHealth[]>('devices', []);
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
        headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
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
        headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
        body: JSON.stringify({ deviceIds, employeeName })
      });
    } catch {}
    return true;
  },

  async saveEmployeeDeviceMapping(payload: { employeeId: string; deviceIds: string[]; employeeName?: string }): Promise<boolean> {
    return this.assignDevicesToEmployee(payload.employeeId, payload.deviceIds, payload.employeeName);
  },

  // 5. Shifts
  async getShifts(): Promise<Shift[]> {
    const stored = getStored<Shift[]>('shifts', []);
    const res = await fetchWithFallback<{ success: boolean; data: any[] }>(
      `${this.baseUrl}/master/shifts`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    const list = res.data || stored || [];
    return list.map((s: any) => ({
      shiftId: s.shiftId || s._id || '',
      name: s.name || s.shiftName || '',
      shiftName: s.name || s.shiftName || '',
      startTime: s.startTime || '00:00',
      endTime: s.endTime || '00:00',
      overnight: Boolean(s.overnight),
      active: s.active !== false
    }));
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
          headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
          body: JSON.stringify(shift)
        });
      } else {
        await fetch(`${this.baseUrl}/master/shifts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
          body: JSON.stringify(shift)
        });
      }
    } catch {}
    return updated;
  },

  async createShift(shift: Omit<Shift, 'shiftId'>): Promise<Shift> {
    return this.saveShift(shift);
  },

  async updateShift(shiftId: string, shift: Omit<Shift, 'shiftId'>): Promise<Shift> {
    return this.saveShift(shift, shiftId);
  },

  async deleteShift(shiftId: string): Promise<boolean> {
    const shifts = await this.getShifts();
    const next = shifts.filter(s => s.shiftId !== shiftId);
    setStored('shifts', next);
    try {
      await fetch(`${this.baseUrl}/master/shifts/${encodeURIComponent(shiftId)}`, {
        method: 'DELETE',
        headers: { 'X-Company-Slug': 'scm' }
      });
    } catch {}
    return true;
  },

  // 6. Maintenance
  async getMaintenance(): Promise<MaintenanceEntry[]> {
    const stored = getStored<MaintenanceEntry[]>('maintenance', []);
    const res = await fetchWithFallback<{ success: boolean; data: any[] }>(
      `${this.baseUrl}/master/maintenance`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    const list = res.data || stored || [];
    return list.map((entry: any) => ({
      maintenanceId: entry.maintenanceId || entry._id || '',
      type: String(entry.type || 'preventive').toLowerCase() as any,
      machineId: entry.machineId || '',
      deviceId: entry.deviceId || undefined,
      title: entry.title || undefined,
      scheduledDate: entry.scheduledDate || entry.scheduledAt || '',
      assignedPerson: entry.assignedPerson || entry.assigneeName || '',
      status: String(entry.status || 'planned').toLowerCase() as any,
      completionDate: entry.completionDate || entry.completedAt || undefined,
      notes: entry.notes || undefined
    }));
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
    const payload = {
      type: String(entry.type || 'preventive').toUpperCase(),
      machineId: entry.machineId,
      deviceId: entry.deviceId || null,
      title: `${String(entry.type || 'preventive').toUpperCase()} maintenance`,
      scheduledAt: entry.scheduledDate,
      assigneeName: entry.assignedPerson,
      status: String(entry.status || 'planned').toUpperCase(),
      completedAt: entry.completionDate || null,
      notes: entry.notes || null
    };
    try {
      if (maintenanceId) {
        await fetch(`${this.baseUrl}/master/maintenance/${encodeURIComponent(maintenanceId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
          body: JSON.stringify(payload)
        });
      } else {
        await fetch(`${this.baseUrl}/master/maintenance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
          body: JSON.stringify(payload)
        });
      }
    } catch {}
    return updated;
  },

  async createMaintenance(entry: Omit<MaintenanceEntry, 'maintenanceId'>): Promise<MaintenanceEntry> {
    return this.saveMaintenance(entry);
  },

  async updateMaintenance(maintenanceId: string, entry: Omit<MaintenanceEntry, 'maintenanceId'>): Promise<MaintenanceEntry> {
    return this.saveMaintenance(entry, maintenanceId);
  },

  async deleteMaintenance(maintenanceId: string): Promise<boolean> {
    const list = await this.getMaintenance();
    const next = list.filter(m => m.maintenanceId !== maintenanceId);
    setStored('maintenance', next);
    try {
      await fetch(`${this.baseUrl}/master/maintenance/${encodeURIComponent(maintenanceId)}`, {
        method: 'DELETE',
        headers: { 'X-Company-Slug': 'scm' }
      });
    } catch {}
    return true;
  },

  // 7. Production Entries
  async getProductionReport(filter?: ProductionReportFilter): Promise<ProductionReportRow[]> {
    const stored = getStored<ProductionReportRow[]>('production_entries', []);
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
    const list = await this.getProductionReport();
    const newEntry: ProductionReportRow = {
      entryId: `pe_${Date.now()}`,
      date: entry.date,
      enteredAt: new Date().toISOString(),
      shiftId: entry.shiftId || '',
      machineId: entry.machineId || '',
      employeeId: entry.employeeId || '',
      employeeName: entry.employeeName || 'Operator',
      counts: entry.counts,
      speed: entry.speed,
      productionOutput: entry.productionOutput || 0,
      wastePercent: entry.wastePercent,
      runtimeMinutes: entry.runtimeMinutes,
      targetOutput: entry.targetOutput,
      notes: entry.notes
    };
    setStored('production_entries', [newEntry, ...list]);
    try {
      const res = await fetch(`${this.baseUrl}/production/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
        body: JSON.stringify(entry)
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) return json.data;
      }
    } catch {}
    return newEntry;
  },

  async updateProductionEntry(entryId: string, entry: Partial<ProductionEntryInput>): Promise<boolean> {
    const list = await this.getProductionReport();
    const next = list.map(e => e.entryId === entryId ? { ...e, ...entry } : e);
    setStored('production_entries', next);
    try {
      await fetch(`${this.baseUrl}/production/entries/${encodeURIComponent(entryId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Company-Slug': 'scm' },
        body: JSON.stringify(entry)
      });
    } catch {}
    return true;
  },

  async deleteProductionEntry(entryId: string): Promise<boolean> {
    const list = await this.getProductionReport();
    const next = list.filter(e => e.entryId !== entryId);
    setStored('production_entries', next);
    try {
      await fetch(`${this.baseUrl}/production/entries/${encodeURIComponent(entryId)}`, {
        method: 'DELETE',
        headers: { 'X-Company-Slug': 'scm' }
      });
    } catch {}
    return true;
  },

  // 8. Round Performance
  async getMachineRoundPerformance(filter?: {
    machineId?: string;
    employeeId?: string;
    fromDate?: string;
    toDate?: string;
  }): Promise<MachineRoundPerformance> {
    const params = new URLSearchParams();
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);
    if (filter?.fromDate) params.set('from', filter.fromDate);
    if (filter?.toDate) params.set('to', filter.toDate);

    const fallback: MachineRoundPerformance = {
      rounds: [],
      deviceGaps: [],
      employees: [],
      totalCompletedRounds: 0,
      totalGapMinutes: 0,
      averageGapMinutes: 0
    };

    try {
      const res = await fetch(`${this.baseUrl}/dashboard/machine?${params.toString()}`, {
        headers: { 'X-Company-Slug': 'scm' }
      });
      if (res.ok) {
        const json = await res.json();
        const payload = json?.data?.roundGaps ?? json?.roundGaps ?? json?.data ?? {};
        const rawRounds = Array.isArray(payload.rounds) ? payload.rounds : [];
        const rawDeviceGaps = Array.isArray(payload.deviceGaps) ? payload.deviceGaps : [];
        const rawEmployees = Array.isArray(payload.employees) ? payload.employees : [];

        return {
          rounds: rawRounds.map((r: any, idx: number) => ({
            roundNumber: Number(r.roundNumber || r.roundNo || idx + 1),
            employeeId: r.employeeId || null,
            employeeName: r.employeeName || null,
            startedAt: r.startedAt || null,
            completedAt: r.completedAt || null,
            durationMinutes: Number(r.durationMinutes || 0),
            transitions: Array.isArray(r.transitions) ? r.transitions.map((t: any) => ({
              fromDeviceId: t.fromDeviceId || null,
              toDeviceId: t.toDeviceId || null,
              gapMinutes: Number(t.gapMinutes || 0),
              roundNumber: Number(t.roundNumber || idx + 1),
              occurredAt: t.occurredAt || null,
              employeeId: t.employeeId || null,
              employeeName: t.employeeName || null,
              label: [t.fromDeviceId, t.toDeviceId].filter(Boolean).join(' -> ') || 'Transition'
            })) : []
          })),
          deviceGaps: rawDeviceGaps.map((g: any, idx: number) => ({
            fromDeviceId: g.fromDeviceId || null,
            toDeviceId: g.toDeviceId || null,
            gapMinutes: Number(g.gapMinutes || 0),
            roundNumber: Number(g.roundNumber || idx + 1),
            occurredAt: g.occurredAt || null,
            employeeId: g.employeeId || null,
            employeeName: g.employeeName || null,
            label: [g.fromDeviceId, g.toDeviceId].filter(Boolean).join(' -> ') || `Transition ${idx + 1}`
          })),
          employees: rawEmployees.map((e: any) => ({
            employeeId: e.employeeId || null,
            employeeName: e.employeeName || null,
            completedRounds: Number(e.completedRounds || 0),
            totalGapMinutes: Number(e.totalGapMinutes || 0),
            averageGapMinutes: Number(e.averageGapMinutes || 0)
          })),
          totalCompletedRounds: Number(payload.totalCompletedRounds || payload.completedRounds || rawRounds.length),
          totalGapMinutes: Number(payload.totalGapMinutes || 0),
          averageGapMinutes: Number(payload.averageGapMinutes || 0)
        };
      }
    } catch {}

    return fallback;
  },

  // 9. Analytical Reports
  async getReports(filter: ReportFilter): Promise<ReportResponse> {
    const params = new URLSearchParams();
    params.set('reportType', filter.reportType);
    if (filter.machineId) params.set('machineId', filter.machineId);
    if (filter.employeeId) params.set('employeeId', filter.employeeId);
    if (filter.shiftId) params.set('shiftId', filter.shiftId);
    if (filter.from) params.set('from', filter.from);
    if (filter.to) params.set('to', filter.to);

    const defaultTitles: Record<string, string> = {
      rpm_efficiency: 'Spinning & Machine Efficiency Report',
      employee_productivity: 'Employee Productivity & Round Gap Report',
      downtime_modes: 'Machine Downtime & Mode Analysis Report',
      duty_coverage: 'Device & Employee Duty Coverage Report',
      cleaning_maintenance: 'Machine Cleaning & Maintenance Schedule Report'
    };

    try {
      const res = await fetch(`${this.baseUrl}/master/reports?${params.toString()}`, {
        headers: { 'X-Company-Slug': 'scm' }
      });
      if (res.ok) {
        const json = await res.json();
        return {
          success: json.success ?? true,
          reportType: json.reportType || filter.reportType,
          title: json.title || defaultTitles[filter.reportType] || 'Database Analytical Reports',
          data: json.data || []
        };
      }
    } catch {}

    return {
      success: true,
      reportType: filter.reportType,
      title: defaultTitles[filter.reportType] || 'Database Analytical Reports',
      data: []
    };
  }
};
