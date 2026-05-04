const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

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
            // Token expired or invalid - redirect to login
            localStorage.removeItem('access_token');
            localStorage.removeItem('refresh_token');
            window.location.href = '/login';
        }
        const suffix = detail ? ` - ${detail}` : '';
        throw new Error(`API Error ${res.status}: ${res.statusText}${suffix}`);
    }
    return res.json();
}

export { API_URL, fetchAPI };

