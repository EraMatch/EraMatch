import { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Filter, AlertTriangle, ChevronDown, ChevronRight, AlertCircle, CheckCircle, Clock, BarChart3 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { api } from '../../../services/api';

interface SuspiciousRecord {
    id: string;
    candidateId: string;
    applicationId: string;
    candidateName: string;
    project: string;
    position: string;
    group: string;
    issueType: string;
    confidenceScore: number;
    detectedAt: string;
    status: 'Pending' | 'Resolved' | 'Dismissed';
    severity: 'high' | 'medium' | 'low';
    eventCount: number;
    seenFlagIds: string[];
    issueSamples: string[];
}

interface SuspiciousActivityLogProps {
    onBack?: () => void;
}

export function SuspiciousActivityLog({ onBack }: SuspiciousActivityLogProps) {
    const navigate = useNavigate();
    const [activeSubpage, setActiveSubpage] = useState<'activity' | 'insights'>('activity');
    const [searchQuery, setSearchQuery] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [sortField, setSortField] = useState<keyof SuspiciousRecord>('detectedAt');
    const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
    const [severityFilter, setSeverityFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
    const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');
    const [records, setRecords] = useState<SuspiciousRecord[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [selectedProject, setSelectedProject] = useState<string | null>(null);
    const [selectedPosition, setSelectedPosition] = useState<string | null>(null);
    const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [streamConnected, setStreamConnected] = useState(false);
    const cursorRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let pollInterval: number | null = null;

        const mapSeverityToScore = (severity: string) => {
            const value = (severity || '').toLowerCase();
            if (value === 'high') return 95;
            if (value === 'medium') return 78;
            return 55;
        };

        const titleizeIssue = (eventType: string) => {
            return (eventType || 'unknown_event')
                .replace(/_/g, ' ')
                .replace(/\b\w/g, (m: string) => m.toUpperCase());
        };

        const normalizeStatus = (status: string): 'Pending' | 'Resolved' | 'Dismissed' => {
            const v = (status || '').toLowerCase();
            if (v === 'confirmed' || v === 'resolved') return 'Resolved';
            if (v === 'dismissed') return 'Dismissed';
            return 'Pending';
        };

        const severityRank = (value: string) => {
            const v = (value || '').toLowerCase();
            if (v === 'high') return 3;
            if (v === 'medium') return 2;
            return 1;
        };

        const mergeStatus = (
            current: 'Pending' | 'Resolved' | 'Dismissed',
            next: 'Pending' | 'Resolved' | 'Dismissed',
        ): 'Pending' | 'Resolved' | 'Dismissed' => {
            if (current === 'Pending' || next === 'Pending') return 'Pending';
            if (current === 'Resolved' || next === 'Resolved') return 'Resolved';
            return 'Dismissed';
        };

        const mergeRecords = (incoming: any[]) => {
            if (!incoming?.length) return;

            setRecords((prev) => {
                const byCandidate = new Map<string, SuspiciousRecord>(prev.map((r) => [r.id, { ...r }]));
                for (const row of incoming) {
                    const flagId = String(row.flag_id);
                    const candidateId = String(row.candidate_id || 'unknown');
                    const aggregateKey = candidateId;
                    const nextIssue = titleizeIssue(row.event_type);
                    const nextSeverity = (row.severity || 'low').toLowerCase() as 'high' | 'medium' | 'low';
                    const nextScore = mapSeverityToScore(row.severity);
                    const nextStatus = normalizeStatus(row.status);
                    const nextDetectedAt = String(row.created_at || new Date().toISOString());

                    const existing: SuspiciousRecord = byCandidate.get(aggregateKey) || {
                        id: aggregateKey,
                        candidateId,
                        applicationId: String(row.application_id || ''),
                        candidateName: row.candidate_name || 'Unknown Candidate',
                        project: row.project_title || 'Unknown Project',
                        position: row.position_title || 'Unknown Position',
                        group: row.group_name || 'Unknown Group',
                        issueType: nextIssue,
                        confidenceScore: nextScore,
                        detectedAt: nextDetectedAt,
                        status: nextStatus,
                        severity: nextSeverity,
                        eventCount: 0,
                        seenFlagIds: [],
                        issueSamples: [],
                    };

                    if (existing.seenFlagIds.includes(flagId)) {
                        continue;
                    }

                    const isNewer = new Date(nextDetectedAt).getTime() >= new Date(existing.detectedAt).getTime();
                    const mergedIssues = existing.issueSamples.includes(nextIssue)
                        ? existing.issueSamples
                        : [...existing.issueSamples, nextIssue];
                    const mergedEventCount = existing.eventCount + 1;
                    const headlineIssue = isNewer ? nextIssue : existing.issueSamples[0] || nextIssue;
                    const issueType = mergedEventCount > 1
                        ? `${headlineIssue} (+${mergedEventCount - 1} more)`
                        : headlineIssue;

                    byCandidate.set(aggregateKey, {
                        ...existing,
                        applicationId: isNewer ? String(row.application_id || existing.applicationId) : existing.applicationId,
                        candidateName: row.candidate_name || existing.candidateName,
                        project: isNewer ? (row.project_title || existing.project) : existing.project,
                        position: isNewer ? (row.position_title || existing.position) : existing.position,
                        group: isNewer ? (row.group_name || existing.group) : existing.group,
                        issueType,
                        confidenceScore: Math.max(existing.confidenceScore, nextScore),
                        detectedAt: isNewer ? nextDetectedAt : existing.detectedAt,
                        status: mergeStatus(existing.status, nextStatus),
                        severity: severityRank(nextSeverity) >= severityRank(existing.severity) ? nextSeverity : existing.severity,
                        eventCount: mergedEventCount,
                        seenFlagIds: [...existing.seenFlagIds, flagId],
                        issueSamples: mergedIssues,
                    });
                }

                return Array.from(byCandidate.values()).sort(
                    (a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime(),
                );
            });
        };

        const pollOnce = async () => {
            try {
                const payload = await api.recruiter.getSuspiciousActivity(cursorRef.current || undefined, 120) as any;
                if (payload?.cursor) {
                    cursorRef.current = payload.cursor;
                }
                mergeRecords(payload?.records || []);
            } catch (error) {
                console.error('Failed to poll suspicious activity:', error);
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        };

        const startPollingFallback = () => {
            setStreamConnected(false);
            void pollOnce();
            pollInterval = window.setInterval(pollOnce, 8000);
        };

        const connectStream = async () => {
            const { url, token } = api.recruiter.getSuspiciousActivityStreamUrl(cursorRef.current || undefined);
            if (!token) {
                startPollingFallback();
                return;
            }

            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                    Accept: 'text/event-stream',
                },
            });

            if (!response.ok || !response.body) {
                throw new Error(`Suspicious stream unavailable (${response.status})`);
            }

            setStreamConnected(true);
            if (!cancelled) setIsLoading(false);

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (!cancelled) {
                const { value, done } = await reader.read();
                if (done) throw new Error('Suspicious stream closed');

                buffer += decoder.decode(value, { stream: true });
                let boundary = buffer.indexOf('\n\n');
                while (boundary !== -1) {
                    const chunk = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);

                    const lines = chunk.split('\n');
                    const eventLine = lines.find((line) => line.startsWith('event: '));
                    const dataLine = lines.find((line) => line.startsWith('data: '));

                    if (eventLine?.includes('suspicious') && dataLine) {
                        try {
                            const payload = JSON.parse(dataLine.slice(6));
                            if (payload?.cursor) {
                                cursorRef.current = payload.cursor;
                            }
                            mergeRecords(payload?.records || []);
                        } catch (parseErr) {
                            console.error('Failed parsing suspicious stream payload:', parseErr);
                        }
                    }

                    boundary = buffer.indexOf('\n\n');
                }
            }
        };

        connectStream().catch((error) => {
            console.error('Stream unavailable, using polling fallback for suspicious activity:', error);
            startPollingFallback();
        });

        return () => {
            cancelled = true;
            setStreamConnected(false);
            if (pollInterval) {
                window.clearInterval(pollInterval);
            }
        };
    }, []);

    const filteredRecords = records.filter(record => {
        // Search Filter
        const matchesSearch =
            record.candidateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
            record.issueType.toLowerCase().includes(searchQuery.toLowerCase()) ||
            record.position.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesDateDrill = !selectedDate || new Date(record.detectedAt).toLocaleDateString() === selectedDate;
        const matchesProjectDrill = !selectedProject || record.project === selectedProject;
        const matchesPositionDrill = !selectedPosition || record.position === selectedPosition;
        const matchesGroupDrill = !selectedGroup || record.group === selectedGroup;

        // Severity Filter
        let matchesSeverity = true;
        if (severityFilter !== 'all') {
            matchesSeverity = record.severity === severityFilter;
        }

        // Date Filter
        let matchesDate = true;
        if (dateFilter !== 'all') {
            const date = new Date(record.detectedAt);
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - date.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (dateFilter === 'today') {
                matchesDate = date.toDateString() === now.toDateString();
            } else if (dateFilter === 'week') {
                matchesDate = diffDays <= 7;
            } else if (dateFilter === 'month') {
                matchesDate = diffDays <= 30;
            }
        }

        return matchesSearch && matchesSeverity && matchesDate && matchesDateDrill && matchesProjectDrill && matchesPositionDrill && matchesGroupDrill;
    });

    const sortedRecords = [...filteredRecords].sort((a, b) => {
        if (a[sortField] < b[sortField]) return sortDirection === 'asc' ? -1 : 1;
        if (a[sortField] > b[sortField]) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (field: keyof SuspiciousRecord) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc'); // Default to desc for new field
        }
    };

    const getSeverityColor = (score: number) => {
        if (score >= 90) return 'text-red-600 bg-red-50 border-red-200';
        if (score >= 70) return 'text-orange-600 bg-orange-50 border-orange-200';
        return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    };

    const insightRows = useMemo(() => {
        const byDate = new Map<string, { key: string; candidates: number; events: number }>();
        const byProject = new Map<string, { key: string; candidates: number; events: number }>();
        const byPosition = new Map<string, { key: string; candidates: number; events: number }>();
        const byGroup = new Map<string, { key: string; candidates: number; events: number }>();

        for (const row of records) {
            const events = Math.max(1, row.eventCount || 1);
            const dateKey = new Date(row.detectedAt).toLocaleDateString();

            const currDate = byDate.get(dateKey) || { key: dateKey, candidates: 0, events: 0 };
            currDate.candidates += 1;
            currDate.events += events;
            byDate.set(dateKey, currDate);

            const currProject = byProject.get(row.project) || { key: row.project, candidates: 0, events: 0 };
            currProject.candidates += 1;
            currProject.events += events;
            byProject.set(row.project, currProject);

            const currPosition = byPosition.get(row.position) || { key: row.position, candidates: 0, events: 0 };
            currPosition.candidates += 1;
            currPosition.events += events;
            byPosition.set(row.position, currPosition);

            const currGroup = byGroup.get(row.group) || { key: row.group, candidates: 0, events: 0 };
            currGroup.candidates += 1;
            currGroup.events += events;
            byGroup.set(row.group, currGroup);
        }

        const descByEvents = (a: { events: number }, b: { events: number }) => b.events - a.events;
        return {
            date: Array.from(byDate.values()).sort(descByEvents),
            project: Array.from(byProject.values()).sort(descByEvents),
            position: Array.from(byPosition.values()).sort(descByEvents),
            group: Array.from(byGroup.values()).sort(descByEvents),
        };
    }, [records]);

    const overallStats = useMemo(() => {
        const totalCandidates = records.length;
        const totalEvents = records.reduce((sum, row) => sum + Math.max(1, row.eventCount || 1), 0);
        const highRiskCandidates = records.filter((row) => row.severity === 'high').length;
        const today = new Date().toDateString();
        const todayEvents = records
            .filter((row) => new Date(row.detectedAt).toDateString() === today)
            .reduce((sum, row) => sum + Math.max(1, row.eventCount || 1), 0);
        return { totalCandidates, totalEvents, highRiskCandidates, todayEvents };
    }, [records]);

    const chartData = useMemo(() => {
        const date = insightRows.date
            .slice(0, 10)
            .map((row) => ({ name: row.key, candidates: row.candidates, events: row.events }));
        const project = insightRows.project
            .slice(0, 8)
            .map((row) => ({ name: row.key, candidates: row.candidates, events: row.events }));
        const position = insightRows.position
            .slice(0, 8)
            .map((row) => ({ name: row.key, candidates: row.candidates, events: row.events }));
        const group = insightRows.group
            .slice(0, 8)
            .map((row) => ({ name: row.key, candidates: row.candidates, events: row.events }));

        return { date, project, position, group };
    }, [insightRows]);

    const clearDrillFilters = () => {
        setSelectedDate(null);
        setSelectedProject(null);
        setSelectedPosition(null);
        setSelectedGroup(null);
    };

    const openActivityWithFilter = (dimension: 'date' | 'project' | 'position' | 'group', value: string) => {
        if (!value) return;
        clearDrillFilters();
        if (dimension === 'date') setSelectedDate(value);
        if (dimension === 'project') setSelectedProject(value);
        if (dimension === 'position') setSelectedPosition(value);
        if (dimension === 'group') setSelectedGroup(value);
        setActiveSubpage('activity');
    };

    const extractChartLabel = (event: any): string => {
        if (!event) return '';
        if (typeof event?.name === 'string') return event.name;
        if (typeof event?.activeLabel === 'string') return event.activeLabel;
        if (typeof event?.payload?.name === 'string') return event.payload.name;
        if (typeof event?.activePayload?.[0]?.payload?.name === 'string') return event.activePayload[0].payload.name;
        return '';
    };

    return (
        <div className="min-h-screen flex flex-col">
            <div className="px-8 py-6 w-full">
                {/* Header */}
                <div className="mb-6">
                    <h1 className="text-[#111827] text-[32px] mb-2 font-['Arimo',sans-serif]">Suspicious Activity Log</h1>
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                        Review potential integrity violations across all assessments
                    </p>
                    <p className="font-['Arimo',sans-serif] text-[13px] mt-2" style={{ color: streamConnected ? '#047857' : '#b45309' }}>
                        {streamConnected ? 'Live stream connected' : 'Live stream unavailable, polling every 8s'}
                    </p>
                </div>

                <div className="max-w-[1400px] mx-auto">
                    <div className="mb-6 flex items-center justify-between">
                        <div className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            {activeSubpage === 'activity' ? 'Candidate-level suspicious feed' : 'Analytics subpage with chart breakdowns'}
                        </div>
                        <button
                            onClick={() => setActiveSubpage((prev) => (prev === 'activity' ? 'insights' : 'activity'))}
                            className="h-[40px] px-4 rounded-[10px] border border-[#d1d5db] text-[#111827] font-['Arimo',sans-serif] text-[13px] font-medium hover:bg-[#f9fafb] transition-colors flex items-center gap-2"
                        >
                            <BarChart3 size={16} />
                            {activeSubpage === 'activity' ? 'Open Insights Subpage' : 'Back To Activity Feed'}
                        </button>
                    </div>

                    {activeSubpage === 'insights' && (
                        <>
                            <div className="grid grid-cols-4 gap-4 mb-6">
                                {[
                                    { label: 'Candidates Flagged', value: overallStats.totalCandidates, tone: 'text-[#1d4ed8] bg-[#eff6ff] border-[#bfdbfe]' },
                                    { label: 'Total Suspicious Events', value: overallStats.totalEvents, tone: 'text-[#9a3412] bg-[#fff7ed] border-[#fed7aa]' },
                                    { label: 'High-Risk Candidates', value: overallStats.highRiskCandidates, tone: 'text-[#991b1b] bg-[#fef2f2] border-[#fecaca]' },
                                    { label: 'Events Today', value: overallStats.todayEvents, tone: 'text-[#166534] bg-[#f0fdf4] border-[#bbf7d0]' },
                                ].map((card) => (
                                    <div key={card.label} className={`rounded-[12px] border p-4 ${card.tone}`}>
                                        <p className="font-['Arimo',sans-serif] text-[12px] opacity-80 mb-1">{card.label}</p>
                                        <p className="font-['Arimo',sans-serif] text-[24px] font-semibold">{card.value}</p>
                                    </div>
                                ))}
                            </div>

                                    <div className="mb-4 text-[12px] text-[#6b7280] font-['Arimo',sans-serif]">
                                        Click any chart bar/point to open the Activity Feed filtered by that dimension.
                                    </div>

                            <div className="grid grid-cols-2 gap-6 mb-6">
                                <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-4 h-[340px]">
                                    <h3 className="font-['Arimo',sans-serif] text-[15px] text-[#111827] mb-3">Date Trend (Candidates vs Events)</h3>
                                    <ResponsiveContainer width="100%" height="90%">
                                                <LineChart
                                                    data={chartData.date}
                                                    onClick={(state) => {
                                                        const label = extractChartLabel(state);
                                                        if (label) openActivityWithFilter('date', label);
                                                    }}
                                                >
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip />
                                            <Legend />
                                            <Line type="monotone" dataKey="events" stroke="#f97316" strokeWidth={2} dot={false} name="Events" />
                                            <Line type="monotone" dataKey="candidates" stroke="#2563eb" strokeWidth={2} dot={false} name="Candidates" />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-4 h-[340px]">
                                    <h3 className="font-['Arimo',sans-serif] text-[15px] text-[#111827] mb-3">Project Breakdown</h3>
                                    <ResponsiveContainer width="100%" height="90%">
                                        <BarChart data={chartData.project} margin={{ top: 8, right: 8, left: 0, bottom: 42 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={56} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip />
                                            <Legend />
                                            <Bar
                                                dataKey="events"
                                                fill="#0ea5e9"
                                                name="Events"
                                                radius={[4, 4, 0, 0]}
                                                onClick={(entry) => {
                                                    const label = extractChartLabel(entry);
                                                    if (label) openActivityWithFilter('project', label);
                                                }}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-4 h-[340px]">
                                    <h3 className="font-['Arimo',sans-serif] text-[15px] text-[#111827] mb-3">Position Breakdown</h3>
                                    <ResponsiveContainer width="100%" height="90%">
                                        <BarChart data={chartData.position} margin={{ top: 8, right: 8, left: 0, bottom: 42 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={56} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip />
                                            <Legend />
                                            <Bar
                                                dataKey="events"
                                                fill="#f59e0b"
                                                name="Events"
                                                radius={[4, 4, 0, 0]}
                                                onClick={(entry) => {
                                                    const label = extractChartLabel(entry);
                                                    if (label) openActivityWithFilter('position', label);
                                                }}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-4 h-[340px]">
                                    <h3 className="font-['Arimo',sans-serif] text-[15px] text-[#111827] mb-3">Group Breakdown</h3>
                                    <ResponsiveContainer width="100%" height="90%">
                                        <BarChart data={chartData.group} margin={{ top: 8, right: 8, left: 0, bottom: 42 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                                            <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-20} textAnchor="end" interval={0} height={56} />
                                            <YAxis tick={{ fontSize: 11 }} />
                                            <Tooltip />
                                            <Legend />
                                            <Bar
                                                dataKey="events"
                                                fill="#10b981"
                                                name="Events"
                                                radius={[4, 4, 0, 0]}
                                                onClick={(entry) => {
                                                    const label = extractChartLabel(entry);
                                                    if (label) openActivityWithFilter('group', label);
                                                }}
                                            />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    )}

                    {activeSubpage === 'activity' && (
                        <>
                            {/* Search and Filters */}
                            <div className="mb-6 space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="flex-1 relative">
                                <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                                <input
                                    type="text"
                                    placeholder="Search by candidate, issue type, or position..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="w-full h-[44px] pl-12 pr-4 rounded-[10px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                                />
                            </div>
                            <button
                                onClick={() => setShowFilters(!showFilters)}
                                className={`flex items-center gap-2 h-[44px] px-[16px] rounded-[10px] border transition-colors ${showFilters
                                    ? 'bg-[#f5f3ff] border-[#6366f1] text-[#6366f1]'
                                    : 'bg-white border-[#e5e7eb] hover:bg-[#f9fafb]'
                                    }`}
                            >
                                <Filter size={18} />
                                <span className="font-['Arimo',sans-serif] text-[14px]">Filters</span>
                                <ChevronDown size={14} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
                            </button>
                        </div>

                        {(selectedDate || selectedProject || selectedPosition || selectedGroup) && (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">Active insight filters:</span>
                                {selectedDate && <span className="px-2 py-1 rounded bg-[#eef2ff] text-[#4338ca] text-[12px]">Date: {selectedDate}</span>}
                                {selectedProject && <span className="px-2 py-1 rounded bg-[#ecfdf5] text-[#047857] text-[12px]">Project: {selectedProject}</span>}
                                {selectedPosition && <span className="px-2 py-1 rounded bg-[#fff7ed] text-[#c2410c] text-[12px]">Position: {selectedPosition}</span>}
                                {selectedGroup && <span className="px-2 py-1 rounded bg-[#fdf2f8] text-[#be185d] text-[12px]">Group: {selectedGroup}</span>}
                                <button
                                    onClick={() => {
                                        clearDrillFilters();
                                    }}
                                    className="px-2 py-1 rounded border border-[#e5e7eb] text-[12px] text-[#374151] hover:bg-[#f9fafb]"
                                >
                                    Clear
                                </button>
                            </div>
                        )}

                        {showFilters && (
                            <div className="p-4 bg-white rounded-[10px] border border-[#e5e7eb] grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div>
                                    <label className="block text-[13px] font-medium font-['Arimo',sans-serif] text-[#374151] mb-1.5">Severity Level</label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-[40px] pl-3 pr-10 bg-white border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent appearance-none transition-shadow"
                                            value={severityFilter}
                                            onChange={(e) => setSeverityFilter(e.target.value as any)}
                                        >
                                            <option value="all">All Severities</option>
                                            <option value="high">High</option>
                                            <option value="medium">Medium</option>
                                            <option value="low">Low</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[13px] font-medium font-['Arimo',sans-serif] text-[#374151] mb-1.5">Date Detected</label>
                                    <div className="relative">
                                        <select
                                            className="w-full h-[40px] pl-3 pr-10 bg-white border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[14px] text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent appearance-none transition-shadow"
                                            value={dateFilter}
                                            onChange={(e) => setDateFilter(e.target.value as any)}
                                        >
                                            <option value="all">All Time</option>
                                            <option value="today">Today</option>
                                            <option value="week">Last 7 Days</option>
                                            <option value="month">Last 30 Days</option>
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                            {/* Table */}
                            <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden shadow-sm">
                        <table className="w-full">
                            <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                <tr>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('candidateName')}
                                    >
                                        Candidate
                                    </th>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('issueType')}
                                    >
                                        Issue Detected
                                    </th>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('confidenceScore')}
                                    >
                                        Severity
                                    </th>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('position')}
                                    >
                                        Context
                                    </th>
                                    <th
                                        className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] cursor-pointer hover:bg-gray-100 transition-colors"
                                        onClick={() => handleSort('detectedAt')}
                                    >
                                        Detected At
                                    </th>
                                    <th className="text-right p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                                        Action
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedRecords.map((record) => (
                                    <tr
                                        key={record.id}
                                        onClick={() => navigate(`/recruiter/suspect-review?candidateId=${record.candidateId}&applicationId=${record.applicationId}`)}
                                        className="border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer group"
                                    >
                                        <td className="p-4">
                                            <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                                                {record.candidateName}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle size={16} className="text-amber-500" />
                                                <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                                                    {record.issueType}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <span className={`px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] font-medium border ${getSeverityColor(record.confidenceScore)}`}>
                                                {record.confidenceScore}% Confidence
                                            </span>
                                        </td>
                                        <td className="p-4">
                                            <div>
                                                <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">{record.project}</div>
                                                <div className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">{record.position}</div>
                                                <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">{record.group}</div>
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center gap-1 text-[#6b7280]">
                                                <Clock size={14} />
                                                <span className="font-['Arimo',sans-serif] text-[13px]">
                                                    {new Date(record.detectedAt).toLocaleString()}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                className="text-[#6366f1] opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 ml-auto font-['Arimo',sans-serif] text-[13px] font-medium"
                                            >
                                                Review <ChevronRight size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {!isLoading && sortedRecords.length === 0 && (
                            <div className="text-center py-12">
                                <CheckCircle size={48} className="text-[#d1d5db] mx-auto mb-4" />
                                <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280]">
                                    No suspicious activity detected
                                </p>
                            </div>
                        )}
                        {isLoading && (
                            <div className="text-center py-12">
                                <Clock size={30} className="text-[#9ca3af] mx-auto mb-4 animate-pulse" />
                                <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280]">Loading suspicious activity feed...</p>
                            </div>
                        )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
