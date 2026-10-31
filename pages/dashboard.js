import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/router"
import Link from "next/link"
import {
  BookOpen, Clock, TrendingUp, CreditCard, Copy, Check,
  ExternalLink, ChevronRight, CheckCircle, XCircle,
  AlertTriangle, Banknote, Tag, BarChart3,
} from "lucide-react"
import DashboardLayout from "../components/DashboardLayout"
import { useAuth } from "../contexts/AuthContext"
import { useTenant } from "../contexts/TenantContext"
import { StatCard, StatusBadge, initials, avatarColor } from "../components/ui/AdminKit"
import { Btn } from "../components/ui/AuthKit"
import supabase from "../lib/supabaseClient"
import { formatDate } from "../lib/dateUtils"

export default function Dashboard() {
  const router = useRouter()
  const { profile, user } = useAuth()
  const { companyId, companySlug, companyName, companyTheme } = useTenant()
  const [linkCopied, setLinkCopied] = useState(false)

  const PRIMARY = companyTheme || "#0071BD"

  const companyInitials = companyName
    ? companyName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()
    : "CX"

  // Greeting and date are computed client-side only to avoid hydration mismatch
  // (server and client can disagree on the current time/locale).
  const [greeting,   setGreeting]   = useState("")
  const [todayLabel, setTodayLabel] = useState("")
  useEffect(() => {
    const now  = new Date()
    const hour = now.getHours()
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening")
    setTodayLabel(formatDate(now))
  }, [])

  const bookingLink =
    companySlug && typeof window !== "undefined"
      ? `${window.location.origin}/company/${companySlug}/book`
      : companySlug
      ? `/company/${companySlug}/book`
      : null

  async function copyBookingLink() {
    if (!bookingLink) return
    try {
      await navigator.clipboard.writeText(bookingLink)
      setLinkCopied(true)
      setTimeout(() => setLinkCopied(false), 2000)
    } catch {}
  }

  useEffect(() => {
    if (user?.user_metadata?.must_change_password) {
      router.replace("/change-password")
    }
  }, [user, router])

  const [stats, setStats] = useState(null)
  const [recentBookings, setRecentBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [subscription, setSubscription] = useState(null)

  const loadStats = useCallback(async () => {
    if (!companyId) return

    const [allRes, recentRes, subRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, status, estimated_price, final_price, discount_amount, currency")
        .eq("company_id", companyId),
      supabase
        .from("bookings")
        .select("id, customer_name, customer_phone, booking_date, final_price, estimated_price, currency, status")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("company_subscriptions")
        .select("status, expires_at, subscription_plans(name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (subRes.data) {
      setSubscription(subRes.data)
    }

    const all = allRes.data || []
    const currency = all[0]?.currency || "PKR"

    const byStatus = (s) => all.filter((b) => b.status === s).length

    // Revenue: sum of estimated_price for ALL bookings
    const estimatedRevenue = all.reduce((sum, b) => sum + Number(b.estimated_price || b.final_price || 0), 0)
    // Final revenue: sum of final_price for confirmed + in_progress + completed
    const finalRevenue = all
      .filter((b) => ["confirmed", "in_progress", "completed"].includes(b.status))
      .reduce((sum, b) => sum + Number(b.final_price || 0), 0)
    // Total discount given
    const totalDiscount = all.reduce((sum, b) => sum + Number(b.discount_amount || 0), 0)

    setStats({
      total:          all.length,
      pending:        byStatus("pending"),
      confirmed:      byStatus("confirmed"),
      inProgress:     byStatus("in_progress"),
      completed:      byStatus("completed"),
      lost:           byStatus("lost"),
      cancelled:      byStatus("cancelled"),
      estimatedRevenue,
      finalRevenue,
      totalDiscount,
      currency,
    })
    setRecentBookings(recentRes.data || [])
    setLoading(false)
  }, [companyId])

  // Initial load + realtime subscription
  useEffect(() => {
    if (!companyId) return
    loadStats()

    const channel = supabase
      .channel(`dashboard-bookings-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `company_id=eq.${companyId}`,
        },
        () => { loadStats() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [companyId, loadStats])

  const fmt = (n) => (n == null ? "—" : Number(n).toLocaleString())

  // Subscription card derived values (computed before render)
  const subStatus = subscription?.status || null
  const subExpiresAt = subscription?.expires_at ? new Date(subscription.expires_at) : null
  const subPlanName = subscription?.subscription_plans?.name || null
  const subDaysRemaining = subExpiresAt
    ? Math.max(0, Math.ceil((subExpiresAt - Date.now()) / 86400000))
    : null
  const subExpiryLabel = subExpiresAt ? formatDate(subExpiresAt) : "Lifetime"
  const subStatusConfig = {
    active:    { label: "Active",    dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
    expired:   { label: "Expired",   dot: "bg-red-500",    text: "text-red-700",    bg: "bg-red-50",    border: "border-red-200"   },
    suspended: { label: "Suspended", dot: "bg-orange-500", text: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200" },
    cancelled: { label: "Cancelled", dot: "bg-gray-400",   text: "text-gray-600",   bg: "bg-gray-50",   border: "border-gray-200"  },
    renewed:   { label: "Active",    dot: "bg-green-500",  text: "text-green-700",  bg: "bg-green-50",  border: "border-green-200" },
  }
  const subCfg = subStatusConfig[subStatus] || subStatusConfig.active

  return (
    <DashboardLayout>
      {/* Greeting */}
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white font-bold text-lg shadow-sm shrink-0"
            style={{ background: PRIMARY }}
          >
            {companyInitials}
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#111111]">
              {greeting}, {companyName || "there"}
            </h1>
            <p className="text-sm text-[#6B7280] mt-0.5">{todayLabel}</p>
          </div>
        </div>

        {/* Subscription Status Card */}
        {subscription && (
          <div className={`rounded-xl border ${subCfg.border} ${subCfg.bg} px-4 py-3 flex flex-col gap-1`}>
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${subCfg.text}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${subCfg.dot}`} />
              Subscription: {subCfg.label}
            </span>
            <span className="text-sm font-bold text-[#111111]">
              {subDaysRemaining === null ? "∞ Days Left" : `${subDaysRemaining} Day${subDaysRemaining !== 1 ? "s" : ""} Left`}
            </span>
          </div>
        )}
      </div>

      {/* Booking link card */}
      <div
        className="rounded-2xl border shadow-sm p-5 mb-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        style={{
          background: "linear-gradient(135deg, #EBF4FB 0%, #F0F8FF 100%)",
          borderColor: PRIMARY + "33",
        }}
      >
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 mb-1">
            <ExternalLink size={15} style={{ color: PRIMARY }} />
            <p className="text-sm font-semibold" style={{ color: PRIMARY }}>
              Your Public Booking Link
            </p>
          </div>
          <p className="text-sm text-[#374151] font-mono truncate overflow-hidden">
            {bookingLink || "Loading…"}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Btn variant="secondary" size="sm" onClick={copyBookingLink}>
            {linkCopied ? <Check size={14} /> : <Copy size={14} />}
            {linkCopied ? "Copied!" : "Copy Link"}
          </Btn>
          {bookingLink && (
            <a href={bookingLink} target="_blank" rel="noopener noreferrer">
              <Btn size="sm">
                <ExternalLink size={14} />Preview
              </Btn>
            </a>
          )}
        </div>
      </div>

      {/* ── Booking status cards ───────────────────────────── */}
      <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3 anim-fade-in">Booking Summary</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[
          { label: "Total Bookings", value: fmt(stats?.total), icon: <BookOpen size={18} />, color: PRIMARY },
          { label: "Pending",        value: fmt(stats?.pending),    icon: <Clock size={18} />,         color: "#EAB308" },
          { label: "Confirmed",      value: fmt(stats?.confirmed),  icon: <CheckCircle size={18} />,   color: "#22C55E" },
          { label: "Completed",      value: fmt(stats?.completed),  icon: <TrendingUp size={18} />,    color: "#0D9488" },
          { label: "Lost",           value: fmt(stats?.lost),       icon: <AlertTriangle size={18} />, color: "#6B7280" },
          { label: "Cancelled",      value: fmt(stats?.cancelled),  icon: <XCircle size={18} />,       color: "#EF4444" },
        ].map((card, i) => (
          <div key={card.label} className="anim-slide-up" style={{ animationDelay: `${0.05 + i * 0.06}s` }}>
            <StatCard {...card} loading={loading} />
          </div>
        ))}
      </div>

      {/* ── Revenue cards ─────────────────────────────────── */}
      <p className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wider mb-3 anim-fade-in" style={{ animationDelay: "0.42s" }}>Revenue Summary</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: `Estimated Revenue (${stats?.currency || "PKR"})`, value: fmt(stats?.estimatedRevenue), icon: <BarChart3 size={18} />, color: "#38B6FF" },
          { label: `Final Revenue (${stats?.currency || "PKR"})`,     value: fmt(stats?.finalRevenue),     icon: <Banknote size={18} />,  color: "#22C55E" },
          { label: `Total Discount Given (${stats?.currency || "PKR"})`, value: fmt(stats?.totalDiscount), icon: <Tag size={18} />,       color: "#F59E0B" },
        ].map((card, i) => (
          <div key={card.label} className="anim-slide-up" style={{ animationDelay: `${0.46 + i * 0.07}s` }}>
            <StatCard {...card} loading={loading} />
          </div>
        ))}
      </div>

      {/* Recent bookings */}
      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5EAF0] flex items-center justify-between">
          <h2 className="font-semibold text-[#111111] text-base">Recent Bookings</h2>
          <Link href="/dashboard/bookings">
            <Btn variant="ghost" size="sm">
              View all <ChevronRight size={14} />
            </Btn>
          </Link>
        </div>

        {loading ? (
          <div className="p-6 flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : recentBookings.length === 0 ? (
          <p className="text-[#6B7280] text-sm p-6 anim-fade-in">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F7F9FC] border-b border-[#E5EAF0]">
                  {["Customer", "Date", "Estimated", "Final", "Status"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((b, i) => (
                  <tr
                    key={b.id}
                    className="border-b border-[#F0F4F8] hover:bg-[#F7F9FC] transition-colors cursor-pointer anim-row-in"
                    style={{ animationDelay: `${i * 0.05}s` }}
                    onClick={() => router.push(`/dashboard/bookings/${b.id}`)}
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: avatarColor(b.customer_name || "A") }}
                        >
                          {initials(b.customer_name || "")}
                        </div>
                        <div>
                          <p className="font-medium text-[#111111] text-xs">{b.customer_name}</p>
                          <p className="text-[10px] text-[#9CA3AF]">{b.customer_phone}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[#374151] text-xs">{formatDate(b.booking_date)}</td>
                    <td className="px-5 py-3 text-[#374151] text-xs">
                      {b.currency} {Number(b.estimated_price ?? b.final_price ?? 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 font-semibold text-[#111111] text-xs">
                      {b.currency} {Number(b.final_price ?? 0).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
