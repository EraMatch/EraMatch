import { useState } from 'react';
import { ArrowLeft, CreditCard, Lock, Check, Star, SkipForward } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Logo } from './Logo';

interface PaymentGatewayPageProps {
  onBack: () => void;
  onComplete: () => void;
  onBypass?: () => void;
}

export function PaymentGatewayPage({ onBack, onComplete, onBypass }: PaymentGatewayPageProps) {
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'professional' | 'enterprise'>('professional');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('annual');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [nameOnCard, setNameOnCard] = useState('');
  const [showBypassConfirm, setShowBypassConfirm] = useState(false);

  const plans = {
    starter: {
      name: 'Starter',
      monthlyPrice: 249,
      annualPrice: 199,
      color: '#6366F1',
    },
    professional: {
      name: 'Professional',
      monthlyPrice: 599,
      annualPrice: 499,
      color: '#10B981',
      popular: true,
    },
    enterprise: {
      name: 'Enterprise',
      monthlyPrice: null,
      annualPrice: null,
      color: '#6366F1',
    },
  };

  const currentPlan = plans[selectedPlan];
  const price = billingCycle === 'annual' ? currentPlan.annualPrice : currentPlan.monthlyPrice;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Simulate payment processing
    setTimeout(() => {
      alert('Payment processed successfully! Welcome to ERAMATCH.');
      onComplete();
    }, 1500);
  };

  const formatCardNumber = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const matches = v.match(/\d{4,16}/g);
    const match = (matches && matches[0]) || '';
    const parts = [];

    for (let i = 0, len = match.length; i < len; i += 4) {
      parts.push(match.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return value;
    }
  };

  const formatExpiryDate = (value: string) => {
    const v = value.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    if (v.length >= 2) {
      return v.substring(0, 2) + '/' + v.substring(2, 4);
    }
    return v;
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#EDF0F8' }}>
      {/* Header */}
      <div className="px-12 py-6 flex items-center justify-between border-b border-gray-200 bg-white">
        <Logo size="md" />
        <div className="flex items-center gap-3">
          {/* Admin Bypass Button */}
          {onBypass && (
            <Button
              variant="ghost"
              className="rounded-full px-4 py-2 flex items-center gap-2 text-xs text-purple-600 hover:bg-purple-50 border border-purple-300"
              onClick={() => setShowBypassConfirm(true)}
              title="Admin: Bypass payment for testing"
            >
              <SkipForward size={14} />
              Admin Bypass
            </Button>
          )}
          <Button
            variant="ghost"
            className="rounded-full px-6 flex items-center gap-2 text-gray-600 hover:text-gray-900"
            onClick={onBack}
          >
            <ArrowLeft size={18} />
            Back
          </Button>
        </div>
      </div>

      {/* Bypass Confirmation Modal */}
      {showBypassConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                <SkipForward size={24} className="text-purple-600" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-gray-900">Bypass Payment</h3>
                <p className="text-sm text-gray-600">Admin Testing Mode</p>
              </div>
            </div>
            <p className="text-gray-700 mb-6">
              This will skip the payment process and create a test account with Professional plan features. This should only be used for testing purposes.
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => {
                  setShowBypassConfirm(false);
                  if (onBypass) onBypass();
                }}
                className="flex-1 rounded-xl py-3 bg-purple-600 hover:bg-purple-700 text-white"
              >
                Confirm Bypass
              </Button>
              <Button
                onClick={() => setShowBypassConfirm(false)}
                variant="outline"
                className="flex-1 rounded-xl py-3 border-gray-300"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="px-12 py-16 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl mb-4" style={{ color: '#1F2937' }}>
            Complete Your Subscription
          </h1>
          <p className="text-xl text-gray-600">
            Choose your plan and enter payment details to get started
          </p>
        </div>

        <div className="grid grid-cols-3 gap-8">
          {/* Left Column - Plan Selection */}
          <div className="col-span-2 space-y-6">
            {/* Plan Selection */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl mb-4" style={{ color: '#1F2937' }}>
                Select Plan
              </h2>

              <RadioGroup value={selectedPlan} onValueChange={(value: any) => setSelectedPlan(value)}>
                {/* Starter */}
                <div
                  className={`flex items-center justify-between p-4 rounded-xl border-2 mb-3 cursor-pointer transition-all ${selectedPlan === 'starter' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  onClick={() => setSelectedPlan('starter')}
                >
                  <div className="flex items-center gap-4">
                    <RadioGroupItem value="starter" id="starter" />
                    <div>
                      <Label htmlFor="starter" className="text-base cursor-pointer" style={{ color: '#1F2937' }}>
                        Starter Plan
                      </Label>
                      <p className="text-sm text-gray-600">For small teams getting started</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl" style={{ color: '#6366F1' }}>
                      ${billingCycle === 'annual' ? '199' : '249'}
                    </div>
                    <div className="text-sm text-gray-600">/month</div>
                  </div>
                </div>

                {/* Professional */}
                <div
                  className={`flex items-center justify-between p-4 rounded-xl border-2 mb-3 cursor-pointer transition-all relative ${selectedPlan === 'professional' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  onClick={() => setSelectedPlan('professional')}
                >
                  <div className="absolute -top-3 left-4">
                    <div className="flex items-center gap-1 px-3 py-1 rounded-full text-xs" style={{ backgroundColor: '#10B981', color: '#FFFFFF' }}>
                      <Star size={12} />
                      Most Popular
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <RadioGroupItem value="professional" id="professional" />
                    <div>
                      <Label htmlFor="professional" className="text-base cursor-pointer" style={{ color: '#1F2937' }}>
                        Professional Plan
                      </Label>
                      <p className="text-sm text-gray-600">For growing recruitment teams</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl" style={{ color: '#10B981' }}>
                      ${billingCycle === 'annual' ? '499' : '599'}
                    </div>
                    <div className="text-sm text-gray-600">/month</div>
                  </div>
                </div>

                {/* Enterprise */}
                <div
                  className={`flex items-center justify-between p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedPlan === 'enterprise' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  onClick={() => setSelectedPlan('enterprise')}
                >
                  <div className="flex items-center gap-4">
                    <RadioGroupItem value="enterprise" id="enterprise" />
                    <div>
                      <Label htmlFor="enterprise" className="text-base cursor-pointer" style={{ color: '#1F2937' }}>
                        Enterprise Plan
                      </Label>
                      <p className="text-sm text-gray-600">For large organizations</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl" style={{ color: '#6366F1' }}>
                      Custom
                    </div>
                    <div className="text-sm text-gray-600">pricing</div>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Billing Cycle */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl mb-4" style={{ color: '#1F2937' }}>
                Billing Cycle
              </h2>

              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${billingCycle === 'monthly' ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  <div className="text-base mb-1" style={{ color: '#1F2937' }}>Monthly</div>
                  <div className="text-sm text-gray-600">Pay month-to-month</div>
                </div>

                <div
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-all relative ${billingCycle === 'annual' ? 'border-emerald-500 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  onClick={() => setBillingCycle('annual')}
                >
                  <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: '#10B981', color: '#FFFFFF' }}>
                    Save 20%
                  </div>
                  <div className="text-base mb-1" style={{ color: '#1F2937' }}>Annual</div>
                  <div className="text-sm text-gray-600">Billed yearly</div>
                </div>
              </div>
            </div>

            {/* Payment Details */}
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h2 className="text-xl mb-4 flex items-center gap-2" style={{ color: '#1F2937' }}>
                <CreditCard size={24} />
                Payment Details
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="cardName" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                    Name on Card
                  </Label>
                  <Input
                    id="cardName"
                    type="text"
                    value={nameOnCard}
                    onChange={(e) => setNameOnCard(e.target.value)}
                    placeholder="John Doe"
                    className="w-full rounded-lg"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="cardNumber" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                    Card Number
                  </Label>
                  <Input
                    id="cardNumber"
                    type="text"
                    value={cardNumber}
                    onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    className="w-full rounded-lg"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="expiry" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                      Expiry Date
                    </Label>
                    <Input
                      id="expiry"
                      type="text"
                      value={expiryDate}
                      onChange={(e) => setExpiryDate(formatExpiryDate(e.target.value))}
                      placeholder="MM/YY"
                      maxLength={5}
                      className="w-full rounded-lg"
                      required
                    />
                  </div>

                  <div>
                    <Label htmlFor="cvv" className="text-sm mb-2 block" style={{ color: '#1F2937' }}>
                      CVV
                    </Label>
                    <Input
                      id="cvv"
                      type="text"
                      value={cvv}
                      onChange={(e) => setCvv(e.target.value.replace(/\D/g, '').substring(0, 4))}
                      placeholder="123"
                      maxLength={4}
                      className="w-full rounded-lg"
                      required
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <Button
                    type="submit"
                    className="w-full rounded-xl py-4 text-base transition-colors duration-200 flex items-center justify-center gap-2"
                    style={{ backgroundColor: currentPlan.color, color: '#FFFFFF' }}
                    disabled={selectedPlan === 'enterprise'}
                  >
                    <Lock size={18} />
                    {selectedPlan === 'enterprise' ? 'Contact Sales' : `Pay ${price ? `$${price}` : 'Custom'}`}
                  </Button>
                </div>

                <div className="flex items-center justify-center gap-2 text-sm text-gray-600 pt-2">
                  <Lock size={14} />
                  <span>Secured with 256-bit SSL encryption</span>
                </div>
              </form>
            </div>
          </div>

          {/* Right Column - Order Summary */}
          <div className="col-span-1">
            <div className="bg-white rounded-2xl p-6 shadow-sm sticky top-8">
              <h2 className="text-xl mb-6" style={{ color: '#1F2937' }}>
                Order Summary
              </h2>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="text-base" style={{ color: '#1F2937' }}>{currentPlan.name} Plan</div>
                    <div className="text-sm text-gray-600">
                      {billingCycle === 'annual' ? 'Annual billing' : 'Monthly billing'}
                    </div>
                  </div>
                  <div className="text-right">
                    {price ? (
                      <>
                        <div className="text-lg" style={{ color: currentPlan.color }}>
                          ${price}
                        </div>
                        <div className="text-xs text-gray-600">/month</div>
                      </>
                    ) : (
                      <div className="text-lg" style={{ color: currentPlan.color }}>Custom</div>
                    )}
                  </div>
                </div>

                {billingCycle === 'annual' && price && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Annual discount (20%)</span>
                    <span style={{ color: '#10B981' }}>-${(currentPlan.monthlyPrice! - price) * 12}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-gray-200 pt-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-lg" style={{ color: '#1F2937' }}>
                    {billingCycle === 'annual' ? 'Total (First Year)' : 'Total Today'}
                  </span>
                  <span className="text-2xl" style={{ color: currentPlan.color }}>
                    {price ? `$${billingCycle === 'annual' ? price * 12 : price}` : 'Custom'}
                  </span>
                </div>
              </div>

              {/* Features Included */}
              <div className="space-y-3 pt-4 border-t border-gray-200">
                <div className="text-sm mb-3" style={{ color: '#1F2937' }}>
                  <strong>What's included:</strong>
                </div>
                {selectedPlan === 'starter' && (
                  <>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">Up to 10 active job postings</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">100 AI interviews per month</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">3 team members</span>
                    </div>
                  </>
                )}
                {selectedPlan === 'professional' && (
                  <>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">Unlimited job postings</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">500 AI interviews per month</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">10 team members</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">Advanced analytics & API access</span>
                    </div>
                  </>
                )}
                {selectedPlan === 'enterprise' && (
                  <>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">Everything in Professional</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">Unlimited AI interviews</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">Unlimited team members</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <Check size={16} style={{ color: '#10B981' }} className="flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-gray-600">Dedicated account manager</span>
                    </div>
                  </>
                )}
              </div>

              {/* 14-day Trial Notice */}
              <div className="mt-6 p-3 rounded-lg" style={{ backgroundColor: '#F0FDF4' }}>
                <p className="text-xs text-center" style={{ color: '#065F46' }}>
                  14-day free trial included
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}