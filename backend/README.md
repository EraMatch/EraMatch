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

### Branch Structure

```
main              # Production releases only (protected)
  ↑
  │ (PR with review required)
  │
development       # Active development (default branch, protected)
  ↑
  │ (PR with review required)
  │
feat/*            # Feature branches from issues
fix/*             # Bug fix branches
design/*          # Architecture/design decisions
other/*           # Other tasks
regulation/*      # Code standards/refactoring
```

### Issue Labels

When creating an issue, use one of these labels:

```
feat        # New feature or enhancement
fix         # Bug fix
design      # architecture for smth, ui edits in design, new ideas need definition
other       # Generic tasks
regulation  # Standards, refactoring, documentation
```

**ZenHub Documentation:**
- **Always attach assets** (mockups, diagrams (reviiiisee them before), screenshots) to issues on ZenHub
- Use the same issue number when uploading files or adding links or any comment or want to save the data 
- Document design decisions or errors or any comment with screenshots if needed inside the thread 


example: feat/candidate-login #21 (the number is set automatically from github)

### Branch Naming

```
feat/{issue-number}-{short-description}    # New features
fix/{issue-number}-{short-description}     # Bug fixes
other/{issue-number}-{short-description}   # Other tasks

```

```

**Examples:**
- `feat/23-add-cv-parsing`
- `fix/45-login-validation`

### Workflow Steps

```bash
# 1. Always start from development (default branch)
git checkout development
git pull origin development # remember to fetch and pull before anything 

# 2. Create feature branch
git checkout -b feat/23-add-cv-parsing

# 3. Make changes and commit
git add .
git commit -m "feat: add CV parsing with Whisper integration #23" #  be descriptive 

# 4. Push to remote
git push origin feat/23-add-cv-parsing

# 5. Create Pull Request on GitHub
# - Target: development (not main!)
# - Link to issue #23
# - Request review from team

# 6. After approval, merge to development
# - Delete feature branch after merge

# 7. When ready for production release:
# - Create PR: development → main
# - Requires review
# - Merge to deploy
```

### Commit Message Format

Use this structure for commits:

```
feat: add new feature
fix: fix bug
other: general improvements
regulation: code standards/refactoring
```

**Examples:**
```bash
# Regular commits
git commit -m "feat: add CV parsing with Whisper"
git commit -m "regulation: update README with Git workflow"
git commit -m "fix: resolve login validation error"

# To auto-close issue when merged
git commit -m "fixes: resolve login validation error #45"
git commit -m "feat: add CV parsing #23"
```

**Note:** Adding `fixes: #issue-number` or `feat: #issue-number` will automatically close the issue when PR is merged.

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
