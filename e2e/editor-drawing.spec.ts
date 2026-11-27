import { expect, test, type Locator, type Page } from '@playwright/test'
import { element, id, mockApi, panelContent, press, rail, server } from './support'

async function open(page: Page) {
  const content = panelContent({
    inputCables: [
      {
        id: id(1),
        voltage: 230,
        frequency: 50,
        crossSection: 4,
        wires: [
          { id: id(2), colour: 'brown' },
          { id: id(3), colour: 'blue' },
        ],
      },
    ],
    rails: [rail(10, [element(20, 4, 2, 2)])],
  })
  const s = server(content)
  await mockApi(page, s)
  await page.goto('/panels/p1')
  await expect(page.getByRole('heading', { name: 'Щит' })).toBeVisible()
  return s
}

const centre = async (locator: Locator) => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
const cableWire = (page: Page, n: number) =>
  page.locator(`[data-ep-kind="cableWire"][data-ep-a="${id(n)}"]`)
const poleInput = (page: Page, i: number) =>
  page.locator(
    `[data-ep-kind="pole"][data-ep-a="${id(20)}"][data-ep-b="${i}"][data-ep-side="input"]`,
  )

/** Clicks on the empty sheet at an offset from the start contact (px). */
async function clickOffset(page: Page, from: { x: number; y: number }, dx: number, dy: number) {
  await page.mouse.click(from.x + dx, from.y + dy)
}

test('draws a wire with two manual bends, the contact colour and one undo step', async ({
  page,
}) => {
  await open(page)
  const blue = cableWire(page, 3)
  const startAt = await centre(blue)
  await press(blue)
  await expect(page.getByText('Клацайте на полі, щоб додати злам')).toBeVisible()
  await clickOffset(page, startAt, 2, 70) // bend 1: straight down from the contact
  await clickOffset(page, startAt, 120, 70) // bend 2: to the right of bend 1
  await expect(page.locator('polyline.rubber')).toHaveCount(1)
  await press(poleInput(page, 0))
  await expect(page.getByTestId('wire')).toHaveCount(1)
  await expect(page.getByText('Клацайте на полі')).toHaveCount(0)
  // two clicks plus the automatic elbow in front of the contact
  await expect(page.getByTestId('bend')).toHaveCount(3)
  // the start contact is the blue cable wire: the wire is blue, not the toolbar's brown
  await expect(page.locator('path[stroke="#1e5bd6"]')).not.toHaveCount(0)
  await expect(page.locator('path[stroke="#7b4a1e"]')).toHaveCount(0)
  await page.getByRole('button', { name: /^Скасувати: Додати провід/ }).click()
  await expect(page.getByTestId('wire')).toHaveCount(0)
})

test('Backspace removes the last bend while drawing', async ({ page }) => {
  await open(page)
  const brown = cableWire(page, 2)
  const startAt = await centre(brown)
  await press(brown)
  await clickOffset(page, startAt, 2, 70)
  await clickOffset(page, startAt, 120, 70)
  await page.keyboard.press('Backspace')
  await press(poleInput(page, 1))
  await expect(page.getByTestId('wire')).toHaveCount(1)
  // one remaining click plus the elbow
  await expect(page.getByTestId('bend')).toHaveCount(2)
  await expect(page.locator('path[stroke="#7b4a1e"]')).not.toHaveCount(0)
})

test('Escape and the start contact cancel a wire in progress', async ({ page }) => {
  await open(page)
  const brown = cableWire(page, 2)
  const startAt = await centre(brown)
  await press(brown)
  await clickOffset(page, startAt, 2, 70)
  await page.keyboard.press('Escape')
  await expect(page.getByText('Клацайте на полі')).toHaveCount(0)
  await press(brown)
  await press(brown)
  await expect(page.getByText('Клацайте на полі')).toHaveCount(0)
  await expect(page.getByTestId('wire')).toHaveCount(0)
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()
})

test('a wire drawn straight between aligned contacts has no bends', async ({ page }) => {
  await open(page)
  await press(cableWire(page, 2))
  await press(cableWire(page, 3))
  await expect(page.getByTestId('wire')).toHaveCount(1)
  await expect(page.getByTestId('bend')).toHaveCount(0)
})
