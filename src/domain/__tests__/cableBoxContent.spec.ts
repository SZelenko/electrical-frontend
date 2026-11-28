/** Cable box content: anchors, text fitting, point radii (panel-domain "Cable box content"). */
import { describe, expect, it } from 'vitest'
import {
  CABLE_CAPTION_DEPTH,
  CABLE_DOT_R,
  CABLE_HIT_R,
  CABLE_ICON_DEPTH,
  CABLE_LABEL_DEPTH,
  CABLE_TEXT_MIN_SIZE,
  CABLE_TEXT_SIZE,
  cableBoxContent,
  fitCableText,
} from '../cableBoxContent'
import { CABLE_BOX_H, CABLE_ICON, CABLE_LABEL_INSET, CABLE_PITCH, type CableBox } from '../geometry'
import type { CableSide } from '../panelContent'

const boxOf = (side: CableSide, x: number, y: number, len: number): CableBox => {
  const horizontal = side === 'top' || side === 'bottom'
  return {
    id: 'b',
    kind: 'input',
    side,
    index: 0,
    line: 0,
    load: null,
    label: '',
    x,
    y,
    w: horizontal ? len : CABLE_BOX_H,
    h: horizontal ? CABLE_BOX_H : len,
    wires: [],
  }
}

describe('constants', () => {
  it('match the contract', () => {
    expect([CABLE_ICON_DEPTH, CABLE_CAPTION_DEPTH, CABLE_LABEL_DEPTH]).toEqual([20, 120, 170])
    expect([CABLE_TEXT_SIZE, CABLE_TEXT_MIN_SIZE, CABLE_ICON, CABLE_LABEL_INSET]).toEqual([
      35, 18, 50, 15,
    ])
  })

  it('wire points: dot radius <= 18, hit radius <= 25, neighbours (5 mm apart) never overlap', () => {
    expect(CABLE_DOT_R).toBeLessThanOrEqual(18)
    expect(CABLE_HIT_R).toBeLessThanOrEqual(25)
    expect(CABLE_DOT_R).toBeLessThanOrEqual(CABLE_HIT_R)
    expect(2 * CABLE_HIT_R).toBeLessThanOrEqual(CABLE_PITCH)
  })
})

describe('cableBoxContent: anchors measured from the outer edge', () => {
  // hand-derived: along-centre of a 150 long box, icon centre at +20 +25, caption +120, label +170
  it('top box: outer edge = top edge, texts centred in x', () => {
    const c = cableBoxContent(boxOf('top', 50, 50, 150))
    expect(c).toEqual({
      icon: { x: 125, y: 95 },
      caption: { x: 125, y: 170 },
      label: { x: 125, y: 220 },
      rotated: false,
      room: 120,
    })
  })

  it('bottom box: outer edge = bottom edge (depths grow upwards)', () => {
    const c = cableBoxContent(boxOf('bottom', 200, 2950, 100))
    // bottom edge 3200
    expect(c).toEqual({
      icon: { x: 250, y: 3155 },
      caption: { x: 250, y: 3080 },
      label: { x: 250, y: 3030 },
      rotated: false,
      room: 70,
    })
  })

  it('left box: outer edge = left edge, centred in y, rotated', () => {
    const c = cableBoxContent(boxOf('left', 50, 50, 150))
    expect(c).toEqual({
      icon: { x: 95, y: 125 },
      caption: { x: 170, y: 125 },
      label: { x: 220, y: 125 },
      rotated: true,
      room: 120,
    })
  })

  it('right box: outer edge = right edge (depths grow leftwards), rotated', () => {
    const c = cableBoxContent(boxOf('right', 4550, 50, 150))
    // right edge 4800
    expect(c).toEqual({
      icon: { x: 4755, y: 125 },
      caption: { x: 4680, y: 125 },
      label: { x: 4630, y: 125 },
      rotated: true,
      room: 120,
    })
  })

  it.each<CableSide>(['top', 'bottom', 'left', 'right'])(
    '%s: icon +45, caption +120, label +170 from the outer edge (wire edge at +250)',
    (side) => {
      const box = boxOf(side, 1000, 1000, 200)
      const c = cableBoxContent(box)
      const depth = (p: { x: number; y: number }) =>
        side === 'top'
          ? p.y - box.y
          : side === 'bottom'
            ? box.y + box.h - p.y
            : side === 'left'
              ? p.x - box.x
              : box.x + box.w - p.x
      expect(depth(c.icon)).toBe(45)
      expect(depth(c.caption)).toBe(120)
      expect(depth(c.label)).toBe(170)
      expect(depth(c.label)).toBeLessThan(CABLE_BOX_H)
    },
  )

  it('room is the box length minus the inset at both ends, per wire count', () => {
    expect(cableBoxContent(boxOf('top', 0, 0, 100)).room).toBe(70)
    expect(cableBoxContent(boxOf('top', 0, 0, 250)).room).toBe(220)
    expect(cableBoxContent(boxOf('left', 0, 0, 250)).room).toBe(220)
  })
})

