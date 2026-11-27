// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { safeRedirect } from '../redirect'

describe('safeRedirect', () => {
  it.each([
    ['/', '/'],
    ['/account', '/account'],
    ['/panels/1?x=2#h', '/panels/1?x=2#h'],
  ])('keeps same-origin path %s', (input, expected) => {
    expect(safeRedirect(input)).toBe(expected)
  })

  it.each([
    ['https://evil.example/'],
    ['http://evil.example'],
    ['//evil.example'],
    ['///evil.example'],
    ['/\\evil.example'],
    ['\\\\evil.example'],
    ['javascript:alert(1)'],
    ['account'],
    [''],
    [null],
    [undefined],
    [42],
    [['/a']],
  ])('falls back to "/" for %j', (input) => {
    expect(safeRedirect(input)).toBe('/')
  })
})
