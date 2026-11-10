'use client'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import {
  statusTone,
  DAY_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  REQUEST_STATUS_LABEL,
  TEAM_STATUS_LABEL,
  ATT_STATE_LABEL,
  ROLE_LABEL,
} from '@/lib/labels'

function labelFor(kind: string, value: string): string {
  switch (kind) {
    case 'request':
      return REQUEST_TYPE_LABEL[value] ?? value
    case 'reqstatus':
      return REQUEST_STATUS_LABEL[value] ?? value
    case 'team':
      return TEAM_STATUS_LABEL[value] ?? value
    case 'state':
      return ATT_STATE_LABEL[value] ?? value
    case 'role':
      return ROLE_LABEL[value] ?? value
    default:
      return DAY_STATUS_LABEL[value] ?? value
  }
}

/** One consistent status vocabulary across dashboard, tables and team strip (spec §9.6). */
export function StatusBadge({
  value,
  kind = 'day',
  className,
}: {
  value: string | null | undefined
  kind?: 'day' | 'request' | 'reqstatus' | 'team' | 'state' | 'role'
  className?: string
}) {
  if (!value) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="outline" className={cn('font-medium', statusTone(value), className)}>
      {labelFor(kind, value)}
    </Badge>
  )
}

export function EmptyState({ icon, title, hint }: { icon?: React.ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-10 text-center">
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}

export function KV({ label, value, className }: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-10', className)} role="status" aria-label="Loading">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}
