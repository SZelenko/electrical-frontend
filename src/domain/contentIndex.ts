/** Lookup maps over a content snapshot; build once per content identity (e.g. in a computed). */
import type {
  Busbar,
  CableWire,
  InputCable,
  OutputCable,
  PanelContent,
  PanelElement,
  PanelWire,
  Rail,
  TerminalBlock,
} from './panelContent'

export interface ContentIndex {
  rails: Map<string, { rail: Rail; index: number }>
  elements: Map<string, { element: PanelElement; rail: Rail; railIndex: number }>
  /** `rail`/`railIndex` are null for a terminal-row block. */
  blocks: Map<string, { block: TerminalBlock; rail: Rail | null; railIndex: number | null }>
  busbars: Map<string, { busbar: Busbar; rail: Rail; railIndex: number }>
  inputCables: Map<string, { cable: InputCable; index: number }>
  outputCables: Map<string, { cable: OutputCable; index: number }>
  cableWires: Map<
    string,
    {
      wire: CableWire
      kind: 'input' | 'output'
      cableId: string
      cableIndex: number
      index: number
    }
  >
  wires: Map<string, { wire: PanelWire; index: number }>
}

export function buildIndex(content: PanelContent): ContentIndex {
  const idx: ContentIndex = {
    rails: new Map(),
    elements: new Map(),
    blocks: new Map(),
    busbars: new Map(),
    inputCables: new Map(),
    outputCables: new Map(),
    cableWires: new Map(),
    wires: new Map(),
  }
  for (const block of content.terminalRow) {
    idx.blocks.set(block.id, { block, rail: null, railIndex: null })
  }
  content.rails.forEach((rail, railIndex) => {
    idx.rails.set(rail.id, { rail, index: railIndex })
    for (const element of rail.elements) idx.elements.set(element.id, { element, rail, railIndex })
    for (const block of rail.terminalBlocks) idx.blocks.set(block.id, { block, rail, railIndex })
    for (const busbar of rail.busbars) idx.busbars.set(busbar.id, { busbar, rail, railIndex })
  })
  content.inputCables.forEach((cable, index) => {
    idx.inputCables.set(cable.id, { cable, index })
    cable.wires.forEach((wire, i) =>
      idx.cableWires.set(wire.id, {
        wire,
        kind: 'input',
        cableId: cable.id,
        cableIndex: index,
        index: i,
      }),
    )
  })
  content.outputCables.forEach((cable, index) => {
    idx.outputCables.set(cable.id, { cable, index })
    cable.wires.forEach((wire, i) =>
      idx.cableWires.set(wire.id, {
        wire,
        kind: 'output',
        cableId: cable.id,
        cableIndex: index,
        index: i,
      }),
    )
  })
  content.wires.forEach((wire, index) => idx.wires.set(wire.id, { wire, index }))
  return idx
}
