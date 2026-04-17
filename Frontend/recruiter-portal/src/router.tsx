import { createBrowserRouter, useNavigate, useSearchParams, useParams, Navigate } from 'react-router-dom';
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
import { CandidateQAGAuditPage } from './components/recruiter/candidates/CandidateQAGAuditPage';
import { AlertsNotifications } from './components/common/AlertsNotifications';
import { EnhancedGroupOverviewV2 } from './components/recruiter/groups/EnhancedGroupOverviewV2';
import { LandingPage } from './components/common/LandingPage';
import { SuspectReviewWrapper } from './components/recruiter/candidates/SuspectReviewWrapper';
import { RecruiterSettings } from './components/recruiter/settings/RecruiterSettings';
import { SuspiciousActivityLog } from './components/recruiter/dashboard/SuspiciousActivityLog';
import { BackgroundTasks } from './components/recruiter/dashboard/BackgroundTasks';
import { ReviewRequests } from './components/recruiter/reviews/ReviewRequests';
import { api, PositionGroup } from './services/api';

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

const RecruiterLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="min-h-screen bg-[#edf0f8]">
            <Sidebar />
            <div className="ml-[96px] transition-all duration-300">
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

const RecruiterProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    if (!token || !user) {
        return <Navigate to="/recruiter/login" replace />;
    }
    return <>{children}</>;
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
    return (
        <Dashboard
            onViewAllProjects={() => navigate('/recruiter/projects')}
            onViewProject={(title) => navigate(`/recruiter/projects?project=${encodeURIComponent(title)}`)}
            onViewSuspicious={() => navigate('/recruiter/suspicious-activity')}
        />
    );
};

const ProjectsPageWrapper = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const initialProjectTitle = searchParams.get('project') || undefined;
    const initialPosition = searchParams.get('position') || undefined;

    const handlePositionSelect = (positionTitle: string) => {
        // Update URL with position param without reloading
        const newParams = new URLSearchParams(searchParams);
        if (positionTitle) {
            newParams.set('position', positionTitle);
        } else {
            newParams.delete('position');
        }
        setSearchParams(newParams);
    };

    return (
        <ProjectsPage
            onViewProject={(title) => {
                // When viewing a project, we might want to clear position or keep it? 
                // Usually viewing a project starts without a specific position unless specified.
                // But the helper usually just navigates.
                navigate(`/recruiter/projects?project=${encodeURIComponent(title)}`);
            }}
            initialProjectTitle={initialProjectTitle}
            onBackToDashboard={() => navigate('/recruiter/dashboard')}
            onCreateAssessment={() => console.log('Create Assessment')}
            onViewDashboard={(title, position) => navigate(`/recruiter/dashboard`)}
            onViewGroup={(groupId) => {
                // Before navigating to the group, update the *current* URL (in history) to include tab=groups
                // This ensures that when the user clicks 'Back', they return to the Groups tab
                const url = new URL(window.location.href);
                url.searchParams.set('tab', 'groups');
                window.history.replaceState(window.history.state, '', url);

                navigate(`/recruiter/group/${groupId}`);
            }}
            pendingAssessment={null}
            onAssessmentConsumed={() => { }}
            returnToGroupsTab={searchParams.get('tab') === 'groups'}
            initialPosition={initialPosition}
            onPositionSelect={handlePositionSelect}
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

    // Recruiter Routes
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
    {
        path: "/recruiter/dashboard",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <DashboardWrapper />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        ),
        errorElement: <ErrorPage />,
    },
    {
        path: "/recruiter/projects",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <ProjectsPageWrapper />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        ),
    },
    {
        path: "/recruiter/group/:groupId",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <GroupOverviewWrapper />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        ),
    },
    {
        path: "/recruiter/alerts",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <AlertsNotifications onViewCandidate={(id) => console.log('View candidate', id)} />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        )
    },
    {
        path: "/recruiter/suspect-review",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <SuspectReviewWrapper />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        )
    },
    {
        path: "/recruiter/reviews",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <ReviewRequests />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        )
    },
    {
        path: "/recruiter/candidates",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <CandidatesPage onBack={() => { }} />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        ),
    },
    {
        path: "/recruiter/question-bank",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <QuestionBankPage onBack={() => window.history.back()} />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        )
    },
    {
        path: "/recruiter/settings",
        element: (() => {
            const userStr = localStorage.getItem('user');
            const userObj = userStr ? JSON.parse(userStr) : null;
            const userRole: string = (userObj?.role || '').toLowerCase();
            return (
                <RecruiterProtectedRoute>
                    <RecruiterLayout>
                        <RecruiterSettings userRole={userRole} />
                    </RecruiterLayout>
                </RecruiterProtectedRoute>
            );
        })()
    },
    {
        path: "/recruiter/suspicious-activity",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <SuspiciousActivityLog onBack={() => window.history.back()} />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        )
    },
    {
        path: "/recruiter/candidates/:candidateId",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <CandidateProfileWrapper />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        ),
    },
    {
        path: "/recruiter/candidates/:candidateId/qag-audit",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <CandidateQAGAuditWrapper />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        ),
    },
    {
        path: "/recruiter/background-tasks",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <Navigate to="/recruiter/background-tasks/dashboard" replace />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        )
    },
    {
        path: "/recruiter/background-tasks/:view",
        element: (
            <RecruiterProtectedRoute>
                <RecruiterLayout>
                    <BackgroundTasks />
                </RecruiterLayout>
            </RecruiterProtectedRoute>
        )
    },
]);
