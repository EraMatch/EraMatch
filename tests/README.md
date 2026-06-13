# EraMatch Test Suite

API-level integration tests against a running backend stack. All tests hit
`http://localhost:8000` directly — no mocking, no test DB — so the full
service stack (FastAPI, Celery, Redis, AI service, Ollama) must be up before
running.

---

## Quick Start

```bash
# Start everything
cd EraMatch
bash start-dev.sh

# Wait ~15s for services to come up, then:
cd ..   # back to Main_Dev/

# Recruiter-view (most comprehensive)
pytest EraMatch/tests/recruiter-view/unit_testing/testing_functionality/ -v -s

# Candidate-view
pytest EraMatch/tests/candidate-view/unit_testing/testing_functionality/ -v -s

# Admin-view
pytest EraMatch/tests/admin-view/unit_testing/testing_functionality/ -v -s

# Cross-role E2E
pytest EraMatch/tests/e2e/ -v -s

# All suites at once
pytest EraMatch/tests/ -v -s
```

---

## Prerequisites

### Services

| Service | Port | Required for |
|---|---|---|
| Backend API | 8000 | All tests |
| Redis | 6379 | Celery tasks (CV parse, scoring) |
| Celery worker (backend) | — | CV ingestion, scoring, QAG |
| AI service | 8001 | AI rubric suggestion, scoring |
| Celery worker (AI) | — | Async CV parse |
| Ollama | 11434 | LLM-based tests (tolerant) |

Start with `bash EraMatch/start-dev.sh`. For manual startup see `CLAUDE.md → Dev Commands`.

### Credentials (seeder sets all org users to this password)

| Role | Email | Password |
|---|---|---|
| Admin | `admin_1@eramatch.com` | `admin12345` |
| HR | `hr@eramatch.com` | `admin12345` |
| Tech Recruiter | `tech@eramatch.com` | `admin12345` |
| Candidate | `c1.strong@example.com` | `admin12345` |

### Sample CV PDFs (E2E full-flow test only)

The full E2E test imports real PDF CVs to exercise the CV parsing pipeline.
Place at least 3 PDF files here:

```
Main_Dev/sample_pdfs/*.pdf
```

Path is configured in `tests/recruiter-view/conftest.py:SAMPLE_CVS_DIR`.
If the directory or PDFs are missing the E2E test is **skipped** (not failed).

### Question Bank (auto-seeded)

`test_e2e_full_flow.py` uses the `seed_qb_questions` fixture, which
automatically seeds 5 MCQ + 3 essay questions on first run if the bank has
fewer than 3 of either type. No manual step needed.

### Active Project (auto-created if missing)

The `approved_project_id` conftest fixture looks for an active/approved
project. If none exists it creates one via the admin client. No manual step
needed as long as the admin token works.

### Seeded Groups G-A through G-E (seeded tests only)

`test_seeded_gd_review_mode` and `test_seeded_ge_results` rely on groups
that represent different pipeline states. Create them with:

```bash
cd EraMatch/backend
python -m app.utils.seeds.seed_five_states         # create G-A … G-E
python -m app.utils.seeds.validate_liv2_seed       # optional sanity check
```

Tests marked `@pytest.mark.seeded` skip gracefully when the seeder has not
been run. To reset G-A (the live-testbed group) to a clean config-NULL state:

```bash
python -m app.utils.seeds.seed_five_states --reset
```

---

## Suite Map

### `recruiter-view/` — HR + Tech Recruiter API

Conftest: `tests/recruiter-view/conftest.py`

Session fixtures:

| Fixture | Description |
|---|---|
| `client` | httpx.Client with HR token |
| `tech_client` | httpx.Client with Tech Recruiter token |
| `admin_headers` | Auth headers for Admin calls |
| `approved_project_id` | ID of an active project (auto-creates if none) |
| `hr_user_id` | User ID of the HR account |
| `tech_user_id` | User ID of the Tech Recruiter account |
| `upload_headers` | Auth header without Content-Type (multipart file upload) |
| `sample_cv_paths` | List of PDF paths from `sample_pdfs/` (skips if empty) |
| `seed_qb_questions` | Seeds MCQ + essay questions if bank is sparse |

#### Unit / functional tests

