import { createBrowserRouter, useNavigate, useSearchParams, useParams } from 'react-router-dom';
import React from 'react';
import { AdminLoginPage } from './components/admin/AdminLoginPage';
import { RecruiterLoginPage } from './components/recruiter/RecruiterLoginPage';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminSettings } from './components/admin/AdminSettings';
import { AdminRecruiterDelegation } from './components/admin/AdminRecruiterDelegation';
import { AdminClosedPositions } from './components/admin/AdminClosedPositions';
import { AdminSubscriptionManagement } from './components/admin/AdminSubscriptionManagement';
import { AdminOrganizationMembers } from './components/admin/AdminOrganizationMembers';
import { AdminSidebar } from './components/admin/AdminSidebar';
import { Sidebar } from './components/recruiter/Sidebar';
import { Dashboard } from './components/recruiter/Dashboard';
import { ProjectsPage } from './components/recruiter/ProjectsPage';
import { CandidatesPage } from './components/recruiter/CandidatesPage';
import { QuestionBankPage } from './components/recruiter/QuestionBankPage';
import { AlertsNotifications } from './components/common/AlertsNotifications';
import { EnhancedGroupOverviewV2 } from './components/recruiter/EnhancedGroupOverviewV2';
import { LandingPage } from './components/common/LandingPage';
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
        <div className="min-h-screen" style={{ backgroundColor: '#EDF0F8' }}>
            <AdminSidebar />
            <div className="ml-20">
                <main>{children}</main>
            </div>
        </div>
    );
};

const RecruiterLayout = ({ children }: { children: React.ReactNode }) => {
    return (
        <div className="min-h-screen" style={{ backgroundColor: '#EDF0F8' }}>
            <Sidebar />
            <div className="ml-[96px] transition-all duration-300">
                <main>{children}</main>
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
        />
    );
};

const ProjectsPageWrapper = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const initialProjectTitle = searchParams.get('project') || undefined;

    return (
        <ProjectsPage
            onViewProject={(title) => navigate(`/recruiter/projects?project=${encodeURIComponent(title)}`)}
            initialProjectTitle={initialProjectTitle}
            onBackToDashboard={() => navigate('/recruiter/dashboard')}
            onCreateAssessment={() => console.log('Create Assessment')}
            onViewDashboard={(title, position) => navigate(`/recruiter/dashboard`)}
            onViewGroup={(groupId) => navigate(`/recruiter/group/${groupId}`)}
            pendingAssessment={null}
            onAssessmentConsumed={() => { }}
            returnToGroupsTab={false}
            initialPosition=""
            onPositionSelect={() => { }}
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
            onViewCandidate={(id) => console.log('View candidate', id)}
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
        element: <AdminLoginPage onBack={() => window.location.href = '/'} onSignIn={() => window.location.href = '/admin/dashboard'} />,
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
                <div className="p-8"><h1 className="text-2xl font-bold">Settings</h1><p>Settings page content placeholder</p></div>
            </RecruiterLayout>
        )
    },
]);
