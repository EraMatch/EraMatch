import { useState } from 'react';
import { X, BarChart3, PieChart, TrendingUp, Users, Filter, Download, CheckCircle, XCircle, AlertCircle, Award, Flag, Eye, MessageSquare, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

interface ModuleMonitoringDashboardProps {
  moduleType: 'assessment' | 'ai-interview';
  candidates: any[];
  onClose: () => void;
  onViewCandidate: (candidateId: number) => void;
  onAddVerdict: (candidateId: number) => void;
  onReviewFlags: (candidateId: number) => void;
}

export function ModuleMonitoringDashboard({
  moduleType,
  candidates,
  onClose,
  onViewCandidate,
  onAddVerdict,
  onReviewFlags
}: ModuleMonitoringDashboardProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'pending' | 'flagged'>('all');
  const [sortBy, setSortBy] = useState<'score-high' | 'score-low' | 'name'>('score-high');

  const moduleTitle = moduleType === 'assessment' ? 'Technical Assessment' : 'AI Interview';
  const scoreKey = moduleType === 'assessment' ? 'assessmentScore' : 'aiInterviewScore';
  const statusKey = moduleType === 'assessment' ? 'assessment' : 'aiInterview';

  // Filter and sort candidates
  const filteredCandidates = candidates
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
  const completed = candidates.filter(c => c[statusKey] === 'completed');
  const pending = candidates.filter(c => c[statusKey] === 'pending' || c[statusKey] === 'not-started');
  const flagged = candidates.filter(c => c.flags.length > 0);
  const averageScore = completed.length > 0
    ? completed.reduce((sum, c) => sum + c[scoreKey], 0) / completed.length
    : 0;
  const passRate = completed.length > 0
    ? (completed.filter(c => c.meetsCriteria).length / completed.length) * 100
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb] bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 size={24} className="text-[#10b981]" />
                <h2 className="text-[#111827]">{moduleTitle} - Module Monitoring</h2>
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
              <button className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-gray-50 transition-colors">
                <Download size={16} className="text-[#6b7280]" />
                <span className="text-[14px] text-[#111827]">Export</span>
              </button>
              <button className="flex items-center gap-2 px-4 py-2 rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-gray-50 transition-colors">
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
        </div>

        {/* Statistics Overview */}
        <div className="px-8 py-6 border-b border-[#e5e7eb] bg-gray-50">
          <div className="grid grid-cols-5 gap-4">
            <div className="p-4 bg-white rounded-[12px] border border-[#e5e7eb]">
              <div className="flex items-center justify-between mb-2">
                <Users size={20} className="text-blue-600" />
                <TrendingUp size={16} className="text-blue-500" />
              </div>
              <div className="text-[28px] font-bold text-blue-900">{candidates.length}</div>
              <div className="text-[12px] text-[#6b7280]">Total Candidates</div>
            </div>

            <div className="p-4 bg-white rounded-[12px] border border-emerald-200 bg-emerald-50">
              <div className="flex items-center justify-between mb-2">
                <CheckCircle size={20} className="text-emerald-600" />
                <span className="text-[11px] text-emerald-700 font-medium">
                  {completed.length > 0 ? ((completed.length / candidates.length) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="text-[28px] font-bold text-emerald-900">{completed.length}</div>
              <div className="text-[12px] text-emerald-700">Completed</div>
            </div>

            <div className="p-4 bg-white rounded-[12px] border border-amber-200 bg-amber-50">
              <div className="flex items-center justify-between mb-2">
                <AlertCircle size={20} className="text-amber-600" />
                <span className="text-[11px] text-amber-700 font-medium">
                  {pending.length > 0 ? ((pending.length / candidates.length) * 100).toFixed(0) : 0}%
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
                  {flagged.length > 0 ? ((flagged.length / candidates.length) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <div className="text-[28px] font-bold text-red-900">{flagged.length}</div>
              <div className="text-[12px] text-red-700">Flagged</div>
            </div>
          </div>
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
                    className={`px-4 py-2 rounded-[8px] text-[13px] font-medium transition-colors ${
                      filterStatus === filter.value
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

        {/* Candidates Table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-[#e5e7eb] sticky top-0">
              <tr>
                <th className="px-6 py-4 text-left">
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">Candidate</span>
                </th>
                <th className="px-6 py-4 text-center">
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] font-semibold">Status</span>
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
              {filteredCandidates.map((candidate) => (
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
                        <div className="text-[12px] text-[#6b7280]">ID: {candidate.id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium ${
                      candidate[statusKey] === 'completed'
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
                        <span className={`text-[20px] font-bold ${
                          candidate[scoreKey] >= 80 ? 'text-emerald-600' :
                          candidate[scoreKey] >= 60 ? 'text-blue-600' :
                          'text-red-600'
                        }`}>
                          {candidate[scoreKey]}%
                        </span>
                        <div className="w-20 h-1 bg-gray-200 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full ${
                              candidate[scoreKey] >= 80 ? 'bg-emerald-500' :
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
                      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-[12px] font-medium ${
                        candidate.meetsCriteria
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
                      className={`px-3 py-1 rounded-full text-[12px] font-medium transition-colors ${
                        candidate.technicalVerdict === 'pass'
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
    </div>
  );
}
