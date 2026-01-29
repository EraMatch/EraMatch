import {
  Users,
  Settings,
  LayoutDashboard,
  UserCog,
  Archive,
  CreditCard,
  LogOut,
} from "lucide-react";
import { NavLink } from "react-router-dom";

export function AdminSidebar() {
  const getLinkClass = (isActive: boolean) =>
    `w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${isActive
      ? "bg-indigo-50 text-indigo-600"
      : "text-gray-400 hover:bg-gray-50"
    }`;

  return (
    <div className="fixed left-0 top-0 h-full w-20 bg-white border-r border-gray-200 flex flex-col items-center gap-8 rounded-r-3xl py-8">

      <div className="flex-1 flex flex-col gap-4 w-full items-center justify-center">
        <NavLink to="/admin/dashboard" className={({ isActive }) => getLinkClass(isActive)} title="Dashboard">
          <LayoutDashboard size={24} />
        </NavLink>

        <NavLink to="/admin/subscription" className={({ isActive }) => getLinkClass(isActive)} title="Subscription Management">
          <CreditCard size={24} />
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
        onClick={() => window.location.href = '/admin/login'}
        className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
        title="Sign Out"
      >
        <LogOut size={24} />
      </button>

    </div>
  );
}