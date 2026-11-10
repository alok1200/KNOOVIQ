/**
 * Leave & request business logic (spec §6.4).
 * Working-day counting skips Sundays and holidays; balance mutations are
 * transactional and owned by the decision flow.
 * SERVER ONLY.
 */
import { db } from './db'
import { ApiError } from './api'
import { isSunday, rangeISO, isValidISODate } from './dates'
import { holidaySet } from './attendance-service'
import type { Prisma } from '@prisma/client'

export const BALANCED_TYPES = ['CASUAL_LEAVE', 'SICK_LEAVE', 'EARNED_LEAVE', 'WFH'] as const
export const REQUEST_TYPES = [...BALANCED_TYPES, 'OFFICIAL_WORK_OUTSIDE', 'REGULARIZATION'] as const
export type RequestType = (typeof REQUEST_TYPES)[number]

export async function workingDaysCount(from: string, to: string, officeId: string | null | undefined): Promise<number> {
  if (!isValidISODate(from) || !isValidISODate(to)) throw new ApiError(422, 'Invalid dates')
  if (to < from) throw new ApiError(422, 'End date cannot be before start date')
  const holidays = await holidaySet(officeId)
  const days = rangeISO(from, to)
  return days.filter((d) => !isSunday(d) && !holidays.has(d)).length
}

export async function assertNoOverlap(userId: string, fromDate: string, toDate: string, excludeId?: string) {
  const clash = await db.leaveRequest.findFirst({
    where: {
      userId,
      status: { in: ['PENDING', 'APPROVED'] },
      NOT: excludeId ? [{ id: excludeId }] : undefined,
      fromDate: { lte: toDate },
      toDate: { gte: fromDate },
      type: { not: 'REGULARIZATION' },
    },
  })
  if (clash) {
    throw new ApiError(409, `You already have a ${clash.status.toLowerCase()} request from ${clash.fromDate} to ${clash.toDate}. Overlapping requests are not allowed.`)
  }
}

export async function getBalances(userId: string, year: number) {
  let balances = await db.leaveBalance.findMany({ where: { userId, year } })
  if (balances.length === 0) {
    // ensure defaults exist
    const defaults = [
      { type: 'CASUAL_LEAVE', quota: 12 },
      { type: 'SICK_LEAVE', quota: 10 },
      { type: 'EARNED_LEAVE', quota: 15 },
      { type: 'WFH', quota: 24 },
    ]
    await db.leaveBalance.createMany({ data: defaults.map((d) => ({ ...d, userId, year, used: 0 })) })
    balances = await db.leaveBalance.findMany({ where: { userId, year } })
  }
  return balances
}

/** Deduct / restore used days inside a transaction. Throws when balance is insufficient. */
export async function adjustBalance(
  tx: Prisma.TransactionClient,
  userId: string,
  year: number,
  type: string,
  deltaUsed: number,
) {
  const bal = await tx.leaveBalance.findFirst({ where: { userId, year, type } })
  if (!bal) throw new ApiError(409, `No ${type} balance configured for ${year}`)
  const newUsed = bal.used + deltaUsed
  if (newUsed < 0) throw new ApiError(409, 'Balance already restored')
  if (deltaUsed > 0 && newUsed > bal.quota) {
    throw new ApiError(409, `Insufficient ${type} balance: ${(bal.quota - bal.used).toFixed(1)} day(s) left, needs ${deltaUsed.toFixed(1)}`)
  }
  await tx.leaveBalance.update({ where: { id: bal.id }, data: { used: newUsed } })
}

export function yearOfDate(iso: string): number {
  return Number(iso.slice(0, 4))
}
