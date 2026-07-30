/**
 * ImpersonationContext
 *
 * Tracks whether the currently logged-in super_admin is impersonating a company.
 * Calls /api/admin/impersonate/status on mount (and after explicit refresh)
 * to read the server-side signed cookie.
 *
 * Consumers:
 *   - DashboardLayout: show the impersonation banner and "Exit" button
 *   - TenantContext: use the impersonated companyId instead of the auth companyId
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import { useRouter } from 'next/router'

const ImpersonationContext = createContext(undefined)

export function ImpersonationProvider({ children }) {
  const { role, isAuthenticated, isLoading: authLoading } = useAuth()
  const router = useRouter()

  const [isImpersonating, setIsImpersonating] = useState(false)
  const [impersonatedCompanyId, setImpersonatedCompanyId] = useState(null)
  const [impersonatedCompanyName, setImpersonatedCompanyName] = useState(null)
  const [impersonatedCompanySlug, setImpersonatedCompanySlug] = useState(null)
  const [isLoading, setIsLoading] = useState(true) // loading the status call

  // Check impersonation status from the server.
  // Called on mount and can be re-called after exitImpersonation.
  const checkStatus = useCallback(async () => {
    // Only super_admin can have an impersonation session
    if (!isAuthenticated || role !== 'super_admin') {
      setIsImpersonating(false)
      setImpersonatedCompanyId(null)
      setImpersonatedCompanyName(null)
      setImpersonatedCompanySlug(null)
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch('/api/admin/impersonate/status')
      const data = await res.json()
      if (data.active) {
        setIsImpersonating(true)
        setImpersonatedCompanyId(data.companyId)
        setImpersonatedCompanyName(data.companyName)
        setImpersonatedCompanySlug(data.companySlug)
      } else {
        setIsImpersonating(false)
        setImpersonatedCompanyId(null)
        setImpersonatedCompanyName(null)
        setImpersonatedCompanySlug(null)
      }
    } catch {
      setIsImpersonating(false)
    } finally {
      setIsLoading(false)
    }
  }, [isAuthenticated, role])

  useEffect(() => {
    if (authLoading) return // wait until auth is resolved
    setIsLoading(true)
    checkStatus()
  }, [authLoading, checkStatus])

  // Called by the "Exit Admin View" button in DashboardLayout.
  const exitImpersonation = useCallback(async () => {
    try {
      await fetch('/api/admin/impersonate/exit', { method: 'POST' })
    } catch {
      // best-effort; navigate away regardless
    }
    setIsImpersonating(false)
    setImpersonatedCompanyId(null)
    setImpersonatedCompanyName(null)
    setImpersonatedCompanySlug(null)
    router.replace('/admin')
  }, [router])

  const value = {
    isImpersonating,
    isLoading,
    impersonatedCompanyId,
    impersonatedCompanyName,
    impersonatedCompanySlug,
    exitImpersonation,
    refreshStatus: checkStatus,
  }

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  )
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext)
  if (ctx === undefined) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider')
  }
  return ctx
}
