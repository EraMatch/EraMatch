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
    startCandidateGithubAnalysis: async (candidateId: string) =>
        fetchAPI<{ job_id: string; status: string; message: string }>(`/candidates/${candidateId}/github-analysis/start`, {
            method: 'POST'
        }),

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
    getAssessment: async (assessmentId: string) => {
        return fetchAPI(`/assessments/${assessmentId}`);
    },

    updateAssessment: async (assessmentId: string, data: any) => {
        return fetchAPI(`/assessments/${assessmentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    deleteAssessment: async (assessmentId: string) => {
        return fetchAPI(`/assessments/${assessmentId}`, {
            method: 'DELETE'
        });
    },

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

    createQuestionBank: async (data: any) => {
        return fetchAPI('/questions/bank', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    toggleQuestionFavorite: async (questionId: string) => fetchAPI(`/questions/bank/${questionId}/favorite`, { method: 'POST' }),

    deleteQuestionBank: async (questionId: string) => fetchAPI(`/questions/bank/${questionId}`, { method: 'DELETE' }),

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

    deleteGroup: async (groupId: string, action: 'release' | 'reject' | 'transfer' = 'release', transfer_group_id?: string) => {
        return fetchAPI(`/recruiter/groups/${groupId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, transfer_group_id })
        });
    },

    updateGroup: async (groupId: string, data: { name?: string; status?: string; filtration_flow?: string[] }) => {
        return fetchAPI<any>(`/recruiter/groups/${groupId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    // Stage Management
    startStage: async (groupId: string, stage: string) => {
        return fetchAPI<any>(`/recruiter/groups/${groupId}/stages/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage })
        });
    },

    // Activity Log
    getGroupActivityLog: async (groupId: string) => {
        return fetchAPI(`/recruiter/groups/${groupId}/activity`);
    },

    // Interview Assignment
    assignInterview: async (groupId: string, data: {
        interview_type: 'live' | 'recorded';
        config: any;
        sections: any[];
        id?: string;
    }) => {
        // Transform the frontend data structure into the exact shape expected by the backend
        // schema `AssignInterviewRequest`
        const payload = {
            create_new: !data.id,
            interview_config_id: data.id,
            interview_config: {
                title: data.config.title || 'AI Interview',
                interview_type: data.interview_type === 'live' ? 'live_ai' : data.interview_type,
                instructions: data.config.instructions || data.config.systemPrompt || '',
                max_retakes: data.config.maxRetakes || 0,
                ...data.config,
                questions: {
                    items: data.sections,
                    extended_config: data.config
                }
            }
        };

        return fetchAPI<any>(`/recruiter/groups/${groupId}/interviews/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
    },

    deleteInterview: async (groupId: string, interviewId: string) => {
        return fetchAPI<any>(`/recruiter/groups/${groupId}/interviews/${interviewId}`, {
            method: 'DELETE'
        });
    },

    // Close Stage
    closeStage: async (groupId: string, stage: string) => {
        return fetchAPI<any>(`/recruiter/groups/${groupId}/stages/close`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ stage })
        });
    },

    // Bulk Candidate Progression
    bulkProgressCandidates: async (groupId: string, data: {
        application_ids: string[];
        action: 'progress' | 'reject' | 'hold';
        reason?: string;
    }) => {
        return fetchAPI<any>(`/recruiter/groups/${groupId}/candidates/bulk-progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    // Send Offers
    sendOffers: async (groupId: string, data: {
        application_ids: string[];
        email_subject: string;
        email_body: string;
    }) => {
        return fetchAPI<any>(`/recruiter/groups/${groupId}/offers/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    // Settings
    getSettings: async () => fetchAPI<any>('/recruiter/settings'),

    updateProfile: async (data: any) => {
        return fetchAPI<any>('/recruiter/settings/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    updatePreferences: async (data: any) => {
        return fetchAPI<any>('/recruiter/settings/preferences', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    updateAIPipeline: async (ai_pipeline_config: any) => {
        return fetchAPI<any>('/recruiter/settings/ai-pipeline', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ai_pipeline_config })
        });
    },

    // Schedule Interview
    scheduleInterview: async (groupId: string, data: {
        application_id: string;
        scheduled_at: string;
        duration_minutes?: number;
        interviewer_id?: string;
        meeting_link?: string;
    }) => {
        return fetchAPI<any>(`/recruiter/groups/${groupId}/interviews/schedule`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    // AI Features
    generateAIQuestion: async (
        data: { question_type: string, topic: string, difficulty: string, context?: string },
        signal?: AbortSignal
    ) => {
        return fetchAPI<any>('/recruiter/ai/generate-question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            signal
        });
    },

    refineAIQuestion: async (questionText: string) => {
        return fetchAPI<{ refinedText: string }>('/recruiter/ai/refine-question', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question_text: questionText })
        });
    },

    // Filter Templates
    getFilterTemplates: async () => {
        return fetchAPI<any[]>('/recruiter/filters/templates');
    },

    saveFilterTemplate: async (template: { name: string, filters: any }) => {
        return fetchAPI<any>('/recruiter/filters/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(template)
        });
    },

    deleteFilterTemplate: async (templateId: string) => {
        return fetchAPI(`/recruiter/filters/templates/${templateId}`, {
            method: 'DELETE'
        });
    },

    // Background Tasks
    getBackgroundTasks: async () => fetchAPI<any[]>('/background-tasks/'),
    getBackgroundTaskSloHealth: async () => fetchAPI<any>('/background-tasks/slo-health'),
    getTaskLogs: async (taskId: string) => fetchAPI<any>(`/background-tasks/${taskId}/logs`),
    stopAllVideoTasks: async () => fetchAPI<{ stopped_count: number; message: string }>('/background-tasks/stop-video', { method: 'POST' }),
    stopAllQuestionImportTasks: async () => fetchAPI<{ stopped_count: number; message: string }>('/background-tasks/stop-question-import', { method: 'POST' }),
    stopAllGithubAnalysisTasks: async () => fetchAPI<{ stopped_count: number; message: string }>('/background-tasks/stop-github-analysis', { method: 'POST' }),
    stopVideoTask: async (taskId: string) =>
        fetchAPI<{ message: string; task_id: string; status: string }>(`/background-tasks/stop-video/${taskId}`, { method: 'POST' }),
    stopQuestionImportTask: async (taskId: string) =>
        fetchAPI<{ message: string; task_id: string; status: string }>(`/background-tasks/stop-question-import/${taskId}`, { method: 'POST' }),
    stopGithubAnalysisTask: async (taskId: string) =>
        fetchAPI<{ message: string; task_id: string; status: string }>(`/background-tasks/stop-github-analysis/${taskId}`, { method: 'POST' }),
    deleteBackgroundTask: async (taskId: string, taskCategory: 'video' | 'question_import' | 'github_analysis') =>
        fetchAPI<{ message: string }>(
            `/background-tasks/${taskId}?task_category=${encodeURIComponent(taskCategory)}`,
            { method: 'DELETE' }
        ),

    // ── Question Import ──────────────────────────────────────────────────────

    /**
     * Start a question import job (Celery background task).
     * @param file - The uploaded file (PDF, DOCX, CSV, XLSX, MD, TXT)
     * @param importType - "generative" | "extraction" | "csv"
     * @param numQuestions - legacy total question count fallback
     * @param contextHint - (generative only) topic hint e.g. "Python OOP"
     * @param questionTypes - comma-separated e.g. "mcq,essay"
     */
    startQuestionImport: async (
        file: File,
        importType: 'generative' | 'extraction' | 'csv',
        numQuestions: number = 10,
        contextHint: string = '',
        recruiterInstructions: string = '',
        questionTypes: string = 'mcq,essay',
        mcqCount: number = 5,
        essayCount: number = 5,
        mcqDifficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium',
        essayDifficulty: 'Easy' | 'Medium' | 'Hard' = 'Medium',
        mcqEasyCount: number = 0,
        mcqMediumCount: number = 0,
        mcqHardCount: number = 0,
        essayEasyCount: number = 0,
        essayMediumCount: number = 0,
        essayHardCount: number = 0,
        processInChunks: boolean = false,
        chunkPageSize: number = 20,
        sheetName?: string,
        columnMapping?: Record<string, string>,
        applyAutoFixes: boolean = false
    ) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('import_type', importType);
        formData.append('num_questions', String(numQuestions));
        formData.append('context_hint', contextHint);
        formData.append('recruiter_instructions', recruiterInstructions);
        formData.append('question_types', questionTypes);
        formData.append('mcq_count', String(mcqCount));
        formData.append('essay_count', String(essayCount));
        formData.append('mcq_difficulty', mcqDifficulty);
        formData.append('essay_difficulty', essayDifficulty);
        formData.append('mcq_easy_count', String(mcqEasyCount));
        formData.append('mcq_medium_count', String(mcqMediumCount));
        formData.append('mcq_hard_count', String(mcqHardCount));
        formData.append('essay_easy_count', String(essayEasyCount));
        formData.append('essay_medium_count', String(essayMediumCount));
        formData.append('essay_hard_count', String(essayHardCount));
        formData.append('process_in_chunks', processInChunks ? 'true' : 'false');
        formData.append('chunk_page_size', String(chunkPageSize));
        if (sheetName) {
            formData.append('sheet_name', sheetName);
        }
        if (columnMapping && Object.keys(columnMapping).length > 0) {
            formData.append('column_mapping', JSON.stringify(columnMapping));
        }
        formData.append('apply_auto_fixes', applyAutoFixes ? 'true' : 'false');
        return fetchAPI<{ job_id: string; status: string; message: string; chunked?: boolean; chunk_count?: number; job_ids?: string[] }>(
            '/questions/import',
            { method: 'POST', body: formData }
        );
    },

    preflightQuestionImport: async (file: File, chunkPageSize: number = 20) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('chunk_page_size', String(chunkPageSize));
        return fetchAPI<{
            is_pdf: boolean;
            total_pages: number | null;
            max_pages_without_chunking: number;
            requires_chunking: boolean;
            chunk_page_size: number;
            chunk_count: number;
            message: string;
        }>('/questions/import/preflight', { method: 'POST', body: formData });
    },

    preflightSpreadsheetImport: async (file: File, sheetName?: string) => {
        const formData = new FormData();
        formData.append('file', file);
        if (sheetName) {
            formData.append('sheet_name', sheetName);
        }
        return fetchAPI<{
            sheets: string[];
            selected_sheet: string | null;
            columns: string[];
            mapping: Record<string, string | null>;
            confidence: Record<string, number>;
            uncertain_fields: string[];
            valid_rows: number;
            invalid_rows: number;
            row_errors_preview: Array<{ row: number; error: string }>;
            auto_fix_suggestions_preview: Array<{ row: number; error: string; suggestion: string; auto_fixable: boolean }>;
            auto_fixable_count: number;
            unfixable_count: number;
        }>('/questions/import/spreadsheet/preflight', { method: 'POST', body: formData });
    },

    downloadQuestionImportTemplate: async () => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/questions/import/template`, {
            method: 'GET',
            headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
        });

        if (!res.ok) {
            throw new Error(`Failed to download template: ${res.statusText}`);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'eramatch_question_import_template.csv';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    },

    /** List all import jobs for the current organization. */
    listImportJobs: async () => fetchAPI<any[]>('/questions/import/jobs'),

    /** Get draft questions for a completed import job (staging review). */
    getDraftQuestions: async (jobId: string) =>
        fetchAPI<any>(`/questions/import/jobs/${jobId}/draft`),

    downloadImportRowErrorsReport: async (jobId: string) => {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_URL}/questions/import/jobs/${jobId}/row-errors-report`, {
            method: 'GET',
            headers: {
                ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
        });

        if (!res.ok) {
            throw new Error(`Failed to download row error report: ${res.statusText}`);
        }

        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `import_row_errors_${jobId}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    },

    /** Commit approved draft questions into the live Question Bank. */
    approveImportQuestions: async (jobId: string, questions: any[]) =>
        fetchAPI<{ imported_count: number; skipped_count: number; message: string }>(
            `/questions/import/jobs/${jobId}/approve`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ questions }),
            }
        ),

    refineImportQuestion: async (jobId: string, questionIndex: number) =>
        fetchAPI<{ question_index: number; refined_question: any; message: string }>(
            `/questions/import/jobs/${jobId}/draft/refine`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question_index: questionIndex }),
            }
        ),
};
