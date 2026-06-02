import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { StageNavigator } from './StageNavigator';
import type { StageNavItem } from './StageNavigator';
import { ModeToggle } from './ModeToggle';
import { parseGroupViewParams, buildGroupViewSearch } from './groupViewState';
import type { StageKey, GroupViewParams } from './groupViewState';
import { deriveDefaultStage } from './deriveDefaultStage';
import type { StageLifecycle, ViewMode } from './deriveDefaultStage';

interface GroupPageShellProps {
    groupId: string;
    groupName: string;
    positionTitle: string;
    statusLabel: string;
    navItems: StageNavItem[];
    /** lifecycle for smart default; usually derived from the same data as navItems */
    lifecycleStages: { key: string; lifecycle: StageLifecycle }[];
    groupStatus: string;
    onBack: () => void;
}

export function GroupPageShell({
    groupId,
    groupName,
    positionTitle,
    statusLabel,
    navItems,
    lifecycleStages,
    groupStatus,
    onBack,
}: GroupPageShellProps) {
    const [searchParams, setSearchParams] = useSearchParams();

    const view: GroupViewParams = useMemo(() => {
        const hasParams = searchParams.has('stage') || searchParams.has('mode');
        if (!hasParams) {
            const d = deriveDefaultStage({ groupStatus, stages: lifecycleStages });
            return { stage: d.stage as StageKey, mode: d.mode };
        }
        return parseGroupViewParams(searchParams);
    }, [searchParams, groupStatus, lifecycleStages]);

    const setView = (next: GroupViewParams) => {
        const search = buildGroupViewSearch(next);
        setSearchParams(search ? new URLSearchParams(search) : {}, { replace: false });
    };

    return (
        <div className="mx-auto max-w-[1280px] px-6 py-6">
            <button
                type="button"
                onClick={onBack}
                className="mb-4 flex items-center gap-1 text-[14px] font-medium text-[#6366f1] hover:underline"
            >
                <ChevronLeft size={16} /> Back to Position Dashboard
            </button>

            <header className="mb-5">
                <div className="flex items-center gap-3">
                    <h1 className="text-[24px] font-bold text-gray-900">{groupName}</h1>
                    <span className="rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-gray-600">
                        {statusLabel}
                    </span>
                </div>
                <p className="text-[14px] text-gray-500">{positionTitle}</p>
            </header>

            <div className="mb-4">
                <StageNavigator
                    items={navItems}
                    selected={view.stage}
                    onSelect={(stage) => setView({ ...view, stage })}
                    onConfigure={(stage) => setView({ stage, mode: 'configure' })}
                />
            </div>

            <div className="mb-4 flex items-center justify-between">
                <ModeToggle mode={view.mode} onChange={(mode: ViewMode) => setView({ ...view, mode })} />
            </div>

            <section className="rounded-[14px] border border-dashed border-gray-300 bg-gray-50 p-10 text-center">
                <p className="text-[15px] font-semibold text-gray-700">
                    {view.stage === 'overview' ? 'Overview' : view.stage} · {view.mode}
                </p>
                <p className="mt-1 text-[13px] text-gray-500">
                    Results & configuration panels arrive in Phase 2/3. Shell, navigation, and URL state are live (group {groupId}).
                </p>
            </section>
        </div>
    );
}
