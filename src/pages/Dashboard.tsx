import { isSupabaseConfigured } from '@/lib/supabase'
import { Disclaimer } from '@/components/diet/Disclaimer'
import { WeightTracker } from '@/components/health/WeightTracker'
import { NutrientTrends } from '@/components/health/NutrientTrends'
import { DashServingsWeek } from '@/components/health/DashServingsWeek'

/**
 * Home dashboard: weight/BMI tracking, plus a sync-status line. The daily food
 * log lives on Meals; workouts on Exercise.
 */
export default function Dashboard() {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <h2 className="text-lg font-semibold">Welcome 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Track weight &amp; BMI here; log meals on the Meals tab and workouts on
          Exercise.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Sync status:{' '}
          <span className={isSupabaseConfigured ? 'text-primary' : 'text-destructive'}>
            {isSupabaseConfigured ? 'Supabase connected' : 'not configured (set .env)'}
          </span>
        </p>
      </section>

      <WeightTracker />

      <NutrientTrends />

      <DashServingsWeek />

      <Disclaimer />
    </div>
  )
}
