import { describe, it, expect } from 'vitest';
import { getRailTabForStage } from './CandidateProfile';

describe('getRailTabForStage', () => {
    it('maps assessment to assessment tab', () => {
        expect(getRailTabForStage('assessment')).toBe('assessment');
    });
    it('maps ai-interview to interview tab', () => {
        expect(getRailTabForStage('ai-interview')).toBe('interview');
    });
    it('maps live-interview to live-interview tab', () => {
        expect(getRailTabForStage('live-interview')).toBe('live-interview');
    });
    it('falls back to overview for unknown stage keys', () => {
        expect(getRailTabForStage('overview')).toBe('overview');
        expect(getRailTabForStage('unknown')).toBe('overview');
    });
});
