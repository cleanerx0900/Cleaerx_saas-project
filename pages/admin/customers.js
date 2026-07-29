import { useEffect, useMemo, useState } from "react";
import AdminLayout, { NAVY, GOLD, searchMatches } from "../../components/AdminLayout";
import supabase from "../../lib/supabaseClient";
import { StatusBadge, EmptyState, ModalWrap, initials, avatarColor } from "../../components/ui/AdminKit";
import { Btn, Inp } from "../../components/ui/AuthKit";
import { Search, Pencil, Trash2, User, Phone, Mail, ChevronLeft, ChevronRight } from "lucide-react";

const ACTIVE_STATUSES = new Set(["pending", "confirmed", "in_progress"]);

function deriveCustomers(bookings) {
  const map = new Map();
  bookings.forEach((b) => {
    const key = b.customer_phone || b.customer_email || b.customer_name || b.id;
    if (!map.has(key)) {
      map.set(key, {
        key,
        name: b.customer_name || "",
        phone: b.customer_phone || "",
        email: b.customer_email || "",
        bookings: [],
      });
    }
    map.get(key).bookings.push(b);
  });

  return Array.from(map.values()).map((c) => ({
    ...c,
    isActive: c.bookings.some((b) => ACTIVE_STATUSES.has(b.status)),
  }));
}

const emptyEdit = { name: "", phone: "", email: "" };