| File | Covers |
|---|---|
| `test_recruiter_login.py` | Auth token flow, refresh, logout |
| `test_recruiter_projects.py` | Project CRUD, status transitions, approval routing |
| `test_recruiter_positions.py` | Position creation, JD keywords, QAG trigger/approve |
| `test_recruiter_candidates.py` | Candidate listing, score/skill filtering |
| `test_recruiter_candidate_details.py` | Profile tab, score breakdown, integrity flags |
| `test_recruiter_candidate_import.py` | CV ZIP upload, ingestion job polling |
| `test_recruiter_group_management.py` | Group CRUD, filtration_flow, stage row creation |
| `test_recruiter_assessments.py` | Assessment CRUD, section pool, QB linking |
| `test_assessment_config_full.py` | All 3 question types (MCQ/essay/coding), QB reference, AI variants |
| `test_recruiter_stage_monitoring.py` | Stage start/close state machine, monitoring endpoint shape |
| `test_recruiter_applications.py` | Bulk progress (pass/hold/reject), pipeline transitions |
| `test_recruiter_question_bank.py` | QB CRUD, import jobs, draft approval |
| `test_coding_generation.py` | Coding question AI generation via question-import pipeline |
| `test_recruiter_ai_features.py` | AI rubric suggestion, LiV2 dimension suggestion, suggest-anchors |
| `test_recruiter_analytics.py` | Position insights, group score distributions |
| `test_recruiter_approvals.py` | Approval request creation, admin approve/reject |
| `test_recruiter_notifications.py` | Notification list, mark-read |
| `test_recruiter_settings.py` | User settings, permission checks |
| `test_recruiter_filter_templates.py` | Saved filter template CRUD |

#### E2E tests

**`test_e2e_recruiter_pipeline.py`** — short pipeline test

Covers the core path end-to-end in a single function:
- HR creates position → JD keywords → QAG generate + approve (tolerant)
- CV ZIP import → poll until candidates appear → dual-score verification
- Create group → set filtration_flow → start assessment stage

**`test_e2e_full_flow.py`** — comprehensive pipeline test

Covers every stage of the recruiter + tech journey including all configuration
flavours. Prerequisite fixtures run automatically: `seed_qb_questions`
(question bank), `approved_project_id` (auto-creates project if needed).

```
PHASE 1   HR creates position + JD keywords + QAG approve (tolerant)
PHASE 2   CV import → dual-score verification (semantic > 0 guard)
PHASE 3   Candidate filtering by score and skill
PHASE 4   Group creation + filtration_flow → stage rows asserted not_started

PHASE 5a  Assessment — mixed question sources
  Section 1  Manual: MCQ pool (3 questions) + essay + coding (inline)
  Section 2  Question Bank MCQ: GET /questions → map to QuestionCreate shape
  Section 2b Question Bank essay (same flow)
  Section 3  AI MCQ variants: POST /questions/generate-variants
  Section 3b AI essay variants (same)
  → POST /assessments with all sections → has_config=True asserted

PHASE 5b  Video interview (AIInterviewConfig, type=recorded)
  Per-question AI rubric suggestion via POST /recruiter/ai/suggest-question-rubric
  Human revision step: normalise to 10 checks × weight=0.1, reword first check
  Assign with revised rubric → POST /groups/{gid}/interviews/assign
  Replace-config flow: reassign while stage is not_started
  → has_config=True asserted for ai_interview stage

PHASE 5c  Live Interview V2 — full AI wizard (manual fallback at every step)
  suggest-dimensions  → POST /live-interview-v2/rubric/suggest-dimensions
  generate-anchors    → POST /live-interview-v2/rubric/generate-anchors
  create rubric       → POST /live-interview-v2/rubric
  freeze rubric       → POST /live-interview-v2/rubric/{id}/freeze  (state=frozen asserted)
  generate bank (AI)  → POST /live-interview-v2/bank/generate
  save bank           → POST /live-interview-v2/bank
  freeze bank         → POST /live-interview-v2/bank/{id}/freeze  (state=frozen asserted)
  → has_config=True asserted for live_interview stage

PHASE 6   Assessment stage lifecycle
  start → state=active asserted → monitoring shape → bulk-progress preview
  close → state=closed asserted → bulk-progress (pass)

PHASE 7   Video interview stage lifecycle
  start → state=active asserted → close → state=closed asserted → bulk-progress

PHASE 8   LiV2 stage lifecycle
  start → state=active asserted → close → state=closed asserted → bulk-progress

PHASE 9   Score breakdowns (skill_alignment, experience_alignment, keyword_coverage)
PHASE 10  Send offers → POST /groups/{gid}/offers/send

Seeded-data tests  (require seed_five_states.py, mark: @pytest.mark.seeded)
  test_seeded_gd_review_mode — G-D group: assessment closed, score breakdowns, bulk-preview
  test_seeded_ge_results     — G-E group: all 3 stages closed, monitoring shape, breakdowns
```

