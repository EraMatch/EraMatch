from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import os
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel

app = FastAPI()

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

def read_csv(filename: str):
    file_path = os.path.join(DATA_DIR, filename)
    if not os.path.exists(file_path):
        return []
    df = pd.read_csv(file_path)
    df = df.where(pd.notnull(df), None)
    return df.to_dict(orient="records")

def write_csv(filename: str, data: List[Dict]):
    file_path = os.path.join(DATA_DIR, filename)
    df = pd.DataFrame(data)
    df.to_csv(file_path, index=False)

class EmployeeRegistrationRequest(BaseModel):
    email: str
    password: str
    firstName: str
    lastName: str
    title: str

@app.get("/")
def read_root():
    return {"message": "EraMatch API is running"}

# --- Auth Endpoints ---

class LoginRequest(BaseModel):
    email: str
    password: str

@app.post("/auth/login")
def login(request: LoginRequest):
    # In a real app, check against database. Here we use hardcoded check for demo as requested,
    # but now it's server-side.
    if request.email == "admin@eramatch.com" and request.password == "admin123":
        return {
            "token": "mock-jwt-token-admin",
            "user": {
                "name": "Admin User",
                "role": "Admin",
                "email": request.email
            }
        }
    raise HTTPException(status_code=401, detail="Invalid credentials")

# --- Admin Endpoints ---

@app.get("/admin/stats")
def get_admin_dashboard_stats():
    return {
        "totalCandidates": 12543,
        "activeJobs": 45,
        "placementRate": 88,
        "avgTimetoHire": 18,
        "efficiency": 92,
        "activeRecruiters": 12,
        "openPositions": 24,
        "interviewsConducted": 156,
        "pipelineData": [
            { "stage": 'Applied', "count": 1245, "percentage": 100, "color": '#6366f1' },
            { "stage": 'Screening', "count": 856, "percentage": 68, "color": '#8b5cf6' },
            { "stage": 'Assessment', "count": 423, "percentage": 49, "color": '#a855f7' },
            { "stage": 'Interview', "count": 187, "percentage": 44, "color": '#c084fc' },
            { "stage": 'Offer', "count": 64, "percentage": 34, "color": '#10b981' },
            { "stage": 'Hired', "count": 45, "percentage": 70, "color": '#059669' }
        ],
        "revenue": {
            "current": 125000,
            "target": 150000,
            "growth": 15
        }
    }

@app.get("/admin/performance")
def get_recruiter_performance():
    return [
        {"name": "Sarah J.", "hires": 12, "efficiency": 94, "active": 8},
        {"name": "Mike C.", "hires": 15, "efficiency": 91, "active": 12},
        {"name": "Emily R.", "hires": 9, "efficiency": 88, "active": 6},
        {"name": "David K.", "hires": 11, "efficiency": 85, "active": 9},
        {"name": "Jessica M.", "hires": 8, "efficiency": 92, "active": 7}
    ]

@app.get("/admin/requests")
def get_pending_requests():
    return [
        {
            "id": 1,
            "type": 'recruiter_access',
            "requesterName": 'John Doe',
            "requesterEmail": 'john.doe@company.com',
            "requestedRole": 'Technical Recruiter',
            "requestedAt": '2025-01-20',
            "status": 'pending',
            "message": 'I would like access to manage technical positions for the engineering team.'
        },
        {
            "id": 2,
            "type": 'position_creation',
            "requesterName": 'Sarah Johnson',
            "requesterEmail": 'sarah.j@company.com',
            "requestedRole": 'HR Recruiter',
            "requestedAt": '2025-01-19',
            "status": 'pending',
            "message": 'Requesting permission to create new positions for Q1 hiring.'
        },
        {
            "id": 3,
            "type": 'data_export',
            "requesterName": 'Michael Chen',
            "requesterEmail": 'mchen@company.com',
            "requestedRole": 'Admin',
            "requestedAt": '2025-01-18',
            "status": 'approved',
            "message": 'Need to export candidate data for compliance audit.'
        }
    ]

@app.get("/admin/subscription")
def get_subscription_plans():
    return {
        "currentPlan": {
            "name": 'Professional',
            "price": 299,
            "billingCycle": 'monthly',
            "startDate": '2025-01-01',
            "nextBillingDate": '2025-02-01',
            "status": 'active'
        },
        "usage": {
            "activePositions": 12,
            "maxPositions": 25,
            "candidatesProcessed": 156,
            "maxCandidates": 500,
            "storageUsed": 2.4,
            "maxStorage": 10
        },
        "availablePlans": [
            {
                "id": 'starter',
                "name": 'Starter',
                "price": 99,
                "features": ['Up to 5 positions', 'Up to 100 candidates', '2GB storage', 'Basic analytics'],
                "recommended": False
            },
            {
                "id": 'professional',
                "name": 'Professional',
                "price": 299,
                "features": ['Up to 25 positions', 'Up to 500 candidates', '10GB storage', 'Advanced analytics', 'AI interviews'],
                "recommended": True
            },
            {
                "id": 'enterprise',
                "name": 'Enterprise',
                "price": 999,
                "features": ['Unlimited positions', 'Unlimited candidates', '100GB storage', 'Custom analytics', 'Priority support', 'API access'],
                "recommended": False
            }
        ]
    }

