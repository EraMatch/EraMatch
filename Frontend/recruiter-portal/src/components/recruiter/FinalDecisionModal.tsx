import { useState } from 'react';
import { X, Send, Download, CheckCircle, Mail, FileText, AlertCircle, Users } from 'lucide-react';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';

interface Candidate {
  id: number;
  name: string;
  email: string;
  phone: string;
  finalScore: number;
  position: string;
}

interface FinalDecisionModalProps {
  open: boolean;
  onClose: () => void;
  groupName: string;
  positionTitle: string;
  candidates: Candidate[];
  onSendOffers: (selectedCandidateIds: number[], emailContent: string) => void;
  onExportContacts: (selectedCandidateIds: number[]) => void;
}

export function FinalDecisionModal({
  open,
  onClose,
  groupName,
  positionTitle,
  candidates,
  onSendOffers,
  onExportContacts
}: FinalDecisionModalProps) {
  const [selectedCandidates, setSelectedCandidates] = useState<number[]>([]);
  const [emailSubject, setEmailSubject] = useState(`Offer for ${positionTitle} Position`);
  const [emailBody, setEmailBody] = useState(`Dear [Candidate Name],

We are pleased to inform you that you have been selected for the ${positionTitle} position at our organization.

After careful review of your qualifications and performance throughout the recruitment process, we believe you would be an excellent fit for our team.

We would like to extend a formal offer to you. Please find the details attached.

We look forward to welcoming you to our team!

Best regards,
[Your Company Name]`);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [actionType, setActionType] = useState<'send' | 'export' | null>(null);

  const toggleCandidate = (candidateId: number) => {
    setSelectedCandidates(prev =>
      prev.includes(candidateId)
        ? prev.filter(id => id !== candidateId)
        : [...prev, candidateId]
    );
  };

  const toggleAll = () => {
    if (selectedCandidates.length === candidates.length) {
      setSelectedCandidates([]);
    } else {
      setSelectedCandidates(candidates.map(c => c.id));
    }
  };

  const handleSendOffers = () => {
    setActionType('send');
    setShowConfirmation(true);
  };

  const handleExportContacts = () => {
    setActionType('export');
    setShowConfirmation(true);
  };

  const confirmAction = () => {
    if (actionType === 'send') {
      onSendOffers(selectedCandidates, emailBody);
    } else if (actionType === 'export') {
      onExportContacts(selectedCandidates);
    }
    setShowConfirmation(false);
    setActionType(null);
    onClose();
  };

  const selectedCandidatesData = candidates.filter(c => selectedCandidates.includes(c.id));

  return (
    <>
      <Dialog open={open && !showConfirmation} onOpenChange={onClose}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-3">
              <CheckCircle className="text-emerald-600" size={28} />
              Final Decision - Send Offers
            </DialogTitle>
            <div className="text-sm text-gray-600 mt-2">
              Group: <span className="font-semibold text-gray-800">{groupName}</span> • Position: <span className="font-semibold text-gray-800">{positionTitle}</span>
            </div>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-xl p-4">
                <div className="text-sm text-indigo-700 mb-1">Total Candidates</div>
                <div className="text-3xl font-bold text-indigo-900">{candidates.length}</div>
              </div>
              <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border-2 border-emerald-200 rounded-xl p-4">
                <div className="text-sm text-emerald-700 mb-1">Selected for Offer</div>
                <div className="text-3xl font-bold text-emerald-900">{selectedCandidates.length}</div>
              </div>
              <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-xl p-4">
                <div className="text-sm text-purple-700 mb-1">Avg. Final Score</div>
                <div className="text-3xl font-bold text-purple-900">
                  {selectedCandidatesData.length > 0
                    ? Math.round(selectedCandidatesData.reduce((sum, c) => sum + c.finalScore, 0) / selectedCandidatesData.length)
                    : '-'}
                </div>
              </div>
            </div>

            {/* Candidate Selection */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Users size={20} className="text-indigo-600" />
                  Select Candidates for Offer
                </h3>
                <Button
                  onClick={toggleAll}
                  variant="outline"
                  className="text-sm"
                >
                  {selectedCandidates.length === candidates.length ? 'Deselect All' : 'Select All'}
                </Button>
              </div>

              <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="text-left p-4 text-sm font-semibold text-gray-700">Select</th>
                        <th className="text-left p-4 text-sm font-semibold text-gray-700">Candidate</th>
                        <th className="text-left p-4 text-sm font-semibold text-gray-700">Email</th>
                        <th className="text-left p-4 text-sm font-semibold text-gray-700">Phone</th>
                        <th className="text-left p-4 text-sm font-semibold text-gray-700">Final Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {candidates.map((candidate) => (
                        <tr
                          key={candidate.id}
                          className={`border-t border-gray-100 hover:bg-gray-50 transition-colors ${
                            selectedCandidates.includes(candidate.id) ? 'bg-indigo-50' : ''
                          }`}
                        >
                          <td className="p-4">
                            <input
                              type="checkbox"
                              checked={selectedCandidates.includes(candidate.id)}
                              onChange={() => toggleCandidate(candidate.id)}
                              className="w-5 h-5 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-4">
                            <div className="font-semibold text-gray-900">{candidate.name}</div>
                          </td>
                          <td className="p-4 text-gray-700">{candidate.email}</td>
                          <td className="p-4 text-gray-700">{candidate.phone}</td>
                          <td className="p-4">
                            <div className="flex items-center gap-2">
                              <div className="text-lg font-bold text-indigo-600">{candidate.finalScore}</div>
                              <div className="text-xs text-gray-500">/100</div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Email Composer */}
            {selectedCandidates.length > 0 && (
              <div className="border-2 border-indigo-200 rounded-xl p-6 bg-gradient-to-br from-indigo-50 to-white">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Mail size={20} className="text-indigo-600" />
                  Compose Offer Email
                </h3>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Email Subject
                    </label>
                    <input
                      type="text"
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      placeholder="Enter email subject..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Email Body
                    </label>
                    <textarea
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      rows={12}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
                      placeholder="Compose your offer email..."
                    />
                    <div className="mt-2 text-xs text-gray-500">
                      <AlertCircle size={12} className="inline mr-1" />
                      Tip: Use [Candidate Name] as a placeholder - it will be automatically replaced for each candidate
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-4 pt-4 border-t-2 border-gray-200">
              <Button
                onClick={handleSendOffers}
                disabled={selectedCandidates.length === 0}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white py-6 text-lg font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={20} className="mr-2" />
                Send Offers to {selectedCandidates.length} Candidate{selectedCandidates.length !== 1 ? 's' : ''}
              </Button>

              <Button
                onClick={handleExportContacts}
                disabled={selectedCandidates.length === 0}
                variant="outline"
                className="px-8 py-6 text-lg font-semibold border-2 border-indigo-600 text-indigo-600 hover:bg-indigo-50 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download size={20} className="mr-2" />
                Export Contacts
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmation} onOpenChange={() => setShowConfirmation(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="text-amber-600" size={24} />
              Confirm Action
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <p className="text-gray-700">
              {actionType === 'send' ? (
                <>
                  You are about to send offer emails to <span className="font-bold text-indigo-600">{selectedCandidates.length}</span> candidate{selectedCandidates.length !== 1 ? 's' : ''}.
                  <br /><br />
                  The candidates will receive the email with subject: <span className="font-semibold">"{emailSubject}"</span>
                </>
              ) : (
                <>
                  You are about to export contact details for <span className="font-bold text-indigo-600">{selectedCandidates.length}</span> candidate{selectedCandidates.length !== 1 ? 's' : ''}.
                  <br /><br />
                  A CSV file will be downloaded with their contact information.
                </>
              )}
            </p>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="text-sm font-semibold text-gray-700 mb-2">Selected Candidates:</div>
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {selectedCandidatesData.map(candidate => (
                  <div key={candidate.id} className="text-sm text-gray-600 flex items-center gap-2">
                    <CheckCircle size={14} className="text-emerald-600" />
                    {candidate.name}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button
                onClick={() => setShowConfirmation(false)}
                variant="outline"
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={confirmAction}
                className="flex-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white"
              >
                {actionType === 'send' ? 'Send Offers' : 'Export Contacts'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
