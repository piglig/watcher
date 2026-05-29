/**
 * ElapsedTimer — self-contained 1s elapsed counter.
 *
 * Owns its own tick state, so each second re-renders ONLY this component (a
 * single <Text> node) rather than lifting `elapsed` into the parent screen and
 * re-rendering the whole tree every second. Replaces useElapsed on the run
 * screens.
 *
 * Props:
 *   active  — when false, the timer is paused (no interval).
 *   format  — 'mmss' (default, "MM:SS") or 'seconds' ("Ns").
 */

import React, { useState, useEffect } from 'react';
import { Text } from 'ink';
import { fmtElapsed } from '../hooks/useElapsed.js';

function ElapsedTimer({ active, format = 'mmss' }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setSecs(s => s + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
  return (
    <Text color="gray" dimColor>
      {format === 'seconds' ? `${secs}s` : fmtElapsed(secs)}
    </Text>
  );
}

export default React.memo(ElapsedTimer);
