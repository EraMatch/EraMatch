import { fetchAPI } from './client';
import type { Project, JobPosition, PositionGroup, Member, ClosedProject, ClosedPosition } from './types';

export const adminService = {
    getDashboardStats: async () => {
        const [stats, projects, positions, groups] = await Promise.all([
            fetchAPI<any>('/admin/stats'),
            fetchAPI<Project[]>('/projects'),
            fetchAPI<JobPosition[]>('/positions'),
            fetchAPI<PositionGroup[]>('/groups')
        ]);

        return {
            ...stats,
            projects,
            jobPositions: positions,
            positionGroups: groups,
            recentGroups: groups.slice(0, 3),
            avgTimeToFill: stats.avgTimetoHire || 28,
            revenue: stats.revenue || {
                current: 0,
                target: 0,
                growth: 0
            }
        };
    },

    getRecruiterPerformance: async () => fetchAPI('/admin/performance'),

    getMembers: async () => fetchAPI<Member[]>('/members'),

    registerEmployee: async (data: any) => {
        return fetchAPI('/admin/register-employee', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    getPendingRequests: async () => fetchAPI('/admin/requests'),

    getSubscriptionPlans: async () => fetchAPI('/admin/subscription'),

    getNotifications: async () => fetchAPI('/admin/notifications'),

    getAlerts: async () => fetchAPI('/admin/alerts'),

    getGroupAnalytics: async (groupId: string) => fetchAPI(`/groups/${groupId}/overview`),

    getRecruiterDelegation: async () => {
        const [hr, tech, positions, projects] = await Promise.all([
            fetchAPI<string[]>('/recruiters/hr'),
            fetchAPI<string[]>('/recruiters/technical'),
            fetchAPI<JobPosition[]>('/positions'),
            fetchAPI<Project[]>('/projects')
        ]);
        return {
            hrRecruiters: hr,
            technicalRecruiters: tech,
            positions: positions,
            projects: projects
        };
    },

    getClosedPositions: async () => {
        const [projects, positions] = await Promise.all([
            fetchAPI<ClosedProject[]>('/projects/closed'),
            fetchAPI<ClosedPosition[]>('/positions/closed')
        ]);
        return { projects, positions };
    }
};
