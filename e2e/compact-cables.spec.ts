import { expect, test, type Page } from '@playwright/test'
import {
  cableEnd,
  element,
  id,
  mockApi,
  panelContent,
  pickOption,
  poleEnd,
  rail,
  server,
  wire,
} from './support'

// the wrapped output band lies below the fold of the default 720 px viewport
test.use({ viewport: { width: 1280, height: 1100 } })

const unsaved = '● Є незбережені зміни'
const saved = 'Усі зміни збережено'
const notice = 'Маршрут 1 дроту оновлено під новий макет'

async function open(page: Page, s: ReturnType<typeof server>) {
  await mockApi(page, s)
  await page.goto('/panels/p1')
  await expect(page.getByRole('heading', { name: s.name, level: 1 })).toBeVisible()
}

const outputCable = (n: number, wires: number, load: 'socket' | 'lighting' = 'socket') => ({
  id: id(100 + n),
  label: '',
  description: '',
  load,
  wires: Array.from({ length: wires }, (_, w) => ({ id: id(1000 + n * 10 + w), colour: 'brown' })),
})

test('many outputs wrap within the rail: no output box passes the rail right edge', async ({
  page,
}) => {
  // 10 modules = 175 mm; a 4-wire box is 25 mm long, so 6 fit on a line and 12 need two lines
  const content = panelContent({
    railWidthModules: 10,
    outputCables: Array.from({ length: 12 }, (_, i) => outputCable(i, 4)),
  })
  await open(page, server(content))
  const boxes = page.getByTestId('output-cable')
  await expect(boxes).toHaveCount(12)
  const rail = (await page.getByTestId('rail').boundingBox())!
  const rects = await boxes.evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect()
      return { left: r.left, right: r.right, top: r.top }
    }),
  )
  for (const r of rects) {
    expect(r.right).toBeLessThanOrEqual(rail.x + rail.width + 0.5)
    expect(r.left).toBeGreaterThanOrEqual(rail.x - 0.5)
  }
  const lines = new Set(rects.map((r) => Math.round(r.top)))
  expect(lines.size).toBeGreaterThanOrEqual(2)
  // every wire point is still there
  await expect(page.locator('[data-ep-kind="cableWire"]')).toHaveCount(2 + 48)
})

test('few outputs stay on a single line', async ({ page }) => {
  const content = panelContent({
    railWidthModules: 10,
    outputCables: Array.from({ length: 3 }, (_, i) => outputCable(i, 4)),
  })
  await open(page, server(content))
  const tops = await page
    .getByTestId('output-cable')
    .evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)))
  expect(new Set(tops).size).toBe(1)
})

test('opening a v1 panel shows the layout notice and the dirty state; saving sends layoutVersion 2', async ({
  page,
}) => {
  const e = element(20, 0, 2, 2)
  const content = panelContent({
    layoutVersion: 1,
    rails: [rail(10, [e])],
    wires: [
      wire(30, cableEnd(id(2)), poleEnd(id(20), 0, 'input'), [
        { x: 30, y: 100 },
        { x: 28.8, y: 100 },
      ]),
    ],
  })
  const s = server(content)
  await open(page, s)
  await expect(page.getByText(notice)).toBeVisible()
  await expect(page.getByText(unsaved)).toBeVisible()
  expect(s.puts).toHaveLength(0)

  await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
  await expect(page.getByText(saved)).toBeVisible()
  await expect(page.getByText(notice)).toHaveCount(0)
  expect(s.puts).toHaveLength(1)
  expect(s.puts[0]?.content.layoutVersion).toBe(2)
})

test('a v1 panel with no wire to change opens clean, without a notice', async ({ page }) => {
  const s = server(panelContent({ layoutVersion: 1 }))
  await open(page, s)
  await expect(page.getByText(saved)).toBeVisible()
  await expect(page.getByText(/оновлено під новий макет/)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Зберегти', exact: true })).toBeDisabled()
})

test('a v2 panel opens without a notice', async ({ page }) => {
  await open(page, server(panelContent()))
  await expect(page.getByText(saved)).toBeVisible()
  await expect(page.getByText(/оновлено під новий макет/)).toHaveCount(0)
})

test('changing the load in the properties switches the icon and is saved', async ({ page }) => {
  const s = server(panelContent({ outputCables: [outputCable(0, 2)] }))
  await open(page, s)
  const icon = (kind: string) => page.locator(`[data-testid="cable-icon"][data-icon="${kind}"]`)
  await expect(icon('socket')).toHaveCount(1)
  await expect(icon('lighting')).toHaveCount(0)

  await page.getByTestId('output-cable').click()
  await pickOption(page, 'Навантаження', 'Освітлення')
  await expect(icon('lighting')).toHaveCount(1)
  await expect(icon('socket')).toHaveCount(0)
  await expect(page.getByText(unsaved)).toBeVisible()

  await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
  await expect(page.getByText(saved)).toBeVisible()
  expect(s.puts).toHaveLength(1)
  const outputs = s.puts[0]?.content.outputCables as { load: string }[]
  expect(outputs.map((o) => o.load)).toEqual(['lighting'])

  await page.reload()
  await expect(icon('lighting')).toHaveCount(1)
})