@app.post("/admin/register-employee")
def register_employee(request: EmployeeRegistrationRequest):
    # In a real app, save to DB/Auth system
    # For now, we apppend to members.csv if it existed, or just mock success
    current_members = read_csv("members.csv")
    new_id = len(current_members) + 1
    new_member = {
        "id": new_id,
        "name": f"{request.firstName} {request.lastName}",
        "email": request.email,
        "role": "Member", # Default role
        "position": request.title,
        "department": "HR" if request.title == "HR Member" else "Engineering",
        "joinDate": datetime.now().strftime("%Y-%m-%d")
    }
    # In a real scenario we would write back to CSV, but here we just return success
    # assuming the frontend refreshes and we might need to persist it for the session if we want to see it.
    # Let's try to append to in-memory list or file if possible.
    # For simplicity, we'll return success and the user might see it if we used a real DB.
    # Since we use CSV reading for get_members, unless we write to CSV, it won't show up.
    # We added write_csv helper.
    current_members.append(new_member)
    write_csv("members.csv", current_members)
    return {"success": True, "message": "Employee registered successfully"}

@app.get("/admin/notifications")
def get_notifications():
    return [
        {
            "id": 1,
            "type": 'success',
            "title": 'New Candidate Match',
            "message": 'John Smith (95% match) applied to Senior React Developer position',
            "timestamp": '2 hours ago',
            "read": False,
            "actionUrl": '/candidates/1'
        },
        {
            "id": 2,
            "type": 'warning',
            "title": 'Suspicious Activity Detected',
            "message": 'Candidate Michael Chen flagged for potential cheating in assessment',
            "timestamp": '5 hours ago',
            "read": False,
            "actionUrl": '/suspect-review/3'
        },
        {
            "id": 3,
            "type": 'info',
            "title": 'Interview Scheduled',
            "message": 'Live interview scheduled with Sarah Johnson for tomorrow at 2 PM',
            "timestamp": '1 day ago',
            "read": True,
            "actionUrl": '/interviews/2'
        },
        {
            "id": 4,
            "type": 'success',
            "title": 'Position Filled',
            "message": 'Backend Engineer position has been successfully filled',
            "timestamp": '2 days ago',
            "read": True,
            "actionUrl": '/positions/5'
        }
    ]

@app.get("/admin/alerts")
def get_alerts():
    return [
        {
            "id": 1,
            "severity": 'high',
            "title": 'High Cheating Risk',
            "message": '3 candidates flagged with high-risk cheating indicators in the last 24 hours',
            "count": 3,
            "timestamp": '1 hour ago',
            "actionUrl": '/suspect-review'
        },
        {
            "id": 2,
            "severity": 'medium',
            "title": 'Pending Reviews',
            "message": '12 candidates awaiting final review decision',
            "count": 12,
            "timestamp": '3 hours ago',
            "actionUrl": '/pending-reviews'
        },
        {
            "id": 3,
            "severity": 'low',
            "title": 'Expiring Assessments',
            "message": '5 assessment sessions will expire in 48 hours',
            "count": 5,
            "timestamp": '1 day ago',
            "actionUrl": '/assessments'
        }
    ]

@app.get("/members")
def get_members():
    return read_csv("members.csv")

# --- Recruiter Endpoints ---

@app.get("/projects")
def get_projects():
    return read_csv("projects.csv")

@app.get("/projects/closed")
def get_closed_projects():
    return read_csv("closed_projects.csv")

@app.get("/positions")
def get_positions():
    return read_csv("job_positions.csv")

@app.get("/positions/closed")
def get_closed_positions():
    return read_csv("closed_positions.csv")

@app.get("/admin/delegation")
def get_recruiter_delegation():
    return {
        "hrRecruiters": [r['name'] for r in read_csv("hr_recruiters.csv") if 'name' in r],
        "technicalRecruiters": [r['name'] for r in read_csv("technical_recruiters.csv") if 'name' in r],
        "positions": read_csv("job_positions.csv"),
        "projects": read_csv("projects.csv")
    }

@app.get("/groups")
def get_position_groups():
    return read_csv("position_groups.csv")

@app.get("/recruiter/analytics")
def get_recruiter_analytics():
    projects = read_csv("projects.csv")
    positions = read_csv("job_positions.csv")
    groups = read_csv("position_groups.csv")

    return {
        "overview": {
            "totalProjects": len(projects),
            "totalPositions": len(positions),
            "totalGroups": len(groups),
            "totalCandidates": 156
        },
        "topStats": {
            "applicantsCount": 30,
            "perfectMatchCount": 3,
            "suspiciousCount": 1
        },
        "groupsByStatus": [
            { "status": 'Live', "count": 12, "color": '#10b981' },
            { "status": 'Paused', "count": 4, "color": '#f59e0b' },
            { "status": 'Completed', "count": 2, "color": '#6366f1' }
        ],
        "candidatesByStage": [
            { "stage": 'Assessment', "count": 68, "color": '#6366f1' },
            { "stage": 'AI Interview', "count": 52, "color": '#8b5cf6' },
            { "stage": 'Live Interview', "count": 24, "color": '#10b981' },
            { "stage": 'Approved', "count": 12, "color": '#059669' }
        ],
        "projectPerformance": [
            {
                "project": p.get("projectName"),
                "groups": p.get("subGroupsCount", 0),
                "candidates": p.get("applicantsCount", 0)
            } for p in projects
        ],
        "recentActivity": [],
        "weeklyTrend": []
    }

