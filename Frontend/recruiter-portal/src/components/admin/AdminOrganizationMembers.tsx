import { useState } from 'react';
import { Users, FileText, Briefcase, Search, Filter, ChevronDown, UserPlus, Loader2, Trash2, GitPullRequest, XCircle, RotateCcw, BarChart3 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { EditAccessPrivilegesModal } from '../recruiter/groups/EditAccessPrivilegesModal';
import { RecruiterWorkloadChart } from './RecruiterWorkloadChart';
// import { EditAccessPrivilegesModal } from '../../';

import { toast } from 'sonner';
import { api, Member } from '../../services/api';
import { Logo } from '../common/Logo';
import LoadingSpinner from '../common/LoadingSpinner';
import { useQueryClient } from '@tanstack/react-query';
import { useAdminMembers, useAdminMemberStats } from '../../hooks/admin/useAdminDashboard';
import { useRemoveMember, useSuspendMember, useActivateMember, useBackfillPositions } from '../../hooks/admin/useAdminMutations';

interface AdminOrganizationMembersProps {
  onSignOut: () => void;
}

type TabType = 'members' | 'register' | 'workload';

export function AdminOrganizationMembers({ onSignOut }: AdminOrganizationMembersProps) {
  const [activeTab, setActiveTab] = useState<TabType>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [showDelegateModal, setShowDelegateModal] = useState(false);
  const [showReturnConfirm, setShowReturnConfirm] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showPositionDropdown, setShowPositionDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  // Employee Registration state
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeTitle, setEmployeeTitle] = useState<'technical' | 'hr'>('hr');
  const [employeeFirstName, setEmployeeFirstName] = useState('');
  const [employeeLastName, setEmployeeLastName] = useState('');

  const queryClient = useQueryClient();

  const { data: membersData, isLoading: membersLoading } = useAdminMembers();
  const { data: statsData, isLoading: statsLoading } = useAdminMemberStats();

  const isLoading = membersLoading || statsLoading;
  const members: Member[] = membersData ?? [];
  const recruitersCount = statsData?.recruitersCount ?? 0;
  const totalActiveCount = statsData?.totalActive ?? 0;
  const adminsCount = statsData?.adminsCount ?? 0;

  const removeMemberMutation = useRemoveMember();
  const suspendMemberMutation = useSuspendMember();
  const activateMemberMutation = useActivateMember();
  const backfillPositionsMutation = useBackfillPositions();



  const handleEditPrivileges = (member: Member) => {
    setSelectedMember(member);
    setShowEditModal(true);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Are you sure you want to remove this member? This action cannot be undone.')) {
      return;
    }

    try {
      setIsActing(true);
      await removeMemberMutation.mutateAsync(userId);
      toast.success('Member removed successfully');
    } catch (error) {
      toast.error('Failed to remove member');
    } finally {
      setIsActing(false);
    }
  };

  const handleDelegatePositions = async (member: Member) => {
    // Action 1: Delegate - open modal to select positions to reassign
    setSelectedMember(member);
    setShowDelegateModal(true);
  };

  const handleReturnPositions = async () => {
    // Action 4: Return - backfill unassigned positions to available recruiters
    if (!window.confirm('This will fill any unassigned positions with available recruiters of matching roles. Continue?')) {
      return;
    }

    try {
      setIsActing(true);
      const result = await backfillPositionsMutation.mutateAsync() as { updated_positions?: number };
      toast.success(`✓ Positions restored: ${result.updated_positions || 0} positions reassigned`);
      setShowReturnConfirm(false);
    } catch (error: any) {
      toast.error(error?.detail || 'Failed to restore positions');
    } finally {
      setIsActing(false);
    }
  };

  const handleToggleStatus = async (member: Member) => {
    const isSuspended = member.status?.toLowerCase() === 'suspended';

    if (!window.confirm(`Are you sure you want to ${isSuspended ? 'activate' : 'suspend'} this member?`)) {
      return;
    }

    try {
      setIsActing(true);
      if (isSuspended) {
        // Action 2: Activate member
        await activateMemberMutation.mutateAsync(member.id);
        toast.success('Member activated successfully');
      } else {
        // Action 1: Suspend member (auto-redistributes positions)
        await suspendMemberMutation.mutateAsync(member.id);
        toast.success('Member suspended successfully. Open positions have been redistributed.');
      }
    } catch (error: any) {
      toast.error(error?.detail || `Failed to ${isSuspended ? 'activate' : 'suspend'} member`);
    } finally {
      setIsActing(false);
    }
  };

  const handleRegisterEmployee = async () => {
    if (!employeeEmail || !employeeFirstName || !employeeLastName) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      await api.admin.registerEmployee({
        email: employeeEmail,
        firstName: employeeFirstName,
        lastName: employeeLastName,
        role: employeeTitle
      });
      toast.success(`${employeeFirstName} registered successfully! A temporary password has been generated.`);

      // Reset form
      setEmployeeEmail('');
      setEmployeeFirstName('');
      setEmployeeLastName('');
      setEmployeeTitle('hr');

      // Invalidate members list and switch back to list view
      queryClient.invalidateQueries({ queryKey: ['members'] });
      setActiveTab('members');

    } catch (error) {
      toast.error('Failed to register employee');
    }
  };

  // Get unique positions and roles
  const uniquePositions = Array.from(new Set(members.map(m => m.position)));
  const uniqueRoles = Array.from(new Set(members.map(m => m.role)));

  const filteredMembers = members.filter(member => {
    // Search filter
    const matchesSearch = member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email.toLowerCase().includes(searchTerm.toLowerCase());

    // Position filter
    const matchesPosition = positionFilter === 'all' || member.position === positionFilter;

    // Role filter
    const matchesRole = roleFilter === 'all' || member.role === roleFilter;

    return matchesSearch && matchesPosition && matchesRole;
  });

  return (
    <div className="px-12 py-8">
      {/* Page Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">Organization Members</h1>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Overview of your organization's team and access</p>
        </div>
        <Logo size="md" className="mt-1 mr-6" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner message="Loading organization members..." fullScreen={false} />
        </div>
      ) : (
        <>
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{totalActiveCount}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Active Members</div>
              <div className="text-gray-400 text-sm">currently in organization</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{recruitersCount}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Recruiting Force</div>
              <div className="text-gray-400 text-sm">active recruiters & HR</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{adminsCount}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">System Admins</div>
              <div className="text-gray-400 text-sm">full administrative access</div>
            </div>
          </div>
        </div>
      </div>

      {/* Organization Members Section with Tabs */}
      <Card className="p-6 rounded-3xl shadow-sm">
        <div className="mb-6">
          <h3 className="text-[#111827] text-[18px] font-['Arimo',sans-serif] mb-2">Member Management</h3>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Manage all members in your organization and their access privileges</p>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 mb-6">
          <div className="flex gap-8 justify-between items-center">
            <div className="flex gap-8">
              <button
                onClick={() => setActiveTab('members')}
                className={`pb-3 px-1 font-['Arimo',sans-serif] text-[14px] border-b-2 transition-colors ${activeTab === 'members'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                Members List
              </button>
              <button
                onClick={() => setActiveTab('register')}
                className={`pb-3 px-1 font-['Arimo',sans-serif] text-[14px] border-b-2 transition-colors ${activeTab === 'register'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                Register Employee
              </button>
              <button
                onClick={() => setActiveTab('workload')}
                className={`pb-3 px-1 font-['Arimo',sans-serif] text-[14px] border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'workload'
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
              >
                <BarChart3 size={16} />
                Workload Distribution
              </button>
            </div>
            
            {/* Action 4: Return Positions */}
            {activeTab === 'members' && (
              <Button
                className="rounded-lg text-white text-sm flex items-center gap-2 px-4"
                style={{ backgroundColor: '#10B981' }}
                onClick={() => setShowReturnConfirm(true)}
                disabled={isActing}
              >
                <RotateCcw size={16} />
                Return Unassigned Positions
              </Button>
            )}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'members' ? (
          <>
            {/* Members Tab */}
            {/* Search and Filter */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder="Search by name, email, or role..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-transparent text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="relative">
                <Button
                  variant="ghost"
                  className="rounded-lg text-gray-600 hover:bg-gray-50 gap-2"
                  onClick={() => setShowPositionDropdown(!showPositionDropdown)}
                >
                  <Filter size={18} />
                  {positionFilter === 'all' ? 'All Positions' : positionFilter}
                  <ChevronDown size={18} className="ml-2" />
                </Button>
                {showPositionDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 min-w-[200px]">
                    <button
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-t-lg"
                      onClick={() => {
                        setPositionFilter('all');
                        setShowPositionDropdown(false);
                      }}
                    >
                      All Positions
                    </button>
                    {uniquePositions.map(position => (
                      <button
                        key={position}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => {
                          setPositionFilter(position);
                          setShowPositionDropdown(false);
                        }}
                      >
                        {position}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="relative">
                <Button
                  variant="ghost"
                  className="rounded-lg text-gray-600 hover:bg-gray-50 gap-2"
                  onClick={() => setShowRoleDropdown(!showRoleDropdown)}
                >
                  <Filter size={18} />
                  {roleFilter === 'all' ? 'All Roles' : roleFilter}
                  <ChevronDown size={18} className="ml-2" />
                </Button>
                {showRoleDropdown && (
                  <div className="absolute right-0 top-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg z-10 min-w-[200px]">
                    <button
                      className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-t-lg"
                      onClick={() => {
                        setRoleFilter('all');
                        setShowRoleDropdown(false);
                      }}
                    >
                      All Roles
                    </button>
                    {uniqueRoles.map(role => (
                      <button
                        key={role}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                        onClick={() => {
                          setRoleFilter(role);
                          setShowRoleDropdown(false);
                        }}
                      >
                        {role}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <p className="text-gray-500 text-sm mb-4">Showing {filteredMembers.length} of {members.length} members</p>

            {/* Members Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="py-3 px-4 text-gray-600 text-sm text-left">Name</th>
                    <th className="py-3 px-4 text-gray-600 text-sm text-center">Role</th>
                    <th className="py-3 px-4 text-gray-600 text-sm text-center">Status</th>
                    <th className="py-3 px-4 text-gray-600 text-sm text-center">Position</th>
                    <th className="py-3 px-4 text-gray-600 text-sm text-center">Department</th>
                    <th className="py-3 px-4 text-gray-600 text-sm text-center">Join Date</th>
                    <th className="py-3 px-4 text-gray-600 text-sm text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4 flex justify-start">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: '#6366F1' }}>
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="text-left">
                            <p className="text-gray-900 text-sm">{member.name}</p>
                            <p className="text-gray-500 text-xs">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className="px-3 py-1 rounded-full text-xs text-white inline-block"
                          style={{
                            backgroundColor: member.role === 'Admin' ? '#EF4444' : member.role === 'Member' ? '#6366F1' : '#6B7280'
                          }}
                        >
                          {member.role}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`px-3 py-1 rounded-full text-xs inline-block ${member.status?.toLowerCase() === 'active'
                            ? 'bg-green-100 text-green-700'
                            : member.status?.toLowerCase() === 'suspended'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                            }`}
                        >
                          {member.status || 'Active'}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-900 text-sm text-center">{member.position}</td>
                      <td className="py-4 px-4 text-gray-900 text-sm text-center">{member.department}</td>
                      <td className="py-4 px-4 text-gray-500 text-sm text-center">{member.joinDate}</td>
                      <td className="py-4 px-4">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          {member.role?.toLowerCase() !== 'admin' ? (
                            <>
                              {/* Action 1: Delegate Positions */}
                              {(member.role?.toLowerCase() === 'hr' || member.role?.toLowerCase() === 'technical') && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="rounded-lg text-xs px-2 border-blue-200 hover:bg-blue-50 text-blue-600"
                                  title="Delegate positions to this recruiter"
                                  onClick={() => handleDelegatePositions(member)}
                                  disabled={isActing}
                                >
                                  <GitPullRequest size={14} />
                                </Button>
                              )}

                              {/* Action 2: Suspend/Activate */}
                              <Button
                                variant="outline"
                                size="sm"
                                className={`rounded-lg text-xs px-2 ${member.status?.toLowerCase() === 'suspended'
                                  ? 'border-green-200 hover:bg-green-50 text-green-600'
                                  : 'border-amber-200 hover:bg-amber-50 text-amber-600'}`}
                                title={member.status?.toLowerCase() === 'suspended' ? 'Activate member' : 'Suspend member & redistribute positions'}
                                onClick={() => handleToggleStatus(member)}
                                disabled={isActing}
                              >
                                {member.status?.toLowerCase() === 'suspended' ? <RotateCcw size={14} /> : <XCircle size={14} />}
                              </Button>

                              {/* Action 3: Delete */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-xs px-2 border-red-200 hover:bg-red-50 text-red-600"
                                title="Remove member permanently"
                                onClick={() => handleRemoveMember(member.id)}
                                disabled={isActing}
                              >
                                <Trash2 size={14} />
                              </Button>

                              {/* Edit Privileges */}
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-xs px-2"
                                onClick={() => handleEditPrivileges(member)}
                                disabled={isActing}
                              >
                                Edit
                              </Button>
                            </>
                          ) : (
                            <span className="text-xs text-gray-400 italic">System Protected</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : activeTab === 'register' ? (
          <>
            {/* Register Employee Tab Content */}
            <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
                <UserPlus className="w-5 h-5" style={{ color: '#6366F1' }} />
              </div>
              <div>
                <h4 className="text-gray-700">Employee Registration</h4>
                <p className="text-gray-500 text-sm">Add new employees to your organization</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employeeFirstName">First Name</Label>
                  <Input
                    id="employeeFirstName"
                    placeholder="John"
                    value={employeeFirstName}
                    onChange={(e) => setEmployeeFirstName(e.target.value)}
                    className="rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeLastName">Last Name</Label>
                  <Input
                    id="employeeLastName"
                    placeholder="Doe"
                    value={employeeLastName}
                    onChange={(e) => setEmployeeLastName(e.target.value)}
                    className="rounded-lg"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="employeeEmail">Email Address</Label>
                <Input
                  id="employeeEmail"
                  type="email"
                  placeholder="employee@example.com"
                  value={employeeEmail}
                  onChange={(e) => setEmployeeEmail(e.target.value)}
                  className="rounded-lg"
                />
              </div>


              <div className="space-y-2">
                <p className="text-gray-500 text-sm italic">
                  * A temporary password will be automatically generated for the new member.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="employeeTitle">Title</Label>
                <select
                  id="employeeTitle"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  value={employeeTitle}
                  onChange={(e) => setEmployeeTitle(e.target.value as 'technical' | 'hr')}
                >
                  <option value="hr">HR Member</option>
                  <option value="technical">Technical Recruiter</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <Button
                className="text-white rounded-full px-6"
                style={{ backgroundColor: '#6366F1' }}
                onClick={handleRegisterEmployee}
              >
                Register Employee
              </Button>
            </div>
            </div>
          </>
        ) : activeTab === 'workload' ? (
          <>
            {/* Workload Distribution Tab */}
            <RecruiterWorkloadChart />
          </>
        ) : null}
      </Card>
      </>
      )}

      {/* Edit Access Privileges Modal */}
      {
        showEditModal && selectedMember && (
          <EditAccessPrivilegesModal
            member={selectedMember}
            onClose={() => {
              setShowEditModal(false);
              setSelectedMember(null);
            }}
          />
        )
      }

      {/* Return Positions Confirmation Modal */}
      {showReturnConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <RotateCcw className="text-green-600 mt-1" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Return Unassigned Positions</h3>
                <p className="text-sm text-gray-600 mt-1">
                  This will fill any unassigned positions with available recruiters of matching roles.
                </p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-blue-900">
                ✓ Only active HR and Technical recruiters will be considered.<br/>
                ✓ Positions will be assigned round-robin for fair distribution.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-lg"
                onClick={() => setShowReturnConfirm(false)}
                disabled={isActing}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-lg text-white"
                style={{ backgroundColor: '#10B981' }}
                onClick={handleReturnPositions}
                disabled={isActing}
              >
                {isActing ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                Return Positions
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delegate Positions Modal */}
      {showDelegateModal && selectedMember && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <GitPullRequest className="text-blue-600 mt-1" size={24} />
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Delegate Positions</h3>
                <p className="text-sm text-gray-600 mt-1">
                  Assign open positions to <strong>{selectedMember.name}</strong>
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
              <p className="text-sm text-amber-900">
                Use the <strong>Recruiter Delegation</strong> view to select and assign specific positions.
              </p>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 rounded-lg"
                onClick={() => {
                  setShowDelegateModal(false);
                  setSelectedMember(null);
                }}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 rounded-lg text-white"
                style={{ backgroundColor: '#6366F1' }}
                onClick={() => {
                  setShowDelegateModal(false);
                  // In a real app, this would navigate to the delegation view
                  // For now, we just show that delegation is in the separate AdminRecruiterDelegation component
                  window.location.hash = '#/admin/delegation';
                }}
              >
                <GitPullRequest size={16} />
                Go to Delegation
              </Button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
}
