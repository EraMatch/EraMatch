import { useQuery } from '@tanstack/react-query'
import { queryKeys } from '../../lib/queryKeys'
import { api } from '../../services/api'

export function useProjects(status?: string) {
    return useQuery({
        queryKey: queryKeys.projects.list(status),
        queryFn: () => api.recruiter.getProjects(status),
        staleTime: 5 * 60 * 1000,
    })
}

export function useProjectDetail(projectId: string | number | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.detail(String(projectId ?? '')),
        queryFn: () => api.recruiter.getProjectDetails(String(projectId)),
        enabled: !!projectId,
    })
}

export function useProjectPositions(projectId: string | number | undefined) {
    return useQuery({
        queryKey: queryKeys.projects.positions(String(projectId ?? '')),
        queryFn: () => api.recruiter.getProjectPositions(String(projectId)),
        enabled: !!projectId,
        staleTime: 3 * 60 * 1000,
    })
}
