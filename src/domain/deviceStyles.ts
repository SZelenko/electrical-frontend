/** Creation defaults per device style (changing the style later keeps width and poles). */
import type { DeviceElement, DeviceStyle } from './panelContent'

export interface StyleDefaults {
  widthModules: number
  /** Transit flag per pole. */
  poles: boolean[]
  title: string
  /** History label of the toolbar action. */
  addLabel: string
}

export const DEVICE_STYLE_DEFAULTS: Record<DeviceStyle, StyleDefaults> = {
  breaker: { widthModules: 1, poles: [false], title: 'Автомат', addLabel: 'Додати автомат' },
  rcd: { widthModules: 2, poles: [false, false], title: 'ПЗВ', addLabel: 'Додати ПЗВ' },
  // the second pole (neutral) passes through
  voltageRelay: {
    widthModules: 2,
    poles: [false, true],
    title: 'Реле напруги',
    addLabel: 'Додати реле напруги',
  },
}

/** A new device of `style` with its creation defaults, switched on. */
export function newDevice(style: DeviceStyle, id: string, offsetModules: number): DeviceElement {
  const d = DEVICE_STYLE_DEFAULTS[style]
  return {
    kind: 'device',
    style,
    id,
    offsetModules,
    widthModules: d.widthModules,
    label: '',
    marking: '',
    sidesSwapped: false,
    on: true,
    poles: d.poles.map((transit) => ({ transit })),
    state: null,
  }
}
