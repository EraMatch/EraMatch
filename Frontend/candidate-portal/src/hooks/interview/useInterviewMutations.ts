import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useStartInterview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: any) => api.candidate.startInterview(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.candidate.assessments() })
        },
    })
}

export function useCompleteInterview() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: any) => api.candidate.completeInterview(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.candidate.home() })
            qc.invalidateQueries({ queryKey: queryKeys.candidate.assessments() })
        },
    })
}

export function useUploadInterviewResponse() {
    return useMutation({
        mutationFn: (data: any) => api.candidate.uploadInterviewResponse(data),
    })
}

export function useReportInterviewIntegrityEvent() {
    return useMutation({
        mutationFn: (data: any) => api.candidate.reportInterviewIntegrityEvent(data),
    })
}
