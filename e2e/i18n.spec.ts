import { expect, test, type Browser, type Page } from '@playwright/test'
import { mockApi as mockPanelApi, panelContent, server } from './support'

/** The language select, found by its label in either language. */
const switcher = (page: Page) => page.getByLabel(/^(Мова|Language)/)

/** In-memory "server": the session and the profile language survive across browser contexts. */
interface Backend {
  signedIn: boolean
  locale: 'uk' | 'en' | null
  localePuts: unknown[]
}

const ME = { id: 'u1', email: 'a@b.c', emailVerified: true, twoFactorEnabled: false }

async function mockApi(page: Page, s: Backend) {
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request()
    const path = new URL(req.url()).pathname.replace('/api/v1', '')
    const json = (status: number, body: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/auth/refresh')
      return s.signedIn ? json(200, { token: 't' }) : json(401, { type: 'token_invalid' })
    if (path === '/auth/login') {
      s.signedIn = true
      return json(200, { token: 't' })
    }
    if (path === '/me') return json(200, { ...ME, locale: s.locale })
    if (path === '/me/locale' && req.method() === 'PUT') {
      const body = req.postDataJSON() as { locale: 'uk' | 'en' }
      s.localePuts.push(body)
      s.locale = body.locale
      return json(200, { ...ME, locale: s.locale })
    }
    if (path === '/panels') return json(200, { member: [], totalItems: 0 })
    return json(404, { type: 'unknown' })
  })
}

const backend = (over: Partial<Backend> = {}): Backend => ({
  signedIn: false,
  locale: null,
  localePuts: [],
  ...over,
})

async function logIn(page: Page, labels: { email: string; password: string; submit: string }) {
  await page.getByLabel(labels.email).fill('a@b.c')
  await page.getByLabel(labels.password, { exact: true }).fill('Password-1234')
  await page.getByRole('button', { name: labels.submit }).click()
}

const UK = { email: 'Електронна пошта', password: 'Пароль', submit: 'Увійти' }

test.describe('language on the login page (Ukrainian browser)', () => {
  test.use({ locale: 'uk-UA' })

  test('starts in Ukrainian and switches to English without any API write', async ({ page }) => {
    const s = backend()
    await mockApi(page, s)
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'uk')

    await switcher(page).selectOption('en')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Create an account' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page).toHaveTitle('Electrical panel builder')
    expect(s.localePuts).toEqual([])
  })

  test('keeps English after a reload when signed out (localStorage)', async ({ page }) => {
    await mockApi(page, backend())
    await page.goto('/login')
    await switcher(page).selectOption('en')
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(switcher(page)).toHaveValue('en')
  })

  test('a Ukrainian browser without a stored choice starts in Ukrainian', async ({ page }) => {
    await mockApi(page, backend())
    await page.goto('/login')
    await expect(switcher(page)).toHaveValue('uk')
  })
})

test.describe('language of an English browser', () => {
  test.use({ locale: 'de-DE' })

  test('a non-Ukrainian browser starts in English', async ({ page }) => {
    await mockApi(page, backend())
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(switcher(page)).toHaveValue('en')
  })
})

test.describe('language after login', () => {
  test.use({ locale: 'uk-UA' })

  test('log in, choose English, reload: still English, saved to the profile', async ({ page }) => {
    const s = backend()
    await mockApi(page, s)
    await page.goto('/login')
    await logIn(page, UK)
    await expect(page.getByRole('heading', { name: 'Мої щити' })).toBeVisible()

    await switcher(page).selectOption('en')
    await expect(page.getByRole('heading', { name: 'My panels' })).toBeVisible()
    await expect.poll(() => s.localePuts).toEqual([{ locale: 'en' }])

    await page.reload()
    await expect(page.getByRole('heading', { name: 'My panels' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('a failed profile save shows the notice but the language still changes', async ({
    page,
  }) => {
    const s = backend({ signedIn: true })
    await mockApi(page, s)
    await page.route('**/api/v1/me/locale', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"type":"unknown"}' }),
    )
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Мої щити' })).toBeVisible()
    await switcher(page).selectOption('en')
    await expect(page.getByRole('heading', { name: 'My panels' })).toBeVisible()
    await expect(page.getByTestId('locale-not-saved')).toBeVisible()
  })

  test('a fresh browser context (no localStorage) picks the profile language after login', async ({
    browser,
  }) => {
    const s = backend({ locale: 'en' })
    const open = async (b: Browser) => {
      const context = await b.newContext({ locale: 'uk-UA' })
      const page = await context.newPage()
      await mockApi(page, s)
      return { context, page }
    }
    const { context, page } = await open(browser)
    await page.goto('/login')
    // the login page is still in the browser language: the profile is unknown until sign-in
    await expect(page.getByRole('heading', { name: 'Вхід' })).toBeVisible()
    await logIn(page, UK)
    await expect(page.getByRole('heading', { name: 'My panels' })).toBeVisible()
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    expect(s.localePuts).toEqual([]) // applying the profile never writes it back
    await context.close()

    // a second fresh context, already signed in on the server: the session restore applies it
    const second = await open(browser)
    await second.page.goto('/')
    await expect(second.page.getByRole('heading', { name: 'My panels' })).toBeVisible()
    await second.context.close()
  })

  test('a profile without a language keeps the browser choice and saves nothing', async ({
    page,
  }) => {
    const s = backend({ locale: null })
    await mockApi(page, s)
    await page.goto('/login')
    await switcher(page).selectOption('en')
    await logIn(page, { email: 'Email', password: 'Password', submit: 'Sign in' })
    await expect(page.getByRole('heading', { name: 'My panels' })).toBeVisible()
    expect(s.localePuts).toEqual([])
  })
})

test.describe('a failed profile save on a narrow screen (360 px)', () => {
  test.use({ locale: 'uk-UA', viewport: { width: 360, height: 740 } })

  async function openPanel(page: Page) {
    const s = server(panelContent(), { name: 'Щит' })
    await mockPanelApi(page, s)
    await page.route('**/api/v1/me/locale', (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"type":"unknown"}' }),
    )
    await page.goto('/panels/p1')
    await expect(page.getByRole('heading', { name: 'Щит', level: 1 })).toBeVisible()
    await switcher(page).selectOption('en')
    await expect(page.getByTestId('locale-not-saved')).toBeVisible()
    return s
  }

  test('the notice does not block Rename and Save, and can be dismissed', async ({ page }) => {
    const s = await openPanel(page)
    // Rename is clickable (Playwright fails the click when another element covers it)
    await page.getByRole('button', { name: 'Rename' }).click()
    await expect(page.getByRole('textbox')).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()

    await page.getByRole('button', { name: 'Add rail' }).click()
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.poll(() => s.puts.length).toBe(1)

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('locale-not-saved')).toBeHidden()
  })

  test('the dismiss button hides the notice and the language stays English', async ({ page }) => {
    await openPanel(page)
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('locale-not-saved')).toBeHidden()
    await expect(switcher(page)).toHaveValue('en')
  })
})
