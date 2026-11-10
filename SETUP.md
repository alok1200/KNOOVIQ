# KNOOVIQ Workforce Attendance — Complete Source (single folder)

Everything the app needs lives in this one folder: Next.js 16 App Router + TypeScript,
Tailwind CSS 4 + shadcn/ui, Prisma ORM, JWT auth, GPS geofencing and
office-network (IP) attendance.

**Database: Neon PostgreSQL** (pre-configured in `.env` with the project's cloud
database — no local database install required).

---

## 1. Requirements

- [Bun](https://bun.sh) 1.1+ (recommended) — or Node.js 20+ with npm/pnpm
- Internet access (the database is hosted on Neon Cloud)

## 2. Run it (2 commands)

```bash
bun install          # install dependencies (or: npm install)
bun run dev          # starts on http://localhost:3000
```

Schema is already live on the Neon database; demo data (users, office, shift,
holidays, leave balances) **auto-seeds on first start** if the database is empty.
To seed manually: `bun run db:seed`. To re-sync schema: `bun run db:push`.

> Using npm instead of Bun: `npm install` then `npx prisma db push` then `npm run dev`.

## 3. Demo logins

| Role      | Employee ID | Email               | Password      |
|-----------|-------------|---------------------|---------------|
| HR Admin  | KN001       | priya@knooviq.com   | `Admin@123`   |
| Manager   | KN002       | rahul@knooviq.com   | `Manager@123` |
| Employee  | KN003       | anita@knooviq.com   | `Employee@123`|
| Employee  | KN004       | karan@knooviq.com   | `Employee@123`|
| Employee  | KN005       | sneha@knooviq.com   | `Employee@123`|

## 4. How attendance punching works

A punch is accepted by the server in this priority order:

1. **GPS geofence** — device is within the office fence
   (`distance − accuracy ≤ radius`, default **25 m**, max GPS error ±100 m).
   Marked as **Office (GPS)**.
2. **Office network (IP)** — the client's public IP matches the office
   allow-list configured by HR. **No GPS needed.** Marked as **Office Network (IP)**.
3. **Approved WFH / Official Work (Outside)** — bypasses the geofence for the
   approved date range. Marked as **WFH** / **Outside**.

Everything else is rejected with the exact reason (distance, accuracy, no office).

### Configure the office (HR → Admin → Offices → Edit)

- **Use my current location** — capture exact office coordinates where you stand.
- **Radius (meters)** — geofence size (25 m open desks, 50–150 m indoor).
- **Office network IPs** — comma-separated public IPs, CIDR ranges
  (`182.71.0.0/16`) or wildcards (`182.71.*.*`). Anyone connecting from these
  networks can punch **without GPS**. Use the **Detect my current IP** button
  while connected to the office Wi-Fi to register it in one click.

> Shipped demo default is `::1, *.*.*.*` (any IPv4 network counts as the office
> network) so you can try everything immediately. Replace it with your real
> office IP(s) for production.

## 5. Database (Neon PostgreSQL)

`prisma/schema.prisma` uses `provider = "postgresql"` with two URLs:

| Variable | Used for | Notes |
|----------|----------|-------|
| `DATABASE_URL` | app runtime | pooler endpoint (`…-pooler…`) + `pgbouncer=true` — safe behind Neon's PgBouncer |
| `DIRECT_DATABASE_URL` | `db:push` / migrations | direct endpoint — supports prepared statements |

Both live in `.env`. `src/lib/db-url.ts` picks the right URL automatically and
ignores any stale SQLite `DATABASE_URL` a hosting sandbox might export.

**Switch to a local SQLite file instead (optional):**
1. In `prisma/schema.prisma`: `provider = "sqlite"`, remove the `directUrl` line.
2. In `.env`: `DATABASE_URL="file:../db/custom.db"` (remove the Neon URLs).
3. `bun run db:push && bun run dev`.

**Rotate database credentials:** update both URLs in `.env`, then restart.

## 6. Feature map

| Area | Where |
|------|-------|
| Auth (JWT access/refresh, rotation, reuse detection, lockout) | `src/lib/auth.ts`, `src/app/api/v1/auth/*` |
| Geofence math + IP allow-list matching | `src/lib/geo.ts` |
| Punch state machine, flags, day status | `src/lib/attendance-service.ts` |
| Check-in/out, breaks, calendar, history | `src/app/api/v1/attendance/*` |
| Leave/WFH/regularization requests + approvals | `src/app/api/v1/requests`, `leave` |
| Team status, notifications, reports/exports | `src/app/api/v1/team`, `notifications`, `reports` |
| Admin console (users, offices, shifts, holidays, policy, audit) | `src/app/api/v1/*`, `src/components/knooviq/admin-view.tsx` |
| Database models | `prisma/schema.prisma` |
| Demo data | `prisma/seed.ts` |

## 7. Environment variables (`.env`)

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` / `DIRECT_DATABASE_URL` | Neon PostgreSQL pooler / direct endpoints |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **Change in production** |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | `15m` / `7d` |
| `COOKIE_SECURE` | Set `true` behind HTTPS |
| `MAX_GPS_ACCURACY_M` | Punches above this GPS error are rejected (default 100) |
| `LOGIN_RATE_LIMIT` / `LOGIN_LOCK_MINUTES` | Brute-force protection |

## 8. Production build

```bash
bun run build
bun run start        # serves the standalone build on port 3000
```
