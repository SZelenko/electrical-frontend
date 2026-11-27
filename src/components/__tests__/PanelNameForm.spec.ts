import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ApiError } from '@/api/problem'
import PanelNameForm from '../PanelNameForm.vue'

const mountForm = (action = vi.fn().mockResolvedValue(undefined), initial?: string) =>
  mount(PanelNameForm, { props: { label: 'Назва', submitLabel: 'Ок', action, initial } })

describe('PanelNameForm', () => {
  it('limits the name input to 100 characters', () => {
    expect(mountForm().get('input').attributes('maxlength')).toBe('100')
  })

  it('submits the trimmed name and emits done', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    const wrapper = mountForm(action)
    await wrapper.get('input').setValue('  Щит  ')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(action).toHaveBeenCalledWith('Щит')
    expect(wrapper.emitted('done')).toHaveLength(1)
  })

  it('prefills the initial name', () => {
    expect((mountForm(undefined, 'Old').get('input').element as HTMLInputElement).value).toBe('Old')
  })

  it('shows the error and does not emit done when the action fails', async () => {
    const action = vi
      .fn()
      .mockRejectedValue(new ApiError({ status: 409, type: 'panel_name_conflict', message: 'x' }))
    const wrapper = mountForm(action)
    await wrapper.get('input').setValue('Dup')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('вже існує')
    expect(wrapper.emitted('done')).toBeUndefined()
  })
})
