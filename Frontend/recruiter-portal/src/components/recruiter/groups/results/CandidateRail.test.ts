import { describe, it, expect } from 'vitest';
import { buildRailItems, getRailKeyboardTarget } from './CandidateRail';
import type { RailCandidate } from './CandidateRail';

// =========================================================
// Fixtures
// =========================================================

function makeCandidate(partial: Partial<RailCandidate> & Pick<RailCandidate, 'candidateId' | 'applicationId' | 'name'>): RailCandidate {
    return { score: null, verdict: null, ...partial };
}

const alice = makeCandidate({ candidateId: 'c1', applicationId: 'a1', name: 'Alice Smith', score: 87.4, verdict: 'pass' });
const bob   = makeCandidate({ candidateId: 'c2', applicationId: 'a2', name: 'Bob Jones',  score: null,  verdict: null  });
const carol = makeCandidate({ candidateId: 'c3', applicationId: 'a3', name: 'Carol',      score: 50,    verdict: 'fail' });

// =========================================================
// buildRailItems
// =========================================================

describe('buildRailItems', () => {
    it('marks the active candidate isActive=true, others false', () => {
        const items = buildRailItems([alice, bob], 'a1');
        expect(items[0].isActive).toBe(true);
        expect(items[1].isActive).toBe(false);
    });

    it('rounds score and appends %, null score shows em dash', () => {
        const items = buildRailItems([alice, bob], 'a1');
        expect(items[0].scoreDisplay).toBe('87%');
        expect(items[1].scoreDisplay).toBe('—');
    });

    it('extracts initials from first two name parts, uppercased', () => {
        const items = buildRailItems([alice], 'a1');
        expect(items[0].initials).toBe('AS');
    });

    it('single-word name yields one initial letter', () => {
        const items = buildRailItems([carol], 'a3');
        expect(items[0].initials).toBe('C');
    });
});

// =========================================================
// getRailKeyboardTarget
// =========================================================

describe('getRailKeyboardTarget', () => {
    it('direction=down from last index wraps to 0', () => {
        expect(getRailKeyboardTarget(3, 2, 'down')).toBe(0);
    });

    it('direction=up from index 0 wraps to last index', () => {
        expect(getRailKeyboardTarget(3, 0, 'up')).toBe(2);
    });

    it('direction=down mid-list returns index+1', () => {
        expect(getRailKeyboardTarget(5, 2, 'down')).toBe(3);
    });

    it('total count 1 always returns 0 regardless of direction', () => {
        expect(getRailKeyboardTarget(1, 0, 'down')).toBe(0);
        expect(getRailKeyboardTarget(1, 0, 'up')).toBe(0);
    });
});
