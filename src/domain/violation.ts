/**
 * A validation violation as the backend reports it (422 `violations[]`) and `validateContent`
 * produces it: a stable code with parameters, plus the English message for logs and unknown codes.
 * See `panel-domain`, "Violation codes".
 */
import type { MessageKey, Translate } from './translate'

export type ViolationParameters = Record<string, string | number | boolean>

export interface ViolationInfo {
  code: string
  message: string
  /** `[]` and `{}` both mean "no parameters" (the API sends either). */
  parameters?: ViolationParameters | readonly unknown[]
}

/** Parameters as a plain record; an empty list or a non-object means none. */
export function violationParameters(parameters: ViolationInfo['parameters']): ViolationParameters {
  if (typeof parameters !== 'object' || parameters === null || Array.isArray(parameters)) return {}
  return parameters as ViolationParameters
}

function isRowId(value: unknown): value is 'top' | 'bottom' {
  return value === 'top' || value === 'bottom'
}

/**
 * The violation in the current language: `violations.<code>` filled with the parameters, or the
 * English `message` when the code is unknown or empty.
 */
export function violationText(v: ViolationInfo, t: Translate): string {
  if (v.code === '') return v.message
  const params: Record<string, string | number> = {}
  for (const [name, value] of Object.entries(violationParameters(v.parameters))) {
    params[name] = typeof value === 'boolean' ? String(value) : value
  }
  // `row` is `top` / `bottom`: the message wants it in the language's own words
  const row = params.row
  if (isRowId(row)) params.row = t(`domain.rowIn.${row}`)
  // `fields` is comma-joined: "a, b and c"
  const fields = params.fields
  if (typeof fields === 'string') {
    const list = fields.split(',')
    const last = list.pop() ?? ''
    params.fields = list.length === 0 ? last : t('common.listAnd', { head: list.join(', '), last })
  }
  const key = `violations.${v.code}`
  const text = t(key as MessageKey, params)
  return text === key ? v.message : text
}
