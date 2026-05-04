const API_URL = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000/api/v1`;

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
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        const path = window.location.pathname;
        window.location.href = path.startsWith('/admin') ? '/admin/login' : '/recruiter/login';
        throw new Error('Unauthorized');
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