export default function AdminCustomers() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all"); // all | active | inactive

  // Edit
  const [editCustomer, setEditCustomer] = useState(null);
  const [editForm, setEditForm] = useState(emptyEdit);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchBookings();
  }, []);

  async function fetchBookings() {
    setLoading(true);
    const { data, error } = await supabase
      .from("bookings")
      .select("id, customer_name, customer_phone, customer_email, booking_date, status, company_id")
      .order("created_at", { ascending: false });
    if (error) {
      setError(error.message);
    } else {
      setBookings(data || []);
      setError("");
    }
    setLoading(false);
  }

  const customers = useMemo(() => deriveCustomers(bookings), [bookings]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const matchSearch = searchMatches(search, [c.name, c.phone, c.email]);
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" ? c.isActive : !c.isActive);
      return matchSearch && matchStatus;
    });
  }, [customers, search, filterStatus]);

  // ── Edit ──────────────────────────────────────────────────

  function openEdit(customer) {
    setEditCustomer(customer);
    setEditForm({ name: customer.name, phone: customer.phone, email: customer.email });
    setError("");
  }

  function closeEdit() {
    setEditCustomer(null);
    setEditForm(emptyEdit);
    setError("");
  }

  async function handleEditSubmit(e) {
    e.preventDefault();
    if (!editForm.name.trim()) { setError("Name is required."); return; }
    setSaving(true);
    setError("");

    const ids = editCustomer.bookings.map((b) => b.id);
    const { error: err } = await supabase
      .from("bookings")
      .update({
        customer_name: editForm.name.trim(),
        customer_phone: editForm.phone.trim() || null,
        customer_email: editForm.email.trim() || null,
      })
      .in("id", ids);

    setSaving(false);
    if (err) { setError(err.message); return; }
    closeEdit();
    await fetchBookings();
  }

  // ── Delete ────────────────────────────────────────────────

  async function handleDelete(customer) {
    const count = customer.bookings.length;
    const msg = `Delete customer "${customer.name}"?\n\nThis will permanently delete all ${count} booking(s) for this customer.`;
    if (!confirm(msg)) return;

    const ids = customer.bookings.map((b) => b.id);
    const { error: err } = await supabase
      .from("bookings")
      .delete()
      .in("id", ids);

    if (err) { setError(err.message); return; }
    await fetchBookings();
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Customers</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">All customers across all companies</p>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Edit Modal */}
      <ModalWrap
        open={!!editCustomer}
        onClose={closeEdit}
        title="Edit Customer"
        width="max-w-md"
      >
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
          <Inp
            label="Full Name"
            placeholder="Customer Name"
            value={editForm.name}
            onChange={(v) => setEditForm({ ...editForm, name: v })}
            icon={<User size={15} />}
            required
          />
          <Inp
            label="Phone"
            placeholder="+92 300 0000000"
            value={editForm.phone}
            onChange={(v) => setEditForm({ ...editForm, phone: v })}
            icon={<Phone size={15} />}
          />
          <Inp
            label="Email"
            type="email"
            placeholder="email@example.com"
            value={editForm.email}
            onChange={(v) => setEditForm({ ...editForm, email: v })}
            icon={<Mail size={15} />}
          />
          {error && (
            <p className="text-red-500 text-xs bg-red-50 p-2 rounded-lg">{error}</p>
          )}
          <div className="flex justify-end gap-3 mt-2">
            <Btn variant="outline" type="button" onClick={closeEdit}>Cancel</Btn>
            <Btn variant="primary" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save Changes"}
            </Btn>
          </div>
        </form>
      </ModalWrap>

      {/* Main Card */}
      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
        {/* Filter Bar */}
        <div className="px-5 py-4 border-b border-[#E5EAF0] flex flex-wrap gap-3">
          <Inp
            placeholder="Search customers..."
            value={search}
            onChange={setSearch}
            icon={<Search size={15} />}
            className="flex-1 min-w-48"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-[#D1DDE8] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] bg-white text-[#111111]"
          >
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-5 flex flex-col gap-3">
              {[...Array(5)].map((_, i) => (
                <div
                  key={i}
                  className="skeleton h-12 w-full"
                  style={{ animationDelay: `${i * 0.08}s` }}
                />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<User size={28} />}
              title={customers.length === 0 ? "No customers yet" : "No customers found"}
              desc={
                customers.length === 0
                  ? "Customers will appear here after their first booking."
                  : "No customers match your search or status filter."
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F7F9FC] border-b border-[#E5EAF0]">
                  {["Customer", "Phone", "Company", "Bookings", "Status", ""].map((h) => (
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
                {filtered.map((c, i) => (
                  <tr
                    key={c.key}
                    className="border-b border-[#F0F4F8] hover:bg-[#F7F9FC] transition-colors anim-row-in"
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    {/* Customer */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: avatarColor(c.name || "A") }}
                        >
                          {initials(c.name || "?")}
                        </div>
                        <div>
                          <p className="font-medium text-[#111111]">
                            {c.name || <span className="text-[#9CA3AF] font-normal">Unknown</span>}
                          </p>
                          <p className="text-xs text-[#9CA3AF]">
                            {c.email || <span className="text-[#9CA3AF]">—</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    {/* Phone */}
                    <td className="px-5 py-3 text-[#374151]">
                      {c.phone || <span className="text-[#9CA3AF]">—</span>}
                    </td>
                    {/* Company */}
                    <td className="px-5 py-3 text-xs text-[#374151]">
                      <span className="text-[#9CA3AF]">—</span>
                    </td>
                    {/* Bookings */}
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[#EBF4FB] text-[#0071BD] font-bold text-xs">
                        {c.bookings.length}
                      </span>
                    </td>
                    {/* Status */}
                    <td className="px-5 py-3">
                      <StatusBadge status={c.isActive ? "Active" : "Inactive"} />
                    </td>
                    {/* Actions */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(c)}
                          className="action-btn inline-flex min-w-9 min-h-9 items-center justify-center rounded-lg hover:bg-[#EBF4FB] text-[#0071BD] transition-colors"
                          title="Edit customer"
                          aria-label={`Edit ${c.name || "customer"}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(c)}
                          className="action-btn inline-flex min-w-9 min-h-9 items-center justify-center rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                          title="Delete customer"
                          aria-label={`Delete ${c.name || "customer"}`}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        {!loading && customers.length > 0 && (
          <div className="px-5 py-3 border-t border-[#E5EAF0] flex items-center justify-between text-sm text-[#6B7280]">
            <span>
              Showing {filtered.length} of {customers.length} customers
            </span>
            <div className="flex items-center gap-1">
              <button className="p-1.5 rounded hover:bg-gray-100">
                <ChevronLeft size={15} />
              </button>
              <button className="w-7 h-7 rounded bg-[#0071BD] text-white text-xs font-bold">
                1
              </button>
              <button className="p-1.5 rounded hover:bg-gray-100">
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
