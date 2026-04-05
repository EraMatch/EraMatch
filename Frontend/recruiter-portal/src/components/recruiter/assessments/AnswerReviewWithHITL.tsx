/**
 * AnswerReviewWithHITL – Era Match v2 Frontend  
 * Recruiter interface for reviewing answers with Human-in-the-Loop routing flags
 */
import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Send,
  Flag,
  MessageSquare,
  User,
  Calendar,
  Zap,
} from 'lucide-react';

interface Anomaly {
  type: string;
  severity: 'low' | 'medium' | 'high';
  message: string;
  confidence: number;
}

interface RoutingDecision {
  answer_id: string;
  route: 'auto_approved' | 'auto_rejected' | 'human_review' | 'quality_flag';
  confidence: number;
  anomalies: Anomaly[];
  reasoning: string;
}

interface AnswerData {
  answer_id: string;
  candidate_name: string;
  question: string;
  candidate_response: string;
  rubric_criteria: string[];
  ai_score: number;
  ai_confidence: number;
  routing_decision: RoutingDecision;
  evidence_quotes?: string[];
}

interface AnswerReviewWithHITLProps {
  answer: AnswerData;
  onApprove?: (answer_id: string, feedback: string) => void;
  onReject?: (answer_id: string, feedback: string) => void;
  onEscalate?: (answer_id: string) => void;
}

