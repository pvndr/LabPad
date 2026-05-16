import { openDB } from 'idb';

const DB_NAME = 'labpad';
const DB_VERSION = 1;
const STORE = 'notes';

function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('room', 'room');
        store.createIndex('updatedAt', 'updatedAt');
      }
    },
  });
}

export async function getNotes(room) {
  const db = await getDB();
  const all = await db.getAllFromIndex(STORE, 'room', room);
  return all.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function upsertNote(note) {
  const db = await getDB();
  await db.put(STORE, note);
}

export async function deleteNote(id) {
  const db = await getDB();
  await db.delete(STORE, id);
}

export async function getPendingSync(room) {
  const db = await getDB();
  const notes = await db.getAllFromIndex(STORE, 'room', room);
  return notes.filter(n => n.pendingSync === true);
}

export async function markSynced(id) {
  const db = await getDB();
  const note = await db.get(STORE, id);
  if (note) {
    note.pendingSync = false;
    await db.put(STORE, note);
  }
}
