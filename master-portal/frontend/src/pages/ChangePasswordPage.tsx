import { Eye, EyeOff, KeyRound } from 'lucide-react';
import { useState } from 'react';
import { authApi } from '../api';

export default function ChangePasswordPage() {
  const [form, setForm] = useState({ old_password: '', new_password: '', confirm: '' });
  const [show, setShow] = useState({ old: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function toggle(field: 'old' | 'new' | 'confirm') {
    setShow((s) => ({ ...s, [field]: !s[field] }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (form.new_password !== form.confirm) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (form.new_password.length < 4) {
      setMessage({ type: 'error', text: 'New password must be at least 4 characters' });
      return;
    }
    setLoading(true);
    try {
      await authApi.changePassword(form.old_password, form.new_password);
      setMessage({ type: 'success', text: 'Password changed successfully' });
      setForm({ old_password: '', new_password: '', confirm: '' });
    } catch (err: unknown) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to change password' });
    } finally {
      setLoading(false);
    }
  }

  const fields = [
    { key: 'old_password', label: 'Current Password', showKey: 'old' as const },
    { key: 'new_password', label: 'New Password', showKey: 'new' as const },
    { key: 'confirm', label: 'Confirm New Password', showKey: 'confirm' as const },
  ];

  return (
    <div className="max-w-md mx-auto mt-12">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary-light flex items-center justify-center">
            <KeyRound size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Change Password</h1>
            <p className="text-xs text-gray-500">Update your master portal password</p>
          </div>
        </div>

        {message && (
          <div className={`mb-5 p-4 rounded-xl border text-sm ${
            message.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-600'
          }`}>
            {message.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {fields.map(({ key, label, showKey }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
              <div className="relative">
                <input
                  type={show[showKey] ? 'text' : 'password'}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required
                  placeholder={`Enter ${label.toLowerCase()}`}
                  className="w-full h-11 px-4 pr-10 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition"
                />
                <button
                  type="button"
                  onClick={() => toggle(showKey)}
                  className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {show[showKey] ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          ))}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-11 rounded-xl text-white text-sm font-semibold mt-2 transition-colors"
            style={{ backgroundColor: loading ? '#9CA3AF' : '#6366F1', cursor: loading ? 'not-allowed' : 'pointer' }}
            onMouseEnter={(e) => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#4F46E5'; }}
            onMouseLeave={(e) => { if (!loading) (e.target as HTMLButtonElement).style.backgroundColor = '#6366F1'; }}
          >
            {loading ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
