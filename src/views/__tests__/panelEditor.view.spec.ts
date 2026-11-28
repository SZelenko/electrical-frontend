import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia, type Pinia } from 'pinia'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import { defineComponent, h, nextTick } from 'vue'
import { panelsApi, type Panel } from '@/api/panels'
import { ApiError } from '@/api/problem'
import { updateElement, updateInputCable } from '@/domain/commands'
import { buildWorld, id } from '@/domain/__tests__/helpers'
import type { PanelContent } from '@/domain/panelContent'
import { stubLayout } from '@/editor/__tests__/harness'
import { useAuthStore } from '@/stores/auth'
import { usePanelEditorStore } from '@/stores/panelEditor'
import { mountView } from '@/test/mountView'
import AccountView from '../AccountView.vue'
import PanelView from '../PanelView.vue'

const world = buildWorld()
const Stub = defineComponent({ render: () => h('div', 'stub') })

function panelOf(c: PanelContent = world, over: Partial<Panel> = {}): Panel {
  return {
    id: 'p1',
    name: 'Щит А',
    version: 3,
    createdAt: '2026-01-01T00:00:00+00:00',
    updatedAt: '2026-01-01T00:00:00+00:00',
    deletedAt: null,
    content: c,
    shortCircuits: [],
    ...over,
  }
}

let get: MockInstance<typeof panelsApi.get>
let save: MockInstance<typeof panelsApi.saveContent>
let confirm: MockInstance<(message?: string) => boolean>

