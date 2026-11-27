import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/problem'
import { useAsyncForm } from '../useAsyncForm'

const validation = new ApiError({
  status: 422,
  type: 'validation',
  message: 'v',
  violations: { email: ['bad'] },
})

describe('useAsyncForm', () => {
  it('returns the action result and is not pending afterwards', async () => {
    const form = useAsyncForm()
    await expect(form.run(async () => 42)).resolves.toBe(42)
    expect(form.pending.value).toBe(false)
    expect(form.error.value).toBeNull()
    expect(form.message.value).toBe('')
  })

  it('is pending during the call and ignores a second submit', async () => {
    const form = useAsyncForm()
    let release!: () => void
    let calls = 0
    const first = form.run(
      () =>
        new Promise<number>((r) => {
          calls++
          release = () => r(1)
        }),
    )
    expect(form.pending.value).toBe(true)
    await expect(form.run(async () => 2)).resolves.toBeUndefined()
    expect(calls).toBe(1)
    release()
    await first
    expect(form.pending.value).toBe(false)
  })

  it('stores an ApiError, exposes field errors and no generic message for declared fields', async () => {
    const form = useAsyncForm(['email'])
    await expect(form.run(() => Promise.reject(validation))).resolves.toBeUndefined()
    expect(form.fieldErrors.value).toEqual({ email: ['bad'] })
    expect(form.message.value).toBe('')
    expect(form.pending.value).toBe(false)
  })

  it('falls back to the generic message when a violation targets an undeclared field', async () => {
    const form = useAsyncForm(['password'])
    await form.run(() => Promise.reject(validation))
    expect(form.fieldErrors.value).toEqual({ email: ['bad'] })
    expect(form.message.value).not.toBe('')
  })

  it('shows the generic message if only some violation keys are declared', async () => {
    const form = useAsyncForm(['email'])
    await form.run(() =>
      Promise.reject(
        new ApiError({
          status: 422,
          type: 'validation',
          message: 'v',
          violations: { email: ['a'], other: ['b'] },
        }),
      ),
    )
    expect(form.message.value).not.toBe('')
  })

  it('exposes a generic message for non-validation errors', async () => {
    const form = useAsyncForm()
    await form.run(() =>
      Promise.reject(new ApiError({ status: 401, type: 'invalid_credentials', message: 'x' })),
    )
    expect(form.message.value).not.toBe('')
    expect(form.fieldErrors.value).toEqual({})
  })

  it('clears the previous error on the next run', async () => {
    const form = useAsyncForm()
    await form.run(() => Promise.reject(validation))
    await form.run(async () => 1)
    expect(form.error.value).toBeNull()
  })

  it('turns a non-ApiError failure into a generic message, resets pending and does not rethrow', async () => {
    const form = useAsyncForm()
    await expect(form.run(() => Promise.reject(new Error('boom')))).resolves.toBeUndefined()
    expect(form.pending.value).toBe(false)
    expect(form.error.value).toBeNull()
    expect(form.message.value).toBe('Неочікувана відповідь сервера. Оновіть сторінку.')
    await form.run(async () => 1)
    expect(form.message.value).toBe('')
  })
})
