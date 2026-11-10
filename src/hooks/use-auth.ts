'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, ApiClientError } from '@/lib/api-client'
import type { Me } from '@/types/api'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    retry: false,
    staleTime: 5 * 60_000,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ identifier, password }: { identifier: string; password: string }) => api.login(identifier, password),
    onSuccess: (me) => {
      qc.setQueryData<Me>(['me'], me)
      qc.invalidateQueries()
      toast.success(`Welcome back, ${me.user.name.split(' ')[0]}!`)
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : 'Sign in failed'),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.logout(),
    onSuccess: () => {
      // Force the ['me'] observer back to "signed out" immediately, drop everything else.
      qc.setQueryData<Me | null>(['me'], null)
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'me' })
      toast.success('Signed out')
    },
  })
}

export function useChangePassword() {
  return useMutation({
    mutationFn: ({ currentPassword, newPassword }: { currentPassword: string; newPassword: string }) =>
      api.changePassword(currentPassword, newPassword),
  })
}
