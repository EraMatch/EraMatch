import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Bell, Mail, Lock, User, Globe, Loader2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { adminService } from '../../services/admin.service';
import { authService } from '../../services/auth.service';

interface AdminSettingsProps {
  onSignOut: () => void;
}

export function AdminSettings({ onSignOut }: AdminSettingsProps) {
  const [isLoading, setIsLoading] = useState(true);

  // Profile state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');

  // Notification state
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [newMemberRequests, setNewMemberRequests] = useState(true);
  const [projectUpdates, setProjectUpdates] = useState(true);
  const [weeklySummary, setWeeklySummary] = useState(false);

  // Security state
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(true);

  // Organization state
  const [orgName, setOrgName] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [timezone, setTimezone] = useState('UTC-08:00 (Pacific Time)');

  // Change Password State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const data = await adminService.getSettings();

      // Profile
      setFirstName(data.first_name || '');
      setLastName(data.last_name || '');
      setEmail(data.email || '');
      setRole(data.role || 'Admin');

      // Organization
      setOrgName(data.organization_name || '');
      setOrgEmail(data.organization_email || '');
      setTimezone(data.timezone || 'UTC-08:00 (Pacific Time)');

      // Preferences (Notifications & Security)
      setEmailNotifications(data.email_notifications ?? true);
      setNewMemberRequests(data.new_member_requests ?? true);
      setProjectUpdates(data.project_updates ?? true);
      setWeeklySummary(data.weekly_summary ?? false);
      setTwoFactorAuth(data.two_factor_auth ?? false);
      setSessionTimeout(data.session_timeout ?? true);

    } catch (error) {
      console.error('Failed to load settings:', error);
      toast.error('Failed to load settings. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      await adminService.updateProfile({
        first_name: firstName,
        last_name: lastName,
        email
      });
      toast.success('Profile settings saved successfully!');
    } catch (error) {
      console.error('Failed to update profile:', error);
      toast.error('Failed to update profile.');
    }
  };

  const handleSaveOrganization = async () => {
    try {
      await adminService.updateOrganization({
        organization_name: orgName,
        admin_email: orgEmail,
        timezone
      });
      toast.success('Organization settings updated successfully!');
    } catch (error) {
      console.error('Failed to update organization:', error);
      toast.error('Failed to update organization.');
    }
  };

  const handleTogglePreference = async (key: string, value: boolean, setter: (val: boolean) => void) => {
    // Optimistic update
    setter(value);

    // In a real implementation with per-user prefs column, we'd send this to API
    // For now, we mock the persistence success or send to the generic updatePreferences endpoint
    try {
      await adminService.updatePreferences({ [key]: value });
      // Silet success for toggles
    } catch (error) {
      // Revert on failure
      setter(!value);
      toast.error('Failed to update preference.');
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error('Please fill in all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }

    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long.');
      return;
    }

    try {
      setIsChangingPassword(true);
      await authService.changePassword(oldPassword, newPassword, confirmPassword);
      toast.success('Password changed successfully! Please log in again.');
      setIsPasswordModalOpen(false);

      // Clear fields
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Optionally sign out
      // onSignOut(); 
    } catch (error: any) {
      console.error('Failed to change password:', error);
      toast.error(error.message || 'Failed to change password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#6366F1]" />
      </div>
    );
  }

  return (
    <div className="px-12 py-8">
      <div className="mb-8">
        <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">Settings</h1>
        <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Manage your account settings and preferences</p>
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
                value={role}
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
              <Switch
                checked={emailNotifications}
                onCheckedChange={(val) => handleTogglePreference('email_notifications', val, setEmailNotifications)}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">New Member Requests</p>
                <p className="text-gray-500 text-sm">Get notified when new members request to join</p>
              </div>
              <Switch
                checked={newMemberRequests}
                onCheckedChange={(val) => handleTogglePreference('new_member_requests', val, setNewMemberRequests)}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">Project Updates</p>
                <p className="text-gray-500 text-sm">Receive updates about project changes</p>
              </div>
              <Switch
                checked={projectUpdates}
                onCheckedChange={(val) => handleTogglePreference('project_updates', val, setProjectUpdates)}
              />
            </div>

            <div className="flex items-center justify-between py-3">
              <div>
                <p className="text-gray-700">Weekly Summary</p>
                <p className="text-gray-500 text-sm">Get a weekly summary of activities</p>
              </div>
              <Switch
                checked={weeklySummary}
                onCheckedChange={(val) => handleTogglePreference('weekly_summary', val, setWeeklySummary)}
              />
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
              <Switch
                checked={twoFactorAuth}
                onCheckedChange={(val) => handleTogglePreference('two_factor_auth', val, setTwoFactorAuth)}
              />
            </div>

            <div className="flex items-center justify-between py-3 border-b border-gray-100">
              <div>
                <p className="text-gray-700">Session Timeout</p>
                <p className="text-gray-500 text-sm">Auto-logout after 30 minutes of inactivity</p>
              </div>
              <Switch
                checked={sessionTimeout}
                onCheckedChange={(val) => handleTogglePreference('session_timeout', val, setSessionTimeout)}
              />
            </div>

            <div className="py-3">
              <Button
                variant="outline"
                className="rounded-full px-6"
                onClick={() => setIsPasswordModalOpen(true)}
              >
                Change Password
              </Button>
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
                style={{ outlineColor: '#6366F1' }}
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

      {/* Change Password Modal */}
      <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Update your password securely.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="oldPassword">Old Password</Label>
              <Input
                id="oldPassword"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter current password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Cancel</Button>
            <Button
              onClick={handleChangePassword}
              disabled={isChangingPassword}
              className="bg-[#6366F1] hover:bg-[#5558DD] text-white"
            >
              {isChangingPassword ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : 'Update Password'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}