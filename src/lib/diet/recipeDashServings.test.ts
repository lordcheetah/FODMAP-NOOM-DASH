import { describe, it, expect } from 'vitest'
import {
  recipeDashServings,
  type DashServingIngredient,
} from './recipeDashServings'

const ing = (p: Partial<DashServingIngredient>): DashServingIngredient => ({
  quantity: 1,
  unit: 'serving',
  food: null,
  ...p,
})

describe('recipeDashServings', () => {
  it('attributes food-servings to the DASH group, per recipe serving', () => {
    // 200 g of a food whose serving is 100 g = 2 food-servings; recipe serves 2
    // → 1 serving of that group per recipe serving.
    const out = recipeDashServings(
      [
        ing({
          quantity: 200,
          unit: 'g',
          food: { serving_desc: '1 cup', serving_grams: 100, dash_group: 'vegetables' },
        }),
      ],
      2,
    )
    expect(out.vegetables).toBeCloseTo(1, 5)
  })

  it('sums multiple ingredients of the same group and keeps groups separate', () => {
    const out = recipeDashServings(
      [
        ing({ quantity: 100, unit: 'g', food: { serving_desc: 's', serving_grams: 100, dash_group: 'vegetables' } }),
        ing({ quantity: 50, unit: 'g', food: { serving_desc: 's', serving_grams: 100, dash_group: 'vegetables' } }),
        ing({ quantity: 100, unit: 'g', food: { serving_desc: 's', serving_grams: 100, dash_group: 'grains' } }),
      ],
      1,
    )
    expect(out.vegetables).toBeCloseTo(1.5, 5)
    expect(out.grains).toBeCloseTo(1, 5)
  })

  it('drops ingredients with no group, no serving size, or bad servings', () => {
    expect(
      recipeDashServings(
        [ing({ quantity: 100, unit: 'g', food: { serving_desc: 's', serving_grams: 100, dash_group: null } })],
        1,
      ),
    ).toEqual({})
    expect(
      recipeDashServings(
        [ing({ quantity: 100, unit: 'g', food: { serving_desc: 's', serving_grams: null, dash_group: 'fruits' } })],
        1,
      ),
    ).toEqual({})
    // servings null/0 → cannot produce per-serving
    expect(
      recipeDashServings(
        [ing({ quantity: 100, unit: 'g', food: { serving_desc: 's', serving_grams: 100, dash_group: 'fruits' } })],
        0,
      ),
    ).toEqual({})
  })

  it('drops unconvertible amounts rather than inflating', () => {
    const out = recipeDashServings(
      [ing({ quantity: null, unit: null, food: { serving_desc: 's', serving_grams: 100, dash_group: 'fruits' } })],
      1,
    )
    expect(out).toEqual({})
  })
})
