// Small, dependency-free color helpers shared by the branding system
// (Company Profile page, Sidebar, Header, booking form) so any company's
// theme colors — however light or dark — stay readable automatically.

export function hexToRgb(hex) {
  const clean = (hex || "").replace("#", "")
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean
  const num = parseInt(full || "000000", 16)
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 }
}

// Relative luminance per WCAG — used to decide whether black or white text
// (or a darkened/lightened variant of a color) will be legible on top of it.
export function getLuminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  const [rl, gl, bl] = [r, g, b].map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

// Returns the readable foreground color (near-black or near-white) for text
// or icons placed on top of `hex`. Always call this instead of hardcoding
// "#fff" on a brand color — logo-derived colors can be light or dark.
export function getContrastText(hex) {
  if (!hex) return "#111827"
  return getLuminance(hex) > 0.55 ? "#111827" : "#FFFFFF"
}

// Lightens/darkens a hex color by `amount` (-1..1). Used to derive a subtle
// hover/overlay shade from a brand color without needing a second color.
export function shade(hex, amount) {
  const { r, g, b } = hexToRgb(hex)
  const adjust = (c) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c + c * amount
    return Math.max(0, Math.min(255, Math.round(v)))
  }
  const toHex = (v) => v.toString(16).padStart(2, "0")
  return `#${toHex(adjust(r))}${toHex(adjust(g))}${toHex(adjust(b))}`.toUpperCase()
}
