import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { panelsApi, type Panel, type PanelListItem } from '@/api/panels'

/** Server page size of /panels* (API Platform default). */
export const PANELS_PAGE_SIZE = 30

export function pageCount(totalItems: number, pageSize = PANELS_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(totalItems / pageSize))
}

function listFields(panel: PanelListItem): PanelListItem {
  const { id, name, version, createdAt, updatedAt, deletedAt } = panel
  return { id, name, version, createdAt, updatedAt, deletedAt }
}

/**
 * Panel lists (active and trash) and the currently opened panel. Actions throw ApiError.
 * Mutations do not reload lists: the caller calls `refreshList`/`refreshTrash` afterwards, so a
 * failed reload is never reported as a failed mutation.
 */
export const usePanelsStore = defineStore('panels', () => {
  const items = ref<PanelListItem[]>([])
  const total = ref(0)
  const page = ref(1)
  const trashItems = ref<PanelListItem[]>([])
  const trashTotal = ref(0)
  const trashPage = ref(1)
  const current = ref<Panel | null>(null)
  let panelRequest = 0

  const pages = computed(() => pageCount(total.value))
  const trashPages = computed(() => pageCount(trashTotal.value))

  async function loadList(targetPage = page.value) {
    const result = await panelsApi.list(targetPage)
    items.value = result.items
    total.value = result.totalItems
    page.value = targetPage
  }

  async function loadTrash(targetPage = trashPage.value) {
    const result = await panelsApi.trash(targetPage)
    trashItems.value = result.items
    trashTotal.value = result.totalItems
    trashPage.value = targetPage
  }

  /** Reloads the current page; steps back when the page became empty after removals. */
  function refreshList() {
    return loadList(items.value.length === 0 && page.value > 1 ? page.value - 1 : page.value)
  }

  function refreshTrash() {
    return loadTrash(
      trashItems.value.length === 0 && trashPage.value > 1 ? trashPage.value - 1 : trashPage.value,
    )
  }

  async function create(name: string): Promise<Panel> {
    const panel = await panelsApi.create(name)
    current.value = panel
    return panel
  }

  /**
   * Loads a panel into `current`. A response (or error) that arrives after a newer load started
   * is ignored; returns false in that case.
   */
  async function loadPanel(id: string): Promise<boolean> {
    const request = ++panelRequest
    current.value = null
    try {
      const panel = await panelsApi.get(id)
      if (request !== panelRequest) return false
      current.value = panel
      return true
    } catch (error) {
      if (request !== panelRequest) return false
      throw error
    }
  }

  /** Renames a panel; only name/version/updatedAt are applied to local copies, never the content. */
  async function rename(id: string, name: string) {
    const updated = await panelsApi.rename(id, name)
    const fields = listFields(updated)
    if (current.value?.id === id) {
      current.value = {
        ...current.value,
        name: fields.name,
        version: fields.version,
        updatedAt: fields.updatedAt,
      }
    }
    for (const list of [items.value, trashItems.value]) {
      const index = list.findIndex((p) => p.id === id)
      if (index !== -1) list[index] = fields
    }
  }

  async function moveToTrash(id: string) {
    await panelsApi.remove(id)
    if (current.value?.id === id) current.value = null
    items.value = items.value.filter((p) => p.id !== id)
  }

  async function restore(id: string) {
    await panelsApi.restore(id)
    trashItems.value = trashItems.value.filter((p) => p.id !== id)
  }

  async function deletePermanently(id: string) {
    await panelsApi.removePermanently(id)
    trashItems.value = trashItems.value.filter((p) => p.id !== id)
  }

  return {
    items,
    total,
    page,
    pages,
    trashItems,
    trashTotal,
    trashPage,
    trashPages,
    current,
    loadList,
    loadTrash,
    refreshList,
    refreshTrash,
    create,
    loadPanel,
    rename,
    moveToTrash,
    restore,
    deletePermanently,
  }
})
