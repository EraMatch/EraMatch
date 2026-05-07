import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useAssessmentConfig() {
    return useQuery({
        queryKey: queryKeys.assessmentSession.config(),
        queryFn: () => api.candidate.getAssessmentConfig(),
        staleTime: 5 * 60 * 1000,
    })
}

export function useAssessmentIntegrityDecision(sessionId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.assessmentSession.integrityDecision(sessionId ?? ''),
        queryFn: () => api.candidate.getAssessmentIntegrityDecision(sessionId!),
        enabled: !!sessionId,
        refetchInterval: 10 * 1000,
        refetchIntervalInBackground: false,
        staleTime: 0,
    })
}