@app.get("/recruiter/pipeline-modules")
def get_pipeline_modules():
    return [
        { "id": 'assessment', "type": 'assessment', "name": 'Technical Assessment', "description": 'Technical skills evaluation', "enabled": True },
        { "id": 'ai-interview', "type": 'ai-interview', "name": 'AI Video Interview', "description": 'AI-powered video screening', "enabled": True },
        { "id": 'live-interview', "type": 'live-interview', "name": 'Live Interview', "description": 'Real-time interview session', "enabled": False }
    ]

@app.get("/groups/{group_id}/details")
def get_group_details(group_id: str):
    # Mock return for any group ID
    return {
        "candidates": [
            {
                "id": 1,
                "name": 'John Smith',
                "email": 'john.smith@email.com',
                "score": 95,
                "antiCheating": False,
                "pipelineStatus": {
                    "groupAssignment": { "status": 'completed', "completedAt": '2025-01-15 09:00' },
                    "assessment": { "status": 'completed', "completedAt": '2025-01-16 14:30' },
                    "aiInterview": { "status": 'completed', "completedAt": '2025-01-18 10:15' },
                    "liveInterview": { "status": 'completed', "completedAt": '2025-01-20 15:45' },
                    "finalDecision": { "status": 'pending', "completedAt": None }
                },
                "assessmentScore": 92,
                "aiInterviewScore": 88,
                "flags": [],
                "currentStage": 'Review',
                "technicalVerdict": 'pass',
                "meetsCriteria": True,
                "progressionState": 'active'
            },
            {
                "id": 2,
                "name": 'Sarah Johnson',
                "email": 'sarah.j@email.com',
                "score": 88,
                "antiCheating": False,
                "pipelineStatus": {
                    "groupAssignment": { "status": 'completed', "completedAt": '2025-01-15 09:30' },
                    "assessment": { "status": 'completed', "completedAt": '2025-01-16 16:20' },
                    "aiInterview": { "status": 'completed', "completedAt": '2025-01-18 11:45' },
                    "liveInterview": { "status": 'pending', "completedAt": None },
                    "finalDecision": { "status": 'not-started', "completedAt": None }
                },
                "assessmentScore": 85,
                "aiInterviewScore": 82,
                "flags": [],
                "currentStage": 'Live Interview',
                "technicalVerdict": 'pass',
                "meetsCriteria": True,
                "progressionState": 'active'
            },
            {
                "id": 3,
                "name": 'Michael Chen',
                "email": 'mchen@email.com',
                "score": 82,
                "antiCheating": True,
                "pipelineStatus": {
                    "groupAssignment": { "status": 'completed', "completedAt": '2025-01-15 10:00' },
                    "assessment": { "status": 'completed', "completedAt": '2025-01-17 09:15' },
                    "aiInterview": { "status": 'pending', "completedAt": None },
                    "liveInterview": { "status": 'not-started', "completedAt": None },
                    "finalDecision": { "status": 'not-started', "completedAt": None }
                },
                "assessmentScore": 82,
                "aiInterviewScore": 0,
                "flags": ['Suspicious Activity'],
                "currentStage": 'AI Interview',
                "technicalVerdict": 'conditional',
                "meetsCriteria": True,
                "progressionState": 'active'
            }
        ],
        "pipelineStages": [
            { "id": 'assessment', "name": 'Technical Assessment', "completed": 3, "pending": 0, "total": 3, "state": 'closed' },
            { "id": 'ai-interview', "name": 'AI Interview', "completed": 2, "pending": 1, "total": 3, "state": 'active' },
            { "id": 'live-interview', "name": 'Live Interview', "completed": 1, "pending": 2, "total": 3, "state": 'not-started' },
            { "id": 'review', "name": 'Review', "completed": 0, "pending": 3, "total": 3, "state": 'not-started' },
            { "id": 'offer', "name": 'Offer', "completed": 0, "pending": 3, "total": 3, "state": 'not-started' }
        ],
        "acceptanceCriteria": {
            "minimumTechnicalScore": 70,
            "allowedIntegrityRisk": 'low',
            "requiredVerdict": 'pass'
        },
        "activityLog": [
            {
                "id": 'log-1',
                "type": 'criteria-defined',
                "actor": 'System',
                "actorRole": 'technical',
                "description": 'Initial acceptance criteria set',
                "timestamp": (datetime.now() - timedelta(days=1)).isoformat()
            },
            {
                "id": 'log-2',
                "type": 'stage-start',
                "actor": 'Sarah Johnson',
                "actorRole": 'hr',
                "description": 'Started Technical Assessment stage',
                "timestamp": (datetime.now() - timedelta(days=2)).isoformat()
            }
        ]
    }

