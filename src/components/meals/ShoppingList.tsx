import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useDailyTargets } from '@/lib/db/dailyTargets'
import { buildShoppingList, DEFAULT_DASH_GOALS, type DashGroup } from '@/lib/diet'

const DASH_GROUP_LABEL: Record<DashGroup, string> = {
  grains: 'Grains',
  vegetables: 'Vegetables',
  fruits: 'Fruits',
  dairy: 'Dairy',
  'meat-poultry-fish': 'Meat/Fish',
  'nuts-seeds-legumes': 'Nuts/Legumes',
  'fats-oils': 'Fats/Oils',
  sweets: 'Sweets',
}

const HORIZONS = [
  { days: 1, label: '1 day' },
  { days: 3, label: '3 days' },
  { days: 7, label: 'Week' },
] as const

function round(n: number): number {
  return Math.round(n)
}

/**
 * Low-FODMAP grocery list rolled up from the user's DASH serving goals over a
 * chosen horizon (day / 3 days / week). Each group shows the servings to cover
 * and checkable picks to buy. Checks are session-only. Falls back to the ~2,000
 * kcal default goals when none are set. Non-authoritative low-FODMAP guidance.
 */
export function ShoppingList() {
  const { data: targets } = useDailyTargets()
  const [days, setDays] = useState<number>(7)
  const [checked, setChecked] = useState<Set<string>>(new Set())

  const goals = useMemo(() => {
    const g = targets?.dash_serving_goals
    return g && Object.keys(g).length > 0 ? g : DEFAULT_DASH_GOALS
  }, [targets])

  const list = useMemo(() => buildShoppingList(goals, days), [goals, days])
  const checkedCount = checked.size

  const toggle = (key: string) =>
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  if (!isSupabaseConfigured) return null

  return (
    <section className="rounded-lg border bg-card p-4 text-card-foreground">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">Shopping list</h3>
        {checkedCount > 0 && (
          <button
            type="button"
            onClick={() => setChecked(new Set())}
            className="text-[11px] text-muted-foreground underline underline-offset-2"
          >
            Clear {checkedCount}
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Low-FODMAP picks to cover your DASH goals. Tap items to check them off.
      </p>

      <div className="mt-2 flex gap-2">
        {HORIZONS.map((h) => (
          <Button
            key={h.days}
            size="sm"
            variant={days === h.days ? 'default' : 'outline'}
            onClick={() => setDays(h.days)}
            aria-pressed={days === h.days}
          >
            {h.label}
          </Button>
        ))}
      </div>

      <div className="mt-3 space-y-3">
        {list.map((sg) => (
          <div key={sg.group}>
            <p className="text-xs font-medium">
              {DASH_GROUP_LABEL[sg.group]}{' '}
              <span className="font-normal text-muted-foreground">
                · ~{round(sg.servings)} servings
              </span>
            </p>
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {sg.items.map((item) => {
                const key = `${sg.group}:${item}`
                const on = checked.has(key)
                return (
                  <li key={item}>
                    <button
                      type="button"
                      onClick={() => toggle(key)}
                      aria-pressed={on}
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[11px]',
                        on
                          ? 'border-noom-green/40 bg-noom-green/15 text-noom-green line-through'
                          : 'border-border bg-background text-muted-foreground',
                      )}
                    >
                      {on ? '✓ ' : ''}
                      {item}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[10px] text-muted-foreground">
        A general low-FODMAP (fructose/fructans) guide, not a verdict about any
        specific product. Portions and brands vary.
      </p>
    </section>
  )
}
