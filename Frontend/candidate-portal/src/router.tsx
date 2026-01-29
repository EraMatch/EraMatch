import { createBrowserRouter, Navigate, useNavigate } from 'react-router-dom';
import { CandidateLoginPage } from './components/CandidateLoginPage';
import { CandidateHomePage } from './components/CandidateHomePage';
import { CandidateDashboard } from './components/CandidateDashboard';
import { TechnicalAssessmentFlow } from './components/TechnicalAssessmentFlow';
import { RecordedInterviewFlow } from './components/RecordedInterviewFlow';
import { LiveInterviewFlow } from './components/LiveInterviewFlow';

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
    return (
        <CandidateLoginPage
            onBack={() => window.location.href = 'http://localhost:5173'}
            onSignIn={() => navigate('/home')}
        />
    );
};

const CandidateHomePageWrapper = () => {
    const navigate = useNavigate();
    return (
        <CandidateHomePage
            onOpenTestingPage={() => navigate('/testing')}
            currentStage="assessment"
        />
    );
};

const CandidateDashboardWrapper = () => {
    const navigate = useNavigate();
    return (
        <CandidateDashboard
            onSignOut={() => navigate('/login')}
            onBack={() => navigate('/home')}
            onStartRecordedInterview={() => navigate('/assessment/recorded')}
            recordedInterviewCompleted={false}
            onStartLiveInterview={() => navigate('/assessment/live')}
            liveInterviewCompleted={false}
            onStartTechnicalAssessment={() => navigate('/assessment/technical')}
            technicalAssessmentCompleted={false}
        />
    );
};

const TechnicalAssessmentWrapper = () => {
    const navigate = useNavigate();
    return (
        <TechnicalAssessmentFlow
            onSignOut={() => navigate('/login')}
            onExit={() => navigate('/testing')}
            onCompletion={() => navigate('/testing')}
        />
    );
};

const RecordedInterviewWrapper = () => {
    const navigate = useNavigate();
    return (
        <RecordedInterviewFlow
            onSignOut={() => navigate('/login')}
            onExit={() => navigate('/testing')}
            onCompletion={() => navigate('/testing')}
        />
    );
};

const LiveInterviewWrapper = () => {
    const navigate = useNavigate();
    return (
        <LiveInterviewFlow
            onSignOut={() => navigate('/login')}
            onExit={() => navigate('/testing')}
            onCompletion={() => navigate('/testing')}
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
        path: "/login",
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
]);
