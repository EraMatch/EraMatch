import React from 'react';

// =========================================================
// Interfaces
// =========================================================

export interface RailCandidate {
    candidateId: string;
    applicationId: string;
    name: string;
    score?: number | null;
    verdict?: string | null;
}

export interface CandidateRailProps {
    candidates: RailCandidate[];
    activeApplicationId: string;
    onSelect: (candidateId: string, applicationId: string) => void;
}

export interface RailDisplayItem extends RailCandidate {
    isActive: boolean;
    scoreDisplay: string;
    initials: string;
}

// =========================================================
// Pure helpers
// =========================================================

export function buildRailItems(
    candidates: RailCandidate[],
    activeApplicationId: string,
): RailDisplayItem[] {
    return candidates.map((c) => ({
        ...c,
        isActive: c.applicationId === activeApplicationId,
        scoreDisplay:
            c.score !== null && c.score !== undefined
                ? `${Math.round(c.score)}%`
                : '—',
        initials: c.name
            .split(' ')
            .slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? '')
            .join(''),
    }));
}

export function getRailKeyboardTarget(
    totalCount: number,
    currentIndex: number,
    direction: 'up' | 'down',
): number {
    if (direction === 'down') {
        return (currentIndex + 1) % totalCount;
    }
    return (currentIndex - 1 + totalCount) % totalCount;
}

// =========================================================
// Score badge helpers
// =========================================================

function scoreBadgeClass(verdict?: string | null): string {
    if (verdict === 'pass') {
        return 'bg-emerald-50 text-emerald-700';
    }
    if (verdict === 'fail') {
        return 'bg-red-50 text-red-700';
    }
    return 'bg-gray-100 text-gray-600';
}

// =========================================================
// Component
// =========================================================

export function CandidateRail({ candidates, activeApplicationId, onSelect }: CandidateRailProps) {
    const items = buildRailItems(candidates, activeApplicationId);

    function handleKeyDown(
        e: React.KeyboardEvent<HTMLButtonElement>,
        item: RailDisplayItem,
        index: number,
    ) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            const direction = e.key === 'ArrowDown' ? 'down' : 'up';
            const targetIndex = getRailKeyboardTarget(items.length, index, direction);
            const buttons = document.querySelectorAll<HTMLButtonElement>(
                '[data-rail-item]',
            );
            buttons[targetIndex]?.focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(item.candidateId, item.applicationId);
        }
    }

    return (
        <div
            role="listbox"
            aria-label="Candidate rail"
            className="flex flex-col border-r border-gray-100 bg-gray-50 overflow-y-auto"
            style={{ minWidth: '220px', maxHeight: '80vh' }}
        >
            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400 border-b border-gray-100">
                {candidates.length} candidates
            </div>

            {items.map((item, index) => (
                <button
                    key={item.applicationId}
                    role="option"
                    aria-selected={item.isActive}
                    data-rail-item
                    className={[
                        'flex items-center gap-2 px-3 py-2 text-left w-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400',
                        item.isActive
                            ? 'bg-[#f5f3ff] border-l-2 border-[#6366f1]'
                            : 'hover:bg-white border-l-2 border-transparent',
                    ].join(' ')}
                    onClick={() => onSelect(item.candidateId, item.applicationId)}
                    onKeyDown={(e) => handleKeyDown(e, item, index)}
                >
                    <span
                        className="flex items-center justify-center rounded-full text-[11px] font-semibold shrink-0"
                        style={{
                            width: '32px',
                            height: '32px',
                            background: 'rgba(99,102,241,0.10)',
                            color: '#6366f1',
                        }}
                    >
                        {item.initials}
                    </span>

                    <span className="flex flex-col min-w-0 flex-1">
                        <span className="text-[13px] font-medium text-gray-900 truncate max-w-[110px]">
                            {item.name}
                        </span>
                        <span
                            className={`text-[11px] tabular-nums px-1 py-0.5 rounded self-start mt-0.5 ${scoreBadgeClass(item.verdict)}`}
                        >
                            {item.scoreDisplay}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    );
}
