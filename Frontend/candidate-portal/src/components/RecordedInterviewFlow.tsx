import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Sparkles, Video, Clock, User, Camera, Mic, Play, Square, Info, Scan, CheckCircle2, Target, Copy, X, AlertTriangle, Users, Loader2, RefreshCw } from 'lucide-react';
import logo from '../imports/image-eramatch.png';
import { api } from '../services/api';

interface RecordedInterviewFlowProps {
  onSignOut: () => void;
  onExit: () => void;
  onCompletion: () => void;
}

export function RecordedInterviewFlow({ onSignOut, onExit, onCompletion }: RecordedInterviewFlowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);
  const [faceDetectionStarted, setFaceDetectionStarted] = useState(false);
  const [faceDetectionComplete, setFaceDetectionComplete] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationComplete, setCalibrationComplete] = useState(false);
  const [fireflies, setFireflies] = useState<Array<{ x: number; y: number; id: number; isCalibration: boolean }>>([]);
  const [score, setScore] = useState(0);
  const [targetsCaught, setTargetsCaught] = useState(0);
  const [totalTargets] = useState(5);
  const calibrationRef = useRef<HTMLDivElement>(null);
  const [copyPasteUnderstood, setCopyPasteUnderstood] = useState(false);
  const [mockRecording, setMockRecording] = useState(false);
  const [mockRecorded, setMockRecorded] = useState(false);
  const [mockTimer, setMockTimer] = useState(60);

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

  // Fetch interview questions from API
  useEffect(() => {
    const fetchQuestions = async () => {
      try {
        setIsLoading(true);
        // Fetch from /interview/config endpoint
        const response = await fetch('/api/v1/interview/config', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch config');

        const data = await response.json();
        // Store config ID and questions with IDs
        setConfigId(data.config_id);
        setQuestionsData(data.questions);
        setQuestions(data.questions.map((q: any) => q.text));
        console.log('Loaded questions from API:', data.questions.length);

        // Start interview session
        const startRes = await fetch('/api/v1/interview/start', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ config_id: data.config_id })
        });
        if (startRes.ok) {
          const sessionData = await startRes.json();
          setSessionId(sessionData.session_id);
          console.log('Started session:', sessionData.session_id);
        }
      } catch (error) {
        console.error('Failed to fetch interview config:', error);
        // Fallback to default questions if API fails
        setQuestions([
          "Describe your most challenging project and how you overcame the obstacles you faced.",
          "Tell us about a time when you had to work with a difficult team member. How did you handle the situation?",
          "What motivates you in your professional career, and how do you stay productive during challenging times?"
        ]);
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
        const response = await fetch(`/api/v1/interview/status/${sessionId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
        });
        if (response.ok) {
          const data = await response.json();
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
    const needsCamera = [2, 4, 8].includes(currentStep) || inInterviewSession;

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

  const steps = [
    { number: 1, label: 'Welcome' },
    { number: 2, label: 'Device Test' },
    { number: 3, label: 'Instructions' },
    { number: 4, label: 'Face Detection' },
    { number: 5, label: 'Break the Ice' },
    { number: 6, label: 'Copy/Paste' },
    { number: 7, label: 'One Person' },
    { number: 8, label: 'Mock Question' },
    { number: 9, label: 'Ready' }
  ];

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

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, currentStep, currentQuestion]); // Re-attach when question changes too


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

  const handleStartFaceDetection = () => {
    setFaceDetectionStarted(true);
    setDetectionProgress(0);

    // Simulate face detection progress
    const interval = setInterval(() => {
      setDetectionProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setFaceDetectionComplete(true);
          return 100;
        }
        return prev + 10;
      });
    }, 300);
  };

  const handleRetryCamera = () => {
    console.log('[Camera] Retrying camera access');
    setCameraError(null);
    startCamera(selectedCameraId, selectedAudioId);
  };

  const handleStartCalibration = () => {
    setIsCalibrating(true);
    setScore(0);
    setTargetsCaught(0);
    setCalibrationComplete(false);

    // Enter fullscreen
    if (calibrationRef.current) {
      if (calibrationRef.current.requestFullscreen) {
        calibrationRef.current.requestFullscreen();
      }
    }

    // Generate calibration points (5 key points: corners and center)
    const calibrationPoints = [
      { x: 10, y: 10 },   // Upper left
      { x: 90, y: 10 },   // Upper right
      { x: 50, y: 50 },   // Center
      { x: 10, y: 90 },   // Bottom left
      { x: 90, y: 90 }    // Bottom right
    ];

    // Generate random decoy points (15 points)
    const decoyPoints = Array.from({ length: 15 }, () => ({
      x: Math.random() * 80 + 10,
      y: Math.random() * 80 + 10
    }));

    // Combine and shuffle
    const allPoints = [
      ...calibrationPoints.map(p => ({ ...p, isCalibration: true })),
      ...decoyPoints.map(p => ({ ...p, isCalibration: false }))
    ].sort(() => Math.random() - 0.5);

    // Spawn fireflies one by one
    let currentIndex = 0;
    const spawnNextFirefly = () => {
      if (currentIndex >= allPoints.length) {
        // Game complete
        setTimeout(() => {
          setCalibrationComplete(true);
          setIsCalibrating(false);
          // Exit fullscreen
          if (document.fullscreenElement) {
            document.exitFullscreen();
          }
        }, 1000);
        return;
      }

      const point = allPoints[currentIndex];
      const fireflyId = Date.now();

      setFireflies([{ ...point, id: fireflyId }]);

      // Remove firefly after 3 seconds if not clicked (increased from 2 seconds)
      setTimeout(() => {
        setFireflies(prev => prev.filter(f => f.id !== fireflyId));
        currentIndex++;
        setTimeout(spawnNextFirefly, 1000); // Increased from 500ms to 1000ms
      }, 3000); // Increased from 2000ms to 3000ms
    };

    setTimeout(spawnNextFirefly, 1000);
  };

  const handleFireflyClick = (firefly: { x: number; y: number; id: number; isCalibration: boolean }) => {
    setFireflies(prev => prev.filter(f => f.id !== firefly.id));
    setScore(prev => prev + 1);

    // Increment targets caught for all fireflies
    const newTargetsCaught = targetsCaught + 1;
    setTargetsCaught(newTargetsCaught);

    // Log click
    console.log('Firefly clicked:', firefly.x, firefly.y, 'isCalibration:', firefly.isCalibration);

    // Check if enough targets have been caught (5 targets)
    if (newTargetsCaught >= 5) {
      setTimeout(() => {
        setCalibrationComplete(true);
        setIsCalibrating(false);
        if (document.fullscreenElement) {
          document.exitFullscreen();
        }
      }, 500); // Close game shortly after hitting the target
    }
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
          setInterviewComplete(true);

          // Mark session as completed in backend
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
        return (
          <Card className="max-w-5xl mx-auto p-8 transition-all duration-500 ease-in-out">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                  <Camera className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-gray-700">Test Your Camera & Microphone</h3>
              </div>

              <p className="text-gray-600 text-sm">
                Let's verify that your camera and microphone are working correctly. Record a short test clip to ensure everything is functioning properly.
              </p>

              {/* Device Selectors */}
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Camera className="w-4 h-4" />
                  <span>Camera Source</span>
                </div>
                <div className="relative">
                  <select
                    value={selectedCameraId}
                    onChange={(e) => {
                      const newCamId = e.target.value;
                      setSelectedCameraId(newCamId);
                      startCamera(newCamId, selectedAudioId);
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer pr-10"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
                  >
                    {cameraDevices.length === 0 ? (
                      <option value="">No cameras detected</option>
                    ) : (
                      cameraDevices.map((device, idx) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Camera ${idx + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Mic className="w-4 h-4" />
                  <span>Microphone Source</span>
                </div>
                <div className="relative">
                  <select
                    value={selectedAudioId}
                    onChange={(e) => {
                      const newAudId = e.target.value;
                      setSelectedAudioId(newAudId);
                      startCamera(selectedCameraId, newAudId);
                    }}
                    className="w-full p-3 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none cursor-pointer pr-10"
                    style={{ backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`, backgroundPosition: 'right 0.5rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1.5em 1.5em' }}
                  >
                    {audioDevices.length === 0 ? (
                      <option value="">No microphones detected</option>
                    ) : (
                      audioDevices.map((device, idx) => (
                        <option key={device.deviceId} value={device.deviceId}>
                          {device.label || `Microphone ${idx + 1}`}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Refresh devices button */}
                <button
                  type="button"
                  onClick={async () => {
                    console.log('[DeviceDetection] Refreshing devices...');
                    setCameraError(null);
                    try {
                      const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                      tempStream.getTracks().forEach(t => t.stop());
                      const devices = await navigator.mediaDevices.enumerateDevices();
                      const cameras = devices.filter(d => d.kind === 'videoinput');
                      const mics = devices.filter(d => d.kind === 'audioinput');
                      setCameraDevices(cameras);
                      setAudioDevices(mics);
                      if (cameras.length > 0) setSelectedCameraId(cameras[0].deviceId);
                      if (mics.length > 0) setSelectedAudioId(mics[0].deviceId);
                      console.log('[DeviceDetection] Refreshed - Cameras:', cameras.length, 'Mics:', mics.length);
                    } catch (err) {
                      console.error('[DeviceDetection] Refresh failed:', err);
                      setCameraError('Failed to refresh devices. Please ensure camera and mic permissions are granted.');
                    }
                  }}
                  className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh device list
                </button>
              </div>

              {/* Video Container - Expanded View */}
              <div className="rounded-lg overflow-hidden relative shadow-lg bg-black transition-all duration-500 ease-in-out" style={{ aspectRatio: '16/9', width: '100%', maxHeight: '600px' }}>
                {isPlaying ? (
                  <video
                    src={recordedUrl || ''}
                    controls
                    autoPlay
                    className="w-full h-full object-contain"
                  />
                ) : stream ? (
                  <div className="relative w-full h-full group">
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover transition-transform duration-700"
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    {isRecording && (
                      <div className="absolute top-4 right-4 flex items-center gap-2 bg-red-500/80 text-white px-3 py-1 rounded-full animate-pulse">
                        <div className="w-3 h-3 bg-white rounded-full" />
                        <span className="text-xs font-medium">Recording...</span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800">
                    <Camera className="w-16 h-16 text-slate-600 mb-4" />
                    <p className="text-slate-500">{cameraError || 'Camera not available'}</p>
                    {cameraError && (
                      <Button variant="outline" size="sm" onClick={() => startCamera()} className="mt-4">
                        Retry Camera
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 text-gray-600">
                <Mic className={`w-4 h-4 transition-colors ${micActive ? 'text-emerald-500' : 'text-gray-400'}`} />
                <span className="text-sm">
                  {micActive ? 'Microphone active' : 'Microphone not detected'}
                </span>
                <div className="flex items-center gap-0.5 ml-2">
                  {Array.from({ length: 20 }).map((_, i) => {
                    const threshold = (i / 20) * 100;
                    const isActive = micLevel > threshold;
                    const barColor = micLevel > 75
                      ? 'bg-red-500'
                      : micLevel > 50
                        ? 'bg-yellow-500'
                        : 'bg-emerald-500';
                    return (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          isActive ? barColor : 'bg-gray-200'
                        }`}
                        style={{ height: `${8 + (i * 1.2)}px`, opacity: isActive ? 1 : 0.3 }}
                      />
                    );
                  })}
                </div>
                <span className="text-xs text-gray-400 ml-1 w-8">{micLevel}%</span>
              </div>

              {/* Recording controls */}
              <div className="space-y-3">
                {/* Primary action: Record / Stop Recording / Record Again */}
                <div className="flex gap-3 justify-center">
                  {isRecording ? (
                    <Button
                      className="text-white rounded-full bg-red-500 hover:bg-red-600 animate-pulse px-8"
                      onClick={handleStopTestRecording}
                    >
                      <Square className="w-4 h-4 mr-2" />
                      Stop Recording
                    </Button>
                  ) : isPlaying ? (
                    <Button
                      variant="outline"
                      className="rounded-full px-8"
                      onClick={handleStopPlayback}
                    >
                      <Square className="w-4 h-4 mr-2" />
                      Stop Playback
                    </Button>
                  ) : hasRecorded ? (
                    <Button
                      className="text-white rounded-full bg-indigo-600 hover:bg-indigo-700 px-8"
                      onClick={handleRecordAgain}
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      Record Again
                    </Button>
                  ) : (
                    <Button
                      className="text-white rounded-full bg-indigo-600 hover:bg-indigo-700 px-8"
                      onClick={handleRecordTestClip}
                    >
                      <Mic className="w-4 h-4 mr-2" />
                      Record Test Clip
                    </Button>
                  )}
                </div>

                {/* Secondary actions: Play / Stop playback */}
                {hasRecorded && !isRecording && (
                  <div className="flex gap-3 justify-center">
                    {!isPlaying ? (
                      <Button
                        variant="outline"
                        className="rounded-full"
                        onClick={handlePlayClip}
                      >
                        <Play className="w-4 h-4 mr-2" />
                        Play Clip
                      </Button>
                    ) : null}
                  </div>
                )}
              </div>

              <p className="text-center text-gray-500 text-xs">
                {isRecording
                  ? 'Recording will auto-stop after 10 seconds'
                  : isPlaying
                    ? 'Review your test clip — check video and audio quality'
                    : hasRecorded
                      ? 'Clip recorded! Play it back or record again'
                      : 'Record a short clip to test your camera and microphone'}
              </p>

              <div className="flex justify-between pt-4">
                {/* Skip button for development/testing */}
                <Button
                  variant="outline"
                  className="rounded-full text-orange-600 border-orange-300 hover:bg-orange-50"
                  onClick={() => {
                    setCurrentStep(9);
                    setInInterviewSession(true);
                  }}
                >
                  Skip to Interview (Dev)
                </Button>
                <Button
                  className="text-white rounded-full"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={() => setCurrentStep(3)}
                >
                  Continue
                </Button>
              </div>
            </div>
          </Card>
        );

      case 3:
        return (
          <Card className="max-w-5xl mx-auto p-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                  <Video className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-gray-700">Before You Begin</h3>
              </div>

              <p className="text-gray-600">
                Please review these important guidelines before starting your interview session.
              </p>

              <div className="space-y-6 pt-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2FF' }}>
                    <Video className="w-5 h-5" style={{ color: '#6366F1' }} />
                  </div>
                  <div>
                    <h4 className="text-gray-700 mb-1">You'll record short video answers</h4>
                    <p className="text-gray-600 text-sm">
                      Each question will be presented one at a time. Take your time to think before recording.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2FF' }}>
                    <Clock className="w-5 h-5" style={{ color: '#6366F1' }} />
                  </div>
                  <div>
                    <h4 className="text-gray-700 mb-1">Each question has a time limit</h4>
                    <p className="text-gray-600 text-sm">
                      You'll have up to 2 minutes to answer each question. A countdown timer will be visible.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2FF' }}>
                    <User className="w-5 h-5" style={{ color: '#6366F1' }} />
                  </div>
                  <div>
                    <h4 className="text-gray-700 mb-1">Stay centered and speak naturally</h4>
                    <p className="text-gray-600 text-sm">
                      Keep yourself in frame, maintain good posture, and speak clearly into your microphone.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-lg" style={{ backgroundColor: '#EFF6FF' }}>
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 flex-shrink-0" style={{ color: '#3B82F6' }} />
                  <div>
                    <h4 className="text-sm mb-1" style={{ color: '#1E40AF' }}>Important notice:</h4>
                    <p className="text-sm" style={{ color: '#1E40AF' }}>
                      Make sure you're in a quiet environment. Background noise may affect audio quality and your assessment results.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setCurrentStep(2)}
                >
                  Back
                </Button>
                <Button
                  className="text-white rounded-full"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={() => setCurrentStep(4)}
                >
                  Continue
                </Button>
              </div>
            </div>
          </Card>
        );

      case 4:
        return (
          <Card className="max-w-5xl mx-auto p-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                  <Scan className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-gray-700">Face Mesh Detection</h3>
              </div>

              <p className="text-gray-600">
                We'll now calibrate our face detection system. Please follow the on-screen instructions and move your head as directed.
              </p>

              {/* Warning Message */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#FEE2E2' }}>
                <p className="text-red-600 text-sm">
                  Unable to access camera. The demo will continue with simulated face tracking.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-sm"
                  onClick={handleRetryCamera}
                >
                  Retry Camera
                </Button>
              </div>

              {/* Camera and Face Mesh Display */}
              <div className="grid grid-cols-2 gap-6">
                {/* Camera Feed */}
                <div className="bg-slate-900 rounded-lg h-80 flex flex-col items-center justify-center relative overflow-hidden">
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
                    <>
                      <Camera className="w-16 h-16 text-slate-600 mb-2 relative z-10" />
                      <p className="text-slate-500 text-sm relative z-10">Camera not available</p>
                      <p className="text-slate-600 text-xs mt-1 relative z-10">Demo mode active</p>
                    </>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div
                      className="w-64 h-64 rounded-full border-2 opacity-30"
                      style={{ borderColor: '#6366F1' }}
                    />
                  </div>
                </div>

                {/* Face Mesh Visualization */}
                <div className="rounded-lg h-80 flex items-center justify-center" style={{ backgroundColor: '#F3E8FF' }}>
                  {faceDetectionStarted ? (
                    <svg width="200" height="240" viewBox="0 0 200 240" className="transition-opacity duration-500">
                      {/* Face oval */}
                      <ellipse cx="100" cy="120" rx="60" ry="80" fill="none" stroke="#A855F7" strokeWidth="2" />
                      {/* Eyes */}
                      <circle cx="80" cy="100" r="3" fill="#A855F7" />
                      <circle cx="120" cy="100" r="3" fill="#A855F7" />
                      {/* Nose */}
                      <circle cx="100" cy="120" r="2" fill="#A855F7" />
                      {/* Mouth */}
                      <circle cx="85" cy="145" r="2" fill="#A855F7" />
                      <circle cx="100" cy="148" r="2" fill="#A855F7" />
                      <circle cx="115" cy="145" r="2" fill="#A855F7" />
                      {/* Additional mesh points */}
                      <circle cx="70" cy="95" r="1.5" fill="#A855F7" />
                      <circle cx="130" cy="95" r="1.5" fill="#A855F7" />
                      <circle cx="100" cy="80" r="1.5" fill="#A855F7" />
                      <circle cx="100" cy="160" r="1.5" fill="#A855F7" />
                    </svg>
                  ) : (
                    <div className="text-center">
                      <div className="w-16 h-16 rounded-lg flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: '#E9D5FF' }}>
                        <Scan className="w-8 h-8" style={{ color: '#A855F7' }} />
                      </div>
                      <p className="text-gray-500">Face mesh will appear here</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Progress Section */}
              {faceDetectionStarted && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700 text-sm">
                      {faceDetectionComplete ? 'Face detection complete!' : 'Detecting face...'}
                    </span>
                    <span className="text-gray-600 text-sm">{detectionProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-300"
                      style={{
                        width: `${detectionProgress}%`,
                        backgroundColor: '#6366F1'
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Success Message */}
              {faceDetectionComplete && (
                <div className="flex items-center gap-2 p-4 rounded-lg" style={{ backgroundColor: '#D1FAE5' }}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-emerald-700">Face successfully detected and calibrated!</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-center pt-4">
                {!faceDetectionStarted ? (
                  <Button
                    className="text-white rounded-full px-8"
                    style={{ backgroundColor: '#6366F1' }}
                    onClick={handleStartFaceDetection}
                  >
                    Start Face Detection
                  </Button>
                ) : faceDetectionComplete ? (
                  <Button
                    className="text-white rounded-full px-8"
                    style={{ backgroundColor: '#6366F1' }}
                    onClick={() => setCurrentStep(5)}
                  >
                    Next Step
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        );

      case 5:
        if (!calibrationComplete) {
          return (
            <>
              {/* Instructions Screen */}
              {!isCalibrating && (
                <Card className="max-w-5xl mx-auto p-8">
                  <div className="space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                        <Sparkles className="w-6 h-6 text-white" />
                      </div>
                      <h3 className="text-gray-700">Let's Break the Ice!</h3>
                    </div>

                    <p className="text-gray-600">
                      Before we begin the interview, let's warm up with a fun little game! Catch the glowing fireflies as they appear across the screen.
                    </p>

                    <div className="flex items-center justify-center py-12">
                      <div className="relative">
                        <div className="w-32 h-32 rounded-full flex items-center justify-center" style={{ backgroundColor: '#F3E8FF' }}>
                          <svg width="80" height="80" viewBox="0 0 80 80">
                            <circle cx="40" cy="40" r="30" fill="#A855F7" opacity="0.3" />
                            <circle cx="40" cy="40" r="20" fill="#A855F7" opacity="0.5" />
                            <circle cx="40" cy="40" r="10" fill="#A855F7" />
                            <circle cx="35" cy="35" r="3" fill="#FFF" />
                          </svg>
                        </div>
                        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full animate-pulse" style={{ backgroundColor: '#FCD34D' }} />
                        <div className="absolute top-4 -right-4 w-4 h-4 rounded-full animate-pulse" style={{ backgroundColor: '#FCD34D', animationDelay: '0.5s' }} />
                      </div>
                    </div>

                    <p className="text-center text-gray-600">
                      Relax and have fun! Click the fireflies as they light up. This helps you get comfortable before the interview.
                    </p>

                    <div className="flex justify-center pt-4">
                      <Button
                        className="text-white rounded-full px-8"
                        style={{
                          background: 'linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%)'
                        }}
                        onClick={handleStartCalibration}
                      >
                        Start Game
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {/* Fullscreen Calibration Game */}
              {isCalibrating && (
                <div
                  ref={calibrationRef}
                  className="fixed inset-0 w-screen h-screen cursor-crosshair"
                  style={{
                    background: 'linear-gradient(135deg, #5B21B6 0%, #DB2777 100%)',
                    zIndex: 9999
                  }}
                >
                  {/* HUD - Top Bar */}
                  <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center">
                    <div className="text-white">
                      <div className="text-sm opacity-80 mb-1">Progress: {targetsCaught} / {totalTargets} targets</div>
                      <div className="w-64 bg-white/20 rounded-full h-2">
                        <div
                          className="bg-white h-2 rounded-full transition-all duration-300"
                          style={{ width: `${(targetsCaught / totalTargets) * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-white text-right">
                      <div className="text-sm opacity-80">Score</div>
                      <div className="text-3xl">{score}</div>
                    </div>
                  </div>

                  {/* Fireflies */}
                  {fireflies.map((firefly) => (
                    <div
                      key={firefly.id}
                      className="absolute animate-pulse cursor-pointer"
                      style={{
                        left: `${firefly.x}%`,
                        top: `${firefly.y}%`,
                        transform: 'translate(-50%, -50%)'
                      }}
                      onClick={() => handleFireflyClick(firefly)}
                    >
                      <svg width="40" height="40" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="15" fill="#FCD34D" opacity="0.3" />
                        <circle cx="20" cy="20" r="10" fill="#FCD34D" opacity="0.6" />
                        <circle cx="20" cy="20" r="5" fill="#FDE047" />
                        <circle cx="18" cy="18" r="2" fill="#FEF9C3" />
                      </svg>
                    </div>
                  ))}

                  {/* Stars Background Effect */}
                  {[...Array(30)].map((_, i) => (
                    <div
                      key={i}
                      className="absolute w-1 h-1 bg-white rounded-full opacity-40"
                      style={{
                        left: `${Math.random() * 100}%`,
                        top: `${Math.random() * 100}%`
                      }}
                    />
                  ))}
                </div>
              )}
            </>
          );
        } else {
          // Calibration complete screen
          return (
            <Card className="max-w-5xl mx-auto p-8">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10B981' }}>
                    <CheckCircle2 className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-gray-700">Great Job!</h3>
                </div>

                <div className="flex items-center gap-2 p-4 rounded-lg" style={{ backgroundColor: '#D1FAE5' }}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-emerald-700">We've successfully broken the ice! You're all warmed up and ready to go.</span>
                </div>

                <p className="text-gray-600">
                  Excellent! You're now comfortable and ready to shine in your interview. Let's proceed to the next step.
                </p>

                <div className="flex justify-center pt-4">
                  <Button
                    className="text-white rounded-full px-8"
                    style={{ backgroundColor: '#6366F1' }}
                    onClick={() => setCurrentStep(6)}
                  >
                    Continue to Next Step
                  </Button>
                </div>
              </div>
            </Card>
          );
        }

      case 6:
        return (
          <Card className="max-w-5xl mx-auto p-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                  <Copy className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-gray-700">Copy & Paste Disabled</h3>
              </div>

              <p className="text-gray-600">
                To maintain the integrity and fairness of this environment, copy and paste functionality has been disabled during your session.
              </p>

              {/* Important Notice */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#FEE2E2' }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
                  <div>
                    <h4 className="text-red-600 mb-1">Important Notice</h4>
                    <p className="text-red-600 text-sm">
                      Any attempt to copy or paste content will be detected and may result in session termination.
                    </p>
                  </div>
                </div>
              </div>

              {/* What this means section */}
              <div>
                <h4 className="text-gray-700 mb-4">What this means:</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                    <X className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <span className="text-gray-900">Copy (Ctrl+C / Cmd+C):</span>
                      <span className="text-gray-600 ml-1">Disabled throughout the session</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                    <X className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <span className="text-gray-900">Paste (Ctrl+V / Cmd+V):</span>
                      <span className="text-gray-600 ml-1">Disabled throughout the session</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                    <X className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
                    <div>
                      <span className="text-gray-900">Right-click context menu:</span>
                      <span className="text-gray-600 ml-1">Copy/paste options removed</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Checkbox */}
              <div className="pt-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={copyPasteUnderstood}
                    onChange={(e) => setCopyPasteUnderstood(e.target.checked)}
                    className="mt-1 w-4 h-4 rounded border-gray-300"
                    style={{ accentColor: '#6366F1' }}
                  />
                  <span className="text-gray-600 text-sm">
                    I understand that copy and paste functionality is disabled for this session
                  </span>
                </label>
              </div>

              {/* Next Step Button */}
              <div className="flex justify-end pt-4">
                <Button
                  className="text-white rounded-full px-8"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={() => setCurrentStep(7)}
                  disabled={!copyPasteUnderstood}
                >
                  Next Step
                </Button>
              </div>
            </div>
          </Card>
        );

      case 7:
        return (
          <Card className="max-w-5xl mx-auto p-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
                  <Users className="w-6 h-6" style={{ color: '#6366F1' }} />
                </div>
                <h3 className="text-gray-700">One Person Presence</h3>
              </div>

              <p className="text-gray-600">
                For a fair and secure environment, only one person should be present during the session. Our monitoring system will detect multiple people in the frame.
              </p>

              {/* Warning Alert */}
              <div className="p-4 rounded-lg" style={{ backgroundColor: '#FEE2E2' }}>
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
                  <div>
                    <h4 className="text-red-600 mb-1">Automatic Session Termination</h4>
                    <p className="text-red-600 text-sm">
                      If multiple people are detected, or if you leave the environment, your session will be automatically terminated and you will be required to restart.
                    </p>
                  </div>
                </div>
              </div>

              {/* Two boxes: Allowed and Not Allowed */}
              <div className="grid grid-cols-2 gap-6 pt-4">
                {/* Allowed */}
                <div className="p-6 rounded-lg" style={{ backgroundColor: '#D1FAE5' }}>
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10B981' }}>
                      <User className="w-8 h-8 text-white" />
                    </div>
                    <h4 className="text-emerald-700">Allowed</h4>
                    <p className="text-emerald-600 text-sm">
                      One person visible in the camera frame at all times
                    </p>
                  </div>
                </div>

                {/* Not Allowed */}
                <div className="p-6 rounded-lg" style={{ backgroundColor: '#FEE2E2' }}>
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EF4444' }}>
                      <Users className="w-8 h-8 text-white" />
                    </div>
                    <h4 className="text-red-600">Not Allowed</h4>
                    <p className="text-red-600 text-sm">
                      Multiple people or leaving the environment during the session
                    </p>
                  </div>
                </div>
              </div>

              {/* What will happen if violated */}
              <div className="pt-4">
                <h4 className="text-gray-700 mb-3">What will happen if violated:</h4>
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                  <div className="text-center">
                    <p className="text-gray-900 mb-1">Will be Discussed</p>
                    <p className="text-gray-500 text-sm">Supporting text</p>
                  </div>
                </div>
              </div>

              {/* Next Step Button */}
              <div className="flex justify-end pt-4">
                <Button
                  className="text-white rounded-full px-8"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={() => setCurrentStep(8)}
                >
                  Next Step
                </Button>
              </div>
            </div>
          </Card>
        );

      case 8:
        return (
          <Card className="max-w-4xl mx-auto p-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                  <Mic className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-gray-700">Mock Question Practice</h3>
              </div>

              <p className="text-gray-600">
                Let's practice with a warm-up question. This will help you get comfortable with the recording process before the actual interview.
              </p>

              {/* Question Box */}
              <div className="p-6 rounded-lg text-center" style={{ backgroundColor: '#F9FAFB' }}>
                <p className="text-gray-700">
                  Tell us briefly about yourself and why you're interested in this position.
                </p>
              </div>

              {/* Camera Preview */}
              <div className="bg-slate-900 rounded-lg h-72 flex flex-col items-center justify-center relative overflow-hidden">
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
                  <>
                    <Camera className="w-16 h-16 text-slate-600 mb-2" />
                    <p className="text-slate-500 text-sm">Camera not available</p>
                  </>
                )}
              </div>

              {/* Timer */}
              <div className="text-center">
                <p className="text-3xl text-gray-700" style={{ fontFamily: 'monospace' }}>
                  {String(Math.floor(mockTimer / 60)).padStart(2, '0')}:{String(mockTimer % 60).padStart(2, '0')}
                </p>
              </div>

              {/* Recording Controls */}
              <div className="flex flex-col items-center gap-3">
                {!mockRecorded ? (
                  <Button
                    className="text-white rounded-full px-8"
                    style={{ backgroundColor: mockRecording ? '#EF4444' : '#6366F1' }}
                    onClick={() => {
                      if (!mockRecording) {
                        // Start recording
                        if (!stream) {
                          setCameraError('No camera stream. Please check device setup.');
                          return;
                        }
                        setMockRecording(true);
                        setMockRecorded(false);
                        chunksRef.current = [];
                        
                        const recorder = new MediaRecorder(stream, {
                          mimeType: 'video/webm;codecs=vp8,opus',
                          videoBitsPerSecond: 250000
                        });
                        mediaRecorderRef.current = recorder;
                        
                        recorder.ondataavailable = (e) => {
                          if (e.data.size > 0) {
                            chunksRef.current.push(e.data);
                          }
                        };
                        
                        recorder.onstop = () => {
                          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
                          const url = URL.createObjectURL(blob);
                          setRecordedUrl(url);
                          setMockRecorded(true);
                          setMockRecording(false);
                        };
                        
                        recorder.start(1000);
                        
                        // Auto-stop after mockTimer seconds (default 60s)
                        setTimeout(() => {
                          if (recorder.state === 'recording') {
                            recorder.stop();
                          }
                        }, mockTimer * 1000);
                      }
                    }}
                  >
                    {mockRecording ? (
                      <>
                        <div className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />
                        Recording... Click to Stop
                      </>
                    ) : (
                      'Start Recording'
                    )}
                  </Button>
                ) : (
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        setMockRecording(false);
                        setMockRecorded(false);
                        setRecordedUrl(null);
                        chunksRef.current = [];
                      }}
                    >
                      Retry
                    </Button>
                    <Button
                      variant="outline"
                      className="rounded-full"
                      onClick={() => {
                        setMockRecording(false);
                      }}
                    >
                      Keep Recording
                    </Button>
                  </div>
                )}
              </div>

              {/* Continue Button */}
              <div className="pt-4">
                <Button
                  className="w-full text-white rounded-full"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={() => setCurrentStep(9)}
                >
                  Continue to Interview
                </Button>
                <p className="text-center text-gray-500 text-sm mt-2">
                  You can skip the practice recording and continue directly
                </p>
              </div>
            </div>
          </Card>
        );

      case 9:
        return (
          <Card className="max-w-5xl mx-auto p-12">
            <div className="flex flex-col items-center text-center space-y-8">
              {/* Large Success Icon */}
              <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10B981' }}>
                <CheckCircle2 className="w-16 h-16 text-white" />
              </div>

              <h2 className="text-gray-700">All Set!</h2>

              <p className="text-gray-600">
                You've completed all the setup steps
              </p>

              {/* Start Session Button */}
              <Button
                className="text-white rounded-full px-12 py-6 text-lg"
                style={{ backgroundColor: '#6366F1' }}
                onClick={() => setInInterviewSession(true)}
              >
                Start Session →
              </Button>

              {/* Remember Text */}
              <p className="text-gray-700 text-sm max-w-xl">
                Remember: Stay focused, remain alone in frame, and avoid any prohibited actions
              </p>
            </div>
          </Card>
        );

      default:
        return (
          <Card className="max-w-2xl mx-auto p-12">
            <div className="text-center">
              <h2 className="text-gray-700 mb-4">Step {currentStep}</h2>
              <p className="text-gray-600 mb-6">This step is coming soon...</p>
              <div className="flex gap-4 justify-center">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setCurrentStep(currentStep - 1)}
                >
                  Back
                </Button>
                <Button
                  className="text-white rounded-full"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={() => currentStep < 9 && setCurrentStep(currentStep + 1)}
                >
                  Continue
                </Button>
              </div>
            </div>
          </Card>
        );
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EDF0F8' }}>
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
                <img src={logo} alt="ERAMATCH - A Smarter Recruitment System" className="h-12" />
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
              {/* Progress Steps */}
              <div className="px-12 py-6">
                <Card className="max-w-5xl mx-auto p-6">
                  <div className="flex items-start justify-between px-12">
                    {steps.map((step) => (
                      <div key={step.number} className="flex flex-col items-center w-20">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center text-white transition-all ${currentStep > step.number
                            ? 'bg-gradient-to-br'
                            : currentStep === step.number
                              ? 'bg-gradient-to-br'
                              : 'bg-gray-300'
                            }`}
                          style={currentStep >= step.number ? { backgroundColor: '#6366F1' } : {}}
                        >
                          {currentStep > step.number ? '✓' : step.number}
                        </div>
                        <span className={`text-xs mt-2 text-center ${currentStep >= step.number ? 'text-gray-700' : 'text-gray-400'}`}>
                          {step.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>

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
