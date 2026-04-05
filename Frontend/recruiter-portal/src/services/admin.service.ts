import { fetchAPI } from './client';
import type { Project, JobPosition, PositionGroup, Member, ClosedProject, ClosedPosition } from './types';

export const adminService = {
    getGlobalStats: async () => fetchAPI<any>('/admin/stats/global'),

    getPipelineStats: async (projectId?: string, positionId?: string) => {
        let url = '/admin/stats/pipeline';
        const params = new URLSearchParams();
        if (projectId) params.append('project_id', projectId);
        if (positionId) params.append('position_id', positionId);

        const queryString = params.toString();
        if (queryString) url += `?${queryString}`;

        return fetchAPI<any>(url);
    },
    getHealthAnalytics: async () => fetchAPI<any>('/admin/stats/analytics'),
    getMemberStats: async () => fetchAPI<any>('/admin/members/stats'),
    getMemberPrivileges: async (userId: string) => fetchAPI<any>(`/admin/members/${userId}/privileges`),
    updateMemberPrivileges: async (userId: string, permissions: any) => fetchAPI<any>(`/admin/members/${userId}/privileges`, {
        method: 'PATCH',
        body: JSON.stringify({ permissions })
    }),

    updateUserStatus: async (userId: string, status: 'active' | 'suspended') => {
        return fetchAPI(`/admin/members/${userId}/status?status=${status}`, {
            method: 'PATCH'
        });
    },

    transformPipelineData: (pipelineParams: any) => {
        if (!pipelineParams?.stages) return [];
        return pipelineParams.stages;
    },

    getDashboardStats: async () => {
        const [globalStats, projects, positions, groups, pipelineParams, analytics] = await Promise.all([
            fetchAPI<any>('/admin/stats/global').catch(() => ({})),
            fetchAPI<Project[]>('/recruiter/projects?status=active').catch(() => []),
            fetchAPI<JobPosition[]>('/recruiter/positions').catch(() => []),
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

        // Transform pipeline data using the helper
        const pipelineData = adminService.transformPipelineData(pipelineParams);

        const transformedProjects = (projects || []).map((p: any) => {
            console.log('🔧 Transforming project:', p);
            const transformed = {
                ...p,
                id: p.project_id || p.id,
                projectName: p.name || p.projectName || 'Unnamed Project',
                positionsCount: p.positionsCount || p.positions_count || 0,
                applicantsCount: p.applicantsCount || p.applicants_count || 0,
                subGroupsCount: p.subGroupsCount || p.sub_groups_count || 0,
                avgTimeToFill: p.avgTimeToFill || p.avg_time_to_fill || 0,
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
            status: p.status || 'open',
            projectId: p.project_id || p.projectId
        }));

        const transformedGroups = (groups || []).map((g: any) => ({
            ...g,
            id: g.groupID || g.group_id || g.id,
            groupName: g.name || g.groupName || g.group_name || 'Unnamed Group',
            name: g.name || g.groupName || g.group_name || 'Unnamed Group',
            candidatesCount: g.candidateCount ?? g.candidatesCount ?? g.candidates_count ?? 0,
            candidateCount: g.candidateCount ?? g.candidatesCount ?? g.candidates_count ?? 0,
            integrityIssues: g.integrityIssues || g.integrity_issues || 0,
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
            revenue: globalStats.revenue || {
                current: 0,
                target: 0,
                growth: 0
            },
            analytics: globalStats.analytics || analytics // Use globalStats.analytics as primary source
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

    /**
     * 4 Core Position Distribution Actions
     */
    
    // 1. Delegate: Manually reassign a position to a recruiter
    delegatePosition: async (positionId: string, recruiterId: string, type: 'HR' | 'Technical') => {
        return fetchAPI(`/delegation/positions/${positionId}/reassign`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recruiterID: recruiterId, type })
        });
    },

    // 2. Suspend: Suspend member and auto-redistribute their open positions
    suspendMember: async (userId: string) => {
        return fetchAPI(`/admin/members/${userId}/status?status=suspended`, {
            method: 'PATCH'
        });
    },

    // 3. Activate: Reactivate member from suspended state
    activateMember: async (userId: string) => {
        return fetchAPI(`/admin/members/${userId}/status?status=active`, {
            method: 'PATCH'
        });
    },

    // 4. Delete: Soft delete member
    deleteMember: async (userId: string) => {
        return fetchAPI(`/admin/members/${userId}`, { method: 'DELETE' });
    },

    // 5. Return: Restore/backfill unassigned positions to available recruiters
    backfillPositionAssignments: async () => {
        return fetchAPI('/admin/positions/backfill-assignments', {
            method: 'PATCH'
        });
    },

    getPendingRequests: async () => fetchAPI('/admin/requests'),

    getSubscriptionPlans: async () => fetchAPI('/admin/subscription'),

    getPaymentMethod: async () => fetchAPI<{ brand: string; last4: string; expiry: string }>('/admin/subscription/payment'),

    addPaymentMethod: async (data: { brand: string, last4: string, expiry: string, cardNumber: string, cvc: string, cardName: string }) => {
        return fetchAPI('/admin/subscription/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    upgradeSubscription: async (planId: string) => {
        return fetchAPI('/admin/subscription/upgrade', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planID: planId })
        });
    },

    getNotifications: async () => fetchAPI('/admin/notifications'),

    getAlerts: async () => fetchAPI('/admin/alerts'),

    getGroupAnalytics: async (groupId: string) => {
        try {
            const [analysis, technicalAI, risks] = await Promise.all([
                fetchAPI<any>(`/recruiter/groups/${groupId}/analysis`).catch(() => null),
                fetchAPI<any>(`/recruiter/groups/${groupId}/technical-ai`).catch(() => null),
                fetchAPI<any>(`/recruiter/groups/${groupId}/risks`).catch(() => null)
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
        const response = await fetchAPI<any>('/delegation/recent');
        return response.assignments || [];
    },

    getRecruiterDelegation: async () => {
        const cacheBuster = `cb=${Date.now()}`;
        const [hr, tech, positions, projects] = await Promise.all([
            fetchAPI<any[]>(`/delegation/hr?${cacheBuster}`),
            fetchAPI<any[]>(`/delegation/technical?${cacheBuster}`),
            fetchAPI<JobPosition[]>(`/recruiter/positions?status=open&${cacheBuster}`),
            fetchAPI<Project[]>(`/recruiter/projects?status=active&${cacheBuster}`)
        ]);

        const transformedPositions = (positions || []).map((p: any) => {
            const transformed = {
                ...p,
                id: p.id || p.position_id,
                jobTitle: p.jobTitle || p.job_title,
                assignedHR: p.assignedHR || p.assigned_hr_name || 'Not Assigned',
                assignedTechnicalRecruiter: p.assignedTechnicalRecruiter || p.assigned_tech_name || 'Not Assigned',
                candidatesCount: p.candidatesCount ?? p.candidates_count ?? 0,
                status: p.status || 'open',
                projectId: p.projectId || p.project_id
            };
            return transformed;
        });

        return {
            hrRecruiters: hr,
            technicalRecruiters: tech,
            positions: transformedPositions,
            projects: projects
        };
    },

    /**
     * Get recruiter workload distribution data
     * Returns aggregated position count for all HR and Technical recruiters
     */
    getRecruiterWorkloadDistribution: async () => {
        try {
            const data = await adminService.getRecruiterDelegation();
            
            // Combine and format HR and Technical recruiters
            const allRecruiters = [
                ...(data.hrRecruiters || []).map((r: any) => ({
                    id: r.id,
                    name: r.name || 'Unknown',
                    positionsCount: r.assignedCount || 0,
                    type: 'HR'
                })),
                ...(data.technicalRecruiters || []).map((r: any) => ({
                    id: r.id,
                    name: r.name || 'Unknown',
                    positionsCount: r.assignedCount || 0,
                    type: 'Technical'
                }))
            ];
            
            // Aggregate by recruiter type
            const hrLoadSum = (data.hrRecruiters || []).reduce((sum: number, r: any) => sum + (r.assignedCount || 0), 0);
            const techLoadSum = (data.technicalRecruiters || []).reduce((sum: number, r: any) => sum + (r.assignedCount || 0), 0);
            
            return {
                hrRecruiters: data.hrRecruiters || [],
                technicalRecruiters: data.technicalRecruiters || [],
                allRecruiters,
                summary: {
                    hrTotalLoad: hrLoadSum,
                    technicalTotalLoad: techLoadSum,
                    totalLoad: hrLoadSum + techLoadSum,
                    hrCount: (data.hrRecruiters || []).length,
                    technicalCount: (data.technicalRecruiters || []).length,
                    avgHRLoad: (data.hrRecruiters || []).length > 0 ? hrLoadSum / (data.hrRecruiters || []).length : 0,
                    avgTechnicalLoad: (data.technicalRecruiters || []).length > 0 ? techLoadSum / (data.technicalRecruiters || []).length : 0
                }
            };
        } catch (error) {
            console.error('Error fetching recruiter workload distribution:', error);
            return {
                hrRecruiters: [],
                technicalRecruiters: [],
                allRecruiters: [],
                summary: {
                    hrTotalLoad: 0,
                    technicalTotalLoad: 0,
                    totalLoad: 0,
                    hrCount: 0,
                    technicalCount: 0,
                    avgHRLoad: 0,
                    avgTechnicalLoad: 0
                }
            };
        }
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
    },
    // Approval Requests
    createApprovalRequest: async (data: { request_type: 'project' | 'position', data: any }) => {
        return fetchAPI('/admin/requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    listApprovalRequests: async (status: string = 'pending') => {
        return fetchAPI<any[]>(`/admin/requests?status=${status}`);
    },

    approveRequest: async (requestId: string, decision: { assigned_tech_id?: string, review_notes?: string }) => {
        return fetchAPI(`/admin/requests/${requestId}/approve`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'approved', ...decision })
        });
    },

    rejectRequest: async (requestId: string, review_notes: string) => {
        return fetchAPI(`/admin/requests/${requestId}/reject`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'rejected', review_notes })
        });
    }
};
