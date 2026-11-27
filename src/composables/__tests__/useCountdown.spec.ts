import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'
import { useCountdown } from '../useCountdown'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function create() {
  const scope = effectScope()
  const countdown = scope.run(() => useCountdown())!
  return { scope, ...countdown }
}

describe('useCountdown', () => {
  it('is inactive until started', () => {
    const { remaining, active } = create()
    expect(remaining.value).toBe(0)
    expect(active.value).toBe(false)
  })

  it('counts down each second and stops at 0', () => {
    const { remaining, active, start } = create()
    start(3)
    expect(active.value).toBe(true)
    vi.advanceTimersByTime(1000)
    expect(remaining.value).toBe(2)
    vi.advanceTimersByTime(2000)
    expect(remaining.value).toBe(0)
    expect(active.value).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(remaining.value).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('restarting replaces the previous timer', () => {
    const { remaining, start } = create()
    start(10)
    vi.advanceTimersByTime(3000)
    start(5)
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(remaining.value).toBe(4)
  })

  it('clears the timer when its scope is disposed', () => {
    const { scope, start } = create()
    start(10)
    scope.stop()
    expect(vi.getTimerCount()).toBe(0)
  })
})
