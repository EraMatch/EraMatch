import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Sparkles, Video, Clock, User, Camera, Mic, Play, Square, Info, Scan, CheckCircle2, Target, Copy, X, AlertTriangle, AlertCircle, Users, Loader2, RefreshCw } from 'lucide-react';
import { Logo } from './ui/Logo';
import { api } from '../services/api';
import { captureVideoFrameBase64, toWaveformPayload } from '../utils/proctoringPayload';
import { queryKeys } from '../lib/queryKeys';
import { useFullscreenGuard } from '../hooks/useFullscreenGuard';
import { FullscreenCountdownOverlay } from './FullscreenCountdownOverlay';

const AI_SERVICE_BASE_URL = (import.meta as any).env?.VITE_AI_SERVICE_URL || 'http://localhost:8001';
const ENABLE_BIOMETRIC_BETA = ((import.meta as any).env?.VITE_ENABLE_BIOMETRIC_BETA ?? 'true') !== 'false';
const BIOMETRIC_SAMPLE_INTERVAL_MS = Number((import.meta as any).env?.VITE_BIOMETRIC_SAMPLE_INTERVAL_MS || 2000);
const BIOMETRIC_ANALYSIS_INTERVAL_MS = Number((import.meta as any).env?.VITE_BIOMETRIC_ANALYSIS_INTERVAL_MS || 20000);
const BIOMETRIC_RISK_THRESHOLD = Number((import.meta as any).env?.VITE_BIOMETRIC_RISK_THRESHOLD || 0.45);
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

interface RecordedInterviewFlowProps {
  onSignOut: () => void;
  onExit: () => void;
  onCompletion: () => void;
}

