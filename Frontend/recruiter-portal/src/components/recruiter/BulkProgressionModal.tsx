import { useState } from 'react';
import { X, Users, CheckCircle, ArrowRight, Filter, TrendingUp, AlertTriangle, Ban, Award, Flag, Search } from 'lucide-react';
import { Button } from '../ui/button';

interface Candidate {
  id: number;
  name: string;
  avatar: string;
  score: number;
  flags: string[];
  meetsCriteria: boolean;
}

interface BulkProgressionModalProps {
  currentStage: string;
  nextStage: string;
  candidates: Candidate[];
  onConfirm: (selectedIds: number[], action: 'progress' | 'reject') => void;
  onCancel: () => void;
}

export function BulkProgressionModal({
  currentStage,
  nextStage,
  candidates,
  onConfirm,
  onCancel
}: BulkProgressionModalProps) {
  const [selectedCandidates, setSelectedCandidates] = useState<Set<number>>(new Set());
  const [action, setAction] = useState<'progress' | 'reject'>('progress');
  const [searchQuery, setSearchQuery] = useState('');

  // Smart selection filters
  const selectNoFlags = () => {
    const ids = candidates.filter(c => c.flags.length === 0).map(c => c.id);
    setSelectedCandidates(new Set(ids));
  };

  const selectMeetsCriteria = () => {
    const ids = candidates.filter(c => c.meetsCriteria).map(c => c.id);
    setSelectedCandidates(new Set(ids));
  };

  const selectTopN = (n: number) => {
    const ids = candidates
      .sort((a, b) => b.score - a.score)
      .slice(0, n)
      .map(c => c.id);
    setSelectedCandidates(new Set(ids));
  };

  const selectScoreRange = (min: number, max: number) => {
    const ids = candidates
      .filter(c => c.score >= min && c.score <= max)
      .map(c => c.id);
    setSelectedCandidates(new Set(ids));
  };

  const toggleCandidate = (id: number) => {
    const newSelected = new Set(selectedCandidates);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedCandidates(newSelected);
  };

  const toggleAll = () => {
    if (selectedCandidates.size === filteredCandidates.length) {
      setSelectedCandidates(new Set());
    } else {
      setSelectedCandidates(new Set(filteredCandidates.map(c => c.id)));
    }
  };

  const filteredCandidates = candidates.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConfirm = () => {
    onConfirm(Array.from(selectedCandidates), action);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb] bg-gradient-to-r from-emerald-50 to-teal-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-[#10b981] flex items-center justify-center">
                  <Users size={20} className="text-white" />
                </div>
                <div>
                  <h2 className="text-[#111827]">Move Candidates</h2>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-[4px] text-[12px] font-medium">
                      {currentStage}
                    </span>
                    <ArrowRight size={14} className="text-[#6b7280]" />
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-[4px] text-[12px] font-medium">
                      {nextStage}
                    </span>
                  </div>
                </div>
              </div>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                Select candidates to progress to the next stage
              </p>
            </div>
            <button
              onClick={onCancel}
              className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-white/50 transition-colors"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>
        </div>

        {/* Action Selection */}
        <div className="px-8 py-4 border-b border-[#e5e7eb] bg-gray-50">
          <div className="flex items-center gap-2">
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
              Action:
            </span>
            <button
              onClick={() => setAction('progress')}
              className={`px-4 py-2 rounded-[8px] font-['Arimo',sans-serif] text-[14px] transition-colors ${
                action === 'progress'
                  ? 'bg-[#10b981] text-white'
                  : 'bg-white border border-[#e5e7eb] text-[#374151] hover:bg-gray-50'
              }`}
            >
              <CheckCircle size={16} className="inline mr-2" />
              Progress to {nextStage}
            </button>
            <button
              onClick={() => setAction('reject')}
              className={`px-4 py-2 rounded-[8px] font-['Arimo',sans-serif] text-[14px] transition-colors ${
                action === 'reject'
                  ? 'bg-red-500 text-white'
                  : 'bg-white border border-[#e5e7eb] text-[#374151] hover:bg-gray-50'
              }`}
            >
              <Ban size={16} className="inline mr-2" />
              Reject
            </button>
          </div>
        </div>

        {/* Smart Selection Tools */}
        <div className="px-8 py-4 border-b border-[#e5e7eb]">
          <div className="flex items-center gap-2 mb-3">
            <Filter size={16} className="text-[#6366f1]" />
            <span className="font-['Arimo',sans-serif] text-[13px] font-medium text-[#111827]">
              Smart Selection:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={selectNoFlags}
              className="px-3 py-1.5 bg-white border border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f5f3ff] rounded-[6px] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
            >
              <CheckCircle size={14} className="inline mr-1.5 text-[#10b981]" />
              No Flags ({candidates.filter(c => c.flags.length === 0).length})
            </button>
            <button
              onClick={selectMeetsCriteria}
              className="px-3 py-1.5 bg-white border border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f5f3ff] rounded-[6px] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
            >
              <Award size={14} className="inline mr-1.5 text-[#6366f1]" />
              Meets Criteria ({candidates.filter(c => c.meetsCriteria).length})
            </button>
            <button
              onClick={() => selectTopN(5)}
              className="px-3 py-1.5 bg-white border border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f5f3ff] rounded-[6px] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
            >
              <TrendingUp size={14} className="inline mr-1.5 text-[#10b981]" />
              Top 5
            </button>
            <button
              onClick={() => selectTopN(10)}
              className="px-3 py-1.5 bg-white border border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f5f3ff] rounded-[6px] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
            >
              <TrendingUp size={14} className="inline mr-1.5 text-[#10b981]" />
              Top 10
            </button>
            <button
              onClick={() => selectScoreRange(80, 100)}
              className="px-3 py-1.5 bg-white border border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f5f3ff] rounded-[6px] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
            >
              Score 80-100 ({candidates.filter(c => c.score >= 80).length})
            </button>
            <button
              onClick={() => selectScoreRange(70, 79)}
              className="px-3 py-1.5 bg-white border border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f5f3ff] rounded-[6px] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
            >
              Score 70-79 ({candidates.filter(c => c.score >= 70 && c.score < 80).length})
            </button>
          </div>
        </div>

        {/* Search and Selection Count */}
        <div className="px-8 py-4 border-b border-[#e5e7eb] bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#6b7280]" />
              <input
                type="text"
                placeholder="Search candidates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-3">
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                <span className="font-semibold text-[#6366f1]">{selectedCandidates.size}</span> of {candidates.length} selected
              </span>
              <button
                onClick={toggleAll}
                className="px-3 py-1.5 bg-white border border-[#e5e7eb] hover:border-[#6366f1] rounded-[6px] font-['Arimo',sans-serif] text-[13px] text-[#374151] transition-colors"
              >
                {selectedCandidates.size === filteredCandidates.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>
        </div>

        {/* Candidate List */}
        <div className="flex-1 overflow-auto px-8 py-4">
          <div className="space-y-2">
            {filteredCandidates.map(candidate => (
              <div
                key={candidate.id}
                onClick={() => toggleCandidate(candidate.id)}
                className={`flex items-center gap-4 p-4 rounded-[8px] border-2 cursor-pointer transition-all ${
                  selectedCandidates.has(candidate.id)
                    ? 'border-[#6366f1] bg-[#f5f3ff]'
                    : 'border-[#e5e7eb] hover:border-[#d1d5db] bg-white'
                }`}
              >
                {/* Checkbox */}
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  selectedCandidates.has(candidate.id)
                    ? 'bg-[#6366f1] border-[#6366f1]'
                    : 'border-[#d1d5db]'
                }`}>
                  {selectedCandidates.has(candidate.id) && (
                    <CheckCircle size={14} className="text-white" />
                  )}
                </div>

                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white font-medium text-[14px] flex-shrink-0">
                  {candidate.avatar}
                </div>

                {/* Candidate Info */}
                <div className="flex-1">
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] font-medium">
                    {candidate.name}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Score: <span className="font-semibold text-[#111827]">{candidate.score}</span>
                    </span>
                    {candidate.meetsCriteria && (
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-[4px] text-[11px] font-medium">
                        Meets Criteria
                      </span>
                    )}
                  </div>
                </div>

                {/* Flags */}
                {candidate.flags.length > 0 && (
                  <div className="flex items-center gap-1">
                    <Flag size={14} className="text-red-500" />
                    <span className="font-['Arimo',sans-serif] text-[12px] text-red-600">
                      {candidate.flags.length} flag{candidate.flags.length > 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb] bg-gray-50">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {selectedCandidates.size === 0 && (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertTriangle size={16} />
                  <span className="font-['Arimo',sans-serif] text-[13px]">
                    Please select at least one candidate
                  </span>
                </div>
              )}
            </div>
            <div className="flex gap-3">
              <Button
                onClick={onCancel}
                variant="outline"
                className="h-11 px-6"
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={selectedCandidates.size === 0}
                className={`h-11 px-6 ${
                  action === 'progress'
                    ? 'bg-[#10b981] hover:bg-[#059669]'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {action === 'progress' && `Move ${selectedCandidates.size} to ${nextStage}`}
                {action === 'reject' && `Reject ${selectedCandidates.size} Candidate${selectedCandidates.size > 1 ? 's' : ''}`}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}