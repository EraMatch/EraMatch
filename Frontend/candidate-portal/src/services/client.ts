const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

let isRedirectingToLogin = false;
let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

async function attemptTokenRefresh(): Promise<string> {
    const refreshToken = localStorage.getItem('refresh_token');
    if (!refreshToken) throw new Error('No refresh token');
    const res = await fetch(`${API_URL}/candidate/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error('Refresh failed');
    const data = await res.json();
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    return data.access_token;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = localStorage.getItem('access_token');
    const headers: HeadersInit = {
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options?.headers,
    };
    if (!(options?.body instanceof FormData) && !(headers as any)['Content-Type']) {
        (headers as any)['Content-Type'] = 'application/json';
    }
    const res = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (!res.ok) {
        let detail = '';
        try {
            const payload = await res.json();
            if (typeof payload?.detail === 'string') {
                detail = payload.detail;
            } else if (payload?.detail) {
                detail = JSON.stringify(payload.detail);
            }
        } catch {
            detail = '';
        }
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
                const retryHeaders: HeadersInit = {
                    'Authorization': `Bearer ${newToken}`,
                    ...options?.headers,
                };
                if (!(options?.body instanceof FormData) && !(retryHeaders as any)['Content-Type']) {
                    (retryHeaders as any)['Content-Type'] = 'application/json';
                }
                const retryRes = await fetch(`${API_URL}${endpoint}`, { ...options, headers: retryHeaders });
                if (!retryRes.ok) {
                    let retryDetail = '';
                    try {
                        const retryPayload = await retryRes.json();
                        if (typeof retryPayload?.detail === 'string') retryDetail = retryPayload.detail;
                        else if (retryPayload?.detail) retryDetail = JSON.stringify(retryPayload.detail);
                    } catch { retryDetail = ''; }
                    const suffix = retryDetail ? ` - ${retryDetail}` : '';
                    throw new Error(`API Error ${retryRes.status}: ${retryRes.statusText}${suffix}`);
                }
                return retryRes.json();
            } catch {
                if (!isRedirectingToLogin) {
                    isRedirectingToLogin = true;
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                    window.location.href = '/login';
                }
                throw new Error('Unauthorized');
            }
        }
        const suffix = detail ? ` - ${detail}` : '';
        throw new Error(`API Error ${res.status}: ${res.statusText}${suffix}`);
    }
    return res.json();
}

export { API_URL, fetchAPI };
