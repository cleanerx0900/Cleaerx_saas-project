import { useEffect, useState } from "react";
import AdminLayout, { NAVY, GOLD, searchMatches } from "../../components/AdminLayout";
import supabase from "../../lib/supabaseClient";
import { ModalWrap, Toggle, StatusBadge, EmptyState, initials, avatarColor } from "../../components/ui/AdminKit";
import { Btn, Inp } from "../../components/ui/AuthKit";
import {
  Search, Plus, Pencil, Trash2, KeyRound, User, Mail, Phone,
  MessageCircle, CheckCircle, Copy, Check, Building2, X, LogIn,
} from "lucide-react";
import { useRouter } from "next/router";

const TIMEZONES = [
  "Asia/Karachi", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore",
  "Asia/Tokyo", "Europe/London", "Europe/Berlin", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Australia/Sydney", "Africa/Nairobi",
];

const CURRENCIES = ["PKR", "USD", "GBP", "EUR", "AED", "INR", "AUD", "SGD", "SAR"];

const emptyForm = {
  name: "",
  slug: "",
  owner_name: "",
  owner_email: "",
  whatsapp_number: "",
  phone: "",
  subscription_plan_id: "",
  status: "active",
  primary_color: "#0A1F44",
  timezone: "Asia/Karachi",
  currency: "PKR",
  logo_url: "",
};

