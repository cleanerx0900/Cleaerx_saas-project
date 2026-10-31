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
// Allowed formats: PNG, JPG/JPEG, and WEBP only.
// SVG is strictly prohibited to eliminate stored XSS risks (LU-01).
const ALLOWED_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
}
const MAX_BYTES = 2 * 1024 * 1024 // 2MB, matches the bucket's fileSizeLimit

/**
 * Validates actual binary file signatures (magic bytes) and internal structure
 * against expected image formats (PNG, JPEG, WEBP).
 * Defends against MIME spoofing, malformed files, and disguised polyglot scripts.
 */
function detectImageSignature(buf) {
  if (!buf || !Buffer.isBuffer(buf) || buf.length < 24) {
    return null
  }

  // Polyglot & embedded script defense:
  // Inspect raw buffer text for malicious XML/HTML/JS tags embedded in metadata
  const textContent = buf.toString('latin1').toLowerCase()
  if (
    textContent.includes('<script') ||
    textContent.includes('<svg') ||
    textContent.includes('<?xml') ||
    textContent.includes('<html') ||
    textContent.includes('<iframe') ||
    textContent.includes('onload=') ||
    textContent.includes('onerror=') ||
    textContent.includes('javascript:')
  ) {
    return null
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A + valid IHDR chunk
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    // Check IHDR chunk header (starts at byte 12: 'IHDR')
    const hasIHDR = buf.slice(12, 16).toString('ascii') === 'IHDR'
    if (!hasIHDR) return null

    // IHDR chunk data length must be 13 bytes
    const ihdrLen = buf.readUInt32BE(8)
    if (ihdrLen !== 13) return null

    // Check dimensions: width > 0, height > 0
    const width = buf.readUInt32BE(16)
    const height = buf.readUInt32BE(20)
    if (width === 0 || height === 0) return null

    return { mime: 'image/png', ext: 'png' }
  }

  // 2. JPEG / JPG: Starts with FF D8 FF (SOI) + ends with or contains FF D9 (EOI)
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    // Check for EOI marker in trailing bytes
    const hasEOI = buf.slice(buf.length - 32).includes(Buffer.from([0xff, 0xd9]))
    if (!hasEOI) return null

    return { mime: 'image/jpeg', ext: 'jpg' }
  }

  // 3. WEBP: 'RIFF' (0-3) + 'WEBP' (8-11) + valid VP8 chunk header (12-15)
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    // Chunk type must be VP8 (lossy), VP8L (lossless), or VP8X (extended)
    const chunkType = buf.slice(12, 16).toString('ascii')
    if (chunkType.startsWith('VP8')) {
      return { mime: 'image/webp', ext: 'webp' }
    }
  }

  return null
}

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

  const normalizedType = typeof fileType === 'string' ? fileType.trim().toLowerCase() : ''

  if (normalizedType === 'image/svg+xml' || normalizedType.includes('svg')) {
    return res.status(400).json({
      error: 'SVG uploads are strictly prohibited for security reasons. Please upload a PNG, JPG, or WEBP image.',
    })
  }

  if (!normalizedType || !ALLOWED_TYPES[normalizedType]) {
    return res.status(400).json({ error: 'Unsupported image type. Allowed formats: PNG, JPG, JPEG, or WEBP.' })
  }
  if (!base64 || typeof base64 !== 'string') {
    return res.status(400).json({ error: 'Missing file data' })
  }

  const buffer = Buffer.from(base64, 'base64')
  if (buffer.byteLength > MAX_BYTES) {
    return res.status(400).json({ error: 'Logo file is too large (max 2MB).' })
  }

  // Binary magic byte validation: verify actual file contents
  const detected = detectImageSignature(buffer)
  if (!detected) {
    return res.status(400).json({
      error: 'Corrupted or invalid image file. The file contents do not match a valid PNG, JPG, or WEBP image.',
    })
  }

  // Cross-check: ensure declared MIME family aligns with actual detected format
  const expectedExt = ALLOWED_TYPES[normalizedType]
  if (expectedExt !== detected.ext) {
    return res.status(400).json({
      error: `File signature mismatch: claimed ${fileType} but binary content corresponds to ${detected.mime}.`,
    })
  }

  const path = `${companyId}/logo-${Date.now()}.${detected.ext}`

  const { error: uploadError } = await supabaseAdmin.storage
    .from('company-logos')
    .upload(path, buffer, { contentType: detected.mime, upsert: true })

  if (uploadError) {
    return res.status(500).json({ error: `Upload failed: ${uploadError.message}` })
  }

  const { data: publicUrlData } = supabaseAdmin.storage.from('company-logos').getPublicUrl(path)

  return res.status(200).json({ logoUrl: publicUrlData.publicUrl })
}
