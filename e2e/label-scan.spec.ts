import { test, expect, type Page } from '@playwright/test'

/**
 * Nutrition-label scan e2e: the OS camera + the real Claude vision call CANNOT
 * run in headless CI, so we intercept the `analyze-label` Edge Function request
 * with Playwright `page.route` and return a fixed per-serving label, then set the
 * hidden file input directly. We drive review → save (custom food) → log and
 * assert it persists across a reload.
 *
 * HEALTH-SAFETY assertion: a label has no FODMAP data, so the scanned food must
 * read "Not verified" and NEVER "Safe".
 *
 * SKIP (never FAIL) when test creds are absent — mirrors e2e/photo-meal.spec.ts.
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

test.describe('Nutrition-label scan flow (mocked analyze)', () => {
  test.skip(
    !hasCreds,
    'Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run the label-scan e2e.',
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
    // Intercept the Edge Function call with a fixed per-serving label.
    await page.route('**/functions/v1/analyze-label', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: JSON.stringify({
          name: 'Crunchy Granola',
          serving_desc: '2/3 cup (55 g)',
          serving_grams: 55,
          calories: 230,
          sodium_mg: 160,
          sat_fat_g: 1.5,
          potassium_mg: 200,
          fiber_g: 4,
          added_sugar_g: 7,
        }),
      })
    })

    await login(page)
    await page.getByRole('link', { name: 'Meals' }).click()

    // Open the label flow and feed the hidden input a fixture image.
    await page.getByRole('button', { name: /scan nutrition label/i }).click()
    await page
      .getByTestId('label-input')
      .setInputFiles({
        name: 'label.png',
        mimeType: 'image/png',
        buffer: PNG_1x1,
      })

    // The review form opens prefilled, with the photo notice + "Not verified".
    const form = page.getByRole('dialog')
    await expect(form).toContainText(/read these numbers from a photo/i)
    await expect(form).toContainText(/FODMAP not verified/i)
    await expect(form).toContainText('Not verified')
    await expect(form).not.toContainText(/\bSafe\b/)

    // Make the name unique so the reload assertion is unambiguous.
    const name = `E2E Label Granola ${Date.now()}`
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
