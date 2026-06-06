import { Navigate, Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  const token = localStorage.getItem('master_token');
  if (!token) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-[#edf0f8]">
      <Sidebar />
      <main className="ml-[72px] p-8 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
