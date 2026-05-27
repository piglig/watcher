import { useEffect, useRef } from 'react';

/**
 * Hijack console.log / console.warn / console.error while the component is
 * mounted, and pulse the captured lines to `onLines` on a fixed interval.
 *
 * `onLines` receives an array of newly captured lines each pulse — caller
 * decides whether to append, stamp, slice or otherwise transform them.
 *
 * Restores the original console methods on unmount, even if React strict-mode
 * double-invokes the effect.
 *
 * @param {(lines: string[]) => void} onLines
 * @param {object}  [opts]
 * @param {number}  [opts.flushIntervalMs=500]
 * @param {boolean} [opts.enabled=true]   set to false to leave console alone
 */
export function useConsoleCapture(onLines, { flushIntervalMs = 500, enabled = true } = {}) {
  const onLinesRef = useRef(onLines);
  onLinesRef.current = onLines;

  useEffect(() => {
    if (!enabled) return;

    const buffer    = [];
    let committed   = 0;
    const orig = {
      log:   console.log.bind(console),
      error: console.error.bind(console),
      warn:  console.warn.bind(console),
    };
    const stringify = (a) => (typeof a === 'string' ? a : JSON.stringify(a));

    console.log   = (...a) => buffer.push(a.map(stringify).join(' '));
    console.warn  = (...a) => buffer.push('[WARN] ' + a.map(stringify).join(' '));
    console.error = (...a) => buffer.push('[ERR] '  + a.map(stringify).join(' '));

    const flush = () => {
      if (buffer.length > committed) {
        const fresh = buffer.slice(committed);
        committed = buffer.length;
        onLinesRef.current?.(fresh);
      }
    };
    const timer = setInterval(flush, flushIntervalMs);

    return () => {
      clearInterval(timer);
      flush();
      Object.assign(console, orig);
    };
  }, [enabled, flushIntervalMs]);
}
