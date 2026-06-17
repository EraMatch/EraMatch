const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

let isRedirectingToLogin = false;
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function attemptTokenRefresh(): Promise<string> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token');
    const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error('Refresh failed');
    const data = await res.json();
    localStorage.setItem('token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data.access_token;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = localStorage.getItem('token');
    const headers: Record<string, string> = {
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...((options?.headers as Record<string, string>) || {}),
    };

    // Only add JSON Content-Type if not sending FormData
    if (!(options?.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (res.status === 401) {
        try {
            let newToken: string;
            if (isRefreshing && refreshPromise) {
                newToken = await refreshPromise;
            } else {
                isRefreshing = true;
                refreshPromise = attemptTokenRefresh().finally(() => {
                    isRefreshing = false;
                    refreshPromise = null;
                });
                newToken = await refreshPromise;
            }
            const retryHeaders: Record<string, string> = {
                'Authorization': `Bearer ${newToken}`,
                ...((options?.headers as Record<string, string>) || {}),
            };
            if (!(options?.body instanceof FormData) && !retryHeaders['Content-Type']) {
                retryHeaders['Content-Type'] = 'application/json';
            }
            const retryRes = await fetch(`${API_URL}${endpoint}`, { ...options, headers: retryHeaders });
            if (!retryRes.ok) {
                let detail = '';
                try {
                    const data = await retryRes.json();
                    if (typeof data?.detail === 'string') detail = data.detail;
                    else if (Array.isArray(data?.detail)) detail = data.detail.map((i: any) => i?.msg || JSON.stringify(i)).join('; ');
                } catch { detail = ''; }
                throw new Error(detail ? `API Error: ${detail}` : `API Error: ${retryRes.status} ${retryRes.statusText}`);
            }
            if (retryRes.status === 204) return {} as T;
            return retryRes.json();
        } catch {
            if (!isRedirectingToLogin) {
                isRedirectingToLogin = true;
                localStorage.removeItem('token');
                localStorage.removeItem('refresh_token');
                localStorage.removeItem('user');
                const path = window.location.pathname;
                window.location.href = path.startsWith('/admin') ? '/admin/login' : '/recruiter/login';
            }
            throw new Error('Unauthorized');
        }
    }
    if (!res.ok) {
        let detail = '';
        try {
            const data = await res.json();
            if (typeof data?.detail === 'string') {
                detail = data.detail;
            } else if (Array.isArray(data?.detail)) {
                detail = data.detail.map((item: any) => item?.msg || JSON.stringify(item)).join('; ');
            }
        } catch {
            detail = '';
        }
        throw new Error(detail ? `API Error: ${detail}` : `API Error: ${res.status} ${res.statusText}`);
    }
    if (res.status === 204) return {} as T;
    return res.json();
}

export { API_URL, fetchAPI };
