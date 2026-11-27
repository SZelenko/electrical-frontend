import { onBeforeUnmount, onMounted } from 'vue'
import type { EditorContext } from './useEditor'

function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable
}

/** Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Delete and Esc; ignored while focus is in a form field. */
export function useEditorShortcuts(ctx: EditorContext) {
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (ctx.drawing.value) ctx.cancelDrawing()
      return
    }
    if (inTextField(e.target)) return
    if (e.key === 'Backspace' && ctx.drawing.value) {
      e.preventDefault()
      ctx.removeLastBend()
      return
    }
    const mod = e.ctrlKey || e.metaKey
    const key = e.key.toLowerCase()
    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault()
      ctx.undo()
    } else if (mod && ((key === 'z' && e.shiftKey) || key === 'y')) {
      e.preventDefault()
      ctx.redo()
    } else if (
      (e.key === 'Delete' || e.key === 'Backspace') &&
      ctx.store.selection &&
      !ctx.store.readOnly
    ) {
      e.preventDefault()
      ctx.deleteSelected()
    }
  }
  onMounted(() => window.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
}
