import { useEffect } from 'react'
import { useHorizon } from './lib/store'
import { Shell } from './components/Shell'
import { AuthView } from './views/AuthView'
import { SetPasswordView } from './views/SetPasswordView'
import { AppRoutes } from './routes'

export default function App() {
  const { session, ready, recovery, init } = useHorizon()

  useEffect(() => { void init() }, [init])

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-ink-3">Horizon se lève…</p>
      </div>
    )
  }

  if (recovery) return <SetPasswordView />
  if (!session) return <AuthView />

  return (
    <Shell>
      <AppRoutes />
    </Shell>
  )
}
