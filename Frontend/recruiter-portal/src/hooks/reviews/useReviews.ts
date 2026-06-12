import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useAssignedRequests() {
    return useQuery({
        queryKey: queryKeys.reviews.assigned(),
        queryFn: () => api.recruiter.getAssignedRequests(),
        staleTime: 60 * 1000,
    })
}

export function useReviewRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, action, notes }: { id: string; action: "rejected" | "approved"; notes?: string }) =>
            api.recruiter.reviewRequest(id, action, notes),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.reviews.assigned() })
        },
    })
}
