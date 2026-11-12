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
  MachineRoundPerformance,
  IotDailyProductionResponse
} from '@/types/iot';
import {
  getSampleSpinfoOverview,
  getSampleMachineDetail,
  extractCommonRecords,
  selectAndMergeCommonRecord,
  transformCommonToOverview,
  buildMachineDetailFromCommon
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
  } catch { }
}

export const IOT_REMOTE_API_BASE =
  process.env.NEXT_PUBLIC_IOT_REMOTE_API ||
  process.env.IOT_REMOTE_API ||
  'https://iot-machine-backend.onrender.com/api';

export const IOT_COMMON_API_URL =
  process.env.NEXT_PUBLIC_IOT_COMMON_API ||
  process.env.IOT_COMMON_API ||
  'https://iot-machine-backend-production.up.railway.app/api/common';

async function fetchWithFallback<T>(url: string, init?: RequestInit, fallback?: T): Promise<T> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...((init?.headers as Record<string, string>) || {})
    };
    const res = await fetch(url, { ...init, headers, signal: controller.signal, cache: 'no-store' });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    if (fallback !== undefined) return fallback;
    throw err;
  }
}

async function fetchLiveCommonPayload(filter?: {
  fromDate?: string;
  toDate?: string;
  shift?: string;
}): Promise<any | null> {
  const shiftNum = filter?.shift && filter.shift !== 'All' && filter.shift !== 'All shifts' && filter.shift !== 'All Shifts'
    ? parseInt(String(filter.shift).replace(/\D/g, ''), 10) || undefined
    : undefined;
  
  // Normalize target date to YYYY-MM-DD format for Railway shiftDate query parameter
  let targetDate = filter?.fromDate ? filter.fromDate.trim() : undefined;
  if (targetDate) {
    if (targetDate.includes('/')) {
      const parts = targetDate.split('/');
      if (parts[2]?.length === 4) {
        targetDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    } else if (targetDate.includes('-')) {
      const parts = targetDate.split('-');
      if (parts[0]?.length === 2 && parts[2]?.length === 4) {
        targetDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
    }
  }

  const tryParseRecord = (json: any) => {
    const records = extractCommonRecords(json);
    if (records.length > 0) {
      const merged = selectAndMergeCommonRecord(records, {
        fromDate: filter?.fromDate,
        toDate: filter?.toDate,
        shiftDate: targetDate,
        shift: shiftNum
      });
      return merged.record;
    }
    return null;
  };

  // 1. Direct GET call to https://iot-machine-backend-production.up.railway.app/api/common
  try {
    const url = new URL(IOT_COMMON_API_URL);
    url.searchParams.set('limit', '50');
    if (shiftNum !== undefined) url.searchParams.set('shift', String(shiftNum));
    if (targetDate) url.searchParams.set('shiftDate', targetDate);
    url.searchParams.set('_t', String(Date.now()));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const json = await res.json();
      const rec = tryParseRecord(json);
      if (rec) return rec;
    }
  } catch (err) {
    console.warn('Direct fetch from Railway common API failed, attempting unfiltered...', err);
  }

  // 2. If filtered shift/date returned empty on remote, fetch latest unfiltered from Railway common API
  if (shiftNum !== undefined || targetDate) {
    try {
      const url = new URL(IOT_COMMON_API_URL);
      url.searchParams.set('limit', '50');
      url.searchParams.set('_t', String(Date.now()));

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal
      });
      clearTimeout(timeout);
      if (res.ok) {
        const json = await res.json();
        const rec = tryParseRecord(json);
        if (rec) return rec;
      }
    } catch { }
  }

  return null;
}

