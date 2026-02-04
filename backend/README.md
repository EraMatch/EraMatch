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
│   ├── core/                 # App config, security, shared utilities
│   ├── db/                   # Database session and connection
│   ├── integrations/         # External service clients (AI, storage, etc)
│   ├── schemas/              # Pydantic schemas for models
│   ├── services/             # Business logic layer (main code logic) 
│   ├── utils/                # Helper functions
│   ├── models.py             # SQLModel ORM definitions (all tables)
│   └── main.py               # main app
├── worker/                   # Celery async tasks
└── docs/                     # API documentation
```

---

## Git Workflow

We use **feature branch workflow** with issue tracking.

 - **create issue with what u want, and ADD a deescription please, with franco even but just write what u made and if any workarround or internal issue document this in the thread of the issue please argook**

### Branch Naming

```
feat/{issue-number}-{short-description}    # New features
fix/{issue-number}-{short-description}     # Bug fixes
```

**Examples:**
- `feat/23-add-cv-parsing`
- `fix/45-login-validation`

### Workflow Steps

```bash
# 1. Create branch from main
git checkout main
git pull origin main # remember to fetch and pull before anything 
git checkout -b feat/23-add-cv-parsing

# 2. Make changes and commit
git add .
git commit -m "feat: add CV parsing with Whisper integration" #  be descriptive 

# 3. Push to remote
git push origin feat/23-add-cv-parsing

# 4. Create Pull Request on GitHub
# - Link to issue #23
# - Request review from team

# 5. After approval, merge to main
# - Delete feature branch after merge
```

### Commit Message Format

```
feat: add new feature
fix: fix bug
other: write what u want
```

---

## Environment Variables

Copy `.env.example` to `.env` and configure.

**See group chat for latest API keys. Update `.env.example` when you change it.**

```env
# Database
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=your-anon-key

# AI Providers (set at least one)
GOOGLE_API_KEY=your-gemini-key
GROQ_API_KEY=your-groq-key
OLLAMA_API_KEY=your-ollama-key

# Celery
CELERY_BROKER_URL=redis://localhost:6379/0
```

---

## Developer Instructions

For detailed coding guidelines, see [DEVELOPER.md](./DEVELOPER.md)
