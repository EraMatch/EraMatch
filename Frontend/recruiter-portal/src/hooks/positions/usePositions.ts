import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function usePositions() {
    return useQuery({
        queryKey: queryKeys.positions.list(),
        queryFn: () => api.recruiter.getPositions(),
        staleTime: 5 * 60 * 1000,
    })
}

export function usePositionDetail(positionId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.positions.detail(positionId ?? ''),
        queryFn: () => api.recruiter.getPositionDetails(positionId!),
        enabled: !!positionId,
        staleTime: 30 * 1000, // 30s — avoids refetch on every window focus
    })
}

export function usePositionInsights(positionId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.positions.insights(positionId ?? ''),
        queryFn: () => api.recruiter.getPositionInsights(positionId!),
        enabled: !!positionId,
        staleTime: 5 * 60 * 1000,
    })
}

export function usePositionGroups(positionId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.positions.groups(positionId ?? ''),
        queryFn: () => api.recruiter.getPositionGroups(positionId!),
        enabled: !!positionId,
    })
}

export function usePositionHDEvalQAG(positionId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.positions.hdEvalQAG(positionId ?? ''),
        queryFn: () => api.recruiter.getPositionHDEvalQAG(positionId!),
        enabled: !!positionId,
        staleTime: 2 * 60 * 1000,
    })
}