export const iotApi = {
  baseUrl: IOT_REMOTE_API_BASE,
  commonApiUrl: IOT_COMMON_API_URL,

  // 1. MAG SPinFO Common API Overview & Machine Details (https://iot-machine-backend-production.up.railway.app/api/common)
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

    const fallback = getSampleSpinfoOverview();

    // 1. Direct browser fetch to live MAG SPinFO Common API (https://iot-machine-backend-production.up.railway.app/api/common)
    try {
      const liveCommon = await fetchLiveCommonPayload({
        fromDate: filter?.fromDate,
        toDate: filter?.toDate,
        shift: filter?.shift
      });
      if (liveCommon && Array.isArray(liveCommon.machines) && liveCommon.machines.length > 0) {
        // Sync payload to Next.js / MongoDB in the background without blocking the UI
        this.syncLivePayloadToDb(liveCommon).catch(() => {});
        return transformCommonToOverview(liveCommon);
      }
    } catch (remoteErr) {
      console.warn('Direct live fetch from Railway common API failed, falling back to Next.js route:', remoteErr);
    }

    // 2. Next.js API route fallback (reads from MongoDB Atlas or server-side cached fallback)
    try {
      const res = await fetchWithFallback<{ success: boolean; data: SpinfoOverviewResponse }>(
        `/api/iot/spinfo/overview?${params.toString()}`,
        { method: 'GET' },
        { success: true, data: fallback }
      );
      if (res?.data && res.data.frameStatus && Array.isArray(res.data.machines) && res.data.machines.length > 0) {
        return res.data;
      }
    } catch (_) {}

    return fallback;
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
    params.set('_t', String(Date.now()));

    const fallback: SpinfoMachineDetailResponse = getSampleMachineDetail(machineId);

    // 1. Direct browser fetch to live MAG SPinFO Common API
    try {
      const liveCommon = await fetchLiveCommonPayload({
        fromDate: filter?.fromDate,
        toDate: filter?.toDate,
        shift: filter?.shift
      });
      if (liveCommon && Array.isArray(liveCommon.machines)) {
        return buildMachineDetailFromCommon(machineId, liveCommon);
      }
    } catch (_) {}

    // 2. Next.js API route fallback
    try {
      const res = await fetchWithFallback<{ success: boolean; data: SpinfoMachineDetailResponse }>(
        `/api/iot/spinfo/machine/${encodeURIComponent(machineId)}?${params.toString()}`,
        { method: 'GET' },
        { success: true, data: fallback }
      );
      if (res?.data && res.data.machine) {
        return res.data;
      }
    } catch (_) {}

    return fallback;
  },

  async syncLivePayloadToDb(payload: any): Promise<void> {
    if (!payload || typeof window === 'undefined') return;
    try {
      await fetch('/api/iot/spinfo/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch (_) {}
  },

  async syncSpinfoData(): Promise<SpinfoOverviewResponse> {
    return this.getSpinfoOverview();
  },

  // 2. Employees & Duty Tracking (https://iot-machine-backend.onrender.com/api)
  async getEmployees(): Promise<Employee[]> {
    const stored = getStored<Employee[]>('employees', []);
    try {
      const res = await fetchWithFallback<{ success: boolean; data: Employee[] }>(
        `${this.baseUrl}/master/employees`
      );
      if (res?.data) {
        setStored('employees', res.data);
        return res.data;
      }
    } catch { }

    const localRes = await fetchWithFallback<{ success: boolean; data: Employee[] }>(
      `/api/iot/master/employees`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return localRes.data || stored;
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

    try {
      const res = await fetchWithFallback<{ success: boolean; data: EmployeeMetric[] }>(
        `${this.baseUrl}/dashboard/employee?${params.toString()}`
      );
      if (res?.data) return res.data;
    } catch { }

    const localRes = await fetchWithFallback<{ success: boolean; data: EmployeeMetric[] }>(
      `/api/iot/dashboard/employee?${params.toString()}`,
      { method: 'GET' },
      { success: true, data: list }
    );
    return localRes.data || list;
  },

  // 3. Machines & Mappings (https://iot-machine-backend.onrender.com/api)
  async getMachines(): Promise<Machine[]> {
    const stored = getStored<Machine[]>('machines', []);
    try {
      const res = await fetchWithFallback<{ success: boolean; data: Machine[] }>(
        `${this.baseUrl}/master/machines`
      );
      if (res?.data) {
        setStored('machines', res.data);
        return res.data;
      }
    } catch { }

    const localRes = await fetchWithFallback<{ success: boolean; data: Machine[] }>(
      `/api/iot/master/machines`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return localRes.data || stored;
  },

  async getMachineMappings(): Promise<MachineMapping[]> {
    const stored = getStored<MachineMapping[]>('mappings', []);
    try {
      const res = await fetchWithFallback<{ success: boolean; data: MachineMapping[] }>(
        `${this.baseUrl}/master/machine-mappings`
      );
      if (res?.data) {
        setStored('mappings', res.data);
        return res.data;
      }
    } catch { }

    const localRes = await fetchWithFallback<{ success: boolean; data: MachineMapping[] }>(
      `/api/iot/master/machine-mappings`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return localRes.data || stored;
  },

  async saveMachineMapping(mapping: MachineMappingInput, mappingId?: string): Promise<MachineMapping> {
    try {
      const url = mappingId
        ? `${this.baseUrl}/master/machine-mappings/${encodeURIComponent(mappingId)}`
        : `${this.baseUrl}/master/machine-mappings`;
      const method = mappingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mapping)
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          const item = json.data;
          return {
            mappingId: item.mappingId || item._id || mappingId || `map_${Date.now()}`,
            name: item.name || mapping.name,
            stationIds: item.stationIds || mapping.stationIds,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
          };
        }
      }
    } catch { }

    const mappings = await this.getMachineMappings();
    let updated: MachineMapping;
    if (mappingId) {
      updated = { mappingId, name: mapping.name, stationIds: mapping.stationIds, updatedAt: new Date().toISOString() };
      setStored('mappings', mappings.map(m => m.mappingId === mappingId ? updated : m));
    } else {
      updated = { mappingId: `map_${Date.now()}`, name: mapping.name, stationIds: mapping.stationIds, createdAt: new Date().toISOString() };
      setStored('mappings', [updated, ...mappings]);
    }
    return updated;
  },

  async deleteMachineMapping(mappingId: string): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/master/machine-mappings/${encodeURIComponent(mappingId)}`, {
        method: 'DELETE'
      });
    } catch { }
    const mappings = getStored<MachineMapping[]>('mappings', []);
    setStored('mappings', mappings.filter(m => m.mappingId !== mappingId));
    return true;
  },

  async saveMachineConfig(machineId: string, config: {
    name?: string;
    expectedOutput?: number;
    expectedRunDurationMinutes?: number;
    expectedRoundsPerHour?: number;
    roundDeviceSequence?: string[];
  }): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/master/machines/${encodeURIComponent(machineId)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) return json.data;
      }
    } catch { }
    return config;
  },

  async updateCleaningSchedule(machineId: string, payload: {
    cleaningIntervalDays: number;
    lastCleanedAt?: string | null;
    markCleanedNow?: boolean;
  }): Promise<any> {
    try {
      const res = await fetch(`${this.baseUrl}/master/machines/${encodeURIComponent(machineId)}/cleaning-schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) return json.data;
      }
    } catch { }
    return payload;
  },

  // 4. Devices (https://iot-machine-backend.onrender.com/api)
  async getDevices(): Promise<DeviceHealth[]> {
    const stored = getStored<DeviceHealth[]>('devices', []);
    try {
      const res = await fetchWithFallback<{ success: boolean; data: DeviceHealth[] }>(
        `${this.baseUrl}/master/devices`
      );
      if (res?.data) {
        setStored('devices', res.data);
        return res.data;
      }
    } catch { }

    const localRes = await fetchWithFallback<{ success: boolean; data: DeviceHealth[] }>(
      `/api/iot/master/devices`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    return localRes.data || stored;
  },

  async updateDeviceConfig(deviceId: string, payload: Partial<DeviceHealth>): Promise<DeviceHealth> {
    try {
      const res = await fetch(`${this.baseUrl}/master/devices/${encodeURIComponent(deviceId)}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) return json.data;
      }
    } catch { }

    const devices = await this.getDevices();
    const updated = devices.map(d => d.deviceId === deviceId ? { ...d, ...payload } : d);
    setStored('devices', updated);
    return updated.find(d => d.deviceId === deviceId) || ({ deviceId, ...payload } as DeviceHealth);
  },

  async assignDevicesToEmployee(employeeId: string, deviceIds: string[], employeeName?: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/master/employees/${encodeURIComponent(employeeId)}/assign-devices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds, employeeName })
      });
      if (res.ok) return true;
    } catch { }

    const employees = getStored<Employee[]>('employees', []);
    const updated = employees.map(e => e.employeeId === employeeId ? { ...e, assignedDeviceIds: deviceIds } : e);
    setStored('employees', updated);
    return true;
  },

  async saveEmployeeDeviceMapping(payload: { employeeId: string; deviceIds: string[]; employeeName?: string }): Promise<boolean> {
    return this.assignDevicesToEmployee(payload.employeeId, payload.deviceIds, payload.employeeName);
  },

  // 5. Shifts (https://iot-machine-backend.onrender.com/api)
  async getShifts(): Promise<Shift[]> {
    const stored = getStored<Shift[]>('shifts', []);
    try {
      const res = await fetchWithFallback<{ success: boolean; data: any[] }>(
        `${this.baseUrl}/master/shifts`
      );
      if (res?.data) {
        const mapped = res.data.map((s: any) => ({
          shiftId: s.shiftId || s._id || '',
          name: s.name || s.shiftName || '',
          shiftName: s.name || s.shiftName || '',
          startTime: s.startTime || '00:00',
          endTime: s.endTime || '00:00',
          overnight: Boolean(s.overnight),
          active: s.active !== false
        }));
        setStored('shifts', mapped);
        return mapped;
      }
    } catch { }

    const localRes = await fetchWithFallback<{ success: boolean; data: any[] }>(
      `/api/iot/master/shifts`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    const list = localRes.data || stored || [];
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
    const payload = {
      name: shift.name || shift.shiftName,
      startTime: shift.startTime,
      endTime: shift.endTime,
      overnight: Boolean(shift.overnight),
      active: shift.active !== false
    };

    try {
      const url = shiftId
        ? `${this.baseUrl}/master/shifts/${encodeURIComponent(shiftId)}`
        : `${this.baseUrl}/master/shifts`;
      const method = shiftId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          const s = json.data;
          return {
            shiftId: s.shiftId || s._id || shiftId || `shift_${Date.now()}`,
            name: s.name || payload.name || '',
            shiftName: s.name || payload.name || '',
            startTime: s.startTime || payload.startTime,
            endTime: s.endTime || payload.endTime,
            overnight: Boolean(s.overnight),
            active: s.active !== false
          };
        }
      }
    } catch { }

    const shifts = getStored<Shift[]>('shifts', []);
    const updated: Shift = {
      shiftId: shiftId || `shift_${Date.now()}`,
      ...shift
    };
    setStored('shifts', shiftId ? shifts.map(s => s.shiftId === shiftId ? updated : s) : [...shifts, updated]);
    return updated;
  },

  async createShift(shift: Omit<Shift, 'shiftId'>): Promise<Shift> {
    return this.saveShift(shift);
  },

  async updateShift(shiftId: string, shift: Omit<Shift, 'shiftId'>): Promise<Shift> {
    return this.saveShift(shift, shiftId);
  },

  async deleteShift(shiftId: string): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/master/shifts/${encodeURIComponent(shiftId)}`, {
        method: 'DELETE'
      });
    } catch { }
    const shifts = getStored<Shift[]>('shifts', []);
    setStored('shifts', shifts.filter(s => s.shiftId !== shiftId));
    return true;
  },

  // 5b. Daily Shift End Production Telemetry
  async getDailyProduction(params?: {
    month?: string;
    date?: string;
    shift?: string | number;
    shed?: string;
  }): Promise<IotDailyProductionResponse> {
    const q = new URLSearchParams();
    if (params?.month) q.set('month', params.month);
    if (params?.date) q.set('date', params.date);
    if (params?.shift !== undefined) q.set('shift', String(params.shift));
    if (params?.shed) q.set('shed', params.shed);
    const qs = q.toString();
    const url = `/api/iot/daily-production${qs ? `?${qs}` : ''}`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err: any) {
      console.error('getDailyProduction error:', err);
      return {
        success: false,
        month: params?.month || (params?.date ? params.date.slice(0, 7) : new Date().toISOString().slice(0, 7)),
        availableMonths: [],
        date: params?.date || new Date().toISOString().slice(0, 10),
        availableDates: [],
        selectedShift: params?.shift === 'all' ? 'all' : (Number(params?.shift) || 'all'),
        monthGrandTotal: {
          productionKg: 0,
          targetKg: 0,
          achievementPct: 0,
          varianceKg: 0,
          overallEm: 0,
          totalEm: 0,
          wastePercentage: 0,
          totalShifts: 0
        },
        monthRows: [],
        dayMachines: [],
        overallSummary: {
          productionKg: 0,
          targetKg: 0,
          achievementPct: 0,
          varianceKg: 0,
          overallEm: 0,
          totalEm: 0,
          activeMachineCount: 0,
          totalMachineCount: 0,
          wastePercentage: 0,
          shiftHours: 8,
          timing: { from: '06:00', to: '14:00' },
          activeMachines: []
        },
        shifts: [],
        tableRows: []
      };
    }
  },

  // 6. Maintenance (https://iot-machine-backend.onrender.com/api)
  async getMaintenance(): Promise<MaintenanceEntry[]> {
    const stored = getStored<MaintenanceEntry[]>('maintenance', []);
    try {
      const res = await fetchWithFallback<{ success: boolean; data: any[] }>(
        `${this.baseUrl}/master/maintenance`
      );
      if (res?.data) {
        const mapped = res.data.map((entry: any) => ({
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
        setStored('maintenance', mapped);
        return mapped;
      }
    } catch { }

    const localRes = await fetchWithFallback<{ success: boolean; data: any[] }>(
      `/api/iot/master/maintenance`,
      { method: 'GET' },
      { success: true, data: stored }
    );
    const list = localRes.data || stored || [];
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
    const payload = {
      type: String(entry.type || 'preventive').toUpperCase(),
      machineId: entry.machineId,
      deviceId: entry.deviceId || null,
      title: entry.title || `${String(entry.type || 'preventive').toUpperCase()} maintenance`,
      scheduledAt: entry.scheduledDate,
      assigneeName: entry.assignedPerson,
      status: String(entry.status || 'planned').toUpperCase(),
      completedAt: entry.completionDate || null,
      notes: entry.notes || null
    };

    try {
      const url = maintenanceId
        ? `${this.baseUrl}/master/maintenance/${encodeURIComponent(maintenanceId)}`
        : `${this.baseUrl}/master/maintenance`;
      const method = maintenanceId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          const item = json.data;
          return {
            maintenanceId: item.maintenanceId || item._id || maintenanceId || `mnt_${Date.now()}`,
            type: String(item.type || entry.type).toLowerCase() as any,
            machineId: item.machineId || entry.machineId,
            deviceId: item.deviceId || entry.deviceId,
            title: item.title || entry.title,
            scheduledDate: item.scheduledAt || entry.scheduledDate,
            assignedPerson: item.assigneeName || entry.assignedPerson,
            status: String(item.status || entry.status).toLowerCase() as any,
            completionDate: item.completedAt || entry.completionDate,
            notes: item.notes || entry.notes
          };
        }
      }
    } catch { }

    const list = getStored<MaintenanceEntry[]>('maintenance', []);
    const updated: MaintenanceEntry = {
      maintenanceId: maintenanceId || `mnt_${Date.now()}`,
      ...entry
    };
    setStored('maintenance', maintenanceId ? list.map(m => m.maintenanceId === maintenanceId ? updated : m) : [updated, ...list]);
    return updated;
  },

  async createMaintenance(entry: Omit<MaintenanceEntry, 'maintenanceId'>): Promise<MaintenanceEntry> {
    return this.saveMaintenance(entry);
  },

  async updateMaintenance(maintenanceId: string, entry: Omit<MaintenanceEntry, 'maintenanceId'>): Promise<MaintenanceEntry> {
    return this.saveMaintenance(entry, maintenanceId);
  },

  async deleteMaintenance(maintenanceId: string): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/master/maintenance/${encodeURIComponent(maintenanceId)}`, {
        method: 'DELETE'
      });
    } catch { }
    const list = getStored<MaintenanceEntry[]>('maintenance', []);
    setStored('maintenance', list.filter(m => m.maintenanceId !== maintenanceId));
    return true;
  },

  // 7. Production Entries & Machine Sessions (https://iot-machine-backend.onrender.com/api)
  async getMachineSessions(filter?: {
    machineId?: string;
    shiftId?: string;
    from?: string;
    to?: string;
  }): Promise<any[]> {
    const params = new URLSearchParams();
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.shiftId) params.set('shiftId', filter.shiftId);
    if (filter?.from) params.set('from', filter.from);
    if (filter?.to) params.set('to', filter.to);

    try {
      const res = await fetchWithFallback<{ success: boolean; data: any[] }>(
        `${this.baseUrl}/production/machine-sessions?${params.toString()}`
      );
      return res?.data || [];
    } catch {
      return [];
    }
  },

  async getProductionReport(filter?: ProductionReportFilter): Promise<ProductionReportRow[]> {
    const params = new URLSearchParams();
    if (filter?.date) params.set('date', filter.date);
    if (filter?.shiftId) params.set('shiftId', filter.shiftId);
    if (filter?.machineId) params.set('machineId', filter.machineId);
    if (filter?.employeeId) params.set('employeeId', filter.employeeId);

    try {
      const res = await fetchWithFallback<{ success: boolean; data: any[] }>(
        `${this.baseUrl}/production/report?${params.toString()}`
      );
      if (res?.data) {
        return res.data.map((r: any) => ({
          entryId: r.entryId || r._id || '',
          date: r.date || r.shiftDate || '',
          shiftDate: r.shiftDate || r.date || '',
          enteredAt: r.enteredAt || r.createdAt || '',
          shiftId: r.shiftId || '',
          shiftName: r.shiftName || '',
          machineId: r.machineId || '',
          machineName: r.machineName || r.machineId || '',
          employeeId: r.employeeId || '',
          employeeName: r.employeeName || '',
          counts: r.counts ?? null,
          speed: r.speed ?? null,
          productionOutput: Number(r.productionOutput ?? 0),
          wastePercent: r.wastePercent,
          runtimeMinutes: r.runtimeMinutes,
          targetOutput: r.targetOutput,
          notes: r.notes ?? null
        }));
      }
    } catch { }

    const stored = getStored<ProductionReportRow[]>('production_entries', []);
    let list = [...stored];
    if (filter?.date) list = list.filter(r => r.date === filter.date || r.shiftDate === filter.date);
    if (filter?.shiftId) list = list.filter(r => r.shiftId === filter.shiftId);
    if (filter?.machineId) list = list.filter(r => r.machineId === filter.machineId);
    if (filter?.employeeId) list = list.filter(r => r.employeeId === filter.employeeId);
    return list;
  },

  async createProductionEntry(entry: ProductionEntryInput): Promise<ProductionReportRow> {
    const payload = {
      ...entry,
      shiftDate: entry.shiftDate || entry.date,
      date: entry.date || entry.shiftDate
    };
    try {
      const res = await fetch(`${this.baseUrl}/production/entries`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        if (json?.data) {
          const d = json.data;
          return {
            entryId: d.entryId || d._id || `pe_${Date.now()}`,
            date: d.shiftDate || d.date || payload.date || '',
            shiftDate: d.shiftDate || d.date || payload.shiftDate || '',
            enteredAt: d.enteredAt || d.createdAt || new Date().toISOString(),
            shiftId: d.shiftId || payload.shiftId || '',
            machineId: d.machineId || payload.machineId || '',
            employeeId: d.employeeId || payload.employeeId || '',
            employeeName: d.employeeName || payload.employeeName || '',
            counts: d.counts ?? payload.counts,
            speed: d.speed ?? payload.speed,
            productionOutput: Number(d.productionOutput ?? payload.productionOutput ?? 0),
            notes: d.notes ?? payload.notes
          };
        }
      }
    } catch { }

    const list = getStored<ProductionReportRow[]>('production_entries', []);
    const newEntry: ProductionReportRow = {
      entryId: `pe_${Date.now()}`,
      date: payload.date || '',
      shiftDate: payload.shiftDate || '',
      enteredAt: new Date().toISOString(),
      shiftId: payload.shiftId || '',
      machineId: payload.machineId || '',
      employeeId: payload.employeeId || '',
      employeeName: payload.employeeName || 'Operator',
      counts: payload.counts,
      speed: payload.speed,
      productionOutput: payload.productionOutput || 0,
      wastePercent: payload.wastePercent,
      runtimeMinutes: payload.runtimeMinutes,
      targetOutput: payload.targetOutput,
      notes: payload.notes
    };
    setStored('production_entries', [newEntry, ...list]);
    return newEntry;
  },

  async updateProductionEntry(entryId: string, entry: Partial<ProductionEntryInput>): Promise<boolean> {
    const payload = {
      ...entry,
      shiftDate: entry.shiftDate || entry.date
    };
    try {
      const res = await fetch(`${this.baseUrl}/production/entries/${encodeURIComponent(entryId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) return true;
    } catch { }

    const list = getStored<ProductionReportRow[]>('production_entries', []);
    const next = list.map(e => e.entryId === entryId ? { ...e, ...entry } : e);
    setStored('production_entries', next);
    return true;
  },

  async deleteProductionEntry(entryId: string): Promise<boolean> {
    try {
      await fetch(`${this.baseUrl}/production/entries/${encodeURIComponent(entryId)}`, {
        method: 'DELETE'
      });
    } catch { }
    const list = getStored<ProductionReportRow[]>('production_entries', []);
    setStored('production_entries', list.filter(e => e.entryId !== entryId));
    return true;
  },

  // 8. Round Performance (https://iot-machine-backend.onrender.com/api)
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
      const res = await fetch(`${this.baseUrl}/dashboard/machine?${params.toString()}`);
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
    } catch { }

    return fallback;
  },

  // 9. Analytical Reports (https://iot-machine-backend.onrender.com/api)
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
      const res = await fetch(`${this.baseUrl}/master/reports?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        return {
          success: json.success ?? true,
          reportType: json.reportType || filter.reportType,
          title: json.title || defaultTitles[filter.reportType] || 'Database Analytical Reports',
          data: json.data || []
        };
      }
    } catch { }

    return {
      success: true,
      reportType: filter.reportType,
      title: defaultTitles[filter.reportType] || 'Database Analytical Reports',
      data: []
    };
  },

  // 10. Lightweight 45-Second Machine Running Status check
  async getLightweightMachineStatus(): Promise<{
    success: boolean;
    timestamp: string;
    totalMachines: number;
    running: number;
    stopped: number;
    doffing: number;
    offline: number;
    machines: Array<{
      machine: string;
      runStatus: 'RUN' | 'DOFF' | 'STOP' | 'OFFLINE';
      statusBadge: string;
      speed: number;
      speedUnit: string;
      count: string;
      emLeft?: number;
      emRight?: number;
      emTotal?: number;
      totalEndBreaks?: number;
      lastUpdated: string;
    }>;
  }> {
    try {
      const res = await fetch(`/api/iot/status?_t=${Date.now()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}

    return {
      success: false,
      timestamp: new Date().toISOString(),
      totalMachines: 0,
      running: 0,
      stopped: 0,
      doffing: 0,
      offline: 0,
      machines: []
    };
  },

  // 11. Hourly End Mending (EM) records
  async getHourlyEmRecords(filter?: {
    date?: string;
    month?: string;
    shift?: string | number;
    machineNo?: string;
  }): Promise<{
    success: boolean;
    count: number;
    data: Array<{
      machineNo: string;
      date: string;
      month: string;
      shift: number | string;
      hour: number;
      hourLabel: string;
      emLeft: number;
      emRight: number;
      emTotal: number;
      unit: string;
      endBreakCountLeft: number;
      endBreakCountRight: number;
      totalEndBreaks: number;
      isFinalized: boolean;
      recordedAt: string;
      updatedAt: string;
    }>;
  }> {
    try {
      const p = new URLSearchParams();
      if (filter?.date) p.set('date', filter.date);
      if (filter?.month) p.set('month', filter.month);
      if (filter?.shift) p.set('shift', String(filter.shift));
      if (filter?.machineNo) p.set('machineNo', filter.machineNo);
      p.set('_t', String(Date.now()));

      const res = await fetch(`/api/iot/em?${p.toString()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}

    return { success: false, count: 0, data: [] };
  },

  // 12. Trigger 5-Minute EM Sync
  async syncIotEm(): Promise<any> {
    try {
      const res = await fetch(`/api/iot/em/sync?_t=${Date.now()}`, {
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}
    return { success: false };
  }
};
