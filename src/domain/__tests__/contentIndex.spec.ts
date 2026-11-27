import { describe, expect, it } from 'vitest'
import { buildIndex } from '../contentIndex'
import { buildWorld, content, id } from './helpers'

describe('buildIndex', () => {
  const world = buildWorld()
  const idx = buildIndex(world)

  it('indexes rails, elements and blocks with their position and parent rail', () => {
    expect(idx.rails.get(id(11))?.index).toBe(1)
    expect(idx.elements.get(id(21))).toMatchObject({ railIndex: 0 })
    expect(idx.elements.get(id(21))?.rail).toBe(world.rails[0])
    expect(idx.elements.get(id(21))?.element).toBe(world.rails[0]?.elements[1])
    expect(idx.blocks.get(id(41))).toMatchObject({ railIndex: 1 })
  })

  it('indexes cables and tells input from output cable wires', () => {
    expect(idx.inputCables.get(id(1))?.index).toBe(0)
    expect(idx.outputCables.get(id(4))?.index).toBe(0)
    expect(idx.cableWires.get(id(3))).toMatchObject({
      kind: 'input',
      cableId: id(1),
      cableIndex: 0,
      index: 1,
    })
    expect(idx.cableWires.get(id(5))).toMatchObject({ kind: 'output', cableId: id(4), index: 0 })
  })

  it('indexes panel wires by id with their list position', () => {
    expect(idx.wires.get(id(32))?.index).toBe(2)
    expect(idx.wires.get(id(32))?.wire).toBe(world.wires[2])
  })

  it('returns undefined for unknown ids', () => {
    expect(idx.elements.get(id(999))).toBeUndefined()
    expect(idx.cableWires.get(id(999))).toBeUndefined()
  })

  it('builds empty maps for an empty panel', () => {
    const empty = buildIndex(content({ inputCables: [] }))
    expect(empty.rails.size + empty.elements.size + empty.cableWires.size + empty.wires.size).toBe(
      0,
    )
  })
})
