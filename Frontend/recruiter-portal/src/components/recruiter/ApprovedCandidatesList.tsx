import { useState } from 'react';
import { ArrowLeft, Eye, Users, TrendingUp } from 'lucide-react';

interface ApprovedCandidate {
  id: number;
  name: string;
  title: string;
  email: string;
  overallScore: number;
  assessmentScore: number;
  aiInterviewScore: number;
  githubScore: number;
  groupId: string;
  groupName: string;
}

interface ApprovedCandidatesListProps {
  positionTitle: string;
  department: string;
  candidates: ApprovedCandidate[];
  onBack: () => void;
  onViewCandidate: (candidateId: number) => void;
}

export function ApprovedCandidatesList({
  positionTitle,
  department,
  candidates,
  onBack,
  onViewCandidate
}: ApprovedCandidatesListProps) {
  // Group candidates by group
  const candidatesByGroup = candidates.reduce((acc, candidate) => {
    if (!acc[candidate.groupId]) {
      acc[candidate.groupId] = {
        groupName: candidate.groupName,
        candidates: []
      };
    }
    acc[candidate.groupId].candidates.push(candidate);
    return acc;
  }, {} as Record<string, { groupName: string; candidates: ApprovedCandidate[] }>);

  const groups = Object.entries(candidatesByGroup);

  return (
    <div className="px-12 py-8">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors mb-4"
        >
          <ArrowLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back to Closed Positions</span>
        </button>
        <div>
          <h1 className="text-gray-900 text-3xl mb-2">Approved Candidates</h1>
          <p className="text-gray-500">
            {positionTitle} • {department} Department
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-3xl px-8 py-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{candidates.length}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Total Approved</div>
              <div className="text-gray-400 text-sm">candidates hired</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl px-8 py-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{groups.length}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Groups</div>
              <div className="text-gray-400 text-sm">selection groups</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl px-8 py-6 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">
              {Math.round(candidates.reduce((sum, c) => sum + c.overallScore, 0) / candidates.length)}
            </span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Avg Score</div>
              <div className="text-gray-400 text-sm">overall rating</div>
            </div>
          </div>
        </div>
      </div>

      {/* Groups with Candidates */}
      <div className="space-y-6">
        {groups.map(([groupId, { groupName, candidates: groupCandidates }]) => (
          <div key={groupId} className="bg-white rounded-3xl shadow-sm overflow-hidden">
            {/* Group Header */}
            <div className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-8 py-6">
              <div className="flex items-center gap-3">
                <Users className="w-6 h-6 text-white" />
                <div>
                  <h2 className="text-white mb-1">{groupName}</h2>
                  <p className="text-white/80 text-sm">
                    {groupCandidates.length} {groupCandidates.length === 1 ? 'candidate' : 'candidates'} approved
                  </p>
                </div>
              </div>
            </div>

            {/* Candidates Table */}
            <div className="p-6">
              <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
                <table className="w-full">
                  <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                    <tr>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Candidate
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Contact
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Overall Score
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Assessment
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          AI Interview
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          GitHub
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Actions
                        </span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {groupCandidates.map((candidate, index) => (
                      <tr
                        key={candidate.id}
                        className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors ${
                          index === groupCandidates.length - 1 ? 'border-b-0' : ''
                        }`}
                      >
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-sm">
                              {candidate.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                                {candidate.name}
                              </div>
                              <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                                {candidate.title}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                            {candidate.email}
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <span className="font-['Arimo',sans-serif] text-[16px] text-[#111827] font-semibold">
                              {candidate.overallScore}
                            </span>
                            {candidate.overallScore >= 90 && (
                              <TrendingUp className="w-4 h-4 text-emerald-600" />
                            )}
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-600 rounded-full"
                                style={{ width: `${candidate.assessmentScore}%` }}
                              />
                            </div>
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                              {candidate.assessmentScore}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-purple-600 rounded-full"
                                style={{ width: `${candidate.aiInterviewScore}%` }}
                              />
                            </div>
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                              {candidate.aiInterviewScore}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-12 h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-600 rounded-full"
                                style={{ width: `${candidate.githubScore}%` }}
                              />
                            </div>
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                              {candidate.githubScore}
                            </span>
                          </div>
                        </td>
                        <td className="p-4">
                          <button
                            onClick={() => onViewCandidate(candidate.id)}
                            className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                          >
                            <Eye size={16} className="text-[#6366f1]" />
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                              View Report
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
