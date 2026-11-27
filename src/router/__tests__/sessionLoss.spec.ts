import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { jsonResponse, ME, problem, routeFetch } from '@/test/http'

async function setup() {
  routeFetch({
    'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
    'GET /me': () => jsonResponse(200, ME),
    'PATCH /me/two-factor': () => problem(401, 'token_invalid'),
  })
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  const mod = await import('../index')
  const auth = (await import('@/stores/auth')).useAuthStore()
  mod.watchSessionLoss()
  return { router: mod.default, auth }
}

beforeEach(() => vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1'))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('watchSessionLoss', () => {
  it('sends the user from a protected route to /login?redirect=', async () => {
    const { router, auth } = await setup()
    await router.push('/account?x=1')
    expect(auth.status).toBe('authenticated')
    // A refresh rejected mid-session flips the status (refresh now fails).
    routeFetch({
      'PATCH /me/two-factor': () => problem(401, 'token_invalid'),
      'POST /auth/refresh': () => problem(401, 'token_invalid'),
    })
    await expect(auth.setTwoFactor(true, 'pw')).rejects.toBeDefined()
    await flushPromises()
    expect(auth.status).toBe('reloginNeeded')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('login'))
    expect(router.currentRoute.value.query.redirect).toBe('/account?x=1')
  })

  it('does not navigate when the current route is public', async () => {
    const { router, auth } = await setup()
    await router.push('/account')
    await router.push('/verify-email')
    routeFetch({
      'PATCH /me/two-factor': () => problem(401, 'token_invalid'),
      'POST /auth/refresh': () => problem(401, 'token_invalid'),
    })
    await expect(auth.setTwoFactor(true, 'pw')).rejects.toBeDefined()
    await flushPromises()
    expect(auth.status).toBe('reloginNeeded')
    expect(router.currentRoute.value.name).toBe('verify-email')
  })
})
