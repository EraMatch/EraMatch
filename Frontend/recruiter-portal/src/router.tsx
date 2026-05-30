// @refresh reset
import { createBrowserRouter, useNavigate, useSearchParams, useParams, Navigate, useLocation, Outlet } from 'react-router-dom';
import React from 'react';
import { Toaster } from 'sonner';
import { AdminLoginPage } from './components/admin/AdminLoginPage';
import { ForgotPasswordPage } from './components/admin/ForgotPasswordPage';
import { ResetPasswordPage } from './components/admin/ResetPasswordPage';
import { RecruiterLoginPage } from './components/recruiter/auth/RecruiterLoginPage';
import { RecruiterForgotPasswordPage } from './components/recruiter/auth/RecruiterForgotPasswordPage';
import { RecruiterResetPasswordPage } from './components/recruiter/auth/RecruiterResetPasswordPage';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminSettings } from './components/admin/AdminSettings';
import { AdminRecruiterDelegation } from './components/admin/AdminRecruiterDelegation';
import { AdminClosedPositions } from './components/admin/AdminClosedPositions';
import { AdminOrganizationMembers } from './components/admin/AdminOrganizationMembers';
import { AdminSidebar } from './components/admin/AdminSidebar';
import { Sidebar } from './components/recruiter/layout/Sidebar';
import { Dashboard } from './components/recruiter/dashboard/Dashboard';
import { ProjectsPage } from './components/recruiter/projects/ProjectsPage';
import { CandidatesPage } from './components/recruiter/candidates/CandidatesPage';
import { QuestionBankPage } from './components/recruiter/assessments/QuestionBankPage';
import { CandidateProfile } from './components/recruiter/candidates/CandidateProfile';
import { CandidateGitHubAnalysisReviewPage } from './components/recruiter/candidates/CandidateGitHubAnalysisReviewPage';
import { CandidateQAGAuditPage } from './components/recruiter/candidates/CandidateQAGAuditPage';
import { AlertsNotifications } from './components/common/AlertsNotifications';
import { EnhancedGroupOverviewV2 } from './components/recruiter/groups/EnhancedGroupOverviewV2';
import { LandingPage } from './components/common/LandingPage';
import { SuspectReviewWrapper } from './components/recruiter/candidates/SuspectReviewWrapper';
import { RecruiterSettings } from './components/recruiter/settings/RecruiterSettings';
import { SuspiciousActivityLog } from './components/recruiter/dashboard/SuspiciousActivityLog';
import { BackgroundTasks } from './components/recruiter/dashboard/BackgroundTasks';
import { ReviewRequests } from './components/recruiter/reviews/ReviewRequests';
import { PositionPreMatchingReviewPage } from './components/recruiter/reviews/PositionPreMatchingReviewPage';
import { api, PositionGroup } from './services/api';
import { NavigationStackProvider, useNavigationStack } from './components/common/NavigationStack';
import { ProjectDetailView } from './components/recruiter/projects/ProjectDetailView';
import { PositionDetailView } from './components/recruiter/positions/PositionDetailView';
import { EvidenceDashboard } from './components/recruiter/dashboard/EvidenceDashboard';
import { toast } from 'sonner';

import AdminRequests from './components/admin/AdminRequests';

// Error Page Component
const ErrorPage = () => (
    <div className="min-h-screen flex items-center justify-center bg-[#EDF0F8]">
        <div className="text-center">
            <h1 className="text-4xl font-bold text-gray-800 mb-4">Oops!</h1>
            <p className="text-gray-600 mb-4">Something went wrong.</p>
            <a href="/" className="text-[#6941C6] hover:underline">Go back to home</a>
        </div>
    </div>
);

// Layout Wrappers
const AdminLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="min-h-screen bg-[#edf0f8]">
            <AdminSidebar />
            <div className="ml-[96px]">
                <main>{children}</main>
                <Toaster richColors position="top-right" />
            </div>
        </div>
    );
};


// Protected Route Guards
const AdminProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (!token || !user) {
        return <Navigate to="/admin/login" replace />;
    }
    return <>{children}</>;
};

// Nested layout route for all recruiter pages.
// Using <Outlet /> instead of {children} ensures React Router provides the
// current matched route's element directly — no prop-threading, no stale
// children across reconciled wrappers. The key on <main> still forces a
// full remount whenever the pathname changes.
const RecruiterLayoutRoute = () => {
    const location = useLocation();
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (!token || !user) {
        return <Navigate to="/recruiter/login" replace />;
    }
    return (
        <NavigationStackProvider>
            <div className="min-h-screen bg-[#edf0f8]">
                <Sidebar />
                <div className="ml-[96px] transition-all duration-300">
                    <main key={location.pathname}>
                        <Outlet />
                    </main>
                    <Toaster richColors position="top-right" />
                </div>
            </div>
        </NavigationStackProvider>
    );
};

