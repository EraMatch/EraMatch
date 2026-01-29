import { useState } from 'react';
import { Settings, Clock, Target, BarChart3 } from 'lucide-react';
import { Button } from '../ui/button';

interface AssessmentConfig {
  title: string;
  description: string;
  duration: number;
  passingScore: number;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  randomizeQuestions: boolean;
  showResults: boolean;
  allowReview: boolean;
  proctoring: boolean;
}

interface AssessmentSettingsProps {
  initialSettings: AssessmentConfig;
  onSave: (settings: AssessmentConfig) => void;
}

export function AssessmentSettings({ initialSettings, onSave }: AssessmentSettingsProps) {
  const [settings, setSettings] = useState<AssessmentConfig>(initialSettings);

  const handleSave = () => {
    if (!settings.title.trim()) {
      alert('Please enter an assessment title');
      return;
    }
    onSave(settings);
  };

  return (
    <div className="bg-white rounded-[16px] border border-[#e5e7eb] p-8">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-12 h-12 rounded-full bg-[#ede9fe] flex items-center justify-center">
            <Settings size={24} className="text-[#6366f1]" />
          </div>
          <div>
            <h2 className="text-[#111827]">Assessment Settings</h2>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              Configure general settings for your assessment
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Basic Information */}
        <div>
          <h3 className="text-[#111827] mb-4">Basic Information</h3>
          
          <div className="space-y-4">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Assessment Title *
              </label>
              <input
                type="text"
                value={settings.title}
                onChange={(e) => setSettings({ ...settings, title: e.target.value })}
                placeholder="e.g., Senior React Developer Technical Assessment"
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                Description
              </label>
              <textarea
                value={settings.description}
                onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                placeholder="Describe what this assessment covers and what candidates should expect..."
                rows={4}
                className="w-full px-4 py-3 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent resize-none"
              />
            </div>
          </div>
        </div>

        {/* Assessment Parameters */}
        <div>
          <h3 className="text-[#111827] mb-4">Assessment Parameters</h3>
          
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                <div className="flex items-center gap-2">
                  <Clock size={16} className="text-[#6b7280]" />
                  <span>Duration (minutes)</span>
                </div>
              </label>
              <input
                type="number"
                value={settings.duration}
                onChange={(e) => setSettings({ ...settings, duration: parseInt(e.target.value) || 0 })}
                min="5"
                max="240"
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>

            <div>
              <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
                <div className="flex items-center gap-2">
                  <Target size={16} className="text-[#6b7280]" />
                  <span>Passing Score (%)</span>
                </div>
              </label>
              <input
                type="number"
                value={settings.passingScore}
                onChange={(e) => setSettings({ ...settings, passingScore: parseInt(e.target.value) || 0 })}
                min="0"
                max="100"
                className="w-full h-[44px] px-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-[#6366f1] focus:border-transparent"
              />
            </div>
          </div>

          <div className="mt-6">
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-3">
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-[#6b7280]" />
                <span>Overall Difficulty</span>
              </div>
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['Easy', 'Medium', 'Hard'] as const).map((difficulty) => (
                <button
                  key={difficulty}
                  onClick={() => setSettings({ ...settings, difficulty })}
                  className={`h-[44px] rounded-[8px] border-2 transition-all font-['Arimo',sans-serif] text-[14px] ${
                    settings.difficulty === difficulty
                      ? difficulty === 'Easy'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : difficulty === 'Medium'
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-red-500 bg-red-50 text-red-700'
                      : 'border-[#e5e7eb] bg-white text-[#6b7280] hover:border-[#6366f1]'
                  }`}
                >
                  {difficulty}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-[#e5e7eb]">
        <Button
          className="h-[44px] px-8 rounded-[8px] bg-[#6366f1] hover:bg-[#4f46e5] text-white"
          onClick={handleSave}
        >
          Continue to Sections
        </Button>
      </div>
    </div>
  );
}
