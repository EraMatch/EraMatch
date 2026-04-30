import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronLeft, Play, Pause, SkipForward, AlertTriangle, Flag, Mail, X, FileText, Clock, User, Video, ChevronDown } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../../../services/api';
import { API_URL } from '../../../services/client';

interface FlagEvent {
  id: string;
  timestamp: number; // in seconds
  timeDisplay: string;
  event: string;
  severity: 'high' | 'medium' | 'low';
  module: 'Assessment' | 'AI Interview';
  evidence: string;
  metadata?: Record<string, unknown> | null;
  proof?: Record<string, unknown> | null;
  notes: string;
  status: 'pending' | 'cleared' | 'escalated';
}

interface SuspectReviewPageProps {
  candidateId: string;
  applicationId?: string;
  onBack: () => void;
  onViewCandidate: (id: string) => void;
}

interface SuspectReviewPayload {
  candidate_id: string;
  application_id?: string;
  candidate_name: string;
  group_name: string;
  position_title: string;
  current_module: string;
  recording_url?: string | null;
  duration: number;
  suspicious_timestamps?: number[];
  flags: FlagEvent[];
}

export function SuspectReviewPage({
  candidateId,
  applicationId,
  onBack,
  onViewCandidate
}: SuspectReviewPageProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const safeDuration = Math.max(duration, 1);
  const [selectedFlag, setSelectedFlag] = useState<string | null>(null);
  const [showEscalateModal, setShowEscalateModal] = useState(false);
  const [showJustificationModal, setShowJustificationModal] = useState(false);
  const [showMarkReviewedModal, setShowMarkReviewedModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [decompressionStatus, setDecompressionStatus] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [flags, setFlags] = useState<FlagEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [suspectTimestamps, setSuspectTimestamps] = useState<number[]>([]);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [drawerExpanded, setDrawerExpanded] = useState(true);
  const [flagStatuses, setFlagStatuses] = useState<Record<string, 'pending' | 'cleared' | 'escalated'>>({});
  const [candidateName, setCandidateName] = useState('Unknown Candidate');
  const [groupName, setGroupName] = useState('Unknown Group');
  const [positionTitle, setPositionTitle] = useState('Unknown Position');
  const [currentModule, setCurrentModule] = useState('Assessment');

  const pendingCount = useMemo(
    () => flags.filter((f) => (flagStatuses[f.id] || f.status) === 'pending').length,
    [flags, flagStatuses],
  );
  const reviewedCount = useMemo(
    () => flags.filter((f) => (flagStatuses[f.id] || f.status) !== 'pending').length,
    [flags, flagStatuses],
  );
  const highSeverityCount = useMemo(
    () => flags.filter((f) => f.severity === 'high').length,
    [flags],
  );

  const moduleTimeline = useMemo(() => {
    const modules = ['Assessment', 'AI Interview', 'Live Interview'];
    const map = new Map<string, { flags: number; maxTs: number }>();
    for (const moduleName of modules) {
      map.set(moduleName, { flags: 0, maxTs: 0 });
    }
    for (const flag of flags) {
      const current = map.get(flag.module) || { flags: 0, maxTs: 0 };
      current.flags += 1;
      current.maxTs = Math.max(current.maxTs, flag.timestamp || 0);
      map.set(flag.module, current);
    }

    return modules.map((moduleName) => {
      const stats = map.get(moduleName) || { flags: 0, maxTs: 0 };
      const progress = stats.maxTs > 0 ? Math.min(100, Math.round((stats.maxTs / safeDuration) * 100)) : 0;
      const status = progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'pending';
      return {
        module: moduleName,
        progress,
        status,
        time: stats.maxTs > 0 ? `${Math.max(1, Math.ceil(stats.maxTs / 60))} mins` : '-',
        flags: stats.flags,
      };
    });
  }, [flags, safeDuration]);

  const selectedFlagData = useMemo(
    () => flags.find((f) => f.id === selectedFlag) || null,
    [flags, selectedFlag],
  );

  // Fetch suspect review data from API
  useEffect(() => {
    const fetchSuspectReview = async () => {
      try {
        setLoading(true);
        const data = await api.recruiter.getSuspectReview(candidateId, applicationId) as SuspectReviewPayload;
        setCandidateName(data.candidate_name || 'Unknown Candidate');
        setGroupName(data.group_name || 'Unknown Group');
        setPositionTitle(data.position_title || 'Unknown Position');
        setCurrentModule(data.current_module || 'Assessment');
        const backendBase = API_URL.replace('/api/v1', '');
        if (data.recording_url && /^https?:\/\//i.test(data.recording_url)) {
          setRecordingUrl(data.recording_url);
        } else if (data.recording_url) {
          setRecordingUrl(`${backendBase}${data.recording_url}`);
        } else {
          setRecordingUrl(null);
        }
        setFlags(data.flags || []);
        setSuspectTimestamps((data.suspicious_timestamps || []).map((v) => Math.max(0, Math.floor(v))));
        setDuration(Math.max(0, data.duration || 0));
        setFlagStatuses(
          (data.flags || []).reduce((acc: Record<string, 'pending' | 'cleared' | 'escalated'>, flag: FlagEvent) => ({ ...acc, [flag.id]: flag.status }), {})
        );
      } catch (error) {
        console.error('Failed to fetch suspect review:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchSuspectReview();
  }, [candidateId, applicationId]);

  const handleSeekToFlag = (timestamp: number) => {
    setCurrentTime(timestamp);
    setIsPlaying(true);
    if (videoRef.current) {
      videoRef.current.currentTime = timestamp;
      void videoRef.current.play().catch(() => undefined);
    }
  };

  const handleFlagAction = (flagId: string, action: 'cleared' | 'escalated') => {
    setFlagStatuses(prev => ({ ...prev, [flagId]: action }));
  };

  const handleDecompress = async () => {
    setIsProcessing(true);
    setDecompressionStatus(null);
    try {
      const windows = (suspectTimestamps.length > 0 ? suspectTimestamps : flags.map((flag) => flag.timestamp))
        .map((ts) => Math.max(0, Math.floor(ts / 5) * 5));
      const unique = Array.from(new Set(windows)).sort((a, b) => a - b);
      setSuspectTimestamps(unique);

      const persisted = await api.recruiter.persistSuspectDecompressionArtifacts(candidateId, {
        application_id: applicationId,
        suspicious_timestamps: unique,
        window_seconds: 5,
      }) as { saved_segments?: number; updated_flags?: number };

      setDecompressionStatus(
        `Saved ${persisted?.saved_segments || 0} suspect segments across ${persisted?.updated_flags || 0} flags.`,
      );
    } catch (error) {
      console.error('Failed to persist decompression artifacts:', error);
      setDecompressionStatus('Failed to persist decompression artifacts.');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-[#fef2f2] text-[#ef4444] border-[#fecaca]';
      case 'medium':
        return 'bg-[#fffbeb] text-[#f59e0b] border-[#fde68a]';
      case 'low':
        return 'bg-[#eff6ff] text-[#3b82f6] border-[#bfdbfe]';
      default:
        return 'bg-[#f9fafb] text-[#6b7280] border-[#e5e7eb]';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'cleared':
        return 'bg-[#dcfce7] text-[#10b981]';
      case 'escalated':
        return 'bg-[#fef2f2] text-[#ef4444]';
      default:
        return 'bg-[#f3f4f6] text-[#6b7280]';
    }
  };

  return (
    <div className="min-h-screen bg-[#f9fafb]">
      {/* Header */}
      <div className="bg-white border-b border-[#e5e7eb] px-8 py-6">
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-4 font-['Arimo',sans-serif] text-[14px] text-[#6366f1] hover:underline"
        >
          <ChevronLeft size={16} />
          Back to {groupName}
        </button>

        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-[#111827]">Suspect Review</h1>
              <span className="px-[12px] py-[4px] bg-[#fef2f2] text-[#ef4444] rounded-[6px] font-['Arimo',sans-serif] text-[13px]">
                {pendingCount} Flags Pending
              </span>
              <span className="px-[12px] py-[4px] bg-[#f0fdf4] text-[#16a34a] rounded-[6px] font-['Arimo',sans-serif] text-[13px]">
                {reviewedCount} Reviewed
              </span>
              <span className="px-[12px] py-[4px] bg-[#fff7ed] text-[#c2410c] rounded-[6px] font-['Arimo',sans-serif] text-[13px]">
                {highSeverityCount} High Severity
              </span>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => onViewCandidate(candidateId)}
                className="flex items-center gap-2 text-[#6366f1] hover:underline"
              >
                <User size={14} />
                <span className="font-['Arimo',sans-serif] text-[14px]">
                  {candidateName}
                </span>
              </button>
              <span className="text-[#e5e7eb]">|</span>
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                Module: {currentModule}
              </span>
              <span className="text-[#e5e7eb]">|</span>
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                Position: {positionTitle}
              </span>
              <span className="text-[#e5e7eb]">|</span>
              <span className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                Total Signals: {flags.length}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleDecompress}
              disabled={isProcessing}
              className="h-[40px] px-[16px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] disabled:opacity-50 font-['Arimo',sans-serif] text-[14px] text-[#111827] transition-colors"
            >
              {isProcessing ? 'Processing...' : 'Decompress Suspect Timestamps'}
            </button>
            <button
              onClick={() => setShowMarkReviewedModal(true)}
              className="h-[40px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[14px] text-white transition-colors"
            >
              Mark as Reviewed
            </button>
          </div>
        </div>
      </div>

      <div className="p-8">
        {decompressionStatus && (
          <div className="mb-4 px-4 py-3 rounded-[8px] border border-[#bbf7d0] bg-[#f0fdf4] font-['Arimo',sans-serif] text-[13px] text-[#166534]">
            {decompressionStatus}
          </div>
        )}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Video Player */}
          <div className="col-span-8 space-y-6">
            {/* Video Player */}
            <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden">
              <div className="relative w-full bg-[#1f2937] aspect-video flex items-center justify-center">
                {recordingUrl ? (
                  <video
                    ref={videoRef}
                    src={recordingUrl}
                    className="w-full h-full object-contain"
                    onLoadedMetadata={() => {
                      if (videoRef.current?.duration) {
                        setDuration((prev) => Math.max(prev, Math.ceil(videoRef.current!.duration)));
                      }
                    }}
                    onTimeUpdate={() => {
                      if (videoRef.current) {
                        setCurrentTime(Math.floor(videoRef.current.currentTime));
                        setIsPlaying(!videoRef.current.paused);
                      }
                    }}
                    onEnded={() => setIsPlaying(false)}
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
                    <Video size={64} className="text-white/20" />
                    <span className="font-['Arimo',sans-serif] text-[13px] text-white/60">
                      No system recording available for this assessment yet.
                    </span>
                  </div>
                )}
                <div className="absolute bottom-4 right-4 px-[10px] py-[6px] bg-black/70 rounded-[6px]">
                  <span className="font-['Arimo',sans-serif] text-[14px] text-white">
                    {formatTime(currentTime)} / {formatTime(duration)}
                  </span>
                </div>
                {loading && (
                  <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-white">Loading evidence...</span>
                  </div>
                )}
                {selectedFlag && (
                  <div className="absolute top-4 left-4 px-[12px] py-[8px] bg-[#ef4444] rounded-[8px]">
                    <span className="font-['Arimo',sans-serif] text-[13px] text-white">
                      Reviewing Flag #{selectedFlag}
                    </span>
                  </div>
                )}
              </div>

              {/* Scrub Bar with Markers */}
              <div className="p-4 bg-[#f9fafb]">
                <div className="relative">
                  {/* Flag Markers */}
                  <div className="absolute top-0 left-0 right-0 h-[32px] -translate-y-[36px]">
                    {flags.map((flag) => (
                      <button
                        key={flag.id}
                        onClick={() => {
                          handleSeekToFlag(flag.timestamp);
                          setSelectedFlag(flag.id);
                        }}
                        className={`absolute w-[3px] h-[32px] rounded-full transition-all hover:w-[6px] ${flag.severity === 'high'
                          ? 'bg-[#ef4444]'
                          : flag.severity === 'medium'
                            ? 'bg-[#f59e0b]'
                            : 'bg-[#3b82f6]'
                          } ${selectedFlag === flag.id ? 'ring-2 ring-white w-[6px]' : ''}`}
                        style={{ left: `${(flag.timestamp / safeDuration) * 100}%` }}
                        title={`${flag.timeDisplay} - ${flag.event}`}
                      />
                    ))}
                  </div>

                  {/* Progress Bar */}
                  <div className="relative h-[8px] bg-[#e5e7eb] rounded-full overflow-hidden cursor-pointer">
                    <div
                      className="h-full bg-[#6366f1] transition-all"
                      style={{ width: `${(currentTime / safeDuration) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between mt-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        const video = videoRef.current;
                        if (!video) {
                          setIsPlaying((prev) => !prev);
                          return;
                        }
                        if (video.paused) {
                          void video.play().catch(() => undefined);
                          setIsPlaying(true);
                        } else {
                          video.pause();
                          setIsPlaying(false);
                        }
                      }}
                      className="w-[36px] h-[36px] rounded-full bg-[#6366f1] hover:bg-[#5558e3] flex items-center justify-center transition-colors"
                    >
                      {isPlaying ? (
                        <Pause size={16} className="text-white" />
                      ) : (
                        <Play size={16} className="text-white ml-0.5" />
                      )}
                    </button>
                    <button
                      onClick={() => {
                        const video = videoRef.current;
                        if (!video) return;
                        video.currentTime = Math.min(video.duration || safeDuration, video.currentTime + 5);
                        setCurrentTime(Math.floor(video.currentTime));
                      }}
                      className="w-[36px] h-[36px] rounded-full border border-[#e5e7eb] hover:bg-[#f9fafb] flex items-center justify-center transition-colors"
                    >
                      <SkipForward size={16} className="text-[#6b7280]" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      Speed:
                    </span>
                    {['0.5x', '1x', '1.5x', '2x'].map((speed) => (
                      <button
                        key={speed}
                        onClick={() => {
                          const rate = Number(speed.replace('x', ''));
                          setPlaybackRate(rate);
                          if (videoRef.current) {
                            videoRef.current.playbackRate = rate;
                          }
                        }}
                        className={`h-[28px] px-[10px] rounded-[6px] font-['Arimo',sans-serif] text-[12px] transition-colors ${Number(speed.replace('x', '')) === playbackRate
                          ? 'bg-[#6366f1] text-white'
                          : 'border border-[#e5e7eb] text-[#6b7280] hover:bg-[#f9fafb]'
                          }`}
                      >
                        {speed}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Module Progress Timeline */}
            <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-6">
              <h3 className="text-[#111827] text-[16px] mb-4">Module Progress Timeline</h3>
              {suspectTimestamps.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {suspectTimestamps.map((ts) => (
                    <button
                      key={ts}
                      onClick={() => handleSeekToFlag(ts)}
                      className="px-[8px] py-[4px] rounded-[6px] bg-[#fef2f2] text-[#ef4444] font-['Arimo',sans-serif] text-[11px]"
                    >
                      Sus: {formatTime(ts)} to {formatTime(Math.min(ts + 5, safeDuration))}
                    </button>
                  ))}
                </div>
              )}
              <div className="space-y-4">
                {moduleTimeline.map((item) => (
                  <div key={item.module} className="flex items-center gap-4">
                    <div className="w-[140px] font-['Arimo',sans-serif] text-[13px] text-[#111827]">
                      {item.module}
                    </div>
                    <div className="flex-1">
                      <div className="w-full h-[8px] bg-[#e5e7eb] rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${item.status === 'completed' ? 'bg-[#10b981]' : item.status === 'in_progress' ? 'bg-[#6366f1]' : 'bg-[#d1d5db]'
                            }`}
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-[80px] text-right font-['Arimo',sans-serif] text-[12px] text-[#6b7280]">
                      {item.time}
                    </div>
                    {item.flags > 0 && (
                      <div className="flex items-center gap-1 px-[8px] py-[4px] bg-[#fef2f2] rounded-[6px]">
                        <Flag size={12} className="text-[#ef4444]" />
                        <span className="font-['Arimo',sans-serif] text-[11px] text-[#ef4444]">
                          {item.flags}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Flags Table */}
          <div className="col-span-4">
            <div className="bg-white rounded-[12px] border border-[#e5e7eb] overflow-hidden sticky top-8">
              <div className="px-6 py-4 border-b border-[#e5e7eb] bg-[#f9fafb]">
                <div className="flex items-center justify-between">
                  <h3 className="text-[#111827] text-[16px]">Integrity Flags</h3>
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280]">
                    {flags.length} total
                  </span>
                </div>
              </div>

              <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                <div className="p-4 space-y-3">
                  {flags.map((flag) => (
                    <motion.div
                      key={flag.id}
                      layout
                      className={`border rounded-[12px] p-4 transition-all ${selectedFlag === flag.id
                        ? 'ring-2 ring-[#6366f1] border-[#6366f1]'
                        : 'border-[#e5e7eb]'
                        }`}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <button
                              onClick={() => handleSeekToFlag(flag.timestamp)}
                              className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1] hover:underline"
                            >
                              {flag.timeDisplay}
                            </button>
                            <span className={`px-[6px] py-[2px] rounded-[4px] font-['Arimo',sans-serif] text-[10px] uppercase ${getSeverityColor(flag.severity)}`}>
                              {flag.severity}
                            </span>
                          </div>
                          <div className="font-['Arimo',sans-serif] text-[13px] text-[#111827] mb-1">
                            {flag.event}
                          </div>
                          <div className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-2">
                            {flag.evidence}
                          </div>
                          <div className="flex items-center gap-1 mb-3">
                            <FileText size={11} className="text-[#6b7280]" />
                            <span className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280]">
                              {flag.module}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className={`px-[8px] py-[4px] rounded-[6px] font-['Arimo',sans-serif] text-[11px] text-center mb-3 ${getStatusColor(flagStatuses[flag.id])}`}>
                        {flagStatuses[flag.id] === 'cleared' && 'Cleared'}
                        {flagStatuses[flag.id] === 'escalated' && 'Escalated'}
                        {flagStatuses[flag.id] === 'pending' && 'Pending Review'}
                      </div>

                      {flagStatuses[flag.id] === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleFlagAction(flag.id, 'cleared')}
                            className="flex-1 h-[28px] px-[10px] rounded-[6px] border border-[#10b981] text-[#10b981] hover:bg-[#dcfce7] font-['Arimo',sans-serif] text-[11px] transition-colors"
                          >
                            Clear
                          </button>
                          <button
                            onClick={() => {
                              setSelectedFlag(flag.id);
                              setShowEscalateModal(true);
                            }}
                            className="flex-1 h-[28px] px-[10px] rounded-[6px] border border-[#ef4444] text-[#ef4444] hover:bg-[#fef2f2] font-['Arimo',sans-serif] text-[11px] transition-colors"
                          >
                            Escalate
                          </button>
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="px-4 py-4 border-t border-[#e5e7eb] space-y-2">
                <button
                  onClick={() => setShowJustificationModal(true)}
                  className="w-full h-[36px] px-[14px] rounded-[8px] border border-[#e5e7eb] bg-white hover:bg-[#f9fafb] font-['Arimo',sans-serif] text-[13px] text-[#111827] transition-colors flex items-center justify-center gap-2"
                >
                  <Mail size={14} />
                  Request Justification
                </button>
                <button
                  onClick={() => setShowEscalateModal(true)}
                  className="w-full h-[36px] px-[14px] rounded-[8px] bg-[#ef4444] hover:bg-[#dc2626] font-['Arimo',sans-serif] text-[13px] text-white transition-colors flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={14} />
                  Escalate to HR
                </button>
              </div>

              {/* Evidence Drawer */}
              <div className="border-t border-[#e5e7eb]">
                <button
                  onClick={() => setDrawerExpanded((prev) => !prev)}
                  className="w-full px-4 py-3 bg-[#fcfcff] flex items-center justify-between hover:bg-[#f7f7fd] transition-colors"
                >
                  <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151] font-medium">
                    Evidence Drawer
                  </span>
                  <ChevronDown
                    size={16}
                    className={`text-[#6b7280] transition-transform ${drawerExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {drawerExpanded && (
                  <div className="p-4 bg-white space-y-3">
                    {!selectedFlagData ? (
                      <p className="font-['Arimo',sans-serif] text-[12px] text-[#9ca3af]">
                        Select a flag to inspect proof and metadata.
                      </p>
                    ) : (
                      <>
                        <div className="rounded-[8px] border border-[#e5e7eb] p-3 bg-[#fafafa]">
                          <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-1">Selected Flag</p>
                          <p className="font-['Arimo',sans-serif] text-[12px] text-[#111827]">
                            {selectedFlagData.timeDisplay} - {selectedFlagData.event}
                          </p>
                        </div>

                        <div className="rounded-[8px] border border-[#e5e7eb] p-3">
                          <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-2">Proof JSON</p>
                          <pre className="max-h-[160px] overflow-auto font-mono text-[11px] leading-5 text-[#1f2937] whitespace-pre-wrap break-words">
                            {JSON.stringify(selectedFlagData.proof || {}, null, 2)}
                          </pre>
                        </div>

                        <div className="rounded-[8px] border border-[#e5e7eb] p-3">
                          <p className="font-['Arimo',sans-serif] text-[11px] text-[#6b7280] mb-2">Metadata JSON</p>
                          <pre className="max-h-[180px] overflow-auto font-mono text-[11px] leading-5 text-[#1f2937] whitespace-pre-wrap break-words">
                            {JSON.stringify(selectedFlagData.metadata || {}, null, 2)}
                          </pre>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Escalate Modal */}
      {showEscalateModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8"
          onClick={() => setShowEscalateModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-[12px] p-6 w-[500px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111827] text-[18px]">Escalate to HR</h3>
              <button
                onClick={() => setShowEscalateModal(false)}
                className="w-[32px] h-[32px] rounded-[8px] hover:bg-[#f9fafb] flex items-center justify-center"
              >
                <X size={18} className="text-[#6b7280]" />
              </button>
            </div>
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-4">
              This will notify the HR team and pause the candidate's progression until reviewed.
            </p>
            <textarea
              placeholder="Describe the integrity concern..."
              className="w-full h-[100px] px-[12px] py-[10px] border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[13px] mb-4 resize-none"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowEscalateModal(false)}
                className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] text-[#111827]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedFlag) handleFlagAction(selectedFlag, 'escalated');
                  setShowEscalateModal(false);
                }}
                className="h-[36px] px-[16px] rounded-[8px] bg-[#ef4444] hover:bg-[#dc2626] font-['Arimo',sans-serif] text-[13px] text-white"
              >
                Escalate Issue
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Justification Modal */}
      {showJustificationModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8"
          onClick={() => setShowJustificationModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-[12px] p-6 w-[500px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111827] text-[18px]">Request Justification</h3>
              <button
                onClick={() => setShowJustificationModal(false)}
                className="w-[32px] h-[32px] rounded-[8px] hover:bg-[#f9fafb] flex items-center justify-center"
              >
                <X size={18} className="text-[#6b7280]" />
              </button>
            </div>
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-4">
              Send an email to {candidateName} requesting explanation for the flagged activities.
            </p>
            <textarea
              defaultValue={`Dear ${candidateName},\n\nWe noticed some activities during your assessment that require clarification. Please provide an explanation for the following events:\n\n- Tab switching during Question 3\n- Copy-paste activity detected\n\nPlease respond within 48 hours.\n\nBest regards,\nRecruitment Team`}
              className="w-full h-[200px] px-[12px] py-[10px] border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[13px] mb-4 resize-none"
            />
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowJustificationModal(false)}
                className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] text-[#111827]"
              >
                Cancel
              </button>
              <button
                onClick={() => setShowJustificationModal(false)}
                className="h-[36px] px-[16px] rounded-[8px] bg-[#6366f1] hover:bg-[#5558e3] font-['Arimo',sans-serif] text-[13px] text-white"
              >
                Send Email
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Mark Reviewed Modal */}
      {showMarkReviewedModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-8"
          onClick={() => setShowMarkReviewedModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95 }}
            animate={{ scale: 1 }}
            className="bg-white rounded-[12px] p-6 w-[500px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[#111827] text-[18px]">Mark as Reviewed</h3>
              <button
                onClick={() => setShowMarkReviewedModal(false)}
                className="w-[32px] h-[32px] rounded-[8px] hover:bg-[#f9fafb] flex items-center justify-center"
              >
                <X size={18} className="text-[#6b7280]" />
              </button>
            </div>
            <p className="font-['Arimo',sans-serif] text-[13px] text-[#6b7280] mb-4">
              Add final notes about your review before marking complete.
            </p>
            <textarea
              placeholder="Review summary and decision..."
              className="w-full h-[100px] px-[12px] py-[10px] border border-[#e5e7eb] rounded-[8px] font-['Arimo',sans-serif] text-[13px] mb-4 resize-none"
            />
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                id="allow-proceed"
                className="w-[18px] h-[18px] rounded border-[#e5e7eb] text-[#6366f1]"
              />
              <label
                htmlFor="allow-proceed"
                className="font-['Arimo',sans-serif] text-[13px] text-[#111827]"
              >
                Allow candidate to proceed to next stage
              </label>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowMarkReviewedModal(false)}
                className="h-[36px] px-[16px] rounded-[8px] border border-[#e5e7eb] font-['Arimo',sans-serif] text-[13px] text-[#111827]"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowMarkReviewedModal(false);
                  onBack();
                }}
                className="h-[36px] px-[16px] rounded-[8px] bg-[#10b981] hover:bg-[#059669] font-['Arimo',sans-serif] text-[13px] text-white"
              >
                Complete Review
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
