'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useChangePassword, useLogout } from '@/hooks/use-auth'
import { ApiClientError } from '@/lib/api-client'
import { toast } from 'sonner'

/** Forced on first login for admin-created users (spec §5). */
export function ChangePasswordDialog({
  open,
  onOpenChange,
  forced,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  forced?: boolean
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const change = useChangePassword()
  const logout = useLogout()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (next !== confirm) {
      toast.error('New passwords do not match')
      return
    }
    change.mutate(
      { currentPassword: current, newPassword: next },
      {
        onSuccess: () => {
          toast.success('Password changed. Please sign in with your new password.')
          setTimeout(() => logout.mutate(), 600)
        },
        onError: (err) => toast.error(err instanceof ApiClientError ? err.message : 'Could not change password'),
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (!forced ? onOpenChange(v) : undefined)}>
      <DialogContent className="sm:max-w-md" aria-describedby="cp-desc">
        <DialogHeader>
          <DialogTitle>{forced ? 'Change your password' : 'Change password'}</DialogTitle>
          <DialogDescription id="cp-desc">
            {forced
              ? 'Your account was created by HR. For security you must set a new password (min 8 characters) before continuing.'
              : 'Choose a strong password with at least 8 characters.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cp-current">Current password</Label>
            <Input id="cp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-next">New password</Label>
            <Input id="cp-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cp-confirm">Confirm new password</Label>
            <Input id="cp-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={change.isPending}>
              {change.isPending ? 'Saving…' : 'Save new password'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
