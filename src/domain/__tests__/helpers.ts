/** Test builders shared by the domain/store specs (not a spec file). */
import { addWire, type Command, type CommandOutcome, type NewWire } from '../commands'
import { computeLayout } from '../geometry'
import { autoRouteFor } from '../routes'
import type {
  AtsElement,
  Busbar,
  BusbarType,
  ContactSide,
  DeviceElement,
  Endpoint,
  InputCable,
  OutputCable,
  PanelContent,
  PanelWire,
  Rail,
  TerminalBlock,
  WireColour,
} from '../panelContent'

/** Valid lowercase UUID (v4, variant 8) derived from a small number. */
export const id = (n: number): string =>
  `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`

export const cw = (wireId: string): Endpoint => ({ kind: 'cableWire', cableWireId: wireId })
export const pole = (
  elementId: string,
  poleIndex: number,
  side: 'input' | 'output' = 'input',
): Endpoint => ({ kind: 'pole', elementId, poleIndex, side })
export const term = (
  terminalBlockId: string,
  terminalIndex: number,
  contactSide: ContactSide = 'left',
): Endpoint => ({
  kind: 'terminal',
  terminalBlockId,
  terminalIndex,
  contactSide,
})

/** A busbar feed endpoint (feedIndex 0 = L, 1 = N). */
export const feed = (busbarId: string, feedIndex = 0): Endpoint => ({
  kind: 'busbar',
  busbarId,
  feedIndex,
})

/** A busbar anchored at the device `firstElementId` covering `count` items. */
export function busbar(n: number, type: BusbarType, firstElementId: string, count: number): Busbar {
  return { id: id(n), type, colour: null, firstElementId, count }
}

export function element(
  n: number,
  offsetModules: number,
  widthModules = 2,
  poleCount = 2,
  over: Partial<DeviceElement> = {},
): DeviceElement {
  return {
    kind: 'device',
    style: 'breaker',
    state: null,
    id: id(n),
    offsetModules,
    widthModules,
    label: '',
    marking: '',
    on: true,
    sidesSwapped: false,
    poles: Array.from({ length: poleCount }, () => ({ transit: false })),
    ...over,
  }
}

/** A rail terminal block (width 1, 1..12 contacts). */
export function block(
  n: number,
  offsetModules: number,
  widthModules = 1,
  terminalCount = 2,
): TerminalBlock {
  return { id: id(n), offsetModules, widthModules, terminalCount, colour: null, label: '' }
}

/** A terminal-row block; the width follows `ceil(terminalCount / 2)`. */
export function rowBlock(n: number, offsetModules: number, terminalCount = 2): TerminalBlock {
  return {
    id: id(n),
    offsetModules,
    widthModules: Math.ceil(terminalCount / 2),
    terminalCount,
    colour: null,
    label: '',
  }
}

/** An ATS (2+ modules wide, state A by default). */
export function ats(
  n: number,
  offsetModules: number,
  widthModules = 2,
  over: Partial<AtsElement> = {},
): AtsElement {
  return {
    kind: 'ats',
    style: null,
    id: id(n),
    offsetModules,
    widthModules,
    label: '',
    marking: '',
    sidesSwapped: false,
    state: 'A',
    on: null,
    poles: null,
    ...over,
  }
}

/** The width a test asked for per rail; `content()` uses the widest one as the panel-wide rail width. */
const railWidthHint = new WeakMap<Rail, number>()

export function rail(
  n: number,
  widthModules = 24,
  spacingMm = 150,
  elements: (DeviceElement | AtsElement)[] = [],
  terminalBlocks: TerminalBlock[] = [],
  busbars: Busbar[] = [],
): Rail {
  const created: Rail = { id: id(n), spacingMm, elements, terminalBlocks, busbars }
  railWidthHint.set(created, widthModules)
  return created
}

