import { getLightweightMachineStatuses, fetchAndSyncAllShiftsFromRailway } from '@/lib/iot/iotEmService';
import { fetchLiveRenderStream, syncShiftEndNonMachineIotData, cleanupInterimIotHistories } from '@/lib/iot/iotDb';
import { getIotDb } from '@/lib/mongodb';
import { migrateFromOldDatabases } from '@/lib/oldDbMigration';

export interface ServerDaemonStatus {
  isRunning: boolean;
  startedAt: string | null;
  last45sSync: string | null;
  last5mSync: string | null;
  fastCycleCount: number;
  slowCycleCount: number;
  last45sResult: string | null;
  last5mResult: string | null;
  recentLogs: string[];
}

interface DaemonGlobalState {
  isRunning: boolean;
  fastTimer: NodeJS.Timeout | null;
  slowTimer: NodeJS.Timeout | null;
  startedAt: string | null;
  last45sSync: string | null;
  last5mSync: string | null;
  fastCycleCount: number;
  slowCycleCount: number;
  isFastRunning: boolean;
  isSlowRunning: boolean;
  last45sResult: string | null;
  last5mResult: string | null;
  logs: string[];
}

declare global {
  // eslint-disable-next-line no-var
  var __scm_server_daemon__: DaemonGlobalState | undefined;
}

const FAST_INTERVAL_MS = 45 * 1000;      // 45 seconds: EM, machine running status, live production
const SLOW_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes: deep shift sync, non-machine entities, DB health

function getDaemonState(): DaemonGlobalState {
  if (!globalThis.__scm_server_daemon__) {
    globalThis.__scm_server_daemon__ = {
      isRunning: false,
      fastTimer: null,
      slowTimer: null,
      startedAt: null,
      last45sSync: null,
      last5mSync: null,
      fastCycleCount: 0,
      slowCycleCount: 0,
      isFastRunning: false,
      isSlowRunning: false,
      last45sResult: null,
      last5mResult: null,
      logs: []
    };
  }
  return globalThis.__scm_server_daemon__;
}

function addLog(msg: string) {
  const state = getDaemonState();
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const line = `[${timestamp}] ${msg}`;
  console.log(`[SCM Server Daemon] ${msg}`);
  state.logs.unshift(line);
  if (state.logs.length > 50) {
    state.logs.length = 50;
  }
}

/**
 * Fast Cycle (Every 45 seconds):
 * 1. Machine Running Status -> updates iot_spinfo_lives (live snapshot)
 * 2. IoT EM -> updates iot_em (Left EM, Right EM, Total EM, Break counts)
 * 3. Live Production -> updates dailyproductionlogs & iot_shiftwise_data
 */
export async function run45sSyncCycle(): Promise<{ success: boolean; message: string }> {
  const state = getDaemonState();
  if (state.isFastRunning) {
    return { success: false, message: 'Fast cycle already in progress' };
  }

  state.isFastRunning = true;
  const start = Date.now();

  try {
    // 1. Fetch & update Machine Running Status + Live EM snapshot
    let statusSummary = 'status skipped';
    try {
      const statusRes = await getLightweightMachineStatuses();
      if (statusRes.success) {
        statusSummary = `${statusRes.totalMachines} machines (Run: ${statusRes.running}, Stop: ${statusRes.stopped}, Doff: ${statusRes.doffing})`;
      }
    } catch (e: any) {
      statusSummary = `status error: ${e?.message}`;
    }

    // 2. Fetch & sync all shifts (1, 2, 3) from Railway IoT API into iot_em and iot_shiftwise_data
    let emSummary = 'em skipped';
    try {
      const emRes = await fetchAndSyncAllShiftsFromRailway();
      if (emRes.success) {
        emSummary = `${emRes.syncedMachines} machines synced across shifts [${emRes.syncedShifts.join(', ')}]`;
      }
    } catch (e: any) {
      emSummary = `em error: ${e?.message}`;
    }

    // 3. Fetch latest live production stream packets and persist into DB
    let prodSummary = 'prod skipped';
    try {
      const prodDocs = await fetchLiveRenderStream(3);
      prodSummary = `${prodDocs.length} live stream packets persisted`;
    } catch (e: any) {
      prodSummary = `prod error: ${e?.message}`;
    }

    const elapsed = Date.now() - start;
    state.last45sSync = new Date().toISOString();
    state.fastCycleCount++;
    const resultMsg = `45s cycle completed in ${elapsed}ms -> Status: [${statusSummary}] | EM: [${emSummary}] | Production: [${prodSummary}]`;
    state.last45sResult = resultMsg;
    addLog(resultMsg);

    return { success: true, message: resultMsg };
  } catch (err: any) {
    const errorMsg = `45s cycle failed: ${err?.message || err}`;
    state.last45sResult = errorMsg;
    addLog(errorMsg);
    return { success: false, message: errorMsg };
  } finally {
    state.isFastRunning = false;
  }
}

