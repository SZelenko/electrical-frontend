import { expect, test, type Page } from '@playwright/test'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const content = {
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
  outputCables: [],
  terminalRow: [],
  rails: [
    {
      id: id(10),
      widthModules: 20,
      spacingMm: 150,
      elements: [
        {
          kind: 'device',
          style: 'breaker',
          state: null,
          id: id(20),
          offsetModules: 2,
          widthModules: 2,
          label: 'Автомат',
          marking: 'QF1',
          on: true,
          sidesSwapped: false,
          poles: [{ transit: false }, { transit: false }],
        },
      ],
      terminalBlocks: [],
    },
  ],
  wires: [],
}

async function mockApi(page: Page) {
  let version = 1
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname.replace('/api/v1', '')
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/auth/refresh') return json(200, { token: 't' })
    if (path === '/me')
      return json(200, { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false })
    if (path === '/panels/p1' && route.request().method() === 'GET') {
      return json(200, {
        id: 'p1',
        name: 'Щит',
        version,
        createdAt: '2026-01-01T00:00:00+00:00',
        updatedAt: '2026-01-01T00:00:00+00:00',
        deletedAt: null,
        content,
        shortCircuits: [],
      })
    }
    if (path === '/panels/p1/content' && route.request().method() === 'PUT') {
      version += 1
      return json(200, {
        id: 'p1',
        name: 'Щит',
        version,
        createdAt: '2026-01-01T00:00:00+00:00',
        updatedAt: '2026-01-01T00:00:00+00:00',
        deletedAt: null,
        content,
        shortCircuits: [],
      })
    }
    return json(404, { type: 'not_found' })
  })
}

test('edits the schematic: add rail, undo, draw a wire, save', async ({ page }) => {
  await mockApi(page)
  await page.goto('/panels/p1')
  await expect(page.getByRole('heading', { name: 'Щит' })).toBeVisible()
  await expect(page.getByTestId('element')).toHaveCount(1)
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()

  await page.getByRole('button', { name: 'Додати рейку' }).click()
  await expect(page.getByTestId('rail')).toHaveCount(2)
  await expect(page.getByText('● Є незбережені зміни')).toBeVisible()
  await page.getByRole('button', { name: /^Скасувати: / }).click()
  await expect(page.getByTestId('rail')).toHaveCount(1)

  const terminals = page.getByTestId('terminal')
  await terminals.first().dispatchEvent('pointerdown', { button: 0 })
  await expect(page.getByText('Клацайте на полі, щоб додати злам')).toBeVisible()
  await page
    .locator('[data-ep-kind="pole"][data-ep-side="input"]')
    .first()
    .dispatchEvent('pointerdown', { button: 0 })
  await expect(page.getByTestId('wire')).toHaveCount(1)
  await expect(page.getByRole('region', { name: 'Властивості проводу' })).toBeVisible()

  await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()

  // bends: double-click on the wire adds one, double-click on the handle removes it
  const mid = await page
    .getByTestId('wire')
    .first()
    .evaluate((el: SVGGeometryElement) => {
      const p = el.getPointAtLength(el.getTotalLength() / 2)
      const m = el.getScreenCTM()!
      return { x: p.x * m.a + m.e, y: p.y * m.d + m.f }
    })
  const before = await page.getByTestId('bend').count()
  await page.mouse.dblclick(mid.x, mid.y)
  await expect(page.getByTestId('bend')).toHaveCount(before + 1)
  const handle = (await page.getByTestId('bend').first().boundingBox())!
  await page.mouse.dblclick(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await expect(page.getByTestId('bend')).toHaveCount(before)
})

test('drags an element along the rail and reverts the drag with undo', async ({ page }) => {
  await mockApi(page)
  await page.goto('/panels/p1')
  const element = page.getByTestId('element')
  const start = await element.boundingBox()
  expect(start).not.toBeNull()
  const cx = start!.x + start!.width / 2
  const cy = start!.y + start!.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 40, cy, { steps: 5 })
  await page.mouse.move(cx + 120, cy, { steps: 5 })
  await page.mouse.up()
  const moved = await element.boundingBox()
  expect(moved!.x).toBeGreaterThan(start!.x + 20)
  await expect(page.getByText('● Є незбережені зміни')).toBeVisible()
  await page.getByRole('button', { name: /^Скасувати: Перемістити/ }).click()
  const back = await element.boundingBox()
  expect(back!.x).toBeCloseTo(start!.x, 0)
})

test('draws a wire by hand: a click off the contacts adds a bend, Backspace removes it', async ({
  page,
}) => {
  await mockApi(page)
  await page.goto('/panels/p1')
  await expect(page.getByTestId('element')).toHaveCount(1)
  await page.getByTestId('terminal').first().dispatchEvent('pointerdown', { button: 0 })
  const box = (await page.getByTestId('panel-canvas').boundingBox())!
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8)
  await page.keyboard.press('Backspace')
  await page.mouse.click(box.x + box.width * 0.8, box.y + box.height * 0.8)
  await page
    .locator('[data-ep-kind="pole"][data-ep-side="input"]')
    .first()
    .dispatchEvent('pointerdown', { button: 0 })
  await expect(page.getByTestId('wire')).toHaveCount(1)
  // the clicked bend plus the single elbow that joins the last point to the contact
  await expect(page.getByTestId('bend')).toHaveCount(2)
})
