import { expect, test, type Locator, type Page } from '@playwright/test'
import {
  element,
  id,
  mockApi,
  panelContent,
  pickOption,
  press,
  rail,
  rowBlock,
  server,
} from './support'

// the bottom row lies below the fold of the default 720 px viewport; mouse drags need it on screen
test.use({ viewport: { width: 1280, height: 1100 } })

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

const button = (page: Page, name: string | RegExp) => page.getByRole('button', { name })
const rowBlockEl = (page: Page) => page.locator('[data-testid="block"][data-block-zone="row"]')
const cableWire = (page: Page, n: number) =>
  page.locator(`[data-ep-kind="cableWire"][data-ep-a="${id(n)}"]`)
const pole = (page: Page, elementId: string, i: number, side: 'input' | 'output') =>
  page.locator(
    `[data-ep-kind="pole"][data-ep-a="${elementId}"][data-ep-b="${i}"][data-ep-side="${side}"]`,
  )

/** A block lies inside a band when its centre is between the band's top and bottom edges. */
async function insideBand(block: Locator, band: Locator) {
  const b = await centre(block)
  const r = (await band.boundingBox())!
  return b.y >= r.y && b.y <= r.y + r.height
}

interface SavedContent {
  terminalRow: { id: string; offsetModules: number }[]
  bottomTerminalRow: { id: string; offsetModules: number }[]
  inputCableSide: string
  outputCableSide: string
  wires: { start: Record<string, unknown>; end: Record<string, unknown> }[]
}

test('a block added to the bottom row is dragged to the top row, saved and still there after reload', async ({
  page,
}) => {
  const s = await open(page)
  const top = page.getByTestId('terminal-row')
  const bottom = page.getByTestId('terminal-row-bottom')
  await expect(top).toHaveCount(1)
  await expect(bottom).toHaveCount(1)

  await page.getByTestId('add-row-block-bottom').click()
  await expect(rowBlockEl(page)).toHaveCount(1)
  expect(await insideBand(rowBlockEl(page), bottom)).toBe(true)
  expect(await insideBand(rowBlockEl(page), top)).toBe(false)

  const from = await centre(rowBlockEl(page))
  const to = await centre(top)
  await drag(page, from, { x: from.x, y: to.y })
  await expect(rowBlockEl(page)).toHaveCount(1)
  expect(await insideBand(rowBlockEl(page), top)).toBe(true)
  await expect(
    page.getByRole('button', { name: /^Скасувати: Перемістити клемний блок/ }),
  ).toBeVisible()

  await button(page, 'Зберегти').click()
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()
  const saved = s.puts[0]!.content as unknown as SavedContent
  expect(saved.terminalRow).toHaveLength(1)
  expect(saved.bottomTerminalRow).toHaveLength(0)

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Щит', level: 1 })).toBeVisible()
  await expect(rowBlockEl(page)).toHaveCount(1)
  expect(await insideBand(rowBlockEl(page), page.getByTestId('terminal-row'))).toBe(true)
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()
})

test('undo of the drag between the rows puts the block back into the bottom row', async ({
  page,
}) => {
  await open(page)
  await page.getByTestId('add-row-block-bottom').click()
  const from = await centre(rowBlockEl(page))
  const to = await centre(page.getByTestId('terminal-row'))
  await drag(page, from, { x: from.x, y: to.y })
  expect(await insideBand(rowBlockEl(page), page.getByTestId('terminal-row'))).toBe(true)
  await button(page, /^Скасувати: Перемістити клемний блок/).click()
  expect(await insideBand(rowBlockEl(page), page.getByTestId('terminal-row-bottom'))).toBe(true)
})

test('a drop on a taken place of the other row is refused and the block stays', async ({
  page,
}) => {
  await open(
    page,
    panelContent({ terminalRow: [rowBlock(50, 0, 2)], bottomTerminalRow: [rowBlock(51, 0, 2)] }),
  )
  const blocks = rowBlockEl(page)
  await expect(blocks).toHaveCount(2)
  const bottomBlock = page.locator(`[data-testid="block"][data-id="${id(51)}"]`)
  const topBlock = page.locator(`[data-testid="block"][data-id="${id(50)}"]`)
  const from = await centre(bottomBlock)
  const to = await centre(topBlock)
  await drag(page, from, to)
  await expect(page.getByText(/Елемент повернено на місце/)).toBeVisible()
  expect(await insideBand(bottomBlock, page.getByTestId('terminal-row-bottom'))).toBe(true)
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()
})

