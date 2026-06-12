import { Building2, Key, LogOut, Users } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

const navItems = [
  { to: '/organizations', icon: Building2, label: 'Organizations' },
  { to: '/users', icon: Users, label: 'Users' },
  { to: '/settings', icon: Key, label: 'Change Password' },
];

export default function Sidebar() {
  const navigate = useNavigate();

  function handleLogout() {
    localStorage.removeItem('master_token');
    localStorage.removeItem('master_user');
    navigate('/login');
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-[72px] bg-white border-r border-gray-200 shadow-sm flex flex-col items-center py-6 z-40">
      {/* Logo mark */}
      <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center mb-8 shrink-0">
        <Building2 size={20} className="text-white" />
      </div>

      {/* Nav items */}
      <nav className="flex flex-col items-center gap-2 flex-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            className={({ isActive }) =>
              `w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
                isActive ? 'bg-primary-light text-primary' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'
              }`
            }
          >
            <Icon size={22} />
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <button
        onClick={handleLogout}
        title="Sign Out"
        className="w-12 h-12 rounded-xl flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
      >
        <LogOut size={22} />
      </button>
    </aside>
  );
}
