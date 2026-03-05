export interface JobPosition {
    id: string;
    jobTitle: string;
    department: string;
    assignedHR?: string;
    assignedTechnicalRecruiter?: string;
    applicantsCount: number;
    candidatesCount: number;
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
