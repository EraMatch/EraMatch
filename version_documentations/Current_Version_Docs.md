# EraMatch Current Version Docs

## Summary

This document reflects the current state after the stage-config consistency fix.

The main correction was to make `group_pipeline_stages.config_id` the actual source of truth for configurable group stages:

- `assessment` -> `assessments.assessment_id`
- `ai_interview` -> `ai_interview_configs.config_id`
- `live_interview` -> `live_interview_configs.config_id`

Before this fix, the system was split:

- candidate-side runtime mostly read `group_pipeline_stages.config_id`
- some recruiter/backend paths stored config references inside `acceptance_criteria`

That mismatch caused stage configuration drift.

## Cloud Database Changes

Live database actions were applied on Supabase project `gcdvpmqmwagusenewrie`.

Full log:

- [CLOUD_DB_CHANGE_LOG.md]

Applied migrations:

- `backfill_group_stage_config_links`
- `enforce_group_stage_config_integrity`

### What changed in the database

1. Safe backfill of missing `group_pipeline_stages.config_id`

- `assessment` stages were backfilled from group-linked assessments when that linkage could be inferred safely
- `ai_interview` stages were backfilled from legacy JSON references in `acceptance_criteria`
- `live_interview` stages were backfilled only when live sessions clearly pointed to one config

2. Cleanup of obsolete JSON config references

- removed `interview_config_id`
- removed `assessment_id`

3. Integrity guardrails

- added a partial unique index for non-inactive `(group_id, stage_type)` rows
- added a trigger that enforces:
  - active configurable stages must have `config_id`
  - `config_id` must point to the correct config table for the stage type

### Database result

- active configurable stages with null `config_id`: `0`
- legacy JSON config references in `acceptance_criteria`: `0`

Some historical non-active rows still have null `config_id`. They were left unresolved when auto-filling would have required unsafe guesses.

## Recruiter Backend Changes

Main backend service:

- [group.py](/c:/AnasUni/Grad/EraMatch/backend/app/services/group.py)

### 1. Group details now read real stage linkage

`get_group_details()` now:

- reads config links from `group_pipeline_stages.config_id`
- loads stage-linked assessments instead of relying on `assessments.group_id` alone
- loads stage-linked AI interview configs
- loads stage-linked live interview configs

This fixes the old behavior where recruiter details could show configs that were not actually attached to the group stage.

### 2. Stage start now unlocks candidates instead of auto-starting them

`start_stage()` now:

- requires a real config for configurable stages before start
- skips rejected/withdrawn/hired applications
- creates or updates candidate stage progress as `unlocked`
- no longer treats recruiter stage start as candidate session start

This matches the intended flow:

1. recruiter starts the stage
2. candidate becomes `unlocked`
3. candidate actually starts and becomes `in_progress`

### 3. Interview assignment now writes `config_id`

`assign_interview()` now:

- attaches configs directly to `group_pipeline_stages.config_id`
- stops relying on `acceptance_criteria["interview_config_id"]`
- handles recorded interview and live interview as separate stage targets
- supports live configs through `live_interview_configs`

### 4. Interview deletion now clears stage linkage

`delete_interview()` now:

- clears `group_pipeline_stages.config_id` if the stage points to the deleted config
- also removes any leftover legacy JSON config reference

### 5. Live interview scheduling no longer falls back silently

`schedule_live_interview()` now:

- requires the group live stage to already have a valid config
- does not auto-pick or auto-create an unrelated fallback config

## Assessment Service Changes

Main file:

- [assessments.py](/c:/AnasUni/Grad/EraMatch/backend/app/services/assessments.py)

### What changed

Assessment create/update/delete now synchronizes the group assessment stage:

- create -> attaches created assessment to the group assessment stage `config_id`
- update -> keeps that linkage aligned
- delete -> clears the stage `config_id` if it points to that assessment

This removes the old drift where an assessment could exist for a group but the stage row still had no config link.

## Candidate Runtime Changes

Main file:

- [candidate_interview.py](/c:/AnasUni/Grad/EraMatch/backend/app/api/v1/candidate_interview.py)

### What changed

Candidate AI interview flow now:

- only reads configs for stages that are actually `unlocked` or `in_progress`
- resumes existing interview sessions when applicable
- marks candidate stage progress as `in_progress` when the candidate starts

This aligns interview runtime with the assessment runtime pattern.

## Recruiter Frontend Changes

Main files:

- [recruiter.service.ts](/c:/AnasUni/Grad/EraMatch/Frontend/recruiter-portal/src/services/recruiter.service.ts)
- [UnifiedAIInterviewSetup.tsx](/c:/AnasUni/Grad/EraMatch/Frontend/recruiter-portal/src/components/recruiter/interviews/UnifiedAIInterviewSetup.tsx)

### What changed

- recruiter frontend now sends `live` as `live`, instead of rewriting it to `live_ai`
- live interview setup now correctly reopens existing live configs
- live interview duration prefill now uses backend-returned duration fields correctly

## Candidate Dashboard Change

Main file:

