import supabaseAdmin from '../../lib/supabaseAdminClient'

// Public endpoint for the company booking form (pages/company/[slug]/book.js).
// Resolves a company by slug and returns:
//   • company_pricing_rules   — pricing values for all 8 sections
//   • company_service_settings — is_active flag per section (visibility toggles)
//   • company_settings        — branding (logo, primary_color) + contact info
//
// Deliberately server-side (service_role) because these tables have no anon
// SELECT policy — same convention as pages/api/booking-notify.js and
// sql/migrations/007_rls_policies.sql.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug } = req.query
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: "Missing 'slug' query parameter" })
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('id, name, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (companyError) {
    console.error('company-pricing: company lookup failed', companyError)
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' })
  }
  if (!company) {
    return res.status(404).json({ error: 'not_found' })
  }
  if (!company.is_active) {
    return res.status(200).json({
      company: { id: company.id, name: company.name, is_active: false },
      rules: [],
      serviceSettings: [],
      settings: null,
    })
  }

  const [
    { data: rules,           error: rulesError },
    { data: serviceSettings, error: settingsError },
    { data: contactSettings },
  ] = await Promise.all([
    // Pricing values — fail hard if unavailable (see comment in handler below)
    supabaseAdmin
      .from('company_pricing_rules')
      .select('category, rule_key, value')
      .eq('company_id', company.id),

    // Visibility toggles — soft fail: missing rows treated as active
    supabaseAdmin
      .from('company_service_settings')
      .select('category, is_active')
      .eq('company_id', company.id),

    // Branding + contact fields
    supabaseAdmin
      .from('company_settings')
      .select('whatsapp_number, phone, logo_url, primary_color, secondary_color, accent_color')
      .eq('company_id', company.id)
      .maybeSingle(),
  ])

  if (rulesError) {
    // Fail closed: without confirmed pricing rows we cannot guarantee the
    // quote shown reflects this company's real rates.
    console.error('company-pricing: rules lookup failed', rulesError)
    return res.status(503).json({ error: 'pricing_unavailable' })
  }

  if (settingsError) {
    // Non-fatal — if the migration hasn't run yet all sections default to visible
    console.warn('company-pricing: service_settings lookup failed', settingsError)
  }

  return res.status(200).json({
    company: { id: company.id, name: company.name, is_active: true },
    rules: rules || [],
    // Array of { category, is_active } — booking form uses this to hide sections
    serviceSettings: serviceSettings || [],
    settings: contactSettings
      ? {
          whatsapp_number: contactSettings.whatsapp_number,
          phone:           contactSettings.phone,
          logo_url:        contactSettings.logo_url,
          primary_color:   contactSettings.primary_color,
          secondary_color: contactSettings.secondary_color,
          accent_color:    contactSettings.accent_color,
        }
      : null,
  })
}
