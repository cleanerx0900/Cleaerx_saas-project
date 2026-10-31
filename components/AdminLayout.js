import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import {
  LayoutDashboard, Calendar, Building2, Users, User as UserIcon,
  Wrench, Settings as SettingsIcon, Menu, Bell, ChevronDown, LogOut, Search,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { PLATFORM_DARK, PLATFORM_LIGHT, PLATFORM_LOGO } from "../lib/platformBrand";
import { CleanerXLogo } from "./ui/AuthKit";

// Every /admin/* page imports NAVY/GOLD from *this* file (re-exported below),
// not from lib/brandDefaults — so pointing these two at the CleanerX-logo
// palette recolors the whole Super Admin panel from one place. Company
// tenant surfaces (Sidebar, Header, Company Profile, booking form) import
// their fallback colors straight from lib/brandDefaults and are untouched.
const NAVY = PLATFORM_DARK;
const GOLD = PLATFORM_LIGHT;

const links = [
  { label: "Dashboard", href: "/admin", icon: <LayoutDashboard size={18} /> },
  { label: "Companies", href: "/admin/companies", icon: <Building2 size={18} /> },
  { label: "Customers", href: "/admin/customers", icon: <Users size={18} /> },
  { label: "Services", href: "/admin/services", icon: <Wrench size={18} /> },
  { label: "Staff", href: "/admin/staff", icon: <UserIcon size={18} /> },
  { label: "Bookings", href: "/admin/bookings", icon: <Calendar size={18} /> },
  { label: "Settings", href: "/admin/settings", icon: <SettingsIcon size={18} /> },
];

export default function AdminLayout({ children }) {
  const router = useRouter();
  // Use the shared AuthContext — role and session are already loaded there.
  // This avoids a second redundant getSession() + users-table query and
  // eliminates the race condition where AdminLayout's own fetch could
  // complete before the context's fetch (or vice-versa), briefly showing
  // "Access Denied" or redirecting to the wrong login page.
  const { isLoading, isAuthenticated, profileReady, role, profile, profileError, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Redirect to login only once auth is fully resolved and user is confirmed
  // unauthenticated. Never redirect while isLoading or profile is still in
  // flight — that is the race that caused intermittent "Access Denied".
  useEffect(() => {
    if (isLoading || !profileReady) return;
    if (!isAuthenticated) {
      router.replace("/admin/login");
    }
  }, [isLoading, profileReady, isAuthenticated, router]);

  async function handleLogout() {
    await logout();
    router.replace("/admin/login");
  }

  // ── Loading gate ──────────────────────────────────────────────────────────
  // Show the spinner until BOTH the auth session AND the profile row have been
  // resolved. isLoading covers the initial auth check; profileReady covers the
  // subsequent DB fetch. Only after both are true do we know the actual role.
  if (isLoading || (isAuthenticated && !profileReady)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500">Loading admin panel...</p>
      </div>
    );
  }

  // Not authenticated — redirect is in-flight (useEffect above).
  if (!isAuthenticated) return null;

  // ── Role check ────────────────────────────────────────────────────────────
  // "Access Denied" is only shown once the profile has fully loaded (profileReady)
  // and the role is definitively not super_admin. If there was a transient DB
  // error (profileError is set) we show a retry prompt instead — the user is
  // authenticated but the role lookup failed, which is different from truly
  // having the wrong role.
  if (profileError && !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white shadow rounded-lg p-8 max-w-md text-center">
          <h2 className="text-xl font-bold mb-2" style={{ color: NAVY }}>
            Could not load your profile
          </h2>
          <p className="text-gray-500 mb-4">
            There was a temporary issue verifying your account. Please refresh the page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm underline"
            style={{ color: NAVY }}
          >
            Refresh
          </button>
        </div>
      </div>
    );
  }

  if (role !== "super_admin") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="bg-white shadow rounded-lg p-8 max-w-md text-center">
          <h2 className="text-xl font-bold mb-2" style={{ color: NAVY }}>
            Access Denied
          </h2>
          <p className="text-gray-500 mb-4">
            This page is only accessible to platform administrators. If you
            believe this is an error, please contact support to verify your
            account role.
          </p>
          <Link href="/admin/login" className="text-sm underline" style={{ color: NAVY }}>
            Return to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#F7F9FC] overflow-hidden" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-60 bg-white border-r border-[#E5EAF0] flex flex-col shadow-sm",
          "transition-transform duration-300 lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="px-5 py-5 border-b border-[#E5EAF0]">
          <CleanerXLogo />
          <p className="text-[10px] text-[#9CA3AF] mt-1 uppercase tracking-widest font-medium">Super Admin</p>
        </div>
        <nav className="flex-1 px-3 py-4 overflow-y-auto flex flex-col gap-1">
          {links.map((link) => {
            const active =
              link.href === "/admin" ? router.pathname === "/admin" : router.pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setSidebarOpen(false)}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left",
                  active ? "bg-[#0071BD] text-white shadow-sm" : "text-[#6B7280] hover:bg-[#F0F4F8] hover:text-[#111111]",
                ].join(" ")}
                style={active ? { boxShadow: "0 0 14px rgba(56,182,255,0.35)" } : {}}
              >
                <span className={active ? "text-white" : "text-[#9CA3AF]"}>{link.icon}</span>
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="px-3 py-4 border-t border-[#E5EAF0]">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-[#6B7280] hover:bg-red-50 hover:text-red-600 transition-colors w-full"
          >
            <LogOut size={16} />Logout
          </button>
        </div>
      </aside>
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-14 bg-white border-b border-[#E5EAF0] flex items-center px-4 gap-2 shrink-0">
          <button
            className="lg:hidden min-w-11 min-h-11 p-2 rounded-lg hover:bg-gray-100 shrink-0 inline-flex items-center justify-center"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open admin navigation"
          >
            <Menu size={18} />
          </button>

          {/* Mobile quick-nav: all tabs except Dashboard, icon-only */}
          <nav className="lg:hidden flex items-center gap-0.5 overflow-x-auto scrollbar-none flex-1 min-w-0">
            {links.filter((l) => l.href !== "/admin").map((link) => {
              const active =
                link.href === "/admin" ? router.pathname === "/admin" : router.pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  title={link.label}
                  onClick={() => setSidebarOpen(false)}
                  className={[
                     "shrink-0 flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl transition-all min-w-[44px] min-h-[44px]",
                    active ? "text-white" : "text-[#9CA3AF] hover:bg-[#F0F4F8] hover:text-[#374151]",
                  ].join(" ")}
                  style={active ? { background: NAVY } : {}}
                >
                  {link.icon}
                  <span className="text-[9px] font-medium leading-none">{link.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="flex-1 flex items-center gap-3">
            <div className="relative hidden md:flex items-center">
              <Search size={15} className="absolute left-3 text-[#9CA3AF]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search bookings, companies, customers..."
                className="pl-9 pr-4 py-1.5 text-sm rounded-lg border border-[#E5EAF0] bg-[#F7F9FC] focus:outline-none focus:ring-2 focus:ring-[#38B6FF] w-72"
              />
            </div>
          </div>
          <button className="relative min-w-11 min-h-11 p-2 rounded-lg hover:bg-gray-100 text-[#6B7280] inline-flex items-center justify-center" aria-label="Notifications">
            <Bell size={18} />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-[#EF4444]" />
          </button>
          <div className="relative pl-2 border-l border-[#E5EAF0]">
            <button onClick={() => setMenuOpen((v) => !v)} className="flex items-center gap-2 hover:bg-gray-50 rounded-lg pr-1">
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: NAVY }}>
                {(profile?.full_name || profile?.email || "A").charAt(0).toUpperCase()}
              </div>
              <div className="hidden md:flex flex-col items-start">
                <span className="text-xs font-medium text-[#111111]">{profile?.full_name || "Super Admin"}</span>
                <span className="text-[10px] text-[#9CA3AF]">{profile?.email}</span>
              </div>
              <ChevronDown size={14} className="text-[#9CA3AF]" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-white border border-[#E5EAF0] rounded-xl shadow-lg py-1 z-10 anim-drop-in">
                <Link href="/admin/settings" className="block px-4 py-2 text-sm text-[#374151] hover:bg-[#F7F9FC] transition-colors duration-100">
                  Settings
                </Link>
                <button onClick={handleLogout} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-[#F7F9FC] transition-colors duration-100">
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 anim-page-in">{children}</main>
      </div>
    </div>
  );
}

export { NAVY, GOLD, searchMatches };

function searchMatches(term, fields) {
  if (!term) return true;
  const t = term.toLowerCase();
  return fields.some((f) => (f || "").toString().toLowerCase().includes(t));
}
