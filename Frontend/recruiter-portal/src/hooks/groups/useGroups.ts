import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useGroupDetail(groupId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.groups.detail(groupId ?? ''),
        queryFn: () => api.recruiter.getGroupDetails(groupId!),
        enabled: !!groupId,
    })
}

export function useGroupAlerts(groupId: string | undefined, enabled = true) {
    return useQuery({
        queryKey: queryKeys.groups.alerts(groupId ?? ''),
        queryFn: () => api.recruiter.getSuspiciousActivity(undefined, 50),
        enabled: !!groupId && enabled,
        refetchInterval: enabled ? 10 * 1000 : false,
        refetchIntervalInBackground: false,
        refetchOnWindowFocus: false,
        staleTime: 0,
        gcTime: 0,
    })
}

export function useGroupActivityLog(groupId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.groups.activityLog(groupId ?? ''),
        queryFn: () => api.recruiter.getGroupActivityLog ? api.recruiter.getGroupActivityLog(groupId!) : Promise.resolve([]),
        enabled: !!groupId,
    })
}

export function useUpdateGroup() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ groupId, data }: { groupId: string; data: any }) =>
            api.recruiter.updateGroup(groupId, data),
        onSuccess: (_res, { groupId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) })
        },
    })
}

export function useStartStage() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ groupId, stage }: { groupId: string; stage: string }) =>
            api.recruiter.startStage(groupId, stage),
        onSuccess: (_res, { groupId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) })
        },
    })
}

export function useCloseStage() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ groupId, stage }: { groupId: string; stage: string }) =>
            api.recruiter.closeStage(groupId, stage),
        onSuccess: (_res, { groupId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) })
        },
    })
}

export function useSendOffers() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ groupId, payload }: { groupId: string; payload: any }) =>
            api.recruiter.sendOffers(groupId, payload),
        onSuccess: (_res, { groupId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) })
        },
    })
}

export function useBulkProgressCandidates() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ groupId, payload }: { groupId: string; payload: any }) =>
            api.recruiter.bulkProgressCandidates(groupId, payload),
        onSuccess: (_res, { groupId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) })
        },
    })
}

export function usePreviewBulkProgress() {
    return useMutation({
        mutationFn: ({ groupId, payload }: { groupId: string; payload: any }) =>
            api.recruiter.previewBulkProgress(groupId, payload),
    })
}

export function useResetStages() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ groupId }: { groupId: string }) =>
            api.recruiter.resetStages(groupId),
        onSuccess: (_res, { groupId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) })
        },
    })
}

export function useResolveHeldCandidates() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ groupId, actions }: { groupId: string; actions: any[] }) =>
            api.recruiter.resolveHeldCandidates(groupId, actions),
        onSuccess: (_res, { groupId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) })
        },
    })
}
