import { useState } from 'react';
import { ChevronLeft, Plus, Settings, Save, Wand2, Mic, Video, MessageSquare, Clock, ChevronDown, ChevronUp, Trash2, Edit, Eye, Sparkles, Copy, FileText, Brain, Target, X } from 'lucide-react';
import { Button } from '../ui/button';
import { AIQuestionPreview } from './AIQuestionPreview';
import { AIGeneratorModal } from './AIGeneratorModal';
import { TextRefiner } from './TextRefiner';

interface AIInterviewConfig {
  title: string;
  description: string;
  interviewType: 'live' | 'recorded';
  duration: number; // in minutes
  difficulty: 'Entry Level' | 'Mid Level' | 'Senior Level' | 'Expert';
  evaluationCriteria: string[];
  allowRetakes: boolean;
  showFeedback: boolean;
  recordingRequired: boolean;
  aiModel: 'GPT-4' | 'GPT-4-Turbo' | 'Claude-3';
}

interface InterviewSection {
  id: string;
  order: number;
  title: string;
  description: string;
  questions: InterviewQuestion[];
  timeAllocation: number; // in minutes
  evaluationWeight: number; // percentage
}

interface InterviewQuestion {
  id: string;
  questionText: string;
  followUpQuestions: string[];
  evaluationCriteria: string[];
  idealAnswer?: string;
  keyPoints: string[];
  difficulty: 'Easy' | 'Medium' | 'Hard';
  timeLimit?: number; // in seconds for recorded
  tags?: string[];
}

interface CreateAIInterviewProps {
  onBack: () => void;
  onSave: (interview: any) => void;
}

type CreationStep = 'settings' | 'sections';

