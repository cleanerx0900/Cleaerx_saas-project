import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Shield, Lock } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLayout, Btn, Inp, AlertBanner } from '../components/ui/AuthKit'

// Forced first-login password change. Shown when the authenticated user's
// Auth metadata has must_change_password: true (set at provisioning time by
// /api/admin/create-company). Not linked from anywhere in the nav — reached
// only via the redirect below or the login pages.
export default function ChangePasswordPage() {
  const router = useRouter()
  const { user, role, isAuthenticated, isLoading, completeForcedPasswordChange } = useAuth()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated) {
      router.replace('/login')
      return
    }
    // If the flag is already cleared (e.g. user navigated here directly
    // after already changing their password), send them onward.
    if (!user?.user_metadata?.must_change_password) {
      router.replace(roleDefault(role))
    }
  }, [isLoading, isAuthenticated, user, role])

  function roleDefault(userRole) {
    if (userRole === 'super_admin') return '/admin'
    if (userRole === 'company_owner' || userRole === 'company_staff') return '/dashboard'
    return '/'
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 8) {
      setErrorMsg('Password must be at least 8 characters.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setSaving(true)
    const result = await completeForcedPasswordChange(password)
    setSaving(false)

    if (!result.success) {
      setErrorMsg(result.error)
      return
    }

    router.replace(roleDefault(role))
  }

  return (
    <>
      <Head>
        <title>Set Your Password</title>
      </Head>
      <AuthLayout>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-5 flex items-start gap-2">
          <Shield size={16} className="text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-700">You must change your password before continuing.</p>
        </div>
        <h1 className="text-xl font-bold text-[#111111] mb-1">Change Password</h1>
        <p className="text-sm text-[#6B7280] mb-5">For security, choose a new password before continuing.</p>

        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <Inp label="New Password" type="password" value={password} onChange={setPassword} placeholder="••••••••" icon={<Lock size={16} />} required autoComplete="new-password" />
            <Inp label="Confirm New Password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="••••••••" icon={<Lock size={16} />} required autoComplete="new-password" />
            {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}
            <Btn type="submit" size="lg" className="w-full" disabled={saving}>
              {saving ? 'Saving...' : 'Update Password & Continue'}
            </Btn>
          </div>
        </form>
      </AuthLayout>
    </>
  )
}
