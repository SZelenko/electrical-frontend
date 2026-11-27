import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import CommitField from '../properties/CommitField.vue'
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
import { mountEditor, pointer, stubLayout } from './harness'

function mountField(props: Record<string, unknown> = {}) {
  const onCommit = vi.fn()
  const wrapper = mount(CommitField, {
    props: { label: 'Назва', modelValue: 'QF1', onCommit, ...props },
    attachTo: document.body,
  })
  return { wrapper, onCommit, input: wrapper.get('input') }
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('CommitField: one commit per edit session', () => {
  it('does not commit while typing', async () => {
    const { input, onCommit } = mountField()
    await input.setValue('Q')
    await input.setValue('QF')
    await input.setValue('QF2')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('commits the typed value once on blur', async () => {
    const { input, onCommit } = mountField()
    await input.setValue('QF2')
    await input.trigger('blur')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('QF2')
  })

  it('commits once on Enter and not again on the following blur', async () => {
    const { input, onCommit } = mountField()
    await input.setValue('QF2')
    await input.trigger('keydown', { key: 'Enter' })
    await input.trigger('blur')
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('does not commit an unchanged value', async () => {
    const { input, onCommit } = mountField()
    await input.trigger('focus')
    await input.trigger('blur')
    await input.setValue('QF1')
    await input.trigger('blur')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('Escape reverts the draft to the model value without committing', async () => {
    const { input, onCommit } = mountField()
    await input.setValue('garbage')
    await input.trigger('keydown', { key: 'Escape' })
    expect((input.element as HTMLInputElement).value).toBe('QF1')
    await input.trigger('blur')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('a rejected value (the model did not change) snaps back after the commit', async () => {
    const { input, onCommit } = mountField()
    await input.setValue('too long to be accepted')
    await input.trigger('blur')
    await nextTick()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect((input.element as HTMLInputElement).value).toBe('QF1')
  })

  it('follows an external model change', async () => {
    const { wrapper, input } = mountField()
    await wrapper.setProps({ modelValue: 'QF9' })
    expect((input.element as HTMLInputElement).value).toBe('QF9')
  })

  it('flushes an uncommitted draft when it is unmounted', async () => {
    const { wrapper, input, onCommit } = mountField()
    await input.setValue('QF7')
    wrapper.unmount()
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('QF7')
  })

  it('does not commit on unmount when nothing was edited', () => {
    const { wrapper, onCommit } = mountField()
    wrapper.unmount()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('does not commit twice when it blurs and then unmounts', async () => {
    const { wrapper, input, onCommit } = mountField()
    await input.setValue('QF7')
    await input.trigger('blur')
    wrapper.unmount()
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('a number field still commits the typed value as text (the handlers parse strings)', async () => {
    const { input, onCommit } = mountField({ type: 'number', modelValue: 2, min: 1 })
    await input.setValue('3')
    await input.trigger('blur')
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit).toHaveBeenCalledWith('3')
    expect(typeof onCommit.mock.calls[0]?.[0]).toBe('string')
  })

  it('a number field does not commit when the value is unchanged', async () => {
    const { input, onCommit } = mountField({ type: 'number', modelValue: 2, min: 1 })
    await input.setValue('2')
    await input.trigger('blur')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('renders a number input and its bounds', () => {
    const { input } = mountField({ type: 'number', modelValue: 2, min: 1 })
    expect(input.attributes('type')).toBe('number')
    expect(input.attributes('min')).toBe('1')
  })

  it('is labelled and can be disabled', () => {
    const { wrapper, input } = mountField({ disabled: true })
    expect(wrapper.get('label').text()).toBe('Назва')
    expect(input.attributes('disabled')).toBeDefined()
    expect(wrapper.get('label').attributes('for')).toBe(input.attributes('id'))
  })
})

describe('CommitField: code point counter', () => {
  it.each([
    ['', '0/16', false],
    ['QF1', '3/16', false],
    ['😀😀', '2/16', false], // two code points, four UTF-16 units
    ['x'.repeat(16), '16/16', false],
    ['x'.repeat(17), '17/16', true],
    ['😀'.repeat(17), '17/16', true],
  ])('%j shows %s (over: %s)', async (text, shown, over) => {
    const { wrapper, input } = mountField({ maxlength: 16, modelValue: '' })
    await input.setValue(text)
    const counter = wrapper.get('small')
    expect(counter.text()).toBe(shown)
    expect(counter.classes().includes('over')).toBe(over)
  })

  it('has no counter without a maxlength', () => {
    expect(mountField().wrapper.find('small').exists()).toBe(false)
  })

  it('does not truncate typing at 16 UTF-16 units (no native maxlength attribute)', () => {
    expect(mountField({ maxlength: 16 }).input.attributes('maxlength')).toBeUndefined()
  })
})

describe('CommitField inside the properties panel (one history entry per session)', () => {
  const c = content({ rails: [rail(10, 24, 150, [element(20, 0, 2, 2), element(21, 4, 1, 1)])] })
  beforeEach(() => stubLayout())

  const field = (wrapper: Awaited<ReturnType<typeof mountEditor>>['wrapper'], label: string) =>
    wrapper
      .findAll('.properties .field')
      .find((f) => f.get('label').text() === label)!
      .get('input')

  it('typing then blur creates exactly one entry with the label of the command', async () => {
    const { wrapper, store } = await mountEditor(c, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    const input = field(wrapper, 'Назва')
    await input.setValue('Q')
    await input.setValue('QF')
    await input.setValue('QF1')
    expect(store.dirty).toBe(false)
    await input.trigger('blur')
    expect(store.content?.rails[0]?.elements[0]?.label).toBe('QF1')
    expect(store.undoLabel).toBe('Змінити назву апарата')
    let n = 0
    while (store.undo() !== null) n++
    expect(n).toBe(1)
  })

  it('a rejected value (17 characters) records nothing and snaps back with a message', async () => {
    const { wrapper, store, ctx } = await mountEditor(c, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    const input = field(wrapper, 'Назва')
    await input.setValue('x'.repeat(17))
    await input.trigger('blur')
    await nextTick()
    expect(store.canUndo).toBe(false)
    expect((input.element as HTMLInputElement).value).toBe('')
    expect(ctx.notice.value?.tone).toBe('error')
  })

  it('a draft is flushed when the selection changes through a pointerdown on the canvas', async () => {
    const { wrapper, store } = await mountEditor(c, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    const input = field(wrapper, 'Назва')
    ;(input.element as HTMLInputElement).focus()
    await input.setValue('QF1')
    await wrapper
      .get('[data-kind=background]')
      .trigger('pointerdown', pointer(wrapper, { x: 5000, y: 500 }))
    await nextTick()
    expect(store.selection).toBeNull()
    expect(store.content?.rails[0]?.elements[0]?.label).toBe('QF1')
    expect(store.undoLabel).toBe('Змінити назву апарата')
  })

  it('a focused draft is committed by a press on a contact and the new drawing survives', async () => {
    const withCable = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 150, [element(20, 0, 2, 2)])],
    })
    const { wrapper, store, ctx } = await mountEditor(withCable, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    const input = field(wrapper, 'Назва')
    ;(input.element as HTMLInputElement).focus()
    await input.setValue('QF1')
    await wrapper
      .get(`[data-ep-kind=cableWire][data-ep-a="${id(2)}"]`)
      .trigger('pointerdown', { button: 0, pointerId: 1 })
    await nextTick()
    expect(store.content?.rails[0]?.elements[0]?.label).toBe('QF1')
    expect(store.undoLabel).toBe('Змінити назву апарата')
    expect(ctx.drawing.value).not.toBeNull()
    expect(ctx.drawing.value?.start).toEqual(cw(id(2)))
  })

  it('a draft is flushed when another item gets selected (the form unmounts)', async () => {
    const { wrapper, store } = await mountEditor(c, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    await field(wrapper, 'Назва').setValue('QF1')
    store.select({ kind: 'element', id: id(21) })
    await nextTick()
    expect(store.content?.rails[0]?.elements[0]?.label).toBe('QF1')
    expect(store.content?.rails[0]?.elements[1]?.label).toBe('')
  })

  it('Escape reverts the draft: selecting something else afterwards commits nothing', async () => {
    const { wrapper, store } = await mountEditor(c, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    const input = field(wrapper, 'Назва')
    await input.setValue('QF1')
    await input.trigger('keydown', { key: 'Escape' })
    store.select(null)
    await nextTick()
    expect(store.canUndo).toBe(false)
  })

  it('the number of poles is committed through the panel: removed pole deletes its wire with a notice', async () => {
    const withWires = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 20, 150, [element(20, 2, 2, 2)])],
      wires: [
        panelWire(30, cw(id(2)), pole(id(20), 1, 'input')),
        panelWire(31, cw(id(3)), pole(id(20), 0, 'input')),
      ],
    })
    const { wrapper, store, ctx } = await mountEditor(withWires, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    const input = field(wrapper, 'Кількість полюсів')
    await input.setValue('1')
    await input.trigger('keydown', { key: 'Enter' })
    await nextTick()
    expect(store.content?.rails[0]?.elements[0]?.poles).toHaveLength(1)
    expect(store.content?.wires.map((w) => w.id)).toEqual([id(31)])
    expect(ctx.notice.value?.text).toBe('Видалено 1 провід')
    expect(store.undoLabel).toBe('Змінити кількість полюсів')
  })

  it('the width of an element is committed through the panel', async () => {
    const { wrapper, store } = await mountEditor(c, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    const input = field(wrapper, 'Ширина, модулів')
    await input.setValue('3')
    await input.trigger('blur')
    expect(store.content?.rails[0]?.elements[0]?.widthModules).toBe(3)
  })

  it('shows the code point counter for the label', async () => {
    const { wrapper, store } = await mountEditor(c, { properties: true })
    store.select({ kind: 'element', id: id(20) })
    await nextTick()
    await field(wrapper, 'Назва').setValue('😀😀😀')
    const counter = wrapper
      .findAll('.properties .field')
      .find((f) => f.get('label').text() === 'Назва')!
      .get('small')
    expect(counter.text()).toBe('3/16')
  })
})
