import { useState, useEffect } from 'react';
import { getSession, listSessions } from '../../shared/sessions-store.js';

/**
 * useSession(id) — re-reads the session record from disk every `intervalMs`
 * (default 2s). Returns null until the id is provided or the session vanishes.
 */
export function useSession(id, intervalMs = 2000) {
  const [session, setSession] = useState(() => (id ? getSession(id) : null));
  useEffect(() => {
    if (!id) { setSession(null); return; }
    const tick = () => setSession(getSession(id));
    tick();
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [id, intervalMs]);
  return session;
}

/** useSessions() — periodic list snapshot. Cheap (small JSON, in-process). */
export function useSessions(intervalMs = 2000) {
  const [sessions, setSessions] = useState(() => listSessions());
  useEffect(() => {
    const tick = () => setSessions(listSessions());
    tick();
    const t = setInterval(tick, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return sessions;
}