test('the properties action moves a row block to the other row and undo reverts it', async ({
  page,
}) => {
  await open(page, panelContent({ terminalRow: [rowBlock(50, 3, 2)] }))
  const blockEl = rowBlockEl(page)
  await blockEl.click()
  await expect(page.getByTestId('block-row')).toHaveText('Верхній ряд клемників')
  await page.getByTestId('move-block-row').click()
  expect(await insideBand(blockEl, page.getByTestId('terminal-row-bottom'))).toBe(true)
  await expect(page.getByTestId('block-row')).toHaveText('Нижній ряд клемників')
  await button(page, /^Скасувати: Перенести клемник в інший ряд/).click()
  expect(await insideBand(blockEl, page.getByTestId('terminal-row'))).toBe(true)
})

test('switching the input cables to the left re-lays the drawing, keeps the wires attached and saves the side', async ({
  page,
}) => {
  const s = await open(page, panelContent({ rails: [rail(10, [element(20, 4, 2, 2)])] }))
  await press(cableWire(page, 2))
  await press(pole(page, id(20), 0, 'input'))
  await expect(page.getByTestId('wire')).toHaveCount(1)
  await page.locator('[data-kind="background"]').click({ position: { x: 5, y: 5 } }) // deselect: the panel properties show
  await expect(page.getByTestId('input-cable')).toHaveAttribute('data-side', 'top')
  const railBefore = (await page.getByTestId('rail').boundingBox())!

  await pickOption(page, 'Сторона вхідних кабелів', 'Зліва')
  await expect(page.getByTestId('input-cable')).toHaveAttribute('data-side', 'left')
  const railAfter = (await page.getByTestId('rail').boundingBox())!
  expect(railAfter.x).toBeGreaterThan(railBefore.x) // the rails start right of the column
  await expect(page.getByTestId('wire')).toHaveCount(1)

  // the wire starts on the (moved) cable wire contact and ends on the pole contact
  const ends = await page.evaluate(
    ({ a, b }) => {
      const hit = (sel: string) => {
        const el = document.querySelector(sel) as SVGGraphicsElement
        return { x: Number(el.getAttribute('cx')), y: Number(el.getAttribute('cy')) }
      }
      const d = (document.querySelector('[data-testid="wire"]') as SVGPathElement).getAttribute(
        'd',
      )!
      const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number)
      return {
        start: { x: nums[0]!, y: nums[1]! },
        end: { x: nums[nums.length - 2]!, y: nums[nums.length - 1]! },
        cable: hit(a),
        pole: hit(b),
      }
    },
    {
      a: `[data-ep-kind="cableWire"][data-ep-a="${id(2)}"]`,
      b: `[data-ep-kind="pole"][data-ep-a="${id(20)}"][data-ep-b="0"][data-ep-side="input"]`,
    },
  )
  expect(ends.start).toEqual(ends.cable)
  expect(ends.end).toEqual(ends.pole)

  await button(page, 'Зберегти').click()
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()
  const saved = s.puts[0]!.content as unknown as SavedContent
  expect(saved.inputCableSide).toBe('left')
  expect(saved.outputCableSide).toBe('bottom')
  expect(saved.wires).toHaveLength(1)
  expect(saved.wires[0]!.start).toMatchObject({ kind: 'cableWire', cableWireId: id(2) })

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Щит', level: 1 })).toBeVisible()
  await expect(page.getByTestId('input-cable')).toHaveAttribute('data-side', 'left')
  await expect(page.getByTestId('wire')).toHaveCount(1)
})

test('one undo returns the cables to their side and the layout to its place', async ({ page }) => {
  await open(page, panelContent({ rails: [rail(10, [element(20, 4, 2, 2)])] }))
  const before = (await page.getByTestId('rail').boundingBox())!
  await pickOption(page, 'Сторона вхідних кабелів', 'Справа')
  await expect(page.getByTestId('input-cable')).toHaveAttribute('data-side', 'right')
  await button(page, /^Скасувати: Змінити сторону кабелів/).click()
  await expect(page.getByTestId('input-cable')).toHaveAttribute('data-side', 'top')
  await page.evaluate(() => window.scrollTo(0, 0)) // opening the select scrolled the page to the field
  const after = (await page.getByTestId('rail').boundingBox())!
  expect(after.x).toBeCloseTo(before.x, 0)
  expect(after.y).toBeCloseTo(before.y, 0)
  await expect(page.getByText('Усі зміни збережено')).toBeVisible()
})

test('output cables on the right and inputs on the same side share one column', async ({
  page,
}) => {
  await open(
    page,
    panelContent({
      outputCables: [
        {
          id: id(4),
          label: '',
          description: '',
          load: 'socket',
          wires: [{ id: id(5), colour: 'brown' }],
        },
      ],
    }),
  )
  await pickOption(page, 'Сторона вхідних кабелів', 'Справа')
  await pickOption(page, 'Сторона вихідних кабелів', 'Справа')
  const input = (await page.getByTestId('input-cable').boundingBox())!
  const output = (await page.getByTestId('output-cable').boundingBox())!
  expect(output.y).toBeGreaterThan(input.y + input.height - 1) // one column, inputs first
  expect(Math.abs(output.x - input.x)).toBeLessThan(2)
})
