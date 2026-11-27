import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, ME, problem, routeFetch } from '@/test/http'

type Store = ReturnType<typeof import('../auth').useAuthStore>
let store: Store

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const { useAuthStore } = await import('../auth')
  store = useAuthStore()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('bootstrap', () => {
  it('authenticates when refresh and /me succeed', async () => {
    const f = routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
    })
    await store.bootstrap()
    expect(store.status).toBe('authenticated')
    expect(store.isAuthenticated).toBe(true)
    expect(store.user).toEqual(ME)
    const meCall = f.calls.find((c) => c.key === 'GET /me')!
    expect((meCall.init.headers as Record<string, string>).Authorization).toBe('Bearer T')
  })

  it('becomes anonymous when refresh is rejected', async () => {
    routeFetch({ 'POST /auth/refresh': () => problem(401, 'token_invalid') })
    await store.bootstrap()
    expect(store.status).toBe('anonymous')
    expect(store.user).toBeNull()
  })

  it('becomes anonymous when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    await store.bootstrap()
    expect(store.status).toBe('anonymous')
  })

  it('becomes anonymous when /me fails after a successful refresh', async () => {
    routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(500, {}),
    })
    await store.bootstrap()
    expect(store.status).toBe('anonymous')
    expect(store.user).toBeNull()
  })

  it('runs once and returns the same promise on later calls', async () => {
    const f = routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
    })
    const first = store.bootstrap()
    const second = store.bootstrap()
    await Promise.all([first, second])
    await store.bootstrap()
    expect(f.count('POST /auth/refresh')).toBe(1)
    expect(f.count('GET /me')).toBe(1)
  })
})

describe('login', () => {
  it('200: stores the token, loads the user, returns "authenticated"', async () => {
    const f = routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
    })
    await expect(store.login('a@b.c', 'pw')).resolves.toBe('authenticated')
    expect(store.status).toBe('authenticated')
    expect(store.user).toEqual(ME)
    expect((f.calls[1]!.init.headers as Record<string, string>).Authorization).toBe('Bearer T')
  })

  it('202: keeps the 2FA token and returns "twoFactor" without authenticating', async () => {
    routeFetch({
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'PENDING', expiresIn: 300 }),
    })
    await expect(store.login('a@b.c', 'pw')).resolves.toBe('twoFactor')
    expect(store.twoFactorToken).toBe('PENDING')
    expect(store.isAuthenticated).toBe(false)
  })

  it('403 email_not_verified: returns "verifyEmail" and remembers the email', async () => {
    routeFetch({ 'POST /auth/login': () => problem(403, 'email_not_verified') })
    await expect(store.login('a@b.c', 'pw')).resolves.toBe('verifyEmail')
    expect(store.pendingEmail).toBe('a@b.c')
    expect(store.isAuthenticated).toBe(false)
  })

  it('401 invalid_credentials: rethrows and stays logged out', async () => {
    routeFetch({ 'POST /auth/login': () => problem(401, 'invalid_credentials') })
    await expect(store.login('a@b.c', 'bad')).rejects.toMatchObject({ type: 'invalid_credentials' })
    expect(store.isAuthenticated).toBe(false)
    expect(store.twoFactorToken).toBeNull()
  })

  it('429: rethrows with retryAfter', async () => {
    routeFetch({ 'POST /auth/login': () => problem(429, 'rate_limited', { 'Retry-After': '12' }) })
    await expect(store.login('a@b.c', 'pw')).rejects.toMatchObject({
      type: 'rate_limited',
      retryAfter: 12,
    })
  })
})

