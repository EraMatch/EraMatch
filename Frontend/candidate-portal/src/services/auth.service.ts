import { API_URL } from './client';

export const authService = {
    login: async (email: string, pass: string, groupId?: string) => {
        const payload: any = { email, password: pass };
        if (groupId) {
            payload.group_id = groupId;
        }

        const res = await fetch(`${API_URL}/candidate/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Invalid credentials');
        const data = await res.json();
        // Store tokens for authenticated requests
        localStorage.setItem('access_token', data.access_token);
        if (data.refresh_token) {
            localStorage.setItem('refresh_token', data.refresh_token);
        }
        if (groupId) {
            localStorage.setItem('current_group_id', groupId);
        }
        return data;
    },
    getToken: () => localStorage.getItem('access_token'),
    logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('current_group_id');
    },
    isAuthenticated: () => !!localStorage.getItem('access_token'),
};
