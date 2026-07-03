import { MealPlanGuide } from '@/components/meals/MealPlanGuide'
import { SampleDayMenu } from '@/components/meals/SampleDayMenu'
import { ShoppingList } from '@/components/meals/ShoppingList'
import { Disclaimer } from '@/components/diet/Disclaimer'

/**
 * Plan tab: a guided per-meal plan for today — DASH food-group targets spread
 * across meals with low-FODMAP suggestions to fill the gaps. Logging happens on
 * the Meals tab; this is the "what should I eat" guide.
 */
export default function Plan() {
  return (
    <div className="space-y-4">
      <MealPlanGuide />
      <SampleDayMenu />
      <ShoppingList />
      <Disclaimer />
    </div>
  )
}
