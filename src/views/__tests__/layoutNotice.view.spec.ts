import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { vuetify } from '@/plugins/vuetify'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h } from 'vue'
import { panelsApi, type Panel } from '@/api/panels'
import { applyLocale, i18n } from '@/i18n'
import { computeLayoutV1 } from '@/domain/geometryV1'
import type { Pt } from '@/domain/geometry'
import type { PanelContent } from '@/domain/panelContent'
import { autoRouteFor } from '@/domain/routes'
import {
  content,
  cw,
  element,
  id,
  inputCable,
  panelWire,
  pole,
  rail,
} from '@/domain/__tests__/helpers'
import { stubLayout } from '@/editor/__tests__/harness'
import { useAuthStore } from '@/stores/auth'
import PanelView from '../PanelView.vue'

const Stub = defineComponent({ render: () => h('div', 'stub') })

/** A v1 panel with `wires` wires from an input cable wire to distinct poles, routed the v1 way. */
function v1(withWire: boolean, wires = 1): PanelContent {
  const base = content({
    layoutVersion: 1,
    inputCables: [inputCable(1, [2, 3])],
    rails: [rail(10, 24, 150, [element(20, 0, 6, Math.max(wires, 2))])],
  })
  if (!withWire) return base
  const layout = computeLayoutV1(base)
  return {
    ...base,
    wires: Array.from({ length: wires }, (_, k) => {
      const start = cw(id(2))
      const end = pole(id(20), k, 'input')
      return panelWire(30 + k, start, end, autoRouteFor(layout, { start, end }) as Pt[])
    }),
  }
}

const panelOf = (c: PanelContent, over: Partial<Panel> = {}): Panel => ({
  id: 'p1',
  name: 'Щит А',
  version: 3,
  createdAt: '2026-01-01T00:00:00+00:00',
  updatedAt: '2026-01-01T00:00:00+00:00',
  deletedAt: null,
  content: c,
  shortCircuits: [],
  ...over,
})

const mounted: VueWrapper[] = []
beforeEach(() => stubLayout())
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.restoreAllMocks()
  applyLocale('uk')
  i18n.global.locale.value = 'uk'
  document.body.innerHTML = ''
})

async function open(c: PanelContent, over: Partial<Panel> = {}) {
  vi.spyOn(panelsApi, 'get').mockResolvedValue(panelOf(c, over))
  const save = vi
    .spyOn(panelsApi, 'saveContent')
    .mockImplementation(async (_i, v, next) => panelOf(next, { version: v + 1 }))
  const pinia = createPinia()
  setActivePinia(pinia)
  const auth = useAuthStore()
  auth.user = { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false } as never
  auth.status = 'authenticated'
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Stub },
      { path: '/panels/:id', name: 'panel', component: PanelView, props: true },
      { path: '/trash', name: 'trash', component: Stub },
    ],
  })
  await router.push('/panels/p1')
  await router.isReady()
  const wrapper = mount(defineComponent({ render: () => h(RouterView) }), {
    global: { plugins: [pinia, router, vuetify] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, save }
}

describe('PanelView layout notice', () => {
  it('shows the notice with the wire count and the dirty indicator for a converted v1 panel', async () => {
    const { wrapper } = await open(v1(true))
    const notice = wrapper.find('.layout-notice')
    expect(notice.exists()).toBe(true)
    expect(notice.text()).toContain('1')
    expect(notice.text()).toContain('Маршрут 1 дроту оновлено під новий макет')
    expect(wrapper.text()).toContain('● Є незбережені зміни')
  })

  it.each([
    [1, 'Маршрут 1 дроту оновлено під новий макет'],
    [2, 'Маршрути 2 дротів оновлено під новий макет'],
    [5, 'Маршрути 5 дротів оновлено під новий макет'],
    [11, 'Маршрути 11 дротів оновлено під новий макет'],
    [21, 'Маршрут 21 дроту оновлено під новий макет'],
    [22, 'Маршрути 22 дротів оновлено під новий макет'],
  ])('uk plural for %i re-routed wires', async (n, text) => {
    const { wrapper } = await open(v1(true, n))
    expect(wrapper.get('.layout-notice').text()).toBe(text)
  })

  it.each([
    [1, 'The route of 1 wire was updated for the new layout'],
    [2, 'The routes of 2 wires were updated for the new layout'],
  ])('en plural for %i re-routed wires', async (n, text) => {
    applyLocale('en')
    const { wrapper } = await open(v1(true, n))
    expect(wrapper.get('.layout-notice').text()).toBe(text)
  })

  it('the notice follows the locale', async () => {
    const { wrapper } = await open(v1(true))
    applyLocale('en')
    await flushPromises()
    expect(wrapper.find('.layout-notice').text()).toContain('The route of 1 wire was updated')
  })

  it('saving removes the notice', async () => {
    const { wrapper, save } = await open(v1(true))
    await wrapper
      .findAll('button')
      .find((b) => b.text() === 'Зберегти')!
      .trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalled()
    expect(save.mock.calls[0]?.[2].layoutVersion).toBe(2)
    expect(wrapper.find('.layout-notice').exists()).toBe(false)
  })

  it.each([
    ['a v1 panel where nothing changes', v1(false), {}],
    ['a v2 panel', { ...v1(true), layoutVersion: 2 as const }, {}],
    ['a trashed v1 panel', v1(true), { deletedAt: '2026-02-01T00:00:00+00:00' }],
  ])('has no notice for %s', async (_n, c, over) => {
    const { wrapper } = await open(c, over)
    expect(wrapper.find('.layout-notice').exists()).toBe(false)
  })
})
