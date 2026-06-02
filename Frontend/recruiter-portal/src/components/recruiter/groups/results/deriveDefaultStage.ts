export type StageLifecycle =
    | 'not_configured'
    | 'configured_not_started'
    | 'locked'
    | 'active'
    | 'closed_awaiting_decision'
    | 'closed_decided';

export type ViewMode = 'results' | 'configure';

export type StageView = 'matrix' | 'monitoring' | 'review' | 'historical' | 'pre_launch' | 'config' | 'locked';

export interface StageLifecycleInfo {
    key: string;
    lifecycle: StageLifecycle;
}

export interface GroupLifecycleInput {
    groupStatus: 'active' | 'on_hold' | 'archived' | string;
    stages: StageLifecycleInfo[];
}

export interface GroupViewState {
    stage: string; // stage key or 'overview'
    mode: ViewMode;
    view: StageView;
}

const OVERVIEW: GroupViewState = { stage: 'overview', mode: 'results', view: 'matrix' };

/**
 * Smart landing: returns the view that most needs the recruiter's attention.
 * Priority: not-configured > closed-awaiting-decision > active > configured-not-started > overview.
 */
export function deriveDefaultStage(input: GroupLifecycleInput): GroupViewState {
    const { stages } = input;

    if (stages.length === 0) {
        return OVERVIEW;
    }

    const firstNotConfigured = stages.find((s) => s.lifecycle === 'not_configured');
    if (firstNotConfigured) {
        return { stage: firstNotConfigured.key, mode: 'configure', view: 'config' };
    }

    const awaiting = stages.find((s) => s.lifecycle === 'closed_awaiting_decision');
    if (awaiting) {
        return { stage: awaiting.key, mode: 'results', view: 'review' };
    }

    const active = stages.find((s) => s.lifecycle === 'active');
    if (active) {
        return { stage: active.key, mode: 'results', view: 'monitoring' };
    }

    const readyNext = stages.find((s) => s.lifecycle === 'configured_not_started');
    if (readyNext) {
        return { stage: readyNext.key, mode: 'results', view: 'pre_launch' };
    }

    return OVERVIEW;
}
