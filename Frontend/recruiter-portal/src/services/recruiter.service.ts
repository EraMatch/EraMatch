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

    // Project Management
    getProjects: async () => fetchAPI<Project[]>('/projects'),

    getProjectDetails: async (projectId: string) => {
        const projects = await fetchAPI<Project[]>('/projects');
        return projects.find(p => p.id.toString() === projectId) || projects[0];
    },

    getProjectPositions: async (projectId: number) => {
        const positions = await fetchAPI<JobPosition[]>('/positions');
        return positions.filter(p => p.projectId === projectId);
    },

    getClosedProjects: async () => fetchAPI<ClosedProject[]>('/projects/closed'),

    getProjectGroups: async (projectId: string) => fetchAPI<PositionGroup[]>('/groups'),

    createProject: async (data: Partial<Project>) => {
        return fetchAPI<Project>('/projects', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    updateProject: async (id: number | string, data: Partial<Project>) => {
        return fetchAPI(`/projects/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    // Position Management
    createPosition: async (data: Partial<JobPosition>) => {
        return fetchAPI<JobPosition>('/positions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    updatePosition: async (id: number | string, data: Partial<JobPosition>) => {
        return fetchAPI(`/positions/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    deletePosition: async (id: number | string) => {
        return fetchAPI(`/positions/${id}`, {
            method: 'DELETE'
        });
    },

    getPositionDetails: async (positionId: string) => fetchAPI(`/positions/${positionId}/details`),

    getPositionInsights: async (positionId: string) => fetchAPI(`/positions/${positionId}/insights`),

    getFiltrationFlowConfig: async (positionId: string) => fetchAPI(`/positions/${positionId}/filtration-flow`),

    getSkillClusters: async (positionId: string) => fetchAPI(`/positions/${positionId}/skills`),

    // Candidate Management
    getCandidates: async () => fetchAPI('/groups/candidates/all'),

    getGroupCandidates: async () => fetchAPI('/groups/candidates/all'),

    getCandidate: async (candidateId: number) => fetchAPI<any>(`/candidates/${candidateId}`),

    getSuspectReview: async (candidateId: number) => fetchAPI(`/candidates/${candidateId}/suspect-review`),

    getKnowledgeGraphData: async (candidateId: number) => fetchAPI(`/candidates/${candidateId}/knowledge-graph`),

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
            fetchAPI<string[]>('/recruiters/hr'),
            fetchAPI<string[]>('/recruiters/technical')
        ]);
        const mapToObj = (names: string[], role: string) => names.map((n, i) => ({ id: `${role}-${i}`, name: n, role }));
        return [...mapToObj(hr, 'HR Recruiter'), ...mapToObj(tech, 'Technical Recruiter')];
    },

    // Group Management
    getGroupDetails: async (groupId: string) => fetchAPI(`/groups/${groupId}/details`),

    getGroupOverviewV2: async (groupId: string) => fetchAPI(`/groups/${groupId}/overview`),

    getGroupCreationConfig: async () => fetchAPI('/groups/config/creation'),

    // Pipeline & Modules
    getPipelineTemplates: async () => fetchAPI<any[]>('/recruiter/pipeline-templates'),

    getPipelineModules: async () => fetchAPI<any[]>('/recruiter/pipeline-modules'),

    // Assessment Management
    getAssessmentDetails: async (candidateId: number) => fetchAPI(`/candidates/${candidateId}/assessment-details`),

    getAssessmentTemplates: async () => fetchAPI('/assessments/templates'),

    getAssessmentSession: async (sessionId: string) => fetchAPI(`/assessments/sessions/${sessionId}`),

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

    getRecordedInterviewQuestions: async (interviewId: string) => fetchAPI(`/interviews/recorded/questions/${interviewId}`)
};
