/**
 * Countdown — self-contained N→0 second countdown that fires onExpire exactly
 * once when it reaches zero.
 *
 * Owns its own tick state so each second re-renders ONLY this component, not
 * the parent screen. Replaces WorkflowRun's screen-level setInterval that
 * called setCountdown every second (which re-rendered the whole tree).
 *
 * The interval is keyed on `seconds`: changing it (i.e. a new wait phase)
 * resets the countdown and re-arms onExpire. Unmounting clears the interval, so
 * navigating away (ESC) can't leave an orphaned timer or double-fire onExpire.
 *
 * Props:
 *   seconds   — starting count.
 *   onExpire  — called once when the count hits 0.
 *   render    — (remaining:number) => ReactNode; renders the current value.
 */

import React, { useState, useEffect, useRef } from 'react';

function Countdown({ seconds, onExpire, render }) {
  const [left, setLeft] = useState(seconds);
  const fired = useRef(false);

  useEffect(() => {
    fired.current = false;
    setLeft(seconds);
    const id = setInterval(() => setLeft(n => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);

  useEffect(() => {
    if (left <= 0 && !fired.current) {
      fired.current = true;
      onExpire?.();
    }
  }, [left, onExpire]);

  return render(left);
}

export default React.memo(Countdown);
