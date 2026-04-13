# DB Changes Log — Assessment Flow Fix

**Project**: `gcdvpmqmwagusenewrie`  
**Date**: 2026-02-28  
**Session**: Fix assessment flow E2E

---

## 1. DELETE — Bad ai_interview progress rows

```sql
DELETE FROM candidate_pipeline_progress
WHERE stage_id = 'df61e25e-5c50-4eb7-b374-01f3d0b67c7f';
```

**Reason**: 4 candidates had `unlocked` progress on ai_interview stage that was `not_started`. Logically inconsistent.  
**Rows affected**: 4

## 2. INSERT — 7 auth users

```sql
INSERT INTO auth.users (id, email, ...) VALUES
  ('aaaa0001-...' to 'aaaa0007-...',  'candidate2@eramatch.com' to 'candidate8@eramatch.com')
```

**Reason**: Seed test candidates with known password (same hash as test1@eramatch.com).

## 3. INSERT — 7 candidate profiles

```sql
INSERT INTO candidate_profiles (candidate_id, organization_id, email, full_name, ...)
-- Bob Martinez, Carol Williams, David Chen, Emily Davis, Frank Thompson, Grace Kim, Henry Wilson
```

## 4. INSERT — 7 candidate applications

```sql
INSERT INTO candidate_applications (application_id, candidate_id, position_id, group_id, organization_id, status, ...)
-- All in Main Pipeline group (b57e93a2), position Senior Backend Engineer (6992107e), status 'in_pipeline'
```

## 5. INSERT — 13 assessment pipeline progress rows

```sql
INSERT INTO candidate_pipeline_progress (progress_id, application_id, stage_id, status, unlocked_at)
SELECT gen_random_uuid(), ca.application_id, 'c0c0c0c0-...', 'unlocked', NOW()
FROM candidate_applications ca WHERE ca.group_id = 'b57e93a2-...' AND NOT EXISTS (...)
```

**Reason**: All 14 candidates in Main Pipeline group now have `unlocked` progress on the active assessment stage.  
**1 already existed** (test1@eramatch.com), **13 new** rows created.

---

## 2026-04-12 — Live Interview V2: Create 4 new tables

**Reason**: New AI-powered live video interview feature requires dedicated tables separate from existing human interview tables (`live_interview_configs`, `live_interview_sessions`).  
**Tables created**: `li_v2_rubrics`, `li_v2_banks`, `li_v2_sessions`, `li_v2_evaluations`

**SQL**:
```sql
CREATE TABLE li_v2_rubrics (
    rubric_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id        UUID NOT NULL REFERENCES candidate_groups(group_id),
    organization_id UUID NOT NULL REFERENCES organizations(organization_id),
    version         INT NOT NULL DEFAULT 1,
    dimensions      JSONB NOT NULL DEFAULT '[]',
    state           VARCHAR(20) NOT NULL DEFAULT 'draft',
    time_budget_minutes INT NOT NULL DEFAULT 30,
    created_at      TIMESTAMPTZ DEFAULT now(),
    frozen_at       TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES organization_users(user_id)
);

CREATE TABLE li_v2_banks (
    bank_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rubric_id       UUID NOT NULL REFERENCES li_v2_rubrics(rubric_id),
    group_id        UUID NOT NULL REFERENCES candidate_groups(group_id),
    organization_id UUID NOT NULL REFERENCES organizations(organization_id),
    version         INT NOT NULL DEFAULT 1,
    items           JSONB NOT NULL DEFAULT '[]',
    state           VARCHAR(20) NOT NULL DEFAULT 'draft',
    created_at      TIMESTAMPTZ DEFAULT now(),
    frozen_at       TIMESTAMPTZ,
    created_by_user_id UUID REFERENCES organization_users(user_id)
);

CREATE TABLE li_v2_sessions (
    session_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    UUID NOT NULL REFERENCES candidate_profiles(candidate_id),
    application_id  UUID NOT NULL REFERENCES candidate_applications(application_id),
    group_id        UUID NOT NULL REFERENCES candidate_groups(group_id),
    organization_id UUID NOT NULL REFERENCES organizations(organization_id),
    rubric_id       UUID NOT NULL REFERENCES li_v2_rubrics(rubric_id),
    bank_id         UUID NOT NULL REFERENCES li_v2_banks(bank_id),
    room_name       VARCHAR(255),
    state           VARCHAR(20) NOT NULL DEFAULT 'pending',
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    duration_seconds INT,
    context_pool    JSONB,
    recording_url   VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE li_v2_evaluations (
    evaluation_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES li_v2_sessions(session_id),
    organization_id     UUID NOT NULL REFERENCES organizations(organization_id),
    overall_score       NUMERIC,
    overall_score_pct   INT,
    auto_verdict        VARCHAR(20),
    meets_criteria      BOOLEAN,
    coverage_ratio      NUMERIC,
    per_question_results JSONB,
    dimension_scores    JSONB,
    auto_tags           JSONB,
    integrity_flags     JSONB,
    evaluation_confidence VARCHAR(10),
    judged_at           TIMESTAMPTZ
);
```

**Rows affected**: 0 (DDL only, no data)

---

## Phase 5 — Live Interview V2 Config Fields
**Date**: 2026-04-13
**Apply in**: Supabase SQL Editor → gcdvpmqmwagusenewrie

```sql
-- Add interview config fields to li_v2_rubrics
ALTER TABLE li_v2_rubrics
  ADD COLUMN IF NOT EXISTS language VARCHAR(5) NOT NULL DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS include_weak_topics BOOLEAN NOT NULL DEFAULT FALSE;

-- Add agent context snapshot to li_v2_sessions
ALTER TABLE li_v2_sessions
  ADD COLUMN IF NOT EXISTS context_pool JSONB;

COMMENT ON COLUMN li_v2_rubrics.language IS 'Interview language code (en|ar).';
COMMENT ON COLUMN li_v2_rubrics.include_weak_topics IS 'If true, agent receives candidate weak assessment topics as context.';
COMMENT ON COLUMN li_v2_sessions.context_pool IS 'JSONB snapshot of context injected into agent at session start.';
```

**Rows affected**: 0 (DDL only)
