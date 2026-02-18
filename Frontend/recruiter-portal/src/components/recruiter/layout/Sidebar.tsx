import { useState, useEffect } from 'react';
import { Home, Briefcase, Users, Settings, Bell, BookOpen, LogOut, ClipboardCheck } from 'lucide-react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../../services/api';

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [userRole, setUserRole] = useState<string | null>(null);

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

        {/* Question Bank Button */}
        <NavLink to="/recruiter/question-bank" className={({ isActive }) => getLinkClass(isActive)} title="Question Bank">
          <BookOpen size={24} />
        </NavLink>

        {/* Reviews Button - Technical Only */}
        {userRole === 'technical' && (
          <NavLink to="/recruiter/reviews" className={({ isActive }) => getLinkClass(isActive)} title="Reviews">
            <div className="relative">
              <ClipboardCheck size={24} />
            </div>
          </NavLink>
        )}

        {/* Settings Button */}
        <NavLink to="/recruiter/settings" className={({ isActive }) => getLinkClass(isActive)} title="Settings">
          <Settings size={24} />
        </NavLink>
      </div>

      {/* Sign Out */}
      <button
        onClick={() => navigate('/recruiter/login')}
        className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        title="Sign Out"
      >
        <LogOut size={24} />
      </button>

    </div>
  );
}
