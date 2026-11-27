import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { jsonResponse, problem } from '@/test/http'

type Client = typeof import('../client')

const API = 'https://api.test/api/v1'
let fetchMock: ReturnType<typeof vi.fn>
let lockDepth: number
let lockRequests: string[]
let client: Client
let token: string | null
let setTokenCalls: (string | null)[]
let onSessionLost: Mock<() => void>

function installLocks() {
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: async (name: string, fn: () => Promise<unknown>) => {
        lockRequests.push(name)
        lockDepth++
        try {
          return await fn()
        } finally {
          lockDepth--
        }
      },
    },
  })
}

function headersOf(call: number): Record<string, string> {
  return (fetchMock.mock.calls[call]![1] as RequestInit).headers as Record<string, string>
}
function initOf(call: number): RequestInit {
  return fetchMock.mock.calls[call]![1] as RequestInit
}
function urlOf(call: number): string {
  return fetchMock.mock.calls[call]![0] as string
}

beforeEach(async () => {
  vi.resetModules()
  vi.stubEnv('VITE_API_URL', API)
  lockDepth = 0
  lockRequests = []
  token = 'old-token'
  setTokenCalls = []
  onSessionLost = vi.fn<() => void>()
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  installLocks()
  client = await import('../client')
  client.configureApi({
    getToken: () => token,
    setToken: (t) => {
      token = t
      setTokenCalls.push(t)
    },
    onSessionLost,
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  Reflect.deleteProperty(navigator, 'locks')
})

describe('request headers', () => {
  it.each([
    '/auth/login',
    '/auth/2fa',
    '/auth/refresh',
    '/auth/logout',
    '/auth/register',
    '/auth/verify-email',
    '/auth/resend-code',
  ])('does not send Authorization to %s', async (path) => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await client.apiRequest(path, { method: 'POST', body: {} })
    expect(headersOf(0).Authorization).toBeUndefined()
  })

  it('sends the Bearer token on non-auth paths', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { id: 1 }))
    const res = await client.apiRequest('/me')
    expect(urlOf(0)).toBe(`${API}/me`)
    expect(headersOf(0).Authorization).toBe('Bearer old-token')
    expect(res).toEqual({ status: 200, data: { id: 1 } })
  })

  it('sends no Authorization when there is no token', async () => {
    token = null
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await client.apiRequest('/me')
    expect(headersOf(0).Authorization).toBeUndefined()
  })

  it.each(['/auth/login', '/auth/2fa', '/auth/refresh', '/auth/logout'])(
    'uses credentials include on %s',
    async (path) => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}))
      await client.apiRequest(path, { method: 'POST' })
      expect(initOf(0).credentials).toBe('include')
    },
  )

  it.each(['/auth/register', '/auth/verify-email', '/auth/resend-code', '/me', '/me/two-factor'])(
    'does not set credentials on %s',
    async (path) => {
      fetchMock.mockResolvedValue(jsonResponse(200, {}))
      await client.apiRequest(path, { method: 'POST', body: {} })
      expect(initOf(0).credentials).toBeUndefined()
    },
  )

  it('serialises the body and honours a custom content type', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, {}))
    await client.apiRequest('/me/two-factor', {
      method: 'PATCH',
      body: { enabled: true },
      contentType: 'application/merge-patch+json',
    })
    expect(initOf(0).method).toBe('PATCH')
    expect(initOf(0).body).toBe('{"enabled":true}')
    expect(headersOf(0)['Content-Type']).toBe('application/merge-patch+json')
  })
})

