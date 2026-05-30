import { useNavigate, useSearchParams } from 'react-router-dom';
import { SuspectReviewPage } from './candidates/SuspectReviewPage';

export function SuspectReviewWrapper() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const candidateId = searchParams.get('candidateId') || '4';
    const applicationId = searchParams.get('applicationId') || undefined;

    return (
        <SuspectReviewPage
            candidateId={candidateId}
            applicationId={applicationId}
            onBack={() => navigate(-1)}
            onViewCandidate={(id) => navigate(`/recruiter/candidates/${id}`)}
        />
    );
}
