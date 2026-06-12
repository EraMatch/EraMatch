import { useMutation, useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useLiveInterviewSessionToken() {
    return useQuery({
        queryKey: queryKeys.liveInterview.sessionToken(),
        queryFn: () => api.liveInterview.getSessionToken(),
        staleTime: 0,
        gcTime: 0,
    })
}

export function useCompleteLiveInterviewSession() {
    return useMutation({
        mutationFn: ({ sessionId, transcript = [] }: { sessionId: string; transcript?: Record<string, unknown>[] }) =>
            api.liveInterview.completeSession(sessionId, transcript),
    })
}
