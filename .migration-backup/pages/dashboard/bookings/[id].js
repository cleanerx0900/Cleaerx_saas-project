import { useEffect, useState } from "react"
import { useRouter } from "next/router"
import Link from "next/link"
import {
  ArrowLeft, User, MapPin, Calendar, Clock, FileText,
  Tag, CheckCircle, XCircle, Loader2, ChevronRight,
  DollarSign, AlertCircle, AlertTriangle, Ban, Download,
} from "lucide-react"
import DashboardLayout from "../../../components/DashboardLayout"
import { useTenant } from "../../../contexts/TenantContext"
import { StatusBadge, cn } from "../../../components/ui/AdminKit"
import supabase from "../../../lib/supabaseClient"
import { formatDate, formatDateTime } from "../../../lib/dateUtils"

// ── Status transition map ────────────────────────────────────────────────────
const TRANSITIONS = {
  pending:     [
    { to: "confirmed",   label: "Confirm Booking",  color: "green", ownerOnly: false },
    { to: "lost",        label: "Mark as Lost",     color: "gray",  ownerOnly: true  },
  ],
  confirmed:   [
    { to: "in_progress", label: "Mark In Progress", color: "blue",  ownerOnly: false },
    { to: "cancelled",   label: "Cancel Booking",   color: "red",   ownerOnly: true  },
  ],
  in_progress: [
    { to: "completed",   label: "Mark Completed",   color: "teal",  ownerOnly: false },
    { to: "cancelled",   label: "Cancel Booking",   color: "red",   ownerOnly: true  },
  ],
  completed:   [],
  cancelled:   [],
  lost:        [],
}

const BUTTON_COLORS = {
  green: "bg-green-600 hover:bg-green-700 text-white",
  blue:  "bg-blue-600 hover:bg-blue-700 text-white",
  teal:  "bg-teal-600 hover:bg-teal-700 text-white",
  red:   "bg-red-100 hover:bg-red-200 text-red-700 border border-red-200",
  gray:  "bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-200",
}

const PRICE_STATUS_LABEL = {
  estimated: { label: "Estimated",       cls: "bg-amber-100 text-amber-700 border-amber-200" },
  adjusted:  { label: "Adjusted",        cls: "bg-blue-100 text-blue-700 border-blue-200"   },
  confirmed: { label: "Price Confirmed", cls: "bg-teal-100 text-teal-700 border-teal-200"   },
}

const LOST_REASON_OPTIONS = [
  "Customer chose another company",
  "Price issue",
  "Date unavailable",
  "No response",
  "Other",
]

