const API_BASE = '/api';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('master_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });

  if (res.status === 401) {
    localStorage.removeItem('master_token');
    localStorage.removeItem('master_user');
    window.location.href = '/login';
    throw new ApiError(401, 'Unauthorized');
  }

  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const data = await res.json();
      if (data?.detail) detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail);
    } catch {}
    throw new ApiError(res.status, detail);
  }

  if (res.status === 204) return {} as T;
  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (username: string, password: string) =>
    apiFetch<{ access_token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),
  changePassword: (old_password: string, new_password: string) =>
    apiFetch<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ old_password, new_password }),
    }),
};

// ── Users ─────────────────────────────────────────────────────────────────────
export interface MasterUser {
  id: number;
  username: string;
  is_active: boolean;
  created_at: string;
}

export const usersApi = {
  list: () => apiFetch<MasterUser[]>('/users'),
  create: (username: string, password: string) =>
    apiFetch<MasterUser>('/users', { method: 'POST', body: JSON.stringify({ username, password }) }),
  deactivate: (id: number) => apiFetch<void>(`/users/${id}`, { method: 'DELETE' }),
};

// ── Organizations ─────────────────────────────────────────────────────────────
export interface Organization {
  organization_id: string;
  organization_name: string;
  admin_email: string;
  organization_size: string | null;
  business_domain: string | null;
  subscription_status: string;
  is_deleted: boolean;
  created_at: string;
}

export const orgsApi = {
  list: () => apiFetch<Organization[]>('/organizations'),
  create: (data: {
    organization_name: string;
    admin_email: string;
    admin_password: string;
    organization_size?: string;
    business_domain?: string;
  }) => apiFetch<Organization>('/organizations', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: { organization_name?: string; organization_size?: string; business_domain?: string; subscription_status?: string }) =>
    apiFetch<Organization>(`/organizations/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archive: (id: string) => apiFetch<Organization>(`/organizations/${id}/archive`, { method: 'POST' }),
  restore: (id: string) => apiFetch<Organization>(`/organizations/${id}/restore`, { method: 'POST' }),
  assignAdmin: (id: string, admin_email: string, admin_password: string) =>
    apiFetch<Organization>(`/organizations/${id}/admin`, {
      method: 'POST',
      body: JSON.stringify({ admin_email, admin_password }),
    }),
};
