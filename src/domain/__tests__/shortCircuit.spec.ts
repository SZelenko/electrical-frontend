import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeContent } from '@/api/panels'
import { checkShortCircuits } from '../shortCircuit'
import { validateContent } from '../validateContent'

interface FixtureCase {
  name: string
  panel: Parameters<typeof normalizeContent>[0]
  expected: {
    valid: boolean
    groups?: { sources: string[]; wireIds: string[] }[]
    violations?: string[]
  }
}

// Tests run from the project root: shared/ is /var/www/shared in the pod (app at /var/www/app) and the repo-root sibling on the host.
const file = resolve(process.cwd(), '../shared/fixtures/short-circuit-cases.json')
const cases = (JSON.parse(readFileSync(file, 'utf8')) as { cases: FixtureCase[] }).cases

describe('shared short-circuit cases', () => {
  it.each(cases.filter((c) => c.expected.valid).map((c) => [c.name, c] as const))(
    '%s',
    (_name, c) => {
      const content = normalizeContent(c.panel)
      expect(validateContent(content)).toEqual([])
      const groups = checkShortCircuits(content)
      expect(
        groups.map((g) => ({ sources: new Set(g.sources), wireIds: new Set(g.wireIds) })),
      ).toEqual(
        (c.expected.groups ?? []).map((g) => ({
          sources: new Set(g.sources),
          wireIds: new Set(g.wireIds),
        })),
      )
    },
  )

  it.each(cases.filter((c) => !c.expected.valid).map((c) => [c.name, c] as const))(
    'rejects %s with the expected property paths',
    (_name, c) => {
      const paths = validateContent(normalizeContent(c.panel)).map((v) => v.propertyPath)
      expect(paths).toEqual(c.expected.violations)
    },
  )
})
