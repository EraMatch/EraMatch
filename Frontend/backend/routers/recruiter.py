from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any, Optional
from datetime import datetime
from utils import read_csv, write_csv
from pydantic import BaseModel
import random

router = APIRouter()

# --- Models ---

class ProjectCreate(BaseModel):
    projectName: str
    description: Optional[str] = ""

class ProjectUpdate(BaseModel):
    projectName: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

class PositionCreate(BaseModel):
    jobTitle: str
    department: str
    projectId: str
    description: Optional[str] = ""

class PositionUpdate(BaseModel):
    jobTitle: Optional[str] = None
    department: Optional[str] = None
    status: Optional[str] = None

# --- Endpoints ---

@router.get("/projects")
def get_projects():
    return read_csv("projects.csv")

@router.post("/projects")
def create_project(project: ProjectCreate):
    projects = read_csv("projects.csv")
    
    # Generate ID
    existing_ids = [int(p['id']) for p in projects if str(p['id']).isdigit()]
    new_id = str(max(existing_ids) + 1) if existing_ids else "1"
    
    new_project = {
        "id": new_id,
        "projectName": project.projectName,
        "positionsCount": 0,
        "applicantsCount": 0,
        "subGroupsCount": 0,
        "openDate": datetime.now().strftime("%Y-%m-%d")
        # Description is not in original CSV validation, if needed we can add it but keep it consistent
    }
    projects.append(new_project)
    
    # Ensure fields match CSV structure
    fieldnames = ["id", "projectName", "positionsCount", "applicantsCount", "subGroupsCount", "openDate"]
    write_csv("projects.csv", fieldnames, projects)
    return new_project

@router.put("/projects/{project_id}")
def update_project(project_id: str, project: ProjectUpdate):
    projects = read_csv("projects.csv")
    updated = False
    for p in projects:
        if str(p['id']) == project_id:
            if project.projectName:
                p['projectName'] = project.projectName
            updated = True
            break
    
    if not updated:
        raise HTTPException(status_code=404, detail="Project not found")
        
    write_csv("projects.csv", ["id", "projectName", "positionsCount", "applicantsCount", "subGroupsCount", "openDate"], projects)
    return {"success": True}

@router.get("/projects/closed")
def get_closed_projects():
    return read_csv("closed_projects.csv")

@router.get("/positions")
def get_positions():
    return read_csv("job_positions.csv")

@router.post("/positions")
def create_position(position: PositionCreate):
    positions = read_csv("job_positions.csv")
    
    existing_ids = [int(p['id']) for p in positions if str(p['id']).isdigit()]
    new_id = str(max(existing_ids) + 1) if existing_ids else "1"
    
    new_position = {
        "id": new_id,
        "jobTitle": position.jobTitle,
        "department": position.department,
        "projectId": position.projectId,
        "applicantsCount": 0,
        "status": "Active"
    }
    positions.append(new_position)
    
    # Update project counts
    projects = read_csv("projects.csv")
    for p in projects:
        if str(p['id']) == position.projectId:
            p['positionsCount'] = int(p.get('positionsCount', 0)) + 1
            break
    write_csv("projects.csv", ["id", "projectName", "positionsCount", "applicantsCount", "subGroupsCount", "openDate"], projects)
    
    # Save position
    # Keys from inspection: id, jobTitle, department, applicantsCount, status, projectId
    write_csv("job_positions.csv", ["id", "jobTitle", "department", "applicantsCount", "status", "projectId"], positions)
    return new_position

@router.put("/positions/{position_id}")
def update_position(position_id: str, position: PositionUpdate):
    positions = read_csv("job_positions.csv")
    updated = False
    for p in positions:
        if str(p['id']) == position_id:
            if position.jobTitle:
                p['jobTitle'] = position.jobTitle
            if position.department:
                p['department'] = position.department
            if position.status:
                p['status'] = position.status
            updated = True
            break
            
    if not updated:
        raise HTTPException(status_code=404, detail="Position not found")
        
    write_csv("job_positions.csv", ["id", "jobTitle", "department", "applicantsCount", "status", "projectId"], positions)
    return {"success": True}

