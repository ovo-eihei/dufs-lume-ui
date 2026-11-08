import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * Hook to manage modal open/close lifecycle with graceful exit animations.
 * When `open` transitions to false, `rendered` stays true for `durationMs`
 * while `isClosing` becomes true, enabling `.animate-modalOut` and `.animate-fadeOut`.
 */
export function useModalTransition(open: boolean, durationMs = 160) {
  const [rendered, setRendered] = useState(open);
  const [isClosing, setIsClosing] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setRendered(true);
      setIsClosing(false);
    } else if (rendered) {
      setIsClosing(true);
      timerRef.current = window.setTimeout(() => {
        setRendered(false);
        setIsClosing(false);
        timerRef.current = null;
      }, durationMs);
    }
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [open, durationMs, rendered]);

  return { rendered, isClosing };
}
