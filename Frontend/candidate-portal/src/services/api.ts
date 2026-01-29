const API_URL = 'http://localhost:8000';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const res = await fetch(`${API_URL}${endpoint}`, options);
    if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
    return res.json();
}

export const api = {
    auth: {
        login: async (email: string, pass: string) => {
            const res = await fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password: pass })
            });
            if (!res.ok) throw new Error('Invalid credentials');
            return res.json();
        }
    },
    candidate: {
        getHome: async () => fetchAPI('/candidate/home'),
        getAssessments: async () => fetchAPI('/candidate/assessments'),
        getProfile: async () => fetchAPI('/candidate/profile')
    }
};
