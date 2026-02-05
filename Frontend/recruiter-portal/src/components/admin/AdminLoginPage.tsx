import { useState } from 'react';
import { ArrowLeft, Shield, Eye, EyeOff } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import logo from '../../imports/image-eramatch.png';
import { api } from '../../services/api';

interface AdminLoginPageProps {
  onBack: () => void;
  onSignIn: () => void;
  onForgotPassword: () => void;
}

export function AdminLoginPage({ onBack, onSignIn, onForgotPassword }: AdminLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api.auth.adminLogin(email, password);
      onSignIn();
    } catch (err: any) {
      setError('The email or password you entered is incorrect. Please try again.');
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
              style={{ backgroundColor: '#FEF3C7' }}
            >
              <Shield size={32} style={{ color: '#F59E0B' }} />
            </div>

            {/* Title */}
            <h1 className="text-3xl text-center mb-2" style={{ color: '#1F2937' }}>
              Admin Gateway
            </h1>
            <p className="text-gray-600 text-center mb-8">
              Sign in to access the admin portal
            </p>

            {/* Error Message */}
            {error && (
              <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100">
                <p className="text-sm text-red-600 text-center">
                  {error}
                </p>
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
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full rounded-xl py-4 text-base transition-colors duration-200"
                style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#D97706';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F59E0B';
                }}
              >
                Sign In as Admin
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={onForgotPassword}
                  className="text-sm font-medium hover:underline transition-colors"
                  style={{ color: '#F59E0B' }}
                >
                  Forgot Password?
                </button>
              </div>
            </form>

            {/* Additional Info */}
            {/* <p className="text-xs text-gray-500 text-center mt-6">
              Please contact your organization administrator if you have lost your credentials.
            </p> */}
          </div>
        </div>
      </div>
    </div>
  );
}
