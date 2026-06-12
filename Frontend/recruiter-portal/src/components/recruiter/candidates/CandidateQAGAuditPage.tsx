import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, Download } from 'lucide-react';
import type { ApplicationScoreBreakdown } from '../../../services/types';
import { useCandidateScoreBreakdown } from '../../../hooks/candidates/useCandidates';
import { usePositionHDEvalQAG } from '../../../hooks/positions/usePositions';

interface CandidateQAGAuditPageProps {
  candidateId: string;
  applicationId?: string;
}

interface AuditCheck {
  id: number;
  criterion: string;
  passed: boolean | null;
  verdict: string;
  reason: string;
  evidence: string;
  weight: number;
  mustHave: boolean;
  pending: boolean;
}

const MUST_HAVE_RE = /(must|required|mandatory|at\s+least|minimum|\bmin\b)/i;

export function CandidateQAGAuditPage({ candidateId, applicationId }: CandidateQAGAuditPageProps) {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'failed' | 'must-fail'>('all');

  const {
    data: scoreData,
    isLoading: scoreLoading,
    isError: scoreIsError,
  } = useCandidateScoreBreakdown(applicationId);

  const data = scoreData as ApplicationScoreBreakdown | undefined;
  const hasChecks = Array.isArray(data?.criteria_checks) && data!.criteria_checks.length > 0;
  const positionId = !hasChecks && data?.position_id ? String(data.position_id) : undefined;

  const { data: qagArtifact, isLoading: qagLoading } = usePositionHDEvalQAG(positionId);

  const loading = scoreLoading || (!!positionId && qagLoading);
  const error = !applicationId
    ? 'Missing applicationId. Open this page from a candidate/application context.'
    : scoreIsError
    ? 'Failed to load QAG audit data.'
    : null;

  const pendingQuestions = useMemo(() => {
    if (!qagArtifact) return [];
    const approved = Array.isArray((qagArtifact as any)?.approved_questions) ? (qagArtifact as any).approved_questions : [];
    const generated = Array.isArray((qagArtifact as any)?.questions) ? (qagArtifact as any).questions : [];
    return approved.length > 0 ? approved : generated;
  }, [qagArtifact]);

  const pendingSourceLabel = useMemo(() => {
    if (!qagArtifact) return '';
    const approved = Array.isArray((qagArtifact as any)?.approved_questions) ? (qagArtifact as any).approved_questions : [];
    return approved.length > 0
      ? 'Approved questions awaiting candidate evaluation'
      : 'Generated questions awaiting technical approval/evaluation';
  }, [qagArtifact]);

  const checks = useMemo<AuditCheck[]>(() => {
    const items = Array.isArray(data?.criteria_checks) ? data!.criteria_checks : [];
    const mappedChecks = items.map((item: any): AuditCheck => {
      const verdict = String(item.verdict || (item.passed ? 'YES' : 'NO')).toUpperCase();
      const passed = item.passed != null ? Boolean(item.passed) : verdict === 'YES';
      const criterion = String(item.criterion || '');
      const mustHave = MUST_HAVE_RE.test(criterion);
      return {
        id: Number(item.id || 0),
        criterion,
        passed: passed as boolean | null,
        verdict,
        reason: String(item.reason || ''),
        evidence: String(item.evidence || ''),
        weight: Number(item.weight || 0),
        mustHave,
        pending: false,
      };
    });

    if (mappedChecks.length > 0) return mappedChecks;

    return (pendingQuestions || []).map((q: any, idx: number): AuditCheck => {
      const criterion = String(q?.question || q?.criterion || '').trim();
      const mustHave = MUST_HAVE_RE.test(criterion);
      return {
        id: Number(q?.id || idx + 1),
        criterion,
        passed: null as boolean | null,
        verdict: 'PENDING',
        reason: pendingSourceLabel || 'Awaiting candidate QAG evaluation output.',
        evidence: '',
        weight: Number(q?.weight || 0),
        mustHave,
        pending: true,
      };
    });
  }, [data, pendingQuestions, pendingSourceLabel]);

  const filteredChecks = useMemo(() => {
    if (filter === 'all') return checks;
    if (filter === 'failed') return checks.filter(c => c.passed === false);
    return checks.filter(c => c.passed === false && c.mustHave);
  }, [checks, filter]);

  const summary = useMemo(() => {
    const total = checks.length;
    const passed = checks.filter(c => c.passed === true).length;
    const failed = checks.filter(c => c.passed === false).length;
    const pending = checks.filter(c => c.passed === null).length;
    const mustFail = checks.filter(c => c.passed === false && c.mustHave).length;
    return { total, passed, failed, pending, mustFail };
  }, [checks]);

  const handleExportPdf = () => {
    window.print();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto print:p-0">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>

      <div className="no-print flex items-center justify-between mb-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-[#6b7280] hover:text-[#111827]"
        >
          <ChevronLeft size={18} />
          Back
        </button>

        <button
          onClick={handleExportPdf}
          className="h-[38px] px-4 rounded-[8px] border border-[#d1d5db] bg-white hover:bg-[#f9fafb] text-[13px] flex items-center gap-2"
        >
          <Download size={14} />
          Export PDF
        </button>
      </div>

      <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-6 mb-4">
        <h1 className="text-[#111827] mb-1">QAG Audit Report</h1>
        <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
          Candidate: {data?.candidate_name || candidateId} • Application: {applicationId || 'N/A'}
        </p>
      </div>

      {loading ? (
        <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-12 flex items-center gap-3 text-[#6b7280]">
          <Loader2 size={18} className="animate-spin" />
          Loading QAG audit...
        </div>
      ) : error ? (
        <div className="bg-white border border-[#fecaca] rounded-[12px] p-6 text-[#b91c1c]">{error}</div>
      ) : (
        <>
          {summary.pending > 0 && (
            <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-[12px] p-4 mb-4 text-[#1e40af] text-[13px]">
              {summary.pending} QAG item(s) are pending evaluation. Pre-score can still be shown from heuristic scoring until QAG evaluation is completed.
            </div>
          )}

          <div className="bg-white border border-[#e5e7eb] rounded-[12px] p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-[#f9fafb] rounded-[8px] p-3">
              <p className="text-[12px] text-[#6b7280]">Total Questions</p>
              <p className="text-[20px] text-[#111827]">{summary.total}</p>
            </div>
            <div className="bg-[#f0fdf4] rounded-[8px] p-3">
              <p className="text-[12px] text-[#166534]">Passed</p>
              <p className="text-[20px] text-[#166534]">{summary.passed}</p>
            </div>
            <div className="bg-[#fef2f2] rounded-[8px] p-3">
              <p className="text-[12px] text-[#991b1b]">Failed</p>
              <p className="text-[20px] text-[#991b1b]">{summary.failed}</p>
            </div>
            <div className="bg-[#fff7ed] rounded-[8px] p-3">
              <p className="text-[12px] text-[#9a3412]">Must-Have Failures</p>
              <p className="text-[20px] text-[#9a3412]">{summary.mustFail}</p>
            </div>
          </div>

          <div className="no-print bg-white border border-[#e5e7eb] rounded-[12px] p-4 mb-4 flex items-center gap-2">
            <span className="text-[13px] text-[#6b7280]">Filter:</span>
            <button className={`h-[30px] px-3 rounded-[6px] text-[12px] ${filter === 'all' ? 'bg-[#6366f1] text-white' : 'bg-[#f3f4f6] text-[#374151]'}`} onClick={() => setFilter('all')}>All</button>
            <button className={`h-[30px] px-3 rounded-[6px] text-[12px] ${filter === 'failed' ? 'bg-[#ef4444] text-white' : 'bg-[#f3f4f6] text-[#374151]'}`} onClick={() => setFilter('failed')}>Failed Only</button>
            <button className={`h-[30px] px-3 rounded-[6px] text-[12px] ${filter === 'must-fail' ? 'bg-[#f59e0b] text-white' : 'bg-[#f3f4f6] text-[#374151]'}`} onClick={() => setFilter('must-fail')}>Must-Have Failures</button>
          </div>

          <div className="bg-white border border-[#e5e7eb] rounded-[12px] overflow-hidden">
            <table className="w-full">
              <thead className="bg-[#f9fafb] border-b border-[#e5e7eb]">
                <tr>
                  <th className="text-left px-4 py-3 text-[12px] text-[#6b7280] w-[70px]">#</th>
                  <th className="text-left px-4 py-3 text-[12px] text-[#6b7280]">Question</th>
                  <th className="text-left px-4 py-3 text-[12px] text-[#6b7280] w-[120px]">Verdict</th>
                  <th className="text-left px-4 py-3 text-[12px] text-[#6b7280] w-[110px]">Weight</th>
                  <th className="text-left px-4 py-3 text-[12px] text-[#6b7280]">LLM Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredChecks.map((row: AuditCheck) => (
                  <tr key={`${row.id}-${row.criterion}`} className="border-b border-[#e5e7eb] align-top">
                    <td className="px-4 py-3 text-[12px] text-[#6b7280]">{row.id}</td>
                    <td className="px-4 py-3 text-[13px] text-[#111827]">
                      {row.criterion}
                      {row.mustHave && <span className="ml-2 text-[11px] px-2 py-0.5 rounded bg-[#fff7ed] text-[#9a3412]">Must-Have</span>}
                    </td>
                    <td className="px-4 py-3">
                      {row.passed === null ? (
                        <span className="text-[12px] px-2 py-1 rounded bg-[#e0e7ff] text-[#3730a3]">PENDING</span>
                      ) : (
                        <span className={`text-[12px] px-2 py-1 rounded ${row.passed ? 'bg-[#dcfce7] text-[#166534]' : 'bg-[#fee2e2] text-[#991b1b]'}`}>
                          {row.passed ? 'YES' : 'NO'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[#374151]">{row.weight.toFixed(4)}</td>
                    <td className="px-4 py-3 text-[12px] text-[#374151]">
                      {row.reason || 'No reason provided'}
                      {row.evidence && <div className="text-[11px] text-[#6b7280] mt-1">Evidence: {row.evidence}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
