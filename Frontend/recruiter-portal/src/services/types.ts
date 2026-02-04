export interface JobPosition {
    id: number;
    jobTitle: string;
    department: string;
    assignedHR?: string;
    assignedTechnicalRecruiter?: string;
    applicantsCount: number;
    status: 'Open' | 'Interview' | 'Closed' | 'On Hold' | 'Active';
    projectId?: number;
    description?: string;
}

export interface Project {
    id: number;
    projectName: string;
    positionsCount: number;
    applicantsCount: number;
    subGroupsCount: number;
    openDate: string;
    description?: string;
}

export interface PositionGroup {
    id: number;
    groupName: string;
    positionTitle: string;
    candidatesCount: number;
    status: 'Active' | 'Processing' | 'Completed' | 'On Hold';
    createdDate: string;
    hasAssessment: boolean;
    hasAIInterview: boolean;
    hasLiveInterview: boolean;
}

export interface SelectedCandidate {
    id: number;
    name: string;
    email: string;
    selectionDate: string;
    finalScore: number;
    position: string;
}

export interface ClosedPosition {
    id: number;
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
    id: number;
    name: string;
    email: string;
    role: string;
    position: string;
    department: string;
    joinDate: string;
}
