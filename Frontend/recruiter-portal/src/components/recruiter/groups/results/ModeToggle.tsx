import { BarChart3, Sliders } from 'lucide-react';
import type { ViewMode } from './deriveDefaultStage';

interface ModeToggleProps {
    mode: ViewMode;
    onChange: (mode: ViewMode) => void;
}

const OPTIONS: { value: ViewMode; label: string; icon: typeof BarChart3 }[] = [
    { value: 'results', label: 'Results', icon: BarChart3 },
    { value: 'configure', label: 'Configure', icon: Sliders },
];

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
    return (
        <div
            role="tablist"
            aria-label="Group view mode"
            className="inline-flex items-center gap-1 rounded-[12px] bg-gray-100 p-1"
        >
            {OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.value;
                return (
                    <button
                        key={opt.value}
                        role="tab"
                        aria-selected={active}
                        type="button"
                        onClick={() => onChange(opt.value)}
                        className={`flex items-center gap-2 rounded-[10px] px-4 py-2 text-[14px] font-medium transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#6366f1] ${
                            active
                                ? "bg-white text-[#6366f1] shadow-sm font-semibold"
                                : "text-gray-500 hover:text-gray-900"
                        }`}
                    >
                        <Icon size={16} className={active ? "text-[#6366f1]" : "text-gray-400"} />
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
