/**
 * Switching the language while the editor is mounted: the item titles of every select in the toolbar
 * and the properties panel are re-translated (the items are computed from `t()`).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { applyLocale, i18n } from '@/i18n'
import {
  ats,
  block,
  busbar,
  content,
  cw,
  element,
  id,
  inputCable,
  outputCable,
  panelWire,
  pole,
  rail,
} from '@/domain/__tests__/helpers'
import { selectsIn } from '@/test/vuetifySelect'
import { mountEditor, stubLayout } from './harness'

const c = content({
  inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
  outputCables: [outputCable(4, [5])],
  rails: [
    rail(
      10,
      24,
      150,
      [element(20, 0, 2, 2), element(21, 2, 2, 2), ats(22, 6, 2)],
      [block(40, 10, 1, 3)],
      [busbar(60, 'L', id(20), 2)],
    ),
  ],
  wires: [panelWire(30, cw(id(2)), pole(id(20), 0, 'input'))],
})

type Mounted = Awaited<ReturnType<typeof mountEditor>>
type Ref = Parameters<Mounted['store']['select']>[0] // a selection or null

interface Row {
  label: string
  titles: string[]
}
/** Label and item titles of every v-select in the editor (toolbar + properties). */
const rows = (m: Mounted): Row[] =>
  selectsIn(m.wrapper).map((s) => {
    const p = s.props() as unknown as { label: string; items: { title: string | number }[] }
    return { label: p.label, titles: p.items.map((i) => String(i.title)) }
  })

beforeEach(() => stubLayout())
afterEach(() => {
  applyLocale('uk')
  i18n.global.locale.value = 'uk'
  localStorage.clear()
})

const SELECTIONS: [string, Ref][] = [
  ['wire', { kind: 'wire', id: id(30) }],
  ['input cable', { kind: 'inputCable', id: id(1) }],
  ['output cable', { kind: 'outputCable', id: id(4) }],
  ['terminal block', { kind: 'block', id: id(40) }],
  ['busbar', { kind: 'busbar', id: id(60) }],
  ['device', { kind: 'element', id: id(20) }],
  ['ats', { kind: 'element', id: id(22) }],
  ['panel (nothing selected)', null],
]

describe('toolbar selects follow the language', () => {
  it('colour item titles change from uk to en and back', async () => {
    const m = await mountEditor(c, { toolbar: true })
    const uk = rows(m)
    expect(uk.length).toBeGreaterThan(0)
    const colour = uk.find((r) => r.titles.includes('чорний'))!
    expect(colour).toBeDefined()
    applyLocale('en')
    await nextTick()
    const en = rows(m)
    expect(en).toHaveLength(uk.length)
    const colourEn = en.find((r) => r.titles.includes('black'))!
    expect(colourEn).toBeDefined()
    expect(colourEn.titles).not.toEqual(colour.titles)
    expect(colourEn.titles).toHaveLength(colour.titles.length)
    expect(en.flatMap((r) => r.titles)).not.toContain('чорний')
    applyLocale('uk')
    await nextTick()
    expect(rows(m)).toEqual(uk)
  })

  it('the select labels change language too', async () => {
    const m = await mountEditor(c, { toolbar: true })
    const uk = rows(m).map((r) => r.label)
    applyLocale('en')
    await nextTick()
    const en = rows(m).map((r) => r.label)
    expect(en).not.toEqual(uk)
    expect(en.every((l) => !/[а-яіїєґ]/i.test(l))).toBe(true)
  })
})

describe('properties selects follow the language', () => {
  it.each(SELECTIONS)('%s: titles and labels are re-translated', async (_name, ref) => {
    const m = await mountEditor(c, { properties: true })
    m.store.select(ref)
    await nextTick()
    const uk = rows(m)
    expect(uk.length).toBeGreaterThan(0)
    applyLocale('en')
    await nextTick()
    const en = rows(m)
    expect(en).toHaveLength(uk.length)
    // no Cyrillic is left in any label or title, and something actually changed
    const cyr = /[а-яіїєґ]/i
    expect(en.flatMap((r) => [r.label, ...r.titles]).filter((s) => cyr.test(s))).toEqual([])
    expect(uk.flatMap((r) => [r.label, ...r.titles]).some((s) => cyr.test(s))).toBe(true)
    expect(en).not.toEqual(uk)
    applyLocale('uk')
    await nextTick()
    expect(rows(m)).toEqual(uk)
  })

  it('a device style select lists the styles in the new language', async () => {
    const m = await mountEditor(c, { properties: true })
    m.store.select({ kind: 'element', id: id(20) })
    await nextTick()
    expect(rows(m).some((r) => r.titles.includes('Автомат') && r.titles.includes('ПЗВ'))).toBe(true)
    applyLocale('en')
    await nextTick()
    const all = rows(m).flatMap((r) => r.titles)
    expect(all).not.toContain('Автомат')
    expect(all).not.toContain('ПЗВ')
  })
})
