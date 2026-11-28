/** Mount helper for the editor component specs: a real store, the editor context and jsdom layout stubs. */
import { vuetify } from '@/plugins/vuetify'
import { defineComponent, h } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { vi } from 'vitest'
import { panelsApi, type Panel } from '@/api/panels'
import type { PanelContent } from '@/domain/panelContent'
import { useAuthStore } from '@/stores/auth'
import { usePanelEditorStore } from '@/stores/panelEditor'
import EditorToolbar from '../EditorToolbar.vue'
import PanelCanvas from '../PanelCanvas.vue'
import PropertiesPanel from '../PropertiesPanel.vue'
import { provideEditorContext, type EditorContext } from '../useEditor'
import { useEditorShortcuts } from '../useEditorShortcuts'

export const VIEW_W = 1110
export const VIEW_H = 435

/** jsdom has no layout and no pointer capture: give the svg a size and no-op capture methods. */
export function stubLayout() {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const isSvg = this.tagName.toLowerCase() === 'svg'
    const [w, h] = isSvg ? [VIEW_W, VIEW_H] : [0, 0]
    return { left: 0, top: 0, right: w, bottom: h, x: 0, y: 0, width: w, height: h, toJSON() {} }
  })
  for (const name of ['setPointerCapture', 'releasePointerCapture'] as const) {
    Object.defineProperty(SVGElement.prototype, name, { value: vi.fn(), configurable: true })
  }
  Object.defineProperty(SVGElement.prototype, 'hasPointerCapture', {
    value: vi.fn(() => false),
    configurable: true,
  })
}

export function panelOf(c: PanelContent, over: Partial<Panel> = {}): Panel {
  return {
    id: 'p1',
    name: 'Щит',
    version: 1,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    deletedAt: null,
    content: c,
    shortCircuits: [],
    ...over,
  }
}

export async function mountEditor(
  c: PanelContent,
  opts: { properties?: boolean; toolbar?: boolean; panel?: Partial<Panel> } = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false } as never
  auth.status = 'authenticated'
  vi.spyOn(panelsApi, 'get').mockResolvedValue(panelOf(c, opts.panel))
  const store = usePanelEditorStore()
  await store.load('p1')
  let ctx!: EditorContext
  const Harness = defineComponent({
    setup() {
      ctx = provideEditorContext()
      useEditorShortcuts(ctx)
      return () =>
        h('div', [
          opts.toolbar ? h(EditorToolbar) : null,
          h(PanelCanvas),
          opts.properties ? h(PropertiesPanel) : null,
        ])
    },
  })
  const wrapper = mount(Harness, { global: { plugins: [pinia, vuetify] }, attachTo: document.body })
  return { wrapper, store, ctx, pinia }
}

/** Client coordinates of a drawing point (tenths of mm) for the current viewBox of the canvas. */
export function clientOf(wrapper: VueWrapper, u: { x: number; y: number }) {
  const [vx, vy, vw, vh] = (wrapper.get('svg.canvas').attributes('viewBox') as string)
    .split(' ')
    .map(Number) as [number, number, number, number]
  const scale = Math.min(VIEW_W / vw, VIEW_H / vh)
  const left = (VIEW_W - vw * scale) / 2
  const top = (VIEW_H - vh * scale) / 2
  return { clientX: left + (u.x / 10 - vx) * scale, clientY: top + (u.y / 10 - vy) * scale }
}

export const pointer = (wrapper: VueWrapper, u: { x: number; y: number }, extra = {}) => ({
  ...clientOf(wrapper, u),
  button: 0,
  pointerId: 1,
  ...extra,
})
