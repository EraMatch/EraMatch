/**
 * RubricAnomalyDashboard – Era Match v2 Frontend
 * Dashboard for monitoring rubric performance and detecting statistical anomalies
 */
import React, { useState } from 'react';
import {
  AlertTriangle,
  TrendingUp,
  BarChart3,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';

interface RubricCriterion {
  name: string;
  total_responses: number;
  failure_count: number;
  failure_rate: number;
  anomaly_detected: boolean;
  anomaly_type?: string;
  anomaly_severity?: 'low' | 'medium' | 'high';
  anomaly_message?: string;
}

interface RubricAnomalyDashboardProps {
  criteria: RubricCriterion[];
  assessment_name: string;
  last_updated?: string;
  onRefresh?: () => void;
}

export const RubricAnomalyDashboard: React.FC<RubricAnomalyDashboardProps> = ({
  criteria,
  assessment_name,
  last_updated,
  onRefresh,
}) => {
  const [expandedCriterion, setExpandedCriterion] = useState<string | null>(null);

  const anomalyCriteria = criteria.filter(c => c.anomaly_detected);
  const normalCriteria = criteria.filter(c => !c.anomaly_detected);

  // Calculate statistics
  const totalResponses = criteria.reduce((sum, c) => sum + c.total_responses, 0);
  const totalFailures = criteria.reduce((sum, c) => sum + c.failure_count, 0);
  const overallFailureRate = totalResponses > 0 ? totalFailures / totalResponses : 0;

  const getSeverityColor = (severity?: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 border-red-300 text-red-900';
      case 'medium':
        return 'bg-yellow-100 border-yellow-300 text-yellow-900';
      case 'low':
        return 'bg-blue-100 border-blue-300 text-blue-900';
      default:
        return 'bg-gray-100 border-gray-300 text-gray-900';
    }
  };

  const getSeverityBadge = (severity?: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-200 text-red-900';
      case 'medium':
        return 'bg-yellow-200 text-yellow-900';
      case 'low':
        return 'bg-blue-200 text-blue-900';
      default:
        return 'bg-gray-200 text-gray-900';
    }
  };

  const getHealthStatus = () => {
    if (anomalyCriteria.length === 0) {
      return { status: 'Healthy', color: 'text-green-600', icon: CheckCircle };
    }
    const highSeverity = anomalyCriteria.some(c => c.anomaly_severity === 'high');
    if (highSeverity) {
      return { status: 'Critical', color: 'text-red-600', icon: AlertTriangle };
    }
    return { status: 'Warning', color: 'text-yellow-600', icon: AlertTriangle };
  };

  const health = getHealthStatus();
  const HealthIcon = health.icon;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-50 to-blue-100 border-b border-blue-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Rubric Health Monitor</h2>
            <p className="text-gray-700">{assessment_name}</p>
            {last_updated && (
              <p className="text-sm text-gray-600 mt-2">Last updated: {last_updated}</p>
            )}
          </div>

          <div className="text-right">
            <div className={`text-3xl font-bold ${health.color} mb-2 flex items-center justify-end gap-2`}>
              <HealthIcon className="w-8 h-8" />
              {health.status}
            </div>
            <button
              onClick={onRefresh}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium flex items-center gap-2 ml-auto"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Overall Statistics */}
      <div className="grid grid-cols-4 gap-4 p-6 border-b border-gray-200 bg-gray-50">
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{criteria.length}</div>
          <div className="text-sm text-gray-600">Total Criteria</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{normalCriteria.length}</div>
          <div className="text-sm text-gray-600">Normal</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-orange-600">{anomalyCriteria.length}</div>
          <div className="text-sm text-gray-600">Anomalies</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-lg p-4 text-center">
          <div className="text-2xl font-bold text-gray-900">{(overallFailureRate * 100).toFixed(1)}%</div>
          <div className="text-sm text-gray-600">Overall Fail Rate</div>
        </div>
      </div>

      {/* Anomalies Section */}
      {anomalyCriteria.length > 0 && (
        <div className="border-b border-gray-200">
          <div className="bg-red-50 border-b border-red-200 px-6 py-4">
            <h3 className="font-semibold text-red-900 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Detected Anomalies ({anomalyCriteria.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-200">
            {anomalyCriteria.map((criterion, idx) => (
              <div
                key={idx}
                className={`p-4 border-l-4 cursor-pointer hover:bg-gray-50 ${getSeverityColor(criterion.anomaly_severity)}`}
                onClick={() => setExpandedCriterion(expandedCriterion === criterion.name ? null : criterion.name)}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-1">{criterion.name}</h4>
                    <p className="text-sm mb-2">{criterion.anomaly_message}</p>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            criterion.failure_rate > 0.9
                              ? 'bg-red-500'
                              : criterion.failure_rate > 0.7
                                ? 'bg-orange-500'
                                : 'bg-yellow-500'
                          }`}
                          style={{ width: `${criterion.failure_rate * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold w-16 text-right">
                        {(criterion.failure_rate * 100).toFixed(1)}%
                      </span>
                    </div>

                    <div className="text-xs text-gray-600">
                      {criterion.failure_count} failures out of {criterion.total_responses} responses
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${getSeverityBadge(
                        criterion.anomaly_severity
                      )}`}
                    >
                      {criterion.anomaly_severity?.toUpperCase() || 'UNKNOWN'}
                    </span>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedCriterion === criterion.name && (
                  <div className="mt-4 p-4 bg-white rounded-lg border border-gray-200 space-y-3">
                    <div>
                      <h5 className="font-semibold text-gray-900 text-sm mb-2">Recommendations:</h5>
                      <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                        <li>Review rubric criteria for clarity and achievability</li>
                        <li>Consider if criteria are too strict or ambiguous</li>
                        <li>Check if students understand evaluation expectations</li>
                        <li>Gather qualitative feedback from candidates</li>
                      </ul>
                    </div>

                    <div>
                      <h5 className="font-semibold text-gray-900 text-sm mb-2">Actions:</h5>
                      <div className="flex gap-2">
                        <button className="px-3 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">
                          Review Responses
                        </button>
                        <button className="px-3 py-2 bg-gray-200 text-gray-900 rounded text-sm hover:bg-gray-300">
                          Adjust Criteria
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Normal Criteria Section */}
      {normalCriteria.length > 0 && (
        <div>
          <div className="bg-green-50 border-b border-green-200 px-6 py-4">
            <h3 className="font-semibold text-green-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5" />
              Healthy Criteria ({normalCriteria.length})
            </h3>
          </div>

          <div className="divide-y divide-gray-200">
            {normalCriteria.map((criterion, idx) => (
              <div key={idx} className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900 mb-2">{criterion.name}</h4>

                    {/* Progress bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${(1 - criterion.failure_rate) * 100}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold w-16 text-right">
                        {((1 - criterion.failure_rate) * 100).toFixed(1)}% pass
                      </span>
                    </div>

                    <div className="text-xs text-gray-600 mt-2">
                      {criterion.total_responses - criterion.failure_count} passes out of{' '}
                      {criterion.total_responses} responses
                    </div>
                  </div>

                  <div>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-200 text-green-900">
                      HEALTHY
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Anomalies State */}
      {anomalyCriteria.length === 0 && (
        <div className="p-12 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">All Criteria Healthy</h3>
          <p className="text-gray-600">
            No statistical anomalies detected. Your rubric is performing well with consistent pass rates.
          </p>
        </div>
      )}

      {/* Footer Info */}
      <div className="bg-gray-50 border-t border-gray-200 px-6 py-4 text-xs text-gray-600 space-y-1">
        <p>
          <strong>Anomaly Detection:</strong> Criteria with failure rates exceeding 90% are flagged for review as they
          may indicate unclear or overly strict requirements.
        </p>
        <p>
          <strong>Recommendation:</strong> Review flagged criteria and consider clarifications or adjustments to improve
          student success rates.
        </p>
      </div>
    </div>
  );
};

export default RubricAnomalyDashboard;
