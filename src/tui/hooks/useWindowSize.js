import { useState, useEffect } from 'react';
import { useStdout } from 'ink';

/**
 * Debounced window size. Windows Terminal fires resize at very high frequency
 * during a drag; ink's built-in useWindowSize re-renders on every event, which
 * saturates the event loop. We coalesce bursts into a single update.
 *
 * 150ms is the sweet spot on Windows Terminal: low enough that the final size
 * lands within a frame of the drag ending (feels responsive), high enough that
 * any sub-200ms pause during the drag itself doesn't trigger a mid-drag full
 * tree relayout — `<Box width={columns} height={rows}>` in App.js re-yogas the
 * whole render tree on every commit, so each unwanted intermediate update is
 * tens of ms of Ink work that can stack behind WM_MOVE.
 */
export function useWindowSize(debounceMs = 150) {
  const { stdout } = useStdout();
  const [size, setSize] = useState(() => ({
    columns: stdout?.columns ?? 80,
    rows:    stdout?.rows    ?? 24,
  }));

  useEffect(() => {
    if (!stdout) return;
    let timer = null;
    const onResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        setSize({ columns: stdout.columns, rows: stdout.rows });
      }, debounceMs);
    };
    stdout.on('resize', onResize);
    return () => {
      if (timer) clearTimeout(timer);
      stdout.off('resize', onResize);
    };
  }, [stdout, debounceMs]);

  return size;
}
