import { supabase } from './supabaseClient';
import * as db from './db';

// Convert Supabase snake_case row → app camelCase note
function rowToNote(row) {
  return {
    id: row.id,
    room: row.room,
    title: row.title,
    content: row.content,
    subject: row.subject,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    pendingSync: false,
  };
}

// Convert app note → Supabase row
function noteToRow(note) {
  return {
    id: note.id,
    room: note.room,
    title: note.title,
    content: note.content,
    subject: note.subject,
    created_at: note.createdAt,
    updated_at: note.updatedAt,
  };
}

// Fetch all notes for room from Supabase, merge with local (latest updatedAt wins)
export async function fetchAndMerge(room) {
  const { data, error } = await supabase
    .from('notes')
    .select('*')
    .eq('room', room);

  if (error) throw error;

  const localNotes = await db.getNotes(room);
  const localMap = Object.fromEntries(localNotes.map(n => [n.id, n]));
  const remoteIds = new Set(data.map(r => r.id));

  // Merge remote into local
  for (const row of data) {
    const remote = rowToNote(row);
    const local = localMap[remote.id];
    if (!local || new Date(remote.updatedAt) >= new Date(local.updatedAt)) {
      await db.upsertNote(remote);
    }
  }

  // Push local-only notes to remote
  for (const local of localNotes) {
    if (!remoteIds.has(local.id)) {
      await upsertToSupabase(local);
    }
  }

  return db.getNotes(room);
}

// Upsert a single note to Supabase and mark it synced in IndexedDB
export async function upsertToSupabase(note) {
  const { error } = await supabase.from('notes').upsert(noteToRow(note));
  if (error) throw error;
  await db.markSynced(note.id);
}

// Delete a note from Supabase
export async function deleteFromSupabase(id) {
  const { error } = await supabase.from('notes').delete().eq('id', id);
  if (error) throw error;
}

// Push all pending-sync notes to Supabase; returns count pushed
export async function pushPending(room) {
  const pending = await db.getPendingSync(room);
  for (const note of pending) {
    await upsertToSupabase(note);
  }
  return pending.length;
}

// Subscribe to real-time changes for a room
// onUpdate(note) is called whenever a remote INSERT or UPDATE arrives
export function subscribeToRoom(room, onUpdate) {
  const channel = supabase
    .channel(`labpad:notes:${room}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'notes',
        filter: `room=eq.${room}`,
      },
      async (payload) => {
        if (payload.eventType === 'DELETE') return;
        const note = rowToNote(payload.new);
        await db.upsertNote(note);
        onUpdate(note);
      }
    )
    .subscribe();

  return channel;
}
