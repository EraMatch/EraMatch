import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useDashboardAnalytics() {
    return useQuery({
        queryKey: queryKeys.dashboard.analytics(),
        queryFn: () => api.recruiter.getDashboardAnalytics(),
        staleTime: 3 * 60 * 1000,
    })
}

export function useNotifications() {
    return useQuery({
        queryKey: queryKeys.dashboard.notifications(),
        queryFn: () => api.recruiter.getNotifications(),
        staleTime: 60 * 1000,
    })
}
