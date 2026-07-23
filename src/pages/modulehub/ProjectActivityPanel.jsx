import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { MessageSquare, ListChecks, X, Inbox, Maximize2, Minimize2 } from 'lucide-react';
import { db, auth } from '../../firebase.js';
import { collection, query, where, onSnapshot, doc, updateDoc, arrayUnion } from 'firebase/firestore';

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
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
  return `${Math.floor(diff / 86400000)}d`;
}

function isOverdueTask(t) {
  if (!t.dueDate || t.status === 'approved') return false;
  const due = new Date(t.dueDate);
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due < today;
}

function dedupeComments(existingList, incomingDocs, groupImIds) {
  const byLogicalId = new Map();
  existingList.filter(c => !groupImIds.includes(c.imId)).forEach(c => byLogicalId.set(c.id, c));
  incomingDocs.forEach(d => {
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

export default function ProjectActivityPanel({ isDark = true, navigate, projectId, projectName, imList = [], isOpen, onClose, onUnseenCountChange }) {
  const [uid, setUid] = useState(auth.currentUser?.uid || null);
  const [comments, setComments] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [tab, setTab] = useState('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUid(u?.uid || null));
    return unsub;
  }, []);

  const imIds = useMemo(() => imList.map(im => im.id), [imList]);
  const imTitle = useCallback((imId) => imList.find(im => im.id === imId)?.title || 'Untitled IM', [imList]);

  useEffect(() => {
    if (!uid || imIds.length === 0) { setComments([]); setTasks([]); return; }
    const unsubs = [];
    for (const group of chunk(imIds, 10)) {
      unsubs.push(onSnapshot(
        query(collection(db, 'im-comments'), where('imId', 'in', group), where('assignee.uid', '==', uid)),
        snap => setComments(prev => dedupeComments(prev, snap.docs, group).filter(c => c.status !== 'resolved' && !(c.dismissedBy || []).includes(uid)))
      ));
      unsubs.push(onSnapshot(
        query(collection(db, 'im-tasks'), where('imId', 'in', group), where('assignee.uid', '==', uid)),
        snap => setTasks(prev => [
          ...prev.filter(t => !group.includes(t.imId)),
          ...snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.status !== 'approved' && !(t.dismissedBy || []).includes(uid)),
        ])
      ));
    }
    return () => unsubs.forEach(u => u());
  }, [uid, imIds]);

  const markCommentSeen = useCallback((c) => {
    if (!uid || (c.readBy || []).includes(uid)) return;
    updateDoc(doc(db, 'im-comments', c._docId), { readBy: arrayUnion(uid) }).catch(() => {});
  }, [uid]);

  const markTaskSeen = useCallback((t) => {
    if (!uid || (t.readBy || []).includes(uid)) return;
    updateDoc(doc(db, 'im-tasks', t.id), { readBy: arrayUnion(uid) }).catch(() => {});
  }, [uid]);

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
    if (onClose) onClose();
    setIsFullscreen(false);
    navigate(`/im?project=${projectId}&im=${c.imId}&name=${encodeURIComponent(projectName)}&comment=${c.id}`);
  }, [markCommentSeen, navigate, projectId, projectName, onClose]);

  const openTask = useCallback((t) => {
    markTaskSeen(t);
    if (onClose) onClose();
    setIsFullscreen(false);
    navigate(`/im?project=${projectId}&im=${t.imId}&name=${encodeURIComponent(projectName)}&task=${t.id}`);
  }, [markTaskSeen, navigate, projectId, projectName, onClose]);

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

  const unseenCount = useMemo(() => {
    const cUnseen = comments.filter(c => !(c.readBy || []).includes(uid)).length;
    const tUnseen = tasks.filter(t => !(t.readBy || []).includes(uid)).length;
    return cUnseen + tUnseen;
  }, [comments, tasks, uid]);

  useEffect(() => {
    if (onUnseenCountChange) onUnseenCountChange(unseenCount);
  }, [unseenCount, onUnseenCountChange]);

  const T = {
    text: isDark ? '#e2e8f0' : '#0f172a',
    textMuted: isDark ? '#94a3b8' : '#64748b',
    border: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
    surface: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)',
  };

  if (!uid || imIds.length === 0) return null;

  const renderCard = ({ kind, ts, data }, isFull = false) => {
    const isComment = kind === 'comment';
    const unseen = !(data.readBy || []).includes(uid);
    const overdue = !isComment && isOverdueTask(data);
    return (
      <div
        key={`${kind}-${isComment ? data._docId : data.id}`}
        className={`pap-card ${unseen ? 'unseen' : 'seen'} ${isComment ? 'comment' : 'task'}`}
        style={isFull ? { padding: '16px', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' } : undefined}
        onClick={() => (isComment ? openComment(data) : openTask(data))}
      >
        <div className="pap-dismiss" title="Dismiss" onClick={(e) => (isComment ? dismissComment(data, e) : dismissTask(data, e))}>
          <X size={isFull ? 12 : 10} color="#fff" />
        </div>
        <div className="pap-card-top" style={isFull ? { marginBottom: '6px' } : undefined}>
          <span className="pap-card-kind" style={{ color: isComment ? '#f59e0b' : '#3b82f6', fontSize: isFull ? '0.75rem' : undefined }}>
            {unseen && <span className="pap-dot" />}
            {isComment ? <MessageSquare size={isFull ? 14 : 11} /> : <ListChecks size={isFull ? 14 : 11} />}
            {isComment ? 'Comment' : (data.status || 'pending')}
          </span>
          <span className="pap-time" style={{ fontSize: isFull ? '0.75rem' : '0.62rem', color: T.textMuted }}>{relativeTime(ts)}</span>
        </div>
        <div className="pap-card-text" style={isFull ? { fontSize: '0.95rem', WebkitLineClamp: 3 } : undefined}>
          {isComment ? (data.firstComment?.trim() || 'New comment thread') : (data.title || 'Untitled task')}
        </div>
        <div className="pap-card-meta" style={isFull ? { marginTop: 'auto', paddingTop: '10px', fontSize: '0.75rem' } : undefined}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{imTitle(data.imId)}</span>
          {!isComment && data.dueDate && (
            <span className={overdue ? 'pap-overdue' : ''}>{overdue ? `Overdue` : `Due ${data.dueDate}`}</span>
          )}
        </div>
      </div>
    );
  };

  // ── PORTAL VIEW (Fullscreen) ──
  if (isFullscreen) {
    return ReactDOM.createPortal(
      <>
        <style>{`
          .pap-dismiss {
            position: absolute; top: 6px; right: 6px; width: 20px; height: 20px;
            border-radius: 50%; background: ${isDark ? '#334155' : '#e2e8f0'};
            display: flex; align-items: center; justify-content: center;
            opacity: 0; transition: all 0.15s ease; box-shadow: 0 2px 5px rgba(0,0,0,0.2); z-index: 5;
          }
          .pap-card:hover .pap-dismiss { opacity: 1; }
          .pap-dismiss:hover { background: #ef4444 !important; }
          .pap-time { transition: opacity 0.15s ease; }
          .pap-card:hover .pap-time { opacity: 0; }
          
          .pap-card { position: relative; cursor: pointer; border: 1px solid ${T.border}; border-left: 3px solid transparent; background: ${T.surface}; transition: transform 0.15s ease, opacity 0.2s ease; }
          .pap-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.15); }
          .pap-card.unseen { border-left-color: #f59e0b; }
          .pap-card.unseen.task { border-left-color: #3b82f6; }
          .pap-card.seen { opacity: 0.55; }
          .pap-card-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
          .pap-card-kind { display: flex; align-items: center; gap: 5px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
          .pap-dot { width: 6px; height: 6px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; }
          .pap-card-text { font-weight: 500; color: ${T.text}; line-height: 1.45; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; }
          .pap-card-meta { display: flex; justify-content: space-between; gap: 6px; color: ${T.textMuted}; }
          .pap-overdue { color: #ef4444 !important; font-weight: 700; }
          
          .pap-tab { border: none; background: transparent; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.3px; padding: 8px 16px; border-radius: 8px; cursor: pointer; color: ${T.textMuted}; text-transform: uppercase; transition: all 0.2s; }
          .pap-tab.active { background: ${isDark ? 'rgba(0,240,255,0.12)' : 'rgba(14,165,233,0.12)'}; color: ${isDark ? '#00f0ff' : '#0ea5e9'}; }
          .pap-clear { font-size: 0.8rem; font-weight: 700; background: transparent; border: 1px solid ${T.border}; color: ${T.textMuted}; padding: 8px 16px; border-radius: 8px; cursor: pointer; transition: all 0.2s; }
          .pap-clear:hover { border-color: rgba(239,68,68,0.4); color: #ef4444; }
        `}</style>
        <div style={{ position: 'fixed', inset: 0, zIndex: 999999, background: isDark ? 'rgba(6,9,16,0.98)' : 'rgba(241,245,249,0.98)', display: 'flex', flexDirection: 'column', animation: 'fadeIn 0.2s ease' }}>
          <div style={{ padding: '24px 40px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: T.surface }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.4rem', color: T.text, display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Inbox size={24} color={isDark ? '#00f0ff' : '#0ea5e9'} /> Assigned to Me
              </h2>
              <div style={{ fontSize: '0.85rem', color: T.textMuted, marginTop: '4px' }}>{projectName}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
             <div className="pap-tabs" style={{ marginBottom: '18px' }}>
                {['all', 'comments', 'tasks'].map(k => {
                  const count = k === 'all' ? items.length : k === 'comments' ? comments.length : tasks.length;
                  return (
                    <button key={k} className={`pap-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                      {k === 'all' ? 'All' : k === 'comments' ? 'Comments' : 'Tasks'} ({count})
                    </button>
                  );
                })}
              </div>
              {items.length > 0 && <button className="pap-clear" onClick={clearAll}>Clear all</button>}
              <button onClick={() => setIsFullscreen(false)} style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: '8px', display: 'flex', alignItems: 'center', transition: 'color 0.2s' }} onMouseEnter={e => e.currentTarget.style.color = T.text} onMouseLeave={e => e.currentTarget.style.color = T.textMuted}>
                <Minimize2 size={24} />
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '40px' }}>
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', fontSize: '1.1rem', marginTop: '10vh', color: T.textMuted, fontStyle: 'italic' }}>
                Nothing assigned to you in this project.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px', maxWidth: '1400px', margin: '0 auto' }}>
                {items.map(item => renderCard(item, true))}
              </div>
            )}
          </div>
        </div>
      </>,
      document.body
    );
  }

  // ── INLINE VIEW (Sidebar) ──
  return (
    <div className={`pap-shell ${isOpen ? 'pap-open' : ''}`}>
      <style>{`
        .pap-shell { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.25s cubic-bezier(0.23,1,0.32,1); }
        .pap-shell.pap-open { grid-template-rows: 1fr; }
        .pap-inner { overflow: hidden; min-height: 0; }
        .pap-body { max-height: 260px; overflow-y: auto; padding: 2px 14px 10px; display: flex; flex-direction: column; gap: 8px; }
        .pap-headrow { display: flex; align-items: center; justify-content: space-between; padding: 6px 14px 8px; gap: 8px; }
        .pap-tabs { display: flex; gap: 4px; }
        
        .pap-tab { border: none; background: transparent; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.3px; padding: 4px 9px; border-radius: 7px; cursor: pointer; color: ${T.textMuted}; text-transform: uppercase; }
        .pap-tab.active { background: ${isDark ? 'rgba(0,240,255,0.12)' : 'rgba(14,165,233,0.12)'}; color: ${isDark ? '#00f0ff' : '#0ea5e9'}; }
        
        .pap-clear { font-size: 0.65rem; font-weight: 700; background: transparent; border: 1px solid ${T.border}; color: ${T.textMuted}; padding: 3px 9px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
        .pap-clear:hover { border-color: rgba(239,68,68,0.4); color: #ef4444; }
        
        .pap-empty { text-align: center; font-size: 0.75rem; font-style: italic; color: ${T.textMuted}; padding: 18px 8px; }
        
        .pap-card { position: relative; padding: 8px 10px; border-radius: 9px; cursor: pointer; border: 1px solid ${T.border}; border-left: 3px solid transparent; background: ${T.surface}; transition: transform 0.15s ease, opacity 0.2s ease; }
        .pap-card:hover { transform: translateX(2px); }
        .pap-card.unseen { border-left-color: #f59e0b; }
        .pap-card.unseen.task { border-left-color: #3b82f6; }
        .pap-card.seen { opacity: 0.55; }
        
        .pap-card-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 3px; }
        .pap-card-kind { display: flex; align-items: center; gap: 4px; font-size: 0.62rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.4px; }
        .pap-dot { width: 5px; height: 5px; border-radius: 50%; background: #f59e0b; flex-shrink: 0; }
        .pap-card-text { font-size: 0.78rem; font-weight: 500; color: ${T.text}; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
        .pap-card-meta { display: flex; justify-content: space-between; gap: 6px; margin-top: 4px; font-size: 0.65rem; color: ${T.textMuted}; }
        .pap-overdue { color: #ef4444 !important; font-weight: 700; }
        
        .pap-body::-webkit-scrollbar { width: 3px; }
        .pap-body::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(0,240,255,0.25)' : 'rgba(0,0,0,0.15)'}; border-radius: 3px; }

        /* The transparent solid-color overlay fix */
        .pap-dismiss {
          position: absolute; top: 6px; right: 6px; width: 20px; height: 20px;
          border-radius: 50%; background: ${isDark ? '#334155' : '#e2e8f0'};
          display: flex; align-items: center; justify-content: center;
          opacity: 0; transition: all 0.15s ease; box-shadow: 0 2px 5px rgba(0,0,0,0.2); z-index: 5;
        }
        .pap-card:hover .pap-dismiss { opacity: 1; }
        .pap-dismiss:hover { background: #ef4444 !important; }
        .pap-time { transition: opacity 0.15s ease; }
        .pap-card:hover .pap-time { opacity: 0; }
      `}</style>

      <div className="pap-inner">
        <div className="pap-headrow">
          <div className="pap-tabs">
            {['all', 'comments', 'tasks'].map(k => {
              const count = k === 'all' ? items.length : k === 'comments' ? comments.length : tasks.length;
              return (
                <button key={k} className={`pap-tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>
                  {k === 'all' ? 'All' : k === 'comments' ? 'Comments' : 'Tasks'} ({count})
                </button>
              );
            })}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {items.length > 0 && <button className="pap-clear" onClick={clearAll}>Clear</button>}
            <button 
              className="pap-clear" 
              onClick={() => setIsFullscreen(true)} 
              title="Expand Fullscreen"
              style={{ padding: '3px 6px', display: 'flex', alignItems: 'center' }}
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>

        <div className="pap-body">
          {items.length === 0 ? (
            <div className="pap-empty">Nothing assigned to you in this project.</div>
          ) : items.map(item => renderCard(item, false))}
        </div>
      </div>
    </div>
  );
}