'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Briefcase, Home, Palmtree, PlaneTakeoff, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api-client'
import { LEAVE_TYPE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'
import { ApplyRequestDialog } from './apply-request-dialog'

const TYPE_ICON: Record<string, React.ReactNode> = {
  CASUAL_LEAVE: <Palmtree className="h-4 w-4" aria-hidden />,
  SICK_LEAVE: <Briefcase className="h-4 w-4" aria-hidden />,
  EARNED_LEAVE: <PlaneTakeoff className="h-4 w-4" aria-hidden />,
  WFH: <Home className="h-4 w-4" aria-hidden />,
}

/** Leave & remote-work allowance cards (spec §9). Red only when balance is low (§9 problem 5). */
export function LeaveCards() {
  const [applyType, setApplyType] = useState<string | null>(null)
  const { data } = useQuery({ queryKey: ['balances'], queryFn: () => api.leaveBalances() })

  const order = ['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH']
  const balances = order
    .map((t) => data?.balances.find((b) => b.type === t))
    .filter((b): b is NonNullable<typeof b> => Boolean(b))

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {balances.length === 0
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-40 animate-pulse rounded-lg bg-muted" />)
          : balances.map((b) => {
              const remaining = Math.max(0, b.quota - b.used)
              const pct = b.quota > 0 ? Math.min(100, (b.used / b.quota) * 100) : 0
              const low = remaining <= 2
              return (
                <Card key={b.id} className="gap-3 py-4">
                  <CardHeader className="px-4">
                    <CardTitle className="flex items-center gap-2 text-sm font-semibold">
                      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-100 text-emerald-700">
                        {TYPE_ICON[b.type]}
                      </span>
                      <span className="leading-tight">{LEAVE_TYPE_LABEL[b.type] ?? b.type}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 px-4">
                    <p className="text-xl font-black tabular-nums">
                      {remaining.toFixed(1).replace(/\.0$/, '')}
                      <span className="text-sm font-medium text-muted-foreground"> / {b.quota} days</span>
                    </p>
                    <Progress value={pct} className="h-1.5" aria-label={`${remaining} of ${b.quota} days remaining`} />
                    <p className={cn('text-[11px] font-medium', low ? 'text-rose-600' : 'text-muted-foreground')}>
                      {low ? 'Low balance' : `${b.used.toFixed(1).replace(/\.0$/, '')} day(s) used this year`}
                    </p>
                    <Button size="sm" variant="outline" className="w-full" onClick={() => setApplyType(b.type)}>
                      <Plus className="mr-1 h-3 w-3" aria-hidden /> Apply
                    </Button>
                  </CardContent>
                </Card>
              )
            })}
      </div>
      <ApplyRequestDialog open={applyType !== null} onOpenChange={(v) => !v && setApplyType(null)} defaultType={applyType ?? undefined} />
    </>
  )
}
