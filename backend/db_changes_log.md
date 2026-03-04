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
