export interface JobPosition {
    id: string;
    jobTitle: string;
    department: string;
    assignedHR?: string;
    assignedTechnicalRecruiter?: string;
    applicantsCount: number;
    candidatesCount: number;
    groupsCount?: number;
    status: 'Open' | 'Interview' | 'Closed' | 'On Hold' | 'Active' | 'active' | 'closed' | 'pending' | 'rejected';
    projectId?: string;
    description?: string;
}

export interface Project {
    id: string;
    projectName: string;
    positionsCount: number;
    applicantsCount: number;
    subGroupsCount: number;
    avgTimeToFill: number;
    openDate: string;
    description?: string;
    status: string; // Added status
    name?: string; // Optional alias if needed, but backend sends projectName

    // Dynamic Metrics
    conversionRate?: number;
    qualityScore?: number;
    stageTiming?: {
        stage: string;
        days: number;
        target: number;
        status: string;
    }[];
}

export interface PositionGroup {
    id: string;
    groupName: string;    // transformed field (friendly alias)
    name?: string;        // raw field from API /admin/groups
    positionTitle: string;
    candidatesCount: number;    // transformed field
    candidateCount?: number;    // raw field from API /admin/groups
    integrityIssues?: number;
    status: string;
    createdDate: string;
    hasAssessment: boolean;
    hasAIInterview: boolean;
    hasLiveInterview: boolean;
    position_id?: string;
}

export interface SelectedCandidate {
    id: string;
    name: string;
    email: string;
    selectionDate: string;
    finalScore: number;
    position: string;
}

export interface ClosedPosition {
    id: string;
    jobTitle: string;
    projectName: string;
    closureStatus: 'Filled' | 'Cancelled' | 'On Hold';
    closedDate: string;
    closureReason: string;
    candidatesCount: number;
    groupsCreated: number;
    selectedCandidates?: SelectedCandidate[];
    assessmentsPassed: number;
    aiInterviewsPassed: number;
    liveInterviewsPassed: number;
}

export interface ClosedProject {
    id: string;
    projectName: string;
    closedDate: string;
    positionsCount: number;
    totalCandidates: number;
    openDate: string;
}

export interface Member {
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    position: string;
    department: string;
    joinDate: string;
}

export interface ApplicationScoreBreakdown {
    application_id: string;
    candidate_id: string;
    candidate_name: string;
    position_id: string;
    position_title: string;
    match_score: number;
    prescore_version?: string | null;
    pre_score_final?: number | null;
    semantic_fit_score?: number | null;
    skills_experience_score?: number | null;
    optional_profile_boost?: number | null;
    skill_alignment?: number | null;
    experience_alignment?: number | null;
    keyword_coverage?: number | null;
    seniority_score?: number | null;
    education_score?: number | null;
    jd_quality_score?: number | null;
    jd_quality_status?: string | null;
    jd_quality_cap?: number | null;
    jd_quality_cap_applied?: boolean | null;
    jd_quality_feedback?: string | null;
    score_explanation: string[];
    criteria_checks: Array<{
        id?: number;
        criterion?: string;
        weight?: number;
        passed?: boolean;
        reason?: string;
    }>;
    keyword_match_score?: number | null;
    jd_embedding_similarity?: number | null;
}
