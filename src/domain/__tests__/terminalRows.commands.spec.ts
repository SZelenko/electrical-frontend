/** Two terminal rows: addRowBlock, moveRowBlock (drag between rows), moveBlockToOtherRow, copy. Success + Error. */
import { describe, expect, it } from 'vitest'
import {
  addRowBlock,
  copyItem,
  moveBlockToOtherRow,
  moveItem,
  moveRowBlock,
  removeBlock,
  updateBlock,
} from '../commands'
import { MAX_ROW_BLOCKS } from '../limits'
import { computeLayout, endpointPoint } from '../geometry'
import { rowOfBlock, type PanelContent, type RowId } from '../panelContent'
import { validateContent } from '../validateContent'
import {
  addAuto,
  block,
  content,
  cw,
  element,
  id,
  inputCable,
  pole,
  rail,
  rejection,
  rowBlock,
  run,
  term,
} from './helpers'

const KEY = { top: 'terminalRow', bottom: 'bottomTerminalRow' } as const
const ROWS: readonly RowId[] = ['top', 'bottom']
const other = (row: RowId): RowId => (row === 'top' ? 'bottom' : 'top')
const ids = (c: PanelContent, row: RowId) => c[KEY[row]].map((b) => b.id)
const offsets = (c: PanelContent, row: RowId) => c[KEY[row]].map((b) => [b.id, b.offsetModules])

/** 24 modules; top row: id50 [0,2) 3 contacts, id51 [6,7); bottom row: id52 [3,4), id53 [10,12) 4 contacts. */
const world = (): PanelContent =>
  content({
    railWidthModules: 24,
    inputCables: [inputCable(1, [2, 3])],
    terminalRow: [rowBlock(50, 0, 3), rowBlock(51, 6, 2)],
    bottomTerminalRow: [rowBlock(52, 3, 2), rowBlock(53, 10, 4)],
    rails: [rail(10, 24, 150, [element(20, 0, 2, 2)], [block(40, 8, 1, 2)])],
  })

describe('addRowBlock', () => {
  it.each(ROWS)('adds a block to the %s row only, ordered by offset', (row) => {
    const c = world()
    const out = run(c, addRowBlock(row, rowBlock(60, 4, 2))).content
    expect(ids(out, row)).toEqual(
      row === 'top' ? [id(50), id(60), id(51)] : [id(52), id(60), id(53)],
    )
    expect(out[KEY[other(row)]]).toBe(c[KEY[other(row)]])
    expect(validateContent(out)).toEqual([])
  })

  it('the same offset in the other row is free (the rows are independent)', () => {
    const c = world()
    expect(rejection(addRowBlock('bottom', rowBlock(60, 0, 3))(c))).toBeNull()
    expect(rejection(addRowBlock('top', rowBlock(60, 3, 2))(c))).toBeNull()
  })

  it.each(ROWS)('rejects an overlap in the %s row', (row) => {
    const taken = row === 'top' ? 1 : 3
    expect(rejection(addRowBlock(row, rowBlock(60, taken, 2))(world()))).toBe('overlap')
  })

  it.each(ROWS)('rejects a block past the rail width in the %s row', (row) => {
    expect(rejection(addRowBlock(row, rowBlock(60, 23, 4))(world()))).toBe('outOfRow')
    expect(rejection(addRowBlock(row, rowBlock(60, 22, 4))(world()))).toBeNull() // [22, 24) fits
  })

  it.each(ROWS)('rejects a negative offset and a wrong width in the %s row', (row) => {
    expect(rejection(addRowBlock(row, rowBlock(60, -1, 2))(world()))).toBe('negativeOffset')
    expect(rejection(addRowBlock(row, { ...rowBlock(60, 12, 4), widthModules: 1 })(world()))).toBe(
      'invalid',
    )
  })

  it('rejects an id that is already used in the other row, on a rail or as a cable', () => {
    expect(rejection(addRowBlock('bottom', rowBlock(50, 20, 2))(world()))).toBe('duplicateId')
    expect(rejection(addRowBlock('top', rowBlock(52, 20, 2))(world()))).toBe('duplicateId')
    expect(rejection(addRowBlock('top', rowBlock(40, 20, 2))(world()))).toBe('duplicateId')
    expect(rejection(addRowBlock('bottom', rowBlock(2, 20, 2))(world()))).toBe('duplicateId')
  })

  it.each(ROWS)(
    'rejects the 61st block of the %s row but a full row does not block the other',
    (row) => {
      const full = content({
        railWidthModules: 60,
        [KEY[row]]: Array.from({ length: MAX_ROW_BLOCKS }, (_, i) => rowBlock(100 + i, i, 1)),
      })
      expect(addRowBlock(row, rowBlock(999, 0, 1))(full)).toEqual({
        ok: false,
        reason: 'limit',
        detail: 'row blocks',
      })
      expect(rejection(addRowBlock(other(row), rowBlock(999, 0, 1))(full))).toBeNull()
    },
  )
})

