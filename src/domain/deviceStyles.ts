/** Creation defaults per device style (changing the style later keeps width and poles). */
import type { DeviceElement, DeviceStyle } from './panelContent'
import type { MessageKey } from './translate'

export interface StyleDefaults {
  widthModules: number
  /** Transit flag per pole. */
  poles: boolean[]
  /** Message key of the style's name. */
  titleKey: MessageKey
  /** Message key of the history label of the toolbar action. */
  addLabelKey: MessageKey
}

export const DEVICE_STYLE_DEFAULTS: Record<DeviceStyle, StyleDefaults> = {
  breaker: {
    widthModules: 1,
    poles: [false],
    titleKey: 'domain.deviceStyle.breaker',
    addLabelKey: 'editor.history.addBreaker',
  },
  rcd: {
    widthModules: 2,
    poles: [false, false],
    titleKey: 'domain.deviceStyle.rcd',
    addLabelKey: 'editor.history.addRcd',
  },
  // the second pole (neutral) passes through
  voltageRelay: {
    widthModules: 2,
    poles: [false, true],
    titleKey: 'domain.deviceStyle.voltageRelay',
    addLabelKey: 'editor.history.addVoltageRelay',
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
