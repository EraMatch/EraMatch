import { useState, useMemo } from 'react';
import { Search, Filter, Archive, BarChart3, Users, Calendar, TrendingUp, ChevronDown, X, Download, Clock, Loader2, Brain, Code, MapPin, Building2, GraduationCap, Github, CheckCircle, AlertTriangle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';
import LoadingSpinner from '../../common/LoadingSpinner';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useCandidates } from '../../../hooks/candidates/useCandidates';
import { useBulkArchiveApplications, useBulkDeleteApplications } from '../../../hooks/candidates/useCandidateMutations';

interface Candidate {
  id: string;
  applicationId?: string;
  groupId?: string;
  groupName?: string;
  name: string;
  email: string;
  position?: string;
  project?: string;
  status: 'active' | 'archived';
  score: number;
  hiringRound?: string;
  archivedDate?: Date;
  source?: string;
  seniority?: string;
  location?: string;
  githubOverallScore?: number | null;
  githubRepoConfidenceScore?: number | null;
  githubContributionSource?: string | null;
  githubFreshnessHours?: number | null;
  githubHasFallback?: boolean;
  experience?: number;
  skills?: string[];
  universities?: string[];
  job_titles?: string[];
  pre_score_final?: number | null;
}

interface GitHubFilters {
  minScore: number;
  minConfidence: number;
  maxFreshnessHours: number;
  sources: string[];
  fallbackOnly: boolean;
}

interface CandidatesPageProps {
  onBack: () => void;
}

