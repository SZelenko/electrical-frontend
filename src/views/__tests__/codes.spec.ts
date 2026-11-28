import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { jsonResponse, ME, problem, routeFetch } from '@/test/http'
import { mountView } from '@/test/mountView'
import { RESEND_COOLDOWN_SECONDS } from '@/domain/authCode'
import VerifyEmailView from '../VerifyEmailView.vue'
import TwoFactorView from '../TwoFactorView.vue'
import { alertText, hasAlert, fieldMessages } from '@/test/a11y'

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const submitBtn = (w: VueWrapper) => w.get('button[type=submit]')
const resendBtn = (w: VueWrapper) => w.findAll('button[type=button]')[0]!
const submit = (w: VueWrapper) => w.get('form').trigger('submit')

describe('VerifyEmailView', () => {
  async function mountIt(routes: Parameters<typeof routeFetch>[0] = {}) {
    const f = routeFetch(routes)
    const ctx = await mountView(VerifyEmailView)
    return { ...ctx, f }
  }

  it('normalises the typed code to uppercase A-Z0-9, max 8', async () => {
    const { wrapper } = await mountIt()
    const code = wrapper.findAll('input')[1]!
    await code.setValue('ab-cd 12345xyz')
    expect((code.element as HTMLInputElement).value).toBe('ABCD1234')
  })

  it('keeps submit disabled until the code is complete', async () => {
    const { wrapper } = await mountIt()
    const code = wrapper.findAll('input')[1]!
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    await code.setValue('ABCD123')
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    await code.setValue('abcd1234')
    expect(submitBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('verifies the email and goes to login with the email remembered', async () => {
    const { wrapper, router, f } = await mountIt({
      'POST /auth/verify-email': () => new Response(null, { status: 204 }),
    })
    await wrapper.findAll('input')[0]!.setValue('a@b.c')
    await wrapper.findAll('input')[1]!.setValue('abcd1234')
    await submit(wrapper)
    await flushPromises()
    expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual({
      email: 'a@b.c',
      code: 'ABCD1234',
    })
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('shows invalid_code and stays', async () => {
    const { wrapper, router } = await mountIt({
      'POST /auth/verify-email': () => problem(422, 'invalid_code'),
    })
    await wrapper.findAll('input')[0]!.setValue('a@b.c')
    await wrapper.findAll('input')[1]!.setValue('AAAAAAAA')
    await submit(wrapper)
    await flushPromises()
    expect(alertText(wrapper)).toContain('код')
    expect(router.currentRoute.value.name).toBe('test')
  })

  it('shows violations on the email and code fields', async () => {
    const { wrapper } = await mountIt({
      'POST /auth/verify-email': () =>
        jsonResponse(422, {
          violations: [
            { propertyPath: 'email', message: 'Bad email' },
            { propertyPath: 'code', message: 'Bad code' },
          ],
        }),
    })
    await wrapper.findAll('input')[0]!.setValue('x')
    await wrapper.findAll('input')[1]!.setValue('A')
    await submit(wrapper)
    await flushPromises()
    expect(fieldMessages(wrapper)).toEqual(['Bad email', 'Bad code'])
  })

  it('disables submit while pending', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { wrapper } = await mountIt({
      'POST /auth/verify-email': async () => {
        await gate
        return new Response(null, { status: 204 })
      },
    })
    await wrapper.findAll('input')[0]!.setValue('a@b.c')
    await wrapper.findAll('input')[1]!.setValue('AAAAAAAA')
    await submit(wrapper)
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
  })

  it('locks resend for the cooldown, shows the countdown, then enables it', async () => {
    const { wrapper } = await mountIt()
    expect(resendBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(resendBtn(wrapper).text()).toContain(String(RESEND_COOLDOWN_SECONDS))
    await vi.advanceTimersByTimeAsync(10_000)
    expect(resendBtn(wrapper).text()).toContain(String(RESEND_COOLDOWN_SECONDS - 10))
    await vi.advanceTimersByTimeAsync((RESEND_COOLDOWN_SECONDS - 10) * 1000)
    expect(resendBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('resends the code and restarts the countdown', async () => {
    const { wrapper, f } = await mountIt({ 'POST /auth/resend-code': () => jsonResponse(202, {}) })
    await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000)
    await wrapper.findAll('input')[0]!.setValue('a@b.c')
    await resendBtn(wrapper).trigger('click')
    await flushPromises()
    expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual({
      purpose: 'email_verification',
      email: 'a@b.c',
    })
    expect(wrapper.get('[role=status]').text()).toContain('надіслано')
    expect(resendBtn(wrapper).attributes('disabled')).toBeDefined()
  })

  it('on a 429 resend shows the message and uses Retry-After for the countdown', async () => {
    const { wrapper } = await mountIt({
      'POST /auth/resend-code': () => problem(429, 'rate_limited', { 'Retry-After': '20' }),
    })
    await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000)
    await resendBtn(wrapper).trigger('click')
    await flushPromises()
    expect(alertText(wrapper)).toContain('20')
    expect(resendBtn(wrapper).text()).toContain('20')
    expect(resendBtn(wrapper).attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(resendBtn(wrapper).attributes('disabled')).toBeUndefined()
  })
})

describe('TwoFactorView', () => {
  async function mountPending(routes: Parameters<typeof routeFetch>[0], path = '/test') {
    const f = routeFetch({
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'P', expiresIn: 300 }),
      'GET /me': () => jsonResponse(200, ME),
      ...routes,
    })
    const ctx = await mountView(TwoFactorView, path)
    const { useAuthStore } = await import('@/stores/auth')
    await useAuthStore().login('a@b.c', 'pw')
    return { ...ctx, f }
  }

  it('normalises the typed code', async () => {
    const { wrapper } = await mountPending({})
    const input = wrapper.get('input')
    await input.setValue('ab12-cd34zz')
    expect((input.element as HTMLInputElement).value).toBe('AB12CD34')
  })

  it('submits the code, authenticates and follows the redirect', async () => {
    const { wrapper, router } = await mountPending(
      { 'POST /auth/2fa': () => jsonResponse(200, { token: 'T' }) },
      '/test?redirect=/account',
    )
    await wrapper.get('input').setValue('ab12cd34')
    await submit(wrapper)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('account')
  })

  it('shows invalid_code and keeps the form usable', async () => {
    const { wrapper, router } = await mountPending({
      'POST /auth/2fa': () => problem(422, 'invalid_code'),
    })
    await wrapper.get('input').setValue('AAAAAAAA')
    await submit(wrapper)
    await flushPromises()
    expect(alertText(wrapper)).toContain('код')
    expect(submitBtn(wrapper).attributes('disabled')).toBeUndefined()
    expect(router.currentRoute.value.name).toBe('test')
  })

  it('two_factor_restart replaces the form buttons with a link back to login', async () => {
    const { wrapper } = await mountPending({
      'POST /auth/2fa': () => problem(401, 'two_factor_restart'),
    })
    await wrapper.get('input').setValue('AAAAAAAA')
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.find('button[type=submit]').exists()).toBe(false)
    expect(wrapper.get('a').text()).toContain('Повернутися')
  })

  it('shows 422 violations on the code field', async () => {
    const { wrapper } = await mountPending({
      'POST /auth/2fa': () =>
        jsonResponse(422, { violations: [{ propertyPath: 'code', message: 'Bad code' }] }),
    })
    await wrapper.get('input').setValue('AAAAAAAA')
    await submit(wrapper)
    await flushPromises()
    expect(fieldMessages(wrapper)[0]).toBe('Bad code')
    expect(hasAlert(wrapper)).toBe(false)
  })

  it('keeps submit disabled until the code is complete', async () => {
    const { wrapper } = await mountPending({})
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.get('input').setValue('ABCD123')
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    await wrapper.get('input').setValue('ABCD1234')
    expect(submitBtn(wrapper).attributes('disabled')).toBeUndefined()
    await wrapper.get('input').setValue('ABCD123')
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
  })

  it('shows the rate-limit message on submit', async () => {
    const { wrapper } = await mountPending({
      'POST /auth/2fa': () => problem(429, 'rate_limited', { 'Retry-After': '30' }),
    })
    await wrapper.get('input').setValue('AAAAAAAA')
    await submit(wrapper)
    await flushPromises()
    expect(alertText(wrapper)).toContain('30')
  })

  it('disables submit while pending', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const { wrapper } = await mountPending({
      'POST /auth/2fa': async () => {
        await gate
        return problem(422, 'invalid_code')
      },
    })
    await wrapper.get('input').setValue('AAAAAAAA')
    await submit(wrapper)
    expect(submitBtn(wrapper).attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(submitBtn(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('counts down, then resends with the pending token and restarts the countdown', async () => {
    const { wrapper, f } = await mountPending({
      'POST /auth/resend-code': () => jsonResponse(202, {}),
    })
    expect(resendBtn(wrapper).attributes('disabled')).toBeDefined()
    await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000)
    expect(resendBtn(wrapper).attributes('disabled')).toBeUndefined()
    await resendBtn(wrapper).trigger('click')
    await flushPromises()
    const call = f.calls.find((c) => c.key === 'POST /auth/resend-code')!
    expect(JSON.parse(call.init.body as string)).toEqual({
      purpose: 'login_2fa',
      twoFactorToken: 'P',
    })
    expect(resendBtn(wrapper).attributes('disabled')).toBeDefined()
    expect(resendBtn(wrapper).text()).toContain(String(RESEND_COOLDOWN_SECONDS))
  })

  it('shows the resend error and uses Retry-After on 429', async () => {
    const { wrapper } = await mountPending({
      'POST /auth/resend-code': () => problem(429, 'rate_limited', { 'Retry-After': '15' }),
    })
    await vi.advanceTimersByTimeAsync(RESEND_COOLDOWN_SECONDS * 1000)
    await resendBtn(wrapper).trigger('click')
    await flushPromises()
    expect(alertText(wrapper)).toContain('15')
    expect(resendBtn(wrapper).text()).toContain('15')
  })
})