@app.get("/groups/{group_id}/overview")
def get_group_overview(group_id: str):
    return {
        "id": group_id,
        "name": 'Senior React Developers Q1',
        "project": 'Summer Internship',
        "status": 'active',
        "createdAt": '2025-01-15',
        "candidateCount": 45,
        "stages": [
            { "name": 'Screening', "completed": 45, "pending": 0, "passed": 42, "failed": 3 },
            { "name": 'Assessment', "completed": 38, "pending": 4, "passed": 35, "failed": 3 },
            { "name": 'AI Interview', "completed": 28, "pending": 7, "passed": 26, "failed": 2 },
            { "name": 'Live Interview', "completed": 15, "pending": 11, "passed": 14, "failed": 1 },
            { "name": 'Final Review', "completed": 8, "pending": 6, "passed": 7, "failed": 1 }
        ],
        "phases": {
            "assessment": {
                "completed": 38,
                "passRate": 92,
                "avgScore": 82,
                "cheatingDetected": 3,
                "highRisk": 1,
                "mediumRisk": 2,
                "lowRisk": 0
            },
            "aiInterview": {
                "completed": 28,
                "passRate": 88,
                "avgScore": 85,
                "avgConfidence": 78,
                "sentimentPositive": 65,
                "sentimentNeutral": 25,
                "sentimentNegative": 10
            },
            "liveInterview": {
                "completed": 15,
                "scheduled": 26,
                "avgRating": 4.5,
                "recommended": 12,
                "rejected": 1,
                "pending": 2
            }
        },
        "topCandidates": [
            { "id": 1, "name": 'John Smith', "score": 95, "stage": 'Final Review' },
            { "id": 2, "name": 'Sarah Johnson', "score": 92, "stage": 'Live Interview' },
            { "id": 3, "name": 'Michael Chen', "score": 88, "stage": 'AI Interview' }
        ],
        "analytics": {
            "avgScore": 82,
            "avgTimeToComplete": '12 days',
            "dropoffRate": 18,
            "cheatingFlags": 3
        },
        "initialMatchScore": 75
    }

@app.get("/groups/candidates/all")
def get_group_candidates():
        return [
            { "id": 1, "name": 'John Smith', "email": 'john.smith@email.com', "experience": 8, "location": 'San Francisco, CA', "skills": ['React', 'TypeScript', 'Node.js', 'AWS'], "match": 92, "starred": False },
            { "id": 2, "name": 'Sarah Johnson', "email": 'sarah.j@email.com', "experience": 6, "location": 'New York, NY', "skills": ['React', 'JavaScript', 'Python', "Docker"], "match": 88, "starred": False },
            { "id": 3, "name": 'Michael Chen', "email": 'mchen@email.com', "experience": 10, "location": 'Austin, TX', "skills": ['TypeScript', 'Node.js', 'GraphQL', 'MongoDB'], "match": 85, "starred": False },
            { "id": 4, "name": 'Emily Davis', "email": 'emily.davis@email.com', "experience": 5, "location": 'Seattle, WA', "skills": ['React', 'TypeScript', 'Redux', 'PostgreSQL'], "match": 82, "starred": False },
            { "id": 5, "name": 'David Wilson', "email": 'dwilson@email.com', "experience": 7, "location": 'San Francisco, CA', "skills": ['JavaScript', 'Node.js', 'Express', 'MySQL'], "match": 79, "starred": False },
            { "id": 6, "name": 'Lisa Anderson', "email": 'l.anderson@email.com', "experience": 4, "location": 'Boston, MA', "skills": ['React', 'Vue.js', 'CSS', 'HTML'], "match": 76, "starred": False },
            { "id": 7, "name": 'Robert Martinez', "email": 'rmartinez@email.com', "experience": 9, "location": 'Los Angeles, CA', "skills": ['Python', 'Django', 'PostgreSQL', 'Redis'], "match": 73, "starred": False },
            { "id": 8, "name": 'Jennifer Taylor', "email": 'jtaylor@email.com', "experience": 3, "location": 'Chicago, IL', "skills": ['JavaScript', 'React', 'HTML', 'CSS'], "match": 70, "starred": False },
            { "id": 9, "name": 'James Brown', "email": 'jbrown@email.com', "experience": 6, "location": 'Denver, CO', "skills": ['TypeScript', 'Angular', 'RxJS', 'NestJS'], "match": 67, "starred": False },
            { "id": 10, "name": 'Patricia Garcia', "email": 'pgarcia@email.com', "experience": 5, "location": 'Miami, FL', "skills": ['React', 'Next.js', 'Tailwind', 'Vercel'], "match": 64, "starred": False },
            { "id": 11, "name": 'Christopher Lee', "email": 'clee@email.com', "experience": 8, "location": 'San Francisco, CA', "skills": ['Java', 'Spring', 'Kubernetes', 'AWS'], "match": 61, "starred": False },
            { "id": 12, "name": 'Maria Rodriguez', "email": 'mrodriguez@email.com', "experience": 4, "location": 'Atlanta, GA', "skills": ['JavaScript', 'Vue.js', 'Vuex', 'Firebase'], "match": 58, "starred": False },
            { "id": 13, "name": 'Daniel Kim', "email": 'dkim@email.com', "experience": 7, "location": 'Seattle, WA', "skills": ['Go', 'Microservices', 'Docker', 'Kubernetes'], "match": 55, "starred": False },
            { "id": 14, "name": 'Amanda White', "email": 'awhite@email.com', "experience": 5, "location": 'Portland, OR', "skills": ['React', 'TypeScript', 'GraphQL', 'Apollo'], "match": 52, "starred": False },
            { "id": 15, "name": 'Kevin Thompson', "email": 'kthompson@email.com', "experience": 6, "location": 'Austin, TX', "skills": ['Python', 'FastAPI', 'MongoDB', 'Docker'], "match": 49, "starred": False },
            { "id": 16, "name": 'Rachel Kim', "email": 'rkim@email.com', "experience": 9, "location": 'San Francisco, CA', "skills": ['React', 'TypeScript', 'AWS', 'Node.js', 'GraphQL'], "match": 91, "starred": False },
            { "id": 17, "name": 'Marcus Johnson', "email": 'mjohnson@email.com', "experience": 12, "location": 'New York, NY', "skills": ['Java', 'Spring Boot', 'Microservices', 'Kafka'], "match": 89, "starred": False },
            { "id": 18, "name": 'Sofia Rodriguez', "email": 'sofia.r@email.com', "experience": 7, "location": 'Austin, TX', "skills": ['Python', 'Django', 'PostgreSQL', 'AWS'], "match": 86, "starred": False }
        ]

