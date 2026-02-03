import { Card } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Switch } from '../../ui/switch';
import { Bell, Lock, User } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

interface RecruiterSettingsProps {
}

export function RecruiterSettings({ }: RecruiterSettingsProps) {
    // Profile state
    const [firstName, setFirstName] = useState('Recruiter');
    const [lastName, setLastName] = useState('User');
    const [email, setEmail] = useState('recruiter@eramatch.com');

    // Notification state
    const [emailNotifications, setEmailNotifications] = useState(true);
    const [newMemberRequests, setNewMemberRequests] = useState(true);
    const [projectUpdates, setProjectUpdates] = useState(true);
    const [weeklySummary, setWeeklySummary] = useState(false);

    // Security state
    const [twoFactorAuth, setTwoFactorAuth] = useState(false);
    const [sessionTimeout, setSessionTimeout] = useState(true);



    const handleSaveProfile = () => {
        toast.success('Profile settings saved successfully!');
    };

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
                                placeholder="recruiter@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="rounded-lg"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="role">Role</Label>
                            <Input
                                id="role"
                                placeholder="Recruiter"
                                defaultValue="Senior Technical Recruiter"
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
                                <p className="text-gray-700">New Candidate Alerts</p>
                                <p className="text-gray-500 text-sm">Get notified when new high-match candidates are found</p>
                            </div>
                            <Switch checked={newMemberRequests} onCheckedChange={setNewMemberRequests} />
                        </div>

                        <div className="flex items-center justify-between py-3 border-b border-gray-100">
                            <div>
                                <p className="text-gray-700">Assessment Updates</p>
                                <p className="text-gray-500 text-sm">Receive updates when candidates complete assessments</p>
                            </div>
                            <Switch checked={projectUpdates} onCheckedChange={setProjectUpdates} />
                        </div>

                        <div className="flex items-center justify-between py-3">
                            <div>
                                <p className="text-gray-700">Weekly Summary</p>
                                <p className="text-gray-500 text-sm">Get a weekly summary of recruitment activities</p>
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


            </div>
        </div>
    );
}
