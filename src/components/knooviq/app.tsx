'use client'

import { useState } from 'react'
import { useMe } from '@/hooks/use-auth'
import { AppShell, type ViewKey } from './app-shell'
import { LoginView } from './login-view'
import { DashboardView } from './dashboard-view'
import { CalendarView } from './calendar-view'
import { RequestsView } from './requests-view'
import { ApprovalsView } from './approvals-view'
import { TeamView } from './team-view'
import { ReportsView } from './reports-view'
import { AdminView } from './admin-view'
import { Spinner } from './ui-bits'
import type { Role } from '@/types/api'

/** Root single-page app (only route in the sandbox preview is `/`). */
export function KnooviqApp() {
  const { data, isLoading } = useMe()
  const [view, setView] = useState<ViewKey>('dashboard')

  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-xl font-black text-primary-foreground">K</div>
        <Spinner />
      </div>
    )
  }

  if (!data?.user) return <LoginView />

  const role: Role = data.user.role
  const allowed: ViewKey[] =
    role === 'HR_ADMIN'
      ? ['dashboard', 'calendar', 'requests', 'team', 'approvals', 'reports', 'admin']
      : role === 'MANAGER'
        ? ['dashboard', 'calendar', 'requests', 'team', 'approvals', 'reports']
        : ['dashboard', 'calendar', 'requests', 'team']
  const active = allowed.includes(view) ? view : 'dashboard'

  return (
    <AppShell
      user={{
        name: data.user.name,
        employeeId: data.user.employeeId,
        role,
        department: data.user.department,
        mustChangePassword: data.user.mustChangePassword,
      }}
      view={active}
      onView={setView}
    >
      {active === 'dashboard' ? <DashboardView onNavigate={(v) => setView(v)} /> : null}
      {active === 'calendar' ? <CalendarView /> : null}
      {active === 'requests' ? <RequestsView /> : null}
      {active === 'team' ? <TeamView /> : null}
      {active === 'approvals' ? <ApprovalsView /> : null}
      {active === 'reports' ? <ReportsView /> : null}
      {active === 'admin' ? <AdminView /> : null}
    </AppShell>
  )
}