@app.get("/groups/config/creation")
def get_group_creation_config():
    return {
        "availableStages": [
            { "id": 'screening', "name": 'Resume Screening', "enabled": True, "required": True },
            { "id": 'assessment', "name": 'Technical Assessment', "enabled": True, "required": False },
            { "id": 'ai-interview', "name": 'AI Interview', "enabled": True, "required": False },
            { "id": 'live-interview', "name": 'Live Interview', "enabled": True, "required": False },
            { "id": 'final-review', "name": 'Final Review', "enabled": True, "required": True }
        ],
        "filtrationOptions": [
            { "id": 'skills', "name": 'Skills Match', "type": 'percentage', "min": 0, "max": 100, "default": 70 },
            { "id": 'experience', "name": 'Years of Experience', "type": 'range', "min": 0, "max": 20, "default": [2, 10] },
            { "id": 'education', "name": 'Education Level', "type": 'select', "options": ['High School', 'Bachelor', 'Master', 'PhD'] },
            { "id": 'location', "name": 'Location', "type": 'multiselect', "options": ['Remote', 'On-site', 'Hybrid'] }
        ],
        "assessmentTemplates": [
            { "id": '1', "name": 'Frontend Developer Assessment', "questionCount": 25, "duration": 60 },
            { "id": '2', "name": 'Backend Engineer Assessment', "questionCount": 30, "duration": 75 },
            { "id": '3', "name": 'Full Stack Assessment', "questionCount": 40, "duration": 90 }
        ],
        "interviewTemplates": [
            { "id": '1', "name": 'Technical AI Interview', "duration": 30, "questionCount": 10 },
            { "id": '2', "name": 'Behavioral Interview', "duration": 45, "questionCount": 8 },
            { "id": '3', "name": 'System Design Interview', "duration": 60, "questionCount": 5 }
        ]
    }

@app.get("/recruiters/hr")
def get_hr_recruiters():
    data = read_csv("hr_recruiters.csv")
    return [item["name"] for item in data]

@app.get("/recruiters/technical")
def get_technical_recruiters():
    data = read_csv("technical_recruiters.csv")
    return [item["name"] for item in data]

@app.get("/positions/{position_id}/details")
def get_position_details(position_id: str):
    return {
        "candidates": [
            { "id": 1, "name": 'John Smith', "email": 'john.smith@email.com', "score": 95, "match": 92, "color": '#10b981', "starred": False, "selected": False },
            { "id": 2, "name": 'Sarah Johnson', "email": 'sarah.j@email.com', "score": 88, "match": 85, "color": '#10b981', "starred": False, "selected": False },
            { "id": 3, "name": 'Michael Chen', "email": 'mchen@email.com', "score": 82, "match": 78, "color": '#f59e0b', "starred": False, "selected": False },
            { "id": 4, "name": 'Emily Davis', "email": 'emily.davis@email.com', "score": 79, "match": 75, "color": '#f59e0b', "starred": False, "selected": False },
            { "id": 5, "name": 'David Wilson', "email": 'dwilson@email.com', "score": 72, "match": 68, "color": '#f59e0b', "starred": False, "selected": False }
        ],
        "groups": [
            { "id": '1', "name": 'Senior React Developers Q1 2025', "candidateCount": 8, "recruiter": 'John Doe', "stage": 'Live Interview', "progress": 62, "lastUpdated": '2 hours ago', "status": 'Live' },
            { "id": 2, "name": 'Backend Engineers - Python Focus', "candidateCount": 12, "recruiter": 'Jane Smith', "stage": 'Assessment', "progress": 45, "lastUpdated": '1 day ago', "status": 'Live' },
            { "id": '3', "name": 'Full Stack - High Match', "candidateCount": 5, "recruiter": 'Mike Johnson', "stage": 'Review', "progress": 85, "lastUpdated": '3 days ago', "status": 'Paused' }
        ]
    }

