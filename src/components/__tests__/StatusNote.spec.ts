import { describe, expect, it } from 'vitest'
import StatusNote from '@/components/StatusNote.vue'
import { mountWithPlugins } from '@/test/mountWithPlugins'

const mountNote = (tone: 'info' | 'success' | 'error') =>
  mountWithPlugins(StatusNote, { props: { tone }, slots: { default: 'Повідомлення' } }).wrapper

describe('StatusNote roles', () => {
  it('error: role="alert" (assertive)', () => {
    const w = mountNote('error')
    expect(w.attributes('role')).toBe('alert')
    expect(w.text()).toBe('Повідомлення')
  })

  it.each(['info', 'success'] as const)('%s: role="status" (polite), never an alert', (tone) => {
    const w = mountNote(tone)
    expect(w.attributes('role')).toBe('status')
    expect(w.find('[role=alert]').exists()).toBe(false)
    expect(w.text()).toBe('Повідомлення')
  })

  it('follows a tone change', async () => {
    const w = mountNote('info')
    await w.setProps({ tone: 'error' })
    expect(w.attributes('role')).toBe('alert')
    await w.setProps({ tone: 'success' })
    expect(w.attributes('role')).toBe('status')
  })
})