describe('moveRowBlock within a row', () => {
  it.each(ROWS)(
    'moves a block to the exact offset in the %s row and keeps wires attached',
    (row) => {
      const blockId = row === 'top' ? id(50) : id(52)
      let c = world()
      c = run(c, addAuto(30, term(blockId, 0, 'top'), pole(id(20), 0, 'input'))).content
      const out = run(c, moveRowBlock(blockId, 15)).content
      expect(out[KEY[row]].find((b) => b.id === blockId)?.offsetModules).toBe(15)
      expect(out.wires).toHaveLength(1)
      const l = computeLayout(out)
      expect(endpointPoint(l, term(blockId, 0, 'top'))?.x).toBeGreaterThan(200 + 15 * 175)
      expect(validateContent(out)).toEqual([])
    },
  )

  it('the same offset changes nothing (same reference)', () => {
    const c = world()
    expect(run(c, moveRowBlock(id(50), 0)).content).toBe(c)
    expect(run(c, moveRowBlock(id(52), 3, 'bottom')).content).toBe(c)
  })

  it('keeps the row ordered when a block jumps over another', () => {
    const out = run(world(), moveRowBlock(id(50), 10)).content
    expect(ids(out, 'top')).toEqual([id(51), id(50)])
  })

  it.each([
    ['onto a neighbour (top)', id(50), 5, 'overlap'],
    ['onto a neighbour (bottom)', id(52), 10, 'overlap'],
    ['past the row end', id(51), 24, 'outOfRow'],
    ['to a negative offset', id(53), -1, 'negativeOffset'],
    ['an unknown block', id(99), 1, 'notFound'],
    ['a rail block', id(40), 1, 'notFound'],
  ])('rejects moving %s', (_n, blockId, offset, reason) => {
    expect(rejection(moveRowBlock(blockId, offset)(world()))).toBe(reason)
  })
})

describe('moveRowBlock to the other row (drag between rows: exact drop offset)', () => {
  it.each([
    ['top', 'bottom', id(50), 5],
    ['bottom', 'top', id(53), 14],
  ] as const)(
    '%s -> %s: the block lands at the drop offset with its id and settings',
    (from, to, blockId, offset) => {
      const c = world()
      const before = c[KEY[from]].find((b) => b.id === blockId)!
      const out = run(c, moveRowBlock(blockId, offset, to)).content
      expect(ids(out, from)).not.toContain(blockId)
      expect(out[KEY[to]].find((b) => b.id === blockId)).toEqual({
        ...before,
        offsetModules: offset,
      })
      expect(rowOfBlock(out, blockId)).toBe(to)
      expect(validateContent(out)).toEqual([])
    },
  )

  it('keeps the wires attached and orthogonal; contactSide stays top/bottom', () => {
    let c = world()
    c = run(c, addAuto(30, term(id(50), 1, 'bottom'), pole(id(20), 0, 'input'))).content
    c = run(c, addAuto(31, term(id(50), 0, 'top'), cw(id(2)))).content
    const out = run(c, moveRowBlock(id(50), 5, 'bottom')).content
    expect(out.wires.map((w) => [w.id, w.start, w.end])).toEqual(
      c.wires.map((w) => [w.id, w.start, w.end]),
    )
    const layout = computeLayout(out)
    for (const w of out.wires) {
      const pts = [endpointPoint(layout, w.start)!, ...w.bends, endpointPoint(layout, w.end)!]
      expect(
        pts.every((a, i) => !pts[i + 1] || a.x === pts[i + 1]!.x || a.y === pts[i + 1]!.y),
      ).toBe(true)
    }
    expect(endpointPoint(layout, term(id(50), 0, 'top'))?.y).toBe(layout.bottomRowY)
  })

  it('a drop on a taken place is an overlap and changes nothing', () => {
    const c = world()
    expect(rejection(moveRowBlock(id(50), 3, 'bottom')(c))).toBe('overlap') // id52 [3,4)
    expect(rejection(moveRowBlock(id(50), 11, 'bottom')(c))).toBe('overlap') // id53 [10,12)
  })

  it('a drop past the row end is outOfRow', () => {
    expect(rejection(moveRowBlock(id(50), 23, 'bottom')(world()))).toBe('outOfRow') // width 2
  })

  it('a full target row is a limit and the source keeps the block', () => {
    const c = content({
      railWidthModules: 60,
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: Array.from({ length: MAX_ROW_BLOCKS }, (_, i) => rowBlock(100 + i, i, 1)),
    })
    expect(moveRowBlock(id(50), 0, 'bottom')(c)).toEqual({
      ok: false,
      reason: 'limit',
      detail: 'row blocks',
    })
  })

  it('toRow equal to the current row behaves like a move within the row', () => {
    const out = run(world(), moveRowBlock(id(50), 10, 'top')).content
    expect(ids(out, 'top')).toEqual([id(51), id(50)])
    expect(ids(out, 'bottom')).toEqual([id(52), id(53)])
  })

  it('a rail block cannot be moved between rows (notFound) and moveItem refuses a row block', () => {
    expect(rejection(moveRowBlock(id(40), 0, 'bottom')(world()))).toBe('notFound')
    expect(moveItem(id(52), id(10), 12)(world())).toEqual({
      ok: false,
      reason: 'invalid',
      detail: 'row block',
    })
  })

  it('a move between rows leaves rails and cables untouched (same references)', () => {
    const c = world()
    const out = run(c, moveRowBlock(id(50), 5, 'bottom')).content
    expect(out.terminalRow).not.toBe(c.terminalRow)
    expect(out.rails).toBe(c.rails)
    expect(out.inputCables).toBe(c.inputCables)
  })
})

