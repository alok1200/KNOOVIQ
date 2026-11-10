/**
 * Resolves the effective database URL.
 *
 * Some hosting sandboxes export a stale SQLite `DATABASE_URL` (file:...) into
 * every process, and environment variables take precedence over `.env` files.
 * When that happens — and a PostgreSQL `DIRECT_DATABASE_URL` is available —
 * prefer the PostgreSQL URL so the app always talks to the cloud database.
 */
export function resolveDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? ''
  const direct = process.env.DIRECT_DATABASE_URL ?? ''

  if (url.startsWith('file:') && direct.startsWith('postgresql:')) {
    console.warn('[db] Ignoring stale SQLite DATABASE_URL exported by the environment — using DIRECT_DATABASE_URL (PostgreSQL).')
    return direct
  }
  return url
}
