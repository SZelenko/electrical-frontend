import { expect, test, type Locator, type Page } from '@playwright/test'
import { element, id, mockApi, panelContent, press, rail, rowBlock, server } from './support'

async function open(page: Page, content = panelContent()) {
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

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 })
  await page.mouse.move(to.x, to.y, { steps: 6 })
  await page.mouse.up()
}

const cableWire = (page: Page, n: number) =>
  page.locator(`[data-ep-kind="cableWire"][data-ep-a="${id(n)}"]`)
const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true })

/** A pole contact of an item whose id is only known from the DOM. */
async function itemId(locator: Locator): Promise<string> {
  return (await locator.getAttribute('data-id')) as string
}
const pole = (page: Page, elementId: string, i: number, side: 'input' | 'output') =>
  page.locator(
    `[data-ep-kind="pole"][data-ep-a="${elementId}"][data-ep-b="${i}"][data-ep-side="${side}"]`,
  )

test('adds an ATS, wires two sources through it and switches the state to clear the short circuit', async ({
  page,
}) => {
  await open(page)
  await page
    .getByTestId('rail')
    .first()
    .click({ position: { x: 20, y: 5 } })
  await button(page, 'Додати АВР').click()
  const ats = page.locator('[data-testid="element"][data-element-kind="ats"]')
  await expect(ats).toHaveCount(1)
  await expect(page.getByTestId('ats-state')).toHaveAttribute('data-state', 'A')
  const atsId = await itemId(ats)

  await press(cableWire(page, 2))
  await press(pole(page, atsId, 0, 'input'))
  await press(cableWire(page, 3))
  await press(pole(page, atsId, 2, 'input'))
  await expect(page.getByTestId('wire')).toHaveCount(2)
  await expect(page.getByText('КЗ не виявлено.')).toBeVisible() // A and B sources do not meet inside the ATS

  // an external wire from output L to the source B input joins both sources while the state is А
  await press(pole(page, atsId, 0, 'output'))
  await press(pole(page, atsId, 2, 'input'))
  await expect(page.getByTestId('wire')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Короткі замикання: 1' })).toBeVisible()
  await expect(page.locator('path[stroke="#ff00ff"]')).not.toHaveCount(0)

  // state Б feeds the output from the source B only: the loop closes on one source, the short circuit goes
  await ats.click()
  await page
    .getByRole('region', { name: 'Властивості АВР' })
    .locator('select')
    .selectOption({ label: 'Б' })
  await expect(page.getByTestId('ats-state')).toHaveAttribute('data-state', 'B')
  await expect(page.getByText('КЗ не виявлено.')).toBeVisible()
  await expect(page.locator('path[stroke="#ff00ff"]')).toHaveCount(0)

  await page
    .getByRole('region', { name: 'Властивості АВР' })
    .locator('select')
    .selectOption({ label: '0' })
  await expect(page.getByText('КЗ не виявлено.')).toBeVisible()

  // undo twice steps back to the state А and the short circuit is back
  await page.getByRole('button', { name: /^Скасувати: Змінити стан АВР/ }).click()
  await page.getByRole('button', { name: /^Скасувати: Змінити стан АВР/ }).click()
  await expect(page.getByTestId('ats-state')).toHaveAttribute('data-state', 'A')
  await expect(page.getByRole('heading', { name: 'Короткі замикання: 1' })).toBeVisible()
})

test('a terminal-row block takes wires on its top and bottom and saves the contact sides', async ({
  page,
}) => {
  const s = await open(page, panelContent({ rails: [rail(10, [element(20, 4, 2, 2)])] }))
  await button(page, 'Додати клемник у рядок').click()
  const row = page.locator('[data-testid="block"][data-block-zone="row"]')
  await expect(row).toHaveCount(1)
  const rowId = await itemId(row)
  const rowContact = (side: 'top' | 'bottom', i: number) =>
    page.locator(
      `[data-ep-kind="terminal"][data-ep-a="${rowId}"][data-ep-b="${i}"][data-ep-cs="${side}"]`,
    )
  // cable wire -> top of contact 0; bottom of contact 0 -> pole input 0 of the device
  await press(cableWire(page, 2))
  await press(rowContact('top', 0))
  await press(rowContact('bottom', 0))
  await press(pole(page, id(20), 0, 'input'))
  await expect(page.getByTestId('wire')).toHaveCount(2)
  // both sides of one contact are one node: the other side of the start contact cancels
  await press(rowContact('top', 1))
  await press(rowContact('bottom', 1))
  await expect(page.getByTestId('wire')).toHaveCount(2)
  await expect(page.getByTestId('drawing-start')).toHaveCount(0)

  await button(page, 'Зберегти').click()
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()
  const saved = s.puts[0]!.content as {
    terminalRow: {
      id: string
      offsetModules: number
      widthModules: number
      terminalCount: number
    }[]
    wires: { start: { contactSide: unknown }; end: { contactSide: unknown } }[]
  }
  expect(saved.terminalRow).toHaveLength(1)
  expect(saved.terminalRow[0]).toMatchObject({ widthModules: 1, terminalCount: 2 })
  expect(saved.wires.map((w) => [w.start.contactSide, w.end.contactSide])).toEqual([
    [null, 'top'],
    ['bottom', null],
  ])
})

test('a coloured rail block gives its colour to a wire started on it', async ({ page }) => {
  await open(page)
  await page
    .getByTestId('rail')
    .first()
    .click({ position: { x: 20, y: 5 } })
  await button(page, 'Додати клемний блок').click()
  const blockEl = page.locator('[data-testid="block"][data-block-zone="rail"]')
  await expect(blockEl).toHaveCount(1)
  const blockId = await itemId(blockEl)
  await page
    .getByRole('region', { name: 'Властивості клемного блока' })
    .locator('select')
    .selectOption({ label: 'червоний' })
  await press(
    page.locator(
      `[data-ep-kind="terminal"][data-ep-a="${blockId}"][data-ep-b="0"][data-ep-cs="left"]`,
    ),
  )
  await press(cableWire(page, 3))
  await expect(page.getByTestId('wire')).toHaveCount(1)
  await expect(page.locator('path[stroke="#d32f2f"]')).not.toHaveCount(0)
  await expect(page.locator('path[stroke="#7b4a1e"]')).toHaveCount(0)
})

test.describe('copy with Ctrl + drag', () => {
  test('copies an element to another rail and undo removes the copy', async ({ page }) => {
    await open(page, panelContent({ rails: [rail(10, [element(20, 2)]), rail(11)] }))
    const el = page.getByTestId('element')
    const start = await centre(el)
    const r2 = await centre(page.getByTestId('rail').nth(1))
    await page.keyboard.down('Control')
    await drag(page, start, { x: start.x, y: r2.y })
    await page.keyboard.up('Control')
    await expect(el).toHaveCount(2)
    await expect(page.getByText('● Є незбережені зміни')).toBeVisible()
    await page.getByRole('button', { name: /^Скасувати: Копіювати/ }).click()
    await expect(el).toHaveCount(1)
  })

  test('copies a row block within the row and undo removes it', async ({ page }) => {
    await open(page, panelContent({ terminalRow: [rowBlock(50, 0, 2)] }))
    const blockEl = page.locator('[data-testid="block"][data-block-zone="row"]')
    const box = (await blockEl.boundingBox())!
    const start = await centre(blockEl)
    await page.keyboard.down('Control')
    await drag(page, start, { x: start.x + box.width * 4, y: start.y })
    await page.keyboard.up('Control')
    await expect(blockEl).toHaveCount(2)
    await page.getByRole('button', { name: /^Скасувати: Копіювати/ }).click()
    await expect(blockEl).toHaveCount(1)
  })

  test('a copy of a device dropped into the terminal row is refused', async ({ page }) => {
    await open(page, panelContent({ rails: [rail(10, [element(20, 2)])] }))
    const el = page.getByTestId('element')
    const start = await centre(el)
    const band = await centre(page.getByTestId('terminal-row'))
    await page.keyboard.down('Control')
    await drag(page, start, { x: start.x, y: band.y })
    await page.keyboard.up('Control')
    await expect(el).toHaveCount(1)
    await expect(page.getByText(/Копію не створено/)).toBeVisible()
    await expect(page.getByText('Усі зміни збережено')).toBeVisible()
  })

  test('without Ctrl the same drag onto another rail moves instead of copying', async ({
    page,
  }) => {
    await open(page, panelContent({ rails: [rail(10, [element(20, 2)]), rail(11)] }))
    const el = page.getByTestId('element')
    const start = await centre(el)
    const r2 = await centre(page.getByTestId('rail').nth(1))
    await drag(page, start, { x: start.x, y: r2.y })
    await expect(el).toHaveCount(1)
    await expect(page.getByRole('button', { name: /^Скасувати: Перемістити апарат/ })).toBeVisible()
  })
})
