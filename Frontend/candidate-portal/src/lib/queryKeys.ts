export const queryKeys = {
    candidate: {
        home:        () => ['candidate', 'home'] as const,
        assessments: () => ['candidate', 'assessments'] as const,
        profile:     () => ['candidate', 'profile'] as const,
    },
    assessmentSession: {
        config:            ()        => ['assessmentSession', 'config'] as const,
        integrityDecision: (id: string) => ['integrityDecision', id] as const,
    },
    interview: {
        config:            ()        => ['interview', 'config'] as const,
        status:            (id: string) => ['interviewStatus', id] as const,
        integrityDecision: (id: string) => ['integrityDecision', 'interview', id] as const,
    },
    liveInterview: {
        sessionToken: () => ['liveInterview', 'sessionToken'] as const,
    },
};
