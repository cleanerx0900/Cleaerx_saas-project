/**
 * HMAC signing for the impersonation cookie.
 * Node.js only — import ONLY from pages/api/* files.
 * Never import from browser bundles, page components, or contexts.
 */
import crypto from 'crypto'

const COOKIE_NAME = 'cleanerx-imp'

/**
 * Signs an impersonation payload and returns the cookie value string.
 * Format: <base64url(JSON payload)>.<base64url(HMAC-SHA256 signature)>
 */
export function signImpersonation(payload, secret) {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  return `${payloadB64}.${sig}`
}

/**
 * Parses and verifies an impersonation cookie value.
 * Returns the payload object if valid, null otherwise.
 */
export function verifyImpersonation(cookieValue, secret) {
  if (!cookieValue || typeof cookieValue !== 'string') return null
  const dot = cookieValue.lastIndexOf('.')
  if (dot === -1) return null
  const payloadB64 = cookieValue.slice(0, dot)
  const sig = cookieValue.slice(dot + 1)
  if (!payloadB64 || !sig) return null

  const expected = crypto.createHmac('sha256', secret).update(payloadB64).digest('base64url')
  try {
    const sigBuf = Buffer.from(sig, 'base64url')
    const expBuf = Buffer.from(expected, 'base64url')
    if (sigBuf.length !== expBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null
  } catch {
    return null
  }

  try {
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export { COOKIE_NAME }
