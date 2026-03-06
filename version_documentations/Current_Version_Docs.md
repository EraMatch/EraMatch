# EraMatch – Candidate Portal Version Docs

> **Branch:** `feat/51-candidate-assesment`
> **Issues Addressed:** #1, #3, #13, #40, #51, #76, #78
> **DB Change Logs:** See `backend/db_changes_log.md` for a full record of all database-level changes made during this sprint.

---

## How to Test (Step-by-Step)

Open **3 separate terminals** and run each service:

### Terminal 1 – Backend API (Port 8000)

```bash
cd backend
.venv\Scripts\activate          # Windows
# or: source .venv/bin/activate  # Mac/Linux
uvicorn app.main:app --reload --port 8000
```

### Terminal 2 – AI Service (Port 8001)

```bash
cd ai-service
.venv\Scripts\activate
uvicorn main:app --reload --port 8001
```

### Terminal 3 – Candidate Frontend (Port 5173 or 5174)

```bash
cd Frontend/candidate-portal
npm install   # first time only
npm run dev
```

All 3 must be running. The AI service handles both essay grading and video interview transcription/evaluation.

---

### Sample Test Credentials

#### Technical Assessment Testing

These candidates are set up for the **Full Stack Developer Technical Assessment** (60 min, MCQ + Coding + Essay):

| Email                     | Password       | Status              |
| ------------------------- | -------------- | ------------------- |
| `candidate4@eramatch.com` | `candidate123` | Fresh (not started) |
| `candidate5@eramatch.com` | `candidate123` | In progress         |
| `candidate8@eramatch.com` | `candidate123` | Fresh (not started) |

**What to test:**

1. Log in → pass the pre-check screens (cam, mic, rules — done only once per browser session)
2. Assessment starts and questions are shuffled per section
3. Answer MCQs, write code, submit essays
4. Submit → verify score in monitoring dashboard

#### AI Video Interview Testing

These candidates are set up for the recorded video interview pipeline:

| Email                     | Password       | Type                     |
| ------------------------- | -------------- | ------------------------ |
| `candidate6@eramatch.com` | `candidate123` | Recorded video interview |
| `candidate7@eramatch.com` | `candidate123` | Recorded video interview |

**What to test:**

1. Log in → go through eye-tracking calibration
2. Record a 60-120s response per question
3. Upload completes → AI processes in background (Whisper + Gemma3)
4. Check monitoring dashboard for transcript + score

#### Monitoring / Admin Access

The monitoring dashboard is at `/monitoring` and doesn't require a candidate login — access via the main recruiter panel.

---

## Overview

Candidate-related services are organized under `app/services/candidates/`. The same modular pattern should be applied to other service areas.

---

## Folder Structure

```
app/services/
├── candidates/
│   ├── __init__.py         # Package exports
│   ├── auth.py             # CandidateAuthService (login, token management)
│   ├── dashboard.py        # CandidateDashboardService (home, assessments)
│   └── candidate.py        # CandidateService (CRUD operations)
│
├── auth.py                 # AuthService (recruiter/admin authentication)
├── recruiter.py            # RecruiterService
├── admin.py                # AdminService
└── __init__.py             # Main services package exports
```

---

## Services in the Candidates Package

### 1. `auth.py` – CandidateAuthService

**Methods:**

- `login(email, password)` → Returns JWT tokens + candidate profile
- `get_current_candidate(token)` → Extracts candidate from JWT
- `refresh_tokens(refresh_token)` → Generate new access token

**Endpoints:** `POST /api/v1/candidate/login`, `POST /api/v1/candidate/refresh`

---

### 2. `dashboard.py` – CandidateDashboardService

**Methods:**

- `get_home(candidate_id)` → Returns profile, application, group, position data
- `get_assessments(candidate_id)` → Returns current status for stages

**Endpoints:** `GET /api/v1/candidate/home`, `GET /api/v1/candidate/assessments`

---

### 3. `candidate.py` – CandidateService

**Methods:** `create_candidate`, `get_candidate`, `update_candidate`, `list_candidates`, `create_application`, `list_applications`

---

## Database Changes

> See `backend/db_changes_log.md` for raw SQL logs of all DB operations run during this version.

### Password Hash Updates

