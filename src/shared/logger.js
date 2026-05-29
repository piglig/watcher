/**
 * shared/logger.js — Logger interface for library code
 *
 * Library functions accept an optional `logger` option and wrap it with
 * `createLogger()`. The wrapped object exposes log/warn/error/write and is a
 * no-op when no logger is given, so library code is silent when used
 * programmatically and routed (never touching the global console) otherwise.
 *
 * @example
 * // Silent (library use)
 * await scrapeTwitter('user', { max: 100 });
 *
 * // Verbose (CLI or debugging)
 * await scrapeTwitter('user', { max: 100, logger: console });
 *
 * // Structured (CLI entry point)
 * await scrapeTwitter('user', { max: 100, logger: createPinoLogger() });
 *
 * Entry points (bin/cli.js) build a concrete sink via `createPinoLogger()`.
 * The TUI builds its own sink that funnels into the Ink render pipeline. Either
 * way the sink is a plain `{ log, warn, error, write? }` object — `pino` must
 * never be imported by library modules, only here and at entry points.
 */

const NOOP = () => {};

/**
 * Wrap a console-like sink into a safe logger. Pass `null` for a silent no-op.
 *
 * @param {object|null} [logger] - Object with log/warn/error/(write) methods.
 * @returns {{ log: Function, warn: Function, error: Function, write: Function }}
 */
export function createLogger(logger = null) {
  if (!logger) {
    return { log: NOOP, warn: NOOP, error: NOOP, write: NOOP };
  }

  const log   = (...a) => logger.log?.(...a);
  const warn  = (...a) => (logger.warn  ?? logger.log)?.(...a);
  const error = (...a) => (logger.error ?? logger.log)?.(...a);

  // write — carriage-return progress updates (e.g. "\r  Waiting: 1/2...").
  // Priority: the sink's own `write` (a TTY/UI sink can render a real bar) →
  // downgrade to `log` with the \r/\n stripped (line-oriented sinks like the
  // TUI's StaticLog or pino want a clean single line) → no-op. We never reach
  // process.stdout directly: a sink that wants stdout supplies its own `write`.
  const write = (s) => {
    if (typeof logger.write === 'function') { logger.write(s); return; }
    const line = String(s).replace(/[\r\n]+/g, '').trim();
    if (line) (logger.log ?? NOOP)(line);
  };

  return { log, warn, error, write };
}

/**
 * Entry-point structured logger backed by pino. Returns the same
 * `{ log, warn, error, write }` shape `createLogger` wraps, adapting pino's
 * (obj, msg) API to a console-like variadic one. Used by bin/cli.js. Keep this
 * the ONLY place (besides the import) that knows about pino.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.debug=false]  emit debug-level lines
 * @param {boolean} [opts.pretty=true]  human-readable output via pino-pretty
 */
export async function createPinoLogger({ debug = false, pretty = true } = {}) {
  const { default: pino } = await import('pino');
  const p = pino({
    level: debug ? 'debug' : 'info',
    ...(pretty
      ? { transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname,time' } } }
      : {}),
  });
  const join = (a) => a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
  return {
    log:   (...a) => p.info(join(a)),
    warn:  (...a) => p.warn(join(a)),
    error: (...a) => p.error(join(a)),
    // pino is line-structured; collapse \r progress into one info line.
    write: (s) => { const l = String(s).replace(/[\r\n]+/g, '').trim(); if (l) p.info(l); },
  };
}
