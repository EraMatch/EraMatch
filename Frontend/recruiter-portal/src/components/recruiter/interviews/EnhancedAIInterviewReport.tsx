import { useState } from 'react';
import { Video, MessageCircle, ThumbsUp, ThumbsDown, Clock, Eye, X, BarChart3, TrendingUp, Target, Award } from 'lucide-react';

interface QuestionMetrics {
  question: string;
  score: number;
  metrics: {
    clarity: number;
    relevance: number;
    depth: number;
    communication: number;
  };
  answer: string;
  feedback: string;
  duration: string;
}

interface EnhancedAIInterviewReportProps {
  completedAt: string;
  duration: string;
  overallScore: number;
  questions: QuestionMetrics[];
  overallFeedback: string;
}

export function EnhancedAIInterviewReport({
  completedAt,
  duration,
  overallScore,
  questions,
  overallFeedback
}: EnhancedAIInterviewReportProps) {
  const [selectedTranscript, setSelectedTranscript] = useState<number | null>(null);

  const averageMetrics = {
    clarity: questions.reduce((sum, q) => sum + q.metrics.clarity, 0) / questions.length,
    relevance: questions.reduce((sum, q) => sum + q.metrics.relevance, 0) / questions.length,
    depth: questions.reduce((sum, q) => sum + q.metrics.depth, 0) / questions.length,
    communication: questions.reduce((sum, q) => sum + q.metrics.communication, 0) / questions.length,
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 rounded-[12px] p-5 border border-indigo-200">
          <div className="flex items-center justify-between mb-2">
            <Video size={20} className="text-indigo-600" />
            <span className="text-[11px] font-semibold text-indigo-700 bg-indigo-200 px-2 py-1 rounded-full">
              Score
            </span>
          </div>
          <div className="text-[32px] font-bold text-indigo-900">{overallScore}%</div>
          <div className="text-[12px] text-indigo-700 font-medium">Overall Performance</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-[12px] p-5 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <ThumbsUp size={20} className="text-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-200 px-2 py-1 rounded-full">
              Avg
            </span>
          </div>
          <div className="text-[32px] font-bold text-emerald-900">{averageMetrics.clarity.toFixed(1)}</div>
          <div className="text-[12px] text-emerald-700 font-medium">Clarity Score</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-[12px] p-5 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <Clock size={20} className="text-purple-600" />
            <span className="text-[11px] font-semibold text-purple-700 bg-purple-200 px-2 py-1 rounded-full">
              Time
            </span>
          </div>
          <div className="text-[32px] font-bold text-purple-900">{duration}</div>
          <div className="text-[12px] text-purple-700 font-medium">Total Duration</div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-[12px] p-5 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <MessageCircle size={20} className="text-amber-600" />
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-200 px-2 py-1 rounded-full">
              {questions.length}
            </span>
          </div>
          <div className="text-[18px] font-bold text-amber-900">{completedAt}</div>
          <div className="text-[12px] text-amber-700 font-medium">Interview Date</div>
        </div>
      </div>

      {/* Average Metrics Breakdown */}
      <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-6">
        <h3 className="text-[#111827] mb-4 flex items-center gap-2">
          <BarChart3 size={18} className="text-[#6366f1]" />
          Average Performance Metrics
        </h3>
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Clarity', value: averageMetrics.clarity, icon: MessageCircle, color: 'emerald' },
            { label: 'Relevance', value: averageMetrics.relevance, icon: Target, color: 'blue' },
            { label: 'Depth', value: averageMetrics.depth, icon: TrendingUp, color: 'purple' },
            { label: 'Communication', value: averageMetrics.communication, icon: Award, color: 'amber' }
          ].map((metric, index) => {
            const Icon = metric.icon;
            return (
              <div key={index} className="text-center">
                <div className="flex items-center justify-center mb-2">
                  <Icon size={16} className={`text-${metric.color}-600`} />
                </div>
                <div className={`text-[24px] font-bold text-${metric.color}-900 mb-1`}>
                  {metric.value.toFixed(1)}/10
                </div>
                <div className="text-[12px] text-[#6b7280] font-medium mb-2">{metric.label}</div>
                <div className="w-full h-[6px] bg-[#e5e7eb] rounded-full overflow-hidden">
                  <div
                    className={`h-full bg-${metric.color}-500 rounded-full`}
                    style={{ width: `${(metric.value / 10) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Question-by-Question Analysis */}
      <div>
        <h3 className="text-[#111827] mb-4 flex items-center gap-2">
          <MessageCircle size={18} className="text-[#6366f1]" />
          Question-by-Question Analysis
        </h3>
        <div className="space-y-4">
          {questions.map((q, index) => (
            <div
              key={index}
              className="bg-white border border-[#e5e7eb] rounded-[12px] p-6 hover:shadow-md transition-shadow"
            >
              {/* Question Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                      <span className="font-bold text-[14px] text-indigo-700">Q{index + 1}</span>
                    </div>
                    <h4 className="font-semibold text-[#111827] text-[15px]">{q.question}</h4>
                  </div>
                  <div className="flex items-center gap-4 text-[12px] text-[#6b7280] ml-11">
                    <div className="flex items-center gap-1">
                      <Clock size={12} />
                      <span>{q.duration}</span>
                    </div>
                  </div>
                </div>

                <div className="text-right ml-4">
                  <div className="text-[28px] font-bold text-[#6366f1]">{q.score}/10</div>
                  <div className="text-[11px] text-[#6b7280] font-medium">Score</div>
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Clarity', value: q.metrics.clarity, color: 'emerald' },
                  { label: 'Relevance', value: q.metrics.relevance, color: 'blue' },
                  { label: 'Depth', value: q.metrics.depth, color: 'purple' },
                  { label: 'Communication', value: q.metrics.communication, color: 'amber' }
                ].map((metric, idx) => (
                  <div key={idx} className={`bg-${metric.color}-50 rounded-[8px] p-3 border border-${metric.color}-200`}>
                    <div className="text-[11px] text-[#6b7280] mb-1">{metric.label}</div>
                    <div className={`text-[20px] font-bold text-${metric.color}-900`}>
                      {metric.value.toFixed(1)}
                    </div>
                    <div className="w-full h-[4px] bg-white rounded-full mt-2 overflow-hidden">
                      <div
                        className={`h-full bg-${metric.color}-500 rounded-full`}
                        style={{ width: `${(metric.value / 10) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Feedback */}
              <div className="bg-blue-50 border border-blue-200 rounded-[8px] p-4 mb-3">
                <div className="text-[12px] font-semibold text-blue-900 mb-2">AI Evaluation Feedback:</div>
                <p className="text-[13px] text-blue-800 leading-relaxed">{q.feedback}</p>
              </div>

              {/* View Transcript Button */}
              <button
                onClick={() => setSelectedTranscript(selectedTranscript === index ? null : index)}
                className="flex items-center gap-2 px-4 py-2 rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] text-white text-[13px] transition-colors"
              >
                <Eye size={14} />
                {selectedTranscript === index ? 'Hide Transcript' : 'View Transcript'}
              </button>

              {/* Transcript */}
              {selectedTranscript === index && (
                <div className="mt-4 bg-gray-50 border border-gray-200 rounded-[8px] p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <MessageCircle size={16} className="text-[#6366f1]" />
                      <span className="font-semibold text-[14px] text-[#111827]">Answer Transcript</span>
                    </div>
                    <span className="text-[12px] text-[#6b7280]">{q.duration}</span>
                  </div>
                  <div className="bg-white rounded-[8px] p-4 border border-gray-300">
                    <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-line">
                      {q.answer}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Overall Feedback */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-[12px] p-6">
        <h4 className="font-semibold text-[#111827] mb-3 flex items-center gap-2">
          <Award size={16} className="text-indigo-600" />
          Overall Interview Feedback
        </h4>
        <p className="text-[14px] text-[#374151] leading-relaxed">{overallFeedback}</p>
      </div>
    </div>
  );
}
