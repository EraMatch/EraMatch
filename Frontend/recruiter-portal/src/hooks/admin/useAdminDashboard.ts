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

export function useAdminSettings() {
    return useQuery({
        queryKey: queryKeys.admin.settings(),
        queryFn: () => api.admin.getSettings(),
        staleTime: 5 * 60 * 1000,
    })
}

export function useAdminPaymentMethod() {
    return useQuery({
        queryKey: queryKeys.admin.paymentMethod(),
        queryFn: () => api.admin.getPaymentMethod(),
        staleTime: 10 * 60 * 1000,
    })
}

export function useAdminMemberStats() {
    return useQuery({
        queryKey: queryKeys.admin.memberStats(),
        queryFn: () => api.admin.getMemberStats(),
        staleTime: 5 * 60 * 1000,
    })
}

export function useRecruiterDelegation() {
    return useQuery({
        queryKey: queryKeys.admin.delegation(),
        queryFn: () => api.admin.getRecruiterDelegation(),
        staleTime: 2 * 60 * 1000,
    })
}

export function useRecentAssignments() {
    return useQuery({
        queryKey: queryKeys.admin.recentAssignments(),
        queryFn: () => api.admin.getRecentAssignments(),
        staleTime: 60 * 1000,
    })
}

export function useRecruiterWorkload() {
    return useQuery({
        queryKey: queryKeys.admin.workload(),
        queryFn: () => api.admin.getRecruiterWorkloadDistribution(),
        staleTime: 5 * 60 * 1000,
    })
}

export function useArchivedProjects() {
    return useQuery({
        queryKey: queryKeys.admin.archivedProjects(),
        queryFn: () => api.admin.getArchivedProjects(),
        staleTime: 10 * 60 * 1000,
    })
}

export function useArchivedPositions(projectId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.admin.archivedPositions(projectId ?? ''),
        queryFn: () => api.admin.getArchivedPositions(projectId!),
        enabled: !!projectId,
        staleTime: 10 * 60 * 1000,
    })
}

export function usePositionArchiveDetails(positionId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.admin.archiveDetails(positionId ?? ''),
        queryFn: () => api.admin.getPositionArchiveDetails(positionId!),
        enabled: !!positionId,
        staleTime: 10 * 60 * 1000,
    })
}
