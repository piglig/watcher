/**
 * login-signal.js — Replaces readline stdin prompts in browser login flows.
 * The TUI calls confirmLogin() when the user presses Enter; scrapers await
 * waitForLoginSignal() instead of creating a readline interface.
 */

let _resolve = null;
let _pending = false;

export function waitForLoginSignal() {
  _pending = true;
  return new Promise(res => {
    _resolve = () => { _pending = false; res(); };
  });
}

export function confirmLogin() {
  if (_resolve) { const r = _resolve; _resolve = null; r(); }
}

export function isLoginPending() { return _pending; }
