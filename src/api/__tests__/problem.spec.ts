import { describe, expect, it } from 'vitest'
import { ApiError, networkError, parseProblem, parseRetryAfter } from '../problem'

const CATALOGUE: [number, string][] = [
  [401, 'invalid_credentials'],
  [403, 'email_not_verified'],
  [422, 'invalid_code'],
  [401, 'two_factor_restart'],
  [429, 'rate_limited'],
  [401, 'token_invalid'],
  [403, 'password_confirmation_failed'],
]

describe('parseProblem', () => {
  it('maps an API Platform /validation_errors/<uuid> 422 to field violations', () => {
    const error = parseProblem(422, {
      type: '/validation_errors/abc-123',
      violations: [{ propertyPath: 'name', message: 'bad' }],
    })
    expect(error.type).toBe('validation')
    expect(error.violations).toEqual({ name: ['bad'] })
  })

  it('treats a 429 without a known type as rate_limited with Retry-After', () => {
    const error = parseProblem(429, {}, '12')
    expect(error.type).toBe('rate_limited')
    expect(error.retryAfter).toBe(12)
  })

  it.each(CATALOGUE)('maps %i %s to a typed error', (status, type) => {
    const error = parseProblem(status, { type, detail: 'x' })
    expect(error).toBeInstanceOf(ApiError)
    expect(error.type).toBe(type)
    expect(error.status).toBe(status)
    expect(error.message).toBe('x')
  })

  it('maps a 422 with violations to "validation" and groups them by property path', () => {
    const error = parseProblem(422, {
      title: 'Validation',
      violations: [
        { propertyPath: 'email', message: 'bad' },
        { propertyPath: 'email', message: 'taken' },
        { propertyPath: 'password', message: 'weak' },
      ],
    })
    expect(error.type).toBe('validation')
    expect(error.violations).toEqual({ email: ['bad', 'taken'], password: ['weak'] })
    expect(error.message).toBe('Validation')
  })

  it('skips malformed violation items', () => {
    const error = parseProblem(422, {
      violations: [
        { propertyPath: 'a' },
        null,
        'x',
        { propertyPath: 1, message: 'm' },
        { propertyPath: 'ok', message: 'm' },
      ],
    })
    expect(error.violations).toEqual({ ok: ['m'] })
    expect(error.type).toBe('validation')
  })

  it('keeps a catalogue type on 422 even if violations exist', () => {
    const error = parseProblem(422, {
      type: 'invalid_code',
      violations: [{ propertyPath: 'code', message: 'm' }],
    })
    expect(error.type).toBe('invalid_code')
  })

  it.each([
    ['unknown type string', 500, { type: 'something_else' }],
    ['422 without violations', 422, {}],
    ['non-object body', 500, 'oops'],
    ['array body', 500, []],
    ['undefined body', 502, undefined],
  ])('falls back to "unknown" for %s', (_name, status, body) => {
    const error = parseProblem(status, body)
    expect(error.type).toBe('unknown')
    expect(error.violations).toEqual({})
  })

  it('uses detail, then title, then the status as the message', () => {
    expect(parseProblem(500, { detail: 'd', title: 't' }).message).toBe('d')
    expect(parseProblem(500, { title: 't' }).message).toBe('t')
    expect(parseProblem(500, {}).message).toBe('HTTP 500')
  })

  it('parses Retry-After into retryAfter', () => {
    expect(parseProblem(429, { type: 'rate_limited' }, '42').retryAfter).toBe(42)
    expect(parseProblem(429, { type: 'rate_limited' }).retryAfter).toBeNull()
  })
})

describe('parseRetryAfter', () => {
  it.each([
    ['30', 30],
    [' 7 ', 7],
    ['0', 0],
    [null, null],
    ['', null],
    ['soon', null],
    ['-5', null],
    ['1.5', null],
    ['Wed, 21 Oct 2026 07:28:00 GMT', null],
  ])('parses %j as %j', (input, expected) => {
    expect(parseRetryAfter(input)).toBe(expected)
  })
})

describe('networkError', () => {
  it('has status 0 and type network', () => {
    const error = networkError()
    expect(error.status).toBe(0)
    expect(error.type).toBe('network')
  })
})

describe('panel problem types', () => {
  it.each([
    [409, 'panel_name_conflict'],
    [409, 'panel_version_conflict'],
    [409, 'panel_not_in_trash'],
    [409, 'panel_content_id_conflict'],
  ])('maps %i %s to a typed error', (status, type) => {
    const error = parseProblem(status, { type, detail: 'd' })
    expect(error.type).toBe(type)
    expect(error.status).toBe(status)
  })

  it('reads currentVersion from a version conflict', () => {
    expect(
      parseProblem(409, { type: 'panel_version_conflict', currentVersion: 7 }).currentVersion,
    ).toBe(7)
  })

  it.each([[undefined], ['7'], [null]])('ignores a non-numeric currentVersion %j', (value) => {
    expect(
      parseProblem(409, { type: 'panel_version_conflict', currentVersion: value }).currentVersion,
    ).toBeNull()
  })

  it('maps validation_error with violations to validation and groups them', () => {
    const error = parseProblem(422, {
      type: 'validation_error',
      violations: [{ propertyPath: 'name', message: 'Too long' }],
    })
    expect(error.type).toBe('validation')
    expect(error.violations).toEqual({ name: ['Too long'] })
  })

  it('maps validation_error without violations to validation with none', () => {
    const error = parseProblem(422, { type: 'validation_error' })
    expect(error.type).toBe('validation')
    expect(error.violations).toEqual({})
  })
})
