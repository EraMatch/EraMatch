import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useCandidates() {
    return useQuery({
        queryKey: queryKeys.candidates.list(),
        queryFn: () => api.recruiter.getCandidates(),
        staleTime: 2 * 60 * 1000,
    })
}

export function useCandidateDetail(candidateId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.candidates.detail(candidateId ?? ''),
        queryFn: () => api.recruiter.getCandidate(candidateId!),
        enabled: !!candidateId,
    })
}

export function useCandidateScoreBreakdown(applicationId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.candidates.scoreBreakdown(applicationId ?? ''),
        queryFn: () => api.recruiter.getApplicationScoreBreakdown(applicationId!),
        enabled: !!applicationId,
    })
}

export function useSuspectReview(candidateId: string | undefined, applicationId?: string) {
    return useQuery({
        queryKey: queryKeys.candidates.suspectReview(candidateId ?? '', applicationId),
        queryFn: () => api.recruiter.getSuspectReview(candidateId!, applicationId),
        enabled: !!candidateId,
    })
}
