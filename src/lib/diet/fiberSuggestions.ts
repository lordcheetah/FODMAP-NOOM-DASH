/**
 * Curated low-FODMAP high-fiber foods used to nudge the user toward closing a
 * fiber gap WITHOUT breaking fructose/fructans limits.
 *
 * Why a curated constant: many high-fiber staples (wheat, onion, garlic,
 * legumes) are high in fructans. Every item here is fructose + fructans `low`
 * by construction (see CLAUDE.md), so suggesting them is always FODMAP-safe.
 * These are static guidance, NOT a claim about the user's other logged foods.
 *
 * `fiber_g` is an approximate per-typical-serving value for display/ranking.
 */
export interface FiberSuggestion {
  name: string
  fiber_g: number
  note?: string
}

export const LOW_FODMAP_HIGH_FIBER: readonly FiberSuggestion[] = [
  { name: 'Chia seeds', fiber_g: 10, note: '2 tbsp' },
  { name: 'Raspberries', fiber_g: 8, note: '1 cup' },
  { name: 'Quinoa', fiber_g: 5, note: '1 cup cooked' },
  { name: 'Oats', fiber_g: 4, note: '1/2 cup dry' },
  { name: 'Kiwi', fiber_g: 2, note: '1 fruit' },
  { name: 'Firm tofu', fiber_g: 2, note: '1/2 cup' },
] as const
