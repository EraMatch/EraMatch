import { API_URL, fetchAPI } from './client';
import type { Project, JobPosition, PositionGroup, ClosedProject } from './types';

export const recruiterService = {
    // Dashboard
    getDashboard: async () => {
        const [projects, groups] = await Promise.all([
            fetchAPI<Project[]>('/projects'),
            fetchAPI<PositionGroup[]>('/groups')
        ]);
        return { projects, activePositions: groups };
    },

    getDashboardAnalytics: async () => fetchAPI<any>('/recruiter/analytics'),

    // Notifications
    getNotifications: async () => fetchAPI<any[]>('/recruiter/notifications'),

    // Project Management
    getProjects: async (status?: string) => {
        const query = status ? `?status=${status}` : '';
        return fetchAPI<Project[]>(`/recruiter/projects${query}`);
    },

    getProjectDetails: async (projectId: string) => {
        return fetchAPI<Project>(`/recruiter/projects/${projectId}`);
    },

    getProjectPositions: async (projectId: number | string) => {
        return fetchAPI<JobPosition[]>(`/recruiter/projects/${projectId}/positions`);
    },

    getClosedProjects: async () => fetchAPI<ClosedProject[]>('/projects/closed'),

    getProjectGroups: async (projectId: string) => fetchAPI<PositionGroup[]>('/groups'),

    createProject: async (data: Partial<Project> & { name?: string }) => {
        const payload = {
            ...data,
            name: data.name || data.projectName // Map projectName to name for backend
        };
        return fetchAPI<Project>('/recruiter/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    updateProject: async (id: number | string, data: Partial<Project> & { name?: string }) => {
        // Ensure 'name' is sent if 'projectName' is provided, or allow 'name' in data
        const payload = {
            ...data,
            name: data.name || data.projectName // Map projectName to name for backend
        };
        return fetchAPI(`/recruiter/projects/${id}`, { // Updated endpoint to /recruiter/projects
            method: 'PATCH', // Changed to PATCH as per backend
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    deleteProject: async (id: number | string) => {
        return fetchAPI(`/recruiter/projects/${id}`, {
            method: 'DELETE'
        });
    },

    // Position Management
    getPositions: async () => fetchAPI<JobPosition[]>('/recruiter/positions'),

    createPosition: async (data: Partial<JobPosition>) => {
        return fetchAPI<JobPosition>('/recruiter/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    updatePosition: async (id: number | string, data: Partial<JobPosition>) => {
        return fetchAPI(`/recruiter/positions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    deletePosition: async (id: number | string) => {
        return fetchAPI(`/recruiter/positions/${id}`, {
            method: 'DELETE'
        });
    },

    getPositionDetails: async (positionId: string) => fetchAPI(`/recruiter/positions/${positionId}/details`),

    getPositionInsights: async (positionId: string) => fetchAPI(`/recruiter/positions/${positionId}/insights`),

    getFiltrationFlowConfig: async (positionId: string) => fetchAPI(`/recruiter/positions/${positionId}/filtration-flow`),

    getPositionGroups: async (positionId: string) => fetchAPI(`/recruiter/positions/${positionId}/groups`),

    getSkillClusters: async (positionId: string) => fetchAPI(`/recruiter/positions/${positionId}/skills`),

    // Candidate Management
    getCandidates: async () => fetchAPI<any[]>('/recruiter/candidates'),

    getGroupCandidates: async () => fetchAPI('/groups/candidates/all'),

    getCandidate: async (candidateId: string) => fetchAPI<any>(`/candidates/${candidateId}`),

    getSuspectReview: async (candidateId: string) => fetchAPI(`/candidates/${candidateId}/suspect-review`),

    getKnowledgeGraphData: async (candidateId: string) => fetchAPI(`/candidates/${candidateId}/knowledge-graph`),

    getCandidateSkills: async (candidateIds: number[]) => {
        const res = await fetch(`${API_URL}/candidates/skills`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(candidateIds)
        });
        return res.json();
    },

    // Recruiter Management
    getRecruiters: async () => {
        const [hr, tech] = await Promise.all([
            fetchAPI<string[]>('/recruiter/hr'),
            fetchAPI<string[]>('/recruiter/technical')
        ]);
        const mapToObj = (names: string[], role: string) => names.map((n, i) => ({ id: `${role}-${i}`, name: n, role }));
        return [...mapToObj(hr, 'HR Recruiter'), ...mapToObj(tech, 'Technical Recruiter')];
    },

    // Group Management
    getGroupDetails: async (groupId: string) => fetchAPI(`/recruiter/groups/${groupId}`),

    getGroupOverviewV2: async (groupId: string) => fetchAPI(`/recruiter/groups/${groupId}`),

    getGroupCreationConfig: async () => fetchAPI('/groups/config/creation'),

    // Pipeline & Modules
    getPipelineTemplates: async () => fetchAPI<any[]>('/recruiter/pipeline-templates'),

    getPipelineModules: async () => fetchAPI<any[]>('/recruiter/pipeline-modules'),

    // Assessment Management
    getAssessmentDetails: async (candidateId: number) => fetchAPI(`/candidates/${candidateId}/assessment-details`),

    getAssessmentTemplates: async () => fetchAPI('/assessments/templates'),

    getAssessmentSession: async (sessionId: string) => fetchAPI(`/assessments/sessions/${sessionId}`),

    saveAssessment: async (data: any) => {
        return fetchAPI<any>('/assessments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    // Question Bank
    getQuestionBank: async () => fetchAPI('/questions/bank'),

    getQuestionBankVariants: async (type: string) => fetchAPI(`/questions/variants?type=${type}`),

    generateQuestionVariants: async (baseVariant: any, numVariants: number = 3) => {
        const res = await fetch(`${API_URL}/questions/generate-variants?numVariants=${numVariants}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(baseVariant)
        });
        return res.json();
    },

    // Interview Management
    getAIInterviewResult: async (candidateId: number) => fetchAPI(`/candidates/${candidateId}/ai-interview-result`),

    getAIInterviewConfig: async (interviewId: string) => fetchAPI(`/interviews/${interviewId}/config`),

    getLiveInterviewQuestions: async (interviewId: string) => fetchAPI(`/interviews/${interviewId}/questions`),

    getRecordedInterviewQuestions: async (interviewId: string) => fetchAPI(`/interviews/recorded/questions/${interviewId}`),

    // Review (Technical Recruiter)
    getAssignedRequests: async () => fetchAPI<any[]>('/recruiter/requests/assigned'),

    reviewRequest: async (requestId: string, status: 'approved' | 'rejected', reviewNotes?: string) => {
        return fetchAPI(`/recruiter/requests/${requestId}/review`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status, review_notes: reviewNotes })
        });
    },

    // Candidate Import & Group Creation
    uploadCandidates: async (positionId: string, file: File) => {
        const formData = new FormData();
        formData.append('file', file);

        // Note: fetchAPI wrapper might default to JSON content type. 
        // If fetchAPI sets 'Content-Type': 'application/json' automatically, this might fail.
        // We might need to use raw fetch or ensure fetchAPI handles FormData.
        // Assuming fetchAPI handles it or we override.
        // Actually, let's use API_URL + fetch directly to be safe if fetchAPI is rigid.
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/recruiter/positions/${positionId}/candidates/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
                // No Content-Type header, browser sets it with boundary for FormData
            },
            body: formData
        });
        if (!res.ok) {
            const err = await res.json();
            let errorMessage = 'Upload failed';
            if (err.detail) {
                if (typeof err.detail === 'string') {
                    errorMessage = err.detail;
                } else if (Array.isArray(err.detail)) {
                    errorMessage = err.detail.map((e: any) => e.msg).join(', ');
                } else {
                    errorMessage = JSON.stringify(err.detail);
                }
            }
            throw new Error(errorMessage);
        }
        return res.json();
    },

    createGroup: async (data: {
        name: string;
        position_id: string;
        candidate_ids: string[]; // Frontend likely uses string IDs, backend expects UUIDs
        description?: string;
        ai_ranking_used?: boolean;
        nlp_query?: string;
    }) => {
        return fetchAPI<any>(`/recruiter/positions/${data.position_id}/groups`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    deleteGroup: async (groupId: string) => {
        return fetchAPI(`/recruiter/groups/${groupId}`, {
            method: 'DELETE'
        });
    },

    updateGroup: async (groupId: string, data: { name?: string; status?: string; filtration_flow?: string[] }) => {
        return fetchAPI<any>(`/recruiter/groups/${groupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }
};
