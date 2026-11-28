/** The frozen `layoutVersion` 1 formulas: regression values in tenths of a millimetre, derived by hand. */
import { describe, expect, it } from 'vitest'
import { computeLayout, endpointPoint } from '../geometry'
import { computeLayoutV1 } from '../geometryV1'
import { content, cw, id, inputCable, outputCable, rail } from './helpers'

// v1: MARGIN 200, box 250 deep, pad 50, pitch 100 (length 100 + 100 n), gap 100, row gap 150

describe('computeLayoutV1: default sides (inputs top, outputs bottom)', () => {
  const c = content({
    layoutVersion: 1,
    railWidthModules: 24,
    inputCables: [inputCable(1, [2, 3])], // 300 long
    outputCables: [outputCable(4, [5])], // 200 long
    rails: [rail(10, 24, 150)],
  })
  const l = computeLayoutV1(c)

  it.each([
    ['railsLeft', l.railsLeft, 200],
    ['topRowY', l.topRowY, 600],
    ['railsTop', l.railsTop, 1000],
    ['rail cy', l.rails[0]?.cy, 2500],
    ['output band top (box y)', l.outputBoxes[0]?.y, 3100],
    ['bottomRowY', l.bottomRowY, 3500],
    ['height', l.height, 3500 + 250 + 200],
    ['width', l.width, 200 + 200 + 24 * 175],
  ])('%s = %i', (_n, actual, expected) => expect(actual).toBe(expected))

  it('boxes and wire points (pitch 10 mm, pad 5 mm)', () => {
    expect(l.inputBoxes[0]).toMatchObject({ x: 200, y: 200, w: 300, h: 250, side: 'top' })
    expect(endpointPoint(l, cw(id(2)))).toEqual({ x: 300, y: 450 })
    expect(endpointPoint(l, cw(id(3)))).toEqual({ x: 400, y: 450 })
    expect(l.outputBoxes[0]).toMatchObject({ x: 200, y: 3100, w: 200, h: 250, side: 'bottom' })
    expect(endpointPoint(l, cw(id(5)))).toEqual({ x: 300, y: 3100 })
  })

  it('differs from the current layout of the same content', () => {
    const now = computeLayout({ ...c, layoutVersion: 2 })
    expect(now.railsTop).toBe(850)
    expect(endpointPoint(now, cw(id(2)))).toEqual({ x: 100, y: 300 })
  })
})

describe('computeLayoutV1: inputs and outputs in one left column', () => {
  const l = computeLayoutV1(
    content({
      layoutVersion: 1,
      railWidthModules: 24,
      inputCableSide: 'left',
      outputCableSide: 'left',
      inputCables: [inputCable(1, [2, 3])],
      outputCables: [outputCable(4, [5])],
      rails: [rail(10, 24, 100)],
    }),
  )

  it.each([
    ['railsLeft', l.railsLeft, 600],
    ['topRowY', l.topRowY, 200],
    ['railsTop', l.railsTop, 600],
    ['bottomRowY', l.bottomRowY, 2200],
    ['height', l.height, 2200 + 250 + 200],
    ['width', l.width, 200 + 600 + 24 * 175],
  ])('%s = %i', (_n, actual, expected) => expect(actual).toBe(expected))

  it('boxes follow each other with a gap, wire points on the right edge', () => {
    expect(l.inputBoxes[0]).toMatchObject({ x: 200, y: 600, w: 250, h: 300 })
    expect(l.outputBoxes[0]).toMatchObject({ x: 200, y: 1000, w: 250, h: 200 })
    expect(endpointPoint(l, cw(id(2)))).toEqual({ x: 450, y: 700 })
    expect(endpointPoint(l, cw(id(3)))).toEqual({ x: 450, y: 800 })
    expect(endpointPoint(l, cw(id(5)))).toEqual({ x: 450, y: 1100 })
  })
})

describe('computeLayoutV1: right column, no rails', () => {
  const l = computeLayoutV1(
    content({
      layoutVersion: 1,
      railWidthModules: 10,
      inputCableSide: 'right',
      inputCables: [inputCable(1, [2, 3])],
    }),
  )

  it('values', () => {
    expect(l.inputBoxes[0]).toMatchObject({ x: 2100, y: 600, w: 250, h: 300, side: 'right' })
    expect(endpointPoint(l, cw(id(2)))).toEqual({ x: 2100, y: 700 })
    expect(l.width).toBe(200 + 1950 + 150 + 250)
    // sideBottom = the column bottom 900; no bottom cables: bottomRowY = sideBottom + CABLE_ROW_GAP
    expect(l.bottomRowY).toBe(900 + 150)
    expect(l.height).toBe(1050 + 250 + 200)
  })

  it('the input side margin is MARGIN (20 mm), not SHEET_INSET', () => {
    expect(l.inputBoxes[0]?.y).not.toBe(50)
  })
})
