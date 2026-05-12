import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useCandidateHome() {
    return useQuery({
        queryKey: queryKeys.candidate.home(),
        queryFn: () => api.candidate.getHome(),
        staleTime: 2 * 60 * 1000,
    })
}
