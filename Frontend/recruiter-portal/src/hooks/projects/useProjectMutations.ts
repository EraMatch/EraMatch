import { useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useCreateProject() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (data: any) => api.recruiter.createProject(data),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.projects.all() })
        },
    })
}

export function useUpdateProject() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: ({ id, data }: { id: string | number; data: any }) =>
            api.recruiter.updateProject(id, data),
        onSuccess: (_res, { id }) => {
            qc.invalidateQueries({ queryKey: queryKeys.projects.detail(String(id)) })
            qc.invalidateQueries({ queryKey: queryKeys.projects.all() })
        },
    })
}

export function useDeleteProject() {
    const qc = useQueryClient()
    return useMutation({
        mutationFn: (id: string | number) => api.recruiter.deleteProject(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: queryKeys.projects.all() })
        },
    })
}
