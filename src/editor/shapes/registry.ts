/** One component per device style; add a style by adding a file here and an entry below. */
import type { Component } from 'vue'
import type { DeviceStyle } from '@/domain/panelContent'
import BreakerShape from './BreakerShape.vue'
import RcdShape from './RcdShape.vue'
import VoltageRelayShape from './VoltageRelayShape.vue'

export const deviceShapes: Record<DeviceStyle, Component> = {
  breaker: BreakerShape,
  rcd: RcdShape,
  voltageRelay: VoltageRelayShape,
}
