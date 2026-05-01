# Live Interview V2 (LiV2) Debug Runbook

This runbook provides step-by-step diagnostic and resolution paths for common failure scenarios in the EraMatch Live Interview V2 system.

---

## System Overview & Log Locations

| Component | Log Path / Command |
|---|---|
| **Backend API** | `EraMatch/backend/logs/` or stdout |
| **AI Service (General)** | `EraMatch/ai-service/logs/` or stdout |
| **LiveKit Agent Worker** | stdout of `python livekit_worker/agent_server.py dev` |
| **Frontend (Candidate)** | Browser DevTools Console (port 5174) |
| **Frontend (Recruiter)** | Browser DevTools Console (port 5173) |

---

## Common failure Scenarios

### Scenario 1: Agent doesn't greet candidate after joining room
**Symptom**: Candidate enters the interview room, camera/mic are active, but the AI agent remains silent and never speaks.
**Probable Cause**: GCP credentials missing or invalid, preventing TTS (Text-to-Speech) initialization.
**Diagnostic Steps**:
1. Check LiveKit worker logs for `[STT] Failed to initialize Google STT` or `[TTS] Failed to initialize Google TTS`.
2. Verify if `GOOGLE_APPLICATION_CREDENTIALS` env var is set and points to a valid JSON file.
3. Check for `[AGENT-START-FAILED]` in the worker logs.
**Fix**:
- Ensure the GCP JSON key file exists at `EraMatch/ai-service/eramatch-2ed942127c39.json`.
- Restart the worker: `cd EraMatch/ai-service && python livekit_worker/agent_server.py dev`.
**Verification**:
- Worker logs should show `[TTS] Primary: deepgram/aura-2` followed by `[AGENT-READY]`.

---

### Scenario 2: Agent asks generic/irrelevant questions
**Symptom**: Agent greets the candidate but asks "Tell me about a challenging project..." instead of specific questions from the bank.
**Probable Cause**: Frozen question bank not found for the group, falling back to hardcoded safety question.
**Diagnostic Steps**:
1. Check worker logs for `No bank items — using fallback question`.
2. Query DB: `SELECT state FROM li_v2_banks WHERE group_id = '<group_id>';`.
**Fix**:
- Ensure the Technical Recruiter has "frozen" the question bank in the Recruiter Portal.
- Re-run the interview session.
**Verification**:
- Worker logs should show `Loaded X pillars from frozen bank`.

---

### Scenario 3: Judge pipeline crashes or returns 500
**Symptom**: Interview ends, but no evaluation appears. Backend logs show error in `run_judge_pipeline`.
**Probable Cause**: Transcript format mismatch or LLM provider (Ollama/Google) timeout.
**Diagnostic Steps**:
1. Search backend logs for `[JUDGE] Error in pipeline for session <id>`.
2. Verify transcript content in `li_v2_sessions` table: `SELECT transcript FROM li_v2_sessions WHERE session_id = '<id>';`.
**Fix**:
- Check if Ollama is running and reachable at `OLLAMA_BASE_URL`.
- Ensure the `INTERVIEWER_PRIMARY_MODEL` matches a valid installed model.
**Verification**:
- `SELECT * FROM li_v2_evaluations WHERE session_id = '<id>';` should return a row.

---

### Scenario 4: Interview session stuck in "in_progress" state
**Symptom**: Candidate finishes interview, but dashboard still shows "Live" or "In Progress".
**Probable Cause**: Agent failed to POST transcript to backend completion endpoint.
**Diagnostic Steps**:
1. Check worker logs for `failed to POST transcript to backend`.
2. Check backend logs for `POST /api/v1/live-interview-v2/session/<id>/complete` 404 or 401.
**Fix**:
- Verify `BACKEND_URL` in AI service `.env` points to the correct port (default 8000).
- Manually move session to completed if transcript exists.
**Verification**:
- `SELECT state FROM li_v2_sessions WHERE session_id = '<id>';` should be `completed`.

---

### Scenario 5: Evaluation scores not showing on recruiter dashboard
**Symptom**: Session is "completed", but the evaluation column is empty or spinning.
**Probable Cause**: `LiV2Evaluation` record not created due to background task failure.
**Diagnostic Steps**:
1. Check if evaluation exists: `SELECT count(*) FROM li_v2_evaluations WHERE session_id = '<id>';`.
2. Check backend logs for `Background task run_judge_pipeline failed`.
**Fix**:
- Restart the backend to clear hung background workers.
- Trigger re-judgment (if endpoint exists).
**Verification**:
- Recruiter dashboard shows the "Verdict" (e.g., Pass/Strong Pass).

