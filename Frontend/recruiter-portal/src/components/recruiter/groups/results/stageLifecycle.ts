import type { StageNavItem } from './StageNavigator';
import type { StageLifecycle } from './deriveDefaultStage';

export interface DerivedStages {
    navItems: StageNavItem[];
    lifecycleStages: Array<{ key: string; lifecycle: StageLifecycle }>;
}

const STAGE_LABELS: Record<string, string> = {
    overview: 'Overview',
    assessment: 'Assessment',
    'ai-interview': 'AI Interview',
    'ai_interview': 'AI Interview',
    'live-interview': 'Live Interview',
    'live_interview': 'Live Interview',
};

/** Normalize backend stage_type key (underscores/dashes) to frontend key (hyphens). */
function normalizeKey(id: string): string {
    return id.toLowerCase().replace(/_/g, '-');
}

/**
 * Extract a stage key from a filtration_flow item.
 * Backend returns either a string ("assessment") or an object ({order, stage, status}).
 */
function extractFlowStageKey(item: any): string {
    if (typeof item === 'string') return normalizeKey(item);
    // FiltrationFlowStage object: {order, stage, status}
    return normalizeKey((item.stage ?? item.type ?? '').toString());
}

function stateToLifecycle(
    state: string,
    hasConfig: boolean,
    inFlow: boolean,
): StageLifecycle {
    if (!inFlow) return 'locked';
    const normalized = state.toLowerCase().replace(/-/g, '_');
    if (normalized === 'active') return 'active';
    if (normalized === 'closed') return 'closed_awaiting_decision';
    // not_started: need a config to be ready
    return hasConfig ? 'configured_not_started' : 'not_configured';
}

/**
 * Derives navItems and lifecycleStages from the raw GroupDetailResponse.
 * Reads: detail.filtration_flow (or filtrationFlow), detail.pipeline_stages (or pipelineStages).
 * filtration_flow items may be strings OR FiltrationFlowStage objects {order, stage, status}.
 */
export function derivePipelineStages(detail: any): DerivedStages {
    const rawFlow: any[] = detail.filtration_flow ?? detail.filtrationFlow ?? [];
    const flow: string[] = rawFlow.map(extractFlowStageKey).filter(Boolean);
    const rawStages: any[] = detail.pipeline_stages ?? detail.pipelineStages ?? [];

    // Index pipeline_stages by normalized key
    const stageMap = new Map<string, any>();
    for (const s of rawStages) {
        const key = normalizeKey(s.id ?? s.name ?? '');
        stageMap.set(key, s);
    }

    const lifecycleStages: DerivedStages['lifecycleStages'] = [];
    const stageNavItems: StageNavItem[] = [];

    // All known stage keys = union of flow + any extra pipeline_stages
    const allKeys = new Set([...flow, ...Array.from(stageMap.keys())]);

    for (const key of allKeys) {
        if (key === 'overview') continue;
        const s = stageMap.get(key);
        const inFlow = flow.includes(key);
        const lifecycle = stateToLifecycle(
            s?.state ?? 'not_started',
            // has_config from new backend field; fall back to legacy config_id truthy check
            !!(s?.has_config ?? s?.config_id),
            inFlow,
        );

        lifecycleStages.push({ key, lifecycle });
        stageNavItems.push({
            key: key as any,
            label: STAGE_LABELS[key] ?? key,
            lifecycle,
            completed: s?.completed ?? undefined,
            total: s?.total ?? undefined,
        });
    }

    // Sort by flow order (in-flow first, then alphabetical for extras)
    const sortFn = (a: { key: string }, b: { key: string }) => {
        const ai = flow.indexOf(a.key);
        const bi = flow.indexOf(b.key);
        if (ai === -1 && bi === -1) return a.key.localeCompare(b.key);
        if (ai === -1) return 1;
        if (bi === -1) return -1;
        return ai - bi;
    };
    lifecycleStages.sort(sortFn);
    stageNavItems.sort(sortFn);

    const overviewItem: StageNavItem = {
        key: 'overview',
        label: 'Overview',
        lifecycle: 'overview' as any,
    };

    return {
        navItems: [overviewItem, ...stageNavItems],
        lifecycleStages,
    };
}
