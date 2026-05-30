/**
 * Persistent store — SQLite backed (better-sqlite3, single shared DB).
 *
 * Public API:
 *
 *   createRecordStore(name, { idField, timestamps, columns })
 *     - Standard CRUD: list, loadAll, get, add, update, remove, persistAll
 *     - findWhere(whereSql, ...params)   — full records matching raw WHERE
 *     - project(spec, { where, params, orderBy, limit })
 *           — lightweight projection without parsing the full record
 *
 *   createJsonStore(name, { defaultValue })
 *     - load / persist a single document blob
 *
 *   makeId(prefix)
 *
 * Why SQLite: the old JSON files re-parsed multi-MB sessions.json on every
 * `getSession()` / list call, which on Windows was enough event-loop
 * blockage that the whole terminal would stop responding to WM_MOVE (= the
 * "completion page freeze + can't drag the window" bug). SQLite gives us
 * row-level reads in microseconds and WAL gives us crash safety, while keeping
 * the same synchronous, in-process API surface every caller relied on.
 *
 * Promoted columns: stores can opt fields out of the JSON blob into real
 * indexed columns by passing `columns: { state: 'TEXT', kind: 'TEXT' }`. The
 * field is still stored inside `data` (single source of truth — JSON wins on
 * read), but writes also populate the column so findWhere/project can filter
 * without parsing every row. Existing tables get missing columns added via
 * ALTER + backfill so adding a new promotion is a one-line code change.
 *
 * Layout: one shared DB at <SYSTEM_DIR>/sns-audit.db. Each record store is
 * mapped to its own table (table name derived from filename, e.g.
 * `sessions.json` → `sessions`); each JSON store is one row in a shared `kv`
 * table keyed by store name. The `.json` filename suffix is retained purely as
 * a stable identifier; nothing on disk uses it.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { SYSTEM_DIR } from './paths.js';

const DB_PATH = join(SYSTEM_DIR, 'sns-audit.db');
const SCHEMA_VERSION = 1;

let _db = null;
function db() {
  if (_db) return _db;
  mkdirSync(dirname(DB_PATH), { recursive: true });
  _db = new Database(DB_PATH);
  // WAL: readers don't block the writer; crash-safe.
  // synchronous=NORMAL: WAL-safe and avoids fsync per commit.
  _db.pragma('journal_mode = WAL');
  _db.pragma('synchronous = NORMAL');
  _db.pragma(`user_version = ${SCHEMA_VERSION}`);
  _db.exec(`
    CREATE TABLE IF NOT EXISTS kv (
      ns   TEXT NOT NULL,
      key  TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (ns, key)
    );
  `);

  // Best-effort graceful shutdown: checkpoint WAL back into the main DB so a
  // hard exit (kill/Ctrl+C bypassing Ink) doesn't leave the WAL growing across
  // sessions. process.on('exit') fires for clean exits and for uncaught
  // exceptions; SIGINT/SIGTERM need explicit hooks because Node doesn't run
  // 'exit' listeners on default signal termination.
  const closeOnce = () => {
    if (!_db) return;
    try { _db.close(); } catch { /* already closed */ }
    _db = null;
  };
  process.once('exit', closeOnce);
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(sig, () => { closeOnce(); process.exit(0); });
  }

  return _db;
}

// Convert a logical store name ("sessions.json") to a safe SQL identifier.
function tableNameFor(name) {
  return String(name).replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_');
}

function ensureRecordTable(table, columns) {
  // Base table: id/data/seq are always present. Promoted columns are added
  // below via ALTER for tables that pre-date the promotion.
  db().exec(`
    CREATE TABLE IF NOT EXISTS "${table}" (
      id   TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      seq  INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS "${table}_seq_idx" ON "${table}" (seq);
  `);
  const present = new Set(db().prepare(`PRAGMA table_info("${table}")`).all().map(c => c.name));
  for (const col of Object.keys(columns)) {
    if (!present.has(col)) {
      db().exec(`ALTER TABLE "${table}" ADD COLUMN "${col}" ${columns[col]}`);
      // Backfill from existing rows so old data is queryable immediately
      // without waiting for the next update.
      db().exec(`UPDATE "${table}" SET "${col}" = json_extract(data, '$.${col}')`);
    }
    db().exec(`CREATE INDEX IF NOT EXISTS "${table}_${col}_idx" ON "${table}" ("${col}")`);
  }
}