export function CreateAIInterview({ onBack, onSave }: CreateAIInterviewProps) {
  const [currentStep, setCurrentStep] = useState<CreationStep>('settings');
  const [interviewConfig, setInterviewConfig] = useState<AIInterviewConfig>({
    title: '',
    description: '',
    interviewType: 'recorded',
    duration: 30,
    difficulty: 'Mid Level',
    evaluationCriteria: ['Communication Skills', 'Technical Knowledge', 'Problem-Solving'],
    allowRetakes: false,
    showFeedback: true,
    recordingRequired: true,
    aiModel: 'GPT-4-Turbo'
  });
  const [sections, setSections] = useState<InterviewSection[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [showAIGenerator, setShowAIGenerator] = useState(false);
  const [currentGeneratingSection, setCurrentGeneratingSection] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  const handleAddSection = () => {
    const newSection: InterviewSection = {
      id: `section-${Date.now()}`,
      order: sections.length + 1,
      title: '',
      description: '',
      questions: [],
      timeAllocation: 5,
      evaluationWeight: 0
    };
    setSections([...sections, newSection]);
    setEditingSection(newSection.id);
    setExpandedSections(new Set([...expandedSections, newSection.id]));
  };

  const handleUpdateSection = (sectionId: string, updates: Partial<InterviewSection>) => {
    setSections(sections.map(s => s.id === sectionId ? { ...s, ...updates } : s));
  };

  const handleDeleteSection = (sectionId: string) => {
    setSections(sections.filter(s => s.id !== sectionId));
    if (expandedSections.has(sectionId)) {
      const newExpanded = new Set(expandedSections);
      newExpanded.delete(sectionId);
      setExpandedSections(newExpanded);
    }
  };

  const handleDuplicateSection = (sectionId: string) => {
    const sectionToDuplicate = sections.find(s => s.id === sectionId);
    if (sectionToDuplicate) {
      const duplicatedSection: InterviewSection = {
        ...sectionToDuplicate,
        id: `section-${Date.now()}`,
        order: sections.length + 1,
        title: `${sectionToDuplicate.title} (Copy)`,
        questions: sectionToDuplicate.questions.map(q => ({
          ...q,
          id: `question-${Date.now()}-${Math.random()}`
        }))
      };
      setSections([...sections, duplicatedSection]);
    }
  };

  const toggleSectionExpansion = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const handleAddQuestion = (sectionId: string) => {
    const newQuestion: InterviewQuestion = {
      id: `question-${Date.now()}`,
      questionText: '',
      followUpQuestions: [],
      evaluationCriteria: [],
      keyPoints: [],
      difficulty: 'Medium',
      timeLimit: interviewConfig.interviewType === 'recorded' ? 120 : undefined,
      tags: []
    };
    
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return { ...s, questions: [...s.questions, newQuestion] };
      }
      return s;
    }));
  };

  const handleUpdateQuestion = (sectionId: string, questionId: string, updates: Partial<InterviewQuestion>) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return {
          ...s,
          questions: s.questions.map(q => q.id === questionId ? { ...q, ...updates } : q)
        };
      }
      return s;
    }));
  };

  const handleDeleteQuestion = (sectionId: string, questionId: string) => {
    setSections(sections.map(s => {
      if (s.id === sectionId) {
        return { ...s, questions: s.questions.filter(q => q.id !== questionId) };
      }
      return s;
    }));
  };

  const handleGenerateWithAI = (sectionId: string) => {
    setCurrentGeneratingSection(sectionId);
    setShowAIGenerator(true);
  };

  const handleAIGenerated = (questions: any[]) => {
    if (currentGeneratingSection) {
      const generatedQuestions: InterviewQuestion[] = questions.map((q, idx) => ({
        id: `question-${Date.now()}-${idx}`,
        questionText: q.question,
        followUpQuestions: q.followUps || [],
        evaluationCriteria: q.criteria || [],
        keyPoints: q.keyPoints || [],
        difficulty: q.difficulty || 'Medium',
        timeLimit: interviewConfig.interviewType === 'recorded' ? 120 : undefined,
        tags: q.tags || []
      }));

      setSections(sections.map(s => {
        if (s.id === currentGeneratingSection) {
          return { ...s, questions: [...s.questions, ...generatedQuestions] };
        }
        return s;
      }));
    }
    setShowAIGenerator(false);
    setCurrentGeneratingSection(null);
  };

  const handleSave = () => {
    const interview = {
      config: interviewConfig,
      sections: sections
    };
    onSave(interview);
  };

  const totalQuestions = sections.reduce((sum, s) => sum + s.questions.length, 0);
  const totalWeight = sections.reduce((sum, s) => sum + s.evaluationWeight, 0);

  // Settings Step
  if (currentStep === 'settings') {
    return (
      <div className="h-full w-full overflow-auto bg-[#f9fafb]">
        <div className="max-w-[1200px] mx-auto px-[48px] py-[24px]">
          {/* Header */}
          <button
            onClick={onBack}
            className="flex items-center gap-2 mb-6 text-[#6b7280] hover:text-[#111827] transition-colors"
          >
            <ChevronLeft size={20} />
            <span className="font-['Arimo',sans-serif] text-[14px]">Back</span>
          </button>

          <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-full bg-[#ede9fe] flex items-center justify-center">
                <Sparkles size={24} className="text-[#6366f1]" />
              </div>
              <div>
                <h1 className="text-[#111827] text-[28px]">Create AI Interview</h1>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Configure your AI-powered interview settings
                </p>
              </div>
            </div>

            {/* Basic Information */}
            <div className="space-y-6 mb-8">
              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Interview Title *
                </label>
                <input
                  type="text"
                  value={interviewConfig.title}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, title: e.target.value })}
                  placeholder="e.g., Senior React Developer Technical Interview"
                  className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Description
                </label>
                <textarea
                  value={interviewConfig.description}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, description: e.target.value })}
                  placeholder="Describe the purpose and scope of this interview..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>
            </div>

            {/* Interview Configuration */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Interview Type
                </label>
                <div className="flex gap-3">
                  <button
                    onClick={() => setInterviewConfig({ ...interviewConfig, interviewType: 'live' })}
                    className={`flex-1 h-[80px] rounded-[10px] border-2 transition-all ${
                      interviewConfig.interviewType === 'live'
                        ? 'border-[#6366f1] bg-[#f5f3ff]'
                        : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Video size={20} className={interviewConfig.interviewType === 'live' ? 'text-[#6366f1]' : 'text-[#6b7280]'} />
                      <span className={`font-['Arimo',sans-serif] text-[14px] ${
                        interviewConfig.interviewType === 'live' ? 'text-[#6366f1] font-medium' : 'text-[#6b7280]'
                      }`}>
                        Live AI Interview
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => setInterviewConfig({ ...interviewConfig, interviewType: 'recorded' })}
                    className={`flex-1 h-[80px] rounded-[10px] border-2 transition-all ${
                      interviewConfig.interviewType === 'recorded'
                        ? 'border-[#6366f1] bg-[#f5f3ff]'
                        : 'border-[#e5e7eb] bg-white hover:border-[#d1d5db]'
                    }`}
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Mic size={20} className={interviewConfig.interviewType === 'recorded' ? 'text-[#6366f1]' : 'text-[#6b7280]'} />
                      <span className={`font-['Arimo',sans-serif] text-[14px] ${
                        interviewConfig.interviewType === 'recorded' ? 'text-[#6366f1] font-medium' : 'text-[#6b7280]'
                      }`}>
                        Recorded Responses
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  AI Model
                </label>
                <select
                  value={interviewConfig.aiModel}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, aiModel: e.target.value as any })}
                  className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                >
                  <option value="GPT-4">GPT-4</option>
                  <option value="GPT-4-Turbo">GPT-4 Turbo</option>
                  <option value="Claude-3">Claude 3</option>
                </select>
              </div>

              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Total Duration (minutes)
                </label>
                <input
                  type="number"
                  value={interviewConfig.duration}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, duration: parseInt(e.target.value) || 30 })}
                  min="10"
                  max="180"
                  className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                />
              </div>

              <div>
                <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                  Difficulty Level
                </label>
                <select
                  value={interviewConfig.difficulty}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, difficulty: e.target.value as any })}
                  className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                >
                  <option value="Entry Level">Entry Level</option>
                  <option value="Mid Level">Mid Level</option>
                  <option value="Senior Level">Senior Level</option>
                  <option value="Expert">Expert</option>
                </select>
              </div>
            </div>

            {/* Evaluation Criteria */}
            <div className="mb-8">
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Evaluation Criteria
              </label>
              <div className="space-y-2">
                {interviewConfig.evaluationCriteria.map((criterion, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={criterion}
                      onChange={(e) => {
                        const newCriteria = [...interviewConfig.evaluationCriteria];
                        newCriteria[idx] = e.target.value;
                        setInterviewConfig({ ...interviewConfig, evaluationCriteria: newCriteria });
                      }}
                      className="flex-1 h-[40px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                    />
                    <button
                      onClick={() => {
                        const newCriteria = interviewConfig.evaluationCriteria.filter((_, i) => i !== idx);
                        setInterviewConfig({ ...interviewConfig, evaluationCriteria: newCriteria });
                      }}
                      className="w-[40px] h-[40px] rounded-[8px] border border-[#e5e7eb] flex items-center justify-center hover:bg-[#fee2e2] hover:border-[#ef4444] transition-colors"
                    >
                      <Trash2 size={16} className="text-[#ef4444]" />
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setInterviewConfig({
                    ...interviewConfig,
                    evaluationCriteria: [...interviewConfig.evaluationCriteria, '']
                  })}
                  className="flex items-center gap-2 h-[40px] px-4 rounded-[8px] border border-dashed border-[#d1d5db] hover:border-[#6366f1] hover:bg-[#f5f3ff] transition-colors w-full"
                >
                  <Plus size={16} className="text-[#6366f1]" />
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                    Add Criterion
                  </span>
                </button>
              </div>
            </div>

            {/* Additional Options */}
            <div className="space-y-4 mb-8 p-4 bg-[#f9fafb] rounded-[10px]">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={interviewConfig.allowRetakes}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, allowRetakes: e.target.checked })}
                  className="w-[18px] h-[18px] rounded border-gray-300 text-[#6366f1] focus:ring-2 focus:ring-[#6366f1]"
                />
                <div>
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">Allow Retakes</span>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Candidates can retake the interview if they're not satisfied
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={interviewConfig.showFeedback}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, showFeedback: e.target.checked })}
                  className="w-[18px] h-[18px] rounded border-gray-300 text-[#6366f1] focus:ring-2 focus:ring-[#6366f1]"
                />
                <div>
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">Show AI Feedback</span>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Display AI-generated feedback after the interview
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={interviewConfig.recordingRequired}
                  onChange={(e) => setInterviewConfig({ ...interviewConfig, recordingRequired: e.target.checked })}
                  className="w-[18px] h-[18px] rounded border-gray-300 text-[#6366f1] focus:ring-2 focus:ring-[#6366f1]"
                />
                <div>
                  <span className="font-['Arimo',sans-serif] text-[14px] text-[#111827]">Recording Required</span>
                  <p className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                    Save video/audio recordings for review
                  </p>
                </div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={onBack}
                className="h-[44px] px-[24px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] text-[#374151] hover:bg-[#f9fafb] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setCurrentStep('sections')}
                disabled={!interviewConfig.title}
                className="h-[44px] px-[24px] rounded-[8px] bg-[#6366f1] font-['Arimo',sans-serif] text-[14px] text-white hover:bg-[#5558e3] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue to Questions
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Sections Step
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

        {/* Interview Header */}
        <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8 mb-6">
          <div className="flex items-start justify-between mb-6">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-[#111827]">{interviewConfig.title}</h1>
                <span className={`px-[10px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] ${
                  interviewConfig.interviewType === 'live'
                    ? 'bg-[#dbeafe] text-[#2563eb]'
                    : 'bg-[#fef3c7] text-[#f59e0b]'
                }`}>
                  {interviewConfig.interviewType === 'live' ? 'Live AI' : 'Recorded'}
                </span>
              </div>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                {interviewConfig.description || 'No description'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowPreview(true)}
                className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
              >
                <Eye size={16} className="text-[#6b7280]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">Preview</span>
              </button>
              <button
                onClick={() => setCurrentStep('settings')}
                className="flex items-center gap-2 h-[40px] px-[20px] rounded-[8px] border border-[#e5e7eb] hover:bg-[#f9fafb] transition-colors"
              >
                <Settings size={16} className="text-[#6b7280]" />
                <span className="font-['Arimo',sans-serif] text-[14px] text-[#374151]">Edit Settings</span>
              </button>
            </div>
          </div>

          {/* Interview Stats */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-[#f9fafb] rounded-[8px] p-4">
              <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Duration</div>
              <div className="text-[20px] text-[#111827]">{interviewConfig.duration} min</div>
            </div>
            <div className="bg-[#f9fafb] rounded-[8px] p-4">
              <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Sections</div>
              <div className="text-[20px] text-[#111827]">{sections.length}</div>
            </div>
            <div className="bg-[#f9fafb] rounded-[8px] p-4">
              <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Questions</div>
              <div className="text-[20px] text-[#111827]">{totalQuestions}</div>
            </div>
            <div className="bg-[#f9fafb] rounded-[8px] p-4">
              <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">Difficulty</div>
              <div className="text-[20px] text-[#111827]">{interviewConfig.difficulty}</div>
            </div>
            <div className="bg-[#f9fafb] rounded-[8px] p-4">
              <div className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280] mb-1">AI Model</div>
              <div className="text-[16px] text-[#111827]">{interviewConfig.aiModel}</div>
            </div>
          </div>
        </div>

        {/* Sections List */}
        <div className="space-y-4 mb-6">
          {sections.map((section, idx) => (
            <div key={section.id} className="bg-white rounded-[16px] border border-[#e5e7eb] overflow-hidden">
              {/* Section Header */}
              <div className="p-6 border-b border-[#e5e7eb]">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-8 h-8 rounded-full bg-[#ede9fe] flex items-center justify-center">
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1] font-semibold">
                        {idx + 1}
                      </span>
                    </div>
                    {editingSection === section.id ? (
                      <input
                        type="text"
                        value={section.title}
                        onChange={(e) => handleUpdateSection(section.id, { title: e.target.value })}
                        onBlur={() => setEditingSection(null)}
                        autoFocus
                        placeholder="Section title..."
                        className="flex-1 h-[40px] px-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[16px] font-medium focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                      />
                    ) : (
                      <h3 className="font-['Arimo',sans-serif] text-[18px] text-[#111827] font-semibold">
                        {section.title || 'Untitled Section'}
                      </h3>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingSection(section.id)}
                      className="w-[36px] h-[36px] rounded-[8px] border border-[#e5e7eb] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
                    >
                      <Edit size={16} className="text-[#6b7280]" />
                    </button>
                    <button
                      onClick={() => handleDuplicateSection(section.id)}
                      className="w-[36px] h-[36px] rounded-[8px] border border-[#e5e7eb] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
                    >
                      <Copy size={16} className="text-[#6b7280]" />
                    </button>
                    <button
                      onClick={() => handleDeleteSection(section.id)}
                      className="w-[36px] h-[36px] rounded-[8px] border border-[#e5e7eb] flex items-center justify-center hover:bg-[#fee2e2] hover:border-[#ef4444] transition-colors"
                    >
                      <Trash2 size={16} className="text-[#ef4444]" />
                    </button>
                    <button
                      onClick={() => toggleSectionExpansion(section.id)}
                      className="w-[36px] h-[36px] rounded-[8px] border border-[#e5e7eb] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
                    >
                      {expandedSections.has(section.id) ? (
                        <ChevronUp size={16} className="text-[#6b7280]" />
                      ) : (
                        <ChevronDown size={16} className="text-[#6b7280]" />
                      )}
                    </button>
                  </div>
                </div>

                <textarea
                  value={section.description}
                  onChange={(e) => handleUpdateSection(section.id, { description: e.target.value })}
                  placeholder="Section description..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent mb-3"
                />

                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Clock size={16} className="text-[#6b7280]" />
                    <input
                      type="number"
                      value={section.timeAllocation}
                      onChange={(e) => handleUpdateSection(section.id, { timeAllocation: parseInt(e.target.value) || 0 })}
                      min="1"
                      className="w-[80px] h-[32px] px-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                    />
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">min</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Target size={16} className="text-[#6b7280]" />
                    <input
                      type="number"
                      value={section.evaluationWeight}
                      onChange={(e) => handleUpdateSection(section.id, { evaluationWeight: parseInt(e.target.value) || 0 })}
                      min="0"
                      max="100"
                      className="w-[80px] h-[32px] px-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                    />
                    <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">% weight</span>
                  </div>
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    {section.questions.length} question{section.questions.length !== 1 ? 's' : ''}
                  </span>
                </div>
              </div>

              {/* Section Content */}
              {expandedSections.has(section.id) && (
                <div className="p-6">
                  {/* Questions */}
                  {section.questions.length > 0 && (
                    <div className="space-y-4 mb-4">
                      {section.questions.map((question, qIdx) => (
                        <QuestionCard
                          key={question.id}
                          question={question}
                          index={qIdx}
                          interviewType={interviewConfig.interviewType}
                          onUpdate={(updates) => handleUpdateQuestion(section.id, question.id, updates)}
                          onDelete={() => handleDeleteQuestion(section.id, question.id)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Add Question Actions */}
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleAddQuestion(section.id)}
                      className="flex items-center gap-2 h-[44px] px-[20px] rounded-[8px] border-2 border-dashed border-[#d1d5db] hover:border-[#6366f1] hover:bg-[#f5f3ff] transition-colors"
                    >
                      <Plus size={18} className="text-[#6366f1]" />
                      <span className="font-['Arimo',sans-serif] text-[14px] text-[#6366f1]">
                        Add Question Manually
                      </span>
                    </button>
                    <button
                      onClick={() => handleGenerateWithAI(section.id)}
                      className="flex items-center gap-2 h-[44px] px-[20px] rounded-[8px] bg-gradient-to-r from-[#6366f1] to-[#8b5cf6] hover:from-[#5558e3] hover:to-[#7c3aed] text-white transition-all"
                    >
                      <Wand2 size={18} />
                      <span className="font-['Arimo',sans-serif] text-[14px]">Generate with AI</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Add Section Button */}
          <button
            onClick={handleAddSection}
            className="w-full h-[80px] rounded-[16px] border-2 border-dashed border-[#d1d5db] hover:border-[#6366f1] hover:bg-[#f5f3ff] transition-all flex items-center justify-center gap-2"
          >
            <Plus size={20} className="text-[#6366f1]" />
            <span className="font-['Arimo',sans-serif] text-[16px] text-[#6366f1] font-medium">
              Add Interview Section
            </span>
          </button>
        </div>

        {/* Footer Actions */}
        <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-1">
                {totalQuestions} questions across {sections.length} sections
              </p>
              {totalWeight !== 100 && totalWeight > 0 && (
                <p className="font-['Arimo',sans-serif] text-[13px] text-[#f59e0b]">
                  ⚠️ Total weight is {totalWeight}% (should be 100%)
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep('settings')}
                className="h-[44px] px-[24px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] text-[#374151] hover:bg-[#f9fafb] transition-colors"
              >
                Back to Settings
              </button>
              <button
                onClick={handleSave}
                disabled={sections.length === 0 || totalQuestions === 0}
                className="flex items-center gap-2 h-[44px] px-[24px] rounded-[8px] bg-[#10b981] font-['Arimo',sans-serif] text-[14px] text-white hover:bg-[#059669] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                Save AI Interview
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* AI Generator Modal */}
      {showAIGenerator && (
        <AIGeneratorModal
          onClose={() => {
            setShowAIGenerator(false);
            setCurrentGeneratingSection(null);
          }}
          onGenerate={handleAIGenerated}
          context={{
            title: interviewConfig.title,
            difficulty: interviewConfig.difficulty,
            type: 'interview'
          }}
        />
      )}
    </div>
  );
}

// Question Card Component
interface QuestionCardProps {
  question: InterviewQuestion;
  index: number;
  interviewType: 'live' | 'recorded';
  onUpdate: (updates: Partial<InterviewQuestion>) => void;
  onDelete: () => void;
}

function QuestionCard({ question, index, interviewType, onUpdate, onDelete }: QuestionCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRefiner, setShowRefiner] = useState(false);

  const handleAddFollowUp = () => {
    onUpdate({ followUpQuestions: [...question.followUpQuestions, ''] });
  };

  const handleUpdateFollowUp = (idx: number, value: string) => {
    const updated = [...question.followUpQuestions];
    updated[idx] = value;
    onUpdate({ followUpQuestions: updated });
  };

  const handleRemoveFollowUp = (idx: number) => {
    const updated = question.followUpQuestions.filter((_, i) => i !== idx);
    onUpdate({ followUpQuestions: updated });
  };

  const handleAddKeyPoint = () => {
    onUpdate({ keyPoints: [...question.keyPoints, ''] });
  };

  const handleUpdateKeyPoint = (idx: number, value: string) => {
    const updated = [...question.keyPoints];
    updated[idx] = value;
    onUpdate({ keyPoints: updated });
  };

  const handleRemoveKeyPoint = (idx: number) => {
    const updated = question.keyPoints.filter((_, i) => i !== idx);
    onUpdate({ keyPoints: updated });
  };

  return (
    <div className="border border-[#e5e7eb] rounded-[12px] overflow-hidden">
      <div className="p-4 bg-[#f9fafb]">
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-[#6366f1] flex items-center justify-center shrink-0 mt-1">
            <span className="font-['Arimo',sans-serif] text-[12px] text-white font-semibold">
              {index + 1}
            </span>
          </div>
          <div className="flex-1">
            <div className="flex items-start gap-2 mb-2">
              <textarea
                value={question.questionText}
                onChange={(e) => onUpdate({ questionText: e.target.value })}
                placeholder="Enter your interview question..."
                rows={2}
                className="flex-1 px-3 py-2 rounded-[8px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
              <button
                onClick={() => setShowRefiner(true)}
                className="w-[36px] h-[36px] rounded-[8px] border border-[#e5e7eb] bg-white flex items-center justify-center hover:bg-[#f5f3ff] hover:border-[#6366f1] transition-colors shrink-0"
                title="Refine with AI"
              >
                <Wand2 size={16} className="text-[#6366f1]" />
              </button>
            </div>
            <div className="flex items-center gap-3">
              <select
                value={question.difficulty}
                onChange={(e) => onUpdate({ difficulty: e.target.value as any })}
                className="h-[32px] px-2 rounded-[6px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[12px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
              {interviewType === 'recorded' && (
                <div className="flex items-center gap-1">
                  <Clock size={14} className="text-[#6b7280]" />
                  <input
                    type="number"
                    value={question.timeLimit || 120}
                    onChange={(e) => onUpdate({ timeLimit: parseInt(e.target.value) || 120 })}
                    className="w-[60px] h-[32px] px-2 rounded-[6px] border border-[#e5e7eb] bg-white font-['Arimo',sans-serif] text-[12px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                  />
                  <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">sec</span>
                </div>
              )}
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="flex items-center gap-1 font-['Arimo',sans-serif] text-[12px] text-[#6366f1] hover:underline"
              >
                {isExpanded ? 'Less' : 'More'} details
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              <button
                onClick={onDelete}
                className="ml-auto w-[32px] h-[32px] rounded-[6px] flex items-center justify-center hover:bg-[#fee2e2] transition-colors"
              >
                <Trash2 size={14} className="text-[#ef4444]" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-4 bg-white">
          {/* Follow-up Questions */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] font-medium mb-2">
              Follow-up Questions
            </label>
            <div className="space-y-2">
              {question.followUpQuestions.map((followUp, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={followUp}
                    onChange={(e) => handleUpdateFollowUp(idx, e.target.value)}
                    placeholder="Follow-up question..."
                    className="flex-1 h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                  />
                  <button
                    onClick={() => handleRemoveFollowUp(idx)}
                    className="w-[36px] h-[36px] rounded-[6px] flex items-center justify-center hover:bg-[#fee2e2] transition-colors"
                  >
                    <X size={14} className="text-[#ef4444]" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddFollowUp}
                className="flex items-center gap-1 h-[36px] px-3 rounded-[6px] border border-dashed border-[#d1d5db] hover:border-[#6366f1] hover:bg-[#f5f3ff] transition-colors w-full"
              >
                <Plus size={14} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">Add Follow-up</span>
              </button>
            </div>
          </div>

          {/* Key Points */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] font-medium mb-2">
              Key Points to Cover
            </label>
            <div className="space-y-2">
              {question.keyPoints.map((point, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={point}
                    onChange={(e) => handleUpdateKeyPoint(idx, e.target.value)}
                    placeholder="Key point..."
                    className="flex-1 h-[36px] px-3 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
                  />
                  <button
                    onClick={() => handleRemoveKeyPoint(idx)}
                    className="w-[36px] h-[36px] rounded-[6px] flex items-center justify-center hover:bg-[#fee2e2] transition-colors"
                  >
                    <X size={14} className="text-[#ef4444]" />
                  </button>
                </div>
              ))}
              <button
                onClick={handleAddKeyPoint}
                className="flex items-center gap-1 h-[36px] px-3 rounded-[6px] border border-dashed border-[#d1d5db] hover:border-[#6366f1] hover:bg-[#f5f3ff] transition-colors w-full"
              >
                <Plus size={14} className="text-[#6366f1]" />
                <span className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1]">Add Key Point</span>
              </button>
            </div>
          </div>

          {/* Ideal Answer */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[13px] text-[#374151] font-medium mb-2">
              Ideal Answer (Optional - for AI evaluation reference)
            </label>
            <textarea
              value={question.idealAnswer || ''}
              onChange={(e) => onUpdate({ idealAnswer: e.target.value })}
              placeholder="Describe an ideal answer for AI evaluation..."
              rows={3}
              className="w-full px-3 py-2 rounded-[6px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] resize-none focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
            />
          </div>
        </div>
      )}

      {/* Text Refiner Modal */}
      {showRefiner && (
        <TextRefiner
          initialText={question.questionText}
          onSave={(refined) => {
            onUpdate({ questionText: refined });
            setShowRefiner(false);
          }}
          onClose={() => setShowRefiner(false)}
          context="interview question"
        />
      )}
    </div>
  );
}