import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Video, Clock, User, Info, AlertCircle, FileText, Laptop, Network, Globe, Layers, Activity, Camera, Mic, Scan, CheckCircle2, Sparkles, Target, Copy, X, AlertTriangle, Users, Monitor } from 'lucide-react';
import logo from '../imports/image-eramatch.png';
import { AssessmentSession } from './AssessmentSession';

interface TechnicalAssessmentFlowProps {
  onSignOut: () => void;
  onExit: () => void;
  onCompletion: () => void;
}

export function TechnicalAssessmentFlow({ onSignOut, onExit, onCompletion }: TechnicalAssessmentFlowProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [inactivityTimer, setInactivityTimer] = useState(5);
  const [showInactivityAlert, setShowInactivityAlert] = useState(false);
  const [showRedBorder, setShowRedBorder] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);

  // Device test states
  const videoRef = useRef<HTMLVideoElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecorded, setHasRecorded] = useState(false);

  // Face detection states
  const [faceDetectionStarted, setFaceDetectionStarted] = useState(false);
  const [faceDetectionComplete, setFaceDetectionComplete] = useState(false);
  const [detectionProgress, setDetectionProgress] = useState(0);

  // Break the Ice states
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationComplete, setCalibrationComplete] = useState(false);
  const [fireflies, setFireflies] = useState<Array<{ x: number; y: number; id: number; isCalibration: boolean }>>([]);
  const [score, setScore] = useState(0);
  const [targetsCaught, setTargetsCaught] = useState(0);
  const [totalTargets] = useState(5);
  const calibrationRef = useRef<HTMLDivElement>(null);

  // Copy/Paste states
  const [copyPasteUnderstood, setCopyPasteUnderstood] = useState(false);

  // Mock Question states
  const [mockRecording, setMockRecording] = useState(false);
  const [mockRecorded, setMockRecorded] = useState(false);

  // Start camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setStream(mediaStream);
      setCameraError(null);
    } catch (err) {
      console.error('Error accessing camera:', err);
      setCameraError('Unable to access camera. Please ensure permissions are granted.');
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  // Attach stream to video element
  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, currentStep]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Activate camera for specific steps
  useEffect(() => {
    if ([2, 4].includes(currentStep)) {
      startCamera();
    } else {
      stopCamera();
    }
  }, [currentStep]);
  const [mockTimer, setMockTimer] = useState(60);

  // Assessment session states — restore from sessionStorage to skip pre-checks on reload
  const [inAssessmentSession, setInAssessmentSession] = useState(() => {
    return sessionStorage.getItem('assessment_checks_done') === 'true';
  });
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [assessmentTimer, setAssessmentTimer] = useState(45 * 60); // 45 minutes in seconds
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [lastActivity, setLastActivity] = useState(Date.now());
  const [assessmentInactivityTimer, setAssessmentInactivityTimer] = useState(30); // 30 seconds for demo
  const [showAssessmentInactivityAlert, setShowAssessmentInactivityAlert] = useState(false);
  const [assessmentRedBorder, setAssessmentRedBorder] = useState(false);

  // Inactivity detection countdown
  useEffect(() => {
    if (showInactivityAlert && inactivityTimer > 0) {
      const countdown = setInterval(() => {
        setInactivityTimer((prev) => {
          if (prev <= 1) {
            clearInterval(countdown);
            setShowRedBorder(true);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdown);
    }
  }, [showInactivityAlert, inactivityTimer]);

  const handleImHere = () => {
    setInactivityTimer(5);
    setShowRedBorder(false);
    setShowInactivityAlert(false);
    setIsSimulating(false);
  };

  const handleSimulateInactivity = () => {
    setShowInactivityAlert(true);
    setInactivityTimer(5);
    setShowRedBorder(false);
    setIsSimulating(true);
  };

  const handleRecordTestClip = () => {
    if (!stream) return;

    // If currently playing, stop playback
    if (isPlaying) {
      setIsPlaying(false);
    }

    // Clear previous recording
    if (recordedUrl) {
      URL.revokeObjectURL(recordedUrl);
      setRecordedUrl(null);
    }

    setIsRecording(true);
    chunksRef.current = [];

    try {
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        setHasRecorded(true);
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        setRecordedUrl(url);
        console.log('Recorded blob size:', blob.size);
      };

      mediaRecorder.start();

      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setIsRecording(false);
        }
      }, 4000); // 4 seconds
    } catch (err) {
      console.error('Error starting recording:', err);
      // Fallback
      try {
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        mediaRecorder.onstop = () => {
          setHasRecorded(true);
          const blob = new Blob(chunksRef.current);
          const url = URL.createObjectURL(blob);
          setRecordedUrl(url);
        };
        mediaRecorder.start();
        setTimeout(() => { if (mediaRecorder.state === 'recording') { mediaRecorder.stop(); setIsRecording(false); } }, 4000);
      } catch (e2) {
        console.error("Fallback recording failed", e2);
      }
    }
  };

  const handlePlayClip = () => {
    if (recordedUrl) {
      setIsPlaying(true);
    }
  };

  const handleStartFaceDetection = () => {
    setFaceDetectionStarted(true);
    setDetectionProgress(0);

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
    console.log('Retrying camera access');
  };

  const handleStartCalibration = () => {
    setIsCalibrating(true);
    setScore(0);
    setTargetsCaught(0);
    setFireflies([]);

    const spawnFirefly = () => {
      if (targetsCaught >= totalTargets) {
        setIsCalibrating(false);
        setCalibrationComplete(true);
        return;
      }

      const newFirefly = {
        x: Math.random() * 80 + 10,
        y: Math.random() * 80 + 10,
        id: Date.now(),
        isCalibration: true
      };

      setFireflies(prev => [...prev, newFirefly]);

      setTimeout(() => {
        setFireflies(prev => prev.filter(f => f.id !== newFirefly.id));
      }, 2000);
    };

    const interval = setInterval(() => {
      if (targetsCaught < totalTargets) {
        spawnFirefly();
      } else {
        clearInterval(interval);
      }
    }, 800);
  };

  const handleFireflyClick = (firefly: { x: number; y: number; id: number; isCalibration: boolean }) => {
    setFireflies(prev => prev.filter(f => f.id !== firefly.id));
    setScore(prev => prev + 100);
    setTargetsCaught(prev => {
      const newCount = prev + 1;
      if (newCount >= totalTargets) {
        // Automatically complete calibration when target is reached
        setTimeout(() => {
          setIsCalibrating(false);
          setCalibrationComplete(true);
        }, 500);
      }
      return newCount;
    });
  };

  const steps = [
    { number: 1, label: 'Welcome' },
    { number: 2, label: 'Device Test' },
    { number: 3, label: 'Instructions' },
    { number: 4, label: 'Face Detection' },
    { number: 5, label: 'Break the Ice' },
    { number: 6, label: 'Copy/Paste' },
    { number: 7, label: 'One Person' },
    { number: 8, label: 'Inactivity Alert' },
    { number: 9, label: 'Ready' }
  ];

  const renderStepIndicator = () => (
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
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <Card className="max-w-5xl mx-auto p-8">
            <div className="space-y-6 text-center">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                  <FileText className="w-8 h-8 text-white" />
                </div>
              </div>

              <h2 className="text-gray-700">Welcome to the Technical Assessment</h2>

              <p className="text-gray-600 max-w-2xl mx-auto">
                This assessment evaluates your technical skills and problem-solving abilities. You'll complete 15 coding challenges within 45 minutes. Read each question carefully and submit your best solution.
              </p>

              <div className="space-y-4 text-left max-w-2xl mx-auto pt-4">
                <div className="flex items-start gap-3 text-gray-600">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span className="text-sm">Answer all questions to the best of your ability</span>
                </div>
                <div className="flex items-start gap-3 text-gray-600">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span className="text-sm">You can navigate between questions during the session</span>
                </div>
                <div className="flex items-start gap-3 text-gray-600">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span className="text-sm">Make sure you have a stable internet connection</span>
                </div>
                <div className="flex items-start gap-3 text-gray-600">
                  <span className="text-emerald-500 mt-1">✓</span>
                  <span className="text-sm">Ensure you're in a comfortable, distraction-free environment</span>
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
          <Card className="max-w-5xl mx-auto p-8">
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

              <div className="bg-slate-800 rounded-lg h-80 flex flex-col items-center justify-center overflow-hidden relative">
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
                    <Camera className="w-16 h-16 text-slate-600 mb-4" />
                    <p className="text-slate-500">{cameraError || 'Camera not available'}</p>
                    {cameraError && (
                      <Button variant="outline" size="sm" onClick={startCamera} className="mt-4">
                        Retry Camera
                      </Button>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2 text-gray-600">
                <Mic className="w-4 h-4" />
                <span className="text-sm">Microphone level</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Button
                  className="text-white rounded-full"
                  style={{ backgroundColor: isRecording ? '#EF4444' : '#6366F1' }}
                  onClick={handleRecordTestClip}
                  disabled={isRecording}
                >
                  {isRecording ? 'Recording...' : 'Record Test Clip'}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={handlePlayClip}
                  disabled={!hasRecorded}
                >
                  Play Clip
                </Button>
              </div>

              <p className="text-center text-gray-500 text-xs">
                Ensure your device seek prompts before proceeding
              </p>

              <div className="flex justify-end pt-4">
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
                Please review these important guidelines before starting your assessment session.
              </p>

              <div className="space-y-6 pt-4">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2FF' }}>
                    <FileText className="w-5 h-5" style={{ color: '#6366F1' }} />
                  </div>
                  <div>
                    <h4 className="text-gray-700 mb-1">You'll answer technical questions</h4>
                    <p className="text-gray-600 text-sm">
                      Each question will be presented one at a time. Take your time to think through your solution before submitting.
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
                      You have 45 minutes to complete all 15 questions. Manage your time wisely and don't spend too long on any single question.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#EEF2FF' }}>
                    <User className="w-5 h-5" style={{ color: '#6366F1' }} />
                  </div>
                  <div>
                    <h4 className="text-gray-700 mb-1">Stay centered and focused</h4>
                    <p className="text-gray-600 text-sm">
                      Maintain focus throughout the assessment. Read each question carefully and provide your best answer.
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
                      Make sure you're in a quiet environment. Background noise may affect your concentration and assessment results.
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

              <div className="grid grid-cols-2 gap-6">
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

                <div className="rounded-lg h-80 flex items-center justify-center" style={{ backgroundColor: '#F3E8FF' }}>
                  {faceDetectionStarted ? (
                    <svg width="200" height="240" viewBox="0 0 200 240" className="transition-opacity duration-500">
                      <ellipse cx="100" cy="120" rx="60" ry="80" fill="none" stroke="#A855F7" strokeWidth="2" />
                      <circle cx="80" cy="100" r="3" fill="#A855F7" />
                      <circle cx="120" cy="100" r="3" fill="#A855F7" />
                      <circle cx="100" cy="120" r="2" fill="#A855F7" />
                      <circle cx="85" cy="145" r="2" fill="#A855F7" />
                      <circle cx="100" cy="148" r="2" fill="#A855F7" />
                      <circle cx="115" cy="145" r="2" fill="#A855F7" />
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

              {faceDetectionComplete && (
                <div className="flex items-center gap-2 p-4 rounded-lg" style={{ backgroundColor: '#D1FAE5' }}>
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="text-emerald-700">Face successfully detected and calibrated!</span>
                </div>
              )}

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
                      Before we begin the assessment, let's warm up with a fun little game! Catch the glowing fireflies as they appear across the screen.
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
                      Relax and have fun! Click the fireflies as they light up. This helps you get comfortable before the assessment.
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

              {isCalibrating && (
                <div
                  ref={calibrationRef}
                  className="fixed inset-0 w-screen h-screen cursor-crosshair"
                  style={{
                    background: 'linear-gradient(135deg, #5B21B6 0%, #DB2777 100%)',
                    zIndex: 9999
                  }}
                >
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
                  Excellent! You're now comfortable and ready to shine in your assessment. Let's proceed to the next step.
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

              <div className="grid grid-cols-2 gap-6 pt-4">
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

              <div className="pt-4">
                <h4 className="text-gray-700 mb-3">What will happen if violated:</h4>
                <div className="p-4 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                  <div className="text-center">
                    <p className="text-gray-900 mb-1">Will be Discussed</p>
                    <p className="text-gray-500 text-sm">Supporting text</p>
                  </div>
                </div>
              </div>

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
          <Card className="max-w-5xl mx-auto p-8">
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#6366F1' }}>
                  <AlertCircle className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-gray-700">Inactivity Alert System</h3>
              </div>

              <p className="text-gray-600">
                For safeguarding fairness and security throughout the session, if inactivity is detected for a period of time, you'll receive an alert to confirm you're still present.
              </p>

              <div className="space-y-4 text-gray-600 text-sm">
                <p><strong className="text-gray-700">Demo:</strong> Watch what happens when the system detects inactivity:</p>
              </div>

              <div
                className="relative p-8 rounded-lg transition-all duration-300"
                style={{
                  backgroundColor: '#F9FAFB',
                  border: showRedBorder ? '4px solid #EF4444' : '2px solid #E5E7EB'
                }}
              >
                {showInactivityAlert ? (
                  <div className="text-center space-y-6">
                    <div className="flex justify-center">
                      <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#FEE2E2' }}>
                        <AlertCircle className="w-8 h-8 text-red-500" />
                      </div>
                    </div>

                    <div>
                      <h4 className="text-gray-700 mb-2">Inactivity Detected</h4>
                      <p className="text-gray-600 text-sm">
                        Please confirm you are still present by clicking the button below.
                      </p>
                    </div>

                    <div className="flex flex-col items-center gap-2">
                      <div
                        className="text-6xl font-bold transition-colors"
                        style={{ color: inactivityTimer <= 2 ? '#EF4444' : '#6366F1' }}
                      >
                        {inactivityTimer}
                      </div>
                      <p className="text-gray-500 text-sm">
                        {inactivityTimer > 0 ? 'Simulating inactivity' : 'Time\'s up! Red border appears.'}
                      </p>
                    </div>

                    <Button
                      className="text-white rounded-full px-8"
                      style={{ backgroundColor: '#6366F1' }}
                      onClick={handleImHere}
                    >
                      I'm here
                    </Button>

                    {showRedBorder && (
                      <div className="p-3 rounded-lg" style={{ backgroundColor: '#FEE2E2' }}>
                        <p className="text-red-600 text-sm">
                          ⚠️ Red border alert activated. Click "I'm here" to continue.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <div
                      className="text-6xl font-bold mb-2"
                      style={{ color: '#9CA3AF' }}
                    >
                      5
                    </div>
                    <p className="text-gray-500 text-sm">Simulating inactivity</p>

                    <Button
                      className="text-white rounded-full px-8 mt-4"
                      style={{ backgroundColor: '#6366F1' }}
                      onClick={handleSimulateInactivity}
                      disabled={isSimulating}
                    >
                      Start Demo
                    </Button>
                  </div>
                )}
              </div>

              <div className="p-4 rounded-lg" style={{ backgroundColor: '#EFF6FF' }}>
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 flex-shrink-0" style={{ color: '#3B82F6' }} />
                  <div>
                    <h4 className="text-sm mb-1" style={{ color: '#1E40AF' }}>How it works:</h4>
                    <p className="text-sm" style={{ color: '#1E40AF' }}>
                      During the assessment, if no activity is detected, a countdown will appear. If you don't respond before it reaches zero, a red border will appear around the screen to alert you. Simply click "I'm here" to continue.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 pt-4">
                <Button
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setCurrentStep(7)}
                >
                  Back
                </Button>
                <Button
                  className="text-white rounded-full"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={() => setCurrentStep(9)}
                >
                  Continue
                </Button>
              </div>
            </div>
          </Card>
        );

      case 9:
        return (
          <Card className="max-w-5xl mx-auto p-12">
            <div className="flex flex-col items-center text-center space-y-8">
              <div className="w-24 h-24 rounded-full flex items-center justify-center" style={{ backgroundColor: '#10B981' }}>
                <CheckCircle2 className="w-16 h-16 text-white" />
              </div>

              <h2 className="text-gray-700">All Set!</h2>

              <p className="text-gray-600">
                You've completed all the setup steps
              </p>

              <Button
                className="text-white rounded-full px-12 py-6 text-lg"
                style={{ backgroundColor: '#6366F1' }}
                onClick={() => {
                  sessionStorage.setItem('assessment_checks_done', 'true');
                  setInAssessmentSession(true);
                }}
              >
                Start Session →
              </Button>

              <p className="text-gray-700 text-sm max-w-xl">
                Remember: Stay focused, remain alone in frame, and avoid any prohibited actions
              </p>
            </div>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EDF0F8' }}>
      {inAssessmentSession ? (
        <AssessmentSession
          onSignOut={() => {
            sessionStorage.removeItem('assessment_checks_done');
            onSignOut();
          }}
          onComplete={() => {
            sessionStorage.removeItem('assessment_checks_done');
            onCompletion();
          }}
        />
      ) : (
        <>
          <header className="px-12 py-6">
            <div className="flex items-center justify-between">
              <div>
                <img src={logo} alt="ERAMATCH - A Smarter Recruitment System" className="h-12" />
              </div>
              <div className="flex items-center gap-4">
                <Button
                  variant="outline"
                  className="rounded-full px-6"
                  onClick={onExit}
                >
                  Exit Assessment
                </Button>
                <Button
                  className="rounded-full px-6 transition-colors duration-200 border"
                  style={{ backgroundColor: '#EDF0F8', color: '#EF4444', borderColor: '#EF4444' }}
                  onMouseEnter={(e: React.MouseEvent<HTMLButtonElement>) => {
                    e.currentTarget.style.backgroundColor = '#EF4444';
                    e.currentTarget.style.color = '#FFFFFF';
                    e.currentTarget.style.borderColor = '#EF4444';
                  }}
                  onMouseLeave={(e: React.MouseEvent<HTMLButtonElement>) => {
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

          <main className="px-12 py-8">
            {renderStepIndicator()}
            {renderStepContent()}
          </main>
        </>
      )}
    </div>
  );
}