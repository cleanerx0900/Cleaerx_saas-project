import { createClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from './env'

// Service-role Supabase client. Bypasses RLS entirely.
//
// SECURITY: Import this ONLY from files under pages/api/* (server-side).
// Never import it from a page component, a React context, or anything that
// ships to the browser bundle — doing so would leak the service_role key to
// the client. There is no client-safe way to use this module.
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceRoleKey) {
  throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY environment variable.')
}

const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export default supabaseAdmin
