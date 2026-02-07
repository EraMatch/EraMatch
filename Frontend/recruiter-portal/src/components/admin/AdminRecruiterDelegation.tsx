import { useState, useEffect } from 'react';
import { ChevronDown, X, TrendingUp, TrendingDown, AlertTriangle, ArrowLeft, Eye, ArrowUpDown, Loader2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { api, JobPosition, Project } from '../../services/api';
import EraMatchLogo from '../../assets/image-eramatch.png';

interface AdminRecruiterDelegationProps {
  onSignOut: () => void;
}

type ViewMode = 'projects' | 'positions' | 'delegation';

export function AdminRecruiterDelegation({ onSignOut }: AdminRecruiterDelegationProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('projects');
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [selectedPosition, setSelectedPosition] = useState<JobPosition | null>(null);
  const [showHRDropdown, setShowHRDropdown] = useState(false);
  const [showTechDropdown, setShowTechDropdown] = useState(false);
  const [sortField, setSortField] = useState<string>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const [isLoading, setIsLoading] = useState(true);
  const [hrRecruiters, setHrRecruiters] = useState<{ id: string; name: string }[]>([]);
  const [technicalRecruiters, setTechnicalRecruiters] = useState<{ id: string; name: string }[]>([]);
  const [jobPositions, setJobPositions] = useState<JobPosition[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentAssignments, setRecentAssignments] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const data = await api.admin.getRecruiterDelegation();
        setHrRecruiters(data.hrRecruiters);
        setTechnicalRecruiters(data.technicalRecruiters);
        setJobPositions(data.positions);
        setProjects(data.projects);

        const recent = await api.admin.getRecentAssignments();
        setRecentAssignments(recent || []);
      } catch (error) {
        toast.error('Failed to load delegation data');
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

  const handleAssignHR = async (positionId: any, recruiter: { id: string, name: string }) => {
    try {
      const posIdStr = positionId.toString();
      await api.admin.reassignRecruiter(posIdStr, recruiter.id, 'HR');
      setJobPositions(prev =>
        prev.map(pos =>
          pos.id === posIdStr ? { ...pos, assignedHR: recruiter.name } : pos
        )
      );
      if (selectedPosition && selectedPosition.id === posIdStr) {
        setSelectedPosition({ ...selectedPosition, assignedHR: recruiter.name });
      }

      // Refresh logs
      const recent = await api.admin.getRecentAssignments();
      setRecentAssignments(recent || []);

      toast.success(`HR Recruiter assigned: ${recruiter.name}`);
    } catch (error) {
      toast.error('Failed to reassign HR Recruiter');
    } finally {
      setShowHRDropdown(false);
    }
  };

  const handleAssignTechnical = async (positionId: any, recruiter: { id: string, name: string }) => {
    try {
      const posIdStr = positionId.toString();
      await api.admin.reassignRecruiter(posIdStr, recruiter.id, 'Technical');
      setJobPositions(prev =>
        prev.map(pos =>
          pos.id === posIdStr ? { ...pos, assignedTechnicalRecruiter: recruiter.name } : pos
        )
      );
      if (selectedPosition && selectedPosition.id === posIdStr) {
        setSelectedPosition({ ...selectedPosition, assignedTechnicalRecruiter: recruiter.name });
      }

      // Refresh logs
      const recent = await api.admin.getRecentAssignments();
      setRecentAssignments(recent || []);

      toast.success(`Technical Recruiter assigned: ${recruiter.name}`);
    } catch (error) {
      toast.error('Failed to reassign Technical Recruiter');
    } finally {
      setShowTechDropdown(false);
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Open':
        return 'bg-[#10b981] text-white';
      case 'Interview':
        return 'bg-[#6366f1] text-white';
      case 'Closed':
        return 'bg-[#6b7280] text-white';
      case 'On Hold':
        return 'bg-[#f59e0b] text-white';
      default:
        return 'bg-[#e5e7eb] text-[#6b7280]';
    }
  };

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className="px-12 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">Recruiter Delegation</h1>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
            Assign and manage HR and Technical Recruiters for each job position
          </p>
        </div>
        <img src={EraMatchLogo} alt="Era Match" className="h-[72px] w-auto object-contain mt-1 mr-6" />
      </div>

      {/* Projects Table View */}
      {viewMode === 'projects' && (
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="mb-6">
            <h3 className="text-gray-900 mb-2">Opened Projects</h3>
            <p className="text-gray-500 text-sm">Select a project to view and delegate positions</p>
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
                      <button
                        onClick={() => handleSort('positionsCount')}
                        className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                      >
                        Number of Positions
                        <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Number of Applicants
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Number of Sub Groups
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Project Open Date
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
                  {projects.map((project, index) => (
                    <tr
                      key={project.id}
                      className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer ${index === projects.length - 1 ? 'border-b-0' : ''
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
                          {project.positionsCount}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                          {project.applicantsCount}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {project.subGroupsCount}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {new Date(project.openDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
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
      )}

      {/* Positions Table View */}
      {viewMode === 'positions' && selectedProject && (
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setViewMode('projects')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 className="text-gray-900 mb-1">Project Positions: {selectedProject.projectName}</h3>
              <p className="text-gray-500 text-sm">Select a position to delegate recruiters</p>
            </div>
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
                        Assigned HR
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Assigned Technical Recruiter
                      </span>
                    </th>
                    <th className="text-left p-4">
                      <button
                        onClick={() => handleSort('candidatesCount')}
                        className="flex items-center gap-1 font-['Arimo',sans-serif] text-[13px] text-[#6b7280] hover:text-[#111827]"
                      >
                        Candidates Count
                        <ArrowUpDown size={14} />
                      </button>
                    </th>
                    <th className="text-left p-4">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                        Status
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
                  {jobPositions.filter(p => p.projectId === selectedProject.id).map((position, index) => (
                    <tr
                      key={position.id}
                      className={`border-b border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors cursor-pointer ${index === selectedProject.positionsCount - 1 ? 'border-b-0' : ''
                        }`}
                      onClick={() => {
                        setSelectedPosition(position);
                        setViewMode('delegation');
                      }}
                    >
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                          {position.jobTitle}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {position.assignedHR}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {position.assignedTechnicalRecruiter}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                          {position.candidatesCount}
                        </span>
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-block px-3 py-1 rounded-full font-['Arimo',sans-serif] text-[12px] ${getStatusBadgeColor(
                            position.status
                          )}`}
                        >
                          {position.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <button
                          className="flex items-center gap-2 h-[32px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPosition(position);
                            setViewMode('delegation');
                          }}
                        >
                          <Eye size={16} className="text-[#6366f1]" />
                          <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                            Delegate
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
      )}

      {/* Delegation View */}
      {viewMode === 'delegation' && selectedPosition && (
        <div>
          <div className="mb-6 flex items-center gap-3">
            <button
              onClick={() => setViewMode('positions')}
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 className="text-gray-900 mb-1">Delegate Recruiters: {selectedPosition.jobTitle}</h3>
              <p className="text-gray-500 text-sm">Assign HR and Technical Recruiters</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Section - Position Info */}
            <Card className="p-6 rounded-3xl shadow-sm">
              <h3 className="text-gray-900 mb-4">Position Details</h3>

              <div className="mb-6 p-4 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-gray-900">{selectedPosition.jobTitle}</p>
                    <p className="text-gray-500 text-sm">{selectedPosition.department} Department</p>
                  </div>
                  <div
                    className="h-[28px] rounded-full px-[14px] flex items-center justify-center"
                    style={{
                      backgroundColor: getStatusBadgeColor(selectedPosition.status) === 'bg-[#10b981] text-white' ? '#10b981' :
                        getStatusBadgeColor(selectedPosition.status) === 'bg-[#6366f1] text-white' ? '#6366f1' :
                          getStatusBadgeColor(selectedPosition.status) === 'bg-[#6b7280] text-white' ? '#6b7280' :
                            getStatusBadgeColor(selectedPosition.status) === 'bg-[#f59e0b] text-white' ? '#f59e0b' : '#e5e7eb'
                    }}
                  >
                    <p className="font-['Arimo',sans-serif] text-[13px] text-white">
                      {selectedPosition.status}
                    </p>
                  </div>
                </div>
                <p className="text-gray-600 text-sm">
                  {selectedPosition.candidatesCount} candidates in pipeline
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-indigo-600 text-sm">HR</span>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Current HR Recruiter</p>
                    <p className="text-gray-900 text-sm font-medium">{selectedPosition.assignedHR}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                    <span className="text-emerald-600 text-sm">TR</span>
                  </div>
                  <div>
                    <p className="text-gray-500 text-xs">Current Technical Recruiter</p>
                    <p className="text-gray-900 text-sm font-medium">{selectedPosition.assignedTechnicalRecruiter}</p>
                  </div>
                </div>
              </div>

              {/* Recruiter Workload Table */}
              <div className="mt-8">
                <h4 className="text-gray-900 text-sm font-semibold mb-3">Recruiter Workload</h4>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-2 font-medium text-gray-500">Recruiter</th>
                        <th className="px-4 py-2 font-medium text-gray-500 text-right">Assignments</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {[...hrRecruiters, ...technicalRecruiters].map((r: any) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 text-gray-900">{r.name}</td>
                          <td className="px-4 py-2 text-gray-600 text-right font-medium">
                            {r.assignedCount || 0}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>

            {/* Right Section - Recruiter Assignment */}
            <Card className="p-6 rounded-3xl shadow-sm">
              <h3 className="text-gray-900 mb-2">Manage Assignments</h3>
              <p className="text-gray-500 text-sm mb-6">
                Reassign recruiters for this position
              </p>

              {/* HR Recruiter Assignment */}
              <div className="mb-6">
                <label className="block text-gray-900 mb-3">HR Recruiter</label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 p-4 rounded-lg border border-gray-200 bg-white">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: '#6366F1' }}
                      >
                        {selectedPosition.assignedHR
                          ? selectedPosition.assignedHR
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                          : '??'}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-900 text-sm">
                          {selectedPosition.assignedHR}
                        </p>
                        <p className="text-gray-500 text-xs">HR Recruiter</p>
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <Button
                      variant="outline"
                      className="rounded-lg gap-2"
                      onClick={() => {
                        setShowHRDropdown(!showHRDropdown);
                        setShowTechDropdown(false);
                      }}
                    >
                      Reassign
                      <ChevronDown size={16} />
                    </Button>
                    {showHRDropdown && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 min-w-[200px]">
                        {hrRecruiters.map((recruiter) => (
                          <button
                            key={recruiter.id}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                            onClick={() =>
                              handleAssignHR(selectedPosition.id, recruiter)
                            }
                          >
                            {recruiter.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Technical Recruiter Assignment */}
              <div className="mb-6">
                <label className="block text-gray-900 mb-3">
                  Technical Recruiter
                </label>
                <div className="flex items-center gap-3">
                  <div className="flex-1 p-4 rounded-lg border border-gray-200 bg-white">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white"
                        style={{ backgroundColor: '#10b981' }}
                      >
                        {selectedPosition.assignedTechnicalRecruiter
                          ? selectedPosition.assignedTechnicalRecruiter
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                          : '??'}
                      </div>
                      <div className="flex-1">
                        <p className="text-gray-900 text-sm">
                          {selectedPosition.assignedTechnicalRecruiter}
                        </p>
                        <p className="text-gray-500 text-xs">
                          Technical Recruiter
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <Button
                      variant="outline"
                      className="rounded-lg gap-2"
                      onClick={() => {
                        setShowTechDropdown(!showTechDropdown);
                        setShowHRDropdown(false);
                      }}
                    >
                      Reassign
                      <ChevronDown size={16} />
                    </Button>
                    {showTechDropdown && (
                      <div className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 min-w-[200px]">
                        {technicalRecruiters.map((recruiter) => (
                          <button
                            key={recruiter.id}
                            className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 first:rounded-t-lg last:rounded-b-lg"
                            onClick={() =>
                              handleAssignTechnical(
                                selectedPosition.id,
                                recruiter
                              )
                            }
                          >
                            {recruiter.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Assignment History */}
              <div className="pt-6 border-t border-gray-200">
                <h4 className="text-gray-900 mb-3">Recent Assignment Changes</h4>
                <div className="space-y-3">
                  {recentAssignments.length > 0 ? (
                    recentAssignments.map((log: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 text-sm">
                        <div className={`w-2 h-2 rounded-full mt-1.5 ${log.action?.includes('hr') ? 'bg-indigo-600' : 'bg-emerald-600'}`}></div>
                        <div className="flex-1">
                          <p className="text-gray-900">
                            {log.action?.includes('hr') ? 'HR' : 'Technical'} Recruiter assigned to{' '}
                            <span className="text-gray-900 font-medium">
                              {log.positionName || 'Position'}
                            </span>
                          </p>
                          <div className="text-xs text-gray-500 mt-1 flex justify-between">
                            <span>New: {log.newValueName || log.newValue || 'Unknown'}</span>
                            <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 text-sm italic">No recent assignments found.</p>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex items-center gap-3">
                <Button
                  className="flex-1 rounded-full text-white"
                  style={{ backgroundColor: '#6366F1' }}
                  onClick={async () => {
                    try {
                      const posIdStr = selectedPosition.id.toString();
                      await api.admin.notifyRecruiters(posIdStr);
                      toast.success('Recruiters notified successfully!');
                    } catch (error) {
                      toast.error('Failed to notify recruiters');
                    }
                  }}
                >
                  Notify Recruiters
                </Button>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}