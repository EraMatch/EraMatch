/**
 * LiveInterviewFlow.tsx — Streamlined Live Interview V2 Candidate Flow
 *
 * Flow:
 *   Step 1: Welcome
 *   Step 2: Device Test (camera + mic check)
 *   Step 3: Live Room (real AI interview via LiveKit)
 *
 * Removed from V1: Instructions, Face Detection, Ice-Breaker game, Copy/Paste
 * warnings, One-person warning. These were replaced by the real AI interaction.
 *
 * TODO (Phase 3 hardening): Before issuing the LiveKit token in step 3, validate the
 * candidate's face embedding (captured during earlier stages like the Technical
 * Assessment or Recorded Interview) against the current camera feed via the AI service
 * face-verification endpoint. This will prevent impersonation across pipeline stages.
 */

import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Sparkles, Camera, Mic, Play, AlertCircle, Loader2, PhoneOff } from 'lucide-react';
import logo from '../imports/image-eramatch.png';
import { api } from '../services/api';
import { liveInterviewService } from '../services/live-interview.service';
import { LiveInterviewRoom } from './live-interview-v2/LiveInterviewRoom';

interface LiveInterviewFlowProps {
    onSignOut: () => void;
    onExit: () => void;
    onCompletion: () => void;
}

// Step labels shown in the progress bar
const STEPS = [
    { number: 1, label: 'Welcome' },
    { number: 2, label: 'Device Test' },
    { number: 3, label: 'Interview' },
];

