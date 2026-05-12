import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useRegisterEmployee() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: any) => api.admin.registerEmployee(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.members() })
        },
    })
}

export function useRemoveMember() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (userId: string) => api.admin.removeMember(userId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.members() })
        },
    })
}

export function useSuspendMember() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (userId: string) => api.admin.suspendMember(userId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.members() })
            qc.invalidateQueries({ queryKey: queryKeys.admin.stats() })
        },
    })
}

export function useActivateMember() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (userId: string) => api.admin.activateMember(userId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.members() })
        },
    })
}

export function useDelegatePosition() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ positionId, recruiterId, type }: { positionId: string; recruiterId: string; type: 'HR' | 'Technical' }) =>
            api.admin.delegatePosition(positionId, recruiterId, type),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.positions.all() })
            qc.invalidateQueries({ queryKey: queryKeys.admin.stats() })
        },
    })
}

export function useReassignRecruiter() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ positionId, recruiterId, type }: { positionId: string; recruiterId: string; type: 'HR' | 'Technical' }) =>
            api.admin.reassignRecruiter(positionId, recruiterId, type),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.delegation() })
            qc.invalidateQueries({ queryKey: queryKeys.admin.recentAssignments() })
        },
    })
}

export function useNotifyRecruiters() {
    return useMutation({
        mutationFn: (positionId: string) => api.admin.notifyRecruiters(positionId),
    })
}

export function useBackfillPositions() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.admin.backfillPositionAssignments(),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.delegation() })
            qc.invalidateQueries({ queryKey: queryKeys.positions.all() })
        },
    })
}

export function useApproveRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ requestId, decision }: { requestId: string; decision: any }) =>
            api.admin.approveRequest(requestId, decision),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.requests() })
            qc.invalidateQueries({ queryKey: queryKeys.projects.all() })
            qc.invalidateQueries({ queryKey: queryKeys.positions.all() })
        },
    })
}

export function useRejectRequest() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ requestId, notes }: { requestId: string; notes: string }) =>
            api.admin.rejectRequest(requestId, notes),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.requests() })
        },
    })
}

export function useUpdateAdminProfile() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { first_name?: string; last_name?: string; email?: string }) =>
            api.admin.updateProfile(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.settings() })
        },
    })
}

export function useUpdateOrganization() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: { organization_name?: string; admin_email?: string; timezone?: string }) =>
            api.admin.updateOrganization(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.settings() })
        },
    })
}

export function useUpdatePreferences() {
    return useMutation({
        mutationFn: (data: any) => api.admin.updatePreferences(data),
    })
}

export function useUpgradeSubscription() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (planId: string) => api.admin.upgradeSubscription(planId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.subscription() })
        },
    })
}

export function useAddPaymentMethod() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: any) => api.admin.addPaymentMethod(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.admin.paymentMethod() })
        },
    })
}
