import { fetchAPI } from './client';

export const candidateService = {
    getHome: async () => fetchAPI('/candidate/home'),
    getAssessments: async () => fetchAPI('/candidate/assessments'),
    getProfile: async () => fetchAPI('/candidate/profile'),

    // Assessment endpoints
    getAssessmentConfig: async () => fetchAPI('/assessment/config'),
    startAssessment: async (data: { assessment_id: string; stage_id: string; browser_info?: Record<string, unknown> }) =>
        fetchAPI('/assessment/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    saveAnswer: async (data: {
        session_id: string;
        question_id: string;
        answer_data: Record<string, unknown>;
        time_spent_seconds?: number;
    }) =>
        fetchAPI('/assessment/answer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    runCode: async (data: { code: string; language: string; stdin?: string }) =>
        fetchAPI('/assessment/run-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    runTests: async (data: { session_id: string; question_id: string; code: string; language: string }) =>
        fetchAPI('/assessment/run-tests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    submitAssessment: async (data: { session_id: string }) =>
        fetchAPI('/assessment/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    uploadAssessmentRecording: async (sessionId: string, recording: Blob) => {
        const form = new FormData();
        form.append('session_id', sessionId);
        form.append('recording', recording, `assessment-${sessionId}.webm`);
        return fetchAPI<{ recording_url: string; message: string }>('/assessment/recording', {
            method: 'POST',
            body: form,
        });
    },
    heartbeat: async (sessionId: string) =>
        fetchAPI(`/assessment/heartbeat/${sessionId}`),
    reportIntegrityEvent: async (data: {
        session_id: string;
        event_type: string;
        severity?: 'low' | 'medium' | 'high';
        source?: string;
        confidence?: number;
        timestamp_seconds?: number;
        evidence?: string;
        metadata?: Record<string, unknown>;
    }) =>
        fetchAPI<{
            flag_id: string;
            status: string;
            message: string;
            enforcement_action?: 'none' | 'warn' | 'pause' | 'terminate';
            enforcement_reason?: string | null;
        }>('/assessment/integrity-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    getAssessmentIntegrityDecision: async (sessionId: string) =>
        fetchAPI(`/assessment/integrity-decision/${sessionId}`),

    // Interview endpoints
    getInterviewConfig: async () => fetchAPI('/interview/config'),
    startInterview: async (data: { config_id: string }) =>
        fetchAPI('/interview/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    getInterviewStatus: async (sessionId: string) =>
        fetchAPI(`/interview/status/${sessionId}`),
    completeInterview: async (data: { session_id: string }) =>
        fetchAPI('/interview/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    uploadInterviewResponse: async (data: {
        session_id: string;
        question_id: string;
        question_text: string;
        video: Blob;
        reference_answer?: string;
    }) => {
        const form = new FormData();
        form.append('session_id', data.session_id);
        form.append('question_id', data.question_id);
        form.append('question_text', data.question_text);
        if (data.reference_answer) {
            form.append('reference_answer', data.reference_answer);
        }
        form.append('video', data.video, `${data.question_id}.webm`);

        return fetchAPI('/interview/response', {
            method: 'POST',
            body: form,
        });
    },
    reportInterviewIntegrityEvent: async (data: {
        session_id: string;
        event_type: string;
        severity?: 'low' | 'medium' | 'high';
        source?: string;
        confidence?: number;
        timestamp_seconds?: number;
        evidence?: string;
        metadata?: Record<string, unknown>;
    }) =>
        fetchAPI<{
            flag_id: string;
            status: string;
            message: string;
            enforcement_action?: 'none' | 'warn' | 'pause' | 'terminate';
            enforcement_reason?: string | null;
        }>('/interview/integrity-event', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        }),
    getInterviewIntegrityDecision: async (sessionId: string) =>
        fetchAPI(`/interview/integrity-decision/${sessionId}`),
};
