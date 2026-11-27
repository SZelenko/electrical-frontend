/**
 * Busbars: the covered-set walk shared by validation, the short-circuit check, the geometry and the
 * editor commands (one implementation, mirrored by the backend `BusbarCoverage`).
 *
 * A busbar covers its anchor and the next `count - 1` items of the rail in offset order (elements and
 * rail terminal blocks together). It is valid when those items are all devices, adjacent (no free
 * module between them) and share one `sidesSwapped`.
 */
import { MAX_BUSBAR_COUNT, MIN_BUSBAR_COUNT, BUSBAR_TYPES } from './limits'
import type { Busbar, DeviceElement, PanelContent, PanelElement, Rail } from './panelContent'

/** An item of a rail: an element (`element` set) or a terminal block (`element` null). */
export interface RailItem {
  id: string
  offset: number
  width: number
  element: PanelElement | null
}

/** Elements and terminal blocks of a rail merged in offset order (stable for equal offsets). */
export function railItems(rail: Rail): RailItem[] {
  const items: RailItem[] = [
    ...rail.elements.map((e) => ({
      id: e.id,
      offset: e.offsetModules,
      width: e.widthModules,
      element: e,
    })),
    ...rail.terminalBlocks.map((b) => ({
      id: b.id,
      offset: b.offsetModules,
      width: b.widthModules,
      element: null,
    })),
  ]
  return items.sort((a, b) => a.offset - b.offset)
}

/** What is wrong with the covered items, in the order the walk finds it (the first problem wins). */
export type CoverIssue = 'tooFew' | 'notDevice' | 'gap' | 'mixedSwap'

export interface BusbarCover {
  /** The anchor and the following items, at most `count` (clamped to the items the rail has). */
  items: RailItem[]
  issue: CoverIssue | null
}

/** The covered set of a busbar; `null` when its anchor is not an element of the rail. */
export function busbarCover(
  rail: Rail,
  busbar: Busbar,
  items: readonly RailItem[] = railItems(rail),
): BusbarCover | null {
  const a = items.findIndex((i) => i.id === busbar.firstElementId && i.element !== null)
  const anchor = items[a]
  if (!anchor) return null
  const covered: RailItem[] = [anchor]
  let issue: CoverIssue | null = null
  for (let k = 1; k < busbar.count; k++) {
    const item = items[a + k]
    if (!item) {
      issue ??= 'tooFew'
      break
    }
    if (issue === null) {
      const prev = covered[k - 1] as RailItem
      if (item.element?.kind !== 'device') issue = 'notDevice'
      else if (item.offset !== prev.offset + prev.width) issue = 'gap'
    }
    covered.push(item)
  }
  if (issue === null) {
    const devices = covered.flatMap((i) => (i.element?.kind === 'device' ? [i.element] : []))
    const first = devices[0]
    if (first && devices.some((d) => d.sidesSwapped !== first.sidesSwapped)) issue = 'mixedSwap'
  }
  return { items: covered, issue }
}

/** The devices a busbar joins (ATS and terminal blocks in the covered set are skipped). */
export function coveredDevices(cover: BusbarCover): DeviceElement[] {
  return cover.items.flatMap((i) => (i.element?.kind === 'device' ? [i.element] : []))
}

/** Ids of the devices covered by the busbars of a rail, optionally leaving one busbar out. */
export function coveredDeviceIds(
  rail: Rail,
  ignoreBusbarId: string | null,
  items: readonly RailItem[] = railItems(rail),
): Set<string> {
  const ids = new Set<string>()
  for (const busbar of rail.busbars) {
    if (busbar.id === ignoreBusbarId) continue
    const cover = busbarCover(rail, busbar, items)
    if (cover) for (const d of coveredDevices(cover)) ids.add(d.id)
  }
  return ids
}

/**
 * How many devices a busbar anchored at `anchorId` can cover: the anchor plus the adjacent devices to
 * its right that have the same `sidesSwapped` and are not covered by another busbar (0 when the anchor
 * is not a free device). `ignoreBusbarId` leaves the busbar being changed out of the "covered" set.
 */
export function maxBusbarCount(
  rail: Rail,
  anchorId: string,
  ignoreBusbarId: string | null = null,
): number {
  const items = railItems(rail)
  const a = items.findIndex((i) => i.id === anchorId)
  const anchor = items[a]?.element
  if (anchor?.kind !== 'device') return 0
  const taken = coveredDeviceIds(rail, ignoreBusbarId, items)
  if (taken.has(anchorId)) return 0
  let n = 1
  while (n < MAX_BUSBAR_COUNT) {
    const next = items[a + n]
    const prev = items[a + n - 1] as RailItem
    if (
      next?.element?.kind !== 'device' ||
      next.element.sidesSwapped !== anchor.sidesSwapped ||
      next.offset !== prev.offset + prev.width ||
      taken.has(next.id)
    ) {
      break
    }
    n++
  }
  return n
}

