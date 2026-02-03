import { useNavigate, useParams } from 'react-router-dom';
import { SuspectReviewPage } from './SuspectReviewPage';

export function SuspectReviewWrapper() {
    const navigate = useNavigate();
    // In a real app, we might fetch the specific suspicious candidate ID from the URL or a context.
    // For this mock/demo, we'll assume candidate ID 4 based on the previous context or a safe default.
    // The user interaction just wants to see the page.

    return (
        <SuspectReviewPage
            candidateId={4}
            candidateName="Michael Chen"
            groupId="101"
            groupName="Frontend Engineering Team"
            currentModule="Assessment"
            onBack={() => navigate(-1)}
            onViewCandidate={(id) => navigate(`/recruiter/candidates/${id}`)}
        />
    );
}
