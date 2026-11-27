/** Stage 3: ATS and terminal-block properties sections and the new toolbar actions. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import type { PanelContent } from '@/domain/panelContent'
import {
  ats,
  block,
  content,
  cw,
  element,
  id,
  inputCable,
  pole,
  rail,
  rowBlock,
  term,
} from '@/domain/__tests__/helpers'
import { mountEditor, stubLayout } from './harness'

const base: PanelContent = content({
  inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
  terminalRow: [rowBlock(50, 0, 3), rowBlock(51, 4, 2)],
  rails: [
    rail(10, 24, 150, [ats(21, 0, 2), element(20, 4, 2, 2)], [block(40, 10, 1, 3)]),
    rail(11, 24, 100),
  ],
})

type Wrapper = Awaited<ReturnType<typeof mountEditor>>['wrapper']
beforeEach(() => stubLayout())
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

const section = (w: Wrapper, name: string) => w.get(`section[aria-label="${name}"]`)
const field = (w: Wrapper, name: string, label: string) =>
  section(w, name)
    .findAll('.field')
    .find((f) => f.find('label').exists() && f.get('label').text() === label)!
const input = (w: Wrapper, name: string, label: string) => field(w, name, label).get('input')

async function open(c: PanelContent, kind: 'element' | 'block', itemId: string) {
  const m = await mountEditor(c, { properties: true, toolbar: true })
  m.store.select({ kind, id: itemId })
  await nextTick()
  return m
}

describe('ATS properties', () => {
  const S = 'Властивості АВР'

  it('shows the ATS section (and not the device one) with the current values', async () => {
    const { wrapper } = await open(base, 'element', id(21))
    expect(wrapper.find('section[aria-label="Властивості апарата"]').exists()).toBe(false)
    expect((input(wrapper, S, 'Ширина, модулів').element as HTMLInputElement).value).toBe('2')
    expect((section(wrapper, S).get('select').element as HTMLSelectElement).value).toBe('A')
    expect(
      (section(wrapper, S).get('input[type=checkbox]').element as HTMLInputElement).checked,
    ).toBe(false)
    expect(section(wrapper, S).text()).toContain('Входи знизу, виходи зверху')
  })

  it('a device selection shows the device section (no state select)', async () => {
    const { wrapper } = await open(base, 'element', id(20))
    expect(wrapper.find(`section[aria-label="${S}"]`).exists()).toBe(false)
    expect(wrapper.find('section[aria-label="Властивості апарата"]').exists()).toBe(true)
  })

  it.each([
    ['A', 'A'],
    ['B', 'B'],
    ['off', 'off'],
  ])('the state select writes %s as one history entry', async (value, expected) => {
    const start = value === 'A' ? 'B' : 'A'
    const c = {
      ...base,
      rails: base.rails.map((r, i) =>
        i === 0
          ? {
              ...r,
              elements: r.elements.map((e) =>
                e.kind === 'ats' ? { ...e, state: start as 'A' | 'B' } : e,
              ),
            }
          : r,
      ),
    }
    const { wrapper, store } = await open(c, 'element', id(21))
    await section(wrapper, S).get('select').setValue(value)
    expect(store.content?.rails[0]?.elements[0]).toMatchObject({ state: expected })
    expect(store.undoLabel).toBe('Змінити стан АВР')
  })

  it('the swap checkbox turns the sides', async () => {
    const { wrapper, store } = await open(base, 'element', id(21))
    await section(wrapper, S).get('input[type=checkbox]').setValue(true)
    expect(store.content?.rails[0]?.elements[0]).toMatchObject({ sidesSwapped: true })
    expect(store.undoLabel).toBe('Поміняти входи і виходи')
  })

  it('label and marking commit on blur', async () => {
    const { wrapper, store } = await open(base, 'element', id(21))
    const label = input(wrapper, S, 'Назва')
    await label.setValue('QA1')
    await label.trigger('blur')
    const marking = input(wrapper, S, 'Маркування')
    await marking.setValue('AVR')
    await marking.trigger('blur')
    expect(store.content?.rails[0]?.elements[0]).toMatchObject({ label: 'QA1', marking: 'AVR' })
  })

  it('a width of 1 is rejected with a message and the width stays', async () => {
    const { wrapper, store, ctx } = await open(base, 'element', id(21))
    const w = input(wrapper, S, 'Ширина, модулів')
    await w.setValue('1')
    await w.trigger('blur')
    await nextTick()
    expect(store.content?.rails[0]?.elements[0]?.widthModules).toBe(2)
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.tone).toBe('error')
  })

  it('a width of 4 into free space is stored', async () => {
    const { wrapper, store } = await open(base, 'element', id(21))
    const w = input(wrapper, S, 'Ширина, модулів')
    await w.setValue('4')
    await w.trigger('blur')
    expect(store.content?.rails[0]?.elements[0]?.widthModules).toBe(4)
  })

  it('a width that runs into the neighbour is rejected', async () => {
    const { wrapper, store, ctx } = await open(base, 'element', id(21))
    const w = input(wrapper, S, 'Ширина, модулів')
    await w.setValue('5')
    await w.trigger('blur')
    await nextTick()
    expect(store.content?.rails[0]?.elements[0]?.widthModules).toBe(2)
    expect(ctx.notice.value?.tone).toBe('error')
  })

  it('a read-only panel disables every control', async () => {
    const m = await mountEditor(base, {
      properties: true,
      panel: { deletedAt: '2026-02-01T00:00:00+00:00' },
    })
    m.store.select({ kind: 'element', id: id(21) })
    await nextTick()
    const s = section(m.wrapper, S)
    expect(s.get('select').attributes('disabled')).toBeDefined()
    expect(s.get('input[type=checkbox]').attributes('disabled')).toBeDefined()
    expect(
      s.findAll('input:not([type=checkbox])').every((i) => i.attributes('disabled') !== undefined),
    ).toBe(true)
  })
})

describe('terminal block properties', () => {
  it('a row block has its own section and shows the width hint', async () => {
    const { wrapper } = await open(base, 'block', id(50))
    const s = section(wrapper, 'Властивості клемника в рядку')
    expect(s.text()).toContain('Клемник у рядку')
    expect(s.text()).toContain('Ширина: 2 мод.')
    expect(wrapper.find('section[aria-label="Властивості клемного блока"]').exists()).toBe(false)
  })

  it('a rail block has its own section and says it always takes 1 module', async () => {
    const { wrapper } = await open(base, 'block', id(40))
    const s = section(wrapper, 'Властивості клемного блока')
    expect(s.text()).toContain('1 модуль')
  })

  it('the colour select offers grey plus the five wire colours', async () => {
    const { wrapper } = await open(base, 'block', id(50))
    const options = section(wrapper, 'Властивості клемника в рядку')
      .get('select')
      .findAll('option')
      .map((o) => o.text())
    expect(options).toEqual(['сірий', 'чорний', 'коричневий', 'червоний', 'синій', 'жовто-зелений'])
  })

  it('choosing a colour and going back to grey', async () => {
    const { wrapper, store } = await open(base, 'block', id(50))
    const select = section(wrapper, 'Властивості клемника в рядку').get('select')
    await select.setValue('red')
    expect(store.content?.terminalRow[0]?.colour).toBe('red')
    expect(store.undoLabel).toBe('Змінити колір клемника')
    await select.setValue('')
    expect(store.content?.terminalRow[0]?.colour).toBeNull()
  })

  it('a rail block takes a colour too', async () => {
    const { wrapper, store } = await open(base, 'block', id(40))
    await section(wrapper, 'Властивості клемного блока').get('select').setValue('blue')
    expect(store.content?.rails[0]?.terminalBlocks[0]?.colour).toBe('blue')
  })

  it('the label commits on blur', async () => {
    const { wrapper, store } = await open(base, 'block', id(50))
    const label = input(wrapper, 'Властивості клемника в рядку', 'Назва')
    await label.setValue('PE')
    await label.trigger('blur')
    expect(store.content?.terminalRow[0]?.label).toBe('PE')
  })

  it('growing a row block to 5 contacts makes it 3 modules wide (hint updates)', async () => {
    const { wrapper, store } = await open(base, 'block', id(50))
    const count = input(wrapper, 'Властивості клемника в рядку', 'Кількість клем')
    await count.setValue('5')
    await count.trigger('blur')
    await nextTick()
    expect(store.content?.terminalRow[0]).toMatchObject({ terminalCount: 5, widthModules: 3 })
    expect(wrapper.text()).toContain('Ширина: 3 мод.')
  })

  it('growing into the neighbour is rejected with a message and nothing changes', async () => {
    const { wrapper, store, ctx } = await open(base, 'block', id(50))
    const count = input(wrapper, 'Властивості клемника в рядку', 'Кількість клем')
    await count.setValue('9') // 5 modules: [0,5) hits the block at 4
    await count.trigger('blur')
    await nextTick()
    expect(store.content?.terminalRow[0]).toMatchObject({ terminalCount: 3, widthModules: 2 })
    expect(store.canUndo).toBe(false)
    expect(ctx.notice.value?.tone).toBe('error')
  })

  it('a rail block rejects 13 contacts and accepts 12', async () => {
    const { wrapper, store, ctx } = await open(base, 'block', id(40))
    const count = input(wrapper, 'Властивості клемного блока', 'Кількість клем')
    await count.setValue('13')
    await count.trigger('blur')
    await nextTick()
    expect(store.content?.rails[0]?.terminalBlocks[0]?.terminalCount).toBe(3)
    expect(ctx.notice.value?.tone).toBe('error')
    await count.setValue('12')
    await count.trigger('blur')
    await nextTick()
    expect(store.content?.rails[0]?.terminalBlocks[0]?.terminalCount).toBe(12)
  })

  it('shrinking removes the wires of the cut contacts and tells how many', async () => {
    const wired: PanelContent = {
      ...base,
      wires: [
        {
          id: id(30),
          colour: 'brown',
          crossSection: '2.5',
          start: term(id(50), 2, 'top'),
          end: cw(id(2)),
          bends: [],
        },
        {
          id: id(31),
          colour: 'brown',
          crossSection: '2.5',
          start: term(id(50), 0, 'top'),
          end: pole(id(21), 0, 'input'),
          bends: [],
        },
      ],
    }
    const { wrapper, store, ctx } = await open(wired, 'block', id(50))
    const count = input(wrapper, 'Властивості клемника в рядку', 'Кількість клем')
    await count.setValue('2')
    await count.trigger('blur')
    await nextTick()
    expect(store.content?.wires.map((w) => w.id)).toEqual([id(31)])
    expect(ctx.notice.value?.tone).toBe('info')
  })
})

describe('toolbar: ATS and terminal-row blocks', () => {
  const click = (w: Wrapper, name: string) =>
    w
      .findAll('button')
      .find((b) => b.text() === name)!
      .trigger('click')

  it('"Додати АВР" adds a 2-module ATS in state A on the first free place and selects it', async () => {
    const { wrapper, store } = await mountEditor(base, { toolbar: true })
    await click(wrapper, 'Додати АВР')
    const added = store.content!.rails[0]!.elements.find(
      (e) => e.kind === 'ats' && e.id !== id(21),
    )!
    expect(added).toMatchObject({ kind: 'ats', widthModules: 2, state: 'A', on: null, poles: null })
    expect(added.offsetModules).toBe(2)
    expect(store.selection).toEqual({ kind: 'element', id: added.id })
    expect(store.undoLabel).toBe('Додати АВР')
  })

  it('"Додати АВР" is disabled without a rail', async () => {
    const { wrapper } = await mountEditor(content(), { toolbar: true })
    const b = wrapper.findAll('button').find((x) => x.text() === 'Додати АВР')!
    expect(b.attributes('disabled')).toBeDefined()
  })

  it('"Додати клемник у рядок" adds a 1-module, 2-contact grey block at the first free offset', async () => {
    const { wrapper, store } = await mountEditor(base, { toolbar: true })
    await click(wrapper, 'Додати клемник у рядок')
    expect(store.content?.terminalRow).toHaveLength(3)
    const added = store.content!.terminalRow.find((b) => b.id !== id(50) && b.id !== id(51))!
    expect(added).toMatchObject({
      offsetModules: 2,
      widthModules: 1,
      terminalCount: 2,
      colour: null,
      label: '',
    })
    expect(store.selection).toEqual({ kind: 'block', id: added.id })
    expect(store.undoLabel).toBe('Додати клемник у рядок')
  })

  it('"Додати клемник у рядок" works without any rail (the row is always there)', async () => {
    const { wrapper, store } = await mountEditor(content(), { toolbar: true })
    await click(wrapper, 'Додати клемник у рядок')
    expect(store.content?.terminalRow).toHaveLength(1)
  })

  it('a full row disables the button with the reason and adds nothing', async () => {
    const full = content({ terminalRow: [rowBlock(50, 0, 120)] })
    const { wrapper, store } = await mountEditor(full, { toolbar: true })
    const b = wrapper.findAll('button').find((x) => x.text() === 'Додати клемник у рядок')!
    expect(b.attributes('disabled')).toBeDefined()
    expect(b.attributes('title')).toBe('У рядку немає вільного місця')
    await b.trigger('click')
    expect(store.content?.terminalRow).toHaveLength(1)
  })

  it('60 blocks in the row disable it with the limit text', async () => {
    const sixty = content({
      terminalRow: Array.from({ length: 60 }, (_, i) => rowBlock(100 + i, i, 1)),
    })
    const { wrapper } = await mountEditor(sixty, { toolbar: true })
    const b = wrapper.findAll('button').find((x) => x.text() === 'Додати клемник у рядок')!
    expect(b.attributes('title')).toContain('Досягнуто ліміт: 60')
  })

  it('"Додати клемний блок" adds a 1-module rail block with 2 contacts, undo removes it', async () => {
    const { wrapper, store } = await mountEditor(base, { toolbar: true })
    await click(wrapper, 'Додати клемний блок')
    const blocks = store.content!.rails[0]!.terminalBlocks
    expect(blocks).toHaveLength(2)
    expect(blocks.find((b) => b.id !== id(40))).toMatchObject({ widthModules: 1, terminalCount: 2 })
    store.undo()
    expect(store.content?.rails[0]?.terminalBlocks).toHaveLength(1)
  })
})
