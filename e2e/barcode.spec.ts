import { test, expect, type Page } from '@playwright/test'

/**
 * Barcode e2e: the MANUAL-add path (camera can't run in headless CI, so we do
 * NOT drive a live scan). Opening the scanner, choosing "Add manually", filling
 * the review form, saving, and logging exercises useCreateFood + AddToLogDialog
 * end to end without a camera.
 *
 * HEALTH-SAFETY assertion: a product saved with the default (unknown) FODMAP axes
 * must read "Not verified" and NEVER "Safe".
 *
 * SKIP (never FAIL) when test creds are absent — mirrors e2e/meals.spec.ts.
 *
 * Env:
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD — throwaway test user credentials.
 */
const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD
const hasCreds = Boolean(EMAIL && PASSWORD)

test.describe('Barcode manual-add flow', () => {
  test.skip(!hasCreds, 'Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run the barcode e2e.')

  async function login(page: Page) {
    await page.goto('/')
    await page.getByLabel(/email/i).fill(EMAIL!)
    await page.getByLabel(/password/i).fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(
      page.getByRole('heading', { name: 'FODMAP · NOOM · DASH' }),
    ).toBeVisible()
  }

  test('manual add via scan flow saves an unverified product, logs it, persists', async ({
    page,
  }) => {
    await login(page)
    await page.getByRole('link', { name: 'Meals' }).click()

    // Open the scanner, then skip the camera with "Add manually".
    await page.getByRole('button', { name: /scan barcode/i }).click()
    await page.getByRole('button', { name: /add manually/i }).click()

    // The review form defaults to "Not verified", NEVER "Safe".
    const dialog = page.getByRole('dialog')
    await expect(dialog).toContainText(/FODMAP not verified/i)
    await expect(dialog).toContainText('Not verified')
    await expect(dialog).not.toContainText(/\bSafe\b/)

    // Fill the required fields with a unique name and save.
    const name = `E2E Scan Product ${Date.now()}`
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Serving', { exact: true }).fill('1 bar')
    await page.getByLabel('Serving grams').fill('40')
    await page.getByLabel('Calories').fill('150')
    await page.getByRole('button', { name: /save & log/i }).click()

    // Flows into the add-to-log dialog → confirm.
    await page.getByRole('button', { name: /^add$/i }).click()

    // It appears in the daily log and survives a reload (RLS-scoped).
    await expect(page.getByText(name).first()).toBeVisible()
    await page.reload()
    await page.getByRole('link', { name: 'Meals' }).click()
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
