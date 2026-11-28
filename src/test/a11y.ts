import type { DOMWrapper, VueWrapper } from '@vue/test-utils'

type Root =
  | Pick<VueWrapper, 'element' | 'find' | 'findAll'>
  | Pick<DOMWrapper<Element>, 'element' | 'find' | 'findAll'>

const rootEl = (root: Root) => root.element as Element

/** Elements an input points at with `aria-describedby` (its validation messages), in DOM order. */
function describedTargets(root: Root): Element[] {
  const el = rootEl(root)
  const found: Element[] = []
  for (const input of el.querySelectorAll('[aria-describedby]')) {
    for (const id of (input.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)) {
      const target = el.querySelector(`[id="${id}"]`) ?? el.ownerDocument.getElementById(id)
      if (target && !found.includes(target)) found.push(target)
    }
  }
  return found
}

/**
 * Texts of the validation messages of the fields in `root`, read through the inputs'
 * `aria-describedby` (not through Vuetify class names). Empty messages are skipped.
 */
export function fieldMessages(root: Root): string[] {
  return describedTargets(root)
    .map((t) => (t.textContent ?? '').trim())
    .filter((s) => s !== '')
}

/**
 * Form-level alerts (`role="alert"`) in `root`; the live regions that carry a field's own messages
 * (also `role="alert"` in Vuetify) are not included.
 */
export function alertsIn(root: Root) {
  const targets = describedTargets(root)
  return root
    .findAll('[role=alert]')
    .filter((a) => a.text() !== '') // an empty live region announces nothing
    .filter((a) => !targets.some((t) => t === a.element || t.contains(a.element)))
}

export const hasAlert = (root: Root) => alertsIn(root).length > 0

/** The text of the first form-level alert; throws when there is none (like `wrapper.get`). */
export function alertText(root: Root): string {
  const first = alertsIn(root)[0]
  if (!first) throw new Error('No role=alert element')
  return first.text()
}

const hidden = (el: Element) => {
  for (let n: Element | null = el; n; n = n.parentElement)
    if ((n as HTMLElement).style?.display === 'none') return true
  return false
}

/**
 * Open dialogs (`role="dialog"` / `"alertdialog"`) in `root`. Vuetify keeps a closed overlay's root
 * in the DOM with its content hidden (`display: none`), so a dialog is open when its title (the
 * `aria-labelledby` target) is visible.
 */
export function dialogsIn(root: Root) {
  const doc = rootEl(root).ownerDocument
  return root.findAll('[role=dialog], [role=alertdialog]').filter((d) => {
    const id = d.attributes('aria-labelledby')
    const probe = (id ? doc.getElementById(id) : null) ?? d.element.querySelector('*')
    return probe !== null && !hidden(probe)
  })
}
export const hasDialog = (root: Root) => dialogsIn(root).length > 0

/**
 * `root.find(selector)` when that overlay (snackbar, menu) is shown, otherwise a wrapper that does not
 * exist. Closed Vuetify overlays keep their root in the DOM with the content hidden (`display: none`).
 */
export function shown(root: Root, selector: string) {
  const found = root.find(selector)
  if (!found.exists()) return found
  const probe = found.element.querySelector('button') ?? found.element.querySelector('*')
  return probe !== null && !hidden(probe) ? found : root.find(':not(*)')
}
