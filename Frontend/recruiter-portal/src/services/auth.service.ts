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
    },

    adminLogin: async (email: string, pass: string) => {
        const res = await fetch(`${API_URL}/auth/admin/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        if (!res.ok) throw new Error('Invalid administrative credentials');
        const data = await res.json();

        // Save to localStorage
        const token = data.access_token || data.token;
        if (token) {
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(data.user));
        }

        return data;
    },

    organizationUserLogin: async (email: string, pass: string) => {
        const res = await fetch(`${API_URL}/auth/organization-user/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password: pass })
        });
        if (!res.ok) {
            const errorData = await res.json().catch(() => ({ detail: 'Invalid credentials' }));
            throw new Error(errorData.detail || 'Login failed');
        }
        const data = await res.json();

        // Save to localStorage
        const token = data.access_token || data.token;
        if (token) {
            localStorage.setItem('token', token);
            localStorage.setItem('user', JSON.stringify(data.user));
        }

        return data;
    },

    forgotPassword: async (email: string) => {
        const res = await fetch(`${API_URL}/auth/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (!res.ok) throw new Error('Failed to request password reset');
        return res.json();
    },

    resetPassword: async (token: string, pass: string) => {
        const res = await fetch(`${API_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password: pass })
        });
        if (!res.ok) throw new Error('Failed to reset password');
        return res.json();
    },

    organizationUserForgotPassword: async (email: string) => {
        const res = await fetch(`${API_URL}/auth/organization-user/forgot-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });
        if (!res.ok) throw new Error('Failed to request password reset');
        return res.json();
    },

    organizationUserResetPassword: async (token: string, pass: string) => {
        const res = await fetch(`${API_URL}/auth/organization-user/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, password: pass })
        });
        if (!res.ok) throw new Error('Failed to reset password');
        return res.json();
    },

    changePassword: async (oldPass: string, newPass: string, confirmNewPass: string) => {
        // Here we use fetchAPI wrapper because we need the Authorization header,
        // which fetchAPI handles automatically.
        return fetchAPI('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ old_password: oldPass, new_password: newPass, confirm_password: confirmNewPass })
        });
    },

    logout: async () => {
        try {
            await fetchAPI('/auth/logout', { method: 'POST' });
        } catch (_) {
            // Even if the API call fails, clear local session
        } finally {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
        }
    },
};
