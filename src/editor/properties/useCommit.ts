import type { Command } from '@/domain/commands'
import type { MessageKey } from '@/domain/translate'
import { t } from '@/i18n'
import { useEditorContext } from '../useEditor'

/** Helpers shared by the property forms. */
export function useCommit() {
  const ctx = useEditorContext()

  /** Parses a user-typed number (comma or dot); NaN for anything else. */
  function num(text: string): number {
    const t = text.trim().replace(',', '.')
    return t === '' ? Number.NaN : Number(t)
  }

  /** Runs a command when the value parsed; reports invalid input as a rejection. */
  function commit(value: number | null, make: (v: number) => Command, label: MessageKey) {
    if (value === null || Number.isNaN(value)) {
      ctx.say(t('editor.rejection.invalid'), 'error')
      return
    }
    ctx.run(make(value), label)
  }

  return { ctx, store: ctx.store, num, commit }
}