describe('submitTwoFactor', () => {
  async function toPending() {
    const f = routeFetch({
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'PENDING', expiresIn: 300 }),
      'POST /auth/2fa': () => jsonResponse(200, { token: 'T2' }),
      'GET /me': () => jsonResponse(200, ME),
    })
    await store.login('a@b.c', 'pw')
    return f
  }

  it('success: sends token + code, authenticates and clears the pending token', async () => {
    const f = await toPending()
    await store.submitTwoFactor('ABCD1234')
    const call = f.calls.find((c) => c.key === 'POST /auth/2fa')!
    expect(JSON.parse(call.init.body as string)).toEqual({
      twoFactorToken: 'PENDING',
      code: 'ABCD1234',
    })
    expect(store.twoFactorToken).toBeNull()
    expect(store.isAuthenticated).toBe(true)
  })

  it('invalid_code: rethrows and keeps the pending token for another try', async () => {
    routeFetch({
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'PENDING', expiresIn: 300 }),
      'POST /auth/2fa': () => problem(422, 'invalid_code'),
    })
    await store.login('a@b.c', 'pw')
    await expect(store.submitTwoFactor('AAAAAAAA')).rejects.toMatchObject({ type: 'invalid_code' })
    expect(store.twoFactorToken).toBe('PENDING')
    expect(store.isAuthenticated).toBe(false)
  })

  it('two_factor_restart: rethrows and clears the pending token', async () => {
    routeFetch({
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'PENDING', expiresIn: 300 }),
      'POST /auth/2fa': () => problem(401, 'two_factor_restart'),
    })
    await store.login('a@b.c', 'pw')
    await expect(store.submitTwoFactor('AAAAAAAA')).rejects.toMatchObject({
      type: 'two_factor_restart',
    })
    expect(store.twoFactorToken).toBeNull()
  })

  it('rejects with two_factor_restart and makes no request when nothing is pending', async () => {
    const f = routeFetch({})
    await expect(store.submitTwoFactor('AAAAAAAA')).rejects.toMatchObject({
      type: 'two_factor_restart',
    })
    expect(f.mock).not.toHaveBeenCalled()
  })
})

describe('resend', () => {
  it('resendTwoFactorCode sends login_2fa with the pending token', async () => {
    const f = routeFetch({
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'PENDING', expiresIn: 300 }),
      'POST /auth/resend-code': () => jsonResponse(202, {}),
    })
    await store.login('a@b.c', 'pw')
    await store.resendTwoFactorCode()
    const call = f.calls.find((c) => c.key === 'POST /auth/resend-code')!
    expect(JSON.parse(call.init.body as string)).toEqual({
      purpose: 'login_2fa',
      twoFactorToken: 'PENDING',
    })
  })

  it('resendTwoFactorCode does nothing without a pending token', async () => {
    const f = routeFetch({})
    await store.resendTwoFactorCode()
    expect(f.mock).not.toHaveBeenCalled()
  })

  it('resendVerificationCode sends email_verification with the email', async () => {
    const f = routeFetch({ 'POST /auth/resend-code': () => jsonResponse(202, {}) })
    await store.resendVerificationCode('a@b.c')
    expect(JSON.parse(f.calls[0]!.init.body as string)).toEqual({
      purpose: 'email_verification',
      email: 'a@b.c',
    })
  })
})

describe('register / verifyEmail', () => {
  it('register remembers the email on success', async () => {
    routeFetch({ 'POST /auth/register': () => jsonResponse(201, { id: 'u', email: 'a@b.c' }) })
    await store.register('a@b.c', 'pw')
    expect(store.pendingEmail).toBe('a@b.c')
  })

  it('register does not remember the email on a 422', async () => {
    routeFetch({
      'POST /auth/register': () =>
        jsonResponse(422, { violations: [{ propertyPath: 'email', message: 'taken' }] }),
    })
    await expect(store.register('a@b.c', 'pw')).rejects.toMatchObject({
      type: 'validation',
      violations: { email: ['taken'] },
    })
    expect(store.pendingEmail).toBe('')
  })

  it('verifyEmail rejects with invalid_code on a wrong code', async () => {
    routeFetch({ 'POST /auth/verify-email': () => problem(422, 'invalid_code') })
    await expect(store.verifyEmail('a@b.c', 'AAAAAAAA')).rejects.toMatchObject({
      type: 'invalid_code',
    })
  })
})

