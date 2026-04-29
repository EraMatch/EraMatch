import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { CheckCircle2, XCircle, Clock, User, FileText, BarChart3, RefreshCw, Code2, BookOpen, ListChecks, Activity, AlertTriangle } from 'lucide-react';

// ─── Interview Interfaces ────────────────────────────────────────────
interface InterviewResponse {
    id: string;
    candidate_name: string;
    candidate_email: string;
    question_number: number;
    question_text: string;
    video_url: string;
    transcription: string | null;
    ai_score: number | null;
    ai_feedback: string | null;
    processing_status: 'pending' | 'processing' | 'completed' | 'failed';
    submitted_at: string;
}

interface CandidateProgress {
    candidate_id: string;
    candidate_name: string;
    candidate_email: string;
    total_questions: number;
    completed_questions: number;
    average_score: number | null;
    status: string;
    last_updated: string;
}

// ─── Assessment Interfaces ───────────────────────────────────────────
interface AssessmentCandidate {
    candidate_id: string;
    candidate_name: string;
    candidate_email: string;
    assessment_title: string;
    total_questions: number;
    answered_questions: number;
    total_score: number | null;
    max_score: number | null;
    percentage: number | null;
    status: string;
    started_at: string | null;
    submitted_at: string | null;
}

interface AssessmentAnswer {
    answer_id: string;
    question_text: string;
    question_type: string;
    answer_data: Record<string, any>;
    is_correct: boolean | null;
    points_earned: number | null;
    points_max: number;
    time_spent_seconds: number | null;
    answered_at: string | null;
}

type TabType = 'interviews' | 'assessments' | 'live_interviews';

interface LiveInterviewSession {
    session_id: string;
    state: string;
    duration_seconds: number | null;
    started_at: string | null;
    ended_at: string | null;
    transcript: Array<{ role: string; text: string }>;
    evaluation: {
        overall_score_pct: number;
        auto_verdict: string;
        evaluation_confidence: string;
        dimension_scores: Record<string, {
            score: number; anchor_matched: string;
            cited_quote: string; reasoning: string;
            weight: number; dimension_name: string;
        }>;
        per_question_results?: Record<string, {
            question_score: number; question_text: string;
            sub_criteria: Array<{ name: string; score: number; covered: boolean }>;
            cited_quote: string; reasoning: string;
        }>;
    } | null;
}

