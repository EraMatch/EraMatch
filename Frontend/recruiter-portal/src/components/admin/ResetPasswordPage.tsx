import { useState, useEffect } from 'react';
import { ArrowLeft, Lock, CheckCircle2, Eye, EyeOff, AlertTriangle } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import logo from '../../imports/image-eramatch.png';
import { api } from '../../services/api';

interface ResetPasswordPageProps {
    onBack: () => void;
}

export function ResetPasswordPage({ onBack }: ResetPasswordPageProps) {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [token, setToken] = useState<string | null>(null);

    useEffect(() => {
        // Extract token from URL
        const urlParams = new URLSearchParams(window.location.search);
        const t = urlParams.get('token');
        if (!t) {
            setError('Invalid or missing reset token. Please request a new link.');
        } else {
            setToken(t);
        }
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!token) return;

        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (password.length < 8) {
            setError('Password must be at least 8 characters long.');
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            await api.auth.resetPassword(token, password);
            setIsSubmitted(true);
        } catch (err: any) {
            setError('Failed to reset password. The link may be expired or invalid.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#EDF0F8' }}>
            {/* Header */}
            <div className="px-12 py-6 flex items-center justify-between border-b border-gray-200 bg-white">
                <img src={logo} alt="ERAMATCH" className="h-12" />
                <Button
                    variant="ghost"
                    className="rounded-full px-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
                    onClick={onBack}
                >
                    <ArrowLeft size={18} />
                    Back to Login
                </Button>
            </div>

            {/* Main Content */}
            <div className="flex-1 flex items-center justify-center px-12 py-16">
                <div className="w-full max-w-md">
                    <div className="bg-white rounded-3xl p-8 shadow-2xl text-center">
                        {!isSubmitted ? (
                            <>
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                                    style={{ backgroundColor: '#FEF3C7' }}
                                >
                                    <Lock size={32} style={{ color: '#F59E0B' }} />
                                </div>

                                <h1 className="text-3xl mb-2" style={{ color: '#1F2937' }}>
                                    Reset Password
                                </h1>
                                <p className="text-gray-600 mb-8">
                                    Set a new, secure password for your administrative account.
                                </p>

                                {error && (
                                    <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100 flex items-start gap-3 text-left">
                                        <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                                        <p className="text-sm text-red-600">
                                            {error}
                                        </p>
                                    </div>
                                )}

                                {!token ? (
                                    <Button
                                        onClick={onBack}
                                        className="w-full rounded-xl py-4"
                                        style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}
                                    >
                                        Go Back to Login
                                    </Button>
                                ) : (
                                    <form onSubmit={handleSubmit} className="space-y-6 text-left">
                                        <div>
                                            <Label htmlFor="pass" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                                                New Password
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    id="pass"
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={password}
                                                    onChange={(e) => setPassword(e.target.value)}
                                                    placeholder="At least 8 characters"
                                                    className="w-full rounded-lg pr-12"
                                                    required
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                                >
                                                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <Label htmlFor="confirm" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                                                Confirm New Password
                                            </Label>
                                            <Input
                                                id="confirm"
                                                type={showPassword ? 'text' : 'password'}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="Re-enter your password"
                                                className="w-full rounded-lg"
                                                required
                                            />
                                        </div>

                                        <Button
                                            type="submit"
                                            disabled={isLoading}
                                            className="w-full rounded-xl py-4 text-base transition-colors duration-200"
                                            style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}
                                            onMouseEnter={(e) => {
                                                if (!isLoading) e.currentTarget.style.backgroundColor = '#D97706';
                                            }}
                                            onMouseLeave={(e) => {
                                                if (!isLoading) e.currentTarget.style.backgroundColor = '#F59E0B';
                                            }}
                                        >
                                            {isLoading ? 'Resetting...' : 'Update Password'}
                                        </Button>
                                    </form>
                                )}
                            </>
                        ) : (
                            <>
                                <div
                                    className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6"
                                    style={{ backgroundColor: '#D1FAE5' }}
                                >
                                    <CheckCircle2 size={32} style={{ color: '#059669' }} />
                                </div>

                                <h1 className="text-3xl mb-2" style={{ color: '#1F2937' }}>
                                    Password Reset!
                                </h1>
                                <p className="text-gray-600 mb-8">
                                    Your password has been successfully updated. You can now sign in with your new credentials.
                                </p>

                                <Button
                                    onClick={onBack}
                                    className="w-full rounded-xl py-4 text-base transition-colors duration-200"
                                    style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}
                                >
                                    Sign In Now
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
