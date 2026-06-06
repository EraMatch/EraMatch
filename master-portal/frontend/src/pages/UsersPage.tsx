import { Plus, UserX } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type MasterUser, usersApi } from '../api';
import Modal from '../components/Modal';

export default function UsersPage() {
  const [users, setUsers] = useState<MasterUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: '', password: '', confirm: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const currentUser = localStorage.getItem('master_user');

  async function load() {
    try {
      setUsers(await usersApi.list());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (form.password !== form.confirm) { setFormError('Passwords do not match'); return; }
    if (form.password.length < 4) { setFormError('Password must be at least 4 characters'); return; }
    setSaving(true);
    try {
      const user = await usersApi.create(form.username, form.password);
      setUsers((u) => [...u, user]);
      setShowAdd(false);
      setForm({ username: '', password: '', confirm: '' });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: number) {
    if (!confirm('Deactivate this user?')) return;
    await usersApi.deactivate(id);
    setUsers((u) => u.map((x) => x.id === id ? { ...x, is_active: false } : x));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Portal Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage master portal admin accounts</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 h-10 px-4 rounded-xl text-white text-sm font-semibold transition-colors"
          style={{ backgroundColor: '#6366F1' }}
          onMouseEnter={(e) => ((e.target as HTMLElement).style.backgroundColor = '#4F46E5')}
          onMouseLeave={(e) => ((e.target as HTMLElement).style.backgroundColor = '#6366F1')}
        >
          <Plus size={16} /> Add User
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Username</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Created</th>
                <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900">
                    {u.username}
                    {u.username === currentUser && (
                      <span className="ml-2 text-xs bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full">You</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-500">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      u.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {u.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {u.is_active && u.username !== currentUser && (
                      <button
                        onClick={() => handleDeactivate(u.id)}
                        className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                        title="Deactivate"
                      >
                        <UserX size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && (
        <Modal title="Add Portal User" onClose={() => { setShowAdd(false); setFormError(''); setForm({ username: '', password: '', confirm: '' }); }}>
          {formError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{formError}</div>}
          <form onSubmit={handleAdd} className="space-y-4">
            {[
              { key: 'username', label: 'Username', type: 'text' },
              { key: 'password', label: 'Password', type: 'password' },
              { key: 'confirm', label: 'Confirm Password', type: 'password' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input
                  type={type}
                  value={form[key as keyof typeof form]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  required
                  className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setShowAdd(false)} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors">Cancel</button>
              <button type="submit" disabled={saving}
                className="flex-1 h-10 rounded-xl text-white text-sm font-semibold transition-colors"
                style={{ backgroundColor: saving ? '#9CA3AF' : '#6366F1' }}
              >
                {saving ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
