# Candidates Services Folder - README




## Issues working on:
>  1, 3, 13



## Overview

I moved candidate-related services have been organized into the `app/services/candidates/`, make this in other modules too 

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
└── __init__.py            # Main services package exports
```

---

## Services in the Candidates Package

### 1. `auth.py` - CandidateAuthService

**Purpose:** Handle candidate authentication and authorization

**Methods:**
- `login(email, password)` → Returns JWT tokens + candidate profile
- `get_current_candidate(token)` → Extracts candidate from JWT
- `refresh_tokens(refresh_token)` → Generate new access token

**Used By:**
- `POST /api/v1/candidate/login`
- `POST /api/v1/candidate/refresh`
- Dependency: `get_current_candidate` in `app/api/deps.py`

---

### 2. `dashboard.py` - CandidateDashboardService

**Purpose:** Provide dashboard data for candidate portal

**Methods:**
- `get_home(candidate_id)` → Returns profile, application, group, position data
- `get_assessments(candidate_id)` → Returns current status for stages 

**Used By:**
- `GET /api/v1/candidate/home`
- `GET /api/v1/candidate/assessments`

---

### 3. `candidate.py` - CandidateService

**Purpose:** CRUD operations for candidate profiles and applications

**Methods:**
- `create_candidate(data)` → Create new candidate profile
- `get_candidate(candidate_id)` → Get candidate by ID
- `update_candidate(candidate_id, data)` → Update candidate profile
- `list_candidates(filters)` → List candidates with filtering
- `create_application(candidate_id, position_id, data)` → Create job application
- `list_applications(candidate_id)` → List candidate's applications

**Used By:**
- `POST /api/v1/candidates`
- `GET /api/v1/candidates/{id}`
- `PATCH /api/v1/candidates/{id}`
- `GET /api/v1/candidates`
- `POST /api/v1/candidates/{id}/applications`
- `GET /api/v1/candidates/{id}/applications`

**Database Models:**
- `CandidateProfile`
- `CandidateApplication`

---

## How to Import

### In API routes:

```python
# Old way 
from app.services.candidate_auth import CandidateAuthService
from app.services.dashboard import CandidateDashboardService

# New way 
from app.services.candidates import CandidateAuthService, CandidateDashboardService

# Or import the package and use dot notation
from app.services import candidates

service = candidates.CandidateAuthService(db)
```

### In other services:

```python
from app.services.candidates import CandidateAuthService
```

### From main services package:

```python
# This also works due to __init__.py exports
from app.services import CandidateAuthService, CandidateDashboardService, CandidateService
```


---

## Related API Routes

### File: `app/api/v1/candidate_portal.py`

**Endpoints using candidates services:**

| Endpoint | Service | Method |
|----------|---------|--------|
| `POST /login` | CandidateAuthService | `login()` |
| `POST /refresh` | CandidateAuthService | `refresh_tokens()` |
| `GET /me` | via dependency | `get_current_candidate()` |
| `GET /home` | CandidateDashboardService | `get_home()` |
| `GET /assessments` | CandidateDashboardService | `get_assessments()` |

---

### File: `app/api/v1/candidates.py`

**Endpoints using CandidateService:**

| Endpoint | Method |
|----------|--------|
| `POST /candidates` | `create_candidate()` |
| `GET /candidates` | `list_candidates()` |
| `GET /candidates/{id}` | `get_candidate()` |
| `PATCH /candidates/{id}` | `update_candidate()` |
| `POST /candidates/{id}/applications` | `create_application()` |
| `GET /candidates/{id}/applications` | `list_applications()` |

---

## Frontend Integration

### Frontend Services Using These Endpoints

**File:** `Frontend/candidate-portal/src/services/auth.service.ts`
- Calls: `POST /api/v1/candidate/login`
- Backend service: `CandidateAuthService.login()`

**File:** `Frontend/candidate-portal/src/services/candidate.service.ts`
- Calls: `GET /api/v1/candidate/home` → `CandidateDashboardService.get_home()`
- Calls: `GET /api/v1/candidate/assessments` → `CandidateDashboardService.get_assessments()`
- Calls: `GET /api/v1/candidate/profile` → Should use `/me` endpoint

---


## Database edits

### 1. Password Hash Updates
**Operation:** Updated all existing candidate profiles with valid bcrypt hashes.
- **Affected Records:** 311 candidates.
- **Password:** `candidate123` (default).
- **Hash Algorithm:** Bcrypt (12 rounds).
- **Column:** `candidate_profiles.password_hash`.

### 2. Connection Logic (pgbouncer)
**File:** `app/db/session.py`
- Added `statement_cache_size=0` and `prepared_statement_cache_size=0`.
- **Reason:** Ensuring compatibility with Supabase's pgbouncer (transaction mode), which doesn't support prepared statements.

---

## Edits Done on Models Layer (`app/models.py`)

Significant updates were made to synchronize the `SQLModel` definitions with the actual Supabase database schema, particularly regarding primary key column names.

### 1. Primary Key Synchronization
Changed the primary key field from `id` to the specific name used in the DB for several core models:

| Model | New Primary Key Field | Matches DB Column |
|-------|-----------------------|-------------------|
| `CandidateProfile` | `candidate_id` | `candidate_id` |
| `CandidateApplication` | `application_id` | `application_id` |
| `CandidateGroup` | `group_id` | `group_id` |
| `GroupStageConfig` | `config_id` | `config_id` |
| `Position` | `position_id` | `position_id` |

### 2. Field Additions
- **`CandidateProfile`**: Added `password_hash` and `avatar_url` fields.
- **`CandidateApplication`**: Updated foreign key references (`candidate_id`, `position_id`, `group_id`) to point to the correct column names.

---

## Technical Flow Summary

1. **Authentication:** Uses direct `bcrypt` library (avoiding passlib compatibility issues).
2. **Dashboard queries:** Implemented using **Raw SQL** in `dashboard.py` to bypass SQLModel metadata complexity and potential column naming conflicts during multi-table joins.

-------------

# Section 2 - AI-Service (Separate Microservice)

## Overview
Standalone FastAPI service on port **8001** handling AI-powered video processing:
- **Whisper STT**: Transcribes candidate responses
- **Ollama LLM**: Evaluates answers against reference responses

## Architecture

```
Main Backend (:8000)          AI-Service (:8001)
     │                              │
     ├─ Video Upload               ├─ Whisper (faster-whisper)
     ├─ BackgroundTask             ├─ Ollama LLM (Gemma3:4b)
     │                              │
     └─► POST /transcribe/  ────────┤
         POST /llm/evaluate ────────┤
                                    │
                              Returns: transcript, score, feedback
