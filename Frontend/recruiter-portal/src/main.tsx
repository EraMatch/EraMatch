import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { queryClient } from './lib/queryClient'
import { router } from './router'
import './index.css'

const userId = (() => {
    try { return JSON.parse(localStorage.getItem('user') || '{}')?.id ?? 'guest' }
    catch { return 'guest' }
})()

const persister = createSyncStoragePersister({
    storage: window.localStorage,
    key: 'eramatch-recruiter-cache',
    throttleTime: 1000,
})

const SESSION_ONLY = [
    'suspicious-activity',
    'backgroundTasks',
    'heartbeat',
    'integrityDecision',
    'assessmentSession',
    'interviewStatus',
    'liveInterview',
    'groupAlerts',
]

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <PersistQueryClientProvider
            client={queryClient}
            persistOptions={{
                persister,
                buster: `v1-${userId}`,
                maxAge: 24 * 60 * 60 * 1000,
                dehydrateOptions: {
                    shouldDehydrateQuery: (query) => {
                        const key = query.queryKey[0]
                        return typeof key !== 'string' || !SESSION_ONLY.some((p) => key.includes(p))
                    },
                },
            }}
        >
            <RouterProvider router={router} />
            {import.meta.env.DEV && <ReactQueryDevtools initialIsOpen={false} />}
        </PersistQueryClientProvider>
    </React.StrictMode>,
)
