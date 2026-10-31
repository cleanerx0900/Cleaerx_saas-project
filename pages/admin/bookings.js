import { useEffect, useState, useMemo } from "react";
import AdminLayout, { NAVY, GOLD, searchMatches } from "../../components/AdminLayout";
import supabase from "../../lib/supabaseClient";
import { StatusBadge, ModalWrap, EmptyState } from "../../components/ui/AdminKit";
import { Btn, Inp } from "../../components/ui/AuthKit";
import { Search, Eye, Pencil, Trash2, User, Phone, Calendar } from "lucide-react";
import { formatDate } from "../../lib/dateUtils";

const STATUSES = [
  { value: "pending",     label: "Pending",     bg: "#FEF9C3", color: "#854D0E" },
  { value: "confirmed",   label: "Confirmed",   bg: "#DCFCE7", color: "#166534" },
  { value: "in_progress", label: "In Progress", bg: "#DBEAFE", color: "#1E40AF" },
  { value: "completed",   label: "Completed",   bg: "#F0FDF4", color: "#15803D" },
  { value: "cancelled",   label: "Cancelled",   bg: "#FEE2E2", color: "#991B1B" },
];

function statusMeta(status) {
  return STATUSES.find((s) => s.value === status) || { label: status, bg: "#F3F4F6", color: "#374151" };
}

function fmtPrice(val, currency = "PKR") {
  if (val == null || val === "") return "—";
  const n = Number(val);
  if (isNaN(n)) return "—";
  return `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortId(id) {
  return id ? `#${String(id).slice(0, 8).toUpperCase()}` : "—";
}

const emptyEdit = {
  customer_name: "",
  customer_phone: "",
  customer_email: "",
  service: "",
  booking_date: "",
  status: "pending",
  notes: "",
};

