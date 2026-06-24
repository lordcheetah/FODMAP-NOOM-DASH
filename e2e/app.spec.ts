import { test, expect } from '@playwright/test'

test('app shell loads with header and bottom nav', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'FODMAP · NOOM · DASH' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Meals' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Exercise' })).toBeVisible()
})

test('shows the medical disclaimer and never marks unknown food as safe', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/not medical advice/i)).toBeVisible()
  // The demo "Unlabeled snack" has unknown FODMAP levels — must read "Not verified".
  const row = page.locator('li', { hasText: 'Unlabeled snack' })
  await expect(row).toContainText('Not verified')
  await expect(row).not.toContainText('Safe')
})

test('client-side routing works', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Exercise' }).click()
  await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible()
})
