import { useState, useEffect } from 'react';
import { Users, FileText, Briefcase, Search, Filter, ChevronDown, UserPlus, Loader2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { EditAccessPrivilegesModal } from '../recruiter/EditAccessPrivilegesModal';
import { toast } from 'sonner';
import { api, Member } from '../../services/api';

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
  const [employeePassword, setEmployeePassword] = useState('');
  const [employeeTitle, setEmployeeTitle] = useState<'Technical Recruiter' | 'HR Member'>('HR Member');
  const [employeeFirstName, setEmployeeFirstName] = useState('');
  const [employeeLastName, setEmployeeLastName] = useState('');

  const [isLoading, setIsLoading] = useState(true);
  const [members, setMembers] = useState<Member[]>([]);

  const [openRolesCount, setOpenRolesCount] = useState(0);
  const [activeRecruitersCount, setActiveRecruitersCount] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        const [membersData, statsData] = await Promise.all([
          api.admin.getMembers(),
          api.admin.getDashboardStats()
        ]);
        setMembers(membersData);
        // Calculate open roles from jobPositions if available, or use a default/mock
        if (statsData.jobPositions) {
          setOpenRolesCount(statsData.jobPositions.filter((p: any) => p.status === 'Open').length);
        } else {
          setOpenRolesCount(0);
        }
        if (statsData.activeRecruiters) {
          setActiveRecruitersCount(statsData.activeRecruiters);
        }
      } catch (error) {
        toast.error('Failed to load organization data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  const handleEditPrivileges = (member: Member) => {
    setSelectedMember(member);
    setShowEditModal(true);
  };

  const handleRegisterEmployee = async () => {
    if (!employeeEmail || !employeePassword || !employeeFirstName || !employeeLastName) {
      toast.error('Please fill in all employee fields');
      return;
    }

    try {
      await api.admin.registerEmployee({
        email: employeeEmail,
        password: employeePassword,
        firstName: employeeFirstName,
        lastName: employeeLastName,
        title: employeeTitle
      });
      toast.success(`Employee registered successfully as ${employeeTitle}!`);

      // Reset form
      setEmployeeEmail('');
      setEmployeePassword('');
      setEmployeeFirstName('');
      setEmployeeLastName('');
      setEmployeeTitle('HR Member');

      // Refresh members list
      const updatedMembers = await api.admin.getMembers();
      setMembers(updatedMembers);

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
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{members.length}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Total Members</div>
              <div className="text-gray-400 text-sm">active in organization</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{openRolesCount}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Open Roles</div>
              <div className="text-gray-400 text-sm">currently hiring</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{activeRecruitersCount}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Active Recruiters</div>
              <div className="text-gray-400 text-sm">hiring active</div>
            </div>
          </div>
        </div>
      </div>

      {/* Organization Members Section with Tabs */}
      <Card className="p-6 rounded-3xl shadow-sm">
        <div className="mb-6">
          <h3 className="text-gray-900 mb-2">Organization Members</h3>
          <p className="text-gray-500 text-sm">Manage all members in your organization and their access privileges</p>
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
                    <th className="text-left py-3 px-4 text-gray-600 text-sm">Name</th>
                    <th className="text-left py-3 px-4 text-gray-600 text-sm">Role</th>
                    <th className="text-left py-3 px-4 text-gray-600 text-sm">Position</th>
                    <th className="text-left py-3 px-4 text-gray-600 text-sm">Department</th>
                    <th className="text-left py-3 px-4 text-gray-600 text-sm">Join Date</th>
                    <th className="text-left py-3 px-4 text-gray-600 text-sm">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.map((member) => (
                    <tr key={member.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: '#6366F1' }}>
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <p className="text-gray-900 text-sm">{member.name}</p>
                            <p className="text-gray-500 text-xs">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4">
                        <span
                          className="px-3 py-1 rounded-full text-xs text-white inline-block"
                          style={{
                            backgroundColor: member.role === 'Admin' ? '#EF4444' : member.role === 'Member' ? '#6366F1' : '#6B7280'
                          }}
                        >
                          {member.role}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-gray-900 text-sm">{member.position}</td>
                      <td className="py-4 px-4 text-gray-900 text-sm">{member.department}</td>
                      <td className="py-4 px-4 text-gray-500 text-sm">{member.joinDate}</td>
                      <td className="py-4 px-4">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-lg text-sm"
                          onClick={() => handleEditPrivileges(member)}
                        >
                          Edit Privileges
                        </Button>
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
                <Label htmlFor="employeePassword">Password</Label>
                <Input
                  id="employeePassword"
                  type="password"
                  placeholder="Password"
                  value={employeePassword}
                  onChange={(e) => setEmployeePassword(e.target.value)}
                  className="rounded-lg"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="employeeTitle">Title</Label>
                <select
                  id="employeeTitle"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                  value={employeeTitle}
                  onChange={(e) => setEmployeeTitle(e.target.value as 'Technical Recruiter' | 'HR Member')}
                >
                  <option>HR Member</option>
                  <option>Technical Recruiter</option>
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

      {/* Edit Access Privileges Modal */}
      {showEditModal && selectedMember && (
        <EditAccessPrivilegesModal
          member={selectedMember}
          onClose={() => {
            setShowEditModal(false);
            setSelectedMember(null);
          }}
        />
      )}
    </div>
  );
}
