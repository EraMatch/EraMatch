import { useCallback, useEffect, useRef, useState } from 'react';

interface UseFullscreenGuardOptions {
  enabled: boolean;
  onCountdownExpired: () => void;
  countdownSeconds?: number;
}

export function useFullscreenGuard({
  enabled,
  onCountdownExpired,
  countdownSeconds = 15,
}: UseFullscreenGuardOptions) {
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);
  const [countdownActive, setCountdownActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(countdownSeconds);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredCallbackRef = useRef(onCountdownExpired);
  expiredCallbackRef.current = onCountdownExpired;

  const clearCountdown = useCallback(() => {
    if (countdownTimerRef.current !== null) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdownActive(false);
    setSecondsLeft(countdownSeconds);
  }, [countdownSeconds]);

  const enterFullscreen = useCallback(async () => {
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Failed — browser blocked it; overlay handles re-entry
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const handleFullscreenChange = () => {
      const inFs = !!document.fullscreenElement;
      setIsFullscreen(inFs);

      if (inFs) {
        // Re-entered fullscreen — cancel any active countdown
        clearCountdown();
      } else {
        // Exited fullscreen — always show overlay (auto-re-entry via button is the only reliable path)
        setCountdownActive(true);
        setSecondsLeft(countdownSeconds);
        countdownTimerRef.current = setInterval(() => {
          setSecondsLeft((prev) => {
            if (prev <= 1) {
              clearInterval(countdownTimerRef.current!);
              countdownTimerRef.current = null;
              setCountdownActive(false);
              expiredCallbackRef.current();
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      clearCountdown();
    };
  }, [enabled, countdownSeconds, clearCountdown]);

  return { isFullscreen, countdownActive, secondsLeft, enterFullscreen };
}
