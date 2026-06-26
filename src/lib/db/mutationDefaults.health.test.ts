import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Health-safety: a custom food created offline must keep fructose/fructans
 * defaulting to `'unknown'` through the queue + resume round-trip — NEVER a
 * fabricated `'low'`/"safe" value. We mock the Supabase client to capture the
 * exact insert payload the registered `createFood` mutationFn sends.
 */

const { insertSpy } = vi.hoisted(() => ({ insertSpy: vi.fn() }))

vi.mock('@/lib/supabase', () => {
  const single = vi.fn().mockResolvedValue({
    data: {
      id: 'srv-1',
      user_id: 'user-1',
      name: 'Mystery snack',
      brand: null,
      serving_desc: '1 bar',
      serving_grams: null,
      calories: null,
      sodium_mg: null,
      sat_fat_g: null,
      potassium_mg: null,
      fiber_g: null,
      added_sugar_g: null,
      fructose_level: 'unknown',
      fructans_level: 'unknown',
      noom_category: null,
      dash_group: null,
      source: null,
      barcode: null,
      created_at: '2026-06-26T00:00:00.000Z',
    },
    error: null,
  })
  const select = vi.fn().mockReturnValue({ single })
  insertSpy.mockImplementation(() => ({ select }))
  return {
    supabase: { from: () => ({ insert: insertSpy }) },
    isSupabaseConfigured: true,
  }
})

import { QueryClient } from '@tanstack/react-query'
import { buildCreateFoodDefaults, type CreateFoodVars } from './mutationDefaults'

beforeEach(() => {
  insertSpy.mockClear()
})

describe('createFood mutationFn — unknown is never coerced to safe', () => {
  it('defaults both FODMAP axes to unknown when the user did not set them', async () => {
    const qc = new QueryClient()
    const defaults = buildCreateFoodDefaults(qc)
    const vars: CreateFoodVars = {
      userId: 'user-1',
      name: 'Mystery snack',
      serving_desc: '1 bar',
    }
    await defaults.mutationFn(vars)

    expect(insertSpy).toHaveBeenCalledTimes(1)
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.fructose_level).toBe('unknown')
    expect(payload.fructans_level).toBe('unknown')
    // Never the safe level.
    expect(payload.fructose_level).not.toBe('low')
    expect(payload.fructans_level).not.toBe('low')
  })

  it('passes through a user-chosen known level unchanged', async () => {
    const qc = new QueryClient()
    const defaults = buildCreateFoodDefaults(qc)
    await defaults.mutationFn({
      userId: 'user-1',
      name: 'Plain oats',
      serving_desc: '40 g',
      fructose_level: 'low',
      fructans_level: 'low',
    })
    const payload = insertSpy.mock.calls[0][0]
    expect(payload.fructose_level).toBe('low')
    expect(payload.fructans_level).toBe('low')
  })
})
