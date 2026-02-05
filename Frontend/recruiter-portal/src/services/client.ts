const API_URL = 'http://localhost:8000/api/v1';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const token = localStorage.getItem('token');
    const headers = {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...options?.headers,
    };

    const res = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
    });

    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
}

export { API_URL, fetchAPI };
