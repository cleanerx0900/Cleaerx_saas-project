import { createBrowserClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env'

// Session storage: use @supabase/ssr's default cookie-based storage.
//
// IMPORTANT: do NOT override `auth.storage` here with a custom
// localStorage/sessionStorage adapter.  The server-side middleware uses
// `createServerClient` which reads session tokens from request cookies.
// If the browser client stores tokens in localStorage instead, the
// middleware never finds them and redirects every /admin/* request to the
// login page — even immediately after a successful sign-in.
//
// "Remember me" is handled separately via `setRememberMe` which writes a
// plain flag to localStorage; the flag is available to the login form but
// does NOT affect where session tokens are stored (they always go to
// cookies via @supabase/ssr).
const REMEMBER_FLAG_KEY = 'cleanerx-remember-me'

const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  // The Replit preview renders this app inside a cross-origin iframe. With
  // the library's default `sameSite: 'lax'` cookie, browsers treat writes
  // from inside that iframe as a cross-site context and refuse to persist
  // the auth session cookie, so `getSession()` comes back empty immediately
  // after a successful sign-in. `sameSite: 'none'` (which requires `secure`)
  // allows the session cookie to be set/read inside the embedded preview,
  // while still working the same way in a normal top-level tab.
  cookieOptions: {
    sameSite: 'none',
    secure: true,
  },
})

// TEMP DEBUG (runtime audit — remove after diagnosis): confirm which
// project/key this browser client instance actually resolved, without
// printing the full secret value.
if (typeof window !== 'undefined') {
  console.log('[DEBUG supabaseClient] resolved URL:', SUPABASE_URL)
  console.log(
    '[DEBUG supabaseClient] anon key fingerprint:',
    SUPABASE_ANON_KEY ? `${SUPABASE_ANON_KEY.slice(0, 12)}...len=${SUPABASE_ANON_KEY.length}` : 'MISSING'
  )
}

export function setRememberMe(remember) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(REMEMBER_FLAG_KEY, remember ? 'true' : 'false')
}

export default supabase
