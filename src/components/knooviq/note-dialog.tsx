'use client'

import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, ApiClientError } from '@/lib/api-client'
import { TEAM_STATUS_LABEL } from '@/lib/labels'

const STATUSES = ['WORKING_IN_OFFICE', 'ON_BREAK', 'IN_MEETING', 'CLIENT_VISIT', 'WFH', 'OUT_OF_OFFICE', 'ON_LEAVE', 'NOT_CHECKED_IN']

/** React-recommended render-phase adjust (avoids effect cascades). */
function useAdjustState(dep: unknown, adjust: () => void) {
  const [prev, setPrev] = useState(dep)
  if (prev !== dep) {
    setPrev(dep)
    adjust()
  }
}

export interface NoteDraft {
  status: string
  note: string
  expectedReturnAt: string | null
}

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "Update My Note" modal (spec §6.5): status dropdown + note (≤120) + expected return. */
export function NoteDialog({
  open,
  onOpenChange,
  current,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  current: NoteDraft
}) {
  const qc = useQueryClient()
  const [status, setStatus] = useState(current.status)
  const [note, setNote] = useState(current.note)
  const [returnAt, setReturnAt] = useState(toLocalInput(current.expectedReturnAt))

  useAdjustState(open, () => {
    if (open) {
      setStatus(current.status)
      setNote(current.note)
      setReturnAt(toLocalInput(current.expectedReturnAt))
    }
  })

  const save = useMutation({
    mutationFn: () =>
      api.updateMyStatus({
        status,
        note: note.trim(),
        expectedReturnAt: returnAt ? new Date(returnAt).toISOString() : null,
      }),
    onSuccess: () => {
      toast.success('Status updated')
      qc.invalidateQueries({ queryKey: ['team-status'] })
      qc.invalidateQueries({ queryKey: ['attendance-today'] })
      onOpenChange(false)
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : 'Could not update status'),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" aria-describedby="note-desc">
        <DialogHeader>
          <DialogTitle>Update my status</DialogTitle>
          <DialogDescription id="note-desc">
            Visible to your team and managers. A cron job resets it back to Working after your expected return time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {TEAM_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="note-input">Note {note.length > 0 ? <span className="text-muted-foreground">({note.length}/120)</span> : null}</Label>
            <Input
              id="note-input"
              value={note}
              maxLength={120}
              placeholder="e.g. In client meeting until 3 PM"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="return-at">Expected return time (optional)</Label>
            <Input id="return-at" type="datetime-local" value={returnAt} onChange={(e) => setReturnAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save status'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
