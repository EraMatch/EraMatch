// Maps monitoring API response candidates to StageReviewPage's CandidateData shape

export interface MonitoringCandidateBrief {
    id: number;
    name: string;
    avatar: string;
    assessmentScore: number;
    aiInterviewScore: number;
    liveInterviewScore?: number;
    flags: string[];
    meetsCriteria: boolean;
    technicalVerdict?: 'strong_pass' | 'pass' | 'fail' | 'conditional' | 'borderline';
    progressionState: 'active';
    overrideApplied: false;
    assessment: string;
    aiInterview: string;
    liveInterview: string;
}

export function monitoringToCandidates(
    monitoringCandidates: any[],
    stageKey: string,
): MonitoringCandidateBrief[] {
    return monitoringCandidates.map((c: any): MonitoringCandidateBrief => {
        const score = typeof c.score === 'number' ? c.score : 0;
        const verdict: string | undefined = c.verdict;
        const techVerdict: MonitoringCandidateBrief['technicalVerdict'] =
            verdict === 'pass' ? 'pass'
            : verdict === 'fail' ? 'fail'
            : undefined;
        return {
            id: Number(c.application_id),
            name: c.name ?? '',
            avatar: '',
            assessmentScore: stageKey === 'assessment' ? score : 0,
            aiInterviewScore: stageKey === 'ai-interview' ? score : 0,
            liveInterviewScore: stageKey === 'live-interview' ? score : undefined,
            flags: Array.isArray(c.flags) ? c.flags : [],
            meetsCriteria: c.meets_criteria === true,
            technicalVerdict: techVerdict,
            progressionState: 'active',
            overrideApplied: false,
            assessment: stageKey === 'assessment' ? `${Math.round(score)}%` : '—',
            aiInterview: stageKey === 'ai-interview' ? `${Math.round(score)}%` : '—',
            liveInterview: stageKey === 'live-interview' ? `${Math.round(score)}%` : '—',
        };
    });
}
