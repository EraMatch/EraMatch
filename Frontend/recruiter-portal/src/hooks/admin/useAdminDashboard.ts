import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useAdminDashboard() {
    return useQuery({
        queryKey: queryKeys.admin.stats(),
        queryFn: () => api.admin.getDashboardStats(),
        staleTime: 3 * 60 * 1000,
    })
}

export function useAdminMembers() {
    return useQuery({
        queryKey: queryKeys.admin.members(),
        queryFn: () => api.admin.getMembers(),
        staleTime: 5 * 60 * 1000,
    })
}

export function useAdminPendingRequests(status = 'pending') {
    return useQuery({
        queryKey: queryKeys.admin.requests(status),
        queryFn: () => api.admin.listApprovalRequests(status),
        staleTime: 60 * 1000,
    })
}

export function useAdminSubscription() {
    return useQuery({
        queryKey: queryKeys.admin.subscription(),
        queryFn: () => api.admin.getSubscriptionPlans(),
        staleTime: 10 * 60 * 1000,
    })
}
