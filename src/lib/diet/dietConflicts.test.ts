import { describe, it, expect } from 'vitest'
import { dietConflicts, type ConflictInput } from './dietConflicts'

const food = (p: Partial<ConflictInput>): ConflictInput => ({
  name: 'Food',
  meal: 'lunch',
  fructoseLevel: 'low',
  fructansLevel: 'low',
  dashGroup: null,
  noom: null,
  ...p,
})

describe('dietConflicts — dash-via-trigger (warn)', () => {
  it('flags a high-fructan grain (whole-wheat bread) counting toward DASH grains', () => {
    const [c] = dietConflicts([
      food({ name: 'Whole-wheat bread', dashGroup: 'grains', fructansLevel: 'high' }),
    ])
    expect(c.kind).toBe('dash-via-trigger')
    expect(c.tone).toBe('warn')
    expect(c.message).toContain('DASH Grains')
    expect(c.message).toContain('fructans')
    expect(c.message).not.toContain('fructose and')
  })

  it('flags a high-fructose fruit (apple) toward DASH fruits', () => {
    const [c] = dietConflicts([
      food({ name: 'Apple', dashGroup: 'fruits', fructoseLevel: 'high' }),
    ])
    expect(c.message).toContain('DASH Fruits')
    expect(c.message).toContain('fructose')
  })

  it('names both axes when both are high', () => {
    const [c] = dietConflicts([
      food({
        name: 'Garlic naan',
        dashGroup: 'grains',
        fructoseLevel: 'high',
        fructansLevel: 'high',
      }),
    ])
    expect(c.message).toContain('fructose and fructans')
  })

  it('does not flag moderate/unknown levels — only high triggers', () => {
    expect(
      dietConflicts([food({ dashGroup: 'fruits', fructoseLevel: 'moderate' })]),
    ).toEqual([])
    expect(
      dietConflicts([food({ dashGroup: 'grains', fructansLevel: 'unknown' })]),
    ).toEqual([])
  })

  it('does not flag a trigger in a non-produce/grain group (e.g. sweets)', () => {
    expect(
      dietConflicts([food({ dashGroup: 'sweets', fructoseLevel: 'high' })]),
    ).toEqual([])
  })
})

describe('dietConflicts — keep-despite-density (good)', () => {
  it('flags calorie-dense, FODMAP-clean fats/oils to keep them', () => {
    const [c] = dietConflicts([
      food({ name: 'Olive oil', dashGroup: 'fats-oils', noom: 'orange' }),
    ])
    expect(c.kind).toBe('keep-despite-density')
    expect(c.tone).toBe('good')
    expect(c.message.toLowerCase()).toContain('keep it')
  })

  it('flags dense clean nuts (walnuts) in nuts-seeds-legumes', () => {
    const [c] = dietConflicts([
      food({ name: 'Walnuts', dashGroup: 'nuts-seeds-legumes', noom: 'orange' }),
    ])
    expect(c.kind).toBe('keep-despite-density')
  })

  it('does not fire when not calorie-dense (green/yellow)', () => {
    expect(
      dietConflicts([food({ dashGroup: 'fats-oils', noom: 'yellow' })]),
    ).toEqual([])
  })

  it('does not fire when the food is not FODMAP-clean', () => {
    expect(
      dietConflicts([
        food({ dashGroup: 'fats-oils', noom: 'orange', fructoseLevel: 'moderate' }),
      ]),
    ).toEqual([])
  })
})

describe('dietConflicts — precedence, dedup, guards', () => {
  it('trigger warning wins over keep-advice for a high-fructan dense legume', () => {
    const [c] = dietConflicts([
      food({
        name: 'Baked beans',
        dashGroup: 'nuts-seeds-legumes',
        noom: 'orange',
        fructansLevel: 'high',
      }),
    ])
    expect(c.kind).toBe('dash-via-trigger')
  })

  it('deduplicates the same food logged twice into one conflict', () => {
    const walnuts = food({
      name: 'Walnuts',
      dashGroup: 'nuts-seeds-legumes',
      noom: 'orange',
    })
    const out = dietConflicts([walnuts, { ...walnuts, meal: 'snack' }])
    expect(out).toHaveLength(1)
  })

  it('never flags a food with no DASH group', () => {
    expect(
      dietConflicts([food({ dashGroup: null, fructansLevel: 'high', noom: 'orange' })]),
    ).toEqual([])
  })

  it('returns [] for an empty day', () => {
    expect(dietConflicts([])).toEqual([])
  })
})
