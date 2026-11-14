import { createSupabaseApiClient } from '../../../lib/supabaseServerClient'
import supabaseAdmin from '../../../lib/supabaseAdminClient'

// PATCH /api/booking/update-status
// Updates a booking's status with optional reason metadata.
//
// Body:
//   bookingId         string   required
//   newStatus         string   required
//   notes?            string   optional free-text note added to history
//   lostReason?       string   required when newStatus === 'lost'
//   cancellationReason? string required when newStatus === 'cancelled'
//   cancelledBy?      string   'customer' | 'company'  required when newStatus === 'cancelled'
//
// Allowed transitions:
//   pending     → confirmed | lost
//   confirmed   → in_progress | cancelled
//   in_progress → completed | cancelled
//   completed   → (terminal)
//   cancelled   → (terminal)
//   lost        → (terminal)
//
// Permissions:
//   super_admin    → blocked (read-only on company data)
//   company_owner  → all transitions including cancel / lost
//   company_staff  → forward transitions only (confirmed, in_progress, completed)
//                    cannot cancel or mark as lost

const ALLOWED_TRANSITIONS = {
  pending:     ['confirmed', 'lost'],
  confirmed:   ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed:   [],
  cancelled:   [],
  lost:        [],
}

// Transitions that are restricted to company_owner only (not company_staff)
const OWNER_ONLY_TARGETS = ['cancelled', 'lost']

const LOST_REASON_OPTIONS = [
  'Customer chose another company',
  'Price issue',
  'Date unavailable',
  'No response',
  'Other',
]

export default async function handler(req, res) {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── Auth ──────────────────────────────────────────────────
  const supabase = createSupabaseApiClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const {
    bookingId,
    newStatus,
    notes,
    lostReason,
    cancellationReason,
    cancelledBy,
  } = req.body || {}

  // ── Basic validation ───────────────────────────────────────
  if (!bookingId || !newStatus) {
    return res.status(400).json({ error: 'bookingId and newStatus are required' })
  }

  const allStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'lost']
  if (!allStatuses.includes(newStatus)) {
    return res.status(400).json({ error: `Invalid status: ${newStatus}` })
  }

  // Validate reason fields for terminal negative states
  if (newStatus === 'lost') {
    if (!lostReason || !lostReason.trim()) {
      return res.status(400).json({ error: 'A lost reason is required when marking a booking as lost' })
    }
    if (!LOST_REASON_OPTIONS.includes(lostReason.trim())) {
      return res.status(400).json({ error: `Invalid lost reason. Must be one of: ${LOST_REASON_OPTIONS.join(', ')}` })
    }
  }

  if (newStatus === 'cancelled') {
    if (!cancellationReason || !cancellationReason.trim()) {
      return res.status(400).json({ error: 'A cancellation reason is required' })
    }
    if (!['customer', 'company'].includes(cancelledBy)) {
      return res.status(400).json({ error: 'cancelledBy must be "customer" or "company"' })
    }
  }

  // ── Fetch booking ──────────────────────────────────────────
  const { data: booking, error: fetchError } = await supabaseAdmin
    .from('bookings')
    .select('id, company_id, status')
    .eq('id', bookingId)
    .maybeSingle()

  if (fetchError || !booking) {
    return res.status(404).json({ error: 'Booking not found' })
  }

  // ── Fetch user profile for permission check ────────────────
  const { data: userRow, error: userError } = await supabaseAdmin
    .from('users')
    .select('company_id, role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (userError || !userRow) {
    return res.status(403).json({ error: 'Could not verify your account' })
  }

  // super_admin is platform-level; must not touch company booking status
  if (userRow.role === 'super_admin') {
    return res.status(403).json({ error: 'Platform admins cannot update company booking status' })
  }

  // Must belong to the same company as the booking
  if (!userRow.company_id || userRow.company_id !== booking.company_id) {
    return res.status(403).json({ error: 'You do not have permission to update this booking' })
  }

  // company_staff cannot cancel or mark as lost — owner actions only
  if (userRow.role === 'company_staff' && OWNER_ONLY_TARGETS.includes(newStatus)) {
    return res.status(403).json({
      error: 'Only the company owner can cancel bookings or mark them as lost',
    })
  }

  // ── Validate transition ────────────────────────────────────
  const allowed = ALLOWED_TRANSITIONS[booking.status] || []
  if (!allowed.includes(newStatus)) {
    return res.status(409).json({
      error: `Cannot transition from "${booking.status}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none (terminal state)'}`,
    })
  }

  // ── Build update payload ───────────────────────────────────
  const now = new Date().toISOString()
  const updatePayload = { status: newStatus, updated_at: now }

  if (newStatus === 'lost') {
    updatePayload.lost_reason = lostReason.trim()
    updatePayload.lost_at     = now
  }

  if (newStatus === 'cancelled') {
    updatePayload.cancellation_reason = cancellationReason.trim()
    updatePayload.cancelled_at        = now
    updatePayload.cancelled_by        = cancelledBy
  }

  // ── Apply status update ────────────────────────────────────
  const { error: updateError } = await supabaseAdmin
    .from('bookings')
    .update(updatePayload)
    .eq('id', bookingId)

  if (updateError) {
    console.error('update-status: DB update failed', {
      code:    updateError.code,
      message: updateError.message,
      details: updateError.details,
      hint:    updateError.hint,
      payload: updatePayload,
    })
    // Surface the real DB error so it appears in the dashboard error toast
    // and in server logs for diagnosis.
    const isColumnMissing = updateError.code === 'PGRST204' || updateError.code === '42703'
    const clientMessage = isColumnMissing
      ? `Database schema is out of date (${updateError.message}). Run migration 020_lost_cancellation.sql in Supabase SQL Editor.`
      : `Could not update booking status: ${updateError.message}`
    return res.status(500).json({ error: clientMessage, dbCode: updateError.code })
  }

  // ── Build history note ─────────────────────────────────────
  let historyNote = notes || null

  if (newStatus === 'lost') {
    historyNote = `Lost reason: ${lostReason.trim()}`
    if (notes) historyNote += `. ${notes}`
  }

  if (newStatus === 'cancelled') {
    const byLabel = cancelledBy === 'customer' ? 'Customer' : 'Company'
    historyNote = `Cancelled by ${byLabel}. Reason: ${cancellationReason.trim()}`
    if (notes) historyNote += `. ${notes}`
  }

  // ── Record in status history ───────────────────────────────
  await supabaseAdmin.from('booking_status_history').insert([{
    booking_id:  bookingId,
    company_id:  booking.company_id,
    changed_by:  user.id,
    from_status: booking.status,
    to_status:   newStatus,
    notes:       historyNote,
  }])

  return res.status(200).json({
    status:  newStatus,
    ...(newStatus === 'lost'      && { lost_reason: lostReason }),
    ...(newStatus === 'cancelled' && { cancellation_reason: cancellationReason, cancelled_by: cancelledBy }),
  })
}
