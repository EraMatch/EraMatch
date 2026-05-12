import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useArchiveApplication() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (applicationId: string) => api.recruiter.archiveApplication(applicationId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.candidates.all() })
        },
    })
}

export function useDeleteApplication() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (applicationId: string) => api.recruiter.deleteApplication(applicationId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.candidates.all() })
        },
    })
}

export function useBulkArchiveApplications() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (applicationIds: string[]) => api.recruiter.bulkArchiveApplications(applicationIds),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.candidates.all() })
        },
    })
}

export function useBulkDeleteApplications() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (applicationIds: string[]) => api.recruiter.bulkDeleteApplications(applicationIds),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.candidates.all() })
        },
    })
}

export function useStartGithubAnalysis() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (candidateId: string) => api.recruiter.startCandidateGithubAnalysis(candidateId),
        onSuccess: (_res, candidateId) => {
            qc.invalidateQueries({ queryKey: queryKeys.candidates.detail(candidateId) })
        },
    })
}

export function useReanalyzeGitHub() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (candidateId: string) => api.recruiter.reanalyzeGitHubProfile(candidateId),
        onSuccess: (_res, candidateId) => {
            qc.invalidateQueries({ queryKey: queryKeys.candidates.detail(candidateId) })
        },
    })
}
