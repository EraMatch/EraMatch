import { Button } from './ui/button';
import { Card } from './ui/card';
import { FileText, Layers, Clock, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { api } from '../services/api';
import logo from '../imports/image-eramatch.png';

interface CandidateDashboardProps {
  onSignOut: () => void;
  onStartRecordedInterview?: () => void;
  onStartLiveInterview?: () => void;
  recordedInterviewCompleted?: boolean;
  liveInterviewCompleted?: boolean;
  onStartTechnicalAssessment?: () => void;
  technicalAssessmentCompleted?: boolean;
  onBack?: () => void;
}

export function CandidateDashboard({ onSignOut, onStartRecordedInterview, onStartLiveInterview, recordedInterviewCompleted, liveInterviewCompleted, onStartTechnicalAssessment, technicalAssessmentCompleted, onBack }: CandidateDashboardProps) {
  const [assessments, setAssessments] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        setIsLoading(true);
        const data = await api.candidate.getAssessments();
        setAssessments(data);
      } catch (error) {
        console.error("Failed to fetch assessments");
      } finally {
        setIsLoading(false);
      }
    };
    fetchAssessments();
  }, []);

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
        {/* Back Button (only shown when onBack is provided) */}
        {onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-[#6366f1] hover:text-[#5558e3] transition-colors mb-6 font-['Arimo',sans-serif] text-[14px] font-medium"
          >
            <ArrowLeft size={16} />
            <span>Back to Homepage</span>
          </button>
        )}

        <h2 className="text-gray-700 mb-8 text-2xl font-semibold">Available assessments</h2>

        <div className="space-y-6">
          {assessments.map((assessment) => (
            <Card key={assessment.id} className="p-6 hover:shadow-lg transition-shadow">
              <div className="flex items-center justify-between gap-6">
                <div className="flex-1">
                  <h3 className="text-gray-700 mb-2">{assessment.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">
                    {assessment.description}
                  </p>
                </div>

                <div className="flex items-center gap-6">
                  {assessment.type === 'assessment' ? (
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <FileText className="w-4 h-4" />
                      <span>{assessment.questions}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-gray-600 text-sm">
                      <Layers className="w-4 h-4" />
                      <span>{assessment.parts}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-gray-600 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{assessment.expectedTime}</span>
                  </div>

                  {/* Check completion status and render appropriate button */}
                  {(recordedInterviewCompleted && assessment.type === 'interview' && assessment.parts === 5) ||
                    (liveInterviewCompleted && assessment.type === 'interview' && assessment.parts === 1) ||
                    (technicalAssessmentCompleted && assessment.type === 'assessment') ? (
                    <div className="flex items-center gap-3">
                      <Button
                        className="rounded-full px-6 whitespace-nowrap w-44 bg-gray-300 cursor-not-allowed"
                        disabled
                      >
                        Completed
                      </Button>
                      <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                    </div>
                  ) : (
                    <Button
                      className="text-white rounded-full px-6 whitespace-nowrap w-44"
                      style={{ backgroundColor: '#6366F1' }}
                      onClick={
                        assessment.type === 'interview' && assessment.parts === 5
                          ? onStartRecordedInterview
                          : assessment.type === 'interview' && assessment.parts === 1
                            ? onStartLiveInterview
                            : assessment.type === 'assessment'
                              ? onStartTechnicalAssessment
                              : undefined
                      }
                    >
                      {assessment.type === 'assessment' ? 'Start Assessment' : 'Start Interview'}
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