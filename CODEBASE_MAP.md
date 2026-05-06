# EraMatch Codebase Map

Purpose: Help AI agents quickly identify the minimum set of files needed to fulfill a request without searching the entire codebase.

## Architecture Overview

```
EraMatch/
├── backend/          # FastAPI — recruiter/admin REST API + Celery worker
├── ai-service/       # FastAPI — AI inference, CV parsing, LLM, proctoring, LiveKit agent
├── Frontend/
│   ├── recruiter-portal/   # Vite + React (TypeScript) — recruiter & admin UI
│   └── candidate-portal/   # Vite + React (TypeScript) — candidate UI
└── tests/            # Pytest + Postman collections
```

**Request flow:**  
Browser → recruiter/candidate portal (services/) → backend API (api/v1/) → services/ → ai-service (via HTTP)  
Background work: backend/worker/ tasks → ai-service/worker/ tasks (Celery)

---

## Feature-to-File Map

### CV Parsing / Ingestion

| File | Role |
|------|------|
| `ai-service/routers/cv_parsing.py` | HTTP endpoint that receives CV bytes and returns parsed JSON |
| `ai-service/worker/tasks/cv_parsing_task.py` | Celery task wrapper around the parsing logic |
| `ai-service/prompts/cv_parsing/parse.md` | LLM prompt template for CV extraction |
| `backend/app/services/cv_parsing.py` | Backend service that calls the ai-service endpoint |
| `backend/app/services/cv_ingestion.py` | Orchestrates upload → parse → store pipeline |
| `backend/app/api/v1/cv_ingestion.py` | REST endpoint recruiter calls to submit a CV |
| `backend/worker/tasks/cv_ingestion.py` | Celery task for async ingestion dispatch |
| `backend/worker/tasks/cv_parsing.py` | Celery task for async parsing dispatch |
| `backend/app/schemas/cv_parsing.py` | Pydantic request/response shapes for CV data |
| `Frontend/recruiter-portal/src/services/candidate.service.ts` | Frontend call that uploads CVs |

---

### Candidate Portal (UI + API)

| File | Role |
|------|------|
| `Frontend/candidate-portal/src/router.tsx` | All candidate routes / protected route guards |
| `Frontend/candidate-portal/src/components/CandidateDashboard.tsx` | Main dashboard after login |
| `Frontend/candidate-portal/src/components/CandidateHomePage.tsx` | Landing/profile entry point |
| `Frontend/candidate-portal/src/components/CandidateLoginPage.tsx` | Login form |
| `Frontend/candidate-portal/src/services/candidate.service.ts` | API calls for candidate data (applications, results) |
| `Frontend/candidate-portal/src/services/auth.service.ts` | Token storage, login/logout, refresh |
| `Frontend/candidate-portal/src/services/client.ts` | Axios instance with interceptors |
| `backend/app/api/v1/candidate_portal.py` | Recruiter-facing candidate portal endpoints |
| `backend/app/api/v1/candidates.py` | CRUD + search endpoints for candidates |
| `backend/app/services/candidates/candidate.py` | Candidate business logic |
| `backend/app/services/candidates/dashboard.py` | Dashboard aggregation logic |
| `backend/app/services/candidates/auth.py` | Candidate-specific auth helpers |
| `backend/app/schemas/candidate.py` | Candidate Pydantic schemas |

---

### Authentication (Recruiter + Candidate)

| File | Role |
|------|------|
| `backend/app/api/v1/auth.py` | Login, register, refresh, password reset endpoints |
| `backend/app/services/auth.py` | JWT creation, password hashing, token verification |
| `backend/app/core/security.py` | Security utilities (bcrypt, jwt settings) |
| `backend/app/core/config.py` | Environment config (SECRET_KEY, algorithm, expiry) |
| `backend/app/api/deps.py` | FastAPI dependency: `get_current_user`, `require_role` |
| `backend/app/schemas/auth.py` | Login/token Pydantic schemas |
| `Frontend/recruiter-portal/src/services/auth.service.ts` | Recruiter login/logout/token refresh |
| `Frontend/recruiter-portal/src/components/recruiter/auth/RecruiterLoginPage.tsx` | Recruiter login UI |
| `Frontend/recruiter-portal/src/components/admin/AdminLoginPage.tsx` | Admin login UI |
| `Frontend/candidate-portal/src/services/auth.service.ts` | Candidate login/logout/token refresh |
| `Frontend/candidate-portal/src/components/CandidateLoginPage.tsx` | Candidate login UI |

