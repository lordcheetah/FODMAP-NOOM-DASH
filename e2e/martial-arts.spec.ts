import { test, expect, type Page } from '@playwright/test'

/**
 * Martial-arts e2e: login -> Exercise -> Martial Arts category -> see the safety
 * note + discipline grouping -> open an MA routine -> see cautions.
 *
 * SKIP (never FAIL) without test creds so CI without a configured Supabase test
 * project stays green. Requires a THROWAWAY test user + seeded MA data — never
 * the owner's real account.
 *
 * Env:
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD  — test user credentials
 *   E2E_MA_WORKOUT                      — a seeded MA workout name to open
 *                                         (default "Boxing Shadowboxing Rounds")
 */
const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD
const MA_WORKOUT = process.env.E2E_MA_WORKOUT ?? 'Boxing Shadowboxing Rounds'

const hasCreds = Boolean(EMAIL && PASSWORD)

test.describe('Martial Arts browse + safety note', () => {
  test.skip(!hasCreds, 'Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run the martial-arts e2e.')

  async function login(page: Page) {
    await page.goto('/')
    await page.getByLabel(/email/i).fill(EMAIL!)
    await page.getByLabel(/password/i).fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('heading', { name: 'FODMAP · NOOM · DASH' })).toBeVisible()
  }

  test('select Martial Arts, see safety note, open a routine, see cautions', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Exercise' }).click()
    await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible()

    // Pick the Martial Arts category chip.
    await page.getByRole('button', { name: /^Martial Arts$/ }).click()

    // The category-specific safety note appears (distinct from the diet disclaimer).
    await expect(page.getByText(/not a substitute for a qualified instructor/i)).toBeVisible()

    // Open an MA workout from the list.
    const workoutBtn = page.getByRole('button', { name: new RegExp(MA_WORKOUT, 'i') }).first()
    await expect(workoutBtn).toBeVisible()
    await workoutBtn.click()

    // Detail shows the safety note again and at least one exercise's cautions.
    await expect(page.getByText(/not a substitute for a qualified instructor/i)).toBeVisible()
    await expect(page.getByText(/cautions/i).first()).toBeVisible()
  })
})
