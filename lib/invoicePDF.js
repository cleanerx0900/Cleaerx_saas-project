// lib/invoicePDF.js
// Server-side only — imported exclusively from pages/api/booking/generate-invoice.js
// Uses @react-pdf/renderer to build a professional A4 invoice PDF.

import React from 'react'
import {
  Document, Page, View, Text, Image, StyleSheet, Font,
} from '@react-pdf/renderer'
import { formatDate } from './dateUtils'

// ── Palette ──────────────────────────────────────────────────────────────────
// Falls back to a professional dark-navy if no company colour provided.
const DARK   = '#0A1F44'
const LIGHT  = '#F7F9FC'
const BORDER = '#E2E8F0'
const MUTED  = '#64748B'
const WHITE  = '#FFFFFF'

// ── Parse service summary string (fallback when booking_items are absent) ─────
// Mirrors the same logic used on the dashboard booking-detail page.
function parseServiceSummary(summary) {
  if (!summary) return []
  return summary
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(segment => {
      const clean = segment.replace(/^[\p{Emoji}\u200d\ufe0f\s]+/u, '').trim()
      const m = clean.match(/^(.+?)\s*[—\-]+\s*Rs\.?\s*([\d,]+)/i)
      if (!m) return null
      const nameAndVariant = m[1].trim()
      const subtotal = Number(m[2].replace(/,/g, '')) || 0
      const parenMatch = nameAndVariant.match(/^(.+?)\s*\(([^)]+)\)\s*$/)
      if (parenMatch) {
        return { service_name: parenMatch[1].trim(), variant: parenMatch[2].trim(), subtotal }
      }
      return { service_name: nameAndVariant, variant: '', subtotal }
    })
    .filter(Boolean)
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtMoney(amount, currency = 'PKR') {
  const n = Number(amount) || 0
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Styles ────────────────────────────────────────────────────────────────────
function makeStyles(primaryColor) {
  const PRIMARY = primaryColor || DARK
  return StyleSheet.create({
    page: {
      fontFamily: 'Helvetica',
      fontSize: 9,
      color: '#1E293B',
      backgroundColor: WHITE,
      paddingTop: 40,
      paddingBottom: 50,
      paddingHorizontal: 45,
    },

    // ── Header ───────────────────────────────────────────────────────────────
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 28,
      paddingBottom: 20,
      borderBottomWidth: 2,
      borderBottomColor: PRIMARY,
    },
    logoBox: {
      width: 64,
      height: 64,
    },
    logo: {
      width: 64,
      height: 64,
      objectFit: 'contain',
      borderRadius: 6,
    },
    logoPlaceholder: {
      width: 64,
      height: 64,
      backgroundColor: PRIMARY,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    logoPlaceholderText: {
      color: WHITE,
      fontSize: 22,
      fontFamily: 'Helvetica-Bold',
    },
    companyBlock: {
      alignItems: 'flex-end',
      flex: 1,
      paddingLeft: 16,
    },
    companyName: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 18,
      color: PRIMARY,
      marginBottom: 4,
    },
    companyDetail: {
      color: MUTED,
      fontSize: 8,
      marginBottom: 2,
    },

    // ── Invoice meta banner ───────────────────────────────────────────────────
    metaBanner: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      backgroundColor: LIGHT,
      borderRadius: 6,
      padding: 14,
      marginBottom: 24,
    },
    metaGroup: {
      flexDirection: 'column',
      gap: 4,
    },
    metaLabel: {
      color: MUTED,
      fontSize: 7,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      marginBottom: 2,
    },
    metaValue: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 10,
      color: DARK,
    },
    invoiceTitle: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 24,
      color: PRIMARY,
      letterSpacing: 1,
    },

    // ── Bill To ───────────────────────────────────────────────────────────────
    billToSection: {
      marginBottom: 24,
    },
    sectionLabel: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 7,
      textTransform: 'uppercase',
      letterSpacing: 1,
      color: MUTED,
      marginBottom: 6,
    },
    billToName: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 11,
      color: DARK,
      marginBottom: 3,
    },
    billToDetail: {
      color: MUTED,
      fontSize: 8.5,
      marginBottom: 2,
    },

    // ── Items table ───────────────────────────────────────────────────────────
    table: {
      marginBottom: 20,
    },
    tableHeader: {
      flexDirection: 'row',
      backgroundColor: PRIMARY,
      borderRadius: 4,
      paddingVertical: 7,
      paddingHorizontal: 10,
      marginBottom: 2,
    },
    tableRow: {
      flexDirection: 'row',
      paddingVertical: 7,
      paddingHorizontal: 10,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    tableRowAlt: {
      flexDirection: 'row',
      paddingVertical: 7,
      paddingHorizontal: 10,
      backgroundColor: LIGHT,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    thText: {
      color: WHITE,
      fontFamily: 'Helvetica-Bold',
      fontSize: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    tdText: {
      color: '#1E293B',
      fontSize: 8.5,
    },
    tdMuted: {
      color: MUTED,
      fontSize: 7.5,
    },
    colService: { flex: 3 },
    colQty:     { flex: 1, textAlign: 'center' },
    colUnit:    { flex: 2, textAlign: 'right' },
    colSubtotal:{ flex: 2, textAlign: 'right' },

    // ── Totals ────────────────────────────────────────────────────────────────
    totalsSection: {
      alignItems: 'flex-end',
      marginBottom: 30,
    },
    totalsBox: {
      width: 220,
    },
    totalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
      borderBottomWidth: 1,
      borderBottomColor: BORDER,
    },
    totalLabel: {
      color: MUTED,
      fontSize: 8.5,
    },
    totalValue: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 8.5,
      color: DARK,
    },
    totalDueRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 10,
      backgroundColor: PRIMARY,
      borderRadius: 4,
      marginTop: 6,
    },
    totalDueLabel: {
      color: WHITE,
      fontFamily: 'Helvetica-Bold',
      fontSize: 10,
    },
    totalDueValue: {
      color: WHITE,
      fontFamily: 'Helvetica-Bold',
      fontSize: 10,
    },

    // ── Footer ────────────────────────────────────────────────────────────────
    footer: {
      position: 'absolute',
      bottom: 30,
      left: 45,
      right: 45,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: BORDER,
      paddingTop: 10,
    },
    footerThank: {
      color: PRIMARY,
      fontFamily: 'Helvetica-Bold',
      fontSize: 8,
    },
    footerMeta: {
      color: MUTED,
      fontSize: 7,
    },
  })
}

