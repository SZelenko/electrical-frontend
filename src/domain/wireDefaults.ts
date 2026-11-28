/** Default wire colour from the start contact (W3, extended for coloured terminal blocks). */
import { endpointKey, type Endpoint, type PanelContent, type WireColour } from './panelContent'

/**
 * A cable-wire contact gives its wire's colour; a contact of a coloured terminal block gives the
 * block's colour; a busbar feed gives brown (L) or blue (N); otherwise a pole or terminal gives the
 * colour of the first wire (in draw order) already attached to it; otherwise `fallback`.
 */
export function defaultWireColour(
  content: PanelContent,
  start: Endpoint,
  fallback: WireColour,
): WireColour {
  if (start.kind === 'cableWire') {
    for (const cable of [...content.inputCables, ...content.outputCables]) {
      const wire = cable.wires.find((w) => w.id === start.cableWireId)
      if (wire) return wire.colour
    }
    return fallback
  }
  if (start.kind === 'terminal') {
    const blocks = [
      ...content.terminalRow,
      ...content.bottomTerminalRow,
      ...content.rails.flatMap((r) => r.terminalBlocks),
    ]
    const colour = blocks.find((b) => b.id === start.terminalBlockId)?.colour
    if (colour) return colour
  }
  if (start.kind === 'busbar') {
    // feed L is brown, feed N blue
    return start.feedIndex === 0 ? 'brown' : 'blue'
  }
  const key = endpointKey(start)
  const attached = content.wires.find(
    (w) => endpointKey(w.start) === key || endpointKey(w.end) === key,
  )
  return attached?.colour ?? fallback
}