---

### `candidate-view/` — Candidate portal API

Conftest: `tests/candidate-view/conftest.py`

Session fixtures: `client` (candidate token), `raw_client` (unauthenticated)
Login: `c1.strong@example.com` / `admin12345` (email fallback in auth service)

| File | Covers |
|---|---|
| `test_candidate_login.py` | Auth: login by email, invalid creds, token refresh |
| `test_candidate_dashboard.py` | Home page: current stage status, group info |
| `test_candidate_assessment.py` | Assessment start, per-question answer, submit |
| `test_candidate_interview.py` | Recorded interview start, response upload, complete |
| `test_candidate_full_cycle.py` | Full journey: login → assessment → submit |
| `test_assessment_score_calculation.py` | Unit-level: score formula, pass/fail, MCQ grading (no HTTP) |
| `test_coding_questions.py` | Coding question display and time limit |
| `test_coding_solve_simulation.py` | Simulates answer submission for coding sections |
| `test_coding_submission_flow.py` | Submit flow, auto-grade, points_earned |
| `test_judge_grading_logic.py` | G-Eval rubric scoring: criteria_scores shape, weighted sum |
| `test_recorded_interview_api.py` | InterviewResponse API shapes |
| `test_recorded_interview_pipeline.py` | Full pipeline: Whisper STT → G-Eval → score update |
| `test_live_interview_judge_output.py` | LiV2 evaluation: dimension_scores, auto_verdict shape |

---

### `admin-view/` — Admin portal API

Conftest: `tests/admin-view/conftest.py`

Session fixtures: `client` (admin token)
Login: `admin_1@eramatch.com` / `admin12345`

| File | Covers |
|---|---|
| `test_admin_login.py` | Admin auth, token validation |
| `test_admin_dashboard.py` | Org-level stats, project counts |
| `test_admin_organization_members.py` | Member listing, role management |
| `test_admin_recruiter_delegation.py` | Role handoff and delegation flow |
| `test_admin_requests.py` | Approval queue: approve/reject projects and positions |
| `test_admin_closed_positions.py` | Closed position listing and archiving |
| `test_admin_group_insights.py` | Group analytics, stage completion rates |
| `test_admin_settings.py` | Org settings, subscription plan |

---

### `e2e/` — Cross-role integration tests

| File | Covers |
|---|---|
| `test_live_interview_v2.py` | Full LiV2 happy path: candidate login → session token → transcript submit → judge pipeline → recruiter fetches evaluation |
| `test_time_budget.py` | LiV2 time budget enforcement: sessions exceeding budget are auto-capped |

---

## Design Principles

**Tolerant vs firm**

AI/async steps (QAG, CV parse, LLM generation, rubric suggestion) never fail
the run on outage. They log `[tolerant]` and fall back to manual data. Pure
API state transitions (`not_started → active → closed`, `has_config`, HTTP
status codes) are always hard-asserted.

**No mocking**

Tests call the real backend and real DB. Fixtures ensure data exists; no
service behaviour is stubbed out.

**Cleanup**

The full E2E test deletes the position and group it created in a `finally`
block. Seeded groups (G-A … G-E) are intentionally preserved between runs.

**Idempotency**

`seed_qb_questions` checks existing counts before inserting. Safe to run
multiple times. The seeder's `--reset` flag is the only thing that removes
seeded data.

---

## Common Failures

| Symptom | Cause |
|---|---|
| `401` on every test | Wrong password — seeder sets all org users to `admin12345` |
| Candidate login `401` | Candidate has no `username` set; auth service falls back to email (fixed in `candidates/auth.py`) |
| E2E skipped "No sample CVs" | Put PDF files in `Main_Dev/sample_pdfs/` |
| `has_config` assertion fails on assessment | `GroupStageConfig.config_id` not set on assessment create — Bug A1 |
| `has_config` assertion fails on LiV2 | `freeze_bank` does not bind `config_id` — Bug L1 |
| Seeded tests skip | Run `python -m app.utils.seed_five_states` from `EraMatch/backend/` |
| All AI tolerant steps log failure | Ollama / AI service down — E2E still passes, only AI steps warn |
| Celery tasks stuck pending | Redis not running — `redis-cli ping` should return `PONG` |
| macOS worker crash (SIGABRT) | Backend Celery must use `--pool=threads`, not default prefork |
