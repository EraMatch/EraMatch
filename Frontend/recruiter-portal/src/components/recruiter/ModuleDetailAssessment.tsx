import { useState, useEffect } from 'react';
import { X, ChevronLeft, AlertTriangle, Clock, CheckCircle, FileText, Flag, MessageSquare, TrendingUp } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../../services/api';

interface Question {
  id: number;
  text: string;
  answer: string;
  timeSpent: number;
  flagged: boolean;
}

interface IntegritySignal {
  id: number;
  type: 'tab-switch' | 'copy-paste' | 'suspicious-timing' | 'multiple-attempts';
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  description: string;
  evidence: string;
}

interface ModuleDetailAssessmentProps {
  candidateId: number;
  candidateName: string;
  score: number;
  completedDate: string;
  onClose: () => void;
  onMoveToNextStage: () => void;
}

export function ModuleDetailAssessment({
  candidateId,
  candidateName,
  score,
  completedDate,
  onClose,
  onMoveToNextStage
}: ModuleDetailAssessmentProps) {
  const [note, setNote] = useState('');
  const [showEscalateModal, setShowEscalateModal] = useState(false);

  const [questions, setQuestions] = useState<Question[]>([]);
  const [integritySignals, setIntegritySignals] = useState<IntegritySignal[]>([]);
  const [performanceMetrics, setPerformanceMetrics] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAssessmentDetails = async () => {
      try {
        setLoading(true);
        const data: any = await api.recruiter.getAssessmentDetails(candidateId);
        setQuestions(data.questions || []);
        setIntegritySignals(data.integritySignals || []);
        if (data.performanceMetrics) {
          setPerformanceMetrics(data.performanceMetrics);
        } else {
          // Fallback default metrics if API doesn't return them
          setPerformanceMetrics([
            { label: 'Technical Accuracy', value: 90, color: 'bg-[#10b981]' },
            { label: 'Code Quality', value: 85, color: 'bg-[#3b82f6]' },
            { label: 'Best Practices', value: 88, color: 'bg-[#6366f1]' },
            { label: 'Problem Solving', value: 82, color: 'bg-[#8b5cf6]' }
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch assessment details:', error);
        // Fallback default metrics on error
        setPerformanceMetrics([
          { label: 'Technical Accuracy', value: 90, color: 'bg-[#10b981]' },
          { label: 'Code Quality', value: 85, color: 'bg-[#3b82f6]' },
          { label: 'Best Practices', value: 88, color: 'bg-[#6366f1]' },
          { label: 'Problem Solving', value: 82, color: 'bg-[#8b5cf6]' }
        ]);
      } finally {
        setLoading(false);
      }
    };

    fetchAssessmentDetails();
  }, [candidateId]);

  const totalTime = questions.reduce((sum, q) => sum + q.timeSpent, 0);
  const avgTimePerQuestion = totalTime / questions.length;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'text-[#ef4444] bg-[#fef2f2] border-[#fecaca]';
      case 'medium':
        return 'text-[#f59e0b] bg-[#fffbeb] border-[#fde68a]';
      case 'low':
        return 'text-[#3b82f6] bg-[#eff6ff] border-[#bfdbfe]';
      default:
        return 'text-[#6b7280] bg-[#f9fafb] border-[#e5e7eb]';
    }
  };

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] px-8 py-6 sticky top-0 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onClose}
                className="w-[36px] h-[36px] rounded-[8px] bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <ChevronLeft size={20} className="text-white" />
              </button>
              <div>
                <h2 className="text-white text-[20px] mb-1">Assessment Details</h2>
                <div className="flex items-center gap-3">
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white/90">
                    {candidateName}
                  </span>
                  <span className="text-white/60">•</span>
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white/90">
                    Completed {completedDate}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="font-['Arimo',sans-serif] text-[12px] text-white/80 mb-1">
                  Overall Score
                </div>
                <div className="text-white text-[32px] leading-none">
                  {score}%
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-[36px] h-[36px] rounded-[8px] bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              >
                <X size={20} className="text-white" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-12 gap-6 p-8">
            {/* Left Column - Questions */}
            <div className="col-span-5 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#111827] text-[16px]">Questions & Answers</h3>
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                  {questions.length} questions
                </span>
              </div>
              {questions.map((question, index) => (
                <div
                  key={question.id}
                  className={`bg-white border rounded-[12px] p-5 transition-all ${question.flagged
                    ? 'border-[#fecaca] bg-[#fef2f2]'
                    : 'border-[#e5e7eb] hover:border-[#6366f1]'
                    }`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-[28px] h-[28px] rounded-full bg-[#6366f1] flex items-center justify-center flex-shrink-0">
                      <span className="font-['Arimo',sans-serif] text-[13px] text-white">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-3">
                        {question.text}
                      </div>
                      <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-[8px] p-3 mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText size={14} className="text-[#6b7280]" />
                          <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                            CANDIDATE ANSWER
                          </span>
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[13px] text-[#374151] leading-relaxed">
                          {question.answer}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-1">
                          <Clock size={14} className="text-[#6b7280]" />
                          <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                            {Math.floor(question.timeSpent / 60)}m {question.timeSpent % 60}s
                          </span>
                        </div>
                        {question.flagged && (
                          <div className="flex items-center gap-1">
                            <Flag size={14} className="text-[#ef4444]" />
                            <span className="font-['Arimo',sans-serif] text-[12px] text-[#ef4444]">
                              Flagged
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Middle Column - Metrics */}
            <div className="col-span-4 space-y-4">
              <h3 className="text-[#111827] text-[16px] mb-4">Performance Metrics</h3>

              {/* Score Breakdown */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingUp size={16} className="text-[#6366f1]" />
                  <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Score Components
                  </h4>
                </div>
                <div className="space-y-3">
                  {performanceMetrics.map((component, index) => (
                    <div key={index}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                          {component.label}
                        </span>
                        <span className="font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                          {component.value}%
                        </span>
                      </div>
                      <div className="w-full h-[6px] bg-[#f3f4f6] rounded-full overflow-hidden">
                        <div
                          className={`h-full ${component.color} transition-all`}
                          style={{ width: `${component.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Time Analysis */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock size={16} className="text-[#6366f1]" />
                  <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Time Analysis
                  </h4>
                </div>
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-[#e5e7eb]">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Total Time
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                      {Math.floor(totalTime / 60)} minutes
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-[#e5e7eb]">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Avg per Question
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                      {Math.floor(avgTimePerQuestion / 60)}m {Math.floor(avgTimePerQuestion % 60)}s
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                      Fastest Answer
                    </span>
                    <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                      2m 40s
                    </span>
                  </div>
                </div>
              </div>

              {/* Response Time Chart */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-4">
                  Response Times by Question
                </h4>
                <div className="flex items-end justify-between gap-2 h-[120px]">
                  {questions.map((question, index) => (
                    <div key={index} className="flex-1 flex flex-col items-center">
                      <div
                        className={`w-full ${question.flagged ? 'bg-[#ef4444]' : 'bg-[#6366f1]'
                          } rounded-t-[4px] transition-all hover:opacity-80`}
                        style={{
                          height: `${(question.timeSpent / 420) * 100}%`
                        }}
                      />
                      <span className="font-['Arimo',sans-serif] text-[10px] text-[#6b7280] mt-2">
                        Q{index + 1}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column - Integrity Signals */}
            <div className="col-span-3 space-y-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[#111827] text-[16px]">Integrity Signals</h3>
                <span className={`px-[8px] py-[2px] rounded-[4px] font-['Arimo',sans-serif] text-[11px] ${integritySignals.length > 0
                  ? 'bg-[#fef2f2] text-[#ef4444]'
                  : 'bg-[#dcfce7] text-[#10b981]'
                  }`}>
                  {integritySignals.length} alerts
                </span>
              </div>

              {integritySignals.length > 0 ? (
                <div className="space-y-3">
                  {integritySignals.map((signal) => (
                    <div
                      key={signal.id}
                      className={`border rounded-[12px] p-4 ${getSeverityColor(signal.severity)}`}
                    >
                      <div className="flex items-start gap-3 mb-3">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                        <div className="flex-1">
                          <div className="font-['Arimo',sans-serif] text-[13px] mb-1">
                            {signal.description}
                          </div>
                          <div className="font-['Arimo',sans-serif] text-[11px] opacity-80">
                            {signal.evidence}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-[11px] opacity-70">
                        <span className="font-['Arimo',sans-serif]">
                          {signal.timestamp}
                        </span>
                        <span className="font-['Arimo',sans-serif] uppercase">
                          {signal.severity}
                        </span>
                      </div>
                    </div>
                  ))}

                  <button className="w-full h-[36px] px-[14px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#111827] transition-colors">
                    Re-run Integrity Detection
                  </button>
                </div>
              ) : (
                <div className="bg-[#dcfce7] border border-[#86efac] rounded-[12px] p-6 text-center">
                  <CheckCircle size={32} className="text-[#10b981] mx-auto mb-3" />
                  <div className="font-['Arimo',sans-serif] text-[14px] text-[#10b981] mb-1">
                    No Issues Detected
                  </div>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#059669]">
                    Assessment completed without integrity concerns
                  </p>
                </div>
              )}

              {/* Notes Section */}
              <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={16} className="text-[#6b7280]" />
                  <h4 className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                    Add Note
                  </h4>
                </div>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add internal notes about this assessment..."
                  className="w-full h-[100px] px-[12px] py-[10px] border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[13px] text-[#111827] placeholder-[#9ca3af] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <button className="w-full mt-3 h-[32px] px-[14px] rounded-[6px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[13px] text-white transition-colors">
                  Save Note
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="border-t border-[#e5e7eb] px-8 py-4 bg-[#f9fafb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowEscalateModal(true)}
                className="h-[36px] px-[16px] rounded-[8px] border border-[#ef4444] text-[#ef4444] hover:bg-[#fef2f2] font-['Arimo',sans-serif] text-[13px] transition-colors"
              >
                Escalate Issue
              </button>
              <button className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#111827] transition-colors">
                Download Report
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#111827] transition-colors"
              >
                Close
              </button>
              <button
                onClick={onMoveToNextStage}
                className="h-[36px] px-[16px] rounded-[8px] bg-[#10b981] hover:bg-[#059669] font-['Arimo',sans-serif] text-[13px] text-white transition-colors"
              >
                Move to Next Stage
              </button>
            </div>
          </div>
        </div>

        {/* Escalate Modal */}
        {showEscalateModal && (
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center" onClick={() => setShowEscalateModal(false)}>
            <div className="bg-white rounded-[12px] p-6 w-[400px]" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-[#111827] text-[16px] mb-4">Escalate to HR</h3>
              <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-4">
                This will flag the assessment for HR review and notify the assigned recruiter.
              </p>
              <textarea
                placeholder="Reason for escalation..."
                className="w-full h-[80px] px-[12px] py-[10px] border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[13px] mb-4 resize-none"
              />
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setShowEscalateModal(false)}
                  className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] text-[#111827]"
                >
                  Cancel
                </button>
                <button className="h-[36px] px-[16px] rounded-[8px] bg-[#ef4444] hover:bg-[#dc2626] font-['Arimo',sans-serif] text-[13px] text-white">
                  Escalate
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}