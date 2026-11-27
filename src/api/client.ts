import { ApiError, networkError, parseProblem } from './problem'

/** Callbacks wired by the auth store; keeps this module free of store imports. */
export interface AuthHooks {
  getToken(): string | null
  setToken(token: string | null): void
  /** Refresh was rejected while serving a protected call: the user must log in again. */
  onSessionLost(): void
}

const AUTH_PREFIX = '/auth/'
/** Only these endpoints may receive/set the refresh cookie (CORS allows credentials only there). */
const CREDENTIAL_PATHS: readonly string[] = [
  '/auth/login',
  '/auth/2fa',
  '/auth/refresh',
  '/auth/logout',
]

let hooks: AuthHooks = { getToken: () => null, setToken: () => {}, onSessionLost: () => {} }

export function configureApi(value: AuthHooks): void {
  hooks = value
}

export interface ApiResponse<T> {
  status: number
  data: T
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  contentType?: string
  /** Value of the `Accept` header; defaults to `application/json`. */
  accept?: string
}

export function isAuthPath(path: string): boolean {
  return path.startsWith(AUTH_PREFIX)
}

async function send<T>(path: string, options: RequestOptions): Promise<ApiResponse<T>> {
  const auth = isAuthPath(path)
  const headers: Record<string, string> = { Accept: options.accept ?? 'application/json' }
  if (options.body !== undefined)
    headers['Content-Type'] = options.contentType ?? 'application/json'
  const token = hooks.getToken()
  if (!auth && token !== null) headers.Authorization = `Bearer ${token}`

  const init: RequestInit = { method: options.method ?? 'GET', headers }
  if (options.body !== undefined) init.body = JSON.stringify(options.body)
  if (CREDENTIAL_PATHS.includes(path)) init.credentials = 'include'

  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_API_URL}${path}`, init)
  } catch {
    throw networkError()
  }

  const text = await response.text()
  let data: unknown
  if (text !== '') {
    try {
      data = JSON.parse(text)
    } catch {
      data = undefined
    }
  }
  if (!response.ok) {
    throw parseProblem(response.status, data, response.headers.get('Retry-After'))
  }
  return { status: response.status, data: data as T }
}

let inflightRefresh: Promise<string> | null = null

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks
  return locks ? locks.request('auth-refresh', fn) : fn()
}

/**
 * Refreshes the access token. One in-flight call per tab; across tabs the Web Lock serialises
 * refreshes. The refresh endpoint is always called inside the lock (rotating single-use cookie).
 */
export function refreshSession(): Promise<string> {
  inflightRefresh ??= withLock(async () => {
    const { data } = await send<{ token: string }>('/auth/refresh', { method: 'POST' })
    hooks.setToken(data.token)
    return data.token
  }).finally(() => {
    inflightRefresh = null
  })
  return inflightRefresh
}

/** Typed API call: Bearer on non-auth paths, 401 token_invalid -> refresh -> one retry. */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  try {
    return await send<T>(path, options)
  } catch (error) {
    if (isAuthPath(path) || !(error instanceof ApiError) || error.type !== 'token_invalid') {
      throw error
    }
  }
  try {
    await refreshSession()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) hooks.onSessionLost()
    throw error
  }
  return send<T>(path, options)
}
