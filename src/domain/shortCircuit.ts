/** Short-circuit check: mirrors the backend ShortCircuitChecker (union-find over electrical nodes). */
import { busbarCover, coveredDevices, railItems } from './busbars'
import {
  endpointKey,
  type Endpoint,
  type NodeEndpoint,
  type PanelContent,
  type ShortCircuit,
} from './panelContent'

function byCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function withoutContactSide(e: Endpoint): NodeEndpoint {
  return e.kind === 'terminal'
    ? { kind: 'terminal', terminalBlockId: e.terminalBlockId, terminalIndex: e.terminalIndex }
    : e
}

/** Groups holding two or more input-cable wires, sorted by their first source id. */
export function checkShortCircuits(content: PanelContent): ShortCircuit[] {
  const parent = new Map<string, string>()
  const find = (node: string): string => {
    if (!parent.has(node)) parent.set(node, node)
    let root = node
    for (let p = parent.get(root); p !== undefined && p !== root; p = parent.get(root)) root = p
    let cur = node
    while (cur !== root) {
      const next = parent.get(cur) as string
      parent.set(cur, root)
      cur = next
    }
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(rb, ra)
  }

  const sourceNodes = new Map<string, string>()
  for (const cable of content.inputCables) {
    for (const wire of cable.wires) {
      sourceNodes.set(`w:${wire.id}`, wire.id)
      find(`w:${wire.id}`)
    }
  }
  for (const wire of content.wires) union(endpointKey(wire.start), endpointKey(wire.end))
  const bar = (block: { id: string; terminalCount: number }) => {
    for (let i = 1; i < block.terminalCount; i++) union(`t:${block.id}:0`, `t:${block.id}:${i}`)
  }
  content.terminalRow.forEach(bar)
  for (const rail of content.rails) {
    for (const element of rail.elements) {
      if (element.kind === 'ats') {
        // A: out1-in1, out2-in2; B: out1-in3, out2-in4; off joins nothing (A and B never join each other).
        if (element.state === 'off') continue
        const first = element.state === 'A' ? 0 : 2
        union(`p:${element.id}:${first}:input`, `p:${element.id}:0:output`)
        union(`p:${element.id}:${first + 1}:input`, `p:${element.id}:1:output`)
        continue
      }
      element.poles.forEach((pole, i) => {
        if (element.on || pole.transit) {
          union(`p:${element.id}:${i}:input`, `p:${element.id}:${i}:output`)
        }
      })
    }
    rail.terminalBlocks.forEach(bar)
    // Busbars join feed L to the first input and (LN) feed N to the second input of every covered
    // device; tolerant of an invalid busbar: only the devices of its (clamped) covered set count.
    if (rail.busbars.length > 0) {
      const items = railItems(rail)
      for (const busbar of rail.busbars) {
        const cover = busbarCover(rail, busbar, items)
        if (!cover) continue
        for (const device of coveredDevices(cover)) {
          union(`b:${busbar.id}:0`, `p:${device.id}:0:input`)
          if (busbar.type === 'LN' && device.poles.length >= 2) {
            union(`b:${busbar.id}:1`, `p:${device.id}:1:input`)
          }
        }
      }
    }
  }

  const sourcesByRoot = new Map<string, string[]>()
  for (const [node, wireId] of sourceNodes) {
    const root = find(node)
    const list = sourcesByRoot.get(root)
    if (list) list.push(wireId)
    else sourcesByRoot.set(root, [wireId])
  }
  const shorted = new Map([...sourcesByRoot].filter(([, sources]) => sources.length >= 2))
  if (shorted.size === 0) return []

  const wiresByRoot = new Map<string, string[]>()
  const endpointsByRoot = new Map<string, Map<string, NodeEndpoint>>()
  for (const wire of content.wires) {
    const root = find(endpointKey(wire.start))
    if (!shorted.has(root)) continue
    const ids = wiresByRoot.get(root) ?? []
    ids.push(wire.id)
    wiresByRoot.set(root, ids)
    const eps = endpointsByRoot.get(root) ?? new Map<string, NodeEndpoint>()
    // first occurrence per node in wire order (start before end), contact side stripped
    for (const end of [wire.start, wire.end]) {
      const key = endpointKey(end)
      if (!eps.has(key)) eps.set(key, withoutContactSide(end))
    }
    endpointsByRoot.set(root, eps)
  }

  const groups: ShortCircuit[] = []
  for (const [root, sources] of shorted) {
    const eps = endpointsByRoot.get(root)
    groups.push({
      sources: [...sources].sort(byCodeUnits),
      wireIds: [...(wiresByRoot.get(root) ?? [])].sort(byCodeUnits),
      terminals: eps ? [...eps].sort(([a], [b]) => byCodeUnits(a, b)).map(([, e]) => e) : [],
    })
  }
  return groups.sort((a, b) => byCodeUnits(a.sources[0] as string, b.sources[0] as string))
}

/** Wire ids that belong to any short-circuit group (for highlighting). */
export function shortCircuitWireIds(groups: readonly ShortCircuit[]): Set<string> {
  return new Set(groups.flatMap((g) => g.wireIds))
}
