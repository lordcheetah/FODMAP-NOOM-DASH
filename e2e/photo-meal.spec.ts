import { test, expect, type Page } from '@playwright/test'

/**
 * Photo→meal e2e: the OS camera + the real Claude vision call CANNOT run in
 * headless CI, so we intercept the `analyze-meal` Edge Function request with
 * Playwright `page.route` and return a fixed two-item response, then set the
 * hidden file input directly. We drive review → add-as-custom → save → log and
 * assert it persists across a reload.
 *
 * HEALTH-SAFETY assertion: an AI-identified item kept as a custom food (no DB
 * match) must read "Not verified" and NEVER "Safe".
 *
 * SKIP (never FAIL) when test creds are absent — mirrors e2e/barcode.spec.ts.
 * The true device path (real camera + real Claude) is verified MANUALLY.
 *
 * Env: E2E_TEST_EMAIL / E2E_TEST_PASSWORD — throwaway test user credentials.
 */
const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD
const hasCreds = Boolean(EMAIL && PASSWORD)

// 1×1 transparent PNG (the file input just needs valid bytes; the analyze call
// is mocked, so the real downscale/encode output is irrelevant to the assertion).
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

test.describe('Photo→meal flow (mocked analyze)', () => {
  test.skip(
    !hasCreds,
    'Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run the photo-meal e2e.',
  )

  async function login(page: Page) {
    await page.goto('/')
    await page.getByLabel(/email/i).fill(EMAIL!)
    await page.getByLabel(/password/i).fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(
      page.getByRole('heading', { name: 'FODMAP · NOOM · DASH' }),
    ).toBeVisible()
  }

  test('mocked analyze → custom food → log → persists, reads Not verified', async ({
    page,
  }) => {
    // Intercept the Edge Function call with a fixed two-item response.
    await page.route('**/functions/v1/analyze-meal', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          items: [
            {
              name: 'Mixed green salad',
              quantity_desc: '1 bowl',
              estimated_grams: 200,
              estimated_calories: 120,
              confidence: 'medium',
            },
            {
              name: 'Grilled chicken',
              quantity_desc: '1 breast',
              estimated_grams: 150,
              estimated_calories: 250,
              confidence: 'high',
            },
          ],
        }),
      })
    })

    await login(page)
    await page.getByRole('link', { name: 'Meals' }).click()

    // Open the photo flow and feed the hidden input a fixture image.
    await page.getByRole('button', { name: /photo of meal/i }).click()
    await page
      .getByTestId('photo-input')
      .setInputFiles({
        name: 'meal.png',
        mimeType: 'image/png',
        buffer: PNG_1x1,
      })

    // Review list shows the first item + the privacy/AI notice.
    const reviewDialog = page.getByRole('dialog')
    await expect(reviewDialog).toContainText('Mixed green salad')
    await expect(reviewDialog).toContainText(/not stored/i)

    // Add it as a custom food.
    await page.getByRole('button', { name: /add as custom food/i }).click()

    // The custom form defaults to "Not verified", NEVER "Safe".
    const form = page.getByRole('dialog')
    await expect(form).toContainText(/FODMAP not verified/i)
    await expect(form).toContainText('Not verified')
    await expect(form).not.toContainText(/\bSafe\b/)

    // Make the name unique so the reload assertion is unambiguous.
    const name = `E2E Photo Salad ${Date.now()}`
    await page.getByLabel('Name').fill(name)
    await page.getByRole('button', { name: /save & log/i }).click()

    // Flows into the add-to-log dialog → confirm.
    await page.getByRole('button', { name: /^add$/i }).click()

    // Appears in the daily log and survives a reload (RLS-scoped).
    await expect(page.getByText(name).first()).toBeVisible()
    await page.reload()
    await page.getByRole('link', { name: 'Meals' }).click()
    await expect(page.getByText(name).first()).toBeVisible()
  })
})
