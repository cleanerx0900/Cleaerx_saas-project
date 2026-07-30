import { createSupabaseApiClient } from '../../../lib/supabaseServerClient'
import supabaseAdmin from '../../../lib/supabaseAdminClient'

// PATCH /api/booking/adjust-price
// Company owner adjusts the final price of a booking.
// Body: { bookingId, discountAmount, adjustmentReason }
//
// Security model:
//   - createSupabaseApiClient (anon key + user JWT) verifies the session
//   - supabaseAdmin does the actual update (bypasses RLS) but only after
//     we have confirmed the booking belongs to the authenticated user's company
export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createSupabaseApiClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const { bookingId, discountAmount, adjustmentReason } = req.body || {}

  if (!bookingId) {
    return res.status(400).json({ error: 'bookingId is required' })
  }
  const discount = Number(discountAmount)
  if (isNaN(discount) || discount < 0) {
    return res.status(400).json({ error: 'discountAmount must be a non-negative number' })
  }

  // Fetch the booking to verify ownership and get estimated_price
  const { data: booking, error: fetchError } = await supabaseAdmin
    .from('bookings')
    .select('id, company_id, estimated_price, status')
    .eq('id', bookingId)
    .maybeSingle()

  if (fetchError || !booking) {
    return res.status(404).json({ error: 'Booking not found' })
  }

  // Verify the authenticated user belongs to this booking's company
  const { data: userRow, error: userError } = await supabaseAdmin
    .from('users')
    .select('company_id, role')
    .eq('id', user.id)
    .maybeSingle()

  if (userError || !userRow) {
    return res.status(403).json({ error: 'Could not verify your company membership' })
  }
  // Platform super-admins must not touch company booking pricing
  if (userRow.role === 'super_admin') {
    return res.status(403).json({ error: 'Platform admins cannot adjust company booking prices' })
  }
  // Only the company owner may adjust prices (not company_staff, not super_admin)
  if (userRow.role !== 'company_owner') {
    return res.status(403).json({ error: 'Only the company owner can adjust booking prices' })
  }
  // Ensure the owner belongs to the same company as the booking
  if (!userRow.company_id || userRow.company_id !== booking.company_id) {
    return res.status(403).json({ error: 'You do not have permission to modify this booking' })
  }

  // Cannot adjust a completed/cancelled/lost booking
  if (['completed', 'cancelled', 'lost'].includes(booking.status)) {
    return res.status(409).json({ error: `Cannot adjust price of a ${booking.status} booking` })
  }

  const estimatedPrice = Number(booking.estimated_price)
  if (discount > estimatedPrice) {
    return res.status(400).json({ error: 'Discount cannot exceed the estimated price' })
  }

  const finalPrice = estimatedPrice - discount
  const priceStatus = discount === 0 ? 'estimated' : 'adjusted'

  const { data: updated, error: updateError } = await supabaseAdmin
    .from('bookings')
    .update({
      discount_amount: discount,
      final_price: finalPrice,
      total_amount: finalPrice,           // keep total_amount in sync for backward compat
      adjustment_reason: adjustmentReason || null,
      price_status: priceStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select('id, estimated_price, discount_amount, final_price, price_status, adjustment_reason')
    .single()

  if (updateError) {
    console.error('adjust-price: update failed', updateError)
    return res.status(500).json({ error: 'Could not update booking price. Please try again.' })
  }

  return res.status(200).json({ booking: updated })
}
