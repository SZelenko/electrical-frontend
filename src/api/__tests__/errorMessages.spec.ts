import { describe, expect, it } from 'vitest'
import { describeError } from '../errorMessages'
import { ApiError, type ApiErrorType } from '../problem'

function make(type: ApiErrorType, retryAfter: number | null = null) {
  return new ApiError({ status: 400, type, message: 'm', retryAfter })
}

const TYPES: ApiErrorType[] = [
  'invalid_credentials',
  'email_not_verified',
  'invalid_code',
  'two_factor_restart',
  'rate_limited',
  'token_invalid',
  'password_confirmation_failed',
  'panel_name_conflict',
  'panel_version_conflict',
  'panel_not_in_trash',
  'panel_content_id_conflict',
  'validation',
  'network',
  'unknown',
]

describe('describeError', () => {
  it.each(TYPES)('returns a non-empty message for %s', (type) => {
    expect(describeError(make(type)).length).toBeGreaterThan(0)
  })

  it('gives each type a distinct message (rate_limited without seconds)', () => {
    const messages = TYPES.map((t) => describeError(make(t)))
    expect(new Set(messages).size).toBe(TYPES.length)
  })

  it('mentions the wait time for rate_limited with seconds', () => {
    expect(describeError(make('rate_limited', 42))).toContain('42')
  })

  it('omits a number for rate_limited without seconds', () => {
    expect(describeError(make('rate_limited'))).not.toMatch(/\d/)
  })

  it('includes 0 seconds when the header says 0', () => {
    expect(describeError(make('rate_limited', 0))).toContain('0')
  })
})
