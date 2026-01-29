import { useState, useEffect } from 'react';
import { ArrowLeft, Eye, ArrowUpDown, Calendar, Users, FileText, CheckCircle, XCircle, Clock, Briefcase, Award, TrendingUp, Loader2 } from 'lucide-react';
import { Card } from '../ui/card';
import { api, ClosedProject, ClosedPosition } from '../../services/api';

interface AdminClosedPositionsProps {
  onSignOut: () => void;
}

type ViewMode = 'projects' | 'positions' | 'details';

export function AdminClosedPositions({ onSignOut }: AdminClosedPositionsProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('projects');
  const [selectedProject, setSelectedProject] = useState<ClosedProject | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<ClosedPosition | null>(null);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [isLoading, setIsLoading] = useState(true);
  const [closedProjects, setClosedProjects] = useState<ClosedProject[]>([]);
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const data = await api.admin.getClosedPositions();
        setClosedProjects(data.projects);
        setClosedPositions(data.positions);
      } catch (error) {
        console.error("Error loading closed positions:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const getPositionsForProject = (projectName: string) => {
    return closedPositions.filter(pos => pos.projectName === projectName);
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Filled':
        return 'bg-[#10b981] text-white';
      case 'Cancelled':
        return 'bg-[#ef4444] text-white';
      case 'On Hold':
        return 'bg-[#f59e0b] text-white';
      default:
        return 'bg-[#e5e7eb] text-[#6b7280]';
    }
  };

  return (
    <div className="px-12 py-8">
      {/* Projects View */}
      {viewMode === 'projects' && (
        <div>
          <div className="mb-8">
            <h2 className="text-gray-900 mb-2">Closed Projects Archive</h2>
            <p className="text-gray-500 text-sm">
              Browse closed projects and view position archives
            </p>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="mb-6">
              <h3 className="text-gray-900 mb-2">Closed Projects</h3>
              <p className="text-gray-500 text-sm">Select a project to view its positions</p>
            </div>

            <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                    <tr>
                      <th className="text-left p-4">
                        <button
                          onClick={() => handleSort('projectName')}
                          className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                        >
                          Project Name
                          <ArrowUpDown size={14} />
                        </button>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Open Date
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Closed Date
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <button
                          onClick={() => handleSort('positionsCount')}
                          className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                        >
                          Positions
                          <ArrowUpDown size={14} />
                        </button>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Total Candidates
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
                    {closedProjects.map((project, index) => (
                      <tr
                        key={project.id}
                        className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer ${index === closedProjects.length - 1 ? 'border-b-0' : ''
                          }`}
                        onClick={() => {
                          setSelectedProject(project);
                          setViewMode('positions');
                        }}
                      >
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                            {project.projectName}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            {new Date(project.openDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            {new Date(project.closedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                            {project.positionsCount}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            {project.totalCandidates}
                          </span>
                        </td>
                        <td className="p-4">
                          <button
                            className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedProject(project);
                              setViewMode('positions');
                            }}
                          >
                            <Eye size={16} className="text-[#6366f1]" />
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                              View Positions
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
        </div>
      )}

      {/* Positions View */}
      {viewMode === 'positions' && selectedProject && (
        <div>
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => {
                setViewMode('projects');
                setSelectedProject(null);
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 className="text-gray-900 mb-1">Project Archive: {selectedProject.projectName}</h3>
              <p className="text-gray-500 text-sm">Select a position to view detailed archive data</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="mb-6">
              <h3 className="text-gray-900 mb-2">Closed Positions</h3>
              <p className="text-gray-500 text-sm">View archive details for each position</p>
            </div>

            <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                    <tr>
                      <th className="text-left p-4">
                        <button
                          onClick={() => handleSort('jobTitle')}
                          className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                        >
                          Job Title
                          <ArrowUpDown size={14} />
                        </button>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Closure Status
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Closed Date
                        </span>
                      </th>
                      <th className="text-left p-4">
                        <button
                          onClick={() => handleSort('candidatesCount')}
                          className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                        >
                          Candidates
                          <ArrowUpDown size={14} />
                        </button>
                      </th>
                      <th className="text-left p-4">
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                          Groups Created
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
                    {getPositionsForProject(selectedProject.projectName).map((position, index) => (
                      <tr
                        key={position.id}
                        className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer ${index === getPositionsForProject(selectedProject.projectName).length - 1 ? 'border-b-0' : ''
                          }`}
                        onClick={() => {
                          setSelectedPosition(position);
                          setViewMode('details');
                        }}
                      >
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                            {position.jobTitle}
                          </span>
                        </td>
                        <td className="p-4">
                          <span
                            className={`inline-block px-3 py-1 rounded-full font-['Arimo',sans-serif] text-[12px] ${getStatusBadgeColor(
                              position.closureStatus
                            )}`}
                          >
                            {position.closureStatus}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            {new Date(position.closedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                            {position.candidatesCount}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            {position.groupsCreated}
                          </span>
                        </td>
                        <td className="p-4">
                          <button
                            className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedPosition(position);
                              setViewMode('details');
                            }}
                          >
                            <Eye size={16} className="text-[#6366f1]" />
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                              View Archive
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
        </div>
      )}

      {/* Archive Details View */}
      {viewMode === 'details' && selectedPosition && selectedProject && (
        <div>
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => {
                setViewMode('positions');
                setSelectedPosition(null);
              }}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 className="text-gray-900 mb-1">Position Archive: {selectedPosition.jobTitle}</h3>
              <p className="text-gray-500 text-sm">Detailed closure information and statistics</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column - Position Overview */}
            <Card className="p-6 rounded-3xl shadow-sm">
              <h3 className="text-gray-900 mb-4">Position Overview</h3>

              <div className="mb-6 p-4 rounded-lg bg-[#F9FAFB]">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-gray-900 mb-1">{selectedPosition.jobTitle}</p>
                    <p className="text-gray-500 text-sm">{selectedProject.projectName}</p>
                  </div>
                  <div
                    className="h-[28px] rounded-full px-[14px] flex items-center justify-center"
                    style={{
                      backgroundColor: selectedPosition.closureStatus === 'Filled' ? '#10b981' :
                        selectedPosition.closureStatus === 'Cancelled' ? '#ef4444' :
                          selectedPosition.closureStatus === 'On Hold' ? '#f59e0b' : '#e5e7eb'
                    }}
                  >
                    <p className="font-['Arimo',sans-serif] text-[13px] text-white">
                      {selectedPosition.closureStatus}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex items-start gap-3">
                  <Calendar size={20} className="text-indigo-600 mt-0.5" />
                  <div>
                    <p className="text-gray-500 text-xs">Closure Date</p>
                    <p className="text-gray-900 text-sm">
                      {new Date(selectedPosition.closedDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <FileText size={20} className="text-indigo-600 mt-0.5" />
                  <div>
                    <p className="text-gray-500 text-xs">Closure Reason</p>
                    <p className="text-gray-900 text-sm">{selectedPosition.closureReason}</p>
                  </div>
                </div>
              </div>

              <div className="pt-6 border-t border-gray-200">
                <h4 className="text-gray-900 mb-4">Recruitment Statistics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-lg bg-indigo-50">
                    <div className="flex items-center gap-2 mb-1">
                      <Users size={16} className="text-indigo-600" />
                      <p className="text-xs text-indigo-600">Total Candidates</p>
                    </div>
                    <p className="text-2xl font-semibold text-indigo-900">{selectedPosition.candidatesCount}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-purple-50">
                    <div className="flex items-center gap-2 mb-1">
                      <Briefcase size={16} className="text-purple-600" />
                      <p className="text-xs text-purple-600">Groups Created</p>
                    </div>
                    <p className="text-2xl font-semibold text-purple-900">{selectedPosition.groupsCreated}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-emerald-50">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle size={16} className="text-emerald-600" />
                      <p className="text-xs text-emerald-600">Assessment Passed</p>
                    </div>
                    <p className="text-2xl font-semibold text-emerald-900">{selectedPosition.assessmentsPassed}</p>
                  </div>

                  <div className="p-3 rounded-lg bg-blue-50">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp size={16} className="text-blue-600" />
                      <p className="text-xs text-blue-600">AI Interviews Passed</p>
                    </div>
                    <p className="text-2xl font-semibold text-blue-900">{selectedPosition.aiInterviewsPassed}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Right Column - Selected Candidates or Closure Details */}
            <Card className="p-6 rounded-3xl shadow-sm">
              {selectedPosition.closureStatus === 'Filled' && selectedPosition.selectedCandidates && selectedPosition.selectedCandidates.length > 0 ? (
                <div>
                  <h3 className="text-gray-900 mb-2">Selected Candidates</h3>
                  <p className="text-gray-500 text-sm mb-6">
                    {selectedPosition.selectedCandidates.length} candidate(s) selected for this position
                  </p>

                  <div className="space-y-4">
                    {selectedPosition.selectedCandidates.map((candidate) => (
                      <div key={candidate.id} className="p-4 rounded-lg border border-gray-200 bg-white">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-12 h-12 rounded-full flex items-center justify-center text-white font-semibold"
                              style={{ backgroundColor: '#6366F1' }}
                            >
                              {candidate.name.split(' ').map(n => n[0]).join('')}
                            </div>
                            <div>
                              <p className="text-gray-900 font-medium">{candidate.name}</p>
                              <p className="text-gray-500 text-sm">{candidate.email}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1">
                              <Award size={16} className="text-amber-500" />
                              <span className="text-lg font-semibold text-gray-900">{candidate.finalScore}</span>
                            </div>
                            <p className="text-gray-500 text-xs">Final Score</p>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-gray-200">
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Calendar size={14} />
                            <span>Selected on {new Date(candidate.selectionDate).toLocaleDateString('en-US', {
                              year: 'numeric',
                              month: 'short',
                              day: 'numeric'
                            })}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 p-4 rounded-lg bg-emerald-50">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle size={20} className="text-emerald-600" />
                      <h4 className="text-emerald-900 font-medium">Position Successfully Filled</h4>
                    </div>
                    <p className="text-emerald-700 text-sm">
                      This position was successfully closed with {selectedPosition.selectedCandidates.length} selected candidate(s).
                    </p>
                  </div>
                </div>
              ) : selectedPosition.closureStatus === 'Cancelled' ? (
                <div>
                  <h3 className="text-gray-900 mb-6">Position Cancelled</h3>

                  <div className="p-4 rounded-lg bg-red-50 mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <XCircle size={20} className="text-red-600" />
                      <h4 className="text-red-900 font-medium">Position Cancelled</h4>
                    </div>
                    <p className="text-red-700 text-sm mb-3">
                      {selectedPosition.closureReason}
                    </p>
                    <p className="text-red-600 text-xs">
                      No candidates were selected for this position.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-gray-900 text-sm font-medium">Candidate Progression Summary</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 text-sm">Total Applicants</span>
                        <span className="text-gray-900 font-semibold">{selectedPosition.candidatesCount}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 text-sm">Passed Assessment</span>
                        <span className="text-gray-900 font-semibold">{selectedPosition.assessmentsPassed}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 text-sm">Passed AI Interview</span>
                        <span className="text-gray-900 font-semibold">{selectedPosition.aiInterviewsPassed}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 text-sm">Completed Live Interview</span>
                        <span className="text-gray-900 font-semibold">{selectedPosition.liveInterviewsPassed}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <h3 className="text-gray-900 mb-6">Position On Hold</h3>

                  <div className="p-4 rounded-lg bg-amber-50 mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <Clock size={20} className="text-amber-600" />
                      <h4 className="text-amber-900 font-medium">Position On Hold</h4>
                    </div>
                    <p className="text-amber-700 text-sm mb-3">
                      {selectedPosition.closureReason}
                    </p>
                    <p className="text-amber-600 text-xs">
                      The recruitment process is paused pending further decisions.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-gray-900 text-sm font-medium">Candidate Progression Summary</h4>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 text-sm">Total Applicants</span>
                        <span className="text-gray-900 font-semibold">{selectedPosition.candidatesCount}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 text-sm">Passed Assessment</span>
                        <span className="text-gray-900 font-semibold">{selectedPosition.assessmentsPassed}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 text-sm">Passed AI Interview</span>
                        <span className="text-gray-900 font-semibold">{selectedPosition.aiInterviewsPassed}</span>
                      </div>
                      <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <span className="text-gray-600 text-sm">Completed Live Interview</span>
                        <span className="text-gray-900 font-semibold">{selectedPosition.liveInterviewsPassed}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
