/**
 * useExamLockdown — Browser prevention hook for anti-cheating enforcement.
 *
 * Enforces: tab switch detection, fullscreen, right-click blocking,
 * copy/paste blocking, DevTools detection, and screen capture detection.
 *
 * Reports all events to the ai-service session-stateful /proctoring/browser-event endpoint.
 */

import { useEffect, useRef, useCallback } from 'react';

const AI_SERVICE_BASE_URL = (import.meta as any).env?.VITE_AI_SERVICE_URL || 'http://localhost:8001';

interface LockdownOptions {
  /** Proctoring session ID — events are tracked server-side per session */
  sessionId: string | null;
  /** Whether lockdown is active (disable during intro/loading screens) */
  enabled: boolean;
  /** Callback when session is terminated by the server (too many violations) */
  onTerminated?: (message: string) => void;
  /** Callback for each violation (for UI warnings) */
  onViolation?: (event: { event_type: string; severity: string; message: string; count?: number }) => void;
  /** Whether to enforce fullscreen mode */
  enforceFullscreen?: boolean;
}

export function useExamLockdown({
  sessionId,
  enabled,
  onTerminated,
  onViolation,
  enforceFullscreen = false,
}: LockdownOptions) {
  const devtoolsCheckRef = useRef<number | null>(null);
  const lastEventTsRef = useRef<Record<string, number>>({});

  // Throttled event reporter — sends to session-stateful backend
  const reportBrowserEvent = useCallback(async (eventType: string, throttleMs = 3000) => {
    if (!sessionId || !enabled) return;

    const now = Date.now();
    const lastTs = lastEventTsRef.current[eventType] || 0;
    if (now - lastTs < throttleMs) return;
    lastEventTsRef.current[eventType] = now;

    try {
      const response = await fetch(`${AI_SERVICE_BASE_URL}/proctoring/browser-event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, event_type: eventType }),
      });

      if (response.ok) {
        const data = await response.json();

        // Check if session was terminated
        if (data.status === 'terminated' || data.is_terminated) {
          onTerminated?.(data.message || 'Session terminated due to excessive violations.');
          return;
        }

        onViolation?.({
          event_type: eventType,
          severity: data.event?.severity || data.severity || 'medium',
          message: data.message || `Browser event: ${eventType}`,
          count: data.count,
        });
      }
    } catch (error) {
      console.error('[Lockdown] Failed to report browser event:', error);
    }
  }, [sessionId, enabled, onTerminated, onViolation]);

  useEffect(() => {
    if (!enabled || !sessionId) return;

    // --- 1. Tab Switch / Visibility Change ---
    const handleVisibilityChange = () => {
      if (document.hidden) {
        void reportBrowserEvent('tab_switch');
      }
    };

    // --- 2. Window Blur (alt-tab, second monitor) ---
    const handleWindowBlur = () => {
      void reportBrowserEvent('window_blur');
    };

    // --- 3. Fullscreen Enforcement ---
    const handleFullscreenChange = () => {
      if (enforceFullscreen && !document.fullscreenElement) {
        void reportBrowserEvent('fullscreen_exit');
        // Re-enter fullscreen
        document.documentElement.requestFullscreen?.().catch(() => {});
      }
    };

    // --- 4. Right-Click Blocking ---
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      void reportBrowserEvent('right_click', 8000); // Low priority, throttle more
    };

    // --- 5. Copy/Paste Blocking ---
    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      void reportBrowserEvent('copy_attempt');
    };
    const handlePaste = (e: ClipboardEvent) => {
      e.preventDefault();
      void reportBrowserEvent('paste_attempt');
    };
    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      void reportBrowserEvent('copy_attempt');
    };

    // --- 6. Keyboard Shortcuts Blocking ---
    const handleKeydown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;

      // Block Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A
      if (ctrl && ['c', 'v', 'x', 'a'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const type = e.key.toLowerCase() === 'v' ? 'paste_attempt' : 'copy_attempt';
        void reportBrowserEvent(type);
      }

      // Block F12 (DevTools)
      if (e.key === 'F12') {
        e.preventDefault();
        void reportBrowserEvent('devtools_open');
      }

      // Block Ctrl+Shift+I/J/C (DevTools shortcuts)
      if (ctrl && e.shiftKey && ['i', 'j', 'c'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        void reportBrowserEvent('devtools_open');
      }

      // Block Ctrl+U (View Source)
      if (ctrl && e.key.toLowerCase() === 'u') {
        e.preventDefault();
        void reportBrowserEvent('devtools_open');
      }

      // Block PrintScreen
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        void reportBrowserEvent('screen_capture');
      }
    };

    // --- 7. DevTools Detection (size-based heuristic) ---
    let lastInnerWidth = window.innerWidth;
    let lastInnerHeight = window.innerHeight;
    const checkDevTools = () => {
      const widthThreshold = window.outerWidth - window.innerWidth > 160;
      const heightThreshold = window.outerHeight - window.innerHeight > 160;
      if (widthThreshold || heightThreshold) {
        void reportBrowserEvent('devtools_open', 10000);
      }
      lastInnerWidth = window.innerWidth;
      lastInnerHeight = window.innerHeight;
    };
    devtoolsCheckRef.current = window.setInterval(checkDevTools, 3000);

    // --- 8. Screen Capture API Detection ---
    const handleScreenCaptureCheck = () => {
      if (navigator.mediaDevices && 'getDisplayMedia' in navigator.mediaDevices) {
        // We can't block getDisplayMedia, but we can detect if it's being called
        // by other extensions/tools via the displayMediaStreamConstraints
        // This is a best-effort detection
      }
    };

    // --- 9. Prevent page unload ---
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You are in the middle of an exam. Are you sure you want to leave?';
      return e.returnValue;
    };

    // --- 10. Enter fullscreen if enforced ---
    if (enforceFullscreen) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    }

    // Register all event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('copy', handleCopy);
    document.addEventListener('paste', handlePaste);
    document.addEventListener('cut', handleCut);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('copy', handleCopy);
      document.removeEventListener('paste', handlePaste);
      document.removeEventListener('cut', handleCut);
      document.removeEventListener('keydown', handleKeydown);
      window.removeEventListener('beforeunload', handleBeforeUnload);

      if (devtoolsCheckRef.current) {
        window.clearInterval(devtoolsCheckRef.current);
        devtoolsCheckRef.current = null;
      }

      // Exit fullscreen on cleanup
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
  }, [enabled, sessionId, enforceFullscreen, reportBrowserEvent]);
}
