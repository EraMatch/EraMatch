import { useState } from 'react';
import { ArrowLeft, Shield } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import logo from '../../imports/image-eramatch.png';
import { api } from '../../services/api';

interface AdminLoginPageProps {
  onBack: () => void;
  onSignIn: () => void;
}

export function AdminLoginPage({ onBack, onSignIn }: AdminLoginPageProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.auth.login(email, password);
      onSignIn();
    } catch (error) {
      alert('Invalid credentials. Please use:\nEmail: admin@eramatch.com\nPassword: admin123');
    }
  };

  const useDemoCredentials = () => {
    setEmail('admin@eramatch.com');
    setPassword('admin123');
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

            {/* Demo Credentials Info */}
            <div className="mb-6 p-4 rounded-xl" style={{ backgroundColor: '#FEF3C7' }}>
              <p className="text-sm mb-2" style={{ color: '#92400E' }}>
                <strong>Demo Credentials:</strong>
              </p>
              <p className="text-xs mb-1" style={{ color: '#92400E' }}>
                Email: admin@eramatch.com
              </p>
              <p className="text-xs mb-3" style={{ color: '#92400E' }}>
                Password: admin123
              </p>
              <Button
                type="button"
                className="w-full rounded-lg py-2 text-xs transition-colors duration-200"
                style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#D97706';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '#F59E0B';
                }}
                onClick={useDemoCredentials}
              >
                Use Demo Credentials
              </Button>
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
