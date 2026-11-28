/**
 * Every client violation carries the backend's stable code and parameters (`panel-domain`,
 * "Violation codes"), so the SPA can translate it. Success: the right code and parameters for the
 * rule; Error side: valid content produces none.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { PanelContent } from '../panelContent'
import { validateContent, type Violation } from '../validateContent'
import {
  block,
  busbar,
  content,
  cw,
  element,
  id,
  panelWire,
  pole,
  rail,
  rowBlock,
  term,
  ats,
} from './helpers'

const dev = (n: number, offset: number, over = {}) => element(n, offset, 1, 2, over)
const summary = (c: PanelContent) =>
  validateContent(c).map((v: Violation) => [v.propertyPath, v.code, v.parameters])

describe('validateContent emits code and parameters', () => {
  it('accepts valid content with no violations at all', () => {
    expect(validateContent(content())).toEqual([])
  })

  it.each(['top', 'bottom'] as const)('row.overlap carries the %s row', (row) => {
    const key = row === 'top' ? 'terminalRow' : 'bottomTerminalRow'
    const c = content({ [key]: [rowBlock(50, 0, 4), rowBlock(51, 1, 2)] })
    expect(summary(c)).toEqual([[`content.${key}[1].offsetModules`, 'row.overlap', { row }]])
  })

  it('row.does_not_fit carries the row', () => {
    const c = content({ railWidthModules: 10, bottomTerminalRow: [rowBlock(50, 10, 2)] })
    expect(summary(c)).toContainEqual([
      'content.bottomTerminalRow[0].offsetModules',
      'row.does_not_fit',
      { row: 'bottom' },
    ])
  })

  it('value.out_of_range carries min and max (rail width)', () => {
    expect(summary(content({ railWidthModules: 61 }))).toEqual([
      ['content.railWidthModules', 'value.out_of_range', { min: 1, max: 60 }],
    ])
  })

  it('value.too_long carries max (cable label)', () => {
    const c = content()
    c.inputCables[0]!.label = 'x'.repeat(17)
    expect(summary(c)).toEqual([['content.inputCables[0].label', 'value.too_long', { max: 16 }]])
  })

  it('id.invalid has no parameters', () => {
    const bad = rail(10, 24, 150, [])
    bad.id = 'x'
    const c = content({ rails: [bad] })
    expect(summary(c)[0]).toEqual([expect.stringContaining('.id'), 'id.invalid', {}])
  })

  it('busbar.gap has no parameters', () => {
    const c = content({
      rails: [
        rail(10, 24, 150, [dev(20, 0), dev(21, 1), dev(22, 3)], [], [busbar(60, 'L', id(21), 2)]),
      ],
    })
    expect(summary(c)).toEqual([['content.rails[0].busbars[0].count', 'busbar.gap', {}]])
  })

  it('busbar.too_few carries count', () => {
    const c = content({
      rails: [rail(10, 24, 150, [dev(20, 0), dev(21, 1)], [], [busbar(60, 'L', id(21), 2)])],
    })
    expect(summary(c)).toEqual([
      ['content.rails[0].busbars[0].count', 'busbar.too_few', { count: 2 }],
    ])
  })

  it('busbar.foreign_item is reported when an ATS is in the way', () => {
    const c = content({
      rails: [rail(10, 24, 150, [dev(20, 0), ats(21, 1, 2)], [], [busbar(60, 'L', id(20), 2)])],
    })
    expect(summary(c).map((s) => s[1])).toEqual(['busbar.foreign_item'])
  })

  it('device.pole_count carries max and perModule', () => {
    const c = content({ rails: [rail(10, 24, 150, [element(20, 0, 1, 5)])] })
    expect(summary(c)).toEqual([
      ['content.rails[0].elements[0].poles', 'device.pole_count', { max: 4, perModule: 4 }],
    ])
  })

  it('ats.too_narrow carries min', () => {
    const c = content({ rails: [rail(10, 24, 150, [ats(20, 0, 1)])] })
    expect(summary(c)).toEqual([
      ['content.rails[0].elements[0].widthModules', 'ats.too_narrow', { min: 2 }],
    ])
  })

  it('endpoint.contact_side_row: a top/bottom side is required on a row block', () => {
    const c = content({
      terminalRow: [rowBlock(50, 0, 2)],
      rails: [rail(10, 24, 150, [dev(20, 0)])],
      wires: [panelWire(60, cw(id(2)), term(id(50), 0, 'left'))],
    })
    expect(summary(c)).toEqual([
      ['content.wires[0].end.contactSide', 'endpoint.contact_side_row', {}],
    ])
  })

  it('endpoint.contact_side_rail: a left/right side is required on a rail block', () => {
    const c = content({
      rails: [rail(10, 24, 150, [dev(20, 0)], [block(40, 3, 1, 2)])],
      wires: [panelWire(60, cw(id(2)), term(id(40), 0, 'top'))],
    })
    expect(summary(c)).toEqual([
      ['content.wires[0].end.contactSide', 'endpoint.contact_side_rail', {}],
    ])
  })

  it('endpoint.element_unknown: a wire to a missing element', () => {
    const c = content({ wires: [panelWire(60, cw(id(2)), pole(id(99), 0))] })
    expect(summary(c).map((s) => s[1])).toEqual(['endpoint.element_unknown'])
  })

  it('wire.same_ends has no parameters', () => {
    const c = content({ wires: [panelWire(60, cw(id(2)), cw(id(2)))] })
    expect(summary(c)).toContainEqual([expect.any(String), 'wire.same_ends', {}])
  })

  it('keeps the English message next to the code', () => {
    const [v] = validateContent(content({ railWidthModules: 0 }))
    expect(v).toMatchObject({ code: 'value.out_of_range', message: 'Must be between 1 and 60.' })
  })
})

describe('emitted codes match the shared fixture', () => {
  const fixture = JSON.parse(
    readFileSync(resolve(process.cwd(), '../shared/fixtures/violation-codes.json'), 'utf8'),
  ) as Record<string, string[]>

  it('every code literal in the validator sources is in the fixture', () => {
    const literal = /'([a-z][a-z_]*\.[a-z][a-z_]*)'/g
    const found = new Set<string>()
    for (const file of ['validateContent.ts', 'limits.ts', 'busbars.ts']) {
      const source = readFileSync(resolve(process.cwd(), 'src/domain', file), 'utf8')
      for (const m of source.matchAll(literal)) if (!m[1]!.startsWith('content.')) found.add(m[1]!)
    }
    // 'content.*' literals are property paths, not codes
    const unknown = [...found].filter((c) => !(c in fixture))
    expect(unknown).toEqual([])
    expect(found.size).toBeGreaterThan(20)
  })

  it('violations produced for representative rules use exactly the fixture parameter names', () => {
    const c = content({
      railWidthModules: 61,
      terminalRow: [rowBlock(50, 0, 4), rowBlock(51, 1, 2)],
      rails: [
        rail(10, 24, 150, [element(20, 0, 1, 5), ats(21, 1, 1)], [], [busbar(60, 'L', id(20), 2)]),
      ],
    })
    c.inputCables[0]!.label = 'x'.repeat(17)
    c.inputCables[0]!.voltage = 0
    const violations = validateContent(c)
    expect(violations.length).toBeGreaterThan(4)
    for (const v of violations) {
      expect(fixture).toHaveProperty([v.code])
      expect(Object.keys(v.parameters).sort()).toEqual(fixture[v.code])
    }
  })
})
