/**
 * Client-side mirror of the backend PanelContentValidator. Violations carry payload-style property
 * paths (`content.rails[2].elements[0].widthModules`) and the offending item id where there is one.
 */
import { busbarIssues, railItems } from './busbars'
import { rowCapacity as rowCapacityOf } from './geometry'
import {
  ATS_INPUTS,
  ATS_MIN_WIDTH,
  ATS_OUTPUTS,
  BLOCK_COLOURS,
  CABLE_CROSS_SECTION_RULE,
  DEVICE_STYLES,
  checkDecimal,
  codePointLength,
  FREQUENCY_RULE,
  isValidId,
  MAX_BENDS_PER_WIRE,
  MAX_COORD_U,
  MAX_DESCRIPTION_LENGTH,
  MAX_INPUT_CABLES,
  MAX_CABLE_WIRES,
  MAX_LABEL_LENGTH,
  MAX_MARKING_LENGTH,
  MAX_OUTPUT_CABLES,
  MAX_POLES_PER_MODULE,
  MAX_RAIL_BLOCK_TERMINALS,
  MAX_BUSBARS_PER_RAIL,
  MAX_CABLE_LABEL_LENGTH,
  MAX_RAIL_WIDTH,
  MAX_RAILS,
  MAX_ROW_BLOCK_TERMINALS,
  MAX_ROW_BLOCKS,
  MAX_TOTAL_BENDS,
  MAX_WIRES,
  rowBlockWidth,
  SPACING_RULE,
  VOLTAGE_RULE,
} from './limits'
import {
  endpointKey,
  type CableWire,
  type Busbar,
  type Endpoint,
  type PanelContent,
  type TerminalBlock,
} from './panelContent'

export interface Violation {
  propertyPath: string
  message: string
  id: string | null
}

const MAX_VIOLATIONS = 200

interface Span {
  offset: number
  end: number
  path: string
  id: string
}

class Run {
  readonly list: Violation[] = []
  private readonly claimed = new Set<string>()

  add(propertyPath: string, message: string, id: string | null = null): void {
    if (this.list.length < MAX_VIOLATIONS) this.list.push({ propertyPath, message, id })
  }

  claimId(id: string, path: string): void {
    if (!isValidId(id)) this.add(path, 'Must be a lowercase RFC 4122 UUID.')
    else if (this.claimed.has(id)) this.add(path, 'Duplicate id within the payload.', id)
    else this.claimed.add(id)
  }

  intRange(value: number, min: number, max: number, path: string, id: string | null): boolean {
    if (!Number.isInteger(value) || value < min || value > max) {
      this.add(path, `Must be between ${min} and ${max}.`, id)
      return false
    }
    return true
  }

  maxLength(value: string, max: number, path: string, id: string | null): void {
    if (codePointLength(value) > max) this.add(path, `Must be at most ${max} characters long.`, id)
  }
}

