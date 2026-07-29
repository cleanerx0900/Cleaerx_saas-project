// Shared visual kit for every platform auth screen (Company Login, Signup,
// Forgot/Reset/Change Password, Admin Login) — ported 1:1 from the approved
// Figma design (CleanerX SaaS UI) so these screens match it exactly.
// Purely presentational: no auth/business logic lives here.
import { PLATFORM_PRIMARY, PLATFORM_LIGHT, PLATFORM_DARK } from "../../lib/platformBrand";

export function CleanerXLogo({ size = "md" }) {
  const sizes = { sm: "text-xl", md: "text-2xl", lg: "text-3xl" };
  return (
    <span className={`font-bold tracking-tight select-none ${sizes[size]}`} style={{ fontFamily: "Inter, sans-serif" }}>
      <span style={{ color: PLATFORM_PRIMARY }}>Cleaner</span>
      <span style={{ color: PLATFORM_LIGHT, textShadow: "0 0 12px rgba(56,182,255,0.8), 0 0 24px rgba(56,182,255,0.4)" }}>X</span>
    </span>
  );
}

// hideLogo=true: light neutral business background, no CleanerX wordmark above
// the card. Used by the Company Owner Portal login to visually separate it from
// the platform-branded admin login. Other auth screens are unaffected.
export function AuthLayout({ children, isAdmin = false, hideLogo = false }) {
  const background = isAdmin
    ? `linear-gradient(135deg, ${PLATFORM_DARK} 0%, ${PLATFORM_PRIMARY} 60%, ${PLATFORM_LIGHT} 100%)`
    : hideLogo
    ? "linear-gradient(135deg, #f0f4f8 0%, #dde6ef 50%, #eaf1f7 100%)"
    : `linear-gradient(135deg, ${PLATFORM_PRIMARY} 0%, #005a99 50%, ${PLATFORM_LIGHT} 100%)`;

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden anim-fade-in"
      style={{ background }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {hideLogo ? (
          <>
            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20" style={{ background: "#0071BD", filter: "blur(80px)" }} />
            <div className="absolute -bottom-32 -left-32 w-80 h-80 rounded-full opacity-10" style={{ background: "#38B6FF", filter: "blur(80px)" }} />
          </>
        ) : (
          <>
            <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-10" style={{ background: PLATFORM_LIGHT, filter: "blur(60px)" }} />
            <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full opacity-10" style={{ background: "#ffffff", filter: "blur(60px)" }} />
          </>
        )}
      </div>
      <div className="w-full max-w-md relative z-10">
        {!hideLogo && (
          <div className="text-center mb-8 anim-slide-up">
            <CleanerXLogo size="lg" />
          </div>
        )}
        {/* Card slides up slightly after background fades in */}
        <div className={[
          "bg-white rounded-2xl shadow-2xl p-8 anim-slide-up anim-delay-1",
          hideLogo ? "border border-[#d1dde8] shadow-[0_8px_40px_rgba(0,113,189,0.10)]" : "border border-white/20",
        ].join(" ")}>{children}</div>
      </div>
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", size = "md", className = "", disabled = false, type = "button", loading = false }) {
  const base = "inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 active:scale-[0.97]";
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-4 py-2 text-sm", lg: "px-6 py-3 text-base" };
  const variants = {
    primary:   "bg-[#0071BD] text-white hover:bg-[#005a99] focus:ring-[#38B6FF] shadow-sm hover:shadow-[0_4px_16px_rgba(0,113,189,0.35)] hover:-translate-y-px",
    secondary: "bg-[#EBF4FB] text-[#0071BD] hover:bg-[#d6eaf8] focus:ring-[#0071BD]",
    danger:    "bg-red-500 text-white hover:bg-red-600 focus:ring-red-400 hover:shadow-[0_4px_12px_rgba(239,68,68,0.3)] hover:-translate-y-px",
    ghost:     "text-[#6B7280] hover:bg-gray-100 hover:text-[#111111] focus:ring-gray-300",
    outline:   "border border-[#0071BD] text-[#0071BD] hover:bg-[#EBF4FB] focus:ring-[#0071BD]",
  };
  const isLoading = loading || (disabled && loading);
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={[base, sizes[size], variants[variant], (disabled || loading) ? "opacity-50 cursor-not-allowed" : "", className].filter(Boolean).join(" ")}
    >
      {loading && (
        <span className={variant === "primary" || variant === "danger" ? "btn-spinner" : "btn-spinner btn-spinner-muted"} />
      )}
      {children}
    </button>
  );
}

export function Inp({ label, placeholder, type = "text", value, onChange, icon, rightEl, className = "", required = false, autoComplete, name, id }) {
  return (
    <div className={["flex flex-col gap-1.5", className].filter(Boolean).join(" ")}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-[#374151]">
          {label}
        </label>
      )}
      {/* group-focus-within lets the icon colour shift when the input is focused */}
      <div className="relative group">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none flex items-center transition-colors duration-200 group-focus-within:text-[#38B6FF]">
            {icon}
          </span>
        )}
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          placeholder={placeholder}
          required={required}
          autoComplete={autoComplete}
          className={[
            "w-full rounded-lg border border-[#D1DDE8] bg-white text-[#111111] placeholder-[#9CA3AF]",
            "focus:outline-none focus:ring-2 focus:ring-[#38B6FF] focus:border-transparent",
            "transition-all duration-200",
            "text-sm py-2.5",
            icon ? "pl-9 pr-3" : "px-3",
            rightEl ? "pr-10" : "",
          ].join(" ")}
        />
        {rightEl && <span className="absolute right-3 top-1/2 -translate-y-1/2">{rightEl}</span>}
      </div>
    </div>
  );
}

export function AlertBanner({ tone = "error", children }) {
  const tones = {
    error:   "bg-red-50 border-red-200 text-red-700",
    success: "bg-green-50 border-green-200 text-green-700",
    amber:   "bg-amber-50 border-amber-200 text-amber-700",
  };
  return (
    <div className={`border rounded-xl px-4 py-3 text-sm flex items-start gap-2 anim-error-in ${tones[tone]}`}>
      {children}
    </div>
  );
}