@app.get("/positions/{position_id}/insights")
def get_position_insights(position_id: str):
    return {
        "fittingData": [
            { "name": 'Excellent (80-100%): 2', "value": 2, "color": '#10b981' },
            { "name": 'Poor (<40%): 0', "value": 1, "color": '#ff9a76' },
            { "name": 'Fair (40-59%): 4', "value": 4, "color": '#ffa366' },
            { "name": 'Good (60-79%): 4', "value": 4, "color": '#f59e0b' }
        ],
        "scoreData": [
            { "range": '0-20', "count": 0 },
            { "range": '20-40', "count": 0 },
            { "range": '40-60', "count": 3 },
            { "range": '60-80', "count": 4 },
            { "range": '80-100', "count": 3 }
        ],
        "skillDistribution": [
            { "skill": 'React', "count": 8, "percentage": 67 },
            { "skill": 'TypeScript', "count": 7, "percentage": 58 },
            { "skill": 'Node.js', "count": 6, "percentage": 50 },
            { "skill": 'AWS', "count": 5, "percentage": 42 }
        ],
        "seniorityDistribution": [
            { "level": 'Senior', "count": 4, "percentage": 33 },
            { "level": 'Mid-Level', "count": 5, "percentage": 42 },
            { "level": 'Junior', "count": 3, "percentage": 25 }
        ],
        "universityDistribution": [
            { "university": 'Stanford University', "count": 3 },
            { "university": 'MIT', "count": 2 },
            { "university": 'UC Berkeley', "count": 2 },
            { "university": 'Other', "count": 5 }
        ],
        "availabilityDistribution": [
            { "availability": 'Immediate', "count": 4, "percentage": 33 },
            { "availability": '2 weeks', "count": 5, "percentage": 42 },
            { "availability": '1 month', "count": 3, "percentage": 25 }
        ]
    }

@app.get("/positions/{position_id}/filtration-flow")
def get_filtration_flow_config(position_id: str):
    return {
        "positionId": position_id,
        "positionName": 'Senior React Developer',
        "currentFilters": [
            { "type": 'skills', "operator": 'match', "value": 85, "weight": 0.4 },
            { "type": 'experience', "operator": 'range', "value": [3, 10], "weight": 0.3 },
            { "type": 'education', "operator": 'minimum', "value": 'Bachelor', "weight": 0.2 },
            { "type": 'location', "operator": 'includes', "value": ['Remote', 'Hybrid'], "weight": 0.1 }
        ],
        "availableFilters": [
            { "id": 'skills', "name": 'Skills Match', "type": 'percentage', "operators": ['match', 'above', 'below'] },
            { "id": 'experience', "name": 'Experience', "type": 'number', "operators": ['range', 'above', 'below', 'exact'] },
            { "id": 'education', "name": 'Education', "type": 'select', "operators": ['minimum', 'exact', 'any'] },
            { "id": 'location', "name": 'Location', "type": 'multiselect', "operators": ['includes', 'excludes', 'exact'] },
            { "id": 'salary', "name": 'Salary Expectation', "type": 'range', "operators": ['range', 'below', 'above'] },
            { "id": 'availability', "name": 'Availability', "type": 'select', "operators": ['exact', 'before'] }
        ],
        "previewResults": {
            "totalCandidates": 156,
            "matchingCandidates": 42,
            "avgMatchScore": 87
        }
    }

@app.get("/positions/{position_id}/skills")
def get_skill_clusters(position_id: str):
    return [
        {
            "id": '1',
            "name": 'Frontend Core',
            "skills": ['React', 'TypeScript', 'JavaScript', 'HTML', 'CSS'],
            "candidateCount": 42,
            "avgProficiency": 85,
            "color": '#6366f1'
        },
        {
            "id": '2',
            "name": 'State Management',
            "skills": ['Redux', 'MobX', 'Context API', 'Zustand'],
            "candidateCount": 35,
            "avgProficiency": 78,
            "color": '#8b5cf6'
        },
        {
            "id": '3',
            "name": 'Build Tools',
            "skills": ['Webpack', 'Vite', 'Babel', 'ESLint'],
            "candidateCount": 28,
            "avgProficiency": 72,
            "color": '#10b981'
        },
        {
            "id": '4',
            "name": 'Testing',
            "skills": ['Jest', 'React Testing Library', 'Cypress', 'Playwright'],
            "candidateCount": 31,
            "avgProficiency": 75,
            "color": '#f59e0b'
        },
        {
            "id": '5',
            "name": 'Backend Integration',
            "skills": ['REST API', 'GraphQL', 'WebSockets', 'Authentication'],
            "candidateCount": 38,
            "avgProficiency": 80,
        }
    ]

# --- Candidate/Assessment Endpoints ---

@app.get("/candidates/selected")
def get_selected_candidates():
    return read_csv("selected_candidates.csv")

@app.get("/candidates/{candidate_id}/suspect-review")
def get_suspect_review(candidate_id: int):
    return {
        "duration": 720,
        "flags": [
            {
                "id": 1,
                "timestamp": 245,
                "timeDisplay": '04:05',
                "event": 'Tab Switch Detected',
                "severity": 'high',
                "module": 'Assessment',
                "evidence": 'Tab focus lost for 45 seconds during Question 3',
                "notes": '',
                "status": 'pending'
            },
            {
                "id": 2,
                "timestamp": 268,
                "timeDisplay": '04:28',
                "event": 'Copy-Paste Event',
                "severity": 'medium',
                "module": 'Assessment',
                "evidence": 'Large text block pasted into answer field',
                "notes": '',
                "status": 'pending'
            },
            {
                "id": 3,
                "timestamp": 415,
                "timeDisplay": '06:55',
                "event": 'Suspicious Pause',
                "severity": 'medium',
                "module": 'AI Interview',
                "evidence": '30-second pause before answering technical question',
                "notes": '',
                "status": 'pending'
            },
            {
                "id": 4,
                "timestamp": 550,
                "timeDisplay": '09:10',
                "event": 'Background Noise',
                "severity": 'low',
                "module": 'AI Interview',
                "evidence": 'Multiple voices detected in background',
                "notes": '',
                "status": 'pending'
            }
        ],
        "moduleProgress": [
            { "module": 'Assessment', "progress": 100, "status": 'completed', "time": '18 mins', "flags": 2 },
            { "module": 'AI Interview', "progress": 100, "status": 'completed', "time": '12 mins', "flags": 2 },
            { "module": 'Live Interview', "progress": 0, "status": 'pending', "time": '-', "flags": 0 }
        ]
    }

