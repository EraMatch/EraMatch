import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../ui/dialog';
import { Bell, Mail, Lock, User, Globe, Loader2, Check, CreditCard, Calendar, Users, Zap, ArrowRight } from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { adminService } from '../../services/admin.service';
import { authService } from '../../services/auth.service';
import EraMatchLogo from '../../assets/image-eramatch.png';
import LoadingSpinner from '../common/LoadingSpinner';

interface AdminSettingsProps {
  onSignOut: () => void;
}

export function AdminSettings({ onSignOut }: AdminSettingsProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'organization' | 'notifications' | 'security' | 'subscription' | 'workflow'>('profile');
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

  // Workflow state
  const [bypassAdminApproval, setBypassAdminApproval] = useState(false);

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

  // Subscription state
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isCardUpdateModalOpen, setIsCardUpdateModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<any>(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<any>(null);
  const [usage, setUsage] = useState<any>(null);
  const [availablePlans, setAvailablePlans] = useState<any[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<{ brand: string; last4: string; expiry: string } | null>(null);

  // Card update form state
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCVC, setCardCVC] = useState('');
  const [cardName, setCardName] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const [settingsData, subscriptionData, paymentData] = await Promise.all([
        adminService.getSettings(),
        adminService.getSubscriptionPlans().catch(() => null),
        adminService.getPaymentMethod().catch(() => null)
      ]);

      // Profile
      setFirstName(settingsData.first_name || '');
      setLastName(settingsData.last_name || '');
      setEmail(settingsData.email || '');
      setRole(settingsData.role || 'Admin');

      // Organization
      setOrgName(settingsData.organization_name || '');
      setOrgEmail(settingsData.organization_email || '');
      setTimezone(settingsData.timezone || 'UTC-08:00 (Pacific Time)');

      // Preferences (Notifications & Security)
      setEmailNotifications(settingsData.email_notifications ?? true);
      setNewMemberRequests(settingsData.new_member_requests ?? true);
      setProjectUpdates(settingsData.project_updates ?? true);
      setWeeklySummary(settingsData.weekly_summary ?? false);
      setTwoFactorAuth(settingsData.two_factor_auth ?? false);
      setSessionTimeout(settingsData.session_timeout ?? true);

      // Preferences (Workflow)
      setBypassAdminApproval(settingsData.bypass_admin_approval ?? false);

      // Subscription
      if (subscriptionData) {
        setCurrentPlan((subscriptionData as any).currentPlan);
        setUsage((subscriptionData as any).usage);
        setAvailablePlans((subscriptionData as any).availablePlans);
      }
      setPaymentMethod(paymentData);

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
      toast.error('Please fill in all fields.'); return;
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match.'); return;
    }
    if (newPassword.length < 8) {
      toast.error('Password must be at least 8 characters long.'); return;
    }
    try {
      setIsChangingPassword(true);
      await authService.changePassword(oldPassword, newPassword, confirmPassword);
      toast.success('Password changed successfully! Please log in again.');
      setIsPasswordModalOpen(false);
      setOldPassword(''); setNewPassword(''); setConfirmPassword('');
    } catch (error: any) {
      console.error('Failed to change password:', error);
      toast.error(error.message || 'Failed to change password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const ChangePasswordModal = () => (
    <Dialog open={isPasswordModalOpen} onOpenChange={setIsPasswordModalOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>Update your password securely.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="oldPassword">Old Password</Label>
            <Input id="oldPassword" type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} placeholder="Current password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <Input id="newPassword" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm Password</Label>
            <Input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsPasswordModalOpen(false)}>Cancel</Button>
          <Button onClick={handleChangePassword} disabled={isChangingPassword} className="bg-[#6366F1] hover:bg-[#5558DD] text-white">
            {isChangingPassword ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Updating...</> : 'Update Password'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const handleUpgradeConfirm = async () => {
    if (selectedPlan) {
      try {
        setIsActionLoading(true);
        await adminService.upgradeSubscription(selectedPlan.id);
        toast.success(`Upgraded to ${selectedPlan.name} plan`);
        setIsUpgradeModalOpen(false);
        await loadSettings();
      } catch (error) {
        console.error('Failed to upgrade plan:', error);
        toast.error('Failed to upgrade plan.');
      } finally {
        setIsActionLoading(false);
      }
    }
  };

  const handleCardUpdateConfirm = async () => {
    if (!cardNumber || !cardExpiry || !cardCVC || !cardName) {
      toast.error('Please fill in all card details');
      return;
    }
    try {
      setIsActionLoading(true);
      const last4 = cardNumber.slice(-4);
      const brand = cardNumber.startsWith('4') ? 'Visa' : 'Mastercard';
      await adminService.addPaymentMethod({
        brand, last4, expiry: cardExpiry,
        cardNumber, cvc: cardCVC, cardName
      });
      toast.success('Payment method updated successfully');
      setIsCardUpdateModalOpen(false);
      setCardNumber(''); setCardExpiry(''); setCardCVC(''); setCardName('');
      await loadSettings();
    } catch (error) {
      console.error('Failed to update payment method:', error);
      toast.error('Failed to update payment method.');
    } finally {
      setIsActionLoading(false);
    }
  };



  const TabButton = ({ id, label, icon: Icon }: { id: typeof activeTab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === id
        ? 'bg-indigo-50 text-indigo-600 font-medium'
        : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
        }`}
    >
      <Icon size={20} />
      <span>{label}</span>
    </button>
  );

  return (
    <div className="px-12 py-8">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">Settings</h1>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">Manage your account, organization, and subscription</p>
        </div>
        <img src={EraMatchLogo} alt="Era Match" className="h-[72px] w-auto object-contain mt-1 mr-6" />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner message="Loading settings..." fullScreen={false} />
        </div>
      ) : (
      <div className="grid grid-cols-[240px,1fr] gap-10">
        {/* Tabs Sidebar */}
        <div className="flex flex-col gap-2">
          <TabButton id="profile" label="Profile" icon={User} />
          <TabButton id="organization" label="Organization" icon={Globe} />
          <TabButton id="notifications" label="Notifications" icon={Bell} />
          <TabButton id="security" label="Security" icon={Lock} />
          <TabButton id="workflow" label="Workflow" icon={Zap} />
          <TabButton id="subscription" label="Subscription" icon={CreditCard} />
        </div>

        {/* Tab Content */}
        <div className="space-y-6">
          {activeTab === 'profile' && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                  <User className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-gray-700 font-medium">Profile Settings</h3>
                  <p className="text-gray-500 text-sm">Manage your personal information</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="firstName">First Name</Label>
                    <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="rounded-lg" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} className="rounded-lg" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Input id="role" value={role} disabled className="rounded-lg bg-gray-50" />
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <Button className="bg-[#6366F1] hover:bg-[#5558DD] text-white rounded-full px-6" onClick={handleSaveProfile}>
                  Save Changes
                </Button>
              </div>
            </Card>
          )}

          {activeTab === 'organization' && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                  <Globe className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-gray-700 font-medium">Organization Settings</h3>
                  <p className="text-gray-500 text-sm">Manage organization-wide settings</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Organization Name</Label>
                  <Input id="orgName" value={orgName} onChange={(e) => setOrgName(e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgEmail">Organization Email</Label>
                  <Input id="orgEmail" type="email" value={orgEmail} onChange={(e) => setOrgEmail(e.target.value)} className="rounded-lg" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="timezone">Timezone</Label>
                  <select id="timezone" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                    <option>UTC-08:00 (Pacific Time)</option>
                    <option>UTC-05:00 (Eastern Time)</option>
                    <option>UTC+00:00 (GMT)</option>
                    <option>UTC+01:00 (Central European Time)</option>
                    <option>UTC+08:00 (Singapore Time)</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end mt-6">
                <Button className="bg-[#6366F1] hover:bg-[#5558DD] text-white rounded-full px-6" onClick={handleSaveOrganization}>
                  Update Organization
                </Button>
              </div>
            </Card>
          )}

          {activeTab === 'notifications' && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                  <Bell className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-gray-700 font-medium">Notification Preferences</h3>
                  <p className="text-gray-500 text-sm">Choose what notifications you receive</p>
                </div>
              </div>
              <div className="space-y-1">
                {[
                  { id: 'email_notifications', label: 'Email Notifications', desc: 'Receive notifications via email', val: emailNotifications, set: setEmailNotifications },
                  { id: 'new_member_requests', label: 'New Member Requests', desc: 'Get notified for join requests', val: newMemberRequests, set: setNewMemberRequests },
                  { id: 'project_updates', label: 'Project Updates', desc: 'Alerts for project changes', val: projectUpdates, set: setProjectUpdates },
                  { id: 'weekly_summary', label: 'Weekly Summary', desc: 'Summary of activities', val: weeklySummary, set: setWeeklySummary }
                ].map((item, idx, arr) => (
                  <div key={item.id} className={`flex items-center justify-between py-4 ${idx !== arr.length - 1 ? 'border-b border-gray-100' : ''}`}>
                    <div>
                      <p className="text-gray-700 font-medium">{item.label}</p>
                      <p className="text-gray-500 text-sm">{item.desc}</p>
                    </div>
                    <Switch checked={item.val} onCheckedChange={(val) => handleTogglePreference(item.id, val, item.set)} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {activeTab === 'security' && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                  <Lock className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-gray-700 font-medium">Security Settings</h3>
                  <p className="text-gray-500 text-sm">Manage your security preferences</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <p className="text-gray-700 font-medium">Two-Factor Authentication</p>
                    <p className="text-gray-500 text-sm">Add an extra layer of security</p>
                  </div>
                  <Switch checked={twoFactorAuth} onCheckedChange={(val) => handleTogglePreference('two_factor_auth', val, setTwoFactorAuth)} />
                </div>
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <p className="text-gray-700 font-medium">Session Timeout</p>
                    <p className="text-gray-500 text-sm">Auto-logout after 30 minutes of inactivity</p>
                  </div>
                  <Switch checked={sessionTimeout} onCheckedChange={(val) => handleTogglePreference('session_timeout', val, setSessionTimeout)} />
                </div>
                <div className="pt-2">
                  <Button variant="outline" className="rounded-full px-6 border-indigo-200 text-indigo-600 hover:bg-indigo-50" onClick={() => setIsPasswordModalOpen(true)}>
                    Change Password
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'workflow' && (
            <Card className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-indigo-50">
                  <Zap className="w-5 h-5 text-indigo-600" />
                </div>
                <div>
                  <h3 className="text-gray-700 font-medium">Workflow Settings</h3>
                  <p className="text-gray-500 text-sm">Manage approval workflows and automation</p>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between py-3 border-b border-gray-100">
                  <div>
                    <p className="text-gray-700 font-medium">Bypass Admin Approval</p>
                    <p className="text-gray-500 text-sm">HR requests go directly to Technical Review</p>
                  </div>
                  <Switch checked={bypassAdminApproval} onCheckedChange={(val) => handleTogglePreference('bypass_admin_approval', val, setBypassAdminApproval)} />
                </div>
              </div>
            </Card>
          )}

          {activeTab === 'subscription' && currentPlan && usage && (
            <div className="space-y-6">
              <Card className="p-6">
                <div className="flex items-start justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <h3 className="text-gray-700 font-medium">Current Plan: <span className="text-indigo-600">{currentPlan.name}</span></h3>
                      <p className="text-gray-500 text-sm">Active and in good standing</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">${currentPlan.price}</div>
                    <div className="text-gray-500 text-xs">per {currentPlan.billingCycle.toLowerCase()}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-6 border-t border-gray-100">
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <Users size={18} className="text-indigo-500" />
                    <div>
                      <div className="text-xs text-gray-500">Positions</div>
                      <div className="text-sm font-semibold">{usage.activePositions}/{usage.maxPositions}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <Calendar size={18} className="text-amber-500" />
                    <div>
                      <div className="text-xs text-gray-500">Next Billing</div>
                      <div className="text-sm font-semibold">{currentPlan.nextBillingDate}</div>
                    </div>
                  </div>
                </div>
              </Card>

              <div className="grid grid-cols-2 gap-6">
                {availablePlans.map((plan: any) => {
                  const isActive = plan.name === currentPlan.name;
                  return (
                    <Card
                      key={plan.id}
                      className={`relative overflow-hidden transition-all duration-300 border-2 ${isActive
                        ? 'border-indigo-500 shadow-xl shadow-indigo-100'
                        : 'border-gray-100 hover:border-indigo-200 hover:shadow-lg'
                        }`}
                    >
                      {isActive && (
                        <div className="absolute top-0 right-0">
                          <div className="bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
                            Current Plan
                          </div>
                        </div>
                      )}

                      <div className={`p-6 ${isActive ? 'bg-indigo-50/30' : 'bg-white'}`}>
                        <div className="mb-6">
                          <h4 className="text-xl font-bold text-gray-900 mb-1">{plan.name}</h4>
                          <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold text-indigo-600">${plan.price}</span>
                            <span className="text-gray-400 text-sm">/ {currentPlan.billingCycle.toLowerCase()}</span>
                          </div>
                        </div>

                        <ul className="space-y-3 mb-8">
                          {plan.features.map((f: string, i: number) => (
                            <li key={i} className="flex items-start gap-3 text-sm text-gray-600">
                              <div className="mt-0.5 w-5 h-5 rounded-full bg-indigo-50 flex items-center justify-center flex-shrink-0">
                                <Check size={12} className="text-indigo-600" />
                              </div>
                              <span>{f}</span>
                            </li>
                          ))}
                        </ul>

                        <Button
                          disabled={isActive}
                          onClick={() => { setSelectedPlan(plan); setIsUpgradeModalOpen(true); }}
                          className={`w-full py-6 rounded-xl font-semibold transition-all ${isActive
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed border-none'
                            : 'bg-[#6366F1] hover:bg-[#5558DD] text-white shadow-lg shadow-indigo-200 hover:shadow-indigo-300'
                            }`}
                        >
                          {isActive ? 'Current Plan' : 'Upgrade Now'}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>

              <Card className="p-6">
                <h3 className="text-gray-700 font-medium mb-4">Payment Method</h3>
                {paymentMethod ? (
                  <div className="flex items-center justify-between p-4 border border-gray-100 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-gray-50 rounded-lg flex items-center justify-center">
                        <CreditCard size={20} className="text-gray-600" />
                      </div>
                      <div>
                        <div className="text-sm font-medium">{paymentMethod.brand} •••• {paymentMethod.last4}</div>
                        <div className="text-xs text-gray-500">Expires {paymentMethod.expiry}</div>
                      </div>
                    </div>
                    <Button variant="ghost" className="text-indigo-600 hover:bg-indigo-50 text-sm" onClick={() => setIsCardUpdateModalOpen(true)}>Update</Button>
                  </div>
                ) : (
                  <Button className="w-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border-none" onClick={() => setIsCardUpdateModalOpen(true)}>Add Payment Method</Button>
                )}
              </Card>
            </div>
          )}
        </div>
      </div>
      )}

      <ChangePasswordModal />

      {/* Upgrade Modal */}
      <Dialog open={isUpgradeModalOpen} onOpenChange={setIsUpgradeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Plan Change</DialogTitle>
            <DialogDescription>Are you sure you want to switch to the {selectedPlan?.name} plan?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsUpgradeModalOpen(false)}>Cancel</Button>
            <Button onClick={handleUpgradeConfirm} disabled={isActionLoading} className="bg-indigo-600 text-white">
              {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirm Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Card Update Modal */}
      <Dialog open={isCardUpdateModalOpen} onOpenChange={setIsCardUpdateModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Update Payment Method</DialogTitle>
            <DialogDescription>Securely update your card details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <Input placeholder="Card Number" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} />
            <div className="flex gap-4">
              <Input placeholder="MM/YY" value={cardExpiry} onChange={(e) => setCardExpiry(e.target.value)} />
              <Input placeholder="CVC" value={cardCVC} onChange={(e) => setCardCVC(e.target.value)} />
            </div>
            <Input placeholder="Cardholder Name" value={cardName} onChange={(e) => setCardName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCardUpdateModalOpen(false)}>Cancel</Button>
            <Button onClick={handleCardUpdateConfirm} disabled={isActionLoading} className="bg-indigo-600 text-white">
              {isActionLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}