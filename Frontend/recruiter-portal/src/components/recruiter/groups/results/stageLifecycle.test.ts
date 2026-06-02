import { describe, it, expect } from 'vitest';
import { derivePipelineStages } from './stageLifecycle';
import type { DerivedStages } from './stageLifecycle';

function mockDetail(opts: {
    filtrationFlow?: string[];
    stages?: Array<{ id: string; state: string; completed?: number; total?: number; config_id?: boolean }>;
}): any {
    return {
        filtration_flow: opts.filtrationFlow ?? [],
        pipeline_stages: (opts.stages ?? []).map((s) => ({
            id: s.id,
            name: s.id,
            state: s.state,
            completed: s.completed ?? 0,
            total: s.total ?? 0,
            pending: 0,
            start_date: null,
            expected_end_date: null,
            config_id: s.config_id ? 'some-uuid' : null,
        })),
    };
}

describe('derivePipelineStages', () => {
    it('maps not_started with no config to not_configured', () => {
        const d = mockDetail({
            filtrationFlow: ['assessment'],
            stages: [{ id: 'assessment', state: 'not_started' }],
        });
        const r = derivePipelineStages(d);
        expect(r.lifecycleStages[0]).toEqual({ key: 'assessment', lifecycle: 'not_configured' });
    });

    it('maps not_started with config_id to configured_not_started', () => {
        const d = mockDetail({
            filtrationFlow: ['assessment'],
            stages: [{ id: 'assessment', state: 'not_started', config_id: true }],
        });
        const r = derivePipelineStages(d);
        expect(r.lifecycleStages[0].lifecycle).toBe('configured_not_started');
    });

    it('maps active state to active', () => {
        const d = mockDetail({
            filtrationFlow: ['assessment'],
            stages: [{ id: 'assessment', state: 'active' }],
        });
        expect(derivePipelineStages(d).lifecycleStages[0].lifecycle).toBe('active');
    });

    it('maps closed state to closed_awaiting_decision', () => {
        const d = mockDetail({
            filtrationFlow: ['assessment'],
            stages: [{ id: 'assessment', state: 'closed', completed: 5, total: 10 }],
        });
        expect(derivePipelineStages(d).lifecycleStages[0].lifecycle).toBe('closed_awaiting_decision');
    });

    it('stages NOT in filtration_flow are locked', () => {
        const d = mockDetail({
            filtrationFlow: ['assessment'],
            stages: [
                { id: 'assessment', state: 'not_started' },
                { id: 'ai-interview', state: 'not_started' },
            ],
        });
        const r = derivePipelineStages(d);
        const ai = r.lifecycleStages.find((s) => s.key === 'ai-interview');
        expect(ai?.lifecycle).toBe('locked');
    });

    it('produces overview navItem as first item', () => {
        const d = mockDetail({ filtrationFlow: ['assessment'] });
        const r = derivePipelineStages(d);
        expect(r.navItems[0].key).toBe('overview');
    });

    it('navItem.completed and total match pipeline_stages data', () => {
        const d = mockDetail({
            filtrationFlow: ['assessment'],
            stages: [{ id: 'assessment', state: 'active', completed: 3, total: 10 }],
        });
        const item = derivePipelineStages(d).navItems.find((n) => n.key === 'assessment')!;
        expect(item.completed).toBe(3);
        expect(item.total).toBe(10);
    });
});
