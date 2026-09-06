import { useState, useEffect, useCallback } from "react";
import { supabase } from "./lib/supabase";

// ─── LABPAD ───────────────────────────────────────────────
// Offline-first code & notes stash for lab exams
// Sync when online → access when offline ✅
// ─────────────────────────────────────────────────────────

const STORAGE_KEY = "labpad_notes";
const ROOM_KEY = "labpad_room";
const SYNC_KEY = "labpad_lastSync";

const SUBJECTS = ["OS Lab", "DBMS Lab", "CN Lab", "DS Lab", "Java Lab", "Web Lab", "Other"];

function timeAgo(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso);
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function LabPad() {
  const [screen, setScreen] = useState("home");
  const [notes, setNotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncStatus, setSyncStatus] = useState("idle"); // idle | syncing | synced | error | offline
  const [lastSync, setLastSync] = useState(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editSubject, setEditSubject] = useState("Other");
  const [copied, setCopied] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [toast, setToast] = useState(null);

  // ── Init ──
  useEffect(() => {
    const savedNotes = localStorage.getItem(STORAGE_KEY);
    if (savedNotes) setNotes(JSON.parse(savedNotes));
    const savedRoom = localStorage.getItem(ROOM_KEY);
    const savedSync = localStorage.getItem(SYNC_KEY);
    if (savedSync) setLastSync(savedSync);
    if (savedRoom) setRoomCode(savedRoom);
    else setShowSetup(true);
  }, []);

  // ── Online/offline ──
  useEffect(() => {
    const up = () => { setIsOnline(true); };
    const down = () => { setIsOnline(false); setSyncStatus("offline"); };
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); };
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  };

  // ── Storage ──
  const persistNotes = (n) => {
    setNotes(n);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(n));
  };

  // ── Sync (Supabase) ──
  const syncToCloud = useCallback(async () => {
    if (!roomCode || !isOnline) { setSyncStatus("offline"); return; }
    setSyncStatus("syncing");
    try {
      const currentNotes = JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
      const { data: remoteNotes, error: fetchError } = await supabase
        .from('notes')
        .select('*')
        .eq('room', roomCode);

      if (fetchError) throw fetchError;

      const remoteNotesMap = new Map((remoteNotes || []).map(n => [n.id, n]));
      
      let mergedNotes = [];
      let notesToUpsert = [];

      for (const localNote of currentNotes) {
        const remoteNote = remoteNotesMap.get(localNote.id);
        if (remoteNote) {
          if (new Date(localNote.updatedAt) > new Date(remoteNote.updatedAt)) {
            notesToUpsert.push({ ...localNote, room: roomCode });
            mergedNotes.push(localNote);
          } else {
            mergedNotes.push(remoteNote);
          }
          remoteNotesMap.delete(localNote.id);
        } else {
          notesToUpsert.push({ ...localNote, room: roomCode });
          mergedNotes.push(localNote);
        }
      }

      for (const remoteNote of remoteNotesMap.values()) {
        mergedNotes.push(remoteNote);
      }

      if (notesToUpsert.length > 0) {
        const { error: upsertError } = await supabase
          .from('notes')
          .upsert(notesToUpsert);
        if (upsertError) throw upsertError;
      }

      mergedNotes = mergedNotes.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
      setNotes(mergedNotes);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedNotes));

      const now = new Date().toISOString();
      setLastSync(now);
      localStorage.setItem(SYNC_KEY, now);
      setSyncStatus("synced");
      showToast("Synced ✓");
    } catch (err) {
      console.error(err);
      setSyncStatus("error");
    }
  }, [roomCode, isOnline]);

  // ── Auto Sync ──
  useEffect(() => {
    if (roomCode && isOnline) {
      syncToCloud();
    }
  }, [roomCode, isOnline, syncToCloud]);

  // ── Room setup ──
  const enterRoom = () => {
    if (!roomInput.trim()) return;
    const code = roomInput.trim().toLowerCase().replace(/\s+/g, "-");
    localStorage.setItem(ROOM_KEY, code);
    setRoomCode(code);
    setShowSetup(false);
    showToast(`Entered room #${code}`);
  };

  // ── Note ops ──
  const createNote = () => {
    const note = {
      id: Date.now().toString(),
      title: "Untitled",
      content: "",
      subject: "Other",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persistNotes([note, ...notes]);
    openNote(note);
  };

  const openNote = (note) => {
    setSelected(note);
    setEditTitle(note.title);
    setEditContent(note.content);
    setEditSubject(note.subject || "Other");
    setConfirmDelete(false);
    setScreen("editor");
  };

  const saveNote = useCallback(() => {
    if (!selected) return;
    const updated = notes.map(n =>
      n.id === selected.id
        ? { ...n, title: editTitle || "Untitled", content: editContent, subject: editSubject, updatedAt: new Date().toISOString() }
        : n
    );
    persistNotes(updated);
    if (isOnline) syncToCloud();
  }, [selected, editTitle, editContent, editSubject, notes, isOnline]);

  const deleteNote = async () => {
    const noteIdToDelete = selected.id;
    persistNotes(notes.filter(n => n.id !== noteIdToDelete));
    setScreen("home");
    showToast("Note deleted");

    if (isOnline && roomCode) {
      try {
        await supabase.from('notes').delete().eq('id', noteIdToDelete).eq('room', roomCode);
      } catch (err) {
        console.error("Failed to delete from cloud:", err);
      }
    }
  };

  const copyContent = () => {
    navigator.clipboard.writeText(editContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const filteredNotes = notes.filter(n =>
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (n.subject || "").toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ════════════════════════════════════
  // RENDER
  // ════════════════════════════════════

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@300;400;500;600&family=DM+Sans:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body { background: #080808; }

        :root {
          --bg: #080808;
          --surface: #101010;
          --card: #161616;
          --border: #1e1e1e;
          --border2: #2a2a2a;
          --accent: #00e87a;
          --accent-dim: rgba(0,232,122,0.12);
          --accent-glow: rgba(0,232,122,0.25);
          --text: #e8e8e8;
          --muted: #606060;
          --muted2: #404040;
          --danger: #ff4757;
          --warn: #ffa502;
          --mono: 'JetBrains Mono', monospace;
          --sans: 'DM Sans', sans-serif;
          --radius: 10px;
          --radius-sm: 6px;
        }

        .labpad {
          font-family: var(--sans);
          background: var(--bg);
          color: var(--text);
          min-height: 100vh;
          max-width: 480px;
          margin: 0 auto;
          position: relative;
          overflow-x: hidden;
        }

        /* ── TOAST ── */
        .toast {
          position: fixed;
          bottom: 24px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--card);
          border: 1px solid var(--border2);
          color: var(--accent);
          font-family: var(--mono);
          font-size: 12px;
          padding: 10px 20px;
          border-radius: 100px;
          z-index: 1000;
          white-space: nowrap;
          box-shadow: 0 4px 24px rgba(0,0,0,0.5);
          animation: fadeUp 0.2s ease;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }

        /* ── SETUP OVERLAY ── */
        .setup-overlay {
          position: fixed; inset: 0;
          background: var(--bg);
          display: flex; align-items: center; justify-content: center;
          padding: 32px;
          z-index: 500;
        }
        .setup-card {
          width: 100%;
          max-width: 360px;
          text-align: center;
        }
        .setup-logo {
          font-family: var(--mono);
          font-size: 48px;
          margin-bottom: 8px;
          display: block;
        }
        .setup-title {
          font-family: var(--mono);
          font-size: 22px;
          font-weight: 600;
          color: var(--accent);
          letter-spacing: -0.5px;
          margin-bottom: 8px;
        }
        .setup-sub {
          font-size: 13px;
          color: var(--muted);
          margin-bottom: 32px;
          line-height: 1.6;
        }
        .setup-input {
          width: 100%;
          background: var(--card);
          border: 1px solid var(--border2);
          border-radius: var(--radius);
          color: var(--text);
          font-family: var(--mono);
          font-size: 15px;
          padding: 14px 16px;
          outline: none;
          margin-bottom: 12px;
          transition: border-color 0.2s;
        }
        .setup-input:focus { border-color: var(--accent); }
        .setup-input::placeholder { color: var(--muted2); }
        .setup-btn {
          width: 100%;
          background: var(--accent);
          color: #000;
          border: none;
          border-radius: var(--radius);
          font-family: var(--mono);
          font-size: 14px;
          font-weight: 600;
          padding: 14px;
          cursor: pointer;
          letter-spacing: 0.5px;
          transition: opacity 0.2s;
        }
        .setup-btn:hover { opacity: 0.88; }
        .setup-hint {
          font-size: 11px;
          color: var(--muted);
          margin-top: 16px;
          font-family: var(--mono);
        }

        /* ── HEADER ── */
        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(12px);
        }
        .logo {
          font-family: var(--mono);
          font-size: 16px;
          font-weight: 600;
          color: var(--accent);
          letter-spacing: -0.3px;
        }
        .room-badge {
          font-family: var(--mono);
          font-size: 11px;
          color: var(--muted);
          background: var(--card);
          border: 1px solid var(--border2);
          border-radius: 100px;
          padding: 3px 10px;
          margin-left: 10px;
        }
        .header-left { display: flex; align-items: center; gap: 0; }
        .header-right { display: flex; align-items: center; gap: 12px; }
        .status-pill {
          display: flex; align-items: center; gap: 6px;
          font-family: var(--mono);
          font-size: 11px;
          color: var(--muted);
        }
        .status-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          transition: background 0.3s;
        }
        .status-dot.online { background: var(--accent); box-shadow: 0 0 6px var(--accent-glow); }
        .status-dot.offline { background: var(--danger); }
        .status-dot.syncing { background: var(--warn); animation: pulse 1s infinite; }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }

        .icon-btn {
          background: none; border: none;
          color: var(--muted); cursor: pointer;
          font-size: 18px; padding: 4px;
          transition: color 0.2s;
        }
        .icon-btn:hover { color: var(--text); }

        /* ── HOME ── */
        .home-content { padding: 16px 20px 100px; }

        .search-bar {
          display: flex; align-items: center;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 10px 14px;
          gap: 10px;
          margin-bottom: 20px;
          transition: border-color 0.2s;
        }
        .search-bar:focus-within { border-color: var(--border2); }
        .search-icon { color: var(--muted); font-size: 14px; }
        .search-input {
          background: none; border: none; outline: none;
          color: var(--text); font-family: var(--sans);
          font-size: 14px; flex: 1;
        }
        .search-input::placeholder { color: var(--muted2); }

        .section-label {
          font-family: var(--mono);
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 1.5px;
          color: var(--muted);
          margin-bottom: 12px;
        }

        .note-list { display: flex; flex-direction: column; gap: 8px; }

        .note-card {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px 16px;
          cursor: pointer;
          transition: all 0.15s;
          position: relative;
          overflow: hidden;
        }
        .note-card::before {
          content: '';
          position: absolute; left: 0; top: 0; bottom: 0;
          width: 3px;
          background: var(--accent);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .note-card:hover { border-color: var(--border2); transform: translateX(2px); }
        .note-card:hover::before { opacity: 1; }

        .note-card-top {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 6px;
        }
        .note-title {
          font-size: 14px; font-weight: 500;
          color: var(--text);
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .note-time {
          font-family: var(--mono);
          font-size: 10px; color: var(--muted);
          margin-left: 12px; flex-shrink: 0;
        }
        .note-subject {
          font-family: var(--mono);
          font-size: 10px;
          color: var(--accent);
          background: var(--accent-dim);
          border-radius: 4px;
          padding: 2px 7px;
          display: inline-block;
          margin-bottom: 6px;
        }
        .note-preview {
          font-family: var(--mono);
          font-size: 11px; color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          line-height: 1.4;
        }

        .empty-state {
          text-align: center;
          padding: 60px 20px;
        }
        .empty-icon { font-size: 40px; margin-bottom: 16px; opacity: 0.4; }
        .empty-title { font-size: 15px; font-weight: 500; color: var(--muted); margin-bottom: 6px; }
        .empty-hint { font-size: 12px; color: var(--muted2); font-family: var(--mono); }

        /* ── FAB ── */
        .fab {
          position: fixed;
          bottom: 28px; right: calc(50% - 220px);
          width: 52px; height: 52px;
          background: var(--accent);
          color: #000;
          border: none; border-radius: 50%;
          font-size: 26px; line-height: 1;
          cursor: pointer;
          box-shadow: 0 4px 20px var(--accent-glow);
          transition: all 0.2s;
          display: flex; align-items: center; justify-content: center;
        }
        .fab:hover { transform: scale(1.08); box-shadow: 0 6px 28px var(--accent-glow); }

        /* ── EDITOR ── */
        .editor-header {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--border);
          background: var(--bg);
          position: sticky; top: 0; z-index: 100;
        }
        .back-btn {
          background: none; border: none; color: var(--muted);
          font-family: var(--mono); font-size: 13px;
          cursor: pointer; padding: 6px 0; flex-shrink: 0;
          transition: color 0.2s;
        }
        .back-btn:hover { color: var(--text); }
        .title-input {
          flex: 1;
          background: none; border: none; outline: none;
          color: var(--text);
          font-family: var(--sans);
          font-size: 15px; font-weight: 500;
          min-width: 0;
        }
        .title-input::placeholder { color: var(--muted2); }

        .subject-select {
          background: var(--card);
          border: 1px solid var(--border2);
          border-radius: var(--radius-sm);
          color: var(--accent);
          font-family: var(--mono);
          font-size: 11px;
          padding: 5px 8px;
          outline: none;
          cursor: pointer;
        }

        .editor-area {
          flex: 1;
          min-height: calc(100vh - 160px);
          padding: 20px;
        }
        .code-textarea {
          width: 100%;
          min-height: calc(100vh - 200px);
          background: none;
          border: none; outline: none;
          color: #c8ffd4;
          font-family: var(--mono);
          font-size: 13px;
          line-height: 1.7;
          resize: none;
          tab-size: 2;
          caret-color: var(--accent);
        }
        .code-textarea::placeholder { color: var(--muted2); }
        .code-textarea::selection { background: var(--accent-dim); }

        .editor-footer {
          position: fixed;
          bottom: 0; left: 50%; transform: translateX(-50%);
          width: 100%; max-width: 480px;
          background: var(--bg);
          border-top: 1px solid var(--border);
          padding: 12px 20px;
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px;
        }
        .char-count {
          font-family: var(--mono);
          font-size: 11px; color: var(--muted);
        }
        .footer-right { display: flex; gap: 10px; align-items: center; }
        .del-btn {
          background: none;
          border: 1px solid var(--border2);
          border-radius: var(--radius-sm);
          color: var(--danger);
          font-size: 12px; font-family: var(--mono);
          padding: 8px 14px; cursor: pointer;
          transition: all 0.2s;
        }
        .del-btn:hover { background: rgba(255,71,87,0.1); }
        .copy-btn {
          border: 1px solid var(--accent);
          border-radius: var(--radius-sm);
          font-family: var(--mono);
          font-size: 12px;
          font-weight: 600;
          padding: 8px 18px;
          cursor: pointer;
          transition: all 0.2s;
          letter-spacing: 0.3px;
        }
        .copy-btn.idle { background: var(--accent-dim); color: var(--accent); }
        .copy-btn.done { background: var(--accent); color: #000; }

        /* ── SETTINGS ── */
        .settings-content { padding: 24px 20px; }
        .setting-group {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          overflow: hidden;
          margin-bottom: 16px;
        }
        .setting-row {
          padding: 16px;
          border-bottom: 1px solid var(--border);
          display: flex; align-items: center; justify-content: space-between;
        }
        .setting-row:last-child { border-bottom: none; }
        .setting-key {
          font-family: var(--mono);
          font-size: 11px; color: var(--muted);
          text-transform: uppercase; letter-spacing: 1px;
          margin-bottom: 3px;
        }
        .setting-val {
          font-size: 15px; font-weight: 500; color: var(--text);
        }
        .setting-val.green { color: var(--accent); }
        .setting-val.red { color: var(--danger); }
        .setting-action {
          font-family: var(--mono);
          font-size: 11px; color: var(--accent);
          background: none; border: none; cursor: pointer;
          padding: 6px 12px;
          border: 1px solid var(--border2);
          border-radius: var(--radius-sm);
          transition: background 0.2s;
        }
        .setting-action:hover { background: var(--accent-dim); }
        .setting-action:disabled { opacity: 0.4; cursor: not-allowed; }

        .sync-info {
          font-family: var(--mono);
          font-size: 10px; color: var(--muted);
          margin-top: 24px;
          text-align: center;
          line-height: 1.8;
        }
        .sync-info a { color: var(--accent); text-decoration: none; }

        /* ── CONFIRM DELETE ── */
        .confirm-bar {
          position: fixed;
          bottom: 68px; left: 50%; transform: translateX(-50%);
          width: calc(100% - 40px); max-width: 440px;
          background: #1a0a0a;
          border: 1px solid var(--danger);
          border-radius: var(--radius);
          padding: 14px 16px;
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px;
          z-index: 200;
        }
        .confirm-text { font-size: 13px; color: var(--text); }
        .confirm-actions { display: flex; gap: 8px; }
        .confirm-yes {
          background: var(--danger); color: #fff;
          border: none; border-radius: var(--radius-sm);
          font-family: var(--mono); font-size: 12px;
          padding: 7px 14px; cursor: pointer;
        }
        .confirm-no {
          background: var(--card); color: var(--muted);
          border: 1px solid var(--border2); border-radius: var(--radius-sm);
          font-family: var(--mono); font-size: 12px;
          padding: 7px 14px; cursor: pointer;
        }
      `}</style>

      <div className="labpad">

        {/* ── TOAST ── */}
        {toast && <div className="toast">{toast}</div>}

        {/* ── ROOM SETUP ── */}
        {showSetup && (
          <div className="setup-overlay">
            <div className="setup-card">
              <span className="setup-logo">◈</span>
              <h1 className="setup-title">LabPad</h1>
              <p className="setup-sub">
                Your offline-first code stash.<br />
                Enter a room code to sync notes across your devices.
              </p>
              <input
                className="setup-input"
                placeholder="e.g. pavan-vtu-lab"
                value={roomInput}
                onChange={e => setRoomInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && enterRoom()}
                autoFocus
              />
              <button className="setup-btn" onClick={enterRoom}>
                Enter LabPad →
              </button>
              <p className="setup-hint">
                Same code on any device = same notes · works offline
              </p>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════ HOME ══ */}
        {screen === "home" && (
          <>
            <header className="header">
              <div className="header-left">
                <span className="logo">◈ LabPad</span>
                {roomCode && <span className="room-badge">#{roomCode}</span>}
              </div>
              <div className="header-right">
                <div className="status-pill">
                  <div className={`status-dot ${syncStatus === "syncing" ? "syncing" : isOnline ? "online" : "offline"}`} />
                  <span>{syncStatus === "syncing" ? "syncing" : isOnline ? "online" : "offline"}</span>
                </div>
                <button className="icon-btn" onClick={() => setScreen("settings")} title="Settings">⚙</button>
              </div>
            </header>

            <div className="home-content">
              <div className="search-bar">
                <span className="search-icon">⌕</span>
                <input
                  className="search-input"
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>

              {filteredNotes.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📋</div>
                  <div className="empty-title">
                    {searchQuery ? "No matching notes" : "No notes yet"}
                  </div>
                  <div className="empty-hint">
                    {searchQuery ? "Try a different search" : "Tap + to add your first program"}
                  </div>
                </div>
              ) : (
                <>
                  <div className="section-label">{filteredNotes.length} note{filteredNotes.length !== 1 && "s"}</div>
                  <div className="note-list">
                    {filteredNotes.map(note => (
                      <div key={note.id} className="note-card" onClick={() => openNote(note)}>
                        <div className="note-card-top">
                          <span className="note-title">{note.title}</span>
                          <span className="note-time">{timeAgo(note.updatedAt)}</span>
                        </div>
                        {note.subject && note.subject !== "Other" && (
                          <div className="note-subject">{note.subject}</div>
                        )}
                        <div className="note-preview">
                          {note.content.trim().slice(0, 90) || "Empty note..."}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <button className="fab" onClick={createNote}>+</button>
          </>
        )}

        {/* ══════════════════════════════════ EDITOR ══ */}
        {screen === "editor" && (
          <>
            <header className="editor-header">
              <button className="back-btn" onClick={() => { saveNote(); setScreen("home"); setCopied(false); setConfirmDelete(false); }}>
                ← Save
              </button>
              <input
                className="title-input"
                value={editTitle}
                onChange={e => setEditTitle(e.target.value)}
                placeholder="Note title..."
              />
              <select
                className="subject-select"
                value={editSubject}
                onChange={e => setEditSubject(e.target.value)}
              >
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </header>

            <div className="editor-area">
              <textarea
                className="code-textarea"
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                placeholder={"// Paste your code or notes here...\n// Works offline ◈"}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>

            <div className="editor-footer">
              <span className="char-count">
                {editContent.length} chars · {editContent.split("\n").length} lines
              </span>
              <div className="footer-right">
                <button className="del-btn" onClick={() => setConfirmDelete(true)}>Delete</button>
                <button
                  className={`copy-btn ${copied ? "done" : "idle"}`}
                  onClick={copyContent}
                >
                  {copied ? "✓ Copied!" : "Copy All"}
                </button>
              </div>
            </div>

            {confirmDelete && (
              <div className="confirm-bar">
                <span className="confirm-text">Delete this note?</span>
                <div className="confirm-actions">
                  <button className="confirm-no" onClick={() => setConfirmDelete(false)}>Cancel</button>
                  <button className="confirm-yes" onClick={deleteNote}>Delete</button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ══════════════════════════════════ SETTINGS ══ */}
        {screen === "settings" && (
          <>
            <header className="header">
              <button className="back-btn" onClick={() => setScreen("home")}>← Back</button>
              <span className="logo" style={{ color: "var(--text)", fontWeight: 400 }}>Settings</span>
              <span />
            </header>

            <div className="settings-content">
              <div className="setting-group">
                <div className="setting-row">
                  <div>
                    <div className="setting-key">Room Code</div>
                    <div className="setting-val">#{roomCode}</div>
                  </div>
                  <button className="setting-action" onClick={() => { setShowSetup(true); setRoomInput(""); }}>
                    Change
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <div className="setting-key">Connection</div>
                    <div className={`setting-val ${isOnline ? "green" : "red"}`}>
                      {isOnline ? "● Online" : "● Offline"}
                    </div>
                  </div>
                </div>
                <div className="setting-row">
                  <div>
                    <div className="setting-key">Last Synced</div>
                    <div className="setting-val">{timeAgo(lastSync)}</div>
                  </div>
                  <button className="setting-action" onClick={syncToCloud} disabled={!isOnline || syncStatus === "syncing"}>
                    {syncStatus === "syncing" ? "Syncing..." : "Sync Now"}
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <div className="setting-key">Notes Stored</div>
                    <div className="setting-val">{notes.length} notes locally</div>
                  </div>
                </div>
              </div>

              <div className="sync-info">
                Cloud sync powered by Supabase<br />
                <span style={{ color: "var(--muted2)" }}>
                  Replace mock sync in source to connect your DB
                </span>
              </div>
            </div>
          </>
        )}

      </div>
    </>
  );
}
