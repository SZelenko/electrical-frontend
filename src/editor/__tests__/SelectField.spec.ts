import { describe, expect, it } from 'vitest'
import { mountWithPlugins } from '@/test/mountWithPlugins'
import { choose, selectDisabled, selectIn, selectValue } from '@/test/vuetifySelect'
import SelectField from '../properties/SelectField.vue'

const items = [
  { title: 'Автомат', value: 'breaker' },
  { title: 'ПЗВ', value: 'rcd' },
]

function mountSelect(props: Record<string, unknown> = {}) {
  const updates: unknown[] = []
  const { wrapper } = mountWithPlugins(SelectField, {
    props: {
      label: 'Стиль',
      items,
      modelValue: 'breaker',
      'onUpdate:modelValue': (v: unknown) => updates.push(v),
      ...props,
    },
  })
  return { wrapper, updates }
}

describe('SelectField', () => {
  it('shows the label and the selected item title', () => {
    const { wrapper } = mountSelect()
    expect(wrapper.text()).toContain('Стиль')
    expect(selectValue(selectIn(wrapper))).toBe('breaker')
    expect(wrapper.get('.v-select__selection').text()).toBe('Автомат')
  })

  it('emits update:modelValue when another item is chosen', async () => {
    const { wrapper, updates } = mountSelect()
    await choose(selectIn(wrapper), 'rcd')
    expect(updates).toEqual(['rcd'])
  })

  it('supports numeric values', async () => {
    const { wrapper, updates } = mountSelect({
      items: [
        { title: '1', value: 1 },
        { title: '2', value: 2 },
      ],
      modelValue: 1,
    })
    await choose(selectIn(wrapper), 2)
    expect(updates).toEqual([2])
  })

  it('follows an external model change', async () => {
    const { wrapper } = mountSelect()
    await wrapper.setProps({ modelValue: 'rcd' })
    expect(wrapper.get('.v-select__selection').text()).toBe('ПЗВ')
  })

  it('is enabled by default and can be disabled', () => {
    expect(selectDisabled(selectIn(mountSelect().wrapper))).toBe(false)
    expect(selectDisabled(selectIn(mountSelect({ disabled: true }).wrapper))).toBe(true)
  })
})
