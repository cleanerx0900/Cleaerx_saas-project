// Shared visual kit for the Company Portal and Super Admin panel.
// Purely presentational: no auth/business logic lives here.
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

const STATUS_MAP = {
  // Capitalised variants (for display)
  Pending:      "bg-amber-100 text-amber-700 border-amber-200",
  Confirmed:    "bg-green-100 text-green-700 border-green-200",
  "In Progress":"bg-blue-100 text-blue-700 border-blue-200",
  Completed:    "bg-teal-100 text-teal-800 border-teal-200",
  Cancelled:    "bg-red-100 text-red-700 border-red-200",
  Lost:         "bg-gray-100 text-gray-600 border-gray-200",
  Active:       "bg-green-100 text-green-700 border-green-200",
  Inactive:     "bg-gray-100 text-gray-500 border-gray-200",
  Admin:        "bg-purple-100 text-purple-700 border-purple-200",
  Owner:        "bg-blue-100 text-blue-700 border-blue-200",
  Staff:        "bg-gray-100 text-gray-600 border-gray-200",
  Pro:          "bg-indigo-100 text-indigo-700 border-indigo-200",
  Basic:        "bg-sky-100 text-sky-700 border-sky-200",
  Enterprise:   "bg-violet-100 text-violet-700 border-violet-200",
  // Lowercase variants (from database)
  confirmed:    "bg-green-100 text-green-700 border-green-200",
  pending:      "bg-amber-100 text-amber-700 border-amber-200",
  cancelled:    "bg-red-100 text-red-700 border-red-200",
  completed:    "bg-teal-100 text-teal-800 border-teal-200",
  in_progress:  "bg-blue-100 text-blue-700 border-blue-200",
  lost:         "bg-gray-100 text-gray-600 border-gray-200",
};

// Human-readable labels for database status values
const STATUS_LABEL = {
  in_progress: "In Progress",
};

export function cn(...c) {
  return c.filter(Boolean).join(" ");
}

export function initials(name = "") {
  return name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase();
}

const AVATAR_COLORS = ["#0071BD", "#38B6FF", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444"];
export function avatarColor(name = "A") {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

export function StatusBadge({ status }) {
  const label = STATUS_LABEL[status] || status;
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize",
      STATUS_MAP[status] || "bg-gray-100 text-gray-600 border-gray-200"
    )}>
      {label}
    </span>
  );
}

export function StatCard({ label, value, icon, color, delta, loading = false }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-[rgba(0,113,189,0.08)] relative overflow-hidden flex flex-col gap-3 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 cursor-default">
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl" style={{ background: color }} />
      <div className="flex items-start justify-between">
        <p className="text-sm text-[#6B7280] font-medium">{label}</p>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-200" style={{ background: color + "18" }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div className="flex items-end gap-2">
        {loading ? (
          <div className="skeleton h-8 w-14" />
        ) : (
          <p className="text-3xl font-bold text-[#111111]">{value}</p>
        )}
        {!loading && delta && <span className="text-xs text-green-600 font-medium mb-1">{delta}</span>}
      </div>
    </div>
  );
}

export function ModalWrap({ open, onClose, title, children, width = "max-w-lg" }) {
  // Track a stable "key" so the animation replays each time the modal opens.
  const [animKey, setAnimKey] = useState(0);
  const prevOpen = useRef(false);

  useEffect(() => {
    if (open && !prevOpen.current) {
      setAnimKey((k) => k + 1);
    }
    prevOpen.current = open;
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      {/* Backdrop — fades in */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm anim-backdrop-in" />
      {/* Modal panel — scales + fades in */}
      <div
        key={animKey}
        className={cn("relative bg-white rounded-2xl shadow-2xl w-full overflow-hidden anim-scale-in", width)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5EAF0]">
          <h3 className="text-base font-semibold text-[#111111]">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B7280] hover:bg-gray-100 hover:text-[#111111] transition-all duration-150 active:scale-90"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-6 max-h-[80vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export function Toggle({ checked, onChange, disabled = false }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#38B6FF] focus:ring-offset-1",
        checked ? "bg-[#0071BD]" : "bg-gray-200",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className="inline-block h-5 w-5 mt-0.5 rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

export function EmptyState({ icon, title, desc }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center anim-empty-state">
      <div className="anim-empty-icon w-16 h-16 rounded-2xl bg-[#EBF4FB] flex items-center justify-center text-[#0071BD] mb-4 transition-all duration-300 hover:scale-110 hover:bg-[#DBEAFE] hover:shadow-md">
        {icon}
      </div>
      <p className="text-base font-semibold text-[#111111]">{title}</p>
      <p className="text-sm text-[#6B7280] mt-1 max-w-xs">{desc}</p>
    </div>
  );
}
