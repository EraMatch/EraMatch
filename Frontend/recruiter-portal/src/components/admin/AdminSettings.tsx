import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Bell, Mail, Lock, User, Palette, Globe } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface AdminSettingsProps {
  onSignOut: () => void;
}

export function AdminSettings({ onSignOut }: AdminSettingsProps) {
  // Profile state
  const [firstName, setFirstName] = useState('Admin');
  const [lastName, setLastName] = useState('User');
  const [email, setEmail] = useState('admin@eramatch.com');

  // Notification state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [newMemberRequests, setNewMemberRequests] = useState(true);
  const [projectUpdates, setProjectUpdates] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);

  // Security state
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(true);

  // Appearance state
  const [darkMode, setDarkMode] = useState(false);
  const [compactView, setCompactView] = useState(false);

  // Organization state
  const [orgName, setOrgName] = useState('ERAMATCH');
  const [orgEmail, setOrgEmail] = useState('contact@eramatch.com');
  const [timezone, setTimezone] = useState('UTC-08:00 (Pacific Time)');

  const handleSaveProfile = () => {
    toast.success('Profile settings saved successfully!');
  };

  const handleSaveOrganization = () => {
    toast.success('Organization settings updated successfully!');
  };

  return (
    <div className="px-12 py-8">
      <div className="mb-8">
        <h2 className="text-gray-700 mb-2">Settings</h2>
        <p className="text-gray-600 text-sm">Manage your account settings and preferences</p>
      </div>

      <div className="space-y-6">
        {/* Profile Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
              <User className="w-5 h-5" style={{ color: '#6366F1' }} />
            </div>
            <div>
              <h3 className="text-gray-700">Profile Settings</h3>
              <p className="text-gray-500 text-sm">Manage your personal information</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input 
                  id="firstName" 
                  placeholder="John" 
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="rounded-lg"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName">Last Name</Label>
                <Input 
                  id="lastName" 
                  placeholder="Doe" 
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="admin@example.com" 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <Input 
                id="role" 
                placeholder="Administrator" 
                defaultValue="System Administrator"
                disabled
                className="rounded-lg bg-gray-50"
              />
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <Button 
              className="text-white rounded-full px-6"
              style={{ backgroundColor: '#6366F1' }}
              onClick={handleSaveProfile}
            >
              Save Changes
            </Button>
          </div>
        </Card>

        {/* Notification Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
              <Bell className="w-5 h-5" style={{ color: '#6366F1' }} />
            </div>
            <div>
              <h3 className="text-gray-700">Notification Preferences</h3>
              <p className="text-gray-500 text-sm">Choose what notifications you receive</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">Email Notifications</p>
                <p className="text-gray-500 text-sm">Receive notifications via email</p>
              </div>
              <Switch checked={emailNotifications} onCheckedChange={setEmailNotifications} />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">New Member Requests</p>
                <p className="text-gray-500 text-sm">Get notified when new members request to join</p>
              </div>
              <Switch checked={newMemberRequests} onCheckedChange={setNewMemberRequests} />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">Project Updates</p>
                <p className="text-gray-500 text-sm">Receive updates about project changes</p>
              </div>
              <Switch checked={projectUpdates} onCheckedChange={setProjectUpdates} />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-gray-700">Weekly Summary</p>
                <p className="text-gray-500 text-sm">Get a weekly summary of activities</p>
              </div>
              <Switch checked={weeklySummary} onCheckedChange={setWeeklySummary} />
            </div>
          </div>
        </Card>

        {/* Security Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
              <Lock className="w-5 h-5" style={{ color: '#6366F1' }} />
            </div>
            <div>
              <h3 className="text-gray-700">Security Settings</h3>
              <p className="text-gray-500 text-sm">Manage your security preferences</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">Two-Factor Authentication</p>
                <p className="text-gray-500 text-sm">Add an extra layer of security</p>
              </div>
              <Switch checked={twoFactorAuth} onCheckedChange={setTwoFactorAuth} />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">Session Timeout</p>
                <p className="text-gray-500 text-sm">Auto-logout after 30 minutes of inactivity</p>
              </div>
              <Switch checked={sessionTimeout} onCheckedChange={setSessionTimeout} />
            </div>

            <div className="py-3">
              <Button 
                variant="outline"
                className="rounded-full px-6"
                onClick={() => toast.info('Password change functionality coming soon!')}
              >
                Change Password
              </Button>
            </div>
          </div>
        </Card>

        {/* Appearance Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
              <Palette className="w-5 h-5" style={{ color: '#6366F1' }} />
            </div>
            <div>
              <h3 className="text-gray-700">Appearance</h3>
              <p className="text-gray-500 text-sm">Customize the look and feel</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">Dark Mode</p>
                <p className="text-gray-500 text-sm">Use dark theme</p>
              </div>
              <Switch checked={darkMode} onCheckedChange={setDarkMode} />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-gray-700">Compact View</p>
                <p className="text-gray-500 text-sm">Show more content on screen</p>
              </div>
              <Switch checked={compactView} onCheckedChange={setCompactView} />
            </div>
          </div>
        </Card>

        {/* Organization Settings */}
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#EEF2FF' }}>
              <Globe className="w-5 h-5" style={{ color: '#6366F1' }} />
            </div>
            <div>
              <h3 className="text-gray-700">Organization Settings</h3>
              <p className="text-gray-500 text-sm">Manage organization-wide settings</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input 
                id="orgName" 
                placeholder="Organization Name" 
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="orgEmail">Organization Email</Label>
              <Input 
                id="orgEmail" 
                type="email" 
                placeholder="contact@organization.com" 
                value={orgEmail}
                onChange={(e) => setOrgEmail(e.target.value)}
                className="rounded-lg"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <select 
                id="timezone"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2"
                style={{ focusRingColor: '#6366F1' }}
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              >
                <option>UTC-08:00 (Pacific Time)</option>
                <option>UTC-05:00 (Eastern Time)</option>
                <option>UTC+00:00 (GMT)</option>
                <option>UTC+01:00 (Central European Time)</option>
                <option>UTC+08:00 (Singapore Time)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <Button 
              className="text-white rounded-full px-6"
              style={{ backgroundColor: '#6366F1' }}
              onClick={handleSaveOrganization}
            >
              Update Organization
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}