@app.get("/candidates/{candidate_id}/knowledge-graph")
def get_knowledge_graph(candidate_id: int):
    # This is a large JSON structure
    return {
        "nodes": [
            # Candidate (center)
            { "id": 'candidate-1', "type": 'candidate', "label": f'Candidate {candidate_id}', "data": { "id": candidate_id }, "x": 0, "y": 0 },
            # Skills
            { "id": 'skill-1', "type": 'skill', "label": 'React', "data": { "yearsExp": 6 }, "verified": True, "level": 'Expert', "score": 95, "x": 0, "y": 0 },
            { "id": 'skill-2', "type": 'skill', "label": 'TypeScript', "data": { "yearsExp": 5 }, "verified": True, "level": 'Expert', "score": 98, "x": 0, "y": 0 },
            { "id": 'skill-3', "type": 'skill', "label": 'Node.js', "data": { "yearsExp": 7 }, "verified": True, "level": 'Advanced', "score": 92, "x": 0, "y": 0 },
            { "id": 'skill-4', "type": 'skill', "label": 'AWS', "data": { "yearsExp": 4 }, "verified": True, "level": 'Advanced', "score": 88, "x": 0, "y": 0 },
        ],
        "edges": [
            { "id": 'e1', "source": 'candidate-1', "target": 'skill-1', "type": 'related' },
        ]
    }

@app.post("/candidates/skills")
def get_skills_for_candidates(candidate_ids: List[int]):
    skills_data = {}
    for index, cid in enumerate(candidate_ids):
        # Mock logic similar to api.ts
        base_skills = [
            { "id": f's{cid}-1', "name": 'React', "category": 'technical', "proficiency": 'expert' if index % 3 == 0 else 'advanced', "yearsOfExperience": 3 + index, "source": 'resume' },
            { "id": f's{cid}-2', "name": 'TypeScript', "category": 'technical', "proficiency": 'advanced' if index % 2 == 0 else 'intermediate', "yearsOfExperience": 2 + index, "source": 'assessment' },
            { "id": f's{cid}-3', "name": 'Node.js', "category": 'technical', "proficiency": 'advanced', "yearsOfExperience": 3 + index, "source": 'resume' },
        ]
        skills_data[cid] = base_skills
    return skills_data

@app.get("/candidates/{candidate_id}/assessment-details")
def get_assessment_details(candidate_id: int):
    return {
        "score": 92,
        "completedDate": '2 Oct, 2025',
        "questions": [
            {
                "id": 1,
                "text": 'Explain the difference between let, const, and var in JavaScript.',
                "answer": 'let and const are block-scoped...',
                "timeSpent": 180,
                "flagged": False
            },
             # ... more questions
        ],
        "integritySignals": [
             {
                "id": 1,
                "type": 'tab-switch',
                "severity": 'high',
                "timestamp": '14:23:45',
                "description": 'Candidate switched to another tab during Question 3',
                "evidence": 'Tab focus lost for 45 seconds'
            }
        ]
    }

@app.get("/candidate/home")
def get_candidate_home():
    return {
        "currentStage": 'assessment',
        "notifications": [
            {
                "id": 1,
                "type": 'success',
                "title": 'Application Received',
                "message": 'Your application for Senior Software Engineer has been received',
                "time": '2 hours ago',
                "read": False
            },
            # ...
        ]
    }

@app.get("/candidate/assessments")
def get_candidate_assessments():
    return [
        {
            "id": 1,
            "title": 'Software engineering technical assessment',
            "description": 'Evaluate your technical skills through a series of coding challenges and multiple-choice questions.',
            "type": 'assessment',
            "questions": 15,
            "expectedTime": '45 minutes',
            "parts": 1
        },
        {
            "id": 2,
            "title": 'Behavioral AI Interview',
            "description": 'Complete a recorded video interview to showcase your communication skills and cultural fit.',
            "type": 'interview',
            "questions": 5,
            "expectedTime": '15 minutes',
            "parts": 5
        },
        {
            "id": 3,
            "title": 'Live Technical Interview',
            "description": 'Real-time video interview with an AI or human interviewer to discuss your technical experience.',
            "type": 'interview',
            "questions": 1,
            "expectedTime": '30 minutes',
            "parts": 1
        }
    ]