/** Stable ID with a domain prefix: `<prefix>_<base36-time>_<base36-rand>`. */
export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Single-document store (one JSON blob per name). Used by config-store.
 *
 * @param {string} name                     logical store name
 * @param {object} [opts]
 * @param {*}     [opts.defaultValue=[]]    returned when the doc is absent
 */
export function createJsonStore(name, { defaultValue = [] } = {}) {
  db();
  const ns = tableNameFor(name);
  const fresh = () => (Array.isArray(defaultValue) ? [] : { ...defaultValue });

  const selStmt = db().prepare(`SELECT data FROM kv WHERE ns = ? AND key = ?`);
  const insStmt = db().prepare(`INSERT OR REPLACE INTO kv (ns, key, data) VALUES (?, ?, ?)`);

  return {
    load() {
      const row = selStmt.get(ns, '_doc');
      if (!row) return fresh();
      try { return JSON.parse(row.data); } catch { return fresh(); }
    },
    persist(data) {
      insStmt.run(ns, '_doc', JSON.stringify(data));
    },
  };
}

// json_extract returns scalars as their native type but objects/arrays come
// back as JSON-encoded strings. Auto-revive those (cheap startswith check
// keeps the common scalar path branch-free).
function reviveProjected(v) {
  if (typeof v !== 'string') return v;
  const c = v.charCodeAt(0);
  if (c === 123 /* { */ || c === 91 /* [ */) {
    try { return JSON.parse(v); } catch { return v; }
  }
  return v;
}

/**
 * Record-collection store on top of SQLite.
 *
 *   const store = createRecordStore('sessions.json', {
 *     columns: { state: 'TEXT' },   // promoted to a real indexed column
 *   });
 *   store.add({ id: '...', state: 'pending', ... });
 *   store.findWhere(`state = ?`, 'pending');
 *   store.project({ id: 'id', state: 'state', name: '$.kol.name' });
 *
 * @param {string} name
 * @param {object} [opts]
 * @param {string}  [opts.idField='id']     record key used by get/update/remove
 * @param {boolean} [opts.timestamps=true]  stamp updated_at on update
 * @param {object}  [opts.columns={}]       { colName: 'TEXT'|'INTEGER'|... }
 *   Top-level record fields to promote to indexed columns. Values are pulled
 *   from `rec[colName]` on add/update; the field stays in `data` too.
 */
