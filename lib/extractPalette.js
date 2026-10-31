// Client-side dominant-color extraction for the Company Profile branding
// tool. Runs entirely in the browser (Canvas API) — no server round trip,
// no extra npm dependency. Given an uploaded logo file, returns up to 3
// suggested brand colors: [primary, secondary, accent].
//
// Approach: downscale the image onto a small canvas, bucket every pixel's
// RGB into a coarse grid (32-level steps), tally frequency (skipping
// transparent / near-white / near-black / low-saturation pixels so we
// don't just pick "background"), then return the most frequent buckets
// as hex, ordered by frequency and separated by hue so the 3 suggested
// colors are visually distinct rather than 3 shades of the same tone.

function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

function rgbToHsl(r, g, b) {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2
  const d = max - min
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1))
    switch (max) {
      case r:
        h = ((g - b) / d) % 6
        break
      case g:
        h = (b - r) / d + 2
        break
      default:
        h = (r - g) / d + 4
    }
    h *= 60
    if (h < 0) h += 360
  }
  return { h, s, l }
}

// Extracts a brand palette from an image File/Blob:
//   - `background`: the logo's dominant background/base tone (including
//     whites/near-blacks/low-saturation pixels we'd otherwise ignore) — this
//     becomes the main dashboard/booking-form theme color per the branding
//     spec ("the logo background/base color should become the main theme").
//   - `colors`: up to `count` vivid, hue-separated colors from the logo
//     artwork itself — used for secondary/accent (cards, buttons, badges,
//     highlights, icons, hover states).
// Resolves to { background: null, colors: [] } if extraction isn't possible
// (e.g. an SVG with no rasterizable content) — callers should fall back to
// existing/default colors in that case, never throw.
export function extractPaletteFromFile(file, count = 2) {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.crossOrigin = 'anonymous'

    img.onload = () => {
      try {
        const size = 96
        const canvas = document.createElement('canvas')
        canvas.width = size
        canvas.height = size
        const ctx = canvas.getContext('2d', { willReadFrequently: true })
        ctx.clearRect(0, 0, size, size)
        // Fit the image inside the square canvas without distortion
        const scale = Math.min(size / img.width, size / img.height)
        const w = img.width * scale
        const h = img.height * scale
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h)

        const { data } = ctx.getImageData(0, 0, size, size)
        const vividBuckets = new Map() // quantized "r,g,b" -> { count, r, g, b }
        const allBuckets = new Map() // same, but includes whites/blacks/low-saturation — for background detection
        const STEP = 24

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          if (a < 200) continue // skip transparent/near-transparent pixels

          const qr = Math.round(r / STEP) * STEP
          const qg = Math.round(g / STEP) * STEP
          const qb = Math.round(b / STEP) * STEP
          const key = `${qr},${qg},${qb}`

          const allExisting = allBuckets.get(key)
          if (allExisting) allExisting.count++
          else allBuckets.set(key, { count: 1, r: qr, g: qg, b: qb })

          const { s, l } = rgbToHsl(r, g, b)
          // Skip near-white, near-black, and washed-out (low saturation) pixels
          // for the *vivid* palette — these are almost always background, not
          // brand artwork color. They're still captured above for `background`.
          if (l > 0.94 || l < 0.08 || s < 0.12) continue

          const vividExisting = vividBuckets.get(key)
          if (vividExisting) vividExisting.count++
          else vividBuckets.set(key, { count: 1, r: qr, g: qg, b: qb })
        }

        // Background/base = single most frequent tone overall (typically the
        // logo's canvas/background fill, which is what the spec wants as the
        // main theme color).
        const allSorted = Array.from(allBuckets.values()).sort((a, b) => b.count - a.count)
        const background = allSorted.length > 0 ? rgbToHex(allSorted[0].r, allSorted[0].g, allSorted[0].b) : null

        const sorted = Array.from(vividBuckets.values()).sort((a, b) => b.count - a.count)

        // Greedily pick colors that are far enough apart in hue from
        // ones already chosen, so we don't return near-identical shades.
        const chosen = []
        for (const c of sorted) {
          if (chosen.length >= count) break
          const { h: hue } = rgbToHsl(c.r, c.g, c.b)
          const tooClose = chosen.some((picked) => {
            const diff = Math.abs(picked.hue - hue)
            return Math.min(diff, 360 - diff) < 20
          })
          if (!tooClose) chosen.push({ ...c, hue })
        }
        // If hue-separation left us short (e.g. a monochrome logo), fill
        // remaining slots with the next most frequent buckets regardless of hue.
        for (const c of sorted) {
          if (chosen.length >= count) break
          if (!chosen.some((picked) => picked.r === c.r && picked.g === c.g && picked.b === c.b)) {
            chosen.push(c)
          }
        }

        URL.revokeObjectURL(objectUrl)
        resolve({ background, colors: chosen.map((c) => rgbToHex(c.r, c.g, c.b)) })
      } catch (err) {
        URL.revokeObjectURL(objectUrl)
        resolve({ background: null, colors: [] })
      }
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ background: null, colors: [] })
    }

    img.src = objectUrl
  })
}
