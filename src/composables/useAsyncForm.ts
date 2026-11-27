import { computed, ref } from 'vue'
import { describeError } from '@/api/errorMessages'
import { ApiError } from '@/api/problem'

const UNEXPECTED_MESSAGE = 'Неочікувана відповідь сервера. Оновіть сторінку.'

/** Submit state for a form: in-flight flag, API error, field errors and a generic message. */
export function useAsyncForm(fields: readonly string[] = []) {
  const pending = ref(false)
  const error = ref<ApiError | null>(null)
  const unexpected = ref(false)

  const fieldErrors = computed<Record<string, string[]>>(() => error.value?.violations ?? {})
  const message = computed(() => {
    if (unexpected.value) return UNEXPECTED_MESSAGE
    const current = error.value
    if (current === null) return ''
    // Validation errors are shown inline, unless some violation has no field to render it.
    if (
      current.type === 'validation' &&
      Object.keys(current.violations).every((k) => fields.includes(k))
    )
      return ''
    return describeError(current)
  })

  /**
   * Runs `action`; returns its result, or undefined if it failed. An ApiError is kept in `error`;
   * any other failure (e.g. an invalid payload) is shown as a generic message, never rethrown.
   */
  async function run<T>(action: () => Promise<T>): Promise<T | undefined> {
    if (pending.value) return undefined
    pending.value = true
    error.value = null
    unexpected.value = false
    try {
      return await action()
    } catch (e) {
      if (e instanceof ApiError) error.value = e
      else unexpected.value = true
      return undefined
    } finally {
      pending.value = false
    }
  }

  return { pending, error, fieldErrors, message, run }
}