export function inputCable(
  n: number,
  wireNumbers: number[],
  colours: WireColour[] = [],
): InputCable {
  return {
    id: id(n),
    label: '',
    voltage: 230,
    frequency: 50,
    crossSection: 4,
    wires: wireNumbers.map((w, i) => ({ id: id(w), colour: colours[i] ?? 'brown' })),
  }
}

export function outputCable(n: number, wireNumbers: number[]): OutputCable {
  return {
    id: id(n),
    label: '',
    description: '',
    wires: wireNumbers.map((w) => ({ id: id(w), colour: 'black' as const })),
  }
}

export function panelWire(
  n: number,
  start: Endpoint,
  end: Endpoint,
  bends: { x: number; y: number }[] = [],
): PanelWire {
  return { id: id(n), colour: 'brown', crossSection: '2.5', start, end, bends }
}

export function content(over: Partial<PanelContent> = {}): PanelContent {
  const hints = (over.rails ?? []).flatMap((r) => railWidthHint.get(r) ?? [])
  const widest = hints.length > 0 ? Math.max(...hints) : 24
  return {
    railWidthModules: widest,
    inputCables: [inputCable(1, [2])],
    inputCableSide: 'top',
    outputCableSide: 'bottom',
    outputCables: [],
    terminalRow: [],
    bottomTerminalRow: [],
    rails: [],
    wires: [],
    ...over,
  }
}

/** Runs a command and returns the successful outcome; throws on rejection. */
export function run(c: PanelContent, command: Command) {
  const outcome = command(c)
  if (!outcome.ok) throw new Error(`rejected: ${outcome.reason}`)
  return outcome
}

export function rejection(outcome: CommandOutcome): string | null {
  return outcome.ok ? null : outcome.reason
}

export function newWire(
  n: number,
  start: Endpoint,
  end: Endpoint,
  bends: { x: number; y: number }[] = [],
): NewWire {
  return { id: id(n), start, end, colour: 'brown', crossSection: '2.5', bends }
}

/** A valid wire spec whose bends are the automatic orthogonal route in the layout of `c`. */
export function autoWire(c: PanelContent, n: number, start: Endpoint, end: Endpoint): NewWire {
  const bends = autoRouteFor(computeLayout(c), { start, end }) ?? []
  return newWire(n, start, end, bends)
}

/** Command: adds a wire between two endpoints along the automatic orthogonal route. */
export const addAuto =
  (n: number, start: Endpoint, end: Endpoint): Command =>
  (c) =>
    addWire(autoWire(c, n, start, end))(c)

/**
 * World used by the command/route/store specs (all geometry hand-computed in the geometry spec):
 *  C1 (id1: wires id2 brown, id3 blue), O1 (id4: wire id5);
 *  R1 id10 24 modules, 150 mm: E1 id20 off 0 w2 2 poles, E2 id21 off 4 w1 1 pole, B1 id40 off 8 w1 3 terminals;
 *  R2 id11 24 modules, 100 mm: B2 id41 off 0 w1 2 terminals;
 *  wires (auto routed): W1 id30 cw2 -> E1.0 in; W2 id31 E1.1 out -> B1.2; W3 id32 B1.0 -> cw5; W4 id33 B2.1 -> E2.0 in.
 */
export function buildWorld(): PanelContent {
  let c = content({
    inputCables: [inputCable(1, [2, 3], ['brown', 'blue'])],
    outputCables: [outputCable(4, [5])],
    rails: [
      rail(10, 24, 150, [element(20, 0, 2, 2), element(21, 4, 1, 1)], [block(40, 8, 1, 3)]),
      rail(11, 24, 100, [], [block(41, 0, 1, 2)]),
    ],
  })
  const wires: [number, Endpoint, Endpoint][] = [
    [30, cw(id(2)), pole(id(20), 0, 'input')],
    [31, pole(id(20), 1, 'output'), term(id(40), 2)],
    [32, term(id(40), 0), cw(id(5))],
    [33, term(id(41), 1), pole(id(21), 0, 'input')],
  ]
  for (const [n, s, e] of wires) c = run(c, addAuto(n, s, e)).content
  return c
}
