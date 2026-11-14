import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react'
import supabase, { setRememberMe } from '../lib/supabaseClient'

const AuthContext = createContext(undefined)

// Friendly English error messages for common Supabase auth error strings.
function friendlyAuthError(message) {
  const map = {
    'Invalid login credentials': 'Incorrect email or password.',
    'Email not confirmed': 'Please confirm your email address first.',
    'User already registered': 'This email is already registered.',
    'Password should be at least 6 characters': 'Password must be at least 6 characters.',
    'For security purposes, you can only request this after a few seconds.':
      'Please wait a moment before trying again.',
  }
  return map[message] || message
}

// The single profile SELECT used in two places — keep them in sync.
const PROFILE_SELECT = 'id, company_id, email, full_name, role, is_active, last_login_at'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)   // auth gate: true until INITIAL_SESSION resolves
  const [profileReady, setProfileReady] = useState(false) // true once profile has been attempted
  const [profileError, setProfileError] = useState(null)

  // Prevents onAuthStateChange(SIGNED_IN) from running a second concurrent
  // loadProfile() while login() is already fetching and validating the profile.
  // Without this flag, both callers race to setProfile() — whichever finishes
  // last wins, and if one returns null it wipes a valid profile.
  const loginInProgress = useRef(false)

  // ─── loadProfile ───────────────────────────────────────────────────────────
  // Fetches the users-table row and sets profile state.
  // Used ONLY by onAuthStateChange — login() fetches the profile inline.
  // Returns the profile data or null.
  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      setProfileError(null)
      setProfileReady(true)
      return null
    }

    console.log('[AUTH] loadProfile: fetching for', userId)
    const { data, error } = await supabase
      .from('users')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle()

    console.log('[AUTH] loadProfile: result', {
      ok: !error,
      role: data?.role ?? null,
      error: error?.message ?? null,
    })

    if (error) {
      setProfileError(error.message)
      setProfileReady(true)
      // Keep the stale profile so a transient DB error doesn't wipe a valid
      // role and show "Access Denied" to an authenticated user.
      console.warn('[AUTH] loadProfile: error — keeping stale profile to avoid false Access Denied', error.message)
      return null
    }

    setProfileError(null)
    setProfile(data)   // data is null when no row found (maybeSingle)
    setProfileReady(true)
    console.log('[AUTH] loadProfile: profile set, role =', data?.role ?? 'null (no row)')
    return data
  }, [])

  // ─── onAuthStateChange ─────────────────────────────────────────────────────
  // Single source of truth for session state.  Profile loading is driven here
  // for INITIAL_SESSION (page refresh / first load) and for SIGNED_IN events
  // that are NOT already being handled by login().
  //
  // TOKEN_REFRESHED is intentionally skipped — it is purely a token update;
  // the user's profile has not changed and re-fetching it races with any
  // in-flight profile load.
  useEffect(() => {
    let isMounted = true

    const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMounted) return

      console.log('[AUTH] onAuthStateChange:', event,
        '| user:', newSession?.user?.id ?? 'none',
        '| email:', newSession?.user?.email ?? 'none')

      setSession(newSession)

      if (newSession?.user) {
        // Load profile for INITIAL_SESSION (always) and for SIGNED_IN only
        // when login() is NOT already handling it.  All other events
        // (TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY) keep the existing
        // profile unchanged.
        const shouldLoad =
          event === 'INITIAL_SESSION' ||
          (event === 'SIGNED_IN' && !loginInProgress.current)

        if (shouldLoad) {
          await loadProfile(newSession.user.id)
        }
      } else {
        // SIGNED_OUT or expired session — safe to clear everything.
        console.log('[AUTH] no session — clearing profile')
        setProfile(null)
        setProfileError(null)
        setProfileReady(true)
      }

      // Release the auth loading gate once: after the very first event
      // (INITIAL_SESSION).  All subsequent events must NOT reset isLoading —
      // that would re-show the spinner mid-session.
      if (event === 'INITIAL_SESSION') {
        console.log('[AUTH] INITIAL_SESSION processed — releasing isLoading gate')
        setIsLoading(false)
      }
    })

    return () => {
      isMounted = false
      listener?.subscription?.unsubscribe()
    }
  }, [loadProfile])

  // ─── login ─────────────────────────────────────────────────────────────────
  // Authenticates the user, fetches and validates their profile inline, and
  // sets context state directly — bypassing loadProfile() to avoid the race
  // with onAuthStateChange(SIGNED_IN).
  //
  // loginInProgress is set for the duration so the SIGNED_IN listener knows
  // to skip its own profile fetch.
  const login = useCallback(async ({ email, password, remember = true }) => {
    loginInProgress.current = true
    setRememberMe(remember)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        return { success: false, error: friendlyAuthError(error.message) }
      }

      console.log('[AUTH] login: signInWithPassword ok, user.id:', data.user?.id)

      // Fetch the profile directly so we can distinguish "user not found in
      // users table" (genuinely no account) from a transient DB error.
      // Using loadProfile() here would mask that distinction via its
      // "keep stale" logic and could silently sign the user out on a hiccup.
      const { data: profileData, error: profileFetchError } = await supabase
        .from('users')
        .select(PROFILE_SELECT)
        .eq('id', data.user.id)
        .maybeSingle()

      if (profileFetchError) {
        console.error('[AUTH] login: profile fetch error', profileFetchError.message)
        await supabase.auth.signOut()
        return {
          success: false,
          error: 'Could not verify your account. Please try again.',
        }
      }

      if (!profileData) {
        console.warn('[AUTH] login: no users row for', data.user.id)
        await supabase.auth.signOut()
        return {
          success: false,
          error: 'Your account is not set up on this platform. Please contact your company administrator.',
        }
      }

      if (!profileData.is_active) {
        console.warn('[AUTH] login: account deactivated', data.user.id)
        await supabase.auth.signOut()
        return { success: false, error: 'This account has been deactivated.' }
      }

      // Profile is valid — set state immediately so layouts render correctly
      // the moment the login page navigates away.  The SIGNED_IN listener
      // will skip its own fetch because loginInProgress is still true here.
      setProfile(profileData)
      setProfileReady(true)
      setProfileError(null)

      await supabase
        .from('users')
        .update({ last_login_at: new Date().toISOString() })
        .eq('id', data.user.id)

      console.log('[AUTH] login: success, role =', profileData.role)
      return { success: true, profile: profileData, user: data.user }
    } finally {
      // Always clear the flag so future SIGNED_IN events (e.g. token re-issue
      // in another tab) are handled normally by the listener.
      loginInProgress.current = false
    }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    // onAuthStateChange(SIGNED_OUT) will clear profile/session via the listener.
    // Explicitly clearing here too for immediate UI response.
    setSession(null)
    setProfile(null)
    setProfileReady(false)
    setProfileError(null)
  }, [])

  const requestPasswordReset = useCallback(async (email) => {
    const redirectTo =
      typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) return { success: false, error: friendlyAuthError(error.message) }
    return { success: true }
  }, [])

  const updatePassword = useCallback(async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) return { success: false, error: friendlyAuthError(error.message) }
    return { success: true }
  }, [])

  const completeForcedPasswordChange = useCallback(async (newPassword) => {
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
      data: { must_change_password: false },
    })
    if (error) return { success: false, error: friendlyAuthError(error.message) }
    setSession((prev) => (prev ? { ...prev, user: data.user } : prev))
    return { success: true, user: data.user }
  }, [])

  const refreshProfile = useCallback(() => {
    if (session?.user) return loadProfile(session.user.id)
    return Promise.resolve(null)
  }, [session, loadProfile])

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    role: profile?.role ?? null,
    companyId: profile?.company_id ?? null,
    isAuthenticated: !!session?.user,
    isLoading,
    profileReady,
    profileError,
    login,
    logout,
    requestPasswordReset,
    updatePassword,
    completeForcedPasswordChange,
    refreshProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return ctx
}
