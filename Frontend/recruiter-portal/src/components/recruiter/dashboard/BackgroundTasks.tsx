import React, { useState, useEffect } from 'react';
import { Activity, Clock, CheckCircle, XCircle, Loader2, ChevronRight, ChevronDown, RefreshCcw, Sparkles, FileText } from 'lucide-react';
import LoadingSpinner from '../../common/LoadingSpinner';
import { api } from '../../../services/api';

interface TaskRecord {
    id: string;
    status: string;
    type: string;
    task_category: 'video' | 'question_import';
    candidate_name: string | null;
    question: string;
    timestamp: string;
    source_filename: string | null;
    total_generated: number | null;
    total_flagged: number | null;
    total_approved: number | null;
    import_job_id: string | null;
}

interface LogEntry {
    timestamp: string;
    step: string;
    data: any;
}

export function BackgroundTasks() {
    const [tasks, setTasks] = useState<TaskRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
    const [taskLogs, setTaskLogs] = useState<Record<string, LogEntry[]>>({});
    const [autoRefresh, setAutoRefresh] = useState(true);

    const fetchTasks = async () => {
        try {
            const data = await api.recruiter.getBackgroundTasks();
            setTasks(data);
        } catch (error) {
            console.error('Failed to fetch tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async (taskId: string) => {
        try {
            const data = await api.recruiter.getTaskLogs(taskId);
            setTaskLogs(prev => ({ ...prev, [taskId]: data.logs }));
        } catch (error) {
            console.error(`Failed to fetch logs for task ${taskId}:`, error);
        }
    };

    useEffect(() => {
        fetchTasks();
        let interval: any;
        if (autoRefresh) {
            interval = setInterval(fetchTasks, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [autoRefresh]);

    const toggleExpand = (taskId: string) => {
        if (expandedTaskId === taskId) {
            setExpandedTaskId(null);
        } else {
            setExpandedTaskId(taskId);
            fetchLogs(taskId);
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
            default:
                return 'bg-gray-50 text-gray-700 border-gray-100';
        }
    };

    return (
        <div className="min-h-screen flex flex-col font-['Arimo',sans-serif]">
            <div className="px-8 py-6 w-full">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-[32px] font-medium text-[#111827] mb-2 flex items-center gap-3">
                        <Activity className="text-[#6366f1]" size={32} />
                        Background Tasks
                    </h1>
                    <p className="text-[14px] text-[#6b7280]">
                        Monitor AI processing and system automation tasks in real-time
                    </p>
                </div>

                <div className="max-w-[1400px]">
                    {/* Controls */}
                    <div className="mb-6 flex items-center justify-end gap-4">
                        <div className="flex items-center gap-2 h-[44px] px-[16px] rounded-[10px] border border-[#e5e7eb] bg-white shadow-sm">
                            <input 
                                type="checkbox" 
                                id="autoRefresh"
                                checked={autoRefresh}
                                onChange={(e) => setAutoRefresh(e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-[#6366f1] focus:ring-[#6366f1]"
                            />
                            <label htmlFor="autoRefresh" className="text-[14px] text-[#374151] cursor-pointer select-none">Auto-refresh (5s)</label>
                        </div>
                        <button 
                            onClick={fetchTasks}
                            className="flex items-center justify-center h-[44px] w-[44px] text-[#6b7280] hover:text-[#6366f1] hover:bg-[#f5f3ff] rounded-[10px] border border-[#e5e7eb] bg-white transition-colors shadow-sm"
                            title="Manual Refresh"
                        >
                            <RefreshCcw size={20} className={loading ? 'animate-spin' : ''} />
                        </button>
                    </div>

                    {loading && tasks.length === 0 ? (
                        <div className="py-24 bg-white rounded-[16px] border border-[#e5e7eb] shadow-sm">
                            <LoadingSpinner message="Loading background tasks..." fullScreen={false} />
                        </div>
                    ) : tasks.length === 0 ? (
                        <div className="text-center py-24 bg-white rounded-[16px] border border-[#e5e7eb] shadow-sm">
                            <div className="w-16 h-16 bg-[#f9fafb] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#e5e7eb]">
                                <Activity size={32} className="text-[#d1d5db]" />
                            </div>
                            <h3 className="text-[18px] font-medium text-[#111827]">No active tasks</h3>
                            <p className="text-[#6b7280] text-[14px] max-w-sm mx-auto mt-2">
                                Background tasks will appear here once candidates start submitting interviews for AI evaluation.
                            </p>
                        </div>
                    ) : (
                        <div className="bg-white rounded-[16px] border border-[#e5e7eb] shadow-sm overflow-hidden">
                            <table className="w-full text-left">
                                <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                                    <tr>
                                        <th className="px-6 py-4 text-[13px] font-medium text-[#6b7280] uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-[13px] font-medium text-[#6b7280] uppercase tracking-wider">Task Details</th>
                                        <th className="px-6 py-4 text-[13px] font-medium text-[#6b7280] uppercase tracking-wider">Candidate</th>
                                        <th className="px-6 py-4 text-[13px] font-medium text-[#6b7280] uppercase tracking-wider">Started At</th>
                                        <th className="px-6 py-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f3f4f6]">
                                    {tasks.map((task) => (
                                        <React.Fragment key={task.id}>
                                            <tr 
                                                className={`hover:bg-[#f9fafb] transition-colors cursor-pointer group ${expandedTaskId === task.id ? 'bg-[#f5f3ff]/30' : ''}`}
                                                onClick={() => toggleExpand(task.id)}
                                            >
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        {getStatusIcon(task.status)}
                                                        <span className={`px-[10px] py-[3px] rounded-[6px] text-[12px] font-medium border ${getStatusStyle(task.status)}`}>
                                                            {task.status.charAt(0).toUpperCase() + task.status.slice(1)}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            {(task as any).task_category === 'question_import'
                                                                ? <Sparkles size={14} className="text-purple-500" />
                                                                : <FileText size={14} className="text-blue-400" />}
                                                            <span className="text-[14px] font-medium text-[#111827]">{task.type}</span>
                                                        </div>
                                                        <span className="text-[12px] text-[#6b7280] truncate max-w-[220px]">
                                                            {(task as any).source_filename || task.question}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {(task as any).task_category === 'question_import' ? (
                                                        <div className="flex gap-2 text-[12px] flex-wrap">
                                                            {(task as any).total_generated != null && (
                                                                <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">{(task as any).total_generated} gen</span>
                                                            )}
                                                            {(task as any).total_flagged != null && (
                                                                <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-100">{(task as any).total_flagged} flagged</span>
                                                            )}
                                                            {(task as any).total_approved != null && (
                                                                <span className="px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-100">{(task as any).total_approved} approved</span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[14px] text-[#374151]">{task.candidate_name}</span>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1.5 text-[#6b7280] text-[13px]">
                                                        <Clock size={14} />
                                                        {new Date(task.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="text-[#6366f1] opacity-0 group-hover:opacity-100 transition-opacity">
                                                        {expandedTaskId === task.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                                                    </div>
                                                </td>
                                            </tr>
                                            {expandedTaskId === task.id && (
                                                <tr className="bg-[#f9fafb]/50">
                                                    <td colSpan={5} className="px-10 py-8 border-t border-[#f3f4f6]">
                                                        <div className="flex flex-col gap-6">
                                                            {(task as any).task_category === 'question_import' && task.status === 'completed' && (task as any).import_job_id && (
                                                                <div className="flex items-center justify-between p-4 bg-purple-50 border border-purple-200 rounded-[10px]">
                                                                    <div>
                                                                        <p className="text-[13px] font-semibold text-purple-800">Import complete — ready for review</p>
                                                                        <p className="text-[12px] text-purple-600 mt-0.5">Open the Question Bank to review and approve the generated questions.</p>
                                                                    </div>
                                                                    <a
                                                                        href="#question-bank"
                                                                        className="flex items-center gap-1.5 px-4 py-2 rounded-[8px] text-[13px] font-medium text-white"
                                                                        style={{ background: 'linear-gradient(135deg,#8b5cf6,#6366f1)' }}
                                                                    >
                                                                        <Sparkles size={14} /> Review
                                                                    </a>
                                                                </div>
                                                            )}
                                                            <h4 className="text-[14px] font-semibold text-[#374151] flex items-center gap-2">
                                                                <Activity size={16} className="text-[#6366f1]" />
                                                                Processing Timeline
                                                            </h4>
                                                            <div className="space-y-4">
                                                                {taskLogs[task.id]?.length > 0 ? (
                                                                    taskLogs[task.id].map((log, idx) => (
                                                                        <div key={idx} className="flex gap-4 items-start">
                                                                            <div className="flex flex-col items-center">
                                                                                <div className={`w-2.5 h-2.5 rounded-full mt-1.5 ${idx === 0 ? 'bg-[#6366f1]' : 'bg-[#e5e7eb]'}`} />
                                                                                {idx < taskLogs[task.id].length - 1 && (
                                                                                    <div className="w-0.5 h-12 bg-[#f3f4f6] my-1" />
                                                                                )}
                                                                            </div>
                                                                            <div className="flex-1 min-w-0">
                                                                                <div className="flex items-center justify-between gap-4">
                                                                                    <p className="text-[13px] font-medium text-[#111827]">{log.step.replace(/_/g, ' ').toUpperCase()}</p>
                                                                                    <p className="text-[12px] text-[#9ca3af] font-mono">{new Date(log.timestamp).toLocaleTimeString()}</p>
                                                                                </div>
                                                                                {log.data && Object.keys(log.data).length > 0 && (
                                                                                    <div className="mt-2 p-4 bg-white border border-[#e5e7eb] rounded-[12px] shadow-sm">
                                                                                        <pre className="text-[11px] text-[#4b5563] overflow-x-auto font-mono leading-relaxed">
                                                                                            {JSON.stringify(log.data, null, 2)}
                                                                                        </pre>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    ))
                                                                ) : (
                                                                    <div className="flex items-center justify-center py-6 text-[14px] text-[#9ca3af] bg-white rounded-[12px] border border-[#e5e7eb] border-dashed">
                                                                        <Loader2 size={16} className="animate-spin mr-2" />
                                                                        Fetching detailed execution logs...
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
