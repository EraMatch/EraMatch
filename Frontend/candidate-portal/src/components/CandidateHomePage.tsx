import { Bell, CheckCircle2, Clock, FileText, Video, Calendar, ArrowRight, AlertCircle, Wrench, Loader2, Lock } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import logo from '../imports/image-eramatch.png';
import { useCandidateHome } from '../hooks/candidate/useCandidateHome';

interface CandidateHomePageProps {
  onOpenTestingPage?: () => void;
}

interface Notification {
  id: number;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

interface StageData {
  stage_id: string;
  stage_type: string;
  stage_order: number;
  status: string;
  title: string;
  score: number | null;
  started_at: string | null;
  completed_at: string | null;
}

interface HomeData {
  profile: { full_name: string; email: string } | null;
  position: { job_title: string } | null;
  project: { name: string; description: string } | null;
  group: { group_name: string } | null;
  current_stage: StageData | null;
  stages: StageData[];
  notifications: Notification[];
}

const stageIcon = (type: string) => {
  switch (type) {
    case 'screening': return CheckCircle2;
    case 'assessment': return FileText;
    case 'ai_interview': return Video;
    case 'live_interview': return Calendar;
    default: return FileText;
  }
};

export function CandidateHomePage({
  onOpenTestingPage
}: CandidateHomePageProps) {
  const navigate = useNavigate();
  const { data: rawHomeData, isLoading } = useCandidateHome();
  const homeData = rawHomeData as HomeData | null ?? null;
  const notifications: Notification[] = (homeData?.notifications || []).map((n: any) => ({
    ...n,
    type: n.type as 'success' | 'info' | 'warning',
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafbfc]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Extract data for display
  const candidateName = homeData?.profile?.full_name || 'Candidate';
  const jobTitle = homeData?.position?.job_title || 'Position';
  const projectName = homeData?.project?.name || 'Project';
  const stages = homeData?.stages || [];
  const currentStage = homeData?.current_stage;

  // All stages completed?
  const allCompleted = stages.length > 0 && stages.every(s => s.status === 'completed');

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    console.log('Mark all read requested');
  };

  // Get overall application status based on stages
  const getOverallStatus = () => {
    if (allCompleted) return 'Completed';
    if (stages.some(s => s.status === 'in_progress')) return 'In Progress';
    if (stages.some(s => s.status === 'unlocked')) return 'Ready';
    return 'Pending';
  };

  const overallStatus = getOverallStatus();
  const statusColors: Record<string, { bg: string; border: string; text: string }> = {
    'Completed': { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-600' },
    'In Progress': { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-600' },
    'Ready': { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-600' },
    'Pending': { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600' },
  };
  const sc = statusColors[overallStatus] || statusColors['Pending'];

  // Navigate to the right page based on stage type
  const handleStartStage = () => {
    if (!currentStage) return;
    const stageType = currentStage.stage_type;
    if (stageType === 'assessment') navigate('/assessment/technical');
    else if (stageType === 'ai_interview') navigate('/interview/video');
    else if (stageType === 'live_interview') navigate('/assessment/live');
    else navigate('/testing');
  };

  return (
    <div className="min-h-screen w-full overflow-auto bg-[#fafbfc]">
      {/* Header */}
      <div className="bg-white border-b border-[#e5e7eb]">
        <div className="max-w-[1200px] mx-auto px-[48px] py-[20px] flex items-center justify-between">
          <div className="flex items-center gap-[12px]">
            <img
              src={logo}
              alt="ERAMATCH - A Smarter Recruitment System"
              className="h-[40px] w-[201.188px] object-cover"
            />
          </div>

          {/* Notifications Bell */}
          <div className="relative">
            <button className="relative w-[40px] h-[40px] rounded-full hover:bg-[#f3f4f6] flex items-center justify-center transition-colors">
              <Bell size={20} className="text-[#6b7280]" />
              {unreadCount > 0 && (
                <div className="absolute top-[8px] right-[8px] w-[16px] h-[16px] bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-[10px] text-white font-bold">{unreadCount}</span>
                </div>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1200px] mx-auto px-[48px] py-[32px]">
        {/* Welcome Section */}
        <div className="mb-[32px]">
          <h1 className="font-['Arimo',sans-serif] text-[32px] text-black mb-[8px]">
            Welcome back, {candidateName}
          </h1>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
            Track your application progress and stay updated
          </p>
        </div>

        <div className="grid grid-cols-3 gap-[24px] mb-[32px]">
          {/* Application Progress */}
          <div className="col-span-2">
            <div className="bg-white rounded-[12px] shadow-sm border border-[#e5e7eb] p-[24px]">
              <h2 className="font-['Arimo',sans-serif] text-[18px] text-black mb-[20px]">
                Application Progress
              </h2>

              {/* Active Application */}
              <div className="bg-[#fafbfc] rounded-[10px] p-[20px] border border-[#e5e7eb] mb-[24px]">
                <div className="flex items-center justify-between mb-[16px]">
                  <div>
                    <h4 className="font-['Arimo',sans-serif] text-[15px] text-black font-medium mb-[4px]">
                      {jobTitle}
                    </h4>
                    <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      {projectName}
                    </p>
                  </div>
                  <div className={`h-[28px] px-[12px] rounded-full ${sc.bg} border ${sc.border} flex items-center`}>
                    <span className={`font-['Arimo',sans-serif] text-[12px] ${sc.text} font-medium`}>
                      {overallStatus}
                    </span>
                  </div>
                </div>

                {/* Progress Steps — REAL from API stages */}
                <div className="flex items-center gap-[8px] mb-[16px]">
                  {stages.map((stage, index) => {
                    const Icon = stageIcon(stage.stage_type);
                    const isCompleted = stage.status === 'completed';
                    const isActive = stage.status === 'in_progress' || stage.status === 'unlocked';
                    const isLocked = stage.status === 'locked';

                    return (
                      <div key={stage.stage_id} className="flex items-center gap-[8px] flex-1">
                        <div className={`w-[32px] h-[32px] rounded-full flex items-center justify-center transition-all ${
                          isCompleted
                            ? 'bg-emerald-100'
                            : isActive
                              ? 'bg-blue-100 border-2 border-blue-500'
                              : 'bg-gray-100'
                        }`}>
                          {isLocked ? (
                            <Lock size={16} className="text-gray-400" />
                          ) : (
                            <Icon size={16} className={
                              isCompleted
                                ? 'text-emerald-600'
                                : isActive
                                  ? 'text-blue-600'
                                  : 'text-gray-400'
                            } />
                          )}
                        </div>
                        {index < stages.length - 1 && (
                          <div className={`h-[2px] flex-1 ${isCompleted ? 'bg-emerald-200' : 'bg-gray-200'}`}></div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[6px]">
                    <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      {allCompleted
                        ? 'All stages completed — wait for recruiter to proceed'
                        : currentStage
                          ? `Current Stage: ${currentStage.title}`
                          : 'No active stage — wait for recruiter to start one'}
                    </span>
                  </div>
                  <button
                    onClick={() => navigate('/testing')}
                    className="flex items-center gap-[6px] text-[#6366f1] hover:text-[#5558e3] transition-colors"
                  >
                    <span className="font-['Arimo',sans-serif] text-[13px] font-medium">
                      View Details
                    </span>
                    <ArrowRight size={14} />
                  </button>
                </div>
              </div>

              {/* Next Steps */}
              <div>
                <h3 className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-[12px]">
                  Next steps
                </h3>

                <div className="bg-[#fafbfc] rounded-[10px] p-[20px] border border-[#e5e7eb]">
                  {allCompleted ? (
                    /* All done — show completed message */
                    <div className="flex items-center gap-[16px]">
                      <div className="w-[40px] h-[40px] rounded-full bg-emerald-100 flex items-center justify-center">
                        <CheckCircle2 size={20} className="text-emerald-600" />
                      </div>
                      <div>
                        <h4 className="font-['Arimo',sans-serif] text-[15px] text-black font-medium mb-[2px]">
                          All Stages Completed
                        </h4>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          You have completed all stages. Wait for the recruiter to review and proceed.
                        </p>
                      </div>
                    </div>
                  ) : currentStage ? (
                    /* Current stage available */
                    <>
                      <div className="flex items-start justify-between mb-[12px]">
                        <div className="flex-1">
                          <h4 className="font-['Arimo',sans-serif] text-[15px] text-black font-medium mb-[4px]">
                            {currentStage.title}
                          </h4>
                          <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] leading-[18px]">
                            {currentStage.status === 'in_progress'
                              ? 'You have started this stage. Continue to complete it.'
                              : 'Complete this stage to advance in your application'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-[16px]">
                          <div className="flex items-center gap-[6px]">
                            {(() => { const Icon = stageIcon(currentStage.stage_type); return <Icon size={14} className="text-[#6b7280]" />; })()}
                            <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                              {currentStage.stage_type === 'assessment' ? 'Technical Assessment'
                                : currentStage.stage_type === 'ai_interview' ? 'AI Video Interview'
                                : currentStage.stage_type === 'live_interview' ? 'Live Interview'
                                : currentStage.stage_type.replace('_', ' ')}
                            </span>
                          </div>
                        </div>

                        <Button
                          onClick={handleStartStage}
                          className="bg-[#6366f1] hover:bg-[#5558e3] text-white h-[36px] px-[20px] rounded-[6px] font-['Arimo',sans-serif] text-[14px]"
                        >
                          {currentStage.status === 'in_progress' ? 'Continue' : 'Start Now'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    /* No current stage — waiting */
                    <div className="flex items-center gap-[16px]">
                      <div className="w-[40px] h-[40px] rounded-full bg-gray-100 flex items-center justify-center">
                        <Clock size={20} className="text-gray-400" />
                      </div>
                      <div>
                        <h4 className="font-['Arimo',sans-serif] text-[15px] text-black font-medium mb-[2px]">
                          Waiting for Next Stage
                        </h4>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          The recruiter has not opened the next stage yet. Check back later.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Development Testing Button */}
              <div className="mt-[24px] pt-[24px] border-t border-[#e5e7eb]">
                <button
                  onClick={onOpenTestingPage}
                  className="w-full h-[44px] rounded-[8px] border-2 border-dashed border-[#9ca3af] bg-[#f9fafb] hover:bg-[#f3f4f6] transition-colors flex items-center justify-center gap-[8px]"
                >
                  <Wrench size={16} className="text-[#6b7280]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] font-medium">
                    For Development Testing
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Notification Center */}
          <div className="col-span-1">
            <div className="bg-white rounded-[12px] shadow-sm border border-[#e5e7eb] p-[24px]">
              <div className="flex items-center justify-between mb-[20px]">
                <h2 className="font-['Arimo',sans-serif] text-[18px] text-black">
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="font-['Arimo',sans-serif] text-[12px] text-[#6366f1] hover:text-[#5558e3] transition-colors"
                  >
                    Mark all read
                  </button>
                )}
              </div>

              <div className="space-y-[12px]">
                {notifications.length === 0 ? (
                  <p className="font-['Arimo',sans-serif] text-[13px] text-[#9ca3af] text-center py-[20px]">
                    No notifications yet
                  </p>
                ) : (
                  notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-[16px] rounded-[8px] border ${notification.read
                        ? 'bg-white border-[#e5e7eb]'
                        : 'bg-[#eef2ff] border-[#c7d2fe]'
                      }`}
                    >
                      <div className="flex items-start gap-[12px]">
                        <div className={`w-[32px] h-[32px] rounded-full flex items-center justify-center shrink-0 ${
                          notification.type === 'success'
                            ? 'bg-emerald-100'
                            : notification.type === 'info'
                              ? 'bg-blue-100'
                              : 'bg-amber-100'
                        }`}>
                          {notification.type === 'success' && <CheckCircle2 size={16} className="text-emerald-600" />}
                          {notification.type === 'info' && <Bell size={16} className="text-blue-600" />}
                          {notification.type === 'warning' && <AlertCircle size={16} className="text-amber-600" />}
                        </div>

                        <div className="flex-1 min-w-0">
                          <h4 className="font-['Arimo',sans-serif] text-[13px] text-black font-medium mb-[4px]">
                            {notification.title}
                          </h4>
                          <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] leading-[16px] mb-[8px]">
                            {notification.message}
                          </p>
                          {notification.time && (
                            <span className="font-['Arimo',sans-serif] text-[11px] text-[#9ca3af]">
                              {notification.time}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}