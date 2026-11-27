import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { normalizeCode } from '@/domain/authCode'
import FormField from '../FormField.vue'

function mountField(props: Record<string, unknown> = {}, modelValue = '') {
  return mount(FormField, {
    props: {
      label: 'Код',
      modelValue,
      'onUpdate:modelValue': (v: string) => wrapper.setProps({ modelValue: v }),
      ...props,
    },
  })
}
let wrapper: ReturnType<typeof mountField>

describe('FormField', () => {
  it('has no maxlength attribute', () => {
    wrapper = mountField({ normalize: normalizeCode })
    expect(wrapper.get('input').attributes('maxlength')).toBeUndefined()
  })

  it.each([
    [' ABCD1234', 'ABCD1234'],
    ['ABCD-1234', 'ABCD1234'],
    ['abcd1234', 'ABCD1234'],
  ])('normalises %j to %j in the model and the input', async (typed, expected) => {
    wrapper = mountField({ normalize: normalizeCode })
    await wrapper.get('input').setValue(typed)
    expect(wrapper.emitted('update:modelValue')!.pop()).toEqual([expected])
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(expected)
  })

  it('removes a rejected character from the DOM even when the model is unchanged', async () => {
    wrapper = mountField({ normalize: normalizeCode }, 'ABCD1234')
    const input = wrapper.get('input')
    await input.setValue('ABCD1234-')
    expect((input.element as HTMLInputElement).value).toBe('ABCD1234')
    expect(wrapper.props('modelValue')).toBe('ABCD1234')
  })

  it('passes the value through unchanged without normalize', async () => {
    wrapper = mountField()
    await wrapper.get('input').setValue(' a-b ')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe(' a-b ')
    expect(wrapper.emitted('update:modelValue')!.pop()).toEqual([' a-b '])
  })

  it('renders the first error with aria wiring, and none without errors', async () => {
    wrapper = mountField({ errors: ['bad', 'worse'] })
    expect(wrapper.get('.field-error').text()).toBe('bad')
    const input = wrapper.get('input')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect(input.attributes('aria-describedby')).toBe(wrapper.get('.field-error').attributes('id'))
    await wrapper.setProps({ errors: [] })
    expect(wrapper.find('.field-error').exists()).toBe(false)
    expect(input.attributes('aria-describedby')).toBeUndefined()
  })
})
