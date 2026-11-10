'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { api } from '@/lib/api-client'
import { cn } from '@/lib/utils'
import { fmtTime } from '@/lib/dates'
import { EmptyState } from './ui-bits'

/** Notification bell with unread count (spec §9). Polls every 30 s. */
export function NotificationsBell() {
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.notifications.list(),
    refetchInterval: 30_000,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => api.notifications.markRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const unread = data?.unread ?? 0
  const items = data?.items ?? []

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 sm:w-96">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-sm font-semibold">Notifications</p>
          {unread > 0 ? <span className="text-xs text-muted-foreground">{unread} unread</span> : null}
        </div>
        <ScrollArea className="max-h-80">
          {items.length === 0 ? (
            <div className="p-3">
              <EmptyState title="No notifications yet" hint="Approvals and alerts will appear here." />
            </div>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => !n.readAt && markRead.mutate(n.id)}
                    className={cn(
                      'flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors hover:bg-accent/60',
                      !n.readAt && 'bg-emerald-50/60',
                    )}
                  >
                    <span className="flex items-start gap-2">
                      {!n.readAt ? <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-emerald-600" aria-label="unread" /> : null}
                      <span className={cn('text-xs leading-relaxed', !n.readAt ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                        {n.message}
                      </span>
                    </span>
                    <span className="pl-4 text-[10px] text-muted-foreground">{fmtTime(new Date(n.createdAt))}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
        {items.length > 0 ? (
          <div className="border-t p-2">
            <p className="flex items-center gap-1.5 px-1 text-[10px] text-muted-foreground">
              <CheckCheck className="h-3 w-3" /> Tap a notification to mark it read
            </p>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
