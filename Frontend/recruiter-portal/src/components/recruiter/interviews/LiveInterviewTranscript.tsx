import { Play, Clock, User, MessageCircle, Award } from 'lucide-react';

interface TranscriptEntry {
  timestamp: string;
  speaker: 'Interviewer' | 'Candidate';
  text: string;
}

interface LiveInterviewTranscriptProps {
  completedAt: string;
  duration: string;
  interviewer: string;
  overallScore: number;
  transcript: TranscriptEntry[];
  notes: string;
  strengths?: string[];
  areasToExplore?: string[];
}

export function LiveInterviewTranscript({
  completedAt,
  duration,
  interviewer,
  overallScore,
  transcript,
  notes,
  strengths = [
    'Clear and articulate communication',
    'Strong technical depth in discussed topics',
    'Good cultural fit and team collaboration mindset'
  ],
  areasToExplore = [
    'Leadership experience in larger teams',
    'Conflict resolution scenarios',
    'Long-term career goals alignment'
  ]
}: LiveInterviewTranscriptProps) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-[12px] p-5 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <Play size={20} className="text-purple-600" />
            <span className="text-[11px] font-semibold text-purple-700 bg-purple-200 px-2 py-1 rounded-full">
              Live
            </span>
          </div>
          <div className="text-[32px] font-bold text-purple-900">{overallScore}%</div>
          <div className="text-[12px] text-purple-700 font-medium">Overall Score</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-[12px] p-5 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <Clock size={20} className="text-blue-600" />
            <span className="text-[11px] font-semibold text-blue-700 bg-blue-200 px-2 py-1 rounded-full">
              Time
            </span>
          </div>
          <div className="text-[32px] font-bold text-blue-900">{duration}</div>
          <div className="text-[12px] text-blue-700 font-medium">Duration</div>
        </div>

        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-[12px] p-5 border border-emerald-200">
          <div className="flex items-center justify-between mb-2">
            <User size={20} className="text-emerald-600" />
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-200 px-2 py-1 rounded-full">
              Host
            </span>
          </div>
          <div className="text-[16px] font-bold text-emerald-900 mt-1">{interviewer}</div>
          <div className="text-[12px] text-emerald-700 font-medium">Interviewer</div>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-[12px] p-5 border border-amber-200">
          <div className="flex items-center justify-between mb-2">
            <MessageCircle size={20} className="text-amber-600" />
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-200 px-2 py-1 rounded-full">
              {transcript.length}
            </span>
          </div>
          <div className="text-[18px] font-bold text-amber-900">{completedAt}</div>
          <div className="text-[12px] text-amber-700 font-medium">Interview Date</div>
        </div>
      </div>

      {/* Interview Transcript */}
      <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[#111827] flex items-center gap-2">
            <MessageCircle size={18} className="text-[#6366f1]" />
            Full Interview Transcript
          </h3>
          <span className="text-[12px] text-[#6b7280] bg-gray-100 px-3 py-1 rounded-full">
            {transcript.length} exchanges
          </span>
        </div>

        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {transcript.map((entry, index) => (
            <div
              key={index}
              className={`flex gap-4 ${entry.speaker === 'Interviewer' ? 'justify-start' : 'justify-end'
                }`}
            >
              <div
                className={`max-w-[80%] ${entry.speaker === 'Interviewer'
                    ? 'bg-blue-50 border-blue-200'
                    : 'bg-purple-50 border-purple-200'
                  } border rounded-[12px] p-4`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center ${entry.speaker === 'Interviewer'
                        ? 'bg-blue-200 text-blue-700'
                        : 'bg-purple-200 text-purple-700'
                      }`}
                  >
                    {entry.speaker === 'Interviewer' ? 'I' : 'C'}
                  </div>
                  <div>
                    <div
                      className={`font-semibold text-[13px] ${entry.speaker === 'Interviewer' ? 'text-blue-900' : 'text-purple-900'
                        }`}
                    >
                      {entry.speaker}
                    </div>
                    <div className="text-[11px] text-[#6b7280]">{entry.timestamp}</div>
                  </div>
                </div>
                <p
                  className={`text-[14px] leading-relaxed ${entry.speaker === 'Interviewer' ? 'text-blue-900' : 'text-purple-900'
                    }`}
                >
                  {entry.text}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Interviewer Notes */}
      <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-[12px] p-6">
        <h4 className="font-semibold text-[#111827] mb-3 flex items-center gap-2">
          <Award size={16} className="text-indigo-600" />
          Interviewer Notes & Feedback
        </h4>
        <p className="text-[14px] text-[#374151] leading-relaxed whitespace-pre-line">{notes}</p>
      </div>

      {/* Performance Highlights */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-emerald-200 rounded-[12px] p-5">
          <h5 className="font-semibold text-emerald-900 mb-3 flex items-center gap-2">
            <Award size={14} className="text-emerald-600" />
            Key Strengths
          </h5>
          <ul className="space-y-2">
            {strengths.map((point, index) => (
              <li key={index} className="flex items-start gap-2 text-[13px] text-[#374151]">
                <span className="text-emerald-600 mt-0.5">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white border border-amber-200 rounded-[12px] p-5">
          <h5 className="font-semibold text-amber-900 mb-3 flex items-center gap-2">
            <MessageCircle size={14} className="text-amber-600" />
            Areas to Explore Further
          </h5>
          <ul className="space-y-2">
            {areasToExplore.map((point, index) => (
              <li key={index} className="flex items-start gap-2 text-[13px] text-[#374151]">
                <span className="text-amber-600 mt-0.5">•</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
