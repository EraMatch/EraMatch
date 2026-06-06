import { Archive, Edit2, Plus, RefreshCw, Search, UserCog } from 'lucide-react';
import { useEffect, useState } from 'react';
import { type Organization, orgsApi } from '../api';
import Modal from '../components/Modal';

type Tab = 'active' | 'archived';

export default function OrganizationsPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');

  // Modal state
  const [addOpen, setAddOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<Organization | null>(null);
  const [adminOrg, setAdminOrg] = useState<Organization | null>(null);

  // Add form
  const [addForm, setAddForm] = useState({ organization_name: '', admin_email: '', admin_password: '', organization_size: '', business_domain: '' });
  const [addError, setAddError] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  // Edit form
  const [editForm, setEditForm] = useState({ organization_name: '', organization_size: '', business_domain: '', subscription_status: '' });
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // Admin form
  const [adminForm, setAdminForm] = useState({ admin_email: '', admin_password: '', confirm: '' });
  const [adminError, setAdminError] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);

  async function load() {
    try { setOrgs(await orgsApi.list()); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  const filtered = orgs.filter((o) => {
    const matchTab = tab === 'active' ? !o.is_deleted : o.is_deleted;
    const q = search.toLowerCase();
    const matchSearch = !q || o.organization_name.toLowerCase().includes(q) || o.admin_email.toLowerCase().includes(q) || (o.business_domain || '').toLowerCase().includes(q);
    return matchTab && matchSearch;
  });

  // ── Add ────────────────────────────────────────────────────────────────────
  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError('');
    if (!addForm.admin_password) { setAddError('Admin password is required'); return; }
    setAddSaving(true);
    try {
      const org = await orgsApi.create({ ...addForm });
      setOrgs((o) => [org, ...o]);
      setAddOpen(false);
      setAddForm({ organization_name: '', admin_email: '', admin_password: '', organization_size: '', business_domain: '' });
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally { setAddSaving(false); }
  }

  // ── Edit ───────────────────────────────────────────────────────────────────
  function openEdit(org: Organization) {
    setEditOrg(org);
    setEditForm({ organization_name: org.organization_name, organization_size: org.organization_size ?? '', business_domain: org.business_domain ?? '', subscription_status: org.subscription_status });
    setEditError('');
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editOrg) return;
    setEditError('');
    setEditSaving(true);
    try {
      const updated = await orgsApi.update(editOrg.organization_id, editForm);
      setOrgs((o) => o.map((x) => x.organization_id === updated.organization_id ? updated : x));
      setEditOrg(null);
    } catch (err: unknown) {
      setEditError(err instanceof Error ? err.message : 'Failed to update');
    } finally { setEditSaving(false); }
  }

  // ── Archive / Restore ──────────────────────────────────────────────────────
  async function toggleArchive(org: Organization) {
    const verb = org.is_deleted ? 'restore' : 'archive';
    if (!confirm(`${verb.charAt(0).toUpperCase() + verb.slice(1)} "${org.organization_name}"?`)) return;
    const updated = org.is_deleted ? await orgsApi.restore(org.organization_id) : await orgsApi.archive(org.organization_id);
    setOrgs((o) => o.map((x) => x.organization_id === updated.organization_id ? updated : x));
  }

  // ── Assign Admin ───────────────────────────────────────────────────────────
  function openAdmin(org: Organization) {
    setAdminOrg(org);
    setAdminForm({ admin_email: org.admin_email, admin_password: '', confirm: '' });
    setAdminError('');
  }

  async function handleAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminOrg) return;
    setAdminError('');
    if (adminForm.admin_password !== adminForm.confirm) { setAdminError('Passwords do not match'); return; }
    if (!adminForm.admin_password) { setAdminError('Password is required'); return; }
    setAdminSaving(true);
    try {
      const updated = await orgsApi.assignAdmin(adminOrg.organization_id, adminForm.admin_email, adminForm.admin_password);
      setOrgs((o) => o.map((x) => x.organization_id === updated.organization_id ? updated : x));
      setAdminOrg(null);
    } catch (err: unknown) {
      setAdminError(err instanceof Error ? err.message : 'Failed to update admin');
    } finally { setAdminSaving(false); }
  }

  const inputCls = 'w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage all EraMatch organizations</p>
        </div>
        <button onClick={() => setAddOpen(true)}
          className="flex items-center gap-2 h-10 px-4 rounded-xl text-white text-sm font-semibold"
          style={{ backgroundColor: '#6366F1' }}
          onMouseEnter={(e) => ((e.target as HTMLElement).closest('button')!.style.backgroundColor = '#4F46E5')}
          onMouseLeave={(e) => ((e.target as HTMLElement).closest('button')!.style.backgroundColor = '#6366F1')}
        >
          <Plus size={16} /> Add Organization
        </button>
      </div>

      {/* Search + Tabs */}
      <div className="flex items-center gap-4 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or domain..."
            className="w-full h-10 pl-9 pr-4 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
          />
        </div>
        <div className="flex items-center bg-gray-100 rounded-xl p-1 gap-0.5">
          {(['active', 'archived'] as Tab[]).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t ? 'bg-white text-indigo-600 shadow-sm font-semibold' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400">{filtered.length} {tab}</span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No {tab} organizations found</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Organization', 'Domain', 'Size', 'Admin Email', 'Status', 'Created', ''].map((h) => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((org) => (
                <tr key={org.organization_id} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                  <td className="px-5 py-4 font-medium text-gray-900">{org.organization_name}</td>
                  <td className="px-5 py-4 text-gray-500">{org.business_domain || '—'}</td>
                  <td className="px-5 py-4 text-gray-500">{org.organization_size || '—'}</td>
                  <td className="px-5 py-4 text-gray-600">{org.admin_email}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      org.is_deleted ? 'bg-gray-100 text-gray-500' :
                      org.subscription_status === 'active' ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'
                    }`}>
                      {org.is_deleted ? 'Archived' : org.subscription_status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-gray-400 text-xs">{new Date(org.created_at).toLocaleDateString()}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 justify-end">
                      {!org.is_deleted && (
                        <>
                          <button onClick={() => openEdit(org)} title="Edit" className="p-2 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"><Edit2 size={15} /></button>
                          <button onClick={() => openAdmin(org)} title="Assign Admin" className="p-2 rounded-lg text-gray-400 hover:text-purple-600 hover:bg-purple-50 transition-colors"><UserCog size={15} /></button>
                        </>
                      )}
                      <button onClick={() => toggleArchive(org)} title={org.is_deleted ? 'Restore' : 'Archive'}
                        className={`p-2 rounded-lg transition-colors ${org.is_deleted ? 'text-gray-400 hover:text-green-600 hover:bg-green-50' : 'text-gray-400 hover:text-orange-500 hover:bg-orange-50'}`}
                      >
                        {org.is_deleted ? <RefreshCw size={15} /> : <Archive size={15} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Modal */}
      {addOpen && (
        <Modal title="Add Organization" onClose={() => { setAddOpen(false); setAddError(''); }}>
          {addError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{addError}</div>}
          <form onSubmit={handleAdd} className="space-y-4">
            {[
              { key: 'organization_name', label: 'Organization Name *', type: 'text', required: true },
              { key: 'admin_email', label: 'Admin Email *', type: 'email', required: true },
              { key: 'admin_password', label: 'Admin Password *', type: 'password', required: true },
              { key: 'organization_size', label: 'Size (e.g. 1-50, 51-200)', type: 'text', required: false },
              { key: 'business_domain', label: 'Business Domain (e.g. fintech)', type: 'text', required: false },
            ].map(({ key, label, type, required }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type={type} required={required} value={addForm[key as keyof typeof addForm]}
                  onChange={(e) => setAddForm((f) => ({ ...f, [key]: e.target.value }))}
                  className={inputCls} />
              </div>
            ))}
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setAddOpen(false)} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={addSaving} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: addSaving ? '#9CA3AF' : '#6366F1' }}>
                {addSaving ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {editOrg && (
        <Modal title={`Edit — ${editOrg.organization_name}`} onClose={() => setEditOrg(null)}>
          {editError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{editError}</div>}
          <form onSubmit={handleEdit} className="space-y-4">
            {[
              { key: 'organization_name', label: 'Organization Name', type: 'text' },
              { key: 'organization_size', label: 'Size', type: 'text' },
              { key: 'business_domain', label: 'Business Domain', type: 'text' },
            ].map(({ key, label, type }) => (
              <div key={key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                <input type={type} value={editForm[key as keyof typeof editForm]}
                  onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value }))}
                  className={inputCls} />
              </div>
            ))}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subscription Status</label>
              <select value={editForm.subscription_status}
                onChange={(e) => setEditForm((f) => ({ ...f, subscription_status: e.target.value }))}
                className={inputCls}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="trial">Trial</option>
                <option value="suspended">Suspended</option>
              </select>
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setEditOrg(null)} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={editSaving} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: editSaving ? '#9CA3AF' : '#6366F1' }}>
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Assign Admin Modal */}
      {adminOrg && (
        <Modal title={`Assign Admin — ${adminOrg.organization_name}`} onClose={() => setAdminOrg(null)}>
          <p className="text-xs text-gray-500 mb-4">
            This sets the login credentials for the organization's admin in the EraMatch main system.
          </p>
          {adminError && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">{adminError}</div>}
          <form onSubmit={handleAdmin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Admin Email *</label>
              <input type="email" required value={adminForm.admin_email}
                onChange={(e) => setAdminForm((f) => ({ ...f, admin_email: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password *</label>
              <input type="password" required value={adminForm.admin_password}
                onChange={(e) => setAdminForm((f) => ({ ...f, admin_password: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password *</label>
              <input type="password" required value={adminForm.confirm}
                onChange={(e) => setAdminForm((f) => ({ ...f, confirm: e.target.value }))}
                className={inputCls} />
            </div>
            <div className="flex gap-3 pt-2">
              <button type="button" onClick={() => setAdminOrg(null)} className="flex-1 h-10 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button type="submit" disabled={adminSaving} className="flex-1 h-10 rounded-xl text-white text-sm font-semibold" style={{ backgroundColor: adminSaving ? '#9CA3AF' : '#6366F1' }}>
                {adminSaving ? 'Updating...' : 'Assign Admin'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
