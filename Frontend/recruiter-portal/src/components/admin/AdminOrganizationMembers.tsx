import { useState, useEffect } from 'react';
import { Users, FileText, Briefcase, Search, Filter, ChevronDown, UserPlus, Loader2, Trash2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { EditAccessPrivilegesModal } from '../recruiter/groups/EditAccessPrivilegesModal';
// import { EditAccessPrivilegesModal } from '../../';

import { toast } from 'sonner';
import { api, Member } from '../../services/api';
import EraMatchLogo from '../../assets/image-eramatch.png';
import LoadingSpinner from '../common/LoadingSpinner';

interface AdminOrganizationMembersProps {
  onSignOut: () => void;
}

type TabType = 'members' | 'register';

export function AdminOrganizationMembers({ onSignOut }: AdminOrganizationMembersProps) {
  const [activeTab, setActiveTab] = useState<TabType>('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showPositionDropdown, setShowPositionDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);

  // Employee Registration state
  const [employeeEmail, setEmployeeEmail] = useState('');
  const [employeeTitle, setEmployeeTitle] = useState<'technical' | 'hr'>('hr');
  const [employeeFirstName, setEmployeeFirstName] = useState('');
  const [employeeLastName, setEmployeeLastName] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);

  const [recruitersCount, setRecruitersCount] = useState(0);
  const [totalActiveCount, setTotalActiveCount] = useState(0);
  const [adminsCount, setAdminsCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [membersData, statsData] = await Promise.all([
          api.admin.getMembers(),
          api.admin.getMemberStats()
        ]);
        setMembers(membersData);
        setRecruitersCount(statsData.recruitersCount || 0);
        setTotalActiveCount(statsData.totalActive || 0);
        setAdminsCount(statsData.adminsCount || 0);
      } catch (error) {
        toast.error('Failed to load organization data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);



  const handleEditPrivileges = (member: Member) => {
    setSelectedMember(member);
    setShowEditModal(true);
  };

  const handleRemoveMember = async (userId: string) => {
    if (!window.confirm('Are you sure you want to remove this member? This action cannot be undone.')) {
      return;
    }

    try {
      await api.admin.removeMember(userId);
      toast.success('Member removed successfully');
      // Refresh members list
      const updatedMembers = await api.admin.getMembers();
      setMembers(updatedMembers);
    } catch (error) {
      toast.error('Failed to remove member');
    }
  };

  const handleToggleStatus = async (member: Member) => {
    const isSuspended = member.status?.toLowerCase() === 'suspended';
    const newStatus = isSuspended ? 'active' : 'suspended';

    if (!window.confirm(`Are you sure you want to ${isSuspended ? 'open' : 'suspend'} this member?`)) {
      return;
    }

    try {
      await api.admin.updateUserStatus(member.id, newStatus);
      toast.success(`Member ${isSuspended ? 'opened' : 'suspended'} successfully`);

      // Refresh members list and stats
      const [updatedMembers, updatedStats] = await Promise.all([
        api.admin.getMembers(),
        api.admin.getMemberStats()
      ]);

      setMembers(updatedMembers);

      if (updatedStats) {
        setRecruitersCount(updatedStats.recruitersCount || 0);
        setTotalActiveCount(updatedStats.totalActive || 0);
        // Admins count likely hasn't changed but good to refresh
        setAdminsCount(updatedStats.adminsCount || 0);
      }
    } catch (error: any) {
      toast.error(error?.detail || `Failed to ${isSuspended ? 'activate' : 'suspend'} member`);
    }
  };

  const handleRegisterEmployee = async () => {
    if (!employeeEmail || !employeeFirstName || !employeeLastName) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setIsLoading(true);
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

      // Refresh members list and switch back to list view
      const updatedMembers = await api.admin.getMembers();
      setMembers(updatedMembers);
      setActiveTab('members');

    } catch (error) {
      toast.error('Failed to register employee');
    } finally {
      setIsLoading(false);
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
        <img src={EraMatchLogo} alt="Era Match" className="h-[72px] w-auto object-contain mt-1 mr-6" />
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
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'members' ? (
          <>
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
                        <div className="flex items-center justify-center gap-2">
                          {member.role?.toLowerCase() !== 'admin' ? (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-sm"
                                onClick={() => handleEditPrivileges(member)}
                              >
                                Edit Privileges
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className={`rounded-lg text-sm ${member.status?.toLowerCase() === 'suspended'
                                  ? 'border-green-200 hover:bg-green-50 text-green-600'
                                  : 'border-amber-200 hover:bg-amber-50 text-amber-600'}`}
                                onClick={() => handleToggleStatus(member)}
                              >
                                {member.status?.toLowerCase() === 'suspended' ? 'Open' : 'Suspend'}
                              </Button>

                              <Button
                                variant="outline"
                                size="sm"
                                className="rounded-lg text-sm border-red-200 hover:bg-red-50 text-red-600 hover:text-red-700"
                                onClick={() => handleRemoveMember(member.id)}
                              >
                                <Trash2 size={16} />
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
        ) : (
          /* Register Employee Tab Content */
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
        )}
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
    </div >
  );
}
