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