---

### Live Interview V2 (AI-powered live interview)

| File | Role |
|------|------|
| `backend/app/api/v1/live_interview_v2.py` | All LIV2 REST endpoints (setup, session, results) |
| `backend/app/services/live_interview/session.py` | Session lifecycle: create, start, end, abort |
| `backend/app/services/live_interview/rubric.py` | Rubric CRUD and freeze logic |
| `backend/app/services/live_interview/bank.py` | Question bank generation and management |
| `backend/app/services/live_interview/judge.py` | Post-session scoring and judgment |
| `backend/app/services/live_interview/providers.py` | LiveKit token/room provisioning |
| `backend/app/services/live_interview/token.py` | LiveKit JWT generation |
| `backend/app/schemas/live_interview_v2.py` | All LIV2 Pydantic schemas |
| `ai-service/livekit_worker/interviewer_agent.py` | LiveKit agent: asks questions, listens, reacts |
| `ai-service/livekit_worker/agent_server.py` | Agent process entrypoint / dispatch loop |
| `ai-service/livekit_worker/prompt_firewall.py` | Filters candidate attempts to jailbreak the agent |
| `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/ConfigWizardV2.tsx` | Recruiter config wizard (rubric + bank setup) |
| `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/RubricEditor.tsx` | Dimension/rubric editing UI |
| `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/QuestionBankEditor.tsx` | Question bank review + edit UI |
| `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/FreezeConfirmation.tsx` | Confirm rubric freeze before interview |
| `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/LiveInterviewMonitor.tsx` | Recruiter real-time session monitor |
| `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/LiveInterviewResults.tsx` | Post-session results view |
| `Frontend/candidate-portal/src/components/live-interview-v2/LiveInterviewRoom.tsx` | Candidate's interview room (audio/video UI) |
| `Frontend/candidate-portal/src/components/live-interview-v2/AIAgentOrb.tsx` | Animated AI agent visual indicator |
| `Frontend/candidate-portal/src/services/live-interview.service.ts` | Candidate-side LiveKit + API calls |

---

### Assessments (Written/MCQ/Code)

| File | Role |
|------|------|
| `backend/app/api/v1/assessments.py` | Assessment CRUD, submission, scoring endpoints |
| `backend/app/services/assessments.py` | Assessment business logic, auto-scoring |
| `backend/app/schemas/assessments.py` | Assessment Pydantic schemas |
| `ai-service/routers/evaluate.py` | AI endpoint: grades open-ended answers |
| `ai-service/prompts/llm/` | All LLM prompt templates (evaluation, scoring, etc.) |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/CreateAssessmentPage.tsx` | Assessment creation UI |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/CreateAdvancedAssessment.tsx` | Advanced multi-section assessment builder |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/AssessmentSettings.tsx` | Time limits, randomization, proctoring settings |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/EnhancedAssessmentReport.tsx` | Per-candidate assessment result report |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/AnswerReviewWithHITL.tsx` | Human-in-the-loop answer review |
| `Frontend/candidate-portal/src/components/AssessmentSession.tsx` | Candidate takes the assessment |
| `Frontend/candidate-portal/src/components/TechnicalAssessmentFlow.tsx` | Code-challenge specific flow |

---

### Question Bank (AI-generated + Import)

| File | Role |
|------|------|
| `backend/app/api/v1/questions.py` | Question CRUD endpoints |
| `backend/app/services/questions.py` | Question management business logic |
| `backend/app/schemas/questions.py` | Question Pydantic schemas |
| `backend/app/schemas/question_import.py` | Import batch schemas |
| `backend/worker/tasks/qag.py` | Celery task: question auto-generation (QAG) |
| `backend/worker/tasks/question_import.py` | Celery task: bulk question import |
| `ai-service/routers/question_import.py` | AI endpoint: parses raw question documents |
| `ai-service/prompts/question_import/` | Prompts for question extraction and classification |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/QuestionBankPage.tsx` | Browse/manage question bank |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/QuestionBankModal.tsx` | Question picker modal |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/QuestionImportModal.tsx` | Upload & import questions |
| `Frontend/recruiter-portal/src/components/recruiter/assessments/QuestionImportReview.tsx` | Review AI-parsed questions before saving |

