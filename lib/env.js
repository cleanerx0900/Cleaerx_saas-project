// Centralised, defensive resolution of the public Supabase env vars.
//
// These two values were pasted into the wrong Replit Secret slots at setup
// time (NEXT_PUBLIC_SUPABASE_URL held the anon JWT, NEXT_PUBLIC_SUPABASE_ANON_KEY
// held the URL). Both values are still NEXT_PUBLIC_* (safe to expose to the
// browser), so instead of relying on the slot name we detect which raw value
// is actually a URL and resolve both constants from that. This keeps the app
// working regardless of which slot holds which value, and is cheap enough to
// run in both browser and server bundles.
const rawA = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const rawB = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function isHttpUrl(value) {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))
}

export const SUPABASE_URL = isHttpUrl(rawA) ? rawA : rawB
export const SUPABASE_ANON_KEY = isHttpUrl(rawA) ? rawB : rawA

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Missing Supabase configuration: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must both be set.'
  )
}
