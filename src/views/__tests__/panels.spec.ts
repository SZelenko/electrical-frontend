import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { fullPanelJson, jsonResponse, ldList, problem, routeFetch } from '@/test/http'
import { mountView, viewGlobal } from '@/test/mountView'
import HomeView from '../HomeView.vue'
import TrashView from '../TrashView.vue'
import PanelView from '../PanelView.vue'
import { addRail } from '@/domain/commands'
import { useAuthStore } from '@/stores/auth'
import { usePanelEditorStore } from '@/stores/panelEditor'

let confirm: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  confirm = vi.spyOn(window, 'confirm')
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const p = (id: string, name = id, extra: Record<string, unknown> = {}) =>
  fullPanelJson({ id, name, ...extra })
function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => (resolve = r))
  return { promise, resolve }
}
const emptyOk = () => new Response(null, { status: 204 })
const buttonByText = (w: VueWrapper, text: string) =>
  w.findAll('button').find((b) => b.text() === text)!

describe('HomeView', () => {
  it('shows the empty state for no panels', async () => {
    routeFetch({ 'GET /panels?page=1': () => ldList([], 0) })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    expect(wrapper.text()).toContain('У вас ще немає щитів')
    expect(wrapper.find('.panel-list').exists()).toBe(false)
  })

  it('lists panels as links to their pages', async () => {
    routeFetch({ 'GET /panels?page=1': () => ldList([p('a', 'Alpha'), p('b', 'Beta')]) })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    const links = wrapper.findAll('.panel-list a')
    expect(links.map((l) => l.text())).toEqual(['Alpha', 'Beta'])
    expect(links[0]!.attributes('href')).toBe('/panels/a')
    expect(wrapper.text()).not.toContain('У вас ще немає щитів')
  })

  it('shows an error message when the list fails to load', async () => {
    routeFetch({ 'GET /panels?page=1': () => jsonResponse(500, {}) })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
    expect(wrapper.text()).not.toContain('У вас ще немає щитів')
  })

  it('creates a panel and navigates to it', async () => {
    const f = routeFetch({
      'GET /panels?page=1': () => ldList([]),
      'POST /panels': () => jsonResponse(201, p('new', 'Новий')),
    })
    const { wrapper, router } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Створити щит').trigger('click')
    await wrapper.get('input').setValue('  Новий  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(JSON.parse(f.calls.find((c) => c.key === 'POST /panels')!.init.body as string)).toEqual({
      name: 'Новий',
    })
    expect(router.currentRoute.value.name).toBe('panel')
    expect(router.currentRoute.value.params.id).toBe('new')
  })

  it('shows a name conflict on create and stays', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([]),
      'POST /panels': () => problem(409, 'panel_name_conflict'),
    })
    const { wrapper, router } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Створити щит').trigger('click')
    await wrapper.get('input').setValue('Dup')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('form [role=alert]').text()).toContain('вже існує')
    expect(router.currentRoute.value.name).toBe('test')
  })

  it('shows 422 violations under the name field on create', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([]),
      'POST /panels': () =>
        jsonResponse(422, { violations: [{ propertyPath: 'name', message: 'Занадто довга' }] }),
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Створити щит').trigger('click')
    await wrapper.get('input').setValue('x')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.field-error').text()).toBe('Занадто довга')
    expect(wrapper.find('form [role=alert]').exists()).toBe(false)
  })

  it('renames a panel in place', async () => {
    const f = routeFetch({
      'GET /panels?page=1': () => ldList([p('a', 'Old')]),
      'PATCH /panels/a': () => jsonResponse(200, p('a', 'New', { version: 2 })),
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Перейменувати').trigger('click')
    const input = wrapper.get('.panel-list input')
    expect((input.element as HTMLInputElement).value).toBe('Old')
    await input.setValue('New')
    await wrapper.get('.panel-list form').trigger('submit')
    await flushPromises()
    expect(
      JSON.parse(f.calls.find((c) => c.key === 'PATCH /panels/a')!.init.body as string),
    ).toEqual({ name: 'New' })
    expect(wrapper.find('.panel-list form').exists()).toBe(false)
    expect(wrapper.get('.panel-list a').text()).toBe('New')
  })

  it('keeps the rename form open with a conflict message on 409', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([p('a', 'Old')]),
      'PATCH /panels/a': () => problem(409, 'panel_name_conflict'),
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Перейменувати').trigger('click')
    await wrapper.get('.panel-list input').setValue('Dup')
    await wrapper.get('.panel-list form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.panel-list form [role=alert]').text()).toContain('вже існує')
    expect(wrapper.find('.panel-list form').exists()).toBe(true)
  })

  it('shows a 422 violation under the field when renaming', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([p('a', 'Old')]),
      'PATCH /panels/a': () =>
        jsonResponse(422, { violations: [{ propertyPath: 'name', message: 'Bad name' }] }),
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Перейменувати').trigger('click')
    await wrapper.get('.panel-list input').setValue('x')
    await wrapper.get('.panel-list form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.panel-list .field-error').text()).toBe('Bad name')
  })

  it('shows a generic message and no unhandled rejection when the rename payload is malformed', async () => {
    routeFetch({
      'GET /panels?page=1': () => ldList([p('a', 'Old')]),
      'PATCH /panels/a': () => jsonResponse(200, { id: 'a' }),
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Перейменувати').trigger('click')
    await wrapper.get('.panel-list input').setValue('New')
    await wrapper.get('.panel-list form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('Неочікувана відповідь сервера')
  })

  it('cancelling rename restores the link', async () => {
    routeFetch({ 'GET /panels?page=1': () => ldList([p('a', 'Old')]) })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Перейменувати').trigger('click')
    await buttonByText(wrapper, 'Скасувати').trigger('click')
    expect(wrapper.find('.panel-list form').exists()).toBe(false)
  })

  it('deletes after confirmation and reloads the list', async () => {
    confirm.mockReturnValue(true)
    let deleted = false
    const f = routeFetch({
      'GET /panels?page=1': () => ldList(deleted ? [] : [p('a', 'Alpha')]),
      'DELETE /panels/a': () => {
        deleted = true
        return emptyOk()
      },
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(f.count('DELETE /panels/a')).toBe(1)
    expect(wrapper.text()).toContain('У вас ще немає щитів')
  })

  it('removes the item and reports only the reload error when the delete succeeded but the reload failed', async () => {
    confirm.mockReturnValue(true)
    let deleted = false
    const f = routeFetch({
      'GET /panels?page=1': () =>
        deleted ? jsonResponse(500, {}) : ldList([p('a'), p('b', 'Beta')], 2),
      'DELETE /panels/a': () => {
        deleted = true
        return emptyOk()
      },
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(f.count('DELETE /panels/a')).toBe(1)
    expect(wrapper.findAll('.panel-list a').map((a) => a.text())).toEqual(['Beta'])
    expect(wrapper.findAll('[role=alert]')).toHaveLength(1)
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
  })

  it('does not reload the list when the delete itself failed', async () => {
    confirm.mockReturnValue(true)
    const f = routeFetch({
      'GET /panels?page=1': () => ldList([p('a')]),
      'DELETE /panels/a': () => jsonResponse(500, {}),
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(f.count('GET /panels?page=1')).toBe(1)
  })

  it('steps back a page after deleting the last item of a later page', async () => {
    confirm.mockReturnValue(true)
    const f = routeFetch({
      'GET /panels?page=1': () => ldList([p('a', 'First')], 31),
      'GET /panels?page=2': () => ldList([p('z', 'Last')], 31),
      'DELETE /panels/z': emptyOk,
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Далі').trigger('click')
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(f.count('GET /panels?page=1')).toBe(2)
    expect(wrapper.get('.panel-list a').text()).toBe('First')
  })

  it('does nothing when the confirmation is cancelled', async () => {
    confirm.mockReturnValue(false)
    const f = routeFetch({ 'GET /panels?page=1': () => ldList([p('a')]) })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(f.calls.some((c) => c.key.startsWith('DELETE'))).toBe(false)
    expect(wrapper.find('.panel-list a').exists()).toBe(true)
  })

  it('shows an error when deleting fails and keeps the item', async () => {
    confirm.mockReturnValue(true)
    routeFetch({
      'GET /panels?page=1': () => ldList([p('a')]),
      'DELETE /panels/a': () => jsonResponse(500, {}),
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
    expect(wrapper.find('.panel-list a').exists()).toBe(true)
  })

  it('hides pagination for a single page', async () => {
    routeFetch({ 'GET /panels?page=1': () => ldList([p('a')], 30) })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    expect(wrapper.find('nav.pagination').exists()).toBe(false)
  })

  it('shows pagination for several pages and loads the next one', async () => {
    const f = routeFetch({
      'GET /panels?page=1': () => ldList([p('a')], 31),
      'GET /panels?page=2': () => ldList([p('b', 'Page two')], 31),
    })
    const { wrapper } = await mountView(HomeView)
    await flushPromises()
    const nav = wrapper.get('nav.pagination')
    expect(nav.text()).toContain('1 з 2')
    expect(buttonByText(wrapper, 'Назад').attributes('disabled')).toBeDefined()
    await buttonByText(wrapper, 'Далі').trigger('click')
    await flushPromises()
    expect(f.count('GET /panels?page=2')).toBe(1)
    expect(wrapper.get('.panel-list a').text()).toBe('Page two')
    expect(buttonByText(wrapper, 'Далі').attributes('disabled')).toBeDefined()
  })
})

describe('TrashView', () => {
  const trashed = (id: string, name = id) => p(id, name, { deletedAt: '2026-01-03T10:00:00+00:00' })

  it('shows the empty state', async () => {
    routeFetch({ 'GET /panels/trash?page=1': () => ldList([]) })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    expect(wrapper.text()).toContain('Кошик порожній')
  })

  it('restores a panel and reloads', async () => {
    let restored = false
    const f = routeFetch({
      'GET /panels/trash?page=1': () => ldList(restored ? [] : [trashed('t', 'Old')]),
      'POST /panels/t/restore': () => {
        restored = true
        return jsonResponse(200, p('t', 'Old'))
      },
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Відновити').trigger('click')
    await flushPromises()
    expect(f.count('POST /panels/t/restore')).toBe(1)
    expect(wrapper.text()).toContain('Кошик порожній')
  })

  it('shows the name-conflict message with rename hint and keeps the panel', async () => {
    routeFetch({
      'GET /panels/trash?page=1': () => ldList([trashed('t', 'Old')]),
      'POST /panels/t/restore': () => problem(409, 'panel_name_conflict'),
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Відновити').trigger('click')
    await flushPromises()
    const alert = wrapper.get('[role=alert]').text()
    expect(alert).toContain('вже існує')
    expect(alert).toContain('Перейменуйте')
    expect(wrapper.get('.panel-list strong').text()).toBe('Old')
  })

  it('shows a non-conflict restore error without the rename hint', async () => {
    routeFetch({
      'GET /panels/trash?page=1': () => ldList([trashed('t')]),
      'POST /panels/t/restore': () => jsonResponse(500, {}),
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Відновити').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).not.toContain('Перейменуйте')
  })

  it.each([
    ['server error', () => jsonResponse(500, {})],
    ['panel_not_in_trash', () => problem(409, 'panel_not_in_trash')],
    ['not found', () => problem(404, 'not_found')],
  ])('does not show the rename hint for a %s on restore', async (_n, response) => {
    routeFetch({
      'GET /panels/trash?page=1': () => ldList([trashed('t')]),
      'POST /panels/t/restore': response,
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Відновити').trigger('click')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
    expect(wrapper.get('[role=alert]').text()).not.toContain('Перейменуйте')
  })

  it('shows no rename hint when nothing failed', async () => {
    routeFetch({ 'GET /panels/trash?page=1': () => ldList([trashed('t')]) })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Перейменуйте')
  })

  it('restores, removes the item locally and shows only the reload error when the reload fails', async () => {
    let restored = false
    const f = routeFetch({
      'GET /panels/trash?page=1': () =>
        restored ? jsonResponse(500, {}) : ldList([trashed('t', 'Old'), trashed('u', 'Other')], 2),
      'POST /panels/t/restore': () => {
        restored = true
        return jsonResponse(200, p('t', 'Old'))
      },
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Відновити').trigger('click')
    await flushPromises()
    expect(f.count('POST /panels/t/restore')).toBe(1)
    expect(wrapper.findAll('.panel-list strong').map((s) => s.text())).toEqual(['Other'])
    const alert = wrapper.get('[role=alert]').text()
    expect(alert).not.toBe('')
    expect(alert).not.toContain('Перейменуйте')
  })

  it('deletes permanently, removes the item locally and survives a failed reload', async () => {
    confirm.mockReturnValue(true)
    let deleted = false
    routeFetch({
      'GET /panels/trash?page=1': () =>
        deleted ? jsonResponse(500, {}) : ldList([trashed('t'), trashed('u', 'Other')], 2),
      'DELETE /panels/t/permanent': () => {
        deleted = true
        return emptyOk()
      },
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Видалити назавжди').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.panel-list strong').map((s) => s.text())).toEqual(['Other'])
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
  })

  it('does not reload the trash when the restore failed', async () => {
    const f = routeFetch({
      'GET /panels/trash?page=1': () => ldList([trashed('t')]),
      'POST /panels/t/restore': () => jsonResponse(500, {}),
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Відновити').trigger('click')
    await flushPromises()
    expect(f.count('GET /panels/trash?page=1')).toBe(1)
    expect(wrapper.find('.panel-list strong').exists()).toBe(true)
  })

  it('renames a trashed panel to resolve a conflict', async () => {
    const f = routeFetch({
      'GET /panels/trash?page=1': () => ldList([trashed('t', 'Old')]),
      'PATCH /panels/t': () => jsonResponse(200, trashed('t', 'Fresh')),
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Перейменувати').trigger('click')
    await wrapper.get('.panel-list input').setValue('Fresh')
    await wrapper.get('.panel-list form').trigger('submit')
    await flushPromises()
    expect(f.count('PATCH /panels/t')).toBe(1)
    expect(wrapper.get('.panel-list strong').text()).toBe('Fresh')
  })

  it('deletes permanently after confirmation', async () => {
    confirm.mockReturnValue(true)
    const f = routeFetch({
      'GET /panels/trash?page=1': () => ldList([trashed('t')]),
      'DELETE /panels/t/permanent': emptyOk,
    })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Видалити назавжди').trigger('click')
    await flushPromises()
    expect(confirm).toHaveBeenCalledOnce()
    expect(f.count('DELETE /panels/t/permanent')).toBe(1)
  })

  it('does not delete permanently when the confirmation is cancelled', async () => {
    confirm.mockReturnValue(false)
    const f = routeFetch({ 'GET /panels/trash?page=1': () => ldList([trashed('t')]) })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    await buttonByText(wrapper, 'Видалити назавжди').trigger('click')
    await flushPromises()
    expect(f.calls.some((c) => c.key.startsWith('DELETE'))).toBe(false)
  })

  it('shows pagination only for several pages', async () => {
    routeFetch({ 'GET /panels/trash?page=1': () => ldList([trashed('t')], 61) })
    const { wrapper } = await mountView(TrashView)
    await flushPromises()
    expect(wrapper.get('nav.pagination').text()).toContain('1 з 3')
  })
})

describe('PanelView', () => {
  const full = (extra: Record<string, unknown> = {}) => p('p1', 'Щит А', extra)

  it('shows the summary without short circuits', async () => {
    routeFetch({ 'GET /panels/p1': () => jsonResponse(200, full()) })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Щит А')
    expect(wrapper.text()).not.toContain('Вхідні кабелі') // the content table is collapsed
    await buttonByText(wrapper, 'Таблиця вмісту').trigger('click')
    expect(wrapper.text()).toContain('230 V / 50 Hz / 4 mm²')
    expect(wrapper.text()).toContain('2 проводи')
    expect(wrapper.text()).toContain('КЗ не виявлено')
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
  })

  it('lists short circuits with human readable sources', async () => {
    routeFetch({
      'GET /panels/p1': () =>
        jsonResponse(
          200,
          full({ shortCircuits: [{ sources: ['cw1', 'cw2'], wireIds: ['pw1'], terminals: [] }] }),
        ),
    })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('1')
    expect(wrapper.text()).toContain('вхідний кабель 1, провід 1 (коричневий)')
    expect(wrapper.text()).toContain('провід №1')
    expect(wrapper.text()).not.toContain('КЗ не виявлено')
  })

  it('shows "not found" for a 404', async () => {
    routeFetch({ 'GET /panels/p1': () => problem(404, 'not_found') })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toBe('Щит не знайдено.')
    expect(wrapper.find('h1').exists()).toBe(false)
  })

  it('shows a generic error for a server failure', async () => {
    routeFetch({ 'GET /panels/p1': () => jsonResponse(500, {}) })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
    expect(wrapper.text()).not.toContain('Щит не знайдено')
  })

  it('shows the trashed note and hides delete for a trashed panel', async () => {
    routeFetch({
      'GET /panels/p1': () => jsonResponse(200, full({ deletedAt: '2026-01-03T10:00:00+00:00' })),
    })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.text()).toContain('Щит знаходиться в кошику')
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('Видалити')
  })

  it('does not show the trashed note for an active panel', async () => {
    routeFetch({ 'GET /panels/p1': () => jsonResponse(200, full()) })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Щит знаходиться в кошику')
  })

  it('renames the panel', async () => {
    routeFetch({
      'GET /panels/p1': () => jsonResponse(200, full()),
      'PATCH /panels/p1': () => jsonResponse(200, full({ name: 'Щит Б', version: 2 })),
    })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    await buttonByText(wrapper, 'Перейменувати').trigger('click')
    await wrapper.get('input').setValue('Щит Б')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Щит Б')
  })

  it('moves to the trash after confirmation and goes home', async () => {
    confirm.mockReturnValue(true)
    routeFetch({
      'GET /panels/p1': () => jsonResponse(200, full()),
      'DELETE /panels/p1': emptyOk,
      'GET /panels?page=1': () => ldList([]),
    })
    const { wrapper, router } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('reuses unsaved editor state of the same user instead of fetching again', async () => {
    const f = routeFetch({ 'GET /panels/p1': () => jsonResponse(200, full()) })
    const first = await mountView(PanelView, '/', { id: 'p1' }, (pinia) => {
      useAuthStore(pinia).user = { id: 'u1' }
    })
    await flushPromises()
    expect(f.count('GET /panels/p1')).toBe(1)
    const { pinia, router, wrapper } = first
    const editor = usePanelEditorStore(pinia)
    editor.apply(addRail({ id: '00000000-0000-4000-8000-0000000000aa' }), 'Додати рейку')
    wrapper.unmount()
    await router.push('/test') // unmounting the last app resets the router to its start location
    const again = mount(PanelView, { props: { id: 'p1' }, global: viewGlobal(pinia, router) })
    await flushPromises()
    expect(f.count('GET /panels/p1')).toBe(1)
    expect(again.get('h1').text()).toBe('Щит А')
    expect(editor.dirty).toBe(true)
  })

  it('drops a clean editor on leave so the next visit loads the server state', async () => {
    const f = routeFetch({ 'GET /panels/p1': () => jsonResponse(200, full()) })
    const { pinia, router, wrapper } = await mountView(PanelView, '/', { id: 'p1' }, (pinia) => {
      useAuthStore(pinia).user = { id: 'u1' }
    })
    await flushPromises()
    wrapper.unmount()
    await router.push('/test') // unmounting the last app resets the router to its start location
    const third = mount(PanelView, { props: { id: 'p1' }, global: viewGlobal(pinia, router) })
    await flushPromises()
    expect(f.count('GET /panels/p1')).toBe(2)
    expect(third.get('h1').text()).toBe('Щит А')
  })

  it('keeps the panel on screen while navigating away after a soft delete', async () => {
    confirm.mockReturnValue(true)
    routeFetch({
      'GET /panels/p1': () => jsonResponse(200, full()),
      'DELETE /panels/p1': emptyOk,
    })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Щит А')
  })

  it('shows the loading text while the panel is being fetched', async () => {
    const pending = deferred<Response>()
    routeFetch({ 'GET /panels/p1': () => pending.promise })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.text()).toContain('Завантаження')
    expect(wrapper.find('h1').exists()).toBe(false)
    pending.resolve(jsonResponse(200, full()))
    await flushPromises()
    expect(wrapper.text()).not.toContain('Завантаження')
    expect(wrapper.get('h1').text()).toBe('Щит А')
  })

  it('shows the load-failed message (not "not found") for an incomplete payload', async () => {
    routeFetch({ 'GET /panels/p1': () => jsonResponse(200, full({ content: undefined })) })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toBe('Не вдалося завантажити щит.')
    expect(wrapper.text()).not.toContain('Завантаження')
  })

  it('clears the not-found state when navigating to an existing panel', async () => {
    routeFetch({
      'GET /panels/p1': () => problem(404, 'not_found'),
      'GET /panels/p2': () => jsonResponse(200, p('p2', 'Другий')),
    })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.text()).toContain('Щит не знайдено.')
    await wrapper.setProps({ id: 'p2' })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Щит не знайдено.')
    expect(wrapper.get('h1').text()).toBe('Другий')
  })

  it('clears the load-failed state when navigating to an existing panel', async () => {
    routeFetch({
      'GET /panels/p1': () => jsonResponse(500, {}),
      'GET /panels/p2': () => jsonResponse(200, p('p2', 'Другий')),
    })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toBe('Не вдалося завантажити щит.')
    await wrapper.setProps({ id: 'p2' })
    await flushPromises()
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    expect(wrapper.get('h1').text()).toBe('Другий')
  })

  it('race: A is slow, user switches to B, A resolves late with success -> B stays shown', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    routeFetch({ 'GET /panels/a': () => a.promise, 'GET /panels/b': () => b.promise })
    const { wrapper } = await mountView(PanelView, '/', { id: 'a' })
    await flushPromises()
    await wrapper.setProps({ id: 'b' })
    b.resolve(jsonResponse(200, p('b', 'Panel B')))
    await flushPromises()
    a.resolve(jsonResponse(200, p('a', 'Panel A')))
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Panel B')
    expect(wrapper.text()).not.toContain('Panel A')
    expect(wrapper.text()).not.toContain('Завантаження')
  })

  it('race: A resolves late with a 404 -> B stays shown, no not-found message', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    routeFetch({ 'GET /panels/a': () => a.promise, 'GET /panels/b': () => b.promise })
    const { wrapper } = await mountView(PanelView, '/', { id: 'a' })
    await flushPromises()
    await wrapper.setProps({ id: 'b' })
    b.resolve(jsonResponse(200, p('b', 'Panel B')))
    await flushPromises()
    a.resolve(problem(404, 'not_found'))
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Panel B')
    expect(wrapper.text()).not.toContain('Щит не знайдено')
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
  })

  it('race: A resolves late with a server error while B is still loading -> B result decides', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    routeFetch({ 'GET /panels/a': () => a.promise, 'GET /panels/b': () => b.promise })
    const { wrapper } = await mountView(PanelView, '/', { id: 'a' })
    await flushPromises()
    await wrapper.setProps({ id: 'b' })
    a.resolve(jsonResponse(500, {}))
    await flushPromises()
    expect(wrapper.text()).toContain('Завантаження')
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    b.resolve(jsonResponse(200, p('b', 'Panel B')))
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('Panel B')
  })

  it('race: B fails and A resolves late with success -> the failure of B is shown, A ignored', async () => {
    const a = deferred<Response>()
    const b = deferred<Response>()
    routeFetch({ 'GET /panels/a': () => a.promise, 'GET /panels/b': () => b.promise })
    const { wrapper } = await mountView(PanelView, '/', { id: 'a' })
    await flushPromises()
    await wrapper.setProps({ id: 'b' })
    b.resolve(jsonResponse(500, {}))
    await flushPromises()
    a.resolve(jsonResponse(200, p('a', 'Panel A')))
    await flushPromises()
    expect(wrapper.find('h1').exists()).toBe(false)
    expect(wrapper.get('[role=alert]').text()).toBe('Не вдалося завантажити щит.')
  })

  it('shows an error and stays when the soft delete fails', async () => {
    confirm.mockReturnValue(true)
    routeFetch({
      'GET /panels/p1': () => jsonResponse(200, full()),
      'DELETE /panels/p1': () => jsonResponse(500, {}),
    })
    const { wrapper, router } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('test')
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
    expect(wrapper.get('h1').text()).toBe('Щит А')
  })

  it('keeps the loaded content visible after a rename', async () => {
    routeFetch({
      'GET /panels/p1': () => jsonResponse(200, full()),
      'PATCH /panels/p1': () => jsonResponse(200, full({ name: 'Щит Б', version: 2 })),
    })
    const { wrapper } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    await buttonByText(wrapper, 'Перейменувати').trigger('click')
    await wrapper.get('input').setValue('Щит Б')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    await buttonByText(wrapper, 'Таблиця вмісту').trigger('click')
    expect(wrapper.text()).toContain('230 V / 50 Hz / 4 mm²')
  })

  it('stays on the page when delete is cancelled', async () => {
    confirm.mockReturnValue(false)
    const f = routeFetch({ 'GET /panels/p1': () => jsonResponse(200, full()) })
    const { wrapper, router } = await mountView(PanelView, '/', { id: 'p1' })
    await flushPromises()
    await buttonByText(wrapper, 'Видалити').trigger('click')
    await flushPromises()
    expect(f.calls.some((c) => c.key.startsWith('DELETE'))).toBe(false)
    expect(router.currentRoute.value.name).toBe('test')
  })
})
