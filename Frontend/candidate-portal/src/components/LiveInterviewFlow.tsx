import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Video, Mic, CheckCircle2, AlertCircle, Play, Loader2, Sparkles, Settings } from 'lucide-react';
import logo from '../imports/image-eramatch.png';
import { api } from '../services/api';
import { LiveInterviewRoom } from './live-interview-v2/LiveInterviewRoom';

interface LiveInterviewFlowProps {
    onSignOut: () => void;
    onExit: () => void;
    onCompletion: () => void;
}

export function LiveInterviewFlow({ onSignOut, onExit, onCompletion }: LiveInterviewFlowProps) {
    const [currentStep, setCurrentStep] = useState(1);

    // Device test states
    const videoRef = useRef<HTMLVideoElement>(null);
    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<BlobPart[]>([]);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [hasRecorded, setHasRecorded] = useState(false);
    const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Microphone visualization
    const [audioLevel, setAudioLevel] = useState(0);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number>(0);

    // LiveKit room token state
    const [roomToken, setRoomToken] = useState<string | null>(null);
    const [roomUrl, setRoomUrl] = useState<string | null>(null);
    const [roomName, setRoomName] = useState<string | null>(null);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [timeBudgetMinutes, setTimeBudgetMinutes] = useState<number>(30);
    const [tokenLoading, setTokenLoading] = useState(false);
    const [tokenError, setTokenError] = useState<string | null>(null);

    const startCamera = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            setStream(mediaStream);
            setCameraError(null);
            
            // Setup audio analyzer
            const audioCtx = new AudioContext();
            const analyser = audioCtx.createAnalyser();
            const source = audioCtx.createMediaStreamSource(mediaStream);
            source.connect(analyser);
            analyser.fftSize = 256;
            audioContextRef.current = audioCtx;
            analyserRef.current = analyser;
            
            const updateAudioLevel = () => {
                if (!analyserRef.current) return;
                const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);
                analyserRef.current.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                setAudioLevel(average);
                animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
            };
            updateAudioLevel();
        } catch (err) {
            setCameraError('Unable to access camera or microphone. Please ensure permissions are granted in your browser settings.');
        }
    };

    const stopCamera = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        if (audioContextRef.current) {
            void audioContextRef.current.close();
        }
    };

    useEffect(() => {
        if (currentStep === 1) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [currentStep]);

    useEffect(() => {
        if (videoRef.current && stream) {
            videoRef.current.srcObject = stream;
        }
    }, [stream, currentStep]);

    const handleRecordTestClip = () => {
        if (!stream) return;
        if (recordedUrl) URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(null);
        if (isPlaying) setIsPlaying(false);
        
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
            stopCamera();
            setCurrentStep(2);
        } catch (err: any) {
            setTokenError(err?.message || 'Failed to connect to the interview. Please try again.');
        } finally {
            setTokenLoading(false);
        }
    };

    if (currentStep === 2 && roomToken && roomUrl && roomName && sessionId) {
        return (
            <LiveInterviewRoom
                token={roomToken}
                serverUrl={roomUrl}
                roomName={roomName}
                sessionId={sessionId}
                timeBudgetMinutes={timeBudgetMinutes}
                onComplete={() => onCompletion()}
                onExit={() => onExit()}
            />
        );
    }

    return (
        <div className="min-h-screen font-sans bg-[#F8FAFC]">
            <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
                <img src={logo} alt="ERAMATCH" className="h-10" />
                <Button variant="ghost" className="text-gray-500 hover:text-gray-700 font-medium" onClick={onSignOut}>
                    Sign Out
                </Button>
            </header>

            <main className="max-w-4xl mx-auto py-12 px-6">
                <div className="mb-10 text-center">
                    <div className="inline-flex items-center justify-center p-3 bg-indigo-50 rounded-2xl mb-4">
                        <Settings className="w-8 h-8 text-indigo-600" />
                    </div>
                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">System Check</h1>
                    <p className="text-gray-500 mt-3 text-lg max-w-2xl mx-auto">
                        Before we begin your live AI interview, let's ensure your camera and microphone are working perfectly.
                    </p>
                </div>

                <Card className="p-8 border-none shadow-xl bg-white rounded-3xl overflow-hidden relative">
                    <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500"></div>
                    
                    <div className="grid md:grid-cols-2 gap-10">
                        {/* Left Column - Video Preview */}
                        <div className="space-y-6">
                            <div className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-video shadow-inner ring-1 ring-black/5">
                                {cameraError ? (
                                    <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                                        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mb-4">
                                            <AlertCircle className="w-8 h-8 text-red-500" />
                                        </div>
                                        <p className="text-white font-medium">{cameraError}</p>
                                    </div>
                                ) : (
                                    <>
                                        {!isPlaying ? (
                                            <video
                                                ref={videoRef}
                                                autoPlay
                                                playsInline
                                                muted
                                                className="w-full h-full object-cover transform -scale-x-100 transition-opacity duration-500"
                                                style={{ opacity: stream ? 1 : 0 }}
                                            />
                                        ) : (
                                            <video
                                                src={recordedUrl!}
                                                autoPlay
                                                playsInline
                                                onEnded={() => setIsPlaying(false)}
                                                className="w-full h-full object-cover transform -scale-x-100"
                                            />
                                        )}
                                        
                                        {isRecording && (
                                            <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-sm font-medium animate-pulse border border-white/10">
                                                <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                                                Recording...
                                            </div>
                                        )}
                                        
                                        {!cameraError && !isRecording && !isPlaying && stream && (
                                            <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                                                <div className="bg-black/50 backdrop-blur-md rounded-lg p-2.5 flex items-center gap-2 border border-white/10">
                                                    <Mic className={`w-4 h-4 ${audioLevel > 10 ? 'text-green-400' : 'text-gray-400'}`} />
                                                    <div className="flex gap-1 h-3 items-end">
                                                        {[1, 2, 3, 4, 5].map((i) => (
                                                            <div
                                                                key={i}
                                                                className={`w-1.5 rounded-t-sm transition-all duration-75 ${audioLevel > i * 15 ? 'bg-green-400' : 'bg-gray-600'}`}
                                                                style={{ height: Math.max(20, Math.min(100, (audioLevel / 50) * 100)) * (i / 5) + '%' }}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>

                            {!cameraError && (
                                <div className="flex gap-3 justify-center">
                                    <Button
                                        onClick={handleRecordTestClip}
                                        disabled={isRecording || isPlaying}
                                        className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border-none h-12 font-medium"
                                        variant="outline"
                                    >
                                        {isRecording ? (
                                            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Recording (4s)...</>
                                        ) : (
                                            <><Video className="w-4 h-4 mr-2 text-indigo-600" /> Record Test</>
                                        )}
                                    </Button>

                                    <Button
                                        onClick={() => { if (recordedUrl) setIsPlaying(true); }}
                                        disabled={!hasRecorded || isRecording || isPlaying}
                                        className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border-none h-12 font-medium disabled:opacity-50"
                                        variant="outline"
                                    >
                                        <Play className="w-4 h-4 mr-2 text-indigo-600" /> Play Test
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Right Column - Info & Next Steps */}
                        <div className="flex flex-col justify-between py-2">
                            <div className="space-y-6">
                                <div className="flex gap-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/50">
                                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                                        <Sparkles className="w-5 h-5 text-indigo-600" />
                                    </div>
                                    <div>
                                        <h3 className="font-semibold text-gray-900 text-base mb-1">Live AI Interview</h3>
                                        <p className="text-sm text-gray-600 leading-relaxed">You will be interacting with a live AI agent. Please speak clearly and make sure your microphone is working before entering.</p>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                                        <CheckCircle2 className="w-5 h-5 text-green-500" /> Prerequisites
                                    </h4>
                                    <ul className="space-y-3 text-sm text-gray-600">
                                        <li className="flex items-center gap-3">
                                            <div className={`w-2 h-2 rounded-full ${stream ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                                            Camera and Microphone permissions granted
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            Stable internet connection
                                        </li>
                                        <li className="flex items-center gap-3">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            Quiet environment for AI transcription
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            <div className="pt-8 mt-auto space-y-4">
                                {tokenError && (
                                    <div className="p-3 bg-red-50 text-red-600 text-sm rounded-lg flex items-center gap-2">
                                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                        {tokenError}
                                    </div>
                                )}
                                <Button
                                    onClick={fetchRoomToken}
                                    disabled={!!cameraError || !stream || tokenLoading}
                                    className="w-full h-14 rounded-xl text-lg font-medium shadow-lg shadow-indigo-200 transition-transform active:scale-[0.98]"
                                    style={{ backgroundColor: '#6366F1' }}
                                >
                                    {tokenLoading ? (
                                        <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Connecting...</>
                                    ) : (
                                        'Enter Assessment Environment'
                                    )}
                                </Button>
                                <p className="text-center text-xs text-gray-400 mt-4">
                                    By entering, you agree to our proctoring and privacy guidelines.
                                </p>
                            </div>
                        </div>
                    </div>
                </Card>
            </main>
        </div>
    );
}
