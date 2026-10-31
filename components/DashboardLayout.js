// DashboardLayout — Company Portal shell.
// Matches Figma's DashLayout exactly: white sidebar (w-60), white topbar (h-14),
// bg-[#F7F9FC] main area. Active nav uses per-tenant primary color (falls back
// to Figma's #0071BD). All auth/logout/session logic preserved from the old
// Header + Sidebar components.
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/router"
import {
  LayoutDashboard, BookOpen, Building2, Phone,
  CreditCard, Wrench, LogOut, Menu, Bell, ChevronDown,
} from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { useTenant } from "../contexts/TenantContext"
import { useImpersonation } from "../contexts/ImpersonationContext"
import { CleanerXLogo } from "./ui/AuthKit"

const NAV_LINKS = [
  { label: "Dashboard",       href: "/dashboard",                  icon: <LayoutDashboard size={18} /> },
  { label: "Bookings",        href: "/dashboard/bookings",         icon: <BookOpen size={18} /> },
  { label: "Contact",         href: "/dashboard/contact",          icon: <Phone size={18} /> },
  { label: "Pricing",         href: "/dashboard/pricing",          icon: <CreditCard size={18} /> },
  { label: "Services",        href: "/dashboard/services",         icon: <Wrench size={18} /> },
  { label: "Company Profile", href: "/dashboard/company-profile",  icon: <Building2 size={18} /> },
]

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "CX"
}

export default function DashboardLayout({ children }) {
  const router = useRouter()
  const { logout, user, profile, isLoading, isAuthenticated, profileReady, profileError, role } = useAuth()
  const { companyName, companyLogo, companyTheme, companySettings } = useTenant()
  const { isImpersonating, impersonatedCompanyName, exitImpersonation } = useImpersonation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // Active nav color: use the company's primary color so branding is preserved
  const PRIMARY = companyTheme || "#0071BD"

  const displayName = profile?.full_name || user?.email || "User"
  const companyInitials = initials(companyName || "")
  const userInitial = displayName.charAt(0).toUpperCase()

  async function handleLogout() {
    await logout()
    router.replace("/login")
  }

  // Redirect unauthenticated users only after auth + profile are fully resolved.
  useEffect(() => {
    if (isLoading || !profileReady) return
    if (!isAuthenticated) {
      router.replace("/login")
    }
  }, [isLoading, profileReady, isAuthenticated, router])

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [router.pathname])

  // ── Loading gate ──────────────────────────────────────────────────────────
  // Spin until both auth session AND profile row are resolved so the layout
  // never renders with role=null and flashes an error screen.
  if (isLoading || (isAuthenticated && !profileReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated) return null

  return (
    <div className="flex h-screen bg-[#F7F9FC] overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* ── Sidebar ─────────────────────────────────────────── */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-[#E5EAF0] flex flex-col shadow-sm",
          "transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        {/* Company identity */}
        <div className="px-5 py-4 border-b border-[#E5EAF0] flex items-center gap-3">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt={companyName || "Company"}
              className="w-9 h-9 rounded-lg object-contain border border-[#E5EAF0] shrink-0"
            />
          ) : (
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: PRIMARY }}
            >
              {companyInitials || "CX"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-bold text-[#111111] truncate leading-tight">
              {companyName || "Company Portal"}
            </p>
            <p className="text-[10px] text-[#9CA3AF] uppercase tracking-widest font-medium">
              Company Portal
            </p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto flex flex-col gap-1">
          {NAV_LINKS.map((link) => {
            const active =
              link.href === "/dashboard"
                ? router.pathname === "/dashboard"
                : router.pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left",
                  active
                    ? "text-white shadow-sm"
                    : "text-[#6B7280] hover:bg-[#F0F4F8] hover:text-[#111111]",
                ].join(" ")}
                style={
                  active
                    ? { background: PRIMARY, boxShadow: "0 0 14px rgba(56,182,255,0.35)" }
                    : {}
                }
              >
                <span className={active ? "text-white" : "text-[#9CA3AF]"}>{link.icon}</span>
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* Logout */}
        <div className="px-3 py-4 border-t border-[#E5EAF0]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-red-50 hover:text-red-600 transition-colors w-full"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main ────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="h-14 bg-white border-b border-[#E5EAF0] flex items-center px-4 gap-2 shrink-0">
          <button
            className="lg:hidden min-w-11 min-h-11 p-2 rounded-lg hover:bg-gray-100 shrink-0 inline-flex items-center justify-center"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Open company navigation"
          >
            <Menu size={18} />
          </button>

          {/* Mobile quick-nav: all tabs except Dashboard, icon-only */}
          <nav className="lg:hidden flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
            {NAV_LINKS.filter((l) => l.href !== "/dashboard").map((link) => {
              const active =
                link.href === "/dashboard"
                  ? router.pathname === "/dashboard"
                  : router.pathname.startsWith(link.href)
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  className={[
                     "shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[44px] min-h-[44px]",
                    active ? "text-white" : "text-[#9CA3AF] hover:bg-[#F0F4F8] hover:text-[#374151]",
                  ].join(" ")}
                  style={active ? { background: PRIMARY } : {}}
                >
                  {link.icon}
                  <span className="text-[9px] font-medium leading-none">
                    {link.label === "Company Profile" ? "Profile" : link.label}
                  </span>
                </Link>
              )
            })}
          </nav>

          <div className="hidden lg:flex flex-1" />

          {/* User menu */}
          <div className="relative pl-2 border-l border-[#E5EAF0]">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 hover:bg-gray-50 rounded-lg pr-1 py-1"
            >
              {companyLogo ? (
                <img
                  src={companyLogo}
                  alt={companyName || "Company"}
                  className="w-8 h-8 rounded-full object-contain border border-[#E5EAF0]"
                />
              ) : (
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: PRIMARY }}
                >
                  {companyInitials}
                </div>
              )}
              <div className="hidden md:flex flex-col items-start">
                <span className="text-xs font-medium text-[#111111]">
                  {companyName || "Company"}
                </span>
                <span className="text-[10px] text-[#9CA3AF]">{user?.email}</span>
              </div>
              <ChevronDown size={14} className="text-[#9CA3AF]" />
            </button>

            {menuOpen && (
              <div
                className="absolute right-0 mt-2 w-48 bg-white border border-[#E5EAF0] rounded-xl shadow-lg py-1 z-10 anim-drop-in"
                onMouseLeave={() => setMenuOpen(false)}
              >
                <button className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[#374151] hover:bg-[#F7F9FC]">
                  <Bell size={15} className="text-[#6B7280]" />
                  Notifications
                </button>
                <div className="my-1 border-t border-[#E5EAF0]" />
                <Link
                  href="/dashboard/company-profile"
                  className="block px-4 py-2 text-sm text-[#374151] hover:bg-[#F7F9FC]"
                >
                  Company Profile
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-[#F7F9FC]"
                >
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Impersonation banner */}
        {isImpersonating && (
          <div className="shrink-0 bg-amber-500 text-white text-sm flex items-center justify-between gap-3 px-4 py-2">
            <span className="font-medium">
              👁 Viewing as <strong>{impersonatedCompanyName}</strong> — Admin View
            </span>
            <button
              onClick={exitImpersonation}
              className="bg-white text-amber-700 font-semibold text-xs px-3 py-1 rounded-lg hover:bg-amber-50 transition-colors shrink-0"
            >
              Exit
            </button>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6 anim-page-in">{children}</main>
      </div>
    </div>
  )
}
