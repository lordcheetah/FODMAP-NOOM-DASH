import { test, expect, type Page } from '@playwright/test'

/**
 * Meals e2e: login -> search + add -> summaries -> reload persists.
 *
 * SKIP (never FAIL) when test creds are absent so CI without a configured
 * Supabase test project stays green. Requires a THROWAWAY Supabase test user +
 * seeded data — never the owner's real account.
 *
 * Env:
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD  — test user credentials
 *   E2E_TEST_FOOD                       — a seeded food name to search (default "spinach")
 *   E2E_TEST_UNKNOWN_FOOD              — a seeded unknown-FODMAP food (optional)
 */
const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD
const FOOD = process.env.E2E_TEST_FOOD ?? 'spinach'
const UNKNOWN_FOOD = process.env.E2E_TEST_UNKNOWN_FOOD

const hasCreds = Boolean(EMAIL && PASSWORD)

test.describe('Meals logging flow', () => {
  test.skip(!hasCreds, 'Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run the meals e2e.')

  async function login(page: Page) {
    await page.goto('/')
    // App gates on auth when Supabase is configured; fill the login form.
    await page.getByLabel(/email/i).fill(EMAIL!)
    await page.getByLabel(/password/i).fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('heading', { name: 'FODMAP · NOOM · DASH' })).toBeVisible()
  }

  test('search, add, summarize, and persist across reload', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Meals' }).click()

    // Disclaimer must be visible on the meals screen.
    await expect(page.getByText(/not medical advice/i).first()).toBeVisible()

    // Search and add the seeded food.
    await page.getByRole('searchbox', { name: /search foods/i }).fill(FOOD)
    const addBtn = page.getByRole('button', { name: new RegExp(`add ${FOOD}`, 'i') }).first()
    await expect(addBtn).toBeVisible()
    await addBtn.click()

    // Add dialog: confirm.
    await page.getByRole('button', { name: /^add$/i }).click()

    // It appears in the daily log + summary reflects it (non-zero calories area).
    await expect(page.getByText(new RegExp(FOOD, 'i')).first()).toBeVisible()
    await expect(page.getByRole('heading', { name: /day summary/i })).toBeVisible()

    // Reload — the entry persists (RLS-scoped to the user).
    await page.reload()
    await page.getByRole('link', { name: 'Meals' }).click()
    await expect(page.getByText(new RegExp(FOOD, 'i')).first()).toBeVisible()
  })

  test('a known-unknown food reads "Not verified", never "Safe"', async ({ page }) => {
    test.skip(!UNKNOWN_FOOD, 'Set E2E_TEST_UNKNOWN_FOOD to assert the not-verified label.')
    await login(page)
    await page.getByRole('link', { name: 'Meals' }).click()
    await page.getByRole('searchbox', { name: /search foods/i }).fill(UNKNOWN_FOOD!)
    const row = page.locator('li', { hasText: new RegExp(UNKNOWN_FOOD!, 'i') }).first()
    await expect(row).toContainText('Not verified')
    await expect(row).not.toContainText(/\bSafe\b/)
  })
})
