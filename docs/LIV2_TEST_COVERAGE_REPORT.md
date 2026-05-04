# Live Interview V2 Test Coverage Report

## Overview
- **Purpose**: Comprehensive assessment of test coverage for the Live Interview V2 (LiV2) feature.
- **Date**: Friday, May 01, 2026
- **Commit Hash**: d520a02 (Development)
- **Status**: ✅ Core pipeline verified | ⚠️ Infrastructure gaps identified

## Existing Test Suites

| File | Test Count | Coverage |
|------|------------|----------|
### Detailed Test List

#### Backend Integration Tests (`test_integration.py`)
- `test_token_dispatch_creates_session`
- `test_complete_session_with_transcript`
- `test_auto_verdict_mapping_is_consistent`
- `test_phase_c_score_deterministic`
- `test_home_shows_pipeline_stages`
- `test_token_dispatch_sets_in_progress`
- `test_double_complete_is_idempotent`
- `test_wrong_org_session_access_returns_forbidden`
- `test_wrong_org_group_sessions_returns_empty_or_forbidden`
- `test_empty_transcript_does_not_crash`
- `test_none_transcript_field_does_not_crash`

#### AI Firewall E2E Tests (`firewall_test.py`)
- `test_firewall_blocks_role_reversal`
- `test_firewall_flags_internal_queries`
- `test_firewall_allows_normal_answers`
- `test_firewall_blocks_delimiter_injection`
- `test_firewall_leak_detection_clean`
- `test_firewall_leak_detection_compromised`
- `test_firewall_leak_detection_flagged_turn`
- `test_firewall_sanitizes_angle_brackets`
- `test_firewall_sanitizes_triple_backticks`
- `test_firewall_strips_zero_width_chars`
- `test_firewall_process_returns_sanitized_text`

| **Total** | **22** | |

## Component Coverage Matrix

### Backend API (`live_interview_v2.py`)
| Endpoint | Tested | Notes |
|----------|:------:|-------|
| `POST /rubric/suggest-dimensions` | ❌ | AI suggestion service logic needs coverage. |
| `POST /rubric/generate-anchors` | ❌ | AI generation service logic needs coverage. |
| `POST /rubric` | ❌ | CRUD covered by manual testing, needs integration. |
| `GET /rubric/group/{group_id}` | ❌ | Needs automated verification. |
| `PUT /rubric/{rubric_id}` | ❌ | Needs automated verification. |
| `PUT /rubric/{rubric_id}/settings` | ❌ | Specific config update logic needs coverage. |
| `POST /rubric/{rubric_id}/freeze` | ❌ | Critical state transition needs automation. |
| `POST /bank/generate` | ❌ | AI generation service logic needs coverage. |
| `POST /bank` | ❌ | Needs integration coverage. |
| `GET /bank/group/{group_id}` | ❌ | Needs automated verification. |
| `PUT /bank/{bank_id}` | ❌ | Needs automated verification. |
| `POST /bank/{bank_id}/freeze` | ❌ | Critical state transition needs automation. |
| `GET /session/token` | ✅ | Verified in `TestTokenDispatch`. |
| `POST /session/{session_id}/complete` | ✅ | Verified in `TestCompleteSessionTriggersJudge`. |
| `GET /session/{session_id}` | ✅ | Verified in `TestWrongOrgScopeForbidden`. |
| `GET /group/{group_id}/sessions` | ✅ | Verified in `TestWrongOrgScopeForbidden`. |
| `GET /group/{group_id}/sessions-monitor` | ❌ | Timeline reconstruction logic needs verification. |

### Backend Services
- **`rubric.py`**: ❌ Untested in isolation (Service layer logic).
- **`bank.py`**: ❌ Untested in isolation.
- **`token.py`**: ✅ Covered via API integration tests.
- **`session.py`**: ✅ Covered via API integration tests.
- **`judge.py`**: ✅ Logic tested via `TestJudgeScoringConsistency`.

### Frontend Components
- **`LiveInterviewFlow.tsx`**: ❌ No automated E2E coverage.
- **`LiveInterviewRoom.tsx`**: ❌ No automated E2E coverage.
- **`EnhancedGroupOverviewV2.tsx`**: ❌ No automated E2E coverage.

### AI Service
- **`InterviewerAgent`**: ✅ State machine logic partially tested via transcript flows in integration tests.
- **`PromptFirewall`**: ✅ Extensively covered in `firewall_test.py`.
- **`Coverage Checker`**: ❌ Logic for sub-criteria detection remains untested.

## Gap Analysis
1. **Rubric/Bank Management API**: The entire flow of creating, updating, and freezing rubrics and question banks is currently missing from the automated test suite. These are critical for the "Recruiter-Side Flow".
2. **AI Generation Services**: Service functions that call LLMs for suggesting dimensions, generating anchors, and generating bank items are untested, relying on manual verification of LLM quality.
3. **Frontend Critical Paths**: No automated tests verify that the candidate can successfully join the LiveKit room or that recruiters can see real-time updates in the monitoring dashboard.
4. **Real-time Monitoring**: The `sessions-monitor` endpoint, which reconstructs event timelines from DB state, lacks verification for accuracy across different session states.

## New Test Infrastructure
- **`backend/tests/conftest.py`**: Centralized authentication fixtures providing `recruiter_client` and `candidate_client` with valid JWT tokens.
- **`backend/tests/live_interview_v2/fixtures.py`**: A library of 9 factory functions for generating valid request payloads for all LiV2 entities.
- **`backend/tests/live_interview_v2/conftest.py`**: Scoped configuration for LiV2 specific tests.

## Recommendations
1. **Priority 1**: Implement integration tests for the Rubric/Bank freeze lifecycle to ensure pipeline integrity.
2. **Priority 2**: Add unit tests with LLM mocking for `rubric.py` and `bank.py` service functions.
3. **Priority 3**: Develop Playwright E2E tests for the `LiveInterviewRoom` to verify WebRTC connection and agent interaction.
4. **Priority 4**: Add specific tests for the `sessions-monitor` endpoint to verify timeline event accuracy.
