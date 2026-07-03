/**
 * The NOOM meal-plan sample days (7-day inspiration menu), embedded from
 * `data/sample_days.json`. Each slot NAMES a seeded recipe (some are leftovers
 * or an either/or). Kept in sync by hand — it's small, stable reference content.
 */
export interface SampleDayMenu {
  day: number
  breakfast: string
  lunch: string
  dinner: string
  snack: string
}

export const SAMPLE_DAYS: readonly SampleDayMenu[] = [
  {
    day: 1,
    breakfast: 'American Classic',
    lunch: 'Mediterranean Mezze',
    dinner: 'Marinated Shrimp with Ginger, Lime, Cilantro and Honey',
    snack: 'Crunchy Cukes',
  },
  {
    day: 2,
    breakfast: 'PB & J Oats',
    lunch: 'Marinated Shrimp with Ginger, Lime, Cilantro and Honey (leftovers)',
    dinner: 'Fully-Loaded Potato',
    snack: 'Smoky Paprika Kale Chips',
  },
  {
    day: 3,
    breakfast: 'Spinach Tomato Frittata',
    lunch: 'Bean Salad',
    dinner: 'Salmon with Tabbouleh Salad',
    snack: "Strawberry 'Cheesecake'",
  },
  {
    day: 4,
    breakfast: "Sweet N' Savory Toast",
    lunch: 'Curried Cauliflower Soup',
    dinner: 'Pesto Pasta',
    snack: 'Banana Boat',
  },
  {
    day: 5,
    breakfast: 'Superfood Smoothie',
    lunch: 'Tabbouleh Salad (leftovers)',
    dinner: 'Savory Stir Fry',
    snack: 'Crustless Pumpkin Pie',
  },
  {
    day: 6,
    breakfast: 'Spinach Tomato Frittata (leftovers)',
    lunch: 'Chicken & Avocado Pita Pockets',
    dinner: 'Vegetarian Barley Soup',
    snack: 'Bell Pepper Cups',
  },
  {
    day: 7,
    breakfast: 'Banana Pancakes',
    lunch: 'Tuna Boats / Vegetarian Barley Soup (leftovers)',
    dinner: 'Lean Pork Lettuce Wraps',
    snack: 'Sweet Seeds',
  },
]

/**
 * Reduce a sample-day meal label to a recipe search term: take the part before
 * an either/or slash and drop parenthetical notes like "(leftovers)".
 */
export function recipeSearchTerm(mealName: string): string {
  return mealName.split('/')[0].replace(/\([^)]*\)/g, '').trim()
}
