import { Button } from './ui/button';
import { Card } from './ui/card';
import { FileText, Layers, Clock, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import logo from '../imports/image-eramatch.png';
import { useCandidateAssessments } from '../hooks/candidate/useCandidateAssessments';

interface CandidateDashboardProps {
  onSignOut: () => void;
  onStartRecordedInterview?: () => void;
  onStartLiveInterview?: () => void;
  onStartTechnicalAssessment?: () => void;
  onBack?: () => void;
}

// Matches the backend /candidate/assessments response shape
interface StageInfo {
  id: string;
  type: string;          // 'assessment' | 'ai_interview' | 'live_interview'
  stage_order: number;
  status: string;        // 'locked' | 'unlocked' | 'in_progress' | 'completed'
  title: string;
  description: string;
  expectedTime: string;
}

export function CandidateDashboard({
  onSignOut,
  onStartRecordedInterview,
  onStartLiveInterview,
  onStartTechnicalAssessment,
  onBack,
}: CandidateDashboardProps) {
  const { data: rawAssessments, isLoading, isError } = useCandidateAssessments();
  const stageData = rawAssessments as any;
  const stages: StageInfo[] = Array.isArray(stageData) ? stageData : (stageData?.stages || []);
  const assessments = stages;
  const error = isError ? 'Failed to load your assessments. Please refresh.' : null;

  const getStartHandler = (card: StageInfo) => {
    if (card.type === 'assessment') return onStartTechnicalAssessment;
    if (card.type === 'ai_interview') return onStartRecordedInterview;
    if (card.type === 'live_interview') return onStartLiveInterview;
    return undefined;
  };

  const isCompleted = (card: StageInfo) => card.status === 'completed';
  const isLocked = (card: StageInfo) => card.status === 'locked';
  const isAvailable = (card: StageInfo) =>
    card.status === 'unlocked' || card.status === 'in_progress';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: '#EDF0F8' }}>
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EDF0F8' }}>
      {/* Header */}
      <header className="px-12 py-6">
        <div className="flex items-center justify-between">
          <div>
            <img src={logo} alt="ERAMATCH - A Smarter Recruitment System" className="h-12" />
          </div>
          <div className="flex items-center gap-4">
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

      {/* Main Content */}
      <main className="px-12 py-8">
        {/* Back Button */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#6366f1] hover:text-[#5558e3] transition-colors mb-6 font-['Arimo',sans-serif] text-[14px] font-medium"
          >
            <ArrowLeft size={16} />
            <span>Back to Homepage</span>
          </button>
        )}

        <h2 className="text-gray-700 mb-8 text-2xl font-semibold">Your Assessments</h2>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-6">
          {assessments.length === 0 && !error && (
            <p className="text-gray-500 text-center py-12">No assessments available at this time.</p>
          )}

          {assessments.map((assessment) => (
            <Card key={assessment.id} className={`p-6 hover:shadow-lg transition-shadow ${isLocked(assessment) ? 'opacity-60' : ''}`}>
              <div className="flex items-center justify-between gap-6">
                <div className="flex-1">
                  <h3 className="text-gray-700 mb-2 font-semibold">{assessment.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {assessment.description}
                  </p>
                  {/* Status badge */}
                  <div className="mt-2">
                    {isCompleted(assessment) && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3" /> Completed
                      </span>
                    )}
                    {assessment.status === 'in_progress' && (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        <Clock className="w-3 h-3" /> In Progress
                      </span>
                    )}
                    {isLocked(assessment) && (
                      <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full">
                        🔒 Locked
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  {assessment.type === 'assessment' ? (
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <FileText className="w-4 h-4" />
                      <span>Technical Assessment</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <Layers className="w-4 h-4" />
                      <span>{assessment.type === 'live_interview' ? 'Live Interview' : 'Video Interview'}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-gray-600 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{assessment.expectedTime}</span>
                  </div>

                  {isCompleted(assessment) ? (
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center gap-3">
                        <Button
                          className="rounded-full px-6 whitespace-nowrap w-44 bg-gray-200 text-gray-500 cursor-not-allowed"
                          disabled
                        >
                          Completed
                        </Button>
                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                      </div>
                      <span className="text-xs text-gray-500 mt-1 mr-8">Wait for your next stage</span>
                    </div>
                  ) : isLocked(assessment) ? (
                    <Button
                      className="rounded-full px-6 whitespace-nowrap w-44 bg-gray-200 text-gray-400 cursor-not-allowed"
                      disabled
                    >
                      Locked
                    </Button>
                  ) : (
                    <Button
                      className="text-white rounded-full px-6 whitespace-nowrap w-44"
                      style={{ backgroundColor: '#6366F1' }}
                      onClick={getStartHandler(assessment)}
                    >
                      {assessment.status === 'in_progress' ? 'Continue' : assessment.type === 'assessment' ? 'Start Assessment' : 'Start Interview'}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}