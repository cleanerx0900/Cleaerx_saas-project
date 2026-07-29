import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Search, ChevronRight, BookOpen } from "lucide-react"
import DashboardLayout from "../../../components/DashboardLayout"
import { useTenant } from "../../../contexts/TenantContext"
import { StatusBadge, EmptyState } from "../../../components/ui/AdminKit"
import { Inp } from "../../../components/ui/AuthKit"
import supabase from "../../../lib/supabaseClient"
import { formatDate } from "../../../lib/dateUtils"

const STATUS_OPTIONS = ["All", "Pending", "Confirmed", "In Progress", "Completed", "Lost", "Cancelled"]

export default function BookingsPage() {
  const { companyId, isLoading: tenantLoading } = useTenant()
  const [bookings, setBookings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState("")
  const [statusF, setStatusF] = useState("All")

  const loadBookings = useCallback(async () => {
    if (tenantLoading) return
    if (!companyId) { setBookings([]); setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, customer_name, customer_phone, property_address, booking_date, estimated_price, final_price, discount_amount, currency, status, price_status"
      )
      .eq("company_id", companyId)
      .order("created_at", { ascending: false })

    if (error) setError(error.message)
    else { setError(null); setBookings(data || []) }
    setLoading(false)
  }, [companyId, tenantLoading])

  // Initial load + realtime subscription
  useEffect(() => {
    if (tenantLoading || !companyId) return
    loadBookings()

    const channel = supabase
      .channel(`bookings-list-${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `company_id=eq.${companyId}`,
        },
        () => { loadBookings() }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [companyId, tenantLoading, loadBookings])

  const filtered = bookings.filter((b) => {
    const normalised = b.status?.replace("_", " ")
    const matchStatus =
      statusF === "All" ||
      normalised === statusF.toLowerCase() ||
      b.status === statusF.toLowerCase() ||
      b.status === statusF
    const matchSearch =
      !search ||
      (b.customer_name || "").toLowerCase().includes(search.toLowerCase()) ||
      (b.customer_phone || "").includes(search)
    return matchStatus && matchSearch
  })

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Bookings</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">All bookings for your company — click a row to view details</p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="px-5 py-4 border-b border-[#E5EAF0] flex flex-wrap gap-3">
          <Inp
            placeholder="Search by customer or phone..."
            value={search}
            onChange={setSearch}
            icon={<Search size={15} />}
            className="flex-1 min-w-48"
          />
          <select
            value={statusF}
            onChange={(e) => setStatusF(e.target.value)}
            className="rounded-lg border border-[#D1DDE8] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] bg-white text-[#111111]"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>

        {loading && (
          <div className="p-6 flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="skeleton h-12 w-full"
                style={{ animationDelay: `${i * 0.08}s` }}
              />
            ))}
          </div>
        )}
        {error && <p className="text-red-500 text-sm p-6">Could not load bookings: {error}</p>}

        {!loading && !error && (
          <div className="overflow-x-auto">
            {filtered.length === 0 ? (
              <EmptyState
                icon={<BookOpen size={28} />}
                title={bookings.length === 0 ? "No bookings yet" : "No bookings found"}
                desc={
                  bookings.length === 0
                    ? "New bookings for your company will appear here."
                    : "No bookings match your search or status filter."
                }
              />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F7F9FC] border-b border-[#E5EAF0]">
                    {["Customer", "Address", "Date", "Estimated", "Final", "Status", ""].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((b, i) => (
                    <tr
                      key={b.id}
                      className="border-b border-[#F0F4F8] hover:bg-[#F7F9FC] transition-colors cursor-pointer anim-row-in"
                      style={{ animationDelay: `${i * 0.04}s` }}
                    >
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#111111]">{b.customer_name}</p>
                        <p className="text-xs text-[#9CA3AF]">{b.customer_phone}</p>
                      </td>
                      <td className="px-4 py-3 text-xs text-[#374151] max-w-[160px] truncate">
                        {b.property_address || "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#374151]">{formatDate(b.booking_date)}</td>
                      <td className="px-4 py-3 text-xs text-[#374151]">
                        {b.currency} {Number(b.estimated_price ?? b.final_price ?? 0).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-xs font-semibold text-[#111111]">
                        {b.currency} {Number(b.final_price ?? 0).toLocaleString()}
                        {Number(b.discount_amount || 0) > 0 && (
                          <span className="ml-1 text-green-600 font-normal">
                            (−{Number(b.discount_amount).toLocaleString()})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={b.status} />
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/bookings/${b.id}`}>
                          <span className="inline-flex items-center gap-1 text-xs text-[#0071BD] hover:underline font-medium">
                            View <ChevronRight size={12} />
                          </span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {!loading && !error && (
          <div className="px-5 py-3 border-t border-[#E5EAF0] text-sm text-[#6B7280]">
            Showing {filtered.length} of {bookings.length} bookings
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
