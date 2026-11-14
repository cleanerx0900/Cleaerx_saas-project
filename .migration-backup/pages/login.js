import { useState, useEffect } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Mail, Lock, Eye, EyeOff, Building2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLayout, Btn, Inp, AlertBanner } from '../components/ui/AuthKit'

const REASON_MESSAGES = {
  'session-expired': 'Your session has expired. Please log in again.',
  'no-profile': 'This account is not set up on the platform.',
}

// Validates that a redirect target is a same-origin path that actually
// resolves (after normalizing any ../ segments) into the dashboard area.
// Rejects protocol-relative URLs, absolute URLs, and traversal tricks like
// '/dashboard/../admin' that would otherwise slip past a plain startsWith check.
function isSafeDashboardRedirect(path) {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    return false
  }
  try {
    const resolved = new URL(path, 'http://internal.local')
    return resolved.pathname === '/dashboard' || resolved.pathname.startsWith('/dashboard/')
  } catch {
    return false
  }
}

export default function LoginPage() {
  const router = useRouter()
  const { login, logout, isAuthenticated, isLoading: authLoading, role, user } = useAuth()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [infoMsg, setInfoMsg]   = useState('')
  const [loading, setLoading]   = useState(false)

  useEffect(() => {
    if (router.query.reason && REASON_MESSAGES[router.query.reason]) {
      setInfoMsg(REASON_MESSAGES[router.query.reason])
    }
  }, [router.query.reason])

  useEffect(() => {
    // Wait until auth AND profile have both finished loading before redirecting.
    // isAuthenticated becomes true as soon as the session is set (before profile
    // loads), so checking role !== null ensures we have the actual role before
    // calling redirectForRole — otherwise role is null and the user lands on '/'.
    if (!authLoading && isAuthenticated && role !== null) {
      // Company Login is for company_owner / company_staff only. super_admin
      // must use /admin/login — reject it here instead of granting admin access.
      if (role === 'super_admin') {
        logout()
        setErrorMsg('Super admin accounts must sign in from the Admin Login page.')
        return
      }
      if (user?.user_metadata?.must_change_password) {
        router.replace('/change-password')
        return
      }
      redirectForRole(role)
    }
  }, [authLoading, isAuthenticated, role, user])

  function redirectForRole(userRole) {
    const requested = typeof router.query.redirect === 'string' ? router.query.redirect : null
    if (userRole === 'company_owner' || userRole === 'company_staff') {
      // Company Login only ever grants access to the company dashboard area —
      // never redirect a company user into /admin or /platform, even if that
      // was the originally-requested (pre-login) path, and even via traversal
      // tricks like '/dashboard/../admin'.
      router.replace(isSafeDashboardRedirect(requested) ? requested : '/dashboard')
    } else {
      // customer or unknown role — stay on home until customer portal is built
      router.replace('/')
    }
  }

  async function handleLogin(e) {
    e.preventDefault()
    setErrorMsg('')
    setInfoMsg('')
    setLoading(true)
    // Guard against `login()` throwing (e.g. the network request itself
    // failing/timing out rather than resolving with a Supabase error
    // object) — without this, an exception here would skip setLoading(false)
    // entirely and leave the button stuck on "Logging in..." forever with
    // no visible error.
    let result
    try {
      result = await login({ email, password, remember })
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
    // Company Login is for company_owner / company_staff only.
    if (result.profile.role === 'super_admin') {
      await logout()
      setErrorMsg('Super admin accounts must sign in from the Admin Login page.')
      return
    }
    if (result.user?.user_metadata?.must_change_password) {
      router.replace('/change-password')
      return
    }
    redirectForRole(result.profile.role)
  }

  return (
    <>
      <Head>
        <title>Company Login</title>
      </Head>
      <AuthLayout hideLogo>
        {/* Company portal identity — stagger: appears with card */}
        <div className="flex items-center gap-3 mb-6 pb-5 border-b border-[#E5EAF0] anim-slide-up anim-delay-2">
          <div className="w-10 h-10 rounded-xl bg-[#EBF4FB] flex items-center justify-center shrink-0 transition-transform duration-300 hover:scale-110">
            <Building2 size={20} className="text-[#0071BD]" />
          </div>
          <div>
            <p className="text-xs font-semibold text-[#0071BD] uppercase tracking-wider">Company Owner Portal</p>
            <p className="text-xs text-[#6B7280]">CleanerX Business Dashboard</p>
          </div>
        </div>

        <div className="anim-slide-up anim-delay-2">
          <h1 className="text-2xl font-bold text-[#111111] mb-1">Welcome back</h1>
          <p className="text-sm text-[#6B7280] mb-6">Sign in to manage your cleaning company</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="flex flex-col gap-4">
            <div className="anim-slide-up anim-delay-3">
              <Inp
                label="Email Address"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@company.com"
                icon={<Mail size={16} />}
                required
                autoComplete="email"
              />
            </div>
            <div className="anim-slide-up anim-delay-3">
              <Inp
                label="Password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={setPassword}
                placeholder="••••••••"
                icon={<Lock size={16} />}
                required
                autoComplete="current-password"
                rightEl={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    className="text-[#9CA3AF] hover:text-[#6B7280] transition-colors duration-150"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                }
              />
            </div>

            <div className="flex items-center justify-between text-sm anim-slide-up anim-delay-3">
              <label className="flex items-center gap-2 text-[#6B7280] cursor-pointer">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="cursor-pointer accent-[#0071BD]"
                />
                Remember me
              </label>
              <button
                type="button"
                onClick={() => router.push('/forgot-password')}
                className="text-sm text-[#0071BD] hover:text-[#005a99] font-medium transition-colors duration-150"
              >
                Forgot Password?
              </button>
            </div>

            {infoMsg && !errorMsg && <AlertBanner tone="success">{infoMsg}</AlertBanner>}
            {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}

            <div className="anim-slide-up anim-delay-4">
              <Btn type="submit" size="lg" className="w-full mt-1" disabled={loading} loading={loading}>
                {loading ? 'Logging in…' : 'Log In'}
              </Btn>
            </div>
          </div>
        </form>

        <div className="mt-6 border-t border-[#E5EAF0] pt-5 text-center anim-slide-up anim-delay-4">
          <p className="text-xs text-[#6B7280] mb-1">Need access? Contact your administrator</p>
          <p className="text-sm font-medium text-[#111111]">Admin Muhammad Huzaifa</p>
          <a
            href="https://wa.me/923059012761"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 mt-1 text-sm text-[#25D366] font-medium hover:underline"
          >
            {/* WhatsApp icon */}
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
              <path d="M12 0C5.373 0 0 5.373 0 12c0 2.123.554 4.118 1.528 5.849L.057 23.616a.75.75 0 0 0 .919.903l5.915-1.55A11.95 11.95 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.907 0-3.697-.512-5.238-1.406l-.374-.22-3.868 1.015 1.002-3.77-.242-.389A9.956 9.956 0 0 1 2 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z"/>
            </svg>
            +92 305 9012761
          </a>
        </div>
        <p className="text-center text-xs text-[#9CA3AF] mt-4">
          <Link href="/admin/login" className="hover:text-[#6B7280] transition-colors">Admin Login</Link>
        </p>
      </AuthLayout>
    </>
  )
}
