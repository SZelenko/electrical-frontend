import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  cableEnd,
  element,
  id,
  mockApi,
  panelContent,
  poleEnd,
  rail,
  server,
  wire,
} from './support'

/** The backend answers for unchanged content, so a panel saved with a short circuit lists it on load. */
const shortOf = (...wireIds: number[]) => [
  { sources: [id(2), id(3)], wireIds: wireIds.map(id).sort(), terminals: [] },
]

async function open(page: Page, content = panelContent(), shortCircuits: unknown[] = []) {
  const s = server(content, { shortCircuits })
  await mockApi(page, s)
  await page.goto('/panels/p1')
  await expect(page.getByRole('heading', { name: 'Щит', level: 1 })).toBeVisible()
  return s
}

const centre = async (locator: Locator) => {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 })
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
}
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })
const noShort = (page: Page) => page.getByText('КЗ не виявлено.')
const oneShort = (page: Page) => page.getByRole('heading', { name: 'Короткі замикання: 1' })

/** A breaker between the two cable wires: both are joined while it is on. */
const wiredBreaker = () =>
  panelContent({
    rails: [rail(10, [element(20, 2, 1, 1)])],
    wires: [
      wire(30, cableEnd(id(2)), poleEnd(id(20), 0, 'input')),
      wire(31, poleEnd(id(20), 0, 'output'), cableEnd(id(3))),
    ],
  })

const atsElement = {
  kind: 'ats',
  style: null,
  state: 'A',
  on: null,
  poles: null,
  id: id(23),
  offsetModules: 2,
  widthModules: 2,
  label: '',
  marking: '',
  sidesSwapped: false,
}

test('adds every device style from the toolbar', async ({ page }) => {
  await open(page)
  await page
    .getByTestId('rail')
    .first()
    .click({ position: { x: 20, y: 5 } })
  await button(page, 'Додати автомат').click()
  await button(page, 'Додати ПЗВ').click()
  await button(page, 'Додати реле напруги').click()
  for (const style of ['breaker', 'rcd', 'voltageRelay']) {
    await expect(
      page.locator(`[data-testid="element"][data-element-style="${style}"]`),
    ).toHaveCount(1)
  }
  await expect(page.getByTestId('toggle')).toHaveCount(3)
  await expect(page.getByLabel('Перемкнути автомат (зараз: увімкнено)')).toHaveCount(1)
  await expect(page.getByLabel('Перемкнути ПЗВ (зараз: увімкнено)')).toHaveCount(1)
  await expect(page.getByLabel('Перемкнути реле напруги (зараз: увімкнено)')).toHaveCount(1)
})

test('clicking the breaker lever switches it off, removes the short circuit and undo brings it back', async ({
  page,
}) => {
  await open(page, wiredBreaker(), shortOf(30, 31))
  await expect(oneShort(page)).toBeVisible()
  await page.getByTestId('toggle').click()
  await expect(page.getByLabel('Перемкнути автомат (зараз: вимкнено)')).toHaveCount(1)
  await expect(noShort(page)).toBeVisible()
  await expect(page.locator('path[stroke="#ff00ff"]')).toHaveCount(0)
  await page.getByTestId('toggle').click()
  await expect(oneShort(page)).toBeVisible()
  await page.getByTestId('toggle').click()
  await expect(noShort(page)).toBeVisible()
  // each click is one undo step named "Перемкнути"
  await page.getByRole('button', { name: /^Скасувати: Перемкнути/ }).click()
  await expect(oneShort(page)).toBeVisible()
  await expect(page.getByLabel('Перемкнути автомат (зараз: увімкнено)')).toHaveCount(1)
})

test('the voltage relay display shows 220 when on and --- when off', async ({ page }) => {
  await open(
    page,
    panelContent({ rails: [rail(10, [element(20, 2, 2, 2, { style: 'voltageRelay' })])] }),
  )
  await expect(page.locator('svg text', { hasText: '220' })).toHaveCount(1)
  await page.getByTestId('toggle').click()
  await expect(page.locator('svg text', { hasText: '---' })).toHaveCount(1)
  await expect(page.locator('svg text', { hasText: '220' })).toHaveCount(0)
})

