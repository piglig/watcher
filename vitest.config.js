import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure-logic unit tests live next to nothing JSX/Ink-related, so the
    // default node environment + a tight include keeps the runner from ever
    // trying to transpile the React/Ink TUI sources.
    environment: 'node',
    include: ['test/**/*.test.js'],
    // Redirect HOME to a temp dir before any store module loads, so the SQLite
    // DB never points at the developer's real ~/.sns-audit.
    setupFiles: ['./test/setup.js'],
  },
});
