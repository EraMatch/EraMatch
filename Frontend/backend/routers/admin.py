from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from utils import read_csv, write_csv
from typing import List, Dict, Any

router = APIRouter()

class EmployeeRegistrationRequest(BaseModel):
    email: str
    password: str
    firstName: str
    lastName: str
    title: str

@router.get("/admin/stats")
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

@router.get("/admin/performance")
def get_recruiter_performance():
    return [
        {"name": "Sarah J.", "hires": 12, "efficiency": 94, "active": 8},
        {"name": "Mike C.", "hires": 15, "efficiency": 91, "active": 12},
        {"name": "Emily R.", "hires": 9, "efficiency": 88, "active": 6},
        {"name": "David K.", "hires": 11, "efficiency": 85, "active": 9},
        {"name": "Jessica M.", "hires": 8, "efficiency": 92, "active": 7}
    ]

@router.get("/admin/requests")
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

@router.get("/admin/subscription")
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

@router.post("/admin/register-employee")
def register_employee(request: EmployeeRegistrationRequest):
    current_members = read_csv("members.csv")
    new_id = len(current_members) + 1
    new_member = {
        "id": new_id,
        "name": f"{request.firstName} {request.lastName}",
        "email": request.email,
        "role": "Member",
        "position": request.title,
        "department": "HR" if request.title == "HR Member" else "Engineering",
        "joinDate": datetime.now().strftime("%Y-%m-%d")
    }
    current_members.append(new_member)
    write_csv("members.csv", ["id", "name", "email", "role", "position", "department", "joinDate"], current_members)
    return {"success": True, "message": "Employee registered successfully"}

@router.get("/admin/notifications")
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

@router.get("/admin/alerts")
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

@router.get("/members")
def get_members():
    return read_csv("members.csv")

@router.get("/admin/delegation")
def get_recruiter_delegation():
    return {
        "hrRecruiters": [r['name'] for r in read_csv("hr_recruiters.csv") if 'name' in r],
        "technicalRecruiters": [r['name'] for r in read_csv("technical_recruiters.csv") if 'name' in r],
        "positions": read_csv("job_positions.csv"),
        "projects": read_csv("projects.csv")
    }
