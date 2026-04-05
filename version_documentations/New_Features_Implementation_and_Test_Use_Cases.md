# EraMatch New Features Implementation and Test Use Cases

Date: 2026-04-05

## Overview

This document describes the newly implemented features across Question Import, Review Prioritization, Background Task SLO Monitoring, and GitHub Analysis Trust metadata.

It also provides practical test use cases for functional validation by recruiters, QA, and developers.

---

## 1) Import UX Supercharge

### What was implemented

1. Spreadsheet preflight now returns auto-fix suggestions per invalid row.
2. Each suggestion includes:
   - row number
   - error reason
   - suggested fix
   - whether it is auto-fixable
3. Recruiter can enable one-click auto-fix before queueing import.
4. Deterministic importer applies auto-fixes for supported cases.
5. Applied fixes are persisted in import job stats and shown in review page.

### Current auto-fix rules

1. MCQ with exactly one option:
   - converted to essay automatically.
2. MCQ with invalid or missing correct answer:
   - correct answer is defaulted to option index 0.

### Key behavior

1. Manual issues are still retained as row errors.
2. Auto-fix is opt-in at queue time.
3. Review page shows an Auto-fix Applied summary block.

### Test use cases

#### Use case 1: Auto-fixable MCQ answer index

Precondition:
- Prepare CSV with valid MCQ options but invalid correct_answer (example: 99).

Steps:
1. Open Question Import modal.
2. Choose Import from Spreadsheet.
3. Upload file and wait for preflight.
4. Confirm auto-fix suggestions are shown.
5. Enable one-click auto-fix.
6. Start import and open review screen.

Expected result:
1. Question is not dropped.
2. Reviewer sees Auto-fix Applied summary.
3. Auto-fix count is greater than 0.
4. Fixed row appears in draft questions with a valid correct answer index.

#### Use case 2: Single-option MCQ conversion

Precondition:
- Prepare CSV with MCQ type and only one option.

Steps:
1. Upload through Spreadsheet preflight.
2. Enable auto-fix.
3. Start import and open review.

Expected result:
1. Row is converted to essay question.
2. Import no longer fails for that row.
3. Fix action is visible in auto-fix summary.

#### Use case 3: Non-fixable empty question text

Precondition:
- Prepare CSV with empty text cell.

Steps:
1. Run preflight.
2. Observe suggestions.
3. Enable auto-fix and continue.

Expected result:
1. Row remains invalid (manual fix needed).
2. Error remains in row validation table.
3. Suggestion is marked as manual.

---

## 2) Review Queue Intelligence

### What was implemented

1. Review queue supports priority mode selection:
   - Risk/Impact First
   - Chronological
2. Risk score badge is shown on each review card.
3. Backend import jobs listing is also risk-ranked (not strict time order).

### Risk signal inputs

1. Critic score and weighted critic score.
2. Needs review flag.
3. Difficulty level weighting.
4. Question type weighting.
5. Number of failed critic checks.

### Test use cases

#### Use case 1: High-risk question appears first

Precondition:
- Import a file containing mixed quality questions.

Steps:
1. Open review page.
2. Keep Queue Priority on Risk/Impact First.
3. Observe top cards.

Expected result:
1. Low-quality or flagged questions appear near top.
2. Risk badges show higher values for those questions.

#### Use case 2: Switch back to chronological

Steps:
1. In review page, switch to Chronological.

Expected result:
1. Card order returns to original import sequence.
2. No data loss, only ordering changes.

#### Use case 3: Jobs list prioritization

Steps:
1. Trigger multiple import jobs with varying flagged counts.
2. Open jobs list endpoint consumer screen.

Expected result:
1. Higher-risk jobs rank earlier than low-risk completed jobs.

---

## 3) Stronger Alerting and SLOs

### What was implemented

1. New background task SLO health endpoint provides 24-hour metrics.
2. Monitored pipelines:
   - question import
   - GitHub analysis
   - transcription
