import { useCallback, useEffect, useState } from "react"
import DashboardLayout from "../../components/DashboardLayout"
import supabase from "../../lib/supabaseClient"
import { useTenant } from "../../contexts/TenantContext"
import { Toggle, EmptyState, cn } from "../../components/ui/AdminKit"
import ServiceIcon from "../../components/ServiceIcon"
import { Wrench } from "lucide-react"

// The 8 booking-form sections — category must match company_service_settings.category exactly.
const SECTIONS = [
  { category: "sofa",       title: "Sofa Cleaning",          desc: "Per-seat pricing with bulk discount for 10+ seats." },
  { category: "foam",       title: "Foam Chair Cleaning",     desc: "Per-chair pricing with bulk discount for 10+ chairs." },
  { category: "carpet",     title: "Carpet Cleaning",         desc: "Per-sqft pricing across 4 area bands." },
  { category: "mattress",   title: "Mattress Cleaning",       desc: "Single and double mattresses with standard and bulk rates." },
  { category: "curtain",    title: "Curtain Cleaning",        desc: "Four curtain types, each with its own rate." },
  { category: "tank",       title: "Water Tank Cleaning",     desc: "Flat-rate cleaning by tank capacity." },
  { category: "home_regular", title: "Regular Home Cleaning", desc: "Routine cleaning, per-room pricing for Small and Large houses." },
  { category: "home_deep",  title: "Deep Home Cleaning",      desc: "Intensive end-to-end home cleaning, per-room pricing." },
]

// Map service category to the ServiceIcon type key
const ICON_KEY = {
  sofa: "sofa", foam: "armchair", carpet: "carpet", mattress: "mattress",
  curtain: "curtain", tank: "tank", home_regular: "spray", home_deep: "sparkle",
}

export default function ServicesPage() {
  const { companyId, isLoading: tenantLoading } = useTenant()
  const [settings, setSettings] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toggling, setToggling] = useState(null)

  const loadSettings = useCallback(async () => {
    if (tenantLoading) return
    if (!companyId) { setSettings({}); setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from("company_service_settings")
      .select("category, is_active")
      .eq("company_id", companyId)

    if (err) {
      setError(err.message)
    } else {
      const map = {}
      SECTIONS.forEach((s) => { map[s.category] = true })
      ;(data || []).forEach((row) => { map[row.category] = row.is_active })
      setSettings(map)
      setError(null)
    }
    setLoading(false)
  }, [companyId, tenantLoading])

  useEffect(() => { loadSettings() }, [loadSettings])

  async function toggleSection(category) {
    if (!companyId) return
    const current = settings[category] !== false
    setToggling(category)
    setSettings((prev) => ({ ...prev, [category]: !current }))

    const { error: err } = await supabase
      .from("company_service_settings")
      .upsert(
        { company_id: companyId, category, is_active: !current, updated_at: new Date().toISOString() },
        { onConflict: "company_id,category" }
      )

    if (err) {
      setSettings((prev) => ({ ...prev, [category]: current }))
      alert("Could not update service setting: " + err.message)
    }
    setToggling(null)
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Services</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Enable or disable which services appear on your customer booking form.
        </p>
      </div>

      {(loading || tenantLoading) && (
        <p className="text-[#6B7280] text-sm">Loading services…</p>
      )}
      {!loading && error && (
        <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          Could not load services: {error}
        </p>
      )}
      {!tenantLoading && !loading && !companyId && (
        <EmptyState
          icon={<Wrench size={28} />}
          title="No company linked"
          desc="Your account is not linked to a company yet."
        />
      )}

      {!loading && !tenantLoading && !error && companyId && (
        <div className="flex flex-col gap-3">
          {SECTIONS.map((section) => {
            const isActive = settings[section.category] !== false
            const isToggling = toggling === section.category

            return (
              <div
                key={section.category}
                className="bg-white rounded-2xl p-5 border border-[#E5EAF0] shadow-sm flex items-center gap-5"
              >
                {/* Service icon */}
                <div
                  className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                    isActive ? "bg-[#EBF4FB]" : "bg-[#F0F4F8]"
                  )}
                >
                  <ServiceIcon
                    type={ICON_KEY[section.category] || "sofa"}
                    size={24}
                    color={isActive ? "#0071BD" : "#9CA3AF"}
                  />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#111111] text-sm">{section.title}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5">{section.desc}</p>
                </div>

                {/* Status + toggle */}
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-xs text-[#9CA3AF]">
                    {isToggling ? "Saving…" : isActive ? "Active" : "Disabled"}
                  </span>
                  <Toggle
                    checked={isActive}
                    onChange={() => !isToggling && toggleSection(section.category)}
                    disabled={isToggling}
                  />
                </div>
              </div>
            )
          })}

          <p className="text-xs text-[#9CA3AF] pt-1">
            Changes take effect immediately on your booking form. Disabled services are hidden from
            customers but their pricing is preserved.
          </p>
        </div>
      )}
    </DashboardLayout>
  )
}
