import { useCallback, useEffect, useState } from "react"
import AdminLayout, { NAVY } from "../../components/AdminLayout"
import supabase from "../../lib/supabaseClient"
import ServiceIcon from "../../components/ServiceIcon"
import { Toggle } from "../../components/ui/AdminKit"
import { Wrench } from "lucide-react"

// The 8 booking-form sections — same order and categories as the dashboard.
const SECTIONS = [
  {
    category: "sofa",
    title: "Sofa Cleaning",
    desc: "Per-seat pricing with a bulk discount for 10+ seats.",
  },
  {
    category: "foam",
    title: "Foam Chair Cleaning",
    desc: "Per-chair pricing with a bulk discount for 10+ chairs.",
  },
  {
    category: "carpet",
    title: "Carpet Cleaning",
    desc: "Per-sqft pricing across 4 area bands (0–100, 101–300, 301–500, 500+ sqft).",
  },
  {
    category: "mattress",
    title: "Mattress Cleaning",
    desc: "Single and double mattresses with separate standard and bulk (2+) rates.",
  },
  {
    category: "curtain",
    title: "Curtain Cleaning",
    desc: "Four types: Small, Standard, Large, and Blackout — each with its own rate.",
  },
  {
    category: "tank",
    title: "Water Tank Cleaning",
    desc: "Flat-rate cleaning by tank capacity: up to 500L, 1 000L, 2 000L, and 5 000L.",
  },
  {
    category: "home_regular",
    title: "Regular Home Cleaning",
    desc: "Weekly / fortnightly / monthly maintenance cleaning. Per-room × house size pricing.",
  },
  {
    category: "home_deep",
    title: "Deep Home Cleaning",
    desc: "Detailed deep clean — wardrobes, tiles, grease removal, sanitization. Per-room × house size pricing.",
  },
]

// Map SECTIONS category → ServiceIcon type key
const CATEGORY_TO_ICON_TYPE = {
  sofa: "sofa",
  foam: "foam",
  carpet: "carpet",
  mattress: "mattress",
  curtain: "curtain",
  tank: "tank",
  home_regular: "home_regular",
  home_deep: "home_deep",
}

export default function AdminServices() {
  const [companyId, setCompanyId] = useState(undefined) // undefined = resolving
  const [settings, setSettings]   = useState({})        // { [category]: boolean }
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState("")
  const [toggling, setToggling]   = useState(null)

  // ── Resolve company_id from session ─────────────────────────────────────
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setCompanyId(null); return }

      const { data: profile } = await supabase
        .from("users")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle()

      setCompanyId(profile?.company_id || null)
    }
    init()
  }, [])

  // ── Load service settings ────────────────────────────────────────────────
  const loadSettings = useCallback(async () => {
    if (companyId === undefined) return // still resolving
    if (!companyId) {
      setSettings({})
      setLoading(false)
      return
    }

    setLoading(true)
    const { data, error: err } = await supabase
      .from("company_service_settings")
      .select("category, is_active")
      .eq("company_id", companyId)

    if (err) {
      setError(err.message)
    } else {
      const map = {}
      // Default all to true; overlay with DB values
      SECTIONS.forEach((s) => { map[s.category] = true })
      ;(data || []).forEach((row) => { map[row.category] = row.is_active })
      setSettings(map)
      setError("")
    }
    setLoading(false)
  }, [companyId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  async function toggleSection(category) {
    if (!companyId) return
    const current = settings[category] !== false
    setToggling(category)

    // Optimistic update
    setSettings((prev) => ({ ...prev, [category]: !current }))

    const { error: err } = await supabase
      .from("company_service_settings")
      .upsert(
        { company_id: companyId, category, is_active: !current, updated_at: new Date().toISOString() },
        { onConflict: "company_id,category" }
      )

    if (err) {
      setSettings((prev) => ({ ...prev, [category]: current }))
      setError("Could not update: " + err.message)
    }
    setToggling(null)
  }

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <AdminLayout>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Services</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Enable or disable which service sections appear on your customer booking form.{" "}
          Pricing is managed on the{" "}
          <a href="/dashboard/pricing" className="text-[#0071BD] hover:underline">
            Pricing page
          </a>
          .
        </p>
      </div>

      {/* No company warning */}
      {companyId === null && !loading && (
        <div className="mb-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
          Your admin account is not linked to a company. Link a company first to manage services.
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Loading */}
      {(loading || companyId === undefined) && (
        <p className="text-[#6B7280] text-sm">Loading services…</p>
      )}

      {/* Section cards */}
      {!loading && companyId && (
        <div className="flex flex-col gap-3 max-w-2xl">
          {SECTIONS.map((section) => {
            const isActive   = settings[section.category] !== false
            const isToggling = toggling === section.category
            const iconType   = CATEGORY_TO_ICON_TYPE[section.category]

            return (
              <div
                key={section.category}
                className="bg-white rounded-2xl p-5 border border-[#E5EAF0] shadow-sm flex items-center gap-5"
              >
                {/* Service Icon */}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
                    isActive ? "bg-[#EBF4FB]" : "bg-[#F0F4F8]"
                  }`}
                >
                  {iconType ? (
                    <ServiceIcon
                      type={iconType}
                      size={24}
                      color={isActive ? "#0071BD" : "#9CA3AF"}
                    />
                  ) : (
                    <Wrench size={24} color={isActive ? "#0071BD" : "#9CA3AF"} />
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#111111] text-sm">{section.title}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{section.desc}</p>
                </div>

                {/* Status label + Toggle */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-[#9CA3AF]">
                    {isToggling ? "Saving…" : isActive ? "Enabled" : "Disabled"}
                  </span>
                  <Toggle
                    checked={isActive}
                    disabled={isToggling}
                    onChange={() => toggleSection(section.category)}
                  />
                </div>
              </div>
            )
          })}

          <p className="text-xs text-[#9CA3AF] pt-2">
            Disabled sections are hidden from customers on the booking form but their pricing is preserved.
          </p>
        </div>
      )}
    </AdminLayout>
  )
}
