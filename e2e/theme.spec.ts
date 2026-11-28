import { expect, test, type Page } from '@playwright/test'
import {
  block,
  cableEnd,
  id,
  mockApi,
  panelContent,
  rail,
  server,
  terminalEnd,
  wire,
} from './support'

const colours = ['black', 'brown', 'red', 'blue', 'green-yellow'] as const

// Cable wires 2..5 (cable 1) and 7 (cable 2) carry the five wire colours; all are bridged by one
// terminal block, so the whole drawing is also one short circuit (halo).
function content() {
  const cable = (n: number, wires: [number, string][]) => ({
    id: id(n),
    label: '',
    voltage: 230,
    frequency: 50,
    crossSection: 4,
    wires: wires.map(([w, colour]) => ({ id: id(w), colour })),
  })
  return panelContent({
    inputCables: [
      cable(1, [
        [2, 'black'],
        [3, 'brown'],
        [4, 'red'],
        [5, 'blue'],
      ]),
      cable(6, [[7, 'green-yellow']]),
    ],
    rails: [rail(10, [], [block(40, 2, 1, 5)])],
    wires: [2, 3, 4, 5, 7].map((w, i) => ({
      ...wire(30 + i, cableEnd(id(w)), terminalEnd(id(40), i)),
      colour: colours[i],
    })),
  })
}

// the backend's answer is shown while the content equals the saved one
const circuits = [
  {
    sources: [id(2), id(3), id(4), id(5), id(7)],
    wireIds: [30, 31, 32, 33, 34].map(id),
    terminals: [],
  },
]

async function open(page: Page) {
  await mockApi(page, server(content(), { shortCircuits: circuits }))
  await page.goto('/panels/p1')
  await expect(page.getByTestId('wire')).toHaveCount(5)
}

test.describe('dark theme', () => {
  test.use({ colorScheme: 'dark' })

  test('wires get a light casing and the schematic follows the theme', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('wire-casing')).toHaveCount(5)
    // `var(--schematic-casing)` really resolves to a colour (an undefined property would give none)
    const strokes = await page
      .getByTestId('wire-casing')
      .evaluateAll((els) => els.map((el) => getComputedStyle(el).stroke))
    expect(strokes).toHaveLength(5)
    for (const stroke of strokes) {
      expect(stroke).not.toBe('')
      expect(stroke).not.toBe('none')
      expect(stroke).toMatch(/^(rgb|color)/)
    }
    const sheet = await page
      .locator('.sheet')
      .first()
      .evaluate((el) => getComputedStyle(el).fill)
    expect(sheet).toBe('rgb(32, 37, 44)')
    // every wire colour and the halo stay the domain colours
    await expect(page.locator('path[stroke="#ff00ff"]')).toHaveCount(5)
    for (const hex of ['#1a1a1a', '#7b4a1e', '#d32f2f', '#1e5bd6', '#2e9d3a']) {
      await expect(page.locator(`path[stroke="${hex}"]`)).not.toHaveCount(0)
    }
  })

  test('selecting a wire shows the selection highlight', async ({ page }) => {
    await open(page)
    await page.getByTestId('wire').first().click({ force: true })
    await expect(page.locator('path[style*="--schematic-selection"]')).toHaveCount(1)
  })
})

test.describe('light theme', () => {
  test('has no casing', async ({ page }) => {
    await open(page)
    await expect(page.getByTestId('wire-casing')).toHaveCount(0)
  })
})

test.describe('appearance menu', () => {
  test('a palette and mode choice is saved to the profile and survives a reload', async ({
    page,
  }) => {
    await mockApi(page, server(content()))
    const puts: unknown[] = []
    page.on('request', (r) => {
      if (r.method() === 'PUT' && r.url().endsWith('/me/theme')) puts.push(r.postDataJSON())
    })
    await page.goto('/panels/p1')
    await page.getByTestId('appearance-menu').click()
    await page.getByTestId('palette-green').click()
    await page.getByTestId('mode-dark').click()
    await expect.poll(() => puts.at(-1)).toEqual({ mode: 'dark', palette: 'green' })
    await page.reload()
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--greenDark/)
  })

  test('the page background follows a runtime theme change (light and dark)', async ({ page }) => {
    await mockApi(page, server(content()))
    await page.goto('/panels/p1')
    const background = () =>
      page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor)
    const scheme = () => page.evaluate(() => document.documentElement.style.colorScheme)
    await page.getByTestId('appearance-menu').click()
    await page.getByTestId('mode-light').click()
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--blueLight/)
    const light = await background()
    expect(await scheme()).toBe('light')
    await page.getByTestId('mode-dark').click()
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--blueDark/)
    await expect.poll(background).not.toBe(light)
    const dark = await background()
    expect(dark).toMatch(/^rgb/)
    expect(await scheme()).toBe('dark')
    await page.getByTestId('mode-light').click()
    await expect.poll(background).toBe(light)
    expect(await scheme()).toBe('light')
  })

  test('the profile theme is applied after sign-in data loads', async ({ page }) => {
    await mockApi(page, server(content()))
    await page.route('**/api/v1/me', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'u1',
          email: 'a@b.c',
          emailVerified: true,
          twoFactorEnabled: false,
          locale: null,
          themeMode: 'dark',
          themePalette: 'violet',
        }),
      }),
    )
    await page.goto('/panels/p1')
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--violetDark/)
  })

  test('a failed save shows a dismissible notice and the theme still changes', async ({ page }) => {
    await mockApi(page, server(content()))
    await page.route('**/api/v1/me/theme', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"type":"unknown"}' }),
    )
    await page.goto('/panels/p1')
    await page.getByTestId('appearance-menu').click()
    await page.getByTestId('palette-orange').click()
    await expect(page.getByTestId('theme-not-saved')).toBeVisible()
    await expect(page.locator('.v-application')).toHaveClass(/v-theme--orangeLight/)
    await page.getByTestId('theme-not-saved').getByRole('button', { name: 'Закрити' }).click()
    await expect(page.getByTestId('theme-not-saved')).toBeHidden()
  })
})
