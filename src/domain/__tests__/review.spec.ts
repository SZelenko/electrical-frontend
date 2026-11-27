import { describe, expect, it } from 'vitest'
import { simplifyRoute } from '../autoRoute'
import { addInputCable, addRail, updateInputCable, updateRail, type Rejection } from '../commands'
import { MAX_COORD_U, SPACING_RULE, VOLTAGE_RULE, checkDecimal, roundTo } from '../limits'
import type { PanelContent } from '../panelContent'
import { removeBend, type WirePath } from '../routes'
import {
  buildWorld,
  content,
  cw,
  element,
  id,
  inputCable,
  pole,
  rail,
  rejection,
  run,
  addAuto,
} from './helpers'

const p = (x: number, y: number) => ({ x, y })
const world = buildWorld()

describe('decimal parity with the backend (tolerance 1e-9, values stored rounded)', () => {
  it.each([
    [150.00000001, SPACING_RULE],
    [99.90000001, SPACING_RULE],
    [230.00000001, VOLTAGE_RULE],
  ])('rejects %d (more than 1e-9 away from the grid)', (value, rule) => {
    expect(checkDecimal(value, rule)).not.toBeNull()
  })

  it.each([
    [150.0000000001, SPACING_RULE],
    [230.0000000001, VOLTAGE_RULE],
  ])('accepts %d (float noise below 1e-9)', (value, rule) => {
    expect(checkDecimal(value, rule)).toBeNull()
  })

  it('roundTo rounds to the scale', () => {
    expect(roundTo(150.0000000001, 1)).toBe(150)
    expect(roundTo(0.1 + 0.2, 1)).toBe(0.3)
  })

  it('addRail rejects 150.00000001 mm and stores 150.0000000001 as 150', () => {
    expect(rejection(addRail({ id: id(12), spacingMm: 150.00000001 })(world))).toBe('invalid')
    const out = run(world, addRail({ id: id(12), spacingMm: 150.0000000001 })).content
    expect(out.rails[2]?.spacingMm).toBe(150)
  })

  it('updateRail rejects 150.00000001 mm and stores the rounded value otherwise', () => {
    expect(rejection(updateRail(id(10), { spacingMm: 160.00000001 })(world))).toBe('invalid')
    const out = run(world, updateRail(id(10), { spacingMm: 160.0000000001 })).content
    expect(out.rails[0]?.spacingMm).toBe(160)
  })

  it('addInputCable and updateInputCable reject 230.00000001 V and store rounded values', () => {
    expect(rejection(addInputCable({ ...inputCable(6, [7]), voltage: 230.00000001 })(world))).toBe(
      'invalid',
    )
    const added = run(
      world,
      addInputCable({ ...inputCable(6, [7]), voltage: 400.0000000001, frequency: 50.0000000001 }),
    ).content
    expect(added.inputCables[1]).toMatchObject({ voltage: 400, frequency: 50 })
    expect(rejection(updateInputCable(id(1), { voltage: 230.00000001 })(world))).toBe('invalid')
    const updated = run(world, updateInputCable(id(1), { voltage: 400.0000000001 })).content
    expect(updated.inputCables[0]?.voltage).toBe(400)
  })
})

describe('drawing range (reason limit, detail coordinates)', () => {
  const limitCoordinates = (outcome: ReturnType<ReturnType<typeof addRail>>) =>
    outcome.ok ? null : { reason: outcome.reason as Rejection, detail: outcome.detail }

  it('addRail rejects a spacing that pushes the drawing past 99999.9 mm', () => {
    expect(limitCoordinates(addRail({ id: id(12), spacingMm: 99999.9 })(world))).toEqual({
      reason: 'limit',
      detail: 'coordinates',
    })
  })

  it('addRail accepts a big spacing that still fits', () => {
    expect(rejection(addRail({ id: id(12), spacingMm: 99000 })(content()))).toBeNull()
  })

  it('updateRail rejects a spacing that pushes the drawing past the range', () => {
    expect(limitCoordinates(updateRail(id(10), { spacingMm: 99999.9 })(world))).toEqual({
      reason: 'limit',
      detail: 'coordinates',
    })
  })

  it('several rails that sum past the range are rejected on the first rail that does not fit', () => {
    let c: PanelContent = content()
    let accepted = 0
    let last: ReturnType<ReturnType<typeof addRail>> | null = null
    for (let i = 0; i < 8; i++) {
      last = addRail({ id: id(100 + i), spacingMm: 20000 })(c)
      if (!last.ok) break
      c = last.content
      accepted++
    }
    expect(accepted).toBe(4) // 4 x 200000 u still fits, the 5th does not
    expect(last).toMatchObject({ ok: false, reason: 'limit', detail: 'coordinates' })
  })

  it('the 99999.9 mm limit equals MAX_COORD_U in tenths', () => {
    expect(MAX_COORD_U).toBe(999999)
  })

  it('addWire rejects an automatic route whose bends leave the coordinate range', () => {
    // a rail whose centre line is past the range (built directly, bypassing the rail commands)
    const far = content({
      inputCables: [inputCable(1, [2, 3])],
      rails: [rail(10, 24, 99999.9, [element(20, 0, 2, 2)])],
    })
    const out = addAuto(30, cw(id(2)), pole(id(20), 0, 'output'))(far)
    expect(out).toMatchObject({ ok: false, reason: 'limit', detail: 'coordinates' })
  })
})

describe('simplifyRoute keeps backtracks', () => {
  it('keeps a bend where the route turns back on itself on the same line', () => {
    expect(simplifyRoute(p(0, 0), [p(0, 10), p(0, 5)], p(0, 20))).toEqual([p(0, 10), p(0, 5)])
  })

  it('still drops a collinear point that continues in the same direction', () => {
    expect(simplifyRoute(p(0, 0), [p(0, 5), p(0, 10)], p(0, 20))).toEqual([])
  })

  it('keeps a horizontal backtrack as well', () => {
    expect(simplifyRoute(p(0, 0), [p(10, 0), p(4, 0)], p(20, 0))).toEqual([p(10, 0), p(4, 0)])
  })
})

describe('removeBend propagates the alignment to the following bends', () => {
  const stairs: WirePath = {
    start: p(300, 450),
    end: p(638, 1650),
    bends: [p(300, 700), p(500, 700), p(500, 900), p(638, 900), p(638, 1200)],
  }

  it('removing a middle bend re-aligns every later bend and stays orthogonal', () => {
    expect(removeBend(stairs, 1)).toEqual([p(300, 700), p(500, 700), p(500, 900), p(638, 900)])
  })

  it('returns null when the remaining terminals cannot be joined orthogonally', () => {
    const twoBends: WirePath = {
      start: p(300, 450),
      end: p(638, 1650),
      bends: [p(300, 1050), p(638, 1050)],
    }
    expect(removeBend(twoBends, 0)).toBeNull()
  })

  it('removing the last bend moves the previous one onto the terminal line (an L-shape)', () => {
    const twoBends: WirePath = {
      start: p(300, 450),
      end: p(638, 1650),
      bends: [p(300, 1050), p(638, 1050)],
    }
    expect(removeBend(twoBends, 1)).toEqual([p(300, 1650)])
  })

  it('does not mutate the path', () => {
    const snapshot = structuredClone(stairs)
    removeBend(stairs, 1)
    expect(stairs).toEqual(snapshot)
  })
})