// Landing Page Wrapper - Simplified with 2 buttons
const LandingPageWrapper = () => {
    const navigate = useNavigate();
    return (
        <LandingPage
            onAdminLogin={() => navigate('/admin/login')}
            onRecruiterLogin={() => navigate('/recruiter/login')}
        />
    );
};

// Wrapper Components for Navigation
const DashboardWrapper = () => {
    const navigate = useNavigate();
    const { navigateWithStack } = useNavigationStack();
    return (
        <Dashboard
            onViewAllProjects={() => navigate('/recruiter/projects')}
            onViewProject={(projectId) => navigateWithStack(`/recruiter/project/${projectId}`)}
            onViewSuspicious={() => navigate('/recruiter/suspicious-activity')}
            onViewRequests={() => navigate('/recruiter/reviews')}
            onViewHeldCandidates={() => navigate('/recruiter/candidates?status=holded')}
        />
    );
};

const ProjectsPageWrapper = () => {
    const { navigateWithStack } = useNavigationStack();

    return (
        <ProjectsPage
            onViewProject={(projectId) => navigateWithStack(`/recruiter/project/${projectId}`)}
            onViewPosition={(positionId) => navigateWithStack(`/recruiter/position/${positionId}`)}
            onCreateAssessment={() => console.log('Create Assessment')}
        />
    );
};

const ProjectDetailWrapper = () => {
    const { projectId } = useParams();
    const { navigateWithStack, goBack } = useNavigationStack();

    return (
        <ProjectDetailView
            projectId={projectId || ''}
            onBack={() => goBack()}
            backLabel="Back"
            onCreateAssessment={() => console.log('Create Assessment')}
            onViewDashboard={() => goBack('/recruiter/dashboard')}
            onViewGroup={(groupId) => navigateWithStack(`/recruiter/group/${groupId}`)}
            onViewPosition={(positionId) => navigateWithStack(`/recruiter/position/${positionId}`)}
        />
    );
};

const PositionDetailWrapper = () => {
    const { positionId } = useParams();
    const { goBack } = useNavigationStack();
    const navigate = useNavigate();

    // We need to fetch position details to get the required props
    const [positionData, setPositionData] = React.useState<any>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const loadPosition = async () => {
            if (!positionId) return;
            try {
                const position = await api.recruiter.getPosition(positionId) as any;
                setPositionData(position);
            } catch (err) {
                console.error('Failed to load position:', err);
            } finally {
                setLoading(false);
            }
        };
        loadPosition();
    }, [positionId]);

    const handleSavePosition = async (title: string, description: string) => {
        if (!positionId) return;
        const updated = await api.recruiter.updatePosition(positionId, {
            job_title: title,
            job_description: description,
        } as any) as any;
        setPositionData((previous: any) => ({
            ...(previous || {}),
            ...updated,
            jobTitle: updated?.jobTitle ?? updated?.job_title ?? title,
            jobDescription: updated?.jobDescription ?? updated?.job_description ?? description,
        }));
        toast.success('Position saved.');
    };

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen bg-[#edf0f8]">
            <p className="text-[#64748b] font-medium">Loading position details...</p>
        </div>
    );

    return (
        <PositionDetailView
            positionId={positionId || ''}
            positionTitle={positionData?.jobTitle || positionData?.job_title || positionData?.title || 'Position'}
            projectTitle={positionData?.projectName || positionData?.project_name || 'Project'}
            description={positionData?.jobDescription || positionData?.job_description || positionData?.description}
            screeningConditions={positionData?.screeningConditions || positionData?.screening_conditions}
            positionStatus={String(positionData?.status || '').toLowerCase()}
            isOpen={String(positionData?.status || '').toLowerCase() === 'open' || String(positionData?.status || '').toLowerCase() === 'active'}
            onBack={() => goBack()}
            onSave={async (title, description) => {
                await handleSavePosition(title, description);
            }}
            onCreateAssessment={() => console.log('Create Assessment')}
            onViewGroup={(groupId) => navigate(`/recruiter/group/${groupId}`)}
        />
    );
};

