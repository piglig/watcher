import { useState, useEffect } from 'react';
import { getSession, listSessionsLite, TERMINAL_STATES } from '../../shared/sessions-store.js';
import { advanceSession } from '../../classifier/session.js';

/**
 * useSession(id) — re-reads the session record from disk every `intervalMs`
 * (default 5s). Once the session reaches a terminal state we stop polling,
 * since the record won't change again and `sessions.json` can be megabytes
 * when result_files is populated — re-reading too often saturates the main
 * thread and amplifies UI jank. The App-level daemon advances sessions every
 * 30s, so a 5s UI poll is already far finer than the data actually changes.
 */
export function useSession(id, intervalMs = 5000) {
  const [session, setSession] = useState(() => (id ? getSession(id) : null));
  useEffect(() => {
    if (!id) { setSession(null); return; }
    // If the session is already terminal on mount (user revisiting a completed
    // job from JobsList), don't even set up an interval — a single read is all
    // we need. The previous version always set the interval and let the first
    // scheduled tick clear it, which cost an extra full-file read on the most
    // common "view completed session" path.
    const initial = getSession(id);
    setSession(initial);
    if (initial && TERMINAL_STATES.has(initial.state)) return;

    let timer = null;
    const tick = () => {
      const next = getSession(id);
      setSession(next);
      if (next && TERMINAL_STATES.has(next.state) && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    timer = setInterval(tick, intervalMs);
    return () => { if (timer) clearInterval(timer); };
  }, [id, intervalMs]);
  return session;
}

/**
 * useAdvanceSession(id) — foreground driver for a classify session. While the
 * owning run screen is mounted and the session is non-terminal, kick
 * advanceSession on an interval (default 30s, matching the old daemon cadence).
 * advanceSession only moves one step per call (submit a chunk / drain a batch /
 * finalize), so repeated kicks are how a session reaches completion.
 *
 * This replaces the App-level background daemon: work happens ONLY while the
 * user is looking at the session. Navigate away → it pauses; reopen it (or use
 * JobsList's manual "推进" key) → it resumes. advanceSession has its own
 * in-process lock, so overlapping kicks are safe no-ops. We stop the interval
 * the moment a tick observes a terminal state, so a completed page does no work.
 */
export function useAdvanceSession(id, intervalMs = 30000) {
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let timer = null;
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };
    const tick = async () => {
      if (cancelled) return;
      let next;
      try { next = await advanceSession({ id }); }
      catch { return; }   // failures are persisted into session state by advanceSession
      if (cancelled) return;
      if (!next || TERMINAL_STATES.has(next.state)) stop();
    };
    tick();                                  // immediate kick on mount / id change
    timer = setInterval(tick, intervalMs);
    return () => { cancelled = true; stop(); };
  }, [id, intervalMs]);
}

function usePolledList(lister, intervalMs) {
  const [items, setItems] = useState(lister);
  useEffect(() => {
    const tick = () => setItems(lister());
    tick();
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [lister, intervalMs]);
  return items;
}

/**
 * Projection-only session list — pulls just the fields a list UI needs from
 * each row without parsing the full record blob. Use this in JobsList and any
 * other "many rows, few fields" view.
 */
export function useSessionsLite(intervalMs = 2000) {
  return usePolledList(listSessionsLite, intervalMs);
}
