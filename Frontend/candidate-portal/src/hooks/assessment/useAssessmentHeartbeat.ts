import { useMutation } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../../services/api'

export function useAssessmentHeartbeat(sessionId: string | null, intervalMs = 30000) {
    const mutation = useMutation({
        mutationFn: (id: string) => api.candidate.heartbeat(id),
        retry: 0,
    })

    const intervalRef = useRef<number | null>(null)

    useEffect(() => {
        if (!sessionId) return
        intervalRef.current = window.setInterval(() => {
            mutation.mutate(sessionId)
        }, intervalMs)
        return () => {
            if (intervalRef.current !== null) clearInterval(intervalRef.current)
        }
    }, [sessionId, intervalMs])

    return mutation
}
