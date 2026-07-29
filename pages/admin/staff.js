import { useEffect, useState, useMemo } from "react";
import AdminLayout, { NAVY, GOLD, searchMatches } from "../../components/AdminLayout";
import supabase from "../../lib/supabaseClient";
import { StatusBadge, EmptyState, avatarColor, initials } from "../../components/ui/AdminKit";
import { Inp } from "../../components/ui/AuthKit";
import { Search, Pencil, Trash2, Users } from "lucide-react";

const ROLE_LABELS = {
  super_admin: "Admin",
  company_owner: "Owner",
  company_staff: "Staff",
};

export default function AdminStaff() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");   // all | active | inactive
  const [filterRole, setFilterRole] = useState("all");       // all | super_admin | company_owner | company_staff

  useEffect(() => {
    fetchStaff();
  }, []);

  async function fetchStaff() {
    setLoading(true);
    const { data, error } = await supabase
      .from("users")
      .select(`
        id, full_name, email, role, is_active, created_at,
        companies ( name )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
    } else {
      const rows = (data || []).map((u) => ({
        ...u,
        company_name: Array.isArray(u.companies)
          ? u.companies[0]?.name || null
          : u.companies?.name || null,
      }));
      setStaff(rows);
      setError("");
    }
    setLoading(false);
  }

  const filtered = useMemo(() => {
    return staff.filter((u) => {
      const matchSearch = searchMatches(search, [u.full_name, u.email]);
      const matchStatus =
        filterStatus === "all" ||
        (filterStatus === "active" ? u.is_active : !u.is_active);
      const matchRole = filterRole === "all" || u.role === filterRole;
      return matchSearch && matchStatus && matchRole;
    });
  }, [staff, search, filterStatus, filterRole]);

  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Staff</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">All staff members across all companies</p>
      </div>

      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Card: filter bar + table */}
      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
        {/* Filter bar */}
        <div className="px-5 py-4 border-b border-[#E5EAF0] flex flex-wrap gap-3">
          <Inp
            placeholder="Search staff..."
            value={search}
            onChange={setSearch}
            icon={<Search size={15} />}
            className="flex-1 min-w-48"
          />
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            className="rounded-lg border border-[#D1DDE8] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] bg-white text-[#111111]"
          >
            <option value="all">All Roles</option>
            <option value="company_owner">Owner</option>
            <option value="super_admin">Admin</option>
            <option value="company_staff">Staff</option>
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-[#D1DDE8] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] bg-white text-[#111111]"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          {(search || filterStatus !== "all" || filterRole !== "all") && (
            <button
              onClick={() => { setSearch(""); setFilterStatus("all"); setFilterRole("all"); }}
              className="text-sm text-[#6B7280] underline hover:text-[#111111] transition-colors"
            >
              Clear
            </button>
          )}
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
              icon={<Users size={28} />}
              title={staff.length === 0 ? "No staff yet" : "No staff found"}
              desc={
                staff.length === 0
                  ? "Staff members will appear here once they are added."
                  : "No staff match your search or role filters."
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F7F9FC] border-b border-[#E5EAF0]">
                  {["Staff Member", "Role", "Company", "Status", ""].map((h) => (
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
                {filtered.map((u, i) => (
                  <tr
                    key={u.id}
                    className="border-b border-[#F0F4F8] last:border-0 hover:bg-[#F7F9FC] transition-colors anim-row-in"
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    {/* Staff Member: avatar + name/email */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: avatarColor(u.full_name || u.email || "") }}
                        >
                          {initials(u.full_name || u.email || "?")}
                        </div>
                        <div>
                          <p className="font-medium text-[#111111]">
                            {u.full_name || <span className="text-[#9CA3AF] font-normal">—</span>}
                          </p>
                          <p className="text-xs text-[#9CA3AF]">{u.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="px-5 py-3">
                      <StatusBadge status={ROLE_LABELS[u.role] || u.role} />
                    </td>

                    {/* Company */}
                    <td className="px-5 py-3 text-xs text-[#374151]">
                      {u.company_name || <span className="text-[#9CA3AF]">—</span>}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      <StatusBadge status={u.is_active ? "Active" : "Inactive"} />
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          className="action-btn inline-flex min-w-9 min-h-9 items-center justify-center rounded-lg hover:bg-[#EBF4FB] text-[#0071BD] transition-colors"
                          title={`Edit ${u.full_name || "staff member"}`}
                          aria-label={`Edit ${u.full_name || "staff member"}`}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="action-btn inline-flex min-w-9 min-h-9 items-center justify-center rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                          title={`Delete ${u.full_name || "staff member"}`}
                          aria-label={`Delete ${u.full_name || "staff member"}`}
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
      </div>

      {!loading && staff.length > 0 && (
        <p className="text-xs text-[#9CA3AF] mt-3">
          Showing {filtered.length} of {staff.length} staff members
        </p>
      )}
    </AdminLayout>
  );
}
