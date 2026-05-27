import { useEffect, useState } from 'react';

/** Tick-once-per-second counter; pauses when `active` is false. */
export function useElapsed(active) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return secs;
}

/** mm:ss formatting for an elapsed-seconds value. */
export function fmtElapsed(secs) {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
