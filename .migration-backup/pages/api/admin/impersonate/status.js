/**
 * GET /api/admin/impersonate/status
 * Returns the current impersonation state for the calling super_admin.
 * The client calls this on mount to know if an impersonation session is active.
 *
 * Returns:
 *   { active: false }                              — no impersonation
 *   { active: true, companyId, companyName, companySlug } — impersonating
 */
import { createSupabaseApiClient } from '../../../../lib/supabaseServerClient'
import { verifyImpersonation, COOKIE_NAME } from '../../../../lib/cookieSign'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ active: false, error: 'Method not allowed' })
  }

  // ── Must be authenticated ──────────────────────────────────────────────────
  const supabase = createSupabaseApiClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(200).json({ active: false })
  }

  // ── Verify role is super_admin ─────────────────────────────────────────────
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'super_admin') {
    return res.status(200).json({ active: false })
  }

  // ── Read and verify the impersonation cookie ───────────────────────────────
  const secret = process.env.SESSION_SECRET
  if (!secret) return res.status(200).json({ active: false })

  // Parse cookie header manually (parseCookieHeader from @supabase/ssr returns
  // an array of { name, value } objects)
  const rawCookies = req.headers.cookie || ''
  const cookieMap = {}
  for (const pair of rawCookies.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1) continue
    cookieMap[pair.slice(0, eq).trim()] = decodeURIComponent(pair.slice(eq + 1).trim())
  }

  const cookieValue = cookieMap[COOKIE_NAME]
  const payload = verifyImpersonation(cookieValue, secret)

  if (!payload || payload.sid !== user.id) {
    return res.status(200).json({ active: false })
  }

  return res.status(200).json({
    active: true,
    companyId: payload.cid,
    companyName: payload.cn,
    companySlug: payload.cs,
  })
}
