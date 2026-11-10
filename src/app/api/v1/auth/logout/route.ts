import { handleRoute, ok } from '@/lib/api'
import { REFRESH_COOKIE, bearerToken, clearAuthCookies, readCookie, revokeSession, verifyRefreshToken } from '@/lib/auth'
import { assertSameOrigin } from '@/lib/auth'

/** POST /api/v1/auth/logout — revoke session + clear cookies (spec §5). */
export const POST = handleRoute(async (req) => {
  assertSameOrigin(req)
  const token = readCookie(req, REFRESH_COOKIE) ?? bearerToken(req)
  if (token) {
    const payload = await verifyRefreshToken(token)
    if (payload?.jti) await revokeSession(String(payload.jti))
  }
  const res = ok({ loggedOut: true })
  clearAuthCookies(res)
  return res
})
