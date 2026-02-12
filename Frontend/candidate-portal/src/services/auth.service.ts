import { API_URL } from './client';

export const authService = {
    login: async (email: string, pass: string) => {
        const res = await fetch(`${API_URL}/candidate/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        if (!res.ok) throw new Error('Invalid credentials');
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
