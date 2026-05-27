/**
 * json-store.js — Tiny factory for the read/persist pattern that every
 * `~/.sns-audit/*.json` store was duplicating.
 *
 *   const store = createJsonStore('sessions.json');
 *   const recs  = store.load();
 *   store.persist(recs);
 *
 * Set `defaultValue` to an empty object for single-doc stores (e.g. config).
 * BOM is stripped on read so files touched by Excel-like tools still parse.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { SYSTEM_DIR } from './paths.js';

export function createJsonStore(filename, { defaultValue = [], dir = SYSTEM_DIR } = {}) {
  const file  = join(dir, filename);
  const fresh = () => (Array.isArray(defaultValue) ? [] : { ...defaultValue });

  return {
    file,
    load() {
      try {
        if (!existsSync(file)) return fresh();
        let raw = readFileSync(file, 'utf-8');
        if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
        return JSON.parse(raw);
      } catch { return fresh(); }
    },
    persist(data) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
    },
  };
}

/** Stable ID with a domain prefix: `<prefix>_<base36-time>_<base36-rand>`. */
export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Record-collection store on top of createJsonStore. Adds the standard
 * list/get/update/add/remove CRUD that every domain store was reimplementing.
 *
 *   const store = createRecordStore('sessions.json');
 *   store.add({ id: '...', ... });
 *   store.update(id, { state: 'completed' });
 *
 * @param {string} filename
 * @param {object} [opts]
 * @param {string}  [opts.idField='id']        record key used by get/update/remove
 * @param {boolean} [opts.timestamps=true]     stamp updated_at on update
 * @param {string}  [opts.dir]                 override default SYSTEM_DIR
 */
export function createRecordStore(filename, { idField = 'id', timestamps = true, dir } = {}) {
  const base  = createJsonStore(filename, { dir });
  const stamp = (rec) => timestamps ? { ...rec, updated_at: new Date().toISOString() } : rec;

  return {
    file:    base.file,
    /** Raw records in stored order. */
    loadAll: () => base.load(),
    /** Persist a replacement records array. Escape hatch for batch ops. */
    persistAll: (recs) => base.persist(recs),
    /** Newest-first listing. */
    list:    () => base.load().slice().reverse(),
    get:     (id) => base.load().find(r => r[idField] === id) ?? null,
    add(rec) {
      const recs = base.load();
      recs.push(rec);
      base.persist(recs);
      return rec;
    },
    update(id, patch) {
      const recs = base.load();
      const i = recs.findIndex(r => r[idField] === id);
      if (i < 0) return null;
      recs[i] = stamp({ ...recs[i], ...patch });
      base.persist(recs);
      return recs[i];
    },
    remove(id) {
      base.persist(base.load().filter(r => r[idField] !== id));
    },
  };
}
