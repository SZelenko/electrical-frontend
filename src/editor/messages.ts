import type { Rejection } from '@/domain/commands'
import type { BusbarIssueKind } from '@/domain/busbars'
import {
  MAX_BUSBARS_PER_RAIL,
  MAX_CABLE_WIRES,
  MAX_COORD_U,
  MAX_INPUT_CABLES,
  MAX_OUTPUT_CABLES,
  MAX_RAIL_BLOCK_TERMINALS,
  MAX_RAILS,
  MAX_ROW_BLOCK_TERMINALS,
  MAX_ROW_BLOCKS,
  MAX_WIRES,
} from '@/domain/limits'
import type { MessageKey, Translate } from '@/domain/translate'

/** Message and limit value per limit name reported by the commands. */
const LIMIT: Record<string, { key: MessageKey; max?: number }> = {
  rails: { key: 'editor.limit.rails', max: MAX_RAILS },
  'input cables': { key: 'editor.limit.inputCables', max: MAX_INPUT_CABLES },
  'output cables': { key: 'editor.limit.outputCables', max: MAX_OUTPUT_CABLES },
  'cable wires': { key: 'editor.limit.cableWires', max: MAX_CABLE_WIRES },
  wires: { key: 'editor.limit.wires', max: MAX_WIRES },
  bends: { key: 'editor.limit.bends' },
  'row blocks': { key: 'editor.limit.rowBlocks', max: MAX_ROW_BLOCKS },
  'row terminals': { key: 'editor.limit.rowTerminals', max: MAX_ROW_BLOCK_TERMINALS },
  'rail terminals': { key: 'editor.limit.railTerminals', max: MAX_RAIL_BLOCK_TERMINALS },
  busbars: { key: 'editor.limit.busbars', max: MAX_BUSBARS_PER_RAIL },
  coordinates: { key: 'editor.limit.coordinates', max: MAX_COORD_U / 10 },
}

export function rejectionText(reason: Rejection, t: Translate, detail?: string): string {
  if (reason === 'limit') {
    const limit = detail ? LIMIT[detail] : undefined
    if (!limit) return t('editor.limit.default')
    return limit.max === undefined ? t(limit.key) : t(limit.key, { max: limit.max })
  }
  if (reason === 'readOnly') return t('editor.readOnly')
  return t(`editor.rejection.${reason}`)
}

export function removedWiresText(n: number, t: Translate): string {
  return t('editor.removedWires', { n })
}

export function busbarIssueText(kind: BusbarIssueKind, t: Translate): string {
  return t(`editor.busbarIssue.${kind}`)
}
