import { DailyReport, Sider, IncentiveRule, CountConversion, SystemSettings, MachineEmData, FrozenMonthRecord, MachineMasterItem, User } from '@/types';

export const apiClient = {
  async fetchInitialData(shed?: string) {
    const shedQuery = shed ? `?shed=${encodeURIComponent(shed)}` : '';
    const [reportRes, historyRes, workersRes, machinesRes, rulesRes, countsRes, settingsRes, emRes, frozenRes, usersRes] = await Promise.all([
      fetch(`/api/reports${shedQuery}`).then(r => r.json()).catch(() => ({ data: null })),
      fetch(`/api/reports/history${shedQuery}`).then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/workers').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/machines').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/rules').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/counts').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/settings').then(r => r.json()).catch(() => ({ data: null })),
      fetch('/api/machine-em').then(r => r.json()).catch(() => ({ data: {} })),
      fetch('/api/frozen-months').then(r => r.json()).catch(() => ({ data: {} })),
      fetch('/api/users').then(r => r.json()).catch(() => ({ data: [] })),
    ]);

    return {
      dailyReport: reportRes?.data as DailyReport | null,
      history: (historyRes?.data || []) as DailyReport[],
      workers: (workersRes?.data || []) as Sider[],
      machines: (machinesRes?.data || []) as MachineMasterItem[],
      rules: (rulesRes?.data || []) as IncentiveRule[],
      counts: (countsRes?.data || []) as CountConversion[],
      settings: settingsRes?.data as SystemSettings | null,
      machineEm: (emRes?.data || {}) as MachineEmData,
      frozenMonths: (frozenRes?.data || {}) as Record<string, FrozenMonthRecord>,
      users: (usersRes?.data || []) as User[],
    };
  },


  async saveDailyReport(report: DailyReport): Promise<boolean> {
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report })
    });
    return res.ok;
  },

  async saveReportHistory(reports: DailyReport[]): Promise<boolean> {
    const res = await fetch('/api/reports/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batch_save', reports })
    });
    return res.ok;
  },

  async seedHistoricalApril(): Promise<boolean> {
    const res = await fetch('/api/reports/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed_april' })
    });
    return res.ok;
  },

  async deleteHistoryRecord(date: string): Promise<boolean> {
    const res = await fetch(`/api/reports/history?date=${encodeURIComponent(date)}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async clearAllHistory(): Promise<boolean> {
    const res = await fetch('/api/reports/history?all=true', {
      method: 'DELETE'
    });
    return res.ok;
  },

  async clearMonthData(month: string | number, year: string | number): Promise<boolean> {
    const res = await fetch('/api/reports/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_month', month, year })
    });
    return res.ok;
  },

  async rollbackData(cutoffDate: string, mode: string): Promise<boolean> {
    const res = await fetch('/api/reports/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rollback', cutoffDate, mode })
    });
    return res.ok;
  },

  async saveWorkers(workers: Sider[], shed?: string): Promise<boolean> {
    const res = await fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batch', workers, shed })
    });
    return res.ok;
  },

  async saveWorker(worker: Sider): Promise<boolean> {
    const res = await fetch('/api/workers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save_single', worker })
    });
    return res.ok;
  },

  async deleteWorker(id: string): Promise<boolean> {
    const res = await fetch(`/api/workers?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async clearAllWorkers(shed?: string): Promise<boolean> {
    const query = shed ? `?all=true&shed=${encodeURIComponent(shed)}` : '?all=true';
    const res = await fetch(`/api/workers${query}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async fetchMachines(shed?: string): Promise<MachineMasterItem[]> {
    const query = shed && shed !== 'All' ? `?shed=${encodeURIComponent(shed)}` : '';
    const res = await fetch(`/api/machines${query}`);
    const json = await res.json();
    return json?.data || [];
  },

  async saveMachines(machines: MachineMasterItem[], shed?: string): Promise<boolean> {
    const res = await fetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batch', machines, shed })
    });
    return res.ok;
  },

  async saveMachine(machine: MachineMasterItem): Promise<boolean> {
    const res = await fetch('/api/machines', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machine })
    });
    return res.ok;
  },

  async deleteMachine(id: string, frameNo?: string): Promise<boolean> {
    const param = frameNo ? `frameNo=${encodeURIComponent(frameNo)}` : `id=${encodeURIComponent(id)}`;
    const res = await fetch(`/api/machines?${param}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async clearAllMachines(shed?: string): Promise<boolean> {
    const query = shed ? `?all=true&shed=${encodeURIComponent(shed)}` : '?all=true';
    const res = await fetch(`/api/machines${query}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async fetchUsers(shed?: string): Promise<User[]> {
    const query = shed && shed !== 'All' ? `?shed=${encodeURIComponent(shed)}` : '';
    const res = await fetch(`/api/users${query}`);
    const json = await res.json();
    return json?.data || [];
  },

  async saveUser(user: User): Promise<boolean> {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user })
    });
    return res.ok;
  },

  async saveRules(rules: IncentiveRule[]): Promise<boolean> {
    const res = await fetch('/api/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rules })
    });
    return res.ok;
  },

  async saveCountConversion(conversion: CountConversion): Promise<boolean> {
    const res = await fetch('/api/counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversion })
    });
    return res.ok;
  },

  async deleteCountConversion(count: string): Promise<boolean> {
    const res = await fetch(`/api/counts?count=${encodeURIComponent(count)}`, {
      method: 'DELETE'
    });
    return res.ok;
  },

  async saveSettings(settings: SystemSettings): Promise<boolean> {
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settings })
    });
    return res.ok;
  },

  async saveMachineEm(data: MachineEmData): Promise<boolean> {
    const res = await fetch('/api/machine-em', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    });
    return res.ok;
  },

  async toggleFreezeMonth(record: FrozenMonthRecord, isFrozen: boolean): Promise<boolean> {
    if (isFrozen) {
      // Unfreeze
      const res = await fetch('/api/frozen-months', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', monthKey: record.monthKey })
      });
      return res.ok;
    } else {
      // Freeze
      const res = await fetch('/api/frozen-months', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ record })
      });
      return res.ok;
    }
  },

  async exportBackup(): Promise<any> {
    const res = await fetch('/api/backup');
    const json = await res.json();
    return json?.data;
  },

  async importBackup(data: any): Promise<boolean> {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data })
    });
    return res.ok;
  }
};
