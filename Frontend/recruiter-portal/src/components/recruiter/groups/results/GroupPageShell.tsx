import { useState, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
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

    const handleOpenCandidate = useCallback(
        (applicationId: string, candidateId: string) => {
            setOpenProfile({ candidateId, applicationId });
        },
        [],
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

                    <div className="mb-4 flex items-center justify-between">
                        <ModeToggle mode={view.mode} onChange={(mode: ViewMode) => setView({ ...view, mode })} />
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
                                onOpenSuspectReview={onOpenSuspectReview}
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
        </div>
    );
}
