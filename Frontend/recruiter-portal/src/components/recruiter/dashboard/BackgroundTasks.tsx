import React, { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    CheckCircle,
    ChevronDown,
    ChevronRight,
    Clock,
    FileText,
    Filter,
    Loader2,
    RefreshCcw,
    ShieldAlert,
    Sparkles,
    Trash2,
    User,
    Video,
    WandSparkles,
    XCircle,
} from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import LoadingSpinner from '../../common/LoadingSpinner';
import { api } from '../../../services/api';

interface TaskRecord {
    id: string;
    status: string;
    type: string;
    task_category: 'video' | 'question_import' | 'github_analysis' | 'qag' | 'cv_ingestion';
    candidate_name: string | null;
    question: string;
    timestamp: string;
    source_filename: string | null;
    total_generated: number | null;
    total_flagged: number | null;
    total_approved: number | null;
    import_job_id: string | null;
    candidates_found?: number | null;
    candidates_processed?: number | null;
    candidates_skipped?: number | null;
    zero_reason?: string | null;
}

interface LogEntry {
    timestamp: string;
    step: string;
    data: any;
}

interface SloAlert {
    pipeline: string;
    severity: 'high' | 'medium' | 'low';
    metric: string;
    threshold: number;
    actual: number;
    message: string;
}

interface SloHealthResponse {
    generated_at: string;
    window_hours: number;
    pipelines: Record<string, any>;
    alerts: SloAlert[];
}

type PageView = 'dashboard' | 'categories';
type CategoryId = 'video-processing' | 'profile-processing' | 'video-recording' | 'question-generation-extraction' | 'qag-processing';

type StatusFilter = 'all' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface TableFilters {
    search: string;
    status: StatusFilter;
}

interface SectionTable {
    id: string;
    title: string;
    description: string;
    tasks: TaskRecord[];
}

interface TableColumnConfig {
    taskHeader: string;
    subjectHeader: string;
    renderSubject: (task: TaskRecord) => React.ReactNode;
}

const DEFAULT_FILTERS: TableFilters = { search: '', status: 'all' };

const SUB_STATUS_FILTERS: Array<{ id: StatusFilter; label: string }> = [
    { id: 'pending', label: 'Pending' },
    { id: 'processing', label: 'Processing' },
    { id: 'completed', label: 'Completed' },
    { id: 'failed', label: 'Failed' },
];

const CATEGORIES: Array<{ id: CategoryId; title: string; icon: React.ReactNode; description: string }> = [
    {
        id: 'video-processing',
        title: 'Video Processing',
        icon: <Video size={15} />,
        description: 'Recorded and live interview processing',
    },
    {
        id: 'profile-processing',
        title: 'Profile Processing',
        icon: <User size={15} />,
        description: 'CV and GitHub profile analysis',
    },
    {
        id: 'video-recording',
        title: 'Processing Video Recording',
        icon: <ShieldAlert size={15} />,
        description: 'Anti-cheating and suspicious recording checks',
    },
    {
        id: 'question-generation-extraction',
        title: 'Question Generation & Extraction',
        icon: <WandSparkles size={15} />,
        description: 'Question import generation and extraction flows',
    },
    {
        id: 'qag-processing',
        title: 'Position Pre-Matching Score',
        icon: <Sparkles size={15} />,
        description: 'Pre-matching criteria generation and candidate correction jobs',
    },
];

const PAGE_TABS: Array<{ id: PageView; title: string; subtitle: string }> = [
    {
        id: 'dashboard',
        title: 'Dashboard',
        subtitle: 'Detailed visual overview for all background processes',
    },
    {
        id: 'categories',
        title: 'Categories',
        subtitle: 'Animated horizontal toggle list for your 4 categories',
    },
];

const isCategory = (value: string): value is CategoryId => CATEGORIES.some((item) => item.id === value);
const isPageView = (value: string): value is PageView => value === 'dashboard' || value === 'categories';

const includesAny = (value: string, terms: string[]) => terms.some((term) => value.includes(term));

const normalizedTaskText = (task: TaskRecord) =>
    `${task.type} ${task.question || ''} ${task.source_filename || ''} ${task.candidate_name || ''}`.toLowerCase();

const isLiveVideoTask = (task: TaskRecord) =>
    includesAny(normalizedTaskText(task), ['live interview', 'live-video', 'live video', 'real-time', 'realtime']);

const isAntiCheatingTask = (task: TaskRecord) =>
    includesAny(normalizedTaskText(task), ['anti cheat', 'anti-cheat', 'cheat', 'proctor', 'suspicious', 'anomaly']);

const isCvTask = (task: TaskRecord) =>
    task.task_category === 'cv_ingestion' ||
    ((task.task_category === 'question_import' || task.task_category === 'github_analysis') &&
    includesAny(normalizedTaskText(task), ['cv', 'resume', 'curriculum vitae', '.pdf', '.doc', '.docx']));

const isGithubTask = (task: TaskRecord) =>
    (task.task_category === 'question_import' || task.task_category === 'github_analysis') &&
    includesAny(normalizedTaskText(task), ['github', 'repository', 'repo', 'pull request', 'commit']);

const isGenerationTask = (task: TaskRecord) =>
    (task.task_category === 'question_import' || task.task_category === 'github_analysis') && normalizedTaskText(task).includes('generative');

const isExtractionTask = (task: TaskRecord) =>
    (task.task_category === 'question_import' || task.task_category === 'github_analysis') &&
    (normalizedTaskText(task).includes('extraction') || normalizedTaskText(task).includes('csv'));

const formatStatusLabel = (status: string) => status.charAt(0).toUpperCase() + status.slice(1);

