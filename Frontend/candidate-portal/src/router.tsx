import { createBrowserRouter, Navigate, useNavigate, useParams } from 'react-router-dom';
import { CandidateLoginPage } from './components/CandidateLoginPage';
import { CandidateHomePage } from './components/CandidateHomePage';
import { CandidateDashboard } from './components/CandidateDashboard';
import { TechnicalAssessmentFlow } from './components/TechnicalAssessmentFlow';
import { RecordedInterviewFlow } from './components/RecordedInterviewFlow';
import { LiveInterviewFlow } from './components/LiveInterviewFlow';
import { InterviewMonitoringPage } from './components/InterviewMonitoringPage';

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

// Wrapper Components for Navigation
const CandidateLoginWrapper = () => {
    const navigate = useNavigate();
    const { groupId } = useParams();
    
    return (
        <CandidateLoginPage
            onBack={() => window.location.href = 'http://localhost:5173'}
            onSignIn={() => navigate('/home')}
            groupId={groupId}
        />
    );
};

// CandidateHomePage fetches stage from the API – no hardcoded currentStage
const CandidateHomePageWrapper = () => {
    const navigate = useNavigate();
    return (
        <CandidateHomePage
            onOpenTestingPage={() => navigate('/testing')}
        />
    );
};

// CandidateDashboard fetches completion status itself from the API
const CandidateDashboardWrapper = () => {
    const navigate = useNavigate();
    return (
        <CandidateDashboard
            onSignOut={() => navigate('/login')}
            onBack={() => navigate('/home')}
            onStartRecordedInterview={() => navigate('/assessment/recorded')}
            onStartLiveInterview={() => navigate('/assessment/live')}
            onStartTechnicalAssessment={() => navigate('/assessment/technical')}
        />
    );
};

const TechnicalAssessmentWrapper = () => {
    const navigate = useNavigate();
    return (
        <TechnicalAssessmentFlow
            onSignOut={() => navigate('/login')}
            onExit={() => navigate('/home')}
            onCompletion={() => navigate('/home')}
        />
    );
};

const RecordedInterviewWrapper = () => {
    const navigate = useNavigate();
    return (
        <RecordedInterviewFlow
            onSignOut={() => navigate('/login')}
            onExit={() => navigate('/home')}
            onCompletion={() => navigate('/home')}
        />
    );
};

const LiveInterviewWrapper = () => {
    const navigate = useNavigate();
    return (
        <LiveInterviewFlow
            onSignOut={() => navigate('/login')}
            onExit={() => navigate('/home')}
            onCompletion={() => navigate('/home')}
        />
    );
};

export const router = createBrowserRouter([
    {
        path: "/",
        element: <Navigate to="/login" replace />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/login/:groupId?",
        element: <CandidateLoginWrapper />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/home",
        element: <CandidateHomePageWrapper />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/testing",
        element: <CandidateDashboardWrapper />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/assessment/technical",
        element: <TechnicalAssessmentWrapper />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/assessment/recorded",
        element: <RecordedInterviewWrapper />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/assessment/live",
        element: <LiveInterviewWrapper />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/interview/video",
        element: <RecordedInterviewWrapper />,
        errorElement: <ErrorPage />,
    },
    {
        path: "/monitoring",
        element: <InterviewMonitoringPage />,
        errorElement: <ErrorPage />,
    },
]);
