import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

/**
 * Hybrid hook: TanStack Query handles the initial snapshot fetch.
 * The SuspiciousActivityLog component's existing cursor-based polling
 * side effect takes over after mount for incremental updates.
 */
export function useSuspiciousActivitySnapshot(limit = 120) {
    return useQuery({
        queryKey: queryKeys.suspiciousActivity.poll(),
        queryFn: () => api.recruiter.getSuspiciousActivity(undefined, limit),
        staleTime: 0,
        gcTime: 0,
    })
}
