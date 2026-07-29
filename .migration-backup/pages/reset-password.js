import { useState, useEffect } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import supabase from '../lib/supabaseClient'
import { AuthLayout, Btn, Inp, AlertBanner } from '../components/ui/AuthKit'

export default function ResetPasswordPage() {
  const router = useRouter()
  const { updatePassword, logout } = useAuth()
  const [hasRecoverySession, setHasRecoverySession] = useState(null) // null = checking
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [done, setDone] = useState(false)
  const [showPw1, setShowPw1] = useState(false)
  const [showPw2, setShowPw2] = useState(false)

  useEffect(() => {
    // Supabase's browser client auto-detects the recovery token in the URL
    // hash (detectSessionInUrl: true) and turns it into a real session.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasRecoverySession(!!session)
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.')
      return
    }
    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match.')
      return
    }

    setLoading(true)
    const result = await updatePassword(password)
    setLoading(false)

    if (!result.success) {
      setErrorMsg(result.error)
      return
    }
    setDone(true)
    await logout()
    setTimeout(() => router.replace('/login'), 2000)
  }

  return (
    <>
      <Head>
        <title>Reset Password</title>
      </Head>
      <AuthLayout>
        <h1 className="text-2xl font-bold text-[#111111] mb-1">Reset Password</h1>
        <p className="text-sm text-[#6B7280] mb-6">Create a new password for your account</p>

        {hasRecoverySession === null && (
          <p className="text-sm text-[#9CA3AF]">Verifying link...</p>
        )}

        {hasRecoverySession === false && (
          <AlertBanner tone="error">
            This link is invalid or has expired.{' '}
            <a href="/forgot-password" className="font-semibold underline">Request a new link</a>
          </AlertBanner>
        )}

        {hasRecoverySession === true && !done && (
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              <Inp
                label="New Password" type={showPw1 ? 'text' : 'password'} value={password} onChange={setPassword}
                placeholder="••••••••" icon={<Lock size={16} />} required autoComplete="new-password"
                rightEl={<button type="button" onClick={() => setShowPw1(v => !v)} className="text-[#9CA3AF] hover:text-[#6B7280]">{showPw1 ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
              <Inp
                label="Confirm Password" type={showPw2 ? 'text' : 'password'} value={confirmPassword} onChange={setConfirmPassword}
                placeholder="••••••••" icon={<Lock size={16} />} required autoComplete="new-password"
                rightEl={<button type="button" onClick={() => setShowPw2(v => !v)} className="text-[#9CA3AF] hover:text-[#6B7280]">{showPw2 ? <EyeOff size={16} /> : <Eye size={16} />}</button>}
              />
              {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}
              <Btn type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? 'Saving...' : 'Update Password'}
              </Btn>
            </div>
          </form>
        )}

        {done && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-700">Password updated successfully.</p>
            <p className="text-xs text-green-600 mt-1">Redirecting to login...</p>
          </div>
        )}
      </AuthLayout>
    </>
  )
}