export const AnswerReviewWithHITL: React.FC<AnswerReviewWithHITLProps> = ({
  answer,
  onApprove,
  onReject,
  onEscalate,
}) => {
  const [feedback, setFeedback] = useState('');
  const [manualScore, setManualScore] = useState<number | null>(answer.ai_score);
  const [showAnomalies, setShowAnomalies] = useState(true);

  const getRouteColor = (route: string) => {
    switch (route) {
      case 'auto_approved':
        return 'bg-green-50 border-green-300 text-green-900';
      case 'auto_rejected':
        return 'bg-red-50 border-red-300 text-red-900';
      case 'human_review':
        return 'bg-yellow-50 border-yellow-300 text-yellow-900';
      case 'quality_flag':
        return 'bg-orange-50 border-orange-300 text-orange-900';
      default:
        return 'bg-gray-50 border-gray-300 text-gray-900';
    }
  };

  const getRouteIcon = (route: string) => {
    switch (route) {
      case 'auto_approved':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'auto_rejected':
        return <AlertTriangle className="w-5 h-5 text-red-600" />;
      case 'human_review':
        return <Clock className="w-5 h-5 text-yellow-600" />;
      case 'quality_flag':
        return <Flag className="w-5 h-5 text-orange-600" />;
      default:
        return null;
    }
  };

  const getRouteLabel = (route: string) => {
    switch (route) {
      case 'auto_approved':
        return 'Auto-Approved';
      case 'auto_rejected':
        return 'Auto-Rejected';
      case 'human_review':
        return 'Requires Human Review';
      case 'quality_flag':
        return 'Quality Flag';
      default:
        return 'Unknown';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const requiresAction =
    answer.routing_decision.route === 'human_review' ||
    answer.routing_decision.route === 'quality_flag';

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header with routing status */}
      <div
        className={`border-b-4 p-6 border-r ${getRouteColor(
          answer.routing_decision.route
        )}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              {getRouteIcon(answer.routing_decision.route)}
              <h2 className="text-xl font-bold">{getRouteLabel(answer.routing_decision.route)}</h2>
              <span className="text-sm font-medium">
                ({Math.round(answer.routing_decision.confidence * 100)}% sure)
              </span>
            </div>
            <p className="text-sm opacity-90">{answer.routing_decision.reasoning}</p>
          </div>

          {requiresAction && (
            <div className="flex gap-2">
              <button
                onClick={() => onApprove?.(answer.answer_id, feedback)}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm"
              >
                Approve
              </button>
              <button
                onClick={() => onReject?.(answer.answer_id, feedback)}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="grid grid-cols-3 gap-6 p-6">
        {/* Left: Candidate response */}
        <div className="col-span-2 space-y-6">
          {/* Candidate info */}
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="font-semibold text-gray-900">{answer.candidate_name}</div>
              <div className="text-sm text-gray-600">Candidate Response</div>
            </div>
            <div className="text-right text-sm text-gray-600">
              <div>Added today</div>
            </div>
          </div>

          {/* Question */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm">Question</h3>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-gray-700">
              {answer.question}
            </div>
          </div>

          {/* Rubric criteria */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm">Evaluation Criteria</h3>
            <div className="space-y-2">
              {answer.rubric_criteria.map((criterion, idx) => (
                <div key={idx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="text-sm text-gray-700">{criterion}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Candidate response */}
          <div className="space-y-2">
            <h3 className="font-semibold text-gray-900 text-sm">Candidate Response</h3>
            <div className="p-4 bg-white border-2 border-gray-300 rounded-lg text-gray-700 min-h-32 max-h-64 overflow-y-auto">
              {answer.candidate_response}
            </div>
          </div>

          {/* Evidence quotes (if available) */}
          {answer.evidence_quotes && answer.evidence_quotes.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-gray-900 text-sm">Extracted Evidence</h3>
              <div className="space-y-2">
                {answer.evidence_quotes.map((quote, idx) => (
                  <div key={idx} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm italic text-green-900">&ldquo;{quote}&rdquo;</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Scoring & anomalies */}
        <div className="space-y-6">
          {/* AI Scoring */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-gray-900">AI Assessment</h3>

            <div>
              <div className="text-sm text-gray-600 mb-1">Confidence</div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-600" />
                <div className="flex-1 bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-yellow-500 h-2 rounded-full"
                    style={{ width: `${answer.ai_confidence * 100}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700">
                  {Math.round(answer.ai_confidence * 100)}%
                </span>
              </div>
            </div>

            <div>
              <div className="text-sm text-gray-600 mb-2">AI Score</div>
              <div className="text-3xl font-bold text-blue-600">{answer.ai_score.toFixed(2)}</div>
              <div className="text-xs text-gray-600">out of 1.0</div>
            </div>

            {/* Manual score override */}
            <div className="space-y-1">
              <label className="text-sm font-medium text-gray-700">Override Score</label>
              <input
                type="number"
                min="0"
                max="1"
                step="0.1"
                value={manualScore ?? ''}
                onChange={(e) => setManualScore(e.target.value ? parseFloat(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="0.0 - 1.0"
              />
            </div>
          </div>

          {/* Anomalies */}
          {answer.routing_decision.anomalies && answer.routing_decision.anomalies.length > 0 && (
            <div className="space-y-2">
              <button
                onClick={() => setShowAnomalies(!showAnomalies)}
                className="w-full flex items-center justify-between p-3 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-orange-600" />
                  <span className="font-semibold text-orange-900">
                    {answer.routing_decision.anomalies.length} Anomal{answer.routing_decision.anomalies.length !== 1 ? 'ies' : 'y'}
                  </span>
                </div>
                <span className="text-sm text-orange-700">{showAnomalies ? '▼' : '▶'}</span>
              </button>

              {showAnomalies && (
                <div className="space-y-2 pl-3 border-l-4 border-orange-200">
                  {answer.routing_decision.anomalies.map((anomaly, idx) => (
                    <div key={idx} className={`p-3 rounded-lg border ${getSeverityColor(anomaly.severity)}`}>
                      <div className="font-semibold text-xs mb-1">{anomaly.type}</div>
                      <div className="text-xs mb-2">{anomaly.message}</div>
                      <div className="text-xs opacity-75">Confidence: {Math.round(anomaly.confidence * 100)}%</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Feedback box */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-gray-900">Your Feedback</label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Add notes for the candidate..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 resize-none"
              rows={4}
            />
            <div className="flex gap-2 text-xs text-gray-600">
              <MessageSquare className="w-4 h-4" />
              <span>Visible to candidate</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnswerReviewWithHITL;