/** The busbar whose covered set contains the device, with its cover; `null` when none does. */
export function busbarCovering(
  rail: Rail,
  elementId: string,
): { busbar: Busbar; cover: BusbarCover } | null {
  const items = railItems(rail)
  for (const busbar of rail.busbars) {
    const cover = busbarCover(rail, busbar, items)
    if (cover?.items.some((i) => i.id === elementId && i.element !== null)) return { busbar, cover }
  }
  return null
}

export type BusbarIssueKind =
  'type' | 'anchorMissing' | 'anchorAts' | 'count' | CoverIssue | 'overlap'

export interface BusbarIssue {
  /** Property of the busbar the violation is reported on; `busbar` = the busbar itself. */
  field: 'type' | 'firstElementId' | 'count' | 'busbar'
  kind: BusbarIssueKind
  /** The backend's message (English, as in the 422 violations). */
  message: string
}

/**
 * Problems of one busbar, mirroring the backend validator. `items` is `null` when the rail has
 * offset/width/fit/overlap violations (the coverage walk is skipped then). `covered` collects the
 * devices of the busbars checked so far on the rail (coverage must be disjoint) and is updated here.
 */
export function busbarIssues(
  rail: Rail,
  busbar: Busbar,
  items: readonly RailItem[] | null,
  covered: Set<string>,
): BusbarIssue[] {
  const issues: BusbarIssue[] = []
  const add = (field: BusbarIssue['field'], kind: BusbarIssueKind, message: string) =>
    issues.push({ field, kind, message })
  if (!BUSBAR_TYPES.includes(busbar.type)) {
    add('type', 'type', `Must be one of ${BUSBAR_TYPES.join(', ')}.`)
  }
  const countOk =
    Number.isInteger(busbar.count) &&
    busbar.count >= MIN_BUSBAR_COUNT &&
    busbar.count <= MAX_BUSBAR_COUNT
  if (!countOk) {
    add('count', 'count', `Must be between ${MIN_BUSBAR_COUNT} and ${MAX_BUSBAR_COUNT}.`)
  }
  const anchor = rail.elements.find((e) => e.id === busbar.firstElementId)
  if (!anchor) add('firstElementId', 'anchorMissing', 'Must refer to a device on the same rail.')
  else if (anchor.kind !== 'device') {
    add('firstElementId', 'anchorAts', 'Must refer to a device, not an ATS.')
  }
  if (anchor?.kind !== 'device' || !countOk || items === null) return issues

  const cover = busbarCover(rail, busbar, items)
  if (!cover) return issues
  switch (cover.issue) {
    case 'tooFew':
      add(
        'count',
        'tooFew',
        `Fewer than ${busbar.count} consecutive devices from the anchor to the rail end.`,
      )
      break
    case 'notDevice':
      add(
        'count',
        'notDevice',
        'The covered items must all be devices (an ATS or a terminal block is in the way).',
      )
      break
    case 'gap':
      add('count', 'gap', 'The covered devices must be adjacent (no free modules between them).')
      break
    case 'mixedSwap':
      add('busbar', 'mixedSwap', 'All covered devices must have the same sidesSwapped.')
      break
    case null:
      break
  }
  let clash = false
  // the backend walk stops at the first problem: only the valid prefix takes part in the clash check
  const prefix: DeviceElement[] = []
  for (const [k, item] of cover.items.entries()) {
    const prev = cover.items[k - 1]
    if (item.element?.kind !== 'device' || (prev && item.offset !== prev.offset + prev.width)) break
    prefix.push(item.element)
  }
  for (const d of prefix) {
    if (covered.has(d.id)) clash = true
    covered.add(d.id)
  }
  if (clash) {
    add('firstElementId', 'overlap', 'Covers a device that another busbar already covers.')
  }
  return issues
}

/** Ids of the busbars that currently have a problem (for live highlighting in the editor). */
export function invalidBusbarIds(content: PanelContent): Set<string> {
  const ids = new Set<string>()
  for (const rail of content.rails) {
    if (rail.busbars.length === 0) continue
    const items = railItems(rail)
    const covered = new Set<string>()
    for (const busbar of rail.busbars) {
      if (busbarIssues(rail, busbar, items, covered).length > 0) ids.add(busbar.id)
    }
  }
  return ids
}

/** The problems of one busbar of the content, or an empty list (properties panel). */
export function issuesOfBusbar(rail: Rail, busbarId: string): BusbarIssue[] {
  const items = railItems(rail)
  const covered = new Set<string>()
  for (const busbar of rail.busbars) {
    const issues = busbarIssues(rail, busbar, items, covered)
    if (busbar.id === busbarId) return issues
  }
  return []
}