@router.delete("/positions/{position_id}")
def delete_position(position_id: str):
    positions = read_csv("job_positions.csv")
    original_count = len(positions)
    positions = [p for p in positions if str(p['id']) != position_id]
    
    if len(positions) == original_count:
        raise HTTPException(status_code=404, detail="Position not found")
        
    # Ideally should update project count too, but we need to know projectId before deleting or search it.
    # We can skip complex integrity update for this basic implementation or do it properly.
    # To do it properly: find position first, get projectId, then delete.
    
    # Proper delete with count update
    positions_all = read_csv("job_positions.csv")
    target_pos = next((p for p in positions_all if str(p['id']) == position_id), None)
    
    if target_pos:
        project_id = target_pos.get('projectId')
        if project_id:
            projects = read_csv("projects.csv")
            for p in projects:
                if str(p['id']) == project_id:
                    count = int(p.get('positionsCount', 0))
                    if count > 0:
                        p['positionsCount'] = count - 1
                    break
            write_csv("projects.csv", ["id", "projectName", "positionsCount", "applicantsCount", "subGroupsCount", "openDate"], projects)
            
    write_csv("job_positions.csv", ["id", "jobTitle", "department", "applicantsCount", "status", "projectId"], positions)
    return {"success": True}

@router.get("/positions/closed")
def get_closed_positions():
    return read_csv("closed_positions.csv")

@router.get("/groups")
def get_position_groups():
    return read_csv("position_groups.csv")

@router.get("/recruiter/analytics")
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
        "recentActivity": [
            { "groupName": "Senior React Developers Q1 2025", "project": "Summer Internship 2025", "stage": "Live Interview", "time": "2 hours ago" },
            { "groupName": "Backend Engineers - Python Focus", "project": "Quarter 1 Hiring", "stage": "Assessment", "time": "5 hours ago" },
            { "groupName": "Full Stack - High Match", "project": "Expansion Project", "stage": "Review", "time": "1 day ago" },
            { "groupName": "DevOps Engineers", "project": "Infrastructure Upgrade", "stage": "Screening", "time": "2 days ago" }
        ],
        "weeklyTrend": [
            { "day": "Mon", "candidates": 12 },
            { "day": "Tue", "candidates": 19 },
            { "day": "Wed", "candidates": 15 },
            { "day": "Thu", "candidates": 22 },
            { "day": "Fri", "candidates": 28 },
            { "day": "Sat", "candidates": 14 },
            { "day": "Sun", "candidates": 8 }
        ]
    }

@router.get("/recruiter/pipeline-modules")
def get_pipeline_modules():
    return [
        { "id": 'assessment', "type": 'assessment', "name": 'Technical Assessment', "description": 'Technical skills evaluation', "enabled": True },
        { "id": 'ai-interview', "type": 'ai-interview', "name": 'AI Video Interview', "description": 'AI-powered video screening', "enabled": True },
        { "id": 'live-interview', "type": 'live-interview', "name": 'Live Interview', "description": 'Real-time interview session', "enabled": False }
    ]

@router.get("/groups/{group_id}/details")
def get_group_details(group_id: str):
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
                "timestamp": (datetime.now()).isoformat()
            }
        ]
    }

@router.get("/groups/{group_id}/overview")
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

@router.get("/groups/candidates/all")
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

@router.get("/groups/config/creation")
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

@router.get("/recruiters/hr")
def get_hr_recruiters():
    data = read_csv("hr_recruiters.csv")
    return [item["name"] for item in data]

@router.get("/recruiters/technical")
def get_technical_recruiters():
    data = read_csv("technical_recruiters.csv")
    return [item["name"] for item in data]

@router.get("/positions/{position_id}/details")
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

@router.get("/positions/{position_id}/insights")
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

@router.get("/positions/{position_id}/filtration-flow")
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

@router.get("/positions/{position_id}/skills")
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

@router.get("/questions/variants")
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
        "code": []
    }
    return questions.get(type, [])

