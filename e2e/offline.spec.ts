import { test, expect, type Page } from '@playwright/test'

/**
 * Offline e2e: login -> go offline -> log a meal (optimistic + banner) ->
 * reconnect -> banner clears -> reload -> entry persisted.
 *
 * NOTE: headless offline + service worker behavior is environment-sensitive
 * (timing of the SW install, IndexedDB rehydrate, and token refresh). This spec
 * is a documented CI-optional / manual path: it SKIPS (never fails) when test
 * creds are absent so default CI stays green, mirroring meals.spec.ts. It needs
 * a THROWAWAY Supabase test user + seeded data — never the owner's real account.
 *
 * Env:
 *   E2E_TEST_EMAIL / E2E_TEST_PASSWORD — test user credentials
 *   E2E_TEST_FOOD                      — a seeded food name to search (default "spinach")
 */
const EMAIL = process.env.E2E_TEST_EMAIL
const PASSWORD = process.env.E2E_TEST_PASSWORD
const FOOD = process.env.E2E_TEST_FOOD ?? 'spinach'

const hasCreds = Boolean(EMAIL && PASSWORD)

test.describe('Offline meal logging + sync', () => {
  test.skip(!hasCreds, 'Set E2E_TEST_EMAIL / E2E_TEST_PASSWORD to run the offline e2e.')

  async function login(page: Page) {
    await page.goto('/')
    await page.getByLabel(/email/i).fill(EMAIL!)
    await page.getByLabel(/password/i).fill(PASSWORD!)
    await page.getByRole('button', { name: /sign in/i }).click()
    await expect(page.getByRole('heading', { name: 'FODMAP · NOOM · DASH' })).toBeVisible()
  }

  test('logs offline, shows the banner, then persists after reconnect', async ({
    page,
    context,
  }) => {
    await login(page)
    await page.getByRole('link', { name: 'Meals' }).click()

    // Pre-fetch the food while ONLINE so the optimistic add can embed its real
    // FODMAP/NOOM data from the search cache.
    await page.getByRole('searchbox', { name: /search foods/i }).fill(FOOD)
    const addBtn = page
      .getByRole('button', { name: new RegExp(`add ${FOOD}`, 'i') })
      .first()
    await expect(addBtn).toBeVisible()

    // Go offline, then log the meal — the write is paused/queued by TanStack.
    await context.setOffline(true)
    await addBtn.click()
    await page.getByRole('button', { name: /^add$/i }).click()

    // Optimistic row appears immediately even with no network.
    await expect(page.getByText(new RegExp(FOOD, 'i')).first()).toBeVisible()

    // The offline banner reflects the disconnected state.
    await expect(
      page.getByRole('status').filter({ hasText: /offline/i }),
    ).toBeVisible()

    // Reconnect: queued mutation resumes; banner should clear once flushed.
    await context.setOffline(false)
    await expect(
      page.getByRole('status').filter({ hasText: /offline|syncing/i }),
    ).toHaveCount(0, { timeout: 15_000 })

    // Reload — the entry was written server-side and persists (RLS-scoped).
    await page.reload()
    await page.getByRole('link', { name: 'Meals' }).click()
    await expect(page.getByText(new RegExp(FOOD, 'i')).first()).toBeVisible()
  })
})