// ── Document component ────────────────────────────────────────────────────────
export function InvoiceDocument({ invoice, booking, items, company, settings }) {
  const primaryColor = settings?.primary_color || DARK
  const S = makeStyles(primaryColor)

  const currency     = booking.currency || settings?.currency || 'PKR'
  const estimatedP   = Number(booking.estimated_price ?? booking.subtotal ?? 0)
  const discount     = Number(booking.discount_amount || 0)
  const finalPrice   = Number(booking.final_price ?? booking.total_amount ?? estimatedP)
  const companyInitial = (company?.name || 'C').charAt(0).toUpperCase()

  // items are already resolved (booking_items or parsed summary) by the API route
  const resolvedItems = items

  return (
    <Document
      title={`Invoice ${invoice.invoice_number}`}
      author={company?.name || 'CleanerX'}
      subject={`Invoice for booking ${booking.id}`}
    >
      <Page size="A4" style={S.page}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <View style={S.header}>
          {/* Logo */}
          <View style={S.logoBox}>
            {settings?.logo_url ? (
              <Image src={settings.logo_url} style={S.logo} />
            ) : (
              <View style={S.logoPlaceholder}>
                <Text style={S.logoPlaceholderText}>{companyInitial}</Text>
              </View>
            )}
          </View>

          {/* Company details */}
          <View style={S.companyBlock}>
            <Text style={S.companyName}>{company?.name || 'Company Name'}</Text>
            {settings?.email         && <Text style={S.companyDetail}>{settings.email}</Text>}
            {settings?.phone         && <Text style={S.companyDetail}>{settings.phone}</Text>}
            {settings?.whatsapp_number && <Text style={S.companyDetail}>WhatsApp: {settings.whatsapp_number}</Text>}
            {settings?.address       && <Text style={S.companyDetail}>{settings.address}</Text>}
            {(settings?.city || settings?.country) && (
              <Text style={S.companyDetail}>
                {[settings.city, settings.country].filter(Boolean).join(', ')}
              </Text>
            )}
          </View>
        </View>

        {/* ── Invoice meta banner ─────────────────────────────────────── */}
        <View style={S.metaBanner}>
          <Text style={S.invoiceTitle}>INVOICE</Text>
          <View style={S.metaGroup}>
            <View>
              <Text style={S.metaLabel}>Invoice Number</Text>
              <Text style={S.metaValue}>{invoice.invoice_number}</Text>
            </View>
          </View>
          <View style={S.metaGroup}>
            <View>
              <Text style={S.metaLabel}>Invoice Date</Text>
              <Text style={S.metaValue}>{formatDate(invoice.created_at)}</Text>
            </View>
          </View>
          <View style={S.metaGroup}>
            <View>
              <Text style={S.metaLabel}>Booking Date</Text>
              <Text style={S.metaValue}>{formatDate(booking.booking_date)}</Text>
            </View>
          </View>
        </View>

        {/* ── Bill To ─────────────────────────────────────────────────── */}
        <View style={S.billToSection}>
          <Text style={S.sectionLabel}>Bill To</Text>
          <Text style={S.billToName}>{booking.customer_name}</Text>
          {booking.customer_phone && (
            <Text style={S.billToDetail}>Phone: {booking.customer_phone}</Text>
          )}
          {booking.customer_email && (
            <Text style={S.billToDetail}>Email: {booking.customer_email}</Text>
          )}
          {booking.property_address && (
            <Text style={S.billToDetail}>{booking.property_address}</Text>
          )}
          {(booking.property_city) && (
            <Text style={S.billToDetail}>{booking.property_city}</Text>
          )}
          {booking.booking_time && (
              <Text style={S.billToDetail}>Appointment: {formatDate(booking.booking_date)} at {booking.booking_time}</Text>
          )}
        </View>

        {/* ── Services table ───────────────────────────────────────────── */}
        <View style={S.table}>
          {/* Table header */}
          <View style={S.tableHeader}>
            <Text style={[S.thText, S.colService]}>Service</Text>
            <Text style={[S.thText, S.colQty]}>Qty / Variant</Text>
            <Text style={[S.thText, S.colUnit]}>Unit Price</Text>
            <Text style={[S.thText, S.colSubtotal]}>Amount</Text>
          </View>

          {/* Rows */}
          {resolvedItems.length > 0 ? resolvedItems.map((item, i) => {
            // booking_items rows have quantity + unit_price; parsed-summary rows have variant + subtotal only
            const qtyCell  = item.quantity
              ? `${item.quantity}${item.service_unit ? ' ' + item.service_unit : ''}`
              : (item.variant || '—')
            const unitCell = item.unit_price ? fmtMoney(item.unit_price, currency) : '—'
            return (
              <View key={i} style={i % 2 === 1 ? S.tableRowAlt : S.tableRow}>
                <Text style={[S.tdText, S.colService]}>{item.service_name}</Text>
                <Text style={[S.tdText, S.colQty]}>{qtyCell}</Text>
                <Text style={[S.tdText, S.colUnit]}>{unitCell}</Text>
                <Text style={[S.tdText, S.colSubtotal]}>{fmtMoney(item.subtotal, currency)}</Text>
              </View>
            )
          }) : (
            <View style={S.tableRow}>
              <Text style={[S.tdMuted, { flex: 1 }]}>No service details available</Text>
              <Text style={[S.tdMuted, S.colQty]}>—</Text>
              <Text style={[S.tdMuted, S.colUnit]}>—</Text>
              <Text style={[S.tdMuted, S.colSubtotal]}>—</Text>
            </View>
          )}
        </View>

        {/* ── Totals ───────────────────────────────────────────────────── */}
        <View style={S.totalsSection}>
          <View style={S.totalsBox}>
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Subtotal</Text>
              <Text style={S.totalValue}>{fmtMoney(estimatedP, currency)}</Text>
            </View>
            {discount > 0 && (
              <View style={S.totalRow}>
                <Text style={S.totalLabel}>
                  Discount{booking.adjustment_reason ? ` (${booking.adjustment_reason})` : ''}
                </Text>
                <Text style={[S.totalValue, { color: '#16A34A' }]}>
                  − {fmtMoney(discount, currency)}
                </Text>
              </View>
            )}
            <View style={S.totalDueRow}>
              <Text style={S.totalDueLabel}>Total Due</Text>
              <Text style={S.totalDueValue}>{fmtMoney(finalPrice, currency)}</Text>
            </View>
          </View>
        </View>

        {/* ── Footer ──────────────────────────────────────────────────── */}
        <View style={S.footer} fixed>
          <Text style={S.footerThank}>
            Thank you for choosing {company?.name || 'us'}!
          </Text>
          <Text style={S.footerMeta}>
            {invoice.invoice_number} · Generated {formatDate(invoice.created_at)}
          </Text>
        </View>

      </Page>
    </Document>
  )
}