const GroupOverviewWrapper = () => {
    const { groupId } = useParams();
    const navigate = useNavigate();
    const [group, setGroup] = React.useState<any | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // Derive recruiterType from localStorage user role
    const userStr = localStorage.getItem('user');
    const userObj = userStr ? JSON.parse(userStr) : null;
    const userRole: string = (userObj?.role || '').toLowerCase();
    const recruiterType: 'recruiter' | 'technical' = userRole === 'technical' ? 'technical' : 'recruiter';

    React.useEffect(() => {
        const loadGroup = async () => {
            if (!groupId) return;
            try {
                // Use the correct endpoint to get group details by ID
                const groupData = await api.recruiter.getGroupDetails(groupId);
                setGroup(groupData);
            } catch (err) {
                console.error("Failed to load group details:", err);
                setError("Failed to load group details");
            } finally {
                setLoading(false);
            }
        };
        loadGroup();
    }, [groupId]);

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen bg-[#f8fafc]">
            <p className="text-[#64748b] font-medium">Loading group details...</p>
        </div>
    );

    if (error || !group) return (
        <div className="flex items-center justify-center min-h-screen bg-[#f8fafc]">
            <p className="text-[#ef4444] font-medium">{error || "Group not found"}</p>
        </div>
    );

    // Map filtration flow from backend response — handles plain strings, {stage,...} and {type,...} objects
    const flow: ('assessment' | 'ai-interview' | 'live-interview')[] = [];
    const stageAliases: Record<string, 'assessment' | 'ai-interview' | 'live-interview'> = {
        'assessment': 'assessment',
        'ai-interview': 'ai-interview',
        'ai_interview': 'ai-interview',
        'live-interview': 'live-interview',
        'live_interview': 'live-interview',
    };
    if (Array.isArray(group.filtration_flow)) {
        group.filtration_flow.forEach((item: any) => {
            // item may be a plain string, {stage: '...'} or {type: '...'} object
            let raw: string;
            if (typeof item === 'string') {
                raw = item;
            } else if (typeof item === 'object' && item !== null) {
                raw = item.stage || item.type || '';
            } else {
                raw = '';
            }
            const mapped = stageAliases[raw.toLowerCase()];
            if (mapped && !flow.includes(mapped)) flow.push(mapped);
        });
    }

    return (
        <EnhancedGroupOverviewV2
            groupId={group.id}
            groupName={group.name}
            description={group.description || "High-performing candidates filtered by criteria"}
            assignedRecruiter={group.assigned_hr?.name || "Unassigned"}
            candidateIds={[]} // We'll let EnhancedGroupOverviewV2 fetch candidates if needed, or pass empty
            recruiterType={recruiterType}
            filtrationFlow={flow}
            onBack={() => {
                // Check if we should go back to projects with groups tab
                const url = new URL(window.location.href);
                if (url.searchParams.get('tab') === 'groups') {
                    navigate(-1);
                } else {
                    // Default fallback
                    navigate('/recruiter/projects');
                }
            }}
            onViewCandidate={(id) => navigate(`/recruiter/candidates/${id}`)}
        />
    );
};

const CandidateProfileWrapper = () => {
    const { candidateId } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    // Pass candidateId as a string (UUID) directly
    const id = candidateId ?? '';
    const applicationId = searchParams.get('applicationId') ?? undefined;

    return (
        <CandidateProfile
            candidateId={id}
            applicationId={applicationId}
            onBack={() => navigate(-1)}
        />
    );
};

const CandidateQAGAuditWrapper = () => {
    const { candidateId } = useParams();
    const [searchParams] = useSearchParams();

    const id = candidateId ?? '';
    const applicationId = searchParams.get('applicationId') ?? undefined;

    return <CandidateQAGAuditPage candidateId={id} applicationId={applicationId} />;
};

const CandidateGitHubAnalysisReviewWrapper = () => {
    const { candidateId } = useParams();
    const [searchParams] = useSearchParams();

    const id = candidateId ?? '';
    const applicationId = searchParams.get('applicationId') ?? undefined;

    return <CandidateGitHubAnalysisReviewPage candidateId={id} applicationId={applicationId} />;
};

