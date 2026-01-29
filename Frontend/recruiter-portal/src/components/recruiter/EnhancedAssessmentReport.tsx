import { BarChart3, CheckCircle, XCircle, Target, TrendingUp } from 'lucide-react';

interface SectionScore {
  section: string;
  totalQuestions: number;
  correctAnswers: number;
  score: number;
  timeSpent: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

interface EnhancedAssessmentReportProps {
  completedAt: string;
  duration: string;
  overallScore: number;
  sections: SectionScore[];
}

export function EnhancedAssessmentReport({
  completedAt,
  duration,
  overallScore,
  sections
}: EnhancedAssessmentReportProps) {
  const totalQuestions = sections.reduce((sum, s) => sum + s.totalQuestions, 0);
  const totalCorrect = sections.reduce((sum, s) => sum + s.correctAnswers, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-[12px] p-5 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 size={20} className="text-blue-600" />
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded-full">
              Overall
            </span>
          </div>
          <div className="text-[32px] font-bold text-blue-900">{overallScore}%</div>
          <div className="text-[12px] text-blue-700 font-medium">Total Score</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-[12px] p-5 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle size={20} className="text-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-200 px-2 py-1 rounded-full">
              {Math.round((totalCorrect / totalQuestions) * 100)}%
            </span>
          </div>
          <div className="text-[32px] font-bold text-emerald-900">{totalCorrect}/{totalQuestions}</div>
          <div className="text-[12px] text-emerald-700 font-medium">Correct Answers</div>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-[12px] p-5 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <Target size={20} className="text-purple-600" />
            <span className="text-[11px] font-semibold text-purple-700 bg-purple-200 px-2 py-1 rounded-full">
              {sections.length}
            </span>
          </div>
          <div className="text-[32px] font-bold text-purple-900">{duration}</div>
          <div className="text-[12px] text-purple-700 font-medium">Time Taken</div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-[12px] p-5 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp size={20} className="text-amber-600" />
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-200 px-2 py-1 rounded-full">
              Date
            </span>
          </div>
          <div className="text-[18px] font-bold text-amber-900">{completedAt}</div>
          <div className="text-[12px] text-amber-700 font-medium">Completed</div>
        </div>
      </div>

      {/* Section Breakdown */}
      <div>
        <h3 className="text-[#111827] mb-4 flex items-center gap-2">
          <BarChart3 size={18} className="text-[#6366f1]" />
          Section-by-Section Performance
        </h3>
        <div className="space-y-4">
          {sections.map((section, index) => {
            const accuracy = (section.correctAnswers / section.totalQuestions) * 100;
            
            return (
              <div
                key={index}
                className="bg-white border border-[#e5e7eb] rounded-[12px] p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold text-[#111827] text-[16px]">{section.section}</h4>
                      <span className={`px-3 py-1 rounded-full text-[11px] font-semibold ${
                        section.difficulty === 'Easy'
                          ? 'bg-green-100 text-green-700'
                          : section.difficulty === 'Medium'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {section.difficulty}
                      </span>
                    </div>
                    <div className="flex items-center gap-6 text-[13px] text-[#6b7280]">
                      <div className="flex items-center gap-2">
                        <CheckCircle size={14} className="text-emerald-600" />
                        <span>{section.correctAnswers} / {section.totalQuestions} correct</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Target size={14} className="text-blue-600" />
                        <span>Time: {section.timeSpent}</span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[32px] font-bold text-[#6366f1]">{section.score}%</div>
                    <div className="text-[11px] text-[#6b7280] font-medium">Section Score</div>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="text-[#6b7280]">Accuracy</span>
                    <span className="font-semibold text-[#111827]">{accuracy.toFixed(1)}%</span>
                  </div>
                  <div className="w-full h-[10px] bg-[#e5e7eb] rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        accuracy >= 80
                          ? 'bg-gradient-to-r from-emerald-500 to-emerald-600'
                          : accuracy >= 60
                          ? 'bg-gradient-to-r from-blue-500 to-blue-600'
                          : 'bg-gradient-to-r from-amber-500 to-amber-600'
                      }`}
                      style={{ width: `${section.score}%` }}
                    />
                  </div>
                </div>

                {/* Performance Indicator */}
                <div className="mt-3 flex items-center gap-2">
                  {section.score >= 80 ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                      <span className="text-[12px] text-emerald-700 font-medium">Excellent Performance</span>
                    </>
                  ) : section.score >= 60 ? (
                    <>
                      <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                      <span className="text-[12px] text-blue-700 font-medium">Good Performance</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                      <span className="text-[12px] text-amber-700 font-medium">Needs Improvement</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Performance Summary */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-[12px] p-6">
        <h4 className="font-semibold text-[#111827] mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-indigo-600" />
          Performance Summary
        </h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-[12px] text-[#6b7280] mb-1">Strongest Section</div>
            <div className="font-semibold text-[#111827]">
              {sections.reduce((prev, current) => (prev.score > current.score ? prev : current)).section}
            </div>
          </div>
          <div>
            <div className="text-[12px] text-[#6b7280] mb-1">Highest Score</div>
            <div className="font-semibold text-[#111827]">
              {Math.max(...sections.map(s => s.score))}%
            </div>
          </div>
          <div>
            <div className="text-[12px] text-[#6b7280] mb-1">Average Time per Section</div>
            <div className="font-semibold text-[#111827]">
              {Math.round(parseInt(duration) / sections.length)} min
            </div>
          </div>
          <div>
            <div className="text-[12px] text-[#6b7280] mb-1">Completion Rate</div>
            <div className="font-semibold text-[#111827]">100%</div>
          </div>
        </div>
      </div>
    </div>
  );
}
