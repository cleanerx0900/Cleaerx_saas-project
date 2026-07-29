import supabaseAdmin from '../../lib/supabaseAdminClient'

// Public endpoint backing the customer-facing booking form
// (pages/company/[slug]/book.js).
//
// Deliberately server-side (service_role): `companies` and
// `company_settings` have no anon SELECT policy (see
// sql/migrations/007_rls_policies.sql — "No public (anon) policy — booking
// page reads via service_role API route"), so the browser client can never
// resolve a company by slug directly. This route is the one exception,
// and it returns only the fields the public form needs — never a company's
// internal/admin data and never any other tenant's rows.
//
// Because the form always calls this route fresh (no caching), any change
// to services, service_pricing, or company_settings.whatsapp_number/contact
// info shows up immediately at the same /company/[slug]/book URL — the
// link itself never needs to change when prices or contact info change.
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
    console.error('company-booking-info: company lookup failed', companyError)
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' })
  }
  if (!company) {
    return res.status(404).json({ error: 'not_found' })
  }
  if (!company.is_active) {
    return res.status(200).json({
      company: { id: company.id, name: company.name, is_active: false },
      settings: null,
      theme: null,
      services: [],
    })
  }

  const [{ data: settings, error: settingsError }, { data: themeRow }, { data: subscription }] = await Promise.all([
    supabaseAdmin
      .from('company_settings')
      .select('logo_url, primary_color, secondary_color, whatsapp_number, phone, email')
      .eq('company_id', company.id)
      .maybeSingle(),
    supabaseAdmin
      .from('company_themes')
      .select('primary_color, secondary_color, font_family, config')
      .eq('company_id', company.id)
      .maybeSingle(),
    // Theme overrides are a premium feature — only forwarded if the
    // company's active plan includes theme_studio (mirrors the logic
    // previously done client-side in pages/company/[slug]/book.js).
    supabaseAdmin
      .from('active_subscriptions')
      .select('features')
      .eq('company_id', company.id)
      .maybeSingle(),
  ])

  if (settingsError) {
    console.error('company-booking-info: settings lookup failed', settingsError)
  }

  const { data: services, error: servicesError } = await supabaseAdmin
    .from('services')
    // Disambiguate the embed: service_pricing has two FKs to services (a
    // plain id FK and a composite fk_service_pricing_same_tenant covering
    // (service_id, company_id) — see sql/migrations/002_services_layer.sql).
    // The composite one is the tenant-safe relationship: it guarantees the
    // embedded pricing row belongs to this same company, not just this
    // service id.
    .select(
      'id, name, unit, is_active, service_pricing:service_pricing!fk_service_pricing_same_tenant ( pricing_type, base_price, currency, tiers, is_active )'
    )
    .eq('company_id', company.id)
    .eq('is_active', true)
    .order('display_order', { ascending: true })
    .order('name', { ascending: true })

  if (servicesError) {
    // Fail closed: without confirmed pricing rows we cannot guarantee the
    // quote shown reflects this company's real, current rates.
    console.error('company-booking-info: services lookup failed', servicesError)
    return res.status(503).json({ error: 'services_unavailable' })
  }

  const normalizedServices = (services || [])
    .map((s) => {
      const pricing = Array.isArray(s.service_pricing) ? s.service_pricing[0] : s.service_pricing
      return { id: s.id, name: s.name, pricing: pricing && pricing.is_active !== false ? pricing : null }
    })
    .filter((s) => s.pricing != null)

  return res.status(200).json({
    company: { id: company.id, name: company.name, is_active: true },
    settings: settings
      ? {
          logo_url: settings.logo_url,
          primary_color: settings.primary_color,
          secondary_color: settings.secondary_color,
          whatsapp_number: settings.whatsapp_number,
          phone: settings.phone,
          email: settings.email,
        }
      : null,
    theme: subscription?.features?.theme_studio === true ? themeRow || null : null,
    services: normalizedServices,
  })
}
