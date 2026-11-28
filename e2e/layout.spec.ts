import { expect, test } from '@playwright/test'
import { mockApi, panelContent, server } from './support'

test.use({ viewport: { width: 1280, height: 720 } })

test.describe('layout at 1280x720', () => {
  test('the editor canvas fits the viewport and sits below the toolbar', async ({ page }) => {
    await mockApi(page, server(panelContent()))
    await page.goto('/panels/p1')
    const canvas = page.getByTestId('panel-canvas')
    await expect(canvas).toBeVisible()
    const box = (await canvas.boundingBox())!
    const bar = (await page.getByRole('toolbar').boundingBox())!
    expect(box.height).toBeGreaterThan(200) // a usable drawing area, not a collapsed one
    expect(box.y + box.height).toBeLessThanOrEqual(720)
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1)
  })

  test('the app bar is above the toolbar', async ({ page }) => {
    await mockApi(page, server(panelContent()))
    await page.goto('/panels/p1')
    const appBar = (await page.locator('header').first().boundingBox())!
    const toolbar = (await page.getByRole('toolbar').boundingBox())!
    expect(appBar.y + appBar.height).toBeLessThanOrEqual(toolbar.y + 1)
  })
})

test.describe('landmarks', () => {
  for (const path of ['/', '/panels/p1', '/account']) {
    test(`exactly one main landmark on ${path}`, async ({ page }) => {
      await mockApi(page, server(panelContent()))
      await page.goto(path)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expect(page.getByRole('main')).toHaveCount(1)
      await expect(page.locator('main')).toHaveCount(1)
    })
  }
})
