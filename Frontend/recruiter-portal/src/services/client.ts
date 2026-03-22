const API_URL = 'http://localhost:8000/api/v1';

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
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    if (res.status === 204) return {} as T;
    return res.json();
}

export { API_URL, fetchAPI };
