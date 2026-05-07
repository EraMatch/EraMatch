import { useState } from 'react';
import {
    X, Clock, RefreshCw, Filter, ChevronDown,
    User, Layers, Award, Video, Mic, UserCheck,
    ArrowRightLeft, Settings, AlertTriangle, Download
} from 'lucide-react';
import { useGroupActivityLog } from '../../../hooks/groups/useGroups';

interface ActivityUser {
    id: string;
    name: string;
}

interface ActivityItem {
    id: string;
    timestamp: string;
    action_type: string;
    action: string;
    user: ActivityUser | null;
    details: string | null;
    entity_type: string | null;
    entity_id: string | null;
}

interface ActivityLogPanelProps {
    groupId: string;
    groupName: string;
    onClose: () => void;
}

const ACTION_TYPE_CONFIG: Record<string, {
    icon: typeof User;
    color: string;
    bg: string;
    border: string;
    label: string;
}> = {
    stage_event: {
        icon: Layers,
        color: 'text-blue-700',
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        label: 'Stage Event',
    },
    assessment_config: {
        icon: Award,
        color: 'text-purple-700',
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        label: 'Assessment',
    },
    interview_config: {
        icon: Mic,
        color: 'text-emerald-700',
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        label: 'Interview',
    },
    candidate_decision: {
        icon: ArrowRightLeft,
        color: 'text-amber-700',
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        label: 'Candidate Decision',
    },
    assignment: {
        icon: UserCheck,
        color: 'text-teal-700',
        bg: 'bg-teal-50',
        border: 'border-teal-200',
        label: 'Assignment',
    },
    offer: {
        icon: Download,
        color: 'text-pink-700',
        bg: 'bg-pink-50',
        border: 'border-pink-200',
        label: 'Offer',
    },
    system: {
        icon: Settings,
        color: 'text-gray-600',
        bg: 'bg-gray-50',
        border: 'border-gray-200',
        label: 'System',
    },
};

