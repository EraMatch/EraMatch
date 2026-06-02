import { useState, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import { StageNavigator } from './StageNavigator';
import { ModeToggle } from './ModeToggle';
import { parseGroupViewParams, buildGroupViewSearch } from './groupViewState';
import type { StageKey, GroupViewParams } from './groupViewState';
import { deriveDefaultStage } from './deriveDefaultStage';
import type { ViewMode } from './deriveDefaultStage';
import { derivePipelineStages } from './stageLifecycle';
import { useGroupDetail, useStageMonitoring } from '../../../../hooks/groups/useGroups';
import { OverviewMatrixView } from './OverviewMatrixView';
import { AssessmentResultsView } from './AssessmentResultsView';
import { AIInterviewResultsView } from './AIInterviewResultsView';
import { LiveInterviewResultsView } from './LiveInterviewResultsView';
import { CandidateProfile, getRailTabForStage } from '../../candidates/CandidateProfile';
import type { RailCandidate } from './CandidateRail';
import { StageReviewPage } from '../StageReviewPage';
import { monitoringToCandidates } from './monitoringToCandidates';

interface GroupPageShellProps {
    groupId: string;
    onBack: () => void;
    onOpenCandidate?: (applicationId: string, candidateId: string) => void;
    onOpenSuspectReview?: (applicationId: string) => void;
}

interface OpenProfileState {
    candidateId: string;
    applicationId: string;
}

export function GroupPageShell({
    groupId,
    onBack,
    onOpenSuspectReview,
}: GroupPageShellProps) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [openProfile, setOpenProfile] = useState<OpenProfileState | null>(null);
    const [openStageReview, setOpenStageReview] = useState(false);
    const { data: groupDetail, isLoading: groupLoading } = useGroupDetail(groupId);

    const { navItems, lifecycleStages } = useMemo(
        () =>
            groupDetail
                ? derivePipelineStages(groupDetail)
                : { navItems: [], lifecycleStages: [] },
        [groupDetail],
    );

    const groupName = (groupDetail as any)?.name ?? 'Group';
    const positionTitle = (groupDetail as any)?.position_title ?? '';
    const statusLabel = (groupDetail as any)?.status ?? '';
    const groupStatus = (groupDetail as any)?.status ?? 'active';
    const candidates = (groupDetail as any)?.candidates ?? [];

    const view: GroupViewParams = useMemo(() => {
        const hasParams = searchParams.has('stage') || searchParams.has('mode');
        if (!hasParams) {
            const d = deriveDefaultStage({ groupStatus, stages: lifecycleStages });
            return { stage: d.stage as StageKey, mode: d.mode };
        }
        return parseGroupViewParams(searchParams);
    }, [searchParams, groupStatus, lifecycleStages]);

    // Current stage's lifecycle for CTA visibility
    const currentLifecycle = lifecycleStages.find((s: any) => s.key === view.stage)?.lifecycle ?? 'locked';

    const setView = (next: GroupViewParams) => {
        const search = buildGroupViewSearch(next);
        setSearchParams(search ? new URLSearchParams(search) : {}, { replace: false });
    };

    // Rail candidates: fetch current stage monitoring (cached by React Query — same key as results view)
    const currentStageForRail = view.stage !== 'overview' ? view.stage : undefined;
    const { data: monitoringData } = useStageMonitoring(groupId, currentStageForRail);

    const railCandidates = useMemo<RailCandidate[]>(() => {
        const mc = (monitoringData as any)?.candidates ?? [];
        return mc.map((c: any) => ({
            candidateId: String(c.candidate_id),
            applicationId: String(c.application_id),
            name: c.name ?? '',
            score: c.score ?? null,
            verdict: c.verdict ?? null,
        }));
    }, [monitoringData]);

    const stageReviewCandidates = useMemo(
        () => monitoringToCandidates((monitoringData as any)?.candidates ?? [], view.stage),
        [monitoringData, view.stage],
    );

    const stageReviewPipelineSteps = useMemo(
        () => navItems.filter((n: any) => n.key !== 'overview').map((n: any) => ({ id: n.key, name: n.label })),
        [navItems],
    );

    const stageReviewCurrentIndex = stageReviewPipelineSteps.findIndex((s: any) => s.id === view.stage);
    const stageReviewIsLastStage = stageReviewCurrentIndex === stageReviewPipelineSteps.length - 1 && stageReviewCurrentIndex >= 0;

    const handlePromoteSelected = useCallback(() => {
        setOpenStageReview(true);
    }, []);

    const handleOpenCandidate = useCallback(
        (applicationId: string, candidateId: string) => {
            setOpenProfile({ candidateId, applicationId });
        },
        [],
    );

    const navigate = useNavigate();
    const handleOpenSuspectReview = useCallback(
        (applicationId: string, candidateId: string) => {
            navigate(
                `/recruiter/suspect-review?candidateId=${encodeURIComponent(candidateId)}&applicationId=${encodeURIComponent(applicationId)}`
            );
        },
        [navigate],
    );

    return (
        <div className="relative">
            {/* Main shell content — hidden (invisible + no pointer events) when profile open */}
            <div className={openProfile ? 'invisible pointer-events-none' : undefined}>
                <div className="mx-auto max-w-[1280px] px-6 py-6">
                    <button
                        type="button"
                        onClick={onBack}
                        className="mb-4 flex items-center gap-1 text-[14px] font-medium text-[#6366f1] hover:underline"
                    >
                        <ChevronLeft size={16} /> Back to Position Dashboard
                    </button>

                    <header className="mb-5">
                        <div className="flex items-center gap-3">
                            <h1 className="text-[24px] font-bold text-gray-900">{groupName}</h1>
                            <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-600">
                                {statusLabel}
                            </span>
                        </div>
                        <p className="text-[14px] text-gray-500">{positionTitle}</p>
                    </header>

                    <div className="mb-4">
                        <StageNavigator
                            items={navItems}
                            selected={view.stage}
                            onSelect={(stage) => setView({ ...view, stage })}
                            onConfigure={(stage) => setView({ stage, mode: 'configure' })}
                        />
                    </div>

                    <div className="mb-4 flex items-center justify-between gap-3">
                        <ModeToggle mode={view.mode} onChange={(mode: ViewMode) => setView({ ...view, mode })} />
                        {view.stage !== 'overview' && currentLifecycle === 'closed_awaiting_decision' && (
                            <button
                                type="button"
                                onClick={handlePromoteSelected}
                                className="flex items-center gap-2 rounded-[8px] bg-[#6366f1] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#5558e3] transition-colors shadow-sm"
                            >
                                <ArrowRight size={14} />
                                Promote Selected →
                            </button>
                        )}
                    </div>

                    {/* Main content area */}
                    <div className="min-h-[400px]">
                        {groupLoading ? (
                            <div className="space-y-3">
                                {[...Array(4)].map((_, i) => (
                                    <div key={i} className="h-14 animate-pulse rounded-[12px] bg-gray-100" />
                                ))}
                            </div>
                        ) : view.mode === 'configure' ? (
                            <div className="flex items-center justify-center rounded-[14px] border border-dashed border-gray-300 bg-gray-50 py-16">
                                <p className="text-[14px] text-gray-500">Configure mode — coming in Phase 6.</p>
                            </div>
                        ) : view.stage === 'overview' ? (
                            <OverviewMatrixView
                                candidates={candidates}
                                onOpenCandidate={handleOpenCandidate}
                            />
                        ) : view.stage === 'assessment' ? (
                            <AssessmentResultsView
                                groupId={groupId}
                                onOpenCandidate={handleOpenCandidate}
                                onOpenSuspectReview={handleOpenSuspectReview}
                            />
                        ) : view.stage === 'ai-interview' ? (
                            <AIInterviewResultsView
                                groupId={groupId}
                                onOpenCandidate={handleOpenCandidate}
                            />
                        ) : view.stage === 'live-interview' ? (
                            <LiveInterviewResultsView
                                groupId={groupId}
                                onOpenCandidate={handleOpenCandidate}
                            />
                        ) : (
                            <div className="flex items-center justify-center rounded-[14px] border border-dashed border-gray-200 bg-gray-50 py-16">
                                <p className="text-[13px] text-gray-400">Select a stage above to see results.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Inline candidate profile overlay */}
            {openProfile && (
                <div className="absolute inset-0 z-40 bg-white overflow-y-auto min-h-screen">
                    <CandidateProfile
                        candidateId={openProfile.candidateId}
                        applicationId={openProfile.applicationId}
                        onBack={() => setOpenProfile(null)}
                        initialTab={getRailTabForStage(view.stage)}
                        rail={railCandidates.length > 0 ? {
                            candidates: railCandidates,
                            activeApplicationId: openProfile.applicationId,
                            onSelect: (candidateId, applicationId) =>
                                setOpenProfile({ candidateId, applicationId }),
                        } : undefined}
                    />
                </div>
            )}

            {/* Stage review / promote overlay */}
            {openStageReview && (
                <div className="absolute inset-0 z-50 bg-white overflow-y-auto min-h-screen">
                    <StageReviewPage
                        stageName={navItems.find((n: any) => n.key === view.stage)?.label ?? ''}
                        stageId={view.stage}
                        candidates={stageReviewCandidates as any}
                        pipelineSteps={stageReviewPipelineSteps}
                        currentStageIndex={stageReviewCurrentIndex}
                        isLastStage={stageReviewIsLastStage}
                        startDate={new Date()}
                        endDate={new Date()}
                        acceptanceCriteria={{ minimumTechnicalScore: 70, allowedIntegrityRisk: 'low', requiredVerdict: 'pass' }}
                        sourceStage={view.stage as 'assessment' | 'ai-interview' | 'live-interview'}
                        onBack={() => setOpenStageReview(false)}
                        onProgressCandidates={(_selectedIds: number[], _action: 'progress' | 'reject' | 'hold') => {
                            setOpenStageReview(false);
                        }}
                        onFinalDecision={() => setOpenStageReview(false)}
                        onViewCandidate={(_id: number) => {}}
                        onPromoteAndStart={() => setOpenStageReview(false)}
                    />
                </div>
            )}
        </div>
    );
}
