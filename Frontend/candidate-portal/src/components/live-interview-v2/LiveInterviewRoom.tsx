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

import { useEffect, useState, useCallback } from 'react';
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
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { Mic, MicOff, VideoIcon, VideoOff, PhoneOff, Loader2, Bot } from 'lucide-react';
import { Button } from '../ui/button';

interface LiveInterviewRoomProps {
    token: string;
    serverUrl: string;
    roomName: string;
    sessionId: string;
    onComplete: () => void;
    onExit: () => void;
}

// ---------------------------------------------------------------------------
// Inner room UI — rendered after LiveKitRoom context is available
// ---------------------------------------------------------------------------
function RoomUI({ onComplete, onExit }: { onComplete: () => void; onExit: () => void }) {
    const room = useRoomContext();
    const { localParticipant } = useLocalParticipant();
    const remoteParticipants = useRemoteParticipants();

    // Local camera track
    const localTracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const localVideoTrack = localTracks.find(t => t.participant === localParticipant);

    // Voice assistant state (AI agent's audio + state)
    const { audioTrack: agentAudioTrack, state: agentState } = useVoiceAssistant();

    const [micEnabled, setMicEnabled] = useState(true);
    const [camEnabled, setCamEnabled] = useState(true);

    const [transcript, setTranscript] = useState<Array<{ role: 'ai' | 'candidate'; text: string }>>([]);
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        setIsConnected(room.state === 'connected');
    }, [room.state]);

    // Subscribe to data messages from the agent (transcript updates)
    useEffect(() => {
        const handler = (data: Uint8Array) => {
            try {
                const msg = JSON.parse(new TextDecoder().decode(data));
                if (msg.type === 'transcript') {
                    setTranscript(prev => [...prev, { role: msg.role, text: msg.text }]);
                } else if (msg.type === 'session_complete') {
                    onComplete();
                }
            } catch { /* ignore non-JSON */ }
        };
        room.on('dataReceived', handler);
        return () => { room.off('dataReceived', handler); };
    }, [room, onComplete]);

    const toggleMic = useCallback(async () => {
        await localParticipant.setMicrophoneEnabled(!micEnabled);
        setMicEnabled(v => !v);
    }, [localParticipant, micEnabled]);

    const toggleCam = useCallback(async () => {
        await localParticipant.setCameraEnabled(!camEnabled);
        setCamEnabled(v => !v);
    }, [localParticipant, camEnabled]);

    const handleEndInterview = useCallback(() => {
        room.disconnect();
        onExit();
    }, [room, onExit]);

    // Determine AI status label
    const agentLabel =
        agentState === 'speaking' ? 'AI is speaking…'
        : agentState === 'listening' ? 'AI is listening…'
        : agentState === 'thinking' ? 'AI is thinking…'
        : 'AI Interviewer';

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col">
            {/* Render agent audio */}
            <RoomAudioRenderer />

            {/* Header */}
            <div className="flex items-center justify-between px-8 py-4 border-b border-slate-800">
                <div className="flex items-center gap-3">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-slate-300 text-sm font-medium">Live Interview in Progress</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500 text-xs">
                    <span>{remoteParticipants.length} participant(s) connected</span>
                </div>
            </div>

            {/* Main grid */}
            <div className="flex-1 grid grid-cols-2 gap-6 p-8">
                {/* Left: Candidate camera */}
                <div className="relative rounded-2xl overflow-hidden bg-slate-900 flex items-center justify-center">
                    {localVideoTrack && camEnabled ? (
                        <VideoTrack
                            trackRef={localVideoTrack}
                            className="w-full h-full object-cover"
                            style={{ transform: 'scaleX(-1)' }}
                        />
                    ) : (
                        <div className="flex flex-col items-center gap-3 text-slate-600">
                            <VideoOff className="w-14 h-14" />
                            <span className="text-sm">Camera off</span>
                        </div>
                    )}

                    {/* Candidate label */}
                    <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs px-3 py-1 rounded-full">
                        You
                    </div>
                </div>

                {/* Right: AI agent visualizer + transcript */}
                <div className="rounded-2xl bg-slate-900 flex flex-col items-center justify-between p-8">
                    {/* AI Avatar + Visualizer */}
                    <div className="flex flex-col items-center gap-6 flex-1 justify-center w-full">
                        <div className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                            agentState === 'speaking' ? 'bg-indigo-600 ring-4 ring-indigo-400/40 shadow-lg shadow-indigo-500/30'
                            : agentState === 'listening' ? 'bg-emerald-600 ring-4 ring-emerald-400/40'
                            : 'bg-slate-700'
                        }`}>
                            <Bot className="w-10 h-10 text-white" />
                        </div>

                        <p className="text-slate-300 text-sm font-medium">{agentLabel}</p>

                        {/* Audio visualizer bars — driven by agent's real audio track */}
                        <div className="w-full max-w-xs h-16">
                            {agentAudioTrack ? (
                                <BarVisualizer
                                    trackRef={agentAudioTrack}
                                    barCount={24}
                                    style={{ height: '100%', borderRadius: '4px' }}
                                    options={{ minHeight: 4 }}
                                />
                            ) : (
                                /* Waiting for agent to connect */
                                <div className="flex gap-1 items-end justify-center h-full">
                                    {Array.from({ length: 24 }).map((_, i) => (
                                        <div key={i} className="w-1.5 rounded-full bg-slate-700" style={{ height: '8px' }} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {!isConnected && (
                            <div className="flex items-center gap-2 text-slate-500 text-sm">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Connecting to interview room…
                            </div>
                        )}
                    </div>

                    {/* Live transcript (last 4 lines) */}
                    {transcript.length > 0 && (
                        <div className="w-full mt-4 space-y-2 max-h-32 overflow-y-auto">
                            {transcript.slice(-4).map((t, i) => (
                                <p key={i} className={`text-xs px-3 py-1.5 rounded-lg ${
                                    t.role === 'ai'
                                        ? 'bg-indigo-900/40 text-indigo-300'
                                        : 'bg-slate-800 text-slate-300 text-right'
                                }`}>
                                    <span className="font-semibold mr-1">{t.role === 'ai' ? 'AI:' : 'You:'}</span>
                                    {t.text}
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Control bar */}
            <div className="flex items-center justify-center gap-4 py-6 border-t border-slate-800">
                <Button
                    variant="ghost"
                    size="icon"
                    className={`w-12 h-12 rounded-full transition-colors ${micEnabled ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                    onClick={toggleMic}
                    title={micEnabled ? 'Mute microphone' : 'Unmute microphone'}
                >
                    {micEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
                </Button>

                <Button
                    variant="ghost"
                    size="icon"
                    className={`w-12 h-12 rounded-full transition-colors ${camEnabled ? 'bg-slate-800 text-white hover:bg-slate-700' : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'}`}
                    onClick={toggleCam}
                    title={camEnabled ? 'Turn off camera' : 'Turn on camera'}
                >
                    {camEnabled ? <VideoIcon className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </Button>

                <Button
                    className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg"
                    size="icon"
                    onClick={handleEndInterview}
                    title="End interview"
                >
                    <PhoneOff className="w-6 h-6" />
                </Button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Exported component — wraps LiveKitRoom context then renders RoomUI
// ---------------------------------------------------------------------------
export function LiveInterviewRoom({
    token, serverUrl, roomName, sessionId, onComplete, onExit,
}: LiveInterviewRoomProps) {
    return (
        <LiveKitRoom
            token={token}
            serverUrl={serverUrl}
            connect={true}
            audio={true}
            video={true}
            data-lk-theme="default"
            style={{ height: '100vh' }}
        >
            <RoomUI onComplete={onComplete} onExit={onExit} />
        </LiveKitRoom>
    );
}
