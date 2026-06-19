/**
 * LiveInterviewRoom.tsx — Real-time LiveKit Room for the candidate V2 interview.
 *
 * This component:
 * 1. Connects to the LiveKit room using the token from the backend.
 * 2. Renders the candidate's own camera feed (left panel).
 * 3. Renders an AI voice visualizer and live transcript (right panel).
 * 4. Provides an "End Interview" control.
 *
 * The AI Interviewer Agent runs server-side and its audio is received as a
 * remote track by the LiveKit room. LiveKit handles all WebRTC complexity.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import {
    LiveKitRoom,
    useRoomContext,
    useLocalParticipant,
    useRemoteParticipants,
    useTracks,
    VideoTrack,
    useVoiceAssistant,
    BarVisualizer,
    RoomAudioRenderer,
    useTrackTranscription,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { Mic, MicOff, VideoIcon, VideoOff, PhoneOff, Loader2, AlertCircle, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { liveInterviewService } from '../../services/live-interview.service';
import { API_URL } from '../../services/client';
import { AIAgentOrb } from './AIAgentOrb';
import { useExamLockdown } from '../../hooks/useExamLockdown';
import { useFullscreenGuard } from '../../hooks/useFullscreenGuard';
import { FullscreenCountdownOverlay } from '../FullscreenCountdownOverlay';
import { captureVideoFrameBase64 } from '../../utils/proctoringPayload';

interface LiveInterviewRoomProps {
    token: string;
    serverUrl: string;
    roomName: string;
    sessionId: string;
    timeBudgetMinutes?: number;
    onComplete: () => void;
    onExit: () => void;
}

// ---------------------------------------------------------------------------
// Inner room UI — rendered after LiveKitRoom context is available
// ---------------------------------------------------------------------------
function RoomUI({ sessionId, timeBudgetMinutes, onComplete, onExit }: { sessionId: string; timeBudgetMinutes?: number; onComplete: () => void; onExit: () => void }) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();

    // Local camera track
    const localTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const localVideoTrack = localTracks.find(t => t.participant === localParticipant);

    // Voice assistant state (AI agent's audio + state)
    const { audioTrack: agentAudioTrack, state: agentState, agentTranscriptions } = useVoiceAssistant();

    // Local candidate transcription (STT from LiveKit)
    const localMicTracks = useTracks([Track.Source.Microphone], { onlySubscribed: false });
    const localMicTrack = localMicTracks.find(t => t.participant === localParticipant);
    const { segments: candidateSegments } = useTrackTranscription(localMicTrack);

    const [micEnabled, setMicEnabled] = useState(true);
    const [camEnabled, setCamEnabled] = useState(true);

    const [transcript, setTranscript] = useState<Array<{ role: 'ai' | 'candidate'; text: string }>>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [agentTimeout, setAgentTimeout] = useState(false);
    const transcriptEndRef = useRef<HTMLDivElement>(null);

    // Timer state
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const [timeBudgetMin, setTimeBudgetMin] = useState(timeBudgetMinutes || 10);

    // Proctoring integrity states
    const [proctoringWarning, setProctoringWarning] = useState<string | null>(null);
    const [livenessPrompt, setLivenessPrompt] = useState<string | null>(null);
    const [trustScore, setTrustScore] = useState<number>(100);

    const FS_COUNTDOWN = 15;
    const { countdownActive: fsCountdownActive, secondsLeft: fsSecondsLeft, enterFullscreen } =
      useFullscreenGuard({
        enabled: isConnected,
        onCountdownExpired: () => {
          void handleEndInterview();
        },
        countdownSeconds: FS_COUNTDOWN,
      });

    useEffect(() => {
        if (timeBudgetMinutes && timeBudgetMinutes > 0) {
            setTimeBudgetMin(timeBudgetMinutes);
        }
    }, [timeBudgetMinutes]);

    // useEffect for timer
    useEffect(() => {
        const interval = setInterval(() => {
            setElapsedSeconds(prev => prev + 1);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Compute progress and warning state
    const progress = Math.min(elapsedSeconds / (timeBudgetMin * 60), 1);
    const isCritical = progress >= 0.95;
    const isWarning = progress >= 0.80 && !isCritical;
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = elapsedSeconds % 60;

    useEffect(() => {
        setIsConnected(room.state === 'connected');
    }, [room.state]);

    const isAgentConnected = remoteParticipants.length > 0;
    const showAgentLoading = isConnected && !isAgentConnected && !agentTimeout;

    // Agent-join timeout: if no remote participant joins within 60s, show error
    useEffect(() => {
        if (!isConnected) return;
        if (remoteParticipants.length > 0) {
            setAgentTimeout(false);
            return;
        }
        const timer = setTimeout(() => {
            if (remoteParticipants.length === 0) {
                console.warn('[AGENT-TIMEOUT] No remote participant joined within 60s');
                setAgentTimeout(true);
            }
        }, 60_000);
        return () => clearTimeout(timer);
    }, [isConnected, remoteParticipants.length]);

    // Safety-net: fire completeSession on tab close / browser navigation
    useEffect(() => {
        const handleBeforeUnload = () => {
            const payload = JSON.stringify({ transcript: [] });
            navigator.sendBeacon(
                `${API_URL}/live-interview-v2/session/${sessionId}/complete`,
                new Blob([payload], { type: 'application/json' }),
            );
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [sessionId]);

    // Subscribe to data messages from the agent (transcript updates)
    useEffect(() => {
        const handler = (data: Uint8Array) => {
            try {
                const msg = JSON.parse(new TextDecoder().decode(data));
                if (msg.type === 'transcript') {
                    setTranscript(prev => [...prev, { role: msg.role, text: msg.text }]);
                } else if (msg.type === 'session_complete') {
                    if (document.fullscreenElement) {
                        document.exitFullscreen().catch(() => {});
                    }
                    onComplete();
                }
            } catch { /* ignore non-JSON */ }
        };
        room.on('dataReceived', handler);
        return () => { room.off('dataReceived', handler); };
    }, [room, onComplete]);

    useEffect(() => {
        if (transcriptEndRef.current) {
            transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [transcript]);

    const toggleMic = useCallback(async () => {
        await localParticipant.setMicrophoneEnabled(!micEnabled);
        setMicEnabled(v => !v);
    }, [localParticipant, micEnabled]);

    const toggleCam = useCallback(async () => {
        await localParticipant.setCameraEnabled(!camEnabled);
        setCamEnabled(v => !v);
    }, [localParticipant, camEnabled]);

    const handleEndInterview = useCallback(async () => {
        try {
            await liveInterviewService.completeSession(sessionId);
        } catch (e) {
            console.warn('[SAFETY-NET] completeSession failed:', e);
        }
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        room.disconnect();
        onExit();
    }, [room, sessionId, onExit]);

    // Call useExamLockdown hook
    useExamLockdown({
        sessionId,
        enabled: isConnected,
        enforceFullscreen: true,
        onFullscreenExit: enterFullscreen,
        onViolation: useCallback((evt: any) => {
            setProctoringWarning(evt.message);
            setTimeout(() => setProctoringWarning(null), 5000);
        }, []),
        onTerminated: useCallback((msg: string) => {
            setProctoringWarning(`⚠️ ${msg}`);
            setTimeout(() => setProctoringWarning(null), 8000);
        }, []),
    });

    // Proctoring interval for unified frame analysis & YOLO
    useEffect(() => {
        if (!isConnected) return;

        const AI_SERVICE_URL = (import.meta as any).env?.VITE_AI_SERVICE_URL || 'http://localhost:8001';

        const runAnalysis = async () => {
            try {
                const videoEl = document.querySelector('video') as HTMLVideoElement | null;
                if (!videoEl) return;

                const frameB64 = captureVideoFrameBase64(videoEl, 640, 480);
                if (!frameB64) return;

                const response = await fetch(`${AI_SERVICE_URL}/proctoring/analyze-frame`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: sessionId,
                        frame_b64: frameB64,
                    }),
                });

                if (response.ok) {
                    const data = await response.json();
                    
                    // Update trust score
                    if (typeof data.trust_score === 'number') {
                        setTrustScore(data.trust_score);
                    }

                    // Termination signals are flagged but do not auto-disconnect

                    // Parse liveness challenge
                    const challenge = data.liveness_challenge || data.challenge || null;
                    if (challenge) {
                        const label = challenge.toLowerCase();
                        if (label === 'look_left') setLivenessPrompt('Please look LEFT now ⬅️');
                        else if (label === 'look_right') setLivenessPrompt('Please look RIGHT now ➡️');
                        else if (label === 'blink') setLivenessPrompt('Please BLINK now 👁️');
                        else if (label === 'smile') setLivenessPrompt('Please SMILE now 😊');
                        else if (label === 'neutral') setLivenessPrompt(null);
                        else setLivenessPrompt(`Liveness challenge: ${challenge}`);
                    } else {
                        setLivenessPrompt(null);
                    }

                    // Display warning if there are violations
                    if (data.violations && data.violations.length > 0) {
                        const latest = data.violations[data.violations.length - 1];
                        setProctoringWarning(latest.message || 'Cheating behavior detected.');
                        setTimeout(() => setProctoringWarning(null), 5000);
                    }
                }
            } catch (err) {
                console.warn('[Proctoring] frame analysis failed:', err);
            }
        };

        const interval = setInterval(runAnalysis, 4000);
        return () => clearInterval(interval);
    }, [isConnected, sessionId]);

    const handleRetry = useCallback(() => {
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        room.disconnect();
        onComplete();
    }, [room, onComplete]);

    const handleTimeoutExit = useCallback(async () => {
        try {
            await liveInterviewService.completeSession(sessionId);
        } catch (e) {
            console.warn('[SAFETY-NET] completeSession failed:', e);
        }
        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
        }
        room.disconnect();
        onExit();
    }, [room, sessionId, onExit]);

    // Determine AI status label
    const agentLabel =
        agentState === 'speaking' ? 'AI is speaking…'
        : agentState === 'listening' ? 'AI is listening…'
        : agentState === 'thinking' ? 'AI is thinking…'
        : 'AI Interviewer';

    // Active subtitles: take the latest segment text
    const activeCandidateText = candidateSegments?.[candidateSegments.length - 1]?.text || '';
    const activeAIText = agentTranscriptions?.[agentTranscriptions.length - 1]?.text || '';

    const aiPanelBgClass = agentState === 'speaking' ? 'bg-gradient-to-b from-indigo-50/80 to-white'
        : agentState === 'listening' ? 'bg-gradient-to-b from-emerald-50/80 to-white'
        : agentState === 'thinking' ? 'bg-gradient-to-b from-gray-50 to-white'
        : 'bg-white';

    const barColor = agentState === 'speaking' ? '#6366F1' : agentState === 'listening' ? '#10B981' : '#D1D5DB';

    return (
        <div className="flex-1 bg-white flex flex-col rounded-xl overflow-hidden shadow border border-gray-200 relative">
            <style>{`
                /* Override LiveKit styles completely */
                .lk-room-container, .lk-grid, .lk-focus-layout, [data-lk-theme] {
                    background-color: transparent !important;
                    background: transparent !important;
                }
            `}</style>
            
            {/* Render agent audio */}
            <RoomAudioRenderer />

            {/* Floating Proctoring Warning Banner */}
            {proctoringWarning && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-[60] bg-red-600 border border-red-500 text-white px-6 py-2.5 rounded-full shadow-2xl flex items-center gap-2 animate-bounce font-['Arimo',sans-serif] text-xs font-semibold">
                    <AlertCircle size={14} className="animate-pulse" />
                    <span>{proctoringWarning}</span>
                </div>
            )}

            {/* Fullscreen guard countdown overlay */}
            {fsCountdownActive && (
                <FullscreenCountdownOverlay
                    secondsLeft={fsSecondsLeft}
                    totalSeconds={FS_COUNTDOWN}
                    onReenter={enterFullscreen}
                />
            )}

            {agentTimeout && (
                <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <div className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center space-y-6">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-red-50 mx-auto">
                            <AlertCircle className="w-8 h-8 text-red-500" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-gray-800">AI Interviewer Failed to Connect</h3>
                            <p className="text-sm text-gray-500">The AI interviewer did not join the room within the expected time. This may be a temporary issue.</p>
                        </div>
                        <div className="flex flex-col gap-3">
                            <Button
                                className="w-full text-white rounded-full bg-indigo-600 hover:bg-indigo-700"
                                onClick={handleRetry}
                            >
                                Retry
                            </Button>
                            <Button
                                variant="outline"
                                className="w-full rounded-full text-gray-600 hover:text-red-500 hover:border-red-300"
                                onClick={handleTimeoutExit}
                            >
                                Exit Interview
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {showAgentLoading && (
                <div className="absolute inset-0 z-40 bg-white/95 backdrop-blur-sm flex items-center justify-center rounded-xl">
                    <div className="max-w-md w-full mx-4 bg-white rounded-2xl shadow-lg border border-gray-200 p-8 text-center space-y-6">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center bg-indigo-50 mx-auto">
                            <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-lg font-semibold text-gray-800">Connecting to AI Interviewer</h3>
                            <p className="text-sm text-gray-500">Please wait while we connect you with the AI interviewer. This usually takes a few moments.</p>
                        </div>
                        <div className="flex items-center justify-center gap-2 text-indigo-500 text-xs font-medium">
                            <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></div>
                            Establishing secure connection...
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 md:px-6 md:py-4 border-b border-gray-100 bg-white shadow-sm z-10 relative flex-wrap gap-2">
                <div className="w-full md:w-auto order-first md:order-last flex justify-center md:justify-end">
                    <div className="flex items-center gap-2 text-gray-400 text-[10px] md:text-xs font-medium bg-gray-50 px-3 py-1 rounded-full border border-gray-100 w-full md:w-auto justify-center md:justify-start">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                        {remoteParticipants.length} connected
                    </div>
                </div>
                <div className="flex items-center gap-3 order-last md:order-first">
                    <div className="relative flex items-center justify-center w-3 h-3">
                        <div className="absolute w-full h-full bg-emerald-500 rounded-full animate-ping opacity-75"></div>
                        <div className="relative w-2 h-2 bg-emerald-500 rounded-full"></div>
                    </div>
                    <span className="text-gray-800 text-sm font-semibold tracking-wide uppercase">Live Interview</span>
                </div>
            </div>

            {/* Main grid */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 p-4 md:p-6 min-h-0 bg-[#F8FAFC] overflow-y-auto">
                {/* Left: Candidate camera */}
                <div className="relative rounded-2xl md:rounded-3xl overflow-hidden bg-gray-900 flex items-center justify-center shadow-md group border border-gray-200/50 h-[45vh] md:h-full md:max-h-[70vh]">
                    {localVideoTrack && camEnabled ? (
                        <VideoTrack
                            trackRef={localVideoTrack}
                            className="w-full h-full object-cover"
                            style={{ transform: 'scaleX(-1)' }}
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-4 text-gray-500 bg-gray-800 w-full h-full justify-center">
                            <div className="w-20 h-20 rounded-full bg-gray-700 flex items-center justify-center">
                                <VideoOff className="w-8 h-8 text-gray-400" />
                            </div>
                            <span className="text-sm font-medium">Camera off</span>
                        </div>
                    )}

                    {/* Liveness Challenge Instruction Prompt Overlay */}
                    {livenessPrompt && (
                        <div className="absolute inset-0 bg-black/60 z-30 flex items-center justify-center p-4">
                            <div className="bg-indigo-600 border-2 border-indigo-400 text-white rounded-2xl p-6 text-center shadow-2xl max-w-xs animate-bounce">
                                <span className="font-['Arimo',sans-serif] text-[10px] uppercase tracking-widest text-indigo-200 block mb-1">Attention Required</span>
                                <span className="font-['Arimo',sans-serif] text-base font-bold block">{livenessPrompt}</span>
                            </div>
                        </div>
                    )}

                    {/* Candidate label & dynamic Trust Score */}
                    <div className="absolute top-3 left-3 md:top-4 md:left-4 flex gap-2 z-20">
                        <div className="bg-white/10 text-white text-[10px] md:text-xs font-medium px-3 py-1 md:px-4 md:py-1.5 rounded-full backdrop-blur-md border border-white/20 shadow-sm">
                            You
                        </div>
                        <div className={`text-white text-[10px] md:text-xs font-semibold px-3 py-1 md:px-4 md:py-1.5 rounded-full backdrop-blur-md border shadow-sm ${
                            trustScore >= 80 ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                            : trustScore >= 60 ? 'bg-amber-500/20 border-amber-500/30 text-amber-300'
                            : 'bg-red-500/20 border-red-500/30 text-red-300'
                        }`}>
                            Integrity: {trustScore}%
                        </div>
                    </div>

                    {/* Timer overlay */}
                    <div className={`absolute top-3 right-3 md:top-4 md:right-4 z-20 text-[10px] md:text-xs font-medium px-3 md:px-4 py-1 md:py-1.5 rounded-full backdrop-blur-md shadow-sm flex items-center ${
                        isCritical ? "text-red-500 animate-pulse border border-red-500/50 bg-red-500/10" 
                        : isWarning ? "text-amber-400 border border-amber-400/50 bg-amber-400/10" 
                        : "text-gray-100 border border-white/20 bg-black/40"
                    }`}>
                        <Clock className="w-3 h-3 md:w-3.5 md:h-3.5 mr-1 md:mr-1.5" />
                        {minutes}:{seconds.toString().padStart(2, '0')} / {timeBudgetMin}:00
                    </div>
                    
                    {/* Live Captions Subtitle (Candidate) */}
                    <div className={`absolute bottom-4 md:bottom-6 left-2 right-2 md:left-6 md:right-6 text-center pointer-events-none transition-all duration-500 z-20 ${activeCandidateText ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                        <span className="inline-block bg-black/70 text-white text-[11px] md:text-base px-3 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl backdrop-blur-lg shadow-xl border border-white/10 max-w-full truncate">
                            {activeCandidateText}
                        </span>
                    </div>
                </div>

                {/* Right: AI agent visualizer */}
                <div className={`relative rounded-2xl md:rounded-3xl flex flex-col items-center justify-between p-4 md:p-8 border border-gray-200 shadow-md transition-colors duration-1000 overflow-hidden h-[45vh] md:h-full md:max-h-[70vh] ${aiPanelBgClass}`}>
                    
                    <div className="w-full flex-1 overflow-y-auto mb-4 md:mb-6 pr-2 space-y-3 md:space-y-4 scrollbar-thin scrollbar-thumb-gray-200">
                        {agentState === 'speaking' && activeAIText && (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] px-3 py-2 md:px-4 md:py-2.5 rounded-xl md:rounded-2xl text-[11px] md:text-sm bg-indigo-50 border border-indigo-200 text-indigo-800 shadow-sm rounded-tl-sm animate-pulse">
                                    {activeAIText}
                                </div>
                            </div>
                        )}
                        {transcript.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-[85%] px-3 py-2 md:px-4 md:py-2.5 rounded-xl md:rounded-2xl text-[11px] md:text-sm ${msg.role === 'ai' ? 'bg-white border border-indigo-100 text-gray-700 shadow-sm rounded-tl-sm' : 'bg-indigo-50 text-indigo-900 border border-indigo-100 rounded-tr-sm'}`}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        <div ref={transcriptEndRef} />
                    </div>

                    <div className="flex flex-col items-center gap-3 md:gap-6 z-10 mt-auto bg-white/60 p-4 md:p-6 rounded-2xl md:rounded-3xl backdrop-blur-sm border border-white/40 shadow-sm w-full">
                        <AIAgentOrb agentState={agentState as any} />

                        <div className="text-center space-y-1">
                            <h2 className="text-gray-900 font-semibold text-lg">{agentLabel}</h2>
                            <p className="text-gray-500 text-xs">EraMatch AI</p>
                        </div>

                        {/* Audio visualizer bars */}
                        <div className="w-full max-w-[200px] h-12">
                            {agentAudioTrack ? (
                                <BarVisualizer
                                    trackRef={agentAudioTrack}
                                    barCount={7}
                                    style={{ height: '100%', borderRadius: '4px' }}
                                    options={{ minHeight: 4 }}
                                    className="flex items-center justify-center gap-2 [&>div]:rounded-full [&>div]:transition-all [&>div]:duration-75"
                                />
                            ) : (
                                <div className="flex gap-2 items-center justify-center h-full">
                                    {Array.from({ length: 7 }).map((_, i) => (
                                        <div key={i} className="w-2 rounded-full bg-gray-200 transition-all duration-500" style={{ height: '8px' }} />
                                    ))}
                                </div>
                            )}
                        </div>
                        
                        <style>{`
                            .lk-bar-visualizer > div {
                                background-color: ${barColor} !important;
                                width: 8px !important;
                            }
                        `}</style>

                        {!isConnected && (
                            <div className="flex items-center gap-2 text-indigo-600 text-sm mt-2 font-medium">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Connecting…
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Control bar */}
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6 py-4 md:py-6 border-t border-gray-100 bg-white z-10 relative shadow-[0_-4px_20px_-15px_rgba(0,0,0,0.1)] pb-8 md:pb-6">
                <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        className={`w-12 h-12 md:w-14 md:h-14 rounded-full transition-all duration-300 shadow-sm ${micEnabled ? 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300' : 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100'}`}
                        onClick={toggleMic}
                        title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                    >
                        {micEnabled ? <Mic className="w-5 h-5 md:w-6 md:h-6" /> : <MicOff className="w-5 h-5 md:w-6 md:h-6" />}
                    </Button>
                    <span className="text-[9px] md:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Mic</span>
                </div>

                <div className="flex flex-col items-center gap-1.5 md:gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        className={`w-12 h-12 md:w-14 md:h-14 rounded-full transition-all duration-300 shadow-sm ${camEnabled ? 'border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300' : 'bg-red-50 border-red-200 text-red-500 hover:bg-red-100'}`}
                        onClick={toggleCam}
                        title={camEnabled ? 'Turn off camera' : 'Turn on camera'}
                    >
                        {camEnabled ? <VideoIcon className="w-5 h-5 md:w-6 md:h-6" /> : <VideoOff className="w-5 h-5 md:w-6 md:h-6" />}
                    </Button>
                    <span className="text-[9px] md:text-[10px] font-medium text-gray-500 uppercase tracking-wider">Camera</span>
                </div>

                <div className="hidden md:block w-px h-10 bg-gray-200 mx-2"></div>

                <div className="fixed bottom-6 right-6 md:static md:bottom-auto md:right-auto flex flex-col items-center gap-1.5 md:gap-2 z-50">
                    <Button
                        className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-xl md:shadow-md border border-white/20 md:border-0 hover:shadow-2xl hover:shadow-red-500/20 transition-all duration-300"
                        size="icon"
                        onClick={handleEndInterview}
                        title="End interview"
                    >
                        <PhoneOff className="w-6 h-6 md:w-7 md:h-7" />
                    </Button>
                    <span className="hidden md:block text-[10px] font-bold text-red-500 uppercase tracking-wider">End</span>
                </div>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Exported component — wraps LiveKitRoom context then renders RoomUI
// ---------------------------------------------------------------------------
export function LiveInterviewRoom({
    token, serverUrl, roomName, sessionId, timeBudgetMinutes, onComplete, onExit,
}: LiveInterviewRoomProps) {
    return (
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect={true}
            audio={true}
            video={true}
            className="h-full flex flex-col"
        >
            <RoomUI sessionId={sessionId} timeBudgetMinutes={timeBudgetMinutes} onComplete={onComplete} onExit={onExit} />
        </LiveKitRoom>
    );
}
