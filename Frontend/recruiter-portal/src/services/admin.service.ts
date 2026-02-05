import { fetchAPI } from './client';
import type { Project, JobPosition, PositionGroup, Member, ClosedProject, ClosedPosition } from './types';

export const adminService = {
    getGlobalStats: async () => fetchAPI<any>('/admin/stats/global'),

    getPipelineStats: async () => fetchAPI<any>('/admin/stats/pipeline'),
    getHealthAnalytics: async () => fetchAPI<any>('/admin/stats/analytics'),
    getMemberStats: async () => fetchAPI<any>('/admin/members/stats'),
    getMemberPrivileges: async (userId: string) => fetchAPI<any>(`/admin/members/${userId}/privileges`),
    updateMemberPrivileges: async (userId: string, permissions: any) => fetchAPI<any>(`/admin/members/${userId}/privileges`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions })
    }),

    getDashboardStats: async () => {
        const [globalStats, projects, positions, groups, pipelineParams, analytics] = await Promise.all([
            fetchAPI<any>('/admin/stats/global').catch(() => ({})),
            fetchAPI<Project[]>('/recruiters/projects?status=active').catch(() => []),
            fetchAPI<JobPosition[]>('/recruiters/positions').catch(() => []),
            fetchAPI<PositionGroup[]>('/admin/groups').catch(() => []),
            fetchAPI<any>('/admin/stats/pipeline').catch(() => null),
            fetchAPI<any>('/admin/stats/analytics').catch(() => null)
        ]);

        console.log('🔍 Dashboard Stats Debug:', {
            globalStats,
            analytics,
            projects: projects.length,
            positions: positions.length
        });

        // Transform pipeline data
        let pipelineData: { stage: string; count: number; percentage: number; color: string }[] = [];
        if (pipelineParams) {
            // Calculate cumulative counts for funnel visualization
            // "Offer" Stage = Offer
            // "Interview" Stage = Interview + Offer
            // "Assessment" Stage = Assessment + Interview + Offer
            // "Screening" Stage = Screening + Assessment + Interview + Offer
            // "Applied" Stage = Applied + Screening + Assessment + Interview + Offer

            const offerCount = pipelineParams.offer || 0;
            const interviewCount = (pipelineParams.interview || 0) + offerCount;
            const assessmentCount = (pipelineParams.assessment || 0) + interviewCount;
            const screeningCount = (pipelineParams.screening || 0) + assessmentCount;
            const appliedCount = (pipelineParams.applied || 0) + screeningCount;

            // Base total for percentages is the top of the funnel (Applied)
            const total = appliedCount || 1;

            pipelineData = [
                { stage: 'Applied', count: appliedCount, percentage: 100, color: '#6366f1' },
                { stage: 'Screening', count: screeningCount, percentage: Math.round((screeningCount / total) * 100), color: '#8b5cf6' },
                { stage: 'Assessment', count: assessmentCount, percentage: Math.round((assessmentCount / total) * 100), color: '#a855f7' },
                { stage: 'Interview', count: interviewCount, percentage: Math.round((interviewCount / total) * 100), color: '#c084fc' },
                { stage: 'Offer', count: offerCount, percentage: Math.round((offerCount / total) * 100), color: '#10b981' }
            ];
        }

        const transformedProjects = (projects || []).map((p: any) => {
            console.log('🔧 Transforming project:', p);
            const transformed = {
                ...p,
                id: p.project_id || p.id,
                projectName: p.name || p.projectName || 'Unnamed Project',
                positionsCount: p.positionsCount || p.positions_count || 0,
                applicantsCount: p.applicantsCount || p.applicants_count || 0,
                subGroupsCount: p.subGroupsCount || p.sub_groups_count || 0,
                openDate: p.openDate || p.created_at || p.open_date || new Date().toISOString()
            };
            console.log('✅ Transformed to:', transformed);
            return transformed;
        });

        console.log('📦 Final transformed projects:', transformedProjects);

        const transformedPositions = (positions || []).map((p: any) => ({
            ...p,
            id: p.id || p.position_id,
            jobTitle: p.jobTitle || p.job_title,
            assignedHR: p.assignedHR || p.assigned_hr_name || 'Not Assigned',
            assignedTechnicalRecruiter: p.assignedTechnicalRecruiter || p.assigned_tech_name || 'Not Assigned',
            candidatesCount: p.candidatesCount ?? p.candidates_count ?? 0,
            status: p.status || 'open'
        }));

        const transformedGroups = (groups || []).map((g: any) => ({
            ...g,
            id: g.groupID || g.group_id || g.id,
            groupName: g.groupName || g.group_name || 'Unnamed Group',
            candidatesCount: g.candidatesCount || g.candidates_count || 0,
            status: g.status || 'Active',
            createdDate: g.createdDate || g.created_at || new Date().toISOString()
        }));

        return {
            ...globalStats,
            projects: transformedProjects,
            jobPositions: transformedPositions,
            positionGroups: transformedGroups,
            pipelineData, // Pass transformed data
            recentGroups: groups.slice(0, 3),
            avgTimeToFill: globalStats.avgTimeToFill || 0,
            revenue: {
                current: 0,
                target: 0,
                growth: 0
            },
            analytics // Pass analytics data
        };
    },

    getRecruiterPerformance: async () => fetchAPI('/admin/performance'),

    getMembers: async () => {
        const users = await fetchAPI<any[]>('/admin/users');
        return (users || []).map(u => ({
            id: u.id,
            name: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown User',
            email: u.email,
            role: u.role,
            status: u.status || 'Active',
            position: u.role === 'Admin' ? 'Administrator' : 'Team Member',
            department: 'Organization',
            joinDate: u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A'
        }));
    },

    registerEmployee: async (data: any) => {
        return fetchAPI('/admin/members/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },
    removeMember: async (userId: string) => fetchAPI(`/admin/members/${userId}`, { method: 'DELETE' }),

    getPendingRequests: async () => fetchAPI('/admin/requests'),

    getSubscriptionPlans: async () => fetchAPI('/admin/subscription'),

    getPaymentMethod: async () => fetchAPI<{ brand: string; last4: string; expiry: string }>('/admin/subscription/payment'),

    getNotifications: async () => fetchAPI('/admin/notifications'),

    getAlerts: async () => fetchAPI('/admin/alerts'),

    getGroupAnalytics: async (groupId: string) => {
        try {
            const [analysis, technicalAI, risks] = await Promise.all([
                fetchAPI<any>(`/recruiters/groups/${groupId}/analysis`).catch(() => null),
                fetchAPI<any>(`/recruiters/groups/${groupId}/technical-ai`).catch(() => null),
                fetchAPI<any>(`/recruiters/groups/${groupId}/risks`).catch(() => null)
            ]);

            if (!analysis) return null;

            return {
                matchAccuracy: analysis.matchAccuracy || 0,
                totalCandidates: analysis.totalCandidates || 0,
                initialMatchScore: analysis.matchAccuracy || 0, // Frontend uses this
                phases: {
                    assessment: technicalAI?.tech ? {
                        avgScore: technicalAI.tech.avgScore || 0,
                        passRate: technicalAI.tech.passRate || 0,
                        completed: technicalAI.tech.completed || 0,
                        cheatingDetected: risks?.cheatingDetected || 0,
                        highRisk: risks?.high || 0,
                        mediumRisk: risks?.medium || 0,
                        lowRisk: risks?.low || 0
                    } : null,
                    aiInterview: technicalAI?.ai ? {
                        avgScore: technicalAI.ai.avgScore || 0,
                        avgConfidence: technicalAI.ai.avgConfidence || 0,
                        sentimentPositive: technicalAI.ai.sentimentPositive || 0,
                        sentimentNeutral: technicalAI.ai.sentimentNeutral || 0,
                        sentimentNegative: technicalAI.ai.sentimentNegative || 0,
                        passRate: technicalAI.ai.passRate || 0,
                        completed: technicalAI.ai.completed || 0
                    } : null,
                    liveInterview: {
                        // Mock/Partial for now as backend doesn't fully support live interview stats yet
                        completed: 0,
                        scheduled: 0,
                        avgRating: 0,
                        recommended: 0,
                        rejected: 0,
                        pending: 0
                    }
                }
            };
        } catch (error) {
            console.error('Error fetching group analytics:', error);
            return null;
        }
    },

    reassignRecruiter: async (positionId: string, recruiterId: string, type: 'HR' | 'Technical') => {
        return fetchAPI(`/delegation/positions/${positionId}/reassign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recruiterID: recruiterId, type })
        });
    },

    notifyRecruiters: async (positionId: string) => {
        return fetchAPI(`/delegation/positions/${positionId}/notify`, {
            method: 'POST'
        });
    },

    getRecentAssignments: async () => {
        return fetchAPI<any[]>('/delegation/recent');
    },

    getRecruiterDelegation: async () => {
        const [hr, tech, positions, projects] = await Promise.all([
            fetchAPI<any[]>('/delegation/hr'),
            fetchAPI<any[]>('/delegation/technical'),
            fetchAPI<JobPosition[]>('/recruiters/positions?status=open'),
            fetchAPI<Project[]>('/recruiters/projects?status=active')
        ]);

        const transformedPositions = (positions || []).map((p: any) => ({
            ...p,
            id: p.id || p.position_id,
            jobTitle: p.jobTitle || p.job_title,
            assignedHR: p.assignedHR || p.assigned_hr_name || 'Not Assigned',
            assignedTechnicalRecruiter: p.assignedTechnicalRecruiter || p.assigned_tech_name || 'Not Assigned',
            candidatesCount: p.candidatesCount ?? p.candidates_count ?? 0,
            status: p.status || 'open',
            projectId: p.projectId || p.project_id
        }));

        return {
            hrRecruiters: hr,
            technicalRecruiters: tech,
            positions: transformedPositions,
            projects: projects
        };
    },

    getArchivedProjects: async () => {
        return fetchAPI<ClosedProject[]>('/archive/projects');
    },

    getArchivedPositions: async (projectId: string) => {
        return fetchAPI<ClosedPosition[]>(`/archive/projects/${projectId}/positions`);
    },

    getPositionArchiveDetails: async (positionId: string) => {
        return fetchAPI<any>(`/archive/positions/${positionId}/details`);
    },

    getSettings: async () => fetchAPI<any>('/admin/settings'),

    updateProfile: async (data: { first_name?: string; last_name?: string; email?: string }) => {
        return fetchAPI('/admin/settings/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    updateOrganization: async (data: { organization_name?: string; admin_email?: string; timezone?: string }) => {
        return fetchAPI('/admin/settings/organization', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    updatePreferences: async (data: any) => {
        return fetchAPI('/admin/settings/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    }
};