beforeEach(() => {
  vi.restoreAllMocks()
  stubLayout()
  get = vi.spyOn(panelsApi, 'get').mockResolvedValue(panelOf())
  save = vi
    .spyOn(panelsApi, 'saveContent')
    .mockImplementation(async (_i, v, c) => panelOf(c, { version: v + 1 }))
  confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
})
const mounted: VueWrapper[] = []
afterEach(() => {
  for (const w of mounted.splice(0)) w.unmount()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

interface Mounted {
  wrapper: VueWrapper
  pinia: Pinia
  router: ReturnType<typeof createRouter>
  editor: ReturnType<typeof usePanelEditorStore>
  auth: ReturnType<typeof useAuthStore>
}

/** Mounts PanelView through a RouterView so that the route guards of the view are active. */
async function mountPanel(): Promise<Mounted> {
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
    global: { plugins: [pinia, router] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  await flushPromises()
  return { wrapper, pinia, router, editor: usePanelEditorStore(), auth }
}

const button = (w: VueWrapper, name: string | RegExp) =>
  w
    .findAll('button')
    .find((b) => (typeof name === 'string' ? b.text() === name : name.test(b.text())))!
/** Applies an edit and lets the view render the dirty state (the save button is enabled afterwards). */
async function edit(m: Mounted, v = 400) {
  m.editor.apply(updateInputCable(id(1), { voltage: v }), 'editor.history.changeVoltage')
  await nextTick()
}
const apiError = (init: ConstructorParameters<typeof ApiError>[0]) => new ApiError(init)

describe('PanelView: saving', () => {
  it('saves, shows the notice and the clean indicator, and disables the button again', async () => {
    const m = await mountPanel()
    expect(button(m.wrapper, 'Зберегти').attributes('disabled')).toBeDefined()
    await edit(m)
    await nextTick()
    expect(m.wrapper.text()).toContain('● Є незбережені зміни')
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(save).toHaveBeenCalledWith('p1', 3, m.editor.content)
    expect(m.wrapper.text()).toContain('Збережено.')
    expect(m.wrapper.text()).toContain('Усі зміни збережено')
    expect(button(m.wrapper, 'Зберегти').attributes('disabled')).toBeDefined()
  })

  it('shows the button as busy while a save is in flight', async () => {
    const m = await mountPanel()
    await edit(m)
    let finish!: (p: Panel) => void
    save.mockReturnValueOnce(new Promise((r) => (finish = r)))
    await button(m.wrapper, 'Зберегти').trigger('click')
    await nextTick()
    expect(button(m.wrapper, 'Збереження…').attributes('disabled')).toBeDefined()
    finish(panelOf(m.editor.content as PanelContent, { version: 4 }))
    await flushPromises()
    expect(m.wrapper.text()).toContain('Усі зміни збережено')
  })

  it('warns about the short circuits returned by the backend after a successful save', async () => {
    const m = await mountPanel()
    await edit(m)
    const group = { sources: [id(2), id(3)], wireIds: [id(30)], terminals: [] }
    save.mockImplementationOnce(async (_i, v, c) =>
      panelOf(c, { version: v + 1, shortCircuits: [group] }),
    )
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(m.wrapper.text()).toContain('Збережено. Увага: виявлено коротких замикань: 1.')
    expect(m.wrapper.text()).toContain('Короткі замикання: 1')
    expect(m.wrapper.text()).toContain('провід №1')
    expect(m.wrapper.text()).toContain('вхідний кабель 1, провід 1 (коричневий)')
    expect(m.editor.dirty).toBe(false) // the save succeeded
  })

  describe('409 version conflict', () => {
    const conflict = () =>
      apiError({ status: 409, type: 'panel_version_conflict', message: 's', currentVersion: 9 })

    it('opens the dialog and keeps the local edits untouched', async () => {
      const m = await mountPanel()
      await edit(m)
      save.mockRejectedValueOnce(conflict())
      await button(m.wrapper, 'Зберегти').trigger('click')
      await flushPromises()
      const dialog = m.wrapper.get('[role=alertdialog]')
      expect(dialog.text()).toContain('Щит змінено в іншому місці')
      expect(m.editor.dirty).toBe(true)
      expect(m.editor.content?.inputCables[0]?.voltage).toBe(400)
    })

    it('reload & discard fetches the server state, closes the dialog and drops local changes', async () => {
      const m = await mountPanel()
      await edit(m)
      save.mockRejectedValueOnce(conflict())
      await button(m.wrapper, 'Зберегти').trigger('click')
      await flushPromises()
      get.mockResolvedValueOnce(panelOf(world, { version: 9, name: 'Нова версія' }))
      await button(m.wrapper, /^Завантажити останню версію/).trigger('click')
      await flushPromises()
      expect(get).toHaveBeenCalledTimes(2)
      expect(m.wrapper.find('[role=alertdialog]').exists()).toBe(false)
      expect(m.editor.dirty).toBe(false)
      expect(m.editor.baseVersion).toBe(9)
      expect(m.wrapper.get('h1').text()).toBe('Нова версія')
      expect(m.wrapper.text()).toContain('Усі зміни збережено')
    })

    it('reload failure keeps the dialog open with a message', async () => {
      const m = await mountPanel()
      await edit(m)
      save.mockRejectedValueOnce(conflict())
      await button(m.wrapper, 'Зберегти').trigger('click')
      await flushPromises()
      get.mockRejectedValueOnce(apiError({ status: 0, type: 'network', message: 'n' }))
      await button(m.wrapper, /^Завантажити останню версію/).trigger('click')
      await flushPromises()
      expect(m.wrapper.find('[role=alertdialog]').text()).toContain('Не вдалося завантажити щит')
      expect(m.editor.dirty).toBe(true)
    })

    it('keep editing closes the dialog, leaves a banner and keeps saving disabled until reload', async () => {
      const m = await mountPanel()
      await edit(m)
      save.mockRejectedValueOnce(conflict())
      await button(m.wrapper, 'Зберегти').trigger('click')
      await flushPromises()
      await button(m.wrapper, /^Продовжити редагування/).trigger('click')
      expect(m.wrapper.find('[role=alertdialog]').exists()).toBe(false)
      expect(m.wrapper.text()).toContain('Збереження вимкнено')
      expect(button(m.wrapper, 'Зберегти').attributes('disabled')).toBeDefined()
      // editing still works
      await edit(m, 500)
      await nextTick()
      expect(m.editor.content?.inputCables[0]?.voltage).toBe(500)
      expect(button(m.wrapper, 'Зберегти').attributes('disabled')).toBeDefined()
      expect(save).toHaveBeenCalledTimes(1)
      // the banner offers the reload
      get.mockResolvedValueOnce(panelOf(world, { version: 9 }))
      await button(m.wrapper, /Завантажити останню версію/).trigger('click')
      await flushPromises()
      expect(m.wrapper.text()).not.toContain('Збереження вимкнено')
      expect(m.editor.dirty).toBe(false)
    })
  })

  it('409 content id conflict is an error banner, not the dialog; saving stays possible', async () => {
    const m = await mountPanel()
    await edit(m)
    save.mockRejectedValueOnce(
      apiError({ status: 409, type: 'panel_content_id_conflict', message: 'ids' }),
    )
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(m.wrapper.find('[role=alertdialog]').exists()).toBe(false)
    expect(m.wrapper.text()).toContain('Конфлікт ідентифікаторів')
    expect(button(m.wrapper, 'Зберегти').attributes('disabled')).toBeUndefined()
    expect(m.editor.dirty).toBe(true)
  })

  it('404 says the panel was deleted or moved to the trash', async () => {
    const m = await mountPanel()
    await edit(m)
    save.mockRejectedValueOnce(apiError({ status: 404, type: 'unknown', message: 'nf' }))
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(m.wrapper.text()).toContain('Щит видалено або переміщено в кошик')
    expect(m.editor.dirty).toBe(true)
  })

  it('a network failure and an unknown failure are reported', async () => {
    const m = await mountPanel()
    await edit(m)
    save.mockRejectedValueOnce(apiError({ status: 0, type: 'network', message: 'n' }))
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(m.wrapper.text()).toContain('Немає зв’язку з сервером')
    save.mockRejectedValueOnce(apiError({ status: 500, type: 'unknown', message: 'boom' }))
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(m.wrapper.text()).toContain('Не вдалося зберегти: boom')
  })

  it('422 highlights the offending item on the canvas and lists the general violations', async () => {
    const m = await mountPanel()
    await edit(m)
    save.mockRejectedValueOnce(
      apiError({
        status: 422,
        type: 'validation',
        message: 'invalid',
        violations: {
          'content.rails[0].elements[0].label': ['Must be at most 16 characters long.'],
          'content.wires': ['At most 5000 wires are allowed.'],
        },
      }),
    )
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(m.wrapper.get(`[data-testid=element][data-id="${id(20)}"]`).classes()).toContain(
      'violation',
    )
    expect(m.wrapper.text()).toContain('Елементи з помилками підсвічено на схемі.')
    expect(m.wrapper.text()).toContain('Сервер відхилив зміни')
    expect(m.wrapper.text()).toContain('content.wires — At most 5000 wires are allowed.')
    expect(m.wrapper.text()).not.toContain('content.rails[0].elements[0].label —') // that one is highlighted instead
    expect(m.editor.selection).toEqual({ kind: 'element', id: id(20) })
  })

  it('the violation highlight disappears after the next successful save', async () => {
    const m = await mountPanel()
    await edit(m)
    save.mockRejectedValueOnce(
      apiError({
        status: 422,
        type: 'validation',
        message: 'i',
        violations: { 'content.rails[0].elements[0].label': ['bad'] },
      }),
    )
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(m.wrapper.get(`[data-testid=element][data-id="${id(20)}"]`).classes()).not.toContain(
      'violation',
    )
    expect(m.wrapper.text()).not.toContain('Елементи з помилками')
  })

  it('local validation shows the violations and never sends the request', async () => {
    const bad = structuredClone(world)
    bad.inputCables[0]!.voltage = 0
    get.mockResolvedValue(panelOf(bad))
    const m = await mountPanel()
    m.editor.apply(updateElement(id(20), { label: 'QF' }), 'editor.history.changeElementLabel')
    await nextTick()
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(save).not.toHaveBeenCalled()
    expect(m.wrapper.text()).toContain('Елементи з помилками підсвічено на схемі.')
    expect(m.wrapper.get(`[data-testid=input-cable][data-id="${id(1)}"]`).classes()).toContain(
      'violation',
    )
  })

  it('the auth error is shown and cleared once the user is authenticated again', async () => {
    const m = await mountPanel()
    await edit(m)
    save.mockRejectedValueOnce(apiError({ status: 401, type: 'token_invalid', message: 'x' }))
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    expect(m.wrapper.text()).toContain('Сесія завершилась')
    m.auth.status = 'reloginNeeded'
    await nextTick()
    expect(m.wrapper.text()).toContain('Сесія завершилась') // still lost
    m.auth.status = 'authenticated'
    await nextTick()
    expect(m.wrapper.text()).not.toContain('Сесія завершилась')
    expect(m.editor.dirty).toBe(true) // the work is kept
    expect(button(m.wrapper, 'Зберегти').attributes('disabled')).toBeUndefined()
  })
})

describe('PanelView: short circuits list', () => {
  const group = { sources: [id(2), id(3)], wireIds: [id(30), id(31)], terminals: [] }

  it('says nothing is wrong when there are none', async () => {
    const m = await mountPanel()
    expect(m.wrapper.text()).toContain('КЗ не виявлено.')
  })

  it('lists the groups and "Показати на схемі" selects and emphasises the first wire', async () => {
    get.mockResolvedValue(panelOf(world, { shortCircuits: [group] }))
    const m = await mountPanel()
    expect(m.wrapper.get('[aria-label="Короткі замикання"]').text()).toContain(
      'Короткі замикання: 1',
    )
    expect(m.wrapper.findAll('path[stroke="#ff00ff"][stroke-opacity="0.9"]')).toHaveLength(0)
    await button(m.wrapper, 'Показати на схемі').trigger('click')
    expect(m.editor.selection).toEqual({ kind: 'wire', id: id(30) })
    expect(m.wrapper.findAll('path[stroke="#ff00ff"][stroke-opacity="0.9"]')).toHaveLength(2)
  })

  it('switches to the local result as soon as the content changes', async () => {
    get.mockResolvedValue(panelOf(world, { shortCircuits: [group] }))
    const m = await mountPanel()
    await edit(m)
    await nextTick()
    expect(m.wrapper.text()).toContain('КЗ не виявлено.') // the local check finds none in the world
  })
})

describe('PanelView: read-only trashed panel', () => {
  it('shows the note and hides every editing control', async () => {
    get.mockResolvedValue(panelOf(world, { deletedAt: '2026-02-01T00:00:00+00:00' }))
    const m = await mountPanel()
    expect(m.wrapper.text()).toContain('Щит знаходиться в кошику. Редагування вимкнено.')
    expect(m.wrapper.findAll('button').map((b) => b.text())).not.toContain('Зберегти')
    expect(m.wrapper.findAll('button').map((b) => b.text())).not.toContain('Видалити')
    expect(m.wrapper.find('[role=toolbar]').exists()).toBe(false)
    expect(m.wrapper.find('[data-testid=panel-canvas]').exists()).toBe(true)
    expect(m.wrapper.text()).not.toContain('Є незбережені зміни')
  })
})

describe('PanelView: leaving with unsaved changes', () => {
  it('asks for confirmation and stays when declined', async () => {
    const m = await mountPanel()
    await edit(m)
    confirm.mockReturnValueOnce(false)
    await m.router.push('/')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(confirm.mock.calls[0]?.[0]).toContain('незбережені зміни')
    expect(m.router.currentRoute.value.fullPath).toBe('/panels/p1')
    expect(m.editor.dirty).toBe(true)
  })

  it('leaves when confirmed and keeps the work for the way back', async () => {
    const m = await mountPanel()
    await edit(m)
    confirm.mockReturnValueOnce(true)
    await m.router.push('/')
    await flushPromises()
    expect(m.router.currentRoute.value.fullPath).toBe('/')
    expect(m.editor.dirty).toBe(true)
  })

  it('does not ask when the editor is clean', async () => {
    const m = await mountPanel()
    await m.router.push('/')
    expect(confirm).not.toHaveBeenCalled()
    expect(m.router.currentRoute.value.fullPath).toBe('/')
  })

  it('does not ask after a save made it clean', async () => {
    const m = await mountPanel()
    await edit(m)
    await button(m.wrapper, 'Зберегти').trigger('click')
    await flushPromises()
    await m.router.push('/')
    expect(confirm).not.toHaveBeenCalled()
  })

  it('lets the navigation through when the session was lost (reloginNeeded)', async () => {
    const m = await mountPanel()
    await edit(m)
    m.auth.status = 'reloginNeeded'
    await m.router.push('/')
    expect(confirm).not.toHaveBeenCalled()
    expect(m.router.currentRoute.value.fullPath).toBe('/')
    expect(m.editor.dirty).toBe(true) // the work is kept in memory
  })

  it('registers a beforeunload prompt only while dirty', async () => {
    const m = await mountPanel()
    const clean = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(clean)
    expect(clean.defaultPrevented).toBe(false)
    await edit(m)
    await nextTick()
    const dirty = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(dirty)
    expect(dirty.defaultPrevented).toBe(true)
    m.editor.undo()
    await nextTick()
    const again = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(again)
    expect(again.defaultPrevented).toBe(false)
  })

  it('removes the beforeunload prompt when the view is unmounted', async () => {
    const m = await mountPanel()
    await edit(m)
    await nextTick()
    m.wrapper.unmount()
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('PanelView: delete confirmation', () => {
  beforeEach(() => {
    vi.spyOn(panelsApi, 'remove').mockResolvedValue()
  })

  it('mentions the unsaved changes when there are some', async () => {
    const m = await mountPanel()
    await edit(m)
    await nextTick()
    confirm.mockReturnValueOnce(false)
    await button(m.wrapper, 'Видалити').trigger('click')
    expect(confirm.mock.calls[0]?.[0]).toContain('Незбережені зміни буде втрачено.')
  })

  it('does not mention them for a clean editor', async () => {
    const m = await mountPanel()
    confirm.mockReturnValueOnce(false)
    await button(m.wrapper, 'Видалити').trigger('click')
    expect(confirm.mock.calls[0]?.[0]).toContain('Перемістити щит «Щит А» до кошика?')
    expect(confirm.mock.calls[0]?.[0]).not.toContain('Незбережені')
  })

  it('deletes after confirmation without asking again about the unsaved changes on the way out', async () => {
    const m = await mountPanel()
    await edit(m)
    await nextTick()
    await button(m.wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(panelsApi.remove).toHaveBeenCalledWith('p1')
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(m.router.currentRoute.value.name).toBe('home')
  })
})

describe('AccountView: logout with unsaved editor changes', () => {
  async function account(dirty: boolean) {
    get.mockResolvedValue(panelOf())
    const ctx = await mountView(AccountView, '/', {}, (pinia) => {
      const auth = useAuthStore(pinia)
      auth.user = {
        id: 'u1',
        email: 'a@b.c',
        emailVerified: true,
        twoFactorEnabled: false,
      } as never
      auth.status = 'authenticated'
    })
    const editor = usePanelEditorStore(ctx.pinia)
    await editor.load('p1')
    if (dirty)
      editor.apply(updateInputCable(id(1), { voltage: 400 }), 'editor.history.changeVoltage')
    const logout = vi.spyOn(useAuthStore(ctx.pinia), 'logout').mockResolvedValue()
    return { ...ctx, logout }
  }

  it('asks before logging out and stays when declined', async () => {
    const { wrapper, logout } = await account(true)
    confirm.mockReturnValueOnce(false)
    await button(wrapper, 'Вийти').trigger('click')
    await flushPromises()
    expect(confirm.mock.calls[0]?.[0]).toContain('незбережені зміни щита')
    expect(logout).not.toHaveBeenCalled()
  })

  it('logs out and goes to the login page when confirmed', async () => {
    const { wrapper, logout, router } = await account(true)
    await button(wrapper, 'Вийти').trigger('click')
    await flushPromises()
    expect(logout).toHaveBeenCalledTimes(1)
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('logs out without asking when the editor is clean', async () => {
    const { wrapper, logout } = await account(false)
    await button(wrapper, 'Вийти').trigger('click')
    await flushPromises()
    expect(confirm).not.toHaveBeenCalled()
    expect(logout).toHaveBeenCalledTimes(1)
  })
})
