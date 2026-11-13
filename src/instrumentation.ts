export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startServerDaemon } = await import('@/lib/serverDaemon');
    startServerDaemon();
  }
}

