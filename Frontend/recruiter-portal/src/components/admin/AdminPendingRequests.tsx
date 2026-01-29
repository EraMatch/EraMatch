import { useState, useEffect } from 'react';
import { Users, FileText, Briefcase, Search, Filter, Eye, ChevronDown, Check, X, Loader2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { CandidateProfileModal } from '../recruiter/CandidateProfileModal';
import { toast } from 'sonner';
import { api } from '../../services/api';

interface JoinRequest {
  id: number;
  name: string;
  email: string;
  appliedPosition: string;
  experience: string;
  skills: string[];
  requestDate: string;
}

interface AdminPendingRequestsProps {
  onSignOut: () => void;
  onBack: () => void;
}

export function AdminPendingRequests({ onSignOut, onBack }: AdminPendingRequestsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCandidate, setSelectedCandidate] = useState<JoinRequest | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showPositionDropdown, setShowPositionDropdown] = useState(false);
  const [showRoleDropdown, setShowRoleDropdown] = useState(false);
  const [pendingRequests, setPendingRequests] = useState<JoinRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch pending requests from API
  useEffect(() => {
    const fetchPendingRequests = async () => {
      try {
        setIsLoading(true);
        const data = await api.admin.getPendingRequests();
        // Map API data to component format
        const mappedRequests: JoinRequest[] = data.map((req: any) => ({
          id: req.id,
          name: req.requesterName,
          email: req.requesterEmail,
          appliedPosition: req.requestedRole,
          experience: req.message || 'No experience details provided',
          skills: [], // API doesn't provide skills, could be enhanced
          requestDate: req.requestedAt
        }));
        setPendingRequests(mappedRequests);
      } catch (error) {
        console.error('Failed to fetch pending requests:', error);
        toast.error('Failed to load pending requests');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPendingRequests();
  }, []);

  const handleViewProfile = (request: JoinRequest) => {
    setSelectedCandidate(request);
    setShowProfileModal(true);
  };

  const handleAcceptRequest = (requestId: number, candidateName: string) => {
    setPendingRequests(prev => prev.filter(req => req.id !== requestId));
    toast.success(`${candidateName}'s request accepted successfully!`);
  };

  const handleRejectRequest = (requestId: number, candidateName: string) => {
    setPendingRequests(prev => prev.filter(req => req.id !== requestId));
    toast.error(`${candidateName}'s request rejected`);
  };

  // Get unique positions
  const uniquePositions = Array.from(new Set(pendingRequests.map(r => r.appliedPosition)));

  const filteredRequests = pendingRequests.filter(request => {
    // Search filter
    const matchesSearch = request.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      request.email.toLowerCase().includes(searchTerm.toLowerCase());

    // Position filter
    const matchesPosition = positionFilter === 'all' || request.appliedPosition === positionFilter;

    // Role filter (in this case, role and position are the same)
    const matchesRole = roleFilter === 'all' || request.appliedPosition === roleFilter;

    return matchesSearch && matchesPosition && matchesRole;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="px-12 py-8">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-6 mb-12">
        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">7</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Total Members</div>
              <div className="text-gray-400 text-sm">active in organization</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">{pendingRequests.length}</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Pending Requests</div>
              <div className="text-gray-400 text-sm">awaiting approval</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-3xl px-8 py-9 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="text-5xl text-gray-900">12</span>
            <div className="flex-1">
              <div className="text-gray-900 mb-1">Open Roles</div>
              <div className="text-gray-400 text-sm">currently hiring</div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Join Requests Section */}
      <Card className="p-6 rounded-3xl shadow-sm">
        <div className="mb-6">
          <h3 className="text-gray-900 mb-2">Pending Join Requests</h3>
          <p className="text-gray-500 text-sm">Review applications from candidates seeking to join your organization</p>
        </div>

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
                {uniquePositions.map(role => (
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

        {/* Requests Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-gray-600 text-sm">Candidate</th>
                <th className="text-left py-3 px-4 text-gray-600 text-sm">Applied Position</th>
                <th className="text-left py-3 px-4 text-gray-600 text-sm">Experience</th>
                <th className="text-left py-3 px-4 text-gray-600 text-sm">Skills</th>
                <th className="text-left py-3 px-4 text-gray-600 text-sm">Request Date</th>
                <th className="text-left py-3 px-4 text-gray-600 text-sm">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredRequests.map((request) => (
                <tr key={request.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: '#6366F1' }}>
                        {request.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="text-gray-900 text-sm">{request.name}</p>
                        <p className="text-gray-500 text-xs">{request.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-4 px-4 text-gray-900 text-sm">{request.appliedPosition}</td>
                  <td className="py-4 px-4 text-gray-600 text-sm max-w-xs truncate">{request.experience}</td>
                  <td className="py-4 px-4">
                    <div className="flex flex-wrap gap-1">
                      {request.skills.slice(0, 2).map((skill, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 rounded-full text-xs"
                          style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}
                        >
                          {skill}
                        </span>
                      ))}
                      {request.skills.length > 2 && (
                        <span className="px-2 py-1 rounded-full text-xs text-gray-500">
                          +{request.skills.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-gray-500 text-sm">{request.requestDate}</td>
                  <td className="py-4 px-4">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-lg text-sm gap-2"
                        onClick={() => handleViewProfile(request)}
                      >
                        <Eye className="w-4 h-4" />
                        View
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-lg text-sm gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => handleAcceptRequest(request.id, request.name)}
                      >
                        <Check className="w-4 h-4" />
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-lg text-sm gap-2 bg-red-600 hover:bg-red-700 text-white"
                        onClick={() => handleRejectRequest(request.id, request.name)}
                      >
                        <X className="w-4 h-4" />
                        Reject
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Candidate Profile Modal */}
      {showProfileModal && selectedCandidate && (
        <CandidateProfileModal
          candidate={selectedCandidate}
          onClose={() => setShowProfileModal(false)}
        />
      )}
    </div>
  );
}