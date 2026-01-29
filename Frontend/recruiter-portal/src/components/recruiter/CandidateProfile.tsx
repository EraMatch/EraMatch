import { useState, useEffect } from 'react';
import { ChevronLeft, Github, Mail, Phone, MapPin, Calendar, AlertTriangle, FileText, Video, BarChart3, Network, MessageSquare, Download, CheckCircle, XCircle, TrendingUp, Play, Clock, ThumbsUp, ThumbsDown, Activity, Eye, MessageCircle, ExternalLink, FileCheck, Smile, Frown, Meh, Loader2 } from 'lucide-react';
import { KnowledgeGraph } from './KnowledgeGraph';
import { EnhancedAssessmentReport } from './EnhancedAssessmentReport';
import { EnhancedAIInterviewReport } from './EnhancedAIInterviewReport';
import { LiveInterviewTranscript } from './LiveInterviewTranscript';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { api } from '../../services/api';

interface CandidateProfileProps {
  candidateId: number;
  onBack: () => void;
  onViewKnowledgeGraph?: () => void;
  showFinalReport?: boolean;
}

type TabType = 'overview' | 'resume' | 'github' | 'assessment' | 'interview' | 'live-interview' | 'notes' | 'knowledge-graph' | 'final-report';

export function CandidateProfile({ candidateId, onBack, onViewKnowledgeGraph, showFinalReport = false }: CandidateProfileProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [showTranscript, setShowTranscript] = useState<number | null>(null);
  const [showLiveTranscript, setShowLiveTranscript] = useState(false);
  const [showAssessmentDetails, setShowAssessmentDetails] = useState(false);
  const [showVideoResponse, setShowVideoResponse] = useState<number | null>(null);
  const [showVideoTranscript, setShowVideoTranscript] = useState<number | null>(null);
  const [showLiveInterviewTranscript, setShowLiveInterviewTranscript] = useState(false);

  const [candidate, setCandidate] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setIsLoading(true);
        const data = await api.candidate.getProfile();
        setCandidate(data);
      } catch (error) {
        console.error("Failed to load profile");
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [candidateId]);

  if (isLoading || !candidate) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#f9fafb]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  // Use data from API response
  const assessmentQuestions = candidate.assessmentQuestions || [];
  const videoInterviewQuestions = candidate.videoInterviewQuestions || [];
  const liveInterviewData = candidate.liveInterviewData || {
    duration: '0:00',
    completedAt: '',
    overallConfidence: 0,
    overallCorrectness: 0,
    emotionMetrics: [],
    transcript: ''
  };

  const tabs = [
    { id: 'overview', label: 'Overview', icon: FileText },
    { id: 'resume', label: 'Resume', icon: FileText },
    { id: 'github', label: 'GitHub', icon: Github },
    { id: 'assessment', label: 'Assessment', icon: BarChart3 },
    { id: 'interview', label: 'AI Interview', icon: Video },
    { id: 'live-interview', label: 'Live Interview', icon: Play },
    { id: 'notes', label: 'Notes', icon: MessageSquare },
    { id: 'knowledge-graph', label: 'Knowledge Graph', icon: Network },
    { id: 'final-report', label: 'Final Report', icon: CheckCircle }
  ];

  return (
    <div className="h-full w-full overflow-auto bg-[#f9fafb]">
      <div className="max-w-[1400px] mx-auto px-[48px] py-[24px]">
        {/* Header */}
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
        >
          <ChevronLeft size={20} />
          <span className="font-['Arimo',sans-serif] text-[14px]">Back</span>
        </button>

        {/* Profile Header */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-8 mb-6">
          <div className="flex items-start gap-6">
            <div className="w-[100px] h-[100px] rounded-[16px] bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-[36px]">
              {candidate.name.split(' ').map((n: string) => n[0]).join('')}
            </div>
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h1 className="text-[#111827] mb-1">{candidate.name}</h1>
                  <p className="font-['Arimo',sans-serif] text-[16px] text-[#6b7280] mb-3">
                    {candidate.title}
                  </p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="flex items-center gap-2 text-[#6b7280]">
                      <Mail size={16} />
                      <span className="font-['Arimo',sans-serif] text-[14px]">{candidate.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#6b7280]">
                      <Phone size={16} />
                      <span className="font-['Arimo',sans-serif] text-[14px]">{candidate.phone}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[#6b7280]">
                      <MapPin size={16} />
                      <span className="font-['Arimo',sans-serif] text-[14px]">{candidate.location}</span>
                    </div>
                  </div>
                </div>
                <button className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors">
                  <Download size={16} className="text-[#6b7280]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                    Download Resume
                  </span>
                </button>
              </div>

              {/* Scores */}
              <div className="grid grid-cols-4 gap-4">
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Overall Score</div>
                  <div className="text-[24px] text-[#111827]">{candidate.scores.overall}</div>
                </div>
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Assessment</div>
                  <div className="text-[24px] text-[#111827]">{candidate.scores.assessment}</div>
                </div>
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">AI Interview</div>
                  <div className="text-[24px] text-[#111827]">{candidate.scores.aiInterview}</div>
                </div>
                <div className="bg-[#f9fafb] rounded-[8px] p-4">
                  <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">GitHub</div>
                  <div className="text-[24px] text-[#111827]">{candidate.scores.github}</div>
                </div>
              </div>

              {candidate.antiCheating && (
                <div className="mt-4 flex items-center gap-2 px-[16px] py-[10px] bg-[#fef2f2] border border-[#fecaca] rounded-[8px]">
                  <AlertTriangle size={18} className="text-[#ef4444]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#ef4444]">
                    Anti-cheating flag detected
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Offer Status Banner */}
        {candidate.pipelineStatus.finalDecision.status === 'completed' && (
          <div className={`rounded-xl border-2 p-6 mb-6 ${candidate.offerStatus === 'sent'
            ? 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-300'
            : candidate.offerStatus === 'accepted'
              ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-400'
              : 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-300'
            }`}>
            <div className="flex items-start gap-4">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${candidate.offerStatus === 'sent'
                ? 'bg-emerald-500'
                : candidate.offerStatus === 'accepted'
                  ? 'bg-green-500'
                  : 'bg-gray-500'
                }`}>
                {candidate.offerStatus === 'sent' || candidate.offerStatus === 'accepted' ? (
                  <Mail className="text-white" size={28} />
                ) : (
                  <XCircle className="text-white" size={28} />
                )}
              </div>
              <div className="flex-1">
                <h3 className={`text-xl font-bold mb-2 ${candidate.offerStatus === 'sent'
                  ? 'text-emerald-900'
                  : candidate.offerStatus === 'accepted'
                    ? 'text-green-900'
                    : 'text-gray-900'
                  }`}>
                  {candidate.offerStatus === 'sent' && 'Offer Sent'}
                  {candidate.offerStatus === 'accepted' && 'Offer Accepted'}
                  {candidate.offerStatus === 'rejected' && 'Not Selected'}
                </h3>
                <p className="text-gray-700 mb-3">
                  {candidate.offerStatus === 'sent' && `An offer was sent to this candidate on ${candidate.pipelineStatus.finalDecision.completedAt}. Awaiting candidate response.`}
                  {candidate.offerStatus === 'accepted' && `Candidate accepted the offer on ${candidate.offerAcceptedDate}. Next steps: Onboarding process.`}
                  {candidate.offerStatus === 'rejected' && 'This candidate was not selected for the position.'}
                </p>
                {candidate.offerStatus === 'sent' && (
                  <div className="flex items-center gap-3">
                    <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
                      <Mail size={16} className="mr-2" />
                      Resend Offer Email
                    </Button>
                    <Button variant="outline" className="border-emerald-600 text-emerald-700 hover:bg-emerald-50">
                      <FileText size={16} className="mr-2" />
                      View Offer Details
                    </Button>
                  </div>
                )}
                {candidate.offerStatus === 'accepted' && (
                  <div className="flex items-center gap-3">
                    <Button className="bg-green-600 hover:bg-green-700 text-white">
                      <CheckCircle size={16} className="mr-2" />
                      Start Onboarding
                    </Button>
                    <Button variant="outline" className="border-green-600 text-green-700 hover:bg-green-50">
                      <FileText size={16} className="mr-2" />
                      View Contract
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
          <div className="border-b border-[#e5e7eb] px-6">
            <div className="flex gap-1 overflow-x-auto">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      if (tab.id === 'knowledge-graph') {
                        onViewKnowledgeGraph?.();
                      } else {
                        setActiveTab(tab.id as TabType);
                      }
                    }}
                    className={`flex items-center gap-2 px-[20px] py-[14px] font-['Arimo',sans-serif] text-[14px] border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
                      ? 'border-[#6366f1] text-[#6366f1]'
                      : 'border-transparent text-[#6b7280] hover:text-[#111827]'
                      }`}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab Content */}
          <div className="p-8">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Recruitment Pipeline Progress */}
                <div>
                  <h3 className="text-[#111827] mb-4">Recruitment Progress</h3>
                  {!candidate.groupAssigned ? (
                    <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                      <div className="text-gray-400 mb-2">
                        <Clock size={48} className="mx-auto" />
                      </div>
                      <h4 className="text-lg font-semibold text-gray-700 mb-1">Not Started</h4>
                      <p className="text-sm text-gray-500">Candidate has not been assigned to a group yet</p>
                    </div>
                  ) : (
                    <div className="bg-white border border-[#e5e7eb] rounded-xl p-6">
                      <div className="relative">
                        {/* Progress Line */}
                        <div className="absolute top-6 left-0 right-0 h-1 bg-gray-200" style={{ zIndex: 0 }}>
                          <div
                            className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-500"
                            style={{
                              width: candidate.pipelineStatus.liveInterview.status === 'completed'
                                ? '100%'
                                : candidate.pipelineStatus.liveInterview.status === 'in-progress'
                                  ? '75%'
                                  : candidate.pipelineStatus.aiInterview.status === 'completed'
                                    ? '66%'
                                    : candidate.pipelineStatus.assessment.status === 'completed'
                                      ? '33%'
                                      : '0%'
                            }}
                          />
                        </div>

                        {/* Pipeline Stages */}
                        <div className="relative grid grid-cols-5 gap-4" style={{ zIndex: 1 }}>
                          {/* Group Assignment */}
                          <div className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 border-4 ${candidate.pipelineStatus.groupAssignment.status === 'completed'
                              ? 'bg-emerald-500 border-emerald-200'
                              : 'bg-gray-300 border-gray-200'
                              }`}>
                              {candidate.pipelineStatus.groupAssignment.status === 'completed' ? (
                                <CheckCircle size={24} className="text-white" />
                              ) : (
                                <Clock size={24} className="text-gray-500" />
                              )}
                            </div>
                            <div className="text-center">
                              <div className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#111827] mb-1">
                                Group Assignment
                              </div>
                              {candidate.pipelineStatus.groupAssignment.completedAt && (
                                <div className="font-['Arimo',sans-serif] text-[10px] text-[#6b7280]">
                                  {candidate.pipelineStatus.groupAssignment.completedAt}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Assessment */}
                          <div className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 border-4 ${candidate.pipelineStatus.assessment.status === 'completed'
                              ? 'bg-emerald-500 border-emerald-200'
                              : candidate.pipelineStatus.assessment.status === 'in-progress'
                                ? 'bg-indigo-500 border-indigo-200'
                                : 'bg-gray-300 border-gray-200'
                              }`}>
                              {candidate.pipelineStatus.assessment.status === 'completed' ? (
                                <CheckCircle size={24} className="text-white" />
                              ) : candidate.pipelineStatus.assessment.status === 'in-progress' ? (
                                <Activity size={24} className="text-white animate-pulse" />
                              ) : (
                                <BarChart3 size={24} className="text-gray-500" />
                              )}
                            </div>
                            <div className="text-center">
                              <div className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#111827] mb-1">
                                Assessment
                              </div>
                              {candidate.pipelineStatus.assessment.completedAt && (
                                <div className="font-['Arimo',sans-serif] text-[10px] text-[#6b7280]">
                                  {candidate.pipelineStatus.assessment.completedAt}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* AI Interview */}
                          <div className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 border-4 ${candidate.pipelineStatus.aiInterview.status === 'completed'
                              ? 'bg-emerald-500 border-emerald-200'
                              : candidate.pipelineStatus.aiInterview.status === 'in-progress'
                                ? 'bg-indigo-500 border-indigo-200'
                                : 'bg-gray-300 border-gray-200'
                              }`}>
                              {candidate.pipelineStatus.aiInterview.status === 'completed' ? (
                                <CheckCircle size={24} className="text-white" />
                              ) : candidate.pipelineStatus.aiInterview.status === 'in-progress' ? (
                                <Activity size={24} className="text-white animate-pulse" />
                              ) : (
                                <Video size={24} className="text-gray-500" />
                              )}
                            </div>
                            <div className="text-center">
                              <div className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#111827] mb-1">
                                AI Video Interview
                              </div>
                              {candidate.pipelineStatus.aiInterview.completedAt && (
                                <div className="font-['Arimo',sans-serif] text-[10px] text-[#6b7280]">
                                  {candidate.pipelineStatus.aiInterview.completedAt}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Live Interview */}
                          <div className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 border-4 ${candidate.pipelineStatus.liveInterview.status === 'completed'
                              ? 'bg-emerald-500 border-emerald-200'
                              : candidate.pipelineStatus.liveInterview.status === 'in-progress'
                                ? 'bg-indigo-500 border-indigo-200'
                                : 'bg-gray-300 border-gray-200'
                              }`}>
                              {candidate.pipelineStatus.liveInterview.status === 'completed' ? (
                                <CheckCircle size={24} className="text-white" />
                              ) : candidate.pipelineStatus.liveInterview.status === 'in-progress' ? (
                                <Activity size={24} className="text-white animate-pulse" />
                              ) : (
                                <Play size={24} className="text-gray-500" />
                              )}
                            </div>
                            <div className="text-center">
                              <div className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#111827] mb-1">
                                Live Interview
                              </div>
                              {candidate.pipelineStatus.liveInterview.completedAt && (
                                <div className="font-['Arimo',sans-serif] text-[10px] text-[#6b7280]">
                                  {candidate.pipelineStatus.liveInterview.completedAt}
                                </div>
                              )}
                              {candidate.pipelineStatus.liveInterview.status === 'in-progress' && (
                                <div className="font-['Arimo',sans-serif] text-[10px] text-indigo-600 font-semibold">
                                  In Progress
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Final Decision */}
                          <div className="flex flex-col items-center">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-2 border-4 ${candidate.pipelineStatus.finalDecision.status === 'completed'
                              ? 'bg-emerald-500 border-emerald-200'
                              : candidate.pipelineStatus.finalDecision.status === 'in-progress'
                                ? 'bg-indigo-500 border-indigo-200'
                                : 'bg-gray-300 border-gray-200'
                              }`}>
                              {candidate.pipelineStatus.finalDecision.status === 'completed' ? (
                                <CheckCircle size={24} className="text-white" />
                              ) : candidate.pipelineStatus.finalDecision.status === 'in-progress' ? (
                                <Activity size={24} className="text-white animate-pulse" />
                              ) : (
                                <FileCheck size={24} className="text-gray-500" />
                              )}
                            </div>
                            <div className="text-center">
                              <div className="font-['Arimo',sans-serif] text-[12px] font-semibold text-[#111827] mb-1">
                                Final Decision
                              </div>
                              {candidate.pipelineStatus.finalDecision.completedAt && (
                                <div className="font-['Arimo',sans-serif] text-[10px] text-[#6b7280]">
                                  {candidate.pipelineStatus.finalDecision.completedAt}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Skills</h3>
                  <div className="flex flex-wrap gap-2">
                    {candidate.skills.map((skill: string, i: number) => (
                      <span
                        key={i}
                        className="px-[16px] py-[8px] bg-[#ede9fe] text-[#6366f1] rounded-[8px] font-['Arimo',sans-serif] text-[14px]"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Work Experience</h3>
                  <div className="space-y-4">
                    {candidate.workHistory.map((job: any, i: number) => (
                      <div key={i} className="border-l-2 border-[#6366f1] pl-4">
                        <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827] mb-1">
                          {job.title}
                        </div>
                        <div className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-2">
                          {job.company} • {job.duration}
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                          {job.description}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Education</h3>
                  <div className="space-y-3">
                    {candidate.education.map((edu: any, i: number) => (
                      <div key={i}>
                        <div className="font-['Arimo',sans-serif] text-[15px] text-[#111827]">
                          {edu.degree}
                        </div>
                        <div className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                          {edu.school} • {edu.year}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'resume' && (
              <div className="space-y-6">
                <h3 className="text-[#111827] mb-4">Parsed Resume Data</h3>

                {/* Resume Summary */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-3">Professional Summary</h4>
                  <p className="text-[#374151] text-sm leading-relaxed">
                    {candidate.resumeSummary}
                  </p>
                </div>

                {/* Skills from Resume */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Technical Skills</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-xs text-[#6b7280] mb-2">Frontend</div>
                      <div className="space-y-1">
                        {candidate.techSkills?.frontend.map((s: string, i: number) => (
                          <div key={i} className="text-sm text-[#111827]">{s}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6b7280] mb-2">Backend</div>
                      <div className="space-y-1">
                        {candidate.techSkills?.backend.map((s: string, i: number) => (
                          <div key={i} className="text-sm text-[#111827]">{s}</div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#6b7280] mb-2">DevOps</div>
                      <div className="space-y-1">
                        {candidate.techSkills?.devops.map((s: string, i: number) => (
                          <div key={i} className="text-sm text-[#111827]">{s}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Work Experience from Resume */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Work Experience</h4>
                  <div className="space-y-5">
                    {candidate.workHistory.map((job: any, i: number) => (
                      <div key={i} className="border-l-2 border-[#6366f1] pl-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium text-[#111827] text-sm">{job.title}</div>
                            <div className="text-[#6b7280] text-xs">{job.company}</div>
                          </div>
                          <div className="text-[#6b7280] text-xs">{job.duration}</div>
                        </div>
                        <p className="text-[#374151] text-sm">{job.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Education from Resume */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Education</h4>
                  <div className="space-y-4">
                    {candidate.education.map((edu: any, i: number) => (
                      <div key={i}>
                        <div className="font-medium text-[#111827] text-sm">{edu.degree}</div>
                        <div className="text-[#6b7280] text-xs">{edu.school} • {edu.year}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Certifications */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Certifications</h4>
                  <div className="space-y-2">
                    {candidate.certifications?.map((cert: string, i: number) => (
                      <div key={i} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span className="text-sm text-[#374151]">{cert}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'github' && (
              <div className="space-y-6">
                <h3 className="text-[#111827] mb-4">GitHub Profile Analysis</h3>

                {/* GitHub Stats Overview */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Github className="w-4 h-4 text-[#6b7280]" />
                      <div className="text-xs text-[#6b7280]">Public Repos</div>
                    </div>
                    <div className="text-2xl font-semibold text-[#111827]">{candidate.githubStats?.publicRepos}</div>
                  </div>
                  <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Activity className="w-4 h-4 text-[#6b7280]" />
                      <div className="text-xs text-[#6b7280]">Total Stars</div>
                    </div>
                    <div className="text-2xl font-semibold text-[#111827]">{candidate.githubStats?.totalStars}</div>
                  </div>
                  <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="w-4 h-4 text-[#6b7280]" />
                      <div className="text-xs text-[#6b7280]">Followers</div>
                    </div>
                    <div className="text-2xl font-semibold text-[#111827]">{candidate.githubStats?.followers}</div>
                  </div>
                  <div className="bg-white border border-[#e5e7eb] rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="w-4 h-4 text-[#6b7280]" />
                      <div className="text-xs text-[#6b7280]">Contributions (2024)</div>
                    </div>
                    <div className="text-2xl font-semibold text-[#111827]">{candidate.githubStats?.contributionsLastYear}</div>
                  </div>
                </div>

                {/* Contribution Activity Graph */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Contribution Activity (Last 12 Months)</h4>
                  <div className="space-y-2">
                    {/* Simple contribution heat map */}
                    <div className="flex items-center gap-1">
                      <div className="text-xs text-[#6b7280] w-12">Mon</div>
                      <div className="flex gap-1">
                        {Array.from({ length: 52 }, (_, i) => (
                          <div
                            key={i}
                            className="w-3 h-3 rounded-sm"
                            style={{
                              backgroundColor:
                                i % 7 === 0 ? '#ebedf0' :
                                  i % 5 === 0 ? '#9be9a8' :
                                    i % 3 === 0 ? '#40c463' :
                                      i % 2 === 0 ? '#30a14e' : '#216e39'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-xs text-[#6b7280] w-12">Wed</div>
                      <div className="flex gap-1">
                        {Array.from({ length: 52 }, (_, i) => (
                          <div
                            key={i}
                            className="w-3 h-3 rounded-sm"
                            style={{
                              backgroundColor:
                                i % 6 === 0 ? '#ebedf0' :
                                  i % 4 === 0 ? '#9be9a8' :
                                    i % 3 === 0 ? '#40c463' :
                                      i % 2 === 0 ? '#30a14e' : '#216e39'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="text-xs text-[#6b7280] w-12">Fri</div>
                      <div className="flex gap-1">
                        {Array.from({ length: 52 }, (_, i) => (
                          <div
                            key={i}
                            className="w-3 h-3 rounded-sm"
                            style={{
                              backgroundColor:
                                i % 5 === 0 ? '#ebedf0' :
                                  i % 4 === 0 ? '#9be9a8' :
                                    i % 3 === 0 ? '#40c463' :
                                      i % 2 === 0 ? '#30a14e' : '#216e39'
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-4 text-xs text-[#6b7280]">
                    <span>Less</span>
                    <div className="w-3 h-3 rounded-sm bg-[#ebedf0]" />
                    <div className="w-3 h-3 rounded-sm bg-[#9be9a8]" />
                    <div className="w-3 h-3 rounded-sm bg-[#40c463]" />
                    <div className="w-3 h-3 rounded-sm bg-[#30a14e]" />
                    <div className="w-3 h-3 rounded-sm bg-[#216e39]" />
                    <span>More</span>
                  </div>
                </div>

                {/* Language Breakdown */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Most Used Languages</h4>
                  <div className="space-y-3">
                    {candidate.githubStats?.languages?.map((lang: any, i: number) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: lang.color || '#6b7280' }} />
                            <span className="text-sm text-[#111827]">{lang.name}</span>
                          </div>
                          <span className="text-sm text-[#6b7280]">{lang.percentage}%</span>
                        </div>
                        <div className="w-full h-2 bg-[#f3f4f6] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${lang.percentage}%`, backgroundColor: lang.color || '#6b7280' }}
                          />
                        </div>
                      </div>
                    )) || (
                        <div className="text-sm text-[#6b7280]">No language data available</div>
                      )}
                  </div>
                </div>

                {/* Top Repositories */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Top Repositories</h4>
                  <div className="space-y-4">
                    {candidate.githubStats?.topRepos?.map((repo: any, i: number) => (
                      <div key={i} className="border border-[#e5e7eb] rounded-lg p-4 hover:border-[#6366f1] transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Github className="w-4 h-4 text-[#6366f1]" />
                              <h5 className="text-sm font-medium text-[#6366f1]">{repo.name}</h5>
                            </div>
                            <p className="text-xs text-[#6b7280] mb-3">
                              {repo.description}
                            </p>
                            <div className="flex items-center gap-4 flex-wrap">
                              <div className="flex items-center gap-1">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: repo.languageColor || '#3178c6' }} />
                                <span className="text-xs text-[#6b7280]">{repo.language}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Activity className="w-3 h-3 text-[#6b7280]" />
                                <span className="text-xs text-[#6b7280]">{repo.stars} stars</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Eye className="w-3 h-3 text-[#6b7280]" />
                                <span className="text-xs text-[#6b7280]">{repo.forks} forks</span>
                              </div>
                              <span className="text-xs text-[#6b7280]">{repo.updatedAt}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )) || (
                        <div className="text-sm text-[#6b7280]">No repositories available</div>
                      )}
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Recent Activity</h4>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-emerald-500 mt-2" />
                      <div className="flex-1">
                        <p className="text-sm text-[#111827] mb-1">
                          Opened pull request <span className="text-[#6366f1] font-medium">#142</span> in <span className="font-medium">react-microservices-boilerplate</span>
                        </p>
                        <p className="text-xs text-[#6b7280]">Added health check endpoints for all services</p>
                        <span className="text-xs text-[#9ca3af]">2 days ago</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mt-2" />
                      <div className="flex-1">
                        <p className="text-sm text-[#111827] mb-1">
                          Merged pull request <span className="text-[#6366f1] font-medium">#138</span> in <span className="font-medium">next-auth-rbac</span>
                        </p>
                        <p className="text-xs text-[#6b7280]">Fix: Permission inheritance for nested roles</p>
                        <span className="text-xs text-[#9ca3af]">5 days ago</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-blue-500 mt-2" />
                      <div className="flex-1">
                        <p className="text-sm text-[#111827] mb-1">
                          Created repository <span className="font-medium">k8s-deployment-scripts</span>
                        </p>
                        <p className="text-xs text-[#6b7280]">Automated Kubernetes deployment utilities</p>
                        <span className="text-xs text-[#9ca3af]">1 week ago</span>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-amber-500 mt-2" />
                      <div className="flex-1">
                        <p className="text-sm text-[#111827] mb-1">
                          Reviewed and approved PR in <span className="font-medium">graphql-query-optimizer</span>
                        </p>
                        <p className="text-xs text-[#6b7280]">Performance improvements for batch queries</p>
                        <span className="text-xs text-[#9ca3af]">2 weeks ago</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Code Quality Metrics */}
                <div className="bg-white border border-[#e5e7eb] rounded-lg p-6">
                  <h4 className="text-[#111827] text-sm font-medium mb-4">Code Quality Indicators</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[#166534]">Avg. PR Review Time</span>
                        <CheckCircle className="w-4 h-4 text-[#16a34a]" />
                      </div>
                      <div className="text-2xl font-semibold text-[#166534]">4.2 hrs</div>
                      <p className="text-xs text-[#15803d] mt-1">Faster than 85% of developers</p>
                    </div>
                    <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[#166534]">Code Documentation</span>
                        <CheckCircle className="w-4 h-4 text-[#16a34a]" />
                      </div>
                      <div className="text-2xl font-semibold text-[#166534]">92%</div>
                      <p className="text-xs text-[#15803d] mt-1">Excellent documentation coverage</p>
                    </div>
                    <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[#166534]">Test Coverage</span>
                        <CheckCircle className="w-4 h-4 text-[#16a34a]" />
                      </div>
                      <div className="text-2xl font-semibold text-[#166534]">88%</div>
                      <p className="text-xs text-[#15803d] mt-1">Above industry standard (75%)</p>
                    </div>
                    <div className="bg-[#f0fdf4] border border-[#bbf7d0] rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-[#166534]">Code Review Quality</span>
                        <CheckCircle className="w-4 h-4 text-[#16a34a]" />
                      </div>
                      <div className="text-2xl font-semibold text-[#166534]">4.8/5</div>
                      <p className="text-xs text-[#15803d] mt-1">Highly valuable feedback</p>
                    </div>
                  </div>
                </div>

                {/* Overall GitHub Score */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-indigo-900 font-semibold mb-2">Overall GitHub Score</h4>
                      <p className="text-sm text-indigo-700">
                        Based on code quality, contribution frequency, community engagement, and project impact
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="text-5xl font-bold text-indigo-600 mb-1">88</div>
                      <div className="text-sm text-indigo-700">/ 100</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'assessment' && (
              <div className="space-y-6">
                {/* Score Card */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h4 className="text-indigo-900 font-semibold mb-2">Assessment Score</h4>
                      <p className="text-sm text-indigo-700">
                        {candidate.assessmentData.questionsCorrect} out of {candidate.assessmentData.questionsTotal} questions correct
                      </p>
                    </div>
                    <div className="text-center">
                      <div className="text-5xl font-bold text-indigo-600 mb-1">{candidate.scores.assessment}</div>
                      <div className="text-sm text-indigo-700">/ 100</div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Completed</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {candidate.assessmentData.completedAt}
                    </div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Duration</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {candidate.assessmentData.duration}
                    </div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Score</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {candidate.assessmentData.questionsCorrect}/{candidate.assessmentData.questionsTotal}
                    </div>
                  </div>
                </div>

                {/* View Details Button */}
                <Button
                  onClick={() => setShowAssessmentDetails(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-6 flex items-center justify-center gap-2"
                >
                  <FileCheck size={20} />
                  View Questions & Answers
                </Button>

                <div>
                  <h3 className="text-[#111827] mb-4">Topic Scores</h3>
                  <div className="space-y-3">
                    {candidate.assessmentData?.topicScores.map((topic: any, i: number) => (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                            {topic.topic}
                          </span>
                          <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                            {topic.score}%
                          </span>
                        </div>
                        <div className="w-full h-[8px] bg-[#e5e7eb] rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#6366f1] rounded-full"
                            style={{ width: `${topic.score}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'interview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Completed</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {candidate.interviewData.completedAt}
                    </div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Duration</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {candidate.interviewData.duration}
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-4">Video Responses</h3>
                  <div className="space-y-4">
                    {videoInterviewQuestions.map((q: any, i: number) => (
                      <div key={i} className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="font-['Arimo',sans-serif] text-[14px] text-[#111827] mb-2">
                              Q{i + 1}: {q.question}
                            </div>
                            <div className="flex items-center gap-4 text-sm text-[#6b7280]">
                              <span className="flex items-center gap-1">
                                <Clock size={14} />
                                {q.duration}
                              </span>
                              <span className="font-['Arimo',sans-serif] text-[#6366f1]">
                                Score: {q.score}/10
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Button
                            onClick={() => setShowVideoResponse(q.id)}
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-3 flex items-center justify-center gap-2"
                          >
                            <Play size={16} />
                            View Video Response
                          </Button>
                          <Button
                            onClick={() => setShowVideoTranscript(q.id)}
                            variant="outline"
                            className="flex-1 border-indigo-600 text-indigo-600 hover:bg-indigo-50 rounded-lg py-3 flex items-center justify-center gap-2"
                          >
                            <MessageCircle size={16} />
                            View Transcript
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-[#111827] mb-3">Overall Feedback</h3>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <p className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">
                      {candidate.interviewData.overallFeedback}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'live-interview' && (
              <div className="space-y-6">
                {/* Score Cards */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-emerald-700 mb-1">Confidence Score</div>
                        <div className="text-3xl font-bold text-emerald-900">{liveInterviewData.overallConfidence}%</div>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center">
                        <TrendingUp size={24} className="text-white" />
                      </div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-r from-indigo-50 to-indigo-100 border-2 border-indigo-200 rounded-2xl p-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm text-indigo-700 mb-1">Answer Correctness</div>
                        <div className="text-3xl font-bold text-indigo-900">{liveInterviewData.overallCorrectness}%</div>
                      </div>
                      <div className="w-12 h-12 rounded-full bg-indigo-500 flex items-center justify-center">
                        <CheckCircle size={24} className="text-white" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Completed</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {liveInterviewData.completedAt}
                    </div>
                  </div>
                  <div className="bg-[#f9fafb] rounded-[8px] p-4">
                    <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Duration</div>
                    <div className="font-['Arimo',sans-serif] text-[16px] text-[#111827]">
                      {liveInterviewData.duration}
                    </div>
                  </div>
                </div>

                {/* View Full Transcript Button */}
                <Button
                  onClick={() => setShowLiveInterviewTranscript(true)}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-6 flex items-center justify-center gap-2"
                >
                  <FileText size={20} />
                  View Full Interview Transcript
                </Button>

                {/* Emotion Metrics */}
                <div>
                  <h3 className="text-[#111827] mb-4">Overall Emotion Metrics</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {liveInterviewData.emotionMetrics.map((metric: any, i: number) => (
                      <div key={i} className="bg-white border border-[#e5e7eb] rounded-[12px] p-5">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {metric.icon === 'smile' && <Smile size={20} style={{ color: metric.color }} />}
                            {metric.icon === 'activity' && <Activity size={20} style={{ color: metric.color }} />}
                            {metric.icon === 'meh' && <Meh size={20} style={{ color: metric.color }} />}
                            {metric.icon === 'trending-up' && <TrendingUp size={20} style={{ color: metric.color }} />}
                            <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">
                              {metric.emotion}
                            </span>
                          </div>
                          <span className="text-lg font-semibold" style={{ color: metric.color }}>
                            {metric.percentage}%
                          </span>
                        </div>
                        <div className="w-full h-2 bg-[#e5e7eb] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${metric.percentage}%`,
                              backgroundColor: metric.color
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notes' && (
              <div>
                <h3 className="text-[#111827] mb-4">Recruiter Notes</h3>
                <textarea
                  placeholder="Add notes about this candidate..."
                  rows={10}
                  className="w-full px-[16px] py-[12px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
                <button className="mt-4 h-[40px] px-[24px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors">
                  Save Notes
                </button>
              </div>
            )}

            {activeTab === 'knowledge-graph' && (
              <div className="h-[800px]">
                <KnowledgeGraph
                  candidateId={candidateId}
                  candidateName={candidate.name}
                  onBack={() => setActiveTab('overview')}
                />
              </div>
            )}

            {activeTab === 'final-report' && (
              <div className="space-y-6">
                {/* Decision Summary */}
                <div className="bg-gradient-to-r from-emerald-50 to-emerald-100 border-2 border-emerald-500 rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
                      <CheckCircle size={24} className="text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-emerald-900 mb-2">Hiring Decision: APPROVED</h3>
                      <p className="text-emerald-800 text-sm">
                        Candidate has been approved and selected for the position based on comprehensive evaluation across all assessment criteria.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Evaluation Summary */}
                <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                  <h3 className="text-[#111827] mb-4">Evaluation Summary</h3>

                  <div className="grid grid-cols-2 gap-6 mb-6">
                    <div>
                      <div className="text-sm text-gray-500 mb-2">Final Evaluator</div>
                      <div className="text-gray-900">Sarah Johnson - HR Manager</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-2">Technical Reviewer</div>
                      <div className="text-gray-900">Michael Chen - Tech Lead</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-2">Decision Date</div>
                      <div className="text-gray-900">March 1, 2024</div>
                    </div>
                    <div>
                      <div className="text-sm text-gray-500 mb-2">Start Date</div>
                      <div className="text-gray-900">March 15, 2024</div>
                    </div>
                  </div>
                </div>

                {/* Performance Breakdown */}
                <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                  <h3 className="text-[#111827] mb-4">Performance Breakdown</h3>

                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-700">Technical Assessment</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{candidate.scores.assessment}/100</span>
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        </div>
                      </div>
                      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${candidate.scores.assessment}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Demonstrated exceptional proficiency in React, TypeScript, and system design
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-700">AI Interview</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{candidate.scores.aiInterview}/100</span>
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        </div>
                      </div>
                      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-500 rounded-full"
                          style={{ width: `${candidate.scores.aiInterview}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Strong communication skills and cultural fit. Excellent problem-solving approach
                      </p>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-gray-700">GitHub Analysis</span>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">{candidate.scores.github}/100</span>
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                        </div>
                      </div>
                      <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-500 rounded-full"
                          style={{ width: `${candidate.scores.github}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Consistent contribution history with high-quality code reviews and documentation
                      </p>
                    </div>
                  </div>
                </div>

                {/* Strengths & Areas for Development */}
                <div className="grid grid-cols-2 gap-6">
                  <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                      <h3 className="text-[#111827]">Key Strengths</h3>
                    </div>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">8+ years of React and TypeScript experience</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">Led microservices architecture serving 10M+ users</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">Strong system design and scalability expertise</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">Excellent communication and leadership skills</span>
                      </li>
                    </ul>
                  </div>

                  <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <h3 className="text-[#111827]">Development Areas</h3>
                    </div>
                    <ul className="space-y-2">
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-amber-100 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">Could benefit from more Kubernetes hands-on experience</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-amber-100 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">Limited exposure to our specific tech stack (Python/Django)</span>
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="w-4 h-4 rounded-full bg-amber-100 mt-0.5 flex-shrink-0" />
                        <span className="text-sm text-gray-700">Recommend onboarding support for internal tools</span>
                      </li>
                    </ul>
                  </div>
                </div>

                {/* Final Recommendation */}
                <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                  <h3 className="text-[#111827] mb-3">Final Recommendation</h3>
                  <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    After comprehensive evaluation across all assessment criteria, {candidate.name} has demonstrated exceptional technical proficiency, strong communication skills, and cultural alignment with our organization. The candidate's extensive experience with React and microservices architecture, combined with proven leadership in scaling systems to serve millions of users, makes them an ideal fit for the Senior Frontend Developer position.
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed mb-4">
                    While there are minor areas for development, particularly in Kubernetes and our internal tech stack, these can be easily addressed through our structured onboarding program. The candidate's strong learning ability and proven track record of quickly adapting to new technologies minimizes any concerns in this area.
                  </p>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    <strong>Recommendation:</strong> Strongly recommend proceeding with offer. Suggested salary range: $150,000 - $170,000 based on market benchmarks and candidate experience. Start date confirmed for March 15, 2024.
                  </p>
                </div>

                {/* Offer Details */}
                <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-6">
                  <h3 className="text-indigo-900 mb-4">Offer Package Details</h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <div className="text-sm text-indigo-700 mb-1">Base Salary</div>
                      <div className="text-lg font-semibold text-indigo-900">$160,000/year</div>
                    </div>
                    <div>
                      <div className="text-sm text-indigo-700 mb-1">Equity Package</div>
                      <div className="text-lg font-semibold text-indigo-900">0.25% vesting 4yrs</div>
                    </div>
                    <div>
                      <div className="text-sm text-indigo-700 mb-1">Sign-on Bonus</div>
                      <div className="text-lg font-semibold text-indigo-900">$15,000</div>
                    </div>
                  </div>
                </div>

                {/* Approval Signatures */}
                <div className="bg-white border border-[#e5e7eb] rounded-2xl p-6">
                  <h3 className="text-[#111827] mb-4">Approval Signatures</h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <div className="font-medium text-gray-900">Sarah Johnson</div>
                          <div className="text-sm text-gray-500">HR Manager</div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">Approved on Mar 1, 2024</div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <div className="font-medium text-gray-900">Michael Chen</div>
                          <div className="text-sm text-gray-500">Technical Lead</div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">Approved on Mar 1, 2024</div>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-emerald-50 rounded-xl">
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-emerald-600" />
                        <div>
                          <div className="font-medium text-gray-900">David Kim</div>
                          <div className="text-sm text-gray-500">Engineering Director</div>
                        </div>
                      </div>
                      <div className="text-sm text-gray-500">Approved on Mar 1, 2024</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Assessment Details Modal */}
      <Dialog open={showAssessmentDetails} onOpenChange={setShowAssessmentDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Assessment Questions & Answers</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {assessmentQuestions.map((q: any, i: number) => (
              <div key={q.id} className="border border-[#e5e7eb] rounded-lg p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium">
                        Q{i + 1}
                      </span>
                      <span className="text-sm text-gray-500">{q.topic}</span>
                    </div>
                    <h4 className="text-lg font-medium text-gray-900 mb-3">{q.question}</h4>
                  </div>
                  {q.isCorrect ? (
                    <CheckCircle size={24} className="text-emerald-600 flex-shrink-0" />
                  ) : (
                    <XCircle size={24} className="text-red-600 flex-shrink-0" />
                  )}
                </div>

                <div className="space-y-4">
                  <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
                    <div className="text-sm font-medium text-blue-900 mb-1">Candidate's Answer</div>
                    <div className="text-sm text-blue-800">{q.candidateAnswer}</div>
                  </div>

                  <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded">
                    <div className="text-sm font-medium text-emerald-900 mb-1">Correct Answer</div>
                    <div className="text-sm text-emerald-800">{q.correctAnswer}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Video Response Modal */}
      <Dialog open={showVideoResponse !== null} onOpenChange={() => setShowVideoResponse(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Video Response</DialogTitle>
          </DialogHeader>
          {showVideoResponse && videoInterviewQuestions.find((q: any) => q.id === showVideoResponse) && (
            <div className="mt-4">
              <div className="bg-gray-100 rounded-lg aspect-video flex items-center justify-center mb-4">
                <div className="text-center">
                  <Play size={64} className="text-gray-400 mx-auto mb-2" />
                  <p className="text-gray-600">Video Player Placeholder</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Duration: {videoInterviewQuestions.find((q: any) => q.id === showVideoResponse)?.duration}
                  </p>
                </div>
              </div>
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h4 className="font-medium text-indigo-900 mb-2">Question</h4>
                <p className="text-indigo-800">{videoInterviewQuestions.find((q: any) => q.id === showVideoResponse)?.question}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Video Transcript Modal */}
      <Dialog open={showVideoTranscript !== null} onOpenChange={() => setShowVideoTranscript(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Video Response Transcript</DialogTitle>
          </DialogHeader>
          {showVideoTranscript && videoInterviewQuestions.find((q: any) => q.id === showVideoTranscript) && (
            <div className="mt-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-indigo-900 mb-2">Question</h4>
                <p className="text-indigo-800">{videoInterviewQuestions.find((q: any) => q.id === showVideoTranscript)?.question}</p>
              </div>
              <div className="bg-white border border-gray-200 rounded-lg p-6">
                <h4 className="font-medium text-gray-900 mb-3">Transcript</h4>
                <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
                  {videoInterviewQuestions.find((q: any) => q.id === showVideoTranscript)?.transcript}
                </p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Live Interview Transcript Modal */}
      <Dialog open={showLiveInterviewTranscript} onOpenChange={setShowLiveInterviewTranscript}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl">Live Interview Transcript</DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-4">
            {/* Metadata Card */}
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-indigo-700 mb-1">Candidate</div>
                  <div className="font-semibold text-indigo-900">{candidate.name}</div>
                </div>
                <div>
                  <div className="text-sm text-indigo-700 mb-1">Date</div>
                  <div className="font-semibold text-indigo-900">{liveInterviewData.completedAt}</div>
                </div>
                <div>
                  <div className="text-sm text-indigo-700 mb-1">Duration</div>
                  <div className="font-semibold text-indigo-900">{liveInterviewData.duration}</div>
                </div>
                <div>
                  <div className="text-sm text-indigo-700 mb-1">Scores</div>
                  <div className="font-semibold text-indigo-900">
                    Confidence: {liveInterviewData.overallConfidence}% | Correctness: {liveInterviewData.overallCorrectness}%
                  </div>
                </div>
              </div>
            </div>

            {/* Transcript Content */}
            <div className="bg-white border border-[#e5e7eb] rounded-xl p-6">
              <h4 className="font-semibold text-gray-900 mb-4 text-lg">Full Transcript</h4>
              <div className="space-y-4 text-gray-700 leading-relaxed">
                {liveInterviewData.transcript.split('\n\n').map((paragraph: string, i: number) => {
                  const lines = paragraph.split('\n');
                  return (
                    <div key={i} className="space-y-2">
                      {lines.map((line: string, j: number) => {
                        if (line.startsWith('Interviewer:')) {
                          return (
                            <p key={j} className="font-semibold text-indigo-600">
                              {line}
                            </p>
                          );
                        } else if (line.startsWith('Candidate:')) {
                          return (
                            <p key={j} className="font-semibold text-emerald-600">
                              {line}
                            </p>
                          );
                        } else if (line.trim()) {
                          return (
                            <p key={j} className="text-gray-700 ml-4">
                              {line}
                            </p>
                          );
                        }
                        return null;
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}