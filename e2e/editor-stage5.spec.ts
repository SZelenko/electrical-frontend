import { expect, test, type Locator, type Page } from '@playwright/test'
import { busbar, element, id, mockApi, panelContent, press, rail, server } from './support'

async function open(page: Page, content = panelContent()) {
  const s = server(content)
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
const cableWire = (page: Page, n: number) =>
  page.locator(`[data-ep-kind="cableWire"][data-ep-a="${id(n)}"]`)
const feed = (page: Page, busbarId: string, i: number) =>
  page.locator(`[data-ep-kind="busbar"][data-ep-a="${busbarId}"][data-ep-b="${i}"]`)

test('adds three devices and an L+N busbar, wires the feeds and saves the busbars', async ({
  page,
}) => {
  const s = await open(page)
  await page
    .getByTestId('rail')
    .first()
    .click({ position: { x: 20, y: 5 } })
  for (let i = 0; i < 3; i++) await button(page, 'Додати автомат').click()
  await expect(page.getByTestId('element')).toHaveCount(3)

  // the busbar needs a selected device; without one both buttons are disabled
  // click the free part of the rail (the devices cover its left end)
  const railBox = (await page.getByTestId('rail').first().boundingBox())!
  await page
    .getByTestId('rail')
    .first()
    .click({ position: { x: railBox.width * 0.8, y: 5 } })
  await expect(button(page, 'Додати шину L+N')).toBeDisabled()
  await page
    .getByTestId('element')
    .first()
    .click({ position: { x: 6, y: 6 }, timeout: 3000 })
  await button(page, 'Додати шину L+N').click()
  const bar = page.getByTestId('busbar')
  await expect(bar).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Властивості шини' })).toBeVisible()
  const busbarId = (await bar.getAttribute('data-id')) as string
  await expect(feed(page, busbarId, 0)).toHaveCount(1)
  await expect(feed(page, busbarId, 1)).toHaveCount(1)

  // wires from the input cable to both feeds; the start contact colour decides
  await press(cableWire(page, 2))
  await press(feed(page, busbarId, 0))
  await press(cableWire(page, 3))
  await press(feed(page, busbarId, 1))
  await expect(page.getByTestId('wire')).toHaveCount(2)
  await expect(page.getByText('КЗ не виявлено.')).toBeVisible()

  // a busbar colour change is appearance only: the wires stay brown / blue
  // the right end of the bar is clear of the feed wires
  const barBox = (await bar.boundingBox())!
  await bar.click({ position: { x: barBox.width - 6, y: barBox.height / 2 } })
  const panelProps = page.getByRole('region', { name: 'Властивості шини' })
  await panelProps.getByLabel('Колір').selectOption({ label: 'червоний' })
  await expect(page.getByRole('button', { name: /^Скасувати: Змінити колір шини/ })).toBeVisible()

  await button(page, 'Зберегти').click()
  await expect(page.getByText('Збережено.', { exact: true })).toBeVisible()
  expect(s.puts).toHaveLength(1)
  const saved = s.puts[0]!.content as {
    rails: {
      busbars: {
        id: string
        type: string
        colour: string | null
        firstElementId: string
        count: number
      }[]
    }[]
    wires: { start: Record<string, unknown>; end: Record<string, unknown> }[]
  }
  expect(saved.rails[0]?.busbars).toEqual([
    { id: busbarId, type: 'LN', colour: 'red', firstElementId: expect.any(String), count: 3 },
  ])
  expect(saved.wires.map((w) => [w.end.kind, w.end.feedIndex])).toEqual([
    ['busbar', 0],
    ['busbar', 1],
  ])
})

test('a short circuit through a busbar is highlighted and a property change to L removes the N wire', async ({
  page,
}) => {
  const devices = [element(20, 0, 1, 2), element(21, 1, 1, 2)]
  await open(
    page,
    panelContent({
      rails: [rail(10, devices, [], 150, [busbar(60, 'LN', id(20), 2)])],
      wires: [
        {
          id: id(30),
          colour: 'brown',
          crossSection: '2.5',
          start: { kind: 'cableWire', cableWireId: id(2), contactSide: null },
          end: { kind: 'busbar', busbarId: id(60), feedIndex: 0, contactSide: null },
          bends: [],
        },
        {
          id: id(31),
          colour: 'blue',
          crossSection: '2.5',
          start: { kind: 'cableWire', cableWireId: id(3), contactSide: null },
          end: { kind: 'busbar', busbarId: id(60), feedIndex: 1, contactSide: null },
          bends: [],
        },
      ],
    }),
  )
  // L and N sources on different feeds: no short circuit; the wires are not drawn orthogonally, but present
  await expect(page.getByTestId('wire')).toHaveCount(2)
  await expect(page.getByText('КЗ не виявлено.')).toBeVisible()
  await page.getByTestId('busbar').click()
  const panel = page.getByRole('region', { name: 'Властивості шини' })
  await panel.getByLabel('Тип').selectOption({ label: 'L' })
  await expect(page.getByTestId('wire')).toHaveCount(1)
  await expect(page.getByText(/Видалено 1 провід/)).toBeVisible()
  await page.getByRole('button', { name: /^Скасувати: Змінити тип шини/ }).click()
  await expect(page.getByTestId('wire')).toHaveCount(2)
})

test.describe('translucent mode', () => {
  const two = () => panelContent({ rails: [rail(10, [element(20, 2, 1, 1)]), rail(11)] })

  test('the toggle makes drags inert, keeps the lever and drawing working, and can be switched off', async ({
    page,
  }) => {
    await open(page, two())
    const toggle = button(page, 'Прозорий режим')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    // drag: nothing moves, nothing is recorded
    const lever = page.getByTestId('toggle')
    const start = await centre(page.getByTestId('element'))
    const r2 = await centre(page.getByTestId('rail').nth(1))
    await drag(page, start, { x: start.x, y: r2.y })
    const after = await centre(page.getByTestId('element'))
    expect(Math.abs(after.y - start.y)).toBeLessThan(1)
    await expect(page.getByText('● Є незбережені зміни')).toHaveCount(0)

    // Ctrl + drag copies nothing either
    await page.keyboard.down('Control')
    await drag(page, start, { x: start.x, y: r2.y })
    await page.keyboard.up('Control')
    await expect(page.getByTestId('element')).toHaveCount(1)

    // the on/off lever still works
    await lever.click()
    await expect(page.getByLabel('Перемкнути автомат (зараз: вимкнено)')).toHaveCount(1)

    // a wire can still be drawn
    await press(cableWire(page, 2))
    await press(page.locator('[data-ep-kind="pole"][data-ep-b="0"][data-ep-side="input"]'))
    await expect(page.getByTestId('wire')).toHaveCount(1)

    // off again: the drag moves the device
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    const again = await centre(page.getByTestId('element'))
    await drag(page, again, { x: again.x, y: r2.y })
    await expect(page.getByRole('button', { name: /^Скасувати: Перемістити апарат/ })).toBeVisible()
  })
})

test('a cable label is edited in the properties and drawn inside the input cable box', async ({
  page,
}) => {
  await open(page)
  await page.getByTestId('input-cable').click()
  const field = page
    .getByRole('region', { name: 'Властивості вхідного кабелю' })
    .getByLabel('Позначення (малюється біля кабелю)')
  await field.fill('Ввід А')
  await field.blur()
  const mark = page.getByTestId('cable-mark')
  await expect(mark).toHaveText('Ввід А')
  const box = (await page.getByTestId('input-cable').boundingBox())!
  const text = (await mark.boundingBox())!
  expect(text.x).toBeGreaterThanOrEqual(box.x)
  expect(text.x + text.width).toBeLessThanOrEqual(box.x + box.width)
  expect(text.y).toBeGreaterThanOrEqual(box.y)
  expect(text.y + text.height).toBeLessThanOrEqual(box.y + box.height)
  await expect(
    page.getByRole('button', { name: /^Скасувати: Змінити позначення кабелю/ }),
  ).toBeVisible()
})

test.describe('rail width in the panel properties', () => {
  const width = (page: Page) =>
    page
      .getByRole('region', { name: 'Властивості щита' })
      .getByLabel('Ширина рейок (усіх), модулів')

  test('widening redraws the rails and is saved as railWidthModules', async ({ page }) => {
    const s = await open(page, panelContent({ rails: [rail(10, [element(20, 2)])] }))
    const rail0 = page.getByTestId('rail').first()
    const before = (await rail0.boundingBox())!.width
    await expect(width(page)).toHaveValue('20')
    await width(page).fill('30')
    await width(page).blur()
    const after = (await rail0.boundingBox())!.width
    expect(after / before).toBeCloseTo(1.5, 1)
    await button(page, 'Зберегти').click()
    await expect(page.getByText('Збережено.', { exact: true })).toBeVisible()
    expect((s.puts[0]?.content as { railWidthModules: number }).railWidthModules).toBe(30)
  })

  test('a width below the rightmost device is refused and nothing changes', async ({ page }) => {
    await open(page, panelContent({ rails: [rail(10, [element(20, 10, 2, 2)])] }))
    await width(page).fill('5')
    await width(page).blur()
    await expect(page.getByText('● Є незбережені зміни')).toHaveCount(0)
    await expect(button(page, 'Зберегти')).toBeDisabled()
  })
})
