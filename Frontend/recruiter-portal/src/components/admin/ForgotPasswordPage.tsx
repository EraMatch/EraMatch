import { useState } from 'react';
import { ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Logo } from '../common/Logo';
import { api } from '../../services/api';

interface ForgotPasswordPageProps {
    onBack: () => void;
}

export function ForgotPasswordPage({ onBack }: ForgotPasswordPageProps) {
    const [email, setEmail] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);
        try {
            await api.auth.forgotPassword(email);
            setIsSubmitted(true);
        } catch (err: any) {
            setError('An error occurred while requesting a password reset. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex flex-col" style={{ backgroundColor: '#EDF0F8' }}>
            {/* Header */}
            <div className="px-12 py-6 flex items-center justify-between border-b border-gray-200 bg-white">
                <Logo size="md" />
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
                                    style={{ backgroundColor: '#DBEAFE' }}
                                >
                                    <Mail size={32} style={{ color: '#2563EB' }} />
                                </div>

                                <h1 className="text-3xl mb-2" style={{ color: '#1F2937' }}>
                                    Forgot Password?
                                </h1>
                                <p className="text-gray-600 mb-8">
                                    No worries! Enter your email and we'll send you a link to reset your password.
                                </p>

                                {error && (
                                    <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-100">
                                        <p className="text-sm text-red-600">
                                            {error}
                                        </p>
                                    </div>
                                )}

                                <form onSubmit={handleSubmit} className="space-y-6 text-left">
                                    <div>
                                        <Label htmlFor="email" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                                            Email Address
                                        </Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            placeholder="Enter your registered email"
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
                                        {isLoading ? 'Sending Link...' : 'Send Reset Link'}
                                    </Button>
                                </form>
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
                                    Check your Email
                                </h1>
                                <p className="text-gray-600 mb-8">
                                    If an account exists for <strong>{email}</strong>, you will receive a reset link shortly.
                                </p>

                                <Button
                                    onClick={onBack}
                                    className="w-full rounded-xl py-4 text-base transition-colors duration-200"
                                    style={{ backgroundColor: '#F59E0B', color: '#FFFFFF' }}
                                >
                                    Back to Login
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
