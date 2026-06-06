import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, CheckCircle2, Code2, Flag, Play, Loader2, Send } from 'lucide-react';
import logo from '../imports/image-eramatch.png';
import { api } from '../services/api';
import { captureVideoFrameBase64, toWaveformPayload, quantizeWaveform, quantizeTimestampBucket } from '../utils/proctoringPayload';
import { useExamLockdown } from '../hooks/useExamLockdown';

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

interface AssessmentSessionProps {
  onSignOut: () => void;
  onComplete: () => void;
}

interface Question {
  id: string;
  type: 'essay' | 'mcq' | 'coding';
  question: string;
  options?: string[];
  correctAnswer?: number;
  starterCode?: string;
  language?: string;
  testCases?: { input: string; expected_output: string; is_hidden?: boolean }[];
  points: number;
  section_title?: string;
}

export function AssessmentSession({ onSignOut, onComplete }: AssessmentSessionProps) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [assessmentTimer, setAssessmentTimer] = useState(60 * 60); // 60 minutes default
  const [initialTimer, setInitialTimer] = useState(60 * 60);
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [inactivityCountdown, setInactivityCountdown] = useState(30); // 30 seconds
  const [showInactivityAlert, setShowInactivityAlert] = useState(false);
  const [showRedBorder, setShowRedBorder] = useState(false);
  const [assessmentComplete, setAssessmentComplete] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<Record<string, string>>({});
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<string>>(new Set());
  const [codeOutput, setCodeOutput] = useState<Record<string, string>>({});
  const [testResults, setTestResults] = useState<Record<string, { passed: boolean; output: string; expected: string; actual: string }[]>>({});
  const [showSubmitConfirmation, setShowSubmitConfirmation] = useState(false);
  const [integrityBlocked, setIntegrityBlocked] = useState(false);
  const [integrityReason, setIntegrityReason] = useState<string | null>(null);
  const [screenRecordingActive, setScreenRecordingActive] = useState(false);
  const [lockdownWarning, setLockdownWarning] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [maxAttempts, setMaxAttempts] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const eventThrottleRef = useRef<Record<string, number>>({});
  const proctoringStreamRef = useRef<MediaStream | null>(null);
  const proctoringVideoRef = useRef<HTMLVideoElement | null>(null);
  const captureStartedRef = useRef(false);
  const captureFullyInitializedRef = useRef(false);
  const screenCaptureVideoRef = useRef<HTMLVideoElement | null>(null);
  const proctoringCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastFrameRef = useRef<Uint8ClampedArray | null>(null);
  const lastFrameDimensionsRef = useRef<{ width: number; height: number } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<Float32Array | null>(null);
  const latestAudioFrameRef = useRef<Float32Array | null>(null);
  const screenCaptureStreamRef = useRef<MediaStream | null>(null);
  const screenRecorderRef = useRef<MediaRecorder | null>(null);
  const screenRecordingChunksRef = useRef<BlobPart[]>([]);
  const screenRecordingBlobRef = useRef<Blob | null>(null);
  const screenRecordingStopPromiseRef = useRef<Promise<Blob | null> | null>(null);
  const screenRecordingStopResolveRef = useRef<((blob: Blob | null) => void) | null>(null);
  const screenRecordingUploadStartedRef = useRef(false);
  const suspiciousTimestampBucketsRef = useRef<number[]>([]);
  const focusHiddenMsRef = useRef(0);
  const hiddenStartedAtRef = useRef<number | null>(null);
  const rapidShiftCountRef = useRef(0);
  const lastShiftTsRef = useRef(0);
  const sampleWindowStartRef = useRef(Date.now());
  const silentSamplesRef = useRef(0);
  const totalAudioSamplesRef = useRef(0);
  const assessmentTimerRef = useRef(assessmentTimer);
  const initialTimerRef = useRef(initialTimer);
  const currentQuestionIdRef = useRef<string | undefined>(undefined);
  const currentQuestionIndexRef = useRef(0);
  const audioWsRef = useRef<WebSocket | null>(null);


  // --- Browser prevention lockdown (tab switch, fullscreen, copy/paste, devtools) ---
  useExamLockdown({
    sessionId,
    enabled: !assessmentComplete && !isLoading && !!sessionId && screenRecordingActive,
    enforceFullscreen: false,
    onTerminated: (message) => {
      setIntegrityBlocked(true);
      setIntegrityReason(message);
      if (sessionId) {
        api.candidate.submitAssessment({ session_id: sessionId }).catch(() => {});
      }
      setAssessmentComplete(true);
    },
    onViolation: (event) => {
      setLockdownWarning(`⚠️ ${event.message}`);
      setTimeout(() => setLockdownWarning(null), 5000);
    },
  });

  useEffect(() => {
    assessmentTimerRef.current = assessmentTimer;
  }, [assessmentTimer]);

  useEffect(() => {
    initialTimerRef.current = initialTimer;
  }, [initialTimer]);

  useEffect(() => {
    currentQuestionIdRef.current = questions[currentQuestionIndex]?.id;
    currentQuestionIndexRef.current = currentQuestionIndex;
  }, [questions, currentQuestionIndex]);

  // Programming languages
  const programmingLanguages = [
    { value: 'javascript', label: 'JavaScript', extension: '.js' },
    { value: 'typescript', label: 'TypeScript', extension: '.ts' },
    { value: 'python', label: 'Python', extension: '.py' },
    { value: 'java', label: 'Java', extension: '.java' },
    { value: 'cpp', label: 'C++', extension: '.cpp' },
    { value: 'csharp', label: 'C#', extension: '.cs' },
    { value: 'go', label: 'Go', extension: '.go' },
    { value: 'ruby', label: 'Ruby', extension: '.rb' },
    { value: 'php', label: 'PHP', extension: '.php' },
    { value: 'swift', label: 'Swift', extension: '.swift' },
    { value: 'kotlin', label: 'Kotlin', extension: '.kt' },
    { value: 'rust', label: 'Rust', extension: '.rs' }
  ];

  // Fetch assessment config and start session from API
  useEffect(() => {
    const fetchAndStartAssessment = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);
        // Step 1: Get assessment config
        const config = await api.candidate.getAssessmentConfig() as any;
        setAssessmentId(config.assessment_id);
        setStageId(config.stage_id);
        
        const durationSeconds = (config.duration_minutes || 60) * 60;
        setAssessmentTimer(durationSeconds);
        setInitialTimer(durationSeconds);

        // Step 2: Start assessment session (or resume existing)
        const browserInfo = {
          user_agent: navigator.userAgent,
          screen_width: window.screen.width,
          screen_height: window.screen.height,
          viewport_width: window.innerWidth,
          viewport_height: window.innerHeight,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          language: navigator.language,
        };
        const session = await api.candidate.startAssessment({
          assessment_id: config.assessment_id,
          stage_id: config.stage_id,
          browser_info: browserInfo,
        }) as any;
        setSessionId(session.session_id);

        // Use remaining_seconds from backend if resuming, otherwise full duration
        if (session.remaining_seconds !== undefined && session.remaining_seconds !== null) {
          if (session.remaining_seconds <= 0) {
            // Timer already expired — auto-submit immediately
            try {
              await api.candidate.submitAssessment({ session_id: session.session_id });
            } catch (e) { console.error('Auto-submit expired session:', e); }
            setAssessmentComplete(true);
            setIsLoading(false);
            return;
          }
          setAssessmentTimer(session.remaining_seconds);
          setInitialTimer(durationSeconds);
        }

        // Map API data to component format
        const mappedQuestions: Question[] = session.questions.map((q: any) => {
          const qType = q.question_type === 'code' ? 'coding' : q.question_type;
          
          // Auto-detect language from starter code if not specified
          let lang = q.question_config?.language || 'python';
          if (!lang && q.question_config?.starter_code) {
            const code = q.question_config.starter_code;
            if (code.includes('def ') || code.includes('import ') || code.includes('print(')) {
              lang = 'python';
            } else if (code.includes('function ') || code.includes('const ') || code.includes('console.log')) {
              lang = 'javascript';
            }
          }
          
          return {
            id: q.question_id,
            type: qType as 'essay' | 'mcq' | 'coding',
            question: q.question_text,
            options: q.question_config?.options,
            starterCode: q.question_config?.starter_code,
            language: lang,
            testCases: q.question_config?.test_cases,
            points: q.points || 10,
            section_title: q.section_title,
          };
        });
        setQuestions(mappedQuestions);
        
        // Initialize selected languages based on question defaults
        const initialLanguages: Record<string, string> = {};
        mappedQuestions.forEach(q => {
          if (q.type === 'coding' && q.language) {
            initialLanguages[q.id] = q.language;
          }
        });
        setSelectedLanguages(initialLanguages);

        // Restore saved answers if resuming
        if (session.saved_answers) {
          const restoredAnswers: Record<string, string | number> = {};
          const restoredAttempts: Record<string, number> = {};
          for (const [qid, data] of Object.entries(session.saved_answers as Record<string, any>)) {
            const ad = data.answer_data;
            if (ad) {
              if (ad.selected_option !== undefined) restoredAnswers[qid] = ad.selected_option;
              else if (ad.text !== undefined) restoredAnswers[qid] = ad.text;
              else if (ad.code !== undefined) restoredAnswers[qid] = ad.code;
            }
            if (data.attempt_count) restoredAttempts[qid] = data.attempt_count;
          }
          setAnswers(restoredAnswers);
          setAttemptCounts(restoredAttempts);
        }
      } catch (error) {
        console.error('Failed to fetch/start assessment:', error);
        console.error('Error details:', error instanceof Error ? error.message : String(error));
        setLoadError(error instanceof Error ? error.message : 'Unknown error while loading assessment');
        setQuestions([]);
        setSessionId(null);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAndStartAssessment();
  }, []);

  const currentQuestion = questions[currentQuestionIndex];

  const emitIntegrityEvent = useCallback(async (
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
      const response = await api.candidate.reportIntegrityEvent({
        session_id: sessionId,
        event_type: eventType,
        severity,
        source: 'candidate_portal',
        metadata: {
          question_id: currentQuestionIdRef.current,
          question_index: currentQuestionIndexRef.current,
          timer_remaining_seconds: assessmentTimerRef.current,
          ...metadata,
        },
      });

      const action = response?.enforcement_action;
      if (action === 'terminate') {
        setIntegrityBlocked(true);
        setIntegrityReason(response?.enforcement_reason || 'critical_event_detected');
        try {
          await api.candidate.submitAssessment({ session_id: sessionId });
        } catch (submitErr) {
          console.error('Failed to auto-submit after terminate action:', submitErr);
        }
        setAssessmentComplete(true);
      } else if (action === 'pause') {
        setIntegrityBlocked(true);
        setIntegrityReason(response?.enforcement_reason || 'repeated_high_risk_pattern');
      }
    } catch (error) {
      console.error('Failed to report integrity event:', error);
    }
  }, [sessionId]);

  const finalizeSystemScreenRecording = useCallback(async (): Promise<Blob | null> => {
    const recorder = screenRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
    }

    if (screenRecordingStopPromiseRef.current) {
      const timeoutPromise = new Promise<Blob | null>((resolve) => {
        window.setTimeout(() => resolve(screenRecordingBlobRef.current), 4000);
      });
      return Promise.race([screenRecordingStopPromiseRef.current, timeoutPromise]);
    }

    return screenRecordingBlobRef.current;
  }, []);

  const uploadSystemScreenRecording = useCallback(async () => {
    if (!sessionId || screenRecordingUploadStartedRef.current) {
      return;
    }
    screenRecordingUploadStartedRef.current = true;

    try {
      const blob = await finalizeSystemScreenRecording();
      if (!blob || blob.size === 0) {
        return;
      }
      await api.candidate.uploadAssessmentRecording(sessionId, blob);
    } catch (error) {
      console.error('Failed to upload system-captured assessment recording:', error);
    }
  }, [sessionId, finalizeSystemScreenRecording]);

  useEffect(() => {
    if (!assessmentComplete || !sessionId) return;
    void uploadSystemScreenRecording();
  }, [assessmentComplete, sessionId, uploadSystemScreenRecording]);

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
    const video = proctoringVideoRef.current;
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
      return 0.2;
    }

    const prev = lastFrameRef.current;
    let diffSum = 0;
    let samples = 0;
    for (let i = 0; i < frame.length; i += 12) {
      diffSum += Math.abs(frame[i] - prev[i]);
      samples += 1;
    }

    lastFrameRef.current = new Uint8ClampedArray(frame);
    const avgDiff = samples > 0 ? diffSum / samples : 0;
    return Math.max(0, Math.min(1, avgDiff / 40));
  }, []);

  const sampleAudioSilence = useCallback(() => {
    const analyser = audioAnalyserRef.current;
    const buffer = audioBufferRef.current;
    if (!analyser || !buffer) return;

    (analyser as any).getFloatTimeDomainData(buffer);
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i += 1) {
      sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    latestAudioFrameRef.current = new Float32Array(buffer);
    totalAudioSamplesRef.current += 1;
    if (rms < 0.015) {
      silentSamplesRef.current += 1;
    }
  }, []);

  useEffect(() => {
    if (assessmentComplete || !sessionId) return;
    if (!ENABLE_BIOMETRIC_BETA) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      void emitIntegrityEvent('biometric_capture_unavailable', 'medium', {
        reason: 'media_devices_not_supported',
      }, 60000);
      return;
    }

    let stopped = false;

    const handleBlur = () => {
      if (!captureFullyInitializedRef.current) return;
      const now = Date.now();
      if (now - lastShiftTsRef.current < 4000) {
        rapidShiftCountRef.current += 1;
      }
      lastShiftTsRef.current = now;
      if (hiddenStartedAtRef.current === null) {
        hiddenStartedAtRef.current = now;
      }
    };

    const handleFocus = () => {
      if (!captureFullyInitializedRef.current) return;
      const now = Date.now();
      if (hiddenStartedAtRef.current !== null) {
        focusHiddenMsRef.current += now - hiddenStartedAtRef.current;
        hiddenStartedAtRef.current = null;
      }
      if (now - lastShiftTsRef.current < 4000) {
        rapidShiftCountRef.current += 1;
      }
      lastShiftTsRef.current = now;
    };

    const handleVisibility = () => {
      if (document.hidden) {
        handleBlur();
      } else {
        handleFocus();
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    const startCapture = async () => {
      try {
        if (captureStartedRef.current) return;
        captureStartedRef.current = true;
        
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });
        if (stopped) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        proctoringStreamRef.current = stream;
        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play().catch(() => undefined);
        proctoringVideoRef.current = video;

        const audioCtx = new AudioContext();
        audioContextRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        audioAnalyserRef.current = analyser;
        audioBufferRef.current = new Float32Array(analyser.fftSize);

        if (!navigator.mediaDevices?.getDisplayMedia) {
          setIntegrityBlocked(true);
          setIntegrityReason('screen_recording_not_supported');
          void emitIntegrityEvent('screen_recording_unavailable', 'high', {
            reason: 'get_display_media_not_supported',
          }, 30000);
          return;
        }

        const displayStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 12, max: 20 },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        if (stopped) {
          displayStream.getTracks().forEach(t => t.stop());
          return;
        }

        const screenVideo = document.createElement('video');
        screenVideo.srcObject = displayStream;
        screenVideo.muted = true;
        screenVideo.playsInline = true;
        await screenVideo.play().catch(() => undefined);

        const displayTrack = displayStream.getVideoTracks()[0];
        if (displayTrack) {
          displayTrack.onended = () => {
            setScreenRecordingActive(false);
            setIntegrityBlocked(true);
            setIntegrityReason('screen_recording_stopped');
            void emitIntegrityEvent('screen_recording_stopped', 'high', {
              reason: 'candidate_ended_screen_share',
            }, 4000);
          };
        }

        if (typeof MediaRecorder !== 'undefined') {
          const recorder = new MediaRecorder(displayStream, { mimeType: 'video/webm' });
          screenRecordingChunksRef.current = [];
          screenRecordingBlobRef.current = null;
          screenRecordingStopPromiseRef.current = new Promise<Blob | null>((resolve) => {
            screenRecordingStopResolveRef.current = resolve;
          });
          recorder.ondataavailable = (event: BlobEvent) => {
            if (event.data && event.data.size > 0) {
              screenRecordingChunksRef.current.push(event.data);
            }
          };
          recorder.onstop = () => {
            const blob = screenRecordingChunksRef.current.length > 0
              ? new Blob(screenRecordingChunksRef.current, { type: 'video/webm' })
              : null;
            screenRecordingBlobRef.current = blob;
            if (screenRecordingStopResolveRef.current) {
              screenRecordingStopResolveRef.current(blob);
            }
          };
          recorder.start(10000);
          screenRecorderRef.current = recorder;
        }

        screenCaptureStreamRef.current = displayStream;
        screenCaptureVideoRef.current = screenVideo;
        setScreenRecordingActive(true);

        // Reset tracking to ignore the blur caused by the getDisplayMedia dialog
        captureFullyInitializedRef.current = true;
        sampleWindowStartRef.current = Date.now();
        focusHiddenMsRef.current = 0;
        rapidShiftCountRef.current = 0;
        hiddenStartedAtRef.current = null;
      } catch (error) {
        console.error('Biometric capture init failed:', error);
        const err = error as { name?: string };
        if (err?.name === 'NotAllowedError') {
          setIntegrityBlocked(true);
          setIntegrityReason('screen_recording_permission_denied');
          void emitIntegrityEvent('screen_recording_permission_denied', 'high', {
            reason: 'candidate_denied_screen_share_permission',
          }, 15000);
          return;
        }
        void emitIntegrityEvent('biometric_capture_unavailable', 'medium', {
          reason: 'permission_or_device_error_or_screen_capture_failed',
        }, 60000);
      }
    };

    const wsUrl = `${AI_SERVICE_BASE_URL.replace(/^http/, 'ws')}/proctoring/ws/audio-stream/${sessionId}`;
    const ws = new WebSocket(wsUrl);
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.status === 'processed') {
          if (data.audio_spike) {
            setLockdownWarning('⚠️ AI Proctoring Alert: Audio spike detected');
            setTimeout(() => setLockdownWarning(null), 5000);
          }
          if (data.voice_switch) {
            setLockdownWarning('⚠️ AI Proctoring Alert: Background voice detected');
            setTimeout(() => setLockdownWarning(null), 5000);
          }
        }
      } catch (e) { console.error('WebSocket message parsing failed', e); }
    };
    audioWsRef.current = ws;

    const sampleInterval = window.setInterval(() => {
      sampleAudioSilence();
      measureFaceMotion();
      
      if (audioWsRef.current?.readyState === WebSocket.OPEN && latestAudioFrameRef.current) {
         const floatArr = latestAudioFrameRef.current;
         const int16Arr = new Int16Array(floatArr.length);
         for (let i = 0; i < floatArr.length; i++) {
           int16Arr[i] = Math.max(-32768, Math.min(32767, floatArr[i] * 32768));
         }
         audioWsRef.current.send(int16Arr.buffer);
      }
    }, BIOMETRIC_SAMPLE_INTERVAL_MS);

    const analysisInterval = window.setInterval(async () => {
      if (!sessionId || assessmentComplete || !captureFullyInitializedRef.current) return;

      if (hiddenStartedAtRef.current !== null) {
        const now = Date.now();
        focusHiddenMsRef.current += now - hiddenStartedAtRef.current;
        hiddenStartedAtRef.current = now;
      }

      const elapsedWindowMs = Math.max(1, Date.now() - sampleWindowStartRef.current);
      const offScreenRatio = Math.max(0, Math.min(1, focusHiddenMsRef.current / elapsedWindowMs));
      const awayDurationSeconds = focusHiddenMsRef.current / 1000;
      const rapidShiftCount = rapidShiftCountRef.current;
      const silenceRatio = totalAudioSamplesRef.current > 0
        ? silentSamplesRef.current / totalAudioSamplesRef.current
        : 0;

      const stream = proctoringStreamRef.current;
      const videoTrack = stream?.getVideoTracks()[0];
      const audioTrack = stream?.getAudioTracks()[0];
      const hasLiveVideo = !!videoTrack && videoTrack.readyState === 'live' && videoTrack.enabled;
      const hasLiveAudio = !!audioTrack && audioTrack.readyState === 'live' && audioTrack.enabled;
      const faceMotion = measureFaceMotion();
      const frameB64 = hasLiveVideo ? captureVideoFrameBase64(proctoringVideoRef.current, 224, 224) : null;
      const screenFrameB64 = screenRecordingActive ? captureVideoFrameBase64(screenCaptureVideoRef.current, 320, 180) : null;
      const audioWaveformRaw = hasLiveAudio ? toWaveformPayload(latestAudioFrameRef.current, 16000) : null;
      const audioWaveform = quantizeWaveform(audioWaveformRaw, 24);
      const audioSampleRate = audioContextRef.current?.sampleRate ?? 16000;
      const elapsedAssessmentSeconds = Math.max(0, initialTimerRef.current - assessmentTimerRef.current);
      const quantizedSecond = quantizeTimestampBucket(elapsedAssessmentSeconds, 5);

      const [faceResult, gazeResult, emotionResult] = await Promise.all([
        postProctoringSignal('face', {
          session_id: sessionId,
          faces_detected: hasLiveVideo ? 1 : 0,
          multiple_faces: false,
          face_match_score: hasLiveVideo ? 0.8 : 0.0,
          liveness_score: hasLiveVideo ? Math.max(0.2, faceMotion) : 0.0,
          frame_b64: frameB64,
          screen_frame_b64: screenFrameB64,
          capture_quantization: {
            timestamp_bucket_seconds: 5,
            waveform_levels: 24,
            screen_frame_resolution: '320x180',
          },
          client_capture_second: quantizedSecond,
          suspicious_timestamp_buckets: suspiciousTimestampBucketsRef.current,
        }),

        postProctoringSignal('gaze', {
          session_id: sessionId,
          off_screen_ratio: offScreenRatio,
          away_duration_seconds: awayDurationSeconds,
          rapid_shift_count: rapidShiftCount,
          frame_b64: frameB64,
          screen_frame_b64: screenFrameB64,
          client_capture_second: quantizedSecond,
          suspicious_timestamp_buckets: suspiciousTimestampBucketsRef.current,
        }),
        postProctoringSignal('emotion', {
          session_id: sessionId,
          dominant_emotion: offScreenRatio > 0.55 ? 'fear' : 'neutral',
          stress_score: Math.max(0, Math.min(1, (offScreenRatio * 0.7) + (rapidShiftCount * 0.04))),
          negative_ratio: Math.max(0, Math.min(1, (offScreenRatio * 0.6) + (silenceRatio * 0.2))),
          frame_b64: frameB64,
          screen_frame_b64: screenFrameB64,
          client_capture_second: quantizedSecond,
          suspicious_timestamp_buckets: suspiciousTimestampBucketsRef.current,
        }),
      ]);

      const results = [faceResult, gazeResult, emotionResult].filter(Boolean) as ProctoringSignalResult[];
      for (const result of results) {
        if (result.risk_score < BIOMETRIC_RISK_THRESHOLD) continue;
        const suspectBucket = quantizeTimestampBucket(elapsedAssessmentSeconds, 5);
        if (!suspiciousTimestampBucketsRef.current.includes(suspectBucket)) {
          suspiciousTimestampBucketsRef.current = [
            ...suspiciousTimestampBucketsRef.current,
            suspectBucket,
          ].sort((a, b) => a - b).slice(-120);
        }
        await emitIntegrityEvent(
          result.event_type,
          result.severity,
          {
            timestamp_bucket_seconds: 5,
            suspicious_timestamp_buckets: suspiciousTimestampBucketsRef.current,
            source_signal: result.signal_type,
            proctoring_risk_score: result.risk_score,
            proctoring_confidence: result.confidence,
            proctoring_mode: result.adapter_mode,
            proctoring_recommendation: result.recommendation,
            proctoring_metadata: result.metadata,
          },
          12000,
        );
        
        // Show AI proctoring warning on the UI dashboard
        setLockdownWarning(`⚠️ AI Proctoring Alert: ${result.event_type.replace(/_/g, ' ')}`);
        setTimeout(() => setLockdownWarning(null), 5000);
      }

      // --- YOLO Object Detection (phone/book/person) ---
      if (frameB64) {
        try {
          const envResponse = await fetch(`${AI_SERVICE_BASE_URL}/proctoring/environment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, frame_b64: frameB64, screen_frame_b64: screenFrameB64 }),
          });
          if (envResponse.ok) {
            const envResult = await envResponse.json();
            if (envResult.risk_score > BIOMETRIC_RISK_THRESHOLD) {
              await emitIntegrityEvent(envResult.event_type, envResult.severity, {
                source_signal: 'environment',
                detected_objects: envResult.metadata?.resolved_inputs?.detected_objects,
                proctoring_risk_score: envResult.risk_score,
                proctoring_confidence: envResult.confidence,
              }, 8000);
              
              setLockdownWarning(`⚠️ Environment Alert: ${envResult.event_type.replace(/_/g, ' ')}`);
              setTimeout(() => setLockdownWarning(null), 5000);
            }
          }
        } catch (err) {
          console.error('[Proctoring] Environment detection failed:', err);
        }
      }

      // --- Unified Frame Analysis (objects + identity + gaze + liveness) ---
      if (hasLiveVideo) {
        const hiResFrame = captureVideoFrameBase64(proctoringVideoRef.current, 640, 480);
        if (hiResFrame) {
          try {
              const storedFaceEncodingStr = sessionStorage.getItem('reference_face_encoding');
              const storedFaceEncoding = storedFaceEncodingStr ? JSON.parse(storedFaceEncodingStr) : null;
              const unifiedResponse = await fetch(`${AI_SERVICE_BASE_URL}/proctoring/analyze-frame`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  session_id: sessionId,
                  frame_b64: hiResFrame,
                  stored_face_encoding: storedFaceEncoding,
                  face_check_interval: 10.0,
                }),
              });
            if (unifiedResponse.ok) {
              const unified = await unifiedResponse.json();
              // Report any violations from the unified analysis
              if (unified.violations && unified.violations.length > 0) {
                for (const v of unified.violations) {
                  await emitIntegrityEvent(v.type || 'unified_analysis_violation', v.severity || 'high', {
                    source_signal: 'unified_analysis',
                    violation_detail: v,
                    trust_score: unified.trust_score,
                  }, 8000);
                  
                  setLockdownWarning(`⚠️ System Alert: ${v.description || v.type}`);
                  setTimeout(() => setLockdownWarning(null), 5000);
                }
              }
              // Check for terminated session
              if (unified.is_terminated) {
                setIntegrityBlocked(true);
                setIntegrityReason('Session terminated by proctoring system.');
                setAssessmentComplete(true);
              }
            }
          } catch (err) {
            console.error('[Proctoring] Unified frame analysis failed:', err);
          }
        }
      }

      // Reset rolling window after each analysis cycle.
      sampleWindowStartRef.current = Date.now();
      focusHiddenMsRef.current = 0;
      rapidShiftCountRef.current = 0;
      silentSamplesRef.current = 0;
      totalAudioSamplesRef.current = 0;
    }, BIOMETRIC_ANALYSIS_INTERVAL_MS);

    void startCapture();

    return () => {
      stopped = true;
      window.clearInterval(sampleInterval);
      window.clearInterval(analysisInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
      proctoringStreamRef.current?.getTracks().forEach(track => track.stop());
      proctoringStreamRef.current = null;
      captureStartedRef.current = false;
      proctoringVideoRef.current = null;
      if (screenRecorderRef.current && screenRecorderRef.current.state !== 'inactive') {
        screenRecorderRef.current.stop();
      }
      screenRecorderRef.current = null;
      screenCaptureStreamRef.current?.getTracks().forEach(track => track.stop());
      screenCaptureStreamRef.current = null;
      screenCaptureVideoRef.current = null;
      setScreenRecordingActive(false);
      captureFullyInitializedRef.current = false;
      audioAnalyserRef.current = null;
      audioBufferRef.current = null;
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (audioWsRef.current) {
        audioWsRef.current.close();
        audioWsRef.current = null;
      }
    };
  }, [sessionId, assessmentComplete, emitIntegrityEvent, postProctoringSignal, measureFaceMotion, sampleAudioSilence]);

  // Heartbeat sync - keeps timer accurate and survives tab freezes
  useEffect(() => {
    if (assessmentComplete || !sessionId) return;

    const syncWithBackend = async () => {
      try {
        const status = await api.candidate.heartbeat(sessionId) as any;
        
        if (status.status === 'completed' || status.status === 'expired') {
          setAssessmentTimer(0);
          setAssessmentComplete(true);
          return;
        }

        if (status.status === 'blocked_integrity') {
          setIntegrityBlocked(true);
          setIntegrityReason(status.enforcement_reason || 'integrity_policy_blocked');
          if (status.enforcement_action === 'terminate') {
            try {
              await api.candidate.submitAssessment({ session_id: sessionId });
            } catch (submitErr) {
              console.error('Failed to auto-submit blocked assessment:', submitErr);
            }
            setAssessmentComplete(true);
          }
        }
        
        // Update timer from backend (authoritative source)
        setAssessmentTimer(status.remaining_seconds);
        
        // Periodic save of all current answers
        for (const q of questions) {
          if (answers[q.id] !== undefined) {
            const answerData = q.type === 'mcq'
              ? { selected_option: answers[q.id] }
              : q.type === 'essay'
                ? { text: answers[q.id] }
                : { code: answers[q.id] as string, language: selectedLanguages[q.id] || q.language || 'python' };
            
            api.candidate.saveAnswer({
              session_id: sessionId,
              question_id: q.id,
              answer_data: answerData,
            }).catch(err => console.error('Periodic save failed:', err));
          }
        }
      } catch (err) {
        console.error('Heartbeat sync failed:', err);
      }
    };

    // Initial sync
    syncWithBackend();

    // Sync every 30 seconds
    const syncInterval = setInterval(syncWithBackend, 30000);
    return () => clearInterval(syncInterval);
  }, [assessmentComplete, sessionId]);

  // Local timer countdown (supplements heartbeat for smooth display)
  useEffect(() => {
    if (assessmentComplete || assessmentTimerRef.current <= 0) return;

    const timer = setInterval(() => {
      setAssessmentTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-submit when timer reaches 0
          if (sessionId) {
            api.candidate.submitAssessment({ session_id: sessionId })
              .then(() => {
                setAssessmentComplete(true);
              })
              .catch((err: unknown) => {
                console.error('Failed to auto-submit on timer expiry:', err);
                setAssessmentComplete(true);
              });
          } else {
            setAssessmentComplete(true);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [assessmentComplete, sessionId]);

  // Inactivity detection
  useEffect(() => {
    const checkInactivity = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivity;
      const inactiveSeconds = Math.floor(timeSinceLastActivity / 1000);

      if (inactiveSeconds >= 30 && !showInactivityAlert) {
        setShowInactivityAlert(true);
        setInactivityCountdown(5);
        void emitIntegrityEvent('inactivity_detected', 'medium', {
          inactive_seconds: inactiveSeconds,
        }, 15000);
      }
    }, 1000);

    return () => clearInterval(checkInactivity);
  }, [lastActivity, showInactivityAlert, emitIntegrityEvent]);

  // Inactivity countdown
  useEffect(() => {
    if (showInactivityAlert && inactivityCountdown > 0) {
      const countdown = setInterval(() => {
        setInactivityCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            setShowRedBorder(true);
            void emitIntegrityEvent('inactivity_timeout', 'high', {
              inactivity_countdown_seconds: 5,
            }, 15000);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdown);
    }
  }, [showInactivityAlert, inactivityCountdown, emitIntegrityEvent]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        void emitIntegrityEvent('tab_hidden', 'medium', {
          hidden: true,
        }, 5000);
      }
    };

    const handleWindowBlur = () => {
      void emitIntegrityEvent('window_blur', 'medium', {}, 5000);
    };

    const handleCopy = () => {
      void emitIntegrityEvent('copy_attempt', 'medium');
    };

    const handlePaste = () => {
      void emitIntegrityEvent('paste_attempt', 'high');
    };

    const handleContextMenu = () => {
      void emitIntegrityEvent('context_menu_open', 'low');
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        void emitIntegrityEvent('copy_shortcut', 'medium');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        void emitIntegrityEvent('paste_shortcut', 'high');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [emitIntegrityEvent]);

  // Track user activity
  const handleActivity = () => {
    setLastActivity(Date.now());
    if (showInactivityAlert) {
      setShowInactivityAlert(false);
      setShowRedBorder(false);
      setInactivityCountdown(5);
    }
  };

  // Disable copy/paste
  // useEffect(() => {
  //   const preventCopy = (e: ClipboardEvent) => {
  //     e.preventDefault();
  //   };

  //   const preventPaste = (e: ClipboardEvent) => {
  //     e.preventDefault();
  //   };

  //   const preventContextMenu = (e: MouseEvent) => {
  //     e.preventDefault();
  //   };

  //   document.addEventListener('copy', preventCopy);
  //   document.addEventListener('paste', preventPaste);
  //   document.addEventListener('contextmenu', preventContextMenu);

  //   return () => {
  //     document.removeEventListener('copy', preventCopy);
  //     document.removeEventListener('paste', preventPaste);
  //     document.removeEventListener('contextmenu', preventContextMenu);
  //   };
  // }, []);

  const handleAnswerChange = (value: string | number) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: value
    }));
    handleActivity();

    // Auto-save answer to backend (debounced via timeout)
    if (sessionId) {
      const answerData = currentQuestion.type === 'mcq'
        ? { selected_option: value }
        : currentQuestion.type === 'essay'
          ? { text: value }
          : { code: value, language: selectedLanguages[currentQuestion.id] || currentQuestion.language || 'python' };

      api.candidate.saveAnswer({
        session_id: sessionId,
        question_id: currentQuestion.id,
        answer_data: answerData,
      }).catch(err => console.error('Failed to save answer:', err));
    }
  };

  const handleNextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      handleActivity();
    }
  };

  const handlePreviousQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
      handleActivity();
    }
  };

  const handleSubmitAssessment = async () => {
    if (!sessionId) return;
    try {
      const result = await api.candidate.submitAssessment({ session_id: sessionId }) as any;
      console.log('Assessment submitted:', result);
      setAssessmentComplete(true);
    } catch (error) {
      console.error('Failed to submit assessment:', error);
      setAssessmentComplete(true);
    }
  };

  const handleSubmitClick = () => {
    const unansweredCount = questions.length - answeredCount;
    if (unansweredCount > 0) {
      setShowSubmitConfirmation(true);
    } else {
      handleSubmitAssessment();
    }
  };

  const toggleFlagQuestion = (questionId: string) => {
    setFlaggedQuestions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(questionId)) {
        newSet.delete(questionId);
      } else {
        newSet.add(questionId);
      }
      return newSet;
    });
    handleActivity();
  };

  const handleRunCode = async () => {
    const code = answers[currentQuestion.id] as string || currentQuestion.starterCode || '';
    const language = selectedLanguages[currentQuestion.id] || currentQuestion.language || 'python';

    setIsRunningCode(true);
    setCodeOutput(prev => ({
      ...prev,
      [currentQuestion.id]: '⏳ Running code...'
    }));

    try {
      const result = await api.candidate.runCode({ code, language }) as any;

      let output = '';
      if (result.status === 'Accepted') {
        output = `✓ Code executed successfully\n\nOutput:\n${result.stdout || '(no output)'}`;
      } else if (result.compile_output) {
        output = `✗ Compilation Error:\n${result.compile_output}`;
      } else if (result.stderr) {
        output = `✗ Runtime Error:\n${result.stderr}`;
      } else {
        output = `Status: ${result.status}\n${result.stdout || result.stderr || '(no output)'}`;
      }

      if (result.time) output += `\n\n⏱ Time: ${result.time}s`;
      if (result.memory) output += `\n💾 Memory: ${Math.round(result.memory / 1024)} KB`;

      setCodeOutput(prev => ({
        ...prev,
        [currentQuestion.id]: output
      }));
    } catch (error) {
      setCodeOutput(prev => ({
        ...prev,
        [currentQuestion.id]: `✗ Error: ${(error as Error).message}`
      }));
    } finally {
      setIsRunningCode(false);
    }
    handleActivity();
  };

  const handleSubmitAnswer = async () => {
    if (!sessionId || !currentQuestion) return;
    
    const code = answers[currentQuestion.id] as string || currentQuestion.starterCode || '';
    const language = selectedLanguages[currentQuestion.id] || currentQuestion.language || 'python';
    const currentAttempts = attemptCounts[currentQuestion.id] || 0;
    const maxAtt = maxAttempts[currentQuestion.id] || 5;

    if (currentAttempts >= maxAtt) return;

    setIsSubmittingAnswer(true);
    setCodeOutput(prev => ({
      ...prev,
      [currentQuestion.id]: '⏳ Submitting answer & running all tests...'
    }));
    setTestResults(prev => ({ ...prev, [currentQuestion.id]: [] }));
    
    try {
      const result = await api.candidate.runTests({
        session_id: sessionId,
        question_id: currentQuestion.id,
        code,
        language,
      }) as any;

      // Update attempt counts
      setAttemptCounts(prev => ({ ...prev, [currentQuestion.id]: result.attempt_count }));
      setMaxAttempts(prev => ({ ...prev, [currentQuestion.id]: result.max_attempts }));

      // Map visible results
      const mappedResults = (result.visible_results || []).map((r: any) => ({
        passed: r.passed,
        expected: r.expected,
        actual: r.actual,
        output: r.actual,
      }));
      setTestResults(prev => ({ ...prev, [currentQuestion.id]: mappedResults }));

      // Summary message
      const hiddenInfo = result.hidden_total > 0
        ? ` | Hidden: ${result.hidden_passed}/${result.hidden_total} passed`
        : '';
      setCodeOutput(prev => ({
        ...prev,
        [currentQuestion.id]: result.all_passed
          ? `✅ All tests passed! (Attempt ${result.attempt_count}/${result.max_attempts})${hiddenInfo}`
          : `❌ Some tests failed. (Attempt ${result.attempt_count}/${result.max_attempts})${hiddenInfo}`,
      }));
    } catch (error: any) {
      const msg = error?.response?.data?.detail || error?.message || 'Unknown error';
      setCodeOutput(prev => ({
        ...prev,
        [currentQuestion.id]: `✗ Error: ${msg}`
      }));
    } finally {
      setIsSubmittingAnswer(false);
    }
    handleActivity();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const answeredCount = Object.keys(answers).length;

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EDF0F8' }}>
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin mx-auto mb-4" style={{ color: '#6366F1' }} />
          <p className="text-gray-600">Loading assessment...</p>
        </div>
      </div>
    );
  }

  // Safety check for questions
  if (questions.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EDF0F8' }}>
        <Card className="max-w-md p-8 text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h3 className="text-gray-900 font-medium mb-2">Failed to load assessment</h3>
          <p className="text-gray-600 mb-2">Unable to load questions.</p>
          {loadError && (
            <p className="text-xs text-gray-500 mb-4 break-words">{loadError}</p>
          )}
          {!loadError && <div className="mb-2" />}
          <Button onClick={onSignOut} variant="outline">Back to Home</Button>
        </Card>
      </div>
    );
  }

  // If assessment is complete, show completion screen
  if (assessmentComplete) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#EDF0F8' }}
      >
        <Card className="max-w-3xl mx-auto p-12">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10B981' }}>
              <CheckCircle2 className="w-16 h-16 text-white" />
            </div>

            <h2 className="text-gray-700">Assessment Complete!</h2>

            <p className="text-gray-600 max-w-xl">
              Congratulations! You've successfully completed the technical assessment. Your answers have been submitted and will be reviewed by our team.
            </p>

            <div className="grid grid-cols-3 gap-6 w-full max-w-2xl pt-4">
              <div className="p-6 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                <div className="text-3xl mb-2" style={{ color: '#6366F1' }}>{questions.length}</div>
                <div className="text-sm text-gray-600">Total Questions</div>
              </div>
              <div className="p-6 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                <div className="text-3xl mb-2" style={{ color: '#10B981' }}>{answeredCount}</div>
                <div className="text-sm text-gray-600">Answered</div>
              </div>
              <div className="p-6 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                <div className="text-3xl mb-2" style={{ color: '#6366F1' }}>{formatTime(initialTimer - assessmentTimer)}</div>
                <div className="text-sm text-gray-600">Time Taken</div>
              </div>
            </div>

            <div className="p-4 rounded-lg w-full" style={{ backgroundColor: '#EFF6FF' }}>
              <p className="text-sm" style={{ color: '#1E40AF' }}>
                Thank you for taking the time to complete this assessment. We'll be in touch with the next steps soon.
              </p>
            </div>

            <div className="flex items-center justify-center gap-4 w-full">
              <Button
                className="text-white rounded-full px-6"
                style={{ backgroundColor: '#6366F1', minWidth: '200px' }}
                onClick={onComplete}
              >
                Return to Available Assessments
              </Button>
              <Button
                className="rounded-full px-6 transition-colors duration-200 border"
                style={{ backgroundColor: '#EDF0F8', color: '#EF4444', borderColor: '#EF4444', minWidth: '120px' }}
                onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                  const target = e.currentTarget;
                  target.style.backgroundColor = '#EF4444';
                  target.style.color = '#FFFFFF';
                  target.style.borderColor = '#EF4444';
                }}
                onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                  const target = e.currentTarget;
                  target.style.backgroundColor = '#EDF0F8';
                  target.style.color = '#EF4444';
                  target.style.borderColor = '#EF4444';
                }}
                onClick={onSignOut}
              >
                Sign Out
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (integrityBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EDF0F8' }}>
        <Card className="max-w-md p-8 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto" />
          <h3 className="text-gray-900 font-medium">Assessment Paused For Integrity Review</h3>
          <p className="text-gray-600 text-sm">High-risk cheating behavior was detected and this session is currently blocked.</p>
          {integrityReason && (
            <p className="text-xs text-gray-500">Reason: {integrityReason}</p>
          )}
          <Button onClick={onSignOut} variant="outline">Return to Home</Button>
        </Card>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="min-h-screen transition-all duration-300"
      style={{
        backgroundColor: '#EDF0F8',
        border: showRedBorder ? '8px solid #EF4444' : 'none'
      }}
      onClick={handleActivity}
      onKeyDown={handleActivity}
    >
      {/* Lockdown Violation Warning Banner */}
      {lockdownWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] animate-pulse">
          <div className="bg-red-600 text-white px-6 py-3 rounded-lg shadow-2xl flex items-center gap-3 text-sm font-medium">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {lockdownWarning}
          </div>
        </div>
      )}

      {/* Inactivity Alert Modal */}
      {showInactivityAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="max-w-md p-8">
            <div className="text-center space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEE2E2' }}>
                  <AlertCircle className="w-8 h-8 text-red-500" />
                </div>
              </div>

              <div>
                <h3 className="text-gray-700 mb-2">Inactivity Detected</h3>
                <p className="text-gray-600 text-sm">
                  Please confirm you are still present by clicking the button below.
                </p>
              </div>

              <div className="flex flex-col items-center gap-2">
                <div
                  className="text-6xl font-bold transition-colors"
                  style={{ color: inactivityCountdown <= 2 ? '#EF4444' : '#6366F1' }}
                >
                  {inactivityCountdown}
                </div>
                <p className="text-gray-500 text-sm">
                  {inactivityCountdown > 0 ? 'seconds remaining' : 'Red border activated'}
                </p>
              </div>

              <Button
                className="w-full text-white rounded-full"
                style={{ backgroundColor: '#6366F1' }}
                onClick={handleActivity}
              >
                I'm here
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Header */}
      <header className="px-12 py-6">
        <div className="flex items-center justify-between">
          <div>
            <img src={logo} alt="ERAMATCH - A Smarter Recruitment System" className="h-12" />
          </div>
          <div className="flex items-center gap-6">
            {/* Timer */}
            <div className="flex items-center gap-2 px-4 py-2 rounded-full" style={{ backgroundColor: assessmentTimer < 300 ? '#FEE2E2' : '#FFFFFF' }}>
              <Clock className="w-5 h-5" style={{ color: assessmentTimer < 300 ? '#EF4444' : '#6366F1' }} />
              <span
                className="font-mono"
                style={{ color: assessmentTimer < 300 ? '#EF4444' : '#6366F1' }}
              >
                {formatTime(assessmentTimer)}
              </span>
            </div>
            <Button
              className="rounded-full px-6 transition-colors duration-200 border"
              style={{ backgroundColor: '#EDF0F8', color: '#EF4444', borderColor: '#EF4444' }}
              onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                const target = e.currentTarget;
                target.style.backgroundColor = '#EF4444';
                target.style.color = '#FFFFFF';
                target.style.borderColor = '#EF4444';
              }}
              onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
                const target = e.currentTarget;
                target.style.backgroundColor = '#EDF0F8';
                target.style.color = '#EF4444';
                target.style.borderColor = '#EF4444';
              }}
              onClick={onSignOut}
            >
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="px-12 mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-600">
            Question {currentQuestionIndex + 1} of {questions.length}
          </span>
          <span className="text-sm text-gray-600">
            {answeredCount} of {questions.length} answered
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="h-2 rounded-full transition-all duration-300"
            style={{
              width: `${((currentQuestionIndex + 1) / questions.length) * 100}%`,
              backgroundColor: '#6366F1'
            }}
          />
        </div>
      </div>

      {/* Main Content */}
      <main className="px-12 pb-12">
        {/* Question Navigation Grid - Moved to Top */}
        <div className="max-w-5xl mx-auto mb-6">
          <Card className="p-6">
            <h4 className="text-gray-700 mb-4">Quick Navigation</h4>
            <div className="flex flex-wrap items-center gap-3">
              {questions.map((q, index) => (
                <div key={q.id} className="relative">
                  <button
                    onClick={() => {
                      setCurrentQuestionIndex(index);
                      handleActivity();
                    }}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm transition-colors"
                    style={{
                      backgroundColor: index === currentQuestionIndex
                        ? '#6366F1'
                        : answers[q.id] !== undefined
                          ? '#D1FAE5'
                          : '#F3F4F6',
                      color: index === currentQuestionIndex
                        ? '#FFFFFF'
                        : answers[q.id] !== undefined
                          ? '#059669'
                          : '#6B7280'
                    }}
                  >
                    {index + 1}
                  </button>
                  {flaggedQuestions.has(q.id) && (
                    <div className="absolute -top-1 -right-1">
                      <Flag className="w-3 h-3 fill-red-500 text-red-500" />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-6 mt-4 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#6366F1' }} />
                <span>Current</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#D1FAE5' }} />
                <span>Answered</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: '#F3F4F6' }} />
                <span>Unanswered</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Question Card */}
        <Card className="max-w-5xl mx-auto p-8">
          <div className="space-y-6">
            {/* Question Header */}
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-4">
                  <span
                    className="px-3 py-1 rounded-full text-sm text-white"
                    style={{ backgroundColor: '#6366F1' }}
                  >
                    {currentQuestion.type.toUpperCase()}
                  </span>
                  <span className="text-sm text-gray-500">{currentQuestion.points} points</span>
                </div>
                <h3 className="text-gray-700">{currentQuestion.question}</h3>
              </div>
              <div>
                <Button
                  className="rounded-full px-4 transition-colors"
                  style={{
                    backgroundColor: flaggedQuestions.has(currentQuestion.id) ? '#EF4444' : '#FEE2E2',
                    color: flaggedQuestions.has(currentQuestion.id) ? '#FFFFFF' : '#EF4444'
                  }}
                  onClick={() => toggleFlagQuestion(currentQuestion.id)}
                >
                  <Flag className={`w-4 h-4 ${flaggedQuestions.has(currentQuestion.id) ? 'fill-white' : ''}`} />
                </Button>
              </div>
            </div>
            
            {/* Sample Test Cases for Coding */}
            {currentQuestion.type === 'coding' && currentQuestion.testCases && currentQuestion.testCases.some(tc => !tc.is_hidden) && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-4">
                <h4 className="font-semibold text-gray-700 text-sm mb-3">Sample Test Cases</h4>
                <div className="space-y-3">
                  {currentQuestion.testCases.filter(tc => !tc.is_hidden).map((tc, idx) => {
                    // Handle both string and object test case values
                    const inputStr = typeof tc.input === 'object' && tc.input !== null
                      ? JSON.stringify(tc.input, null, 2)
                      : String(tc.input || '');
                    const expectedStr = typeof tc.expected_output === 'object' && tc.expected_output !== null
                      ? JSON.stringify(tc.expected_output, null, 2)
                      : String(tc.expected_output || '');
                    return (
                      <div key={idx} className="bg-white p-3 rounded border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4">
                        <div className="flex-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Input</span>
                          <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap">{inputStr}</pre>
                        </div>
                        <div className="hidden md:block w-px bg-gray-200"></div>
                        <div className="flex-1">
                          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Expected Output</span>
                          <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap">{expectedStr}</pre>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Answer Section */}
            <div className="pt-4">
              {currentQuestion.type === 'essay' && (
                <textarea
                  className="w-full min-h-64 p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-2 resize-y"
                  placeholder="Type your answer here..."
                  value={(answers[currentQuestion.id] as string) || ''}
                  onChange={(e) => handleAnswerChange(e.target.value)}
                  onFocus={handleActivity}
                />
              )}

              {currentQuestion.type === 'mcq' && currentQuestion.options && (
                <div className="space-y-3">
                  {currentQuestion.options.map((option, index) => {
                    // Handle both string options and {id, text} object options from API
                    const optionText = typeof option === 'object' && option !== null
                      ? (option as any).text || JSON.stringify(option)
                      : String(option);
                    return (
                      <label
                        key={index}
                        className="flex items-center gap-3 p-4 border-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-50"
                        style={{
                          borderColor: answers[currentQuestion.id] === index ? '#6366F1' : '#E5E7EB',
                          backgroundColor: answers[currentQuestion.id] === index ? '#EEF2FF' : 'transparent'
                        }}
                      >
                        <input
                          type="radio"
                          name={`question-${currentQuestion.id}`}
                          checked={answers[currentQuestion.id] === index}
                          onChange={() => handleAnswerChange(index)}
                          className="w-4 h-4"
                          style={{ accentColor: '#6366F1' }}
                        />
                        <span className="text-gray-700">{optionText}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {currentQuestion.type === 'coding' && (
                <div className="space-y-3">
                  {/* Coding Instructions */}
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h4 className="font-semibold text-blue-800 text-sm mb-2 flex items-center gap-2">
                      <Code2 className="w-4 h-4" />
                      How to Write Your Solution
                    </h4>
                    <ul className="text-xs text-blue-700 space-y-1">
                      <li>• Write a <strong>function</strong> with the exact name shown in the starter code</li>
                      <li>• Your function will be called automatically with the test inputs when you submit</li>
                      <li>• <strong>Run Script</strong>: Executes your code as-is (add print() to see output)</li>
                      <li>• <strong>Submit Answer</strong>: Runs all test cases and scores your solution</li>
                      <li>• You can submit multiple times (each submission is an attempt)</li>
                    </ul>
                    <div className="mt-2 pt-2 border-t border-blue-200">
                      <p className="text-xs text-blue-600">
                        <strong>Example:</strong> If the function is named <code className="bg-blue-100 px-1 rounded">two_sum</code>, 
                        write <code className="bg-blue-100 px-1 rounded">def two_sum(nums, target):</code> and return the result.
                      </p>
                    </div>
                  </div>
                  
                  {/* Language Selector and Code Editor Header */}
                  <div className="flex items-center justify-between p-3 rounded-t-lg" style={{ backgroundColor: '#F9FAFB' }}>
                    <span className="text-sm text-gray-600">Code Editor</span>
                    <div className="flex items-center gap-2">
                      <Code2 size={16} className="text-gray-500" />
                      <select
                        className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-1 cursor-pointer"
                        style={{
                          backgroundColor: '#FFFFFF',
                          color: '#374151'
                        }}
                        value={selectedLanguages[currentQuestion.id] || currentQuestion.language || 'python'}
                        onChange={(e) => {
                          setSelectedLanguages(prev => ({
                            ...prev,
                            [currentQuestion.id]: e.target.value
                          }));
                          handleActivity();
                        }}
                      >
                        {programmingLanguages.map((lang) => (
                          <option key={lang.value} value={lang.value}>
                            {lang.label} ({lang.extension})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <textarea
                    className="w-full min-h-80 p-4 border border-gray-300 rounded-b-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[#6366F1] focus:ring-offset-2 resize-y"
                    style={{
                      backgroundColor: '#1E293B',
                      color: '#E2E8F0'
                    }}
                    value={(answers[currentQuestion.id] as string) || currentQuestion.starterCode || ''}
                    onChange={(e) => handleAnswerChange(e.target.value)}
                    onFocus={handleActivity}
                    spellCheck={false}
                  />
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-3">
                      <Button
                        className="rounded-full px-4 gap-2 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                        onClick={handleRunCode}
                        disabled={isRunningCode}
                      >
                        <Play className="w-4 h-4" />
                        Run Script
                      </Button>
                      <Button
                        className="rounded-full px-4 gap-2"
                        style={{
                          backgroundColor: (attemptCounts[currentQuestion.id] || 0) >= (maxAttempts[currentQuestion.id] || 5)
                            ? '#9CA3AF' : '#10B981',
                          color: '#FFFFFF',
                        }}
                        onClick={handleSubmitAnswer}
                        disabled={isRunningCode || isSubmittingAnswer || (attemptCounts[currentQuestion.id] || 0) >= (maxAttempts[currentQuestion.id] || 5)}
                      >
                        {isSubmittingAnswer ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Submit Answer
                        <span className="ml-1 text-xs opacity-80">
                          ({attemptCounts[currentQuestion.id] || 0}/{maxAttempts[currentQuestion.id] || 5})
                        </span>
                      </Button>
                    </div>
                  </div>
                  
                  {/* Test Cases Results Display */}
                  {testResults[currentQuestion.id] && testResults[currentQuestion.id].length > 0 && (
                    <div className="mt-4 space-y-3">
                      <h4 className="font-semibold text-gray-700 text-sm">Test Results</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {testResults[currentQuestion.id].map((res, idx) => (
                          <div key={idx} className={`p-4 rounded-lg border-2 ${res.passed ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-semibold text-sm text-gray-700">Test Case {idx + 1}</span>
                              {res.passed ? (
                                <span className="text-green-600 font-bold text-sm bg-green-200 px-2 rounded-full">Pass</span>
                              ) : (
                                <span className="text-red-600 font-bold text-sm bg-red-200 px-2 rounded-full">Fail</span>
                              )}
                            </div>
                            <div className="text-xs font-mono bg-white p-2 rounded border border-gray-200 mt-2">
                              <span className="text-gray-500 font-semibold">Expected:</span>
                              <pre className="text-gray-800 whitespace-pre-wrap mt-1">{typeof res.expected === 'object' ? JSON.stringify(res.expected, null, 2) : res.expected}</pre>
                            </div>
                            <div className={`text-xs font-mono bg-white p-2 rounded border mt-2 ${res.passed ? 'border-green-200' : 'border-red-200'}`}>
                              <span className={`${res.passed ? 'text-green-600' : 'text-red-600'} font-semibold`}>Actual:</span>
                              <pre className={`${res.passed ? 'text-green-800' : 'text-red-800'} whitespace-pre-wrap mt-1`}>{typeof res.actual === 'object' ? JSON.stringify(res.actual, null, 2) : (res.actual || '(no output)')}</pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {codeOutput[currentQuestion.id] && (
                    <div className="mt-3 p-4 rounded-lg font-mono text-sm whitespace-pre-wrap" style={{ backgroundColor: '#1E293B', color: '#E2E8F0' }}>
                      {codeOutput[currentQuestion.id]}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <Button
                variant="outline"
                className="rounded-full px-6"
                onClick={handlePreviousQuestion}
                disabled={currentQuestionIndex === 0}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              {currentQuestionIndex < questions.length - 1 ? (
                <Button
                  className="text-white rounded-full px-6"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={handleNextQuestion}
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  className="text-white rounded-full px-8"
                  style={{ backgroundColor: '#10B981' }}
                  onClick={handleSubmitClick}
                >
                  Submit Assessment
                </Button>
              )}
            </div>
          </div>
        </Card>
      </main>

      {/* Submit Confirmation Modal */}
      {showSubmitConfirmation && (() => {
        const unansweredCount = questions.length - answeredCount;
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <Card className="max-w-md p-8">
              <div className="text-center space-y-6">
                <div className="flex justify-center">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEE2E2' }}>
                    <AlertCircle className="w-8 h-8 text-red-500" />
                  </div>
                </div>

                <div>
                  <h3 className="text-gray-700 mb-2">
                    {unansweredCount > 0 ? 'Unanswered Questions' : 'Confirm Submission'}
                  </h3>
                  <p className="text-gray-600 text-sm">
                    {unansweredCount > 0
                      ? `You still have ${unansweredCount} unanswered question${unansweredCount > 1 ? 's' : ''}. Are you sure you want to submit?`
                      : 'Are you sure you want to submit your assessment? This action cannot be undone.'
                    }
                  </p>
                </div>

                <div className="flex items-center justify-center gap-4">
                  <Button
                    className="text-white rounded-full px-6"
                    style={{ backgroundColor: '#10B981', minWidth: '140px' }}
                    onClick={handleSubmitAssessment}
                  >
                    Yes, Submit
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-full px-6"
                    style={{ minWidth: '140px' }}
                    onClick={() => setShowSubmitConfirmation(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        );
      })()}
    </div>
  );
}