3. Metrics per pipeline include:
   - p95 latency
   - average latency
   - error rate
   - backlog size
4. Alerts are generated when thresholds are exceeded.
5. Background Tasks dashboard now shows alert panel.
6. Video task worker marks failed status on exceptions for correct error-rate accounting.

### Current thresholds

Question Import:
1. p95 latency threshold: 180 seconds
2. error rate threshold: 0.08
3. backlog threshold: 12

GitHub Analysis:
1. p95 latency threshold: 240 seconds
2. error rate threshold: 0.12
3. backlog threshold: 10

Transcription:
1. p95 latency threshold: 150 seconds
2. error rate threshold: 0.10
3. backlog threshold: 15

### Test use cases

#### Use case 1: SLO healthy state

Steps:
1. Open Background Tasks dashboard.
2. Ensure recent jobs mostly complete successfully.

Expected result:
1. Green stable message appears.
2. No high-severity alerts are shown.

#### Use case 2: Error-rate alert

Steps:
1. Force repeated failures in one pipeline (for example by temporarily breaking a dependent service in test env).
2. Refresh dashboard.

Expected result:
1. Alert panel appears with pipeline and metric details.
2. Error rate actual value exceeds threshold.

#### Use case 3: Latency alert

Steps:
1. Run intentionally heavy jobs to exceed normal completion times.
2. Refresh SLO panel.

Expected result:
1. p95 latency alert appears with threshold comparison.

---

## 4) GitHub Analysis Trust Upgrade

### What was implemented

1. Repository-level confidence metadata from relevance tournament.
2. Confidence includes selected repository confidence and ranked candidate list.
3. Explicit fallback reasons for contribution-source downgrades.
4. Freshness metadata added:
   - fetched_at
   - last_successful_fetch_at
   - source_freshness_hours
   - freshest_event_at where applicable
5. Candidate profile API exposes trust metadata.
6. Recruiter GitHub tab displays confidence and freshness section.

### Trust model behavior

1. If GraphQL is available with token:
   - source is GraphQL
   - fallback reason is null
2. If GraphQL fails or unavailable:
   - fallback to public events
   - fallback reason explains why

### Test use cases

#### Use case 1: Normal token-based run

Precondition:
- Valid GitHub token configured.

Steps:
1. Run GitHub analysis for a candidate.
2. Open candidate GitHub tab.

Expected result:
1. Repository Confidence and Source Freshness card appears.
2. Selected repo and confidence percentage are visible.
3. Source is GraphQL when available.

#### Use case 2: Fallback path validation

Precondition:
- Run analysis without token or with restricted token.

Steps:
1. Start GitHub analysis.
2. Open candidate GitHub tab after completion.

Expected result:
1. Contribution source shows events_public.
2. Fallback reason is shown.
3. Freshness fields are populated.

#### Use case 3: Freshness staleness visibility

Steps:
1. Analyze a low-activity profile.
2. Check source_freshness_hours and freshest_event_at.

Expected result:
1. Freshness values reflect older activity windows.
2. Recruiter can interpret lower recency confidence.

---

## Recommended QA Execution Order

1. Run Import UX Supercharge cases first.
2. Validate Review Queue Intelligence ordering and toggles.
3. Validate SLO endpoint and dashboard alert rendering.
4. Validate GitHub trust metadata in both normal and fallback modes.

---

## Regression Checks

1. Existing import flow still works when auto-fix is disabled.
2. Approve import behavior remains unchanged for selected draft questions.
3. Background tasks stop and delete operations still function.
4. Candidate GitHub tab remains usable when trust metadata is missing.

---

## Notes for Test Data Preparation

1. Create at least 3 spreadsheet fixtures:
   - clean template file
   - partially broken auto-fixable file
   - non-fixable file with empty text rows
2. Create at least 2 GitHub candidate fixtures:
   - active account with many recent events
   - low-activity account with sparse recent events
3. Maintain one environment with token and one without token for fallback tests.
