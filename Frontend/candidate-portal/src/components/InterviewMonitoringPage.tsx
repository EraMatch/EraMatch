import React, { useState, useEffect } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { CheckCircle2, XCircle, Clock, User, FileText, BarChart3, RefreshCw } from 'lucide-react';

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

export function InterviewMonitoringPage() {
    const [candidates, setCandidates] = useState<CandidateProgress[]>([]);
    const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);
    const [responses, setResponses] = useState<InterviewResponse[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Fetch all candidates with their progress
    const fetchCandidates = async () => {
        try {
            setRefreshing(true);
            const response = await fetch('/api/v1/interview/monitoring/candidates', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setCandidates(data);
            }
        } catch (error) {
            console.error('Failed to fetch candidates:', error);
        } finally {
            setRefreshing(false);
        }
    };

    // Fetch responses for a specific candidate
    const fetchResponses = async (candidateId: string) => {
        try {
            setLoading(true);
            const response = await fetch(`/api/v1/interview/monitoring/responses/${candidateId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const data = await response.json();
                setResponses(data);
            }
        } catch (error) {
            console.error('Failed to fetch responses:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchCandidates();
        // Auto-refresh every 10 seconds
        const interval = setInterval(fetchCandidates, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (selectedCandidate) {
            fetchResponses(selectedCandidate);
        }
    }, [selectedCandidate]);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'completed': return 'bg-green-100 text-green-800';
            case 'processing': return 'bg-blue-100 text-blue-800';
            case 'pending': return 'bg-yellow-100 text-yellow-800';
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

    return (
        <div className="min-h-screen bg-[#EDF0F8] p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 mb-2">AI Interview Monitoring</h1>
                        <p className="text-gray-600">Monitor candidate responses and AI evaluation results</p>
                    </div>
                    <Button
                        onClick={fetchCandidates}
                        disabled={refreshing}
                        className="flex items-center gap-2"
                    >
                        <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>

                <div className="grid grid-cols-3 gap-6">
                    {/* Candidates List */}
                    <div className="col-span-1 space-y-4">
                        <Card className="p-4">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <User className="w-5 h-5" />
                                Candidates ({candidates.length})
                            </h2>
                            <div className="space-y-2 max-h-[600px] overflow-y-auto">
                                {candidates.map((candidate) => (
                                    <Card
                                        key={candidate.candidate_id}
                                        className={`p-4 cursor-pointer transition-all ${selectedCandidate === candidate.candidate_id
                                                ? 'ring-2 ring-indigo-500 bg-indigo-50'
                                                : 'hover:bg-gray-50'
                                            }`}
                                        onClick={() => setSelectedCandidate(candidate.candidate_id)}
                                    >
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <p className="font-medium text-gray-800">{candidate.candidate_name}</p>
                                                {candidate.average_score !== null && (
                                                    <span className={`text-sm font-bold ${getScoreColor(candidate.average_score)}`}>
                                                        {candidate.average_score.toFixed(1)}%
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-gray-500">{candidate.candidate_email}</p>
                                            <div className="flex items-center gap-2 text-xs text-gray-600">
                                                <FileText className="w-3 h-3" />
                                                {candidate.completed_questions} / {candidate.total_questions} completed
                                            </div>
                                            <div className="w-full bg-gray-200 rounded-full h-1.5">
                                                <div
                                                    className="bg-indigo-600 h-1.5 rounded-full transition-all"
                                                    style={{
                                                        width: `${(candidate.completed_questions / candidate.total_questions) * 100}%`
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </Card>
                                ))}
                            </div>
                        </Card>
                    </div>

                    {/* Responses Details */}
                    <div className="col-span-2">
                        {selectedCandidate ? (
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
                                        {responses.map((response) => (
                                            <Card key={response.id} className="p-4 border-l-4 border-indigo-500">
                                                <div className="space-y-3">
                                                    {/* Question Header */}
                                                    <div className="flex items-start justify-between">
                                                        <div className="flex-1">
                                                            <div className="flex items-center gap-2 mb-2">
                                                                <span className="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs font-medium rounded">
                                                                    Q{response.question_number}
                                                                </span>
                                                                <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(response.processing_status)}`}>
                                                                    {response.processing_status}
                                                                </span>
                                                            </div>
                                                            <p className="text-sm font-medium text-gray-700">
                                                                {response.question_text}
                                                            </p>
                                                        </div>
                                                        {response.ai_score !== null && (
                                                            <div className="ml-4 text-right">
                                                                <p className={`text-2xl font-bold ${getScoreColor(response.ai_score)}`}>
                                                                    {response.ai_score.toFixed(1)}
                                                                </p>
                                                                <p className="text-xs text-gray-500">Score</p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Transcription */}
                                                    {response.transcription && (
                                                        <div className="bg-gray-50 p-3 rounded-lg">
                                                            <p className="text-xs font-medium text-gray-600 mb-1">Transcription:</p>
                                                            <p className="text-sm text-gray-800">{response.transcription}</p>
                                                        </div>
                                                    )}

                                                    {/* AI Feedback */}
                                                    {response.ai_feedback && (
                                                        <div className="bg-blue-50 p-3 rounded-lg">
                                                            <p className="text-xs font-medium text-blue-600 mb-1">AI Feedback:</p>
                                                            <p className="text-sm text-gray-800">{response.ai_feedback}</p>
                                                        </div>
                                                    )}

                                                    {/* Metadata */}
                                                    <div className="flex items-center gap-4 text-xs text-gray-500">
                                                        <div className="flex items-center gap-1">
                                                            <Clock className="w-3 h-3" />
                                                            {new Date(response.submitted_at).toLocaleString()}
                                                        </div>
                                                        {response.video_url && (
                                                            <a
                                                                href={response.video_url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-indigo-600 hover:underline"
                                                            >
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
                                <p className="text-gray-500">Select a candidate to view their responses</p>
                            </Card>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