describe('fitCableText', () => {
  it('keeps text that fits at 3.5 mm', () => {
    expect(fitCableText('Вх 1', 120)).toEqual({ text: 'Вх 1', size: 35, truncated: false })
    expect(fitCableText('12345', 120)).toEqual({ text: '12345', size: 35, truncated: false })
  })

  it('an empty text fits', () => {
    expect(fitCableText('', 70)).toEqual({ text: '', size: 35, truncated: false })
  })

  // width = chars * size * 0.6; room 120: 6 chars -> 33, 7 -> 28, 8 -> 25, 10 -> 20, 11 -> 18
  it.each([
    [6, 33],
    [7, 28],
    [8, 25],
    [10, 20],
    [11, 18],
  ])('%i characters in 120 are scaled down to %i', (n, size) => {
    const text = 'a'.repeat(n)
    expect(fitCableText(text, 120)).toEqual({ text, size, truncated: false })
  })

  it('scales a 16 character label to fit a 4-wire box (room 220)', () => {
    const text = 'a'.repeat(16)
    expect(fitCableText(text, 220)).toEqual({ text, size: 22, truncated: false })
  })

  it('never goes below 1.8 mm: 12 characters in 120 are cut to 10 plus the ellipsis', () => {
    expect(fitCableText('abcdefghijkl', 120)).toEqual({
      text: 'abcdefghij…',
      size: CABLE_TEXT_MIN_SIZE,
      truncated: true,
    })
  })

  it('the truncated text fits the room at the minimum size', () => {
    for (const n of [12, 16, 40]) {
      for (const room of [70, 120, 220]) {
        const out = fitCableText('x'.repeat(n), room)
        if (!out.truncated) continue
        expect(out.size).toBe(CABLE_TEXT_MIN_SIZE)
        expect([...out.text].length * out.size * 0.6).toBeLessThanOrEqual(room)
      }
    }
  })

  it('a tiny room keeps just the ellipsis', () => {
    expect(fitCableText('abc', 5)).toEqual({ text: '…', size: 18, truncated: true })
  })

  it('counts code points, not UTF-16 units', () => {
    const emoji = '😀'.repeat(12)
    const out = fitCableText(emoji, 120)
    expect(out.truncated).toBe(true)
    expect(out.text).toBe(`${'😀'.repeat(10)}…`)
    // 5 emoji (10 UTF-16 units) still fit at full size
    expect(fitCableText('😀'.repeat(5), 120)).toEqual({
      text: '😀'.repeat(5),
      size: 35,
      truncated: false,
    })
  })

  it('a larger room never makes the text smaller or more truncated', () => {
    const text = 'Розетки кухні'
    const sizes = [70, 120, 220, 400].map((room) => fitCableText(text, room))
    for (let i = 1; i < sizes.length; i++) {
      expect(sizes[i]!.size).toBeGreaterThanOrEqual(sizes[i - 1]!.size)
    }
    expect(sizes[3]).toMatchObject({ truncated: false, size: 35 })
  })
})
