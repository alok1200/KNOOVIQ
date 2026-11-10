/**
 * Environment validation (spec §5: all secrets from env, never committed).
 * Zod-validated with sandbox-safe defaults so `bun run dev` works out of the box.
 */
import { z } from 'zod'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_ACCESS_SECRET: z.string().min(8).default('knooviq-dev-access-secret-change-me'),
  JWT_REFRESH_SECRET: z.string().min(8).default('knooviq-dev-refresh-secret-change-me'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL: z.string().default('7d'),
  COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  DEFAULT_OFFICE_RADIUS_M: z.coerce.number().int().positive().default(25),
  MAX_GPS_ACCURACY_M: z.coerce.number().int().positive().default(100),
  LOGIN_RATE_LIMIT: z.coerce.number().int().positive().default(5),
  LOGIN_LOCK_MINUTES: z.coerce.number().int().positive().default(15),
})

const parsed = schema.safeParse(process.env)
if (!parsed.success) {
   
  console.error('❌ Invalid environment variables:', parsed.error.issues)
  throw new Error('Invalid environment variables')
}

export const env = parsed.data

/** Parse a TTL string like "15m" | "7d" | "300s" into seconds. */
export function ttlSeconds(ttl: string): number {
  const m = /^(\d+)([smhd])$/.exec(ttl.trim())
  if (!m) return 900
  const n = Number(m[1])
  switch (m[2]) {
    case 's':
      return n
    case 'm':
      return n * 60
    case 'h':
      return n * 3600
    case 'd':
      return n * 86400
    default:
      return 900
  }
}