```

## Candidate Portal API Endpoints

Complete list of endpoints added for the candidate portal and video interview feature:

| Endpoint | Method | Purpose | Authentication |
|----------|--------|---------|----------------|
| `/api/v1/candidate/login` | POST | Candidate login with email/password | Public |
| `/api/v1/candidate/refresh` | POST | Refresh access token | Refresh token |
| `/api/v1/candidate/me` | GET | Get current candidate profile | JWT required |
| `/api/v1/candidate/home` | GET | Dashboard home data (profile, application, group) | JWT required |
| `/api/v1/candidate/assessments` | GET | List available stages/assessments | JWT required |
| `/api/v1/interview/config` | GET | Get interview questions config | JWT required |
| `/api/v1/interview/start` | POST | Start new interview session | JWT required |
| `/api/v1/interview/response` | POST | Submit video response (multipart) | JWT required |
| `/api/v1/interview/status/{session_id}` | GET | Check processing status | JWT required |
| `/api/v1/interview/monitoring/candidates` | GET | List all candidates with progress | JWT required |
| `/api/v1/interview/monitoring/responses/{candidate_id}` | GET | Get candidate's interview responses | JWT required |

### AI-Service Endpoints (Port 8001)

| Endpoint | Method | Purpose | Called By |
|----------|--------|---------|-----------|
| `/transcribe/` | POST | Whisper STT transcription | Backend worker |
| `/llm/evaluate` | POST | Gemma3 LLM evaluation | Backend worker |


## Configuration (`.env`)
```env
USE_MOCK=false
OLLAMA_HOST=https://ollama.com
OLLAMA_API_KEY=your-api-key
OLLAMA_MODEL=gemma3:4b-cloud
WHISPER_MODEL=small
WHISPER_DEVICE=cpu
WHISPER_COMPUTE_TYPE=int8
```

## Running
```bash
cd ai-service
uv run uvicorn main:app --reload --port 8001
```

**See:** `ai-service/README.md` for local model setup guide.

------

# Section 3 - Candidate Video-Based Interview

## Implementation Overview

Full end-to-end pipeline for AI-powered video interviews with real-time upload progress and background processing.

## Flow

```
Candidate Portal (React)
    ↓
1. Start Interview → Load questions from DB
2. Record Video (MediaRecorder API)
    ├─ VP8 codec, 250kbps (small files)
    └─ Max 120s per question
3. Upload via FormData (multipart/form-data)
    └─ Real-time progress tracking (XMLHttpRequest)
4. Backend saves to /static/uploads/
5. BackgroundTask → process_video_logic()
    ├─ POST /transcribe/ → AI-Service
    ├─ POST /llm/evaluate → AI-Service
    └─ UPDATE interview_responses (transcript, score, feedback)
