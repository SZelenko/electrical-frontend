import { expect, test } from '@playwright/test'

test('opens the login page for an anonymous visitor', async ({ page }) => {
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: '{"type":"token_invalid"}',
    }),
  )
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
})
