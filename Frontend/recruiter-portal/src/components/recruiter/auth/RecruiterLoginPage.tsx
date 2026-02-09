import { useState } from 'react';
import { ArrowLeft, Briefcase } from 'lucide-react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import logo from '../../../assets/image-eramatch.png';

interface RecruiterLoginPageProps {
  onBack: () => void;
  onSignIn: (recruiterType: 'recruiter' | 'technical') => void;
  onForgotPassword: () => void;
}

export function RecruiterLoginPage({ onBack, onSignIn, onForgotPassword }: RecruiterLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Call the backend API
      const response = await fetch('http://localhost:8000/api/v1/auth/organization-user/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Invalid credentials' }));
        throw new Error(errorData.detail || 'Login failed');
      }

      const data = await response.json();

      // Store token and user info in localStorage
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));

      // Route based on role
      const role = data.user.role.toLowerCase();
      if (role === 'hr') {
        onSignIn('recruiter');
      } else if (role === 'technical') {
        onSignIn('technical');
      } else {
        throw new Error('Invalid user role');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during login');
    } finally {
      setIsLoading(false);
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

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

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
                disabled={isLoading}
                className="w-full rounded-xl py-4 text-base transition-colors duration-200"
                style={{
                  backgroundColor: isLoading ? '#9CA3AF' : '#6366F1',
                  color: '#FFFFFF',
                  cursor: isLoading ? 'not-allowed' : 'pointer'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#4F46E5';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.currentTarget.style.backgroundColor = '#6366F1';
                  }
                }}
              >
                {isLoading ? 'Signing In...' : 'Sign In as Recruiter'}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-sm font-medium hover:underline transition-colors"
                  style={{ color: '#6366F1' }}
                >
                  Forgot Password?
                </button>
              </div>
            </form>

            {/* Additional Info */}
            <p className="text-xs text-gray-500 text-center mt-6">
              Sign in with your organization user credentials.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}