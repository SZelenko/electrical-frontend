/** Language switching in the UI: views and the editor re-render, and violations are translated by code. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { panelsApi } from '@/api/panels'
import { ApiError } from '@/api/problem'
import type { ViolationInfo } from '@/domain/violation'
import { updateInputCable } from '@/domain/commands'
import { buildWorld, id } from '@/domain/__tests__/helpers'
import { mountEditor, panelOf, stubLayout } from '@/editor/__tests__/harness'
import { applyLocale } from '@/i18n'
import { useAuthStore } from '@/stores/auth'
import { usePanelEditorStore } from '@/stores/panelEditor'
import { ldList, ME, routeFetch } from '@/test/http'
import { mountView } from '@/test/mountView'
import { useAsyncForm } from '@/composables/useAsyncForm'
import HomeView from '../HomeView.vue'
import PanelView from '../PanelView.vue'

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  localStorage.clear()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  document.body.innerHTML = ''
})

describe('HomeView', () => {
  it('re-renders in English when the language is switched, and back', async () => {
    routeFetch({ 'GET /panels?page=1': () => ldList([], 0) })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    expect(wrapper.text()).toContain('У вас ще немає щитів')
    expect(wrapper.text()).toContain('Мої щити')

    applyLocale('en')
    await nextTick()
    expect(wrapper.text()).not.toContain('У вас ще немає щитів')
    expect(wrapper.text()).not.toContain('Мої щити')
    expect(wrapper.get('h1').text()).toBe('My panels')
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Navigation')

    applyLocale('uk')
    await nextTick()
    expect(wrapper.get('h1').text()).toBe('Мої щити')
  })
})

describe('editor in English', () => {
  beforeEach(() => stubLayout())

  it('shows the toolbar in English after the switch', async () => {
    const { wrapper } = await mountEditor(buildWorld(), { toolbar: true })
    expect(wrapper.text()).toContain('Додати рейку')
    applyLocale('en')
    await nextTick()
    expect(wrapper.text()).toContain('Add rail')
    expect(wrapper.text()).not.toContain('Додати рейку')
    wrapper.unmount()
  })

  it('captions the cables "In N" / "Out N" in English and "Вх N" / "Вих N" in Ukrainian', async () => {
    const { wrapper } = await mountEditor(buildWorld())
    const captions = () => wrapper.findAll('text').map((t) => t.text())
    expect(captions()).toContain('Вх 1')
    expect(captions()).toContain('Вих 1')
    applyLocale('en')
    await nextTick()
    expect(captions()).toContain('In 1')
    expect(captions()).toContain('Out 1')
    expect(captions()).not.toContain('Вх 1')
    wrapper.unmount()
  })
})

describe('editor undo/redo titles follow the locale', () => {
  beforeEach(() => stubLayout())

  it('re-translates the history label in the Undo and Redo titles', async () => {
    const { wrapper, store } = await mountEditor(buildWorld(), { toolbar: true })
    store.apply(updateInputCable(id(1), { voltage: 400 }), 'editor.history.changeVoltage')
    await nextTick()
    const title = (name: RegExp) =>
      wrapper
        .findAll('button')
        .find((b) => name.test(b.text()))!
        .attributes('title')
    expect(title(/Скасувати/)).toBe('Скасувати: Змінити напругу')
    applyLocale('en')
    await nextTick()
    expect(title(/Undo/)).toBe('Undo: Change voltage')
    store.undo()
    await nextTick()
    expect(title(/Redo/)).toBe('Redo: Change voltage')
    applyLocale('uk')
    await nextTick()
    expect(title(/Повторити/)).toBe('Повторити: Змінити напругу')
    wrapper.unmount()
  })
})

describe('PanelView: a server 422 violation is translated by code', () => {
  const world = buildWorld()
  const mounted: VueWrapper[] = []
  afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

  async function mountPanel(mutate?: (c: typeof world) => void) {
    const pinia = createPinia()
    setActivePinia(pinia)
    const auth = useAuthStore()
    auth.user = { ...ME, locale: null }
    auth.status = 'authenticated'
    const content = structuredClone(world)
    mutate?.(content)
    vi.spyOn(panelsApi, 'get').mockResolvedValue(panelOf(content, { version: 3 }))
    const Stub = defineComponent({ render: () => h('div') })
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
      global: { plugins: [pinia, router] },
      attachTo: document.body,
    })
    mounted.push(wrapper)
    await flushPromises()
    return { wrapper, editor: usePanelEditorStore() }
  }

  const rejection = () =>
    new ApiError({
      status: 422,
      type: 'validation',
      message: 'invalid',
      violations: { 'content.wires': ['At most 5000 wires are allowed.'] },
      violationDetails: {
        'content.wires': [
          {
            code: 'wires.too_many',
            message: 'At most 5000 wires are allowed.',
            parameters: { max: 5000 },
          },
        ],
      },
    })

  async function save(m: Awaited<ReturnType<typeof mountPanel>>) {
    m.editor.apply(updateInputCable(id(1), { voltage: 400 }), 'editor.history.changeVoltage')
    await nextTick()
    const btn = m.wrapper.findAll('button').find((b) => b.text() === 'Зберегти')!
    await btn.trigger('click')
    await flushPromises()
  }

  it('shows the Ukrainian text, then the English one after a switch', async () => {
    const m = await mountPanel()
    vi.spyOn(panelsApi, 'saveContent').mockRejectedValue(rejection())
    await save(m)
    expect(m.wrapper.text()).toContain('content.wires — Не більше 5000 проводів.')
    expect(m.wrapper.text()).not.toContain('At most 5000 wires')
    applyLocale('en')
    await nextTick()
    expect(m.wrapper.text()).toContain('content.wires — At most 5000 wires are allowed.')
  })

  it('shows the backend message for an unknown code', async () => {
    const m = await mountPanel()
    vi.spyOn(panelsApi, 'saveContent').mockRejectedValue(
      new ApiError({
        status: 422,
        type: 'validation',
        message: 'invalid',
        violations: { 'content.wires': ['Brand new rule.'] },
        violationDetails: {
          'content.wires': [{ code: 'future.rule', message: 'Brand new rule.', parameters: {} }],
        },
      }),
    )
    await save(m)
    expect(m.wrapper.text()).toContain('content.wires — Brand new rule.')
  })

  it('shows the backend message when the response has no codes at all', async () => {
    const m = await mountPanel()
    vi.spyOn(panelsApi, 'saveContent').mockRejectedValue(
      new ApiError({
        status: 422,
        type: 'validation',
        message: 'invalid',
        violations: { 'content.wires': ['Legacy message.'] },
      }),
    )
    await save(m)
    expect(m.wrapper.text()).toContain('content.wires — Legacy message.')
  })

  it('a client-side violation is shown in Ukrainian and in English after the switch, without a request', async () => {
    const m = await mountPanel((c) => {
      c.railWidthModules = 61
    })
    const save = vi.spyOn(panelsApi, 'saveContent')
    m.editor.apply(updateInputCable(id(1), { voltage: 400 }), 'editor.history.changeVoltage')
    await nextTick()
    await m.wrapper
      .findAll('button')
      .find((b) => b.text() === 'Зберегти')!
      .trigger('click')
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(m.wrapper.text()).toContain('content.railWidthModules — Значення має бути від 1 до 60.')
    applyLocale('en')
    await nextTick()
    expect(m.wrapper.text()).toContain('content.railWidthModules — Must be between 1 and 60.')
  })
})

describe('useAsyncForm field errors', () => {
  const error = (details: Record<string, ViolationInfo[]>) =>
    new ApiError({
      status: 422,
      type: 'validation',
      message: 'v',
      violations: Object.fromEntries(
        Object.entries(details).map(([k, v]) => [k, v.map((d) => d.message)]),
      ),
      violationDetails: details,
    })

  it('translates by code and follows the locale', async () => {
    const form = useAsyncForm(['name'])
    await form.run(() =>
      Promise.reject(
        error({
          name: [
            {
              code: 'name.too_long',
              message: 'The name must be at most 64 characters long.',
              parameters: { max: 64 },
            },
          ],
        }),
      ),
    )
    expect(form.fieldErrors.value).toEqual({ name: ['Назва має містити не більше 64 символів.'] })
    applyLocale('en')
    expect(form.fieldErrors.value).toEqual({
      name: ['The name must be at most 64 characters long.'],
    })
  })

  it('accepts [] parameters (API Platform DTO path) and falls back to the message for an unknown code', async () => {
    const form = useAsyncForm(['email', 'x'])
    await form.run(() =>
      Promise.reject(
        error({
          email: [{ code: 'email.invalid', message: 'bad', parameters: [] }],
          x: [{ code: 'zzz.unknown', message: 'Plain server text.' }],
        }),
      ),
    )
    expect(form.fieldErrors.value).toEqual({
      email: ['Некоректна адреса електронної пошти.'],
      x: ['Plain server text.'],
    })
  })
})
