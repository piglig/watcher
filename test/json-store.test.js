import { describe, it, expect } from 'vitest';
import { SQLITE_OK } from './helpers/sqlite-available.js';

// The store layer is backed by native better-sqlite3. Skip (don't fail) when
// the native binary can't load in this environment — see the helper for why.
const describeDb = SQLITE_OK ? describe : describe.skip;

const { createRecordStore } = SQLITE_OK
  ? await import('../src/shared/json-store.js')
  : { createRecordStore: () => {} };

// Each test uses a uniquely-named store so the backing SQLite table is isolated
// (table name is derived from the store name). The DB itself lives under the
// temp HOME set up in test/setup.js.
let counter = 0;
const freshStore = (opts) => createRecordStore(`test_store_${Date.now()}_${counter++}.json`, opts);

describeDb('createRecordStore — basic CRUD', () => {
  it('adds and gets a record by id', () => {
    const s = freshStore();
    s.add({ id: 'a', name: 'Alice' });
    expect(s.get('a')).toMatchObject({ id: 'a', name: 'Alice' });
  });

  it('returns null for a missing id', () => {
    const s = freshStore();
    expect(s.get('nope')).toBeNull();
  });

  it('update merges a patch and preserves untouched fields', () => {
    const s = freshStore();
    s.add({ id: 'a', name: 'Alice', age: 30 });
    s.update('a', { age: 31 });
    expect(s.get('a')).toMatchObject({ id: 'a', name: 'Alice', age: 31 });
  });

  it('update stamps updated_at by default', () => {
    const s = freshStore();
    s.add({ id: 'a', name: 'Alice' });
    s.update('a', { name: 'Alice2' });
    expect(typeof s.get('a').updated_at).toBe('string');
  });

  it('remove deletes the record', () => {
    const s = freshStore();
    s.add({ id: 'a' });
    s.remove('a');
    expect(s.get('a')).toBeNull();
  });

  it('add with an existing id replaces in place (INSERT OR REPLACE)', () => {
    const s = freshStore();
    s.add({ id: 'a', v: 1 });
    s.add({ id: 'a', v: 2 });
    expect(s.get('a').v).toBe(2);
    expect(s.list().filter(r => r.id === 'a')).toHaveLength(1);
  });
});

describeDb('createRecordStore — listing order', () => {
  it('list() returns newest-first by insertion sequence', () => {
    const s = freshStore();
    s.add({ id: 'first' });
    s.add({ id: 'second' });
    s.add({ id: 'third' });
    expect(s.list().map(r => r.id)).toEqual(['third', 'second', 'first']);
  });

  it('loadAll() returns oldest-first', () => {
    const s = freshStore();
    s.add({ id: 'first' });
    s.add({ id: 'second' });
    expect(s.loadAll().map(r => r.id)).toEqual(['first', 'second']);
  });
});

describeDb('createRecordStore — promoted columns & queries', () => {
  it('findWhere queries against a promoted column', () => {
    const s = freshStore({ columns: { state: 'TEXT' } });
    s.add({ id: 'a', state: 'pending' });
    s.add({ id: 'b', state: 'done' });
    s.add({ id: 'c', state: 'pending' });
    const pending = s.findWhere('state = ?', 'pending');
    expect(pending.map(r => r.id).sort()).toEqual(['a', 'c']);
  });

  it('keeps the promoted field inside the JSON blob too (JSON wins on read)', () => {
    const s = freshStore({ columns: { state: 'TEXT' } });
    s.add({ id: 'a', state: 'pending', extra: 1 });
    expect(s.get('a')).toMatchObject({ state: 'pending', extra: 1 });
  });

  it('update keeps the promoted column in sync with the blob', () => {
    const s = freshStore({ columns: { state: 'TEXT' } });
    s.add({ id: 'a', state: 'pending' });
    s.update('a', { state: 'done' });
    expect(s.findWhere('state = ?', 'done').map(r => r.id)).toEqual(['a']);
    expect(s.findWhere('state = ?', 'pending')).toEqual([]);
  });
});

describeDb('createRecordStore — persistAll', () => {
  it('atomically replaces the whole collection', () => {
    const s = freshStore();
    s.add({ id: 'old' });
    s.persistAll([{ id: 'x' }, { id: 'y' }]);
    expect(s.loadAll().map(r => r.id)).toEqual(['x', 'y']);
    expect(s.get('old')).toBeNull();
  });
});
