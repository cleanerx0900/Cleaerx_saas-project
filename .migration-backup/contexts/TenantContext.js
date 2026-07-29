import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import supabase from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const TenantContext = createContext(undefined)

// Derives a minimal status from the current `companies.is_active` boolean.
// The full multi-state company lifecycle (pending/active/suspended/etc.) is
// part of the Company Management module and has not been built yet — this
// is intentionally a 2-state placeholder until that module lands.
function deriveCompanyStatus(company) {
  if (!company) return null
  return company.is_active ? 'active' : 'suspended'
}

export function TenantProvider({ children }) {
  const { companyId, role, isAuthenticated } = useAuth()
  const [company, setCompany] = useState(null)
  const [settings, setSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)

  const [subscription, setSubscription] = useState(null)

  const loadCompany = useCallback(async (id) => {
    if (!id) {
      setCompany(null)
      setSettings(null)
      setSubscription(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    const [companyRes, settingsRes, subscriptionRes] = await Promise.all([
      supabase.from('companies').select('id, slug, name, is_active').eq('id', id).maybeSingle(),
      supabase
        .from('company_settings')
        .select('logo_url, primary_color, secondary_color, accent_color, currency, timezone, email, phone, whatsapp_number, city, country')
        .eq('company_id', id)
        .maybeSingle(),
      // Subscription system (sql/migrations/004_subscriptions.sql): the
      // `active_subscriptions` view resolves this company's current active
      // plan + its feature flags in one row. No active row = no premium
      // features (safe default, not "unlimited").
      supabase
        .from('active_subscriptions')
        .select('plan_name, plan_slug, features')
        .eq('company_id', id)
        .maybeSingle(),
    ])

    if (companyRes.error) {
      setError(companyRes.error.message)
    } else {
      setError(null)
      setCompany(companyRes.data)
    }
    setSettings(settingsRes.data ?? null)
    setSubscription(subscriptionRes.data ?? null)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    // super_admin is platform-wide and has no single tenant context.
    if (!isAuthenticated || role === 'super_admin') {
      setCompany(null)
      setSettings(null)
      setIsLoading(false)
      return
    }
    loadCompany(companyId)
  }, [isAuthenticated, role, companyId, loadCompany])

  // Feature gating: true only if the company has an active subscription
  // whose plan.features[key] is explicitly true. No active subscription
  // (expired/cancelled/never subscribed) means no premium features — this
  // fails closed, not open, so a lapsed plan can't keep gated features on.
  const planFeatures = subscription?.features ?? {}
  const hasFeature = (key) => planFeatures[key] === true

  const value = {
    // Raw objects — available for advanced consumers
    company,
    settings,
    subscription,
    // Convenience properties — always prefer these over drilling into `company`/`settings`
    // Fall back to the auth-level companyId (users.company_id) when the companies
    // table row hasn't loaded yet or the fetch returned null. This ensures the
    // services/pricing pages always have a valid UUID to query with, even if the
    // companies RLS or timing causes company to be temporarily null.
    companyId: company?.id ?? companyId ?? null,
    companyName: company?.name ?? null,
    companySlug: company?.slug ?? null,
    companyLogo: settings?.logo_url ?? null,
    companyTheme: settings?.primary_color ?? null,
    companySettings: settings,   // alias for settings; access secondary colors etc via this
    companyStatus: deriveCompanyStatus(company),
    // Subscription plan — null planSlug means no active subscription (treat as Free/no premium access)
    planName: subscription?.plan_name ?? null,
    planSlug: subscription?.plan_slug ?? null,
    planFeatures,
    hasFeature,
    isLoading,
    error,
    refreshCompany: () => loadCompany(companyId),
  }

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  const ctx = useContext(TenantContext)
  if (ctx === undefined) {
    throw new Error('useTenant must be used within a TenantProvider')
  }
  return ctx
}
