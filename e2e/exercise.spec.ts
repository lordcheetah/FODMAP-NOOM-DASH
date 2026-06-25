import { test, expect, type Page } from '@playwright/test'

/**
 * Exercise e2e: login -> browse -> open a short routine -> start -> skip through
 * -> finish -> log -> reload persists.
 *
 * SKIP (never FAIL) when test creds are absent so CI without a configured
 * Supabase test project stays green. Requires a THROWAWAY Supabase test user +
 * seeded exercise data (workouts/exercises) — never the owner's real account.
 *
 * Env:
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD  — test user credentials
 *   E2E_TEST_WORKOUT                    — a seeded workout name to open
 *                                         (default "Mayo Back 15-Minute Routine")
 */
const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD
const WORKOUT = process.env.E2E_TEST_WORKOUT ?? 'Mayo Back 15-Minute Routine'

const hasCreds = Boolean(EMAIL && PASSWORD)

test.describe('Exercise play + log flow', () => {
  test.skip(!hasCreds, 'Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run the exercise e2e.')

  async function login(page: Page) {
    await page.goto('/')
    await page.getByLabel(/email/i).fill(EMAIL!)
    await page.getByLabel(/password/i).fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('heading', { name: 'FODMAP · NOOM · DASH' })).toBeVisible()
  }

  test('browse, start a routine, finish, log, and persist across reload', async ({ page }) => {
    await login(page)
    await page.getByRole('link', { name: 'Exercise' }).click()
    await expect(page.getByRole('heading', { name: 'Exercise' })).toBeVisible()

    // Open the seeded workout from the browser list.
    const workoutBtn = page.getByRole('button', { name: new RegExp(WORKOUT, 'i') }).first()
    await expect(workoutBtn).toBeVisible()
    await workoutBtn.click()

    // Detail shows cautions/modifications somewhere; Start launches the player.
    await page.getByRole('button', { name: /start workout/i }).click()

    // Skip through every step quickly via the skip/done control until End wins.
    // Cap iterations so a misconfigured routine can't hang the test.
    for (let i = 0; i < 60; i++) {
      const skip = page.getByRole('button', { name: /(skip step|mark done)/i })
      if (await skip.isVisible().catch(() => false)) {
        await skip.click()
      } else {
        break
      }
      // If the complete dialog opened we're done.
      if (await page.getByRole('button', { name: /^save$/i }).isVisible().catch(() => false)) {
        break
      }
    }

    // Force-finish via End if still in the player.
    const endBtn = page.getByRole('button', { name: /finish workout/i })
    if (await endBtn.isVisible().catch(() => false)) {
      await endBtn.click()
    }

    // Complete dialog: save the session.
    await page.getByRole('button', { name: /^save$/i }).click()

    // It appears in today's sessions.
    await expect(
      page.getByRole('heading', { name: /today's sessions/i }),
    ).toBeVisible()
    await expect(page.getByText(new RegExp(WORKOUT, 'i')).first()).toBeVisible()

    // Reload — the session persists (RLS-scoped to the user).
    await page.reload()
    await page.getByRole('link', { name: 'Exercise' }).click()
    await expect(page.getByText(new RegExp(WORKOUT, 'i')).first()).toBeVisible()
  })
})
