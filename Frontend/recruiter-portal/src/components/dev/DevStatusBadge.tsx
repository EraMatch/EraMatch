import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

interface PingResult {
    healthy: boolean;
    latencyMs: number | null;
}

function usePing(name: string, url: string, intervalMs = 15000) {
    return useQuery<PingResult>({
        queryKey: ['dev-ping', name],
        queryFn: async () => {
            const t0 = performance.now();
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
                return { healthy: res.ok, latencyMs: Math.round(performance.now() - t0) };
            } catch {
                return { healthy: false, latencyMs: null };
            }
        },
        refetchInterval: intervalMs,
        refetchIntervalInBackground: true,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });
}

function Dot({ status }: { status: 'up' | 'down' | 'unknown' | 'warn' }) {
    const colors: Record<string, string> = {
        up: 'bg-green-400',
        down: 'bg-red-500 animate-pulse',
        warn: 'bg-yellow-400',
        unknown: 'bg-gray-400',
    };
    return <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${colors[status]}`} />;
}

function StatusRow({
    label,
    status,
    detail,
    latency,
}: {
    label: string;
    status: 'up' | 'down' | 'unknown' | 'warn';
    detail?: string;
    latency?: number | null;
}) {
    const textColor = status === 'down' ? 'text-red-500' : status === 'warn' ? 'text-yellow-600' : 'text-gray-500';
    return (
        <div className="flex items-center justify-between gap-2 py-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
                <Dot status={status} />
                <span className="text-gray-700 truncate">{label}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
                {latency != null && <span className="text-gray-400 text-[10px]">{latency}ms</span>}
                {detail && <span className={`text-[10px] font-medium ${textColor}`}>{detail}</span>}
            </div>
        </div>
    );
}

export function DevStatusBadge() {
    const [open, setOpen] = useState(false);

    const backend = usePing('backend', 'http://localhost:8000/health');
    const aiService = usePing('ai-service', 'http://localhost:8001/health');

    const { data: bgTasks } = useQuery({
        queryKey: ['dev-bg-tasks'],
        queryFn: () => api.recruiter.getBackgroundTasks(),
        refetchInterval: 8000,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    const bh = backend.data?.healthy ?? null;
    const ah = aiService.data?.healthy ?? null;

    // Infer worker liveness from recent task activity
    const recentTasks = Array.isArray(bgTasks) ? bgTasks : [];
    const processingTasks = recentTasks.filter((t: any) => t.status === 'processing');
    const recentCompleted = recentTasks.filter((t: any) => t.status === 'completed');
    const backendWorkerAlive = processingTasks.length > 0 || recentCompleted.length > 0;

    const toStatus = (healthy: boolean | null): 'up' | 'down' | 'unknown' =>
        healthy === true ? 'up' : healthy === false ? 'down' : 'unknown';

    // Overall pill color
    const downCount = [bh === false, ah === false].filter(Boolean).length;
    const pillColor =
        downCount === 0 && bh === true
            ? 'bg-green-100 border-green-300 text-green-800'
            : downCount > 0
              ? 'bg-red-100 border-red-300 text-red-800'
              : 'bg-gray-100 border-gray-300 text-gray-600';

    return (
        <div className="fixed top-3 right-3 z-[9999] flex flex-col items-end gap-1">
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-medium shadow-sm ${pillColor}`}
                title="Dev service status"
            >
                <Dot status={toStatus(bh)} />
                <Dot status={toStatus(ah)} />
                <Dot status={backendWorkerAlive ? 'up' : 'warn'} />
                <span className="ml-0.5">dev</span>
            </button>

            {open && (
                <div className="bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-60 text-xs">
                    <p className="font-semibold text-gray-800 mb-2 text-[11px] uppercase tracking-wide">
                        Dev Services
                    </p>

                    {/* HTTP services */}
                    <div className="space-y-0.5 mb-2">
                        <StatusRow
                            label="Backend API :8000"
                            status={toStatus(bh)}
                            latency={backend.data?.latencyMs}
                            detail={bh === false ? 'DOWN' : undefined}
                        />
                        <StatusRow
                            label="AI Service :8001"
                            status={toStatus(ah)}
                            latency={aiService.data?.latencyMs}
                            detail={ah === false ? 'DOWN' : undefined}
                        />
                    </div>

                    {/* Inferred worker statuses */}
                    <div className="border-t border-gray-100 pt-2 space-y-0.5 mb-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Workers (inferred)</p>
                        <StatusRow
                            label="Backend Celery"
                            status={backendWorkerAlive ? 'up' : 'warn'}
                            detail={
                                processingTasks.length > 0
                                    ? `${processingTasks.length} processing`
                                    : backendWorkerAlive
                                      ? 'idle'
                                      : 'no recent tasks'
                            }
                        />
                        <StatusRow
                            label="AI Celery (solo)"
                            status={ah === true ? 'up' : ah === false ? 'down' : 'unknown'}
                            detail={ah === false ? 'ai-service down' : undefined}
                        />
                        <StatusRow
                            label="LiveKit Agent"
                            status="unknown"
                            detail="check log"
                        />
                        <StatusRow
                            label="Redis Broker"
                            status={backendWorkerAlive ? 'up' : 'unknown'}
                            detail={!backendWorkerAlive ? 'inferred from worker' : undefined}
                        />
                    </div>

                    {/* Frontend portals */}
                    <div className="border-t border-gray-100 pt-2 space-y-0.5 mb-2">
                        <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Portals</p>
                        <StatusRow label="Recruiter :5173" status="up" detail="this tab" />
                        <StatusRow label="Candidate :5174" status="unknown" detail="open to check" />
                    </div>

                    {/* Task summary */}
                    {recentTasks.length > 0 && (
                        <div className="border-t border-gray-100 pt-2">
                            <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                                Background Tasks ({recentTasks.length})
                            </p>
                            <div className="flex gap-3 text-[10px]">
                                <span className="text-yellow-600">
                                    {processingTasks.length} processing
                                </span>
                                <span className="text-green-600">
                                    {recentCompleted.length} completed
                                </span>
                                <span className="text-red-500">
                                    {recentTasks.filter((t: any) => t.status === 'failed').length} failed
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Quick commands hint */}
                    <div className="border-t border-gray-100 pt-2 mt-1 text-[10px] text-gray-400">
                        <code className="bg-gray-50 px-1 py-0.5 rounded">bash start-dev.sh stop</code>
                        <span className="ml-1">to clear all ports</span>
                    </div>
                </div>
            )}
        </div>
    );
}
