import crypto from 'crypto'
import { createSupabaseApiClient } from '../../../lib/supabaseServerClient'
import supabaseAdmin from '../../../lib/supabaseAdminClient'

// Same generation method used during Company Creation (see create-company.js).
function generateTempPassword() {
  return crypto.randomBytes(18).toString('base64url')
}

// Server-side "Reset Company Password" API.
//
// Lets a super_admin force a new temporary password for a Company Owner
// without ever seeing (or the request ever carrying) the current password.
// Only the Auth password + must_change_password metadata flag are touched —
// the `users` table is never modified.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  // ── Authenticate the caller from their session cookies ──
  const supabase = createSupabaseApiClient(req, res)

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  // ── Verify role: super_admin only ──
  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return res.status(500).json({ success: false, error: 'Failed to verify user role' })
  }
  if (!profile || profile.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden — super_admin role required' })
  }

  // ── Validate request body ──
  const { companyId, temp_password } = req.body || {}
  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ success: false, error: 'companyId is required' })
  }

  try {
    // Look up the company and its owner server-side — never trust a
    // client-supplied owner id.
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .select('id, name, owner_user_id')
      .eq('id', companyId)
      .maybeSingle()

    if (companyError || !company) {
      return res.status(404).json({ success: false, error: 'Company not found' })
    }
    if (!company.owner_user_id) {
      return res.status(400).json({ success: false, error: 'This company has no owner account to reset' })
    }

    const { data: ownerProfile, error: ownerError } = await supabaseAdmin
      .from('users')
      .select('id, full_name, email')
      .eq('id', company.owner_user_id)
      .maybeSingle()

    if (ownerError || !ownerProfile) {
      return res.status(404).json({ success: false, error: 'Owner account not found' })
    }

    // Always generate a brand-new password server-side too, so a missing or
    // too-short client value never falls back to anything predictable.
    const tempPassword =
      temp_password && typeof temp_password === 'string' && temp_password.length >= 8
        ? temp_password
        : generateTempPassword()

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      company.owner_user_id,
      {
        password: tempPassword,
        user_metadata: { must_change_password: true },
      }
    )

    if (updateError) {
      return res.status(500).json({
        success: false,
        error: `Failed to reset password: ${updateError.message}`,
      })
    }

    // The new temporary password is never persisted anywhere — returned only
    // once in this response so the Super Admin can hand it to the owner.
    return res.status(200).json({
      success: true,
      companyId: company.id,
      companyName: company.name,
      ownerUserId: ownerProfile.id,
      ownerName: ownerProfile.full_name,
      ownerEmail: ownerProfile.email,
      tempPassword,
      message: 'Company owner password reset successfully.',
    })
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'Unexpected error while resetting password',
    })
  }
}
