import { API_URL } from './client';

export const authService = {
    login: async (username: string, pass: string) => {
        const payload = { username, password: pass };

        const res = await fetch(`${API_URL}/candidate/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Invalid username or password');
        const data = await res.json();
        // Store tokens for authenticated requests
        localStorage.setItem('access_token', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
        }
        return data;
    },
    getToken: () => localStorage.getItem('access_token'),
    logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    },
    isAuthenticated: () => !!localStorage.getItem('access_token'),
};
