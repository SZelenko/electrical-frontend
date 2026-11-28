/** Click zone that switches an element, per shape (mirrors the control positions drawn by the shapes). */
import type { ElementBox } from '@/domain/geometry'
import { atsStateName, type PanelElement } from '@/domain/panelContent'
import type { Translate } from '@/domain/translate'

export interface Zone {
  x: number
  y: number
  width: number
  height: number
  label: string
}

const state = (on: boolean, t: Translate) => (on ? t('domain.element.on') : t('domain.element.off'))

export function toggleZone(element: PanelElement, box: ElementBox, t: Translate): Zone {
  const cx = box.x + box.w / 2
  if (element.kind === 'ats') {
    const r = Math.min(80, box.w / 5)
    const cy = box.y + box.h / 2
    return {
      x: cx - r - 8,
      y: cy - r - 8,
      width: 2 * r + 16,
      height: 2 * r + 16,
      label: t('editor.toggle.ats', { state: atsStateName(element.state, t) }),
    }
  }
  const now = state(element.on, t)
  switch (element.style) {
    case 'rcd': {
      const slotW = Math.min(box.w * 0.4, 80)
      return {
        x: cx - slotW / 2 - 10,
        y: box.y + 260,
        width: slotW + 20,
        height: 260,
        label: t('editor.toggle.rcd', { state: now }),
      }
    }
    case 'voltageRelay':
      return {
        x: box.x + 24,
        y: box.y + 244,
        width: box.w - 48,
        height: 230,
        label: t('editor.toggle.voltageRelay', { state: now }),
      }
    default: {
      const slotW = Math.min(box.w * 0.45, 90)
      return {
        x: cx - slotW / 2 - 10,
        y: box.y + 280,
        width: slotW + 20,
        height: 320,
        label: t('editor.toggle.breaker', { state: now }),
      }
    }
  }
}
