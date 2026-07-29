import supabaseAdmin from '../../lib/supabaseAdminClient'

// Public endpoint called right after a customer submits a booking on
// /company/[slug]/book. Deliberately unauthenticated (customers are
// anonymous) but company-isolated: the WhatsApp destination number is
// looked up server-side from company_settings using the booking's own
// company_id / booking_id — it is never taken from the request body — so a
// caller can only ever trigger a notification to the company that actually
// owns that booking, never an arbitrary number or another tenant's number.
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || ''
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || ''
const TWILIO_WHATSAPP_FROM = process.env.TWILIO_WHATSAPP_FROM || ''

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { bookingId, companyId } = req.body || {}
  if (!bookingId || !companyId) {
    return res.status(400).json({ error: "Missing 'bookingId' or 'companyId'" })
  }

  // Confirm the booking belongs to the claimed company (tenant isolation)
  // before looking up anything or sending anything.
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from('bookings')
    .select('id, company_id, special_instructions, booking_date, customer_name, customer_phone')
    .eq('id', bookingId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (bookingError || !booking) {
    return res.status(404).json({ error: 'Booking not found for this company' })
  }

  const { data: company } = await supabaseAdmin
    .from('companies')
    .select('name')
    .eq('id', companyId)
    .maybeSingle()

  const { data: settings } = await supabaseAdmin
    .from('company_settings')
    .select('whatsapp_number')
    .eq('company_id', companyId)
    .maybeSingle()

  const whatsappNumber = settings?.whatsapp_number
  if (!whatsappNumber) {
    return res.status(200).json({ skipped: true, reason: 'Company has no WhatsApp number configured' })
  }

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    return res.status(200).json({ skipped: true, reason: 'Twilio credentials not configured on server' })
  }

  const summary = booking.special_instructions || ''
  const totalMatch = /Total:\s*Rs\s*[\d,]+/.exec(summary)
  // Extract just the service lines (before the pipe-delimited metadata)
  const servicesText = summary.split(' | ')[0] || 'N/A'
  const message =
    `📥 *New Booking — ${company?.name || 'Your Company'}*\n\n` +
    `👤 Customer: ${booking.customer_name || 'N/A'}\n` +
    `📞 Phone: ${booking.customer_phone || 'N/A'}\n` +
    `🧹 Services: ${servicesText}\n` +
    `📅 Date: ${booking.booking_date || 'N/A'}\n` +
    (totalMatch ? `💰 ${totalMatch[0]}\n` : '')

  try {
    const formattedTo = whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : `whatsapp:${whatsappNumber}`
    const formattedFrom = TWILIO_WHATSAPP_FROM.startsWith('whatsapp:')
      ? TWILIO_WHATSAPP_FROM
      : `whatsapp:${TWILIO_WHATSAPP_FROM}`

    const body = new URLSearchParams({
      To: formattedTo,
      From: formattedFrom,
      Body: message,
    })

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }
    )

    const data = await response.json()

    if (!response.ok) {
      console.error('Twilio error:', data)
      return res.status(502).json({ error: data.message || 'Twilio request failed' })
    }

    return res.status(200).json({ success: true, sid: data.sid })
  } catch (err) {
    console.error('booking-notify API error:', err)
    return res.status(500).json({ error: err.message })
  }
}
