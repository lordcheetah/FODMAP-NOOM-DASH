import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './lib/auth'
// queryClient.ts registers the mutation defaults at module load (BEFORE the
// rehydrate `onSuccess` fires `resumePausedMutations`), which is the load-bearing
// ordering for paused writes to resume after a reload.
import { queryClient, CACHE_BUSTER } from './lib/offline/queryClient'
import { createDexiePersister } from './lib/offline/dexiePersister'
import App from './App'
import './index.css'

const persister = createDexiePersister()
const WEEK_MS = 1000 * 60 * 60 * 24 * 7

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: WEEK_MS,
        buster: CACHE_BUSTER,
        dehydrateOptions: {
          // Persist the offline write queue (paused mutations) AND successful
          // reads — but exclude ephemeral search caches (meta.persist === false)
          // so the persisted blob stays lean.
          shouldDehydrateMutation: (m) => m.state.isPaused,
          shouldDehydrateQuery: (q) =>
            q.state.status === 'success' && q.meta?.persist !== false,
        },
      }}
      onSuccess={() => {
        // Cache restored from IndexedDB: replay the queued writes, then refresh.
        void queryClient
          .resumePausedMutations()
          .then(() => queryClient.invalidateQueries())
      }}
    >
      <AuthProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AuthProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
)
