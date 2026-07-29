import supabaseAdmin from '../../lib/supabaseAdminClient'
import { ruleValue as rv } from '../../lib/bookingConstants'

const ROOM_KEYS = ['bed', 'lounge', 'kitchen', 'wash', 'garage', 'stair', 'store']
const ROOM_NAMES = { bed: 'Bedroom', lounge: 'Lounge', kitchen: 'Kitchen', wash: 'Washroom', garage: 'Garage', stair: 'Staircase', store: 'Store Room' }

// Public endpoint for the pricing-rules-based booking form
// (pages/company/[slug]/book.js).
//
// The form sends raw selection quantities — not a pre-computed total.
// This endpoint resolves the company server-side from the slug, loads its
// company_pricing_rules rows, recomputes the total authoritatively using
// the same logic as the client, and writes the booking. The stored
// total_amount is NEVER trusted from client input.
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug, customer, propertyAddress, bookingDate, selectedTime, selections } = req.body || {}

  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: "Missing 'slug'" })
  }
  if (!customer?.name || !customer?.phone) {
    return res.status(400).json({ error: 'Customer name and phone are required' })
  }
  if (!bookingDate) {
    return res.status(400).json({ error: 'Booking date is required' })
  }
  if (!selections || typeof selections !== 'object') {
    return res.status(400).json({ error: 'Please select at least one service' })
  }

  // Resolve company server-side — customer never supplies company_id
  const { data: company, error: companyError } = await supabaseAdmin
    .from('companies')
    .select('id, is_active')
    .eq('slug', slug)
    .maybeSingle()

  if (companyError) {
    console.error('create-pricing-booking: company lookup failed', companyError)
    return res.status(500).json({ error: 'Something went wrong. Please try again shortly.' })
  }
  if (!company || !company.is_active) {
    return res.status(404).json({ error: 'This company is not currently accepting bookings.' })
  }

  // Load this company's pricing rules — the server is the authority on price
  const { data: rules, error: rulesError } = await supabaseAdmin
    .from('company_pricing_rules')
    .select('category, rule_key, value')
    .eq('company_id', company.id)

  if (rulesError) {
    console.error('create-pricing-booking: pricing rules lookup failed', rulesError)
    return res.status(503).json({ error: 'Could not verify pricing. Please try again shortly.' })
  }

  // Group rules by category+key (same structure as client rulesByCategory)
  const rbc = {}
  ;(rules || []).forEach((row) => {
    if (!rbc[row.category]) rbc[row.category] = {}
    rbc[row.category][row.rule_key] = row.value
  })

  // ── Server-side pricing helpers (mirrors client book.js exactly) ──────────
  const sofaRate = (qty) =>
    qty >= rv(rbc, 'sofa', 'bulk_threshold')
      ? rv(rbc, 'sofa', 'bulk_rate')
      : rv(rbc, 'sofa', 'standard_rate')

  const foamRate = (qty) =>
    qty >= rv(rbc, 'foam', 'bulk_threshold')
      ? rv(rbc, 'foam', 'bulk_rate')
      : rv(rbc, 'foam', 'standard_rate')

  const carpetRate = (sqft) => {
    if (sqft <= 100)  return rv(rbc, 'carpet', 'band_0_100')
    if (sqft <= 300)  return rv(rbc, 'carpet', 'band_101_300')
    if (sqft <= 500)  return rv(rbc, 'carpet', 'band_301_500')
    return rv(rbc, 'carpet', 'band_500_plus')
  }

  const mattressSingleRate = (qty) => {
    if (qty > 1) return rv(rbc, 'mattress', 'single_bulk')
    if (qty === 1) return rv(rbc, 'mattress', 'single_standard')
    return 0
  }
  const mattressDoubleRate = (qty) => {
    if (qty > 1) return rv(rbc, 'mattress', 'double_bulk')
    if (qty === 1) return rv(rbc, 'mattress', 'double_standard')
    return 0
  }

  const curtainPrices = {
    csmall: rv(rbc, 'curtain', 'small'),
    cstd:   rv(rbc, 'curtain', 'standard'),
    clarge: rv(rbc, 'curtain', 'large'),
    cblack: rv(rbc, 'curtain', 'blackout'),
  }

  // tankCapacity is the tier key (500 | 1000 | 2000 | 5000) sent by the client
  const tankBandKey = { 500: 'band_500', 1000: 'band_1000', 2000: 'band_2000', 5000: 'band_5000' }
  const tankPrice = (cap) => rv(rbc, 'tank', tankBandKey[Number(cap)] || 'band_500')

  const roomPrices = (type, size) => {
    const cat = type === 'regular' ? 'home_regular' : 'home_deep'
    return Object.fromEntries(
      ROOM_KEYS.map((rk) => [rk, rv(rbc, cat, `${size}_${rk}`)])
    )
  }

  // ── Recompute total and build summary from selections ─────────────────────
  const billLines = []

  const sofa = Number(selections.sofa) || 0
  if (sofa > 0) {
    const r = sofaRate(sofa)
    billLines.push({ label: `🛋️ Sofa Cleaning (${sofa} seats${sofa >= 10 ? ' — bulk' : ''})`, amount: r * sofa })
  }

  const foam = Number(selections.foam) || 0
  if (foam > 0) {
    const r = foamRate(foam)
    billLines.push({ label: `🪑 Foam Chair (${foam} chairs${foam >= 10 ? ' — bulk' : ''})`, amount: r * foam })
  }

  const carpet = Number(selections.carpet) || 0
  if (carpet > 0) {
    const r = carpetRate(carpet)
    billLines.push({ label: `🏠 Carpet (${carpet} sqft @ Rs ${r}/sqft)`, amount: r * carpet })
  }

  const msingle = Number(selections.msingle) || 0
  if (msingle > 0) {
    billLines.push({ label: `🛏️ Single Mattress ×${msingle}`, amount: mattressSingleRate(msingle) * msingle })
  }
  const mdouble = Number(selections.mdouble) || 0
  if (mdouble > 0) {
    billLines.push({ label: `🛏️ Double Mattress ×${mdouble}`, amount: mattressDoubleRate(mdouble) * mdouble })
  }

  const curtainKeys = [['csmall', 'Small Curtain'], ['cstd', 'Standard Curtain'], ['clarge', 'Large Curtain'], ['cblack', 'Blackout Curtain']]
  curtainKeys.forEach(([k, label]) => {
    const qty = Number(selections[k]) || 0
    if (qty > 0) billLines.push({ label: `🪞 ${label} ×${qty}`, amount: curtainPrices[k] * qty })
  })

  if (selections.tankCapacity != null) {
    const price = tankPrice(selections.tankCapacity)
    billLines.push({ label: '🪣 Water Tank Cleaning', amount: price })
  }

  ;['regular', 'deep'].forEach((type) => {
    const sel = selections[type]
    if (!sel || !sel.size || !sel.rooms) return
    const label = type === 'regular' ? '🧹 Regular' : '✨ Deep'
    const prices = roomPrices(type, sel.size)
    ROOM_KEYS.forEach((rk) => {
      const qty = Number(sel.rooms[rk]) || 0
      if (qty > 0) billLines.push({ label: `${label} — ${ROOM_NAMES[rk]} ×${qty}`, amount: prices[rk] * qty })
    })
  })

  if (billLines.length === 0) {
    return res.status(400).json({ error: 'Please select at least one service with a quantity greater than zero.' })
  }

  const total = billLines.reduce((sum, l) => sum + l.amount, 0)
  const summary = billLines.map((l) => `${l.label} — Rs ${l.amount.toLocaleString()}`).join('; ') +
    ` | Total: Rs ${total.toLocaleString()}` +
    ` | Customer: ${customer.name} (${customer.phone})` +
    ` | Address: ${propertyAddress || 'N/A'}` +
    ` | Time: ${selectedTime || 'N/A'}`

  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .insert([
      {
        company_id:           company.id,
        customer_name:        customer.name,
        customer_phone:       customer.phone,
        property_address:     propertyAddress || null,
        booking_date:         bookingDate,
        booking_time:         selectedTime || null,
        special_instructions: summary,
        subtotal:             total,
        estimated_price:      total,
        discount_amount:      0,
        final_price:          total,
        total_amount:         total,
        price_status:         'estimated',
        currency:             'PKR',
        status:               'pending',
        source:               'web',
      },
    ])
    .select('id, company_id')
    .single()

  if (bookingError || !booking) {
    console.error('create-pricing-booking: booking insert failed', bookingError)
    return res.status(500).json({ error: 'Could not save your booking. Please try again shortly.' })
  }

  await supabaseAdmin.from('booking_status_history').insert([
    { booking_id: booking.id, company_id: booking.company_id, from_status: null, to_status: 'pending' },
  ])

  return res.status(201).json({ id: booking.id, companyId: booking.company_id })
}
