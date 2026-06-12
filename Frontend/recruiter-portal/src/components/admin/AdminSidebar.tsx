import { useState, useEffect } from "react";
import {
  Users,
  Settings,
  LayoutDashboard,
  UserCog,
  Archive,
  CreditCard,
  LogOut,

  ClipboardCheck,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { authService } from "../../services/auth.service";

export function AdminSidebar() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const parsedUser = JSON.parse(userStr);
        setUser(parsedUser);
      } catch (e) {
        console.error("Failed to parse user from local storage", e);
      }
    }
  }, []);

  const getLinkClass = (isActive: boolean) =>
    `w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isActive
      ? "bg-indigo-50 text-indigo-600"
      : "text-gray-400 hover:bg-gray-50"
    }`;

  return (
    <div className="fixed left-0 top-0 h-full w-20 bg-white border-r border-gray-200 flex flex-col items-center gap-6 rounded-r-3xl py-8 z-[100] shadow-xl">

      {/* Profile & Role Badge Section */}
      {user && (
        <div className="flex flex-col items-center gap-1.5 pb-4 border-b border-gray-100 w-full px-2">
          <div className="relative group cursor-pointer">
            {/* Avatar Container */}
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center border-2 shadow-sm font-semibold text-sm transition-all duration-300 border-indigo-500 bg-indigo-50 text-indigo-700 hover:bg-indigo-100">
              {user.avatar_url ? (
                <img src={user.avatar_url} alt="Profile" className="w-full h-full rounded-2xl object-cover" />
              ) : (
                <span>
                  {((user.first_name?.[0] || '') + (user.last_name?.[0] || '')).toUpperCase() || 'AD'}
                </span>
              )}
            </div>

            {/* Role indicator status dot */}
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-sm flex items-center justify-center bg-indigo-500" />
          </div>

          {/* Role text badge */}
          <div className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider text-center bg-indigo-50 text-indigo-600 border border-indigo-200"
               title={`${user.first_name || ''} ${user.last_name || ''} (${user.email || ''})`}
          >
            Admin
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-4 w-full items-center justify-center">
        <NavLink to="/admin/dashboard" className={({ isActive }) => getLinkClass(isActive)} title="Dashboard">
          <LayoutDashboard size={24} />
        </NavLink>



        <NavLink to="/admin/requests" className={({ isActive }) => getLinkClass(isActive)} title="Projects & Positions">
          <ClipboardCheck size={24} />
        </NavLink>


        <NavLink to="/admin/members" className={({ isActive }) => getLinkClass(isActive)} title="Organization Members">
          <Users size={24} />
        </NavLink>

        <NavLink to="/admin/delegation" className={({ isActive }) => getLinkClass(isActive)} title="Recruiter Delegation">
          <UserCog size={24} />
        </NavLink>

        <NavLink to="/admin/closed-positions" className={({ isActive }) => getLinkClass(isActive)} title="Closed Positions">
          <Archive size={24} />
        </NavLink>

        <NavLink to="/admin/settings" className={({ isActive }) => getLinkClass(isActive)} title="Settings">
          <Settings size={24} />
        </NavLink>
      </div>

      {/* Sign Out */}
      <button
        onClick={async () => {
          await authService.logout();
          window.location.href = '/admin/login';
        }}
        className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        title="Sign Out"
      >
        <LogOut size={24} />
      </button>

    </div>
  );
}