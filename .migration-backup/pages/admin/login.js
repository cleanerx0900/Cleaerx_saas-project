import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Mail, Lock, Eye, EyeOff, Shield } from 'lucide-react'
import { useAuth } from '../../contexts/AuthContext'
import { AuthLayout, Btn, Inp, AlertBanner } from '../../components/ui/AuthKit'

export default function AdminLoginPage() {
  const router = useRouter()
  const { login, logout, isAuthenticated, isLoading: authLoading, role, user } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (!authLoading && isAuthenticated && role !== null) {
      // Admin Login is for super_admin only — reject company_owner /
      // company_staff instead of granting them dashboard access from here.
      if (role !== 'super_admin') {
        logout()
        setErrorMsg('This login is for platform administrators only.')
        return
      }
      if (user?.user_metadata?.must_change_password) {
        router.replace('/change-password')
        return
      }
      router.replace('/admin')
    }
  }, [authLoading, isAuthenticated, role, user])

  async function handleLogin(e) {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)
    // Guard against `login()` throwing (e.g. the request itself failing
    // rather than resolving with a Supabase error object) — otherwise an
    // exception here skips setLoading(false) and the button stays stuck on
    // "Logging in..." forever with no visible error.
    let result
    try {
      result = await login({ email, password, remember: true })
    } catch (err) {
      setLoading(false)
      setErrorMsg('Could not reach the server. Please check your connection and try again.')
      return
    }
    setLoading(false)
    if (!result.success) {
      setErrorMsg(result.error)
      return
    }
    // Admin Login is for super_admin only.
    if (result.profile.role !== 'super_admin') {
      await logout()
      setErrorMsg('This login is for platform administrators only.')
      return
    }
    if (result.user?.user_metadata?.must_change_password) {
      router.replace('/change-password')
      return
    }
    router.replace('/admin')
  }

  return (
    <>
      <Head>
        <title>Admin Login</title>
      </Head>
      <AuthLayout isAdmin>
        <div className="flex items-center gap-2 mb-5 anim-slide-up anim-delay-2">
          <div className="px-2.5 py-1 bg-[#001f3f] text-[#38B6FF] text-xs font-bold rounded-md border border-[#38B6FF]/30 tracking-wider">ADMIN</div>
          <span className="text-xs text-[#6B7280]">Restricted — Platform Administrators Only</span>
        </div>

        <div className="anim-slide-up anim-delay-2">
          <h1 className="text-2xl font-bold text-[#111111] mb-1">Platform Admin Login</h1>
          <p className="text-sm text-[#6B7280] mb-6">Manage companies, billing, and platform settings</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="flex flex-col gap-4">
            <div className="anim-slide-up anim-delay-3">
              <Inp label="Admin Email" type="email" value={email} onChange={setEmail} placeholder="admin@cleanerx.io" icon={<Mail size={16} />} required autoComplete="email" />
            </div>
            <div className="anim-slide-up anim-delay-3">
              <Inp
                label="Password" type={showPassword ? 'text' : 'password'} value={password} onChange={setPassword}
                placeholder="••••••••" icon={<Lock size={16} />} required autoComplete="current-password"
                rightEl={
                  <button type="button" onClick={() => setShowPassword(v => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors duration-150">
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
            </div>
            {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}
            <div className="anim-slide-up anim-delay-4">
              <Btn type="submit" size="lg" className="w-full mt-1" disabled={loading} loading={loading}>
                <Shield size={16} />{loading ? 'Logging in…' : 'Login as Admin'}
              </Btn>
            </div>
          </div>
        </form>
        <p className="text-center text-sm text-[#6B7280] mt-5 anim-slide-up anim-delay-4">
          <Link href="/login" className="text-[#0071BD] hover:underline font-medium transition-colors duration-150">Company Login</Link>
        </p>
      </AuthLayout>
    </>
  )
}
