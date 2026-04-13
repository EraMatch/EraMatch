import { fetchAPI } from './client';

// Live Interview V2 service — session token + room management
export const liveInterviewService = {
    /**
     * Candidate: Get a LiveKit JWT to join their interview room.
     * The backend verifies the frozen bank, creates a session, and dispatches the agent.
     *
     * Returns: { token, url, room_name, session_id }
     */
    getSessionToken: async () => fetchAPI('/api/v1/li-v2/session/token'),

    /**
     * Mark an interview session as complete (called after the candidate
     * disconnects so the backend can trigger Phase 4 grading).
     */
    completeSession: async (sessionId: string) =>
        fetchAPI(`/api/v1/li-v2/session/${sessionId}/complete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        }),
};
