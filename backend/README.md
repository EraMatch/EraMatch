# EraMatch Backend

FastAPI backend for the EraMatch recruitment platform.

## Quick Start

```bash
# Install dependencies
pip install -e .

# Run dev server
uvicorn app.main:app --reload

# Run Celery worker
celery -A worker.celery_app worker --loglevel=info
```

---

## Folder Structure

```
backend/
├── app/                      # Main FastAPI application
│   ├── api/                  # HTTP routes (endpoints)
│   │   └── v1/               # routes
│   ├── core/                 # App config, security, shared utilities
│   │   └── config.py         # Environment settings (DB, Redis, API keys....)
│   ├── db/                   # Database session and connection
│   ├── integrations/         # External service clients (AI, storage, etc)
│   │   ├── llm.py            # LLM providers (Gemini, Ollama, Groq ....)
│   │   ├── embeddings.py     # Embedding models for semantic search
│   │   └── models.py         # Local ML models (YOLO, Whisper) - placeholder
│   ├── schemas/              # Pydantic schemas for models
│   ├── services/             # Business logic layer (main code logic) 
│   ├── utils/                # Helper functions
│   ├── models.py             # SQLModel ORM definitions (all tables for now till we divide)
│   └── main.py               # main app
├── worker/                   # Celery async tasks
│   ├── celery_app.py         # celery configs
│   └── tasks/                # Background task definitions
│       └── video.py          # Video processing tasks
└── docs/                     # API documentation
```

---

## How to Add Code

### Adding a New API Endpoint

```
1. Create route in app/api/v1/{resource}.py (or use a one from here now (i reccomend this in start))
2. Add schema in app/schemas/{resource}.py (request/response)
3. Add service in app/services/{resource}.py (business logic) (write the logic and code, your querying will be here too)
4. Register router in app/api/v1/router.py 
```

### Adding a New LLM Provider

```
1. Open app/integrations/llm.py
2. Add provider to LLMProvider type
3. Implement _get_{provider}_llm() function
4. Add API key to app/core/config.py
```

### Adding a Background Task

```
1. Create task in worker/tasks/{task_name}.py
2. Register in worker/celery_app.py (include list)
3. Call from service: task_name.delay(args)
```

### Code Style Guidelines

**Comment Formatting:**
```python
# =========================================================
# Separate sections with "==="

'''-------------- Write new topic -----------------------'''

async def your_function():
    # Your code here
    pass
```

---

## Flow: Service → Integration → External API

```
┌──────────┐     ┌──────────────┐     ┌────────────────┐
│  Route   │────▶│   Service    │────▶│  Integration   │────▶ External API
│ (HTTP)   │     │ (Logic)      │     │ (HTTP Client)  │     (Gemini, and maybe an external service for us too if we deployed externally)
└──────────┘     └──────────────┘     └────────────────┘
```

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

## Environment Variables

Copy `.env.example` to `.env` and configure:

"See out group for latest versions, and update the env.example when u change it.."

```env
# Database
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-anon-key

# AI Providers (set at least one)
GOOGLE_API_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key
OPENAI_API_KEY=your-openai-key
OLLAMA_API_KEY=your-ollama-key

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
```
