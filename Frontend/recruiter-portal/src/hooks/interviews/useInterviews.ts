import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useAIInterviewConfig(id: string | undefined) {
    return useQuery({
        queryKey: queryKeys.interviews.aiConfig(id ?? ''),
        queryFn: () => api.recruiter.getAIInterviewConfig(id!),
        enabled: !!id,
        staleTime: 5 * 60 * 1000,
    })
}

export function useAIInterviewResult(candidateId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.interviews.aiResult(candidateId ?? ''),
        queryFn: () => api.recruiter.getAIInterviewResult(parseInt(candidateId!)),
        enabled: !!candidateId,
        staleTime: 5 * 60 * 1000,
    })
}
