// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from '../en.json'
import uk from '../uk.json'

type Tree = { [key: string]: string | Tree }

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === 'string') out.set(`${prefix}${key}`, value)
    else for (const [k, v] of flatten(value, `${prefix}${key}.`)) out.set(k, v)
  }
  return out
}

const ukFlat = flatten(uk as Tree)
const enFlat = flatten(en as Tree)

const placeholders = (message: string) =>
  [...new Set([...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort()
const forms = (message: string) => message.split(' | ').length

/** `shared/fixtures/violation-codes.json`: code -> sorted parameter names (shared with the backend). */
const CODES = JSON.parse(
  readFileSync(resolve(process.cwd(), '../shared/fixtures/violation-codes.json'), 'utf8'),
) as Record<string, string[]>
const CODE_LIST = Object.keys(CODES)

describe('locale files: key parity', () => {
  it('uk and en have exactly the same key set', () => {
    const onlyUk = [...ukFlat.keys()].filter((k) => !enFlat.has(k))
    const onlyEn = [...enFlat.keys()].filter((k) => !ukFlat.has(k))
    expect({ onlyUk, onlyEn }).toEqual({ onlyUk: [], onlyEn: [] })
  })

  it('has no empty messages', () => {
    const empty = [...ukFlat, ...enFlat].filter(([, v]) => v.trim() === '').map(([k]) => k)
    expect(empty).toEqual([])
  })

  it('every key has the same placeholders in uk and en', () => {
    const mismatches = [...ukFlat]
      .filter(([key, value]) => {
        const other = enFlat.get(key)
        return other !== undefined && placeholders(value).join() !== placeholders(other).join()
      })
      .map(([key]) => key)
    expect(mismatches).toEqual([])
  })

  it('detects a placeholder mismatch (the check itself)', () => {
    expect(placeholders('Max {max} of {min}')).not.toEqual(placeholders('Max {max}'))
    expect(placeholders('{n} a | {n} b')).toEqual(['n'])
  })
})

describe('locale files: plurals', () => {
  const pluralKeys = [...ukFlat].filter(([, v]) => v.includes(' | ')).map(([k]) => k)

  it('has plural messages at all', () => {
    expect(pluralKeys.length).toBeGreaterThan(0)
  })

  it.each(pluralKeys)('%s has 3 forms in uk and 2 in en', (key) => {
    expect(forms(ukFlat.get(key)!)).toBe(3)
    expect(forms(enFlat.get(key)!)).toBe(2)
  })

  it('a message is a plural in en only if it is one in uk', () => {
    const enPlural = [...enFlat].filter(([, v]) => v.includes(' | ')).map(([k]) => k)
    expect(enPlural.sort()).toEqual([...pluralKeys].sort())
  })
})

describe('locale files: violation codes', () => {
  it.each(CODE_LIST)('has violations.%s in uk and en', (code) => {
    expect(ukFlat.get(`violations.${code}`)?.length).toBeGreaterThan(0)
    expect(enFlat.get(`violations.${code}`)?.length).toBeGreaterThan(0)
  })

  it('the fixture is not empty and has the codes of every area', () => {
    expect(CODE_LIST.length).toBeGreaterThan(50)
    expect(CODE_LIST).toContain('endpoint.shape')
  })

  it.each(CODE_LIST)('%s: both translations use exactly the code parameters', (code) => {
    const expected = [...CODES[code]!].sort()
    expect(placeholders(ukFlat.get(`violations.${code}`) ?? '')).toEqual(expected)
    expect(placeholders(enFlat.get(`violations.${code}`) ?? '')).toEqual(expected)
  })

  it('has no violation message without a code in the list (stale key)', () => {
    const stale = [...ukFlat.keys()]
      .filter((k) => k.startsWith('violations.'))
      .map((k) => k.slice('violations.'.length))
      .filter((code) => !CODE_LIST.includes(code))
    expect(stale).toEqual([])
  })

  it('a code missing from a locale would be caught', () => {
    expect(ukFlat.has('violations.no.such_code')).toBe(false)
  })
})
