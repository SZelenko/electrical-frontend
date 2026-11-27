import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jsonResponse, ME, problem, routeFetch } from '@/test/http'

type Router = typeof import('../index').default
let router: Router
let auth: ReturnType<typeof import('@/stores/auth').useAuthStore>

async function setup(routes: Parameters<typeof routeFetch>[0]) {
  const f = routeFetch(routes)
  vi.resetModules()
  const { createPinia, setActivePinia } = await import('pinia')
  setActivePinia(createPinia())
  router = (await import('../index')).default
  auth = (await import('@/stores/auth')).useAuthStore()
  return f
}

const SESSION = {
  'POST /auth/refresh': () => jsonResponse(200, { token: 'T' }),
  'GET /me': () => jsonResponse(200, ME),
}
const NO_SESSION = { 'POST /auth/refresh': () => problem(401, 'token_invalid') }

beforeEach(() => {
  vi.stubEnv('VITE_API_URL', 'https://api.test/api/v1')
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe('router guard', () => {
  it('awaits the initial refresh before deciding, then lets an authenticated user in', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const f = await setup({
      'POST /auth/refresh': async () => {
        await gate
        return jsonResponse(200, { token: 'T' })
      },
      'GET /me': () => jsonResponse(200, ME),
    })
    let settled = false
    const nav = router.push('/account').then(() => (settled = true))
    await vi.waitFor(() => expect(f.count('POST /auth/refresh')).toBe(1))
    await Promise.resolve()
    expect(settled).toBe(false)
    release()
    await nav
    expect(router.currentRoute.value.name).toBe('account')
  })

  it('redirects an anonymous user from a protected route to /login?redirect=', async () => {
    await setup(NO_SESSION)
    await router.push('/account?tab=1')
    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/account?tab=1')
  })

  it('bootstraps only once across navigations', async () => {
    const f = await setup(NO_SESSION)
    await router.push('/account')
    await router.push('/register')
    await router.push('/login')
    expect(f.count('POST /auth/refresh')).toBe(1)
  })

  it.each(['/login', '/register'])(
    'sends an authenticated user from guest-only %s to home',
    async (path) => {
      await setup(SESSION)
      await router.push(path)
      expect(router.currentRoute.value.name).toBe('home')
      expect(auth.isAuthenticated).toBe(true)
    },
  )

  it.each(['/login', '/register', '/verify-email'])(
    'lets an anonymous user open %s',
    async (path) => {
      await setup(NO_SESSION)
      await router.push(path)
      expect(router.currentRoute.value.path).toBe(path)
    },
  )

  it('redirects /two-factor to /login without a pending token', async () => {
    await setup(NO_SESSION)
    await router.push('/two-factor')
    expect(router.currentRoute.value.name).toBe('login')
  })

  it('opens /two-factor when a pending token exists', async () => {
    await setup({
      ...NO_SESSION,
      'POST /auth/login': () => jsonResponse(202, { twoFactorToken: 'P', expiresIn: 300 }),
    })
    await router.push('/login')
    await auth.login('a@b.c', 'pw')
    await router.push('/two-factor')
    expect(router.currentRoute.value.name).toBe('two-factor')
  })
})