export function RecordedInterviewFlow({ onSignOut, onExit, onCompletion }: RecordedInterviewFlowProps) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [faceCaptureDone, setFaceCaptureDone] = useState(false);
  const [capturedFaceDataUrl, setCapturedFaceDataUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const RECORDING_TIMEOUT_SECONDS = 60;

  // Camera handling
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  // streamRef mirrors stream state so callbacks always see the latest stream
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Camera device selection
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioId, setSelectedAudioId] = useState<string>('');

  // Real microphone level monitoring
  const [micLevel, setMicLevel] = useState(0);
  const [micActive, setMicActive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAnimFrameRef = useRef<number>(0);

  // Interview session states
  const [inInterviewSession, setInInterviewSession] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(1);
  const [questionTimer, setQuestionTimer] = useState(120);
  const [questionRecording, setQuestionRecording] = useState(false);
  const [questionRecorded, setQuestionRecorded] = useState(false);
  const [retries, setRetries] = useState(0);
  const [showUploadProgress, setShowUploadProgress] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [questions, setQuestions] = useState<string[]>([]);
  const [interviewComplete, setInterviewComplete] = useState(false);

  // Backend integration state
  const [configId, setConfigId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questionsData, setQuestionsData] = useState<Array<{ id: string, text: string }>>([]);

  // Processing status tracking
  const [processingStatuses, setProcessingStatuses] = useState<Record<string, string>>({});
  const [submittedResponses, setSubmittedResponses] = useState<string[]>([]);
  const eventThrottleRef = useRef<Record<string, number>>({});
  const proctoringCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastFrameDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const analysisAudioContextRef = useRef<AudioContext | null>(null);
  const analysisAudioAnalyserRef = useRef<AnalyserNode | null>(null);
  const analysisAudioBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const latestAudioFrameRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const silentSamplesRef = useRef(0);
  const totalAudioSamplesRef = useRef(0);
  const sampleWindowStartRef = useRef(Date.now());

  const FULLSCREEN_COUNTDOWN = 15;
  const { countdownActive: fsCountdownActive, secondsLeft: fsSecondsLeft, enterFullscreen } = useFullscreenGuard({
    enabled: inInterviewSession && !interviewComplete,
    onCountdownExpired: () => {
      stopCamera();
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      setInInterviewSession(false);
      setInterviewComplete(true);
      onCompletion();
    },
    countdownSeconds: FULLSCREEN_COUNTDOWN,
  });

  // Fetch interview questions from API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        const data = await api.candidate.getInterviewConfig() as any;
        setConfigId(data.config_id);
        setQuestionsData(data.questions);
        setQuestions(data.questions.map((q: any) => q.text));

        const sessionData = await api.candidate.startInterview({ config_id: data.config_id }) as any;
        setSessionId(sessionData.session_id);
        if (sessionData.already_completed) {
          queryClient.invalidateQueries({ queryKey: queryKeys.candidate.home() });
          onCompletion();
          return;
        }
      } catch (error) {
        console.error('Failed to fetch interview config:', error);
        setLoadError('Failed to load interview questions. Please refresh the page and try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchQuestions();
  }, []);

  // Poll for processing status after video submission
  useEffect(() => {
    if (!sessionId || submittedResponses.length === 0) return;

    const pollStatus = async () => {
      try {
        const data = await api.candidate.getInterviewStatus(sessionId) as any;
        if (data) {
          const newStatuses: Record<string, string> = {};
          let allComplete = true;
          
          data.responses?.forEach((r: any) => {
            if (submittedResponses.includes(r.question_id)) {
              newStatuses[r.question_id] = r.processing_status;
              if (r.processing_status !== 'completed' && r.processing_status !== 'failed') {
                allComplete = false;
              }
            }
          });
          
          setProcessingStatuses(newStatuses);
          
          // If all are complete, stop polling
          if (allComplete) {
            console.log('All responses processed:', newStatuses);
          }
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    };

    // Poll every 5 seconds
    const pollInterval = setInterval(pollStatus, 5000);
    return () => clearInterval(pollInterval);
  }, [sessionId, submittedResponses]);

  // Timer countdown during recording
  useEffect(() => {
    if (questionRecording && questionTimer > 0) {
      const interval = setInterval(() => {
        setQuestionTimer(prev => {
          if (prev <= 1) {
            clearInterval(interval);
            // Auto-stop recording when timer reaches 0
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
              mediaRecorderRef.current.stop();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [questionRecording, questionTimer]);

  // Activate camera for specific steps and keep it running during interview session
  useEffect(() => {
    const needsCamera = currentStep === 2 || inInterviewSession;

    if (needsCamera && !streamRef.current) {
      // Start camera if we need it and don't have it yet
      startCamera();
    } else if (!needsCamera && streamRef.current) {
      // Stop camera if we don't need it
      stopCamera();
    }
    // Keep camera running during interview session - DO NOT stop between questions
    // NOTE: `stream` is intentionally NOT in the dependency array to avoid a
    // re-run loop (startCamera sets stream → effect re-runs → startCamera again)
  }, [currentStep, inInterviewSession]); // eslint-disable-line react-hooks/exhaustive-deps


  const totalQuestions = questions.length || 5;

  const emitInterviewIntegrityEvent = useCallback(async (
    eventType: string,
    severity: 'low' | 'medium' | 'high',
    metadata: Record<string, unknown> = {},
    throttleMs = 8000,
  ) => {
    if (!sessionId) return;

    const now = Date.now();
    const key = `${eventType}:${severity}`;
    const lastSent = eventThrottleRef.current[key] || 0;
    if (now - lastSent < throttleMs) return;
    eventThrottleRef.current[key] = now;

    try {
      const response = await api.candidate.reportInterviewIntegrityEvent({
        session_id: sessionId,
        event_type: eventType,
        severity,
        source: 'candidate_portal',
        metadata: {
          interview_mode: 'recorded',
          question_index: currentQuestion,
          question_id: questionsData[currentQuestion - 1]?.id,
          timer_remaining_seconds: questionTimer,
          ...metadata,
        },
      });

      const action = response?.enforcement_action;
      if (action === 'terminate') {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        setQuestionRecording(false);
        setInInterviewSession(false);
        stopCamera();
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setInterviewComplete(true);
        onCompletion();
      } else if (action === 'pause') {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        setQuestionRecording(false);
        setInInterviewSession(false);
      }
    } catch (error) {
      console.error('Failed to report interview integrity event:', error);
    }
  }, [sessionId, currentQuestion, questionTimer, questionsData, onCompletion]);

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
        const errorPayload = await response.json().catch(() => null);
        if (response.status === 422 && errorPayload?.detail?.proof) {
          return {
            signal_type: signal,
            event_type: 'model_required_violation',
            severity: 'high',
            risk_score: 1,
            confidence: 1,
            adapter_mode: 'model_required_block',
            recommendation: 'Model-required mode blocked fallback inference for this signal.',
            metadata: {
              proof: errorPayload.detail.proof,
            },
          } as ProctoringSignalResult;
        }
        return null;
      }
      return await response.json() as ProctoringSignalResult;
    } catch (error) {
      console.error(`Failed proctoring ${signal} request:`, error);
      return null;
    }
  }, []);

  const measureFaceMotion = useCallback((): number => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return 0;
    }

    if (!proctoringCanvasRef.current) {
      proctoringCanvasRef.current = document.createElement('canvas');
    }
    const canvas = proctoringCanvasRef.current;
    const width = 96;
    const height = 72;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 0;

    ctx.drawImage(video, 0, 0, width, height);
    const frame = ctx.getImageData(0, 0, width, height).data;

    if (!lastFrameRef.current || !lastFrameDimensionsRef.current) {
      lastFrameRef.current = new Uint8ClampedArray(frame);
      lastFrameDimensionsRef.current = { width, height };
      return 0;
    }

    if (lastFrameDimensionsRef.current.width !== width || lastFrameDimensionsRef.current.height !== height) {
      lastFrameRef.current = new Uint8ClampedArray(frame);
      lastFrameDimensionsRef.current = { width, height };
      return 0;
    }

    let diffSum = 0;
    const prev = lastFrameRef.current;
    for (let i = 0; i < frame.length; i += 4) {
      const currGray = (frame[i] + frame[i + 1] + frame[i + 2]) / 3;
      const prevGray = (prev[i] + prev[i + 1] + prev[i + 2]) / 3;
      diffSum += Math.abs(currGray - prevGray);
    }

    lastFrameRef.current = new Uint8ClampedArray(frame);
    const pixelCount = width * height;
    return Math.min(1, diffSum / (pixelCount * 255));
  }, []);

  const measureVoiceRms = useCallback((): number => {
    const streamForAudio = streamRef.current;
    if (!streamForAudio) {
      return 0;
    }
    if (!analysisAudioContextRef.current) {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return 0;
      const ctx = new AC();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const source = ctx.createMediaStreamSource(streamForAudio);
      source.connect(analyser);
      analysisAudioContextRef.current = ctx;
      analysisAudioAnalyserRef.current = analyser;
      analysisAudioBufferRef.current = new Float32Array(analyser.fftSize) as Float32Array<ArrayBuffer>;
    }

    const analyser = analysisAudioAnalyserRef.current;
    const buffer = analysisAudioBufferRef.current;
    if (!analyser || !buffer) return 0;

    analyser.getFloatTimeDomainData(buffer);
    latestAudioFrameRef.current = new Float32Array(buffer) as Float32Array<ArrayBuffer>;

    let sum = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      sum += buffer[i] * buffer[i];
    }
    return Math.sqrt(sum / buffer.length);
  }, []);

  

  useEffect(() => {
    if (!ENABLE_BIOMETRIC_BETA || !inInterviewSession) return;

    if (!sessionId || !streamRef.current) {
      void emitInterviewIntegrityEvent('biometric_capture_unavailable', 'medium', {
        reason: 'missing_session_or_media_stream',
      });
      return;
    }

    const sampleMetrics = {
      face_motion_avg: 0,
      gaze_off_ratio: 0,
      gaze_samples: 0,
      voice_silent_ratio: 0,
      sample_count: 0,
    };

    sampleWindowStartRef.current = Date.now();
    silentSamplesRef.current = 0;
    totalAudioSamplesRef.current = 0;

    const sampleInterval = window.setInterval(() => {
      const faceMotion = measureFaceMotion();
      const gazeAway = faceMotion < 0.008 ? 1 : 0;
      const rms = measureVoiceRms();

      sampleMetrics.sample_count += 1;
      sampleMetrics.face_motion_avg += (faceMotion - sampleMetrics.face_motion_avg) / sampleMetrics.sample_count;
      sampleMetrics.gaze_samples += 1;
      sampleMetrics.gaze_off_ratio += (gazeAway - sampleMetrics.gaze_off_ratio) / sampleMetrics.gaze_samples;

      totalAudioSamplesRef.current += 1;
      if (rms < 0.01) {
        silentSamplesRef.current += 1;
      }

      sampleMetrics.voice_silent_ratio = totalAudioSamplesRef.current
        ? silentSamplesRef.current / totalAudioSamplesRef.current
        : 0;
    }, BIOMETRIC_SAMPLE_INTERVAL_MS);

    const analysisInterval = window.setInterval(async () => {
      const elapsedMs = Date.now() - sampleWindowStartRef.current;
      const frameB64 = captureVideoFrameBase64(videoRef.current, 224, 224);
      const audioWaveform = toWaveformPayload(latestAudioFrameRef.current, 24000);
      const audioSampleRate = analysisAudioContextRef.current?.sampleRate ?? 16000;
      const payloadBase = {
        session_id: sessionId,
        sample_window_ms: elapsedMs,
        interview_mode: 'recorded',
      };

      const signalPayloads: Array<{
        signal: 'face' | 'voice' | 'gaze' | 'emotion';
        payload: Record<string, unknown>;
      }> = [
        {
          signal: 'face',
          payload: {
            ...payloadBase,
            faces_detected: sampleMetrics.sample_count > 0 ? 1 : 0,
            multiple_faces: false,
            liveness_score: Number(sampleMetrics.face_motion_avg.toFixed(4)),
            frame_b64: frameB64,
          },
        },
        {
          signal: 'voice',
          payload: {
            ...payloadBase,
            silence_ratio: Number(sampleMetrics.voice_silent_ratio.toFixed(4)),
            background_speaker_count: 0,
            speaker_profile_id: SPEAKER_PROFILE_ID,
            audio_waveform: audioWaveform,
            audio_sample_rate: audioSampleRate,
          },
        },
        {
          signal: 'gaze',
          payload: {
            ...payloadBase,
            off_screen_ratio: Number(sampleMetrics.gaze_off_ratio.toFixed(4)),
            away_duration_seconds: Number(((elapsedMs / 1000) * sampleMetrics.gaze_off_ratio).toFixed(3)),
            rapid_shift_count: 0,
            frame_b64: frameB64,
          },
        },
        {
          signal: 'emotion',
          payload: {
            ...payloadBase,
            stress_score: Number((0.6 * sampleMetrics.gaze_off_ratio + 0.4 * (1 - sampleMetrics.voice_silent_ratio)).toFixed(4)),
            negative_ratio: Number(sampleMetrics.gaze_off_ratio.toFixed(4)),
            dominant_emotion: sampleMetrics.gaze_off_ratio > 0.55 ? 'fear' : 'neutral',
            frame_b64: frameB64,
          },
        },
      ];

      for (const { signal, payload } of signalPayloads) {
        const result = await postProctoringSignal(signal, payload);
        if (!result || result.risk_score < BIOMETRIC_RISK_THRESHOLD) continue;

        void emitInterviewIntegrityEvent(
          result.event_type,
          result.severity,
          {
            signal_type: result.signal_type,
            risk_score: result.risk_score,
            confidence: result.confidence,
            recommendation: result.recommendation,
            adapter_mode: result.adapter_mode,
            adapter_metadata: result.metadata,
            sampled_window_ms: elapsedMs,
            sampled_face_motion_avg: Number(sampleMetrics.face_motion_avg.toFixed(4)),
            sampled_gaze_off_ratio: Number(sampleMetrics.gaze_off_ratio.toFixed(4)),
            sampled_voice_silent_ratio: Number(sampleMetrics.voice_silent_ratio.toFixed(4)),
          },
          6000,
        );
      }

      sampleWindowStartRef.current = Date.now();
      sampleMetrics.face_motion_avg = 0;
      sampleMetrics.gaze_off_ratio = 0;
      sampleMetrics.gaze_samples = 0;
      sampleMetrics.voice_silent_ratio = 0;
      sampleMetrics.sample_count = 0;
      silentSamplesRef.current = 0;
      totalAudioSamplesRef.current = 0;
    }, BIOMETRIC_ANALYSIS_INTERVAL_MS);

    return () => {
      window.clearInterval(sampleInterval);
      window.clearInterval(analysisInterval);
      analysisAudioAnalyserRef.current = null;
      analysisAudioBufferRef.current = null;
      if (analysisAudioContextRef.current) {
        analysisAudioContextRef.current.close().catch(() => {});
      }
      analysisAudioContextRef.current = null;
    };
  }, [
    emitInterviewIntegrityEvent,
    inInterviewSession,
    measureFaceMotion,
    measureVoiceRms,
    postProctoringSignal,
    sessionId,
  ]);

  // Fetch available camera and audio devices
  useEffect(() => {
    const getDevices = async () => {
      console.log('[DeviceDetection] Starting device enumeration...');

      // Request both camera and microphone permissions so the browser prompts
      // for both and we get proper device labels with audioinput devices.
      try {
        console.log('[DeviceDetection] Requesting media permissions...');
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        console.log('[DeviceDetection] Permissions granted — video:', tempStream.getVideoTracks().length, 'audio:', tempStream.getAudioTracks().length);

        const devices = await navigator.mediaDevices.enumerateDevices();
        console.log('[DeviceDetection] Devices after permission:', devices);

        tempStream.getTracks().forEach(t => t.stop());

        const cameras = devices.filter(d => d.kind === 'videoinput');
        const mics = devices.filter(d => d.kind === 'audioinput');

        console.log('[DeviceDetection] Cameras:', cameras);
        console.log('[DeviceDetection] Mics:', mics);

        if (cameras.length > 0 || mics.length > 0) {
          setCameraDevices(cameras);
          setAudioDevices(mics);
          if (cameras.length > 0) setSelectedCameraId(cameras[0].deviceId);
          if (mics.length > 0) setSelectedAudioId(mics[0].deviceId);
        } else {
          // Fallback: try accessing camera directly
          throw new Error('No devices found via enumerate, trying direct access');
        }
      } catch (err) {
        console.log('[DeviceDetection] Permission/enumeration failed:', err);

        // Method 2: Just try to enumerate devices (may not have labels)
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const cameras = devices.filter(d => d.kind === 'videoinput');
          const mics = devices.filter(d => d.kind === 'audioinput');

          if (cameras.length > 0) {
            setCameraDevices(cameras);
            setSelectedCameraId(cameras[0].deviceId);
          }
          if (mics.length > 0) {
            setAudioDevices(mics);
            setSelectedAudioId(mics[0].deviceId);
          }

          if (cameras.length === 0 && mics.length === 0) {
            // Method 3: Try to get user media to force device enumeration
            try {
              const testStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
              testStream.getTracks().forEach(t => t.stop());

              const devicesAfter = await navigator.mediaDevices.enumerateDevices();
              const camerasAfter = devicesAfter.filter(d => d.kind === 'videoinput');
              const micsAfter = devicesAfter.filter(d => d.kind === 'audioinput');
              setCameraDevices(camerasAfter);
              setAudioDevices(micsAfter);
              if (camerasAfter.length > 0) setSelectedCameraId(camerasAfter[0].deviceId);
              if (micsAfter.length > 0) setSelectedAudioId(micsAfter[0].deviceId);

              if (camerasAfter.length === 0) {
                setCameraError('No cameras found. Please connect a webcam or enable OBS Virtual Camera.');
              }
              if (micsAfter.length === 0) {
                console.warn('[DeviceDetection] No microphones detected');
              }
            } catch (e2) {
              console.error('[DeviceDetection] Direct access also failed:', e2);
              setCameraError('No cameras detected. Please connect a camera or enable OBS Virtual Camera.');
            }
          }
        } catch (e2) {
          console.error('[DeviceDetection] enumerateDevices failed:', e2);
          setCameraError('Could not enumerate devices. Please refresh and allow camera/mic permissions.');
        }
      }
    };
    
    // Small delay to ensure media APIs are ready
    setTimeout(getDevices, 500);
  }, []);

  // Get the best supported MediaRecorder mimeType that includes audio
  const getSupportedMimeType = (): string => {
    const types = [
      'video/webm;codecs=vp8,opus',  // Best: video + audio
      'video/webm;codecs=vp9,opus',  // Alternative: vp9 + audio
      'video/webm;codecs=vp8',       // Video only (fallback)
      'video/webm',                   // Browser default
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return 'video/webm'; // Last resort
  };

  // Start real microphone level monitoring using AudioContext + AnalyserNode
  const startMicMonitoring = useCallback((mediaStream: MediaStream) => {
    // Clean up any existing monitoring
    stopMicMonitoring();

    const audioTracks = mediaStream.getAudioTracks();
    if (audioTracks.length === 0) {
      setMicActive(false);
      setMicLevel(0);
      return;
    }

    setMicActive(true);

    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calculate RMS-like level from frequency data
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        // Normalize to 0-100 range (typical speech peaks around 60-120 in byte frequency)
        const level = Math.min(100, Math.round((average / 128) * 100));
        setMicLevel(level);

        micAnimFrameRef.current = requestAnimationFrame(updateLevel);
      };

      micAnimFrameRef.current = requestAnimationFrame(updateLevel);
    } catch (err) {
      console.warn('[Mic] Failed to start audio monitoring:', err);
      setMicActive(false);
    }
  }, []);

  // Stop microphone level monitoring
  const stopMicMonitoring = useCallback(() => {
    if (micAnimFrameRef.current) {
      cancelAnimationFrame(micAnimFrameRef.current);
      micAnimFrameRef.current = 0;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    setMicActive(false);
    setMicLevel(0);
  }, []);

  // Start camera — accepts explicit deviceIds to avoid stale state closure issues
  const startCamera = async (videoDeviceId?: string, audioDeviceId?: string) => {
    console.log('[Camera] startCamera called', { videoDeviceId, audioDeviceId });

    // Always stop current stream first using the ref (avoids stale closure)
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // Use explicit args if provided, otherwise fall back to current state
    const vid = videoDeviceId ?? selectedCameraId;
    const aud = audioDeviceId ?? selectedAudioId;

    console.log('[Camera] Attempting with:', { vid, aud });

    try {
      // Acquire video and audio together for a complete media stream.
      // If audio fails we still show camera but warn the user clearly.
      const constraints: MediaStreamConstraints = {
        video: vid ? { deviceId: { exact: vid } } : true,
        audio: aud ? { deviceId: { exact: aud } } : true,
      };

      console.log('[Camera] Requesting getUserMedia...');
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      console.log('[Camera] getUserMedia SUCCESS', mediaStream.getVideoTracks().length, 'video tracks,', mediaStream.getAudioTracks().length, 'audio tracks');

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setCameraError(null);

      // Start real microphone level monitoring
      startMicMonitoring(mediaStream);

      // Warn if audio tracks are missing
      if (mediaStream.getAudioTracks().length === 0) {
        console.warn('[Camera] No audio tracks in stream — microphone may not be working');
        setCameraError(prev => prev
          ? prev + ' Additionally, no microphone was detected. Check your mic permissions.'
          : 'No microphone detected. Your recording will have no audio. Check mic permissions.'
        );
      }
    } catch (err: any) {
      console.error('[Camera] Error accessing camera:', err);

      // If combined request fails, try video-only as fallback
      if (err.name === 'NotReadableError' || err.name === 'OverconstrainedError') {
        try {
          console.log('[Camera] Falling back to video-only stream');
          const fallbackStream = await navigator.mediaDevices.getUserMedia({
            video: vid ? { deviceId: { exact: vid } } : true,
            audio: false,
          });
          streamRef.current = fallbackStream;
          setStream(fallbackStream);
          setCameraError('Camera connected but microphone unavailable. Your recordings will have no audio. Check mic permissions.');
          return;
        } catch (fallbackErr) {
          console.error('[Camera] Video-only fallback also failed:', fallbackErr);
        }
      }

      let msg = 'Unable to access camera. Please ensure permissions are granted.';
      const selectedCameraLabel = cameraDevices.find(d => d.deviceId === vid)?.label || '';
      const isObsCamera = /obs/i.test(selectedCameraLabel);

      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission denied! Click the camera icon in your browser address bar and select "Always allow" for this site, then refresh.';
      } else if (err.name === 'NotFoundError') {
        msg = 'No camera found. Please ensure a webcam is connected.';
      } else if (err.name === 'NotReadableError') {
        msg = isObsCamera
          ? 'OBS Virtual Camera is unavailable. In OBS, click "Start Virtual Camera", then close other apps using camera and retry.'
          : 'Camera is in use by another application. Please close other apps using the camera.';
      } else if (err.name === 'OverconstrainedError') {
        msg = 'Selected camera device is not available right now. Refresh devices and select it again.';
      }

      setCameraError(msg);
    }
  };

  // Stop camera — uses ref to avoid stale closure
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setStream(null);
    }
    stopMicMonitoring();
  };

  // Attach stream to video element — re-run whenever the <video> node may have re-mounted
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, currentStep, currentQuestion, inInterviewSession, isPlaying]);


  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCamera();
      stopMicMonitoring();
    };
  }, []);

  const handleRecordTestClip = () => {
    // Start recording using the current stream
    if (!stream) {
      setCameraError('No camera stream available. Please check your camera permissions.');
      return;
    }

    // Stop any playback before recording
    if (isPlaying) {
      setIsPlaying(false);
    }

    setIsRecording(true);
    setHasRecorded(false);
    setRecordedUrl(null);
    chunksRef.current = [];

    const mimeType = getSupportedMimeType();
    console.log('[TestClip] Recording with mimeType:', mimeType);

    const mediaRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 250000  // 250kbps - ~10x smaller files, very fast upload
    });
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
      const url = URL.createObjectURL(blob);
      setRecordedUrl(url);
      setHasRecorded(true);
      setIsRecording(false);
      console.log('Test clip recorded, blob size:', blob.size);
    };

    mediaRecorder.start(1000);

    // Auto-stop after 10 seconds for test clip
    setTimeout(() => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
    }, 10000);
  };

  const handleStopTestRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  const handlePlayClip = () => {
    if (recordedUrl) {
      setIsPlaying(true);
    }
  };

  const handleStopPlayback = () => {
    setIsPlaying(false);
  };

  const handleRecordAgain = () => {
    // Stop playback, clear recorded URL, start fresh recording
    setIsPlaying(false);
    setRecordedUrl(null);
    setHasRecorded(false);
    handleRecordTestClip();
  };

  const handleCaptureFace = async () => {
    if (!videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedFaceDataUrl(dataUrl);
    sessionStorage.setItem('reference_face_photo', dataUrl);
    setFaceCaptureDone(true);

    try {
      const res = await fetch(`${AI_SERVICE_BASE_URL}/proctoring/extract-face-encoding`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frame_b64: dataUrl.split(',')[1], session_id: null }),
      });
      if (res.ok) {
        const { encoding } = await res.json();
        if (Array.isArray(encoding) && encoding.length > 0) {
          sessionStorage.setItem('reference_face_encoding', JSON.stringify(encoding));
        }
      }
    } catch {
      // Non-fatal — identity verification won't run but interview can still proceed
    }
  };

  const handleRetryCamera = () => {
    console.log('[Camera] Retrying camera access');
    setCameraError(null);
    startCamera(selectedCameraId, selectedAudioId);
  };

  const handleStartQuestionRecording = () => {
    if (!stream) {
      setCameraError('No camera stream available. Please check your camera permissions.');
      return;
    }

    setQuestionRecording(true);
    chunksRef.current = [];

    try {
      // Pick the best supported mimeType that includes audio
      const mimeType = getSupportedMimeType();
      console.log('[MediaRecorder] Using mimeType:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 250000  // 250kbps - ~10x smaller files, very fast upload
      });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        setQuestionRecorded(true);
        setQuestionRecording(false);
        console.log('Question recorded, blob size:', blob.size);
      };

      mediaRecorder.start(1000);

      // Auto-stop after 120 seconds (2 minutes)
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, 120000);
    } catch (err) {
      console.error('Error starting recording:', err);
      setCameraError('Failed to start recording. Please try again.');
      setQuestionRecording(false);
    }
  };

  const handleRetryQuestion = () => {
    if (retries < 2) {
      setRetries(prev => prev + 1);
      setQuestionRecorded(false);
      setQuestionRecording(false);
      setQuestionTimer(120);
      // Clear the recorded video
      if (recordedUrl) {
        URL.revokeObjectURL(recordedUrl);
        setRecordedUrl(null);
      }
      chunksRef.current = [];
    }
  };

  const handleNextQuestion = async () => {
    // Show upload progress
    setShowUploadProgress(true);
    setUploadProgress(0);

    try {
      // Get recorded video blob
      const videoBlob = new Blob(chunksRef.current, { type: 'video/webm' });
      const questionData = questionsData[currentQuestion - 1];

      // Submit to backend with real upload progress tracking
      if (sessionId && questionData) {
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('question_id', questionData.id);
        formData.append('question_text', questionData.text);
        formData.append('video', videoBlob, 'response.webm');

        // Use XMLHttpRequest for real upload progress
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();

          // Track upload progress
          xhr.upload.addEventListener('progress', (e) => {
            if (e.lengthComputable) {
              const percentComplete = (e.loaded / e.total) * 100;
              setUploadProgress(Math.round(percentComplete));
            }
          });

          xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              console.log('Response submitted successfully');
              setUploadProgress(100);
              // Track this response for polling
              setSubmittedResponses(prev => [...prev, questionData.id]);
              resolve();
            } else {
              console.error('Failed to submit response:', xhr.status, xhr.statusText, xhr.responseText);
              reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText} - ${xhr.responseText}`));
            }
          });

          xhr.addEventListener('error', () => {
            console.error('Network error during upload - full error:', xhr);
            reject(new Error('Network error during upload'));
          });

          xhr.open('POST', '/api/v1/interview/response');
          xhr.setRequestHeader('Authorization', `Bearer ${localStorage.getItem('access_token')}`);
          // Don't set Content-Type - let browser set it with boundary
          console.log('[UPLOAD] Starting upload for question:', questionData.id, 'blob size:', videoBlob.size);
          xhr.send(formData);
        });
      }

      // Wait a bit then proceed
      setTimeout(async () => {
        setShowUploadProgress(false);
        setUploadProgress(0);

        // Move to next question or complete
        if (currentQuestion < totalQuestions) {
          setCurrentQuestion(prev => prev + 1);
          setQuestionRecorded(false);
          setQuestionRecording(false);
          setQuestionTimer(120);
          setRetries(0);
          // Clear the recorded video but DON'T stop the camera
          if (recordedUrl) {
            URL.revokeObjectURL(recordedUrl);
            setRecordedUrl(null);
          }
          chunksRef.current = [];
        } else {
          // Interview complete - mark session as completed and show thank you page
          stopCamera();
          if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => {});
          }

          // Mark session as completed in backend first
          if (sessionId) {
            try {
              await fetch('/api/v1/interview/complete', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({ session_id: sessionId })
              });
              console.log('Session marked as completed');
            } catch (err) {
              console.error('Failed to mark session complete:', err);
            }
          }

          // Invalidate home cache so the portal reflects the completed state immediately
          queryClient.invalidateQueries({ queryKey: queryKeys.candidate.home() });
          setInterviewComplete(true);
        }
      }, 500);
    } catch (error) {
      console.error('Error submitting response:', error);
      setShowUploadProgress(false);
      // Still proceed on error to allow finishing interview?
      // Maybe not if upload failed. User should retry.
      alert("Failed to upload video. Please try again.");
      // We do not advance question here if error
      // But clearing state for retry might be needed
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card className="max-w-5xl mx-auto p-12">
            <div className="flex flex-col items-center text-center space-y-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                <Sparkles className="w-8 h-8 text-white" />
              </div>

              <h2 className="text-gray-700">Welcome to AI Interview</h2>

              <p className="text-gray-600 max-w-lg">
                Get ready to showcase your skills and experience through our AI-powered interview process. We'll guide you through each step to ensure the best experience.
              </p>

              <div className="space-y-3 text-left w-full max-w-md pt-4">
                <div className="flex items-start gap-3 text-gray-600">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span className="text-sm">Interview duration: approximately 15-20 minutes</span>
                </div>
                <div className="flex items-start gap-3 text-gray-600">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span className="text-sm">You'll answer 5 questions via video recording</span>
                </div>
                <div className="flex items-start gap-3 text-gray-600">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span className="text-sm">Make sure you're in a quiet, well-lit environment</span>
                </div>
              </div>

              <Button
                className="w-full max-w-md mt-6 text-white rounded-full"
                style={{ backgroundColor: '#6366F1' }}
                onClick={() => setCurrentStep(2)}
              >
                Proceed to Setup
              </Button>
            </div>
          </Card>
        );

      case 2:
      default:
        return (
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
                      <p className="text-white font-medium text-sm">{cameraError}</p>
                      <Button variant="outline" size="sm" onClick={() => startCamera(selectedCameraId, selectedAudioId)} className="mt-3 text-white border-white/30 hover:bg-white/10">
                        Retry Camera
                      </Button>
                    </div>
                  ) : isPlaying ? (
                    <video src={recordedUrl || ''} controls autoPlay className="w-full h-full object-contain" />
                  ) : stream ? (
                    <div className="relative w-full h-full">
                      <video
                        ref={videoRef}
                        autoPlay
                        muted
                        playsInline
                        className="w-full h-full object-cover"
                        style={{ transform: 'scaleX(-1)' }}
                      />
                      {isRecording && (
                        <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-sm font-medium animate-pulse border border-white/10">
                          <div className="w-2.5 h-2.5 bg-red-500 rounded-full"></div>
                          Recording...
                        </div>
                      )}
                      {!isRecording && (
                        <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                          <div className="bg-black/50 backdrop-blur-md rounded-lg p-2.5 flex items-center gap-2 border border-white/10">
                            <Mic className={`w-4 h-4 ${micActive ? 'text-green-400' : 'text-gray-400'}`} />
                            <div className="flex gap-0.5 h-3 items-end">
                              {Array.from({ length: 10 }).map((_, i) => (
                                <div
                                  key={i}
                                  className={`w-1 rounded-t-sm transition-all duration-75 ${micLevel > (i / 10) * 100 ? 'bg-green-400' : 'bg-gray-600'}`}
                                  style={{ height: Math.max(20, Math.min(100, (micLevel / 50) * 100)) * (i / 10) + '%' }}
                                />
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Camera className="w-12 h-12 text-slate-600" />
                    </div>
                  )}
                </div>

                {!cameraError && (
                  <div className="space-y-3">
                    {/* Face capture — required before starting */}
                    <Button
                      onClick={handleCaptureFace}
                      disabled={!stream || isRecording}
                      className={`w-full h-12 rounded-xl font-medium border transition-colors ${
                        faceCaptureDone
                          ? 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100'
                          : 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
                      }`}
                      variant="outline"
                    >
                      {faceCaptureDone ? (
                        <><CheckCircle2 className="w-4 h-4 mr-2" /> Face Captured — Click to Recapture</>
                      ) : (
                        <><Camera className="w-4 h-4 mr-2" /> Capture Face Photo</>
                      )}
                    </Button>

                    {/* Device selectors */}
                    <div className="space-y-2 p-3 bg-gray-50 rounded-xl border border-gray-100">
                      <select
                        value={selectedCameraId}
                        onChange={(e) => { setSelectedCameraId(e.target.value); startCamera(e.target.value, selectedAudioId); }}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer"
                      >
                        {cameraDevices.length === 0 ? <option value="">No cameras detected</option> : cameraDevices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Camera ${i + 1}`}</option>)}
                      </select>
                      <select
                        value={selectedAudioId}
                        onChange={(e) => { setSelectedAudioId(e.target.value); startCamera(selectedCameraId, e.target.value); }}
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer"
                      >
                        {audioDevices.length === 0 ? <option value="">No microphones detected</option> : audioDevices.map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i + 1}`}</option>)}
                      </select>
                    </div>

                    {/* Optional test recording */}
                    <div className="flex gap-3">
                      <Button
                        onClick={isRecording ? handleStopTestRecording : hasRecorded ? handleRecordAgain : handleRecordTestClip}
                        disabled={isPlaying}
                        className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border-none h-11 font-medium text-sm"
                        variant="outline"
                      >
                        {isRecording ? (
                          <><Square className="w-4 h-4 mr-2" /> Stop</>
                        ) : hasRecorded ? (
                          <><Mic className="w-4 h-4 mr-2 text-gray-500" /> Record Again</>
                        ) : (
                          <><Mic className="w-4 h-4 mr-2 text-gray-500" /> Test Recording</>
                        )}
                      </Button>
                      <Button
                        onClick={isPlaying ? handleStopPlayback : handlePlayClip}
                        disabled={!hasRecorded || isRecording}
                        className="flex-1 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 border-none h-11 font-medium text-sm disabled:opacity-50"
                        variant="outline"
                      >
                        {isPlaying ? (
                          <><Square className="w-4 h-4 mr-2" /> Stop</>
                        ) : (
                          <><Play className="w-4 h-4 mr-2 text-gray-500" /> Play Test</>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column - Info & Checklist */}
              <div className="flex flex-col justify-between py-2">
                <div className="space-y-6">
                  <div className="flex gap-4 p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100/50">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-base mb-1">Look your best</h3>
                      <p className="text-sm text-gray-600 leading-relaxed">Ensure you are in a well-lit room and clearly visible in the center of the frame.</p>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-green-500" /> Prerequisites
                    </h4>
                    <ul className="space-y-3 text-sm text-gray-600">
                      <li className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${stream ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        Camera and Microphone permissions granted
                      </li>
                      <li className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${faceCaptureDone ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                        <span className={faceCaptureDone ? 'text-green-700 font-medium' : ''}>Face photo captured</span>
                        {capturedFaceDataUrl && (
                          <img
                            src={capturedFaceDataUrl}
                            alt="Captured face"
                            className="w-7 h-7 rounded-full object-cover ml-auto border-2 border-green-300"
                          />
                        )}
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500"></div>
                        Stable internet connection
                      </li>
                      <li className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full flex-shrink-0 bg-green-500"></div>
                        Quiet environment
                      </li>
                    </ul>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-gray-100">
                    <h4 className="font-semibold text-gray-800 text-sm">Interview guidelines</h4>
                    <ul className="space-y-2 text-sm text-gray-600">
                      <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">•</span> You'll record short video answers, one question at a time</li>
                      <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">•</span> Each question allows up to 2 minutes — a timer will be visible</li>
                      <li className="flex items-start gap-2"><span className="text-indigo-500 mt-0.5">•</span> Stay centered, speak clearly, and remain alone in frame</li>
                    </ul>
                  </div>
                </div>

                <div className="pt-8 mt-auto">
                  <Button
                    onClick={() => {
                      void document.documentElement.requestFullscreen().catch(() => {});
                      setInInterviewSession(true);
                    }}
                    disabled={!!cameraError || !stream || !faceCaptureDone}
                    className="w-full h-14 rounded-xl text-lg font-medium shadow-lg shadow-indigo-200 transition-transform active:scale-[0.98]"
                    style={{ backgroundColor: '#6366F1' }}
                  >
                    Start Interview
                  </Button>
                  {stream && !cameraError && !faceCaptureDone && (
                    <p className="text-center text-xs text-gray-400 mt-2">
                      Capture your face photo above to continue
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EDF0F8' }}>
      {fsCountdownActive && (
        <FullscreenCountdownOverlay
          secondsLeft={fsSecondsLeft}
          totalSeconds={FULLSCREEN_COUNTDOWN}
          onReenter={enterFullscreen}
        />
      )}

      {/* Interview Complete Page */}
      {interviewComplete ? (
        <div className="flex flex-col items-center justify-center min-h-screen p-8">
          <Card className="max-w-2xl w-full p-12 text-center">
            <div className="space-y-8">
              {/* Success Icon */}
              <div className="flex justify-center">
                <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10B981' }}>
                  <CheckCircle2 className="w-12 h-12 text-white" />
                </div>
              </div>

              {/* Title */}
              <div className="space-y-4">
                <h1 className="text-3xl font-bold text-gray-800">Interview Completed!</h1>
                <p className="text-lg text-gray-600">
                  Thank you for completing your AI video interview.
                </p>
              </div>

              {/* Status Info */}
              <div className="bg-blue-50 p-6 rounded-lg space-y-3">
                <div className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                  <span className="text-blue-700 font-medium">Processing your responses...</span>
                </div>
                <p className="text-sm text-blue-600">
                  Our AI is now analyzing your video responses. This typically takes a few minutes.
                  You can check your results on the monitoring page.
                </p>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 py-4">
                <div className="text-center">
                  <p className="text-3xl font-bold text-indigo-600">{totalQuestions}</p>
                  <p className="text-sm text-gray-500">Questions Answered</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-green-600">✓</p>
                  <p className="text-sm text-gray-500">Submitted</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">~5min</p>
                  <p className="text-sm text-gray-500">Processing Time</p>
                </div>
              </div>

              {/* Action Button */}
              <Button
                className="text-white rounded-full px-12 py-6 text-lg"
                style={{ backgroundColor: '#6366F1' }}
                onClick={onCompletion}
              >
                Return to Homepage
              </Button>
            </div>
          </Card>
        </div>
      ) : (
        <>
          {/* Header */}
          <header className="px-12 py-6">
            <div className="flex items-center justify-between">
              <div>
                <Logo size="md" />
              </div>
              <div>
                <Button
                  className="rounded-full px-6 transition-colors duration-200 border"
                  style={{ backgroundColor: '#EDF0F8', color: '#EF4444', borderColor: '#EF4444' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#EF4444';
                    e.currentTarget.style.color = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#EF4444';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#EDF0F8';
                    e.currentTarget.style.color = '#EF4444';
                    e.currentTarget.style.borderColor = '#EF4444';
                  }}
                  onClick={onSignOut}
                >
                  Sign out
                </Button>
              </div>
            </div>
          </header>

          {/* Conditionally render setup or interview session */}
          {!inInterviewSession ? (
            <>
              

              {/* Main Content */}
              <main className="px-12 py-8">
                {renderStepContent()}
              </main>
            </>
          ) : (
            <>
              {/* Question Progress Indicators */}
              <div className="px-12 py-6">
                <div className="max-w-4xl mx-auto flex items-center justify-center gap-3">
                  {Array.from({ length: totalQuestions }, (_, i) => i + 1).map((num) => {
                    const qData = questionsData[num - 1];
                    const isSubmitted = submittedResponses.includes(qData?.id);
                    const isProcessing = isSubmitted && processingStatuses[qData?.id] === 'processing';
                    const isComplete = isSubmitted && processingStatuses[qData?.id] === 'completed';
                    const isFailed = isSubmitted && processingStatuses[qData?.id] === 'failed';
                    
                    return (
                      <div
                        key={num}
                        className="w-16 h-16 rounded-2xl flex items-center justify-center text-white transition-all relative"
                        style={{
                          backgroundColor: isComplete ? '#10B981' : 
                                          isProcessing ? '#F59E0B' : 
                                          isFailed ? '#EF4444' :
                                          num === currentQuestion ? '#6366F1' : '#D1D5DB'
                        }}
                        title={isProcessing ? 'AI processing...' : isComplete ? 'Processed' : isFailed ? 'Processing failed' : ''}
                      >
                        {isProcessing ? (
                          <Loader2 className="w-6 h-6 animate-spin" />
                        ) : isComplete ? (
                          <CheckCircle2 className="w-6 h-6" />
                        ) : isFailed ? (
                          <X className="w-6 h-6" />
                        ) : (
                          num
                        )}
                      </div>
                    );
                  })}
                </div>
                {submittedResponses.length > 0 && (
                  <p className="text-center text-sm text-gray-500 mt-2">
                    {submittedResponses.length} response{submittedResponses.length > 1 ? 's' : ''} submitted • AI processing in background
                  </p>
                )}
              </div>

              {/* Interview Question Content */}
              <main className="px-12 py-8">
                {showUploadProgress ? (
                  // Upload Progress Screen
                  <Card className="max-w-4xl mx-auto p-12">
                    <div className="flex flex-col items-center space-y-6">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center animate-spin" style={{ borderTop: '4px solid #6366F1', borderRight: '4px solid transparent', borderBottom: '4px solid transparent', borderLeft: '4px solid transparent' }} />

                      <h3 className="text-gray-700">Uploading your response...</h3>

                      <div className="w-full max-w-md">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-gray-600 text-sm">Upload progress</span>
                          <span className="text-gray-700">{uploadProgress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all duration-300"
                            style={{
                              width: `${uploadProgress}%`,
                              backgroundColor: '#6366F1'
                            }}
                          />
                        </div>
                      </div>

                      <p className="text-gray-500 text-sm">Please wait while we save your answer...</p>
                    </div>
                  </Card>
                ) : (
                  // Question Screen
                  <Card className="max-w-4xl mx-auto p-8">
                    <div className="space-y-6">
                      {/* Question Box */}
                      <div className="p-6 rounded-lg border border-gray-200" style={{ backgroundColor: '#F9FAFB' }}>
                        <p className="text-gray-700 text-center">
                          {questions[currentQuestion - 1]}
                        </p>
                      </div>

                      {/* Camera Preview */}
                      <div className="bg-slate-900 rounded-lg overflow-hidden relative" style={{ height: '400px' }}>
                        {stream ? (
                          <video
                            ref={videoRef}
                            autoPlay
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                            style={{ transform: 'scaleX(-1)' }}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center">
                            <Camera className="w-16 h-16 text-slate-600 mb-2" />
                            <p className="text-slate-500 text-sm">{cameraError || 'Camera not available'}</p>
                            {cameraError && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => startCamera()}
                                className="mt-4 text-white border-white hover:bg-slate-800"
                              >
                                Retry Camera
                              </Button>
                            )}
                          </div>
                        )}
                        {/* Recording Indicator */}
                        {questionRecording && (
                          <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-500/90 text-white px-4 py-2 rounded-full animate-pulse">
                            <div className="w-3 h-3 bg-white rounded-full" />
                            <span className="text-sm font-medium">REC</span>
                          </div>
                        )}
                      </div>

                      {/* Timer */}
                      <div className="text-center">
                        <p className="text-gray-700" style={{ fontSize: '48px', fontFamily: 'monospace' }}>
                          {String(Math.floor(questionTimer / 60)).padStart(2, '0')}:{String(questionTimer % 60).padStart(2, '0')}
                        </p>
                        <p className="text-gray-500 text-sm mt-1">Retries: {retries} / 2</p>
                      </div>

                      {/* Recording Button */}
                      <div className="flex justify-center gap-4">
                        {!questionRecording ? (
                          <Button
                            className="text-white rounded-full px-12 py-6"
                            style={{ backgroundColor: '#6366F1' }}
                            onClick={handleStartQuestionRecording}
                            disabled={questionRecorded}
                          >
                            {questionRecorded ? 'Already Recorded' : 'Start Recording'}
                          </Button>
                        ) : (
                          <Button
                            className="text-white rounded-full px-12 py-6"
                            style={{ backgroundColor: '#EF4444' }}
                            onClick={() => {
                              if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
                                mediaRecorderRef.current.stop();
                              }
                            }}
                          >
                            Stop Recording
                          </Button>
                        )}
                      </div>

                      {/* Retry Button */}
                      {questionRecorded && !questionRecording && retries < 2 && (
                        <div className="flex justify-center">
                          <button
                            className="text-gray-500 text-sm hover:text-gray-700"
                            onClick={handleRetryQuestion}
                          >
                            Retry
                          </button>
                        </div>
                      )}

                      {/* Next Question Button */}
                      <div>
                        <Button
                          className="w-full text-white rounded-full py-6"
                          style={{ backgroundColor: '#6366F1' }}
                          onClick={handleNextQuestion}
                          disabled={!questionRecorded || questionRecording}
                        >
                          {currentQuestion === totalQuestions ? 'Submit Interview' : 'Next Question'}
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </main>
            </>
          )}
        </>
      )}
    </div>
  );
}
