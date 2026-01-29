import { useState } from 'react';
import { X } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';

interface Member {
  id: number;
  name: string;
  email: string;
  role: string;
  position: string;
  department: string;
  joinDate: string;
}

interface EditAccessPrivilegesModalProps {
  member: Member;
  onClose: () => void;
}

// Permission definitions
type Permission = 'managePositions' | 'assignRecruiters' | 'manageCandidates' | 'viewAnalytics' | 'exportData';

interface PermissionItem {
  id: Permission;
  name: string;
  description: string;
}

const permissionItems: PermissionItem[] = [
  {
    id: 'managePositions',
    name: 'Manage Positions',
    description: 'Create, edit, and delete job positions'
  },
  {
    id: 'assignRecruiters',
    name: 'Assign HR / Technical Recruiters',
    description: 'Assign recruiters to positions and manage recruitment teams'
  },
  {
    id: 'manageCandidates',
    name: 'Manage Candidates',
    description: 'Add, edit, remove candidates and update their status'
  },
  {
    id: 'viewAnalytics',
    name: 'View Analytics',
    description: 'Access recruitment analytics and reporting dashboards'
  },
  {
    id: 'exportData',
    name: 'Export Data',
    description: 'Export candidate data, reports, and other information'
  }
];

export function EditAccessPrivilegesModal({ member, onClose }: EditAccessPrivilegesModalProps) {
  const [permissions, setPermissions] = useState<Record<Permission, boolean>>({
    managePositions: true,
    assignRecruiters: false,
    manageCandidates: true,
    viewAnalytics: true,
    exportData: false
  });

  const handleToggle = (permission: Permission) => {
    setPermissions(prev => ({
      ...prev,
      [permission]: !prev[permission]
    }));
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <Card className="max-w-lg w-full p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-gray-900">Edit Access Privileges</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Member Info */}
        <div className="mb-6">
          <p className="text-gray-600 text-sm mb-4">Set below what this member can do in the system</p>
          <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: '#F9FAFB' }}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: '#6366F1' }}>
              {member.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div>
              <p className="text-gray-900">{member.name}</p>
              <p className="text-gray-500 text-sm">{member.email}</p>
            </div>
          </div>
        </div>

        {/* Access Permissions */}
        <div className="mb-6">
          <h4 className="text-gray-900 mb-4">Access Permissions</h4>
          <div className="space-y-4">
            {permissionItems.map((item) => (
              <div key={item.id} className="flex items-start justify-between p-4 rounded-lg border border-gray-200">
                <div className="flex-1 pr-4">
                  <p className="text-gray-900 mb-1">{item.name}</p>
                  <p className="text-gray-500 text-sm">{item.description}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={permissions[item.id]}
                    onChange={() => handleToggle(item.id)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Button
            variant="outline"
            className="rounded-full px-6"
            onClick={onClose}
          >
            Cancel
          </Button>
          <Button
            className="rounded-full px-6 text-white"
            style={{ backgroundColor: '#6366F1' }}
            onClick={() => {
              // Save changes logic here
              console.log('Saving permissions for', member.name, ':', permissions);
              onClose();
            }}
          >
            Save Changes
          </Button>
        </div>
      </Card>
    </div>
  );
}