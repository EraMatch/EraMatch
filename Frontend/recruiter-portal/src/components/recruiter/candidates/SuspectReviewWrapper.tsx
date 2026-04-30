import { useNavigate, useSearchParams } from 'react-router-dom';
import { SuspectReviewPage } from './SuspectReviewPage';

export function SuspectReviewWrapper() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const candidateId = searchParams.get('candidateId') || '';
    const applicationId = searchParams.get('applicationId') || undefined;

    if (!candidateId) {
        return (
            <div className="min-h-screen flex items-center justify-center p-8">
                <div className="text-center">
                    <h2 className="text-[#111827] text-[20px] mb-2">Missing candidate reference</h2>
                    <p className="text-[#6b7280] text-[14px] mb-4">
                        Open suspect review from suspicious activity entries.
                    </p>
                    <button
                        onClick={() => navigate('/recruiter/suspicious-activity')}
                        className="h-[40px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white"
                    >
                        Back to Suspicious Activity
                    </button>
                </div>
            </div>
        );
    }

    return (
        <SuspectReviewPage
            candidateId={candidateId}
            applicationId={applicationId}
            onBack={() => navigate(-1)}
            onViewCandidate={(id) => navigate(`/recruiter/candidates/${id}`)}
        />
    );
}