---

### Scenario 6: Candidate can't join interview room
**Symptom**: Clicking "Start Interview" shows an error message or spinning wheel forever.
**Probable Cause**: Token generation failed in backend (missing bank/rubric).
**Diagnostic Steps**:
1. Open Browser DevTools (F12) in Candidate Portal.
2. Look for 400/500 error on `GET /api/v1/live-interview-v2/session/token`.
3. Check backend logs for `No frozen question bank found`.
**Fix**:
- Ensure both Rubric and Bank are "frozen" by the recruiter.
**Verification**:
- Request returns 200 with `token` and `room_name`.

---

### Scenario 7: Firewall blocks legitimate candidate questions
**Symptom**: Candidate's response is ignored, and agent says "I didn't catch that, please rephrase".
**Probable Cause**: `PromptFirewall` risk score triggered incorrectly (False Positive).
**Diagnostic Steps**:
1. Check worker logs for `[SECURITY] Blocked injection from <name>`.
2. Note the `flags` logged (e.g., `jailbreak`, `pii`).
**Fix**:
- Adjust `risk_score` threshold in `interviewer_agent.py` if too aggressive.
- White-list specific phrases if necessary.
**Verification**:
- Repeat the phrase; logs should show a lower risk score.

---

### Scenario 8: Timer not counting / UI stuck on candidate side
**Symptom**: "Time Remaining" stays at 00:00 or doesn't move.
**Probable Cause**: WebSocket connection to LiveKit dropped or room metadata missing.
**Diagnostic Steps**:
1. Check Browser Console for `LiveKit connection dropped` or `Metadata update failed`.
2. Verify `time_budget_minutes` is > 0 in `li_v2_rubrics`.
**Fix**:
- Refresh the page to reconnect to the room.
- Check internet stability.
**Verification**:
- Timer starts counting down from the configured budget.

---

### Scenario 9: Score mismatch between judge output and dashboard
**Symptom**: Judge logs say 85%, but dashboard shows 75%.
**Probable Cause**: Weighted scoring logic discrepancy between `judge.py` and `evaluation_service`.
**Diagnostic Steps**:
1. Check `dimension_scores` JSON in `li_v2_evaluations`.
2. Manually calculate: `Sum(score * weight) / Sum(weight)`.
**Fix**:
- Sync the weighted average logic in `backend/app/services/live_interview/judge.py`.
**Verification**:
- Re-run judge for the session and check dashboard.

---

### Scenario 10: Multi-tenant data leak
**Symptom**: Recruiter sees interview sessions from a different organization.
**Probable Cause**: `organization_id` filter missing in SQL query.
**Diagnostic Steps**:
1. Check `backend/app/services/live_interview/session.py` queries.
2. Verify `WHERE organization_id = :org_id` is present.
**Fix**:
- Add missing `organization_id` filters to all `select()` statements.
**Verification**:
- Login as a different organization user; verify they cannot see other org's sessions.

---

### Scenario 11: Token generation fails (401/403)
**Symptom**: `Unauthorized` error when trying to start interview.
**Probable Cause**: Candidate `access_token` expired or belongs to a different organization.
**Diagnostic Steps**:
1. Check if `Authorization` header is present in request.
2. Verify candidate email/password in `candidate_profiles`.
**Fix**:
- Clear localStorage and log in again.
**Verification**:
- Candidate home page loads without auth errors.

---

### Scenario 12: Transcript empty or missing after session ends
**Symptom**: `li_v2_sessions.transcript` is `[]` or `null`.
**Probable Cause**: Userdata mismatch bug in `agent_server.py`.
**Diagnostic Steps**:
1. Check worker logs for `no transcript to save (source=session.userdata)`.
2. Verify `InterviewerAgent` is writing to the correct userdata object.
**Fix**:
- Ensure `on_shutdown` captures the correct `session` object.
**Verification**:
- Logs show `transcript_turns=X` (X > 0) on shutdown.

---

### Scenario 13: Proctoring flags not appearing
**Symptom**: Candidate switches tabs or leaves frame, but no flags appear on recruiter dashboard.
**Probable Cause**: `proctoring_flags` table not being hit or `session_type` mismatch.
**Diagnostic Steps**:
1. Check `TechnicalAssessmentFlow.tsx` (if reused) or `LiveInterviewRoom.tsx` for flag emitters.
2. Query: `SELECT * FROM proctoring_flags WHERE session_id = '<id>';`.
**Fix**:
- Ensure `event_type` is correctly mapped in the backend `proctoring` router.
**Verification**:
- Switch tabs during interview; check if a new row appears in `proctoring_flags`.
