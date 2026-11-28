/** Opening a `layoutVersion` 1 panel: re-draws it for the compact cable layout (panel-domain "Layout migration notes"). */
import { computeLayout } from './geometry'
import { computeLayoutV1 } from './geometryV1'
import { CURRENT_LAYOUT_VERSION, type PanelContent } from './panelContent'
import { autoRouteFor, repairRoutes } from './routes'
import { routeEquals } from './autoRoute'

export interface LayoutConversion {
  content: PanelContent
  /** Wires whose bends changed (0 for a panel that needed no change). */
  rerouted: number
}

/**
 * Converts a `layoutVersion` 1 panel to the current layout: wires with an endpoint on a cable get a
 * fresh automatic route; every other wire is repaired between the v1 and the current layout like after
 * any layout change. Sets `layoutVersion` to the current version. A panel already on the current
 * layout is returned as it is.
 */
export function convertLayout(content: PanelContent): LayoutConversion {
  if (content.layoutVersion >= CURRENT_LAYOUT_VERSION) return { content, rerouted: 0 }
  const after: PanelContent = { ...content, layoutVersion: CURRENT_LAYOUT_VERSION }
  const layouts = { before: computeLayoutV1(content), after: computeLayout(after) }
  const onCable = new Set(
    content.wires
      .filter((w) => w.start.kind === 'cableWire' || w.end.kind === 'cableWire')
      .map((w) => w.id),
  )
  const others = new Set(content.wires.filter((w) => !onCable.has(w.id)).map((w) => w.id))
  const repaired = repairRoutes(content, after, others, layouts)
  const wires = repaired.wires.map((w) =>
    onCable.has(w.id) ? { ...w, bends: autoRouteFor(layouts.after, w) ?? w.bends } : w,
  )
  const before = new Map(content.wires.map((w) => [w.id, w.bends]))
  const rerouted = wires.filter((w) => !routeEquals(w.bends, before.get(w.id) ?? [])).length
  return { content: { ...repaired, wires: rerouted === 0 ? repaired.wires : wires }, rerouted }
}
