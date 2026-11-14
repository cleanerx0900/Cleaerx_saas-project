import { createSupabaseApiClient } from '../../../lib/supabaseServerClient'
import supabaseAdmin from '../../../lib/supabaseAdminClient'

// Uploads a company logo to Supabase Storage and returns its public URL.
// Deliberately server-side: the `company-logos` bucket has no client write
// policy (see storage RLS note below), so uploads go through this route,
// which authenticates the caller from their session cookie and verifies
// they're a company_owner/staff of the target company (or super_admin)
// before writing with the service-role client. company_settings itself is
// still saved by the client directly (existing RLS on that table already
// permits company owners to manage their own row) — this route only
// handles the storage write and hands back the URL to include in that save.
//
// Body: { companyId: uuid, fileName: string, fileType: string, base64: string }
// base64 is the raw file content, no "data:...;base64," prefix.
const ALLOWED_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
}
const MAX_BYTES = 2 * 1024 * 1024 // 2MB, matches the bucket's fileSizeLimit

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createSupabaseApiClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('role, company_id')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return res.status(500).json({ error: 'Failed to verify user' })
  }

  const { companyId, fileName, fileType, base64 } = req.body || {}

  if (!companyId || typeof companyId !== 'string') {
    return res.status(400).json({ error: 'Missing companyId' })
  }
  // Only super_admin or an admin of THIS company may upload its logo —
  // mirrors the is_company_admin() + auth_company_id() check on the
  // company_owner_manage_settings RLS policy for company_settings.
  const isSuperAdmin = profile.role === 'super_admin'
  const isThisCompanyAdmin = profile.role === 'company_owner' && profile.company_id === companyId
  if (!isSuperAdmin && !isThisCompanyAdmin) {
    return res.status(403).json({ error: 'Forbidden' })
  }

  if (!fileType || !ALLOWED_TYPES[fileType]) {
    return res.status(400).json({ error: 'Unsupported image type. Use PNG, JPG, WEBP, or SVG.' })
  }
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'Missing file data' })
  }

  const buffer = Buffer.from(base64, 'base64')
  if (buffer.byteLength > MAX_BYTES) {
    return res.status(400).json({ error: 'Logo file is too large (max 2MB).' })
  }

  const ext = ALLOWED_TYPES[fileType]
  const path = `${companyId}/logo-${Date.now()}.${ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('company-logos')
    .upload(path, buffer, { contentType: fileType, upsert: true })

  if (uploadError) {
    return res.status(500).json({ error: `Upload failed: ${uploadError.message}` })
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from('company-logos').getPublicUrl(path)

  return res.status(200).json({ logoUrl: publicUrlData.publicUrl })
}
