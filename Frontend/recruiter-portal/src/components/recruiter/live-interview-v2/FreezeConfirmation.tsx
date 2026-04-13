import React, { useState } from 'react';
import { ShieldCheck, Loader2, ChevronLeft, AlertTriangle } from 'lucide-react';
import { api } from '../../../../services/api';

interface FreezeConfirmationProps {
  groupId: string;
  rubricId: string | null;
  bankId: string | null;
  isFrozen: boolean;
  onBack: () => void;
  onFreeze: () => void;
}

export function FreezeConfirmation({ groupId, bankId, rubricId, isFrozen, onBack, onFreeze }: FreezeConfirmationProps) {
  const [isFreezing, setIsFreezing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFreeze = async () => {
    if (!rubricId || !bankId) {
      setError("Please ensure both Rubric and Question Bank are created before freezing.");
      return;
    }

    try {
      setIsFreezing(true);
      setError(null);
      
      // Freeze rubric first
      await api.client.post(`/live-interview-v2/rubric/${rubricId}/freeze`);
      // Then freeze bank
      await api.client.post(`/live-interview-v2/bank/${bankId}/freeze`);
      
      onFreeze();
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Validation failed during freeze process');
    } finally {
      setIsFreezing(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8">
      <div className="text-center mb-8">
        <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isFrozen ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
          <ShieldCheck className="w-8 h-8" />
        </div>
        <h3 className="text-2xl font-bold text-gray-900">
          {isFrozen ? 'Configuration Locked' : 'Ready to Freeze Configuration?'}
        </h3>
        <p className="text-gray-500 mt-2">
          {isFrozen 
            ? 'The AI interviewer is fully configured and candidates can now be evaluated.' 
            : 'Freezing ensures all candidates are evaluated against the exact same rubric and question bank.'}
        </p>
      </div>

      {!isFrozen && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 mb-8 text-amber-800 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-600" />
            <div>
              <h4 className="font-semibold text-amber-900">Important Warning</h4>
              <ul className="list-disc list-inside mt-2 text-sm space-y-1">
                <li>Once frozen, dimensions and anchors <strong>cannot be changed</strong>.</li>
                <li>Question text and AI intents <strong>cannot be edited</strong>.</li>
                <li>This ensures fairness and compliance for all candidates in this group.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg mb-6 border border-red-100 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between pt-6 border-t border-gray-100">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Bank
        </button>
        
        {!isFrozen ? (
          <button
            onClick={handleFreeze}
            disabled={isFreezing}
            className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isFreezing ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Freezing...</>
            ) : (
              <><ShieldCheck className="w-5 h-5" /> Freeze Configuration</>
            )}
          </button>
        ) : (
          <button
            onClick={onFreeze} // Close/Done
            className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