function formatTimestamp(ts: string): string {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return 'Just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatFullTimestamp(ts: string): string {
    return new Date(ts).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

const FILTER_OPTIONS = [
    { value: 'all', label: 'All Activity' },
    { value: 'stage_event', label: 'Stage Events' },
    { value: 'candidate_decision', label: 'Candidate Decisions' },
    { value: 'assessment_config', label: 'Assessment Config' },
    { value: 'interview_config', label: 'Interview Config' },
    { value: 'assignment', label: 'Assignments' },
    { value: 'system', label: 'System' },
];

export function ActivityLogPanel({ groupId, groupName, onClose }: ActivityLogPanelProps) {
    const [filterType, setFilterType] = useState<string>('all');
    const [showFilterDropdown, setShowFilterDropdown] = useState(false);
    const [expandedId, setExpandedId] = useState<string | null>(null);

    const { data: logData, isLoading, isFetching, refetch } = useGroupActivityLog(groupId);
    const activities: ActivityItem[] = (logData as any)?.activities ?? [];
    const totalCount: number = (logData as any)?.total_count ?? 0;
    const isRefreshing = isFetching && !isLoading;

    const filtered = filterType === 'all'
        ? activities
        : activities.filter(a => a.action_type === filterType);

    const activeFilter = FILTER_OPTIONS.find(f => f.value === filterType);

    // Group entries by date for timeline display
    const grouped: { date: string; items: ActivityItem[] }[] = [];
    filtered.forEach(item => {
        const dateLabel = (() => {
            const d = new Date(item.timestamp);
            const now = new Date();
            if (d.toDateString() === now.toDateString()) return 'Today';
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
            return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        })();
        if (!grouped.length || grouped[grouped.length - 1].date !== dateLabel) {
            grouped.push({ date: dateLabel, items: [item] });
        } else {
            grouped[grouped.length - 1].items.push(item);
        }
    });

    return (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-6">
            <div className="bg-white rounded-[20px] shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="px-7 py-5 border-b border-[#e5e7eb] bg-gradient-to-r from-slate-50 to-blue-50 flex-shrink-0">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2.5 mb-1">
                                <div className="w-8 h-8 rounded-[8px] bg-blue-100 flex items-center justify-center">
                                    <Clock size={16} className="text-blue-600" />
                                </div>
                                <h2 className="text-[18px] font-semibold text-[#111827]">Activity & Decision Log</h2>
                                {totalCount > 0 && (
                                    <span className="px-2.5 py-0.5 bg-blue-100 text-blue-700 text-[12px] font-semibold rounded-full">
                                        {totalCount}
                                    </span>
                                )}
                            </div>
                            <p className="text-[13px] text-[#6b7280] ml-10">
                                Complete audit trail for <span className="font-medium text-[#374151]">{groupName}</span>
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => refetch()}
                                disabled={isRefreshing}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-gray-50 text-[13px] text-[#374151] transition-all ${isRefreshing ? 'opacity-60 cursor-not-allowed' : ''}`}
                            >
                                <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                            <button
                                onClick={onClose}
                                className="w-9 h-9 rounded-[8px] flex items-center justify-center hover:bg-white/70 transition-colors"
                            >
                                <X size={18} className="text-[#6b7280]" />
                            </button>
                        </div>
                    </div>

                    {/* Filter bar */}
                    <div className="flex items-center gap-3 mt-4 ml-10">
                        <div className="relative">
                            <button
                                onClick={() => setShowFilterDropdown(s => !s)}
                                className="flex items-center gap-2 px-3.5 py-1.5 rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-gray-50 text-[13px] text-[#374151] transition-colors"
                            >
                                <Filter size={13} className="text-[#6b7280]" />
                                {activeFilter?.label}
                                <ChevronDown size={13} className={`text-[#6b7280] transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            {showFilterDropdown && (
                                <div className="absolute top-full left-0 mt-1 bg-white border border-[#e5e7eb] rounded-[10px] shadow-lg z-10 min-w-[180px] py-1.5 overflow-hidden">
                                    {FILTER_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => { setFilterType(opt.value); setShowFilterDropdown(false); }}
                                            className={`w-full text-left px-4 py-2 text-[13px] transition-colors ${filterType === opt.value
                                                ? 'bg-blue-50 text-blue-700 font-medium'
                                                : 'text-[#374151] hover:bg-gray-50'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {filterType !== 'all' && (
                            <button
                                onClick={() => setFilterType('all')}
                                className="text-[12px] text-blue-600 hover:text-blue-700 underline"
                            >
                                Clear filter
                            </button>
                        )}
                        <span className="text-[12px] text-[#9ca3af] ml-auto">
                            {filtered.length} {filtered.length === 1 ? 'entry' : 'entries'}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-7 py-5" onClick={() => setShowFilterDropdown(false)}>
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3">
                            <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-[14px] text-[#6b7280]">Loading activity log…</p>
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
                            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
                                <Clock size={24} className="text-[#9ca3af]" />
                            </div>
                            <p className="text-[15px] font-medium text-[#374151]">
                                {filterType === 'all' ? 'No activity recorded yet' : `No ${activeFilter?.label?.toLowerCase()} recorded`}
                            </p>
                            <p className="text-[13px] text-[#9ca3af]">
                                Actions performed on this group will appear here automatically.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {grouped.map((group) => (
                                <div key={group.date}>
                                    {/* Date separator */}
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="flex-1 h-px bg-[#e5e7eb]" />
                                        <span className="text-[11px] font-semibold text-[#9ca3af] uppercase tracking-wider px-2">
                                            {group.date}
                                        </span>
                                        <div className="flex-1 h-px bg-[#e5e7eb]" />
                                    </div>

                                    {/* Timeline entries */}
                                    <div className="space-y-3">
                                        {group.items.map((item, idx) => {
                                            const cfg = ACTION_TYPE_CONFIG[item.action_type] ?? ACTION_TYPE_CONFIG.system;
                                            const Icon = cfg.icon;
                                            const isExpanded = expandedId === item.id;
                                            const isLast = idx === group.items.length - 1;

                                            return (
                                                <div key={item.id} className="flex gap-4">
                                                    {/* Timeline line + icon */}
                                                    <div className="flex flex-col items-center">
                                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border ${cfg.bg} ${cfg.border}`}>
                                                            <Icon size={15} className={cfg.color} />
                                                        </div>
                                                        {!isLast && (
                                                            <div className="w-px flex-1 bg-[#e5e7eb] mt-1 mb-1 min-h-[12px]" />
                                                        )}
                                                    </div>

                                                    {/* Content card */}
                                                    <div
                                                        className={`flex-1 mb-${isLast ? '0' : '1'} rounded-[12px] border ${cfg.border} ${cfg.bg} cursor-pointer transition-shadow hover:shadow-sm`}
                                                        onClick={() => setExpandedId(isExpanded ? null : item.id)}
                                                    >
                                                        <div className="px-4 py-3">
                                                            <div className="flex items-start justify-between gap-3">
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                                        <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
                                                                            {cfg.label}
                                                                        </span>
                                                                        {item.user && (
                                                                            <span className="flex items-center gap-1 text-[11px] text-[#6b7280]">
                                                                                <User size={10} />
                                                                                {item.user.name}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <p className="text-[14px] font-medium text-[#111827] leading-snug">
                                                                        {item.action}
                                                                    </p>
                                                                </div>
                                                                <div className="flex-shrink-0 text-right">
                                                                    <p className="text-[12px] text-[#9ca3af]" title={formatFullTimestamp(item.timestamp)}>
                                                                        {formatTimestamp(item.timestamp)}
                                                                    </p>
                                                                </div>
                                                            </div>

                                                            {/* Expanded details */}
                                                            {isExpanded && (item.details || item.entity_id) && (
                                                                <div className="mt-3 pt-3 border-t border-dashed border-current/20 space-y-1.5">
                                                                    {item.details && (
                                                                        <p className={`text-[12px] ${cfg.color} opacity-80`}>
                                                                            {item.details}
                                                                        </p>
                                                                    )}
                                                                    <div className="flex flex-wrap gap-4">
                                                                        {item.entity_type && (
                                                                            <p className="text-[11px] text-[#9ca3af]">
                                                                                Entity: <span className="font-medium text-[#6b7280]">{item.entity_type.replace(/_/g, ' ')}</span>
                                                                            </p>
                                                                        )}
                                                                        {item.entity_id && (
                                                                            <p className="text-[11px] text-[#9ca3af]">
                                                                                ID: <span className="font-mono font-medium text-[#6b7280]">{item.entity_id.split('-')[0]}…</span>
                                                                            </p>
                                                                        )}
                                                                        <p className="text-[11px] text-[#9ca3af]">
                                                                            {formatFullTimestamp(item.timestamp)}
                                                                        </p>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-7 py-4 border-t border-[#e5e7eb] bg-gray-50 flex-shrink-0 flex items-center justify-between">
                    <p className="text-[12px] text-[#9ca3af]">
                        Showing {filtered.length} of {totalCount} total events · Click an entry to expand details
                    </p>
                    <button
                        onClick={onClose}
                        className="px-5 py-2 rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-gray-50 text-[13px] text-[#374151] transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
