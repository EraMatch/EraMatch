import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useBackgroundTasksPolling(enabled = true) {
    return useQuery({
        queryKey: queryKeys.backgroundTasks.list(),
        queryFn: () => api.recruiter.getBackgroundTasks(),
        refetchInterval: enabled ? 5000 : false,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: false,
        staleTime: 0,
    })
}

export function useSloHealth() {
    return useQuery({
        queryKey: queryKeys.backgroundTasks.sloHealth(),
        queryFn: () => api.recruiter.getBackgroundTaskSloHealth(),
        refetchInterval: 30 * 1000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: false,
        staleTime: 0,
    })
}

export function useTaskLogs(taskId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.backgroundTasks.logs(taskId ?? ''),
        queryFn: () => api.recruiter.getTaskLogs(taskId!),
        enabled: !!taskId,
        staleTime: 0,
    })
}

export function useStopVideoTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (taskId: string) => api.recruiter.stopVideoTask(taskId),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backgroundTasks.list() }),
    })
}

export function useStopGithubAnalysisTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (taskId: string) => api.recruiter.stopGithubAnalysisTask(taskId),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backgroundTasks.list() }),
    })
}

export function useStopQagTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (taskId: string) => api.recruiter.stopQagTask(taskId),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backgroundTasks.list() }),
    })
}

export function useStopCvIngestionTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (taskId: string) => api.recruiter.stopCvIngestionTask(taskId),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backgroundTasks.list() }),
    })
}

export function useStopAllVideoTasks() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.recruiter.stopAllVideoTasks(),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backgroundTasks.list() }),
    })
}

export function useStopAllGithubAnalysisTasks() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: () => api.recruiter.stopAllGithubAnalysisTasks(),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backgroundTasks.list() }),
    })
}

export function useStopQuestionImportTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (taskId: string) => api.recruiter.stopQuestionImportTask(taskId),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backgroundTasks.list() }),
    })
}

export function useDeleteBackgroundTask() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ taskId, taskCategory }: {
            taskId: string
            taskCategory: 'video' | 'question_import' | 'github_analysis' | 'qag' | 'cv_ingestion'
        }) => api.recruiter.deleteBackgroundTask(taskId, taskCategory),
        onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.backgroundTasks.list() }),
    })
}