test('the ATS handle cycles А, 0, Б and the short-circuit count follows', async ({ page }) => {
  await open(
    page,
    panelContent({
      rails: [{ ...rail(10), elements: [atsElement as never] }],
      wires: [
        wire(30, cableEnd(id(2)), poleEnd(id(23), 0, 'input')),
        wire(31, cableEnd(id(3)), poleEnd(id(23), 2, 'input')),
        // routed around the ATS so that no wire covers the handle (payload bends are in mm)
        wire(32, poleEnd(id(23), 0, 'output'), poleEnd(id(23), 2, 'input'), [
          { x: 63.8, y: 305 },
          { x: 96, y: 305 },
          { x: 96, y: 195 },
          { x: 76.9, y: 195 },
        ]),
      ],
    }),
    shortOf(30, 31, 32),
  )
  const state = page.getByTestId('ats-state')
  await expect(state).toHaveAttribute('data-state', 'A')
  await expect(oneShort(page)).toBeVisible() // A: output L carries source А and is wired to input Б L
  await page.getByTestId('toggle').click()
  await expect(state).toHaveAttribute('data-state', 'off')
  await expect(page.getByLabel('Перемкнути АВР (стан: 0)')).toHaveCount(1)
  await expect(noShort(page)).toBeVisible()
  await page.getByTestId('toggle').click()
  await expect(state).toHaveAttribute('data-state', 'B')
  await expect(noShort(page)).toBeVisible()
  await page.getByTestId('toggle').click()
  await expect(state).toHaveAttribute('data-state', 'A')
  await expect(oneShort(page)).toBeVisible()
})

test('dragging by the lever moves the element without switching it', async ({ page }) => {
  await open(page, panelContent({ rails: [rail(10, [element(20, 2, 1, 1)]), rail(11)] }))
  const lever = page.getByTestId('toggle')
  const start = await centre(lever)
  const r2 = await centre(page.getByTestId('rail').nth(1))
  await drag(page, start, { x: start.x, y: r2.y })
  const moved = await centre(page.getByTestId('toggle'))
  expect(Math.abs(moved.y - r2.y)).toBeLessThan(3)
  await expect(page.getByLabel('Перемкнути автомат (зараз: увімкнено)')).toHaveCount(1)
  await expect(page.getByRole('button', { name: /^Скасувати: Перемістити апарат/ })).toBeVisible()
})

test('Ctrl+drag from the lever copies the element and does not switch the original', async ({
  page,
}) => {
  await open(page, panelContent({ rails: [rail(10, [element(20, 2, 1, 1)]), rail(11)] }))
  const start = await centre(page.getByTestId('toggle'))
  const r2 = await centre(page.getByTestId('rail').nth(1))
  await page.keyboard.down('Control')
  await drag(page, start, { x: start.x, y: r2.y })
  await page.keyboard.up('Control')
  await expect(page.getByTestId('toggle')).toHaveCount(2)
  await expect(page.getByLabel('Перемкнути автомат (зараз: увімкнено)')).toHaveCount(2)
})

test('a trashed (read-only) panel does not switch on a click', async ({ page }) => {
  const s = server(wiredBreaker(), {
    deletedAt: '2026-02-01T00:00:00+00:00',
    shortCircuits: shortOf(30, 31),
  })
  await mockApi(page, s)
  await page.goto('/panels/p1')
  await expect(page.getByRole('heading', { name: 'Щит', level: 1 })).toBeVisible()
  // aria-disabled: Playwright waits for enabled elements unless forced
  await page.getByTestId('toggle').click({ force: true })
  await expect(page.getByLabel('Перемкнути автомат (зараз: увімкнено)')).toHaveCount(1)
  await expect(oneShort(page)).toBeVisible()
})

test('selecting an element by its corner and changing the style keeps its parameters', async ({
  page,
}) => {
  await open(page, panelContent({ rails: [rail(10, [element(20, 2, 2, 2)])] }))
  await page.getByTestId('element').click({ position: { x: 6, y: 6 } })
  const region = page.getByRole('region', { name: 'Властивості апарата' })
  await region.getByLabel('Стиль').selectOption({ label: 'ПЗВ' })
  await expect(page.locator('[data-testid="element"][data-element-style="rcd"]')).toHaveCount(1)
  await expect(
    page.getByRole('button', { name: /^Скасувати: Змінити стиль апарата/ }),
  ).toBeVisible()
})

test('a wire drawn across the lever does not block switching (zones sit above wires)', async ({
  page,
}) => {
  // wires 30/31 run from the cable wires straight down over the breaker front
  await open(page, wiredBreaker(), shortOf(30, 31))
  await page.getByTestId('toggle').click()
  await expect(page.getByLabel('Перемкнути автомат (зараз: вимкнено)')).toHaveCount(1)
  await expect(noShort(page)).toBeVisible()
})

test('Enter and Space on the focused lever switch the element, one undo step each', async ({
  page,
}) => {
  await open(page, wiredBreaker(), shortOf(30, 31))
  await page.getByTestId('toggle').focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Перемкнути автомат (зараз: вимкнено)')).toHaveCount(1)
  await page.getByTestId('toggle').focus()
  await page.keyboard.press('Space')
  await expect(page.getByLabel('Перемкнути автомат (зараз: увімкнено)')).toHaveCount(1)
  await page.getByRole('button', { name: /^Скасувати: Перемкнути/ }).click()
  await expect(page.getByLabel('Перемкнути автомат (зараз: вимкнено)')).toHaveCount(1)
})
