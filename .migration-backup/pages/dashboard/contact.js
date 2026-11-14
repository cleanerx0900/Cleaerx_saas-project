import { useEffect, useState } from "react"
import { MessageCircle, Phone, ExternalLink } from "lucide-react"
import DashboardLayout from "../../components/DashboardLayout"
import { useAuth } from "../../contexts/AuthContext"
import { useTenant } from "../../contexts/TenantContext"
import { Btn, Inp } from "../../components/ui/AuthKit"
import supabase from "../../lib/supabaseClient"

// Company Owner-facing contact management. WhatsApp number and phone are
// the ONLY numbers the public booking page ever shows a customer.
export default function ContactPage() {
  const { companyId: authCompanyId } = useAuth()
  const { companySettings, companySlug, isLoading: tenantLoading, refreshCompany } = useTenant()

  const [form, setForm] = useState({ whatsapp_number: "", phone: "" })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (tenantLoading) return
    setForm({
      whatsapp_number: companySettings?.whatsapp_number || "",
      phone: companySettings?.phone || "",
    })
    setLoading(false)
  }, [tenantLoading, companySettings])

  async function saveContact(e) {
    e.preventDefault()
    if (!authCompanyId) { setError("No company linked to your account."); return }
    setSaving(true)
    setSuccess(false)
    setError(null)

    const { error: settingsError } = await supabase.from("company_settings").upsert(
      {
        company_id: authCompanyId,
        whatsapp_number: form.whatsapp_number.trim() || null,
        phone: form.phone.trim() || null,
      },
      { onConflict: "company_id" }
    )

    if (settingsError) setError(settingsError.message)
    else { setSuccess(true); refreshCompany() }
    setSaving(false)
  }

  return (
    <DashboardLayout>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-[#111111]">Contact Information</h1>
        <p className="text-sm text-[#6B7280] mt-0.5">Displayed on your public booking page</p>
      </div>

      <div className="bg-white rounded-2xl border border-[#E5EAF0] shadow-sm p-6 max-w-md">
        {loading || tenantLoading ? (
          <p className="text-[#6B7280] text-sm">Loading…</p>
        ) : (
          <form onSubmit={saveContact} className="flex flex-col gap-4">
            <Inp
              label="WhatsApp Number"
              placeholder="+92 300 1234567"
              icon={<MessageCircle size={15} />}
              value={form.whatsapp_number}
              onChange={(v) => setForm({ ...form, whatsapp_number: v })}
            />
            <Inp
              label="Phone Number"
              placeholder="+92 42 1234567"
              icon={<Phone size={15} />}
              value={form.phone}
              onChange={(v) => setForm({ ...form, phone: v })}
            />

            <div className="bg-[#EBF4FB] rounded-xl p-3 text-sm text-[#0071BD] flex items-start gap-2">
              <ExternalLink size={15} className="mt-0.5 shrink-0" />
              <span>
                Customers will see these contact details on your public booking page
                {companySlug ? (
                  <> at <strong>/company/{companySlug}/book</strong></>
                ) : (
                  "."
                )}
              </span>
            </div>

            {error && (
              <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {error}
              </p>
            )}
            {success && (
              <p className="text-green-600 text-sm bg-green-50 border border-green-200 rounded-xl px-3 py-2">
                Contact info saved!
              </p>
            )}

            <Btn type="submit" disabled={saving} className="self-start">
              {saving ? "Saving…" : "Save Contact Info"}
            </Btn>
          </form>
        )}
      </div>
    </DashboardLayout>
  )
}