export default function AdminBookings() {
  const [companyId, setCompanyId]   = useState(undefined); // undefined = resolving; null = no company linked
  const [bookings, setBookings]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  // Filters
  const [search, setSearch]           = useState("");
  const [filterStatus, setFilterStatus] = useState("all");

  // View modal
  const [viewBooking, setViewBooking] = useState(null);

  // Edit modal
  const [editingId, setEditingId]   = useState(null);
  const [editForm, setEditForm]     = useState(emptyEdit);
  const [saving, setSaving]         = useState(false);

  // ── Resolve company_id from session ──────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCompanyId(null);
        setLoading(false);
        return;
      }
      const { data: profile } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      setCompanyId(profile?.company_id ?? null);
    }
    init();
  }, []);

  // ── Fetch once company_id resolves ────────────────────────────
  useEffect(() => {
    if (companyId === undefined) return;
    fetchBookings();
  }, [companyId]);

  async function fetchBookings() {
    setLoading(true);
    if (!companyId) {
      setBookings([]);
      setLoading(false);
      return;
    }
    const { data, error: err } = await supabase
      .from("bookings")
      .select("id, company_id, customer_name, customer_phone, customer_email, service, booking_date, status, total_price, notes, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setBookings(data || []);
      setError("");
    }
    setLoading(false);
  }

  // ── Filtered list ─────────────────────────────────────────────
  const filtered = useMemo(() => {
    return bookings.filter((b) => {
      const matchSearch = searchMatches(search, [
        b.customer_name,
        b.customer_phone,
        b.customer_email,
        b.service,
        shortId(b.id),
      ]);
      const matchStatus =
        filterStatus === "all" || b.status === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [bookings, search, filterStatus]);

  // ── Edit helpers ──────────────────────────────────────────────
  function openEdit(b) {
    setEditingId(b.id);
    setEditForm({
      customer_name:  b.customer_name  || "",
      customer_phone: b.customer_phone || "",
      customer_email: b.customer_email || "",
      service:        b.service        || "",
      booking_date:   b.booking_date   || "",
      status:         b.status         || "pending",
      notes:          b.notes          || "",
    });
    setError("");
  }

  function closeEdit() {
    setEditingId(null);
    setEditForm(emptyEdit);
    setError("");
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!editForm.customer_name.trim()) { setError("Customer name is required."); return; }
    if (!companyId) { setError("No company linked to your account."); return; }

    setSaving(true);
    setError("");

    const payload = {
      customer_name:  editForm.customer_name.trim(),
      customer_phone: editForm.customer_phone.trim() || null,
      customer_email: editForm.customer_email.trim() || null,
      service:        editForm.service.trim()        || null,
      booking_date:   editForm.booking_date          || null,
      status:         editForm.status,
      notes:          editForm.notes.trim()          || null,
    };

    const { error: err } = await supabase
      .from("bookings")
      .update(payload)
      .eq("id", editingId)
      .eq("company_id", companyId);

    if (err) {
      setError(err.message);
    } else {
      closeEdit();
      await fetchBookings();
    }
    setSaving(false);
  }

  // ── Delete ────────────────────────────────────────────────────
  async function handleDelete(b) {
    if (!confirm(`Delete booking ${shortId(b.id)} for "${b.customer_name || "this customer"}"?\n\nThis cannot be undone.`)) return;
    const { error: err } = await supabase
      .from("bookings")
      .delete()
      .eq("id", b.id)
      .eq("company_id", companyId);
    if (err) setError(err.message);
    else fetchBookings();
  }

  // ── Render ────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Bookings</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          {bookings.length} total booking{bookings.length !== 1 ? "s" : ""} across all companies
        </p>
      </div>

      {!companyId && !loading && (
        <div className="mb-4 p-4 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm">
          Your admin account is not linked to a company. Link a company to view bookings.
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* ── View Modal ─────────────────────────────────────────── */}
      <ModalWrap
        open={!!viewBooking}
        onClose={() => setViewBooking(null)}
        title={viewBooking ? `Booking ${shortId(viewBooking.id)}` : "Booking Details"}
        width="max-w-lg"
      >
        {viewBooking && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Customer", viewBooking.customer_name || "—"],
                ["Phone", viewBooking.customer_phone || "—"],
                ["Email", viewBooking.customer_email || "—"],
                ["Service", viewBooking.service || "—"],
                ["Date", formatDate(viewBooking.booking_date)],
                ["Total", fmtPrice(viewBooking.total_price)],
              ].map(([k, v]) => (
                <div key={k} className="bg-[#F7F9FC] rounded-xl p-3">
                  <p className="text-xs text-[#9CA3AF]">{k}</p>
                  <p className="text-sm font-semibold text-[#111111] mt-0.5">{v}</p>
                </div>
              ))}
              <div className="bg-[#F7F9FC] rounded-xl p-3">
                <p className="text-xs text-[#9CA3AF]">Status</p>
                <div className="mt-1">
                  <StatusBadge status={viewBooking.status} />
                </div>
              </div>
              <div className="bg-[#F7F9FC] rounded-xl p-3">
                <p className="text-xs text-[#9CA3AF]">Created</p>
                <p className="text-sm font-semibold text-[#111111] mt-0.5">{formatDate(viewBooking.created_at)}</p>
              </div>
            </div>
            {viewBooking.notes && (
              <div className="bg-[#F7F9FC] rounded-xl p-3">
                <p className="text-xs text-[#9CA3AF]">Notes</p>
                <p className="text-sm text-[#374151] mt-0.5">{viewBooking.notes}</p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <Btn
                variant="outline"
                onClick={() => { setViewBooking(null); openEdit(viewBooking); }}
              >
                <Pencil size={14} />Edit
              </Btn>
              <Btn variant="ghost" onClick={() => setViewBooking(null)}>Close</Btn>
            </div>
          </div>
        )}
      </ModalWrap>

      {/* ── Edit Modal ─────────────────────────────────────────── */}
      <ModalWrap
        open={!!editingId}
        onClose={closeEdit}
        title="Edit Booking"
        width="max-w-lg"
      >
        {editingId && (
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <Inp
              label="Customer Name *"
              placeholder="Customer name"
              icon={<User size={15} />}
              value={editForm.customer_name}
              onChange={(v) => setEditForm({ ...editForm, customer_name: v })}
              required
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Inp
                label="Phone"
                placeholder="Phone number"
                icon={<Phone size={15} />}
                value={editForm.customer_phone}
                onChange={(v) => setEditForm({ ...editForm, customer_phone: v })}
              />
              <Inp
                label="Email"
                type="email"
                placeholder="Email address"
                value={editForm.customer_email}
                onChange={(v) => setEditForm({ ...editForm, customer_email: v })}
              />
            </div>

            <Inp
              label="Service"
              placeholder="e.g. Sofa Cleaning"
              value={editForm.service}
              onChange={(v) => setEditForm({ ...editForm, service: v })}
            />

            <Inp
              label="Booking Date"
              type="date"
              icon={<Calendar size={15} />}
              value={editForm.booking_date}
              onChange={(v) => setEditForm({ ...editForm, booking_date: v })}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#374151]">Status</label>
              <select
                value={editForm.status}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                className="w-full rounded-lg border border-[#D1DDE8] bg-white text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#38B6FF]"
              >
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#374151]">Notes</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={3}
                placeholder="Optional notes…"
                className="w-full rounded-lg border border-[#D1DDE8] bg-white text-[#111111] placeholder-[#9CA3AF] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] resize-none"
              />
            </div>

            {error && (
              <p className="text-red-500 text-xs bg-red-50 p-2 rounded">{error}</p>
            )}

            <div className="flex justify-end gap-3 pt-1">
              <Btn variant="outline" type="button" onClick={closeEdit}>Cancel</Btn>
              <Btn type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Btn>
            </div>
          </form>
        )}
      </ModalWrap>

      {/* ── Bookings Table Card ────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="px-5 py-4 border-b border-[#E5EAF0] flex flex-wrap gap-3">
          <Inp
            placeholder="Search by name, phone, email or service…"
            value={search}
            onChange={(v) => setSearch(v)}
            icon={<Search size={15} />}
            className="flex-1 min-w-48"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-[#D1DDE8] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] bg-white"
          >
            <option value="all">All Statuses</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
          {(search || filterStatus !== "all") && (
            <Btn
              variant="ghost"
              size="sm"
              onClick={() => { setSearch(""); setFilterStatus("all"); }}
            >
              Clear
            </Btn>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-6 flex flex-col gap-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-10 w-full" style={{ animationDelay: `${i * 0.08}s` }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Calendar size={28} />}
              title={
                bookings.length === 0
                  ? companyId ? "No bookings yet" : "No company linked"
                  : "No bookings found"
              }
              desc={
                bookings.length === 0
                  ? companyId
                    ? "Bookings will appear here once customers schedule a service."
                    : "Link a company to your admin account to view bookings."
                  : "No bookings match your search or status filter."
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F7F9FC] border-b border-[#E5EAF0]">
                  {["ID", "Customer", "Service", "Date", "Total", "Status", ""].map((h) => (
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
                    onClick={() => setViewBooking(b)}
                  >
                    {/* ID */}
                    <td className="px-4 py-3 font-mono text-xs font-bold text-[#0071BD]">
                      {shortId(b.id)}
                    </td>

                    {/* Customer */}
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#111111]">
                        {b.customer_name || <span className="text-[#9CA3AF]">—</span>}
                      </p>
                      {b.customer_phone && (
                        <p className="text-xs text-[#9CA3AF]">{b.customer_phone}</p>
                      )}
                    </td>

                    {/* Service */}
                    <td className="px-4 py-3 text-[#374151] text-xs">
                      {b.service || <span className="text-[#9CA3AF]">—</span>}
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-[#374151] text-xs whitespace-nowrap">
                      {formatDate(b.booking_date)}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 font-semibold text-[#111111] whitespace-nowrap">
                      {fmtPrice(b.total_price)}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          onClick={() => setViewBooking(b)}
                          className="action-btn inline-flex min-w-9 min-h-9 items-center justify-center rounded-lg hover:bg-[#EBF4FB] text-[#0071BD] transition-colors"
                          title="View"
                          aria-label={`View booking ${shortId(b.id)}`}
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => openEdit(b)}
                          className="action-btn inline-flex min-w-9 min-h-9 items-center justify-center rounded-lg hover:bg-amber-50 text-amber-600 transition-colors"
                          title="Edit"
                          aria-label={`Edit booking ${shortId(b.id)}`}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(b)}
                          className="action-btn inline-flex min-w-9 min-h-9 items-center justify-center rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                          title="Delete"
                          aria-label={`Delete booking ${shortId(b.id)}`}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {!loading && bookings.length > 0 && (
        <p className="text-xs text-[#6B7280] mt-3">
          Showing {filtered.length} of {bookings.length} booking{bookings.length !== 1 ? "s" : ""}
        </p>
      )}
    </AdminLayout>
  );
}