describe('/me failure right after authentication', () => {
  it('login: clears token and user and rethrows', async () => {
    const f = routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(500, {}),
    })
    await expect(store.login('a@b.c', 'pw')).rejects.toMatchObject({ status: 500 })
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    // The token is gone: the next protected call carries no Bearer.
    routeFetch({ 'GET /me': () => jsonResponse(200, ME) })
    const g = vi.mocked(fetch)
    await import('@/api/auth').then((m) => m.authApi.me())
    expect((g.mock.calls[0]![1]!.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(f.count('GET /me')).toBe(1)
  })

  it('2FA: clears token and user and rethrows', async () => {
    routeFetch({
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'P', expiresIn: 300 }),
      'POST /auth/2fa': () => jsonResponse(200, { token: 'T2' }),
      'GET /me': () => jsonResponse(500, {}),
    })
    await store.login('a@b.c', 'pw')
    await expect(store.submitTwoFactor('ABCD1234')).rejects.toMatchObject({ status: 500 })
    expect(store.user).toBeNull()
    expect(store.isAuthenticated).toBe(false)
    routeFetch({ 'GET /me': () => jsonResponse(200, ME) })
    await import('@/api/auth').then((m) => m.authApi.me())
    const headers = vi.mocked(fetch).mock.calls[0]![1]!.headers as Record<string, string>
    expect(headers.Authorization).toBeUndefined()
  })
})

describe('logout', () => {
  async function loggedIn() {
    const f = routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
      'POST /auth/logout': () => new Response(null, { status: 204 }),
    })
    await store.login('a@b.c', 'pw')
    return f
  }

  it('clears the session after a successful server logout', async () => {
    const f = await loggedIn()
    await store.logout()
    expect(store.status).toBe('anonymous')
    expect(store.user).toBeNull()
    const call = f.calls.find((c) => c.key === 'POST /auth/logout')!
    expect((call.init.headers as Record<string, string>).Authorization).toBeUndefined()
    expect(call.init.credentials).toBe('include')
  })

  it('clears the session even when the server errors', async () => {
    routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
      'POST /auth/logout': () => jsonResponse(500, {}),
    })
    await store.login('a@b.c', 'pw')
    await expect(store.logout()).resolves.toBeUndefined()
    expect(store.status).toBe('anonymous')
    expect(store.user).toBeNull()
  })

  it('clears the session even on a network failure and drops the token', async () => {
    const f = await loggedIn()
    f.mock.mockImplementationOnce(() => Promise.reject(new TypeError('offline')))
    await store.logout()
    expect(store.status).toBe('anonymous')
    expect(store.user).toBeNull()
  })
})

describe('setTwoFactor', () => {
  it('sends a merge-patch and stores the returned user', async () => {
    const f = routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
      'PATCH /me/two-factor': () => jsonResponse(200, { ...ME, twoFactorEnabled: true }),
    })
    await store.login('a@b.c', 'pw')
    await store.setTwoFactor(true, 'pw')
    const call = f.calls.find((c) => c.key === 'PATCH /me/two-factor')!
    expect((call.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/merge-patch+json',
    )
    expect(JSON.parse(call.init.body as string)).toEqual({ enabled: true, password: 'pw' })
    expect(store.user?.twoFactorEnabled).toBe(true)
  })

  it('403 password_confirmation_failed: rethrows and keeps the user unchanged', async () => {
    routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
      'PATCH /me/two-factor': () => problem(403, 'password_confirmation_failed'),
    })
    await store.login('a@b.c', 'pw')
    await expect(store.setTwoFactor(true, 'bad')).rejects.toMatchObject({
      type: 'password_confirmation_failed',
    })
    expect(store.user?.twoFactorEnabled).toBe(false)
  })
})

describe('session loss', () => {
  it('a rejected refresh during a protected call sets reloginNeeded and drops the token', async () => {
    routeFetch({
      'POST /auth/login': () => jsonResponse(200, { token: 'T' }),
      'GET /me': () => jsonResponse(200, ME),
      'PATCH /me/two-factor': () => problem(401, 'token_invalid'),
      'POST /auth/refresh': () => problem(401, 'token_invalid'),
    })
    await store.login('a@b.c', 'pw')
    await expect(store.setTwoFactor(true, 'pw')).rejects.toBeDefined()
    expect(store.status).toBe('reloginNeeded')
    expect(store.isAuthenticated).toBe(false)
    expect(store.user).toEqual(ME)
  })
})
