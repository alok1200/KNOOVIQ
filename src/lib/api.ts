/**
 * Consistent API response shape { success, data, error } (spec §8),
 * typed error class, route wrapper and pagination helpers.
 */
import { NextResponse } from 'next/server'
import { ZodError } from 'zod'

export class ApiError extends Error {
  status: number
  details?: unknown
  constructor(status: number, message: string, details?: unknown) {
    super(message)
    this.status = status
    this.details = details
  }
}

 
export function ok(data: any, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init)
}

 
export function fail(status: number, message: string, details?: any): NextResponse {
  return NextResponse.json({ success: false, error: { message, details } }, { status })
}

type Ctx = { params: Promise<Record<string, string>> }
type Handler = (req: Request, ctx: Ctx) => Promise<NextResponse>

/** Wraps a route handler with unified error handling. */
export function handleRoute(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (err) {
      if (err instanceof ApiError) {
        return fail(err.status, err.message, err.details)
      }
      if (err instanceof ZodError) {
        const first = err.issues[0]
        const path = first?.path?.join('.')
        return fail(422, first ? `${path ? path + ': ' : ''}${first.message}` : 'Invalid input', err.issues)
      }
       
      console.error('[api] unhandled error:', err)
      return fail(500, 'Internal server error')
    }
  }
}

export function getPagination(url: URL, defaultSize = 20) {
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1)
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') ?? defaultSize) || defaultSize))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

 
export function paginated(items: any[], total: number, page: number, pageSize: number) {
  return { items, total, page, pageSize }
}

/** Reject NoSQL-style operator injection keys like $gt (spec §5). */
 
export function assertNoOperators(obj: any) {
  if (obj && typeof obj === 'object') {
    for (const key of Object.keys(obj)) {
      if (key.startsWith('$') || key.includes('__proto__')) {
        throw new ApiError(400, 'Invalid input')
      }
      assertNoOperators(obj[key])
    }
  }
}