---

### GitHub Analysis

| File | Role |
|------|------|
| `ai-service/routers/github_analysis.py` | AI endpoint: analyzes a GitHub profile/repo |
| `ai-service/prompts/github_analysis/` | All GitHub analysis prompt stages (relevance, audit, synthesis, etc.) |
| `backend/worker/tasks/github_analysis.py` | Celery task that triggers analysis |
| `Frontend/recruiter-portal/src/components/recruiter/candidates/CandidateGitHubAnalysisReviewPage.tsx` | Recruiter views the GitHub report |

---

### Proctoring / Anti-Cheat

| File | Role |
|------|------|
| `ai-service/routers/proctoring.py` | AI endpoint: processes proctoring snapshots |
| `ai-service/services/proctoring.py` | Core proctoring logic (face detection, gaze) |
| `ai-service/services/proctoring_engine.py` | Frame analysis pipeline |
| `backend/app/core/integrity_metrics.py` | Aggregates integrity signals per session |
| `Frontend/candidate-portal/src/utils/proctoringPayload.ts` | Builds the proctoring snapshot payload |
| `Frontend/recruiter-portal/src/components/recruiter/candidates/SuspectReviewPage.tsx` | Recruiter reviews flagged candidates |
| `Frontend/recruiter-portal/src/components/recruiter/dashboard/SuspiciousActivityLog.tsx` | Dashboard widget for integrity alerts |

---

### Scoring Pipeline (CV → Prescore → Hierarchical)

| File | Role |
|------|------|
| `backend/app/services/prescore.py` | Initial CV-vs-JD prescore |
| `backend/app/services/hierarchical_scorer.py` | Multi-dimension weighted scoring |
| `backend/app/services/evidence_extractor.py` | Pulls evidence snippets supporting a score |
| `backend/app/services/cross_verifier.py` | Cross-checks claims across CV, GitHub, interview |
| `backend/app/services/semantic_anchors.py` | Semantic similarity anchors for scoring |
| `ai-service/services/dag_scorer.py` | DAG-based scoring graph execution |
| `ai-service/routers/evaluate.py` | Generic AI evaluation endpoint |
| `ai-service/routers/anomaly_detection.py` | Flags statistical outliers in scores |
| `ai-service/services/anomaly_detector.py` | Anomaly detection logic |

---

### Groups / Filtration Pipeline

| File | Role |
|------|------|
| `backend/app/api/v1/groups.py` | Group CRUD, candidate assignment, stage control |
| `backend/app/services/group.py` | Group business logic, progression, bulk actions |
| `backend/app/schemas/group.py` | Group Pydantic schemas |
| `Frontend/recruiter-portal/src/components/recruiter/groups/EnhancedGroupOverviewV2.tsx` | Main group management view |
| `Frontend/recruiter-portal/src/components/recruiter/groups/FiltrationFlowConfigModal.tsx` | Configure assessment/interview stages |
| `Frontend/recruiter-portal/src/components/recruiter/groups/BulkProgressionModal.tsx` | Move multiple candidates to next stage |
| `Frontend/recruiter-portal/src/components/recruiter/groups/StageResultsDashboard.tsx` | Results per filtration stage |
| `Frontend/recruiter-portal/src/components/recruiter/groups/FinalDecisionPage.tsx` | Accept/reject candidates at end of pipeline |
| `Frontend/recruiter-portal/src/components/recruiter/groups/ScheduleInterviewModal.tsx` | Schedule live interview for a group |

---

### Recruiter Dashboard & Projects

