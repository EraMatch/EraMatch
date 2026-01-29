import { useState } from 'react';
import { X, Calendar, Play, Clock } from 'lucide-react';
import { Button } from '../ui/button';

interface StartStageModalProps {
  stageName: string;
  onConfirm: (startDate: Date, expectedEndDate: Date) => void;
  onCancel: () => void;
}

export function StartStageModal({ stageName, onConfirm, onCancel }: StartStageModalProps) {
  const today = new Date();
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [startDate, setStartDate] = useState(today.toISOString().split('T')[0]);
  const [expectedEndDate, setExpectedEndDate] = useState(nextWeek.toISOString().split('T')[0]);

  const handleConfirm = () => {
    const start = new Date(startDate);
    const end = new Date(expectedEndDate);
    
    if (end <= start) {
      alert('End date must be after start date');
      return;
    }
    
    onConfirm(start, end);
  };

  const calculateDuration = () => {
    const start = new Date(startDate);
    const end = new Date(expectedEndDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <div className="bg-white rounded-[16px] shadow-2xl max-w-lg w-full">
        {/* Header */}
        <div className="px-8 py-6 border-b border-[#e5e7eb]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
                <Play size={20} className="text-emerald-600" />
              </div>
              <div>
                <h2 className="text-[#111827]">Start Stage: {stageName}</h2>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  Set the timeline for this stage
                </p>
              </div>
            </div>
            <button
              onClick={onCancel}
              className="w-10 h-10 rounded-[8px] flex items-center justify-center hover:bg-[#f9fafb] transition-colors"
            >
              <X size={20} className="text-[#6b7280]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6">
          {/* Start Date */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
              Start Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#6b7280]" size={16} />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full h-[44px] pl-10 pr-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <p className="mt-2 text-[12px] text-[#6b7280]">
              When should this stage begin?
            </p>
          </div>

          {/* Expected End Date */}
          <div>
            <label className="block font-['Arimo',sans-serif] text-[14px] text-[#374151] mb-2">
              Expected End Date
            </label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-[#6b7280]" size={16} />
              <input
                type="date"
                value={expectedEndDate}
                onChange={(e) => setExpectedEndDate(e.target.value)}
                min={startDate}
                className="w-full h-[44px] pl-10 pr-4 rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[14px] focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <p className="mt-2 text-[12px] text-[#6b7280]">
              Deadline for completing this stage
            </p>
          </div>

          {/* Duration Preview */}
          <div className="p-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-[12px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center">
                  <Clock size={20} className="text-emerald-600" />
                </div>
                <div>
                  <div className="text-[12px] text-emerald-700 font-medium mb-1">Stage Duration</div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[28px] font-bold text-emerald-900">
                      {calculateDuration()}
                    </span>
                    <span className="text-[14px] text-emerald-700">
                      {calculateDuration() === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-[12px]">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
                <span className="text-blue-600 text-[12px]">ℹ</span>
              </div>
              <div>
                <p className="font-['Arimo',sans-serif] text-[13px] text-blue-900 mb-2">
                  <strong>What happens when you start this stage:</strong>
                </p>
                <ul className="font-['Arimo',sans-serif] text-[12px] text-blue-800 space-y-1 list-disc list-inside">
                  <li>Stage becomes <strong>Active</strong></li>
                  <li>Configuration is <strong>locked</strong> (no more edits)</li>
                  <li>Candidates can begin this phase</li>
                  <li>You can close the stage anytime before or on the end date</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-4 border-t border-[#e5e7eb]">
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onCancel}
              className="px-6 py-2 rounded-[8px] border border-[#e5e7eb] text-[14px] hover:bg-[#f9fafb] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 rounded-[8px] bg-emerald-600 hover:bg-emerald-700 text-white text-[14px] transition-colors flex items-center gap-2"
            >
              <Play size={16} />
              Start Stage
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