@router.post("/questions/generate-variants")
def generate_question_variants(baseVariant: Dict[str, Any], numVariants: int = 3):
    variants = []
    for i in range(numVariants):
        variant = baseVariant.copy()
        variant["id"] = f"variant-{i}"
        variant["questionText"] = f"{baseVariant.get('questionText', '')} (Variant {i+1})"
        variants.append(variant)
    return variants

@router.get("/questions/bank")
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
    ]

@router.get("/assessments/templates")
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
        }
    ]

@router.get("/interviews/{interview_id}/questions")
def get_live_interview_questions(interview_id: str):
    return [
        {
            "id": 1,
            "question": 'Tell me about your experience with React...',
            "category": 'Experience',
            "duration": 180,
            "order": 1
        }
    ]

@router.get("/interviews/{interview_id}/config")
def get_ai_interview_config(interview_id: str):
    return {
        "id": interview_id,
        "name": 'Technical AI Interview',
        "description": 'AI-powered technical interview to evaluate React, algorithmic problem solving, and system design skills.',
        "duration": 45,
        "questionCount": 10,
        "difficulty": 'Medium',
        "topics": ['React', 'JavaScript', 'System Design', 'Algorithms', 'Soft Skills'],
        "passingScore": 70,
        "settings": {
            "enableFaceDetection": True,
            "enableVoiceAnalysis": True,
            "enableSentimentAnalysis": True,
            "enableEyeTracking": True,
            "enableFullScreen": True,
            "preventTabSwitching": True,
            "allowRetries": True,
            "maxRetries": 1,
            "showTimer": True
        },
        "messages": {
            "welcome": "Welcome to your AI Technical Interview. You will be asked a series of technical and behavioral questions.",
            "completion": "Thank you for completing the interview. Your results have been submitted for review."
        },
        "variants": [
            {
                "id": 'v1',
                "name": 'Frontend Focus',
                "description": 'More questions on React and CSS architecture',
                "weight": 0.4
            }
        ]
    }

@router.get("/assessments/sessions/{session_id}")
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

@router.get("/interviews/recorded/questions/{interview_id}")
def get_recorded_interview_questions(interview_id: str):
    return [
        { 
            "id": 1, 
            "question": "Describe your most challenging project and how you overcame the obstacles you faced.",
            "duration": 180,
            "preparationTime": 30,
            "retriesAllowed": 1
        },
        { 
            "id": 2, 
            "question": "Tell us about a time when you had to work with a difficult team member. How did you handle the situation?",
            "duration": 150,
            "preparationTime": 30,
            "retriesAllowed": 1
        },
        { 
            "id": 3, 
            "question": "What motivates you in your professional career, and how do you stay productive during challenging times?",
            "duration": 120,
            "preparationTime": 15,
            "retriesAllowed": 0
        },
        { 
            "id": 4, 
            "question": "Describe a situation where you had to learn a new technology or skill quickly. How did you approach it?",
            "duration": 150,
            "preparationTime": 30,
            "retriesAllowed": 1
        },
        { 
            "id": 5, 
            "question": "Where do you see yourself in 5 years, and how does this position align with your career goals?",
            "duration": 120,
            "preparationTime": 15,
            "retriesAllowed": 0
        },
        { 
            "id": 6, 
            "question": "Explain a complex technical concept to someone without a technical background.",
            "duration": 180,
            "preparationTime": 45,
            "retriesAllowed": 1
        },
        { 
            "id": 7, 
            "question": "How do you ensure code quality and maintainability in your projects?",
            "duration": 150,
            "preparationTime": 30,
            "retriesAllowed": 1
        },
        { 
            "id": 8, 
            "question": "Describe a bug you encountered that was difficult to solve. What was your debugging process?",
            "duration": 180,
            "preparationTime": 30,
            "retriesAllowed": 1
        },
        { 
            "id": 9, 
            "question": "How do you handle feedback and criticism on your code/work?",
            "duration": 120,
            "preparationTime": 15,
            "retriesAllowed": 0
        },
        { 
            "id": 10, 
            "question": "What is your preferred workflow for collaborating with designers and product managers?",
            "duration": 150,
            "preparationTime": 30,
            "retriesAllowed": 1
        }
    ]
