import { test, expect } from '@playwright/test'

test('app shell loads with header and bottom nav', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'FODMAP · NOOM · DASH' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Meals' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Exercise' })).toBeVisible()
})

test('shows the medical disclaimer on the home page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/not medical advice/i)).toBeVisible()
  // The "unknown FODMAP never renders as Safe" invariant is verified at the unit
  // level now: src/components/diet/FodmapBadge.test.tsx (render) +
  // healthSafety.test.ts (logic). The demo food this e2e once used is gone.
})

test('client-side routing works', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Exercise' }).click()
  await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible()
})
