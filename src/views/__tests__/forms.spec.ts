import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { jsonResponse, ME, problem, routeFetch } from '@/test/http'
import { mountView } from '@/test/mountView'
import type { VueWrapper } from '@vue/test-utils'
import RegisterView from '../RegisterView.vue'
import LoginView from '../LoginView.vue'
import AccountView from '../AccountView.vue'

beforeEach(() => vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1'))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

async function fill(wrapper: VueWrapper, values: string[]) {
  const inputs = wrapper.findAll('input')
  for (const [i, value] of values.entries()) await inputs[i]!.setValue(value)
}
const submit = (w: VueWrapper) => w.get('form').trigger('submit')
const button = (w: VueWrapper) => w.get('button[type=submit]')

describe('RegisterView', () => {
  it('registers and moves on to email verification', async () => {
    routeFetch({ 'POST /auth/register': () => jsonResponse(201, { id: 'u', email: 'a@b.c' }) })
    const { wrapper, router } = await mountView(RegisterView)
    await fill(wrapper, ['a@b.c', 'Str0ng!pass'])
    await submit(wrapper)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('verify-email')
  })

  it('disables submit while the request is pending and ignores a second submit', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const f = routeFetch({
      'POST /auth/register': async () => {
        await gate
        return jsonResponse(201, { id: 'u', email: 'a@b.c' })
      },
    })
    const { wrapper } = await mountView(RegisterView)
    await fill(wrapper, ['a@b.c', 'Str0ng!pass'])
    await submit(wrapper)
    expect(button(wrapper).attributes('disabled')).toBeDefined()
    await submit(wrapper)
    release()
    await flushPromises()
    expect(f.count('POST /auth/register')).toBe(1)
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('shows 422 violations on the matching fields and stays on the page', async () => {
    routeFetch({
      'POST /auth/register': () =>
        jsonResponse(422, {
          violations: [
            { propertyPath: 'email', message: 'Already registered' },
            { propertyPath: 'password', message: 'Too weak' },
          ],
        }),
    })
    const { wrapper, router } = await mountView(RegisterView)
    await fill(wrapper, ['a@b.c', 'x'])
    await submit(wrapper)
    await flushPromises()
    const errors = wrapper.findAll('.field-error').map((e) => e.text())
    expect(errors).toEqual(['Already registered', 'Too weak'])
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
    expect(router.currentRoute.value.name).toBe('test')
    expect(wrapper.findAll('input')[0]!.attributes('aria-invalid')).toBe('true')
  })

  it('shows the rate-limit message with the wait time', async () => {
    routeFetch({
      'POST /auth/register': () => problem(429, 'rate_limited', { 'Retry-After': '45' }),
    })
    const { wrapper } = await mountView(RegisterView)
    await fill(wrapper, ['a@b.c', 'Str0ng!pass'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('45')
  })

  it('shows a network error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    const { wrapper } = await mountView(RegisterView)
    await fill(wrapper, ['a@b.c', 'Str0ng!pass'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
  })
})

describe('LoginView', () => {
  const okLogin = {
    'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
    'GET /me': () => jsonResponse(200, ME),
  }

  it('logs in and goes to the safe redirect target', async () => {
    routeFetch(okLogin)
    const { wrapper, router } = await mountView(LoginView, '/test?redirect=/account')
    await fill(wrapper, ['a@b.c', 'pw'])
    await submit(wrapper)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('account')
  })

  it('ignores an external redirect target', async () => {
    routeFetch(okLogin)
    const { wrapper, router } = await mountView(
      LoginView,
      '/test?redirect=' + encodeURIComponent('//evil.example'),
    )
    await fill(wrapper, ['a@b.c', 'pw'])
    await submit(wrapper)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('goes to the 2FA step on 202', async () => {
    routeFetch({
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'P', expiresIn: 300 }),
    })
    const { wrapper, router } = await mountView(LoginView)
    await fill(wrapper, ['a@b.c', 'pw'])
    await submit(wrapper)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('two-factor')
  })

  it('goes to email verification on 403 email_not_verified', async () => {
    routeFetch({ 'POST /auth/login': () => problem(403, 'email_not_verified') })
    const { wrapper, router } = await mountView(LoginView)
    await fill(wrapper, ['a@b.c', 'pw'])
    await submit(wrapper)
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('verify-email')
  })

  it('shows an error for invalid credentials and stays', async () => {
    routeFetch({ 'POST /auth/login': () => problem(401, 'invalid_credentials') })
    const { wrapper, router } = await mountView(LoginView)
    await fill(wrapper, ['a@b.c', 'bad'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
    expect(router.currentRoute.value.name).toBe('test')
  })

  it('shows 422 violations on the email and password fields', async () => {
    routeFetch({
      'POST /auth/login': () =>
        jsonResponse(422, {
          violations: [
            { propertyPath: 'email', message: 'Bad email' },
            { propertyPath: 'password', message: 'Bad password' },
          ],
        }),
    })
    const { wrapper } = await mountView(LoginView)
    await fill(wrapper, ['x', 'y'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.findAll('.field-error').map((e) => e.text())).toEqual([
      'Bad email',
      'Bad password',
    ])
    expect(wrapper.find('[role=alert]').exists()).toBe(false)
  })

  it('shows the generic message for a violation on an unknown field', async () => {
    routeFetch({
      'POST /auth/login': () =>
        jsonResponse(422, { violations: [{ propertyPath: 'other', message: 'Hidden' }] }),
    })
    const { wrapper } = await mountView(LoginView)
    await fill(wrapper, ['x', 'y'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.find('.field-error').exists()).toBe(false)
    expect(wrapper.get('[role=alert]').text()).not.toBe('')
  })

  it('disables submit while pending', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    routeFetch({
      'POST /auth/login': async () => {
        await gate
        return problem(401, 'invalid_credentials')
      },
    })
    const { wrapper } = await mountView(LoginView)
    await fill(wrapper, ['a@b.c', 'pw'])
    await submit(wrapper)
    expect(button(wrapper).attributes('disabled')).toBeDefined()
    release()
    await flushPromises()
    expect(button(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('shows the rate-limit message', async () => {
    routeFetch({ 'POST /auth/login': () => problem(429, 'rate_limited') })
    const { wrapper } = await mountView(LoginView)
    await fill(wrapper, ['a@b.c', 'pw'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toMatch(/пізніше/)
  })
})

describe('AccountView', () => {
  async function loggedIn(extra: Parameters<typeof routeFetch>[0]) {
    routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
      ...extra,
    })
    const ctx = await mountView(AccountView)
    const { useAuthStore } = await import('@/stores/auth')
    await useAuthStore().login('a@b.c', 'pw')
    await flushPromises()
    return ctx
  }

  it('enables 2FA after confirming the password', async () => {
    const { wrapper } = await loggedIn({
      'PATCH /me/two-factor': () => jsonResponse(200, { ...ME, twoFactorEnabled: true }),
    })
    expect(button(wrapper).text()).toContain('Увімкнути')
    await fill(wrapper, ['pw'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.text()).toContain('увімкнена')
    expect(wrapper.get('[role=status]').text()).toContain('збережено')
  })

  it('shows an error for a wrong password and keeps the state', async () => {
    const { wrapper } = await loggedIn({
      'PATCH /me/two-factor': () => problem(403, 'password_confirmation_failed'),
    })
    await fill(wrapper, ['bad'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('Невірний пароль')
    expect(wrapper.text()).toContain('вимкнена')
  })

  it('shows the rate-limit message', async () => {
    const { wrapper } = await loggedIn({
      'PATCH /me/two-factor': () => problem(429, 'rate_limited', { 'Retry-After': '9' }),
    })
    await fill(wrapper, ['pw'])
    await submit(wrapper)
    await flushPromises()
    expect(wrapper.get('[role=alert]').text()).toContain('9')
  })

  it('logs out and goes to /login, even when the server fails', async () => {
    const { wrapper, router } = await loggedIn({ 'POST /auth/logout': () => jsonResponse(500, {}) })
    await wrapper.get('button[type=button]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('login')
    const { useAuthStore } = await import('@/stores/auth')
    expect(useAuthStore().status).toBe('anonymous')
  })
})
