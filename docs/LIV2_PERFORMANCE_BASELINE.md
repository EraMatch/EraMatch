# LiV2 Performance Baseline

> **Status**: Template — actual measurements require running backend.
> Run `./start.sh` then execute the performance tests in Task 14 to fill in values.

## Environment

| Parameter | Value |
|-----------|-------|
| Commit | `d1e6313` (template - update after measurements) |
| Date | TBD |
| Machine | TBD (local dev / CI) |
| Backend | FastAPI + PostgreSQL (Supabase) |
| AI Service | FastAPI + Whisper + Ollama (gemma3:12b-cloud) |
| LiveKit | Cloud-hosted |
| Python | 3.11 |
| Node | 18+ |

## How to Re-Run Measurements

### Token Dispatch (Session Creation)
```bash
# Start timing for token endpoint
time curl -s -X GET "http://localhost:8000/api/v1/live-interview-v2/session/token?application_id=APPLICATION_ID&group_id=GROUP_ID" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Judge Pipeline
```bash
# After a session completes, measure evaluation time
time curl -s -X POST "http://localhost:8000/api/v1/live-interview-v2/session/SESSION_ID/complete" \
  -H "Authorization: Bearer $TOKEN" | jq .
```

### Full E2E Flow
```bash
# Use the E2E test suite with timing
cd backend
time pytest tests/e2e/test_live_interview_v2.py -v --tb=short 2>&1 | tee /tmp/e2e_timing.log
```

## Performance Baselines

### Backend API Endpoints

| Endpoint | p50 | p95 | p99 | Sample Size | Notes |
|----------|-----|-----|-----|-------------|-------|
| `POST /rubric` | TBD | TBD | TBD | TBD | Rubric creation |
| `PUT /rubric/{id}/settings` | TBD | TBD | TBD | TBD | Settings update |
| `POST /rubric/{id}/freeze` | TBD | TBD | TBD | TBD | Freeze operation |
| `POST /bank` | TBD | TBD | TBD | TBD | Bank creation |
| `POST /bank/{id}/freeze` | TBD | TBD | TBD | TBD | Freeze operation |
| `GET /session/token` | TBD | TBD | TBD | TBD | Token dispatch |
| `POST /session/{id}/complete` | TBD | TBD | TBD | TBD | Session completion |
| `GET /group/{id}/sessions-monitor` | TBD | TBD | TBD | TBD | Session monitoring |

### AI Service Endpoints

| Endpoint | p50 | p95 | p99 | Sample Size | Notes |
|----------|-----|-----|-----|-------------|-------|
| `POST /rubric/suggest-dimensions` | TBD | TBD | TBD | TBD | LLM-backed dimension suggestion |
| `POST /rubric/generate-anchors` | TBD | TBD | TBD | TBD | LLM-backed anchor generation |
| `POST /bank/generate` | TBD | TBD | TBD | TBD | LLM-backed question generation |

### LiveKit Agent

| Metric | p50 | p95 | p99 | Sample Size | Notes |
|--------|-----|-----|-----|-------------|-------|
| Agent join time | TBD | TBD | TBD | TBD | Time from dispatch to agent in room |
| First greeting latency | TBD | TBD | TBD | TBD | Time from agent join to first speech |
| Turn-taking latency | TBD | TBD | TBD | TBD | Time from candidate speech end to AI response |
| STT processing time | TBD | TBD | TBD | TBD | Whisper transcription latency |
| Session completion time | TBD | TBD | TBD | TBD | Time from end signal to evaluation saved |

### Judge Pipeline

| Metric | p50 | p95 | p99 | Sample Size | Notes |
|--------|-----|-----|-----|-------------|-------|
| Dimension scoring | TBD | TBD | TBD | TBD | Per-dimension scoring time |
| Overall evaluation | TBD | TBD | TBD | TBD | Full judge pipeline time |
| Verdict generation | TBD | TBD | TBD | TBD | Final verdict computation |

## Regression Thresholds

| Metric | Baseline | Warning (2x) | Critical (3x) | Action |
|--------|----------|-------------|----------------|--------|
| Token dispatch | TBD | TBD | TBD | Check LiveKit connectivity |
| Judge pipeline | TBD | TBD | TBD | Check Ollama availability |
| Agent join time | TBD | TBD | TBD | Check LiveKit Cloud health |
| First greeting | TBD | TBD | TBD | Check TTS initialization |

## Concurrent Load

| Concurrent Sessions | Token Success Rate | Avg Latency | Max Latency | Error Rate |
|--------------------|--------------------|-------------|-------------|------------|
| 1 | TBD | TBD | TBD | TBD |
| 3 | TBD | TBD | TBD | TBD |
| 5 | TBD | TBD | TBD | TBD |
| 10 | TBD | TBD | TBD | TBD |

## Variance Notes

- Token dispatch latency includes LiveKit token generation + DB session creation
- Judge pipeline depends on Ollama model responsiveness (varies with model load)
- Agent join time depends on LiveKit Cloud infrastructure
- STT processing time depends on audio length and Whisper model

## Related Documents

- [Debug Runbook](./LIV2_DEBUG_RUNBOOK.md) — Failure scenarios and fixes
- [Test Coverage Report](./LIV2_TEST_COVERAGE_REPORT.md) — Test suite coverage