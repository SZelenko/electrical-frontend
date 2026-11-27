/** Click zone that switches an element, per shape (mirrors the control positions drawn by the shapes). */
import type { ElementBox } from '@/domain/geometry'
import { ATS_STATE_NAMES, type PanelElement } from '@/domain/panelContent'

export interface Zone {
  x: number
  y: number
  width: number
  height: number
  label: string
}

const state = (on: boolean) => (on ? 'увімкнено' : 'вимкнено')

export function toggleZone(element: PanelElement, box: ElementBox): Zone {
  const cx = box.x + box.w / 2
  if (element.kind === 'ats') {
    const r = Math.min(80, box.w / 5)
    const cy = box.y + box.h / 2
    return {
      x: cx - r - 8,
      y: cy - r - 8,
      width: 2 * r + 16,
      height: 2 * r + 16,
      label: `Перемкнути АВР (стан: ${ATS_STATE_NAMES[element.state]})`,
    }
  }
  const now = state(element.on)
  switch (element.style) {
    case 'rcd': {
      const slotW = Math.min(box.w * 0.4, 80)
      return {
        x: cx - slotW / 2 - 10,
        y: box.y + 260,
        width: slotW + 20,
        height: 260,
        label: `Перемкнути ПЗВ (зараз: ${now})`,
      }
    }
    case 'voltageRelay':
      return {
        x: box.x + 24,
        y: box.y + 244,
        width: box.w - 48,
        height: 230,
        label: `Перемкнути реле напруги (зараз: ${now})`,
      }
    default: {
      const slotW = Math.min(box.w * 0.45, 90)
      return {
        x: cx - slotW / 2 - 10,
        y: box.y + 280,
        width: slotW + 20,
        height: 320,
        label: `Перемкнути автомат (зараз: ${now})`,
      }
    }
  }
}