@app.get("/candidate/profile")
def get_candidate_profile():
    return {
        "id": 1,
        "name": 'John Smith',
        "email": 'john.smith@email.com',
        "phone": '+1 (555) 123-4567',
        "location": 'San Francisco, CA',
        "avatar": None,
        "title": 'Senior Full Stack Developer',
        "experience": 8,
        "skills": ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker', 'PostgreSQL'],
        "education": [
             {
                "degree": 'Master of Science in Computer Science',
                "school": 'Stanford University',
                "year": '2015-2017'
            }
        ],
        "scores": {
            "overall": 95,
            "assessment": 95,
            "aiInterview": 92,
            "github": 88
        },
       
    }

# --- Questions/Interview Config Endpoints ---

@app.get("/questions/variants")
def get_question_variants(type: str = "mcq"):
    questions = {
        "mcq": [
            {
                "id": 'qb-mcq-1',
                "type": 'mcq',
                "questionText": 'What is the primary purpose of React hooks?',
                "options": ['State management in functional components', 'Styling components', 'API calls', 'Routing'],
                "correctAnswer": 0,
                "difficulty": 'Medium',
                "tags": ['React', 'Hooks'],
                "semanticScore": 0.95
            },
             # ...
        ],
        "essay": [
             {
                "id": 'qb-essay-1',
                "type": 'essay',
                "questionText": 'Explain the concept of closure in JavaScript...',
                "difficulty": 'Medium',
                "tags": ['JavaScript', 'Closures'],
                "semanticScore": 0.93
            }
        ],
        "code": [
             # ...
        ]
    }
    return questions.get(type, [])

@app.post("/questions/generate-variants")
def generate_question_variants(baseVariant: Dict[str, Any], numVariants: int = 3):
    # Mock generation logic
    variants = []
    for i in range(numVariants):
        variant = baseVariant.copy()
        variant["id"] = f"variant-{i}"
        variant["questionText"] = f"{baseVariant.get('questionText', '')} (Variant {i+1})"
        variants.append(variant)
    return variants

@app.get("/questions/bank")
def get_question_bank():
    return [
        {
            "id": '1',
            "text": 'Explain the difference between useMemo and useCallback in React.',
            "category": 'React',
            "difficulty": 'Medium',
            "type": 'Essay',
            "tags": ['React', 'Hooks', 'Performance'],
            "usageCount": 45,
            "avgScore": 78,
            "createdAt": '2024-01-15',
            "createdBy": 'Sarah Johnson',
            "isFavorite": True
        }
        # ...
    ]

@app.get("/assessments/templates")
def get_assessment_templates():
    return [
        {
            "id": '1',
            "name": 'Frontend Developer Assessment',
            "description": 'Comprehensive assessment for frontend developers...',
            "questionCount": 25,
            "duration": 60,
            "difficulty": 'Medium',
            "categories": ['React', 'JavaScript', 'CSS', 'HTML'],
            "usageCount": 45,
            "avgScore": 76
        },
        # ...
    ]

@app.get("/interviews/{interview_id}/questions")
def get_live_interview_questions(interview_id: str):
    return [
        {
            "id": 1,
            "question": 'Tell me about your experience with React...',
            "category": 'Experience',
            "duration": 180,
            "order": 1
        },
        # ...
    ]

@app.get("/interviews/{interview_id}/config")
def get_ai_interview_config(interview_id: str):
    return {
        "id": interview_id,
        "name": 'Technical AI Interview',
        "description": 'AI-powered technical interview...',
        "duration": 30,
        "questionCount": 10,
        "difficulty": 'Medium',
        "topics": ['React', 'JavaScript', 'System Design', 'Algorithms'],
        "enableFaceDetection": True,
        "enableVoiceAnalysis": True,
        "enableSentimentAnalysis": True,
        "variants": [
            {
                "id": 'v1',
                "name": 'Frontend Focus',
                "description": 'More questions on React...',
                "weight": 0.4
            }
        ]
    }

@app.get("/assessments/sessions/{session_id}")
def get_assessment_session(session_id: str):
    return {
        "id": 'session-123',
        "timeLimit": 45 * 60,
        "questions": [
            {
                "id": 1,
                "type": 'mcq',
                "question": 'What is the most effective way to optimize performance in a large-scale React application?',
                "options": [
                    'Using inline styles for everything',
                    'Memoizing expensive components and using code splitting',
                    'Removing all functional components',
                    'Avoiding the use of any state management'
                ],
                "correctAnswer": 1,
                "points": 10
            },
            {
                "id": 2,
                "type": 'coding',
                "question": 'Implement a function that finds the longest palindromic substring in a given string.',
                "starterCode": 'function longestPalindrome(s) {\n  // Your code here\n}',
                "points": 25
            },
            {
                "id": 3,
                "type": 'essay',
                "question": 'Explain the concept of microservices architecture and describe two major challenges when implementing it.',
                "points": 15
            }
        ]
    }

@app.get("/interviews/recorded/questions/{interview_id}")
def get_recorded_interview_questions(interview_id: str):
    return [
        { "id": 1, "question": "Describe your most challenging project and how you overcame the obstacles you faced." },
        { "id": 2, "question": "Tell us about a time when you had to work with a difficult team member. How did you handle the situation?" },
        { "id": 3, "question": "What motivates you in your professional career, and how do you stay productive during challenging times?" },
        { "id": 4, "question": "Describe a situation where you had to learn a new technology or skill quickly. How did you approach it?" },
        { "id": 5, "question": "Where do you see yourself in 5 years, and how does this position align with your career goals?" }
    ]