- **Affected:** 311 candidates + dedicated test accounts
- **Default Password:** `candidate123`
- **Algorithm:** Bcrypt (12 rounds)

### pgbouncer Compatibility

- `app/db/session.py`: Added `statement_cache_size=0` and `prepared_statement_cache_size=0` for Supabase transaction-mode pooling.

### Primary Key Synchronization

ORM models aligned to actual DB column names:

| Model                  | Primary Key      |
| ---------------------- | ---------------- |
| `CandidateProfile`     | `candidate_id`   |
| `CandidateApplication` | `application_id` |
| `CandidateGroup`       | `group_id`       |
| `GroupStageConfig`     | `config_id`      |
| `Position`             | `position_id`    |

---

## API Endpoints

### Candidate Portal

| Endpoint                        | Method | Purpose                             | Auth          |
| ------------------------------- | ------ | ----------------------------------- | ------------- |
| `/api/v1/candidate/login`       | POST   | Login                               | Public        |
| `/api/v1/candidate/refresh`     | POST   | Refresh token                       | Refresh token |
| `/api/v1/candidate/me`          | GET    | Current profile                     | JWT           |
| `/api/v1/candidate/home`        | GET    | Dashboard home                      | JWT           |
| `/api/v1/candidate/assessments` | GET    | List stages                         | JWT           |
| `/api/v1/assessment/start`      | POST   | Start/resume assessment             | JWT           |
| `/api/v1/assessment/answer`     | POST   | Save an answer                      | JWT           |
| `/api/v1/assessment/run-code`   | POST   | Run code + all tests (counts trial) | JWT           |
| `/api/v1/assessment/submit`     | POST   | Submit + auto-grade                 | JWT           |

### AI-Service (Port 8001)

| Endpoint        | Method | Purpose           |
| --------------- | ------ | ----------------- |
| `/transcribe/`  | POST   | Whisper STT       |
| `/llm/evaluate` | POST   | Gemma3 evaluation |
| `/grade/essay`  | POST   | Essay grading     |

### Video Interview

| Endpoint                                      | Method | Purpose                 |
| --------------------------------------------- | ------ | ----------------------- |
| `/api/v1/interview/config`                    | GET    | Get questions config    |
| `/api/v1/interview/start`                     | POST   | Start session           |
| `/api/v1/interview/response`                  | POST   | Upload video response   |
| `/api/v1/interview/status/{session_id}`       | GET    | Check processing        |
| `/api/v1/interview/monitoring/candidates`     | GET    | All candidates progress |
| `/api/v1/interview/monitoring/responses/{id}` | GET    | Candidate responses     |

---

## Section 2 – AI Service

Standalone FastAPI microservice on port **8001**:

- **Whisper STT**: Transcribes candidate video responses
- **Ollama/Gemma3 LLM**: Evaluates answers against reference responses
- **Essay Grading**: Scores open-ended written answers (called during assessment submission)

```
Main Backend (:8000)    AI-Service (:8001)
     │                        │
     ├─ Video Upload           ├─ Whisper transcription
     ├─ Assessment Submit      ├─ Essay grading
     └─► POST /transcribe/ ───►│
         POST /llm/evaluate ──►│
         POST /grade/essay  ──►│
```

### Configuration (`.env`)

```env
USE_MOCK=false
OLLAMA_HOST=https://ollama.com
OLLAMA_API_KEY=your-api-key
OLLAMA_MODEL=gemma3:4b-cloud
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

---

## Section 3 – Technical Assessment Feature (New in this version)

### Logic Overview

The assessment system is config-driven. Each assessment is defined with **N sections**, each containing a pool of question variants. When a session starts:

1. The full assessment config is read from the DB (`assessments` + `assessment_sections` + `question_bank`)
2. For each section, exactly the configured number of questions are **randomly sampled** from that section's variant pool
3. The final question list is shuffled and saved to `ongoing_assessments.assigned_questions`
4. On reload/resume, the same assigned questions are restored — no reshuffling

### Session Lifecycle

```
start_assessment
   ↓ (checks for existing in_progress session first)
   ═══ RESUME if found (restores questions + saved answers + remaining timer)
   ═══ NEW SESSION if not found (samples questions, saves to DB)
   ↓