6. Monitoring Page → Display results
```

## Key Components

### Frontend (`RecordedInterviewFlow.tsx`)
- **MediaRecorder**: VP8 codec, 250kbps bitrate (~3.75MB for 120s)
- **Real-time Progress**: XMLHttpRequest with upload event listeners
- **Eye Tracking Calibration**: Pre-interview game for focus detection
- **State Management**: React hooks for recording/uploading states

### Backend (`candidate_interview.py`)
- **Endpoint**: `POST /api/v1/interview/response`
- **Upload Handler**: Accepts `multipart/form-data` (video blob + metadata)
- **Storage**: Saves to `static/uploads/{session_id}_{question_order}.webm`
- **Processing**: FastAPI `BackgroundTasks` (not Celery for MVP)

### Worker (`worker/tasks/video.py`)
- **Function**: `process_video_logic(response_id, video_url, question, reference)`
- **Steps**:
  1. Call AI-Service `/transcribe/` → Get transcript
  2. Call AI-Service `/llm/evaluate` → Get score & feedback
  3. Update DB: `transcript`, `ai_score`, `ai_feedback`, `processing_status='completed'`

### Monitoring (`monitoring.py`)
- **Endpoint**: `GET /api/v1/interview/monitoring/candidates`
- **Deduplication**: Uses `DISTINCT ON` to show latest session per candidate
- **Real-time Updates**: Displays processing status (pending → processing → completed)

## Database Tables

| Table | Purpose |
|-------|---------|
| `ai_interview_configs` | Stores questions for positions |
| `ongoing_interviews` | Tracks interview sessions |
| `interview_responses` | Stores video URLs, transcripts, AI scores |

## Optimizations

1. **Video Compression**: 250kbps bitrate = ~10x smaller files
2. **Real Upload Progress**: Replaced `fetch` with `XMLHttpRequest`
3. **Background Processing**: Non-blocking video analysis
4. **Static File Serving**: Direct video access via `/static/uploads/`

## Tech Stack
- **Frontend**: React, Vite, Tailwind CSS
- **Backend**: FastAPI, SQLAlchemy, BackgroundTasks
- **Storage**: Local disk (`static/uploads/`)
- **Processing**: AI-Service (Whisper + Gemma3)

---- 

# Section 4 - Database Schema Changes

## New Table: `interview_responses`

Added to track video submissions and AI processing results.

**Columns:**
- `response_id` (UUID, PK)
- `session_id` → FK to `ongoing_interviews`
- `question_order` (int)
- `question_text` (text)
- `video_url` (text) - Path to uploaded video
- `transcript` (text) - Whisper output
- `transcript_confidence` (numeric) - 0-1 score
- `ai_score` (numeric) - 0-100 evaluation score
- `ai_feedback` (jsonb) - Detailed LLM feedback
- `processing_status` (varchar) - `pending`, `processing`, `completed`, `failed`
- `answered_at` (timestamp)

## Modified Tables

### `ongoing_interviews`
- Added `session_id` column for linking responses
- Changed `id` to use custom primary key

### `ai_interview_configs`
- Updated `questions` column to JSONB for structured data
- Added `time_limit` per question

## Indexes Added
```sql
CREATE INDEX idx_responses_session ON interview_responses(session_id);
CREATE INDEX idx_responses_status ON interview_responses(processing_status);
```

## Migration Notes
- **Password hashes**: All `candidate_profiles` updated with bcrypt hashes (password: `Test123!`)
- **Primary keys**: Aligned ORM models with DB column names (e.g., `candidate_id` not `id`)
- **pgbouncer compatibility**: Disabled prepared statements in connection string

---

# Running the Full Application

## Prerequisites
- Python 3.11+
- Node.js 18+
- PostgreSQL (Supabase)
- Ollama Cloud account (or local Ollama)

## Quick Start

### 1. Backend (Port 8000)
```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### 2. AI-Service (Port 8001)
```bash
cd ai-service
uv sync
uv run uvicorn main:app --reload --port 8001
```

### 3. Frontend (Port 5173)
```bash
cd Frontend/candidate-portal
npm install
npm run dev
```

## Environment Setup

**Backend** (`.env`):
```env
DATABASE_URL=postgresql+asyncpg://user:pass@host/db
SECRET_KEY=your-secret-key
AI_SERVICE_URL=http://localhost:8001
```

**AI-Service** (`.env`):
```env
OLLAMA_HOST=https://ollama.com
OLLAMA_API_KEY=your-key
WHISPER_MODEL=small
USE_MOCK=false
```

**Frontend** (`.env`):
```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## Test Credentials
**Email**: `test1@eramatch.com` (through `test10@eramatch.com`)  
**Password**: `Test123!`

See `test_credentials.md` for full list.

---

## 3 Running Services

| Service | Port | Purpose |
|---------|------|---------|
| **Backend** | 8000 | Main API, authentication, data operations |
| **AI-Service** | 8001 | Whisper transcription + LLM evaluation |
| **Frontend** | 5173 | React candidate portal |

All services must be running for video interview feature to work.