export const router = createBrowserRouter([
    // Landing - 2 buttons (Admin & Recruiter)
    {
        path: "/",
        element: <LandingPageWrapper />,
        errorElement: <ErrorPage />,
    },

    // Admin Routes
    {
        path: "/admin/login",
        element: (
            <AdminLoginPage
                onBack={() => window.location.href = '/'}
                onSignIn={() => window.location.href = '/admin/dashboard'}
                onForgotPassword={() => window.location.href = '/admin/forgot-password'}
            />
        ),
        errorElement: <ErrorPage />,
    },
    {
        path: "/admin/forgot-password",
        element: <ForgotPasswordPage onBack={() => window.location.href = '/admin/login'} />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/admin/reset-password",
        element: <ResetPasswordPage onBack={() => window.location.href = '/admin/login'} />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/admin/dashboard",
        element: (
            <AdminProtectedRoute>
                <AdminLayout>
                    <AdminDashboard onSignOut={() => window.location.href = '/'} />
                </AdminLayout>
            </AdminProtectedRoute>
        ),
        errorElement: <ErrorPage />,
    },
    {
        path: "/admin/requests",
        element: (
            <AdminProtectedRoute>
                <AdminLayout>
                    <AdminRequests />
                </AdminLayout>
            </AdminProtectedRoute>
        ),
        errorElement: <ErrorPage />,
    },
    {
        path: "/admin/members",
        element: (
            <AdminProtectedRoute>
                <AdminLayout>
                    <AdminOrganizationMembers onSignOut={() => window.location.href = '/'} />
                </AdminLayout>
            </AdminProtectedRoute>
        ),
    },
    {
        path: "/admin/notifications",
        element: (
            <AdminProtectedRoute>
                <AdminLayout>
                    <AlertsNotifications onViewCandidate={(id) => console.log('View candidate', id)} />
                </AdminLayout>
            </AdminProtectedRoute>
        ),
    },
    {
        path: "/admin/settings",
        element: (
            <AdminProtectedRoute>
                <AdminLayout>
                    <AdminSettings onSignOut={() => window.location.href = '/'} />
                </AdminLayout>
            </AdminProtectedRoute>
        ),
    },
    {
        path: "/admin/delegation",
        element: (
            <AdminProtectedRoute>
                <AdminLayout>
                    <AdminRecruiterDelegation onSignOut={() => window.location.href = '/'} />
                </AdminLayout>
            </AdminProtectedRoute>
        ),
    },
    {
        path: "/admin/closed-positions",
        element: (
            <AdminProtectedRoute>
                <AdminLayout>
                    <AdminClosedPositions onSignOut={() => window.location.href = '/'} />
                </AdminLayout>
            </AdminProtectedRoute>
        ),
    },

    // Recruiter auth routes (no layout)
    {
        path: "/recruiter/login",
        element: (
            <RecruiterLoginPage
                onBack={() => window.location.href = '/'}
                onSignIn={() => window.location.href = '/recruiter/dashboard'}
                onForgotPassword={() => window.location.href = '/recruiter/forgot-password'}
            />
        ),
        errorElement: <ErrorPage />,
    },
    {
        path: "/recruiter/forgot-password",
        element: <RecruiterForgotPasswordPage onBack={() => window.location.href = '/recruiter/login'} />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/recruiter/reset-password",
        element: <RecruiterResetPasswordPage onBack={() => window.location.href = '/recruiter/login'} />,
        errorElement: <ErrorPage />,
    },

    // Recruiter app routes — all share RecruiterLayoutRoute (nested)
    // React Router renders each child via <Outlet />, so navigating between
    // children always gives the layout a fresh element from the router context
    // rather than a prop that might be stale. The key on <main> in the layout
    // still forces remount on every pathname change.
    {
        path: "/recruiter",
        element: <RecruiterLayoutRoute />,
        errorElement: <ErrorPage />,
        children: [
            { path: "dashboard", element: <DashboardWrapper />, errorElement: <ErrorPage /> },
            { path: "projects", element: <ProjectsPageWrapper /> },
            { path: "project/:projectId", element: <ProjectDetailWrapper /> },
            { path: "position/:positionId", element: <PositionDetailWrapper /> },
            { path: "group/:groupId", element: <GroupOverviewWrapper /> },
            { path: "alerts", element: <AlertsNotifications onViewCandidate={(id) => console.log('View candidate', id)} /> },
            { path: "suspect-review", element: <SuspectReviewWrapper /> },
            { path: "reviews", element: <ReviewRequests /> },
            { path: "reviews/:requestId/pre-matching", element: <PositionPreMatchingReviewPage /> },
            { path: "candidates", element: <CandidatesPage onBack={() => { }} /> },
            { path: "question-bank", element: <QuestionBankPage onBack={() => window.history.back()} /> },
            { path: "evidence-dashboard", element: <EvidenceDashboard /> },
            {
                path: "settings",
                element: (() => {
                    const userStr = localStorage.getItem('user');
                    const userObj = userStr ? JSON.parse(userStr) : null;
                    const userRole: string = (userObj?.role || '').toLowerCase();
                    return <RecruiterSettings userRole={userRole} />;
                })(),
            },
            { path: "suspicious-activity", element: <SuspiciousActivityLog onBack={() => window.history.back()} /> },
            { path: "candidates/:candidateId", element: <CandidateProfileWrapper /> },
            { path: "candidates/:candidateId/qag-audit", element: <CandidateQAGAuditWrapper /> },
            { path: "candidates/:candidateId/github-analysis-review", element: <CandidateGitHubAnalysisReviewWrapper /> },
            { path: "background-tasks", element: <Navigate to="/recruiter/background-tasks/dashboard" replace /> },
            { path: "background-tasks/:view", element: <BackgroundTasks /> },
        ],
    },
]);
