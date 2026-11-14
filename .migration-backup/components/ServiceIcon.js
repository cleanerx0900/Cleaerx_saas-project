// Service icons for the customer-facing booking form (pages/book-service.js
// and pages/company/[slug]/book.js). Line-style SVGs matched to the approved
// Figma UI (attached_assets/Fianl_CleanerX_SaaS_UI_...zip) so each of the 8
// service categories gets a service-accurate icon instead of an emoji.
//
// `color` accepts any hex — this renders inside per-company themed booking
// forms, so it is always driven by that company's own brand color, never a
// hardcoded platform color.
export default function ServiceIcon({ type, size = 26, color = "#0071BD" }) {
  const p = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: "1.5",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  };

  switch (type) {
    case "sofa":
      return (
        <svg {...p}>
          <path d="M3 10V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3" />
          <path d="M1 10a2 2 0 0 1 2 2v2h18v-2a2 2 0 0 1 2-2" />
          <path d="M1 10a2 2 0 0 0 2-2" />
          <path d="M21 10a2 2 0 0 1-2-2" />
          <path d="M7 18v2M17 18v2" />
          <rect x="3" y="14" width="18" height="4" rx="1" />
        </svg>
      );
    case "foam":
    case "armchair":
      return (
        <svg {...p}>
          <path d="M6 11V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v5" />
          <path d="M4 11a2 2 0 0 0-2 2v1h20v-1a2 2 0 0 0-2-2" />
          <rect x="4" y="14" width="16" height="4" rx="1" />
          <path d="M8 18v2M16 18v2" />
        </svg>
      );
    case "carpet":
      return (
        <svg {...p}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 9h20M2 13h20M6 5v14M10 5v14M14 5v14M18 5v14" opacity="0.4" />
          <path d="M2 7l2-2M22 7l-2-2M2 17l2 2M22 17l-2 2" />
        </svg>
      );
    case "mattress":
      return (
        <svg {...p}>
          <rect x="2" y="8" width="20" height="12" rx="2" />
          <rect x="4" y="5" width="6" height="4" rx="1" />
          <rect x="14" y="5" width="6" height="4" rx="1" />
          <path d="M2 14h20" />
        </svg>
      );
    case "curtain":
      return (
        <svg {...p}>
          <path d="M2 3h20" />
          <path d="M4 3c0 6-2 8-2 12v6" />
          <path d="M8 3c0 6 2 8 2 12v6" />
          <path d="M16 3c0 6-2 8-2 12v6" />
          <path d="M20 3c0 6 2 8 2 12v6" />
          <path d="M8 3h8" strokeDasharray="1 2" />
        </svg>
      );
    case "tank":
      return (
        <svg {...p}>
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v12" />
          <path d="M20 6v12" />
          <ellipse cx="12" cy="18" rx="8" ry="3" />
          <path d="M12 9v6" />
          <path d="M9 11l3-2 3 2" />
        </svg>
      );
    case "home_regular":
    case "spray":
      return (
        <svg {...p}>
          <path d="M9 3h1.5a1.5 1.5 0 0 1 0 3H9" />
          <path d="M9 3v14a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V9" />
          <path d="M17 9h-4a2 2 0 0 1-2-2V3" />
          <path d="M13 6h4" />
          <circle cx="18" cy="5" r="1" fill={color} />
          <path d="M19 3l2-1M20 5h2M19 7l2 1" />
        </svg>
      );
    case "home_deep":
    case "sparkle":
      return (
        <svg {...p}>
          <path d="M12 2l2 7h7l-5.5 4 2 7L12 16l-5.5 4 2-7L3 9h7z" />
          <path d="M5 5l1 2M19 5l-1 2M5 19l1-2M19 19l-1-2" opacity="0.6" />
        </svg>
      );
    default:
      return null;
  }
}
