import { useState } from 'react';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import logo from '../../../assets/image-eramatch.png';

interface RecruiterLoginPageProps {
  onBack: () => void;
  onSignIn: (recruiterType: 'recruiter' | 'technical') => void;
}

export function RecruiterLoginPage({ onBack, onSignIn }: RecruiterLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Demo credentials check
    if (email === 'recruiter@eramatch.com' && password === 'recruiter123') {
      onSignIn('recruiter');
    } else if (email === 'technical@eramatch.com' && password === 'technical123') {
      onSignIn('technical');
    } else {
      alert('Invalid credentials. Please use:\n\nHR Recruiter:\nEmail: recruiter@eramatch.com\nPassword: recruiter123\n\nTechnical Recruiter:\nEmail: technical@eramatch.com\nPassword: technical123');
    }
  };

  const useDemoCredentials = (type: 'recruiter' | 'technical') => {
    if (type === 'recruiter') {
      setEmail('recruiter@eramatch.com');
      setPassword('recruiter123');
    } else {
      setEmail('technical@eramatch.com');
      setPassword('technical123');
    }
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#EDF0F8' }}>
      {/* Header */}
      <div className="px-12 py-6 flex items-center justify-between border-b border-gray-200 bg-white">
        <img src={logo} alt="ERAMATCH" className="h-12" />
        <Button
          variant="ghost"
          className="rounded-full px-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
          onClick={onBack}
        >
          <ArrowLeft size={18} />
          Back to Home
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center px-12 py-16">
        <div className="w-full max-w-md">
          {/* Login Card */}
          <div className="bg-white rounded-3xl p-8 shadow-2xl">
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: '#EEF2FF' }}
            >
              <Briefcase size={32} style={{ color: '#6366F1' }} />
            </div>

            {/* Title */}
            <h1 className="text-3xl text-center mb-2" style={{ color: '#1F2937' }}>
              Recruiter Portal
            </h1>
            <p className="text-gray-600 text-center mb-8">
              Sign in to access the recruiter dashboard
            </p>

            {/* Demo Credentials Info */}
            <div className="mb-6 space-y-3">
              {/* HR Recruiter Credentials */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: '#EEF2FF' }}>
                <p className="text-sm mb-2" style={{ color: '#312E81' }}>
                  <strong>HR Recruiter:</strong>
                </p>
                <p className="text-xs mb-1" style={{ color: '#312E81' }}>
                  Email: recruiter@eramatch.com
                </p>
                <p className="text-xs mb-3" style={{ color: '#312E81' }}>
                  Password: recruiter123
                </p>
                <Button
                  type="button"
                  className="w-full rounded-lg py-2 text-xs transition-colors duration-200"
                  style={{ backgroundColor: '#6366F1', color: '#FFFFFF' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#4F46E5';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#6366F1';
                  }}
                  onClick={() => useDemoCredentials('recruiter')}
                >
                  Use HR Recruiter Credentials
                </Button>
              </div>

              {/* Technical Recruiter Credentials */}
              <div className="p-4 rounded-xl" style={{ backgroundColor: '#D1FAE5' }}>
                <p className="text-sm mb-2" style={{ color: '#065F46' }}>
                  <strong>Technical Recruiter:</strong>
                </p>
                <p className="text-xs mb-1" style={{ color: '#065F46' }}>
                  Email: technical@eramatch.com
                </p>
                <p className="text-xs mb-3" style={{ color: '#065F46' }}>
                  Password: technical123
                </p>
                <Button
                  type="button"
                  className="w-full rounded-lg py-2 text-xs transition-colors duration-200"
                  style={{ backgroundColor: '#10B981', color: '#FFFFFF' }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#059669';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#10B981';
                  }}
                  onClick={() => useDemoCredentials('technical')}
                >
                  Use Technical Recruiter Credentials
                </Button>
              </div>
            </div>

            {/* Login Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <Label htmlFor="email" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full rounded-lg"
                  required
                />
              </div>

              <div>
                <Label htmlFor="password" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full rounded-lg"
                  required
                />
              </div>

              <Button
                type="submit"
                className="w-full rounded-xl py-4 text-base transition-colors duration-200"
                style={{ backgroundColor: '#6366F1', color: '#FFFFFF' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#4F46E5';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#6366F1';
                }}
              >
                Sign In as Recruiter
              </Button>
            </form>

            {/* Additional Info */}
            <p className="text-xs text-gray-500 text-center mt-6">
              This is a demonstration portal. Use the demo credentials provided above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}