| File | Role |
|------|------|
| `backend/app/api/v1/recruiters.py` | Recruiter profile, project, position endpoints |
| `backend/app/services/recruiter.py` | Recruiter business logic |
| `backend/app/schemas/recruiter_extra.py` | Extra recruiter schema fields |
| `backend/app/schemas/project.py` | Project Pydantic schemas |
| `Frontend/recruiter-portal/src/components/recruiter/dashboard/Dashboard.tsx` | Recruiter home dashboard |
| `Frontend/recruiter-portal/src/components/recruiter/projects/ProjectsPage.tsx` | Projects list |
| `Frontend/recruiter-portal/src/components/recruiter/projects/ProjectDetailPage.tsx` | Project detail with positions and groups |
| `Frontend/recruiter-portal/src/components/recruiter/positions/PositionDashboard.tsx` | Position-level overview |
| `Frontend/recruiter-portal/src/components/recruiter/candidates/CandidatesPage.tsx` | Full candidate list with filters |
| `Frontend/recruiter-portal/src/services/recruiter.service.ts` | All recruiter API calls |

---

### Admin Panel

| File | Role |
|------|------|
| `backend/app/api/v1/admin.py` | Admin-only CRUD (users, orgs, plans) |
| `backend/app/api/v1/admin_requests.py` | Recruiter onboarding request approval |
| `backend/app/api/v1/delegation.py` | Recruiter role delegation endpoints |
| `backend/app/services/admin.py` | Admin business logic |
| `backend/app/schemas/admin.py` | Admin Pydantic schemas |
| `Frontend/recruiter-portal/src/components/admin/AdminDashboard.tsx` | Admin home |
| `Frontend/recruiter-portal/src/components/admin/AdminRequests.tsx` | Approve/reject recruiter requests |
| `Frontend/recruiter-portal/src/components/admin/AdminOrganizationMembers.tsx` | Manage org members |
| `Frontend/recruiter-portal/src/components/admin/AdminRecruiterDelegation.tsx` | Assign delegation to recruiters |
| `Frontend/recruiter-portal/src/services/admin.service.ts` | Admin API calls |

---

### Notifications & Emails

| File | Role |
|------|------|
| `backend/app/services/notification.py` | In-app notification creation and dispatch |
| `backend/app/services/email.py` | Email sending via SMTP/provider |
| `backend/app/api/v1/webhooks.py` | Inbound webhook handlers (e.g., payment events) |
| `Frontend/recruiter-portal/src/components/common/AlertsNotifications.tsx` | Notifications drawer UI |
| `Frontend/recruiter-portal/src/components/common/Notifications.tsx` | Notification badge/bell component |

---

### Background Tasks (Celery)

| File | Role |
|------|------|
| `backend/worker/celery_app.py` | Backend Celery app instance + broker config |
| `backend/worker/tasks/cv_ingestion.py` | Async CV ingestion task |
| `backend/worker/tasks/cv_parsing.py` | Async CV parsing task |
| `backend/worker/tasks/github_analysis.py` | Async GitHub analysis task |
| `backend/worker/tasks/qag.py` | Async question auto-generation task |
| `backend/worker/tasks/question_import.py` | Async question import task |
| `backend/worker/tasks/video.py` | Async video processing task |
| `ai-service/worker/celery_app.py` | AI-service Celery app instance |
| `ai-service/worker/tasks/cv_parsing_task.py` | AI-service CV parsing Celery task |
| `backend/app/api/v1/background_tasks.py` | Endpoints to trigger/monitor background jobs |
| `Frontend/recruiter-portal/src/components/recruiter/dashboard/BackgroundTasks.tsx` | UI panel showing task progress |

---

### AI / LLM Integration Layer

| File | Role |
|------|------|
| `ai-service/main.py` | AI service FastAPI app entrypoint |
| `ai-service/config.py` | AI service config (model names, endpoints, API keys) |
| `ai-service/services/ollama.py` | Ollama LLM client (local model calls) |
| `ai-service/services/huggingface.py` | HuggingFace model client |
| `ai-service/services/whisper.py` | Whisper transcription client |
| `ai-service/routers/llm.py` | Generic LLM proxy endpoint |
| `ai-service/routers/transcribe.py` | Speech-to-text endpoint |
| `backend/app/integrations/llm.py` | Backend LLM client (calls ai-service) |
| `backend/app/integrations/embeddings.py` | Embedding generation client |
| `backend/app/integrations/models.py` | Shared integration model types |

---

### API Infrastructure

