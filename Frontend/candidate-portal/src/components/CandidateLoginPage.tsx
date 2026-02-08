import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { ArrowLeft, Loader2 } from 'lucide-react';
import logo from '../imports/image-eramatch.png';
import { api } from '../services/api';

interface CandidateLoginPageProps {
  onBack: () => void;
  onSignIn: () => void;
}

export function CandidateLoginPage({ onBack, onSignIn }: CandidateLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      await api.auth.login(email, password);
      onSignIn();
    } catch (err) {
      setError('Invalid email or password');
      console.error('Login failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#EDF0F8' }}>
      {/* Back to Home Button - Small, positioned in top-left */}
      <Button
        variant="ghost"
        className="absolute top-6 left-6 rounded-full px-4 py-2 text-sm flex items-center gap-2 text-gray-600 hover:text-gray-900 hover:bg-white/50"
        onClick={onBack}
      >
        <ArrowLeft size={16} />
        Back to Home
      </Button>

      <div className="w-full max-w-lg px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <img src={logo} alt="ERAMATCH - A Smarter Recruitment System" className="h-14 mx-auto" />
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-gray-700 mb-2">Candidate Login</h1>
            <p className="text-gray-500">Sign in to access your assessments</p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSignIn} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-gray-700">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full"
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-gray-700">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full"
                required
                disabled={isLoading}
              />
            </div>

            <Button
              type="submit"
              className="w-full text-white rounded-full flex items-center justify-center gap-2"
              style={{ backgroundColor: '#6366F1' }}
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          {/* Dev hint */}
          <p className="mt-4 text-xs text-gray-400 text-center">
            Test: amy18@example.org / candidate123
          </p>
        </div>
      </div>
    </div>
  );
}
