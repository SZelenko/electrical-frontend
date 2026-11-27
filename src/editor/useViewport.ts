/** Zoom and pan: only the SVG viewBox (millimetres) changes, never the model. */
import { ref } from 'vue'

export interface ViewBox {
  x: number
  y: number
  w: number
  h: number
}

const MIN_WIDTH_MM = 40
const MAX_WIDTH_MM = 30000

export function useViewport() {
  const view = ref<ViewBox>({ x: 0, y: 0, w: 1000, h: 600 })

  /** Fits `bounds` (tenths of mm) with a margin, keeping the viewport aspect ratio free. */
  function fit(bounds: ViewBox) {
    const pad = 100
    view.value = {
      x: (bounds.x - pad) / 10,
      y: (bounds.y - pad) / 10,
      w: (bounds.w + 2 * pad) / 10,
      h: (bounds.h + 2 * pad) / 10,
    }
  }

  /** Pixel to millimetre scale and offset of the `meet` fit of the viewBox into the element. */
  function metrics(svg: SVGSVGElement) {
    const r = svg.getBoundingClientRect()
    const v = view.value
    if (r.width === 0 || r.height === 0) return null
    const scale = Math.min(r.width / v.w, r.height / v.h)
    return {
      scale,
      left: r.left + (r.width - v.w * scale) / 2,
      top: r.top + (r.height - v.h * scale) / 2,
    }
  }

  /** Client position to drawing coordinates in tenths of a millimetre; null when not laid out. */
  function toUnits(svg: SVGSVGElement, clientX: number, clientY: number) {
    const m = metrics(svg)
    if (!m) return null
    const v = view.value
    return {
      x: Math.round((v.x + (clientX - m.left) / m.scale) * 10),
      y: Math.round((v.y + (clientY - m.top) / m.scale) * 10),
    }
  }

  function zoomAt(svg: SVGSVGElement, clientX: number, clientY: number, factor: number) {
    const m = metrics(svg)
    const v = view.value
    const w = Math.min(MAX_WIDTH_MM, Math.max(MIN_WIDTH_MM, v.w * factor))
    const k = w / v.w
    if (!m) {
      view.value = { ...v, w, h: v.h * k }
      return
    }
    const mx = v.x + (clientX - m.left) / m.scale
    const my = v.y + (clientY - m.top) / m.scale
    view.value = { x: mx - (mx - v.x) * k, y: my - (my - v.y) * k, w, h: v.h * k }
  }

  function panByPixels(svg: SVGSVGElement, dxPx: number, dyPx: number, from: ViewBox) {
    const m = metrics(svg)
    if (!m) return
    view.value = { ...from, x: from.x - dxPx / m.scale, y: from.y - dyPx / m.scale }
  }

  return { view, fit, toUnits, zoomAt, panByPixels }
}
