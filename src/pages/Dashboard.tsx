import { isSupabaseConfigured } from '@/lib/supabase'
import { noomColor, lowFodmapSafe } from '@/lib/diet'

/**
 * Phase 0 placeholder dashboard. It exercises the real diet-logic functions so
 * the foundation is demonstrably wired up; Phase 1 replaces this with the live
 * daily food log and FODMAP/NOOM/DASH/fiber summaries.
 */
const DEMO = [
  { name: 'Spinach (1 cup)', cal: 7, g: 30, fructose: 'low', fructans: 'low' },
  { name: 'Onion (1/2 cup)', cal: 32, g: 80, fructose: 'low', fructans: 'high' },
  { name: 'Olive oil (1 tbsp)', cal: 119, g: 14, fructose: 'low', fructans: 'low' },
  { name: 'Unlabeled snack', cal: 200, g: 50, fructose: 'unknown', fructans: 'unknown' },
] as const

const SAFETY_LABEL: Record<string, string> = {
  safe: 'Safe',
  caution: 'Caution',
  avoid: 'Avoid',
  'not-verified': 'Not verified',
}

const COLOR_DOT: Record<string, string> = {
  green: 'bg-noom-green',
  yellow: 'bg-noom-yellow',
  orange: 'bg-noom-orange',
}

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border bg-card p-4 text-card-foreground">
        <h2 className="text-lg font-semibold">Welcome 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Foundation is set up. Below is a live check that the diet logic works — Phase 1
          replaces it with your real daily log.
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
          {DEMO.map((f) => {
            const color = noomColor(f.cal, f.g)
            const safety = lowFodmapSafe(f.fructose, f.fructans)
            return (
              <li key={f.name} className="flex items-center justify-between py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${
                      color ? COLOR_DOT[color] : 'bg-muted'
                    }`}
                    title={color ?? 'unknown'}
                  />
                  {f.name}
                </span>
                <span
                  className={
                    safety === 'safe'
                      ? 'text-noom-green'
                      : safety === 'avoid'
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                  }
                >
                  {SAFETY_LABEL[safety]}
                </span>
              </li>
            )
          })}
        </ul>
      </section>

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        This app is an informational tool, not medical advice. FODMAP data is sourced from
        public references and may be incomplete. Items shown as “Not verified” are not
        confirmed safe.
      </p>
    </div>
  )
}
