import { QueryClient } from '@tanstack/react-query'
import { describe, it, expect } from 'vitest'
import {
  buildAddWeightDefaults,
  buildDeleteWeightDefaults,
  buildUpsertBodyProfileDefaults,
} from './mutationDefaults'
import { queryKeys } from './queryKeys'
import type { WeightLogRow, BodyProfileRow } from './bodyMetrics'

const uid = 'u1'
const row = (over: Partial<WeightLogRow>): WeightLogRow => ({
  id: 'r1',
  user_id: uid,
  recorded_on: '2026-06-01',
  weight_kg: 79,
  note: null,
  created_at: '2026-06-01T00:00:00Z',
  ...over,
})

describe('weight/profile optimistic mutation defaults', () => {
  it('addWeight prepends an optimistic temp row', async () => {
    const qc = new QueryClient()
    qc.setQueryData(queryKeys.weightLog(uid), [] as WeightLogRow[])
    const d = buildAddWeightDefaults(qc)
    await d.onMutate({ userId: uid, weight_kg: 80 })
    const rows = qc.getQueryData<WeightLogRow[]>(queryKeys.weightLog(uid))!
    expect(rows).toHaveLength(1)
    expect(rows[0].weight_kg).toBe(80)
    expect(rows[0].id.startsWith('optimistic-')).toBe(true)
  })

  it('addWeight rolls back on error', async () => {
    const qc = new QueryClient()
    const prev = [row({})]
    qc.setQueryData(queryKeys.weightLog(uid), prev)
    const d = buildAddWeightDefaults(qc)
    const ctx = await d.onMutate({ userId: uid, weight_kg: 80 })
    d.onError(new Error('x'), { userId: uid, weight_kg: 80 }, ctx)
    expect(qc.getQueryData(queryKeys.weightLog(uid))).toEqual(prev)
  })

  it('deleteWeight removes by id; a temp-id delete skips the network', async () => {
    const qc = new QueryClient()
    qc.setQueryData(queryKeys.weightLog(uid), [row({}), row({ id: 'r2' })])
    const d = buildDeleteWeightDefaults(qc)
    await d.onMutate({ userId: uid, id: 'r1' })
    expect(
      qc.getQueryData<WeightLogRow[]>(queryKeys.weightLog(uid))!.map((r) => r.id),
    ).toEqual(['r2'])
    // temp-id delete resolves without touching Supabase
    await expect(
      d.mutationFn({ userId: uid, id: 'optimistic-abc' }),
    ).resolves.toBeUndefined()
  })

  it('upsertBodyProfile merges the patch into the cached profile', async () => {
    const qc = new QueryClient()
    const prev: BodyProfileRow = {
      user_id: uid,
      height_cm: 175,
      sex: null,
      weight_unit: 'lb',
      height_unit: 'ftin',
      on_raas_drug: false,
      updated_at: '2026-06-01T00:00:00Z',
    }
    qc.setQueryData(queryKeys.bodyProfile(uid), prev)
    const d = buildUpsertBodyProfileDefaults(qc)
    await d.onMutate({ userId: uid, weight_unit: 'kg', on_raas_drug: true })
    const p = qc.getQueryData<BodyProfileRow>(queryKeys.bodyProfile(uid))!
    expect(p.weight_unit).toBe('kg')
    expect(p.on_raas_drug).toBe(true) // RAAS flag merges through
    expect(p.height_cm).toBe(175) // unchanged fields preserved
  })

  it('optimistic profile defaults on_raas_drug to false for a brand-new row', async () => {
    const qc = new QueryClient()
    const d = buildUpsertBodyProfileDefaults(qc)
    await d.onMutate({ userId: uid, sex: 'male' })
    const p = qc.getQueryData<BodyProfileRow>(queryKeys.bodyProfile(uid))!
    expect(p.on_raas_drug).toBe(false)
  })
})
