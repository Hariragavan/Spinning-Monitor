export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startServerDaemon } = await import('@/lib/serverDaemon');
    startServerDaemon();

    // Auto-migrate and synchronize old databases, rules, counts and machines on startup
    const { migrateFromOldDatabases } = await import('@/lib/oldDbMigration');
    migrateFromOldDatabases().catch(err => console.warn('Startup old DB migration warning:', err));
  }
}

