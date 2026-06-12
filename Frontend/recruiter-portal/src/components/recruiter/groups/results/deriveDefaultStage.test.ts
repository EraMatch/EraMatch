import { describe, it, expect } from 'vitest';
import { deriveDefaultStage } from './deriveDefaultStage';
import type { GroupViewState, StageLifecycle } from './deriveDefaultStage';

function stage(key: string, lifecycle: StageLifecycle) {
    return { key, lifecycle };
}

describe('deriveDefaultStage', () => {
    it('returns first stage in configure mode when group not configured', () => {
        const r = deriveDefaultStage({
            groupStatus: 'on_hold',
            stages: [stage('assessment', 'not_configured'), stage('ai-interview', 'locked')],
        });
        expect(r).toEqual<GroupViewState>({ stage: 'assessment', mode: 'configure', view: 'config' });
    });

    it('lands on a closed-awaiting-decision stage in review mode (the core moment)', () => {
        const r = deriveDefaultStage({
            groupStatus: 'active',
            stages: [
                stage('assessment', 'closed_awaiting_decision'),
                stage('ai-interview', 'locked'),
            ],
        });
        expect(r).toEqual<GroupViewState>({ stage: 'assessment', mode: 'results', view: 'review' });
    });

    it('lands on an active stage in monitoring mode', () => {
        const r = deriveDefaultStage({
            groupStatus: 'active',
            stages: [stage('assessment', 'active'), stage('ai-interview', 'locked')],
        });
        expect(r).toEqual<GroupViewState>({ stage: 'assessment', mode: 'results', view: 'monitoring' });
    });

    it('lands on a configured-not-started stage (pre-launch) when prior is decided', () => {
        const r = deriveDefaultStage({
            groupStatus: 'active',
            stages: [
                stage('assessment', 'closed_decided'),
                stage('ai-interview', 'configured_not_started'),
            ],
        });
        expect(r).toEqual<GroupViewState>({ stage: 'ai-interview', mode: 'results', view: 'pre_launch' });
    });

    it('prioritizes awaiting-decision over active when both exist', () => {
        const r = deriveDefaultStage({
            groupStatus: 'active',
            stages: [
                stage('assessment', 'closed_awaiting_decision'),
                stage('ai-interview', 'active'),
            ],
        });
        expect(r.stage).toBe('assessment');
        expect(r.view).toBe('review');
    });

    it('falls back to overview when nothing needs attention', () => {
        const r = deriveDefaultStage({
            groupStatus: 'active',
            stages: [
                stage('assessment', 'closed_decided'),
                stage('ai-interview', 'closed_decided'),
            ],
        });
        expect(r).toEqual<GroupViewState>({ stage: 'overview', mode: 'results', view: 'matrix' });
    });

    it('returns archived read-only overview when group is archived', () => {
        const r = deriveDefaultStage({
            groupStatus: 'archived',
            stages: [stage('assessment', 'closed_decided')],
        });
        expect(r).toEqual<GroupViewState>({ stage: 'overview', mode: 'results', view: 'matrix' });
    });

    it('handles empty stage list (overview)', () => {
        const r = deriveDefaultStage({ groupStatus: 'active', stages: [] });
        expect(r.stage).toBe('overview');
    });
});
