import { useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Clock, CheckCircle, BarChart3, ChevronRight } from "lucide-react";
import { initials, avatarColor } from "../../components/ui/AdminKit";
import AdminLayout from "../../components/AdminLayout";
import { StatCard, StatusBadge } from "../../components/ui/AdminKit";
import { Btn } from "../../components/ui/AuthKit";
import supabase from "../../lib/supabaseClient";
import { formatDate } from "../../lib/dateUtils";

export default function AdminDashboard() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setBookings(data || []);
      setError("");
    }
    setLoading(false);
  }

  const total = bookings.length;
  const pending = bookings.filter((b) => b.status === "pending").length;
  const confirmed = bookings.filter((b) => b.status === "confirmed").length;
  const completed = bookings.filter((b) => b.status === "completed").length;
  const recent = bookings.slice(0, 5);

  return (
    <AdminLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Dashboard</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Platform overview</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: "Total Bookings", value: total,     icon: <BookOpen size={20} />,   color: "#0071BD" },
          { label: "Pending",        value: pending,   icon: <Clock size={20} />,      color: "#EAB308" },
          { label: "Confirmed",      value: confirmed, icon: <CheckCircle size={20} />,color: "#22C55E" },
          { label: "Completed",      value: completed, icon: <BarChart3 size={20} />,  color: "#15803D" },
        ].map((card, i) => (
          <div key={card.label} className="anim-slide-up" style={{ animationDelay: `${0.05 + i * 0.08}s` }}>
            <StatCard {...card} loading={loading} />
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[#E5EAF0] flex items-center justify-between">
          <h2 className="font-semibold text-[#111111] text-base">Recent Bookings</h2>
          <Link href="/admin/bookings">
            <Btn variant="ghost" size="sm">View all <ChevronRight size={14} /></Btn>
          </Link>
        </div>
        {loading ? (
          <div className="p-6 flex flex-col gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-10 w-full" style={{ animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <p className="text-gray-500 text-sm p-6 anim-fade-in">No bookings yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F7F9FC] border-b border-[#E5EAF0]">
                  {["ID", "Customer", "Service", "Date", "Status"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-[#6B7280] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recent.map((b, i) => (
                  <tr key={b.id} className="border-b border-[#F0F4F8] hover:bg-[#F7F9FC] transition-colors anim-row-in" style={{ animationDelay: `${i * 0.05}s` }}>
                    <td className="px-5 py-3 font-mono text-xs font-bold text-[#0071BD] whitespace-nowrap">
                      {String(b.id).slice(0, 8)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: avatarColor(b.customer_name || "A") }}
                        >
                          {initials(b.customer_name || "?")}
                        </div>
                        <div>
                          <p className="font-medium text-[#111111] text-xs">{b.customer_name || "—"}</p>
                          <p className="text-[10px] text-[#9CA3AF]">{b.customer_phone || ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-[#374151] text-xs max-w-[160px] truncate">{b.service || "—"}</td>
                    <td className="px-5 py-3 text-[#6B7280] text-xs whitespace-nowrap">{formatDate(b.booking_date)}</td>
                    <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
