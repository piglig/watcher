# Tests

Unit/integration tests for `sns-audit`, run with [Vitest](https://vitest.dev).

```bash
npm test          # run once
npm run test:watch
```

## Layout

| File | Covers | Native dep |
|---|---|---|
| `report-kit.test.js` | HTML escaping, `badge`, `htmlShell` | no |
| `format.test.js` | `formatNumber` (K/M suffixes, boundaries) | no |
| `paths.test.js` | `pathSafe` slugging, `makeSlugger` collisions | no |
| `classifier.test.js` | `extractText`, `chunkPosts`, `aggregateUserRisk` | no |
| `rules.test.js` | `normalizeForMatching` (NFKC, leet, evasion) | no |
| `json-store.test.js` | SQLite record store CRUD / promoted columns | **better-sqlite3** |
| `workflow-store.test.js` | workflow state machine + persistence | **better-sqlite3** |

The pure-logic suites run anywhere. The two store suites need the native
`better-sqlite3` binary to load; they **skip** (not fail) when it can't — see
`helpers/sqlite-available.js`. This happens when `node_modules` was built for a
different OS/arch than the host (e.g. Windows binaries used under WSL). To
activate them, build the binary for the host: `npm rebuild better-sqlite3`.

## Isolation

`test/setup.js` points `$HOME` at a throwaway temp dir before any store loads,
so the SQLite DB (`~/.sns-audit/sns-audit.db`) is never the developer's real
one. Each store test uses a uniquely-named store (its own table).

## Known behavior pinned by these tests

- `escapeHtml` does **not** escape `'` (only `& < > "`). Safe only with
  double-quoted attributes. `report-kit.test.js` documents this deliberately.
