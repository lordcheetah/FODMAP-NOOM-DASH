import { Routes, Route, NavLink } from 'react-router-dom'
import { Apple, CalendarCheck, Dumbbell, Home, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import Dashboard from '@/pages/Dashboard'
import Meals from '@/pages/Meals'
import Plan from '@/pages/Plan'
import Exercise from '@/pages/Exercise'
import Login from '@/pages/Login'
import OfflineBanner from '@/components/OfflineBanner'
import { useAuth, isSupabaseConfigured } from '@/lib/auth'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/meals', label: 'Meals', icon: Apple, end: false },
  { to: '/plan', label: 'Plan', icon: CalendarCheck, end: false },
  { to: '/exercise', label: 'Exercise', icon: Dumbbell, end: false },
] as const

export default function App() {
  const { user, loading, signOut } = useAuth()

  // When Supabase is configured, require sign-in before showing the app.
  // (Without it, the app stays usable as an offline/demo shell.)
  if (isSupabaseConfigured) {
    if (loading) {
      return (
        <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      )
    }
    if (!user) return <Login />
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h1 className="text-base font-semibold">FODMAP · NOOM · DASH</h1>
          <p className="text-xs text-muted-foreground">
            Fructose/fructans-aware meal &amp; exercise tracking
          </p>
        </div>
        {user && (
          <button
            type="button"
            onClick={() => void signOut()}
            title={`Sign out (${user.email})`}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        )}
      </header>

      {/* Sync-state indicator (offline notice / "syncing N changes"). Reflects
          state only — resume happens in queryClient.ts. */}
      <OfflineBanner />

      <main className="flex-1 p-4 pb-24">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meals" element={<Meals />} />
          <Route path="/plan" element={<Plan />} />
          <Route path="/exercise" element={<Exercise />} />
        </Routes>
      </main>

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex max-w-2xl justify-around border-t bg-background py-2">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 rounded-md px-4 py-1 text-xs',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )
            }
          >
            <Icon className="h-5 w-5" />
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
