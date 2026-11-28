/** Cable box tooltip: «Вх 1 · label — rating» / «Вих 3 · label — description», empty parts skipped. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { applyLocale, i18n } from '@/i18n'
import { content, inputCable, outputCable } from '@/domain/__tests__/helpers'
import type { PanelContent } from '@/domain/panelContent'
import { mountEditor, stubLayout } from './harness'

beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  applyLocale('uk')
  i18n.global.locale.value = 'uk'
  document.body.innerHTML = ''
})

const panel = (over: Partial<PanelContent>): PanelContent =>
  content({ railWidthModules: 24, inputCableSide: 'top', outputCableSide: 'bottom', ...over })

type Mounted = Awaited<ReturnType<typeof mountEditor>>
/** `<title>` of the box rect of every cable, in the order input cables, output cables. */
const titles = (m: Mounted) => m.wrapper.findAll('rect.cable-box').map((r) => r.get('title').text())

describe('cable box tooltip (uk)', () => {
  it('input: caption, label and the rating', async () => {
    const m = await mountEditor(
      panel({ inputCables: [{ ...inputCable(1, [2, 3]), label: 'Мережа' }] }),
    )
    expect(titles(m)).toEqual(['Вх 1 · Мережа — Вхідний кабель: 230 В / 50 Гц / 4 мм²'])
  })

  it('input with an empty label: no separator or empty part', async () => {
    const m = await mountEditor(panel({ inputCables: [inputCable(1, [2, 3])] }))
    expect(titles(m)).toEqual(['Вх 1 — Вхідний кабель: 230 В / 50 Гц / 4 мм²'])
  })

  it('output: caption, label and description; the number is the index within its kind', async () => {
    const m = await mountEditor(
      panel({
        outputCables: [
          outputCable(4, [5]),
          outputCable(6, [7]),
          { ...outputCable(8, [9]), label: 'Кухня', description: 'Розетки кухні' },
        ],
      }),
    )
    expect(titles(m)[3]).toBe('Вих 3 · Кухня — Вихідний кабель: Розетки кухні')
  })

  it('output with an empty description keeps only the plain kind name', async () => {
    const m = await mountEditor(
      panel({ outputCables: [{ ...outputCable(4, [5]), label: 'Кухня' }] }),
    )
    expect(titles(m)[1]).toBe('Вих 1 · Кухня — Вихідний кабель')
  })

  it('output with neither label nor description', async () => {
    const m = await mountEditor(panel({ outputCables: [outputCable(4, [5])] }))
    expect(titles(m)[1]).toBe('Вих 1 — Вихідний кабель')
  })

  it('a label that is cut on the drawing is complete in the box title', async () => {
    const label = '1234567890123456' // 16 characters in a 1-wire box (room 70): truncated
    const m = await mountEditor(
      panel({ inputCables: [{ ...inputCable(1, [2]), label }], outputCables: [] }),
    )
    const mark = m.wrapper.get('[data-testid=cable-mark]')
    expect(mark.find('title').exists()).toBe(false) // the box tooltip holds the full text
    expect(mark.text()).toContain('…')
    expect(m.wrapper.get('rect.cable-box title').text()).toContain(` · ${label} — `)
    expect(titles(m)[0]).toBe(`Вх 1 · ${label} — Вхідний кабель: 230 В / 50 Гц / 4 мм²`)
  })

  it('shows the edited rating after the cable is changed', async () => {
    const m = await mountEditor(panel({ inputCables: [{ ...inputCable(1, [2]), voltage: 400 }] }))
    expect(titles(m)[0]).toContain('400 В')
  })
})

describe('cable box tooltip (en)', () => {
  it('follows the locale, including a later switch', async () => {
    const m = await mountEditor(
      panel({
        inputCables: [{ ...inputCable(1, [2, 3]), label: 'Mains' }],
        outputCables: [
          { ...outputCable(4, [5]), label: 'Kitchen', description: 'Kitchen sockets' },
        ],
      }),
    )
    expect(titles(m)[1]).toBe('Вих 1 · Kitchen — Вихідний кабель: Kitchen sockets')
    applyLocale('en')
    await m.wrapper.vm.$nextTick()
    expect(titles(m)).toEqual([
      'In 1 · Mains — Input cable: 230 V / 50 Hz / 4 mm²',
      'Out 1 · Kitchen — Output cable: Kitchen sockets',
    ])
  })

  it('empty parts are skipped in English too', async () => {
    applyLocale('en')
    const m = await mountEditor(panel({ outputCables: [outputCable(4, [5])] }))
    expect(titles(m)).toEqual(['In 1 — Input cable: 230 V / 50 Hz / 4 mm²', 'Out 1 — Output cable'])
  })

  it('a cut label is complete in the box title', async () => {
    applyLocale('en')
    const label = 'abcdefghijklmnop'
    const m = await mountEditor(
      panel({ inputCables: [{ ...inputCable(1, [2]), label }], outputCables: [] }),
    )
    expect(titles(m)[0]).toBe(`In 1 · ${label} — Input cable: 230 V / 50 Hz / 4 mm²`)
  })
})
