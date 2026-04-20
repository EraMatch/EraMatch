import { fetchAPI } from './client';

// Live Interview V2 service — session token + room management
// API_URL base = http://localhost:8000/api/v1 — paths below are relative to that
export const liveInterviewService = {
    /**
     * Candidate: Get a LiveKit JWT to join their interview room.
     * The backend verifies the frozen bank, creates a session, and dispatches the agent.
     *
     * Returns: { token, url, room_name, session_id }
     */
    getSessionToken: async () => fetchAPI('/live-interview-v2/session/token'),

    /**
     * Mark an interview session as complete (called after the candidate
     * disconnects so the backend can trigger Phase 4 grading).
     *
     * The client sends an empty transcript — the agent's own on_shutdown
     * handler persists the real transcript server-side. Endpoint is
     * unauthenticated (session_id is the capability token).
     */
    completeSession: async (sessionId: string, transcript: Record<string, unknown>[] = []) =>
        fetchAPI(`/live-interview-v2/session/${sessionId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcript }),
        }),
};
