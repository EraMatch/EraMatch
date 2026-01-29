# EraMatch - AI-Powered Recruitment Platform

A modern recruitment platform with AI-powered assessments, interviews, and candidate evaluation.

## Project Structure

```
EraMatch/
├── Frontend/                    # Frontend applications
│   ├── candidate-portal/        # Candidate-facing app (port 5174)
│   ├── recruiter-portal/        # Admin + Recruiter app (port 5173)
│   └── backend/                 # Mock FastAPI backend (port 8000)
└── backend/                     # Real backend (to be implemented)
```

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.9+
- npm or yarn

### 1. Start Mock Backend
```bash
cd Frontend/backend
pip install fastapi uvicorn pandas
uvicorn main:app --reload
```

### 2. Start Recruiter Portal
```bash
cd Frontend/recruiter-portal
npm install
npm run dev
```

### 3. Start Candidate Portal
```bash
cd Frontend/candidate-portal
npm install
npm run dev
```

## URLs

| Service | URL | Description |
|---------|-----|-------------|
| Recruiter Portal | http://localhost:5173 | Admin & Recruiter login |
| Candidate Portal | http://localhost:5174 | Candidate assessments |
| Backend API | http://localhost:8000 | Mock API server |
| API Docs | http://localhost:8000/docs | Swagger documentation |

## Features

- **AI-Powered Interviews** - Live and recorded AI interviews
- **Technical Assessments** - Coding tests with anti-cheating
- **Candidate Management** - Track and evaluate candidates
- **Role-Based Access** - Admin, Recruiter, and Candidate portals
- **Analytics Dashboard** - Recruitment metrics and insights

## Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Radix UI
- **Mock Backend**: FastAPI (Python)
- **Charts**: Recharts
- **Routing**: React Router v7