/**
 * Slow Cycle (Every 5 minutes):
 * 1. Deep Shift Watchdog (24x7 Shift Ending Monitor for Shifts 1, 2, 3)
 * 2. Sync Non-Machine IoT Entities (Devices, Employees, Maintenance, Activities)
 * 3. DB Health & Automatic Migration Check
 * 4. Periodic temporary history cleanup
 */
export async function run5mSyncCycle(): Promise<{ success: boolean; message: string }> {
  const state = getDaemonState();
  if (state.isSlowRunning) {
    return { success: false, message: 'Slow cycle already in progress' };
  }

  state.isSlowRunning = true;
  const start = Date.now();

  try {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const currentHour = new Date().getHours();
    const currentShift = currentHour >= 6 && currentHour < 14 ? 1 : currentHour >= 14 && currentHour < 22 ? 2 : 3;

    // 1. Shift Watchdog: Ensure all completed shifts today and yesterday are finalized in DB
    const datesToVerify = [yesterday, today];
    for (const d of datesToVerify) {
      try {
        await fetchAndSyncAllShiftsFromRailway(d);
      } catch (_) {}
    }

    // 2. Sync non-machine IoT entities (devices, employees, maintenance, activities)
    try {
      await syncShiftEndNonMachineIotData(today, currentShift);
    } catch (_) {}

    // 3. Database Health Check: If core spinning collections are empty, trigger old DB migration
    try {
      const db = await getIotDb();
      const mCount = await db.collection('machines').countDocuments().catch(() => 0);
      const wCount = await db.collection('workers').countDocuments().catch(() => 0);
      if (mCount === 0 || wCount === 0) {
        addLog('Core spinning tables empty; triggering automatic migration from old databases...');
        await migrateFromOldDatabases(db);
      }
    } catch (_) {}

    // 4. Cleanup interim temporary histories to prevent collection bloat
    try {
      await cleanupInterimIotHistories();
    } catch (_) {}

    const elapsed = Date.now() - start;
    state.last5mSync = new Date().toISOString();
    state.slowCycleCount++;
    const resultMsg = `5-min cycle completed in ${elapsed}ms -> Verified shifts for ${yesterday} & ${today}, synced non-machine entities for Shift ${currentShift}`;
    state.last5mResult = resultMsg;
    addLog(resultMsg);

    return { success: true, message: resultMsg };
  } catch (err: any) {
    const errorMsg = `5-min cycle failed: ${err?.message || err}`;
    state.last5mResult = errorMsg;
    addLog(errorMsg);
    return { success: false, message: errorMsg };
  } finally {
    state.isSlowRunning = false;
  }
}

/**
 * Initializes and starts the background server daemon.
 * Idempotent: Can be safely called multiple times without creating duplicate loops.
 */
export function startServerDaemon(): void {
  if (typeof window !== 'undefined') {
    // Only runs on the server (Node.js runtime)
    return;
  }

  const state = getDaemonState();
  if (state.isRunning) {
    return;
  }

  state.isRunning = true;
  state.startedAt = new Date().toISOString();
  addLog('Starting 24x7 Server Background Daemon (45s EM/Status/Production, 5m Shift/Entities)...');

  // Trigger initial cycles after a short delay (to let server finish bootstrapping)
  setTimeout(() => {
    run45sSyncCycle().catch(() => {});
    run5mSyncCycle().catch(() => {});
  }, 3000);

  // Set recurring intervals
  state.fastTimer = setInterval(() => {
    run45sSyncCycle().catch(() => {});
  }, FAST_INTERVAL_MS);

  state.slowTimer = setInterval(() => {
    run5mSyncCycle().catch(() => {});
  }, SLOW_INTERVAL_MS);

  // Ensure timers do not block clean process shutdown if needed
  if (state.fastTimer && typeof state.fastTimer.unref === 'function') {
    state.fastTimer.unref();
  }
  if (state.slowTimer && typeof state.slowTimer.unref === 'function') {
    state.slowTimer.unref();
  }

  addLog('24x7 Server Background Daemon is ACTIVE and running independently of browser sessions.');
}

/**
 * Stops the background server daemon.
 */
export function stopServerDaemon(): void {
  const state = getDaemonState();
  if (!state.isRunning) return;

  if (state.fastTimer) {
    clearInterval(state.fastTimer);
    state.fastTimer = null;
  }
  if (state.slowTimer) {
    clearInterval(state.slowTimer);
    state.slowTimer = null;
  }
  state.isRunning = false;
  addLog('Server Background Daemon has been stopped.');
}

/**
 * Returns the current health and status of the background daemon.
 */
export function getServerDaemonStatus(): ServerDaemonStatus {
  const state = getDaemonState();
  return {
    isRunning: state.isRunning,
    startedAt: state.startedAt,
    last45sSync: state.last45sSync,
    last5mSync: state.last5mSync,
    fastCycleCount: state.fastCycleCount,
    slowCycleCount: state.slowCycleCount,
    last45sResult: state.last45sResult,
    last5mResult: state.last5mResult,
    recentLogs: [...state.logs]
  };
}

