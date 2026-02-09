import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, PlayCircle, StopCircle, RefreshCw, Send, ChevronRight, Clock, X } from 'lucide-react';
import { fetchAPI } from '../services/client';
import '../styles/VideoInterviewPage.css';

// Helper for API calls - trailing comma needed for generics in TSX
const candidateApi = {
    get: <T,>(endpoint: string) => fetchAPI<T>(endpoint),
    post: <T,>(endpoint: string, data: unknown) => fetchAPI<T>(endpoint, {
        method: 'POST',
        body: JSON.stringify(data),
    }),
};

interface Question {
    id: string;
    text: string;
    reference_answer?: string;
}

interface InterviewConfig {
    config_id: string;
    title: string;
    instructions: string;
    questions: Question[];
    think_time_seconds: number;
    answer_time_seconds: number;
    max_retakes: number;
}

interface Response {
    question_id: string;
    video_blob?: Blob;
    video_url?: string;
    status: 'pending' | 'recording' | 'recorded' | 'submitting' | 'submitted';
}

export default function VideoInterviewPage() {
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);

    const [config, setConfig] = useState<InterviewConfig | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [phase, setPhase] = useState<'loading' | 'intro' | 'thinking' | 'recording' | 'review' | 'submitted' | 'complete'>('loading');
    const [countdown, setCountdown] = useState(0);
    const [responses, setResponses] = useState<Response[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

    // Load interview config
    useEffect(() => {
        async function loadConfig() {
            try {
                const data = await candidateApi.get<InterviewConfig>('/interview/config');
                setConfig(data);
                setResponses(data.questions.map((q: Question) => ({
                    question_id: q.id,
                    status: 'pending' as const,
                })));
                setPhase('intro');
            } catch (err: unknown) {
                const errorMessage = err instanceof Error ? err.message : 'Failed to load interview';
                setError(errorMessage);
            }
        }
        loadConfig();
    }, []);

    // Start session
    const startInterview = async () => {
        if (!config) return;

        try {
            const data = await candidateApi.post<{ session_id: string }>('/interview/start', {
                config_id: config.config_id,
            });
            setSessionId(data.session_id);
            startThinking();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to start interview';
            setError(errorMessage);
        }
    };

    // Initialize camera
    const initCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: true,
            });
            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
            return mediaStream;
        } catch (err: unknown) {
            setError('Camera access denied. Please allow camera and microphone access.');
            return null;
        }
    };

    // Start thinking phase
    const startThinking = async () => {
        setPhase('thinking');
        const mediaStream = await initCamera();
        if (!mediaStream || !config) return;

        let time = config.think_time_seconds;
        setCountdown(time);

        const timer = setInterval(() => {
            time--;
            setCountdown(time);
            if (time <= 0) {
                clearInterval(timer);
                startRecording(mediaStream);
            }
        }, 1000);
    };

    // Start recording
    const startRecording = (mediaStream: MediaStream) => {
        setPhase('recording');
        chunksRef.current = [];

        if (!config) return;

        const mediaRecorder = new MediaRecorder(mediaStream, {
            mimeType: 'video/webm;codecs=vp8,opus',
        });

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                chunksRef.current.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            const videoUrl = URL.createObjectURL(blob);

            setResponses(prev => prev.map((r, i) =>
                i === currentQuestionIndex
                    ? { ...r, video_blob: blob, video_url: videoUrl, status: 'recorded' as const }
                    : r
            ));
            setPhase('review');
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(1000);

        // Auto-stop after answer time
        let time = config.answer_time_seconds;
        setCountdown(time);

        const timer = setInterval(() => {
            time--;
            setCountdown(time);
            if (time <= 0) {
                clearInterval(timer);
                stopRecording();
            }
        }, 1000);
    };

    // Stop recording
    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
    };

    // Retake question
    const retakeQuestion = () => {
        if (stream) {
            startRecording(stream);
        }
    };

    // Submit response
    const submitResponse = async () => {
        if (!config || !sessionId) return;

        const question = config.questions[currentQuestionIndex];
        const response = responses[currentQuestionIndex];

        if (!response.video_blob) return;

        setResponses(prev => prev.map((r, i) =>
            i === currentQuestionIndex ? { ...r, status: 'submitting' as const } : r
        ));

        try {
            // For now, create a mock video URL (in production, upload to storage first)
            const mockVideoUrl = `https://storage.example.com/interviews/${sessionId}/${question.id}.webm`;

            await candidateApi.post('/interview/response', {
                session_id: sessionId,
                question_id: question.id,
                question_order: currentQuestionIndex + 1,
                question_text: question.text,
                video_url: mockVideoUrl,
                reference_answer: question.reference_answer,
            });

            setResponses(prev => prev.map((r, i) =>
                i === currentQuestionIndex ? { ...r, status: 'submitted' as const } : r
            ));

            // Move to next question or complete
            if (currentQuestionIndex < config.questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                startThinking();
            } else {
                setPhase('complete');
                // Stop camera
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to submit response';
            setError(errorMessage);
        }
    };

    // Auto-redirect to homepage after interview completion
    useEffect(() => {
        if (phase === 'complete') {
            const timer = setTimeout(() => {
                navigate('/home');
            }, 5000);
            return () => clearTimeout(timer);
        }
    }, [phase, navigate]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
        };
    }, [stream]);

    if (error) {
        return (
            <div className="interview-page">
                <div className="error-container">
                    <X size={48} className="error-icon" />
                    <h2>Error</h2>
                    <p>{error}</p>
                    <button onClick={() => navigate('/candidate')}>Return to Dashboard</button>
                </div>
            </div>
        );
    }

    if (phase === 'loading' || !config) {
        return (
            <div className="interview-page">
                <div className="loading-container">
                    <RefreshCw size={48} className="spin" />
                    <p>Loading interview...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="interview-page">
            <header className="interview-header">
                <div className="interview-title">
                    <Video size={24} />
                    <h1>{config.title}</h1>
                </div>
                <div className="progress-indicator">
                    Question {currentQuestionIndex + 1} of {config.questions.length}
                </div>
            </header>

            <main className="interview-content">
                {phase === 'intro' && (
                    <div className="intro-container">
                        <h2>Welcome to Your AI Interview</h2>
                        <p className="instructions">{config.instructions}</p>

                        <div className="info-cards">
                            <div className="info-card">
                                <Clock size={32} />
                                <h3>Think Time</h3>
                                <p>{config.think_time_seconds} seconds</p>
                            </div>
                            <div className="info-card">
                                <Video size={32} />
                                <h3>Answer Time</h3>
                                <p>{config.answer_time_seconds} seconds</p>
                            </div>
                            <div className="info-card">
                                <RefreshCw size={32} />
                                <h3>Retakes</h3>
                                <p>{config.max_retakes} allowed</p>
                            </div>
                        </div>

                        <div className="questions-preview">
                            <h3>Questions ({config.questions.length})</h3>
                            <ul>
                                {config.questions.map((q, i) => (
                                    <li key={q.id}>Q{i + 1}: {q.text}</li>
                                ))}
                            </ul>
                        </div>

                        <button className="start-button" onClick={startInterview}>
                            <PlayCircle size={24} />
                            Start Interview
                        </button>
                    </div>
                )}

                {(phase === 'thinking' || phase === 'recording' || phase === 'review') && (
                    <div className="recording-container">
                        <div className="question-display">
                            <span className="question-number">Question {currentQuestionIndex + 1}</span>
                            <p className="question-text">{config.questions[currentQuestionIndex].text}</p>
                        </div>

                        <div className="video-container">
                            <video
                                ref={videoRef}
                                autoPlay
                                muted={phase !== 'review'}
                                playsInline
                                className={phase === 'review' ? 'preview' : ''}
                            />

                            {phase === 'thinking' && (
                                <div className="countdown-overlay thinking">
                                    <p>Think about your answer</p>
                                    <span className="countdown">{countdown}</span>
                                </div>
                            )}

                            {phase === 'recording' && (
                                <div className="recording-indicator">
                                    <span className="rec-dot" />
                                    REC • {countdown}s remaining
                                </div>
                            )}
                        </div>

                        <div className="controls">
                            {phase === 'recording' && (
                                <button className="stop-button" onClick={stopRecording}>
                                    <StopCircle size={24} />
                                    Stop Recording
                                </button>
                            )}

                            {phase === 'review' && (
                                <>
                                    <button className="retake-button" onClick={retakeQuestion}>
                                        <RefreshCw size={20} />
                                        Retake
                                    </button>
                                    <button className="submit-button" onClick={submitResponse}>
                                        <Send size={20} />
                                        Submit & Continue
                                        <ChevronRight size={20} />
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}

                {phase === 'complete' && (
                    <div className="complete-container">
                        <div className="success-icon">✓</div>
                        <h2>Interview Complete!</h2>
                        <p>Thank you for completing your AI interview.</p>
                        <p>Your responses are being processed and will be reviewed by the hiring team.</p>
                        <p className="redirect-notice">Redirecting to homepage in 5 seconds...</p>
                        <button onClick={() => navigate('/home')}>
                            Return to Homepage
                        </button>
                    </div>
                )}
            </main>
        </div>
    );
}
