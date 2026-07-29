import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './lib/env'

// Authentication-only middleware.
// Protects /dashboard/*, /platform/*, /admin/*.
// Unauthenticated requests are redirected to /login.
// No role checking — that is handled at the page level.
export async function middleware(request) {
  const { pathname } = request.nextUrl

  // /admin/login is the Platform Admin login page itself — it must stay
  // reachable while unauthenticated, otherwise it redirects back to /login
  // before it can ever render.
  if (pathname === '/admin/login') {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  // TEMP DEBUG — visible in the workflow/server logs
  console.log(
    `[MW] ${pathname} | user=${user?.id ?? 'none'} | error=${userError?.message ?? 'none'}`
  )

  if (!user) {
    // /admin/* routes belong to the platform super-admin; send unauthenticated
    // requests there to /admin/login, not to the company /login page.
    const isAdminPath = pathname.startsWith('/admin/')
    const loginPath = isAdminPath ? '/admin/login' : '/login'
    const loginUrl = new URL(loginPath, request.url)
    loginUrl.searchParams.set('redirect', pathname)
    console.log(`[MW] → redirect to ${loginPath} (unauthenticated)`)
    return NextResponse.redirect(loginUrl)
  }

  console.log(`[MW] → allow (authenticated)`)
  return response
}

export const config = {
  matcher: ['/dashboard/:path*', '/platform/:path*', '/admin/:path*'],
}
