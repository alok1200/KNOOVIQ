# KNOOVIQ Workforce Attendance

GPS-geofenced attendance, leave / WFH / outside-work requests, team status notes, manager approvals, HR administration and reports — built as a single Next.js 16 full-stack app.

> **Stack adaptation (sandbox-mandated):** the original spec called for Vite+React / Express / MongoDB Atlas. This environment mandates **Next.js 16 (App Router) + TypeScript + Prisma/SQLite**. All business rules from the spec are implemented faithfully — REST API still lives under `/api/v1`, JWTs still ride in httpOnly cookies, and every Mongoose model maps 1:1 to a Prisma model.

---

## Demo logins (seeded automatically)

| Role | Employee ID | Email | Password |
|---|---|---|---|
| HR Admin | `KN001` | priya@knooviq.com | `Admin@123` |
| Manager | `KN002` | rahul@knooviq.com | `Manager@123` |
| Employee | `KN003` | anita@knooviq.com | `Employee@123` |
| Employee | `KN004` | karan@knooviq.com | `Employee@123` |
| Employee | `KN005` | sneha@knooviq.com | `Employee@123` |

Office: **KNOOVIQ HQ — Bengaluru** @ `12.971599, 77.594566`, geofence radius **25 m**.
Shift: 09:00–18:00, 15 min grace, 480 min full day, 240 min half day.

> **GPS note:** browsers require HTTPS (or localhost) for geolocation. When GPS is unavailable the GPS card shows step-by-step fix instructions and a **"Use office location (demo)"** button so the flow stays testable — check-in stays disabled until a fix exists.

## Quick start

```bash
bun install          # or npm install
bun run db:push      # create SQLite schema (db/custom.db)
bun run db:seed      # optional — also auto-seeds on first server start
bun run dev          # http://localhost:3000
bun run lint         # eslint (0 errors)
```

Environment lives in `.env` (see `.env.example`). Secrets default to dev values; override in production.

## Architecture

```
src/
  app/
    page.tsx                  # the single user-visible route (SPA shell)
    api/v1/…                  # REST API (auth, attendance, requests, leave,
                              #   team, users, offices, shifts, holidays,
                              #   audit-logs, reports, notifications)
  components/knooviq/         # app UI (login, dashboard, calendar, requests,
                              #   approvals, team, admin, reports)
  hooks/                      # use-auth, use-geolocation
  lib/
    auth.ts                   # JWT (jose), bcrypt cost 12, sessions, cookies,
                              #   rate limiter, origin check (CSRF)
    attendance-service.ts     # state machine, geofence evaluation, flagging
    leave-service.ts          # working-day math, balances, overlap rules
    dates.ts                  # IST office-timezone date helpers (YYYY-MM-DD)
    geo.ts                    # Haversine + punch acceptance rule
    jobs.ts                   # scheduler: note reset, auto-close, absent mark,
                              #   yearly balance reset (replaces node-cron)
    report-export.ts          # CSV (BOM) + XLSX (ExcelJS) streaming
  instrumentation.ts          # server boot: auto-seed + start scheduler
prisma/schema.prisma          # all 12 models + indexes
```

## Security (spec §5)

- Login with employee ID **or** email + password (bcrypt, cost 12)
- `access_token` (15 min) + `refresh_token` (7 d) — both **httpOnly, SameSite=Lax** cookies (refresh scoped to `/api/v1/auth`), never localStorage
- Refresh **rotation with reuse detection**: replaying an old refresh token revokes *all* sessions of that user
- Login rate limit 5 / 15 min per IP + account, temporary account lock, only failed attempts count
- Origin check on every mutation (CSRF defence-in-depth), Zod validation on every route, operator-key rejection
- Role checks enforced **server-side** (`requireRole`) for manager/HR endpoints
- Generic error messages; no stack traces in responses

## Business rules (spec §6)

- **State machine** (`NOT_CHECKED_IN → WORKING ⇄ ON_BREAK → CHECKED_OUT`): invalid transitions → `409`, check-out blocked on break, UI buttons derive solely from `allowedActions`
- **Geofence**: server Haversine; punch accepted when `distance − accuracy ≤ radius` and `accuracy ≤ 100 m`; rejections include distance/accuracy/radius. Approved WFH / Official-Work requests bypass it. Suspicious punches (accuracy = 0, identical 6-decimal coords, impossible travel) are flagged for HR with notifications
- **Day status**: PRESENT / LATE / HALF_DAY / ABSENT / ON_LEAVE / WFH / OUTSIDE / HOLIDAY / WEEKLY_OFF (IST-based `YYYY-MM-DD`, Sundays = weekly off)
- **Requests**: working-day counting (skips Sundays + holidays), half-day support, overlap rejection, balance check; approval deducts balance in a transaction, rejection/cancel restores; regularization approval rewrites attendance + writes an audit-log entry
- **Team notes**: 8 statuses, 120-char note, expected-return auto-reset by the scheduler; coordinates never exposed to teammates
- **Scheduler** (every 60 s, via `instrumentation.ts`): reset expired notes · auto-close forgotten check-outs (`autoClosed`) · mark absentees after shift end · yearly leave reset

## API overview (`/api/v1`, shape `{ success, data, error }`)

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/login` · `POST /auth/refresh` · `POST /auth/logout` · `GET /auth/me` · `POST /auth/change-password` |
| Attendance | `GET /attendance/today` · `POST /attendance/check-in` · `POST /attendance/check-out` · `POST /attendance/break/start` · `POST /attendance/break/end` · `GET /attendance/history` · `GET /attendance/calendar` |
| Requests | `GET/POST /requests` · `PATCH /requests/:id/cancel` · `GET /requests/pending` · `PATCH /requests/:id/decision` |
| Leave | `GET /leave/balances` · `PUT /leave/policy` (HR) |
| Team | `GET /team/status` · `PUT /team/status/me` |
| Admin | `GET/POST /users`, `PATCH /users/:id` · offices / shifts / holidays CRUD · `GET /audit-logs` |
| Reports | `GET /reports/monthly` · `GET /reports/late` · `GET /reports/leave-balance` — each `?format=json\|csv\|xlsx` |
| Notifications | `GET /notifications` · `PATCH /notifications/:id/read` |

## Environment variables

See `.env.example`. Key vars: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECURE` (set `true` behind HTTPS), `MAX_GPS_ACCURACY_M` (default 100), `DEFAULT_OFFICE_RADIUS_M` (25), `LOGIN_RATE_LIMIT` (5).

## Deployment notes

- Build with `bun run build` (standalone output), run with `bun run start`
- Serve behind TLS and set `COOKIE_SECURE=true` — geolocation itself requires HTTPS
- SQLite file lives at `db/custom.db` (`DATABASE_URL`); for multi-instance deployments swap the datasource to Postgres/MySQL in `prisma/schema.prisma` and re-push
- The scheduler starts once per server process (dev **and** production) via `src/instrumentation.ts`
- Admin-created users must change their password at first login (`mustChangePassword`)

## Known deviations from the original spec

1. **Next.js 16 + Prisma/SQLite** instead of Vite/Express/MongoDB (sandbox mandate) — endpoint surface, payloads and business rules preserved
2. **Built-in interval scheduler** instead of `node-cron` (same cadence/jobs)
3. **Tests omitted** — the sandbox forbids test code; verification was done via scripted browser E2E (state machine, geofence accept/reject, WFH bypass, flagging, approvals + balance math, regularization rewrite, refresh reuse detection, cron resets, CSV/XLSX exports)
4. Leave carry-forward defaults to **off** on yearly reset (configurable in `jobs.ts`)
