import { useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { User, Mail, Lock, Eye, EyeOff } from 'lucide-react'
import supabase from '../lib/supabaseClient'
import { AuthLayout, Btn, Inp, AlertBanner } from '../components/ui/AuthKit'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSignup(e) {
    e.preventDefault()
    setErrorMsg('')
    setLoading(true)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    setLoading(false)
    if (error) {
      setErrorMsg(error.message)
      console.error("Signup error:", error.message)
    } else {
      window.location.href = "/dashboard"
    }
  }

  return (
    <>
      <Head>
        <title>Sign Up</title>
      </Head>
      <AuthLayout>
        <h1 className="text-2xl font-bold text-[#111111] mb-1">Create your account</h1>
        <p className="text-sm text-[#6B7280] mb-6">Start managing your cleaning business today</p>
        <form onSubmit={handleSignup}>
          <div className="flex flex-col gap-4">
            <Inp label="Full Name" value={fullName} onChange={setFullName} placeholder="Omar Farooq" icon={<User size={16} />} required />
            <Inp label="Email Address" type="email" value={email} onChange={setEmail} placeholder="you@company.com" icon={<Mail size={16} />} required autoComplete="email" />
            <Inp
              label="Password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              icon={<Lock size={16} />}
              required
              autoComplete="new-password"
              rightEl={
                <button type="button" onClick={() => setShowPassword((v) => !v)} className="text-[#9CA3AF] hover:text-[#6B7280]">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              }
            />
            {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}
            <Btn type="submit" size="lg" className="w-full mt-1" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Btn>
          </div>
        </form>
        <p className="text-center text-sm text-[#6B7280] mt-6">
          Already have an account?{' '}
          <Link href="/login" className="text-[#0071BD] font-medium hover:underline">Log In</Link>
        </p>
      </AuthLayout>
    </>
  )
}
