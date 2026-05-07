import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useCandidateAssessments() {
    return useQuery({
        queryKey: queryKeys.candidate.assessments(),
        queryFn: () => api.candidate.getAssessments(),
        staleTime: 2 * 60 * 1000,
    })
}