describe('moveBlockToOtherRow (block properties action)', () => {
  it.each([
    ['top', 'bottom', id(51), 6], // [6,7) is free in the bottom row
    ['bottom', 'top', id(52), 3], // [3,4) is free in the top row
  ] as const)('%s -> %s keeps the offset when it is free', (from, to, blockId, offset) => {
    const out = run(world(), moveBlockToOtherRow(blockId)).content
    expect(rowOfBlock(out, blockId)).toBe(to)
    expect(out[KEY[to]].find((b) => b.id === blockId)?.offsetModules).toBe(offset)
    expect(ids(out, from)).not.toContain(blockId)
    expect(validateContent(out)).toEqual([])
  })

  it('takes the nearest free offset when the place is taken', () => {
    // id50 [0,2) -> bottom has id52 [3,4), id53 [10,12): offset 0 is free; make it taken
    const c = run(world(), addRowBlock('bottom', rowBlock(60, 0, 2))).content // bottom [0,1)
    const out = run(c, moveBlockToOtherRow(id(50))).content
    // wanted 0: [0,1) taken, [1,3) is the nearest free 2-module slot (width 2)
    expect(out.bottomTerminalRow.find((b) => b.id === id(50))?.offsetModules).toBe(1)
  })

  it('a tie prefers the left offset', () => {
    const c = content({
      railWidthModules: 10,
      terminalRow: [rowBlock(50, 4, 2)],
      bottomTerminalRow: [rowBlock(51, 3, 4)], // [3,5): wanted 4 for a 1-module block; free 2 and 5 are both 2 away
    })
    const out = run(c, moveBlockToOtherRow(id(50))).content
    expect(out.bottomTerminalRow.find((b) => b.id === id(50))?.offsetModules).toBe(5)
  })

  it('keeps the wires attached (contactSide stays top/bottom) and the routes orthogonal', () => {
    let c = world()
    c = run(c, addAuto(30, term(id(51), 1, 'bottom'), pole(id(20), 0, 'input'))).content
    const out = run(c, moveBlockToOtherRow(id(51))).content
    expect(out.wires[0]?.start).toEqual(term(id(51), 1, 'bottom'))
    const layout = computeLayout(out)
    expect(endpointPoint(layout, term(id(51), 1, 'bottom'))).not.toBeNull()
  })

  it('is rejected with rowNoRoom when the other row has no room', () => {
    const c = content({
      railWidthModules: 4,
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: [rowBlock(51, 0, 4), rowBlock(52, 2, 4)], // fills 4 modules
    })
    expect(rejection(moveBlockToOtherRow(id(50))(c))).toBe('rowNoRoom')
  })

  it('is rejected with rowNoRoom when the block is wider than the free gaps', () => {
    const c = content({
      railWidthModules: 6,
      terminalRow: [rowBlock(50, 0, 6)], // 3 modules
      bottomTerminalRow: [rowBlock(51, 1, 2), rowBlock(52, 4, 2)], // gaps of 1 module only
    })
    expect(rejection(moveBlockToOtherRow(id(50))(c))).toBe('rowNoRoom')
  })

  it.each(ROWS)(
    'is rejected with limit when the target row already holds 60 blocks (%s -> other)',
    (from) => {
      const to = other(from)
      const c = content({
        railWidthModules: 60,
        [KEY[from]]: [rowBlock(50, 0, 2)],
        [KEY[to]]: Array.from({ length: MAX_ROW_BLOCKS }, (_, i) => rowBlock(100 + i, i, 1)),
      })
      expect(moveBlockToOtherRow(id(50))(c)).toEqual({
        ok: false,
        reason: 'limit',
        detail: 'row blocks',
      })
    },
  )

  it('rejects an unknown id and a rail block', () => {
    expect(rejection(moveBlockToOtherRow(id(99))(world()))).toBe('notFound')
    expect(rejection(moveBlockToOtherRow(id(40))(world()))).toBe('notFound')
  })

  it('two moves restore the original rows', () => {
    const c = world()
    const there = run(c, moveBlockToOtherRow(id(50))).content
    const back = run(there, moveBlockToOtherRow(id(50))).content
    expect(offsets(back, 'top')).toEqual(offsets(c, 'top'))
    expect(offsets(back, 'bottom')).toEqual(offsets(c, 'bottom'))
  })
})

