'use client'

import { useState } from 'react'
import {
  CalendarDays, ClipboardCheck, LayoutDashboard, LogOut, KeyRound,
  ShieldCheck, Users, BarChart3, Settings2,
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLogout } from '@/hooks/use-auth'
import { ROLE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { NotificationsBell } from './notifications-bell'
import { ChangePasswordDialog } from './change-password-dialog'
import type { Role } from '@/types/api'

export type ViewKey = 'dashboard' | 'calendar' | 'requests' | 'team' | 'approvals' | 'reports' | 'admin'

const NAV: { key: ViewKey; label: string; icon: React.ReactNode; roles: Role[] }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'] },
  { key: 'calendar', label: 'Calendar', icon: <CalendarDays className="h-4 w-4" />, roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'] },
  { key: 'requests', label: 'Requests', icon: <ClipboardCheck className="h-4 w-4" />, roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'] },
  { key: 'team', label: 'Team', icon: <Users className="h-4 w-4" />, roles: ['EMPLOYEE', 'MANAGER', 'HR_ADMIN'] },
  { key: 'approvals', label: 'Approvals', icon: <ShieldCheck className="h-4 w-4" />, roles: ['MANAGER', 'HR_ADMIN'] },
  { key: 'reports', label: 'Reports', icon: <BarChart3 className="h-4 w-4" />, roles: ['MANAGER', 'HR_ADMIN'] },
  { key: 'admin', label: 'Admin', icon: <Settings2 className="h-4 w-4" />, roles: ['HR_ADMIN'] },
]

export function AppShell({
  user,
  view,
  onView,
  children,
}: {
  user: { name: string; employeeId: string; role: Role; department: string; mustChangePassword: boolean }
  view: ViewKey
  onView: (v: ViewKey) => void
  children: React.ReactNode
}) {
  const logout = useLogout()
  const [cpOpen, setCpOpen] = useState(false)
  const tabs = NAV.filter((n) => n.roles.includes(user.role))

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-sm font-black text-primary-foreground">K</div>
            <div className="leading-tight">
              <p className="text-sm font-black tracking-tight">KNOOVIQ</p>
              <p className="hidden text-[10px] text-muted-foreground sm:block">Workforce Attendance</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <NotificationsBell />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-2" aria-label="Account menu">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-emerald-100 text-[11px] font-bold text-emerald-800">
                      {user.name.split(' ').map((p) => p[0]).slice(0, 2).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-xs font-semibold">{user.name}</span>
                    <span className="block text-[10px] text-muted-foreground">
                      {user.employeeId} · {ROLE_LABEL[user.role]}
                    </span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel>
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{user.department}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCpOpen(true)}>
                  <KeyRound className="mr-2 h-4 w-4" aria-hidden /> Change password
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => logout.mutate()} className="text-rose-600 focus:text-rose-600">
                  <LogOut className="mr-2 h-4 w-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-1 gap-6 px-4 py-4">
        {/* Desktop sidebar */}
        <nav aria-label="Main navigation" className="sticky top-20 hidden h-fit w-48 shrink-0 flex-col gap-1 md:flex">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onView(t.key)}
              aria-current={view === t.key ? 'page' : undefined}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                view === t.key ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-white hover:text-foreground',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
          <div className="mt-4 rounded-lg border bg-white p-3 text-[10px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mb-1 h-3.5 w-3.5 text-emerald-600" aria-hidden />
            Location is checked only during Check In / Check Out. Coordinates are visible to HR only.
          </div>
        </nav>

        {/* Main */}
        <main className="min-w-0 flex-1 pb-20 md:pb-6">{children}</main>
      </div>

      {/* Footer — sticky to bottom (mt-auto) */}
      <footer className="mt-auto border-t bg-white py-3 pb-20 md:pb-3">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 text-[11px] text-muted-foreground">
          <p>© {new Date().getFullYear()} KNOOVIQ · Workforce Attendance</p>
          <p>GPS geofence · httpOnly session · role-based access</p>
        </div>
      </footer>

      {/* Mobile bottom nav */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-white/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onView(t.key)}
              aria-current={view === t.key ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                view === t.key ? 'text-emerald-700' : 'text-muted-foreground',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </nav>

      <ChangePasswordDialog open={cpOpen} onOpenChange={setCpOpen} />
      {user.mustChangePassword ? (
        <ChangePasswordDialog open onOpenChange={() => {}} forced />
      ) : null}
    </div>
  )
}