export function createRecordStore(name, { idField = 'id', timestamps = true, columns = {} } = {}) {
  const table = tableNameFor(name);
  ensureRecordTable(table, columns);
  const stamp = (rec) => timestamps ? { ...rec, updated_at: new Date().toISOString() } : rec;

  const promoted = Object.keys(columns);
  const promotedColsSql = promoted.length ? ', ' + promoted.map(c => `"${c}"`).join(', ') : '';
  const promotedQsSql   = promoted.length ? ', ' + promoted.map(() => '?').join(', ')     : '';
  const promotedSetSql  = promoted.length ? ', ' + promoted.map(c => `"${c}" = ?`).join(', ') : '';
  const valuesFromRec = (rec) => promoted.map(c => rec[c] ?? null);

  const selOne  = db().prepare(`SELECT data FROM "${table}" WHERE id = ?`);
  const selAsc  = db().prepare(`SELECT data FROM "${table}" ORDER BY seq ASC`);
  const selDesc = db().prepare(`SELECT data FROM "${table}" ORDER BY seq DESC`);
  const insOne  = db().prepare(`
    INSERT OR REPLACE INTO "${table}" (id, data, seq${promotedColsSql}) VALUES (
      ?, ?,
      COALESCE((SELECT seq FROM "${table}" WHERE id = ?),
               (SELECT IFNULL(MAX(seq), 0) + 1 FROM "${table}"))${promotedQsSql}
    )
  `);
  const updOne  = db().prepare(`UPDATE "${table}" SET data = ?${promotedSetSql} WHERE id = ?`);
  const delOne  = db().prepare(`DELETE FROM "${table}" WHERE id = ?`);
  const wipe    = db().prepare(`DELETE FROM "${table}"`);
  const bulkIns = db().prepare(`INSERT INTO "${table}" (id, data, seq${promotedColsSql}) VALUES (?, ?, ?${promotedQsSql})`);

  const parse = (row) => row ? JSON.parse(row.data) : null;
  const parseAll = (rows) => rows.map(r => JSON.parse(r.data));

  return {
    /** Raw records in stored order. */
    loadAll: () => parseAll(selAsc.all()),
    /** Replace the whole collection atomically. Escape hatch for batch ops. */
    persistAll: db().transaction((recs) => {
      wipe.run();
      recs.forEach((r, i) => bulkIns.run(r[idField], JSON.stringify(r), i + 1, ...valuesFromRec(r)));
    }),
    /** Newest-first listing (full records). */
    list:    () => parseAll(selDesc.all()),
    get:     (id) => parse(selOne.get(id)),
    add(rec) {
      const id = rec[idField];
      insOne.run(id, JSON.stringify(rec), id, ...valuesFromRec(rec));
      return rec;
    },
    update(id, patch) {
      const cur = parse(selOne.get(id));
      if (!cur) return null;
      const next = stamp({ ...cur, ...patch });
      updOne.run(JSON.stringify(next), ...valuesFromRec(next), id);
      return next;
    },
    remove(id) {
      delOne.run(id);
    },

    /**
     * Full records matching a raw WHERE clause. The clause is compile-time SQL
     * (not user input) — same trust model as the surrounding code.
     *
     *   store.findWhere(`state NOT IN ('completed', 'error')`)
     *   store.findWhere(`state = ?`, 'pending')
     */
    findWhere(whereSql, ...params) {
      return parseAll(
        db().prepare(`SELECT data FROM "${table}" WHERE ${whereSql} ORDER BY seq DESC`).all(...params)
      );
    },

    /**
     * Lightweight projection — pull specific fields per row without parsing
     * the full `data` blob in JS. Use this for list UIs that only need a few
     * fields from records whose `data` column is multi-KB to multi-MB.
     *
     *   spec — { outputName: sourceSpec }
     *     sourceSpec = 'colName'   → promoted column (no JSON parse)
     *                | '$.foo.bar' → json_extract on the data column
     *
     *   store.project(
     *     { id: 'id', state: 'state', kol_ids: '$.kol_ids', updated: 'updated_at' },
     *     { where: `state != 'completed'`, orderBy: 'seq DESC', limit: 200 }
     *   )
     */
    project(spec, { where, params = [], orderBy = 'seq DESC', limit } = {}) {
      const cols = Object.entries(spec).map(([name, src]) =>
        String(src).startsWith('$')
          ? `json_extract(data, '${String(src).replace(/'/g, "''")}') AS "${name}"`
          : `"${src}" AS "${name}"`
      ).join(', ');
      const sql = `SELECT ${cols} FROM "${table}"`
        + (where   ? ` WHERE ${where}`     : '')
        + (orderBy ? ` ORDER BY ${orderBy}`: '')
        + (limit   ? ` LIMIT ${limit}`     : '');
      const rows = db().prepare(sql).all(...params);
      const keys = Object.keys(spec);
      return rows.map(r => {
        const out = {};
        for (const k of keys) out[k] = reviveProjected(r[k]);
        return out;
      });
    },
  };
}
