import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api';

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await authApi.login(username, password);
      localStorage.setItem('master_token', data.access_token);
      localStorage.setItem('master_user', username);
      navigate('/organizations');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#EDF0F8' }}>
      {/* Header */}
      <div className="px-12 py-5 flex items-center border-b border-gray-200 bg-white">
        <span className="text-xl font-bold text-primary tracking-tight">EraMatch</span>
        <span className="ml-2 text-sm text-gray-400 font-medium">Master Portal</span>
      </div>

      {/* Center card */}
      <div className="flex-1 flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl p-8 shadow-2xl">
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
              style={{ backgroundColor: '#EEF2FF' }}
            >
              <ShieldCheck size={32} style={{ color: '#6366F1' }} />
            </div>

            <h1 className="text-3xl font-semibold text-center mb-2 text-gray-900">Master Admin</h1>
            <p className="text-gray-500 text-center mb-8 text-sm">EraMatch system administration portal</p>

            {error && (
              <div className="mb-5 p-4 rounded-xl bg-red-50 border border-red-200">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  required
                  className="w-full h-11 px-4 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    className="w-full h-11 px-4 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((p) => !p)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-xl text-white text-sm font-semibold transition-colors"
                style={{ backgroundColor: loading ? '#9CA3AF' : '#6366F1', cursor: loading ? 'not-allowed' : 'pointer' }}
                onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#4F46E5'; }}
                onMouseLeave={(e) => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#6366F1'; }}
              >
                {loading ? 'Signing In...' : 'Sign In'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
