import { API_URL, fetchAPI } from './client';

export const authService = {
    login: async (email: string, pass: string) => {
        const res = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        if (!res.ok) throw new Error('Invalid credentials');
        return res.json();
    }
};
