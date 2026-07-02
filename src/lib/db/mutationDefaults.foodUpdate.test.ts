import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * updateFood writes the edited food by id, scoped to the owner (id + user_id
 * filters, matching the RLS `user_id = auth.uid()` policy so seed rows can't be
 * touched). It persists the DASH group (the field that makes a food count toward
 * its serving target) and still defaults FODMAP to `'unknown'` — never a
 * fabricated "safe" — when a level is absent. We mock the Supabase update chain
 * to capture the exact payload + filters.
 */

const { updateSpy, eqSpy } = vi.hoisted(() => ({
  updateSpy: vi.fn(),
  eqSpy: vi.fn(),
}))

vi.mock('@/lib/supabase', () => {
  const single = vi.fn().mockResolvedValue({
    data: {
      id: 'food-1',
      user_id: 'user-1',
      name: 'Home salsa',
      brand: null,
      serving_desc: '2 tbsp',
      serving_grams: 30,
      calories: 10,
      sodium_mg: 90,
      sat_fat_g: 0,
      potassium_mg: 60,
      fiber_g: 1,
      added_sugar_g: 0,
      fructose_level: 'unknown',
      fructans_level: 'unknown',
      noom_category: 'non-starchy-veg',
      dash_group: 'vegetables',
      source: null,
      barcode: null,
      created_at: '2026-06-01T00:00:00.000Z',
    },
    error: null,
  })
  const select = vi.fn().mockReturnValue({ single })
  const chain = { eq: eqSpy, select }
  eqSpy.mockReturnValue(chain)
  updateSpy.mockReturnValue(chain)
  return {
    supabase: { from: () => ({ update: updateSpy }) },
    isSupabaseConfigured: true,
  }
})

import { QueryClient } from '@tanstack/react-query'
import { buildUpdateFoodDefaults, type UpdateFoodVars } from './mutationDefaults'

beforeEach(() => {
  updateSpy.mockClear()
  eqSpy.mockClear()
})

describe('updateFood mutationFn', () => {
  it('persists the DASH group and scopes the write to id + owner', async () => {
    const qc = new QueryClient()
    const defaults = buildUpdateFoodDefaults(qc)
    const vars: UpdateFoodVars = {
      userId: 'user-1',
      id: 'food-1',
      name: 'Home salsa',
      serving_desc: '2 tbsp',
      dash_group: 'vegetables',
      noom_category: 'non-starchy-veg',
    }
    await defaults.mutationFn(vars)

    expect(updateSpy).toHaveBeenCalledTimes(1)
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.dash_group).toBe('vegetables')
    expect(payload.noom_category).toBe('non-starchy-veg')
    // Absent FODMAP stays unknown — never a fabricated "safe".
    expect(payload.fructose_level).toBe('unknown')
    expect(payload.fructans_level).toBe('unknown')

    // Owner-scoped: id AND user_id filters (mirrors the RLS policy).
    expect(eqSpy).toHaveBeenCalledWith('id', 'food-1')
    expect(eqSpy).toHaveBeenCalledWith('user_id', 'user-1')
  })

  it('passes a user-chosen known FODMAP level through unchanged', async () => {
    const qc = new QueryClient()
    const defaults = buildUpdateFoodDefaults(qc)
    await defaults.mutationFn({
      userId: 'user-1',
      id: 'food-1',
      name: 'Home salsa',
      serving_desc: '2 tbsp',
      fructose_level: 'low',
      fructans_level: 'moderate',
    })
    const payload = updateSpy.mock.calls[0][0]
    expect(payload.fructose_level).toBe('low')
    expect(payload.fructans_level).toBe('moderate')
  })
})