describe('copyItem into either row', () => {
  it.each([
    ['top', id(50), 'bottom', 15],
    ['bottom', id(53), 'top', 14],
    ['top', id(50), 'top', 10],
    ['bottom', id(52), 'bottom', 20],
  ] as const)(
    'copies a block of the %s row into the %s row: new id, same settings, no wires, source stays',
    (_from, source, into, offset) => {
      let c = world()
      c = run(c, addAuto(30, term(source, 0, 'top'), cw(id(2)))).content
      const original = [...c.terminalRow, ...c.bottomTerminalRow].find((b) => b.id === source)!
      const out = run(c, copyItem(source, id(70), { row: into }, offset))
      expect(out.content[KEY[into]].find((b) => b.id === id(70))).toEqual({
        ...original,
        id: id(70),
        offsetModules: offset,
      })
      expect([...out.content.terminalRow, ...out.content.bottomTerminalRow]).toContainEqual(
        original,
      )
      expect(out.content.wires).toHaveLength(1)
      expect(out.removedWires).toBe(0)
      expect(validateContent(out.content)).toEqual([])
    },
  )

  it('a copy onto a taken place of its row is an overlap, in either row', () => {
    expect(rejection(copyItem(id(50), id(70), { row: 'top' }, 0)(world()))).toBe('overlap')
    expect(rejection(copyItem(id(52), id(70), { row: 'bottom' }, 3)(world()))).toBe('overlap')
    expect(rejection(copyItem(id(50), id(70), { row: 'bottom' }, 3)(world()))).toBe('overlap')
  })

  it('a copy past the rail width is outOfRow, in either row', () => {
    expect(rejection(copyItem(id(50), id(70), { row: 'top' }, 23)(world()))).toBe('outOfRow')
    expect(rejection(copyItem(id(50), id(70), { row: 'bottom' }, 23)(world()))).toBe('outOfRow')
  })

  it('a copy into a full row is a limit', () => {
    const c = content({
      railWidthModules: 60,
      terminalRow: [rowBlock(50, 0, 2)],
      bottomTerminalRow: Array.from({ length: MAX_ROW_BLOCKS }, (_, i) => rowBlock(100 + i, i, 1)),
    })
    expect(rejection(copyItem(id(50), id(70), { row: 'bottom' }, 0)(c))).toBe('limit')
  })

  it.each([
    ['a device into the bottom row', id(20), { row: 'bottom' } as const],
    ['a rail block into the top row', id(40), { row: 'top' } as const],
    ['a row block onto a rail', id(50), { railId: id(10) }],
  ])('cross-zone: %s is invalid', (_n, source, target) => {
    expect(copyItem(source, id(70), target, 12)(world())).toEqual({
      ok: false,
      reason: 'invalid',
      detail: 'zone',
    })
  })

  it('a copy may not reuse an id of the other row', () => {
    expect(rejection(copyItem(id(50), id(52), { row: 'bottom' }, 15)(world()))).toBe('duplicateId')
  })
})

describe('other commands on row blocks of either row', () => {
  it.each(ROWS)(
    'updateBlock grows a %s row block within free space and rejects overlap and end',
    (row) => {
      const blockId = row === 'top' ? id(50) : id(52)
      const grown = run(world(), updateBlock(blockId, { terminalCount: 4 })).content
      expect(grown[KEY[row]].find((b) => b.id === blockId)).toMatchObject({
        terminalCount: 4,
        widthModules: 2,
      })
      expect(rejection(updateBlock(blockId, { terminalCount: 60 })(world()))).not.toBeNull()
    },
  )

  it.each(ROWS)('removeBlock deletes a %s row block with its wires (one command)', (row) => {
    const blockId = row === 'top' ? id(50) : id(52)
    const c = run(world(), addAuto(30, term(blockId, 0, 'top'), cw(id(2)))).content
    const out = run(c, removeBlock(blockId))
    expect(out.removedWires).toBe(1)
    expect(ids(out.content, row)).not.toContain(blockId)
    expect(out.content.wires).toEqual([])
  })
})
