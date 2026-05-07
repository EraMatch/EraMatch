import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useQuestionBank() {
    return useQuery({
        queryKey: queryKeys.questionBank.list(),
        queryFn: () => api.recruiter.getQuestionBank(),
        staleTime: 3 * 60 * 1000,
    })
}

export function useImportJobs() {
    return useQuery({
        queryKey: queryKeys.questionBank.importJobs(),
        queryFn: () => api.recruiter.listImportJobs(),
        staleTime: 30 * 1000,
    })
}

export function useDraftQuestions(jobId: string | undefined) {
    return useQuery({
        queryKey: queryKeys.questionBank.draftQuestions(jobId ?? ''),
        queryFn: () => api.recruiter.getDraftQuestions(jobId!),
        enabled: !!jobId,
        staleTime: 60 * 1000,
    })
}

export function useCreateQuestion() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: any) => api.recruiter.createQuestionBank(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.questionBank.list() })
        },
    })
}

export function useDeleteQuestion() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.recruiter.deleteQuestionBank(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.questionBank.list() })
        },
    })
}

export function useToggleQuestionFavorite() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string) => api.recruiter.toggleQuestionFavorite(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.questionBank.list() })
        },
    })
}

export function useApproveImportQuestions() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ jobId, selected }: { jobId: string; selected: any[] }) =>
            api.recruiter.approveImportQuestions(jobId, selected),
        onSuccess: (_res, { jobId }) => {
            qc.invalidateQueries({ queryKey: queryKeys.questionBank.list() })
            qc.invalidateQueries({ queryKey: queryKeys.questionBank.draftQuestions(jobId) })
            qc.invalidateQueries({ queryKey: queryKeys.questionBank.importJobs() })
        },
    })
}

export function useRefineImportQuestion() {
    return useMutation({
        mutationFn: ({ jobId, rowIndex }: { jobId: string; rowIndex: number }) =>
            api.recruiter.refineImportQuestion(jobId, rowIndex),
    })
}

export function useDeleteImportJob() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (jobId: string) => api.recruiter.deleteBackgroundTask(jobId, 'question_import'),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.questionBank.importJobs() })
        },
    })
}
