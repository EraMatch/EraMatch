import { Maximize } from 'lucide-react';
import { Button } from './ui/button';

interface FullscreenCountdownOverlayProps {
  secondsLeft: number;
  totalSeconds: number;
  onReenter: () => void;
}

export function FullscreenCountdownOverlay({
  secondsLeft,
  totalSeconds,
  onReenter,
}: FullscreenCountdownOverlayProps) {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsLeft / totalSeconds;
  const dashOffset = circumference * (1 - progress);
  const isUrgent = secondsLeft <= 5;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ backdropFilter: 'blur(12px)', backgroundColor: 'rgba(0,0,0,0.6)' }}
    >
      {/* Pointer-events none on the blur bg so only the card is interactive */}
      <div className="pointer-events-none absolute inset-0" />

      <div className="pointer-events-auto relative bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center gap-6 max-w-sm w-full mx-4">
        <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center">
          <Maximize className="w-6 h-6 text-amber-600" />
        </div>

        <div className="text-center space-y-1">
          <h2 className="text-xl font-bold text-gray-900">You exited fullscreen</h2>
          <p className="text-sm text-gray-500">
            Return to fullscreen or your assessment will be submitted automatically.
          </p>
        </div>

        {/* Countdown ring */}
        <div className="relative flex items-center justify-center">
          <svg width="100" height="100" className="-rotate-90">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke="#f3f4f6"
              strokeWidth="8"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={isUrgent ? '#ef4444' : '#f59e0b'}
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s' }}
            />
          </svg>
          <span
            className={`absolute text-3xl font-bold tabular-nums ${isUrgent ? 'text-red-500' : 'text-gray-800'}`}
          >
            {secondsLeft}
          </span>
        </div>

        <Button
          onClick={onReenter}
          className="w-full h-12 rounded-xl text-base font-semibold"
          style={{ backgroundColor: '#6366F1' }}
        >
          <Maximize className="w-4 h-4 mr-2" />
          Return to Fullscreen
        </Button>
      </div>
    </div>
  );
}
