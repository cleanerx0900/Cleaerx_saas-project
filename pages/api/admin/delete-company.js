/**
 * POST /api/admin/delete-company
 *
 * Permanently deletes a company and its company-owned data.
 * Only an authenticated super_admin may call this endpoint.
 *
 * Authentication users are intentionally not deleted. The existing
 * companies/users foreign keys detach their company association with
 * ON DELETE SET NULL, preserving authentication and tenant isolation.
 */
import { createSupabaseApiClient } from '../../../lib/supabaseServerClient'
import supabaseAdmin from '../../../lib/supabaseAdminClient'

function hasCurrentActiveSubscription(subscription) {
  if (subscription.status !== 'active') return false
  if (!subscription.expires_at) return true
  return new Date(subscription.expires_at).getTime() > Date.now()
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ success: false, error: 'Method not allowed' })
  }

  const supabase = createSupabaseApiClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' })
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return res.status(500).json({ success: false, error: 'Failed to verify caller role' })
  }
  if (!profile || profile.role !== 'super_admin') {
    return res.status(403).json({ success: false, error: 'Forbidden — super_admin only' })
  }

  const { companyId } = req.body || {}
  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ success: false, error: 'companyId is required' })
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('id, name, is_active')
    .eq('id', companyId)
    .maybeSingle()

  if (companyError) {
    return res.status(500).json({ success: false, error: 'Failed to load company deletion status' })
  }
  if (!company) {
    return res.status(404).json({ success: false, error: 'Company not found' })
  }

  const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
    .from('company_subscriptions')
    .select('status, expires_at')
    .eq('company_id', companyId)

  if (subscriptionsError) {
    return res.status(500).json({ success: false, error: 'Failed to load company subscription status' })
  }

  const hasActiveSubscription = (subscriptions || []).some(hasCurrentActiveSubscription)
  if (company.is_active && hasActiveSubscription) {
    return res.status(409).json({
      success: false,
      code: 'ACTIVE_COMPANY_ACTIVE_SUBSCRIPTION',
      error: 'Deletion blocked: an Active company with an Active subscription cannot be deleted. Suspend the company or end its subscription first.',
    })
  }

  const { data, error: deleteError } = await supabaseAdmin.rpc('admin_delete_company', {
    p_company_id: companyId,
  })

  if (deleteError) {
    if (deleteError.code === 'P0001' || deleteError.message?.includes('ACTIVE_COMPANY_ACTIVE_SUBSCRIPTION')) {
      return res.status(409).json({
        success: false,
        code: 'ACTIVE_COMPANY_ACTIVE_SUBSCRIPTION',
        error: 'Deletion blocked: an Active company with an Active subscription cannot be deleted. Suspend the company or end its subscription first.',
      })
    }
    if (deleteError.code === 'P0002' || deleteError.message?.includes('COMPANY_NOT_FOUND')) {
      return res.status(404).json({ success: false, error: 'Company not found' })
    }
    if (deleteError.code === 'PGRST202') {
      return res.status(500).json({
        success: false,
        error: 'Company deletion is not enabled in the database yet. Apply the company deletion migration first.',
      })
    }
    return res.status(500).json({
      success: false,
      error: `Failed to delete company: ${deleteError.message}`,
    })
  }

  return res.status(200).json({
    success: true,
    companyId,
    companyName: company.name,
    deleted: data,
    message: 'Company and company-owned data deleted successfully.',
  })
}