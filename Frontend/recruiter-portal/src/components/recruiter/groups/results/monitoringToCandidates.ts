// Maps monitoring API response candidates to StageReviewPage's CandidateData shape.
// Uses array index as numeric id (stable for selection tracking) and carries
// applicationId / candidateId separately for API calls.

export interface MonitoringCandidateBrief {
    id: number;             // array index — stable numeric key used by StageReviewPage selection
    applicationId: string;  // UUID — used for bulk-progress API calls
    candidateId: string;    // UUID — used to open inline candidate profile
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
    return monitoringCandidates.map((c: any, i: number): MonitoringCandidateBrief => {
        const score = typeof c.score === 'number' ? c.score : 0;
        const verdict: string | undefined = c.verdict;
        const techVerdict: MonitoringCandidateBrief['technicalVerdict'] =
            verdict === 'pass' ? 'pass'
            : verdict === 'fail' ? 'fail'
            : undefined;
        return {
            id: i,                                    // stable index for StageReviewPage selection
            applicationId: String(c.application_id), // UUID for API calls
            candidateId: String(c.candidate_id),      // UUID for profile overlay
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
