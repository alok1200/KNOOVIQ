'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ShieldCheck, MapPin, Clock, Users, Download } from 'lucide-react'
import { useLogin } from '@/hooks/use-auth'

const DEMO_LOGINS = [
  { label: 'HR Admin', id: 'KN001', password: 'Admin@123' },
  { label: 'Manager', id: 'KN002', password: 'Manager@123' },
  { label: 'Employee', id: 'KN003', password: 'Employee@123' },
]

export function LoginView() {
  const login = useLogin()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showConsent, setShowConsent] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setShowConsent(true)
    login.mutate({ identifier: identifier.trim(), password })
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-emerald-50 via-background to-teal-50 lg:flex-row">
      {/* Brand panel */}
      <div className="flex flex-col justify-center gap-6 px-6 py-10 lg:w-1/2 lg:px-16">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary font-black text-primary-foreground shadow-lg shadow-emerald-600/20">
            K
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">
              KNOOVIQ <span className="font-light text-muted-foreground">Workforce Attendance</span>
            </h1>
            <p className="text-sm text-muted-foreground">GPS-verified attendance, leave & team status</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { icon: <MapPin className="h-4 w-4" />, title: 'Geofenced punch', desc: '25 m office zone, GPS-verified' },
            { icon: <Clock className="h-4 w-4" />, title: 'Breaks & shifts', desc: 'Live working-time tracking' },
            { icon: <Users className="h-4 w-4" />, title: 'Team visibility', desc: 'Status notes, approvals, reports' },
          ].map((f) => (
            <div key={f.title} className="rounded-lg border bg-card/70 p-3 backdrop-blur">
              <div className="mb-1 flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">{f.icon}</div>
              <p className="text-sm font-semibold">{f.title}</p>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Login panel */}
      <div className="flex flex-1 items-center justify-center px-4 pb-10 lg:py-10">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <CardTitle className="text-xl">Sign in</CardTitle>
            <CardDescription>Use your employee ID (e.g. KN003) or email</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="identifier">Employee ID or email</Label>
                <Input
                  id="identifier"
                  autoComplete="username"
                  placeholder="KN003 or you@knooviq.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={login.isPending}>
                {login.isPending ? 'Signing in…' : 'Sign in'}
              </Button>
              {showConsent ? (
                <p className="rounded-md bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-900" role="note">
                  <ShieldCheck className="mr-1 inline h-3 w-3" />
                  By signing in you agree that your location is checked <strong>only</strong> during Check In / Check
                  Out — never in the background. Coordinates are visible to HR only.
                </p>
              ) : null}
            </form>

            <div className="mt-6 rounded-lg border bg-muted/40 p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">Demo logins (seeded)</p>
              <div className="grid gap-2">
                {DEMO_LOGINS.map((d) => (
                  <Button
                    key={d.id}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="justify-between"
                    onClick={() => {
                      setIdentifier(d.id)
                      setPassword(d.password)
                    }}
                  >
                    <span>{d.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {d.id} / {d.password}
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-center">
              <a
                href="/download/knooviq-attendance.zip"
                download
                className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 underline underline-offset-2 hover:text-emerald-900"
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
                Download complete source code (one folder, .zip)
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
