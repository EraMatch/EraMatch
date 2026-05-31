import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

interface ServiceStatus {
    name: string;
    url: string;
    healthy: boolean | null;
    latencyMs: number | null;
}

function usePingService(name: string, url: string, intervalMs = 15000) {
    return useQuery({
        queryKey: ['dev-ping', name],
        queryFn: async () => {
            const t0 = performance.now();
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
                const latencyMs = Math.round(performance.now() - t0);
                return { healthy: res.ok, latencyMs };
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

function Dot({ healthy }: { healthy: boolean | null }) {
    const color = healthy === null ? 'bg-gray-400' : healthy ? 'bg-green-400' : 'bg-red-400';
    return <span className={`inline-block w-2 h-2 rounded-full ${color} shrink-0`} />;
}

export function DevStatusBadge() {
    const [open, setOpen] = useState(false);

    const backend = usePingService('backend', 'http://localhost:8000/health');
    const aiService = usePingService('ai-service', 'http://localhost:8001/health');

    const { data: bgTasks } = useQuery({
        queryKey: ['dev-bg-tasks'],
        queryFn: () => api.recruiter.getBackgroundTasks(),
        refetchInterval: 10000,
        staleTime: 0,
        refetchOnWindowFocus: false,
    });

    const bh = backend.data?.healthy ?? null;
    const ah = aiService.data?.healthy ?? null;

    // Infer worker health: any task in "processing" or success within last minute means worker alive
    const backendWorkerAlive = Array.isArray(bgTasks) && bgTasks.some((t: any) =>
        t.status === 'processing' || t.status === 'completed'
    );

    const overallOk = bh === true && ah === true;
    const anyDown = bh === false || ah === false;
    const pillColor = overallOk ? 'bg-green-100 border-green-300 text-green-800'
        : anyDown ? 'bg-red-100 border-red-300 text-red-800'
            : 'bg-gray-100 border-gray-300 text-gray-600';

    const services: { label: string; healthy: boolean | null; latency?: number | null }[] = [
        { label: 'Backend :8000', healthy: bh, latency: backend.data?.latencyMs },
        { label: 'AI Service :8001', healthy: ah, latency: aiService.data?.latencyMs },
        { label: 'Backend Worker', healthy: backendWorkerAlive ? true : null },
    ];

    return (
        <div className="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-1">
            {open && (
                <div className="bg-white border border-gray-200 rounded-[10px] shadow-lg p-3 w-52 text-xs space-y-2">
                    <p className="font-semibold text-gray-700 mb-1">Dev Status</p>
                    {services.map(s => (
                        <div key={s.label} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                                <Dot healthy={s.healthy} />
                                <span className="text-gray-600">{s.label}</span>
                            </div>
                            {s.latency != null && (
                                <span className="text-gray-400">{s.latency}ms</span>
                            )}
                            {s.healthy === false && <span className="text-red-500 font-medium">DOWN</span>}
                            {s.healthy === null && s.latency === undefined && <span className="text-gray-400">unknown</span>}
                        </div>
                    ))}
                    <div className="border-t border-gray-100 pt-1 text-gray-400">
                        CV parse mode: <span className="font-medium text-gray-600">celery</span>
                    </div>
                </div>
            )}
            <button
                onClick={() => setOpen(o => !o)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium shadow-sm ${pillColor}`}
            >
                <Dot healthy={bh} />
                <Dot healthy={ah} />
                <span>dev</span>
            </button>
        </div>
    );
}