export function LiveInterviewFlow({ onSignOut, onExit, onCompletion }: LiveInterviewFlowProps) {
    const [currentStep, setCurrentStep] = useState(1);

    // Device test state
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [hasRecorded, setHasRecorded] = useState(false);
    const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    // LiveKit room token state
    const [roomToken, setRoomToken] = useState<string | null>(null);
    const [roomUrl, setRoomUrl] = useState<string | null>(null);
    const [roomName, setRoomName] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [timeBudgetMinutes, setTimeBudgetMinutes] = useState<number>(30);
    const [tokenLoading, setTokenLoading] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);

    // -------------------------------------------------------------------------
    // Camera management
    // -------------------------------------------------------------------------
    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setStream(mediaStream);
            setCameraError(null);
        } catch {
            setCameraError('Unable to access camera. Please check your browser permissions.');
        }
    };

    const stopCamera = () => {
        stream?.getTracks().forEach(t => t.stop());
        setStream(null);
    };

    useEffect(() => {
        if (currentStep === 2) startCamera();
        else stopCamera();
    }, [currentStep]);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => () => stopCamera(), []);

    // -------------------------------------------------------------------------
    // Device test: record a 4-second clip
    // -------------------------------------------------------------------------
    const handleRecordTestClip = () => {
        if (!stream) return;
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(null);
        setIsRecording(true);
        chunksRef.current = [];

        const mimeType = MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : undefined;
        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorder.onstop = () => {
            setHasRecorded(true);
            const blob = new Blob(chunksRef.current, { type: 'video/webm' });
            setRecordedUrl(URL.createObjectURL(blob));
        };
        recorder.start();
        setTimeout(() => {
            if (recorder.state === 'recording') {
                recorder.stop();
                setIsRecording(false);
            }
        }, 4000);
    };

    // -------------------------------------------------------------------------
    // Fetch a LiveKit token from the backend before entering the room
    // -------------------------------------------------------------------------
    const fetchRoomToken = async () => {
        setTokenLoading(true);
        setTokenError(null);
        try {
            const data = await api.liveInterview.getSessionToken() as {
                token: string;
                url: string;
                room_name: string;
                session_id: string;
                time_budget_minutes?: number;
            };
            setRoomToken(data.token);
            setRoomUrl(data.url);
            setRoomName(data.room_name);
            setSessionId(data.session_id);
            setTimeBudgetMinutes(data.time_budget_minutes || 10);
            setCurrentStep(3);
        } catch (err: any) {
            setTokenError(
                err?.message ||
                'Failed to connect to the interview. Please try again or contact support.'
            );
        } finally {
            setTokenLoading(false);
        }
    };

    // -------------------------------------------------------------------------
    // Render
    // -------------------------------------------------------------------------
    const renderStepContent = () => {
        // --- Step 3: Live Room (takes over the full screen) ---
        if (currentStep === 3 && roomToken && roomUrl && roomName) {
            const handleCompletion = async () => {
                if (sessionId) {
                    try { await liveInterviewService.completeSession(sessionId); } catch { /* safety-net, don't block */ }
                }
                onCompletion();
            };
            const handleExit = async () => {
                if (sessionId) {
                    try { await liveInterviewService.completeSession(sessionId); } catch { /* safety-net, don't block */ }
                }
                onExit();
            };
            return (
                <LiveInterviewRoom
                    token={roomToken}
                    serverUrl={roomUrl}
                    roomName={roomName}
                    sessionId={sessionId!}
                    timeBudgetMinutes={timeBudgetMinutes}
                    onComplete={handleCompletion}
                    onExit={handleExit}
                />
            );
        }

        switch (currentStep) {
            // -----------------------------------------------------------------
            // Step 1: Welcome
            // -----------------------------------------------------------------
            case 1:
                return (
                    <Card className="max-w-3xl mx-auto p-12">
                        <div className="flex flex-col items-center text-center space-y-6">
                            <div className="w-16 h-16 rounded-full flex items-center justify-center bg-indigo-500">
                                <Sparkles className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-2xl font-semibold text-gray-700">Welcome to Your Live AI Interview</h2>
                            <p className="text-gray-500 max-w-md">
                                You're about to have a real conversation with our AI interviewer.
                                It will ask you questions, listen carefully, and may follow up
                                to explore your answers further — just like a real interview.
                            </p>
                            <ul className="space-y-3 text-left w-full max-w-md pt-2">
                                {[
                                    'Natural, conversational back-and-forth',
                                    'Approximately 30 minutes total',
                                    'Speak clearly; take your time to think',
                                    'Ensure you\'re in a quiet, well-lit environment',
                                ].map(item => (
                                    <li key={item} className="flex items-start gap-3 text-gray-600 text-sm">
                                        <span className="text-emerald-500 mt-0.5">✓</span>
                                        {item}
                                    </li>
                                ))}
                            </ul>
                            <Button
                                className="w-full max-w-md mt-4 text-white rounded-full bg-indigo-500 hover:bg-indigo-600"
                                onClick={() => setCurrentStep(2)}
                            >
                                Set Up My Device
                            </Button>
                        </div>
                    </Card>
                );

            // -----------------------------------------------------------------
            // Step 2: Device test
            // -----------------------------------------------------------------
            case 2:
                return (
                    <Card className="max-w-3xl mx-auto p-8 space-y-6">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-indigo-500">
                                <Camera className="w-6 h-6 text-white" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-700">Test Your Camera &amp; Microphone</h3>
                        </div>

                        <p className="text-gray-500 text-sm">
                            Record a short test clip to confirm everything is working before joining.
                        </p>

                        {/* Video preview */}
                        <div
                            className="rounded-xl overflow-hidden relative bg-slate-900 shadow-lg"
                            style={{ aspectRatio: '16/9' }}
                        >
                            {isPlaying ? (
                                <video src={recordedUrl || ''} controls autoPlay className="w-full h-full object-contain" />
                            ) : stream ? (
                                <div className="relative w-full h-full">
                                    <video
                                        ref={videoRef} autoPlay muted playsInline
                                        className="w-full h-full object-cover"
                                        style={{ transform: 'scaleX(-1)' }}
                                    />
                                    {isRecording && (
                                        <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-500/80 text-white px-3 py-1 rounded-full animate-pulse text-xs font-medium">
                                            <div className="w-2.5 h-2.5 bg-white rounded-full" />
                                            Recording…
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center">
                                    <Camera className="w-14 h-14 text-slate-600 mb-3" />
                                    <p className="text-slate-500 text-sm">{cameraError || 'Camera not available'}</p>
                                    {cameraError && (
                                        <Button variant="outline" size="sm" onClick={startCamera} className="mt-4">
                                            Retry
                                        </Button>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Mic indicator */}
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                            <Mic className="w-4 h-4" />
                            <span>Microphone</span>
                            <div className="h-1.5 w-28 bg-gray-200 rounded-full overflow-hidden ml-2">
                                <div className="h-full bg-emerald-400 animate-pulse" style={{ width: '65%' }} />
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="grid grid-cols-2 gap-4">
                            <Button
                                className={`text-white rounded-full transition-colors ${isRecording ? 'bg-red-500 animate-pulse hover:bg-red-600' : 'bg-indigo-500 hover:bg-indigo-600'}`}
                                onClick={handleRecordTestClip}
                                disabled={isRecording || isPlaying}
                            >
                                {isRecording ? 'Recording…' : hasRecorded ? 'Record Again' : 'Record Test Clip'}
                            </Button>
                            <Button
                                variant="outline"
                                className="rounded-full"
                                onClick={() => setIsPlaying(true)}
                                disabled={!hasRecorded || isRecording}
                            >
                                <Play className="w-4 h-4 mr-2" />
                                Play Clip
                            </Button>
                        </div>

                        <p className="text-center text-gray-400 text-xs">
                            Ensure permissions are enabled before joining.
                        </p>

                        {/* Token error */}
                        {tokenError && (
                            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-600 text-sm">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {tokenError}
                            </div>
                        )}

                        <div className="flex justify-between pt-2">
                            <Button variant="outline" className="rounded-full" onClick={() => setCurrentStep(1)}>
                                Back
                            </Button>
                            <Button
                                className="text-white rounded-full bg-indigo-500 hover:bg-indigo-600 min-w-[140px]"
                                onClick={fetchRoomToken}
                                disabled={tokenLoading}
                            >
                                {tokenLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Connecting…
                                    </>
                                ) : 'Start Interview'}
                            </Button>
                        </div>
                    </Card>
                );

            default:
                return null;
        }
    };

    return (
        <div className="min-h-screen bg-[#EDF0F8] flex flex-col">
            {/* Header */}
            <header className="bg-white border-b border-gray-100 px-12 py-4 flex items-center justify-between">
                <img src={logo} alt="EraMatch" className="h-8" />
                <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-500 transition-colors"
                    onClick={onSignOut}
                >
                    Sign out
                </Button>
            </header>

            {/* Step progress bar */}
            <div className="px-12 py-6">
                <Card className="max-w-3xl mx-auto p-6">
                    <div className="flex items-center justify-between px-8">
                        {STEPS.map((step, i) => (
                            <div key={step.number} className="flex items-center">
                                <div className="flex flex-col items-center">
                                    <div
                                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium text-white transition-colors"
                                        style={{ backgroundColor: currentStep >= step.number ? '#6366F1' : '#D1D5DB' }}
                                    >
                                        {currentStep > step.number ? '✓' : step.number}
                                    </div>
                                    <span className={`text-xs mt-2 ${currentStep >= step.number ? 'text-gray-700' : 'text-gray-400'}`}>
                                        {step.label}
                                    </span>
                                </div>
                                {i < STEPS.length - 1 && (
                                    <div
                                        className="h-0.5 w-24 mx-3 mb-4 transition-colors"
                                        style={{ backgroundColor: currentStep > step.number ? '#6366F1' : '#E5E7EB' }}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Step content */}
            <main className="px-12 pb-6 flex-1 flex flex-col max-w-7xl mx-auto w-full">
                {renderStepContent()}
            </main>
        </div>
    );
}