Candidate answers questions → POST /assessment/answer (upsert per question)
   ↓
Coding questions → POST /assessment/run-code
   ├─ Runs test cases via subprocess (Python/JS/etc.)
   ├─ Counts as a trial attempt (stored in answer_data.attempt_count)
   └─ Also saves answer to DB
   ↓
POST /assessment/submit
   ├─ Triggers auto_grade_answers()
   │   ├─ MCQ: graded immediately by correct_answer match
   │   ├─ Essay: sent to AI service → score + feedback
   │   └─ Coding: test results already saved, score from run-code
   ├─ Calculates total_points / max_points → total_score (percentage)
   └─ Updates ongoing_assessments + candidate_pipeline_progress
```

### Pre-Check Flow (Done Once Per Browser Session)

Steps shown before the assessment (camera test, mic test, rules, etc.) are stored in `sessionStorage` with key `assessment_checks_done`. They are only shown if that key is missing — meaning they run **once per browser tab session** and don't repeat on reload within the same tab.

### Coding Question "Run & Test" Button

The run-code button (`POST /assessment/run-code`) is the **"Final Answer"** mechanism for coding questions:

- Runs **all test cases** (not just sample), uses subprocess via supported language runtimes
- **Counts a trial attempt** (default max: 5), displayed as a counter on the button
- Saves the code + test results to the DB (full answer)
- The counter is persisted per question so it survives page reloads

### Monitoring Dashboard Fixes (Fixes #40, #76, #78)

Previously the monitoring dashboard showed duplicate question rows because it fetched answers across **all sessions** a candidate ever had (including abandoned ones from page refreshes). The fixed logic:

- **`GET /monitoring/assessment-candidates`**: Uses a CTE to select the **latest session per candidate** (scoped by most recent `submitted_at` or `started_at`), then counts answers only from that session
- **`GET /monitoring/assessment-responses/{id}`**: Uses a CTE to resolve the latest session, then joins `candidate_answers` against only that session
- **Score fields**: `total_points` = raw points earned, `total_score` = percentage (0-100). The monitoring DTO now correctly maps these separately

---

## Section 4 – Video Interview

### Flow

```
Candidate Portal (React)
    ↓
1. Start → Load questions from DB
2. Record Video (MediaRecorder, VP8, 250kbps)
3. Upload (XMLHttpRequest → real-time progress)
4. Backend saves to /static/uploads/
5. BackgroundTask → process_video_logic()
    ├─ POST /transcribe/ → AI-Service (Whisper)
    ├─ POST /llm/evaluate → AI-Service (Gemma3)
    └─ UPDATE interview_responses
6. Monitoring → Display transcript + score
```

### Database Tables

| Table                  | Purpose                            |
| ---------------------- | ---------------------------------- |
| `ai_interview_configs` | Interview questions per position   |
| `ongoing_interviews`   | Sessions                           |
| `interview_responses`  | Video URLs, transcripts, AI scores |

### New Table: `interview_responses`

| Column                  | Type    | Notes                                             |
| ----------------------- | ------- | ------------------------------------------------- |
| `response_id`           | UUID PK |                                                   |
| `session_id`            | UUID FK | → `ongoing_interviews`                            |
| `question_order`        | int     |                                                   |
| `video_url`             | text    | Path in `/static/uploads/`                        |
| `transcript`            | text    | Whisper output                                    |
| `transcript_confidence` | numeric | 0–1                                               |
| `ai_score`              | numeric | 0–100                                             |
| `ai_feedback`           | jsonb   | Detailed LLM feedback                             |
| `processing_status`     | varchar | `pending` / `processing` / `completed` / `failed` |

---

## CORS Configuration

**File:** `backend/app/main.py`

Previously used `allow_origins=["*"]` with `allow_credentials=True` — this is rejected by browsers. Fixed to explicit origins:

```python
allow_origins=[
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
]
```

---

## Running Services

| Service        | Port | Command                                     |
| -------------- | ---- | ------------------------------------------- |
| **Backend**    | 8000 | `uvicorn app.main:app --reload --port 8000` |
| **AI-Service** | 8001 | `uvicorn main:app --reload --port 8001`     |
| **Frontend**   | 5173 | `npm run dev`                               |

All 3 must be running for full functionality.
