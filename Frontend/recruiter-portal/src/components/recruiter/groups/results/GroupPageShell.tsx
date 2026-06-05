import { useState, useMemo, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ArrowRight, Clock, Play, XCircle, Loader2 } from 'lucide-react';
import { StageNavigator } from './StageNavigator';
import { ModeToggle } from './ModeToggle';
import { parseGroupViewParams, buildGroupViewSearch } from './groupViewState';
import type { StageKey, GroupViewParams } from './groupViewState';
import { deriveDefaultStage } from './deriveDefaultStage';
import type { ViewMode } from './deriveDefaultStage';
import { derivePipelineStages } from './stageLifecycle';
import {
    useGroupDetail,
    useStageMonitoring,
    useStartStage,
    useCloseStage,
    useBulkProgressCandidates,
} from '../../../../hooks/groups/useGroups';
import { queryKeys } from '../../../../lib/queryKeys';
import { OverviewMatrixView } from './OverviewMatrixView';
import { AssessmentResultsView } from './AssessmentResultsView';
import { AIInterviewResultsView } from './AIInterviewResultsView';
import { LiveInterviewResultsView } from './LiveInterviewResultsView';
import { CandidateProfile, getRailTabForStage } from '../../candidates/CandidateProfile';
import type { RailCandidate } from './CandidateRail';
import { StageReviewPage } from '../StageReviewPage';
import { monitoringToCandidates } from './monitoringToCandidates';
import { ActivityLogPanel } from '../ActivityLogPanel';
import { FiltrationFlowConfigModal } from '../FiltrationFlowConfigModal';
import { ConfigWizardV2 } from '../../live-interview-v2/ConfigWizardV2';

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
    const [showActivity, setShowActivity] = useState(false);
    const [toast, setToast] = useState<{ msg: string; kind: 'ok' | 'err' } | null>(null);
    const qc = useQueryClient();
    const { data: groupDetail, isLoading: groupLoading } = useGroupDetail(groupId);

    const startStage = useStartStage();
    const closeStage = useCloseStage();
    const bulkProgress = useBulkProgressCandidates();

    const showToast = useCallback((msg: string, kind: 'ok' | 'err' = 'ok') => {
        setToast({ msg, kind });
        setTimeout(() => setToast(null), 3500);
    }, []);

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

    // application_id → candidate_id lookup for onViewCandidate in StageReviewPage
    const appIdToCandId = useMemo<Record<string, string>>(() => {
        const mc = (monitoringData as any)?.candidates ?? [];
        const map: Record<string, string> = {};
        for (const c of mc) {
            map[String(c.application_id)] = String(c.candidate_id);
        }
        return map;
    }, [monitoringData]);

    const stageReviewPipelineSteps = useMemo(
        () => navItems.filter((n: any) => n.key !== 'overview').map((n: any) => ({ id: n.key, name: n.label })),
        [navItems],
    );

    const stageReviewCurrentIndex = stageReviewPipelineSteps.findIndex((s: any) => s.id === view.stage);
    const stageReviewIsLastStage = stageReviewCurrentIndex === stageReviewPipelineSteps.length - 1 && stageReviewCurrentIndex >= 0;

    const handlePromoteSelected = useCallback(() => {
        setOpenStageReview(true);
    }, []);

    const stageLabel = useCallback(
        (key: string) => navItems.find((n: any) => n.key === key)?.label ?? key,
        [navItems],
    );

    const handleStartStage = useCallback(async () => {
        try {
            await startStage.mutateAsync({ groupId, stage: view.stage });
            qc.invalidateQueries({ queryKey: queryKeys.groups.stageMonitoring(groupId, view.stage) });
            showToast(`${stageLabel(view.stage)} stage started — invitations sent`);
        } catch (err: any) {
            showToast(err?.message || 'Failed to start stage — please try again', 'err');
        }
    }, [startStage, groupId, view.stage, qc, showToast, stageLabel]);

    const handleCloseStage = useCallback(async () => {
        try {
            const res: any = await closeStage.mutateAsync({ groupId, stage: view.stage });
            qc.invalidateQueries({ queryKey: queryKeys.groups.stageMonitoring(groupId, view.stage) });
            const autoFailed = res?.auto_failed_count ?? 0;
            showToast(
                autoFailed > 0
                    ? `${stageLabel(view.stage)} closed — ${autoFailed} candidate(s) auto-failed`
                    : `${stageLabel(view.stage)} stage closed`,
            );
        } catch (err: any) {
            showToast(err?.message || 'Failed to close stage — please try again', 'err');
        }
    }, [closeStage, groupId, view.stage, qc, showToast, stageLabel]);

    // StageReviewPage fires onProgressCandidates('progress') and THEN onPromoteAndStart()
    // synchronously for the "Promote & Start Next" button. We queue the action and flush it
    // once on the next microtask, so the bulk call runs exactly once with the right startNext.
    const pendingBulkRef = useRef<{ indices: number[]; action: 'progress' | 'reject' | 'hold'; startNext: boolean } | null>(null);
    const flushScheduledRef = useRef(false);

    // Maps selected StageReviewPage indices → real application UUIDs, calls bulk-progress,
    // and (optionally) starts the next stage.
    const runBulkProgress = useCallback(
        async (selectedIndices: number[], action: 'progress' | 'reject' | 'hold', startNext: boolean) => {
            const appIds = selectedIndices
                .map((i) => stageReviewCandidates[i]?.applicationId ?? '')
                .filter(Boolean);
            if (appIds.length === 0) {
                setOpenStageReview(false);
                return;
            }
            try {
                await bulkProgress.mutateAsync({
                    groupId,
                    payload: { application_ids: appIds, action, current_stage_type: view.stage },
                });
                qc.invalidateQueries({ queryKey: queryKeys.groups.stageMonitoring(groupId, view.stage) });
                qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });

                const verb = action === 'progress' ? 'progressed' : action === 'reject' ? 'rejected' : 'held';
                showToast(`${appIds.length} candidate(s) ${verb}`);

                if (startNext && action === 'progress') {
                    const nextStage = stageReviewPipelineSteps[stageReviewCurrentIndex + 1]?.id;
                    if (nextStage) {
                        try {
                            await startStage.mutateAsync({ groupId, stage: nextStage });
                            qc.invalidateQueries({ queryKey: queryKeys.groups.detail(groupId) });
                            showToast(`${stageLabel(nextStage)} stage started — invitations sent`);
                            setView({ stage: nextStage as StageKey, mode: 'results' });
                        } catch (err: any) {
                            showToast(err?.message || 'Promoted, but failed to start next stage', 'err');
                        }
                    }
                }
            } catch (err: any) {
                showToast(err?.message || 'Bulk action failed — please try again', 'err');
            } finally {
                setOpenStageReview(false);
            }
        },
        [bulkProgress, startStage, groupId, view.stage, qc, showToast, stageLabel,
         stageReviewCandidates, stageReviewPipelineSteps, stageReviewCurrentIndex],
    );

    const scheduleBulkFlush = useCallback(() => {
        if (flushScheduledRef.current) return;
        flushScheduledRef.current = true;
        queueMicrotask(() => {
            flushScheduledRef.current = false;
            const p = pendingBulkRef.current;
            pendingBulkRef.current = null;
            if (p) void runBulkProgress(p.indices, p.action, p.startNext);
        });
    }, [runBulkProgress]);

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
                        <div className="flex items-center gap-2 mt-3">
                            <button
                                type="button"
                                onClick={() => setShowActivity((v) => !v)}
                                className="flex items-center gap-1.5 rounded-[8px] border border-gray-200 bg-white px-3 py-1.5 text-[12px] font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                <Clock size={13} />
                                {showActivity ? 'Hide Activity' : 'Activity'}
                            </button>
                        </div>
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

                        {view.stage !== 'overview' && currentLifecycle === 'configured_not_started' && (
                            <button
                                type="button"
                                onClick={handleStartStage}
                                disabled={startStage.isPending}
                                className="flex items-center gap-2 rounded-[8px] bg-[#6366f1] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#5558e3] disabled:bg-[#9ca3af] disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                {startStage.isPending ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                                {startStage.isPending ? 'Starting…' : 'Start Stage'}
                            </button>
                        )}

                        {view.stage !== 'overview' && currentLifecycle === 'active' && (
                            <button
                                type="button"
                                onClick={handleCloseStage}
                                disabled={closeStage.isPending}
                                className="flex items-center gap-2 rounded-[8px] bg-[#ef4444] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#dc2626] disabled:bg-[#9ca3af] disabled:cursor-not-allowed transition-colors shadow-sm"
                            >
                                {closeStage.isPending ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                {closeStage.isPending ? 'Closing…' : 'Close Stage'}
                            </button>
                        )}

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
                            view.stage === 'live-interview' ? (
                                <ConfigWizardV2
                                    groupId={groupId}
                                    stageId="live_interview"
                                    onComplete={() => setView({ ...view, mode: 'results' })}
                                />
                            ) : (
                                <FiltrationFlowConfigModal
                                    groupData={groupDetail}
                                    onClose={() => setView({ ...view, mode: 'results' })}
                                    onSave={(_flow, _count) => setView({ ...view, mode: 'results' })}
                                />
                            )
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
                        onProgressCandidates={(selectedIndices: number[], action: 'progress' | 'reject' | 'hold') => {
                            // Queue; flushed once on microtask (onPromoteAndStart may flip startNext first).
                            pendingBulkRef.current = { indices: selectedIndices, action, startNext: false };
                            scheduleBulkFlush();
                        }}
                        onFinalDecision={() => {
                            // Progress was already queued by onProgressCandidates; just close after flush.
                            setOpenStageReview(false);
                        }}
                        onViewCandidate={(idx: number) => {
                            // Open the inline candidate profile for the candidate at this index
                            const item = stageReviewCandidates[idx];
                            if (item) {
                                const candId = appIdToCandId[item.applicationId];
                                if (candId) setOpenProfile({ candidateId: candId, applicationId: item.applicationId });
                            }
                        }}
                        onPromoteAndStart={() => {
                            // Fires synchronously right after onProgressCandidates — flip the queued intent.
                            if (pendingBulkRef.current) pendingBulkRef.current.startNext = true;
                        }}
                    />
                </div>
            )}

            {/* Activity drawer */}
            {showActivity && (
                <div className="absolute right-0 top-0 z-30 h-full w-[420px] bg-white shadow-2xl border-l border-gray-200 overflow-y-auto">
                    <ActivityLogPanel
                        groupId={groupId}
                        groupName={groupName}
                        onClose={() => setShowActivity(false)}
                        isInline={true}
                    />
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div
                    className={`fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-[10px] px-4 py-2.5 text-[13px] font-medium text-white shadow-lg ${
                        toast.kind === 'err' ? 'bg-[#ef4444]' : 'bg-gray-900'
                    }`}
                    role="status"
                >
                    {toast.msg}
                </div>
            )}
        </div>
    );
}
