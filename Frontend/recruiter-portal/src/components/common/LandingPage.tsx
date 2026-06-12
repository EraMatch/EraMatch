import { Users, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import { Logo } from './Logo';

interface LandingPageProps {
  onAdminLogin: () => void;
  onRecruiterLogin: () => void;
}

export function LandingPage({ onAdminLogin, onRecruiterLogin }: LandingPageProps) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#EDF0F8' }}>
      {/* Navigation */}
      <nav className="px-12 py-6 flex items-center justify-center border-b border-gray-200 bg-white">
        <Logo size="md" />
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-12 py-24">
        <div className="text-center max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold mb-4" style={{ color: '#1F2937' }}>
            Welcome to EraMatch
          </h1>
          <p className="text-xl text-gray-600 mb-12">
            AI-Powered Recruitment Platform for Smarter Hiring
          </p>

          <div className="grid grid-cols-2 gap-6 max-w-lg mx-auto">
            {/* Admin Login Card */}
            <div
              className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 border-transparent hover:border-amber-500"
              onClick={onAdminLogin}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#FEF3C7' }}>
                <Shield size={32} style={{ color: '#F59E0B' }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: '#1F2937' }}>Admin</h3>
              <p className="text-gray-600 text-sm mb-4">
                Manage organization, members, and settings
              </p>
              <Button
                className="w-full rounded-full py-3 transition-colors duration-200"
                style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}
              >
                Admin Login
              </Button>
            </div>

            {/* Recruiter Login Card */}
            <div
              className="bg-white rounded-2xl p-8 shadow-lg hover:shadow-xl transition-all cursor-pointer border-2 border-transparent hover:border-indigo-500"
              onClick={onRecruiterLogin}
            >
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#EEF2FF' }}>
                <Users size={32} style={{ color: '#6366F1' }} />
              </div>
              <h3 className="text-xl font-semibold mb-2" style={{ color: '#1F2937' }}>Recruiter</h3>
              <p className="text-gray-600 text-sm mb-4">
                Manage projects, candidates, and interviews
              </p>
              <Button
                className="w-full rounded-full py-3 transition-colors duration-200"
                style={{ backgroundColor: '#6366F1', color: '#FFFFFF' }}
              >
                Recruiter Login
              </Button>
            </div>
          </div>

          <p className="text-gray-500 mt-8 text-sm">
            Looking for the candidate portal? <a href="http://localhost:5174" className="text-indigo-600 hover:underline">Click here</a>
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="px-12 py-6 text-center border-t border-gray-200 bg-white">
        <p className="text-gray-600 text-sm">
          © 2025 ERAMATCH. A Smarter Recruitment System.
        </p>
      </footer>
    </div>
  );
}