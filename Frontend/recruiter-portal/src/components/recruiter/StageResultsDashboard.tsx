import { X, TrendingUp, TrendingDown, Award, AlertCircle, CheckCircle, XCircle, BarChart3, Users, Target } from 'lucide-react';
import { Button } from '../ui/button';

interface StageResultsDashboardProps {
  stageName: string;
  stageId: string;
  candidates: any[];
  onClose: () => void;
  onEnterReviewMode: () => void;
  startDate: Date;
  endDate: Date;
}

export function StageResultsDashboard({
  stageName,
  stageId,
  candidates,
  onClose,
  onEnterReviewMode,
  startDate,
  endDate
}: StageResultsDashboardProps) {
  // Calculate stage statistics
  const completedCandidates = candidates.filter(c => {
    if (stageId === 'assessment') return c.assessment === 'completed';
    if (stageId === 'ai-interview') return c.aiInterview === 'completed';
    return false;
  });

  const averageScore = completedCandidates.length > 0
    ? completedCandidates.reduce((sum, c) => {
        if (stageId === 'assessment') return sum + c.assessmentScore;
        if (stageId === 'ai-interview') return sum + c.aiInterviewScore;
        return sum;
      }, 0) / completedCandidates.length
    : 0;

  const topPerformers = [...completedCandidates]
    .sort((a, b) => {
      const scoreA = stageId === 'assessment' ? a.assessmentScore : a.aiInterviewScore;
      const scoreB = stageId === 'assessment' ? b.assessmentScore : b.aiInterviewScore;
      return scoreB - scoreA;
    })
    .slice(0, 5);

  const candidatesWithFlags = candidates.filter(c => c.flags.length > 0);
  const meetsCriteriaCount = candidates.filter(c => c.meetsCriteria).length;
  const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb] bg-gradient-to-r from-purple-50 to-blue-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <BarChart3 size={24} className="text-[#6366f1]" />
                <h2 className="text-[#111827]">{stageName} - Results Overview</h2>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-[6px] text-[13px] font-medium">
                  Stage Closed
                </span>
              </div>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                Review the results and metrics before proceeding to candidate selection
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-white/50 transition-colors"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>

          {/* Timeline */}
          <div className="mt-6 p-4 bg-white rounded-[12px] border border-[#e5e7eb]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                  <CheckCircle size={20} className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-[12px] text-[#6b7280]">Started</div>
                  <div className="text-[14px] font-semibold text-[#111827]">
                    {startDate.toLocaleDateString()}
                  </div>
                </div>
              </div>

              <div className="flex-1 mx-6 h-[2px] bg-gradient-to-r from-emerald-300 to-blue-300"></div>

              <div className="text-center">
                <div className="text-[12px] text-[#6b7280] mb-1">Duration</div>
                <div className="px-4 py-2 bg-blue-50 rounded-[8px]">
                  <span className="text-[18px] font-semibold text-blue-700">{duration}</span>
                  <span className="text-[12px] text-blue-600 ml-1">days</span>
                </div>
              </div>

              <div className="flex-1 mx-6 h-[2px] bg-gradient-to-r from-blue-300 to-purple-300"></div>

              <div className="flex items-center gap-2">
                <div>
                  <div className="text-[12px] text-[#6b7280] text-right">Closed</div>
                  <div className="text-[14px] font-semibold text-[#111827] text-right">
                    {endDate.toLocaleDateString()}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                  <Target size={20} className="text-purple-600" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {/* Key Metrics */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="p-6 bg-gradient-to-br from-blue-50 to-blue-100 rounded-[16px] border border-blue-200">
              <div className="flex items-center justify-between mb-3">
                <Users size={24} className="text-blue-600" />
                <TrendingUp size={20} className="text-blue-500" />
              </div>
              <div className="text-[32px] font-bold text-blue-900">
                {completedCandidates.length}
              </div>
              <div className="text-[14px] text-blue-700">
                Completed
              </div>
              <div className="text-[12px] text-blue-600 mt-1">
                out of {candidates.length} total
              </div>
            </div>

            <div className="p-6 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-[16px] border border-emerald-200">
              <div className="flex items-center justify-between mb-3">
                <Award size={24} className="text-emerald-600" />
                <TrendingUp size={20} className="text-emerald-500" />
              </div>
              <div className="text-[32px] font-bold text-emerald-900">
                {averageScore.toFixed(1)}%
              </div>
              <div className="text-[14px] text-emerald-700">
                Average Score
              </div>
              <div className="text-[12px] text-emerald-600 mt-1">
                across all candidates
              </div>
            </div>

            <div className="p-6 bg-gradient-to-br from-purple-50 to-purple-100 rounded-[16px] border border-purple-200">
              <div className="flex items-center justify-between mb-3">
                <CheckCircle size={24} className="text-purple-600" />
                <Target size={20} className="text-purple-500" />
              </div>
              <div className="text-[32px] font-bold text-purple-900">
                {meetsCriteriaCount}
              </div>
              <div className="text-[14px] text-purple-700">
                Meets Criteria
              </div>
              <div className="text-[12px] text-purple-600 mt-1">
                {((meetsCriteriaCount / candidates.length) * 100).toFixed(0)}% pass rate
              </div>
            </div>

            <div className="p-6 bg-gradient-to-br from-red-50 to-red-100 rounded-[16px] border border-red-200">
              <div className="flex items-center justify-between mb-3">
                <AlertCircle size={24} className="text-red-600" />
                <TrendingDown size={20} className="text-red-500" />
              </div>
              <div className="text-[32px] font-bold text-red-900">
                {candidatesWithFlags.length}
              </div>
              <div className="text-[14px] text-red-700">
                Flagged
              </div>
              <div className="text-[12px] text-red-600 mt-1">
                integrity concerns
              </div>
            </div>
          </div>

          {/* Top Performers */}
          <div className="mb-8">
            <h3 className="text-[16px] font-semibold text-[#111827] mb-4 flex items-center gap-2">
              <Award size={18} className="text-[#f59e0b]" />
              Top 5 Performers
            </h3>
            <div className="space-y-3">
              {topPerformers.map((candidate, index) => {
                const score = stageId === 'assessment' ? candidate.assessmentScore : candidate.aiInterviewScore;
                return (
                  <div
                    key={candidate.id}
                    className="flex items-center gap-4 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border border-amber-200 rounded-[12px]"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? 'bg-yellow-400 text-yellow-900' :
                      index === 1 ? 'bg-gray-300 text-gray-700' :
                      index === 2 ? 'bg-orange-300 text-orange-800' :
                      'bg-amber-200 text-amber-700'
                    }`}>
                      #{index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="font-semibold text-[14px] text-[#111827]">{candidate.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {candidate.meetsCriteria && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[11px] rounded-full">
                            ✓ Meets Criteria
                          </span>
                        )}
                        {candidate.technicalVerdict === 'pass' && (
                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[11px] rounded-full">
                            Pass
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[24px] font-bold text-[#111827]">{score}%</div>
                      <div className="text-[11px] text-[#6b7280]">Score</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Score Distribution */}
          <div className="mb-8">
            <h3 className="text-[16px] font-semibold text-[#111827] mb-4 flex items-center gap-2">
              <BarChart3 size={18} className="text-[#6366f1]" />
              Score Distribution
            </h3>
            <div className="p-6 bg-gray-50 rounded-[12px] border border-gray-200">
              <div className="space-y-4">
                {[
                  { range: '90-100%', min: 90, max: 100, color: 'emerald' },
                  { range: '80-89%', min: 80, max: 89, color: 'blue' },
                  { range: '70-79%', min: 70, max: 79, color: 'purple' },
                  { range: '60-69%', min: 60, max: 69, color: 'amber' },
                  { range: 'Below 60%', min: 0, max: 59, color: 'red' }
                ].map((bucket) => {
                  const count = completedCandidates.filter(c => {
                    const score = stageId === 'assessment' ? c.assessmentScore : c.aiInterviewScore;
                    return score >= bucket.min && score <= bucket.max;
                  }).length;
                  const percentage = completedCandidates.length > 0 
                    ? (count / completedCandidates.length) * 100 
                    : 0;

                  return (
                    <div key={bucket.range}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[13px] text-[#374151] font-medium">{bucket.range}</span>
                        <span className="text-[13px] text-[#6b7280]">
                          {count} candidate{count !== 1 ? 's' : ''} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-[8px] bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-${bucket.color}-500 transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Concerns */}
          {candidatesWithFlags.length > 0 && (
            <div>
              <h3 className="text-[16px] font-semibold text-[#111827] mb-4 flex items-center gap-2">
                <AlertCircle size={18} className="text-red-600" />
                Candidates Requiring Attention
              </h3>
              <div className="space-y-2">
                {candidatesWithFlags.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-[12px]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                        <span className="font-semibold text-[14px] text-red-700">
                          {candidate.avatar}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-[14px] text-[#111827]">{candidate.name}</div>
                        <div className="flex items-center gap-2 mt-1">
                          {candidate.flags.map((flag: string, idx: number) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 bg-red-200 text-red-800 text-[11px] rounded-full"
                            >
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[18px] font-bold text-red-700">
                        {stageId === 'assessment' ? candidate.assessmentScore : candidate.aiInterviewScore}%
                      </div>
                      <div className="text-[11px] text-red-600">Needs Review</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-[#e5e7eb] bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-100 rounded-[8px]">
                <BarChart3 size={20} className="text-blue-600" />
              </div>
              <div>
                <div className="text-[13px] font-semibold text-[#111827]">
                  Results Reviewed - Ready for Candidate Selection
                </div>
                <div className="text-[12px] text-[#6b7280]">
                  Proceed to review mode to select candidates for the next stage
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-6 py-3 rounded-[8px] border border-[#e5e7eb] text-[14px] hover:bg-white transition-colors"
              >
                Close
              </button>
              <button
                onClick={onEnterReviewMode}
                className="px-6 py-3 rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white text-[14px] transition-colors font-medium flex items-center gap-2"
              >
                <CheckCircle size={18} />
                Enter Review Mode
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