export default function AdminCompanies() {
  const router = useRouter();
  const [companies, setCompanies] = useState([]);
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [successNotice, setSuccessNotice] = useState("");
  const [ownerCredentials, setOwnerCredentials] = useState(null);
  const [tempPassword, setTempPassword] = useState("");
  const [resetTarget, setResetTarget] = useState(null); // company pending confirmation
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetCredentials, setResetCredentials] = useState(null);
  const [resetCopied, setResetCopied] = useState(false);
  const [toast, setToast] = useState(null); // { type: "success" | "error", message }
  const [credsCopied, setCredsCopied] = useState({});
  const [credsCopiedAll, setCredsCopiedAll] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState(null); // company id being impersonated
  const [deleteTarget, setDeleteTarget] = useState(null);  // company pending delete confirmation
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function showToast(type, message) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2500);
  }

  function toWhatsAppUrl(raw) {
    if (!raw) return null
    // Strip everything except digits and a leading +
    let n = raw.trim().replace(/[\s\-\(\)]/g, "")
    // Remove leading + (wa.me uses plain digits)
    n = n.replace(/^\+/, "")
    // Convert local Pakistan numbers: 0300… → 92300…
    if (n.startsWith("0")) n = "92" + n.slice(1)
    return n ? `https://wa.me/${n}` : null
  }

  async function handleLoginAsCompany(company) {
    setImpersonatingId(company.id);
    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: company.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast("error", data.error || "Failed to start impersonation.");
        return;
      }
      router.push("/dashboard");
    } catch (err) {
      showToast("error", err.message || "Network error.");
    } finally {
      setImpersonatingId(null);
    }
  }

  function buildCredentialsText({ companyName, ownerEmail, tempPassword }) {
    const loginUrl = `${window.location.origin}/login`;
    return [
      "🏢 *Company Login Details*",
      "",
      `*Company Name:* ${companyName}`,
      `*Login URL:* ${loginUrl}`,
      `*Email:* ${ownerEmail}`,
      `*Temporary Password:* ${tempPassword}`,
      "",
      "⚠️ Please change your password after first login.",
    ].join("\n");
  }

  async function copyCredentials(creds) {
    try {
      await navigator.clipboard.writeText(buildCredentialsText(creds));
      setCredsCopiedAll(true);
      setTimeout(() => setCredsCopiedAll(false), 2000);
    } catch {
      showToast("error", "❌ Failed to copy credentials.");
    }
  }

  function generateTempPassword() {
    const bytes = new Uint8Array(18);
    window.crypto.getRandomValues(bytes);
    let binary = "";
    bytes.forEach((b) => { binary += String.fromCharCode(b); });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  // Filters
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterPlan, setFilterPlan] = useState("all");

  useEffect(() => {
    fetchAll();
  }, []);

  async function fetchAll() {
    setLoading(true);
    await Promise.all([fetchCompanies(), fetchPlans()]);
    setLoading(false);
  }

  async function fetchPlans() {
    const { data } = await supabase
      .from("subscription_plans")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("display_order");
    if (data) setPlans(data);
  }

  async function fetchCompanies() {
    const { data, error } = await supabase
      .from("companies")
      .select(`
        id, slug, name, is_active, created_at, owner_user_id,
        company_settings ( logo_url, email, phone, whatsapp_number, currency, timezone, primary_color ),
        users!companies_owner_user_id_fkey ( full_name, email )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      return;
    }

    const rows = data || [];

    // Fetch active subscriptions for all companies
    let subMap = {};
    if (rows.length) {
      const ids = rows.map((c) => c.id);
      const { data: subs } = await supabase
        .from("active_subscriptions")
        .select("company_id, plan_name, plan_slug, status, expires_at")
        .in("company_id", ids);
      if (subs) subs.forEach((s) => { subMap[s.company_id] = s; });
    }

    const enriched = rows.map((c) => ({
      ...c,
      settings: Array.isArray(c.company_settings)
        ? c.company_settings[0] || {}
        : c.company_settings || {},
      owner: Array.isArray(c.users) ? c.users[0] || null : c.users || null,
      subscription: subMap[c.id] || null,
    }));

    setCompanies(enriched);
    setError("");
  }

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
    setError("");
    setTempPassword("");
  }

  function openCreate() {
    setForm(emptyForm);
    setEditingId(null);
    setError("");
    setTempPassword(generateTempPassword());
    setShowForm(true);
  }

  function openEdit(company) {
    const planId =
      company.subscription
        ? plans.find((p) => p.slug === company.subscription.plan_slug)?.id || ""
        : "";

    setEditingId(company.id);
    setForm({
      name: company.name || "",
      slug: company.slug || "",
      owner_name: company.owner?.full_name || "",
      owner_email: company.owner?.email || "",
      whatsapp_number: company.settings?.whatsapp_number || "",
      phone: company.settings?.phone || "",
      subscription_plan_id: planId,
      status: company.is_active ? "active" : "suspended",
      primary_color: company.settings?.primary_color || "#0A1F44",
      timezone: company.settings?.timezone || "Asia/Karachi",
      currency: company.settings?.currency || "PKR",
      logo_url: company.settings?.logo_url || "",
    });
    setError("");
    setShowForm(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Company name is required."); return; }
    if (!form.slug.trim()) { setError("Company slug is required."); return; }
    if (!editingId && !form.whatsapp_number.trim()) { setError("WhatsApp number is required."); return; }

    setSaving(true);
    setError("");

    // ── New company: use the secure server-side Company Provisioning API ──
    if (!editingId) {
      try {
        const res = await fetch("/api/admin/create-company", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name,
            slug: form.slug,
            owner_name: form.owner_name,
            owner_email: form.owner_email,
            owner_temp_password: tempPassword,
            whatsapp_number: form.whatsapp_number,
            phone: form.phone,
            subscription_plan_id: form.subscription_plan_id,
            status: form.status,
            primary_color: form.primary_color,
            timezone: form.timezone,
            currency: form.currency,
            logo_url: form.logo_url,
          }),
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          setError(data.error || "Failed to create company.");
          return; // keep modal open, do not refresh the list
        }

        const createdCompanyName = form.name;
        const createdOwnerName = form.owner_name;
        const createdOwnerEmail = form.owner_email;

        resetForm();
        await fetchCompanies();
        setSuccessNotice(`"${createdCompanyName}" was created successfully.`);
        setOwnerCredentials({
          companyName: createdCompanyName,
          ownerName: createdOwnerName,
          ownerEmail: createdOwnerEmail,
          tempPassword: data.tempPassword || tempPassword,
        });
      } catch (err) {
        setError(err.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // ── Existing company: Edit Company flow, unchanged ──
    try {
      const companyId = editingId;

      const { error: err } = await supabase
        .from("companies")
        .update({ name: form.name, slug: form.slug, is_active: form.status === "active" })
        .eq("id", editingId);
      if (err) throw err;

      // Upsert company_settings
      const { error: settErr } = await supabase
        .from("company_settings")
        .upsert(
          {
            company_id: companyId,
            whatsapp_number: form.whatsapp_number.trim() || null,
            phone: form.phone || null,
            primary_color: form.primary_color || "#0A1F44",
            timezone: form.timezone || "Asia/Karachi",
            currency: form.currency || "PKR",
            logo_url: form.logo_url || null,
          },
          { onConflict: "company_id" }
        );
      if (settErr) throw settErr;

      // Link owner user if email provided
      if (form.owner_email.trim()) {
        const { data: ownerUser } = await supabase
          .from("users")
          .select("id")
          .eq("email", form.owner_email.trim())
          .maybeSingle();
        if (ownerUser) {
          const updates = { company_id: companyId };
          if (form.owner_name.trim()) updates.full_name = form.owner_name.trim();
          await supabase.from("users").update(updates).eq("id", ownerUser.id);
          await supabase.from("companies").update({ owner_user_id: ownerUser.id }).eq("id", companyId);
        }
      }

      // Assign subscription plan
      if (form.subscription_plan_id) {
        const { data: existingSub } = await supabase
          .from("company_subscriptions")
          .select("id")
          .eq("company_id", companyId)
          .eq("status", "active")
          .maybeSingle();

        if (existingSub) {
          await supabase
            .from("company_subscriptions")
            .update({ plan_id: form.subscription_plan_id })
            .eq("id", existingSub.id);
        } else {
          await supabase.from("company_subscriptions").insert({
            company_id: companyId,
            plan_id: form.subscription_plan_id,
            status: "active",
          });
        }
      }

      resetForm();
      await fetchCompanies();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleStatusToggle(company) {
    const newActive = !company.is_active;
    const action = newActive ? "activate" : "suspend";
    if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} "${company.name}"?`)) return;
    const { error: err } = await supabase
      .from("companies")
      .update({ is_active: newActive })
      .eq("id", company.id);
    if (err) setError(err.message);
    else fetchCompanies();
  }

  function handleDelete(company) {
    if (company.is_active && company.subscription) {
      showToast(
        "error",
        "Deletion blocked: an Active company with an Active subscription cannot be deleted. Suspend the company or end its subscription first."
      );
      return;
    }
    setDeleteError("");
    setDeleteTarget(company);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/admin/delete-company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: deleteTarget.id }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        if (data.code === "ACTIVE_COMPANY_ACTIVE_SUBSCRIPTION") {
          setDeleteError(
            "Deletion blocked: this company has an Active subscription. Suspend the company or end its subscription first."
          );
        } else {
          setDeleteError(data.error || "Failed to delete company.");
        }
        return;
      }

      const deletedName = deleteTarget.name;
      setDeleteTarget(null);
      setDeleteError("");
      await fetchCompanies();
      showToast("success", `"${deletedName}" and its company data were deleted.`);
    } catch (err) {
      setDeleteError(err.message || "Failed to delete company.");
    } finally {
      setDeleting(false);
    }
  }

  async function confirmResetPassword() {
    if (!resetTarget) return;
    setResetting(true);
    setResetError("");
    try {
      const res = await fetch("/api/admin/reset-company-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: resetTarget.id,
          temp_password: generateTempPassword(),
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setResetError(data.error || "Failed to reset password.");
        return; // do not change other UI state, do not show credentials modal
      }

      setResetTarget(null);
      setResetError("");
      setResetCopied(false);
      setResetCredentials({
        companyName: data.companyName,
        ownerName: data.ownerName,
        ownerEmail: data.ownerEmail,
        tempPassword: data.tempPassword,
      });
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  }

  // Client-side filtering
  const filtered = companies.filter((c) => {
    const matchSearch = searchMatches(search, [
      c.name,
      c.owner?.full_name,
      c.owner?.email,
      c.settings?.email,
    ]);
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "active" ? c.is_active : !c.is_active);
    const matchPlan =
      filterPlan === "all" || c.subscription?.plan_slug === filterPlan;
    return matchSearch && matchStatus && matchPlan;
  });

  const selectCls = "w-full rounded-lg border border-[#D1DDE8] bg-white text-[#111111] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] focus:border-transparent transition-all";

  return (
    <AdminLayout>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-[60] flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-500 text-white"
          }`}
        >
          {toast.type === "success" ? <CheckCircle size={16} /> : <X size={16} />}
          {toast.message}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#111111]">Companies</h1>
          <p className="text-sm text-[#6B7280] mt-0.5">{companies.length} tenants on the platform</p>
        </div>
        <Btn onClick={openCreate} variant="primary">
          <Plus size={16} /> Add Company
        </Btn>
      </div>

      {/* Global error */}
      {error && !showForm && (
        <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Success notification */}
      {successNotice && (
        <div className="mb-4 p-3 rounded-xl border border-green-200 bg-green-50 text-green-700 text-sm flex items-center justify-between gap-3">
          <span>{successNotice}</span>
          <button
            onClick={() => setSuccessNotice("")}
            className="text-green-700 hover:text-green-900 text-xs underline shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Companies Card */}
      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
        {/* Filters bar */}
        <div className="px-5 py-4 border-b border-[#E5EAF0] flex flex-col sm:flex-row sm:flex-wrap gap-3">
          <Inp
            placeholder="Search companies..."
            value={search}
            onChange={(v) => setSearch(v)}
            icon={<Search size={15} />}
            className="w-full sm:max-w-xs"
          />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded-lg border border-[#D1DDE8] bg-white text-[#111111] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] focus:border-transparent transition-all w-full sm:w-auto"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
          </select>
          <select
            value={filterPlan}
            onChange={(e) => setFilterPlan(e.target.value)}
            className="rounded-lg border border-[#D1DDE8] bg-white text-[#111111] text-sm py-2.5 px-3 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] focus:border-transparent transition-all w-full sm:w-auto"
          >
            <option value="all">All Plans</option>
            {plans.map((p) => (
              <option key={p.id} value={p.slug}>{p.name}</option>
            ))}
          </select>
          {(search || filterStatus !== "all" || filterPlan !== "all") && (
            <button
              onClick={() => { setSearch(""); setFilterStatus("all"); setFilterPlan("all"); }}
              className="inline-flex items-center text-sm text-[#6B7280] hover:text-[#111111] underline"
            >
              Clear
            </button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          {loading ? (
            <p className="text-[#6B7280] text-sm p-8 text-center">Loading companies…</p>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<Building2 size={28} />}
              title={companies.length === 0 ? "No companies yet" : "No results found"}
              desc={
                companies.length === 0
                  ? "Click \"+ Add Company\" to create the first one."
                  : "No companies match your search or filters."
              }
            />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F7F9FC] border-b border-[#E5EAF0]">
                  {["Company", "Owner", "Plan", "Color", "Status", "Actions"].map((h) => (
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
                {filtered.map((c, i) => {
                  const color = c.settings?.primary_color || NAVY;
                  const avatarBg = color;
                  return (
                    <tr
                      key={c.id}
                      className="border-b border-[#F0F4F8] hover:bg-[#F7F9FC] transition-colors anim-row-in"
                      style={{ animationDelay: `${i * 0.04}s` }}
                    >
                      {/* Company */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          {c.settings?.logo_url ? (
                            <img
                              src={c.settings.logo_url}
                              alt={c.name}
                              className="w-8 h-8 rounded-lg object-cover shrink-0"
                            />
                          ) : (
                            <div
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shrink-0"
                              style={{ background: avatarBg }}
                            >
                              {initials(c.name)}
                            </div>
                          )}
                          <div>
                            <p className="font-semibold text-[#111111]">{c.name}</p>
                            <p className="text-xs text-[#9CA3AF] font-mono">/{c.slug}</p>
                          </div>
                        </div>
                      </td>

                      {/* Owner */}
                      <td className="px-5 py-3">
                        <p className="text-[#374151]">{c.owner?.full_name || <span className="text-[#9CA3AF]">—</span>}</p>
                        <p className="text-xs text-[#9CA3AF]">{c.owner?.email || c.settings?.email || ""}</p>
                      </td>

                      {/* Plan */}
                      <td className="px-5 py-3">
                        {c.subscription?.plan_name ? (
                          <StatusBadge status={c.subscription.plan_name} />
                        ) : (
                          <span className="text-[#9CA3AF] text-xs">—</span>
                        )}
                      </td>

                      {/* Color */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-5 h-5 rounded-full border border-[#E5EAF0] shrink-0"
                            style={{ background: color }}
                          />
                          <span className="text-xs text-[#9CA3AF] font-mono">{color}</span>
                        </div>
                      </td>

                      {/* Status — Toggle wired to handleStatusToggle */}
                      <td className="px-5 py-3">
                        <Toggle
                          checked={c.is_active}
                          onChange={() => handleStatusToggle(c)}
                        />
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEdit(c)}
                            title="Edit company"
                            aria-label={`Edit ${c.name}`}
                            className="action-btn inline-flex min-w-10 min-h-10 items-center justify-center rounded-lg hover:bg-[#EBF4FB] text-[#0071BD] transition-colors"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => { setResetTarget(c); setResetError(""); }}
                            disabled={!c.owner_user_id}
                            title={!c.owner_user_id ? "No owner account to reset" : "Reset owner password"}
                            aria-label={`Reset password for ${c.name}`}
                            className="action-btn inline-flex min-w-10 min-h-10 items-center justify-center rounded-lg hover:bg-amber-50 text-amber-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <KeyRound size={16} />
                          </button>
                          {(() => {
                            const waUrl = toWhatsAppUrl(c.settings?.whatsapp_number)
                            return waUrl ? (
                              <a
                                href={waUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={`WhatsApp: ${c.settings.whatsapp_number}`}
                                aria-label={`Open WhatsApp for ${c.name}`}
                                className="action-btn inline-flex min-w-10 min-h-10 items-center justify-center rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                              >
                                <MessageCircle size={16} />
                              </a>
                            ) : null
                          })()}
                          <button
                            onClick={() => handleLoginAsCompany(c)}
                            disabled={!c.is_active || impersonatingId === c.id}
                            title={!c.is_active ? "Company is suspended" : "Login as company (admin view)"}
                            aria-label={`Login as ${c.name}`}
                            className="action-btn inline-flex min-w-10 min-h-10 items-center justify-center rounded-lg hover:bg-blue-50 text-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {impersonatingId === c.id
                              ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
                              : <LogIn size={16} />
                            }
                          </button>
                          <button
                            onClick={() => handleDelete(c)}
                            title="Delete company"
                            aria-label={`Delete ${c.name}`}
                            className="action-btn inline-flex min-w-10 min-h-10 items-center justify-center rounded-lg hover:bg-red-50 text-red-500 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer count */}
        {!loading && companies.length > 0 && (
          <div className="px-5 py-3 border-t border-[#F0F4F8]">
            <p className="text-xs text-[#9CA3AF]">
              Showing {filtered.length} of {companies.length} companies
            </p>
          </div>
        )}
      </div>

      {/* ── Create / Edit Company Modal ── */}
      <ModalWrap
        open={showForm}
        onClose={resetForm}
        title={editingId ? "Edit Company" : "Add New Company"}
        width="max-w-2xl"
      >
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Company Name */}
            <Inp
              label="Company Name *"
              placeholder="Sparkle Clean"
              value={form.name}
              required
              onChange={(v) => {
                const name = v;
                const autoSlug = !editingId
                  ? name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
                  : form.slug;
                setForm({ ...form, name, slug: autoSlug });
              }}
            />
            {/* Slug */}
            <Inp
              label="Slug *"
              placeholder="sparkle-clean"
              value={form.slug}
              required
              onChange={(v) =>
                setForm({ ...form, slug: v.toLowerCase().replace(/[^a-z0-9-]/g, "-") })
              }
            />
            {/* Owner Name */}
            <Inp
              label="Owner Name"
              placeholder="Jane Smith"
              value={form.owner_name}
              icon={<User size={15} />}
              onChange={(v) => setForm({ ...form, owner_name: v })}
            />
            {/* Owner Email */}
            <Inp
              label="Owner Email"
              type="email"
              placeholder="jane@example.com"
              value={form.owner_email}
              icon={<Mail size={15} />}
              onChange={(v) => setForm({ ...form, owner_email: v })}
            />
            {/* WhatsApp */}
            <Inp
              label={`WhatsApp Number${!editingId ? " *" : ""}`}
              placeholder="+92 300 0000000"
              value={form.whatsapp_number}
              required={!editingId}
              icon={<MessageCircle size={15} />}
              onChange={(v) => setForm({ ...form, whatsapp_number: v })}
            />
            {/* Phone */}
            <Inp
              label="Phone"
              placeholder="+92 300 0000000"
              value={form.phone}
              icon={<Phone size={15} />}
              onChange={(v) => setForm({ ...form, phone: v })}
            />

            {/* Temporary Password (create only) */}
            {!editingId && (
              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <label className="text-sm font-medium text-[#374151]">Temporary Password</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={tempPassword}
                    className="flex-1 min-w-0 rounded-lg border border-[#D1DDE8] bg-[#F7F9FC] text-[#111111] text-sm py-2.5 px-3 font-mono focus:outline-none"
                  />
                  <Btn
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setTempPassword(generateTempPassword())}
                  >
                    Regenerate
                  </Btn>
                </div>
              </div>
            )}

            {/* Subscription Plan */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#374151]">Subscription Plan</label>
              <select
                value={form.subscription_plan_id}
                onChange={(e) => setForm({ ...form, subscription_plan_id: e.target.value })}
                className={selectCls}
              >
                <option value="">— None —</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* Status */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#374151]">Status</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className={selectCls}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>

            {/* Timezone */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#374151]">Timezone</label>
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className={selectCls}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>{tz}</option>
                ))}
              </select>
            </div>

            {/* Currency */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#374151]">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className={selectCls}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Primary Color */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-[#374151]">Primary Color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  className="h-10 w-14 rounded-lg border border-[#D1DDE8] cursor-pointer p-0.5 shrink-0"
                />
                <input
                  type="text"
                  value={form.primary_color}
                  onChange={(e) => setForm({ ...form, primary_color: e.target.value })}
                  className="flex-1 min-w-0 rounded-lg border border-[#D1DDE8] bg-white text-[#111111] text-sm py-2.5 px-3 font-mono focus:outline-none focus:ring-2 focus:ring-[#38B6FF]"
                />
              </div>
            </div>

            {/* Logo URL */}
            <Inp
              label="Logo URL"
              placeholder="https://…"
              value={form.logo_url}
              onChange={(v) => setForm({ ...form, logo_url: v })}
            />
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6">
            <Btn type="button" variant="outline" onClick={resetForm}>
              Cancel
            </Btn>
            <Btn type="submit" variant="primary" disabled={saving}>
              {saving ? "Saving…" : editingId ? "Update Company" : "Create Company"}
            </Btn>
          </div>
        </form>
      </ModalWrap>

      {/* ── Owner Credentials Modal (shown after create) ── */}
      <ModalWrap
        open={!!ownerCredentials}
        onClose={() => setOwnerCredentials(null)}
        title="Company Created — Credentials"
      >
        {ownerCredentials && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-500 shrink-0" />
              <p className="text-sm text-green-700 font-medium">
                Company created successfully! Share these credentials with the owner.
              </p>
            </div>
            {[
              { label: "Login URL", value: typeof window !== "undefined" ? `${window.location.origin}/login` : "/login" },
              { label: "Company", value: ownerCredentials.companyName },
              { label: "Owner", value: ownerCredentials.ownerName || "—" },
              { label: "Email", value: ownerCredentials.ownerEmail },
              { label: "Temporary Password", value: ownerCredentials.tempPassword },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between p-3 rounded-xl bg-[#F7F9FC] border border-[#E5EAF0] mb-2"
              >
                <div>
                  <p className="text-xs text-[#6B7280]">{row.label}</p>
                  <p className="text-sm font-medium text-[#111111] font-mono break-all">{row.value}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(row.value);
                      setCredsCopied((prev) => ({ ...prev, [row.label]: true }));
                      setTimeout(() => setCredsCopied((prev) => ({ ...prev, [row.label]: false })), 2000);
                    } catch {}
                  }}
                  className="p-2 rounded-lg hover:bg-[#EBF4FB] text-[#0071BD] transition-colors shrink-0 ml-2"
                >
                  {credsCopied[row.label] ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            ))}
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mt-3 mb-4">
              Save these credentials now. The temporary password will never be shown again.
            </p>
            <div className="flex gap-3">
              <Btn
                variant="outline"
                className="flex-1"
                onClick={() => copyCredentials(ownerCredentials)}
              >
                {credsCopiedAll ? <Check size={14} /> : <Copy size={14} />}
                {credsCopiedAll ? "Copied!" : "Copy Credentials"}
              </Btn>
              <Btn
                variant="primary"
                className="flex-1"
                onClick={() => { setOwnerCredentials(null); setCredsCopiedAll(false); }}
              >
                Done
              </Btn>
            </div>
          </>
        )}
      </ModalWrap>

      {/* ── Delete Company Confirmation Modal ── */}
      <ModalWrap
        open={!!deleteTarget}
        onClose={() => { if (!deleting) { setDeleteTarget(null); setDeleteError(""); } }}
        title="Delete Company"
      >
        {deleteTarget && (
          <>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4 flex items-start gap-3">
              <Trash2 size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700 mb-1">
                  This action cannot be undone
                </p>
                <p className="text-sm text-red-600">
                  Permanently deletes <span className="font-medium">"{deleteTarget.name}"</span> and all of its
                  company-owned data: bookings, services, invoices, settings, and subscriptions.
                  Auth accounts (users) are preserved.
                </p>
              </div>
            </div>

            <div className="bg-[#F7F9FC] border border-[#E5EAF0] rounded-xl p-3 mb-5 text-sm text-[#374151]">
              <p><span className="text-[#6B7280]">Company:</span> <span className="font-semibold">{deleteTarget.name}</span></p>
              <p><span className="text-[#6B7280]">Slug:</span> <span className="font-mono text-xs">/{deleteTarget.slug}</span></p>
              {deleteTarget.owner && (
                <p><span className="text-[#6B7280]">Owner:</span> {deleteTarget.owner.full_name || deleteTarget.owner.email}</p>
              )}
            </div>

            {deleteError && (
              <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
                {deleteError}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Btn
                type="button"
                variant="outline"
                disabled={deleting}
                onClick={() => { setDeleteTarget(null); setDeleteError(""); }}
              >
                Cancel
              </Btn>
              <button
                type="button"
                disabled={deleting}
                onClick={confirmDelete}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? "Deleting…" : "Delete Company"}
              </button>
            </div>
          </>
        )}
      </ModalWrap>

      {/* ── Reset Password Confirmation Modal ── */}
      <ModalWrap
        open={!!resetTarget}
        onClose={() => { setResetTarget(null); setResetError(""); }}
        title="Reset Company Password"
      >
        {resetTarget && (
          <>
            <p className="text-sm text-[#374151] mb-3">
              This will generate a new temporary password for the Company Owner.
              The current password will immediately stop working.
            </p>
            <p className="text-xs text-[#6B7280] mb-4">
              Company: <span className="font-medium text-[#111111]">{resetTarget.name}</span>
            </p>
            {resetError && (
              <div className="mb-4 p-3 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">
                {resetError}
              </div>
            )}
            <div className="flex justify-end gap-3">
              <Btn
                type="button"
                variant="outline"
                disabled={resetting}
                onClick={() => { setResetTarget(null); setResetError(""); }}
              >
                Cancel
              </Btn>
              <Btn
                type="button"
                variant="primary"
                disabled={resetting}
                onClick={confirmResetPassword}
              >
                {resetting ? "Generating…" : "Generate Password"}
              </Btn>
            </div>
          </>
        )}
      </ModalWrap>

      {/* ── Reset Credentials Modal (shown after successful reset) ── */}
      <ModalWrap
        open={!!resetCredentials}
        onClose={() => setResetCredentials(null)}
        title="Password Reset Successfully"
      >
        {resetCredentials && (
          <>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-5 flex items-center gap-3">
              <CheckCircle size={20} className="text-green-500 shrink-0" />
              <p className="text-sm text-green-700 font-medium">
                Password reset successfully! Share the new credentials with the owner.
              </p>
            </div>
            {[
              { label: "Company", value: resetCredentials.companyName },
              { label: "Owner", value: resetCredentials.ownerName || "—" },
              { label: "Email", value: resetCredentials.ownerEmail },
              { label: "New Temporary Password", value: resetCredentials.tempPassword },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between p-3 rounded-xl bg-[#F7F9FC] border border-[#E5EAF0] mb-2"
              >
                <div>
                  <p className="text-xs text-[#6B7280]">{row.label}</p>
                  <p className="text-sm font-medium text-[#111111] font-mono break-all">{row.value}</p>
                </div>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(row.value);
                      setResetCopied(true);
                      setTimeout(() => setResetCopied(false), 2000);
                    } catch {}
                  }}
                  className="p-2 rounded-lg hover:bg-[#EBF4FB] text-[#0071BD] transition-colors shrink-0 ml-2"
                >
                  {resetCopied ? <Check size={15} /> : <Copy size={15} />}
                </button>
              </div>
            ))}
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl p-3 mt-3 mb-4">
              Save these credentials now. The password will never be shown again.
            </p>
            <Btn
              variant="primary"
              className="w-full"
              onClick={() => setResetCredentials(null)}
            >
              Done
            </Btn>
          </>
        )}
      </ModalWrap>
    </AdminLayout>
  );
}
