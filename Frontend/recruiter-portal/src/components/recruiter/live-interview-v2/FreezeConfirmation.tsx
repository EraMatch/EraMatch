import { useState } from 'react';
import { ShieldCheck, Loader2, ChevronLeft, AlertTriangle, Info, Brain } from 'lucide-react';
import { fetchAPI } from '../../../services/client';

interface FreezeConfirmationProps {
  groupId: string;
  rubricId: string | null;
  bankId: string | null;
  isFrozen: boolean;
  onBack: () => void;
  onFreeze: () => void;
}

export function FreezeConfirmation({ bankId, rubricId, isFrozen, onBack, onFreeze }: FreezeConfirmationProps) {
  const [isFreezing, setIsFreezing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Context injection setting — saved to rubric BEFORE freeze
  const [includeWeakTopics, setIncludeWeakTopics] = useState(false);

  const handleFreeze = async () => {
    if (!rubricId || !bankId) {
      setError('Please ensure both Rubric and Question Bank are created before freezing.');
      return;
    }

    try {
      setIsFreezing(true);
      setError(null);

      // Step 1: Persist the include_weak_topics setting to the rubric
      await fetchAPI(`/live-interview-v2/rubric/${rubricId}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          include_weak_topics: includeWeakTopics,
        }),
      });

      // Step 2: Freeze rubric
      await fetchAPI(`/live-interview-v2/rubric/${rubricId}/freeze`, {
        method: 'POST',
      });

      // Step 3: Freeze bank
      await fetchAPI(`/live-interview-v2/bank/${bankId}/freeze`, {
        method: 'POST',
      });

      onFreeze();
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Validation failed during freeze process');
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

      {/* ── Agent Context Settings (only before freeze) ── */}
      {!isFrozen && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-6 space-y-4">
          <div className="flex items-center gap-2 text-indigo-900">
            <Brain className="w-4 h-4 flex-shrink-0" />
            <h4 className="font-semibold text-sm">AI Agent Context Settings</h4>
          </div>
          <p className="text-xs text-indigo-700">
            These settings control what background knowledge the AI interviewer will have access to during each session.
          </p>

          {/* Weak Topics Toggle */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={includeWeakTopics}
              onChange={(e) => setIncludeWeakTopics(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-900 block">
                Include candidate's weak assessment topics as agent context
              </span>
              <span className="text-xs text-gray-500 mt-0.5 block">
                When enabled, the AI agent receives the topics where a candidate previously scored lowest in
                the assessment stage. The agent may naturally probe deeper into those areas during the interview.
                <span className="block mt-1 font-medium text-indigo-600">
                  This does NOT affect scoring — it helps the agent ask more targeted follow-up questions.
                </span>
              </span>
              {includeWeakTopics && (
                <div className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 rounded-md p-2 border border-amber-100">
                  <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <span>Only available if the <strong>assessment stage was completed</strong> before the live interview in the group pipeline.</span>
                </div>
              )}
            </div>
          </label>
        </div>
      )}

      {/* ── Freeze Warning (only before freeze) ── */}
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

      {/* ── Frozen summary (show settings that were locked) ── */}
      {isFrozen && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 mb-6">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Locked Settings</h4>
          <div className="text-sm text-gray-600 space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
              Rubric and question bank frozen — changes blocked
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              Language: English
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
            onClick={onFreeze}
            className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
