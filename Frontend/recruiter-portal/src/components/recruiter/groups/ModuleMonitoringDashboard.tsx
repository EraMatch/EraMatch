import { useState } from 'react';
import { X, BarChart3, TrendingUp, Users, Download, CheckCircle, XCircle, AlertCircle, Award, Flag, Eye, RefreshCw, Mic, Video, Lock } from 'lucide-react';

interface ModuleMonitoringDashboardProps {
  moduleType: 'assessment' | 'ai-interview';
  candidates: any[];
  activeFlow?: string[]; // Pass active filtration flow to determine subpages
  pipelineSteps?: any[]; // Pass pipeline steps to check stage status
  liveAlertsConnected?: boolean;
  integrityMetrics?: any;
  integrityDecisions?: any;
  onClose: () => void;
  onManualRefresh?: () => void;
  onViewCandidate: (candidateId: number) => void;
  onAddVerdict: (candidateId: number) => void;
  onReviewFlags: (candidateId: number) => void;
}

interface SubpageConfig {
  key: string;
  label: string;
  icon: typeof Mic;
  statusKey: string;
  scoreKey: string;
  color: string;
  bgColor: string;
  borderColor: string;
  stageId: string;
}

export function ModuleMonitoringDashboard({
  moduleType,
  candidates,
  activeFlow = [],
  pipelineSteps = [],
  liveAlertsConnected = false,
  integrityMetrics,
  integrityDecisions,
  onClose,
  onManualRefresh,
  onViewCandidate,
  onAddVerdict,
  onReviewFlags
}: ModuleMonitoringDashboardProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'flagged'>('all');
  const [sortBy, setSortBy] = useState<'score-high' | 'score-low' | 'name'>('score-high');
  const [decisionFilter, setDecisionFilter] = useState<'all' | 'confirmed_cheating' | 'suspicious_review' | 'monitoring' | 'clean'>('all');
  const [decisionSortBy, setDecisionSortBy] = useState<'candidate' | 'decision' | 'flags' | 'score'>('flags');
  const [decisionSearch, setDecisionSearch] = useState('');

  // Determine if we need interview subpages
  const hasRecordedInterview = activeFlow.some(s => s === 'ai-interview' || s === 'ai_interview');
  const hasLiveInterview = activeFlow.some(s => s === 'live-interview' || s === 'live_interview');
  const showInterviewSubpages = moduleType === 'ai-interview' && hasRecordedInterview && hasLiveInterview;

  // Build subpages in stage order
  const interviewSubpages: SubpageConfig[] = [];
  if (showInterviewSubpages) {
    const orderedFlow = activeFlow.filter(s => ['ai-interview', 'ai_interview', 'live-interview', 'live_interview'].includes(s));
    orderedFlow.forEach(stage => {
      if ((stage === 'ai-interview' || stage === 'ai_interview') && !interviewSubpages.find(s => s.key === 'recorded')) {
        interviewSubpages.push({
          key: 'recorded',
          label: 'Recorded Interview',
          icon: Mic,
          statusKey: 'aiInterview',
          scoreKey: 'aiInterviewScore',
          color: 'text-purple-700',
          bgColor: 'bg-purple-50',
          borderColor: 'border-purple-500',
          stageId: 'ai-interview'
        });
      }
      if ((stage === 'live-interview' || stage === 'live_interview') && !interviewSubpages.find(s => s.key === 'live')) {
        interviewSubpages.push({
          key: 'live',
          label: 'Live Interview',
          icon: Video,
          statusKey: 'liveInterview',
          scoreKey: 'aiInterviewScore', // same for now, can be extended
          color: 'text-blue-700',
          bgColor: 'bg-blue-50',
          borderColor: 'border-blue-500',
          stageId: 'live-interview'
        });
      }
    });
  }

  const [activeSubpage, setActiveSubpage] = useState<string>(
    interviewSubpages.find(s => {
      const step = pipelineSteps.find(ps => ps.id === s.stageId);
      return step && step.state !== 'not-started';
    })?.key || interviewSubpages[0]?.key || ''
  );

  const currentSubpage = interviewSubpages.find(s => s.key === activeSubpage) || null;

  // Determine which keys to use based on current state
  const moduleTitle = moduleType === 'assessment' ? 'Technical Assessment'
    : showInterviewSubpages ? 'AI Interview Monitor'
      : hasLiveInterview ? 'Live Interview'
        : 'Recorded Interview';

  const scoreKey = currentSubpage?.scoreKey ?? (moduleType === 'assessment' ? 'assessmentScore' : 'aiInterviewScore');
  const statusKey = currentSubpage?.statusKey ?? (moduleType === 'assessment' ? 'assessment' : 'aiInterview');

  // For interview monitoring tabs, only show candidates that actually reached the selected stage.
  const stageScopedCandidates = showInterviewSubpages
    ? candidates.filter(c => c[statusKey] !== 'locked')
    : candidates;

  // Filter and sort candidates
  const filteredCandidates = stageScopedCandidates
    .filter(c => {
      if (filterStatus === 'all') return true;
      if (filterStatus === 'completed') return c[statusKey] === 'completed';
      if (filterStatus === 'pending') return c[statusKey] === 'pending' || c[statusKey] === 'not-started';
      if (filterStatus === 'flagged') return c.flags.length > 0;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === 'score-high') return b[scoreKey] - a[scoreKey];
      if (sortBy === 'score-low') return a[scoreKey] - b[scoreKey];
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return 0;
    });

  // Calculate statistics
  const completed = stageScopedCandidates.filter(c => c[statusKey] === 'completed');
  const pending = stageScopedCandidates.filter(c => c[statusKey] === 'pending' || c[statusKey] === 'not-started');
  const flagged = stageScopedCandidates.filter(c => c.flags.length > 0);
  const averageScore = completed.length > 0
    ? completed.reduce((sum, c) => sum + c[scoreKey], 0) / completed.length
    : 0;
  const passRate = completed.length > 0
    ? (completed.filter(c => c.meetsCriteria).length / completed.length) * 100
    : 0;

  const dbSummary = integrityMetrics?.db_metrics?.summary || {};
  const inProcessTotals = integrityMetrics?.in_process_metrics?.totals || {};
  const droppedTotal = Number(inProcessTotals?.dropped || 0);
  const droppedRateLimited = Number(inProcessTotals?.dropped_rate_limited || 0);
  const droppedDuplicate = Number(inProcessTotals?.dropped_duplicate || 0);

  const normalizeStageKey = (value: string) => (value || '').toLowerCase().replaceAll('-', '_');
  const visibleStageAggregates = Array.isArray(integrityDecisions?.stage_aggregates)
    ? integrityDecisions.stage_aggregates.filter((agg: any) => {
      const stageKey = normalizeStageKey(agg?.stage || '');
      if (moduleType === 'assessment') {
        return stageKey === 'assessment';
      }
      if (showInterviewSubpages) {
        return stageKey === 'ai_interview' || stageKey === 'live_interview';
      }
      return stageKey === 'ai_interview';
    })
    : [];

  const stageLabel = (stage: string) => {
    const key = normalizeStageKey(stage);
    if (key === 'assessment') return 'Assessment';
    if (key === 'ai_interview') return 'Recorded Interview';
    if (key === 'live_interview') return 'Live Interview';
    return stage;
  };

  const selectedStageForDecisionTable = normalizeStageKey(
    moduleType === 'assessment'
      ? 'assessment'
      : (showInterviewSubpages
        ? (currentSubpage?.stageId || 'ai-interview')
        : (hasLiveInterview ? 'live-interview' : 'ai-interview'))
  );

  const decisionRowsRaw = Array.isArray(integrityDecisions?.candidates)
    ? integrityDecisions.candidates
      .filter((row: any) => normalizeStageKey(row?.stage || '') === selectedStageForDecisionTable)
    : [];

  const decisionRows = decisionRowsRaw
    .filter((row: any) => {
      const matchesDecision = decisionFilter === 'all' || String(row?.decision || '') === decisionFilter;
      const query = decisionSearch.trim().toLowerCase();
      if (!query) return matchesDecision;
      const candidateName = String(row?.candidate_name || '').toLowerCase();
      const latestEvent = String(row?.latest_event_type || '').toLowerCase();
      const stageStatus = String(row?.stage_status || '').toLowerCase();
      return matchesDecision && (candidateName.includes(query) || latestEvent.includes(query) || stageStatus.includes(query));
    })
    .sort((a: any, b: any) => {
      if (decisionSortBy === 'candidate') {
        return String(a?.candidate_name || '').localeCompare(String(b?.candidate_name || ''));
      }
      if (decisionSortBy === 'decision') {
        return String(a?.decision || '').localeCompare(String(b?.decision || ''));
      }
      if (decisionSortBy === 'score') {
        return Number(b?.stage_score || 0) - Number(a?.stage_score || 0);
      }
      return Number(b?.total_flags || 0) - Number(a?.total_flags || 0);
    });

  const decisionBadgeClass = (decision: string) => {
    if (decision === 'confirmed_cheating') return 'bg-red-100 text-red-700 border border-red-200';
    if (decision === 'suspicious_review') return 'bg-amber-100 text-amber-700 border border-amber-200';
    if (decision === 'monitoring') return 'bg-blue-100 text-blue-700 border border-blue-200';
    return 'bg-emerald-100 text-emerald-700 border border-emerald-200';
  };

  const formatDecision = (decision: string) => {
    return String(decision || '').replaceAll('_', ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  };

  const resolveCandidateActionId = (row: any) => {
    const match = stageScopedCandidates.find((c: any) => String(c?.id) === String(row?.candidate_id));
    return (match?.id ?? row?.candidate_id) as any;
  };

  return (
    <div className="fixed inset-0 z-[200] bg-white flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-[#e5e7eb] bg-gradient-to-r from-emerald-50 to-teal-50">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <BarChart3 size={24} className="text-[#10b981]" />
              <h2 className="text-[#111827]">{moduleTitle} — Module Monitoring</h2>
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-[6px] text-[13px] font-medium flex items-center gap-1">
                <Users size={12} />
                Technical Recruiter Dashboard
              </span>
            </div>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              Monitor module completion, review results, and set technical verdicts
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-[8px] text-[12px] font-medium ${liveAlertsConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
              {liveAlertsConnected ? 'Live Alerts: Connected' : 'Live Alerts: Polling'}
            </span>
            <button className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-gray-50 transition-colors">
              <Download size={16} className="text-[#6b7280]" />
              <span className="text-[14px] text-[#111827]">Export</span>
            </button>
            <button
              onClick={onManualRefresh}
              className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-gray-50 transition-colors"
            >
              <RefreshCw size={16} className="text-[#6b7280]" />
              <span className="text-[14px] text-[#111827]">Refresh</span>
            </button>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-white/50 transition-colors"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>
        </div>

        {/* Interview subpage tabs — only shown when both recorded + live are in the flow */}
        {showInterviewSubpages && (
          <div className="flex gap-2 mt-4">
            {interviewSubpages.map((subpage, idx) => {
              const Icon = subpage.icon;
              const isActive = activeSubpage === subpage.key;
              const step = pipelineSteps.find(ps => ps.id === subpage.stageId || ps.id === subpage.stageId.replace('-', '_'));
              const isLocked = !step || step.state === 'not-started' || step.state === 'not_started';

              return (
                <button
                  key={subpage.key}
                  disabled={isLocked}
                  onClick={() => { setActiveSubpage(subpage.key); setFilterStatus('all'); }}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-[10px] border-2 text-[14px] font-medium transition-all ${isActive
                    ? `${subpage.borderColor} ${subpage.bgColor} ${subpage.color}`
                    : isLocked
                      ? 'border-dashed border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed'
                      : 'border-transparent bg-white/60 text-[#6b7280] hover:bg-white hover:border-gray-300'
                    }`}
                  title={isLocked ? "This interview stage has not been started yet" : ""}
                >
                  {isLocked ? <Lock size={14} className="text-gray-400" /> : <Icon size={16} />}
                  <span>Stage {idx + 1}: {subpage.label}</span>
                  {isActive && (
                    <span className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${subpage.bgColor} ${subpage.color} border ${subpage.borderColor}`}>
                      Viewing
                    </span>
                  )}
                  {isLocked && (
                    <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-gray-100 text-gray-400 border border-gray-200">
                      Locked
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Statistics Overview */}
      <div className="px-8 py-6 border-b border-[#e5e7eb] bg-gray-50">
        {showInterviewSubpages && currentSubpage && (
          <div className="flex items-center gap-2 mb-4">
            {(() => { const PageIcon = currentSubpage.icon; return <PageIcon size={18} className={currentSubpage.color} />; })()}
            <span className={`font-semibold text-[15px] ${currentSubpage.color}`}>{currentSubpage.label} Statistics</span>
          </div>
        )}
        <div className="grid grid-cols-5 gap-4">
          <div className="p-4 bg-white rounded-[12px] border border-[#e5e7eb]">
            <div className="flex items-center justify-between mb-2">
              <Users size={20} className="text-blue-600" />
              <TrendingUp size={16} className="text-blue-500" />
            </div>
            <div className="text-[28px] font-bold text-blue-900">{stageScopedCandidates.length}</div>
            <div className="text-[12px] text-[#6b7280]">Total Candidates</div>
          </div>

          <div className="p-4 bg-white rounded-[12px] border border-emerald-200 bg-emerald-50">
            <div className="flex items-center justify-between mb-2">
              <CheckCircle size={20} className="text-emerald-600" />
              <span className="text-[11px] text-emerald-700 font-medium">
                {completed.length > 0 && stageScopedCandidates.length > 0 ? ((completed.length / stageScopedCandidates.length) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div className="text-[28px] font-bold text-emerald-900">{completed.length}</div>
            <div className="text-[12px] text-emerald-700">Completed</div>
          </div>

          <div className="p-4 bg-white rounded-[12px] border border-amber-200 bg-amber-50">
            <div className="flex items-center justify-between mb-2">
              <AlertCircle size={20} className="text-amber-600" />
              <span className="text-[11px] text-amber-700 font-medium">
                {pending.length > 0 && stageScopedCandidates.length > 0 ? ((pending.length / stageScopedCandidates.length) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div className="text-[28px] font-bold text-amber-900">{pending.length}</div>
            <div className="text-[12px] text-amber-700">Pending</div>
          </div>

          <div className="p-4 bg-white rounded-[12px] border border-purple-200 bg-purple-50">
            <div className="flex items-center justify-between mb-2">
              <Award size={20} className="text-purple-600" />
              <TrendingUp size={16} className="text-purple-500" />
            </div>
            <div className="text-[28px] font-bold text-purple-900">{averageScore.toFixed(1)}%</div>
            <div className="text-[12px] text-purple-700">Avg Score</div>
          </div>

          <div className="p-4 bg-white rounded-[12px] border border-red-200 bg-red-50">
            <div className="flex items-center justify-between mb-2">
              <Flag size={20} className="text-red-600" />
              <span className="text-[11px] text-red-700 font-medium">
                {flagged.length > 0 && stageScopedCandidates.length > 0 ? ((flagged.length / stageScopedCandidates.length) * 100).toFixed(0) : 0}%
              </span>
            </div>
            <div className="text-[28px] font-bold text-red-900">{flagged.length}</div>
            <div className="text-[12px] text-red-700">Flagged</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mt-4">
          <div className="p-4 bg-white rounded-[12px] border border-[#e5e7eb]">
            <div className="text-[12px] text-[#6b7280]">Integrity Flags (Window)</div>
            <div className="text-[24px] font-bold text-[#111827]">{Number(dbSummary.total_flags || 0)}</div>
          </div>
          <div className="p-4 bg-white rounded-[12px] border border-red-200 bg-red-50">
            <div className="text-[12px] text-red-700">High Severity Flags</div>
            <div className="text-[24px] font-bold text-red-900">{Number(dbSummary.high_flags || 0)}</div>
          </div>
          <div className="p-4 bg-white rounded-[12px] border border-amber-200 bg-amber-50">
            <div className="text-[12px] text-amber-700">Dropped Events (In Process)</div>
            <div className="text-[24px] font-bold text-amber-900">{droppedTotal}</div>
          </div>
          <div className="p-4 bg-white rounded-[12px] border border-[#e5e7eb]">
            <div className="text-[12px] text-[#6b7280]">Dropped Reasons</div>
            <div className="text-[13px] text-[#111827] mt-2">Rate-limited: {droppedRateLimited}</div>
            <div className="text-[13px] text-[#111827]">Duplicate: {droppedDuplicate}</div>
          </div>
        </div>

        {visibleStageAggregates.length > 0 && (
          <div className="mt-4">
            <div className="text-[12px] text-[#6b7280] mb-2">Integrity Decisions By Stage</div>
            <div className="grid grid-cols-2 gap-4">
              {visibleStageAggregates.map((agg: any) => (
                <div key={String(agg.stage)} className="p-4 bg-white rounded-[12px] border border-[#e5e7eb]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-[13px] text-[#111827] font-semibold">{stageLabel(String(agg.stage || ''))}</div>
                    <div className="text-[11px] text-[#6b7280]">{Number(agg.total_candidates || 0)} candidates</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-[8px] border border-red-200 bg-red-50 p-3">
                      <div className="text-[11px] text-red-700">Confirmed Cheating</div>
                      <div className="text-[20px] font-bold text-red-900">{Number(agg.confirmed_cheating || 0)}</div>
                    </div>
                    <div className="rounded-[8px] border border-amber-200 bg-amber-50 p-3">
                      <div className="text-[11px] text-amber-700">Suspicious Review</div>
                      <div className="text-[20px] font-bold text-amber-900">{Number(agg.suspicious_review || 0)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filters and Controls */}
      <div className="px-8 py-4 border-b border-[#e5e7eb] bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#6b7280] font-medium">Filter by:</span>
            <div className="flex items-center gap-2">
              {[
                { value: 'all', label: 'All', count: candidates.length },
                { value: 'completed', label: 'Completed', count: completed.length },
                { value: 'pending', label: 'Pending', count: pending.length },
                { value: 'flagged', label: 'Flagged', count: flagged.length }
              ].map((filter) => (
                <button
                  key={filter.value}
                  onClick={() => setFilterStatus(filter.value as any)}
                  className={`px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${filterStatus === filter.value
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-gray-100 text-[#6b7280] hover:bg-gray-200'
                    }`}
                >
                  {filter.label} ({filter.count})
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[#6b7280] font-medium">Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-[36px] px-4 rounded-[8px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
            >
              <option value="score-high">Score (High to Low)</option>
              <option value="score-low">Score (Low to High)</option>
              <option value="name">Name (A-Z)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Dedicated Candidate Decision Table */}
      <div className="px-8 py-5 border-b border-[#e5e7eb] bg-[#fcfcfd]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="font-['Arimo',sans-serif] text-[16px] text-[#111827] font-semibold">
              Candidate Decisions ({stageLabel(selectedStageForDecisionTable)})
            </h3>
            <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mt-1">
              Stage-scoped anti-cheating decisions from live integrity evaluation.
            </p>
          </div>
          <div className="text-[12px] text-[#6b7280]">
            Showing <span className="font-semibold text-[#111827]">{decisionRows.length}</span> of{' '}
            <span className="font-semibold text-[#111827]">{decisionRowsRaw.length}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <input
            value={decisionSearch}
            onChange={(e) => setDecisionSearch(e.target.value)}
            placeholder="Search candidate, latest event, or stage status"
            className="h-[36px] w-[320px] px-3 rounded-[8px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          />
          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value as any)}
            className="h-[36px] px-3 rounded-[8px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          >
            <option value="all">All Decisions</option>
            <option value="confirmed_cheating">Confirmed Cheating</option>
            <option value="suspicious_review">Suspicious Review</option>
            <option value="monitoring">Monitoring</option>
            <option value="clean">Clean</option>
          </select>
          <select
            value={decisionSortBy}
            onChange={(e) => setDecisionSortBy(e.target.value as any)}
            className="h-[36px] px-3 rounded-[8px] border border-[#e5e7eb] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          >
            <option value="flags">Sort: Total Flags</option>
            <option value="score">Sort: Stage Score</option>
            <option value="decision">Sort: Decision</option>
            <option value="candidate">Sort: Candidate Name</option>
          </select>
        </div>

        <div className="rounded-[12px] border border-[#e5e7eb] bg-white overflow-hidden">
          <div className="max-h-[280px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-[#e5e7eb] sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-[12px] text-[#6b7280] font-semibold">Candidate</th>
                  <th className="px-4 py-3 text-center text-[12px] text-[#6b7280] font-semibold">Decision</th>
                  <th className="px-4 py-3 text-center text-[12px] text-[#6b7280] font-semibold">Stage Status</th>
                  <th className="px-4 py-3 text-center text-[12px] text-[#6b7280] font-semibold">Stage Score</th>
                  <th className="px-4 py-3 text-center text-[12px] text-[#6b7280] font-semibold">Flags (H/M/L)</th>
                  <th className="px-4 py-3 text-center text-[12px] text-[#6b7280] font-semibold">Latest Event</th>
                  <th className="px-4 py-3 text-center text-[12px] text-[#6b7280] font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {decisionRows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-[#9ca3af]">
                      No decision rows for current filters.
                    </td>
                  </tr>
                ) : decisionRows.map((row: any) => {
                  const actionId = resolveCandidateActionId(row);
                  return (
                    <tr key={`${row.application_id}:${row.stage}`} className="border-b border-[#f1f5f9] hover:bg-[#fafafa]">
                      <td className="px-4 py-3 text-[13px] text-[#111827] font-medium">{row.candidate_name}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-medium ${decisionBadgeClass(String(row.decision || ''))}`}>
                          {formatDecision(String(row.decision || ''))}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-[12px] text-[#374151]">{String(row.stage_status || 'unknown')}</td>
                      <td className="px-4 py-3 text-center text-[12px] text-[#111827] font-semibold">{Number(row.stage_score || 0) > 0 ? `${Number(row.stage_score).toFixed(1)}%` : 'N/A'}</td>
                      <td className="px-4 py-3 text-center text-[12px] text-[#374151]">
                        {Number(row.total_flags || 0)} ({Number(row.high_flags || 0)}/{Number(row.medium_flags || 0)}/{Number(row.low_flags || 0)})
                      </td>
                      <td className="px-4 py-3 text-center text-[12px] text-[#6b7280]">{row.latest_event_type || 'None'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => onViewCandidate(actionId)}
                            className="p-1.5 rounded-[8px] border border-[#e5e7eb] hover:bg-gray-50 transition-colors"
                            title="View Candidate"
                          >
                            <Eye size={14} className="text-[#6b7280]" />
                          </button>
                          <button
                            onClick={() => onAddVerdict(actionId)}
                            className="p-1.5 rounded-[8px] border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                            title="Set Technical Verdict"
                          >
                            <CheckCircle size={14} className="text-emerald-600" />
                          </button>
                          {Number(row.total_flags || 0) > 0 && (
                            <button
                              onClick={() => onReviewFlags(actionId)}
                              className="p-1.5 rounded-[8px] border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
                              title="Review Integrity Flags"
                            >
                              <Flag size={14} className="text-red-600" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Candidates Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-[#e5e7eb] sticky top-0">
            <tr>
              <th className="px-6 py-4 text-left">
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">Candidate</span>
              </th>
              <th className="px-6 py-4 text-center">
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">
                  {showInterviewSubpages && currentSubpage ? `${currentSubpage.label} Status` : 'Status'}
                </span>
              </th>
              <th className="px-6 py-4 text-center">
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">Score</span>
              </th>
              <th className="px-6 py-4 text-center">
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">Meets Criteria</span>
              </th>
              <th className="px-6 py-4 text-center">
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">Technical Verdict</span>
              </th>
              <th className="px-6 py-4 text-center">
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">Flags</span>
              </th>
              <th className="px-6 py-4 text-center">
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredCandidates.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-[#9ca3af]">
                    <Users size={40} className="opacity-30" />
                    <p className="text-[14px]">No candidates match the current filter</p>
                  </div>
                </td>
              </tr>
            ) : filteredCandidates.map((candidate) => (
              <tr key={candidate.id} className="border-b border-[#e5e7eb] hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#ede9fe] flex items-center justify-center">
                      <span className="font-semibold text-[14px] text-[#6366f1]">
                        {candidate.avatar}
                      </span>
                    </div>
                    <div>
                      <div className="font-medium text-[14px] text-[#111827]">{candidate.name}</div>
                      <div className="text-[12px] text-[#6b7280]">{candidate.email || `ID: ${candidate.id}`}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-center">
                  <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium ${candidate[statusKey] === 'completed'
                    ? 'bg-emerald-100 text-emerald-700'
                    : candidate[statusKey] === 'pending'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-gray-100 text-gray-600'
                    }`}>
                    {candidate[statusKey] === 'completed' && <CheckCircle size={12} />}
                    {candidate[statusKey] === 'pending' && <AlertCircle size={12} />}
                    {candidate[statusKey] === 'completed' ? 'Completed' :
                      candidate[statusKey] === 'pending' ? 'Pending' : 'Not Started'}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  {candidate[scoreKey] > 0 ? (
                    <div className="flex flex-col items-center">
                      <span className={`text-[20px] font-bold ${candidate[scoreKey] >= 80 ? 'text-emerald-600' :
                        candidate[scoreKey] >= 60 ? 'text-blue-600' :
                          'text-red-600'
                        }`}>
                        {candidate[scoreKey]}%
                      </span>
                      <div className="w-20 h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                        <div
                          className={`h-full ${candidate[scoreKey] >= 80 ? 'bg-emerald-500' :
                            candidate[scoreKey] >= 60 ? 'bg-blue-500' :
                              'bg-red-500'
                            }`}
                          style={{ width: `${candidate[scoreKey]}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[13px] text-[#9ca3af]">N/A</span>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  {candidate.meetsCriteria !== undefined ? (
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium ${candidate.meetsCriteria
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                      }`}>
                      {candidate.meetsCriteria ? (
                        <><CheckCircle size={12} /> Yes</>
                      ) : (
                        <><XCircle size={12} /> No</>
                      )}
                    </span>
                  ) : (
                    <span className="text-[13px] text-[#9ca3af]">Pending</span>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => onAddVerdict(candidate.id)}
                    className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${candidate.technicalVerdict === 'pass'
                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                      : candidate.technicalVerdict === 'fail'
                        ? 'bg-red-100 text-red-700 hover:bg-red-200'
                        : candidate.technicalVerdict === 'conditional'
                          ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                          : 'bg-gray-100 text-gray-600 border border-dashed border-gray-400 hover:bg-gray-200'
                      }`}
                  >
                    {candidate.technicalVerdict ? candidate.technicalVerdict : 'Set Verdict'}
                  </button>
                </td>
                <td className="px-6 py-4 text-center">
                  {candidate.flags.length > 0 ? (
                    <button
                      onClick={() => onReviewFlags(candidate.id)}
                      className="flex items-center gap-1 mx-auto px-3 py-1 bg-red-50 border border-red-200 rounded-full text-[12px] text-red-700 hover:bg-red-100 transition-colors"
                    >
                      <Flag size={12} />
                      {candidate.flags.length} flag{candidate.flags.length !== 1 ? 's' : ''}
                    </button>
                  ) : (
                    <span className="text-[13px] text-emerald-600">✓ Clean</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => onViewCandidate(candidate.id)}
                      className="p-2 rounded-[8px] border border-[#e5e7eb] hover:bg-gray-50 transition-colors"
                      title="View Details"
                    >
                      <Eye size={16} className="text-[#6b7280]" />
                    </button>
                    <button
                      onClick={() => onAddVerdict(candidate.id)}
                      className="p-2 rounded-[8px] border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                      title="Add Verdict"
                    >
                      <CheckCircle size={16} className="text-emerald-600" />
                    </button>
                    {candidate.flags.length > 0 && (
                      <button
                        onClick={() => onReviewFlags(candidate.id)}
                        className="p-2 rounded-[8px] border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
                        title="Review Flags"
                      >
                        <Flag size={16} className="text-red-600" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Summary */}
      <div className="px-8 py-4 border-t border-[#e5e7eb] bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-[#6b7280]">
            Showing <span className="font-semibold text-[#111827]">{filteredCandidates.length}</span> of{' '}
            <span className="font-semibold text-[#111827]">{candidates.length}</span> candidates
            {showInterviewSubpages && currentSubpage && (
              <span className={`ml-2 px-2 py-0.5 rounded-md text-[11px] font-medium ${currentSubpage.bgColor} ${currentSubpage.color}`}>
                {currentSubpage.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
              <span className="text-[12px] text-[#6b7280]">Pass Rate: {passRate.toFixed(0)}%</span>
            </div>
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-[8px] border border-[#e5e7eb] text-[14px] hover:bg-white transition-colors"
            >
              Close Dashboard
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