export function CandidatesPage({ onBack }: CandidatesPageProps) {
  const [searchParams] = useSearchParams();
  const statusFilter = searchParams.get('status') ?? undefined;

  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [activeView, setActiveView] = useState<'active' | 'archived' | 'analytics'>('active');
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const { data: rawCandidates = [], isLoading: loading } = useCandidates(statusFilter);
  const bulkArchiveMutation = useBulkArchiveApplications();
  const bulkDeleteMutation = useBulkDeleteApplications();
  const [githubFilters, setGithubFilters] = useState<GitHubFilters>({
    minScore: 0,
    minConfidence: 0,
    maxFreshnessHours: 720,
    sources: [],
    fallbackOnly: false,
  });
  const navigate = useNavigate();

  const candidates = useMemo<Candidate[]>(() =>
    (rawCandidates as any[]).map((c: any) => ({
      id: c.id,
      applicationId: c.applicationId || c.application_id,
      groupId: c.groupId || c.group_id,
      groupName: c.groupName || c.group_name,
      name: c.name,
      email: c.email,
      position: c.position || c.seniority || 'Not specified',
      project: c.project || 'General Pool',
      status: 'active',
      score: c.match,
      hiringRound: c.hiringRound || 'Q1 2025',
      source: c.source || 'LinkedIn',
      seniority: c.seniority,
      location: c.location,
      githubOverallScore: c.github_overall_score,
      githubRepoConfidenceScore: c.github_repo_confidence_score,
      githubContributionSource: c.github_contribution_source,
      githubFreshnessHours: c.github_freshness_hours,
      githubHasFallback: c.github_has_fallback,
      experience: c.experience,
      skills: c.skills,
      universities: c.universities,
      job_titles: c.job_titles,
      pre_score_final: c.pre_score_final,
    })), [rawCandidates]);

  const activeCandidates = candidates.filter(c => c.status === 'active');
  const archivedCandidates = candidates.filter(c => c.status === 'archived');

  const displayedCandidates = activeView === 'active' ? activeCandidates : archivedCandidates;

  const githubSources = Array.from(
    new Set(
      displayedCandidates
        .map((candidate) => candidate.githubContributionSource || '')
        .filter((source) => source.length > 0)
    )
  ).sort();

  const filteredCandidates = displayedCandidates.filter(candidate =>
    (candidate.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      candidate.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (candidate.position?.toLowerCase() || '').includes(searchQuery.toLowerCase())) &&
    (githubFilters.minScore <= 0 || (candidate.githubOverallScore ?? 0) >= githubFilters.minScore) &&
    (githubFilters.minConfidence <= 0 || (candidate.githubRepoConfidenceScore ?? 0) >= githubFilters.minConfidence) &&
    (githubFilters.maxFreshnessHours >= 720 || ((candidate.githubFreshnessHours ?? Infinity) <= githubFilters.maxFreshnessHours)) &&
    (githubFilters.sources.length === 0 || githubFilters.sources.includes(candidate.githubContributionSource || '')) &&
    (!githubFilters.fallbackOnly || Boolean(candidate.githubHasFallback))
  );

  const handleToggleSelect = (id: string) => {
    setSelectedCandidates(prev =>
      prev.includes(id) ? prev.filter(cId => cId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedCandidates.length === filteredCandidates.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(filteredCandidates.map(c => c.id));
    }
  };

  const handleArchiveSelected = () => {
    const applicationIds = candidates
      .filter(c => selectedCandidates.includes(c.id) && c.applicationId)
      .map(c => c.applicationId as string);

    if (applicationIds.length === 0) return;

    setIsProcessing(true);
    bulkArchiveMutation.mutate(applicationIds, {
      onSuccess: () => {
        setSelectedCandidates([]);
        setShowArchiveConfirm(false);
      },
      onError: () => console.error('Failed to archive candidates'),
      onSettled: () => setIsProcessing(false),
    });
  };

  const handleDeleteSelected = () => {
    const applicationIds = candidates
      .filter(c => selectedCandidates.includes(c.id) && c.applicationId)
      .map(c => c.applicationId as string);

    if (applicationIds.length === 0) return;

    setIsProcessing(true);
    bulkDeleteMutation.mutate(applicationIds, {
      onSuccess: () => {
        setSelectedCandidates([]);
        setShowDeleteConfirm(false);
      },
      onError: () => console.error('Failed to delete candidates'),
      onSettled: () => setIsProcessing(false),
    });
  };

  // Statistics for archived candidates
  const archivedStats = {
    total: archivedCandidates.length,
    avgScore: archivedCandidates.length > 0
      ? Math.round(archivedCandidates.reduce((sum, c) => sum + c.score, 0) / archivedCandidates.length)
      : 0,
    byRound: archivedCandidates.reduce((acc, c) => {
      const round = c.hiringRound || 'Unknown';
      acc[round] = (acc[round] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    bySource: archivedCandidates.reduce((acc, c) => {
      const source = c.source || 'Unknown';
      acc[source] = (acc[source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
  };

  return (
    <div className="min-h-screen flex relative">
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/40">
          <LoadingSpinner message="Loading candidates..." />
        </div>
      )}

      {/* Main Content Area (Blurred when loading) */}
      <div className={`flex w-full transition-all duration-300 ${loading ? 'opacity-50 blur-sm pointer-events-none' : ''}`}>
        <div className="flex-1">
        <div className="px-8 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">Candidates</h1>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              Manage all candidates across hiring rounds and projects
            </p>
          </div>

          {/* View Toggle and Actions */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white rounded-[10px] p-1 border border-[#e5e7eb]">
                <button
                  onClick={() => setActiveView('active')}
                  className={`h-[36px] px-[16px] rounded-[8px] font-['Arimo',sans-serif] text-[14px] transition-colors ${activeView === 'active'
                    ? 'bg-[#6366f1] text-white'
                    : 'text-[#6b7280] hover:text-[#111827]'
                    }`}
                >
                  Active ({activeCandidates.length})
                </button>
                <button
                  onClick={() => setActiveView('archived')}
                  className={`h-[36px] px-[16px] rounded-[8px] font-['Arimo',sans-serif] text-[14px] transition-colors ${activeView === 'archived'
                    ? 'bg-[#6366f1] text-white'
                    : 'text-[#6b7280] hover:text-[#111827]'
                    }`}
                >
                  Archived ({archivedCandidates.length})
                </button>
              </div>

              <button
                onClick={() => setActiveView('analytics')}
                className={`flex items-center gap-2 h-[44px] px-[16px] rounded-[10px] font-['Arimo',sans-serif] text-[14px] font-medium transition-all ${activeView === 'analytics'
                  ? 'bg-purple-100 text-purple-700 border border-purple-200 shadow-sm'
                  : 'bg-white text-purple-600 border border-purple-200 hover:bg-purple-50 hover:border-purple-300 shadow-sm'
                  }`}
              >
                <BarChart3 size={16} />
                Advanced Analytics
              </button>
            </div>

            <div className="flex items-center gap-2">
              {selectedCandidates.length > 0 && activeView === 'active' && (
                <>
                  <button
                    onClick={() => setShowArchiveConfirm(true)}
                    disabled={isProcessing}
                    className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#f59e0b] hover:bg-[#d97706] text-white transition-colors disabled:opacity-50"
                  >
                    <Archive size={16} />
                    <span className="font-['Arimo',sans-serif] text-[14px]">
                      Archive ({selectedCandidates.length})
                    </span>
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isProcessing}
                    className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] bg-[#ef4444] hover:bg-[#dc2626] text-white transition-colors disabled:opacity-50"
                  >
                    <X size={16} />
                    <span className="font-['Arimo',sans-serif] text-[14px]">
                      Delete
                    </span>
                  </button>
                </>
              )}
              <button className="flex items-center gap-2 h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors">
                <Download size={16} className="text-[#6b7280]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                  Export
                </span>
              </button>
            </div>
          </div>

          {activeView === 'analytics' ? (
            <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8 mt-6">
              <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center shadow-md">
                  <BarChart3 className="text-white" size={24} />
                </div>
                <div>
                  <h2 className="text-[22px] font-bold text-[#111827]">Candidate Analytics & Insights</h2>
                  <p className="text-[#6b7280] text-[14px]">Advanced multidimensional analysis of your entire candidate pool.</p>
                </div>
              </div>

              {/* Top Overview Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                <div className="p-6 bg-gradient-to-br from-[#f8fafc] to-[#f1f5f9] rounded-2xl border border-[#e2e8f0] shadow-sm relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-100 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-2 mb-2 text-[#475569] relative z-10">
                    <Users size={18} />
                    <span className="font-medium">Total Pipeline</span>
                  </div>
                  <div className="text-[36px] font-bold text-[#0f172a] relative z-10">{candidates.length}</div>
                  <div className="text-[13px] text-[#64748b] mt-1 relative z-10">{activeCandidates.length} Active • {archivedCandidates.length} Archived</div>
                </div>

                <div className="p-6 bg-gradient-to-br from-[#f0fdf4] to-[#dcfce7] rounded-2xl border border-[#bbf7d0] shadow-sm relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-200 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-2 mb-2 text-[#166534] relative z-10">
                    <TrendingUp size={18} />
                    <span className="font-medium">Avg Match Score</span>
                  </div>
                  <div className="text-[36px] font-bold text-[#15803d] relative z-10">
                    {candidates.length > 0 ? Math.round(candidates.reduce((sum, c) => sum + (c.score || 0), 0) / candidates.length) : 0}
                  </div>
                  <div className="text-[13px] text-[#166534] mt-1 relative z-10">Overall pipeline quality</div>
                </div>

                <div className="p-6 bg-gradient-to-br from-[#fdf4ff] to-[#fae8ff] rounded-2xl border border-[#fbcfe8] shadow-sm relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-pink-200 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-2 mb-2 text-[#86198f] relative z-10">
                    <Brain size={18} />
                    <span className="font-medium">Avg AI Pre-Score</span>
                  </div>
                  <div className="text-[36px] font-bold text-[#701a75] relative z-10">
                    {candidates.length > 0 ? Math.round(candidates.reduce((sum, c) => sum + (c.pre_score_final || c.score || 0), 0) / candidates.length) : 0}
                  </div>
                  <div className="text-[13px] text-[#86198f] mt-1 relative z-10">Semantic & Skills Fit</div>
                </div>

                <div className="p-6 bg-gradient-to-br from-[#eff6ff] to-[#dbeafe] rounded-2xl border border-[#bfdbfe] shadow-sm relative overflow-hidden group">
                  <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-200 rounded-full opacity-50 group-hover:scale-110 transition-transform" />
                  <div className="flex items-center gap-2 mb-2 text-[#1e40af] relative z-10">
                    <Github size={18} />
                    <span className="font-medium">GitHub Validated</span>
                  </div>
                  <div className="text-[36px] font-bold text-[#1d4ed8] relative z-10">
                    {candidates.filter(c => c.githubOverallScore != null).length}
                  </div>
                  <div className="text-[13px] text-[#1e40af] mt-1 relative z-10">With analyzed repositories</div>
                </div>
              </div>

              {/* Charts Row 1 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Score Distribution Area Chart */}
                <div className="border border-[#e5e7eb] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow bg-white">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-[#111827] font-semibold text-[16px]">Score Distribution Trend</h3>
                      <p className="text-[#6b7280] text-[13px]">Density of candidate match scores</p>
                    </div>
                    <div className="p-2 bg-indigo-50 rounded-lg"><TrendingUp size={20} className="text-indigo-600" /></div>
                  </div>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={[
                          { range: '<50', count: candidates.filter(c => c.score < 50).length },
                          { range: '50-60', count: candidates.filter(c => c.score >= 50 && c.score < 60).length },
                          { range: '60-70', count: candidates.filter(c => c.score >= 60 && c.score < 70).length },
                          { range: '70-80', count: candidates.filter(c => c.score >= 70 && c.score < 80).length },
                          { range: '80-90', count: candidates.filter(c => c.score >= 80 && c.score < 90).length },
                          { range: '>90', count: candidates.filter(c => c.score >= 90).length },
                        ]}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <defs>
                          <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="range" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '4 4' }}
                        />
                        <Area type="monotone" dataKey="count" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCount)" activeDot={{ r: 6, fill: '#6366f1', stroke: '#fff', strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Experience Distribution Bar Chart */}
                <div className="border border-[#e5e7eb] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow bg-white">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-[#111827] font-semibold text-[16px]">Seniority & Performance</h3>
                      <p className="text-[#6b7280] text-[13px]">Average match score by experience level</p>
                    </div>
                    <div className="p-2 bg-emerald-50 rounded-lg"><Code size={20} className="text-emerald-600" /></div>
                  </div>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { name: 'Junior', match: Math.round(candidates.filter(c => (c.experience || 0) < 3).reduce((sum, c) => sum + c.score, 0) / (candidates.filter(c => (c.experience || 0) < 3).length || 1)), count: candidates.filter(c => (c.experience || 0) < 3).length },
                          { name: 'Mid', match: Math.round(candidates.filter(c => (c.experience || 0) >= 3 && (c.experience || 0) < 6).reduce((sum, c) => sum + c.score, 0) / (candidates.filter(c => (c.experience || 0) >= 3 && (c.experience || 0) < 6).length || 1)), count: candidates.filter(c => (c.experience || 0) >= 3 && (c.experience || 0) < 6).length },
                          { name: 'Senior', match: Math.round(candidates.filter(c => (c.experience || 0) >= 6 && (c.experience || 0) < 10).reduce((sum, c) => sum + c.score, 0) / (candidates.filter(c => (c.experience || 0) >= 6 && (c.experience || 0) < 10).length || 1)), count: candidates.filter(c => (c.experience || 0) >= 6 && (c.experience || 0) < 10).length },
                          { name: 'Lead', match: Math.round(candidates.filter(c => (c.experience || 0) >= 10).reduce((sum, c) => sum + c.score, 0) / (candidates.filter(c => (c.experience || 0) >= 10).length || 1)), count: candidates.filter(c => (c.experience || 0) >= 10).length }
                        ]}
                        margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} domain={[0, 100]} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f3f4f6' }}
                        />
                        <Bar dataKey="match" fill="#10b981" radius={[4, 4, 0, 0]} barSize={40} name="Avg Match Score" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {/* Charts Row 2 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                {/* Skills Radar */}
                <div className="border border-[#e5e7eb] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow bg-white col-span-1 lg:col-span-1 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h3 className="text-[#111827] font-semibold text-[16px]">Top Skills Cloud</h3>
                      <p className="text-[#6b7280] text-[13px]">Most frequent candidate skills</p>
                    </div>
                    <div className="p-2 bg-pink-50 rounded-lg"><Brain size={20} className="text-pink-600" /></div>
                  </div>
                  <div className="flex-1 min-h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart cx="50%" cy="50%" outerRadius="70%" data={
                        Object.entries(
                          candidates.flatMap(c => c.skills || []).reduce((acc: any, skill) => {
                            acc[skill] = (acc[skill] || 0) + 1; return acc;
                          }, {})
                        )
                        .sort((a: any, b: any) => b[1] - a[1])
                        .slice(0, 6)
                        .map(([subject, count]: any) => ({ subject: subject.length > 12 ? subject.substring(0,12)+'...' : subject, count, fullMark: candidates.length }))
                      }>
                        <PolarGrid stroke="#e5e7eb" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#4b5563', fontSize: 11 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={false} axisLine={false} />
                        <Radar name="Frequency" dataKey="count" stroke="#ec4899" fill="#ec4899" fillOpacity={0.4} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px' }} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Universities Pie */}
                <div className="border border-[#e5e7eb] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow bg-white col-span-1 lg:col-span-1 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-[#111827] font-semibold text-[16px]">Top Universities</h3>
                      <p className="text-[#6b7280] text-[13px]">Educational background diversity</p>
                    </div>
                    <div className="p-2 bg-amber-50 rounded-lg"><GraduationCap size={20} className="text-amber-600" /></div>
                  </div>
                  <div className="flex-1 min-h-[250px] flex items-center justify-center relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(
                            candidates.flatMap(c => c.universities || []).reduce((acc: any, u) => {
                              acc[u] = (acc[u] || 0) + 1; return acc;
                            }, {})
                          )
                          .sort((a: any, b: any) => b[1] - a[1])
                          .slice(0, 5)
                          .map(([name, value]: any) => ({ name: name.length > 20 ? name.substring(0, 20) + '...' : name, value }))
                          }
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {Object.entries(candidates.flatMap(c => c.universities || [])).map((_, index) => (
                            <Cell key={`cell-${index}`} fill={['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'][index % 5]} />
                          ))}
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    {/* Inner Label */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[24px] font-bold text-[#111827]">
                        {Object.keys(candidates.flatMap(c => c.universities || []).reduce((acc: any, u) => { acc[u] = 1; return acc; }, {})).length}
                      </span>
                      <span className="text-[12px] text-[#6b7280]">Total Unis</span>
                    </div>
                  </div>
                </div>

              </div>

              {/* Charts Row 3 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Career Progression (Promoted vs Single Role) */}
                <div className="border border-[#e5e7eb] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow bg-white col-span-1 lg:col-span-1 flex flex-col">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-[#111827] font-semibold text-[16px]">Career Progression</h3>
                      <p className="text-[#6b7280] text-[13px]">Candidates with multiple vs single job titles</p>
                    </div>
                    <div className="p-2 bg-blue-50 rounded-lg"><Building2 size={20} className="text-blue-600" /></div>
                  </div>
                  <div className="flex-1 min-h-[250px] flex items-center justify-center relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={[
                            { name: 'Promoted / Multiple Titles', value: candidates.filter(c => (c.job_titles || []).length > 1).length },
                            { name: 'Single Role', value: candidates.filter(c => (c.job_titles || []).length <= 1).length }
                          ]}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          <Cell fill="#3b82f6" />
                          <Cell fill="#94a3b8" />
                        </Pie>
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[24px] font-bold text-[#111827]">
                        {candidates.length > 0 ? Math.round((candidates.filter(c => (c.job_titles || []).length > 1).length / candidates.length) * 100) : 0}%
                      </span>
                      <span className="text-[12px] text-[#6b7280]">Promoted</span>
                    </div>
                  </div>
                </div>

                {/* Pipeline Stage Progress */}
                <div className="border border-[#e5e7eb] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow bg-white col-span-1 lg:col-span-1 flex flex-col">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-[#111827] font-semibold text-[16px]">Pipeline Stage Drop-off</h3>
                      <p className="text-[#6b7280] text-[13px]">Candidates progressing through assessment stages</p>
                    </div>
                    <div className="p-2 bg-purple-50 rounded-lg"><BarChart3 size={20} className="text-purple-600" /></div>
                  </div>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={[
                          { stage: 'Assessment', count: candidates.filter(c => c.score >= 40).length },
                          { stage: 'AI Interview', count: candidates.filter(c => c.score >= 60).length },
                          { stage: 'Video Interview', count: candidates.filter(c => c.score >= 75).length }
                        ]}
                        layout="vertical"
                        margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                        <YAxis dataKey="stage" type="category" tick={{ fontSize: 12, fill: '#4b5563' }} axisLine={false} tickLine={false} width={100} />
                        <RechartsTooltip 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: '#f3f4f6' }}
                        />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} barSize={30} name="Candidates Passed" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* Search and Filters */}
              <div className="flex items-center gap-4 mb-6">
                <div className="flex-1 relative">
                  <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    type="text"
                    placeholder="Search candidates by name, email, or position..."
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

              {showFilters && (
                <div className="mb-6 p-4 bg-white rounded-[12px] border border-[#e5e7eb] space-y-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Min GitHub score</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={githubFilters.minScore}
                        onChange={(e) => setGithubFilters((prev) => ({ ...prev, minScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)) }))}
                        className="w-[88px] h-[36px] px-3 rounded-[8px] border border-[#e5e7eb] text-[13px]"
                      />
                    </label>

                    <label className="flex items-center gap-2">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Min confidence</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={Math.round(githubFilters.minConfidence * 100)}
                        onChange={(e) => {
                          const percentage = Math.max(0, Math.min(100, Number(e.target.value) || 0));
                          setGithubFilters((prev) => ({ ...prev, minConfidence: percentage / 100 }));
                        }}
                        className="w-[88px] h-[36px] px-3 rounded-[8px] border border-[#e5e7eb] text-[13px]"
                      />
                    </label>

                    <label className="flex items-center gap-2">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Max freshness (h)</span>
                      <input
                        type="number"
                        min={0}
                        max={720}
                        value={githubFilters.maxFreshnessHours}
                        onChange={(e) => setGithubFilters((prev) => ({ ...prev, maxFreshnessHours: Math.max(0, Math.min(720, Number(e.target.value) || 0)) }))}
                        className="w-[100px] h-[36px] px-3 rounded-[8px] border border-[#e5e7eb] text-[13px]"
                      />
                    </label>

                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={githubFilters.fallbackOnly}
                        onChange={(e) => setGithubFilters((prev) => ({ ...prev, fallbackOnly: e.target.checked }))}
                        className="w-[16px] h-[16px]"
                      />
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Fallback only</span>
                    </label>
                  </div>

                  {githubSources.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {githubSources.map((source) => {
                        const active = githubFilters.sources.includes(source);
                        return (
                          <button
                            key={source}
                            onClick={() => {
                              setGithubFilters((prev) => ({
                                ...prev,
                                sources: active
                                  ? prev.sources.filter((item) => item !== source)
                                  : [...prev.sources, source],
                              }));
                            }}
                            className={`px-3 py-1.5 rounded-full text-[12px] border transition-colors ${active
                              ? 'bg-[#6366f1] text-white border-[#6366f1]'
                              : 'bg-white text-[#374151] border-[#e5e7eb] hover:border-[#d1d5db]'
                              }`}
                          >
                            {source}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Candidates List */}
              <div className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                      <tr>
                        <th className="text-left p-4 w-[50px]">
                          <input
                            type="checkbox"
                            checked={selectedCandidates.length === filteredCandidates.length && filteredCandidates.length > 0}
                            onChange={handleSelectAll}
                            className="w-[18px] h-[18px] rounded border-gray-300 text-[#6366f1] focus:ring-2 focus:ring-[#6366f1] cursor-pointer"
                          />
                        </th>
                        <th className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Candidate</th>
                        <th className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Position</th>
                        <th className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Project</th>
                        <th className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Hiring Round</th>
                        <th className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Score</th>
                        <th className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Source</th>
                        {activeView === 'archived' && (
                          <th className="text-left p-4 font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">Archived Date</th>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCandidates.map((candidate) => (
                        <tr
                          key={candidate.id}
                          onClick={(e) => {
                            // Prevent navigation if clicking checkbox
                            if ((e.target as HTMLElement).closest('input[type="checkbox"]')) return;
                            const applicationId = candidate.applicationId;
                            const query = applicationId ? `?applicationId=${encodeURIComponent(String(applicationId))}` : '';
                            navigate(`/recruiter/candidates/${candidate.id}${query}`);
                          }}
                          className="border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer"
                        >
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={selectedCandidates.includes(candidate.id)}
                              onChange={() => handleToggleSelect(candidate.id)}
                              className="w-[18px] h-[18px] rounded border-gray-300 text-[#6366f1] focus:ring-2 focus:ring-[#6366f1] cursor-pointer"
                            />
                          </td>
                          <td className="p-4">
                            <div>
                              <p className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                                {candidate.name}
                              </p>
                              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                                {candidate.email}
                              </p>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                              {candidate.position}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                              {candidate.project}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="px-[10px] py-[4px] rounded-[6px] bg-[#ede9fe] text-[#6366f1] font-['Arimo',sans-serif] text-[12px]">
                              {candidate.hiringRound}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                              {candidate.score}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                              {candidate.source}
                            </span>
                          </td>
                          {activeView === 'archived' && candidate.archivedDate && (
                            <td className="p-4">
                              <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                                {candidate.archivedDate.toLocaleDateString()}
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Empty State */}
              {!loading && filteredCandidates.length === 0 && (
                <div className="text-center py-12">
                  <Users size={48} className="text-[#d1d5db] mx-auto mb-4" />
                  <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280]">
                    No candidates found
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Side Panel - Archive Statistics */}
      {activeView === 'archived' && (
        <div className="w-[320px] bg-white border-l border-[#e5e7eb] p-6 overflow-y-auto">
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 size={20} className="text-[#6366f1]" />
              <h3 className="font-['Arimo',sans-serif] text-[16px] text-[#111827] font-semibold">
                Archive Statistics
              </h3>
            </div>
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
              Insights from archived candidates across all hiring rounds
            </p>
          </div>

          {/* Total Archived */}
          <div className="mb-6 p-4 bg-[#f9fafb] rounded-[12px] border border-[#e5e7eb]">
            <div className="flex items-center gap-2 mb-2">
              <Archive size={16} className="text-[#6366f1]" />
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                Total Archived
              </span>
            </div>
            <p className="text-[28px] font-semibold text-[#111827]">
              {archivedStats.total}
            </p>
          </div>

          {/* Average Score */}
          <div className="mb-6 p-4 bg-[#f0fdf4] rounded-[12px] border border-[#86efac]">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={16} className="text-[#10b981]" />
              <span className="font-['Arimo',sans-serif] text-[12px] text-[#059669]">
                Average Score
              </span>
            </div>
            <p className="text-[28px] font-semibold text-[#10b981]">
              {archivedStats.avgScore}
            </p>
          </div>

          {/* By Hiring Round */}
          <div className="mb-6">
            <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-semibold mb-3">
              By Hiring Round
            </h4>
            <div className="space-y-2">
              {Object.entries(archivedStats.byRound).map(([round, count]) => (
                <div key={round} className="flex items-center justify-between">
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                    {round}
                  </span>
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-medium">
                    {count} candidates
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* By Source */}
          <div className="mb-6">
            <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-semibold mb-3">
              By Source
            </h4>
            <div className="space-y-2">
              {Object.entries(archivedStats.bySource).map(([source, count]) => (
                <div key={source}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                      {source}
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      {count}
                    </span>
                  </div>
                  <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#6366f1] rounded-full"
                      style={{ width: `${(count / archivedStats.total) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Archives */}
          <div>
            <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-semibold mb-3">
              Recently Archived
            </h4>
            <div className="space-y-3">
              {archivedCandidates
                .sort((a, b) => (b.archivedDate?.getTime() || 0) - (a.archivedDate?.getTime() || 0))
                .slice(0, 3)
                .map((candidate) => (
                  <div key={candidate.id} className="p-3 bg-[#f9fafb] rounded-[8px]">
                    <p className="font-['Arimo',sans-serif] text-[13px] text-[#111827] font-medium mb-1">
                      {candidate.name}
                    </p>
                    <div className="flex items-center gap-1 text-[#6b7280]">
                      <Clock size={12} />
                      <span className="font-['Arimo',sans-serif] text-[11px]">
                        {candidate.archivedDate?.toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {showArchiveConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[16px] shadow-2xl max-w-md w-full p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#fef3c7] flex items-center justify-center">
                <Archive size={24} className="text-[#f59e0b]" />
              </div>
              <h3 className="text-[#111827] text-[18px] font-semibold">
                Archive Candidates
              </h3>
            </div>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
              Are you sure you want to archive {selectedCandidates.length} candidate(s)? They will be moved to the archived section and can be accessed later.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowArchiveConfirm(false)}
                disabled={isProcessing}
                className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleArchiveSelected}
                disabled={isProcessing}
                className="flex-1 h-[44px] rounded-[8px] bg-[#f59e0b] hover:bg-[#d97706] font-['Arimo',sans-serif] text-[14px] text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing && <Loader2 size={16} className="animate-spin" />}
                Archive
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-[16px] shadow-2xl max-w-md w-full p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-[#fee2e2] flex items-center justify-center">
                <X size={24} className="text-[#ef4444]" />
              </div>
              <h3 className="text-[#111827] text-[18px] font-semibold">
                Delete Candidates
              </h3>
            </div>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-6">
              Are you sure you want to permanently delete {selectedCandidates.length} candidate(s)? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isProcessing}
                className="flex-1 h-[44px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[14px] text-[#374151] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSelected}
                disabled={isProcessing}
                className="flex-1 h-[44px] rounded-[8px] bg-[#ef4444] hover:bg-[#dc2626] font-['Arimo',sans-serif] text-[14px] text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing && <Loader2 size={16} className="animate-spin" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      </div> {/* Close Main Content Area */}
    </div>
  );
}
