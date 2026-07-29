import { useEffect, useMemo, useRef, useState } from "react"
import {
  Palette, Building2, Phone, Clock, Shield,
  Upload, Globe, MessageCircle, Lock, Eye, EyeOff, Mail,
} from "lucide-react"
import supabase from "../../lib/supabaseClient"
import DashboardLayout from "../../components/DashboardLayout"
import LogoCropper from "../../components/LogoCropper"
import { useAuth } from "../../contexts/AuthContext"
import { useTenant } from "../../contexts/TenantContext"
import { extractPaletteFromFile } from "../../lib/extractPalette"
import { getContrastText } from "../../lib/colorUtils"
import { NAVY, GOLD, ACCENT } from "../../lib/brandDefaults"
import { cn } from "../../components/ui/AdminKit"
import { Btn, Inp } from "../../components/ui/AuthKit"

const DEFAULT_COLORS = { primary: NAVY, secondary: GOLD, accent: ACCENT }

const DAYS = [
  ["mon", "Monday"], ["tue", "Tuesday"], ["wed", "Wednesday"], ["thu", "Thursday"],
  ["fri", "Friday"], ["sat", "Saturday"], ["sun", "Sunday"],
]

const TABS = [
  { key: "branding",  label: "Branding",           icon: <Palette size={15} /> },
  { key: "info",      label: "Company Info",        icon: <Building2 size={15} /> },
  { key: "contact",   label: "Contact",             icon: <Phone size={15} /> },
  { key: "business",  label: "Business Settings",   icon: <Clock size={15} /> },
  { key: "security",  label: "Security",            icon: <Shield size={15} /> },
]

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(",")[1] || "")
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export default function CompanyProfilePage() {
  const { companyId: authCompanyId, profile } = useAuth()
  const { companyName, isLoading: tenantLoading, refreshCompany } = useTenant()

  const [activeTab, setActiveTab] = useState("branding")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)
  const [migrationPending, setMigrationPending] = useState(false)
  const fileInputRef = useRef(null)

  const [form, setForm] = useState({
    name: "", description: "", service_area: "", address: "", city: "", country: "PK",
    whatsapp_number: "", phone: "", email: "", website: "",
    working_hours: {}, min_order_amount: "",
    booking_preferences: { advance_booking_days: 30, instant_confirmation: false },
    branding_mode: "auto",
    primary_color: DEFAULT_COLORS.primary,
    secondary_color: DEFAULT_COLORS.secondary,
    accent_color: DEFAULT_COLORS.accent,
    logo_url: null,
  })
  const [ownerName, setOwnerName] = useState("")
  const [palette, setPalette] = useState({ background: null, colors: [] })
  const [logoFile, setLogoFile] = useState(null)
  const [logoPreview, setLogoPreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [cropperFile, setCropperFile] = useState(null)

  // Security tab state
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState(null)
  const [showPw, setShowPw] = useState(false)

  // Load company settings
  useEffect(() => {
    if (tenantLoading || !authCompanyId) return
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      const [settingsRes, userRes] = await Promise.all([
        supabase.from("company_settings").select("*").eq("company_id", authCompanyId).maybeSingle(),
        supabase.from("users").select("full_name").eq("id", profile?.id).maybeSingle(),
      ])
      if (cancelled) return
      if (settingsRes.error) { setError(settingsRes.error.message); setLoading(false); return }
      const s = settingsRes.data || {}
      setForm((prev) => ({
        ...prev,
        name: companyName || "",
        description: s.description || "",
        service_area: s.service_area || "",
        address: s.address || "",
        city: s.city || "",
        country: s.country || "PK",
        whatsapp_number: s.whatsapp_number || "",
        phone: s.phone || "",
        email: s.email || "",
        website: s.website || "",
        working_hours: s.working_hours || {},
        min_order_amount: s.min_order_amount ?? "",
        booking_preferences: { advance_booking_days: 30, instant_confirmation: false, ...(s.booking_preferences || {}) },
        branding_mode: s.branding_mode || "auto",
        primary_color: s.primary_color || DEFAULT_COLORS.primary,
        secondary_color: s.secondary_color || DEFAULT_COLORS.secondary,
        accent_color: s.accent_color || DEFAULT_COLORS.accent,
        logo_url: s.logo_url || null,
      }))
      const storedPalette = Array.isArray(s.logo_palette) ? s.logo_palette : []
      setPalette({ background: storedPalette[0] || null, colors: storedPalette.slice(1) })
      setOwnerName(userRes.data?.full_name || "")
      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [tenantLoading, authCompanyId, companyName, profile?.id])

  function setField(key, value) { setForm((prev) => ({ ...prev, [key]: value })) }

  function applyPaletteToColors(p) {
    if (!p || (!p.background && p.colors.length === 0)) return
    setForm((prev) => ({
      ...prev,
      primary_color: p.background || prev.primary_color,
      secondary_color: p.colors[0] || prev.secondary_color,
      accent_color: p.colors[1] || p.colors[0] || prev.accent_color,
    }))
  }

  function handleLogoSelect(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setCropperFile(file)
    e.target.value = ""
  }

  async function handleCropConfirm(croppedFile) {
    setCropperFile(null)
    setLogoFile(croppedFile)
    setLogoPreview(URL.createObjectURL(croppedFile))
    setAnalyzing(true)
    const extracted = await extractPaletteFromFile(croppedFile, 2)
    setAnalyzing(false)
    if (extracted.background || extracted.colors.length > 0) {
      setPalette(extracted)
      if (form.branding_mode === "auto") applyPaletteToColors(extracted)
    }
  }

  function handleModeChange(mode) {
    setField("branding_mode", mode)
    if (mode === "auto") applyPaletteToColors(palette)
  }

  const logoSrc = logoPreview || form.logo_url

  async function saveSettings(e) {
    e.preventDefault()
    if (!authCompanyId) { setError("No company linked to your account."); return }
    setSaving(true)
    setSuccess(false)
    setError(null)
    try {
      let logoUrl = form.logo_url
      if (logoFile) {
        const base64 = await fileToBase64(logoFile)
        const res = await fetch("/api/company/upload-logo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: authCompanyId, fileName: logoFile.name, fileType: logoFile.type, base64 }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || "Logo upload failed")
        logoUrl = body.logoUrl
      }

      const minOrder = form.min_order_amount === "" ? null : Number(form.min_order_amount)
      const basePayload = {
        company_id: authCompanyId, logo_url: logoUrl,
        primary_color: form.primary_color, secondary_color: form.secondary_color, accent_color: form.accent_color,
        address: form.address, city: form.city, country: form.country,
        whatsapp_number: form.whatsapp_number, phone: form.phone, email: form.email, website: form.website,
        working_hours: form.working_hours,
      }
      const logoPaletteArray = [palette.background, ...(palette.colors || [])].filter(Boolean)
      const extendedPayload = {
        logo_palette: logoPaletteArray.length ? logoPaletteArray : null,
        branding_mode: form.branding_mode, description: form.description,
        service_area: form.service_area, min_order_amount: minOrder, booking_preferences: form.booking_preferences,
      }

      const isMissingColumnError = (err) =>
        !!err && (err.code === "PGRST204" ||
          /column .* (of|in) .*company_settings.* does not exist|could not find the .* column/i.test(err.message || ""))

      let settingsRes = await supabase
        .from("company_settings")
        .upsert({ ...basePayload, ...extendedPayload }, { onConflict: "company_id" })
      let extendedColumnsMissing = false

      if (settingsRes.error && isMissingColumnError(settingsRes.error)) {
        extendedColumnsMissing = true
        settingsRes = await supabase.from("company_settings").upsert(basePayload, { onConflict: "company_id" })
      }

      const [companyRes, ownerRes] = await Promise.all([
        supabase.from("companies").update({ name: form.name }).eq("id", authCompanyId),
        profile?.id
          ? supabase.from("users").update({ full_name: ownerName }).eq("id", profile.id)
          : Promise.resolve({ error: null }),
      ])

      const errors = [companyRes.error, settingsRes.error, ownerRes.error].filter(Boolean)
      if (errors.length > 0) throw new Error(errors[0].message)

      setForm((prev) => ({ ...prev, logo_url: logoUrl }))
      setLogoFile(null)
      setSuccess(true)
      setMigrationPending(extendedColumnsMissing)
      refreshCompany()
    } catch (err) {
      setError(err.message || "Failed to save Company Profile.")
    } finally {
      setSaving(false)
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault()
    setPasswordMessage(null)
    if (newPassword.length < 8) { setPasswordMessage({ type: "error", text: "Password must be at least 8 characters." }); return }
    if (newPassword !== confirmPassword) { setPasswordMessage({ type: "error", text: "Passwords do not match." }); return }
    setPasswordSaving(true)
    const { error: pwError } = await supabase.auth.updateUser({ password: newPassword })
    setPasswordSaving(false)
    if (pwError) {
      setPasswordMessage({ type: "error", text: pwError.message })
    } else {
      setPasswordMessage({ type: "success", text: "Password updated successfully." })
      setNewPassword("")
      setConfirmPassword("")
    }
  }

  function setWorkingHour(day, field, value) {
    setForm((prev) => ({
      ...prev,
      working_hours: {
        ...prev.working_hours,
        [day]: prev.working_hours[day] === null && field !== "closed"
          ? { open: "09:00", close: "18:00", [field]: value }
          : { ...(prev.working_hours[day] || { open: "09:00", close: "18:00" }), [field]: value },
      },
    }))
  }

  function toggleDayClosed(day) {
    setForm((prev) => ({
      ...prev,
      working_hours: {
        ...prev.working_hours,
        [day]: prev.working_hours[day] === null ? { open: "09:00", close: "18:00" } : null,
      },
    }))
  }

  if (loading || tenantLoading) {
    return <DashboardLayout><p className="text-[#6B7280]">Loading…</p></DashboardLayout>
  }

  return (
    <DashboardLayout>
      {cropperFile && (
        <LogoCropper file={cropperFile} onCancel={() => setCropperFile(null)} onConfirm={handleCropConfirm} />
      )}

      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Company Profile</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Manage your company details and preferences</p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden">
        {/* Tab bar */}
        <div className="flex overflow-x-auto border-b border-[#E5EAF0]">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
                activeTab === t.key
                  ? "border-[#0071BD] text-[#0071BD]"
                  : "border-transparent text-[#6B7280] hover:text-[#374151]"
              )}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-6">
          <form onSubmit={saveSettings}>
            {/* ── Branding ── */}
            {activeTab === "branding" && (
              <div className="max-w-lg flex flex-col gap-6">
                {/* Logo */}
                <div>
                  <p className="text-sm font-semibold text-[#374151] mb-3">Company Logo</p>
                  <div
                    className="border-2 border-dashed border-[#D1DDE8] rounded-2xl p-6 text-center hover:border-[#0071BD] transition-colors cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {logoSrc ? (
                      <img src={logoSrc} alt="Logo" className="h-16 mx-auto object-contain mb-2" />
                    ) : (
                      <Upload size={28} className="text-[#9CA3AF] mx-auto mb-2" />
                    )}
                    <p className="text-sm text-[#374151] font-medium">
                      {logoSrc ? "Change Logo" : "Upload Logo"}
                    </p>
                    <p className="text-xs text-[#9CA3AF] mt-1">PNG, JPG, WEBP or SVG · up to 2MB</p>
                    {analyzing && <p className="text-xs mt-1.5 text-[#0071BD]">Analyzing logo colors…</p>}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleLogoSelect}
                    className="hidden"
                  />
                </div>

                {/* Branding mode */}
                <div>
                  <p className="text-sm font-semibold text-[#374151] mb-3">Brand Colors</p>
                  <div className="flex gap-3 mb-4">
                    {["auto", "manual"].map((mode) => (
                      <label
                        key={mode}
                        className="flex-1 flex items-start gap-3 border-2 rounded-xl p-3 cursor-pointer transition"
                        style={{ borderColor: form.branding_mode === mode ? form.primary_color : "#E5EAF0" }}
                      >
                        <input
                          type="radio"
                          name="branding_mode"
                          checked={form.branding_mode === mode}
                          onChange={() => handleModeChange(mode)}
                          className="mt-1"
                        />
                        <span>
                          <span className="block text-sm font-semibold text-[#111111]">
                            {mode === "auto" ? "Auto Brand Colors" : "Manual Customize"}
                          </span>
                          <span className="block text-xs text-[#6B7280]">
                            {mode === "auto"
                              ? "Colors extracted from your logo"
                              : "Pick your own colors"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {(palette.background || palette.colors.length > 0) && (
                    <div className="mb-4">
                      <p className="text-xs font-medium text-[#6B7280] mb-2">Detected from your logo</p>
                      <div className="flex gap-3 flex-wrap">
                        {palette.background && (
                          <div className="text-center">
                            <div className="w-8 h-8 rounded-lg border border-[#E5EAF0] shadow-sm mx-auto" style={{ backgroundColor: palette.background }} />
                            <span className="text-[10px] text-[#9CA3AF]">Background</span>
                          </div>
                        )}
                        {palette.colors.map((hex, i) => (
                          <div key={hex} className="text-center">
                            <div className="w-8 h-8 rounded-lg border border-[#E5EAF0] shadow-sm mx-auto" style={{ backgroundColor: hex }} />
                            <span className="text-[10px] text-[#9CA3AF]">{i === 0 ? "Secondary" : "Accent"}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { key: "primary_color", label: "Primary Color" },
                      { key: "secondary_color", label: "Secondary Color" },
                    ].map(({ key, label }) => (
                      <div key={key}>
                        <label className="text-xs text-[#6B7280] mb-1.5 block">{label}</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={form[key] || "#000000"}
                            disabled={form.branding_mode === "auto"}
                            onChange={(e) => setField(key, e.target.value)}
                            className="h-10 w-12 rounded-lg border border-[#D1DDE8] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          />
                          <input
                            value={form[key] || ""}
                            disabled={form.branding_mode === "auto"}
                            onChange={(e) => setField(key, e.target.value)}
                            className="flex-1 rounded-lg border border-[#D1DDE8] text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] font-mono disabled:opacity-50 disabled:bg-[#F7F9FC]"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Live preview */}
                <div>
                  <p className="text-sm font-semibold text-[#374151] mb-3">Live Preview</p>
                  <div className="rounded-xl overflow-hidden border border-[#E5EAF0]">
                    <div
                      className="h-16 flex items-center justify-center text-white font-bold text-sm"
                      style={{ background: `linear-gradient(135deg, ${form.primary_color}, ${form.secondary_color || form.primary_color})` }}
                    >
                      {form.name || companyName || "Your Company"} — Preview
                    </div>
                    <div className="p-4 flex items-center gap-3">
                      <div
                        className="px-4 py-2 rounded-lg text-xs font-medium text-white"
                        style={{ background: form.primary_color }}
                      >
                        Primary Button
                      </div>
                      <div
                        className="px-4 py-2 rounded-lg text-xs font-medium border"
                        style={{ color: form.primary_color, borderColor: form.primary_color }}
                      >
                        Outline Button
                      </div>
                    </div>
                  </div>
                </div>

                <Btn type="submit" disabled={saving}>
                  {saving ? "Saving…" : "Save Branding"}
                </Btn>
              </div>
            )}

            {/* ── Company Info ── */}
            {activeTab === "info" && (
              <div className="max-w-lg flex flex-col gap-4">
                <Inp label="Company Name" placeholder="SparkClean Lahore" icon={<Building2 size={15} />}
                  value={form.name} onChange={(v) => setField("name", v)} />
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-medium text-[#374151]">About / Description</label>
                  <textarea rows={3} placeholder="Describe your cleaning business…"
                    value={form.description || ""} onChange={(e) => setField("description", e.target.value)}
                    className="w-full rounded-lg border border-[#D1DDE8] bg-white text-sm px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] resize-none text-[#111111] placeholder-[#9CA3AF]"
                  />
                </div>
                <Inp label="Owner Name" placeholder="Jane Smith" icon={<Building2 size={15} />}
                  value={ownerName} onChange={setOwnerName} />
                <Inp label="Owner Email" placeholder="jane@example.com" icon={<Mail size={15} />}
                  value={profile?.email || ""} onChange={() => {}} />
                <Inp label="Service Area" placeholder="e.g. Lahore, DHA, Gulberg"
                  icon={<Globe size={15} />} value={form.service_area || ""} onChange={(v) => setField("service_area", v)} />
                <Inp label="Address" placeholder="123 Main St" value={form.address || ""} onChange={(v) => setField("address", v)} />
                <div className="grid grid-cols-2 gap-3">
                  <Inp label="City" placeholder="Lahore" value={form.city || ""} onChange={(v) => setField("city", v)} />
                  <Inp label="Country" placeholder="PK" value={form.country || ""} onChange={(v) => setField("country", v)} />
                </div>
                <Btn type="submit" disabled={saving} className="self-start">
                  {saving ? "Saving…" : "Save Information"}
                </Btn>
              </div>
            )}

            {/* ── Contact ── */}
            {activeTab === "contact" && (
              <div className="max-w-lg flex flex-col gap-4">
                <Inp label="WhatsApp Number" placeholder="+92 300 0000000" icon={<MessageCircle size={15} />}
                  value={form.whatsapp_number || ""} onChange={(v) => setField("whatsapp_number", v)} />
                <Inp label="Phone Number" placeholder="+92 300 0000000" icon={<Phone size={15} />}
                  value={form.phone || ""} onChange={(v) => setField("phone", v)} />
                <Inp label="Email" type="email" placeholder="hello@company.com" icon={<Mail size={15} />}
                  value={form.email || ""} onChange={(v) => setField("email", v)} />
                <Inp label="Website" placeholder="https://yoursite.com" icon={<Globe size={15} />}
                  value={form.website || ""} onChange={(v) => setField("website", v)} />
                <p className="text-xs text-[#9CA3AF]">
                  These details are displayed on your public booking page so customers can contact you directly.
                </p>
                <Btn type="submit" disabled={saving} className="self-start">
                  {saving ? "Saving…" : "Save Contact"}
                </Btn>
              </div>
            )}

            {/* ── Business Settings ── */}
            {activeTab === "business" && (
              <div className="max-w-lg flex flex-col gap-5">
                <div>
                  <p className="text-sm font-semibold text-[#374151] mb-3">Working Days & Hours</p>
                  <div className="space-y-2">
                    {DAYS.map(([key, label]) => {
                      const isClosedNow = form.working_hours[key] === null
                      const dayVal = form.working_hours[key] || { open: "09:00", close: "18:00" }
                      return (
                        <div key={key} className="flex items-center gap-3 text-sm">
                          <span className="w-24 text-[#374151]">{label}</span>
                          {isClosedNow ? (
                            <span className="flex-1 text-[#9CA3AF] italic">Closed</span>
                          ) : (
                            <>
                              <input
                                type="time"
                                value={dayVal.open || "09:00"}
                                onChange={(e) => setWorkingHour(key, "open", e.target.value)}
                                className="rounded-lg border border-[#D1DDE8] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#38B6FF]"
                              />
                              <span className="text-[#9CA3AF]">to</span>
                              <input
                                type="time"
                                value={dayVal.close || "18:00"}
                                onChange={(e) => setWorkingHour(key, "close", e.target.value)}
                                className="rounded-lg border border-[#D1DDE8] px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#38B6FF]"
                              />
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleDayClosed(key)}
                            className="ml-auto text-xs text-[#6B7280] underline hover:text-[#0071BD]"
                          >
                            {isClosedNow ? "Set hours" : "Mark closed"}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-[#374151]">Booking Preferences</p>
                  <div className="grid grid-cols-2 gap-3">
                    <Inp
                      label="Min Order Amount"
                      type="number"
                      placeholder="No minimum"
                      value={String(form.min_order_amount ?? "")}
                      onChange={(v) => setField("min_order_amount", v)}
                    />
                    <Inp
                      label="Advance Booking (days)"
                      type="number"
                      value={String(form.booking_preferences?.advance_booking_days ?? 30)}
                      onChange={(v) => setField("booking_preferences", { ...form.booking_preferences, advance_booking_days: Number(v) || 0 })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm text-[#374151]">
                    <input
                      type="checkbox"
                      checked={!!form.booking_preferences?.instant_confirmation}
                      onChange={(e) => setField("booking_preferences", { ...form.booking_preferences, instant_confirmation: e.target.checked })}
                      className="w-4 h-4 accent-[#0071BD]"
                    />
                    Automatically confirm new bookings
                  </label>
                </div>

                <Btn type="submit" disabled={saving} className="self-start">
                  {saving ? "Saving…" : "Save Settings"}
                </Btn>
              </div>
            )}

            {/* Feedback (below form buttons, any tab) */}
            {activeTab !== "security" && (
              <div className="mt-4 flex flex-col gap-2">
                {error && (
                  <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                    {error}
                  </p>
                )}
                {success && !migrationPending && (
                  <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                    Company Profile saved!
                  </p>
                )}
                {success && migrationPending && (
                  <p className="text-amber-700 text-sm bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    Logo, colors, and contact info were saved. Some fields need a pending database migration
                    before they can be saved — ask your administrator to apply the latest migration.
                  </p>
                )}
              </div>
            )}
          </form>

          {/* ── Security (outside form) ── */}
          {activeTab === "security" && (
            <div className="max-w-sm flex flex-col gap-4">
              <div className="bg-[#F7F9FC] rounded-xl p-4 text-sm text-[#374151] space-y-1 border border-[#E5EAF0]">
                <p><span className="text-[#9CA3AF]">Email:</span> {profile?.email}</p>
                <p><span className="text-[#9CA3AF]">Role:</span> <span className="capitalize">{(profile?.role || "").replace(/_/g, " ")}</span></p>
              </div>

              <form onSubmit={handleChangePassword} className="flex flex-col gap-4">
                <Inp
                  label="New Password"
                  type={showPw ? "text" : "password"}
                  icon={<Lock size={15} />}
                  rightEl={
                    <button type="button" onClick={() => setShowPw((v) => !v)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  }
                  value={newPassword}
                  onChange={setNewPassword}
                />
                <Inp
                  label="Confirm New Password"
                  type="password"
                  icon={<Lock size={15} />}
                  value={confirmPassword}
                  onChange={setConfirmPassword}
                />
                <Btn type="submit" variant="danger" disabled={passwordSaving} className="self-start">
                  <Shield size={15} />
                  {passwordSaving ? "Updating…" : "Update Password"}
                </Btn>
                {passwordMessage && (
                  <p className={cn(
                    "text-sm rounded-xl px-3 py-2 border",
                    passwordMessage.type === "error"
                      ? "text-red-500 bg-red-50 border-red-200"
                      : "text-green-600 bg-green-50 border-green-200"
                  )}>
                    {passwordMessage.text}
                  </p>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
