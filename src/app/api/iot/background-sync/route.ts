import { NextResponse } from 'next/server';
import {
  getServerDaemonStatus,
  startServerDaemon,
  stopServerDaemon,
  run45sSyncCycle,
  run5mSyncCycle
} from '@/lib/serverDaemon';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export async function GET() {
  // Ensure daemon is started if someone queries its status
  startServerDaemon();
  const status = getServerDaemonStatus();
  return NextResponse.json({
    success: true,
    data: status
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action || 'all';

    if (action === 'start') {
      startServerDaemon();
      return NextResponse.json({ success: true, message: 'Daemon started', data: getServerDaemonStatus() });
    }

    if (action === 'stop') {
      stopServerDaemon();
      return NextResponse.json({ success: true, message: 'Daemon stopped', data: getServerDaemonStatus() });
    }

    // Ensure daemon is running
    startServerDaemon();

    let fastResult = null;
    let slowResult = null;

    if (action === '45s' || action === 'all') {
      fastResult = await run45sSyncCycle();
    }

    if (action === '5m' || action === 'all') {
      slowResult = await run5mSyncCycle();
    }

    return NextResponse.json({
      success: true,
      message: 'Manual sync cycle executed',
      fastResult,
      slowResult,
      data: getServerDaemonStatus()
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to trigger background sync' },
      { status: 500 }
    );
  }
}

