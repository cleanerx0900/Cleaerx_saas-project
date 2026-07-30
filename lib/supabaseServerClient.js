import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env'

// Server-side Supabase client for use inside pages/api/* (Node.js runtime,
// NextApiRequest/NextApiResponse). Reads the session from the request's
// cookies and, if Supabase refreshes tokens during the call, writes updated
// cookies back onto the response. Runs with the anon key, so all queries are
// still subject to RLS as the calling user — this is NOT the admin client.
export function createSupabaseApiClient(req, res) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    // Must match the cookieOptions used by the browser client (see
    // lib/supabaseClient.js) so any token refresh performed here writes
    // cookies with the same SameSite/Secure attributes the browser expects.
    cookieOptions: {
      sameSite: 'none',
      secure: true,
    },
    cookies: {
      getAll() {
        return parseCookieHeader(req.headers.cookie ?? '')
      },
      setAll(cookiesToSet) {
        const existing = res.getHeader('Set-Cookie')
        const existingArr = existing ? (Array.isArray(existing) ? existing : [existing]) : []
        const newCookies = cookiesToSet.map(({ name, value, options }) =>
          serializeCookieHeader(name, value, options)
        )
        res.setHeader('Set-Cookie', [...existingArr, ...newCookies])
      },
    },
  })
}
