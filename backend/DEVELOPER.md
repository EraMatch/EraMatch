# Developer Instructions

Guidelines for the EraMatch development team.

## Creating Issues

Before starting work, create an issue on GitHub:

**Issue Labels:**
```
feat        # New feature or enhancement
fix         # Bug fix
other       # General tasks, improvements
regulation  # Code standards, refactoring, documentation
```

**Issue Requirements:**
- Write a clear description (even in franco/arabic is fine)
- Document what you're doing
- If you hit workarounds or internal issues, document them in the issue thread
- Link related issues if any

**Example:**
```
Title: [feat] Add CV parsing with Whisper
Label: feat

Description:
Need to add CV parsing using Whisper model.
- Parse uploaded PDF/DOCX files
- Extract text and structure
- Store in database

Workarounds:
- Using base model for now (faster)
- Will upgrade to large model later
```

---

## How to Add Code

### Adding a New API Endpoint

```
1. Create route in app/api/v1/{resource}.py (or use existing one - recommended at start)
2. Add schema in app/schemas/{resource}.py (request/response)
3. Add service in app/services/{module}/{resource}.py (e.g., services/candidates/auth.py)
4. Register router in app/api/v1/router.py 
```

**Example:**
```python
# app/api/v1/candidates.py
@router.post("/")
async def create_candidate(data: CandidateCreate, session: SessionDep):
    service = CandidateService(session)
    return await service.create(data)

# app/services/candidate.py
class CandidateService:
    async def create(self, data: CandidateCreate):
        # Your DB queries here
        candidate = CandidateProfile(**data.dict())
        self.session.add(candidate)
        await self.session.commit()
        return candidate
```

---

### Adding a New LLM Provider

```
1. Open app/integrations/llm.py
2. Add provider to LLMProvider type
3. Implement _get_{provider}_llm() function
4. Add API key to app/core/config.py
```

---

### Adding a Background Task

```
1. Create task in worker/tasks/{task_name}.py
2. Register in worker/celery_app.py (include list)
3. Call from service: task_name.delay(args)
```

---

## Code Style Guidelines

### Comment Formatting

Use this format to separate sections in your code:

```python
# =========================================================
# Separate sections with "==="

'''-------------- Write new topic -----------------------'''

async def your_function():
    # Your code here
    pass
```

### Import Organization

```python
# move the imports to top of file to avoid circular imports till we find a better flow 
import whisper
import asyncio
from ultralytics import YOLO
import numpy as np
import cv2

# Then your code
async def transcribe_audio(audio_path):
    model = whisper.load_model("base")
    # ...
```

---

## Architecture Flow

```
┌──────────┐     ┌──────────────┐     ┌────────────────┐
│  Route   │────▶│   Service    │────▶│  Integration   │────▶ External API
│ (HTTP)   │     │ (Logic)      │     │ (HTTP Client)  │     (Gemini, etc)
└──────────┘     └──────────────┘     └────────────────┘
```

**Key Points:**
- **Routes**: Handle HTTP requests/responses only
- **Services**: Business logic, database queries, validation
- **Integrations**: External API calls (AI, storage, etc)

**Example:**
```python
# In service
from app.integrations.llm import get_llm

class CVService:
    async def analyze_cv(self, cv_text: str):
        llm = get_llm("gemini")
        result = await llm.ainvoke(f"Analyze this CV: {cv_text}")
        return result
```

---

## Database Models

All models are in `app/models.py` (37 tables).

**We'll split this later - for now keep everything there.**

```python
from app.models import CandidateProfile, Position, Assessment

# Use SQLModel for queries
candidate = await session.get(CandidateProfile, candidate_id)
```

---

## Testing Your Changes

```bash
# Run dev server
uvicorn app.main:app --reload

# Test endpoint
curl http://localhost:8000/api/v1/health

# Check Swagger docs
open http://localhost:8000/docs
```

---

## Common Issues

### Environment Variables
- Never commit `.env` file
- Update `.env.example` when adding new variables (don't forget)
- share el keys fe el chat 
