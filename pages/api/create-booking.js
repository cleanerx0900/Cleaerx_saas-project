import supabaseAdmin from '../../lib/supabaseAdminClient'

// Public endpoint for the customer-facing booking form
// (pages/company/[slug]/book.js).
//
// This is the ONLY way a booking is created. Per
// sql/migrations/003_bookings_layer.sql: "Inserted by the public booking
// form via a server-side API route (never directly from browser).
// company_id is resolved server-side from the URL slug." — `bookings` has
// no anon INSERT of its own price data: every price is recomputed here from
// the company's current services/service_pricing rows, never trusted from
// the client. This is what guarantees a customer can't submit a fabricated
// discount/total, and that a booking can only ever attach to the company
// that owns the slug it was submitted from (tenant isolation).
function unitPriceForQty(pricing, qty) {
  const base = Number(pricing?.base_price) || 0
  if (pricing?.pricing_type === 'tiered' && Array.isArray(pricing.tiers) && pricing.tiers.length > 0) {
    const tier =
      pricing.tiers.find((t) => qty >= (t.min_qty ?? 0) && (t.max_qty == null || qty <= t.max_qty)) ||
      pricing.tiers[pricing.tiers.length - 1]
    return Number(tier?.price ?? base)
  }
  return base
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug, items, customer, propertyAddress, bookingDate, bookingTime, specialInstructions } = req.body || {}

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: "Missing 'slug'" })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Select at least one service' })
  }
  if (!customer?.name || !customer?.phone) {
    return res.status(400).json({ error: 'Customer name and phone are required' })
  }
  if (!bookingDate) {
    return res.status(400).json({ error: 'Booking date is required' })
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('id, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (companyError) {
    console.error('create-booking: company lookup failed', companyError)
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' })
  }
  if (!company || !company.is_active) {
    return res.status(404).json({ error: 'This company is not currently accepting bookings.' })
  }

  // Resolve every requested service against THIS company only — a
  // service id that belongs to another tenant simply won't be found here,
  // so cross-tenant booking attempts silently fail closed.
  const serviceIds = items.map((it) => it.serviceId).filter(Boolean)
  const { data: services, error: servicesError } = await supabaseAdmin
    .from('services')
    .select(
      'id, name, unit, is_active, service_pricing:service_pricing!fk_service_pricing_same_tenant ( pricing_type, base_price, currency, tiers, is_active )'
    )
    .eq('company_id', company.id)
    .in('id', serviceIds)

  if (servicesError) {
    console.error('create-booking: services lookup failed', servicesError)
    return res.status(503).json({ error: 'Could not verify services. Please try again shortly.' })
  }

  const serviceById = new Map((services || []).map((s) => [s.id, s]))
  const lineItems = []
  let currency = 'PKR'

  for (const it of items) {
    const qty = Number(it.qty) || 0
    if (qty <= 0) continue
    const svc = serviceById.get(it.serviceId)
    const pricing = Array.isArray(svc?.service_pricing) ? svc.service_pricing[0] : svc?.service_pricing
    if (!svc || !svc.is_active || !pricing || pricing.is_active === false) {
      // Service was removed/deactivated between page load and submit —
      // fail closed rather than booking a stale/unverifiable line item.
      return res.status(409).json({ error: `"${svc?.name || 'A selected service'}" is no longer available. Please refresh and try again.` })
    }
    const unitPrice = unitPriceForQty(pricing, qty)
    currency = pricing.currency || currency
    lineItems.push({
      service_id: svc.id,
      service_name: svc.name,
      service_unit: svc.unit,
      quantity: qty,
      unit_price: unitPrice,
      subtotal: unitPrice * qty,
    })
  }

  if (lineItems.length === 0) {
    return res.status(400).json({ error: 'Select at least one service' })
  }

  const subtotal = lineItems.reduce((sum, li) => sum + li.subtotal, 0)

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .insert([
      {
        company_id: company.id,
        customer_name: customer.name,
        customer_phone: customer.phone,
        customer_email: customer.email || null,
        property_address: propertyAddress || null,
        booking_date: bookingDate,
        booking_time: bookingTime || null,
        special_instructions: specialInstructions || null,
        subtotal,
        estimated_price: subtotal,
        discount_amount: 0,
        final_price: subtotal,
        total_amount: subtotal,
        price_status: 'estimated',
        currency,
        status: 'pending',
        source: 'web',
      },
    ])
    .select('id, company_id')
    .single()

  if (bookingError || !booking) {
    console.error('create-booking: booking insert failed', bookingError)
    return res.status(500).json({ error: 'Could not save your booking. Please try again shortly.' })
  }

  const { error: itemsError } = await supabaseAdmin.from('booking_items').insert(
    lineItems.map((li) => ({ ...li, booking_id: booking.id, company_id: booking.company_id }))
  )

  if (itemsError) {
    // The booking header saved but its line items didn't — remove the
    // orphaned header rather than leaving a booking with no service detail
    // in the company's dashboard.
    console.error('create-booking: booking_items insert failed', itemsError)
    await supabaseAdmin.from('bookings').delete().eq('id', booking.id)
    return res.status(500).json({ error: 'Could not save your booking. Please try again shortly.' })
  }

  await supabaseAdmin.from('booking_status_history').insert([
    { booking_id: booking.id, company_id: booking.company_id, from_status: null, to_status: 'pending' },
  ])

  return res.status(201).json({ id: booking.id, companyId: booking.company_id })
}
