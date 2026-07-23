import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MessageSquare, ListChecks, Inbox, X, Maximize2, Minimize2 } from 'lucide-react';
import { db, auth } from '../../firebase.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc,
  arrayUnion, getDocs, documentId,
} from 'firebase/firestore';
import '../shared/ActivityPanel.css';

// Firestore 'in' queries are capped at 30 values - chunk defensively at 10
function chunk(arr, size = 10) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function relativeTime(ts) {
  const ms = ts?.toMillis ? ts.toMillis() : (ts ? new Date(ts).getTime() : Date.now());
  if (isNaN(ms)) return 'just now';
  const diff = Date.now() - ms;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

function isOverdueTask(t) {
  if (!t.dueDate || t.status === 'approved') return false;
  const due = new Date(t.dueDate);
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

// De-dupe comment docs that share the same custom `id` field (a pre-existing
// data quirk in im-comments — some threads have more than one Firestore doc
// with the same logical id). We keep the most recently created one, keyed by
// the real Firestore document id so React never sees a collision.
function dedupeComments(docs) {
  const byLogicalId = new Map();
  docs.forEach(d => {
    const data = d.data();
    const logicalId = data.id || d.id;
    const candidate = { _docId: d.id, id: logicalId, ...data };
    const existing = byLogicalId.get(logicalId);
    if (!existing || (candidate.createdAt?.toMillis?.() || 0) >= (existing.createdAt?.toMillis?.() || 0)) {
      byLogicalId.set(logicalId, candidate);
    }
  });
  return Array.from(byLogicalId.values());
}

/**
 * MyWorkspacePanel — cross-project "assigned to me" drawer.
 * Always mounted (so the unseen badge stays live even when closed), but only
 * renders the drawer UI itself when `isOpen` is true. Triggered from a header
 * button rather than shown inline, so it never pushes the project grid down.
 *
 * Props:
 *  - isDark: boolean
 *  - navigate: react-router navigate fn
 *  - projects: [{id, name}] - already loaded on Dashboard, used to label items
 *  - isOpen: boolean - whether the drawer is currently visible
 *  - onClose: () => void
 *  - onUnseenCountChange: (count:number) => void - lets the header button show a live badge
 */
export default function MyWorkspacePanel({ isDark = true, navigate, projects = [], isOpen, onClose, onUnseenCountChange }) {
  const [uid, setUid] = useState(auth.currentUser?.uid || null);
  const [comments, setComments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [imMeta, setImMeta] = useState({}); // imId -> { title, projectId }
  const [tab, setTab] = useState('all'); // all | comments | tasks
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUid(u?.uid || null));
    return unsub;
  }, []);

  // ── LISTEN: comments assigned to me (only open/unresolved ones matter here) ──
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'im-comments'), where('assignee.uid', '==', uid));
    return onSnapshot(q, snap => {
      const deduped = dedupeComments(snap.docs);
      setComments(deduped.filter(c => c.status !== 'resolved' && !(c.dismissedBy || []).includes(uid)));
    });
  }, [uid]);

  // ── LISTEN: tasks assigned to me (skip ones already approved/done) ──
  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'im-tasks'), where('assignee.uid', '==', uid));
    return onSnapshot(q, snap => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setTasks(list.filter(t => t.status !== 'approved' && !(t.dismissedBy || []).includes(uid)));
    });
  }, [uid]);

  // ── RESOLVE imId -> {title, projectId} for context labels ──
  useEffect(() => {
    const ids = Array.from(new Set([...comments.map(c => c.imId), ...tasks.map(t => t.imId)].filter(Boolean)));
    const missing = ids.filter(id => !imMeta[id]);
    if (missing.length === 0) return;

    let cancelled = false;
    (async () => {
      const next = {};
      for (const group of chunk(missing, 10)) {
        try {
          const snap = await getDocs(query(collection(db, 'investment-memos'), where(documentId(), 'in', group)));
          snap.docs.forEach(d => { next[d.id] = { title: d.data().title || 'Untitled IM', projectId: d.data().projectId }; });
        } catch (e) { /* ignore - id chunk may not exist in this collection */ }
      }
      if (!cancelled) setImMeta(prev => ({ ...prev, ...next }));
    })();
    return () => { cancelled = true; };
  }, [comments, tasks, imMeta]);

  const projectName = useCallback((projectId) => {
    return projects.find(p => p.id === projectId)?.name || 'Unknown Project';
  }, [projects]);

  // ── MARK SEEN (readBy arrayUnion) ──
  const markCommentSeen = useCallback((c) => {
    if (!uid || (c.readBy || []).includes(uid)) return;
    updateDoc(doc(db, 'im-comments', c._docId), { readBy: arrayUnion(uid) }).catch(() => {});
  }, [uid]);

  const markTaskSeen = useCallback((t) => {
    if (!uid || (t.readBy || []).includes(uid)) return;
    updateDoc(doc(db, 'im-tasks', t.id), { readBy: arrayUnion(uid) }).catch(() => {});
  }, [uid]);

  // ── DISMISS (delete notification) — hides it from this feed only, doesn't touch the underlying comment/task ──
  const dismissComment = useCallback((c, e) => {
    if (e) e.stopPropagation();
    if (!uid) return;
    updateDoc(doc(db, 'im-comments', c._docId), { dismissedBy: arrayUnion(uid) }).catch(() => {});
  }, [uid]);

  const dismissTask = useCallback((t, e) => {
    if (e) e.stopPropagation();
    if (!uid) return;
    updateDoc(doc(db, 'im-tasks', t.id), { dismissedBy: arrayUnion(uid) }).catch(() => {});
  }, [uid]);

  const clearAll = useCallback(() => {
    if (!uid) return;
    comments.forEach(c => updateDoc(doc(db, 'im-comments', c._docId), { dismissedBy: arrayUnion(uid) }).catch(() => {}));
    tasks.forEach(t => updateDoc(doc(db, 'im-tasks', t.id), { dismissedBy: arrayUnion(uid) }).catch(() => {}));
  }, [uid, comments, tasks]);

  const openComment = useCallback((c) => {
    markCommentSeen(c);
    const meta = imMeta[c.imId];
    const pName = meta ? projectName(meta.projectId) : '';
    if (onClose) onClose();
    navigate(`/im?project=${meta?.projectId || ''}&im=${c.imId}&name=${encodeURIComponent(pName)}&comment=${c.id}`);
  }, [imMeta, markCommentSeen, navigate, projectName, onClose]);

  const openTask = useCallback((t) => {
    markTaskSeen(t);
    const meta = imMeta[t.imId];
    const pName = meta ? projectName(meta.projectId) : '';
    if (onClose) onClose();
    navigate(`/im?project=${t.projectId || meta?.projectId || ''}&im=${t.imId}&name=${encodeURIComponent(pName)}&task=${t.id}`);
  }, [imMeta, markTaskSeen, navigate, projectName, onClose]);

  // ── COMBINE + SORT (unseen first, overdue next, then most recent) ──
  const items = useMemo(() => {
    const c = comments.map(x => ({ kind: 'comment', ts: x.createdAt, data: x }));
    const t = tasks.map(x => ({ kind: 'task', ts: x.updatedAt || x.createdAt, data: x }));
    const combined = [...c, ...t].sort((a, b) => {
      const aUnseen = !(a.data.readBy || []).includes(uid);
      const bUnseen = !(b.data.readBy || []).includes(uid);
      if (aUnseen !== bUnseen) return aUnseen ? -1 : 1;
      const aOverdue = a.kind === 'task' && isOverdueTask(a.data);
      const bOverdue = b.kind === 'task' && isOverdueTask(b.data);
      if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
      return (b.ts?.toMillis?.() || 0) - (a.ts?.toMillis?.() || 0);
    });
    if (tab === 'comments') return combined.filter(i => i.kind === 'comment');
    if (tab === 'tasks') return combined.filter(i => i.kind === 'task');
    return combined;
  }, [comments, tasks, tab, uid]);

  useEffect(() => {
    if (!isOpen) setIsFullscreen(false);
  }, [isOpen]);

  // ── GROUP BY PROJECT (used only in fullscreen - makes a big board legible) ──
  const groupedByProject = useMemo(() => {
    const groups = new Map(); // projectId -> { name, items: [] }
    items.forEach(item => {
      const meta = imMeta[item.data.imId];
      const pid = meta?.projectId || '_unknown';
      const pname = meta ? projectName(meta.projectId) : 'Loading…';
      if (!groups.has(pid)) groups.set(pid, { name: pname, items: [] });
      groups.get(pid).items.push(item);
    });
    return Array.from(groups.values()).sort((a, b) => b.items.length - a.items.length);
  }, [items, imMeta, projectName]);

  const unseenCount = useMemo(() => {
    const cUnseen = comments.filter(c => !(c.readBy || []).includes(uid)).length;
    const tUnseen = tasks.filter(t => !(t.readBy || []).includes(uid)).length;
    return cUnseen + tUnseen;
  }, [comments, tasks, uid]);

  // Let the parent (Dashboard header button) show a live badge without the drawer being open
  useEffect(() => {
    if (onUnseenCountChange) onUnseenCountChange(unseenCount);
  }, [unseenCount, onUnseenCountChange]);

  const T = {
    text: isDark ? '#e2e8f0' : '#0f172a',
    textMuted: isDark ? '#64748b' : '#94a3b8',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    surface: isDark ? 'rgba(17,24,39,0.55)' : 'rgba(255,255,255,0.75)',
    drawerBg: isDark ? 'rgba(8,10,18,0.98)' : 'rgba(250,250,252,0.98)',
  };

  const renderCard = ({ kind, ts, data }) => {
    const isComment = kind === 'comment';
    const unseen = !(data.readBy || []).includes(uid);
    const overdue = !isComment && isOverdueTask(data);
    const meta = imMeta[data.imId];
    const loc = meta ? `${projectName(meta.projectId)} · ${meta.title}` : 'Loading location…';
    return (
      <div
        key={`${kind}-${isComment ? data._docId : data.id}`}
        className={`aw-card ${unseen ? 'aw-unseen' : 'aw-seen'} ${isComment ? 'aw-kind-comment' : 'aw-kind-task'}`}
        style={{ background: T.surface, borderColor: T.border, color: T.text }}
        onClick={() => (isComment ? openComment(data) : openTask(data))}
      >
        <div
          className="aw-dismiss-btn"
          title="Dismiss"
          onClick={(e) => (isComment ? dismissComment(data, e) : dismissTask(data, e))}
        >
          <X size={12} color="#fff" />
        </div>
        <div className="aw-card-top">
          <div className="aw-card-kind" style={{ color: isComment ? '#f59e0b' : '#3b82f6' }}>
            {unseen && <span className="aw-dot aw-unseen-dot" />}
            {isComment ? <MessageSquare size={12} /> : <ListChecks size={12} />}
            {isComment ? 'Comment' : `Task · ${data.status || 'pending'}`}
          </div>
          <span className="aw-time" style={{ fontSize: '0.7rem', color: T.textMuted }}>{relativeTime(ts)}</span>
        </div>
        <div className="aw-card-quote">
          {isComment
            ? (data.firstComment?.trim() || 'New comment thread (no reply yet)')
            : (data.title || 'Untitled Task')}
        </div>
        {isComment && data.quote && (
          <div className="aw-card-on-text">
            On: "{data.quote.length > 60 ? `${data.quote.slice(0, 60)}…` : data.quote}"
          </div>
        )}
        <div className="aw-card-meta">
          <span className="aw-card-loc">{loc}</span>
          {!isComment && data.dueDate && (
            <span className={overdue ? 'aw-overdue-tag' : ''}>{overdue ? `Overdue · ${data.dueDate}` : `Due ${data.dueDate}`}</span>
          )}
        </div>
      </div>
    );
  };

  if (!uid || !isOpen) return null;

  return (
    <>
      <style>{`
        .aw-dismiss-btn {
          position: absolute !important; top: 6px !important; right: 6px !important; width: 20px !important; height: 20px !important;
          border-radius: 50% !important; background: ${isDark ? '#334155' : '#e2e8f0'} !important;
          display: flex !important; align-items: center !important; justify-content: center !important;
          opacity: 0; transition: all 0.15s ease !important;
          box-shadow: 0 2px 5px rgba(0,0,0,0.2) !important; z-index: 5 !important;
        }
        .aw-card:hover .aw-dismiss-btn { opacity: 1 !important; }
        .aw-dismiss-btn:hover { background: #ef4444 !important; }
        .aw-time { transition: opacity 0.15s ease; }
        .aw-card:hover .aw-time { opacity: 0; }
        .aw-drawer.aw-drawer-fullscreen {
          width: 100vw !important; max-width: 100vw !important;
          border-left: none !important;
        }
        .aw-fs-group-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 8px 2px; margin: 22px 0 10px; font-size: 0.78rem; font-weight: 800;
          text-transform: uppercase; letter-spacing: 0.8px;
          border-bottom: 1px solid ${T.border};
        }
        .aw-fs-group-head:first-child { margin-top: 0; }
      `}</style>
      <div className="aw-backdrop" onClick={onClose} />
      <div className={`aw-drawer ${isFullscreen ? 'aw-drawer-fullscreen' : ''}`} style={{ background: T.drawerBg, borderLeftColor: T.border, color: T.text }}>
        <div className="aw-drawer-header" style={{ borderBottomColor: T.border }}>
          <div className="aw-panel-title" style={{ color: T.textMuted, margin: 0 }}>
            <Inbox size={16} /> My Workspace
            {items.length > 0 && <span style={{ fontWeight: 400, opacity: 0.7, textTransform: 'none', letterSpacing: 0 }}>&nbsp;· {items.length}</span>}
          </div>
          <div className="aw-drawer-header-actions">
            {items.length > 0 && (
              <button className="aw-clear-all-btn" style={{ borderColor: T.border, color: T.textMuted }} onClick={clearAll}>
                Clear All
              </button>
            )}
            <button
              className="im-icon-btn"
              onClick={() => setIsFullscreen(f => !f)}
              title={isFullscreen ? 'Exit fullscreen' : 'Expand fullscreen'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 6, borderRadius: 8, display: 'flex' }}
            >
              {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </button>
            <button className="aw-drawer-close" onClick={onClose} style={{ color: T.textMuted }}>
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="aw-drawer-body">
          <div className="aw-tabs" style={{ marginBottom: '16px' }}>
            {['all', 'comments', 'tasks'].map(k => (
              <button
                key={k}
                className={`aw-tab ${tab === k ? 'active' : ''}`}
                style={{ color: tab === k ? undefined : T.textMuted }}
                onClick={() => setTab(k)}
              >
                {k === 'all' ? 'All' : k === 'comments' ? 'Comments' : 'Tasks'}
              </button>
            ))}
          </div>

          {items.length === 0 ? (
            <div className="aw-empty" style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.textMuted }}>
              Nothing assigned to you right now — you're all caught up.
            </div>
          ) : isFullscreen ? (
            // ── FULLSCREEN: grouped by project, wider grid, more breathing room ──
            groupedByProject.map(group => (
              <div key={group.name}>
                <div className="aw-fs-group-head" style={{ color: T.textMuted }}>
                  <span>{group.name}</span>
                  <span>{group.items.length} item{group.items.length !== 1 ? 's' : ''}</span>
                </div>
                <div className="aw-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))' }}>
                  {group.items.map(renderCard)}
                </div>
              </div>
            ))
          ) : (
            <div className="aw-grid">
              {items.map(renderCard)}
            </div>
          )}
        </div>
      </div>
    </>
  );
}