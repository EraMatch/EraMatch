# Urgent Changes - Database & Code Updates

**Date:** 2026-02-16  
**Supabase Project ID:** `gcdvpmqmwagusenewrie`  
**Password (all candidates):** `test123` (bcrypt, rounds=10)

---

## Level 1: Database Schema Changes

### Tables Added (5 new)

- `group_pipeline_stages` — Replaces `group_stage_config` + `candidate_groups.filtration_flow`
- `candidate_pipeline_progress` — Replaces `candidate_stage_progress`
- `assessment_sections` — Replaces `assessments.structure` (flat JSONB)
- `section_question_pool` — Question variants per section, all reference `question_bank`
- `candidate_assigned_questions` — Tracks which question variant shown to which candidate (snapshot)

### Tables Modified (4 edits)

- `candidate_groups` — Removed `filtration_flow` column
- `assessments` — Removed `structure` column (now in `assessment_sections`)
- `question_bank` — Added `is_base_question`, `parent_question_id`, `quality_score`
- `candidate_answers` — Added `assignment_id` (FK to `candidate_assigned_questions`)

### Tables Removed (2 old)

- `group_stage_config` — Deleted after migration
- `candidate_stage_progress` — Deleted after migration

### Key Changes

- All questions now in `question_bank` (no inline questions)
- Assessments are templates (sections + QB references, not flat JSON)
- Each candidate gets random selection from pool + frozen snapshot
- Same pattern for all stages (Assessment, AI Interview, Live Interview)

---

## Level 2: Code (ORM Models) Changes

### Models Renamed/Fixed

- `GroupStageConfig` → `group_pipeline_stages` table (PK: `stage_id`)
- `CandidateStageProgress` → `candidate_pipeline_progress` table (PK: `progress_id`, FK: `stage_id`)

### Primary Keys Updated

- `ai_interview_configs`: `config_id` (was `id`)
- `ongoing_interviews`: `session_id` (was `id`)
- `interview_responses`: `response_id` (was `id`)

### Columns Added to Models

**`AIInterviewConfig`:**

- `think_time_seconds`, `answer_time_seconds`, `live_interview_context`

**`OngoingInterview`:**

- `technical_score`, `communication_score`, `confidence_score`, `ai_recommendation`

**`InterviewResponse`:**

- `question_text`, `audio_url`, `transcript_confidence`, `emotion_analysis`

### Backend SQL Fixes

- `candidate_interview.py` — Fixed 3 SQL queries (table names + pipeline progress update on `/complete`)
- `dashboard.py` — Fixed 6 SQL/ORM issues (table names, progress map keys, stage lookups)

### Frontend Fixes

- `InterviewMonitoringPage.tsx` — Auth token `'token'` → `'access_token'`, relative URLs → full backend URLs

---

## Data Seeded

- **40** `group_pipeline_stages` rows (1 AI interview stage per group)
- **41** `candidate_pipeline_progress` rows (status = `unlocked`)

---

## Configuration

**Database URL:** `postgresql+asyncpg://...` (async driver required)