export function InterviewMonitoringPage() {
    const [activeTab, setActiveTab] = useState<TabType>('interviews');

    // Interview state
    const [candidates, setCandidates] = useState<CandidateProgress[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
    const [responses, setResponses] = useState<InterviewResponse[]>([]);

    // Assessment state
    const [assessmentCandidates, setAssessmentCandidates] = useState<AssessmentCandidate[]>([]);
    const [selectedAssessmentCandidate, setSelectedAssessmentCandidate] = useState<string | null>(null);
    const [assessmentAnswers, setAssessmentAnswers] = useState<AssessmentAnswer[]>([]);

    // Live Interview state
    const [liveSession, setLiveSession] = useState<LiveInterviewSession | null>(null);
    const [liveLoading, setLiveLoading] = useState(false);

    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const BASE = 'http://localhost:8000/api/v1/interview/monitoring';
    const headers = { Authorization: `Bearer ${localStorage.getItem('access_token')}` };

    // ─── Interview fetchers ──────────────────────────────────────────
    const fetchCandidates = async () => {
        try {
            setRefreshing(true);
            const response = await fetch(`${BASE}/candidates`, { headers });
            if (response.ok) setCandidates(await response.json());
        } catch (error) {
            console.error('Failed to fetch candidates:', error);
        } finally {
            setRefreshing(false);
        }
    };

    const fetchResponses = async (candidateId: string) => {
        try {
            setLoading(true);
            const response = await fetch(`${BASE}/responses/${candidateId}`, { headers });
            if (response.ok) setResponses(await response.json());
        } catch (error) {
            console.error('Failed to fetch responses:', error);
        } finally {
            setLoading(false);
        }
    };

    // ─── Assessment fetchers ─────────────────────────────────────────
    const fetchAssessmentCandidates = async () => {
        try {
            setRefreshing(true);
            const response = await fetch(`${BASE}/assessment-candidates`, { headers });
            if (response.ok) setAssessmentCandidates(await response.json());
        } catch (error) {
            console.error('Failed to fetch assessment candidates:', error);
        } finally {
            setRefreshing(false);
        }
    };

    const fetchAssessmentAnswers = async (candidateId: string) => {
        try {
            setLoading(true);
            const response = await fetch(`${BASE}/assessment-responses/${candidateId}`, { headers });
            if (response.ok) setAssessmentAnswers(await response.json());
        } catch (error) {
            console.error('Failed to fetch assessment answers:', error);
        } finally {
            setLoading(false);
        }
    };

    // ─── Live Interview fetchers ─────────────────────────────────────
    const fetchLiveInterview = async () => {
        try {
            setLiveLoading(true);
            const response = await fetch('http://localhost:8000/api/v1/live-interview-v2/session', { headers });
            if (response.ok) {
                const data = await response.json();
                setLiveSession(data);
            } else {
                setLiveSession(null);
            }
        } catch (error) {
            console.error('No live interview session yet or backend not ready:', error);
            setLiveSession(null);
        } finally {
            setLiveLoading(false);
        }
    };

    // ─── Effects ─────────────────────────────────────────────────────
    useEffect(() => {
        if (activeTab === 'interviews') {
            fetchCandidates();
            const interval = setInterval(fetchCandidates, 10000);
            return () => clearInterval(interval);
        } else if (activeTab === 'assessments') {
            fetchAssessmentCandidates();
            const interval = setInterval(fetchAssessmentCandidates, 10000);
            return () => clearInterval(interval);
        } else if (activeTab === 'live_interviews') {
            fetchLiveInterview();
            const interval = setInterval(fetchLiveInterview, 5000); // 5s polling
            return () => clearInterval(interval);
        }
    }, [activeTab]);

    useEffect(() => {
        if (selectedCandidate) fetchResponses(selectedCandidate);
    }, [selectedCandidate]);

    useEffect(() => {
        if (selectedAssessmentCandidate) fetchAssessmentAnswers(selectedAssessmentCandidate);
    }, [selectedAssessmentCandidate]);

    // ─── Helpers ─────────────────────────────────────────────────────
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-800';
            case 'processing': case 'in_progress': return 'bg-blue-100 text-blue-800';
            case 'pending': case 'unlocked': return 'bg-yellow-100 text-yellow-800';
            case 'failed': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const getScoreColor = (score: number | null) => {
        if (score === null) return 'text-gray-500';
        if (score >= 80) return 'text-green-600';
        if (score >= 60) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'mcq': return <ListChecks className="w-4 h-4" />;
            case 'code': case 'coding': return <Code2 className="w-4 h-4" />;
            case 'essay': return <BookOpen className="w-4 h-4" />;
            default: return <FileText className="w-4 h-4" />;
        }
    };

    const handleRefresh = () => {
        if (activeTab === 'interviews') fetchCandidates();
        else if (activeTab === 'assessments') fetchAssessmentCandidates();
        else fetchLiveInterview();
    };

    // ─── Render ──────────────────────────────────────────────────────
    return (
        <div className="min-h-screen bg-[#EDF0F8] p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 mb-2">Pipeline Monitoring</h1>
                        <p className="text-gray-600">Monitor candidate responses and evaluation results</p>
                    </div>
                    <Button onClick={handleRefresh} disabled={refreshing} className="flex items-center gap-2">
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                {/* Tabs */}
                <div className="flex gap-2 mb-6">
                    <button
                        onClick={() => { setActiveTab('interviews'); setSelectedCandidate(null); setResponses([]); }}
                        className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                            activeTab === 'interviews'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-white text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        AI Interviews
                    </button>
                    <button
                        onClick={() => { setActiveTab('assessments'); setSelectedAssessmentCandidate(null); setAssessmentAnswers([]); }}
                        className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                            activeTab === 'assessments'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-white text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        Assessments
                    </button>
                    <button
                        onClick={() => { setActiveTab('live_interviews'); setLiveSession(null); }}
                        className={`px-5 py-2.5 rounded-lg font-medium text-sm transition-all ${
                            activeTab === 'live_interviews'
                                ? 'bg-indigo-600 text-white shadow-md'
                                : 'bg-white text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        Live Interview
                    </button>
                </div>

                <div className="grid grid-cols-3 gap-6">
                    {activeTab === 'live_interviews' ? (
                        <div className="col-span-3">
                            <Card className="p-6">
                                <h2 className="text-lg font-semibold mb-6 flex items-center gap-2">
                                    <Activity className="w-5 h-5 text-indigo-600" />
                                    Live Interview Session
                                </h2>
                                {liveLoading && !liveSession ? (
                                    <div className="flex items-center justify-center py-12">
                                        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                                    </div>
                                ) : !liveSession ? (
                                    <div className="text-center py-12 text-gray-500">
                                        No live interview session yet.
                                    </div>
                                ) : liveSession.state === 'completed' && !liveSession.evaluation ? (
                                    <div className="text-center py-12">
                                        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-4" />
                                        <p className="text-gray-600 font-medium">Grading in progress...</p>
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            {/* Score Ring & Verdict */}
                                            <Card className="p-6 flex flex-col items-center justify-center text-center col-span-1 border-t-4 border-indigo-500">
                                                <div className="relative w-32 h-32 flex items-center justify-center rounded-full border-8 border-gray-100 mb-4">
                                                    <div 
                                                        className="absolute inset-0 rounded-full border-8 border-indigo-600"
                                                        style={{
                                                            clipPath: liveSession.evaluation?.overall_score_pct 
                                                                ? `polygon(0 0, 100% 0, 100% ${liveSession.evaluation.overall_score_pct}%, 0 ${liveSession.evaluation.overall_score_pct}%)` 
                                                                : 'none'
                                                        }}
                                                    />
                                                    <span className="text-3xl font-bold text-gray-800">
                                                        {liveSession.evaluation?.overall_score_pct || 0}%
                                                    </span>
                                                </div>
                                                <h3 className="text-sm font-medium text-gray-500 mb-1">Verdict</h3>
                                                <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                                                    liveSession.evaluation?.auto_verdict === 'strong_pass' || liveSession.evaluation?.auto_verdict === 'pass' 
                                                        ? 'bg-green-100 text-green-800' 
                                                        : liveSession.evaluation?.auto_verdict === 'borderline' 
                                                            ? 'bg-yellow-100 text-yellow-800' 
                                                            : 'bg-red-100 text-red-800'
                                                }`}>
                                                    {(liveSession.evaluation?.auto_verdict || 'N/A').replace('_', ' ').toUpperCase()}
                                                </span>
                                                <p className="text-xs text-gray-400 mt-2">
                                                    Confidence: {liveSession.evaluation?.evaluation_confidence || 'N/A'}
                                                </p>
                                            </Card>

                                            {/* Dimension Breakdown */}
                                            <Card className="p-6 col-span-1 md:col-span-2">
                                                <h3 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wider">Dimension Breakdown</h3>
                                                <div className="space-y-4">
                                                    {liveSession.evaluation?.dimension_scores && Object.entries(liveSession.evaluation.dimension_scores).map(([key, dim]) => (
                                                        <div key={key}>
                                                            <div className="flex justify-between mb-1">
                                                                <span className="text-sm font-medium text-gray-700">{dim.dimension_name}</span>
                                                                <span className="text-sm font-bold text-indigo-600">{(dim.score * 100).toFixed(0)}%</span>
                                                            </div>
                                                            <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
                                                                <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${dim.score * 100}%` }}></div>
                                                            </div>
                                                            <p className="text-xs text-gray-500 line-clamp-2" title={dim.reasoning}>{dim.reasoning}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </Card>
                                        </div>

                                        {/* Per-Question Results */}
                                        {liveSession.evaluation?.per_question_results && Object.keys(liveSession.evaluation.per_question_results).length > 0 && (
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-800 mb-4">Question Results</h3>
                                                <div className="space-y-4">
                                                    {Object.entries(liveSession.evaluation.per_question_results).map(([qId, qData], idx) => (
                                                        <Card key={qId} className="p-5 border-l-4 border-blue-500">
                                                            <div className="flex justify-between items-start mb-4">
                                                                <div>
                                                                    <span className="text-xs font-bold text-blue-600 uppercase mb-1 block">Question {idx + 1}</span>
                                                                    <p className="text-sm font-medium text-gray-800">{qData.question_text}</p>
                                                                </div>
                                                                <div className="text-right ml-4">
                                                                    <span className="text-xl font-bold text-gray-800">{(qData.question_score * 100).toFixed(0)}%</span>
                                                                </div>
                                                            </div>
                                                            
                                                            {qData.sub_criteria && qData.sub_criteria.length > 0 && (
                                                                <div className="bg-gray-50 rounded-lg p-3 mb-3">
                                                                    <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Sub-criteria</p>
                                                                    <div className="space-y-2">
                                                                        {qData.sub_criteria.map((criteria, cIdx) => (
                                                                            <div key={cIdx} className="flex items-start gap-2">
                                                                                {criteria.covered ? (
                                                                                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                                                                                ) : criteria.score > 0 ? (
                                                                                    <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                                                                                ) : (
                                                                                    <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                                                                                )}
                                                                                <span className="text-sm text-gray-700">{criteria.name}</span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                            <div className="text-sm text-gray-600">
                                                                <span className="font-medium text-gray-700">Reasoning:</span> {qData.reasoning}
                                                            </div>
                                                        </Card>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Transcript Accordion */}
                                        {liveSession.transcript && liveSession.transcript.length > 0 && (
                                            <details className="group bg-white rounded-xl shadow-sm border border-gray-200">
                                                <summary className="p-4 font-semibold text-gray-800 cursor-pointer list-none flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <FileText className="w-5 h-5 text-indigo-500" />
                                                        Session Transcript
                                                    </div>
                                                    <span className="transition group-open:rotate-180">
                                                        <svg fill="none" height="24" shape-rendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
                                                    </span>
                                                </summary>
                                                <div className="p-4 pt-0 border-t border-gray-100 max-h-96 overflow-y-auto space-y-4">
                                                    {liveSession.transcript.map((msg, i) => (
                                                        <div key={i} className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                                                            <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                                                                msg.role === 'ai' 
                                                                    ? 'bg-indigo-50 text-indigo-900 rounded-tl-sm' 
                                                                    : 'bg-gray-100 text-gray-800 rounded-tr-sm'
                                                            }`}>
                                                                <p className="text-xs font-bold mb-1 opacity-70 uppercase tracking-wider">{msg.role === 'ai' ? 'Interviewer' : 'You'}</p>
                                                                <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </details>
                                        )}
                                    </div>
                                )}
                            </Card>
                        </div>
                    ) : (
                        <>
                            {/* ═══ LEFT: CANDIDATES LIST ═══ */}
                    <div className="col-span-1 space-y-4">
                        <Card className="p-4">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <User className="w-5 h-5" />
                                Candidates ({activeTab === 'interviews' ? candidates.length : assessmentCandidates.length})
                            </h2>
                            <div className="space-y-2 max-h-[600px] overflow-y-auto">
                                {activeTab === 'interviews' ? (
                                    candidates.map((c) => (
                                        <Card
                                            key={c.candidate_id}
                                            className={`p-4 cursor-pointer transition-all ${
                                                selectedCandidate === c.candidate_id
                                                    ? 'ring-2 ring-indigo-500 bg-indigo-50'
                                                    : 'hover:bg-gray-50'
                                            }`}
                                            onClick={() => setSelectedCandidate(c.candidate_id)}
                                        >
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <p className="font-medium text-gray-800">{c.candidate_name}</p>
                                                    {c.average_score !== null && (
                                                        <span className={`text-sm font-bold ${getScoreColor(c.average_score)}`}>
                                                            {c.average_score.toFixed(1)}%
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-gray-500">{c.candidate_email}</p>
                                                <div className="flex items-center gap-2 text-xs text-gray-600">
                                                    <FileText className="w-3 h-3" />
                                                    {c.completed_questions} / {c.total_questions} completed
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                                    <div
                                                        className="bg-indigo-600 h-1.5 rounded-full transition-all"
                                                        style={{ width: `${(c.completed_questions / c.total_questions) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </Card>
                                    ))
                                ) : (
                                    assessmentCandidates.map((c) => (
                                        <Card
                                            key={c.candidate_id}
                                            className={`p-4 cursor-pointer transition-all ${
                                                selectedAssessmentCandidate === c.candidate_id
                                                    ? 'ring-2 ring-indigo-500 bg-indigo-50'
                                                    : 'hover:bg-gray-50'
                                            }`}
                                            onClick={() => setSelectedAssessmentCandidate(c.candidate_id)}
                                        >
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <p className="font-medium text-gray-800">{c.candidate_name}</p>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(c.status)}`}>
                                                        {c.status}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500">{c.candidate_email}</p>
                                                <p className="text-xs text-indigo-600 font-medium">{c.assessment_title}</p>
                                                <div className="flex items-center justify-between text-xs text-gray-600">
                                                    <span>{c.answered_questions} / {c.total_questions} answered</span>
                                                    {c.percentage !== null && (
                                                        <span className={`font-bold ${getScoreColor(c.percentage)}`}>
                                                            {c.percentage.toFixed(1)}%
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-1.5">
                                                    <div
                                                        className="bg-indigo-600 h-1.5 rounded-full transition-all"
                                                        style={{ width: `${c.total_questions > 0 ? (c.answered_questions / c.total_questions) * 100 : 0}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </Card>
                                    ))
                                )}
                            </div>
                        </Card>
                    </div>

                    {/* ═══ RIGHT: DETAIL PANEL ═══ */}
                    <div className="col-span-2">
                        {activeTab === 'interviews' ? (
                            selectedCandidate ? (
                                <Card className="p-6">
                                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5" />
                                        Interview Responses
                                    </h2>
                                    {loading ? (
                                        <div className="flex items-center justify-center py-12">
                                            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {responses.map((r) => (
                                                <Card key={r.id} className="p-4 border-l-4 border-indigo-500">
                                                    <div className="space-y-3">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded">Q{r.question_number}</span>
                                                                    <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(r.processing_status)}`}>
                                                                        {r.processing_status}
                                                                    </span>
                                                                </div>
                                                                <p className="text-sm font-medium text-gray-700">{r.question_text}</p>
                                                            </div>
                                                            {r.ai_score !== null && (
                                                                <div className="ml-4 text-right">
                                                                    <p className={`text-2xl font-bold ${getScoreColor(r.ai_score)}`}>{r.ai_score.toFixed(1)}</p>
                                                                    <p className="text-xs text-gray-500">Score</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                        {r.transcription && (
                                                            <div className="bg-gray-50 p-3 rounded-lg">
                                                                <p className="text-xs font-medium text-gray-600 mb-1">Transcription:</p>
                                                                <p className="text-sm text-gray-800">{r.transcription}</p>
                                                            </div>
                                                        )}
                                                        {r.ai_feedback && (
                                                            <div className="bg-blue-50 p-3 rounded-lg">
                                                                <p className="text-xs font-medium text-blue-600 mb-1">AI Feedback:</p>
                                                                <p className="text-sm text-gray-800">{r.ai_feedback}</p>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="w-3 h-3" />
                                                                {new Date(r.submitted_at).toLocaleString()}
                                                            </div>
                                                            {r.video_url && (
                                                                <a href={`http://localhost:8000${r.video_url}`} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                                                                    View Video
                                                                </a>
                                                            )}
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </Card>
                            ) : (
                                <Card className="p-12 flex flex-col items-center justify-center text-center">
                                    <User className="w-16 h-16 text-gray-300 mb-4" />
                                    <p className="text-gray-500">Select a candidate to view their interview responses</p>
                                </Card>
                            )
                        ) : (
                            /* ─── ASSESSMENT DETAIL PANEL ─── */
                            selectedAssessmentCandidate ? (
                                <Card className="p-6">
                                    <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5" />
                                        Assessment Answers
                                    </h2>
                                    {loading ? (
                                        <div className="flex items-center justify-center py-12">
                                            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {assessmentAnswers.map((a, idx) => (
                                                <Card key={a.answer_id} className={`p-4 border-l-4 ${
                                                    a.is_correct === true ? 'border-green-500' :
                                                    a.is_correct === false ? 'border-red-500' :
                                                    'border-indigo-500'
                                                }`}>
                                                    <div className="space-y-3">
                                                        <div className="flex items-start justify-between">
                                                            <div className="flex-1">
                                                                <div className="flex items-center gap-2 mb-2">
                                                                    <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded">
                                                                        Q{idx + 1}
                                                                    </span>
                                                                    <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded flex items-center gap-1">
                                                                        {getTypeIcon(a.question_type)}
                                                                        {a.question_type.toUpperCase()}
                                                                    </span>
                                                                    {a.is_correct !== null && (
                                                                        a.is_correct ? (
                                                                            <span className="px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded flex items-center gap-1">
                                                                                <CheckCircle2 className="w-3 h-3" /> Correct
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-2 py-1 bg-red-100 text-red-800 text-xs font-medium rounded flex items-center gap-1">
                                                                                <XCircle className="w-3 h-3" /> Incorrect
                                                                            </span>
                                                                        )
                                                                    )}
                                                                </div>
                                                                <p className="text-sm font-medium text-gray-700">{a.question_text}</p>
                                                            </div>
                                                            <div className="ml-4 text-right">
                                                                <p className={`text-xl font-bold ${getScoreColor(a.points_earned !== null ? (a.points_earned / a.points_max) * 100 : null)}`}>
                                                                    {a.points_earned ?? '—'} / {a.points_max}
                                                                </p>
                                                                <p className="text-xs text-gray-500">Points</p>
                                                            </div>
                                                        </div>

                                                        {/* Answer content */}
                                                        {a.answer_data && (
                                                            <div className="bg-gray-50 p-3 rounded-lg">
                                                                <p className="text-xs font-medium text-gray-600 mb-1">Answer:</p>
                                                                {a.question_type === 'mcq' ? (
                                                                    <div>
                                                                        {a.answer_data.selected_option !== undefined && a.answer_data._mcq_options ? (
                                                                            <div className="space-y-2">
                                                                                <p className="text-sm text-gray-800">
                                                                                    Selected option: <span className="font-bold text-indigo-600">
                                                                                        {String.fromCharCode(65 + a.answer_data.selected_option)} (#{a.answer_data.selected_option})
                                                                                    </span>
                                                                                </p>
                                                                                <div className="bg-white border border-gray-200 rounded-lg p-3">
                                                                                    <p className="text-xs font-medium text-gray-500 mb-2">Selected Answer:</p>
                                                                                    <p className="text-sm text-gray-800 font-medium">
                                                                                        {a.answer_data._mcq_options[a.answer_data.selected_option] || 'Option not found'}
                                                                                    </p>
                                                                                </div>
                                                                                <div className="space-y-1">
                                                                                    <p className="text-xs font-medium text-gray-500">All Options:</p>
                                                                                    {a.answer_data._mcq_options.map((opt: string, idx: number) => (
                                                                                        <div 
                                                                                            key={idx} 
                                                                                            className={`text-xs p-2 rounded ${
                                                                                                idx === a.answer_data.selected_option 
                                                                                                    ? 'bg-indigo-50 border border-indigo-200 text-indigo-800 font-medium' 
                                                                                                    : 'bg-gray-50 border border-gray-100 text-gray-600'
                                                                                            }`}
                                                                                        >
                                                                                            <span className="font-bold">{String.fromCharCode(65 + idx)}.</span> {opt}
                                                                                            {idx === a.answer_data.selected_option && <span className="ml-2 text-indigo-600">✓ Selected</span>}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            </div>
                                                                        ) : (
                                                                            <p className="text-sm text-gray-800">
                                                                                Selected option: <span className="font-bold text-indigo-600">#{a.answer_data.selected_option ?? '—'}</span>
                                                                            </p>
                                                                        )}
                                                                    </div>
                                                                ) : a.question_type === 'essay' ? (
                                                                    <div className="space-y-3">
                                                                        <div>
                                                                            <p className="text-xs font-medium text-gray-500 mb-1">Candidate's Answer:</p>
                                                                            <p className="text-sm text-gray-800 whitespace-pre-wrap bg-white border border-gray-200 rounded-lg p-3">
                                                                                {a.answer_data.text || '(No answer)'}
                                                                            </p>
                                                                        </div>
                                                                        {a.answer_data.ai_feedback && (
                                                                            <div>
                                                                                <p className="text-xs font-medium text-blue-600 mb-1">AI Feedback:</p>
                                                                                <p className="text-sm text-blue-800 whitespace-pre-wrap bg-blue-50 border border-blue-200 rounded-lg p-3">
                                                                                    {a.answer_data.ai_feedback}
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                        {a.answer_data._reference_answer && (
                                                                            <div>
                                                                                <p className="text-xs font-medium text-green-600 mb-1">Reference Answer:</p>
                                                                                <p className="text-sm text-green-800 whitespace-pre-wrap bg-green-50 border border-green-200 rounded-lg p-3">
                                                                                    {a.answer_data._reference_answer}
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                        {a.answer_data._rubric && (
                                                                            <div>
                                                                                <p className="text-xs font-medium text-purple-600 mb-1">Evaluation Rubric:</p>
                                                                                <p className="text-sm text-purple-800 whitespace-pre-wrap bg-purple-50 border border-purple-200 rounded-lg p-3">
                                                                                    {a.answer_data._rubric}
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : (
                                                                    <div>
                                                                        <pre className="text-xs text-gray-100 bg-gray-900 p-4 rounded-lg overflow-x-auto font-mono">
                                                                            {a.answer_data.code || '(No code)'}
                                                                        </pre>
                                                                        
                                                                        {/* Test Results for Coding */}
                                                                        {a.answer_data.test_results && a.answer_data.test_results.length > 0 && (
                                                                            <div className="mt-3 space-y-2">
                                                                                <p className="text-xs font-medium text-gray-600">Test Cases:</p>
                                                                                {a.answer_data.test_results.map((tr: any, idx: number) => (
                                                                                    <div key={idx} className={`p-2 rounded text-xs ${
                                                                                        tr.passed ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                                                                                    }`}>
                                                                                        <div className="flex items-center justify-between">
                                                                                            <span className="font-medium">Test {idx + 1}</span>
                                                                                            <span className={tr.passed ? 'text-green-600' : 'text-red-600'}>
                                                                                                {tr.passed ? '✓ Passed' : '✗ Failed'}
                                                                                            </span>
                                                                                        </div>
                                                                                        <div className="mt-1 grid grid-cols-2 gap-2 text-gray-600">
                                                                                            <div>
                                                                                                <span className="font-medium">Expected:</span>
                                                                                                <pre className="mt-0.5 text-gray-800">{tr.expected || '—'}</pre>
                                                                                            </div>
                                                                                            <div>
                                                                                                <span className="font-medium">Actual:</span>
                                                                                                <pre className="mt-0.5 text-gray-800">{tr.actual || tr.error || '(no output)'}</pre>
                                                                                            </div>
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        
                                                                        {/* Hidden Test Summary */}
                                                                        {(a.answer_data.hidden_passed !== undefined || a.answer_data.hidden_total !== undefined) && (
                                                                            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                                                                                <p className="text-yellow-700">
                                                                                    Hidden tests: {a.answer_data.hidden_passed || 0}/{a.answer_data.hidden_total || 0} passed
                                                                                </p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {/* Metadata */}
                                                        <div className="flex items-center gap-4 text-xs text-gray-500">
                                                            {a.time_spent_seconds !== null && (
                                                                <div className="flex items-center gap-1">
                                                                    <Clock className="w-3 h-3" />
                                                                    {Math.floor(a.time_spent_seconds / 60)}m {a.time_spent_seconds % 60}s
                                                                </div>
                                                            )}
                                                            {a.answered_at && (
                                                                <span>{new Date(a.answered_at).toLocaleString()}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                            {assessmentAnswers.length === 0 && (
                                                <p className="text-center text-gray-500 py-8">No answers submitted yet</p>
                                            )}
                                        </div>
                                    )}
                                </Card>
                            ) : (
                                <Card className="p-12 flex flex-col items-center justify-center text-center">
                                    <User className="w-16 h-16 text-gray-300 mb-4" />
                                    <p className="text-gray-500">Select a candidate to view their assessment answers</p>
                                </Card>
                            )
                        )}
                    </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