- [dashboard.py](/c:/AnasUni/Grad/EraMatch/backend/app/services/candidates/dashboard.py)

### What changed

Candidate dashboard stage titles now resolve live interview titles from `live_interview_configs` instead of using a hardcoded label only.

## Remaining Follow-up

There is one known ambiguous historical live stage that still needs a manual decision:

- group `f74349bd-5f38-4c48-a4c0-0f4aea329429`

That group had multiple live config IDs associated with its history, so it was not auto-corrected aggressively.

## Verification Done

- Python syntax check passed for the edited backend files using `python -m py_compile`
- live DB verification confirmed:
  - active configurable stages with null `config_id`: `0`
  - trigger and index exist

## Current Contract

From this version onward, the system should be read as:

- `group_pipeline_stages` defines the group flow and stage order
- `group_pipeline_stages.config_id` defines which config belongs to that stage
- `acceptance_criteria` stores pass/evaluation rules only
- candidate runtime and recruiter backend both resolve stage configs from the same place

---

## Candidate Portal Fixes (March 2026)

### Overview
Fixed multiple issues in the candidate assessment and video interview features.

### Assessment Fixes

#### 1. MCQ Grading Bug Fix
**File:** `backend/app/api/v1/candidate_assessment.py`

**Problem:** MCQ questions stored `correct_answer` as JSON `{"correct_option": "c"}` but grading logic expected `correct_index`.

**Fix:** Updated grading logic to parse JSON format and compare against selected option letter.

#### 2. Coding Test Runner Redesign
**File:** `backend/app/api/v1/candidate_assessment.py`

**Problem:** Coding test runner couldn't execute function-based solutions.

**Fix:** Redesigned runner to:
- Parse test cases from `input` field (newline-separated)
- Support function-based execution (extract function name and call it)
- Handle multiple test cases with separate execution contexts
- Return detailed results with pass/fail status and execution time

#### 3. Language Auto-Detection
**File:** `Frontend/candidate-portal/src/components/AssessmentSession.tsx`

**Fix:** Added language detection based on question metadata for code editor.

#### 4. Timer with Heartbeat Sync
**File:** `Frontend/candidate-portal/src/components/AssessmentSession.tsx`

**Fix:**
- Added 30-second heartbeat sync with backend
- Implemented periodic auto-save of answers every 60 seconds

### Video Interview Fixes

#### 1. Rubric Pass-Through to AI Evaluation
**Files:** `backend/app/api/v1/candidate_interview.py`, `backend/worker/tasks/video.py`, `ai-service/routers/llm.py`, `ai-service/routers/evaluate.py`

**Fix:** Backend extracts and passes rubric to video processing worker, which passes it to AI service for evaluation.

#### 2. Session Handling Fixes
**File:** `backend/app/api/v1/candidate_interview.py`

**Fix:**
- Fixed session discovery to find sessions with `not_started` status
- Update session status to `in_progress` when found

#### 3. Monitoring Page Fixes
**File:** `backend/app/routers/monitoring.py`

**Fix:**
- Added `not_started` status to filter so candidates appear in monitoring
- Fixed question ordering (1-based indexing instead of 0-based)
- Added rubric to essay question response data

#### 4. Frontend UI Improvements
**File:** `Frontend/candidate-portal/src/components/RecordedInterviewFlow.tsx`

**Fix:**
- Added stop button functionality to test recording
- Changed submit button to show "Submit Interview" on last question
- Fixed dropdown styling with proper arrows
- Added refresh device button
- Added multiple detection methods for OBS Virtual Camera

#### 5. Video URL Fix
**File:** `Frontend/candidate-portal/src/components/InterviewMonitoringPage.tsx`

**Fix:** Fixed video URL to point to backend (port 8000) instead of frontend (port 5174).

#### 6. AI Processing Timeouts
**File:** `backend/worker/tasks/video.py`

**Fix:** Increased transcription timeout from 120s to 300s, evaluation timeout from 60s to 120s.

---

## Test Credentials

### Assessment Candidates
| Email | Name |
|-------|------|
| james.rodriguez@eramatch-test.com | James Rodriguez |
| lucas.wagner@eramatch-test.com | Lucas Wagner |
| michael.okafor@eramatch-test.com | Michael Okafor |
| priya.sharma@eramatch-test.com | Priya Sharma |
| sofia.petrov@eramatch-test.com | Sofia Petrov |
| yuki.tanaka@eramatch-test.com | Yuki Tanaka |

**Password:** `test123`

### Video Interview Candidates
| Email | Name |
|-------|------|
| liam.nguyen@eramatch-test.com | Liam Nguyen |
| aisha.bakari@eramatch-test.com | Aisha Bakari |
| amara.diop@eramatch-test.com | Amara Diop |
| carlos.mendez@eramatch-test.com | Carlos Mendez |
| david.osei@eramatch-test.com | David Osei |
| mei.lin@eramatch-test.com | Mei Lin |
| nathan.brooks@eramatch-test.com | Nathan Brooks |
| roberto.rossi@eramatch-test.com | Roberto Rossi |

**Password:** `test123`
