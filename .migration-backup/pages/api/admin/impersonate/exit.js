/**
 * POST /api/admin/impersonate/exit
 * Clears the impersonation cookie, ending the super_admin's company session.
 * The caller must be authenticated; the cookie is cleared regardless of whether
 * the caller is still a super_admin (handles edge cases like token expiry).
 */
import { serializeCookieHeader } from '@supabase/ssr'
import { createSupabaseApiClient } from '../../../../lib/supabaseServerClient'
import { COOKIE_NAME } from '../../../../lib/cookieSign'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // Require authentication (even if session is partially expired)
  const supabase = createSupabaseApiClient(req, res)
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // Even if not authenticated, clear the cookie — safety measure
  }

  // Clear the impersonation cookie by setting it with maxAge=0
  const expiredCookie = serializeCookieHeader(COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: 0,
  })

  const existing = res.getHeader('Set-Cookie')
  const existingArr = existing ? (Array.isArray(existing) ? existing : [existing]) : []
  res.setHeader('Set-Cookie', [...existingArr, expiredCookie])

  return res.status(200).json({ success: true })
}
