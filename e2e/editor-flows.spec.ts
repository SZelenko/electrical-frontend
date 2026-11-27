import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  block,
  cableEnd,
  element,
  id,
  mockApi,
  panelContent,
  poleEnd,
  press,
  rail,
  server,
  terminalEnd,
  wire,
} from './support'

const unsaved = '● Є незбережені зміни'
const saved = 'Усі зміни збережено'

async function open(page: Page, s: ReturnType<typeof server>) {
  await mockApi(page, s)
  await page.goto('/panels/p1')
  await expect(page.getByRole('heading', { name: s.name, level: 1 })).toBeVisible()
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

test.describe('placing devices', () => {
  test('adds an element and a terminal block to the selected rail', async ({ page }) => {
    await open(page, server(panelContent()))
    await expect(page.getByTestId('element')).toHaveCount(0)
    await page
      .getByTestId('rail')
      .first()
      .click({ position: { x: 20, y: 5 } })
    await page.getByRole('button', { name: 'Додати автомат' }).click()
    await expect(page.getByTestId('element')).toHaveCount(1)
    await page.getByRole('button', { name: 'Додати клемний блок' }).click()
    await expect(page.getByTestId('block')).toHaveCount(1)
    await expect(page.getByText(unsaved)).toBeVisible()
    // each action is its own undo step
    await page.getByRole('button', { name: /^Скасувати: Додати клемний блок/ }).click()
    await expect(page.getByTestId('block')).toHaveCount(0)
    await expect(page.getByTestId('element')).toHaveCount(1)
  })

  test('refuses to add a device when there is no rail', async ({ page }) => {
    await open(page, server(panelContent({ rails: [] })))
    await expect(page.getByRole('button', { name: 'Додати автомат' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Додати клемний блок' })).toBeDisabled()
  })

  test('moves an element to another rail and undo puts it back', async ({ page }) => {
    await open(page, server(panelContent({ rails: [rail(10, [element(20, 2)]), rail(11)] })))
    const el = page.getByTestId('element')
    const rails = page.getByTestId('rail')
    const r1 = await centre(rails.nth(0))
    const r2 = await centre(rails.nth(1))
    const start = await centre(el)
    await drag(page, start, { x: start.x, y: r2.y })
    const moved = await centre(el)
    expect(Math.abs(moved.y - r2.y)).toBeLessThan(3)
    await expect(page.getByText(unsaved)).toBeVisible()
    await page.getByRole('button', { name: /^Скасувати: Перемістити апарат/ }).click()
    const back = await centre(el)
    expect(Math.abs(back.y - r1.y)).toBeLessThan(3)
    await expect(page.getByText(saved)).toBeVisible()
  })

  test('an invalid drop snaps back and shows the message', async ({ page }) => {
    await open(page, server(panelContent({ rails: [rail(10, [element(20, 0), element(21, 4)])] })))
    const first = page.getByTestId('element').nth(0)
    const second = page.getByTestId('element').nth(1)
    const from = await centre(second)
    const onto = await centre(first)
    await drag(page, from, { x: onto.x, y: from.y })
    await expect(page.getByText('Елемент повернено на місце')).toBeVisible()
    await expect(page.getByText(saved)).toBeVisible()
    const after = await centre(second)
    expect(Math.abs(after.x - from.x)).toBeLessThan(2)
  })
})

test.describe('structural edits with attached wires', () => {
  const withWire = () =>
    panelContent({
      rails: [rail(10, [element(20, 2, 2, 2)])],
      wires: [
        wire(30, cableEnd(id(2)), poleEnd(id(20), 1, 'input')),
        wire(31, cableEnd(id(3)), poleEnd(id(20), 0, 'input')),
      ],
    })

  test('reducing the pole count deletes the attached wires, tells how many and undo restores them', async ({
    page,
  }) => {
    await open(page, server(withWire()))
    await expect(page.getByTestId('wire')).toHaveCount(2)
    await page.getByTestId('element').click({ position: { x: 6, y: 6 } })
    const poles = page
      .getByRole('region', { name: 'Властивості апарата' })
      .getByLabel('Кількість полюсів')
    await poles.fill('1')
    await poles.press('Enter')
    await expect(page.getByText('Видалено 1 провід')).toBeVisible()
    await expect(page.getByTestId('wire')).toHaveCount(1)
    await page.getByRole('button', { name: /^Скасувати: Змінити кількість полюсів/ }).click()
    await expect(page.getByTestId('wire')).toHaveCount(2)
    await expect(page.getByText(saved)).toBeVisible()
  })

  test('deleting an element removes both wires with one notice and one undo step', async ({
    page,
  }) => {
    await open(page, server(withWire()))
    await page.getByTestId('element').click({ position: { x: 6, y: 6 } })
    await page.getByRole('button', { name: 'Видалити вибране' }).click()
    await expect(page.getByText('Видалено 2 проводи')).toBeVisible()
    await expect(page.getByTestId('wire')).toHaveCount(0)
    await page.getByRole('button', { name: /^Скасувати: Видалити апарат/ }).click()
    await expect(page.getByTestId('wire')).toHaveCount(2)
    await expect(page.getByTestId('element')).toHaveCount(1)
  })

  test('Ctrl+Z and Ctrl+Shift+Z work from the keyboard but not inside a text field', async ({
    page,
  }) => {
    await open(page, server(withWire()))
    await page.getByTestId('element').click({ position: { x: 6, y: 6 } })
    await page.getByRole('button', { name: 'Видалити вибране' }).click()
    await expect(page.getByTestId('element')).toHaveCount(0)
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('element')).toHaveCount(1)
    await page.keyboard.press('Control+Shift+z')
    await expect(page.getByTestId('element')).toHaveCount(0)
    await page.keyboard.press('Control+y')
    await expect(page.getByTestId('element')).toHaveCount(0)
    await page.keyboard.press('Control+z')
    await expect(page.getByTestId('element')).toHaveCount(1)
    // focus in a field: the shortcut is left to the field
    await page.getByTestId('element').click({ position: { x: 6, y: 6 } })
    await page.getByLabel('Назва').first().focus()
    await page.keyboard.press('Control+Shift+z')
    await expect(page.getByTestId('element')).toHaveCount(1)
  })
})

test.describe('short circuits', () => {
  test('bridging two input wires through a terminal block highlights the wires and lists the circuit', async ({
    page,
  }) => {
    await open(page, server(panelContent({ rails: [rail(10, [], [block(40, 2, 1, 2)])] })))
    await expect(page.getByText('КЗ не виявлено.')).toBeVisible()
    const cableWire = (n: number) =>
      page.locator(`[data-ep-kind="cableWire"][data-ep-a="${id(n)}"]`)
    const terminal = (i: number) =>
      page.locator(
        `[data-ep-kind="terminal"][data-ep-a="${id(40)}"][data-ep-b="${i}"][data-ep-cs="left"]`,
      )
    await press(cableWire(2))
    await press(terminal(0))
    await expect(page.getByTestId('wire')).toHaveCount(1)
    await expect(page.getByText('КЗ не виявлено.')).toBeVisible() // one source only
    await press(cableWire(3))
    await press(terminal(1))
    await expect(page.getByTestId('wire')).toHaveCount(2)
    await expect(page.getByRole('heading', { name: 'Короткі замикання: 1' })).toBeVisible()
    await expect(page.locator('path[stroke="#ff00ff"]')).toHaveCount(2)
    // undo of the second wire removes the short circuit
    await page.getByRole('button', { name: /^Скасувати: Додати провід/ }).click()
    await expect(page.getByText('КЗ не виявлено.')).toBeVisible()
    await expect(page.locator('path[stroke="#ff00ff"]')).toHaveCount(0)
  })

  test('"Показати на схемі" emphasises the wires of a circuit the backend reported', async ({
    page,
  }) => {
    const content = panelContent({
      rails: [rail(10, [], [block(40, 2, 1, 2)])],
      wires: [
        wire(30, cableEnd(id(2)), terminalEnd(id(40), 0)),
        wire(31, cableEnd(id(3)), terminalEnd(id(40), 1)),
      ],
    })
    const s = server(content, {
      shortCircuits: [{ sources: [id(2), id(3)], wireIds: [id(30), id(31)], terminals: [] }],
    })
    await open(page, s)
    await page.getByRole('button', { name: 'Показати на схемі' }).click()
    await expect(page.locator('path[stroke="#ff00ff"][stroke-opacity="0.9"]')).toHaveCount(2)
  })

  test('drawing a wire is cancelled by Escape and by a second click on the same terminal', async ({
    page,
  }) => {
    await open(page, server(panelContent({ rails: [rail(10, [element(20, 2)])] })))
    const start = page.locator(`[data-ep-kind="cableWire"][data-ep-a="${id(2)}"]`)
    await press(start)
    await expect(page.getByText('Клацайте на полі, щоб додати злам')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByText('Клацайте на полі, щоб додати злам')).toHaveCount(0)
    await press(start)
    await press(start)
    await expect(page.getByText('Клацайте на полі, щоб додати злам')).toHaveCount(0)
    await expect(page.getByTestId('wire')).toHaveCount(0)
    await expect(page.getByText(saved)).toBeVisible()
  })
})

test.describe('saving', () => {
  test('saves the edited content with the base version and returns to clean', async ({ page }) => {
    const s = server(panelContent({ rails: [rail(10, [element(20, 2)])] }), { version: 4 })
    await open(page, s)
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await expect(page.getByTestId('rail')).toHaveCount(2)
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
    await expect(page.getByText(saved)).toBeVisible()
    await expect(page.getByText('Збережено.', { exact: true })).toBeVisible()
    expect(s.puts).toHaveLength(1)
    expect(s.puts[0]?.version).toBe(4)
    expect((s.puts[0]?.content.rails as unknown[]).length).toBe(2)
    await expect(page.getByRole('button', { name: 'Зберегти', exact: true })).toBeDisabled()
  })

  test('sends bends in millimetres with one decimal', async ({ page }) => {
    const s = server(
      panelContent({
        rails: [rail(10, [element(20, 2)])],
        wires: [
          wire(30, cableEnd(id(2)), poleEnd(id(20), 0, 'input'), [
            { x: 30, y: 105 },
            { x: 31.2, y: 105 },
          ]),
        ],
      }),
    )
    await open(page, s)
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
    await expect(page.getByText(saved)).toBeVisible()
    const wires = s.puts[0]!.content.wires as { bends: { x: number; y: number }[] }[]
    expect(wires[0]?.bends).toEqual([
      { x: 30, y: 105 },
      { x: 31.2, y: 105 },
    ])
  })

  test('409 opens the dialog; reload & discard shows the server state', async ({ page }) => {
    const s = server(panelContent({ rails: [rail(10, [element(20, 2)])] }))
    s.put = () => ({
      status: 409,
      body: { type: 'panel_version_conflict', title: 'c', detail: 'stale', currentVersion: 7 },
    })
    await open(page, s)
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toContainText('Щит змінено в іншому місці')
    // the server moved on while the dialog was open
    s.name = 'Щит (нова версія)'
    s.version = 7
    s.content = panelContent({ rails: [rail(10, [element(20, 2)]), rail(11), rail(12)] })
    await dialog.getByRole('button', { name: /^Завантажити останню версію/ }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Щит (нова версія)' })).toBeVisible()
    await expect(page.getByTestId('rail')).toHaveCount(3)
    await expect(page.getByText(saved)).toBeVisible()
  })

  test('409 keep editing leaves saving disabled', async ({ page }) => {
    const s = server(panelContent())
    s.put = () => ({
      status: 409,
      body: { type: 'panel_version_conflict', title: 'c', detail: 'stale', currentVersion: 7 },
    })
    await open(page, s)
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
    await page.getByRole('button', { name: /^Продовжити редагування/ }).click()
    await expect(page.getByRole('alertdialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Зберегти', exact: true })).toBeDisabled()
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await expect(page.getByTestId('rail')).toHaveCount(3)
    await expect(page.getByRole('button', { name: 'Зберегти', exact: true })).toBeDisabled()
    expect(s.puts).toHaveLength(1)
  })

  test('shows the short-circuit warning returned by the backend after a successful save', async ({
    page,
  }) => {
    const content = panelContent({
      rails: [rail(10, [], [block(40, 2, 1, 2)])],
      wires: [
        wire(30, cableEnd(id(2)), terminalEnd(id(40), 0)),
        wire(31, cableEnd(id(3)), terminalEnd(id(40), 1)),
      ],
    })
    const s = server(content)
    s.shortCircuits = [{ sources: [id(2), id(3)], wireIds: [id(30), id(31)], terminals: [] }]
    await open(page, s)
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
    await expect(page.getByText('Збережено. Увага: виявлено коротких замикань: 1.')).toBeVisible()
    await expect(page.getByText(saved)).toBeVisible()
  })

  test('a 422 highlights the offending element and lists the other violations', async ({
    page,
  }) => {
    const s = server(panelContent({ rails: [rail(10, [element(20, 2)])] }))
    s.put = () => ({
      status: 422,
      body: {
        type: '/validation_errors/x',
        title: 'v',
        detail: 'invalid',
        violations: [
          {
            propertyPath: 'content.rails[0].elements[0].label',
            message: 'Must be at most 16 characters long.',
          },
          { propertyPath: 'content.wires', message: 'At most 5000 wires are allowed.' },
        ],
      },
    })
    await open(page, s)
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
    await expect(page.getByText('Елементи з помилками підсвічено на схемі.')).toBeVisible()
    await expect(page.getByText('content.wires — At most 5000 wires are allowed.')).toBeVisible()
    await expect(page.getByTestId('element')).toHaveClass(/violation/)
  })

  test('the local validation blocks the request for invalid content', async ({ page }) => {
    const s = server(
      panelContent({ rails: [rail(10, [element(20, 2, 2, 2, { label: 'x'.repeat(17) })])] }),
    )
    await open(page, s)
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
    await expect(page.getByText('Елементи з помилками підсвічено на схемі.')).toBeVisible()
    expect(s.puts).toHaveLength(0)
  })
})

test.describe('bend editing', () => {
  const content = () =>
    panelContent({
      rails: [rail(10, [element(20, 2, 2, 2)])],
      wires: [
        wire(30, cableEnd(id(2)), poleEnd(id(20), 0, 'input'), [
          { x: 30, y: 105 },
          { x: 36.3, y: 105 },
        ]),
      ],
    })

  test('dragging a bend handle changes the route in one undo step', async ({ page }) => {
    await open(page, server(content()))
    await press(page.getByTestId('wire'))
    await expect(page.getByTestId('bend')).toHaveCount(2)
    const before = await page.getByTestId('wire').getAttribute('d')
    const handle = await centre(page.getByTestId('bend').first())
    await drag(page, handle, { x: handle.x, y: handle.y + 25 })
    const after = await page.getByTestId('wire').getAttribute('d')
    expect(after).not.toBe(before)
    await expect(page.getByText(unsaved)).toBeVisible()
    await page.getByRole('button', { name: /^Скасувати: Перемістити злам/ }).click()
    expect(await page.getByTestId('wire').getAttribute('d')).toBe(before)
    await expect(page.getByText(saved)).toBeVisible()
  })

  test('a double-click adds a bend and a double-click on the handle removes it', async ({
    page,
  }) => {
    await open(page, server(content()))
    await press(page.getByTestId('wire'))
    const mid = await page.getByTestId('wire').evaluate((el: SVGGeometryElement) => {
      const p = el.getPointAtLength(el.getTotalLength() * 0.2)
      const m = el.getScreenCTM()!
      return { x: p.x * m.a + m.e, y: p.y * m.d + m.f }
    })
    const before = await page.getByTestId('bend').count()
    await page.mouse.dblclick(mid.x, mid.y)
    await expect(page.getByTestId('bend')).toHaveCount(before + 1)
    await page.getByRole('button', { name: /^Скасувати: Додати злам/ }).click()
    await expect(page.getByTestId('bend')).toHaveCount(before)
  })
})

test.describe('unsaved changes guard', () => {
  test('leaving the page with unsaved changes asks first; cancel stays, confirm leaves', async ({
    page,
  }) => {
    await open(page, server(panelContent()))
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    const messages: string[] = []
    page.once('dialog', (d) => {
      messages.push(d.message())
      void d.dismiss()
    })
    await page.getByRole('link', { name: 'Мої щити' }).click()
    await expect(page).toHaveURL(/\/panels\/p1$/)
    expect(messages[0]).toContain('незбережені зміни')
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('link', { name: 'Мої щити' }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('a clean editor leaves without asking', async ({ page }) => {
    await open(page, server(panelContent()))
    let asked = false
    page.on('dialog', (d) => {
      asked = true
      void d.dismiss()
    })
    await page.getByRole('link', { name: 'Мої щити' }).click()
    await expect(page).toHaveURL(/\/$/)
    expect(asked).toBe(false)
  })

  test('after saving the editor is clean and leaves without asking', async ({ page }) => {
    await open(page, server(panelContent()))
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click()
    await expect(page.getByText(saved)).toBeVisible()
    let asked = false
    page.on('dialog', (d) => {
      asked = true
      void d.dismiss()
    })
    await page.getByRole('link', { name: 'Мої щити' }).click()
    await expect(page).toHaveURL(/\/$/)
    expect(asked).toBe(false)
  })

  test('unsaved work comes back when the user returns to the panel', async ({ page }) => {
    await open(page, server(panelContent()))
    await page.getByRole('button', { name: 'Додати рейку', exact: true }).click()
    page.once('dialog', (d) => void d.accept())
    await page.getByRole('link', { name: 'Мої щити' }).click()
    await expect(page).toHaveURL(/\/$/)
    await page.goBack()
    await expect(page.getByTestId('rail')).toHaveCount(2)
    await expect(page.getByText(unsaved)).toBeVisible()
  })
})

test.describe('read-only trashed panel', () => {
  test('opens without editing controls', async ({ page }) => {
    await open(
      page,
      server(panelContent({ rails: [rail(10, [element(20, 2)])] }), {
        deletedAt: '2026-02-01T00:00:00+00:00',
      }),
    )
    await expect(page.getByText('Щит знаходиться в кошику. Редагування вимкнено.')).toBeVisible()
    await expect(page.getByRole('toolbar')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Зберегти', exact: true })).toHaveCount(0)
    await expect(page.getByTestId('element')).toHaveCount(1)
  })
})
