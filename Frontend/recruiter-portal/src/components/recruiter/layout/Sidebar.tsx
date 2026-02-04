import { Home, Briefcase, Users, Settings, Bell, BookOpen, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

export function Sidebar() {
  const navigate = useNavigate();

  const getLinkClass = (isActive: boolean) =>
    `relative rounded-[24px] h-[64px] w-[64px] flex items-center justify-center transition-all duration-300 overflow-hidden ${isActive ? 'bg-[#dad3ff]' : 'hover:bg-[#ede9ff]'
    } group-hover:w-[188px] group-hover:justify-start group-hover:px-[16px]`;

  const getLabelClass = (isActive: boolean) =>
    `absolute left-[80px] font-['Arimo',sans-serif] text-[16px] leading-[24px] text-[#4834AB] whitespace-nowrap opacity-0 group-hover:opacity-100 group-hover:relative group-hover:left-0 group-hover:ml-[12px] transition-all duration-300 ${isActive ? 'font-medium' : ''
    }`;

  return (
    <div
      className="fixed left-0 top-0 h-full w-[96px] hover:w-[220px] bg-[#f7fafe] flex flex-col items-center gap-[16px] rounded-br-[24px] rounded-tr-[24px] transition-all duration-300 ease-in-out group z-50 overflow-hidden shadow-sm pt-8"
    >
      <div className="flex-1 flex flex-col gap-[16px] w-full items-center justify-center">

        {/* Home Button */}
        <NavLink to="/recruiter/dashboard" className={({ isActive }) => getLinkClass(isActive)}>
          {({ isActive }) => (
            <>
              <Home size={32} className="text-[#4834AB] shrink-0" strokeWidth={2} />
              <span className={getLabelClass(isActive)}>Home</span>
            </>
          )}
        </NavLink>
        {/* Projects Button */}
        <NavLink to="/recruiter/projects" className={({ isActive }) => getLinkClass(isActive)}>
          {({ isActive }) => (
            <>
              <Briefcase size={32} className="text-[#4834AB] shrink-0" strokeWidth={2} />
              <span className={getLabelClass(isActive)}>Projects</span>
            </>
          )}
        </NavLink>

        {/* Alerts Button */}
        <NavLink to="/recruiter/alerts" className={({ isActive }) => getLinkClass(isActive)}>
          {({ isActive }) => (
            <>
              <div className="relative">
                <Bell size={32} className="text-[#4834AB] shrink-0" strokeWidth={2} />
                <div className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-[#ef4444] flex items-center justify-center">
                  <span className="font-['Arimo',sans-serif] text-[10px] text-white">3</span>
                </div>
              </div>
              <span className={getLabelClass(isActive)}>Alerts</span>
            </>
          )}
        </NavLink>

        {/* Candidates Button */}
        <NavLink to="/recruiter/candidates" className={({ isActive }) => getLinkClass(isActive)}>
          {({ isActive }) => (
            <>
              <Users size={32} className="text-[#4834AB] shrink-0" strokeWidth={2} />
              <span className={getLabelClass(isActive)}>Candidates</span>
            </>
          )}
        </NavLink>

        {/* Question Bank Button */}
        <NavLink to="/recruiter/question-bank" className={({ isActive }) => getLinkClass(isActive)}>
          {({ isActive }) => (
            <>
              <BookOpen size={32} className="text-[#4834AB] shrink-0" strokeWidth={2} />
              <span className={getLabelClass(isActive)}>Question Bank</span>
            </>
          )}
        </NavLink>

        {/* Settings Button */}
        <NavLink to="/recruiter/settings" className={({ isActive }) => getLinkClass(isActive)}>
          {({ isActive }) => (
            <>
              <Settings size={32} className="text-[#4834AB] shrink-0" strokeWidth={2} />
              <span className={getLabelClass(isActive)}>Settings</span>
            </>
          )}
        </NavLink>
      </div>

      {/* Sign Out - Simplified */}
      <div className="mb-8 w-full flex flex-col items-center gap-4">
        <button
          onClick={() => {
            // Sign out logic 
            navigate('/recruiter/login');
          }}
          className="w-[64px] h-[64px] rounded-[24px] flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors group-hover:w-[188px] group-hover:justify-start group-hover:px-[16px]"
        >
          <LogOut size={24} className="shrink-0" />
          <span className="hidden group-hover:block ml-3 font-medium text-sm whitespace-nowrap">Sign Out</span>
        </button>
      </div>

    </div>
  );
}