# EraMatch - Recruiter Portal

Admin and Recruiter app for managing projects, candidates, and evaluations.

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (runs on port 5173)
npm run dev
```

## URLs
- **App**: http://localhost:5173
- **Backend**: http://localhost:8000 (start separately)

## Routes

### Admin Routes
| Route | Description |
|-------|-------------|
| `/admin/login` | Admin login |
| `/admin/dashboard` | Admin dashboard |
| `/admin/members` | Organization members |
| `/admin/settings` | Admin settings |
| `/admin/delegation` | Recruiter delegation |
| `/admin/subscription` | Subscription management |

### Recruiter Routes
| Route | Description |
|-------|-------------|
| `/recruiter/login` | Recruiter login |
| `/recruiter/dashboard` | Recruiter dashboard |
| `/recruiter/projects` | Projects management |
| `/recruiter/candidates` | Candidates list |
| `/recruiter/question-bank` | Question bank |
| `/recruiter/group/:id` | Group overview |