describe('error handling', () => {
  it('throws a typed error with Retry-After for a 429', async () => {
    fetchMock.mockResolvedValue(problem(429, 'rate_limited', { 'Retry-After': '30' }))
    const error = await client.apiRequest('/auth/login', { method: 'POST' }).catch((e) => e)
    expect(error).toBeInstanceOf((await import('../problem')).ApiError)
    expect(error).toMatchObject({ type: 'rate_limited', status: 429, retryAfter: 30 })
  })

  it('throws a network error when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('failed'))
    await expect(client.apiRequest('/me')).rejects.toMatchObject({ type: 'network', status: 0 })
  })

  it('tolerates a non-JSON error body', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }))
    await expect(client.apiRequest('/me')).rejects.toMatchObject({ type: 'unknown', status: 502 })
  })

  it('returns undefined data for an empty 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(client.apiRequest('/auth/logout', { method: 'POST' })).resolves.toEqual({
      status: 204,
      data: undefined,
    })
  })

  it('does not refresh on a 401 that is not token_invalid', async () => {
    fetchMock.mockResolvedValue(problem(401, 'invalid_credentials'))
    await expect(client.apiRequest('/me')).rejects.toMatchObject({ type: 'invalid_credentials' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not refresh when an /auth/* call returns token_invalid', async () => {
    fetchMock.mockResolvedValue(problem(401, 'token_invalid'))
    await expect(client.apiRequest('/auth/logout', { method: 'POST' })).rejects.toMatchObject({
      type: 'token_invalid',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('401 token_invalid -> refresh -> retry', () => {
  it('refreshes once and retries once with the new token', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'token_invalid'))
      .mockResolvedValueOnce(jsonResponse(200, { token: 'new-token' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))

    const res = await client.apiRequest('/me')

    expect(res.data).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(urlOf(1)).toBe(`${API}/auth/refresh`)
    expect(initOf(1).credentials).toBe('include')
    expect(headersOf(1).Authorization).toBeUndefined()
    expect(setTokenCalls).toEqual(['new-token'])
    expect(headersOf(2).Authorization).toBe('Bearer new-token')
  })

  it('does not loop when the retry is rejected again', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'token_invalid'))
      .mockResolvedValueOnce(jsonResponse(200, { token: 'new-token' }))
      .mockResolvedValueOnce(problem(401, 'token_invalid'))

    await expect(client.apiRequest('/me')).rejects.toMatchObject({ type: 'token_invalid' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('shares one refresh between concurrent 401s', async () => {
    let resolveRefresh!: (r: Response) => void
    const refreshGate = new Promise<Response>((r) => (resolveRefresh = r))
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/auth/refresh')) return refreshGate
      const authorization = headersOfUrl(url) ?? ''
      return Promise.resolve(
        authorization === 'Bearer new-token'
          ? jsonResponse(200, { ok: 1 })
          : problem(401, 'token_invalid'),
      )
    })
    // Resolve the Authorization header of the most recent call to this URL.
    function headersOfUrl(url: string): string | undefined {
      const calls = fetchMock.mock.calls.filter((c) => c[0] === url)
      const last = calls[calls.length - 1]
      return ((last?.[1] as RequestInit).headers as Record<string, string>).Authorization
    }

    const all = Promise.all([
      client.apiRequest('/me'),
      client.apiRequest('/panels'),
      client.apiRequest('/me/two-factor'),
    ])
    await vi.waitFor(() => {
      expect(fetchMock.mock.calls.filter((c) => c[0] === `${API}/auth/refresh`)).toHaveLength(1)
    })
    resolveRefresh(jsonResponse(200, { token: 'new-token' }))
    const results = await all

    expect(results.map((r) => r.status)).toEqual([200, 200, 200])
    const refreshCalls = fetchMock.mock.calls.filter((c) => c[0] === `${API}/auth/refresh`)
    expect(refreshCalls).toHaveLength(1)
    expect(setTokenCalls).toEqual(['new-token'])
  })

  it('allows a new refresh after the previous one settled', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, { token: 't' })))
    await client.refreshSession()
    await client.refreshSession()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe('refresh failures', () => {
  it('calls onSessionLost and rethrows when refresh answers 401', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'token_invalid'))
      .mockResolvedValueOnce(problem(401, 'token_invalid'))

    await expect(client.apiRequest('/me')).rejects.toMatchObject({ status: 401 })
    expect(onSessionLost).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(setTokenCalls).toEqual([])
  })

  it('does not call onSessionLost on a network failure of the refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'token_invalid'))
      .mockRejectedValueOnce(new TypeError('offline'))

    await expect(client.apiRequest('/me')).rejects.toMatchObject({ type: 'network' })
    expect(onSessionLost).not.toHaveBeenCalled()
  })

  it('does not call onSessionLost on a 5xx of the refresh', async () => {
    fetchMock
      .mockResolvedValueOnce(problem(401, 'token_invalid'))
      .mockResolvedValueOnce(jsonResponse(503, {}))

    await expect(client.apiRequest('/me')).rejects.toMatchObject({ status: 503 })
    expect(onSessionLost).not.toHaveBeenCalled()
  })
})

describe('Web Lock', () => {
  it('calls the refresh endpoint inside the auth-refresh lock', async () => {
    const depths: number[] = []
    fetchMock.mockImplementation(() => {
      depths.push(lockDepth)
      return Promise.resolve(jsonResponse(200, { token: 't' }))
    })
    await client.refreshSession()
    expect(lockRequests).toEqual(['auth-refresh'])
    expect(depths).toEqual([1])
  })

  it('refreshes inside the lock when triggered by a 401', async () => {
    const depths: number[] = []
    fetchMock.mockImplementation((url: string) => {
      depths.push(lockDepth)
      if (url.endsWith('/auth/refresh')) return Promise.resolve(jsonResponse(200, { token: 'n' }))
      return Promise.resolve(
        depths.length === 1 ? problem(401, 'token_invalid') : jsonResponse(200, {}),
      )
    })
    await client.apiRequest('/me')
    expect(depths).toEqual([0, 1, 0])
  })

  it('still calls refresh inside the lock when the token is already set', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { token: 't' }))
    token = 'present'
    await client.refreshSession()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('works without navigator.locks', async () => {
    Reflect.deleteProperty(navigator, 'locks')
    fetchMock.mockResolvedValue(jsonResponse(200, { token: 'no-lock' }))
    await expect(client.refreshSession()).resolves.toBe('no-lock')
    expect(setTokenCalls).toEqual(['no-lock'])
    expect(lockRequests).toEqual([])
  })
})
