import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useStartAssessment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: any) => api.candidate.startAssessment(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.candidate.assessments() })
        },
    })
}

export function useSaveAnswer() {
    return useMutation({
        mutationFn: (data: any) => api.candidate.saveAnswer(data),
    })
}

export function useRunCode() {
    return useMutation({
        mutationFn: (data: any) => api.candidate.runCode(data),
    })
}

export function useRunTests() {
    return useMutation({
        mutationFn: (data: any) => api.candidate.runTests(data),
    })
}

export function useSubmitAssessment() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: any) => api.candidate.submitAssessment(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.candidate.home() })
            qc.invalidateQueries({ queryKey: queryKeys.candidate.assessments() })
        },
    })
}

export function useUploadAssessmentRecording() {
    return useMutation({
        mutationFn: ({ sessionId, recording }: { sessionId: string; recording: Blob }) =>
            api.candidate.uploadAssessmentRecording(sessionId, recording),
    })
}

export function useReportIntegrityEvent() {
    return useMutation({
        mutationFn: (data: any) => api.candidate.reportIntegrityEvent(data),
    })
}
