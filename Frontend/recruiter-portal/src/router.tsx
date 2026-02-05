import { createBrowserRouter, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import React from 'react';
import { Toaster } from 'sonner';
import { AdminLoginPage } from './components/admin/AdminLoginPage';
import { ForgotPasswordPage } from './components/admin/ForgotPasswordPage';
import { ResetPasswordPage } from './components/admin/ResetPasswordPage';
import { RecruiterLoginPage } from './components/recruiter/auth/RecruiterLoginPage';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminSettings } from './components/admin/AdminSettings';
import { AdminRecruiterDelegation } from './components/admin/AdminRecruiterDelegation';
import { AdminClosedPositions } from './components/admin/AdminClosedPositions';
import { AdminSubscriptionManagement } from './components/admin/AdminSubscriptionManagement';
import { AdminOrganizationMembers } from './components/admin/AdminOrganizationMembers';
import { AdminSidebar } from './components/admin/AdminSidebar';
import { Sidebar } from './components/recruiter/layout/Sidebar';
import { Dashboard } from './components/recruiter/dashboard/Dashboard';
import { ProjectsPage } from './components/recruiter/projects/ProjectsPage';
import { CandidatesPage } from './components/recruiter/candidates/CandidatesPage';
import { QuestionBankPage } from './components/recruiter/assessments/QuestionBankPage';
import { CandidateProfile } from './components/recruiter/candidates/CandidateProfile';
import { AlertsNotifications } from './components/common/AlertsNotifications';
import { EnhancedGroupOverviewV2 } from './components/recruiter/groups/EnhancedGroupOverviewV2';
import { LandingPage } from './components/common/LandingPage';
import { SuspectReviewWrapper } from './components/recruiter/candidates/SuspectReviewWrapper';
import { RecruiterSettings } from './components/recruiter/settings/RecruiterSettings';
import { SuspiciousActivityLog } from './components/recruiter/dashboard/SuspiciousActivityLog';
import { api, PositionGroup } from './services/api';

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
            <div className="ml-20">
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
    const [group, setGroup] = React.useState<PositionGroup | null>(null);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const loadGroup = async () => {
            if (!groupId) return;
            try {
                const groups = await api.recruiter.getProjectGroups('1');
                const found = groups.find(g => g.id.toString() === groupId);
                if (found) setGroup(found);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        loadGroup();
    }, [groupId]);

    if (loading) return <div className="p-8">Loading group...</div>;
    if (!group) return <div className="p-8">Group not found</div>;

    const flow: ('assessment' | 'ai-interview' | 'live-interview')[] = [];
    if (group.hasAssessment) flow.push('assessment');
    if (group.hasAIInterview) flow.push('ai-interview');
    if (group.hasLiveInterview) flow.push('live-interview');

    return (
        <EnhancedGroupOverviewV2
            groupId={group.id.toString()}
            groupName={group.groupName}
            description="High-performing candidates filtered by criteria"
            assignedRecruiter={"John Doe - Senior Recruiter"}
            candidateIds={[1, 2, 3, 4, 5, 6, 7, 8]}
            recruiterType="technical"
            filtrationFlow={flow}
            onBack={() => navigate(-1)}
            onViewCandidate={(id) => navigate(`/recruiter/candidates/${id}`)}
        />
    );
};

const CandidateProfileWrapper = () => {
    const { candidateId } = useParams();
    const navigate = useNavigate();

    // Ensure candidateId is a number
    const id = candidateId ? parseInt(candidateId, 10) : 0;

    return (
        <CandidateProfile
            candidateId={id}
            onBack={() => navigate(-1)}
            onViewKnowledgeGraph={() => console.log('View Knowledge Graph')}
        />
    );
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
            <AdminLayout>
                <AdminDashboard onSignOut={() => window.location.href = '/'} />
            </AdminLayout>
        ),
        errorElement: <ErrorPage />,
    },
    {
        path: "/admin/members",
        element: (
            <AdminLayout>
                <AdminOrganizationMembers onSignOut={() => window.location.href = '/'} />
            </AdminLayout>
        ),
    },
    {
        path: "/admin/settings",
        element: (
            <AdminLayout>
                <AdminSettings onSignOut={() => window.location.href = '/'} />
            </AdminLayout>
        ),
    },
    {
        path: "/admin/delegation",
        element: (
            <AdminLayout>
                <AdminRecruiterDelegation onSignOut={() => window.location.href = '/'} />
            </AdminLayout>
        ),
    },
    {
        path: "/admin/closed-positions",
        element: (
            <AdminLayout>
                <AdminClosedPositions onSignOut={() => window.location.href = '/'} />
            </AdminLayout>
        ),
    },
    {
        path: "/admin/subscription",
        element: (
            <AdminLayout>
                <AdminSubscriptionManagement onSignOut={() => window.location.href = '/'} />
            </AdminLayout>
        ),
    },

    // Recruiter Routes
    {
        path: "/recruiter/login",
        element: <RecruiterLoginPage onBack={() => window.location.href = '/'} onSignIn={() => window.location.href = '/recruiter/dashboard'} />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/recruiter/dashboard",
        element: (
            <RecruiterLayout>
                <DashboardWrapper />
            </RecruiterLayout>
        ),
        errorElement: <ErrorPage />,
    },
    {
        path: "/recruiter/projects",
        element: (
            <RecruiterLayout>
                <ProjectsPageWrapper />
            </RecruiterLayout>
        ),
    },
    {
        path: "/recruiter/group/:groupId",
        element: (
            <RecruiterLayout>
                <GroupOverviewWrapper />
            </RecruiterLayout>
        ),
    },
    {
        path: "/recruiter/alerts",
        element: (
            <RecruiterLayout>
                <AlertsNotifications onViewCandidate={(id) => console.log('View candidate', id)} />
            </RecruiterLayout>
        )
    },
    {
        path: "/recruiter/suspect-review",
        element: (
            <RecruiterLayout>
                <SuspectReviewWrapper />
            </RecruiterLayout>
        )
    },
    {
        path: "/recruiter/candidates",
        element: (
            <RecruiterLayout>
                <CandidatesPage onBack={() => { }} />
            </RecruiterLayout>
        ),
    },
    {
        path: "/recruiter/question-bank",
        element: (
            <RecruiterLayout>
                <QuestionBankPage onBack={() => window.history.back()} />
            </RecruiterLayout>
        )
    },
    {
        path: "/recruiter/settings",
        element: (
            <RecruiterLayout>
                <RecruiterSettings />
            </RecruiterLayout>
        )
    },
    {
        path: "/recruiter/suspicious-activity",
        element: (
            <RecruiterLayout>
                <SuspiciousActivityLog onBack={() => window.history.back()} />
            </RecruiterLayout>
        )
    },
    {
        path: "/recruiter/candidates/:candidateId",
        element: (
            <RecruiterLayout>
                <CandidateProfileWrapper />
            </RecruiterLayout>
        ),
    },
]);
