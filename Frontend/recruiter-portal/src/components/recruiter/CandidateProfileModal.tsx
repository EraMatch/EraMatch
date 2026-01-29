import { X, Briefcase, GraduationCap, MapPin } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';

interface JoinRequest {
  id: number;
  name: string;
  email: string;
  appliedPosition: string;
  experience: string;
  skills: string[];
  requestDate: string;
}

interface CandidateProfileModalProps {
  candidate: JoinRequest;
  onClose: () => void;
  onReject?: () => void;
  onApprove?: () => void;
}

export function CandidateProfileModal({ candidate, onClose, onReject, onApprove }: CandidateProfileModalProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
      <Card className="max-w-md w-full max-h-[90vh] overflow-y-auto rounded-3xl shadow-lg">
        {/* Header */}
        <div className="sticky top-0 bg-white p-6 border-b border-gray-200 rounded-t-3xl flex items-center justify-between">
          <h3 className="text-gray-900">Candidate Profile</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6">
          {/* Candidate Info */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-white text-xl" style={{ backgroundColor: '#6366F1' }}>
                {candidate.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1">
                <h4 className="text-gray-900 mb-1">{candidate.name}</h4>
                <div className="flex items-center gap-2 text-gray-500 text-sm mb-1">
                  <span>📧</span>
                  <span>{candidate.email}</span>
                </div>
                <div className="flex items-center gap-2 text-gray-500 text-sm">
                  <span>📞</span>
                  <span>+1 (555) 123-4567</span>
                </div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              <span className="inline-block">Applied for: </span>
              <span className="text-gray-900">{candidate.appliedPosition}</span>
            </div>
          </div>

          {/* Experience */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Briefcase className="w-5 h-5 text-gray-600" />
              <h5 className="text-gray-900">Experience</h5>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed">
              {candidate.experience}
            </p>
          </div>

          {/* Education */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <GraduationCap className="w-5 h-5 text-gray-600" />
              <h5 className="text-gray-900">Education</h5>
            </div>
            <p className="text-gray-900 text-sm">BS in Computer Science, MIT</p>
            <p className="text-gray-500 text-xs mt-1">Graduated 2020</p>
          </div>

          {/* Skills */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <MapPin className="w-5 h-5 text-gray-600" />
              <h5 className="text-gray-900">Skills</h5>
            </div>
            <div className="flex flex-wrap gap-2">
              {candidate.skills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 rounded-full text-sm"
                  style={{ backgroundColor: '#EEF2FF', color: '#6366F1' }}
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>

          {/* Availability */}
          <div className="mb-6">
            <h5 className="text-gray-900 mb-2">Availability</h5>
            <div className="p-4 rounded-lg" style={{ backgroundColor: '#FFFBEB' }}>
              <p className="text-sm" style={{ color: '#92400E' }}>
                <span className="inline-block mr-1">⚠️</span>
                <strong>Important:</strong> This candidate can start at the recruiter's preference, but requests they respond by{' '}
                <strong>December 15, 2025</strong>.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              className="flex-1 rounded-full"
              style={{ color: '#EF4444', borderColor: '#EF4444' }}
              onClick={() => {
                onReject?.();
                onClose();
              }}
            >
              Reject
            </Button>
            <Button
              className="flex-1 rounded-full text-white"
              style={{ backgroundColor: '#1F2937' }}
              onClick={() => {
                onApprove?.();
                onClose();
              }}
            >
              Approve & Onboard
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
