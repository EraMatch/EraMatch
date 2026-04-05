/**
 * EvidenceDisplayCard – Era Match v2 Frontend
 * Displays extracted evidence quotes with source mapping and verification status
 */
import React from 'react';
import { AlertCircle, CheckCircle, XCircle, Quote } from 'lucide-react';

interface EvidenceQuote {
  quote: string;
  source_type?: string;
  line_number?: number;
  confidence: number;
  context?: string;
  verified?: boolean;
  error?: string;
}

interface EvidenceDisplayCardProps {
  quotes: EvidenceQuote[];
  criterion: string;
  score: number; // 0, 0.5, or 1
  verified?: boolean;
  hallucination_rate?: number;
}

export const EvidenceDisplayCard: React.FC<EvidenceDisplayCardProps> = ({
  quotes,
  criterion,
  score,
  verified = true,
  hallucination_rate = 0,
}) => {
  const getScoreBadgeColor = (score: number) => {
    if (score === 1) return 'bg-green-100 text-green-800 border-green-300';
    if (score === 0.5) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  const getScoreBadgeLabel = (score: number) => {
    if (score === 1) return 'Pass';
    if (score === 0.5) return 'Partial';
    return 'Fail';
  };

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 0.9) return { label: 'High', color: 'text-green-600' };
    if (confidence >= 0.7) return { label: 'Medium', color: 'text-yellow-600' };
    return { label: 'Low', color: 'text-red-600' };
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
      {/* Header with criterion and score */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{criterion}</h3>
          <p className="text-sm text-gray-600 mt-1">Evidence-backed evaluation</p>
        </div>
        <div
          className={`px-4 py-2 rounded-full border-2 font-semibold ${getScoreBadgeColor(score)}`}
        >
          {getScoreBadgeLabel(score)}
        </div>
      </div>

      {/* Verification status */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
        {verified ? (
          <>
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm text-gray-700">
              ✓ All quotes verified in source ({Math.round((1 - hallucination_rate) * 100)}% confidence)
            </span>
          </>
        ) : (
          <>
            <AlertCircle className="w-5 h-5 text-yellow-600" />
            <span className="text-sm text-gray-700">
              ⚠ {Math.round(hallucination_rate * 100)}% hallucination rate - requires review
            </span>
          </>
        )}
      </div>

      {/* Evidence quotes */}
      <div className="space-y-3">
        <h4 className="font-medium text-gray-800 flex items-center gap-2">
          <Quote className="w-4 h-4" />
          Evidence ({quotes.length} quote{quotes.length !== 1 ? 's' : ''})
        </h4>

        {quotes.length === 0 ? (
          <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
            No quotes extracted - assessment may need review
          </div>
        ) : (
          <div className="space-y-2">
            {quotes.map((quote, idx) => {
              const confidenceBadge = getConfidenceBadge(quote.confidence);
              const isHallucinated = quote.verified === false;

              return (
                <div
                  key={idx}
                  className={`p-3 rounded-md border-l-4 ${
                    isHallucinated
                      ? 'bg-red-50 border-l-red-300 border border-red-200'
                      : 'bg-blue-50 border-l-blue-300 border border-blue-200'
                  }`}
                >
                  {/* Quote text */}
                  <div className="flex items-start gap-2 mb-2">
                    {isHallucinated ? (
                      <XCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                    )}
                    <blockquote className="italic text-gray-700 text-sm flex-1">
                      &ldquo;{quote.quote}&rdquo;
                    </blockquote>
                  </div>

                  {/* Metadata */}
                  <div className="flex items-center gap-3 text-xs text-gray-600 ml-6">
                    {quote.line_number && (
                      <span className="bg-gray-200 px-2 py-1 rounded">
                        Line {quote.line_number}
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded bg-gray-100 ${confidenceBadge.color}`}>
                      {confidenceBadge.label} confidence ({Math.round(quote.confidence * 100)}%)
                    </span>
                    {quote.source_type && (
                      <span className="bg-gray-200 px-2 py-1 rounded">{quote.source_type}</span>
                    )}
                  </div>

                  {/* Context (optional) */}
                  {quote.context && (
                    <div className="mt-2 ml-6 text-xs text-gray-600 bg-white p-2 rounded border border-gray-200">
                      <strong>Context:</strong> ...{quote.context}...
                    </div>
                  )}

                  {/* Error message */}
                  {quote.error && (
                    <div className="mt-2 ml-6 text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">
                      {quote.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pt-3 border-t border-gray-200 text-xs text-gray-600">
        All scores are backed by exact textual evidence from the candidate response to ensure
        legal defensibility.
      </div>
    </div>
  );
};

export default EvidenceDisplayCard;
