import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import PanelPagination from '@/components/PanelPagination.vue'
import { mountWithPlugins } from '@/test/mountWithPlugins'

let warn: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  i18n.global.locale.value = 'uk'
})

const labels = (root: Element) =>
  Array.from(root.querySelectorAll('[aria-label]')).map((e) => e.getAttribute('aria-label'))

const EXPECTED = {
  uk: {
    nav: 'Сторінки',
    goTo: 'Перейти на сторінку 3',
    current: 'Поточна сторінка, сторінка 2',
    prev: 'Назад',
    next: 'Далі',
  },
  en: {
    nav: 'Pages',
    goTo: 'Go to page 3',
    current: 'Current page, page 2',
    prev: 'Back',
    next: 'Next',
  },
} as const

describe('PanelPagination aria-labels', () => {
  it.each(['uk', 'en'] as const)('%s: full translated labels, no placeholder left', async (loc) => {
    i18n.global.locale.value = loc
    const { wrapper } = mountWithPlugins(PanelPagination, { props: { page: 2, pages: 10 } })
    const found = labels(wrapper.element)
    const e = EXPECTED[loc]
    expect(wrapper.get('nav').attributes('aria-label')).toBe(e.nav)
    expect(found).toContain(e.goTo)
    expect(found).toContain(e.current)
    expect(found).toContain(e.prev)
    expect(found).toContain(e.next)
    expect(found.filter((l) => l?.includes('{') || l?.includes('}'))).toEqual([])
    expect(found.filter((l) => l?.includes('.'))).toEqual([]) // no raw message key
  })

  it.each(['uk', 'en'] as const)('%s: emits no missing-key warning', (loc) => {
    i18n.global.locale.value = loc
    mountWithPlugins(PanelPagination, { props: { page: 2, pages: 10 } })
    expect(
      warn.mock.calls
        .map((c: unknown[]) => String(c[0]))
        .filter((m: string) => /not found|missing/i.test(m)),
    ).toEqual([])
  })

  it('every page button except the current one has the "go to page N" label', () => {
    const { wrapper } = mountWithPlugins(PanelPagination, { props: { page: 1, pages: 3 } })
    const found = labels(wrapper.element)
    expect(found).toContain('Перейти на сторінку 2')
    expect(found).toContain('Перейти на сторінку 3')
    expect(found).toContain('Поточна сторінка, сторінка 1')
  })

  it('renders nothing for a single page', () => {
    const { wrapper } = mountWithPlugins(PanelPagination, { props: { page: 1, pages: 1 } })
    expect(wrapper.find('nav').exists()).toBe(false)
  })

  it('emits change when another page is chosen', async () => {
    const { wrapper } = mountWithPlugins(PanelPagination, { props: { page: 1, pages: 3 } })
    await wrapper.get('[aria-label="Перейти на сторінку 2"]').trigger('click')
    expect(wrapper.emitted('change')).toEqual([[2]])
  })
})