const formatTime = (timestamp: string) => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const applyFilters = (tasks: TaskRecord[], filters: TableFilters) =>
    tasks.filter((task) => {
        const text = normalizedTaskText(task);
        if (filters.search.trim() && !text.includes(filters.search.trim().toLowerCase())) return false;
        if (filters.status !== 'all' && task.status.toLowerCase() !== filters.status) return false;
        return true;
    });

const isStoppable = (task: TaskRecord) => ['pending', 'processing'].includes(task.status.toLowerCase());

const getTableColumnConfig = (tableId: string): TableColumnConfig => {
    switch (tableId) {
        case 'recorded-video':
            return {
                taskHeader: 'Recorded Interview Task',
                subjectHeader: 'Candidate',
                renderSubject: (task) => <span className="text-[14px] text-card-foreground">{task.candidate_name || 'N/A'}</span>,
            };
        case 'live-video':
            return {
                taskHeader: 'Live Interview Task',
                subjectHeader: 'Candidate',
                renderSubject: (task) => <span className="text-[14px] text-card-foreground">{task.candidate_name || 'N/A'}</span>,
            };
        case 'anti-cheating':
            return {
                taskHeader: 'Recording Check',
                subjectHeader: 'Candidate',
                renderSubject: (task) => <span className="text-[14px] text-card-foreground">{task.candidate_name || 'N/A'}</span>,
            };
        case 'cv-processing':
            return {
                taskHeader: 'CV Processing Task',
                subjectHeader: 'Source File & Metrics',
                renderSubject: (task) => (
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-[13px] text-card-foreground">{task.source_filename || 'Uploaded source'}</span>
                        {task.total_generated != null && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{task.total_generated} processed</span>}
                        {task.total_flagged != null && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{task.total_flagged} skipped</span>}
                        {task.total_approved != null && <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">{task.total_approved} approved</span>}
                    </div>
                ),
            };
        case 'github-processing':
            return {
                taskHeader: 'GitHub Processing Task',
                subjectHeader: 'Source File & Metrics',
                renderSubject: (task) => (
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-[13px] text-card-foreground">{task.source_filename || 'Repository-derived source'}</span>
                        {task.total_generated != null && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{task.total_generated} gen</span>}
                        {task.total_flagged != null && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{task.total_flagged} flagged</span>}
                        {task.total_approved != null && <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">{task.total_approved} approved</span>}
                    </div>
                ),
            };
        case 'question-generation':
            return {
                taskHeader: 'Question Generation Task',
                subjectHeader: 'Source & Output Metrics',
                renderSubject: (task) => (
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-[13px] text-card-foreground">{task.source_filename || 'Generated source context'}</span>
                        {task.total_generated != null && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{task.total_generated} gen</span>}
                        {task.total_flagged != null && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{task.total_flagged} flagged</span>}
                        {task.total_approved != null && <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">{task.total_approved} approved</span>}
                    </div>
                ),
            };
        case 'question-extraction':
            return {
                taskHeader: 'Question Extraction Task',
                subjectHeader: 'Source & Output Metrics',
                renderSubject: (task) => (
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-[13px] text-card-foreground">{task.source_filename || 'Extraction source file'}</span>
                        {task.total_generated != null && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{task.total_generated} gen</span>}
                        {task.total_flagged != null && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{task.total_flagged} flagged</span>}
                        {task.total_approved != null && <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">{task.total_approved} approved</span>}
                    </div>
                ),
            };
        case 'qag-generation':
            return {
                taskHeader: 'Criteria Generation Task',
                subjectHeader: 'Position & Generated Criteria',
                renderSubject: (task) => (
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-[13px] text-card-foreground">{task.source_filename || 'Position'}</span>
                        {task.total_generated != null && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{task.total_generated} questions</span>}
                    </div>
                ),
            };
        case 'qag-resume-correction':
            return {
                taskHeader: 'Candidate Correction Task',
                subjectHeader: 'Position & Corrected Candidates',
                renderSubject: (task) => (
                    <div className="flex flex-col gap-1 text-[12px]">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] text-card-foreground">{task.source_filename || 'Position'}</span>
                            {task.total_approved != null && <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">{task.total_approved} corrected</span>}
                            {task.candidates_found != null && <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100">{task.candidates_found} found</span>}
                            {task.candidates_processed != null && <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">{task.candidates_processed} processed</span>}
                            {task.candidates_skipped != null && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{task.candidates_skipped} skipped</span>}
                        </div>
                        {task.zero_reason && (
                            <span className="text-[11px] text-amber-700">{task.zero_reason}</span>
                        )}
                    </div>
                ),
            };
        case 'unclassified-imports':
            return {
                taskHeader: 'Unclassified Import Task',
                subjectHeader: 'Source & Output Metrics',
                renderSubject: (task) => (
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                        <span className="text-[13px] text-card-foreground">{task.source_filename || 'Unclassified source'}</span>
                        {task.total_generated != null && <span className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{task.total_generated} gen</span>}
                        {task.total_flagged != null && <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{task.total_flagged} flagged</span>}
                        {task.total_approved != null && <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">{task.total_approved} approved</span>}
                    </div>
                ),
            };
        default:
            return {
                taskHeader: 'Task',
                subjectHeader: 'Candidate / Output',
                renderSubject: (task) =>
                    task.task_category === 'question_import'
                        ? <span className="text-[14px] text-card-foreground">{task.source_filename || 'Generated output'}</span>
                        : <span className="text-[14px] text-card-foreground">{task.candidate_name || 'N/A'}</span>,
            };
    }
};

export function BackgroundTasks() {
    const navigate = useNavigate();
    const location = useLocation();

    const rawView = location.pathname.split('/').pop() || '';
    const activeView: PageView = isPageView(rawView) ? rawView : 'dashboard';

    const [activeCategory, setActiveCategory] = useState<CategoryId>('video-processing');
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [taskLogs, setTaskLogs] = useState<Record<string, LogEntry[]>>({});
    const [sloHealth, setSloHealth] = useState<SloHealthResponse | null>(null);

    const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
    const [deletingTaskIds, setDeletingTaskIds] = useState<string[]>([]);
    const [stoppingTaskIds, setStoppingTaskIds] = useState<string[]>([]);
    const [isStoppingAllTasks, setIsStoppingAllTasks] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);
    const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
    const [filtersByTable, setFiltersByTable] = useState<Record<string, TableFilters>>({});

    const isDeleteInFlight = deletingTaskIds.length > 0 || isBulkDeleting;
    const isStopInFlight = stoppingTaskIds.length > 0 || isStoppingAllTasks;
    const isActionInFlight = isDeleteInFlight || isStopInFlight;

    const fetchTasks = async () => {
        try {
            const [data, slo] = await Promise.all([
                api.recruiter.getBackgroundTasks(),
                api.recruiter.getBackgroundTaskSloHealth(),
            ]);
            setTasks(data);
            setSloHealth(slo);
            setSelectedTaskIds((prev) => prev.filter((id) => data.some((item) => item.id === id)));
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async (taskId: string) => {
        try {
            const data = await api.recruiter.getTaskLogs(taskId);
            setTaskLogs((prev) => ({ ...prev, [taskId]: data.logs }));
        } catch (error) {
            console.error(`Failed to fetch logs for task ${taskId}:`, error);
        }
    };

    useEffect(() => {
        fetchTasks();
        let timer: any;
        if (autoRefresh) {
            timer = setInterval(fetchTasks, 5000);
        }
        return () => {
            if (timer) clearInterval(timer);
        };
    }, [autoRefresh]);

    const videoTasks = useMemo(() => tasks.filter((task) => task.task_category === 'video'), [tasks]);
    const questionImportTasks = useMemo(
        () => tasks.filter((task) => task.task_category === 'question_import' || task.task_category === 'github_analysis' || task.task_category === 'cv_ingestion'),
        [tasks]
    );
    const qagTasks = useMemo(() => tasks.filter((task) => task.task_category === 'qag'), [tasks]);

    const categorized = useMemo(() => {
        const recorded = videoTasks.filter((task) => !isAntiCheatingTask(task) && !isLiveVideoTask(task));
        const live = videoTasks.filter((task) => !isAntiCheatingTask(task) && isLiveVideoTask(task));
        const anti = videoTasks.filter((task) => isAntiCheatingTask(task));

        const profileOnlyImports = questionImportTasks.filter(
            (task) => !isGenerationTask(task) && !isExtractionTask(task)
        );

        const cv = profileOnlyImports.filter((task) => isCvTask(task));
        const github = profileOnlyImports.filter((task) => !isCvTask(task) && isGithubTask(task));
        const unclassifiedImports = profileOnlyImports.filter((task) => !isCvTask(task) && !isGithubTask(task));

        const generation = questionImportTasks.filter((task) => isGenerationTask(task));
        const extraction = questionImportTasks.filter((task) => isExtractionTask(task));
        const qagGeneration = qagTasks.filter((task) => normalizedTaskText(task).includes('generation'));
        const qagResumeCorrection = qagTasks.filter((task) => normalizedTaskText(task).includes('resume correction'));
        const qagUnclassified = qagTasks.filter(
            (task) => !normalizedTaskText(task).includes('generation') && !normalizedTaskText(task).includes('resume correction')
        );

        return {
            'video-processing': [
                {
                    id: 'recorded-video',
                    title: 'Recorded Video Interview',
                    description: 'Asynchronous interview processing pipeline',
                    tasks: recorded,
                },
                {
                    id: 'live-video',
                    title: 'Live Video Interview',
                    description: 'Real-time interview processing pipeline',
                    tasks: live,
                },
            ],
            'profile-processing': [
                {
                    id: 'cv-processing',
                    title: 'CV Processing',
                    description: 'Imports sourced from CV/resume files',
                    tasks: cv,
                },
                {
                    id: 'github-processing',
                    title: 'GitHub Processing & Inspired Questions',
                    description: 'Repository/profile-driven generation flows',
                    tasks: github,
                },
                ...(unclassifiedImports.length > 0
                    ? [
                        {
                            id: 'unclassified-imports',
                            title: 'Unclassified Imports',
                            description: 'Imports not matched to CV/GitHub or generation/extraction rules',
                            tasks: unclassifiedImports,
                        },
                    ]
                    : []),
            ],
            'video-recording': [
                {
                    id: 'anti-cheating',
                    title: 'Anti-Cheating Recordings',
                    description: 'Recording analysis for suspicious behavior',
                    tasks: anti,
                },
            ],
            'question-generation-extraction': [
                {
                    id: 'question-generation',
                    title: 'Question Generation',
                    description: 'Generative question import jobs',
                    tasks: generation,
                },
                {
                    id: 'question-extraction',
                    title: 'Question Extraction',
                    description: 'Extraction and CSV-based import jobs',
                    tasks: extraction,
                },
            ],
            'qag-processing': [
                {
                    id: 'qag-generation',
                    title: 'Criteria Generation',
                    description: 'Generate position pre-matching criteria from the approved JD',
                    tasks: qagGeneration,
                },
                {
                    id: 'qag-resume-correction',
                    title: 'Candidate Correction',
                    description: 'Evaluate and correct parsed candidate resumes against approved criteria',
                    tasks: qagResumeCorrection,
                },
                ...(qagUnclassified.length > 0
                    ? [
                        {
                            id: 'qag-unclassified',
                            title: 'Other Pre-Matching Processing',
                            description: 'Pre-matching jobs not matched to criteria-generation/candidate-correction tags',
                            tasks: qagUnclassified,
                        },
                    ]
                    : []),
            ],
        } as Record<CategoryId, SectionTable[]>;
    }, [videoTasks, questionImportTasks, qagTasks]);

    const activeCategoryTables = useMemo(() => categorized[activeCategory], [activeCategory, categorized]);

    const visibleTasks = useMemo(() => {
        return activeCategoryTables.flatMap((table) => {
            const filters = filtersByTable[table.id] || DEFAULT_FILTERS;
            return applyFilters(table.tasks, filters);
        });
    }, [activeCategoryTables, filtersByTable]);

    useEffect(() => {
        const visibleIds = new Set(visibleTasks.map((task) => task.id));
        setSelectedTaskIds((prev) => prev.filter((id) => visibleIds.has(id)));
        setExpandedTaskId((prev) => (prev && visibleIds.has(prev) ? prev : null));
    }, [visibleTasks]);

    const overview = useMemo(() => {
        const countsByStatus = {
            pending: tasks.filter((task) => task.status.toLowerCase() === 'pending').length,
            processing: tasks.filter((task) => task.status.toLowerCase() === 'processing').length,
            completed: tasks.filter((task) => task.status.toLowerCase() === 'completed').length,
            failed: tasks.filter((task) => task.status.toLowerCase() === 'failed').length,
            cancelled: tasks.filter((task) => task.status.toLowerCase() === 'cancelled').length,
        };

        const categoryCounts = {
            'video-processing': categorized['video-processing'].reduce((sum, table) => sum + table.tasks.length, 0),
            'profile-processing': categorized['profile-processing'].reduce((sum, table) => sum + table.tasks.length, 0),
            'video-recording': categorized['video-recording'].reduce((sum, table) => sum + table.tasks.length, 0),
            'question-generation-extraction': categorized['question-generation-extraction'].reduce((sum, table) => sum + table.tasks.length, 0),
            'qag-processing': categorized['qag-processing'].reduce((sum, table) => sum + table.tasks.length, 0),
        };

        const recent = [...tasks]
            .filter((task) => !!task.timestamp)
            .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
            .slice(-12);

        return {
            total: tasks.length,
            countsByStatus,
            categoryCounts,
            recent,
        };
    }, [tasks, categorized]);

    const maxStatus = Math.max(1, ...Object.values(overview.countsByStatus));
    const maxCategory = Math.max(1, ...Object.values(overview.categoryCounts));
    const maxRecent = Math.max(1, ...overview.recent.map((_, idx, arr) => arr.length - idx));

    const toggleExpand = (taskId: string) => {
        if (expandedTaskId === taskId) {
            setExpandedTaskId(null);
            return;
        }
        setExpandedTaskId(taskId);
        fetchLogs(taskId);
    };

    const updateFilters = (tableId: string, patch: Partial<TableFilters>) => {
        setFiltersByTable((prev) => ({
            ...prev,
            [tableId]: {
                ...(prev[tableId] || DEFAULT_FILTERS),
                ...patch,
            },
        }));
    };

    const toggleSelectTask = (taskId: string) => {
        setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
    };

    const toggleSelectAllForTable = (tableTasks: TaskRecord[]) => {
        const ids = tableTasks.map((task) => task.id);
        const allSelected = ids.length > 0 && ids.every((id) => selectedTaskIds.includes(id));
        if (allSelected) {
            setSelectedTaskIds((prev) => prev.filter((id) => !ids.includes(id)));
            return;
        }
        setSelectedTaskIds((prev) => Array.from(new Set([...prev, ...ids])));
    };

    const handleDeleteTask = async (e: React.MouseEvent, task: TaskRecord) => {
        e.stopPropagation();
        if (isDeleteInFlight) return;

        if (task.status.toLowerCase() === 'processing') {
            window.alert('Cannot delete a task while it is processing.');
            return;
        }

        const confirmed = window.confirm(`Delete this ${task.type} task? This action cannot be undone.`);
        if (!confirmed) return;

        try {
            setDeletingTaskId(task.id);
            setDeletingTaskIds((prev) => [...prev, task.id]);
            await api.recruiter.deleteBackgroundTask(task.id, task.task_category);

            setTasks((prev) => prev.filter((item) => item.id !== task.id));
            setSelectedTaskIds((prev) => prev.filter((id) => id !== task.id));
            setTaskLogs((prev) => {
                const next = { ...prev };
                delete next[task.id];
                return next;
            });
            if (expandedTaskId === task.id) setExpandedTaskId(null);
        } catch (error) {
            console.error('Failed to delete task:', error);
            window.alert('Failed to delete task. Please try again.');
        } finally {
            setDeletingTaskId(null);
            setDeletingTaskIds((prev) => prev.filter((id) => id !== task.id));
        }
    };

    const handleBulkDelete = async () => {
        if (selectedTaskIds.length === 0 || isActionInFlight) return;

        const selectedTasks = visibleTasks.filter((task) => selectedTaskIds.includes(task.id));
        const deletable = selectedTasks.filter((task) => task.status.toLowerCase() !== 'processing');
        if (deletable.length === 0) {
            window.alert('Selected tasks are processing and cannot be deleted right now.');
            return;
        }

        const confirmed = window.confirm(`Delete ${deletable.length} selected task(s)? This action cannot be undone.`);
        if (!confirmed) return;

        setIsBulkDeleting(true);
        setDeletingTaskIds(deletable.map((task) => task.id));

        const results = await Promise.allSettled(
            deletable.map((task) => api.recruiter.deleteBackgroundTask(task.id, task.task_category))
        );

        const successIds = deletable
            .filter((_, idx) => results[idx].status === 'fulfilled')
            .map((task) => task.id);

        setTasks((prev) => prev.filter((task) => !successIds.includes(task.id)));
        setSelectedTaskIds((prev) => prev.filter((id) => !successIds.includes(id)));
        setDeletingTaskIds([]);
        setIsBulkDeleting(false);
    };

    const handleStopTasksForTable = async (tableTitle: string, tableTasks: TaskRecord[]) => {
        if (isActionInFlight) return;

        const stoppable = tableTasks.filter((task) => isStoppable(task));
        if (stoppable.length === 0) {
            window.alert('No pending or processing tasks in this table.');
            return;
        }

        const confirmed = window.confirm(`Stop ${stoppable.length} task(s) in ${tableTitle}?`);
        if (!confirmed) return;

        setStoppingTaskIds(stoppable.map((task) => task.id));
        const results = await Promise.allSettled(
            stoppable.map((task) =>
                task.task_category === 'question_import'
                    ? api.recruiter.stopQuestionImportTask(task.id)
                    : task.task_category === 'github_analysis'
                        ? api.recruiter.stopGithubAnalysisTask(task.id)
                        : task.task_category === 'qag'
                            ? api.recruiter.stopQagTask(task.id)
                            : task.task_category === 'cv_ingestion'
                                ? api.recruiter.stopCvIngestionTask(task.id)
                            : api.recruiter.stopVideoTask(task.id)
            )
        );
        const successIds = stoppable
            .filter((_, idx) => results[idx].status === 'fulfilled')
            .map((task) => task.id);

        if (successIds.length > 0) {
            setTasks((prev) => prev.map((task) => (successIds.includes(task.id) ? { ...task, status: 'cancelled' } : task)));
        }

        setStoppingTaskIds([]);
    };

    const handleStopAllTasksFromDashboard = async () => {
        if (isActionInFlight) return;

        const runningVideoCount = tasks.filter(
            (task) => task.task_category === 'video' && ['pending', 'processing'].includes(task.status.toLowerCase())
        ).length;
        const runningImportCount = tasks.filter(
            (task) => task.task_category === 'question_import' && ['pending', 'processing'].includes(task.status.toLowerCase())
        ).length;
        const runningGithubAnalysisCount = tasks.filter(
            (task) => task.task_category === 'github_analysis' && ['pending', 'processing'].includes(task.status.toLowerCase())
        ).length;
        const runningQagCount = tasks.filter(
            (task) => task.task_category === 'qag' && ['pending', 'processing'].includes(task.status.toLowerCase())
        ).length;
        const runningCvIngestionCount = tasks.filter(
            (task) => task.task_category === 'cv_ingestion' && ['pending', 'processing'].includes(task.status.toLowerCase())
        ).length;
        const totalRunning = runningVideoCount + runningImportCount + runningGithubAnalysisCount + runningQagCount + runningCvIngestionCount;

        if (totalRunning === 0) {
            window.alert('No pending or processing tasks to stop.');
            return;
        }

        const confirmed = window.confirm(
            `Stop ${totalRunning} running task(s)? (${runningVideoCount} video, ${runningImportCount} question import, ${runningGithubAnalysisCount} GitHub analysis, ${runningQagCount} QAG, ${runningCvIngestionCount} CV ingestion)`
        );
        if (!confirmed) return;

        try {
            setIsStoppingAllTasks(true);

            await Promise.all([
                runningVideoCount > 0 ? api.recruiter.stopAllVideoTasks() : Promise.resolve(null),
                runningImportCount > 0 ? api.recruiter.stopAllQuestionImportTasks() : Promise.resolve(null),
                runningGithubAnalysisCount > 0 ? api.recruiter.stopAllGithubAnalysisTasks() : Promise.resolve(null),
                runningQagCount > 0 ? api.recruiter.stopAllQagTasks() : Promise.resolve(null),
                runningCvIngestionCount > 0 ? api.recruiter.stopAllCvIngestionTasks() : Promise.resolve(null),
            ]);

            setTasks((prev) =>
                prev.map((task) =>
                    ['pending', 'processing'].includes(task.status.toLowerCase()) ? { ...task, status: 'cancelled' } : task
                )
            );
        } catch (error) {
            console.error('Failed to stop running tasks:', error);
            window.alert('Failed to stop one or more running tasks. Please try again.');
        } finally {
            setIsStoppingAllTasks(false);
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed':
                return <CheckCircle size={18} className="text-green-500" />;
            case 'failed':
                return <XCircle size={18} className="text-red-500" />;
            case 'processing':
                return <Loader2 size={18} className="text-blue-500 animate-spin" />;
            case 'cancelled':
                return <XCircle size={18} className="text-orange-500" />;
            default:
                return <Clock size={18} className="text-gray-400" />;
        }
    };

    const getStatusStyle = (status: string) => {
        switch (status.toLowerCase()) {
            case 'completed':
                return 'bg-green-50 text-green-700 border-green-100';
            case 'failed':
                return 'bg-red-50 text-red-700 border-red-100';
            case 'processing':
                return 'bg-blue-50 text-blue-700 border-blue-100';
            case 'cancelled':
                return 'bg-orange-50 text-orange-700 border-orange-100';
            default:
                return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    const renderTable = (table: SectionTable) => {
        const filters = filtersByTable[table.id] || DEFAULT_FILTERS;
        const columns = getTableColumnConfig(table.id);
        const filteredTasks = applyFilters(table.tasks, filters);
        const allSelected = filteredTasks.length > 0 && filteredTasks.every((task) => selectedTaskIds.includes(task.id));
        const hasStoppableTasks = filteredTasks.some((task) => isStoppable(task));

        return (
            <div key={table.id} className="rounded-[16px] border border-border bg-card shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-border bg-muted/40 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h3 className="text-[16px] font-semibold text-card-foreground">{table.title}</h3>
                            <p className="text-[13px] text-muted-foreground mt-1">{table.description}</p>
                        </div>
                        {filteredTasks.length > 0 && (
                            <button
                                onClick={() => handleStopTasksForTable(table.title, filteredTasks)}
                                disabled={isActionInFlight || !hasStoppableTasks}
                                className="h-[36px] px-3 rounded-[10px] border border-destructive/30 bg-destructive/10 text-destructive text-[13px] disabled:opacity-60"
                            >
                                {isStopInFlight ? 'Stopping...' : 'Stop Tasks In Table'}
                            </button>
                        )}
                    </div>

                    <div className="grid grid-cols-1 gap-3">
                        <label className="flex items-center gap-2 h-[38px] px-3 rounded-[10px] border border-border bg-background">
                            <Filter size={14} className="text-muted-foreground" />
                            <input
                                value={filters.search}
                                onChange={(e) => updateFilters(table.id, { search: e.target.value })}
                                placeholder="Search"
                                className="w-full bg-transparent outline-none text-[13px]"
                            />
                        </label>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => updateFilters(table.id, { status: 'all' })}
                                className={`px-3 py-1 rounded-full text-xs border ${
                                    filters.status === 'all'
                                        ? 'bg-gray-900 text-white border-gray-900'
                                        : 'bg-background text-muted-foreground border-border hover:bg-muted'
                                }`}
                            >
                                All ({table.tasks.length})
                            </button>

                            {SUB_STATUS_FILTERS.map((sub) => {
                                const count = table.tasks.filter((task) => task.status.toLowerCase() === sub.id).length;
                                const active = filters.status === sub.id;
                                const style =
                                    sub.id === 'pending'
                                        ? active
                                            ? 'bg-amber-600 text-white border-amber-600'
                                            : 'bg-amber-50 text-amber-700 border-amber-200'
                                        : sub.id === 'processing'
                                            ? active
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-blue-50 text-blue-700 border-blue-200'
                                            : sub.id === 'completed'
                                                ? active
                                                    ? 'bg-green-600 text-white border-green-600'
                                                    : 'bg-green-50 text-green-700 border-green-200'
                                                : active
                                                    ? 'bg-red-600 text-white border-red-600'
                                                    : 'bg-red-50 text-red-700 border-red-200';

                                return (
                                    <button
                                        key={sub.id}
                                        type="button"
                                        onClick={() => updateFilters(table.id, { status: sub.id })}
                                        className={`px-3 py-1 rounded-full text-xs border ${style}`}
                                    >
                                        {sub.label} ({count})
                                    </button>
                                );
                            })}

                            {filters.status !== 'all' && (
                                <button
                                    type="button"
                                    onClick={() => updateFilters(table.id, { status: 'all' })}
                                    className="px-3 py-1 rounded-full text-xs border border-gray-300 bg-gray-50 text-gray-700"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {table.tasks.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-[14px]">No tasks in this table.</div>
                ) : filteredTasks.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground text-[14px]">No tasks in this table.</div>
                ) : (
                    <table className="w-full text-left">
                        <thead className="bg-muted/50 border-b border-border">
                            <tr>
                                <th className="px-6 py-4 w-10">
                                    <input
                                        type="checkbox"
                                        checked={allSelected}
                                        onChange={() => toggleSelectAllForTable(filteredTasks)}
                                        className="w-4 h-4"
                                    />
                                </th>
                                <th className="px-6 py-4 text-[12px] font-medium text-muted-foreground uppercase">Status</th>
                                <th className="px-6 py-4 text-[12px] font-medium text-muted-foreground uppercase">{columns.taskHeader}</th>
                                <th className="px-6 py-4 text-[12px] font-medium text-muted-foreground uppercase">{columns.subjectHeader}</th>
                                <th className="px-6 py-4 text-[12px] font-medium text-muted-foreground uppercase">Started</th>
                                <th className="px-6 py-4 text-[12px] font-medium text-muted-foreground uppercase text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/70">
                            {filteredTasks.map((task) => (
                                <React.Fragment key={task.id}>
                                    <tr
                                        className={`hover:bg-muted/40 transition-colors cursor-pointer ${
                                            expandedTaskId === task.id ? 'bg-muted/50' : ''
                                        }`}
                                        onClick={() => toggleExpand(task.id)}
                                    >
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={selectedTaskIds.includes(task.id)}
                                                onChange={() => toggleSelectTask(task.id)}
                                                className="w-4 h-4"
                                            />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {getStatusIcon(task.status)}
                                                <span className={`px-[10px] py-[3px] rounded-[6px] text-[12px] border ${getStatusStyle(task.status)}`}>
                                                    {formatStatusLabel(task.status)}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {task.task_category === 'question_import' ? (
                                                    <Sparkles size={14} className="text-primary" />
                                                ) : task.task_category === 'qag' ? (
                                                    <WandSparkles size={14} className="text-primary" />
                                                ) : (
                                                    <FileText size={14} className="text-primary" />
                                                )}
                                                <span className="text-[14px] text-card-foreground">{task.type}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-[14px] text-card-foreground">
                                            {columns.renderSubject(task)}
                                        </td>
                                        <td className="px-6 py-4 text-[13px] text-muted-foreground">{formatTime(task.timestamp)}</td>
                                        <td className="px-6 py-4 text-right">
                                            <button
                                                type="button"
                                                onClick={(e) => handleDeleteTask(e, task)}
                                                disabled={
                                                    deletingTaskId === task.id ||
                                                    deletingTaskIds.includes(task.id) ||
                                                    isActionInFlight ||
                                                    task.status.toLowerCase() === 'processing'
                                                }
                                                className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border text-destructive disabled:opacity-50"
                                            >
                                                {deletingTaskId === task.id || deletingTaskIds.includes(task.id) ? (
                                                    <Loader2 size={14} className="animate-spin" />
                                                ) : (
                                                    <Trash2 size={14} />
                                                )}
                                            </button>
                                        </td>
                                    </tr>

                                    {expandedTaskId === task.id && (
                                        <tr className="bg-muted/30">
                                            <td colSpan={6} className="px-10 py-6 border-t border-border/70">
                                                <h4 className="text-[14px] font-semibold text-card-foreground mb-3 flex items-center gap-2">
                                                    <Activity size={16} className="text-primary" /> Processing Timeline
                                                </h4>
                                                <div className="space-y-4">
                                                    {taskLogs[task.id]?.length > 0 ? (
                                                        taskLogs[task.id].map((log, idx) => (
                                                            <div key={idx} className="rounded-[10px] border border-border p-3 bg-background">
                                                                <div className="flex items-center justify-between gap-4">
                                                                    <p className="text-[13px] font-medium">{log.step.replace(/_/g, ' ').toUpperCase()}</p>
                                                                    <p className="text-[12px] text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</p>
                                                                </div>
                                                            </div>
                                                        ))
                                                    ) : (
                                                        <div className="text-[13px] text-muted-foreground">Fetching detailed logs...</div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
        );
    };

    const activeCategoryMeta = CATEGORIES.find((c) => c.id === activeCategory);
    const activeCategoryIndex = CATEGORIES.findIndex((c) => c.id === activeCategory);

    return (
        <div className="min-h-screen bg-background text-foreground font-['Arimo',sans-serif]">
            <div className="px-8 py-6 w-full">
                <div className="mb-8">
                    <h1 className="text-[32px] font-medium mb-2 flex items-center gap-3">
                        <Activity className="text-primary" size={32} /> Background Tasks
                    </h1>
                    <p className="text-[14px] text-muted-foreground">{PAGE_TABS.find((tab) => tab.id === activeView)?.subtitle}</p>
                </div>

                <div className="mx-auto w-full max-w-[1440px]">
                    {sloHealth?.alerts?.length ? (
                        <div className="mb-4 rounded-[12px] border border-amber-300 bg-amber-50 px-4 py-3">
                            <div className="text-[13px] font-semibold text-amber-900 mb-2">
                                SLO Alerts ({sloHealth.alerts.length}) · Last {sloHealth.window_hours}h
                            </div>
                            <div className="space-y-1">
                                {sloHealth.alerts.slice(0, 5).map((alert, idx) => (
                                    <div key={`${alert.pipeline}-${alert.metric}-${idx}`} className="text-[12px] text-amber-800">
                                        <span className="font-semibold">[{alert.pipeline}]</span> {alert.message} ({alert.metric}: {alert.actual} vs threshold {alert.threshold})
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="mb-4 rounded-[12px] border border-emerald-300 bg-emerald-50 px-4 py-3 text-[12px] text-emerald-800">
                            SLO health is stable across question import, GitHub analysis, and transcription pipelines.
                        </div>
                    )}

                    <div className="mb-6 flex flex-wrap gap-3">
                        {PAGE_TABS.map((tab) => {
                            const active = tab.id === activeView;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => navigate(`/recruiter/background-tasks/${tab.id}`)}
                                    className={`h-[40px] px-4 rounded-[10px] border text-[13px] transition-colors ${
                                        active
                                            ? 'bg-primary text-primary-foreground border-primary'
                                            : 'bg-card border-border text-card-foreground hover:bg-muted'
                                    }`}
                                >
                                    {tab.title}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border bg-card px-4 py-3">
                        <div className="text-[13px] text-muted-foreground">Auto-refresh and actions are shared for this page.</div>
                        <div className="flex items-center gap-3">
                            {activeView === 'dashboard' && (
                                <button
                                    onClick={handleStopAllTasksFromDashboard}
                                    disabled={isActionInFlight}
                                    className="h-[36px] px-3 rounded-[10px] border border-destructive/30 bg-destructive/10 text-destructive text-[13px] disabled:opacity-60 inline-flex items-center gap-2"
                                >
                                    {isStoppingAllTasks ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                                    Stop Running Tasks
                                </button>
                            )}

                            {selectedTaskIds.length > 0 && (
                                <button
                                    onClick={handleBulkDelete}
                                    disabled={isActionInFlight}
                                    className="h-[36px] px-3 rounded-[10px] border border-destructive/30 bg-destructive/10 text-destructive text-[13px] disabled:opacity-60"
                                >
                                    {isBulkDeleting ? 'Deleting...' : `Delete Selected (${selectedTaskIds.length})`}
                                </button>
                            )}

                            <label className="flex items-center gap-2 h-[36px] px-3 rounded-[10px] border border-border bg-background text-[13px]">
                                <input
                                    type="checkbox"
                                    checked={autoRefresh}
                                    onChange={(e) => setAutoRefresh(e.target.checked)}
                                    className="w-4 h-4"
                                />
                                Auto-refresh (5s)
                            </label>

                            <button
                                onClick={fetchTasks}
                                className="h-[36px] w-[36px] inline-flex items-center justify-center rounded-[10px] border border-border bg-background text-muted-foreground hover:text-primary"
                            >
                                <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
                            </button>
                        </div>
                    </div>

                {loading && tasks.length === 0 ? (
                    <div className="py-24 bg-card rounded-[16px] border border-border shadow-sm">
                        <LoadingSpinner message="Loading background tasks..." fullScreen={false} />
                    </div>
                ) : activeView === 'dashboard' ? (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="rounded-[12px] border border-border bg-card px-4 py-3">
                                <p className="text-[12px] text-muted-foreground">Total Tasks</p>
                                <p className="text-[24px] font-semibold">{overview.total}</p>
                            </div>
                            <div className="rounded-[12px] border border-border bg-card px-4 py-3">
                                <p className="text-[12px] text-muted-foreground">Video Tasks</p>
                                <p className="text-[24px] font-semibold">{videoTasks.length}</p>
                            </div>
                            <div className="rounded-[12px] border border-border bg-card px-4 py-3">
                                <p className="text-[12px] text-muted-foreground">Question Import Tasks</p>
                                <p className="text-[24px] font-semibold">{questionImportTasks.length}</p>
                            </div>
                            <div className="rounded-[12px] border border-border bg-card px-4 py-3">
                                <p className="text-[12px] text-muted-foreground">Position Pre-Matching Tasks</p>
                                <p className="text-[24px] font-semibold">{qagTasks.length}</p>
                            </div>
                            <div className="rounded-[12px] border border-border bg-card px-4 py-3">
                                <p className="text-[12px] text-muted-foreground">Active (Pending + Processing)</p>
                                <p className="text-[24px] font-semibold">
                                    {overview.countsByStatus.pending + overview.countsByStatus.processing}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="rounded-[16px] border border-border bg-card p-5">
                                <h3 className="text-[15px] font-semibold mb-4">Status Distribution</h3>
                                <div className="space-y-3">
                                    {Object.entries(overview.countsByStatus).map(([key, value]) => (
                                        <div key={key}>
                                            <div className="flex items-center justify-between text-[12px] mb-1">
                                                <span className="text-muted-foreground capitalize">{key}</span>
                                                <span className="font-medium text-card-foreground">{value}</span>
                                            </div>
                                            <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                <div
                                                    className="h-full bg-primary rounded-full transition-all duration-500"
                                                    style={{ width: `${(value / maxStatus) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-[16px] border border-border bg-card p-5">
                                <h3 className="text-[15px] font-semibold mb-4">Category Load</h3>
                                <div className="space-y-3">
                                    {CATEGORIES.map((cat) => {
                                        const value = overview.categoryCounts[cat.id];
                                        return (
                                            <div key={cat.id}>
                                                <div className="flex items-center justify-between text-[12px] mb-1">
                                                    <span className="text-muted-foreground">{cat.title}</span>
                                                    <span className="font-medium text-card-foreground">{value}</span>
                                                </div>
                                                <div className="h-2 rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className="h-full bg-accent-foreground/70 rounded-full transition-all duration-500"
                                                        style={{ width: `${(value / maxCategory) * 100}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[16px] border border-border bg-card p-5">
                            <h3 className="text-[15px] font-semibold mb-4">Recent Activity Trend</h3>
                            {overview.recent.length === 0 ? (
                                <p className="text-[13px] text-muted-foreground">No recent activity available.</p>
                            ) : (
                                <div className="flex items-end gap-2 h-[180px]">
                                    {overview.recent.map((task, idx) => {
                                        const value = overview.recent.length - idx;
                                        const height = Math.max(12, (value / maxRecent) * 100);
                                        return (
                                            <div key={task.id} className="flex-1 min-w-0 flex flex-col items-center gap-2">
                                                <div className="w-full rounded-t bg-primary/70 transition-all duration-500" style={{ height: `${height}%` }} />
                                                <p className="text-[10px] text-muted-foreground truncate w-full text-center">{formatTime(task.timestamp)}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6">
                        <div className="rounded-[16px] border border-border bg-card p-3 overflow-x-auto">
                            <div className="relative min-w-[860px] rounded-[12px] border border-border bg-background p-1">
                                <div
                                    className="pointer-events-none absolute top-1 bottom-1 left-1 w-[calc((100%-0.5rem)/5)] transition-transform duration-300 ease-out motion-reduce:transition-none"
                                    style={{ transform: `translateX(${Math.max(activeCategoryIndex, 0) * 100}%)` }}
                                >
                                    <div className="h-full w-full rounded-[9px] border border-primary/25 bg-primary/15 shadow-[0_4px_14px_rgba(99,102,241,0.18)]" />
                                </div>

                                <div className="relative z-10 grid grid-cols-5 gap-0">
                                    {CATEGORIES.map((category) => {
                                        const active = category.id === activeCategory;
                                        return (
                                            <button
                                                key={category.id}
                                                onClick={() => setActiveCategory(category.id)}
                                                className={`h-[42px] px-3 rounded-[9px] text-[13px] transition-all duration-200 ease-out motion-reduce:transition-none active:scale-[0.98] flex items-center justify-center gap-2 ${
                                                    active
                                                        ? 'text-primary font-semibold'
                                                        : 'text-card-foreground hover:bg-muted/70 hover:text-foreground'
                                                }`}
                                            >
                                                {category.icon}
                                                <span className="truncate">{category.title}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[12px] border border-border bg-muted/30 px-4 py-3">
                            <p className="text-[13px] text-muted-foreground">{activeCategoryMeta?.description}</p>
                        </div>

                        <div className="space-y-6">{activeCategoryTables.map((table) => renderTable(table))}</div>
                    </div>
                )}
            </div>
            </div>
        </div>
    );
}
