// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CODE_LENGTH, isCompleteCode, normalizeCode } from '../authCode'

describe('normalizeCode', () => {
  it.each([
    ['abcd1234', 'ABCD1234'],
    ['ab cd-12_34', 'ABCD1234'],
    ['  x ', 'X'],
    ['ABCDEFGHIJKL', 'ABCDEFGH'],
    ['', ''],
    ['!!!', ''],
    ['абвг1', '1'],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeCode(input)).toBe(expected)
  })

  it('never exceeds the code length', () => {
    expect(normalizeCode('a'.repeat(50))).toHaveLength(CODE_LENGTH)
  })
})

describe('isCompleteCode', () => {
  it.each(['ABCD1234', '00000000', 'ZZZZZZZZ'])('accepts %s', (code) => {
    expect(isCompleteCode(code)).toBe(true)
  })

  it.each(['', 'ABC1234', 'ABCD12345', 'abcd1234', 'ABCD 234', 'ABCD123!', 'ABCD1234\n'])(
    'rejects %j',
    (code) => {
      expect(isCompleteCode(code)).toBe(false)
    },
  )
})