// ── Parse service summary string into structured items ────────────────────────
// Used when booking_items rows are absent; parses the special_instructions
// field that create-pricing-booking.js stores in the format:
//   "🛋️ Sofa Cleaning (6 seats) — Rs 1,800; 🪑 Foam Chair (5 chairs) — Rs 1,400"
function parseServiceSummary(summary) {
  if (!summary) return []
  return summary
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(segment => {
      // Strip leading emoji / whitespace
      const clean = segment.replace(/^[\p{Emoji}\u200d\ufe0f\s]+/u, '').trim()
      // Match: "Name (variant) — Rs 1,800" or "Name — Rs 1,800"
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

// ── Small UI helpers ─────────────────────────────────────────────────────────
function InfoRow({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#F0F4F8] last:border-0">
      <div className="w-8 h-8 rounded-lg bg-[#EBF4FB] flex items-center justify-center text-[#0071BD] shrink-0 mt-0.5">
        {icon}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-[#9CA3AF] font-medium">{label}</p>
        <p className="text-sm text-[#111111] font-medium mt-0.5">{value}</p>
      </div>
    </div>
  )
}

function Modal({ open, onClose, title, icon, children }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-[#E5EAF0] w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-[#F7F9FC] flex items-center justify-center text-[#374151]">
            {icon}
          </div>
          <h2 className="text-base font-bold text-[#111111]">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function BookingDetailPage() {
  const router = useRouter()
  const { id } = router.query
  const { companyId, companyTheme, isLoading: tenantLoading } = useTenant()
  const PRIMARY = companyTheme || "#0071BD"

  const [booking,  setBooking]  = useState(null)
  const [items,    setItems]    = useState([])
  const [history,  setHistory]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [userRole, setUserRole] = useState(null) // 'company_owner' | 'company_staff' | 'super_admin'

  // Price adjustment state
  const [discountInput, setDiscountInput] = useState("")
  const [reasonInput,   setReasonInput]   = useState("")
  const [adjusting,     setAdjusting]     = useState(false)
  const [adjustMsg,     setAdjustMsg]     = useState(null)

  // Status update state
  const [statusUpdating, setStatusUpdating] = useState(null)
  const [statusMsg,      setStatusMsg]      = useState(null)

  // ── Lost modal state ─────────────────────────────────────────────────────
  const [lostModalOpen,   setLostModalOpen]   = useState(false)
  const [lostReasonSelect, setLostReasonSelect] = useState("")
  const [lostSubmitting,  setLostSubmitting]   = useState(false)
  const [lostError,       setLostError]        = useState("")

  // ── Cancel modal state ────────────────────────────────────────────────────
  const [cancelModalOpen,    setCancelModalOpen]    = useState(false)
  const [cancelledByValue,   setCancelledByValue]   = useState("customer")
  const [cancelReasonText,   setCancelReasonText]   = useState("")
  const [cancelSubmitting,   setCancelSubmitting]   = useState(false)
  const [cancelError,        setCancelError]        = useState("")

  // ── Invoice state ─────────────────────────────────────────────────────────
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceMsg,     setInvoiceMsg]     = useState(null) // { type, text }

  // ── Data loading ──────────────────────────────────────────────────────────
  async function loadBooking() {
    if (!id || !companyId) return
    setLoading(true)

    const [bookingRes, itemsRes, historyRes, profileRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("*")
        .eq("id", id)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("booking_items")
        .select("service_name, service_unit, quantity, unit_price, subtotal, variant")
        .eq("booking_id", id)
        .order("service_name"),
      supabase
        .from("booking_status_history")
        .select("from_status, to_status, notes, created_at, changed_by")
        .eq("booking_id", id)
        .order("created_at", { ascending: false }),
      supabase.auth.getUser(),
    ])

    // Fetch role separately after we have the user id
    let role = null
    const userId = profileRes.data?.user?.id
    if (userId) {
      const { data: prof } = await supabase
        .from("users")
        .select("role")
        .eq("id", userId)
        .maybeSingle()
      role = prof?.role || null
    }
    setUserRole(role)

    if (bookingRes.error || !bookingRes.data) {
      setError("Booking not found or you don't have access.")
    } else {
      setError(null)
      setBooking(bookingRes.data)
      setDiscountInput(String(bookingRes.data.discount_amount || ""))
      setReasonInput(bookingRes.data.adjustment_reason || "")
    }
    setItems(itemsRes.data || [])
    setHistory(historyRes.data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!tenantLoading && id && companyId) loadBooking()
  }, [id, companyId, tenantLoading])

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleAdjustPrice(e) {
    e.preventDefault()
    setAdjusting(true)
    setAdjustMsg(null)
    const res = await fetch("/api/booking/adjust-price", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId:        id,
        discountAmount:   Number(discountInput) || 0,
        adjustmentReason: reasonInput,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setAdjustMsg({ type: "error", text: json.error || "Failed to update price." })
    } else {
      setAdjustMsg({ type: "success", text: "Price updated successfully." })
      await loadBooking()
    }
    setAdjusting(false)
  }

  // Generic status update (for forward transitions that need no modal)
  async function handleStatusUpdate(toStatus) {
    setStatusUpdating(toStatus)
    setStatusMsg(null)
    const res = await fetch("/api/booking/update-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: id, newStatus: toStatus }),
    })
    const json = await res.json()
    if (!res.ok) {
      setStatusMsg({ type: "error", text: json.error || "Failed to update status." })
    } else {
      setStatusMsg({ type: "success", text: `Booking is now ${json.status}.` })
      await loadBooking()
    }
    setStatusUpdating(null)
  }

  // "Mark as Lost" modal submission
  async function handleLostSubmit(e) {
    e.preventDefault()
    if (!lostReasonSelect) { setLostError("Please select a lost reason."); return }
    setLostSubmitting(true)
    setLostError("")
    const res = await fetch("/api/booking/update-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId: id, newStatus: "lost", lostReason: lostReasonSelect }),
    })
    const json = await res.json()
    if (!res.ok) {
      setLostError(json.error || "Failed to mark booking as lost.")
      setLostSubmitting(false)
    } else {
      setLostModalOpen(false)
      setLostReasonSelect("")
      setStatusMsg({ type: "success", text: "Booking marked as lost." })
      await loadBooking()
      setLostSubmitting(false)
    }
  }

  // "Cancel Booking" modal submission
  async function handleCancelSubmit(e) {
    e.preventDefault()
    if (!cancelReasonText.trim()) { setCancelError("Please enter a cancellation reason."); return }
    setCancelSubmitting(true)
    setCancelError("")
    const res = await fetch("/api/booking/update-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bookingId:          id,
        newStatus:          "cancelled",
        cancelledBy:        cancelledByValue,
        cancellationReason: cancelReasonText,
      }),
    })
    const json = await res.json()
    if (!res.ok) {
      setCancelError(json.error || "Failed to cancel booking.")
      setCancelSubmitting(false)
    } else {
      setCancelModalOpen(false)
      setCancelReasonText("")
      setCancelledByValue("customer")
      setStatusMsg({ type: "success", text: "Booking cancelled." })
      await loadBooking()
      setCancelSubmitting(false)
    }
  }

  // Generate & download PDF invoice
  async function handleGenerateInvoice() {
    setInvoiceLoading(true)
    setInvoiceMsg(null)
    try {
      const res = await fetch("/api/booking/generate-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: id }),
      })
      if (!res.ok) {
        const json = await res.json()
        setInvoiceMsg({ type: "error", text: json.error || "Failed to generate invoice." })
        return
      }
      // Trigger browser download of the returned PDF blob
      const blob     = await res.blob()
      const url      = URL.createObjectURL(blob)
      const filename = res.headers.get("Content-Disposition")
        ?.match(/filename="?([^"]+)"?/)?.[1] || "invoice.pdf"
      const a = document.createElement("a")
      a.href     = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setInvoiceMsg({ type: "success", text: "Invoice downloaded successfully." })
    } catch {
      setInvoiceMsg({ type: "error", text: "Network error — please try again." })
    } finally {
      setInvoiceLoading(false)
    }
  }

  // Button click dispatcher — intercepts modal-requiring actions
  function handleTransitionClick(t) {
    setStatusMsg(null)
    if (t.to === "lost") {
      setLostError("")
      setLostReasonSelect("")
      setLostModalOpen(true)
      return
    }
    if (t.to === "cancelled") {
      setCancelError("")
      setCancelReasonText("")
      setCancelledByValue("customer")
      setCancelModalOpen(true)
      return
    }
    handleStatusUpdate(t.to)
  }

  // ── Derived state ──────────────────────────────────────────────────────────
  const isTerminal      = booking && ["completed", "cancelled", "lost"].includes(booking.status)
  const isOwner         = userRole === "company_owner"
  const allTransitions  = booking ? (TRANSITIONS[booking.status] || []) : []
  // Staff sees forward transitions only; owner sees all
  const visibleTransitions = allTransitions.filter(t => !t.ownerOnly || isOwner)
  const priceStatusInfo = booking
    ? (PRICE_STATUS_LABEL[booking.price_status] || PRICE_STATUS_LABEL.estimated)
    : null
  // Use structured booking_items if available; fall back to parsing the summary string
  const displayItems = items.length > 0
    ? items
    : parseServiceSummary(booking?.special_instructions)

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      {/* ── Lost Modal ───────────────────────────────────────────────────── */}
      <Modal
        open={lostModalOpen}
        onClose={() => !lostSubmitting && setLostModalOpen(false)}
        title="Mark Booking as Lost"
        icon={<AlertTriangle size={18} className="text-amber-500" />}
      >
        <form onSubmit={handleLostSubmit} className="space-y-4">
          <p className="text-sm text-[#6B7280]">
            Once marked as lost, this booking cannot be reactivated. Please select a reason.
          </p>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-2 uppercase tracking-wide">
              Lost Reason *
            </label>
            <div className="space-y-2">
              {LOST_REASON_OPTIONS.map((opt) => (
                <label
                  key={opt}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors",
                    lostReasonSelect === opt
                      ? "border-amber-400 bg-amber-50"
                      : "border-[#E5EAF0] hover:border-[#D1DDE8] hover:bg-[#F7F9FC]"
                  )}
                >
                  <input
                    type="radio"
                    name="lostReason"
                    value={opt}
                    checked={lostReasonSelect === opt}
                    onChange={() => setLostReasonSelect(opt)}
                    className="accent-amber-500"
                  />
                  <span className="text-sm text-[#374151]">{opt}</span>
                </label>
              ))}
            </div>
          </div>

          {lostError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {lostError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={lostSubmitting}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-60"
            >
              {lostSubmitting && <Loader2 size={14} className="animate-spin" />}
              Confirm — Mark as Lost
            </button>
            <button
              type="button"
              onClick={() => setLostModalOpen(false)}
              disabled={lostSubmitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[#E5EAF0] text-[#6B7280] hover:bg-[#F7F9FC] transition-colors disabled:opacity-60"
            >
              Cancel
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Cancel Modal ─────────────────────────────────────────────────── */}
      <Modal
        open={cancelModalOpen}
        onClose={() => !cancelSubmitting && setCancelModalOpen(false)}
        title="Cancel Booking"
        icon={<Ban size={18} className="text-red-500" />}
      >
        <form onSubmit={handleCancelSubmit} className="space-y-4">
          <p className="text-sm text-[#6B7280]">
            This action is final. Please specify who is cancelling and why.
          </p>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-2 uppercase tracking-wide">
              Cancelled By *
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "customer", label: "Customer" },
                { value: "company",  label: "Company"  },
              ].map(({ value, label }) => (
                <label
                  key={value}
                  className={cn(
                    "flex items-center justify-center gap-2 p-3 rounded-xl border cursor-pointer text-sm font-medium transition-colors",
                    cancelledByValue === value
                      ? "border-red-400 bg-red-50 text-red-700"
                      : "border-[#E5EAF0] text-[#6B7280] hover:border-[#D1DDE8] hover:bg-[#F7F9FC]"
                  )}
                >
                  <input
                    type="radio"
                    name="cancelledBy"
                    value={value}
                    checked={cancelledByValue === value}
                    onChange={() => setCancelledByValue(value)}
                    className="sr-only"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#374151] mb-1.5 uppercase tracking-wide">
              Cancellation Reason *
            </label>
            <textarea
              value={cancelReasonText}
              onChange={(e) => setCancelReasonText(e.target.value)}
              rows={3}
              placeholder="Describe why this booking is being cancelled…"
              className="w-full rounded-xl border border-[#D1DDE8] text-sm px-3 py-2.5 text-[#111111] placeholder-[#9CA3AF] focus:outline-none focus:ring-2 focus:ring-red-200 resize-none"
            />
          </div>

          {cancelError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {cancelError}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={cancelSubmitting}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-60"
            >
              {cancelSubmitting && <Loader2 size={14} className="animate-spin" />}
              Confirm Cancellation
            </button>
            <button
              type="button"
              onClick={() => setCancelModalOpen(false)}
              disabled={cancelSubmitting}
              className="px-4 py-2.5 rounded-xl text-sm font-medium border border-[#E5EAF0] text-[#6B7280] hover:bg-[#F7F9FC] transition-colors disabled:opacity-60"
            >
              Go Back
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Back link ─────────────────────────────────────────────────────── */}
      <div className="mb-5">
        <Link href="/dashboard/bookings">
          <span className="inline-flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#111111] transition-colors">
            <ArrowLeft size={15} />
            Back to Bookings
          </span>
        </Link>
      </div>

      {loading && <p className="text-[#6B7280] text-sm">Loading booking…</p>}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">{error}</div>
      )}

      {!loading && !error && booking && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column ──────────────────────────────────────────────── */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* Booking header */}
            <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-[#9CA3AF] font-medium uppercase tracking-wider mb-1">Booking ID</p>
                  <p className="font-mono text-xs text-[#374151]">{booking.id}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {priceStatusInfo && (
                    <span
                      className={cn(
                        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border",
                        priceStatusInfo.cls
                      )}
                    >
                      Price: {priceStatusInfo.label}
                    </span>
                  )}
                  <StatusBadge status={booking.status} />
                </div>
              </div>

              {/* Customer & booking info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
                <InfoRow icon={<User size={14} />}     label="Customer Name"        value={booking.customer_name} />
                <InfoRow icon={<Tag size={14} />}      label="Phone"                value={booking.customer_phone} />
                <InfoRow icon={<Tag size={14} />}      label="Email"                value={booking.customer_email} />
                <InfoRow icon={<Tag size={14} />}      label="WhatsApp"             value={booking.customer_whatsapp} />
                <InfoRow icon={<MapPin size={14} />}   label="Address"              value={booking.property_address} />
                <InfoRow icon={<MapPin size={14} />}   label="City"                 value={booking.property_city} />
                <InfoRow icon={<MapPin size={14} />}   label="Property Type"        value={booking.property_type} />
                <InfoRow icon={<Calendar size={14} />} label="Booking Date"         value={formatDate(booking.booking_date)} />
                <InfoRow icon={<Clock size={14} />}    label="Booking Time"         value={booking.booking_time} />
                {/* Special instructions are stored inside the service summary string;
                    services are displayed in the "Selected Services" card below. */}
              </div>

              {/* Lost reason banner */}
              {booking.status === "lost" && booking.lost_reason && (
                <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-0.5">Lost Reason</p>
                    <p className="text-sm text-amber-800">{booking.lost_reason}</p>
                    {booking.lost_at && (
                      <p className="text-[10px] text-amber-600 mt-1">
                        {formatDateTime(booking.lost_at)}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Cancellation reason banner */}
              {booking.status === "cancelled" && booking.cancellation_reason && (
                <div className="mt-4 flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-200">
                  <Ban size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-0.5">
                      Cancelled by {booking.cancelled_by === "customer" ? "Customer" : "Company"}
                    </p>
                    <p className="text-sm text-red-800">{booking.cancellation_reason}</p>
                    {booking.cancelled_at && (
                      <p className="text-[10px] text-red-500 mt-1">
                        {formatDateTime(booking.cancelled_at)}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Selected Services */}
            <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-[#E5EAF0]">
                <h2 className="font-semibold text-[#111111]">Selected Services</h2>
              </div>
              {displayItems.length === 0 ? (
                <p className="text-sm text-[#9CA3AF] p-5">No services recorded for this booking.</p>
              ) : (
                <div>
                  <div className="divide-y divide-[#F0F4F8]">
                    {displayItems.map((it, i) => {
                      const qtyLabel = it.quantity
                        ? `${it.quantity}${it.service_unit ? ' ' + it.service_unit : ''}`
                        : null
                      const variantLabel = it.variant || null
                      const qtyVariant = [qtyLabel, variantLabel].filter(Boolean).join(' · ')
                      const price = Number(it.subtotal ?? it.unit_price ?? 0)
                      return (
                        <div key={i} className="px-5 py-3 flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-medium text-[#111111]">
                              • {it.service_name}
                            </p>
                            {qtyVariant && (
                              <p className="text-xs text-[#6B7280] mt-0.5 pl-3">
                                Qty/Variant: {qtyVariant}
                              </p>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-[#0071BD] shrink-0">
                            {booking.currency || 'Rs'} {price.toLocaleString()}
                          </p>
                        </div>
                      )
                    })}
                  </div>
                  {/* Total estimate row */}
                  <div className="px-5 py-3 border-t border-[#E5EAF0] bg-[#F7F9FC] flex justify-between items-center">
                    <span className="text-sm font-semibold text-[#374151]">Total Estimate</span>
                    <span className="text-sm font-bold text-[#0071BD]">
                      {booking.currency || 'Rs'}{' '}
                      {Number(booking.estimated_price ?? booking.subtotal ?? 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Price Adjustment — visible only to company_owner */}
            {isOwner && (
              <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[#E5EAF0]">
                  <h2 className="font-semibold text-[#111111]">Price Adjustment</h2>
                  <p className="text-xs text-[#6B7280] mt-0.5">
                    Adjust the final price without changing the original estimate.
                  </p>
                </div>
                <div className="p-5">
                  {/* Price summary */}
                  <div className="bg-[#F7F9FC] rounded-xl p-4 mb-5 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Estimated Price</span>
                      <span className="font-medium text-[#111111]">
                        {booking.currency} {Number(booking.estimated_price ?? booking.subtotal ?? 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#6B7280]">Discount / Adjustment</span>
                      <span className="font-medium text-green-600">
                        − {booking.currency} {Number(booking.discount_amount || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="border-t border-[#E5EAF0] pt-2 flex justify-between">
                      <span className="font-semibold text-[#111111]">Final Price</span>
                      <span className="font-bold text-[#0071BD] text-base">
                        {booking.currency} {Number(booking.final_price ?? booking.total_amount ?? 0).toLocaleString()}
                      </span>
                    </div>
                    {booking.adjustment_reason && (
                      <div className="border-t border-[#E5EAF0] pt-2 text-xs text-[#6B7280]">
                        Reason: {booking.adjustment_reason}
                      </div>
                    )}
                  </div>

                  {/* Adjustment form */}
                  {!isTerminal ? (
                    <form onSubmit={handleAdjustPrice} className="space-y-4">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-[#374151] mb-1.5">
                            Discount Amount ({booking.currency})
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            max={booking.estimated_price}
                            value={discountInput}
                            onChange={(e) => setDiscountInput(e.target.value)}
                            placeholder="e.g. 1500"
                            className="w-full rounded-lg border border-[#D1DDE8] text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] text-[#111111]"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-[#374151] mb-1.5">
                            Live Final Price
                          </label>
                          <div className="w-full rounded-lg border border-[#E5EAF0] bg-[#F7F9FC] text-sm px-3 py-2.5 font-semibold text-[#0071BD]">
                            {booking.currency}{" "}
                            {Math.max(
                              0,
                              Number(booking.estimated_price ?? booking.subtotal ?? 0) - (Number(discountInput) || 0)
                            ).toLocaleString()}
                          </div>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[#374151] mb-1.5">
                          Adjustment Reason
                        </label>
                        <input
                          type="text"
                          value={reasonInput}
                          onChange={(e) => setReasonInput(e.target.value)}
                          placeholder="e.g. Customer Negotiation, Loyalty Discount…"
                          className="w-full rounded-lg border border-[#D1DDE8] text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] text-[#111111]"
                        />
                      </div>

                      {adjustMsg && (
                        <div
                          className={cn(
                            "text-sm rounded-lg px-3 py-2",
                            adjustMsg.type === "error"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-green-50 text-green-700 border border-green-200"
                          )}
                        >
                          {adjustMsg.text}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={adjusting}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-60"
                        style={{ background: PRIMARY }}
                      >
                        {adjusting && <Loader2 size={14} className="animate-spin" />}
                        Apply Price Adjustment
                      </button>
                    </form>
                  ) : (
                    <p className="text-sm text-[#9CA3AF] italic">
                      Price adjustments are locked for {booking.status} bookings.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Right column ─────────────────────────────────────────────── */}
          <div className="flex flex-col gap-6">

            {/* Status Actions */}
            <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm p-5">
              <h2 className="font-semibold text-[#111111] mb-1">Update Status</h2>
              <p className="text-xs text-[#6B7280] mb-4">
                Current: <StatusBadge status={booking.status} />
              </p>

              {statusMsg && (
                <div
                  className={cn(
                    "text-sm rounded-lg px-3 py-2 mb-3",
                    statusMsg.type === "error"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-green-50 text-green-700 border border-green-200"
                  )}
                >
                  {statusMsg.text}
                </div>
              )}

              {visibleTransitions.length > 0 ? (
                <div className="flex flex-col gap-2">
                  {visibleTransitions.map((t) => (
                    <button
                      key={t.to}
                      disabled={!!statusUpdating || lostSubmitting || cancelSubmitting}
                      onClick={() => handleTransitionClick(t)}
                      className={cn(
                        "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors disabled:opacity-60",
                        BUTTON_COLORS[t.color]
                      )}
                    >
                      {statusUpdating === t.to ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : t.color === "teal" ? (
                        <CheckCircle size={14} />
                      ) : t.color === "red" ? (
                        <XCircle size={14} />
                      ) : t.color === "gray" ? (
                        <AlertTriangle size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-[#9CA3AF] italic">
                  <AlertCircle size={14} />
                  This booking has reached a terminal state.
                </div>
              )}

              {/* Staff notice */}
              {userRole === "company_staff" && !isTerminal && (
                <p className="text-[10px] text-[#9CA3AF] mt-3 leading-relaxed">
                  Cancel and Lost actions are restricted to the company owner.
                </p>
              )}
            </div>

            {/* Generate Invoice — company_owner only */}
            {isOwner && (
              <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm p-5">
                <h2 className="font-semibold text-[#111111] mb-1">Invoice</h2>
                <p className="text-xs text-[#6B7280] mb-4">
                  Generate a professional PDF invoice for this booking.
                </p>

                {invoiceMsg && (
                  <div
                    className={cn(
                      "text-sm rounded-lg px-3 py-2 mb-3",
                      invoiceMsg.type === "error"
                        ? "bg-red-50 text-red-700 border border-red-200"
                        : "bg-green-50 text-green-700 border border-green-200"
                    )}
                  >
                    {invoiceMsg.text}
                  </div>
                )}

                <button
                  onClick={handleGenerateInvoice}
                  disabled={invoiceLoading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-[#0071BD] hover:bg-[#005fa3] text-white transition-colors disabled:opacity-60"
                >
                  {invoiceLoading
                    ? <><Loader2 size={14} className="animate-spin" />Generating…</>
                    : <><Download size={14} />Download Invoice PDF</>
                  }
                </button>
              </div>
            )}

            {/* Internal Notes */}
            {booking.notes && (
              <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm p-5">
                <h2 className="font-semibold text-[#111111] mb-2">Internal Notes</h2>
                <p className="text-sm text-[#374151] whitespace-pre-wrap">{booking.notes}</p>
              </div>
            )}

            {/* Status History Timeline */}
            <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm p-5">
              <h2 className="font-semibold text-[#111111] mb-4">Status History</h2>
              {history.length === 0 ? (
                <p className="text-xs text-[#9CA3AF]">No history yet.</p>
              ) : (
                <div className="relative pl-4">
                  <div className="absolute left-1.5 top-0 bottom-0 w-px bg-[#E5EAF0]" />
                  {history.map((h, i) => {
                    // Determine dot color by destination status
                    const dotColor =
                      h.to_status === "completed"  ? "#16A34A" :
                      h.to_status === "cancelled"  ? "#DC2626" :
                      h.to_status === "lost"       ? "#D97706" :
                      h.to_status === "in_progress"? "#2563EB" :
                      h.to_status === "confirmed"  ? "#0D9488" :
                                                     "#0071BD"

                    return (
                      <div key={i} className="relative mb-5 last:mb-0">
                        <div
                          className="absolute -left-[11px] w-3 h-3 rounded-full border-2 border-white"
                          style={{ background: dotColor }}
                        />
                        <div>
                          {/* Status transition */}
                          <div className="flex items-center gap-2 flex-wrap">
                            {h.from_status ? (
                              <>
                                <StatusBadge status={h.from_status} />
                                <ChevronRight size={12} className="text-[#9CA3AF]" />
                                <StatusBadge status={h.to_status} />
                              </>
                            ) : (
                              <>
                                <span className="text-xs text-[#6B7280]">Created as</span>
                                <StatusBadge status={h.to_status} />
                              </>
                            )}
                          </div>

                          {/* Reason / notes */}
                          {h.notes && (
                            <p className="text-xs text-[#374151] mt-1.5 bg-[#F7F9FC] rounded-lg px-2.5 py-1.5 border border-[#E5EAF0]">
                              {h.notes}
                            </p>
                          )}

                          {/* Timestamp */}
                          <p className="text-[10px] text-[#9CA3AF] mt-1.5">
                            {formatDateTime(h.created_at)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
