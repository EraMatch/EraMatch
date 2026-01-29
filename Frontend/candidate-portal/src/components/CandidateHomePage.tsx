import { Bell, CheckCircle2, Clock, FileText, Video, Calendar, ArrowRight, AlertCircle, Wrench, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { api } from '../services/api';
import logo from '../imports/image-eramatch.png';

interface CandidateHomePageProps {
  onOpenTestingPage?: () => void;
  currentStage?: 'screening' | 'assessment' | 'ai-interview' | 'live-interview';
}

interface Notification {
  id: number;
  type: 'success' | 'info' | 'warning';
  title: string;
  message: string;
  time: string;
  read: boolean;
}

export function CandidateHomePage({
  onOpenTestingPage,
  currentStage: propStage
}: CandidateHomePageProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [currentStage, setCurrentStage] = useState(propStage || 'assessment');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const data = await api.candidate.getHome();
        setNotifications((data.notifications as any).map((n: any) => ({
          ...n,
          type: n.type as 'success' | 'info' | 'warning'
        })));
        if (!propStage && data.currentStage) {
          setCurrentStage(data.currentStage as 'screening' | 'assessment' | 'ai-interview' | 'live-interview');
        }
      } catch (error) {
        console.error("Failed to load candidate home data", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [propStage]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafbfc]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  // Define stage states
  const stages = [
    { id: 'screening', label: 'Screening', icon: CheckCircle2 },
    { id: 'assessment', label: 'Assessment', icon: FileText },
    { id: 'ai-interview', label: 'AI Interview', icon: Video },
    { id: 'live-interview', label: 'Live Interview', icon: Calendar }
  ];

  const getStageStatus = (stageId: string) => {
    const stageOrder = ['screening', 'assessment', 'ai-interview', 'live-interview'];
    const currentIndex = stageOrder.indexOf(currentStage);
    const stageIndex = stageOrder.indexOf(stageId);

    if (stageIndex < currentIndex) return 'completed';
    if (stageIndex === currentIndex) return 'active';
    return 'pending';
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
            Welcome back, Alex
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
                      Senior Software Engineer
                    </h4>
                    <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Summer Internship Project
                    </p>
                  </div>
                  <div className="h-[28px] px-[12px] rounded-full bg-blue-50 border border-blue-200 flex items-center">
                    <span className="font-['Arimo',sans-serif] text-[12px] text-blue-600 font-medium">
                      In Progress
                    </span>
                  </div>
                </div>

                {/* Progress Steps */}
                <div className="flex items-center gap-[8px] mb-[16px]">
                  {stages.map((stage, index) => {
                    const status = getStageStatus(stage.id);
                    const Icon = stage.icon;

                    return (
                      <div key={stage.id} className="flex items-center gap-[8px] flex-1">
                        <div className={`w-[32px] h-[32px] rounded-full flex items-center justify-center transition-all ${status === 'completed'
                          ? 'bg-emerald-100'
                          : status === 'active'
                            ? 'bg-blue-100 border-2 border-blue-500'
                            : 'bg-gray-100'
                          }`}>
                          <Icon size={16} className={
                            status === 'completed'
                              ? 'text-emerald-600'
                              : status === 'active'
                                ? 'text-blue-600'
                                : 'text-gray-400'
                          } />
                        </div>
                        {index < stages.length - 1 && (
                          <div className={`h-[2px] flex-1 ${status === 'completed' ? 'bg-emerald-200' : 'bg-gray-200'
                            }`}></div>
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-[6px]">
                    <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      Current Stage: {stages.find(s => s.id === currentStage)?.label}
                    </span>
                  </div>
                  <button className="flex items-center gap-[6px] text-[#6366f1] hover:text-[#5558e3] transition-colors">
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
                  <div className="flex items-start justify-between mb-[12px]">
                    <div className="flex-1">
                      <h4 className="font-['Arimo',sans-serif] text-[15px] text-black font-medium mb-[4px]">
                        Complete Technical Assessment
                      </h4>
                      <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] leading-[18px]">
                        Evaluate your technical skills with coding challenges and problem-solving tasks
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-[16px]">
                      <div className="flex items-center gap-[6px]">
                        <FileText size={14} className="text-[#6b7280]" />
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                          15 questions
                        </span>
                      </div>
                      <div className="flex items-center gap-[6px]">
                        <Clock size={14} className="text-[#6b7280]" />
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                          45 minutes
                        </span>
                      </div>
                    </div>

                    <Button className="bg-[#6366f1] hover:bg-[#5558e3] text-white h-[36px] px-[20px] rounded-[6px] font-['Arimo',sans-serif] text-[14px]">
                      Start Now
                    </Button>
                  </div>
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
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-[16px] rounded-[8px] border ${notification.read
                      ? 'bg-white border-[#e5e7eb]'
                      : 'bg-[#eef2ff] border-[#c7d2fe]'
                      }`}
                  >
                    <div className="flex items-start gap-[12px]">
                      <div className={`w-[32px] h-[32px] rounded-full flex items-center justify-center shrink-0 ${notification.type === 'success'
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
                        <span className="font-['Arimo',sans-serif] text-[11px] text-[#9ca3af]">
                          {notification.time}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}