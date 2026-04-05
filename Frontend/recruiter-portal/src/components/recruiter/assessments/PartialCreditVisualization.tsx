/**
 * PartialCreditVisualization – Era Match v2 Frontend
 * Displays partial credit scoring (0/0.5/1) with visual progress and explanation
 */
import React from 'react';
import { TrendingUp, AlertCircle, Award, Trophy } from 'lucide-react';

interface CriterionScore {
  criterion: string;
  score: 0 | 0.5 | 1;
  confidence: number;
  feedback: string;
  partial_reason?: string;
}

interface PartialCreditVisualizationProps {
  criteria: CriterionScore[];
  final_score: number;
  partial_credit_awarded: boolean;
  percentage: number;
}

export const PartialCreditVisualization: React.FC<PartialCreditVisualizationProps> = ({
  criteria,
  final_score,
  partial_credit_awarded,
  percentage,
}) => {
  const getScoreBgColor = (score: number) => {
    if (score === 1) return 'bg-green-100';
    if (score === 0.5) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getScoreBorder = (score: number) => {
    if (score === 1) return 'border-green-300';
    if (score === 0.5) return 'border-yellow-300';
    return 'border-red-300';
  };

  const getScoreIcon = (score: number) => {
    if (score === 1) return '✓'; // Pass
    if (score === 0.5) return '◐'; // Partial
    return '✗'; // Fail
  };

  const getScoreLabel = (score: number) => {
    if (score === 1) return 'Pass';
    if (score === 0.5) return 'Partial';
    return 'Fail';
  };

  const passCount = criteria.filter(c => c.score === 1).length;
  const partialCount = criteria.filter(c => c.score === 0.5).length;
  const failCount = criteria.filter(c => c.score === 0).length;

  // Calculate final grade letter
  const getGradeLetter = (percentage: number) => {
    if (percentage >= 90) return { letter: 'A', color: 'text-green-600', bg: 'bg-green-50' };
    if (percentage >= 80) return { letter: 'B', color: 'text-blue-600', bg: 'bg-blue-50' };
    if (percentage >= 70) return { letter: 'C', color: 'text-yellow-600', bg: 'bg-yellow-50' };
    if (percentage >= 60) return { letter: 'D', color: 'text-orange-600', bg: 'bg-orange-50' };
    return { letter: 'F', color: 'text-red-600', bg: 'bg-red-50' };
  };

  const gradeInfo = getGradeLetter(percentage);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-bold text-gray-900">Assessment Score</h2>
        <p className="text-sm text-gray-600 mt-1">Era Match v2 with Partial Credit</p>
      </div>

      {/* Score Summary - Three columns */}
      <div className="grid grid-cols-3 gap-4">
        {/* Pass - Full credit */}
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-green-600 mb-2">{passCount}</div>
          <div className="text-sm text-gray-700 font-medium">Full Pass</div>
          <div className="text-xs text-gray-600 mt-1">Score = 1.0</div>
        </div>

        {/* Partial - Half credit */}
        <div
          className={`${
            partialCount > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 border border-gray-200'
          } rounded-lg p-4 text-center`}
        >
          <div className={`text-3xl font-bold mb-2 ${partialCount > 0 ? 'text-yellow-600' : 'text-gray-400'}`}>
            {partialCount}
          </div>
          <div className="text-sm text-gray-700 font-medium">Partial Pass</div>
          <div className="text-xs text-gray-600 mt-1">Score = 0.5</div>
        </div>

        {/* Fail - No credit */}
        <div
          className={`${
            failCount > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'
          } rounded-lg p-4 text-center`}
        >
          <div className={`text-3xl font-bold mb-2 ${failCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {failCount}
          </div>
          <div className="text-sm text-gray-700 font-medium">Fail</div>
          <div className="text-xs text-gray-600 mt-1">Score = 0.0</div>
        </div>
      </div>

      {/* Grade Letter - Large display */}
      <div className={`${gradeInfo.bg} rounded-lg p-6 text-center`}>
        <div className={`text-6xl font-bold ${gradeInfo.color} mb-2`}>
          {gradeInfo.letter}
        </div>
        <div className="text-2xl font-semibold text-gray-800">{percentage.toFixed(1)}%</div>
        <div className="text-sm text-gray-600 mt-2">
          Final Score: {final_score.toFixed(2)} / 1.00
        </div>
      </div>

      {/* Progress bar with three sections */}
      <div className="space-y-2">
        <div className="text-sm font-medium text-gray-700">Score Breakdown</div>
        <div className="flex gap-1 h-8 rounded-lg overflow-hidden bg-gray-100 border border-gray-300">
          {/* Pass section */}
          {passCount > 0 && (
            <div
              className="bg-green-500 flex items-center justify-center text-white text-xs font-bold"
              style={{ width: `${(passCount / criteria.length) * 100}%` }}
              title={`${passCount} full pass (${((passCount / criteria.length) * 100).toFixed(0)}%)`}
            >
              {passCount > 1 ? passCount : ''}
            </div>
          )}
          {/* Partial section */}
          {partialCount > 0 && (
            <div
              className="bg-yellow-400 flex items-center justify-center text-gray-900 text-xs font-bold"
              style={{ width: `${(partialCount / criteria.length) * 100}%` }}
              title={`${partialCount} partial (${((partialCount / criteria.length) * 100).toFixed(0)}%)`}
            >
              {partialCount}
            </div>
          )}
          {/* Fail section */}
          {failCount > 0 && (
            <div
              className="bg-red-500 flex items-center justify-center text-white text-xs font-bold"
              style={{ width: `${(failCount / criteria.length) * 100}%` }}
              title={`${failCount} fail (${((failCount / criteria.length) * 100).toFixed(0)}%)`}
            >
              {failCount}
            </div>
          )}
        </div>
        <div className="flex justify-between text-xs text-gray-600">
          <span>Pass: {passCount}</span>
          <span>Partial: {partialCount}</span>
          <span>Fail: {failCount}</span>
          <span>Total: {criteria.length}</span>
        </div>
      </div>

      {/* Partial credit note (if applicable) */}
      {partial_credit_awarded && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-gray-900 text-sm">Partial Credit Applied</h4>
            <p className="text-sm text-gray-700 mt-1">
              One or more criteria awarded partial credit (0.5) for demonstrating partial understanding. This
              recognizes work that is conceptually correct but incomplete or uses non-standard terminology.
            </p>
          </div>
        </div>
      )}

      {/* Detailed criteria breakdown */}
      <div className="space-y-3">
        <h3 className="font-semibold text-gray-900 text-sm">Criterion Breakdown</h3>
        <div className="space-y-2">
          {criteria.map((criterion, idx) => (
            <div
              key={idx}
              className={`p-4 rounded-lg border-2 ${getScoreBgColor(criterion.score)} ${getScoreBorder(
                criterion.score
              )}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span
                      className={`text-2xl font-bold ${
                        criterion.score === 1
                          ? 'text-green-600'
                          : criterion.score === 0.5
                            ? 'text-yellow-600'
                            : 'text-red-600'
                      }`}
                    >
                      {getScoreIcon(criterion.score)}
                    </span>
                    <h4 className="font-semibold text-gray-900">{criterion.criterion}</h4>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        criterion.score === 1
                          ? 'bg-green-200 text-green-800'
                          : criterion.score === 0.5
                            ? 'bg-yellow-200 text-yellow-800'
                            : 'bg-red-200 text-red-800'
                      }`}
                    >
                      {getScoreLabel(criterion.score)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mb-2">{criterion.feedback}</p>
                  {criterion.partial_reason && criterion.score === 0.5 && (
                    <div className="text-xs text-yellow-700 bg-yellow-100 px-2 py-1 rounded inline-block">
                      Partial: {criterion.partial_reason}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className={`text-lg font-bold ${
                    criterion.score === 1
                      ? 'text-green-600'
                      : criterion.score === 0.5
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}>
                    {criterion.score.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">{Math.round(criterion.confidence * 100)}% confident</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer info */}
      <div className="pt-4 border-t border-gray-200 text-xs text-gray-600 space-y-1">
        <p>
          <strong>Partial Credit:</strong> A score of 0.5 means the candidate demonstrated understanding of the
          concept but the explanation was incomplete, used non-standard terminology, or had minor errors.
        </p>
        <p>
          <strong>Scoring Scale:</strong> 0 = Does not meet criterion | 0.5 = Partially meets criterion | 1 = Fully
          meets criterion
        </p>
      </div>
    </div>
  );
};

export default PartialCreditVisualization;
