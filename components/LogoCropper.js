import { useEffect, useRef, useState } from "react"

// Lightweight canvas-based crop/zoom modal for logo uploads — no external
// cropper dependency. The user drags to reposition and uses a slider to
// zoom; "Use this logo" rasterizes the current view into a square PNG.
const OUTPUT_SIZE = 512
const VIEWPORT = 260

export default function LogoCropper({ file, onCancel, onConfirm }) {
  const canvasRef = useRef(null)
  const imgRef = useRef(null)
  const dragRef = useRef(null)

  const [imgLoaded, setImgLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [baseScale, setBaseScale] = useState(1)

  useEffect(() => {
    if (!file) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      // Base scale so the image fully covers the square viewport
      const scale = Math.max(VIEWPORT / img.width, VIEWPORT / img.height)
      setBaseScale(scale)
      setZoom(1)
      setOffset({ x: 0, y: 0 })
      setImgLoaded(true)
    }
    img.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    draw()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imgLoaded, zoom, offset])

  function draw() {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img || !imgLoaded) return
    const ctx = canvas.getContext("2d")
    canvas.width = VIEWPORT
    canvas.height = VIEWPORT
    ctx.clearRect(0, 0, VIEWPORT, VIEWPORT)
    ctx.fillStyle = "#f3f4f6"
    ctx.fillRect(0, 0, VIEWPORT, VIEWPORT)

    const scale = baseScale * zoom
    const w = img.width * scale
    const h = img.height * scale
    const x = (VIEWPORT - w) / 2 + offset.x
    const y = (VIEWPORT - h) / 2 + offset.y
    ctx.drawImage(img, x, y, w, h)
  }

  function handlePointerDown(e) {
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      offsetX: offset.x,
      offsetY: offset.y,
    }
  }
  function handlePointerMove(e) {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    setOffset({ x: dragRef.current.offsetX + dx, y: dragRef.current.offsetY + dy })
  }
  function handlePointerUp() {
    dragRef.current = null
  }

  // Finds the bounding box of non-transparent pixels.
  // Returns null when the image has no meaningful transparency (solid-background
  // logos are returned as-is — their background is intentional).
  function detectContentBounds(ctx, w, h) {
    const { data } = ctx.getImageData(0, 0, w, h)
    let minX = w, minY = h, maxX = 0, maxY = 0
    let transparentCount = 0
    const total = w * h

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4
        if (data[i + 3] < 20) {
          transparentCount++
          continue
        }
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }

    // Only trim when >10 % of pixels are transparent (real transparent-bg logo)
    if (transparentCount / total < 0.10) return null
    if (minX >= maxX || minY >= maxY) return null
    // Skip if there's no meaningful padding to remove (< 4 % on all sides)
    const cw = maxX - minX + 1
    const ch = maxY - minY + 1
    const hasPadding =
      minX > w * 0.04 || minY > h * 0.04 || maxX < w * 0.96 || maxY < h * 0.96
    if (!hasPadding) return null
    return { x: minX, y: minY, w: cw, h: ch }
  }

  function handleConfirm() {
    const img = imgRef.current
    if (!img) return

    // Step 1 — render the current crop view at full OUTPUT_SIZE
    const full = document.createElement("canvas")
    full.width = OUTPUT_SIZE
    full.height = OUTPUT_SIZE
    const fullCtx = full.getContext("2d")
    const factor = OUTPUT_SIZE / VIEWPORT
    const scale = baseScale * zoom * factor
    const w = img.width * scale
    const h = img.height * scale
    const x = (OUTPUT_SIZE - w) / 2 + offset.x * factor
    const y = (OUTPUT_SIZE - h) / 2 + offset.y * factor
    fullCtx.drawImage(img, x, y, w, h)

    // Step 2 — detect content bounding box (transparent-bg logos only)
    const bounds = detectContentBounds(fullCtx, OUTPUT_SIZE, OUTPUT_SIZE)

    let outputCanvas
    if (bounds) {
      // Add a small padding around the detected content
      const PAD = 6
      const bx = Math.max(0, bounds.x - PAD)
      const by = Math.max(0, bounds.y - PAD)
      const bw = Math.min(OUTPUT_SIZE - bx, bounds.w + PAD * 2)
      const bh = Math.min(OUTPUT_SIZE - by, bounds.h + PAD * 2)

      // Scale so the longest side = OUTPUT_SIZE, preserving natural aspect ratio
      const longest = Math.max(bw, bh)
      const outW = Math.round((bw / longest) * OUTPUT_SIZE)
      const outH = Math.round((bh / longest) * OUTPUT_SIZE)

      outputCanvas = document.createElement("canvas")
      outputCanvas.width = outW
      outputCanvas.height = outH
      const outCtx = outputCanvas.getContext("2d")
      outCtx.drawImage(full, bx, by, bw, bh, 0, 0, outW, outH)
    } else {
      // Solid-background logo — keep full square output as-is
      outputCanvas = full
    }

    outputCanvas.toBlob((blob) => {
      if (!blob) return
      const croppedFile = new File([blob], "logo.png", { type: "image/png" })
      onConfirm(croppedFile)
    }, "image/png")
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-5 w-full max-w-sm">
        <h3 className="font-bold text-gray-900 mb-1">Adjust Your Logo</h3>
        <p className="text-xs text-gray-500 mb-4">Drag to reposition · zoom to fit · aspect ratio auto-detected on save.</p>

        <div
          className="mx-auto rounded-xl overflow-hidden border-2 border-dashed border-gray-300 cursor-move select-none"
          style={{ width: VIEWPORT, height: VIEWPORT, touchAction: "none" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        >
          <canvas ref={canvasRef} width={VIEWPORT} height={VIEWPORT} />
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-gray-500 flex justify-between">
            <span>Zoom</span>
            <span>{zoom.toFixed(1)}x</span>
          </label>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>

        <div className="mt-5 flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!imgLoaded}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white disabled:opacity-50"
          >
            Use This Logo
          </button>
        </div>
      </div>
    </div>
  )
}
