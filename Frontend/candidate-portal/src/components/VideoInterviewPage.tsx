import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, PlayCircle, StopCircle, RefreshCw, Send, ChevronRight, Clock, X } from 'lucide-react';
import { api } from '../services/api';
import { captureVideoFrameBase64, toWaveformPayload, quantizeWaveform } from '../utils/proctoringPayload';
import '../styles/VideoInterviewPage.css';

const AI_SERVICE_BASE_URL = (import.meta as any).env?.VITE_AI_SERVICE_URL || 'http://localhost:8001';
const INTERVIEW_BIOMETRIC_INTERVAL_MS = Number((import.meta as any).env?.VITE_INTERVIEW_BIOMETRIC_INTERVAL_MS || 15000);
const INTERVIEW_BIOMETRIC_RISK_THRESHOLD = Number((import.meta as any).env?.VITE_INTERVIEW_BIOMETRIC_RISK_THRESHOLD || 0.45);
const SPEAKER_PROFILE_ID = (import.meta as any).env?.VITE_SPEAKER_PROFILE_ID || 'yousef_said_wavlm';

type ProctoringSignalResult = {
    signal_type: 'face' | 'voice' | 'gaze' | 'emotion';
    event_type: string;
    severity: 'low' | 'medium' | 'high';
    risk_score: number;
    confidence: number;
    adapter_mode: string;
    recommendation: string;
    metadata: Record<string, unknown>;
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
    const eventThrottleRef = useRef<Record<string, number>>({});
    const audioContextRef = useRef<AudioContext | null>(null);
    const audioAnalyserRef = useRef<AnalyserNode | null>(null);
    const audioBufferRef = useRef<Float32Array | null>(null);
    const latestAudioFrameRef = useRef<Float32Array | null>(null);

    const [config, setConfig] = useState<InterviewConfig | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [phase, setPhase] = useState<'loading' | 'intro' | 'thinking' | 'recording' | 'review' | 'submitted' | 'complete'>('loading');
    const [countdown, setCountdown] = useState(0);
    const [responses, setResponses] = useState<Response[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);

    const postProctoringSignal = useCallback(async (
        signal: 'face' | 'voice' | 'gaze' | 'emotion',
        payload: Record<string, unknown>,
    ): Promise<ProctoringSignalResult | null> => {
        try {
            const response = await fetch(`${AI_SERVICE_BASE_URL}/proctoring/${signal}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            if (!response.ok) {
                return null;
            }
            return await response.json() as ProctoringSignalResult;
        } catch {
            return null;
        }
    }, []);

    const emitInterviewIntegrityEvent = useCallback(async (
        eventType: string,
        severity: 'low' | 'medium' | 'high',
        metadata: Record<string, unknown> = {},
        throttleMs = 8000,
    ) => {
        if (!sessionId) return;

        const now = Date.now();
        const key = `${eventType}:${severity}`;
        const last = eventThrottleRef.current[key] || 0;
        if (now - last < throttleMs) return;
        eventThrottleRef.current[key] = now;

        try {
            await api.candidate.reportInterviewIntegrityEvent({
                session_id: sessionId,
                event_type: eventType,
                severity,
                source: 'candidate_portal',
                metadata,
            });
        } catch {
            // Keep interview flow alive even if event telemetry fails.
        }
    }, [sessionId]);

    const sampleAudio = useCallback(() => {
        const analyser = audioAnalyserRef.current;
        const buffer = audioBufferRef.current;
        if (!analyser || !buffer) return;

        (analyser as any).getFloatTimeDomainData(buffer);
        latestAudioFrameRef.current = new Float32Array(buffer);
    }, []);

    // Load interview config
    useEffect(() => {
        async function loadConfig() {
            try {
                const data = await api.candidate.getInterviewConfig() as InterviewConfig;
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
        void loadConfig();
    }, []);

    // Start session
    const startInterview = async () => {
        if (!config) return;

        try {
            const data = await api.candidate.startInterview({
                config_id: config.config_id,
            }) as { session_id: string };
            setSessionId(data.session_id);
            void startThinking();
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to start interview';
            setError(errorMessage);
        }
    };

    // Initialize camera + mic
    const initCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: { width: 1280, height: 720 },
                audio: true,
            });

            const audioCtx = new AudioContext();
            audioContextRef.current = audioCtx;
            const source = audioCtx.createMediaStreamSource(mediaStream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 1024;
            source.connect(analyser);
            audioAnalyserRef.current = analyser;
            audioBufferRef.current = new Float32Array(analyser.fftSize);

            setStream(mediaStream);
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }

            mediaStream.getTracks().forEach((track) => {
                track.onended = () => {
                    void emitInterviewIntegrityEvent('interview_media_stream_ended', 'high', {
                        track_kind: track.kind,
                    }, 12000);
                };
            });

            return mediaStream;
        } catch {
            setError('Camera access denied. Please allow camera and microphone access.');
            void emitInterviewIntegrityEvent('interview_media_permission_denied', 'high', {
                reason: 'camera_microphone_permission_denied',
            }, 15000);
            return null;
        }
    };

    // Start thinking phase
    const startThinking = async () => {
        setPhase('thinking');
        const mediaStream = stream ?? await initCamera();
        if (!mediaStream || !config) return;

        let time = config.think_time_seconds;
        setCountdown(time);

        const timer = window.setInterval(() => {
            time -= 1;
            setCountdown(time);
            if (time <= 0) {
                window.clearInterval(timer);
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
                    : r,
            ));
            setPhase('review');
        };

        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.start(1000);

        let time = config.answer_time_seconds;
        setCountdown(time);

        const timer = window.setInterval(() => {
            time -= 1;
            setCountdown(time);
            if (time <= 0) {
                window.clearInterval(timer);
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
            i === currentQuestionIndex ? { ...r, status: 'submitting' as const } : r,
        ));

        try {
            await api.candidate.uploadInterviewResponse({
                session_id: sessionId,
                question_id: question.id,
                question_text: question.text,
                video: response.video_blob,
                reference_answer: question.reference_answer,
            });

            setResponses(prev => prev.map((r, i) =>
                i === currentQuestionIndex ? { ...r, status: 'submitted' as const } : r,
            ));

            if (currentQuestionIndex < config.questions.length - 1) {
                setCurrentQuestionIndex(prev => prev + 1);
                void startThinking();
            } else {
                setPhase('complete');
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                }
                if (audioContextRef.current) {
                    void audioContextRef.current.close();
                    audioContextRef.current = null;
                }
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to submit response';
            setError(errorMessage);
        }
    };

    // Continuous interview proctoring
    useEffect(() => {
        if (!sessionId || !stream) return;
        if (!(phase === 'thinking' || phase === 'recording' || phase === 'review')) return;

        const interval = window.setInterval(async () => {
            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];
            const hasLiveVideo = !!videoTrack && videoTrack.readyState === 'live' && videoTrack.enabled;
            const hasLiveAudio = !!audioTrack && audioTrack.readyState === 'live' && audioTrack.enabled;

            if (!hasLiveVideo || !hasLiveAudio) {
                await emitInterviewIntegrityEvent('interview_media_stream_unavailable', 'high', {
                    has_live_video: hasLiveVideo,
                    has_live_audio: hasLiveAudio,
                }, 12000);
                return;
            }

            sampleAudio();
            const frameB64 = captureVideoFrameBase64(videoRef.current, 224, 224);
            const waveform = quantizeWaveform(toWaveformPayload(latestAudioFrameRef.current, 16000), 24);
            const sampleRate = audioContextRef.current?.sampleRate ?? 16000;

            const [faceResult, voiceResult, gazeResult, emotionResult] = await Promise.all([
                postProctoringSignal('face', {
                    session_id: sessionId,
                    faces_detected: 1,
                    multiple_faces: false,
                    face_match_score: 0.8,
                    liveness_score: 0.75,
                    frame_b64: frameB64,
                }),
                postProctoringSignal('voice', {
                    session_id: sessionId,
                    speaker_match_score: 0.78,
                    voice_switch_detected: false,
                    silence_ratio: 0.2,
                    background_speaker_count: 0,
                    speaker_profile_id: SPEAKER_PROFILE_ID,
                    audio_waveform: waveform,
                    audio_sample_rate: sampleRate,
                }),
                postProctoringSignal('gaze', {
                    session_id: sessionId,
                    off_screen_ratio: 0.2,
                    away_duration_seconds: 0,
                    rapid_shift_count: 0,
                    frame_b64: frameB64,
                }),
                postProctoringSignal('emotion', {
                    session_id: sessionId,
                    dominant_emotion: 'neutral',
                    stress_score: 0.2,
                    negative_ratio: 0.1,
                    frame_b64: frameB64,
                }),
            ]);

            const results = [faceResult, voiceResult, gazeResult, emotionResult].filter(Boolean) as ProctoringSignalResult[];
            for (const result of results) {
                if (result.risk_score < INTERVIEW_BIOMETRIC_RISK_THRESHOLD) continue;
                await emitInterviewIntegrityEvent(result.event_type, result.severity, {
                    source_signal: result.signal_type,
                    proctoring_risk_score: result.risk_score,
                    proctoring_confidence: result.confidence,
                    proctoring_mode: result.adapter_mode,
                    proctoring_metadata: result.metadata,
                }, 12000);
            }
        }, INTERVIEW_BIOMETRIC_INTERVAL_MS);

        return () => {
            window.clearInterval(interval);
        };
    }, [sessionId, stream, phase, sampleAudio, postProctoringSignal, emitInterviewIntegrityEvent]);

    // Auto-redirect to homepage after interview completion
    useEffect(() => {
        if (phase === 'complete') {
            const timer = window.setTimeout(() => {
                navigate('/home');
            }, 5000);
            return () => window.clearTimeout(timer);
        }
    }, [phase, navigate]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            if (audioContextRef.current) {
                void audioContextRef.current.close();
                audioContextRef.current = null;
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
