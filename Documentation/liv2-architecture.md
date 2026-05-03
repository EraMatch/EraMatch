# Live Interview V2 (LiV2) — Architecture & UX Documentation

## Table of Contents
1. [System Architecture Overview](#1-system-architecture-overview)
2. [Data Flow & Lifecycle](#2-data-flow--lifecycle)
3. [Judging & Scoring Methodology](#3-judging--scoring-methodology)
4. [Recruiter Experience (UX)](#4-recruiter-experience-ux)
5. [Candidate Experience (UX)](#5-candidate-experience-ux)
6. [API Reference](#6-api-reference)

---

## 1. System Architecture Overview

LiV2 is an AI-powered, real-time interview system integrated into the EraMatch platform. It enables organizations to conduct structured, automated technical and behavioral interviews using specialized AI agents.

### Component Map
- **Recruiter Portal**: React + Vite application for configuring rubrics/banks and monitoring sessions.
- **Candidate Portal**: React + Vite application for device testing and the real-time interview room.
- **Backend API (FastAPI)**: Manages CRUD for rubrics/banks, session state, and LiveKit token generation.
- **AI Service (FastAPI)**: Handles the Judge Pipeline and interfaces with LLM providers (Gemini/Ollama).
- **LiveKit Cloud**: Provides the WebRTC signaling and media infrastructure.
- **LiveKit Agent (Interviewer)**: A Python-based worker dispatched to the room to conduct the conversation.

### Session Lifecycle Flow
```text
[Recruiter] -> Freeze Rubric/Bank -> [Stage Activated]
                                         |
                                         v
[Candidate] -> Onboarding -> Device Test -> Join Room
                                         |
                                         v
[LiveKit Room] <-> [AI Agent] <-> [Candidate]
       |             |               |
       +-------------+---------------+
                     |
           (Interview Completion)
                     |
                     v
[Backend] -> [Judge Pipeline (5 Phases)] -> [Evaluation Saved]
                                         |
                                         v
[Recruiter/Candidate] <- View Results
```

---

## 2. Data Flow & Lifecycle

The lifecycle of an LiV2 stage involves a strict progression from draft configuration to evaluation.

### Configuration Lifecycle
1. **Draft Phase**: Recruiter selects dimensions and anchors. Questions are AI-generated based on these anchors.
2. **Freeze Phase**: Recruiter "locks" the configuration. The system validates that dimensions, anchors, and questions are complete. Once frozen, these artifacts are immutable to ensure consistency across all candidates in the group.
3. **Activation**: HR starts the stage for the group. This creates `candidate_pipeline_progress` records with status `unlocked`.

### Interaction Flow
1. **Token Retrieval**: Candidate enters the room step; Frontend calls `GET /session/token`.
2. **Agent Dispatch**: Backend dispatches the AI agent to the room and generates a LiveKit JWT.
3. **Conducting**: Agent loads the frozen question bank and initiates audio interaction.
4. **Completion**: When the session ends, the agent calls `POST /session/{id}/complete` with the final transcript.

---

## 3. Judging & Scoring Methodology

The LiV2 Judge Pipeline is a 5-phase background process designed for accuracy, explainability, and evidence-based scoring.

### The 5-Phase Pipeline

| Phase | Name | Description |
|-------|------|-------------|
| **A** | **Segmentation** | Splits the raw transcript into evidence blocks mapped to specific rubric dimensions. |
| **B** | **Question Mapping** | Maps transcript segments to specific questions in the bank using `pillar_idx`. |
| **C** | **Per-Question Scoring** | Scores each Q&A pair against its specific sub-criteria (1-3 scale). |
| **D** | **Weighted Aggregation** | Computes dimension scores and overall percentage based on recruiter-defined weights. |
| **E** | **Verdict & Persistence** | Determines the auto-verdict, builds integrity flags, and saves the final evaluation. |

### Scoring Algorithm
- **Raw Scale**: 1 (Substandard), 2 (Proficient), 3 (Excellent).
- **Normalization**: Score `1` maps to `0%`, `2` to `50%`, and `3` to `100%`.
- **Aggregation**: Dimension scores are weighted averages of the questions mapped to them. Overall score is the weighted average of all dimensions.

### Auto-Verdict Thresholds
| Percentage | Verdict | Criteria Met |
|------------|---------|--------------|
| **>= 80%** | `strong_pass` | Yes |
| **>= 60%** | `pass` | Yes |
| **40% - 59%** | `borderline` | No |
| **< 40%** | `fail` | No |

### Evidence & Confidence
- **Cited Quotes**: Every score is accompanied by a quote from the transcript.
- **Confidence Level**: High (>= 80% coverage), Medium (>= 50%), Low (< 50%).
- **Verification**: The system cross-references LLM-cited quotes against the actual transcript to ensure they aren't hallucinated.

---

## 4. Recruiter Experience (UX)

### Configuration Wizard (4 Steps)
1. **Dimensions**: Select competency pillars (e.g., Technical Depth, Communication). Weights must sum to 100%.
2. **Rubric Anchors**: Define what "Excellent" vs "Substandard" looks like for each dimension.
3. **Question Bank**: AI-generate questions with specific intent and sub-criteria mapped to the rubric.
4. **Review & Freeze**: Review the full config and lock it.

### Evaluation Dashboard
- **Score Ring**: High-level visual of the candidate's performance.
- **Dimension Breakdown**: Expandable cards showing scores, reasoning, and cited evidence.
- **Transcript View**: Color-coded transcript with speaker identifiers.
- **Integrity Flags**: Warnings for short sessions, face missing, or unverified quotes.

---

## 5. Candidate Experience (UX)

### Onboarding Flow
1. **Welcome Screen**: Explains the AI interview format and privacy details.
2. **Device Test**: Guided test for camera and microphone. Candidates record and playback a 4-second clip to verify quality.
3. **Interview Room**: Minimalist interface with:
   - **AI Agent Orb**: Visual indicator of the agent's state (Speaking, Listening, Thinking).
   - **Live Captions**: Real-time STT for the candidate's own responses.
   - **Transcript History**: Scrolling history of the conversation.

### Ending the Session
Candidates can click "End Interview" at any time. The system also supports a "Soft Exit" where closing the tab triggers a background completion event to ensure the transcript is saved.

---

## 6. API Reference

### Configuration Endpoints
- `POST /live-interview-v2/rubric/suggest-dimensions`: Get AI suggestions for pillars.
- `POST /live-interview-v2/bank/generate`: Populate a bank from a frozen rubric.
- `POST /live-interview-v2/rubric/{id}/freeze`: Lock a rubric.

### Session Endpoints
- `GET /live-interview-v2/session/token`: Generate JWT for candidate entry.
- `POST /live-interview-v2/session/{id}/complete`: (Internal) Trigger the judge pipeline.
- `GET /live-interview-v2/session/{id}`: Retrieve evaluation results.

### Monitoring Endpoints
- `GET /live-interview-v2/group/{id}/sessions-monitor`: Real-time session status and event timelines.

---

## 7. Code Examples

### Frontend: Fetching Room Token (Candidate Portal)
```typescript
const fetchRoomToken = async () => {
    try {
        const response = await api.liveInterview.getSessionToken();
        // Returns { token: string, url: string, room_name: string, session_id: string }
        setRoomToken(response.token);
        setRoomUrl(response.url);
        setSessionId(response.session_id);
    } catch (err) {
        console.error("Failed to get interview token", err);
    }
};
```

### Backend: Triggering Judge Pipeline (Python)
```python
# From app/services/live_interview/session.py
async def complete_li_v2_session(session_id: UUID, transcript: List[Dict]):
    # 1. Update session state
    session = await update_session(session_id, state="completed", transcript=transcript)
    
    # 2. Trigger background judge
    celery_app.send_task(
        "app.worker.tasks.live_interview.run_judge_pipeline",
        args=[str(session_id)],
        queue="ai-priority"
    )
    return session
```

### AI Service: Per-Question Scoring Prompt (Simplified)
```text
Score the following candidate response against the provided sub-criteria.
Question: {{question_text}}
Sub-criteria: {{sub_criteria}}
Response: {{candidate_answer}}

Output JSON: {
  "question_score": 1.0-3.0,
  "reasoning": "...",
  "cited_quote": "...",
  "anchor_matched": "substandard|proficient|excellent"
}
```
