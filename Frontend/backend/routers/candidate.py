from fastapi import APIRouter
from typing import List, Dict, Any
from utils import read_csv

router = APIRouter()

@router.get("/candidates/selected")
def get_selected_candidates():
    return read_csv("selected_candidates.csv")

@router.get("/candidates/{candidate_id}")
def get_candidate_details(candidate_id: int):
    # Mock comprehensive candidate profile combining profile data and pipeline status
    return {
        "id": candidate_id,
        "name": 'John Smith',
        "email": 'john.smith@email.com',
        "phone": '+1 (555) 123-4567',
        "location": 'San Francisco, CA',
        "avatar": None,
        "title": 'Senior Full Stack Developer',
        "experience": 8,
        "about": "Passionate full-stack developer with over 8 years of experience building scalable web applications. Expert in React, Node.js, and cloud architecture.",
        "skills": ['React', 'TypeScript', 'Node.js', 'AWS', 'Docker', 'PostgreSQL'],
        "education": [
             {
                "degree": 'Master of Science in Computer Science',
                "school": 'Stanford University',
                "year": '2015-2017'
            },
            {
                "degree": 'Bachelor of Science in Computer Engineering',
                "school": 'University of California, Berkeley',
                "year": '2011-2015'
            }
        ],
        "workHistory": [
            {
                "title": "Senior Software Engineer",
                "company": "Tech Corp",
                "duration": "2020 - Present",
                "description": "Leading the frontend team, architecting micro-frontends, and mentoring junior developers."
            },
            {
                "title": "Software Engineer",
                "company": "Startup Inc",
                "duration": "2017 - 2020",
                "description": "Full stack development using MERN stack. Implemented real-time features using WebSockets."
            }
        ],
        "scores": {
            "overall": 95,
            "assessment": 92,
            "aiInterview": 88,
            "github": 90
        },
        "pipelineStatus": {
            "groupAssignment": { "status": 'completed', "completedAt": '2025-01-15 09:00' },
            "assessment": { "status": 'completed', "completedAt": '2025-01-16 14:30' },
            "aiInterview": { "status": 'completed', "completedAt": '2025-01-18 10:15' },
            "liveInterview": { "status": 'completed', "completedAt": '2025-01-20 15:45' },
            "finalDecision": { "status": 'pending', "completedAt": None }
        },
        "assessmentQuestions": [
             {
                "id": 1,
                "text": "Explain React Hooks",
                "score": 95,
                "maxScore": 100,
                "feedback": "Excellent explanation of useEffect and useState."
             }
        ],
        "videoInterviewQuestions": [
            {
                "id": 1,
                "question": "Tell me about a challenging project you worked on.",
                "duration": "2:30",
                "score": 9,
                "transcript": "In my previous role, I led the migration of a monolithic application to microservices..."
            },
            {
                "id": 2,
                "question": "How do you handle disagreement with a team member?",
                "duration": "1:45",
                "score": 8,
                "transcript": "I believe in open communication and active listening. When I have a disagreement..."
            }
        ],
        "assessmentData": {
            "questionsCorrect": 46,
            "questionsTotal": 50,
            "completedAt": "2025-01-16 14:30",
            "duration": "45m",
            "topicScores": [
                 { "topic": "React", "score": 95 },
                 { "topic": "TypeScript", "score": 90 },
                 { "topic": "System Design", "score": 85 }
            ]
        },
        "interviewData": {
            "completedAt": "2025-01-18 10:15",
            "duration": "25m",
            "overallFeedback": "Candidate demonstrated strong communication skills and technical depth."
        },
        "liveInterviewData": {
            "duration": "45:00",
            "completedAt": "2025-01-20 15:45",
            "overallConfidence": 85,
            "overallCorrectness": 90,
            "emotionMetrics": [
                { "emotion": "Confidence", "percentage": 85, "icon": "trending-up", "color": "#10b981" },
                { "emotion": "Calmness", "percentage": 90, "icon": "smile", "color": "#6366f1" },
                { "emotion": "Enthusiasm", "percentage": 75, "icon": "activity", "color": "#f59e0b" },
                { "emotion": "Professionalism", "percentage": 95, "icon": "meh", "color": "#3b82f6" }
            ],
            "transcript": "Interviewer: Tell me about yourself...\nCandidate: I started my career..."
        },
        "resumeSummary": "Experienced developer with strong background in modern web technologies.",
        "techSkills": {
            "frontend": ["React", "Vue", "Angular"],
            "backend": ["Node.js", "Python", "Go"],
            "devops": ["AWS", "Docker", "CI/CD"]
        },
        "githubStats": {
            "publicRepos": 45,
            "totalStars": 120,
            "followers": 35,
            "contributionsLastYear": 850,
            "languages": [
                { "name": "TypeScript", "percentage": 60, "color": "#2b7489" },
                { "name": "Python", "percentage": 30, "color": "#3572A5" },
                { "name": "HTML", "percentage": 10, "color": "#e34c26" }
            ],
            "topRepos": [
                {
                    "name": "react-awesome-lib",
                    "description": "A collection of awesome React hooks",
                    "language": "TypeScript",
                    "stars": 85,
                    "forks": 12,
                    "updatedAt": "2 days ago"
                }
            ]
        },
        "certifications": ["AWS Certified Solutions Architect", "Google Cloud Professional"],
        "offerStatus": "none",
        "groupAssigned": True
    }

@router.get("/candidates/{candidate_id}/suspect-review")
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

@router.get("/candidates/{candidate_id}/knowledge-graph")
def get_knowledge_graph(candidate_id: int):
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

@router.post("/candidates/skills")
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

@router.get("/candidates/{candidate_id}/assessment-details")
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

@router.get("/candidate/home")
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
            }
        ]
    }

@router.get("/candidate/assessments")
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

@router.get("/candidate/profile")
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
