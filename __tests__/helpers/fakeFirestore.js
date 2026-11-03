/**
 * In-memory stand-in for the Firestore Admin SDK, for service tests: collections of documents,
 * `where(field, '==', value)` queries, batches and transactions (writes are applied when the
 * batch is committed / the transaction callback finishes) and the FieldValue sentinels the
 * services use (server timestamp, increment, delete, arrayUnion) with their real meaning.
 *
 * Use it from a test file like this (names starting with `mock` may be used inside jest.mock):
 *
 *   const mockFake = createFakeFirestore();
 *   jest.mock('firebase-admin/firestore', () => require('../helpers/fakeFirestore').firestoreModuleMock);
 *   jest.mock('../../lib/firebase-admin', () => ({ getAdminFirestore: () => mockFake.db }));
 */

const DELETE = Symbol('delete');

export const firestoreModuleMock = {
  FieldValue: {
    serverTimestamp: () => ({ __op: 'serverTimestamp' }),
    increment: (amount) => ({ __op: 'increment', amount }),
    delete: () => ({ __op: 'delete' }),
    arrayUnion: (entry) => ({ __op: 'arrayUnion', entry }),
  },
  Timestamp: { now: () => 'NOW' },
};

function resolveValue(current, value) {
  if (value && typeof value === 'object' && value.__op) {
    if (value.__op === 'serverTimestamp') return 'SERVER_TIMESTAMP';
    if (value.__op === 'increment') return (current ?? 0) + value.amount;
    if (value.__op === 'arrayUnion') return [...(current ?? []), value.entry];
    if (value.__op === 'delete') return DELETE;
  }
  return value;
}

function setPath(target, path, value) {
  const keys = path.split('.');
  let cursor = target;
  keys.slice(0, -1).forEach((key) => {
    cursor[key] = { ...cursor[key] };
    cursor = cursor[key];
  });
  const last = keys[keys.length - 1];
  const resolved = resolveValue(cursor[last], value);
  if (resolved === DELETE) delete cursor[last];
  else cursor[last] = resolved;
}

function applyData(existing, data) {
  const next = structuredClone(existing ?? {});
  Object.entries(data).forEach(([path, value]) => setPath(next, path, value));
  return next;
}

export function createFakeFirestore() {
  const docs = new Map();

  const write = {
    set: (path, data) => docs.set(path, applyData({}, data)),
    create: (path, data) => {
      if (docs.has(path)) throw Object.assign(new Error(`already exists: ${path}`), { code: 6 });
      docs.set(path, applyData({}, data));
    },
    update: (path, data) => {
      if (!docs.has(path)) throw new Error(`no document to update: ${path}`);
      docs.set(path, applyData(docs.get(path), data));
    },
    delete: (path) => docs.delete(path),
  };

  function snapshotOf(collection, id) {
    const path = `${collection}/${id}`;
    return { id, exists: docs.has(path), data: () => docs.get(path), ref: refOf(collection, id) };
  }

  function refOf(collection, id) {
    const path = `${collection}/${id}`;
    return {
      id,
      path,
      get: async () => snapshotOf(collection, id),
      set: async (data) => write.set(path, data),
      create: async (data) => write.create(path, data),
      update: async (data) => write.update(path, data),
      delete: async () => write.delete(path),
    };
  }

  function queryOf(collection, filters = []) {
    const run = () => {
      const matches = [...docs.keys()]
        .filter((path) => path.startsWith(`${collection}/`))
        .map((path) => path.slice(collection.length + 1))
        .filter((id) => filters.every(({ field, value }) => docs.get(`${collection}/${id}`)[field] === value));
      const snapshots = matches.map((id) => snapshotOf(collection, id));
      return { docs: snapshots, empty: snapshots.length === 0 };
    };
    return {
      where: (field, op, value) => queryOf(collection, [...filters, { field, value }]),
      orderBy: () => queryOf(collection, filters),
      limit: () => queryOf(collection, filters),
      get: async () => run(),
      run,
    };
  }

  const db = {
    collection: (name) => ({ doc: (id = `auto-${docs.size + 1}-${Math.random().toString(36).slice(2, 8)}`) => refOf(name, id), ...queryOf(name) }),
    batch: () => {
      const pending = [];
      return {
        set: (ref, data) => pending.push(() => write.set(ref.path, data)),
        delete: (ref) => pending.push(() => write.delete(ref.path)),
        commit: async () => pending.forEach((apply) => apply()),
      };
    },
    runTransaction: async (callback) => {
      const pending = [];
      const result = await callback({
        get: async (target) => (target.run ? target.run() : target.get()),
        create: (ref, data) => pending.push(() => write.create(ref.path, data)),
        update: (ref, data) => pending.push(() => write.update(ref.path, data)),
        set: (ref, data) => pending.push(() => write.set(ref.path, data)),
      });
      pending.forEach((apply) => apply());
      return result;
    },
  };

  return { db, docs, count: (collection) => [...docs.keys()].filter((path) => path.startsWith(`${collection}/`)).length };
}
