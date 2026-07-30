import Head from "next/head"
import { useCallback, useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"
import DashboardLayout from "../../components/DashboardLayout"
import { useTenant } from "../../contexts/TenantContext"
import { cn, EmptyState } from "../../components/ui/AdminKit"
import { Btn } from "../../components/ui/AuthKit"
import ServiceIcon from "../../components/ServiceIcon"
import supabase from "../../lib/supabaseClient"

const HOME_ROOMS = [
  { key: "bed",    label: "Bedroom" },
  { key: "lounge", label: "Lounge" },
  { key: "kitchen",label: "Kitchen" },
  { key: "wash",   label: "Washroom" },
  { key: "garage", label: "Garage" },
  { key: "stair",  label: "Staircase" },
  { key: "store",  label: "Store Room" },
]

const HOME_SIZES = [
  { key: "small", label: "Small House", sub: "3–5 Marla (675–1,361 sq ft)" },
  { key: "large", label: "Large House", sub: "10 Marla – 1 Kanal (2,250–5,445 sq ft)" },
]

const SECTIONS = [
  {
    category: "sofa", iconKey: "sofa", title: "Sofa Cleaning", type: "table",
    rules: [
      { key: "standard_rate",  label: "Standard Rate (1–9 seats)", unit: "/seat" },
      { key: "bulk_rate",      label: "Bulk Rate (10+ seats)",      unit: "/seat" },
      { key: "bulk_threshold", label: "Bulk Starts From",           unit: "seats", kind: "threshold" },
    ],
  },
  {
    category: "foam", iconKey: "armchair", title: "Foam Chair Cleaning", type: "table",
    rules: [
      { key: "standard_rate",  label: "Standard Rate (1–9 chairs)", unit: "/chair" },
      { key: "bulk_rate",      label: "Bulk Rate (10+ chairs)",      unit: "/chair" },
      { key: "bulk_threshold", label: "Bulk Starts From",            unit: "chairs", kind: "threshold" },
    ],
  },
  {
    category: "carpet", iconKey: "carpet", title: "Carpet Cleaning", type: "table",
    rules: [
      { key: "band_0_100",    label: "0–100 sqft",  unit: "/sqft" },
      { key: "band_101_300",  label: "101–300 sqft",unit: "/sqft" },
      { key: "band_301_500",  label: "301–500 sqft",unit: "/sqft" },
      { key: "band_500_plus", label: "500+ sqft",   unit: "/sqft" },
    ],
  },
  {
    category: "mattress", iconKey: "mattress", title: "Mattress Cleaning", type: "table",
    rules: [
      { key: "single_standard", label: "Single Mattress (1 pc)", unit: "each" },
      { key: "single_bulk",     label: "Single Mattress (2+)",   unit: "each" },
      { key: "double_standard", label: "Double Mattress (1 pc)", unit: "each" },
      { key: "double_bulk",     label: "Double Mattress (2+)",   unit: "each" },
    ],
  },
  {
    category: "curtain", iconKey: "curtain", title: "Curtain Cleaning", type: "table",
    rules: [
      { key: "small",    label: "Small Curtain",    unit: "each" },
      { key: "standard", label: "Standard Curtain", unit: "each" },
      { key: "large",    label: "Large Curtain",    unit: "each" },
      { key: "blackout", label: "Blackout Curtain", unit: "each" },
    ],
  },
  {
    category: "tank", iconKey: "tank", title: "Water Tank Cleaning", type: "table",
    rules: [
      { key: "band_500",  label: "Up to 500 Litres",   unit: "flat rate" },
      { key: "band_1000", label: "501–1,000 Litres",   unit: "flat rate" },
      { key: "band_2000", label: "1,001–2,000 Litres", unit: "flat rate" },
      { key: "band_5000", label: "2,001–5,000 Litres", unit: "flat rate" },
    ],
  },
  { category: "home_regular", iconKey: "spray",   title: "Regular Home Cleaning", type: "home" },
  { category: "home_deep",    iconKey: "sparkle",  title: "Deep Home Cleaning",   type: "home" },
]

function ruleEditKey(category, ruleKey) { return `${category}::${ruleKey}` }

export default function PricingPage() {
  const { companyId, isLoading: tenantLoading } = useTenant()

  const [rulesByCategory, setRulesByCategory] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState({})
  const [saved, setSaved] = useState({})
  const [open, setOpen] = useState({})

  const loadRules = useCallback(async () => {
    if (tenantLoading) return
    if (!companyId) { setRulesByCategory({}); setLoading(false); return }
    setLoading(true)
    const { data, error: err } = await supabase
      .from("company_pricing_rules")
      .select("category, rule_key, value, value_kind, unit_note, rule_label, display_order")
      .eq("company_id", companyId)
      .order("display_order", { ascending: true })

    if (err) { setError(err.message); setLoading(false); return }

    const grouped = {}
    ;(data || []).forEach((row) => {
      if (!grouped[row.category]) grouped[row.category] = {}
      grouped[row.category][row.rule_key] = Number(row.value)
    })
    setRulesByCategory(grouped)
    setError(null)
    setLoading(false)
  }, [companyId, tenantLoading])

  useEffect(() => { loadRules() }, [loadRules])

  function currentValue(category, ruleKey) {
    const ek = ruleEditKey(category, ruleKey)
    if (edits[ek] !== undefined) return edits[ek]
    const v = rulesByCategory[category]?.[ruleKey]
    return v != null ? String(v) : ""
  }

  function onEdit(category, ruleKey, rawValue) {
    setEdits((prev) => ({ ...prev, [ruleEditKey(category, ruleKey)]: rawValue }))
  }

  async function saveRule(category, ruleKey) {
    const ek = ruleEditKey(category, ruleKey)
    const raw = edits[ek]
    if (raw === undefined) return
    const val = parseFloat(raw)
    if (isNaN(val) || val < 0) return

    setSaving((prev) => ({ ...prev, [ek]: true }))
    const { data: updated, error: err } = await supabase
      .from("company_pricing_rules")
      .update({ value: val, updated_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .eq("category", category)
      .eq("rule_key", ruleKey)
      .select("id")

    if (err) {
      alert("Could not save: " + err.message)
    } else if (!updated || updated.length === 0) {
      alert(`No pricing row found for "${category} / ${ruleKey}". Run migration 011 to seed pricing rules.`)
    } else {
      setRulesByCategory((prev) => ({
        ...prev,
        [category]: { ...(prev[category] || {}), [ruleKey]: val },
      }))
      setEdits((prev) => { const n = { ...prev }; delete n[ek]; return n })
      setSaved((prev) => ({ ...prev, [ek]: true }))
      setTimeout(() => setSaved((prev) => { const n = { ...prev }; delete n[ek]; return n }), 2000)
    }
    setSaving((prev) => { const n = { ...prev }; delete n[ek]; return n })
  }

  async function saveSectionAll(category, ruleKeys) {
    for (const rk of ruleKeys) {
      if (edits[ruleEditKey(category, rk)] !== undefined) await saveRule(category, rk)
    }
  }

  function PriceInput({ category, ruleKey, label, unit, isThreshold }) {
    const ek = ruleEditKey(category, ruleKey)
    const isEdited = edits[ek] !== undefined
    const isSaving = saving[ek]
    const justSaved = saved[ek]
    const hasNoData = rulesByCategory[category] == null
    return (
      <div className="flex items-center justify-between py-3 border-b border-[#F0F4F8] last:border-0 gap-3">
        <span className="text-sm text-[#374151] flex-1">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          {hasNoData ? (
            <span className="text-xs text-[#9CA3AF] italic">Run migration 011</span>
          ) : (
            <>
              <span className="text-xs text-[#9CA3AF]">PKR</span>
              <input
                type="number"
                min="0"
                value={currentValue(category, ruleKey)}
                onChange={(e) => onEdit(category, ruleKey, e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRule(category, ruleKey)}
                className="w-24 rounded-lg border border-[#D1DDE8] text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] text-[#111111] font-mono"
              />
              <span className="text-xs text-[#9CA3AF] w-16 shrink-0">{unit}</span>
            </>
          )}
          {justSaved ? (
            <span className="text-green-600 text-xs font-medium w-12">✓ Saved</span>
          ) : (
            <button
              onClick={() => saveRule(category, ruleKey)}
              disabled={!isEdited || isSaving || hasNoData}
              className="text-xs font-medium px-3 py-1.5 rounded-lg bg-[#0071BD] text-white hover:bg-[#005a99] disabled:opacity-30 disabled:cursor-not-allowed transition w-12"
            >
              {isSaving ? "…" : "Save"}
            </button>
          )}
        </div>
      </div>
    )
  }

  function HomeGrid({ category }) {
    const allRuleKeys = HOME_SIZES.flatMap((sz) => HOME_ROOMS.map((rm) => `${sz.key}_${rm.key}`))
    const anyDirty = allRuleKeys.some((rk) => edits[ruleEditKey(category, rk)] !== undefined)
    return (
      <div>
        {HOME_SIZES.map((sz) => (
          <div key={sz.key} className="mb-4">
            <div className="px-3 py-2 bg-[#F7F9FC] rounded-t-lg flex items-center gap-2 border border-[#E5EAF0]">
              <span className="text-xs font-semibold text-[#374151] uppercase tracking-wide">{sz.label}</span>
              <span className="text-xs text-[#9CA3AF]">{sz.sub}</span>
            </div>
            <div className="border border-t-0 border-[#E5EAF0] rounded-b-lg overflow-hidden px-4">
              {HOME_ROOMS.map((rm) => (
                <PriceInput
                  key={rm.key}
                  category={category}
                  ruleKey={`${sz.key}_${rm.key}`}
                  label={rm.label}
                  unit="/room"
                />
              ))}
            </div>
          </div>
        ))}
        {anyDirty && (
          <div className="flex justify-end mt-2">
            <Btn size="sm" onClick={() => saveSectionAll(category, allRuleKeys)}>
              Save All Changes
            </Btn>
          </div>
        )}
      </div>
    )
  }

  return (
    <DashboardLayout>
      <Head><title>Pricing – CleanerX</title></Head>

      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Pricing</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">
          Configure rates for each service category. Changes appear immediately on your customer
          booking form.
        </p>
      </div>

      {(loading || tenantLoading) && <p className="text-[#6B7280] text-sm">Loading pricing…</p>}
      {error && (
        <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          Could not load pricing: {error}
        </p>
      )}

      {!loading && !tenantLoading && !error && Object.keys(rulesByCategory).length === 0 && companyId && (
        <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm p-8 max-w-lg text-center">
          <p className="text-[#6B7280]">No pricing rules found.</p>
          <p className="text-xs text-[#9CA3AF] mt-1">
            Run migrations 011 and 012 in your Supabase SQL editor to seed default pricing.
          </p>
        </div>
      )}

      {!loading && !tenantLoading && !error && Object.keys(rulesByCategory).length > 0 && (
        <div className="flex flex-col gap-3 max-w-3xl">
          {SECTIONS.map((section) => {
            const isOpen = !!open[section.category]
            return (
              <div
                key={section.category}
                className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm overflow-hidden"
              >
                {/* Accordion header */}
                <button
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#F7F9FC] transition-colors"
                  onClick={() => setOpen((o) => ({ ...o, [section.category]: !o[section.category] }))}
                >
                  <div className="w-10 h-10 rounded-xl bg-[#EBF4FB] flex items-center justify-center shrink-0">
                    <ServiceIcon type={section.iconKey} size={22} color="#0071BD" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-[#111111] text-sm">{section.title}</p>
                    {rulesByCategory[section.category] != null && (
                      <p className="text-xs text-[#6B7280] mt-0.5">
                        {section.rules
                          ? `${section.rules.length} pricing rules`
                          : `${HOME_ROOMS.length * HOME_SIZES.length} room rates`}
                      </p>
                    )}
                  </div>
                  {rulesByCategory[section.category] == null && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      No data — run migrations
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    className={cn("text-[#9CA3AF] transition-transform", isOpen && "rotate-180")}
                  />
                </button>

                {/* Accordion body */}
                {isOpen && (
                  <div className="border-t border-[#E5EAF0] px-5 py-4">
                    {section.type === "table" && section.rules && (
                      <div>
                        {section.rules.map((rule) => (
                          <PriceInput
                            key={rule.key}
                            category={section.category}
                            ruleKey={rule.key}
                            label={rule.label}
                            unit={rule.unit}
                            isThreshold={rule.kind === "threshold"}
                          />
                        ))}
                      </div>
                    )}
                    {section.type === "home" && <HomeGrid category={section.category} />}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </DashboardLayout>
  )
}
