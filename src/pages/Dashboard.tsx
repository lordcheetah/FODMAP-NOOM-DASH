import { isSupabaseConfigured } from '@/lib/supabase'
import { noomColor, type FodmapLevel } from '@/lib/diet'
import { NoomDot } from '@/components/diet/NoomDot'
import { FodmapBadge } from '@/components/diet/FodmapBadge'
import { Disclaimer } from '@/components/diet/Disclaimer'

/**
 * Phase 0/1 dashboard. Exercises the real diet-logic functions and the shared
 * diet display components so the foundation stays demonstrably wired up. The
 * live daily log lives on the Meals page.
 */
const DEMO: ReadonlyArray<{
  name: string
  cal: number
  g: number
  fructose: FodmapLevel
  fructans: FodmapLevel
}> = [
  { name: 'Spinach (1 cup)', cal: 7, g: 30, fructose: 'low', fructans: 'low' },
  { name: 'Onion (1/2 cup)', cal: 32, g: 80, fructose: 'low', fructans: 'high' },
  { name: 'Olive oil (1 tbsp)', cal: 119, g: 14, fructose: 'low', fructans: 'low' },
  { name: 'Unlabeled snack', cal: 200, g: 50, fructose: 'unknown', fructans: 'unknown' },
]

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <h2 className="text-lg font-semibold">Welcome 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Foundation is set up. Below is a live check that the diet logic works — head to
          Meals for your real daily log.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Sync status:{' '}
          <span className={isSupabaseConfigured ? 'text-primary' : 'text-destructive'}>
            {isSupabaseConfigured ? 'Supabase connected' : 'not configured (set .env)'}
          </span>
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <h3 className="mb-3 text-sm font-semibold">Diet-logic preview</h3>
        <ul className="divide-y">
          {DEMO.map((f) => (
            <li key={f.name} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <NoomDot color={noomColor(f.cal, f.g)} />
                <span className="truncate">{f.name}</span>
              </span>
              <FodmapBadge fructose={f.fructose} fructans={f.fructans} />
            </li>
          ))}
        </ul>
      </section>

      <Disclaimer />
    </div>
  )
}
