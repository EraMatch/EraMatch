import { useState } from 'react';
import { X, Search, Sparkles, Lightbulb } from 'lucide-react';

interface SemanticSearchModalProps {
  onClose: () => void;
  onSearch: (query: string, reRank: boolean) => void;
  hasActiveFilters?: boolean;
}

export function SemanticSearchModal({ onClose, onSearch, hasActiveFilters = false }: SemanticSearchModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [reRankExisting, setReRankExisting] = useState(false);

  const promptTemplates = [
    'Find senior backend with Kubernetes + microservices',
    'Find candidates with leadership + mentoring experience',
    'Full-stack engineers with startup experience',
    'Machine learning engineers with Python + TensorFlow',
    'Frontend developers strong in React + TypeScript',
    'DevOps engineers with AWS + Docker expertise'
  ];

  const suggestions = [
    'Find senior developers with machine learning experience',
    'Show candidates with strong DevOps background',
    'React developers with 5+ years experience',
    'Full-stack engineers available immediately',
    'Python experts with data science skills',
    'Frontend specialists who know TypeScript'
  ];

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    // Simulate AI search
    await new Promise(resolve => setTimeout(resolve, 1500));
    setIsSearching(false);
    onSearch(searchQuery, reRankExisting);
  };

  const useTemplate = (template: string) => {
    setSearchQuery(template);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[16px] w-full max-w-[700px] max-h-[80vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-[40px] h-[40px] rounded-[10px] bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center">
                <Sparkles size={20} className="text-white" />
              </div>
              <h2 className="text-[#111827]">AI Semantic Search</h2>
            </div>
            <button
              onClick={onClose}
              className="w-[36px] h-[36px] flex items-center justify-center rounded-[8px] hover:bg-[#f3f4f6] transition-colors"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>
          <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
            Describe what you're looking for in natural language
          </p>
        </div>

        {/* Search Input */}
        <div className="px-8 py-6">
          <div className="relative mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="e.g., Find senior React developers with AWS experience..."
              className="w-full h-[56px] pl-[48px] pr-[120px] rounded-[12px] border-2 border-[#e5e7eb] font-['Arimo',sans-serif] text-[15px] focus:outline-none focus:border-[#6366f1] transition-colors"
              autoFocus
            />
            <Search size={20} className="absolute left-[16px] top-1/2 -translate-y-1/2 text-[#6b7280]" />
            <button
              onClick={handleSearch}
              disabled={!searchQuery.trim() || isSearching}
              className="absolute right-[8px] top-1/2 -translate-y-1/2 h-[40px] px-[20px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] disabled:bg-[#e5e7eb] disabled:cursor-not-allowed font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
            >
              {isSearching ? (
                <div className="flex items-center gap-2">
                  <div className="w-[16px] h-[16px] border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Searching...</span>
                </div>
              ) : (
                'Search'
              )}
            </button>
          </div>

          {/* Re-rank Option */}
          {hasActiveFilters && (
            <label className="flex items-center gap-2 px-4 py-3 bg-[#f9fafb] rounded-[8px] cursor-pointer hover:bg-[#f3f4f6] transition-colors">
              <input
                type="checkbox"
                checked={reRankExisting}
                onChange={(e) => setReRankExisting(e.target.checked)}
                className="w-[16px] h-[16px] rounded border-[#d1d5db] text-[#6366f1] cursor-pointer"
              />
              <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                Run semantic re-rank on current filtered results only
              </span>
            </label>
          )}
        </div>

        {/* Prompt Templates */}
        <div className="px-8 pb-4">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb size={16} className="text-[#f59e0b]" />
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
              Quick Templates:
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {promptTemplates.map((template, index) => (
              <button
                key={index}
                onClick={() => useTemplate(template)}
                className="px-[12px] py-[6px] rounded-[6px] bg-[#ede9fe] text-[#6366f1] hover:bg-[#ddd6fe] font-['Arimo',sans-serif] text-[12px] transition-colors"
              >
                {template}
              </button>
            ))}
          </div>
        </div>

        {/* Suggestions */}
        <div className="px-8 pb-6 flex-1 overflow-auto">
          <div className="mb-3">
            <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
              Suggestions:
            </span>
          </div>
          <div className="space-y-2">
            {suggestions.map((suggestion, index) => (
              <button
                key={index}
                onClick={() => setSearchQuery(suggestion)}
                className="w-full text-left px-[16px] py-[12px] rounded-[8px] border border-[#e5e7eb] hover:border-[#6366f1] hover:bg-[#f9fafb] transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <Search size={16} className="text-[#6b7280] group-hover:text-[#6366f1] mt-[2px] flex-shrink-0" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151] group-hover:text-[#111827]">
                    {suggestion}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Info */}
        <div className="px-8 py-4 bg-[#f9fafb] border-t border-[#e5e7eb]">
          <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] text-center">
            AI will analyze candidate profiles, skills, experience, and matching criteria
          </p>
        </div>
      </div>
    </div>
  );
}
