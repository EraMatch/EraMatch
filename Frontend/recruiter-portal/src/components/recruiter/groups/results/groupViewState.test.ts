import { describe, it, expect } from 'vitest';
import { parseGroupViewParams, buildGroupViewSearch } from './groupViewState';

describe('parseGroupViewParams', () => {
    it('parses stage and mode', () => {
        const r = parseGroupViewParams(new URLSearchParams('stage=assessment&mode=configure'));
        expect(r).toEqual({ stage: 'assessment', mode: 'configure' });
    });

    it('defaults to overview/results when params absent', () => {
        const r = parseGroupViewParams(new URLSearchParams(''));
        expect(r).toEqual({ stage: 'overview', mode: 'results' });
    });

    it('rejects invalid stage → overview', () => {
        const r = parseGroupViewParams(new URLSearchParams('stage=bogus'));
        expect(r.stage).toBe('overview');
    });

    it('rejects invalid mode → results', () => {
        const r = parseGroupViewParams(new URLSearchParams('mode=bogus'));
        expect(r.mode).toBe('results');
    });
});

describe('buildGroupViewSearch', () => {
    it('round-trips a valid state', () => {
        const search = buildGroupViewSearch({ stage: 'ai-interview', mode: 'results' });
        const parsed = parseGroupViewParams(new URLSearchParams(search));
        expect(parsed).toEqual({ stage: 'ai-interview', mode: 'results' });
    });

    it('omits defaults to keep URLs clean', () => {
        const search = buildGroupViewSearch({ stage: 'overview', mode: 'results' });
        expect(search).toBe('');
    });
});
