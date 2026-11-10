/**
 * Next.js instrumentation — runs once when the server process starts.
 * Replaces node-cron in the original spec: seeds demo data (if empty) and
 * starts the background job scheduler.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  try {
    const { ensureSeeded } = await import('../prisma/seed')
    const { seeded } = await ensureSeeded()
    if (seeded) {
       
      console.log('[startup] demo data seeded')
    }
  } catch (e) {
     
    console.error('[startup] seed skipped/failed:', e)
  }
  try {
    const { startScheduler } = await import('./lib/jobs')
    startScheduler()
  } catch (e) {
     
    console.error('[startup] scheduler failed to start:', e)
  }
}
