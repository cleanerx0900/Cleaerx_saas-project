import { useState } from 'react'
import Head from 'next/head'
import { Mail, CheckCircle, ChevronLeft } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { AuthLayout, Btn, Inp, AlertBanner } from '../components/ui/AuthKit'

export default function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [sent, setSent] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)
    const result = await requestPasswordReset(email)
    setLoading(false)
    if (!result.success) {
      setErrorMsg(result.error)
      return
    }
    setSent(true)
  }

  return (
    <>
      <Head>
        <title>Forgot Password</title>
      </Head>
      <AuthLayout>
        <h1 className="text-2xl font-bold text-[#111111] mb-1">Forgot Password?</h1>
        <p className="text-sm text-[#6B7280] mb-6">Enter your email and we'll send you a reset link</p>

        {sent ? (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <CheckCircle size={32} className="text-green-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-green-700">Reset link sent!</p>
            <p className="text-xs text-green-600 mt-1">If this email is registered, check your inbox.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="flex flex-col gap-4">
              <Inp label="Email Address" type="email" value={email} onChange={setEmail} placeholder="you@company.com" icon={<Mail size={16} />} required autoComplete="email" />
              {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}
              <Btn type="submit" size="lg" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Btn>
            </div>
          </form>
        )}

        <p className="text-center text-sm text-[#6B7280] mt-6">
          <a href="/login" className="text-[#0071BD] font-medium hover:underline inline-flex items-center gap-1">
            <ChevronLeft size={14} />Back to Login
          </a>
        </p>
      </AuthLayout>
    </>
  )
}
