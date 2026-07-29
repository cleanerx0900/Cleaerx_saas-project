/**
 * POST /api/admin/impersonate
 * Super admin starts an impersonation session for a given company.
 * Sets a signed, httpOnly impersonation cookie.
 * Only callable by an authenticated super_admin.
 */
import { serializeCookieHeader } from '@supabase/ssr'
import { createSupabaseApiClient } from '../../../lib/supabaseServerClient'
import supabaseAdmin from '../../../lib/supabaseAdminClient'
import { signImpersonation, COOKIE_NAME } from '../../../lib/cookieSign'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // ── Verify caller is an authenticated super_admin ──────────────────────────
  const supabase = createSupabaseApiClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const { data: callerProfile, error: profileErr } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr) {
    return res.status(500).json({ success: false, error: 'Failed to verify caller role' })
  }
  if (!callerProfile || callerProfile.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden — super_admin only' })
  }

  // ── Validate request body ──────────────────────────────────────────────────
  const { companyId } = req.body || {}
  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ success: false, error: 'companyId is required' })
  }

  // ── Look up the company server-side (never trust client-supplied name) ─────
  const { data: company, error: companyErr } = await supabaseAdmin
    .from('companies')
    .select('id, name, slug, is_active')
    .eq('id', companyId)
    .maybeSingle()

  if (companyErr || !company) {
    return res.status(404).json({ success: false, error: 'Company not found' })
  }
  if (!company.is_active) {
    return res.status(400).json({ success: false, error: 'Cannot impersonate a suspended company' })
  }

  // ── Sign the impersonation payload ─────────────────────────────────────────
  const secret = process.env.SESSION_SECRET
  if (!secret) {
    return res.status(500).json({ success: false, error: 'SERVER_CONFIG: SESSION_SECRET not set' })
  }

  const payload = {
    cid: company.id,
    cn: company.name,
    cs: company.slug,
    sid: user.id, // super_admin's user id — verified by middleware
    ts: Date.now(),
  }

  const cookieValue = signImpersonation(payload, secret)

  // ── Set the httpOnly signed cookie ─────────────────────────────────────────
  // Must match the SameSite/Secure settings used by the Supabase session cookies
  // so the browser sends them together in the same cross-origin iframe context.
  const cookie = serializeCookieHeader(COOKIE_NAME, cookieValue, {
    httpOnly: true,
    sameSite: 'none',
    secure: true,
    path: '/',
    maxAge: 60 * 60 * 8, // 8 hours
  })

  // Append alongside any Supabase token-refresh cookies already set
  const existing = res.getHeader('Set-Cookie')
  const existingArr = existing ? (Array.isArray(existing) ? existing : [existing]) : []
  res.setHeader('Set-Cookie', [...existingArr, cookie])

  return res.status(200).json({
    success: true,
    companyId: company.id,
    companyName: company.name,
    companySlug: company.slug,
  })
}
