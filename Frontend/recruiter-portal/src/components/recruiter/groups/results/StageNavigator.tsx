import { FileText, Video, MessageSquare, LayoutGrid, Lock, Settings } from 'lucide-react';
import type { StageLifecycle } from './deriveDefaultStage';
import type { StageKey } from './groupViewState';

export interface StageNavItem {
    key: StageKey;
    label: string;
    lifecycle: StageLifecycle | 'overview';
    completed?: number;
    total?: number;
    flagCount?: number;
    toReviewCount?: number;
}

interface StageNavigatorProps {
    items: StageNavItem[];
    selected: StageKey;
    onSelect: (key: StageKey) => void;
    onConfigure: (key: StageKey) => void;
}

const ICONS: Record<string, typeof FileText> = {
    overview: LayoutGrid,
    assessment: FileText,
    'ai-interview': Video,
    'live-interview': MessageSquare,
};

function isLocked(lifecycle: StageNavItem['lifecycle']): boolean {
    return lifecycle === 'locked' || lifecycle === 'not_configured';
}

export function StageNavigator({ items, selected, onSelect, onConfigure }: StageNavigatorProps) {
    return (
        <div className="flex items-stretch gap-3 overflow-x-auto pb-1" role="tablist" aria-label="Pipeline stages">
            {items.map((item) => {
                const Icon = ICONS[item.key] ?? FileText;
                const active = selected === item.key;
                const locked = isLocked(item.lifecycle);
                const showConfig = item.key !== 'overview';
                return (
                    <div
                        key={item.key}
                        className={`relative flex min-w-[200px] flex-col rounded-[14px] border p-4 transition-all ${
                            active
                                ? "flex-[1.3] border-[#6366f1] bg-[#f5f3ff] shadow-sm"
                                : "flex-1 border-gray-200 bg-white hover:border-gray-300"
                        } ${locked ? "opacity-60" : ""}`}
                    >
                        <button
                            role="tab"
                            aria-selected={active}
                            type="button"
                            onClick={() => onSelect(item.key)}
                            className="flex flex-col items-start gap-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6366f1]"
                        >
                            <span className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
                                {locked ? <Lock size={14} className="text-gray-400" /> : <Icon size={16} className={active ? "text-[#6366f1]" : "text-gray-500"} />}
                                {item.label}
                            </span>
                            {item.total !== undefined && (
                                <span className="text-[20px] font-bold tabular-nums text-gray-900">
                                    {item.completed ?? 0}
                                    <span className="text-[13px] font-medium text-gray-400"> / {item.total}</span>
                                </span>
                            )}
                            {item.toReviewCount ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                    {item.toReviewCount} to review
                                </span>
                            ) : null}
                            {item.flagCount ? (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                                    {item.flagCount} flagged
                                </span>
                            ) : null}
                        </button>
                        {showConfig && (
                            <button
                                type="button"
                                aria-label={`Configure ${item.label}`}
                                onClick={() => onConfigure(item.key)}
                                className="absolute right-2 top-2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6366f1]"
                            >
                                <Settings size={14} />
                            </button>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
