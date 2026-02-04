const API_URL = 'http://localhost:8000';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, options);
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
}

export { API_URL, fetchAPI };