/** Returns all violations of the content (empty when it would be accepted by the backend). */
export function validateContent(content: PanelContent): Violation[] {
  const run = new Run()
  const cableWires = new Set<string>()
  /** Terminals per element id: devices have `poles` inputs and outputs, an ATS 4 and 2. */
  const poleCounts = new Map<string, { inputs: number; outputs: number }>()
  const blocks = new Map<string, { count: number; row: boolean }>()
  /** Feeds per busbar id (registered even when the busbar is invalid). */
  const busbarFeeds = new Map<string, number>()

  const railWidthOk = run.intRange(
    content.railWidthModules,
    1,
    MAX_RAIL_WIDTH,
    'content.railWidthModules',
    null,
  )

  // cables
  if (content.inputCables.length < 1)
    run.add('content.inputCables', 'At least one input cable is required.')
  else if (content.inputCables.length > MAX_INPUT_CABLES) {
    run.add('content.inputCables', `At most ${MAX_INPUT_CABLES} input cables are allowed.`)
  }
  const wires = (list: CableWire[], path: string) => {
    if (list.length < 1 || list.length > MAX_CABLE_WIRES) {
      run.add(`${path}.wires`, `A cable has 1 to ${MAX_CABLE_WIRES} wires.`)
    }
    list.forEach((w, j) => {
      run.claimId(w.id, `${path}.wires[${j}].id`)
      cableWires.add(w.id)
    })
  }
  content.inputCables.forEach((cable, i) => {
    const path = `content.inputCables[${i}]`
    run.claimId(cable.id, `${path}.id`)
    run.maxLength(cable.label, MAX_CABLE_LABEL_LENGTH, `${path}.label`, cable.id)
    for (const [value, rule, field] of [
      [cable.voltage, VOLTAGE_RULE, 'voltage'],
      [cable.frequency, FREQUENCY_RULE, 'frequency'],
      [cable.crossSection, CABLE_CROSS_SECTION_RULE, 'crossSection'],
    ] as const) {
      const message = checkDecimal(value, rule)
      if (message) run.add(`${path}.${field}`, message, cable.id)
    }
    wires(cable.wires, path)
  })
  if (content.outputCables.length > MAX_OUTPUT_CABLES) {
    run.add('content.outputCables', `At most ${MAX_OUTPUT_CABLES} output cables are allowed.`)
  }
  content.outputCables.forEach((cable, i) => {
    const path = `content.outputCables[${i}]`
    run.claimId(cable.id, `${path}.id`)
    run.maxLength(cable.label, MAX_CABLE_LABEL_LENGTH, `${path}.label`, cable.id)
    run.maxLength(cable.description, MAX_DESCRIPTION_LENGTH, `${path}.description`, cable.id)
    wires(cable.wires, path)
  })

  // Modules the terminal row has: rail width minus the input-cable row; unknown while those are invalid.
  const inputsValid =
    content.inputCables.length >= 1 &&
    content.inputCables.length <= MAX_INPUT_CABLES &&
    content.inputCables.every((c) => c.wires.length >= 1 && c.wires.length <= MAX_CABLE_WIRES)
  const rowCapacity = railWidthOk && inputsValid ? rowCapacityOf(content) : null

  /** Offset/width/fit/overlap violations so far; a rail with any of them skips the busbar coverage walk. */
  let spanBad = 0

  const checkBlock = (b: TerminalBlock, itemPath: string, row: boolean) => {
    run.claimId(b.id, `${itemPath}.id`)
    run.maxLength(b.label, MAX_LABEL_LENGTH, `${itemPath}.label`, b.id)
    if (!BLOCK_COLOURS.includes(b.colour)) {
      run.add(`${itemPath}.colour`, 'Must be one of the wire colours or null.', b.id)
    }
    const max = row ? MAX_ROW_BLOCK_TERMINALS : MAX_RAIL_BLOCK_TERMINALS
    run.intRange(b.terminalCount, 1, max, `${itemPath}.terminalCount`, b.id)
    blocks.set(b.id, { count: b.terminalCount, row })
  }
  const collectSpan = (
    spans: Span[],
    id: string,
    offset: number,
    width: number,
    itemPath: string,
    limit: number | null,
    zone: 'rail' | 'row',
  ) => {
    let valid = true
    const before = run.list.length
    if (offset < 0) {
      run.add(`${itemPath}.offsetModules`, 'Must not be negative.', id)
      valid = false
    }
    if (width < 1) {
      run.add(`${itemPath}.widthModules`, 'Must be at least 1.', id)
      valid = false
    }
    if (valid && limit !== null && offset + width > limit) {
      run.add(
        `${itemPath}.offsetModules`,
        zone === 'rail'
          ? 'Does not fit within the rail width.'
          : 'Does not fit within the terminal row (rail width minus the input cables).',
        id,
      )
    }
    spanBad += run.list.length - before
    if (valid) spans.push({ offset, end: offset + width, path: itemPath, id })
  }
  const checkOverlaps = (spans: Span[], zone: 'rail' | 'row') => {
    spans.sort((a, b) => a.offset - b.offset || a.end - b.end)
    let previousEnd = 0
    for (const s of spans) {
      if (s.offset < previousEnd) {
        spanBad++
        run.add(
          `${s.path}.offsetModules`,
          zone === 'rail'
            ? 'Overlaps another item on the rail.'
            : 'Overlaps another block in the terminal row.',
          s.id,
        )
      }
      previousEnd = Math.max(previousEnd, s.end)
    }
  }

  // terminal row
  if (content.terminalRow.length > MAX_ROW_BLOCKS) {
    run.add(
      'content.terminalRow',
      `At most ${MAX_ROW_BLOCKS} terminal blocks are allowed in the terminal row.`,
    )
  }
  const rowSpans: Span[] = []
  content.terminalRow.forEach((b, i) => {
    const itemPath = `content.terminalRow[${i}]`
    checkBlock(b, itemPath, true)
    if (
      Number.isInteger(b.terminalCount) &&
      b.terminalCount >= 1 &&
      b.widthModules >= 1 &&
      b.widthModules !== rowBlockWidth(b.terminalCount)
    ) {
      run.add(
        `${itemPath}.widthModules`,
        `Must be ${rowBlockWidth(b.terminalCount)} (half of the terminal count, rounded up).`,
        b.id,
      )
    }
    collectSpan(rowSpans, b.id, b.offsetModules, b.widthModules, itemPath, rowCapacity, 'row')
  })
  checkOverlaps(rowSpans, 'row')

  // rails
  if (content.rails.length > MAX_RAILS)
    run.add('content.rails', `At most ${MAX_RAILS} rails are allowed.`)
  content.rails.forEach((rail, i) => {
    const path = `content.rails[${i}]`
    run.claimId(rail.id, `${path}.id`)
    const spacing = checkDecimal(rail.spacingMm, SPACING_RULE)
    if (spacing) run.add(`${path}.spacingMm`, spacing, rail.id)

    const spans: Span[] = []
    const spanBadBefore = spanBad
    const collect = (id: string, offset: number, width: number, itemPath: string) =>
      collectSpan(
        spans,
        id,
        offset,
        width,
        itemPath,
        railWidthOk ? content.railWidthModules : null,
        'rail',
      )
    rail.elements.forEach((el, j) => {
      const itemPath = `${path}.elements[${j}]`
      // the payload may carry fields of the other kind (kept by the normaliser): read them untyped
      const sent: { on: unknown; poles: unknown; state: unknown; style: unknown } = el
      run.claimId(el.id, `${itemPath}.id`)
      run.maxLength(el.label, MAX_LABEL_LENGTH, `${itemPath}.label`, el.id)
      run.maxLength(el.marking, MAX_MARKING_LENGTH, `${itemPath}.marking`, el.id)
      if (el.kind === 'ats') {
        if (sent.style !== null) run.add(`${itemPath}.style`, 'Must be null for an ATS.', el.id)
        if (sent.on !== null) run.add(`${itemPath}.on`, 'An ATS has no on/off flag.', el.id)
        if (sent.poles !== null) run.add(`${itemPath}.poles`, 'An ATS has no poles.', el.id)
        if (el.widthModules >= 1 && el.widthModules < ATS_MIN_WIDTH) {
          run.add(
            `${itemPath}.widthModules`,
            `An ATS is at least ${ATS_MIN_WIDTH} modules wide.`,
            el.id,
          )
        }
        poleCounts.set(el.id, { inputs: ATS_INPUTS, outputs: ATS_OUTPUTS })
      } else {
        if (!DEVICE_STYLES.includes(el.style)) {
          run.add(`${itemPath}.style`, 'Required for a device.', el.id)
        }
        if (sent.state !== null) run.add(`${itemPath}.state`, 'Only an ATS has a state.', el.id)
        const maxPoles = Math.max(
          1,
          Math.min(el.widthModules, MAX_RAIL_WIDTH) * MAX_POLES_PER_MODULE,
        )
        if (el.poles.length < 1 || el.poles.length > maxPoles) {
          run.add(
            `${itemPath}.poles`,
            `An element has 1 to ${maxPoles} poles (at most ${MAX_POLES_PER_MODULE} per module of width).`,
            el.id,
          )
        }
        poleCounts.set(el.id, { inputs: el.poles.length, outputs: el.poles.length })
      }
      collect(el.id, el.offsetModules, el.widthModules, itemPath)
    })
    rail.terminalBlocks.forEach((b, j) => {
      const itemPath = `${path}.terminalBlocks[${j}]`
      checkBlock(b, itemPath, false)
      if (b.widthModules > 1) {
        run.add(
          `${itemPath}.widthModules`,
          'A terminal block on a rail is exactly 1 module wide.',
          b.id,
        )
      }
      collect(b.id, b.offsetModules, b.widthModules, itemPath)
    })

    checkOverlaps(spans, 'rail')
    const railSane = spanBad === spanBadBefore

    // busbars
    if (rail.busbars.length > MAX_BUSBARS_PER_RAIL) {
      run.add(`${path}.busbars`, `At most ${MAX_BUSBARS_PER_RAIL} busbars per rail are allowed.`)
    }
    const items = railSane ? railItems(rail) : null
    const covered = new Set<string>()
    rail.busbars.forEach((busbar: Busbar, j) => {
      const busbarPath = `${path}.busbars[${j}]`
      run.claimId(busbar.id, `${busbarPath}.id`)
      busbarFeeds.set(busbar.id, busbar.type === 'LN' ? 2 : 1)
      if (!BLOCK_COLOURS.includes(busbar.colour)) {
        run.add(`${busbarPath}.colour`, 'Must be one of the wire colours or null.', busbar.id)
      }
      for (const issue of busbarIssues(rail, busbar, items, covered)) {
        run.add(
          issue.field === 'busbar' ? busbarPath : `${busbarPath}.${issue.field}`,
          issue.message,
          busbar.id,
        )
      }
    })
  })

  // wires
  if (content.wires.length > MAX_WIRES)
    run.add('content.wires', `At most ${MAX_WIRES} wires are allowed.`)
  const endpointOk = (e: Endpoint, path: string, wireId: string): boolean => {
    switch (e.kind) {
      case 'pole': {
        const poles = poleCounts.get(e.elementId)
        if (poles === undefined) {
          run.add(path, 'Refers to an element that is not part of this content.', wireId)
          return false
        }
        const count = e.side === 'input' ? poles.inputs : poles.outputs
        if (e.poleIndex < 0 || e.poleIndex >= count) {
          run.add(`${path}.poleIndex`, `Must be between 0 and ${count - 1}.`, wireId)
          return false
        }
        return true
      }
      case 'terminal': {
        const block = blocks.get(e.terminalBlockId)
        if (block === undefined) {
          run.add(path, 'Refers to a terminal block that is not part of this content.', wireId)
          return false
        }
        let ok = true
        if (e.terminalIndex < 0 || e.terminalIndex >= block.count) {
          run.add(`${path}.terminalIndex`, `Must be between 0 and ${block.count - 1}.`, wireId)
          ok = false
        }
        const sides = block.row ? ['top', 'bottom'] : ['left', 'right']
        if (!sides.includes(e.contactSide)) {
          run.add(
            `${path}.contactSide`,
            `Must be ${sides.join(' or ')} for a ${block.row ? 'terminal-row' : 'rail'} block.`,
            wireId,
          )
          ok = false
        }
        return ok
      }
      case 'busbar': {
        const feeds = busbarFeeds.get(e.busbarId)
        if (feeds === undefined) {
          run.add(path, 'Refers to a busbar that is not part of this content.', wireId)
          return false
        }
        if (!Number.isInteger(e.feedIndex) || e.feedIndex < 0 || e.feedIndex >= feeds) {
          run.add(`${path}.feedIndex`, `Must be between 0 and ${feeds - 1}.`, wireId)
          return false
        }
        return true
      }
      case 'cableWire':
        if (!cableWires.has(e.cableWireId)) {
          run.add(path, 'Refers to a cable wire that is not part of this content.', wireId)
          return false
        }
        return true
    }
  }
  let totalBends = 0
  content.wires.forEach((wire, i) => {
    const path = `content.wires[${i}]`
    run.claimId(wire.id, `${path}.id`)
    const startOk = endpointOk(wire.start, `${path}.start`, wire.id)
    const endOk = endpointOk(wire.end, `${path}.end`, wire.id)
    if (startOk && endOk && endpointKey(wire.start) === endpointKey(wire.end)) {
      run.add(`${path}.end`, 'The two ends of a wire must differ.', wire.id)
    }
    if (wire.bends.length > MAX_BENDS_PER_WIRE) {
      run.add(`${path}.bends`, `At most ${MAX_BENDS_PER_WIRE} bends per wire are allowed.`, wire.id)
    }
    wire.bends.forEach((b, k) => {
      for (const axis of ['x', 'y'] as const) {
        const v = b[axis]
        if (!Number.isInteger(v))
          run.add(`${path}.bends[${k}].${axis}`, 'Must have at most 1 decimal places.', wire.id)
        else if (v < 0 || v > MAX_COORD_U) {
          run.add(
            `${path}.bends[${k}].${axis}`,
            `Must be at least 0 and at most ${MAX_COORD_U / 10}.`,
            wire.id,
          )
        }
      }
    })
    totalBends += wire.bends.length
  })
  if (totalBends > MAX_TOTAL_BENDS) {
    run.add('content.wires', `At most ${MAX_TOTAL_BENDS} bends per panel are allowed.`)
  }
  return run.list
}

