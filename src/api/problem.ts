import type { components } from './schema'

/** RFC 7807 `type` values of the auth error catalogue (see the AuthProblem schema). */
export type AuthProblemType = components['schemas']['AuthProblem']['type']

/** Problem types of the panel endpoints (not part of the generated AuthProblem schema). */
export type PanelProblemType =
  | 'panel_name_conflict'
  | 'panel_version_conflict'
  | 'panel_not_in_trash'
  | 'panel_content_id_conflict'

export type ApiErrorType = AuthProblemType | PanelProblemType | 'validation' | 'network' | 'unknown'

const AUTH_PROBLEM_TYPES: readonly string[] = [
  'invalid_credentials',
  'email_not_verified',
  'invalid_code',
  'two_factor_restart',
  'rate_limited',
  'token_invalid',
  'password_confirmation_failed',
] satisfies AuthProblemType[]

const PANEL_PROBLEM_TYPES: readonly string[] = [
  'panel_name_conflict',
  'panel_version_conflict',
  'panel_not_in_trash',
  'panel_content_id_conflict',
] satisfies PanelProblemType[]

export class ApiError extends Error {
  readonly status: number
  readonly type: ApiErrorType
  /** Violation messages keyed by property path (API Platform 422). */
  readonly violations: Record<string, string[]>
  /** Seconds from the `Retry-After` header (429). */
  readonly retryAfter: number | null
  /** Current panel version carried by `panel_version_conflict`. */
  readonly currentVersion: number | null

  constructor(init: {
    status: number
    type: ApiErrorType
    message: string
    violations?: Record<string, string[]>
    retryAfter?: number | null
    currentVersion?: number | null
  }) {
    super(init.message)
    this.name = 'ApiError'
    this.status = init.status
    this.type = init.type
    this.violations = init.violations ?? {}
    this.retryAfter = init.retryAfter ?? null
    this.currentVersion = init.currentVersion ?? null
  }
}

/** Parses a `Retry-After` header holding delta-seconds; HTTP dates are not used by the API. */
export function parseRetryAfter(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value.trim())) return null
  return Number(value.trim())
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Groups API Platform `violations` by property path. */
export function parseViolations(body: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {}
  if (!isRecord(body) || !Array.isArray(body.violations)) return result
  for (const item of body.violations) {
    if (
      !isRecord(item) ||
      typeof item.propertyPath !== 'string' ||
      typeof item.message !== 'string'
    )
      continue
    ;(result[item.propertyPath] ??= []).push(item.message)
  }
  return result
}

/** Builds a typed error from an HTTP error response. `body` is the parsed JSON (or undefined). */
export function parseProblem(
  status: number,
  body: unknown,
  retryAfterHeader: string | null = null,
): ApiError {
  const record = isRecord(body) ? body : {}
  const rawType = typeof record.type === 'string' ? record.type : ''
  const violations = parseViolations(body)
  let type: ApiErrorType = 'unknown'
  if (AUTH_PROBLEM_TYPES.includes(rawType)) type = rawType as AuthProblemType
  else if (PANEL_PROBLEM_TYPES.includes(rawType)) type = rawType as PanelProblemType
  else if (
    rawType === 'validation_error' ||
    rawType.startsWith('/validation_errors/') ||
    (status === 422 && Object.keys(violations).length > 0)
  )
    type = 'validation'
  else if (status === 429) type = 'rate_limited'
  const detail =
    typeof record.detail === 'string'
      ? record.detail
      : typeof record.title === 'string'
        ? record.title
        : `HTTP ${status}`
  return new ApiError({
    status,
    type,
    message: detail,
    violations,
    retryAfter: parseRetryAfter(retryAfterHeader),
    currentVersion: typeof record.currentVersion === 'number' ? record.currentVersion : null,
  })
}

export function networkError(): ApiError {
  return new ApiError({ status: 0, type: 'network', message: 'Network error' })
}
