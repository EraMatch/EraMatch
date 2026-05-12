import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useInterviewConfig() {
    return useQuery({
        queryKey: queryKeys.interview.config(),
        queryFn: () => api.candidate.getInterviewConfig(),
        staleTime: 5 * 60 * 1000,
    })
}

export function useInterviewStatus(sessionId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.interview.status(sessionId ?? ''),
        queryFn: () => api.candidate.getInterviewStatus(sessionId!),
        enabled: !!sessionId,
        refetchInterval: 10 * 1000,
        refetchIntervalInBackground: false,
        staleTime: 0,
    })
}

export function useInterviewIntegrityDecision(sessionId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.interview.integrityDecision(sessionId ?? ''),
        queryFn: () => api.candidate.getInterviewIntegrityDecision(sessionId!),
        enabled: !!sessionId,
        refetchInterval: 10 * 1000,
        staleTime: 0,
    })
}