export type ItemKind =
  'rail' | 'element' | 'block' | 'busbar' | 'inputCable' | 'outputCable' | 'cableWire' | 'wire'
export interface ItemRef {
  kind: ItemKind
  id: string
}

/**
 * Resolves a payload property path against the content that was sent and returns the nearest
 * ancestor item that has an id (E9); null for general paths such as `content.wires`.
 */
export function resolveViolationItem(content: PanelContent, propertyPath: string): ItemRef | null {
  const segments = [...propertyPath.matchAll(/([A-Za-z]+)(?:\[(\d+)\])?/g)].map((m) => ({
    name: m[1] as string,
    index: m[2] === undefined ? null : Number(m[2]),
  }))
  if (segments[0]?.name !== 'content') return null
  let found: ItemRef | null = null
  const [, s1, s2] = segments
  if (!s1 || s1.index === null) return null
  switch (s1.name) {
    case 'terminalRow': {
      const block = content.terminalRow[s1.index]
      return block ? { kind: 'block', id: block.id } : null
    }
    case 'rails': {
      const rail = content.rails[s1.index]
      if (!rail) return null
      found = { kind: 'rail', id: rail.id }
      if (s2?.index != null && s2.name === 'busbars') {
        const busbar = rail.busbars[s2.index]
        if (busbar) found = { kind: 'busbar', id: busbar.id }
      } else if (s2?.index != null && (s2.name === 'elements' || s2.name === 'terminalBlocks')) {
        const item =
          s2.name === 'elements' ? rail.elements[s2.index] : rail.terminalBlocks[s2.index]
        if (item) found = { kind: s2.name === 'elements' ? 'element' : 'block', id: item.id }
      }
      return found
    }
    case 'inputCables':
    case 'outputCables': {
      const cable = (s1.name === 'inputCables' ? content.inputCables : content.outputCables)[
        s1.index
      ]
      if (!cable) return null
      found = { kind: s1.name === 'inputCables' ? 'inputCable' : 'outputCable', id: cable.id }
      if (s2?.name === 'wires' && s2.index !== null) {
        const wire = cable.wires[s2.index]
        if (wire) found = { kind: 'cableWire', id: wire.id }
      }
      return found
    }
    case 'wires': {
      const wire = content.wires[s1.index]
      return wire ? { kind: 'wire', id: wire.id } : null
    }
    default:
      return null
  }
}
