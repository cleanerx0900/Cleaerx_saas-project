// pages/api/booking/generate-invoice.js
// POST /api/booking/generate-invoice
//
// Generates a PDF invoice for a booking and returns it as a binary response.
// Also creates (or retrieves) an `invoices` table record for audit purposes.
//
// Body: { bookingId }
//
// Permissions:
//   company_owner  → allowed
//   company_staff  → blocked (403)
//   super_admin    → blocked (403)
//
// Security model:
//   - Session verified via createSupabaseApiClient (user JWT)
//   - All DB reads/writes use supabaseAdmin (service role) after explicit
//     company_id ownership check
//   - PDF never persisted to storage — generated on-demand and streamed

import { createSupabaseApiClient } from '../../../lib/supabaseServerClient'
import supabaseAdmin              from '../../../lib/supabaseAdminClient'
import React                      from 'react'
import { renderToBuffer }         from '@react-pdf/renderer'
import { InvoiceDocument }        from '../../../lib/invoicePDF'

// ── Parse booking summary string into invoice line items ────────────────────
// Used when booking_items rows are absent (create-pricing-booking flow stores
// services as a semicolon-separated text string in special_instructions).
//
// Input format (example):
//   "🛋️ Sofa Cleaning (6 seats) — Rs 10,800; 🪑 Foam Chair (5 chairs) — Rs 7,000
//    | Total: Rs 17,800 | Customer: Ali (...) | Address: ..."
//
// Uses lastIndexOf(' — Rs ') so labels that themselves contain ' — '
// (e.g. "🧹 Regular — Bedroom ×2 — Rs 2,000") are handled correctly.
function parseBookingSummary(summary) {
  if (!summary || typeof summary !== 'string') return []

  // Strip trailing metadata appended after the first ' | '
  const servicesPart = summary.includes(' | ') ? summary.split(' | ')[0] : summary
  const SEP = ' \u2014 Rs '   // ' — Rs ' (em-dash)

  return servicesPart
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(segment => {
      const sepIdx = segment.lastIndexOf(SEP)
      if (sepIdx === -1) return null

      const rawLabel  = segment.slice(0, sepIdx).trim()
      // Amount may have locale commas (e.g. "10,800"); stop at whitespace in case of leftovers
      const amountStr = segment.slice(sepIdx + SEP.length).trim().split(/\s/)[0]
      const subtotal  = Number(amountStr.replace(/,/g, '')) || 0

      if (!rawLabel || !subtotal) return null

      // Strip leading emoji / punctuation — keep from first letter, digit, or '('
      const label = rawLabel.replace(/^[^\p{L}\p{N}(]+/u, '').trim()
      if (!label) return null

      // Extract variant from trailing parentheses, e.g. "Sofa Cleaning (6 seats)"
      const parenMatch = label.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
      if (parenMatch) {
        return { service_name: parenMatch[1].trim(), variant: parenMatch[2].trim(), subtotal }
      }
      return { service_name: label, variant: null, subtotal }
    })
    .filter(Boolean)
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── Auth ────────────────────────────────────────────────────────────────────
  const supabase = createSupabaseApiClient(req, res)
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorised' })
  }

  const { bookingId } = req.body || {}
  if (!bookingId) {
    return res.status(400).json({ error: 'bookingId is required' })
  }

  // ── Fetch user profile ──────────────────────────────────────────────────────
  const { data: userRow, error: userErr } = await supabaseAdmin
    .from('users')
    .select('company_id, role, full_name')
    .eq('id', user.id)
    .maybeSingle()

  if (userErr || !userRow) {
    return res.status(403).json({ error: 'Could not verify your account' })
  }
  if (userRow.role === 'super_admin') {
    return res.status(403).json({ error: 'Platform admins cannot generate company invoices' })
  }
  if (userRow.role !== 'company_owner') {
    return res.status(403).json({ error: 'Only the company owner can generate invoices' })
  }
  if (!userRow.company_id) {
    return res.status(403).json({ error: 'Your account is not linked to a company' })
  }

  const companyId = userRow.company_id

  // ── Fetch booking, items, company, settings in parallel ────────────────────
  const [bookingRes, itemsRes, companyRes, settingsRes] = await Promise.all([
    supabaseAdmin
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('company_id', companyId)
      .maybeSingle(),
    supabaseAdmin
      .from('booking_items')
      .select('service_name, service_unit, quantity, unit_price, subtotal, variant')
      .eq('booking_id', bookingId)
      .order('service_name'),
    supabaseAdmin
      .from('companies')
      .select('id, name, slug')
      .eq('id', companyId)
      .maybeSingle(),
    supabaseAdmin
      .from('company_settings')
      .select('logo_url, email, phone, whatsapp_number, address, city, country, currency, primary_color')
      .eq('company_id', companyId)
      .maybeSingle(),
  ])

  if (bookingRes.error || !bookingRes.data) {
    return res.status(404).json({ error: 'Booking not found or access denied' })
  }

  const booking  = bookingRes.data
  const company  = companyRes.data  || null
  const settings = settingsRes.data || null

  // Prefer structured booking_items rows; fall back to parsing the summary string
  const rawItems = itemsRes.data || []
  const items = rawItems.length > 0
    ? rawItems
    : parseBookingSummary(booking.special_instructions)

  if (items.length === 0) {
    console.warn('generate-invoice: no service items found for booking', bookingId,
      '— special_instructions:', booking.special_instructions?.slice(0, 120))
  } else {
    console.log('generate-invoice: resolved', items.length, 'service item(s) for booking', bookingId,
      rawItems.length > 0 ? '(from booking_items)' : '(parsed from special_instructions)')
  }

  // ── Create or retrieve invoice record ───────────────────────────────────────
  let invoiceRecord

  // Check if an invoice already exists for this booking
  const { data: existing } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_number, created_at')
    .eq('booking_id', bookingId)
    .maybeSingle()

  if (existing) {
    // Reuse existing invoice number — regenerate PDF fresh
    invoiceRecord = existing
  } else {
    // Compute next sequential invoice number for this company
    const { count } = await supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact', head: true })
      .eq('company_id', companyId)

    const seq           = (count || 0) + 1
    const year          = new Date().getFullYear()
    const invoiceNumber = `INV-${year}-${String(seq).padStart(4, '0')}`

    const { data: inserted, error: insertErr } = await supabaseAdmin
      .from('invoices')
      .insert({
        company_id:     companyId,
        booking_id:     bookingId,
        invoice_number: invoiceNumber,
        generated_by:   user.id,
        created_at:     new Date().toISOString(),
      })
      .select('id, invoice_number, created_at')
      .single()

    if (insertErr) {
      // ── Table missing (migration not yet applied) ────────────────────────────
      if (insertErr.code === 'PGRST205' || insertErr.message?.includes("invoices")) {
        console.error(
          'generate-invoice: invoices table missing — run sql/migrations/021_invoices.sql in the Supabase SQL Editor.',
          insertErr
        )
        return res.status(500).json({
          error:
            'The invoices table has not been created yet. ' +
            'Please run sql/migrations/021_invoices.sql in the Supabase SQL Editor, then try again.',
        })
      }

      // ── Unique-constraint race (two simultaneous requests) ──────────────────
      if (insertErr.code === '23505') {
        const { data: fallback } = await supabaseAdmin
          .from('invoices')
          .select('id, invoice_number, created_at')
          .eq('booking_id', bookingId)
          .maybeSingle()
        invoiceRecord = fallback
      } else {
        console.error('generate-invoice: insert failed', insertErr)
        return res.status(500).json({ error: 'Could not create invoice record. Please try again.' })
      }
    } else {
      invoiceRecord = inserted
    }
  }

  if (!invoiceRecord) {
    return res.status(500).json({ error: 'Invoice record unavailable. Please try again.' })
  }

  // ── Generate PDF ────────────────────────────────────────────────────────────
  let pdfBuffer
  try {
    const element = React.createElement(InvoiceDocument, {
      invoice: invoiceRecord,
      booking,
      items,
      company,
      settings,
    })
    pdfBuffer = await renderToBuffer(element)
  } catch (pdfErr) {
    console.error('generate-invoice: PDF render failed', pdfErr)
    return res.status(500).json({ error: 'Could not generate PDF. Please try again.' })
  }

  // ── Stream PDF to client ────────────────────────────────────────────────────
  const filename = `${invoiceRecord.invoice_number}.pdf`
  res.setHeader('Content-Type',        'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
  res.setHeader('Content-Length',      pdfBuffer.length)
  res.setHeader('Cache-Control',       'no-store')
  return res.status(200).send(pdfBuffer)
}
