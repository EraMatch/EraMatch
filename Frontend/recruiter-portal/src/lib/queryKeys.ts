export const queryKeys = {
    projects: {
        all:      ()   => ['projects'] as const,
        list:     (s?: string) => ['projects', 'list', { status: s }] as const,
        detail:   (id: string | number) => ['projects', 'detail', String(id)] as const,
        positions:(id: string | number) => ['projects', String(id), 'positions'] as const,
    },
    positions: {
        all:       ()          => ['positions'] as const,
        list:      ()          => ['positions', 'list'] as const,
        detail:    (id: string) => ['positions', 'detail', id] as const,
        insights:  (id: string) => ['positions', id, 'insights'] as const,
        groups:    (id: string) => ['positions', id, 'groups'] as const,
        hdEvalQAG: (id: string) => ['positions', id, 'hdEvalQAG'] as const,
    },
    groups: {
        all:              ()   => ['groups'] as const,
        detail:           (id: string) => ['groups', 'detail', id] as const,
        activityLog:      (id: string) => ['groups', id, 'activity'] as const,
        integrityMetrics: (id: string) => ['groups', id, 'integrity', 'metrics'] as const,
        integrityDecisions:(id: string) => ['groups', id, 'integrity', 'decisions'] as const,
        alerts:           (id: string) => ['groupAlerts', id] as const,
    },
    candidates: {
        all:            ()   => ['candidates'] as const,
        list:           (status?: string) => ['candidates', 'list', { status: status ?? '' }] as const,
        detail:         (id: string) => ['candidates', 'detail', id] as const,
        scoreBreakdown: (appId: string) => ['candidates', appId, 'scoreBreakdown'] as const,
        suspectReview:  (cid: string, appId?: string) => ['candidates', cid, 'suspectReview', appId ?? ''] as const,
    },
    dashboard: {
        analytics:     () => ['dashboard', 'analytics'] as const,
        notifications: () => ['dashboard', 'notifications'] as const,
    },
    admin: {
        stats:             () => ['admin', 'stats', 'global'] as const,
        members:           () => ['members'] as const,
        memberStats:       () => ['admin', 'memberStats'] as const,
        delegation:        () => ['delegation'] as const,
        recentAssignments: () => ['admin', 'recentAssignments'] as const,
        workload:          () => ['admin', 'workload'] as const,
        requests:          (s = 'pending') => ['admin', 'requests', s] as const,
        subscription:      () => ['admin', 'subscription'] as const,
        settings:          () => ['admin', 'settings'] as const,
        paymentMethod:     () => ['admin', 'payment'] as const,
        archivedProjects:  () => ['admin', 'archive', 'projects'] as const,
        archivedPositions: (projectId: string) => ['admin', 'archive', 'positions', projectId] as const,
        archiveDetails:    (positionId: string) => ['admin', 'archive', 'details', positionId] as const,
    },
    settings:     () => ['settings'] as const,
    questionBank: {
        all:           () => ['questionBank'] as const,
        list:          () => ['questionBank', 'list'] as const,
        importJobs:    () => ['questionBank', 'importJobs'] as const,
        draftQuestions:(jobId: string) => ['questionBank', 'draft', jobId] as const,
    },
    backgroundTasks: {
        list:      () => ['backgroundTasks', 'list'] as const,
        sloHealth: () => ['backgroundTasks', 'sloHealth'] as const,
        logs:      (taskId: string) => ['backgroundTasks', 'logs', taskId] as const,
    },
    suspiciousActivity: {
        poll: () => ['suspicious-activity', 'poll'] as const,
    },
    assessments: {
        templates: () => ['assessments', 'templates'] as const,
        detail:    (id: string) => ['assessments', 'detail', id] as const,
    },
    reviews: {
        assigned: () => ['reviews', 'assigned'] as const,
    },
    liveInterview: {
        config: (groupId: string) => ['liveInterview', 'config', groupId] as const,
    },
    interviews: {
        aiConfig: (id: string) => ['interviews', 'aiConfig', id] as const,
        aiResult: (candidateId: string) => ['interviews', 'aiResult', candidateId] as const,
    },
};
