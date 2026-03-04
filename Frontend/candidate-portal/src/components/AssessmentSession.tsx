import { useState, useEffect, useRef } from 'react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { AlertCircle, ChevronLeft, ChevronRight, Clock, CheckCircle2, Code2, Flag, Play, Loader2, Send } from 'lucide-react';
import logo from '../imports/image-eramatch.png';
import { api } from '../services/api';

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
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [isSubmittingAnswer, setIsSubmittingAnswer] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const [stageId, setStageId] = useState<string | null>(null);
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const [maxAttempts, setMaxAttempts] = useState<Record<string, number>>({});
  const containerRef = useRef<HTMLDivElement>(null);

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
        // Step 1: Get assessment config
        const config = await api.candidate.getAssessmentConfig() as any;
        setAssessmentId(config.assessment_id);
        setStageId(config.stage_id);
        
        const durationSeconds = (config.duration_minutes || 60) * 60;
        setAssessmentTimer(durationSeconds);
        setInitialTimer(durationSeconds);

        // Step 2: Start assessment session (or resume existing)
        const session = await api.candidate.startAssessment({
          assessment_id: config.assessment_id,
          stage_id: config.stage_id,
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
          return {
            id: q.question_id,
            type: qType as 'essay' | 'mcq' | 'coding',
            question: q.question_text,
            options: q.question_config?.options,
            starterCode: q.question_config?.starter_code,
            language: q.question_config?.language || 'python',
            testCases: q.question_config?.test_cases,
            points: q.points || 10,
            section_title: q.section_title,
          };
        });
        setQuestions(mappedQuestions);

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
        setQuestions([]);
      } finally {
        setIsLoading(false);
      }
    };
    fetchAndStartAssessment();
  }, []);

  const currentQuestion = questions[currentQuestionIndex];

  // Assessment timer countdown
  useEffect(() => {
    if (assessmentComplete) return; // Stop timer when assessment is complete

    const timer = setInterval(() => {
      setAssessmentTimer((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Auto-submit the assessment to backend before navigating away
          if (sessionId) {
            api.candidate.submitAssessment({ session_id: sessionId })
              .then(() => {
                console.log('Assessment auto-submitted on time expiry');
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
  }, [onComplete, assessmentComplete, sessionId]);

  // Inactivity detection
  useEffect(() => {
    const checkInactivity = setInterval(() => {
      const timeSinceLastActivity = Date.now() - lastActivity;
      const inactiveSeconds = Math.floor(timeSinceLastActivity / 1000);

      if (inactiveSeconds >= 30 && !showInactivityAlert) {
        setShowInactivityAlert(true);
        setInactivityCountdown(5);
      }
    }, 1000);

    return () => clearInterval(checkInactivity);
  }, [lastActivity, showInactivityAlert]);

  // Inactivity countdown
  useEffect(() => {
    if (showInactivityAlert && inactivityCountdown > 0) {
      const countdown = setInterval(() => {
        setInactivityCountdown((prev) => {
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
  }, [showInactivityAlert, inactivityCountdown]);

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
          <p className="text-gray-600 mb-6">Unable to load questions. Please try again later.</p>
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
                  {currentQuestion.testCases.filter(tc => !tc.is_hidden).map((tc, idx) => (
                    <div key={idx} className="bg-white p-3 rounded border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4">
                      <div className="flex-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Input</span>
                        <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap">{tc.input}</pre>
                      </div>
                      <div className="hidden md:block w-px bg-gray-200"></div>
                      <div className="flex-1">
                        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">Expected Output</span>
                        <pre className="text-sm font-mono text-gray-800 whitespace-pre-wrap">{tc.expected_output}</pre>
                      </div>
                    </div>
                  ))}
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
                  {currentQuestion.options.map((option, index) => (
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
                      <span className="text-gray-700">{option}</span>
                    </label>
                  ))}
                </div>
              )}

              {currentQuestion.type === 'coding' && (
                <div className="space-y-3">
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
                        value={selectedLanguages[currentQuestion.id] || 'javascript'}
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
                              <pre className="text-gray-800 whitespace-pre-wrap mt-1">{res.expected}</pre>
                            </div>
                            <div className={`text-xs font-mono bg-white p-2 rounded border mt-2 ${res.passed ? 'border-green-200' : 'border-red-200'}`}>
                              <span className={`${res.passed ? 'text-green-600' : 'text-red-600'} font-semibold`}>Actual:</span>
                              <pre className={`${res.passed ? 'text-green-800' : 'text-red-800'} whitespace-pre-wrap mt-1`}>{res.actual || '(no output)'}</pre>
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