/**
 * shared/logger.js — Logger interface for library code
 *
 * Library functions accept an optional `logger` option.
 * Defaults to no-op so library code is silent when used programmatically.
 * CLI passes `console` to preserve existing terminal output behaviour.
 *
 * @example
 * // Silent (library use)
 * await scrapeTwitter('user', { max: 100 });
 *
 * // Verbose (CLI or debugging)
 * await scrapeTwitter('user', { max: 100, logger: console });
 *
 * // Custom logger (winston, pino, etc.)
 * await scrapeTwitter('user', { max: 100, logger: myLogger });
 */

const NOOP = () => {};

/**
 * @param {object|null} [logger] - Any object with log/warn/error methods, or null for silent
 * @returns {{ log: Function, warn: Function, error: Function, write: Function }}
 */
export function createLogger(logger = null) {
  if (!logger) {
    return { log: NOOP, warn: NOOP, error: NOOP, write: NOOP };
  }
  return {
    log:   (...a) => logger.log?.(...a),
    warn:  (...a) => (logger.warn ?? logger.log)?.(...a),
    error: (...a) => (logger.error ?? logger.log)?.(...a),
    write: (s)    => process.stdout.write?.(s),
  };
}