| File | Role |
|------|------|
| `backend/app/main.py` | FastAPI app factory, middleware, router mounts |
| `backend/app/api/v1/router.py` | Aggregates all v1 route prefixes |
| `backend/app/api/deps.py` | Shared FastAPI dependencies (auth, db session) |
| `backend/app/db/session.py` | SQLAlchemy session factory |
| `backend/app/models.py` | All SQLAlchemy ORM models (single file) |
| `backend/app/core/exceptions.py` | Custom HTTP exception classes |
| `backend/app/routers/monitoring.py` | Health-check and metrics endpoints |
| `Frontend/recruiter-portal/src/services/api.ts` | Recruiter portal API client (typed calls) |
| `Frontend/recruiter-portal/src/services/client.ts` | Recruiter portal Axios instance |
| `Frontend/candidate-portal/src/services/api.ts` | Candidate portal API client (typed calls) |
| `Frontend/candidate-portal/src/services/client.ts` | Candidate portal Axios instance |

---

### Routing & Navigation (Frontend)

| File | Role |
|------|------|
| `Frontend/recruiter-portal/src/router.tsx` | All recruiter/admin routes and auth guards |
| `Frontend/recruiter-portal/src/components/recruiter/layout/Sidebar.tsx` | Recruiter nav sidebar |
| `Frontend/recruiter-portal/src/components/admin/AdminSidebar.tsx` | Admin nav sidebar |
| `Frontend/recruiter-portal/src/components/common/Header.tsx` | Top navigation bar |
| `Frontend/candidate-portal/src/router.tsx` | All candidate routes and auth guards |

---

## Quick-Reference: Common Task → Files

| Task | Primary files to check |
|------|----------------------|
| Change CV parsing logic | `ai-service/routers/cv_parsing.py`, `ai-service/prompts/cv_parsing/parse.md`, `backend/app/services/cv_parsing.py` |
| Change LIV2 question generation | `backend/app/services/live_interview/bank.py`, AI prompts in `ai-service/prompts/llm/` |
| Change LIV2 rubric/freeze flow | `backend/app/services/live_interview/rubric.py`, `Frontend/recruiter-portal/src/components/recruiter/live-interview-v2/RubricEditor.tsx`, `FreezeConfirmation.tsx` |
| Change how AI agent interviews | `ai-service/livekit_worker/interviewer_agent.py`, `ai-service/livekit_worker/prompt_firewall.py` |
| Change scoring algorithm | `backend/app/services/hierarchical_scorer.py`, `backend/app/services/prescore.py`, `ai-service/services/dag_scorer.py` |
| Change assessment grading | `ai-service/routers/evaluate.py`, `ai-service/prompts/llm/`, `backend/app/services/assessments.py` |
| Add/change a backend API endpoint | `backend/app/api/v1/<domain>.py`, `backend/app/services/<domain>.py`, `backend/app/schemas/<domain>.py` |
| Add/change a recruiter UI page | `Frontend/recruiter-portal/src/components/recruiter/<domain>/`, `src/services/recruiter.service.ts`, `src/router.tsx` |
| Add/change a candidate UI page | `Frontend/candidate-portal/src/components/`, `src/services/candidate.service.ts`, `src/router.tsx` |
| Change authentication | `backend/app/api/v1/auth.py`, `backend/app/services/auth.py`, `backend/app/core/security.py`, `backend/app/api/deps.py` |
| Change email/notification | `backend/app/services/email.py`, `backend/app/services/notification.py` |
| Change GitHub analysis | `ai-service/routers/github_analysis.py`, `ai-service/prompts/github_analysis/`, `backend/worker/tasks/github_analysis.py` |
| Change proctoring | `ai-service/services/proctoring_engine.py`, `ai-service/routers/proctoring.py`, `Frontend/candidate-portal/src/utils/proctoringPayload.ts` |
| Add a Celery background task | `backend/worker/tasks/<new>.py`, register in `backend/worker/celery_app.py`, trigger from `backend/app/api/v1/background_tasks.py` |
| Change group/pipeline stage logic | `backend/app/api/v1/groups.py`, `backend/app/services/group.py` |
| Change admin actions | `backend/app/api/v1/admin.py`, `backend/app/services/admin.py`, `Frontend/recruiter-portal/src/components/admin/` |
| Change DB models | `backend/app/models.py` (single file for all ORM models) |
| Change LLM model or config | `ai-service/config.py`, `ai-service/services/ollama.py` |
