import { Routes, Route, NavLink } from 'react-router-dom'
import { Apple, Dumbbell, Home } from 'lucide-react'
import { cn } from '@/lib/utils'
import Dashboard from '@/pages/Dashboard'

const NAV = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/meals', label: 'Meals', icon: Apple, end: false },
  { to: '/exercise', label: 'Exercise', icon: Dumbbell, end: false },
] as const

function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-lg border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">Coming in a later phase.</p>
    </div>
  )
}

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="border-b px-4 py-3">
        <h1 className="text-base font-semibold">FODMAP · NOOM · DASH</h1>
        <p className="text-xs text-muted-foreground">
          Fructose/fructans-aware meal &amp; exercise tracking
        </p>
      </header>

      <main className="flex-1 p-4 pb-24">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meals" element={<Placeholder title="Meals" />} />
          <Route path="/exercise" element={<Placeholder title="Exercise" />} />
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
