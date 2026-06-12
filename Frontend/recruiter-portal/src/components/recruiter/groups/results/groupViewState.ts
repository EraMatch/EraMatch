import type { ViewMode } from './deriveDefaultStage';

export const STAGE_KEYS = ['overview', 'assessment', 'ai-interview', 'live-interview'] as const;
export type StageKey = (typeof STAGE_KEYS)[number];

export interface GroupViewParams {
    stage: StageKey;
    mode: ViewMode;
}

const DEFAULT_PARAMS: GroupViewParams = { stage: 'overview', mode: 'results' };

function isStageKey(v: string | null): v is StageKey {
    return v !== null && (STAGE_KEYS as readonly string[]).includes(v);
}

function isMode(v: string | null): v is ViewMode {
    return v === 'results' || v === 'configure';
}

export function parseGroupViewParams(search: URLSearchParams): GroupViewParams {
    const rawStage = search.get('stage');
    const rawMode = search.get('mode');
    return {
        stage: isStageKey(rawStage) ? rawStage : DEFAULT_PARAMS.stage,
        mode: isMode(rawMode) ? rawMode : DEFAULT_PARAMS.mode,
    };
}

export function buildGroupViewSearch(params: GroupViewParams): string {
    const sp = new URLSearchParams();
    if (params.stage !== DEFAULT_PARAMS.stage) {
        sp.set('stage', params.stage);
    }
    if (params.mode !== DEFAULT_PARAMS.mode) {
        sp.set('mode', params.mode);
    }
    return sp.toString();
}
