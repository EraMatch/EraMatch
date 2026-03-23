import { useState, useEffect, useMemo, useRef } from 'react';
import { Home, Briefcase, Users, Settings, Bell, BookOpen, LogOut, ClipboardCheck, AlertTriangle, Activity, Video, User, ShieldAlert, WandSparkles, ChevronRight } from 'lucide-react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../../services/api';
import { authService } from '../../../services/auth.service';

type SidebarTask = {
  id: string;
  status: string;
  type?: string;
  question?: string;
  source_filename?: string | null;
  task_category: 'video' | 'question_import' | string;
};

const includesAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term));

const normalizedTaskText = (task: SidebarTask) =>
  `${task.type || ''} ${task.question || ''} ${task.source_filename || ''}`.toLowerCase();

const isAntiCheatingTask = (task: SidebarTask) =>
  includesAny(normalizedTaskText(task), ['anti cheat', 'anti-cheat', 'cheat', 'proctor', 'suspicious', 'anomaly']);

const isGenerationTask = (task: SidebarTask) =>
  task.task_category === 'question_import' && normalizedTaskText(task).includes('generative');

const isExtractionTask = (task: SidebarTask) =>
  task.task_category === 'question_import' &&
  (normalizedTaskText(task).includes('extraction') || normalizedTaskText(task).includes('csv'));

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [runningTasks, setRunningTasks] = useState<SidebarTask[]>([]);
  const [showTaskCategoryPopover, setShowTaskCategoryPopover] = useState(false);
  const taskPopoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserRole(user.role?.toLowerCase());
      } catch (e) {
        console.error("Failed to parse user from local storage", e);
      }
    }

    const fetchNotifications = async () => {
      try {
        const notifications = await api.recruiter.getNotifications();
        const count = notifications.filter((n: any) => !n.is_read).length;
        setUnreadCount(count);
      } catch (error) {
        console.error('Failed to fetch notifications count:', error);
      }
    };

    // Initial fetch
    fetchNotifications();

    // Set up polling every 30 seconds
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (userRole !== 'technical') return;

    const fetchRunningTasks = async () => {
      try {
        const tasks = await api.recruiter.getBackgroundTasks();
        const running = (tasks || []).filter((task: SidebarTask) => {
          const status = String(task.status || '').toLowerCase();
          return status === 'pending' || status === 'processing';
        });
        setRunningTasks(running);
      } catch (error) {
        console.error('Failed to fetch running background tasks:', error);
      }
    };

    fetchRunningTasks();
    const interval = setInterval(fetchRunningTasks, 10000);
    return () => clearInterval(interval);
  }, [userRole]);

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (!taskPopoverRef.current) return;
      if (!taskPopoverRef.current.contains(event.target as Node)) {
        setShowTaskCategoryPopover(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  useEffect(() => {
    setShowTaskCategoryPopover(false);
  }, [location.pathname]);

  const runningTaskCounts = useMemo(() => {
    const videoTasks = runningTasks.filter((task) => task.task_category === 'video');
    const questionImportTasks = runningTasks.filter((task) => task.task_category === 'question_import');

    const profileTasks = questionImportTasks.filter((task) => !isGenerationTask(task) && !isExtractionTask(task));
    const questionGenerationAndExtraction = questionImportTasks.filter((task) => isGenerationTask(task) || isExtractionTask(task));

    return {
      total: runningTasks.length,
      videoProcessing: videoTasks.filter((task) => !isAntiCheatingTask(task)).length,
      profileProcessing: profileTasks.length,
      videoRecording: videoTasks.filter((task) => isAntiCheatingTask(task)).length,
      questionGenerationExtraction: questionGenerationAndExtraction.length,
    };
  }, [runningTasks]);

  const isBackgroundTasksRoute = location.pathname.startsWith('/recruiter/background-tasks');

  const getLinkClass = (isActive: boolean) =>
    `w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isActive
      ? "bg-indigo-50 text-indigo-600"
      : "text-gray-400 hover:bg-gray-50"
    }`;

  return (
    <div className="fixed left-0 top-0 h-full w-20 bg-white border-r border-gray-200 flex flex-col items-center gap-8 rounded-r-3xl py-8 z-[100] shadow-xl">
      <div className="flex-1 flex flex-col gap-4 w-full items-center justify-center">

        {/* Home Button */}
        <NavLink to="/recruiter/dashboard" className={({ isActive }) => getLinkClass(isActive)} title="Home">
          <Home size={24} />
        </NavLink>

        {/* Projects Button */}
        <NavLink to="/recruiter/projects" className={({ isActive }) => getLinkClass(isActive)} title="Projects">
          <Briefcase size={24} />
        </NavLink>

        {/* Alerts Button */}
        <NavLink to="/recruiter/alerts" className={({ isActive }) => getLinkClass(isActive)} title="Alerts">
          <div className="relative">
            <Bell size={24} />
            {unreadCount > 0 && (
              <div className="absolute -top-1 -right-1 w-[14px] h-[14px] rounded-full bg-[#ef4444] flex items-center justify-center">
                <span className="font-['Arimo',sans-serif] text-[8px] text-white font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
              </div>
            )}
          </div>
        </NavLink>

        {/* Candidates Button */}
        <NavLink to="/recruiter/candidates" className={({ isActive }) => getLinkClass(isActive)} title="Candidates">
          <Users size={24} />
        </NavLink>

        {/* Question Bank Button - Technical Only */}
        {userRole === 'technical' && (
          <NavLink to="/recruiter/question-bank" className={({ isActive }) => getLinkClass(isActive)} title="Question Bank">
            <BookOpen size={24} />
          </NavLink>
        )}

        {/* Reviews Button - Technical Only */}
        {userRole === 'technical' && (
          <NavLink to="/recruiter/reviews" className={({ isActive }) => getLinkClass(isActive)} title="Reviews">
            <div className="relative">
              <ClipboardCheck size={24} />
            </div>
          </NavLink>
        )}

        {/* Suspicious Assessment - Technical Only */}
        {userRole === 'technical' && (
          <NavLink to="/recruiter/suspicious-activity" className={({ isActive }) => getLinkClass(isActive)} title="Suspicious Assessment">
            <AlertTriangle size={24} />
          </NavLink>
        )}

        {/* Background Tasks - Technical Only */}
        {userRole === 'technical' && (
          <div className="relative" ref={taskPopoverRef}>
            <button
              onClick={() => setShowTaskCategoryPopover((prev) => !prev)}
              className={getLinkClass(isBackgroundTasksRoute)}
              title="Background Tasks"
            >
              <div className="relative">
                <Activity size={24} />
                {runningTaskCounts.total > 0 && (
                  <div className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-[#ef4444] flex items-center justify-center">
                    <span className="font-['Arimo',sans-serif] text-[9px] text-white font-bold leading-none">
                      {runningTaskCounts.total > 99 ? '99+' : runningTaskCounts.total}
                    </span>
                  </div>
                )}
              </div>
            </button>

            {showTaskCategoryPopover && (
              <div className="absolute left-[64px] top-1/2 -translate-y-1/2 w-[290px] rounded-[14px] border border-[#e5e7eb] bg-white shadow-xl p-3 z-[130]">
                <div className="px-2 py-1.5 border-b border-[#f1f5f9] mb-2">
                  <div className="text-[13px] font-semibold text-[#111827] font-['Arimo',sans-serif]">Running Background Tasks</div>
                  <div className="text-[12px] text-[#6b7280] font-['Arimo',sans-serif]">Total running: {runningTaskCounts.total}</div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between px-2 py-2 rounded-[10px] bg-[#f8fafc]">
                    <div className="flex items-center gap-2 text-[13px] text-[#334155]">
                      <Video size={14} />
                      <span>Video Processing</span>
                    </div>
                    <span className="text-[13px] font-semibold text-[#111827]">{runningTaskCounts.videoProcessing}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-2 rounded-[10px] bg-[#f8fafc]">
                    <div className="flex items-center gap-2 text-[13px] text-[#334155]">
                      <User size={14} />
                      <span>Profile Processing</span>
                    </div>
                    <span className="text-[13px] font-semibold text-[#111827]">{runningTaskCounts.profileProcessing}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-2 rounded-[10px] bg-[#f8fafc]">
                    <div className="flex items-center gap-2 text-[13px] text-[#334155]">
                      <ShieldAlert size={14} />
                      <span>Processing Video Recording</span>
                    </div>
                    <span className="text-[13px] font-semibold text-[#111827]">{runningTaskCounts.videoRecording}</span>
                  </div>
                  <div className="flex items-center justify-between px-2 py-2 rounded-[10px] bg-[#f8fafc]">
                    <div className="flex items-center gap-2 text-[13px] text-[#334155]">
                      <WandSparkles size={14} />
                      <span>Question Generation & Extraction</span>
                    </div>
                    <span className="text-[13px] font-semibold text-[#111827]">{runningTaskCounts.questionGenerationExtraction}</span>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setShowTaskCategoryPopover(false);
                    navigate('/recruiter/background-tasks/categories');
                  }}
                  className="mt-3 w-full h-[36px] rounded-[10px] border border-[#dbeafe] bg-[#eff6ff] text-[#1d4ed8] text-[13px] font-medium flex items-center justify-center gap-2 hover:bg-[#dbeafe] transition-colors"
                >
                  <span>Open Background Tasks</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* Settings Button */}
        <NavLink to="/recruiter/settings" className={({ isActive }) => getLinkClass(isActive)} title="Settings">
          <Settings size={24} />
        </NavLink>
      </div>

      {/* Sign Out */}
      <button
        onClick={async () => {
          await authService.logout();
          window.location.href = '/recruiter/login';
        }}
        className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        title="Sign Out"
      >
        <LogOut size={24} />
      </button>

    </div>
  );
}
