import React, { useState, useEffect, useRef, useCallback } from 'react';
import { db, auth } from '../../../firebase.js';
import {
  collection, addDoc, onSnapshot, query,
  where, updateDoc, doc, deleteDoc,
  serverTimestamp, arrayUnion, getDocs,
} from 'firebase/firestore';
import {
  MessageSquare, CheckCheck, Trash2,
  ChevronDown, ChevronUp, Reply,
  X, AlertCircle, Clock, CheckCircle2, User
} from 'lucide-react';

const COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4'];
const avatarColor = (uid) => COLORS[(uid?.charCodeAt(0) || 0) % COLORS.length];

function relativeTime(ts) {
  // Prevent NaN if Firestore hasn't returned the timestamp yet
  if (!ts || (!ts.toMillis && !ts.seconds && typeof ts !== 'string' && typeof ts !== 'number')) return 'just now';
  
  const ms = ts?.toMillis ? ts.toMillis() : new Date(ts).getTime();
  if (isNaN(ms)) return 'just now'; // Fallback for invalid dates
  
  const diff = Date.now() - ms;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default function CommentsSidebar({ 
  imId, isDark = true, isOpen, onClose, activeSection, 
  workspaceUsers = [], flatSections = [], customNames = {}, excludedSections = [] 
}) {
  const [comments, setComments] = useState([]);
  const [activeTab, setActiveTab] = useState('current'); // 'current' or 'all'
  const [drafts, setDrafts] = useState({}); // commentId -> text
  const [selectionPopup, setSelectionPopup] = useState(null);

  // ── INTELLIGENT TEXT SELECTION LISTENER ───────────────────────────────────
  useEffect(() => {
    const handleMouseUp = (e) => {
      setTimeout(() => {
        if (e.target.closest('#comments-sidebar') || e.target.closest('#selection-comment-popup')) return;

        let text = '';
        let node = null;
        let x = 0;
        let y = 0;
        let startOffset = null;
        let endOffset = null;

        const activeEl = document.activeElement;
        const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA');

        // Browser bypass for standard Inputs & Textareas (Smart Tables, Fill-in-the-blanks, etc.)
        if (isInput) {
          const start = activeEl.selectionStart;
          const end = activeEl.selectionEnd;
          if (start !== undefined && end !== undefined && start !== end) {
            text = activeEl.value.substring(start, end).trim();
            startOffset = start;
            endOffset = end;
            node = activeEl;
            const rect = activeEl.getBoundingClientRect();
            x = e.clientX; // Position near the mouse cursor for inputs
            y = rect.top - 10;
          }
        } else {
          // Standard DOM text selection (Rich Text, normal divs, etc)
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) {
            text = selection.toString().trim();
            if (text.length > 0) {
              const range = selection.getRangeAt(0);
              const rect = range.getBoundingClientRect();
              node = selection.anchorNode;
              if (node && node.nodeType === 3) node = node.parentNode;
              x = rect.left + (rect.width / 2);
              y = rect.top - 10;
            }
          }
        }

        if (text.length > 0 && node) {
          let blockLabel = 'Document Level';
          let blockPath = 'global';
          let blockId = null;

          let curr = node;
          while (curr && curr !== document.body) {
            if (curr.hasAttribute && curr.hasAttribute('data-block-label')) {
              blockLabel = curr.getAttribute('data-block-label');
              blockPath = curr.getAttribute('data-block-path');
              blockId = curr.getAttribute('data-block-id');
              break;
            }
            curr = curr.parentNode;
          }

          setSelectionPopup({ text, label: blockLabel, path: blockPath, blockId, x, y, startOffset, endOffset });
        } else {
          setSelectionPopup(null);
        }
      }, 50);
    };

    const handleMouseDown = (e) => {
      if (e.target && !e.target.closest('#selection-comment-popup') && !e.target.closest('#comments-sidebar')) {
        setSelectionPopup(null);
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  // ── FETCH COMMENTS ────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState(null);
  const [showResolved, setShowResolved] = useState(false);
  const [replyText, setReplyText] = useState({});
  const [newCommentText, setNewCommentText] = useState({});
  const [assigneeFilter, setAssigneeFilter] = useState('all');
  const [creatorFilter, setCreatorFilter] = useState('all'); // <-- NEW FILTER STATE
  const user = auth.currentUser;
  const activeRef = useRef(null);

  const T = {
    bg:          isDark ? '#0d1117'                    : '#ffffff',
    surface:     isDark ? '#161b22'                    : '#f9fafb',
    surface2:    isDark ? '#1e2431'                    : '#f3f4f6',
    border:      isDark ? 'rgba(255,255,255,0.08)'     : '#e5e7eb',
    text:        isDark ? '#e2e8f0'                    : '#111827',
    textMuted:   isDark ? '#64748b'                    : '#94a3b8',
    textSub:     isDark ? '#94a3b8'                    : '#6b7280',
    accent:      '#ef4444',
    amber:       '#f59e0b',
    green:       '#10b981',
    amberBg:     isDark ? 'rgba(245,158,11,0.12)'      : 'rgba(245,158,11,0.08)',
    greenBg:     isDark ? 'rgba(16,185,129,0.12)'      : 'rgba(16,185,129,0.08)',
    inputBg:     isDark ? '#0d1117'                    : '#ffffff',
    inputBorder: isDark ? 'rgba(255,255,255,0.12)'     : '#d1d5db',
  };

// ── FIRESTORE LISTENER ────────────────────────────────────────────────────
  useEffect(() => {
    if (!imId) return;
    const q = query(collection(db, 'im-comments'), where('imId', '==', imId));
    return onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => {
        const docData = d.data();
        return {
          ...docData, // Spread the raw data
          _docId: d.id, // Store the Firestore Document ID
          id: docData.id || d.id, // <--- THE FIX: Fallback to doc ID if custom 'id' is missing
        };
      });
      // Sort descending so newest comments pop up at the top
      data.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setComments(data);
    });
  }, [imId]);



  // ── BROADCAST ACTIVE COMMENT FOR SVG STRING ───────────────────────────────
  useEffect(() => {
    if (!isOpen) {
      window.dispatchEvent(new CustomEvent('im-active-comment-changed', { detail: null }));
      return;
    }
    
    const comment = comments.find(c => c.id === activeId);
    if (activeId && comment) {
      window.dispatchEvent(new CustomEvent('im-active-comment-changed', { 
        detail: { commentId: activeId, dataPath: comment.dataPath, quote: comment.quote } 
      }));
    } else {
      window.dispatchEvent(new CustomEvent('im-active-comment-changed', { detail: null }));
    }

    return () => window.dispatchEvent(new CustomEvent('im-active-comment-changed', { detail: null }));
  }, [activeId, comments, isOpen]);

  // ── EVENTS FROM SELECTION POPUP ───────────────────────────────────────────
  useEffect(() => {
    let isCreating = false; // Debounce lock to prevent ghost duplicates

    const onCreate = async (e) => {
      if (isCreating) return; // Prevent double-firing
      isCreating = true;
      setTimeout(() => { isCreating = false; }, 500); // Release lock after 500ms

      const { commentId, dataPath, quote, contextLabel, sectionId, offsetStart, offsetEnd, blockId } = e.detail;
      if (!imId || !user) return;
      await addDoc(collection(db, 'im-comments'), {
        id: commentId,
        imId,
        sectionId: sectionId || 'global',
        blockId: blockId || null,
        dataPath: dataPath || 'global',
        contextLabel: contextLabel || 'General',
        quote: quote ? quote.slice(0, 200) : 'General Comment',
        offsetStart: offsetStart ?? null, 
        offsetEnd: offsetEnd ?? null,     
        status: 'open',
        createdBy: { uid: user.uid, email: user.email },
        createdAt: serverTimestamp(),
        replies: [],
        firstComment: '',
      });
      setActiveId(commentId);
      setShowResolved(false);
    };

    const onOpen = (e) => {
      setActiveId(e.detail.commentId);
      setShowResolved(false);
    };

    const onNoSel = () => alert('Please highlight some text first before clicking Comment.');

    window.addEventListener('im-create-comment', onCreate);
    window.addEventListener('im-open-comment', onOpen);
    window.addEventListener('im-comment-no-selection', onNoSel);
    return () => {
      window.removeEventListener('im-create-comment', onCreate);
      window.removeEventListener('im-open-comment', onOpen);
      window.removeEventListener('im-comment-no-selection', onNoSel);
    };
  }, [imId, user]);

  // Auto-scroll to active comment
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeId]);

// ── HELPERS to find Firestore doc by custom `id` field ────────────────────
  const findDoc = useCallback(async (commentId) => {
    // 1. Try finding by the new explicit 'id' field
    const found = await getDocs(
      query(collection(db, 'im-comments'), where('id', '==', commentId))
    );
    if (!found.empty) return found.docs[0];

    // 2. BACKWARD COMPATIBILITY FALLBACK:
    // If not found, it is an old comment lacking the explicit 'id' field in the DB.
    // We look up the document ID (_docId) from our local React state instead.
    const localComment = comments.find(c => c.id === commentId);
    if (localComment && localComment._docId) {
      return {
        ref: doc(db, 'im-comments', localComment._docId),
        data: () => localComment // Mock data() for functions that read from the payload
      };
    }
    
    return null;
  }, [comments]); // <-- IMPORTANT: Ensure 'comments' is in this dependency array

  // ── ACTIONS ──────────────────────────────────────────────────────────────
  const handleFirstComment = useCallback(async (commentId) => {
    const text = newCommentText[commentId]?.trim();
    if (!text || !user) return;
    const d = await findDoc(commentId);
    if (!d) return;
    await updateDoc(d.ref, {
      firstComment: text,
      replies: arrayUnion({
        id: crypto.randomUUID().split('-')[0],
        text,
        author: { uid: user.uid, email: user.email },
        createdAt: new Date().toISOString(),
      }),
    });
    setNewCommentText(p => ({ ...p, [commentId]: '' }));
  }, [newCommentText, user, findDoc]);

  const handleReply = useCallback(async (commentId) => {
    const text = replyText[commentId]?.trim();
    if (!text || !user) return;
    const d = await findDoc(commentId);
    if (!d) return;
    await updateDoc(d.ref, {
      replies: arrayUnion({
        id: crypto.randomUUID().split('-')[0],
        text,
        author: { uid: user.uid, email: user.email },
        createdAt: new Date().toISOString(),
      }),
    });
    setReplyText(p => ({ ...p, [commentId]: '' }));
  }, [replyText, user, findDoc]);

  const handleResolve = useCallback(async (commentId) => {
    const d = await findDoc(commentId);
    if (!d) return;
    await updateDoc(d.ref, { status: 'resolved' });
    window.dispatchEvent(new CustomEvent('im-comment-status-update', {
      detail: { commentId, status: 'resolved' },
    }));
    setActiveId(null);
  }, [findDoc]);

  const handleReopen = useCallback(async (commentId) => {
    const d = await findDoc(commentId);
    if (!d) return;
    await updateDoc(d.ref, { status: 'open' });
    window.dispatchEvent(new CustomEvent('im-comment-status-update', {
      detail: { commentId, status: 'open' },
    }));
  }, [findDoc]);

  const handleAssign = useCallback(async (commentId, uid, email) => {
    const d = await findDoc(commentId);
    if (!d) return;
    await updateDoc(d.ref, { assignee: uid ? { uid, email } : null });
  }, [findDoc]);

  const handleDelete = useCallback(async (commentId) => {
    if (!window.confirm('Delete this comment thread?')) return;
    
    // Optimistically remove it from the UI immediately to hide ghosts
    setComments(prev => prev.filter(c => c.id !== commentId));
    setActiveId(null);

    const d = await findDoc(commentId);
    if (d) {
      try {
        await deleteDoc(d.ref);
      } catch (err) {
        console.error("Failed to delete comment from Firestore:", err);
      }
    }
    
    window.dispatchEvent(new CustomEvent('im-comment-status-update', {
      detail: { commentId, status: 'deleted' },
    }));
  }, [findDoc]);

  const handleDeleteReply = useCallback(async (commentId, replyId) => {
    const d = await findDoc(commentId);
    if (!d) return;
    const newReplies = (d.data().replies || []).filter(r => r.id !== replyId);
    await updateDoc(d.ref, { replies: newReplies });
  }, [findDoc]);

// Filter by Tab state, Assignee, and Creator
  const visibleComments = comments.filter(c => {
    // Find the true section key in case sectionId is saved as the ID instead of Key
    let cSectionKey = c.sectionId;
    const matchedSec = flatSections.find(s => s.id === c.sectionId || s.key === c.sectionId);
    if (matchedSec) cSectionKey = matchedSec.key;

    if (excludedSections.includes(c.sectionId) || (matchedSec && excludedSections.includes(matchedSec.id))) return false;
    if (c.blockId && excludedSections.includes(c.blockId)) return false;

    if (activeTab !== 'all' && cSectionKey !== activeSection) return false;
    if (assigneeFilter === 'me' && c.assignee?.uid !== user?.uid) return false;
    if (assigneeFilter !== 'all' && assigneeFilter !== 'me' && c.assignee?.uid !== assigneeFilter) return false;
    if (creatorFilter === 'me' && c.createdBy?.uid !== user?.uid) return false;
    if (creatorFilter !== 'all' && creatorFilter !== 'me' && c.createdBy?.uid !== creatorFilter) return false;
    return true;
  });

  const openComments     = visibleComments.filter(c => c.status === 'open');
  const resolvedComments = visibleComments.filter(c => c.status === 'resolved');

  // Keep the component alive if the popup is active, even if sidebar is closed
  if (!isOpen && !selectionPopup) return null;

  return (
    <>
      {/* ── INTELLIGENT SELECTION POPUP ────────────────────────────────────────── */}
      {selectionPopup && (
        <div
          id="selection-comment-popup"
          style={{
            position: 'fixed',
            left: selectionPopup.x,
            top: selectionPopup.y,
            transform: 'translate(-50%, -100%)',
            background: isDark ? '#1e293b' : '#ffffff',
            border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`,
            borderRadius: '8px',
            padding: '6px 12px',
            boxShadow: isDark ? '0 10px 25px rgba(0,0,0,0.5)' : '0 10px 25px rgba(0,0,0,0.1)',
            zIndex: 2147483647, /* MAX Z-INDEX */
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            transition: 'transform 0.15s ease',
            animation: 'slideUp 0.2s ease-out'
          }}
          onClick={() => {
            const commentId = `cmt_${crypto.randomUUID().split('-')[0]}`;
            window.dispatchEvent(new CustomEvent('im-open-comments-sidebar'));
            window.dispatchEvent(new CustomEvent('im-create-comment', {
              detail: {
                commentId,
                dataPath: selectionPopup.path,
                blockId: selectionPopup.blockId,
                quote: selectionPopup.text,
                contextLabel: selectionPopup.label,
                sectionId: activeSection,
                offsetStart: selectionPopup.startOffset,
                offsetEnd: selectionPopup.endOffset
              }
            }));
            setSelectionPopup(null);
            window.getSelection().removeAllRanges();
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translate(-50%, -100%) scale(1.05)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translate(-50%, -100%) scale(1)'}
        >
          <MessageSquare size={14} color="#0ea5e9" />
          <span style={{ fontSize: '12px', fontWeight: 600, color: isDark ? '#f8fafc' : '#0f172a' }}>
            Comment on "{selectionPopup.label}"
          </span>
        </div>
      )}

      {/* ── SIDEBAR ── */}
      {isOpen && (
        <div id="comments-sidebar" style={{
          width: 320, minWidth: 320, background: T.bg,
          borderLeft: `1px solid ${T.border}`,
          display: 'flex', flexDirection: 'column',
          height: '100%', overflow: 'hidden', flexShrink: 0,
          position: 'relative', zIndex: 100000, /* FLOAT OVER THE FULLSCREEN EDITOR */
          boxShadow: isDark ? '-8px 0 30px rgba(0,0,0,0.5)' : '-8px 0 30px rgba(0,0,0,0.1)',
        }}>
          {/* ── HEADER ── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <MessageSquare size={16} style={{ color: T.amber }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: T.text, letterSpacing: 0.3 }}>
              Comments
            </span>
            {openComments.length > 0 && (
              <span style={{ background: T.amberBg, color: T.amber, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: '1px 7px' }}>
                {openComments.length}
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 4, borderRadius: 5, display: 'flex' }}>
            <X size={15} />
          </button>
        </div>
        
        {/* ── TABS & FILTERS ── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', marginBottom: '8px' }}>
          <div style={{ display: 'flex', gap: '16px' }}>
            <button 
              onClick={() => setActiveTab('current')}
              style={{ 
                background: 'none', border: 'none', borderBottom: activeTab === 'current' ? `2px solid ${T.amber}` : '2px solid transparent',
                color: activeTab === 'current' ? T.text : T.textMuted, fontWeight: 700, fontSize: '0.75rem', padding: '8px 4px', cursor: 'pointer', transition: 'all 0.2s' 
              }}>
              Current Section
            </button>
            <button 
              onClick={() => setActiveTab('all')}
              style={{ 
                background: 'none', border: 'none', borderBottom: activeTab === 'all' ? `2px solid ${T.amber}` : '2px solid transparent',
                color: activeTab === 'all' ? T.text : T.textMuted, fontWeight: 700, fontSize: '0.75rem', padding: '8px 4px', cursor: 'pointer', transition: 'all 0.2s' 
              }}>
              All Sections
            </button>
          </div>
        </div>

        {/* ── ASSIGNEE & CREATOR FILTERS ── */}
        <div style={{ display: 'flex', gap: '8px', padding: '0 16px 12px' }}>
          <select 
            value={assigneeFilter} 
            onChange={(e) => setAssigneeFilter(e.target.value)}
            style={{ 
              flex: 1, background: T.surface2, color: T.textMuted, border: `1px solid ${T.border}`, 
              borderRadius: 4, padding: '4px 6px', fontSize: '0.7rem', outline: 'none', cursor: 'pointer', fontWeight: 600
            }}
          >
            <option value="all">All Owners</option>
            <option value="me">Assigned to Me</option>
            {workspaceUsers.filter(u => u.uid !== user?.uid).map(u => (
              <option key={u.uid} value={u.uid}>{u.email?.split('@')[0]}</option>
            ))}
          </select>

          <select 
            value={creatorFilter} 
            onChange={(e) => setCreatorFilter(e.target.value)}
            style={{ 
              flex: 1, background: T.surface2, color: T.textMuted, border: `1px solid ${T.border}`, 
              borderRadius: 4, padding: '4px 6px', fontSize: '0.7rem', outline: 'none', cursor: 'pointer', fontWeight: 600
            }}
          >
            <option value="all">All Creators</option>
            <option value="me">Created by Me</option>
            {workspaceUsers.filter(u => u.uid !== user?.uid).map(u => (
              <option key={u.uid} value={u.uid}>{u.email?.split('@')[0]}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── BODY ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>

        {openComments.length === 0 && resolvedComments.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '48px 20px', gap: 10,
          }}>
            <MessageSquare size={32} style={{ color: T.textMuted, opacity: 0.35 }} />
            <p style={{ fontSize: 13, color: T.textMuted, textAlign: 'center', margin: 0, lineHeight: 1.6 }}>
              No comments yet.<br />
              Highlight text in the editor<br />and click <strong>Comment</strong>.
            </p>
          </div>
        )}

        {/* Open comments */}
        {Array.from(new Map(openComments.map(item => [item.id, item])).values()).map(comment => (
          <CommentCard
            key={comment.id}
            comment={comment}
            isActive={activeId === comment.id}
            isResolved={false}
            T={T}
            user={user}
            replyText={replyText[comment.id] || ''}
            newCommentText={newCommentText[comment.id] || ''}
            onActivate={() => {
                  setActiveId(p => p === comment.id ? null : comment.id);
                  const payload = { dataPath: comment.dataPath, sectionId: comment.sectionId, commentId: comment.id, quote: comment.quote };
                  
                  // 1. Fire immediately to trigger the workspace tab/section switch
                  window.dispatchEvent(new CustomEvent('im-jump-to-comment', { detail: payload }));
                  
                  // 2. Fire again after 150ms so the newly mounted editor catches it and expands
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('im-jump-to-comment', { detail: payload }));
                  }, 150);
                }}
            onReply={() => handleReply(comment.id)}
            onReplyChange={v => setReplyText(p => ({ ...p, [comment.id]: v }))}
            onFirstComment={() => handleFirstComment(comment.id)}
            onFirstCommentChange={v => setNewCommentText(p => ({ ...p, [comment.id]: v }))}
            onResolve={() => handleResolve(comment.id)}
            onDelete={() => handleDelete(comment.id)}
            onDeleteReply={rid => handleDeleteReply(comment.id, rid)}
            onAssign={(uid, email) => handleAssign(comment.id, uid, email)}
            workspaceUsers={workspaceUsers}
            ref={activeId === comment.id ? activeRef : null}
          />
        ))}

        {/* Resolved section */}
        {resolvedComments.length > 0 && (
          <>
            <button
              onClick={() => setShowResolved(p => !p)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                width: '100%', background: 'none', border: 'none',
                borderTop: `1px solid ${T.border}`,
                padding: '10px 16px', cursor: 'pointer',
                color: T.textMuted, fontSize: 12, fontWeight: 700,
              }}
            >
              <CheckCircle2 size={13} style={{ color: T.green }} />
              Resolved ({resolvedComments.length})
              {showResolved
                ? <ChevronUp size={13} style={{ marginLeft: 'auto' }} />
                : <ChevronDown size={13} style={{ marginLeft: 'auto' }} />}
            </button>

            {showResolved && Array.from(new Map(resolvedComments.map(item => [item.id, item])).values()).map(comment => (
              <CommentCard
                key={comment.id}
                comment={comment}
                isActive={activeId === comment.id}
                isResolved={true}
                T={T}
                user={user}
                replyText={replyText[comment.id] || ''}
                newCommentText={newCommentText[comment.id] || ''}
                onActivate={() => {
                  setActiveId(p => p === comment.id ? null : comment.id);
                  const payload = { dataPath: comment.dataPath, sectionId: comment.sectionId, commentId: comment.id, quote: comment.quote };
                  
                  window.dispatchEvent(new CustomEvent('im-jump-to-comment', { detail: payload }));
                  
                  setTimeout(() => {
                    window.dispatchEvent(new CustomEvent('im-jump-to-comment', { detail: payload }));
                  }, 150);
                }}
                onReply={() => handleReply(comment.id)}
                onReplyChange={v => setReplyText(p => ({ ...p, [comment.id]: v }))}
                onFirstComment={() => handleFirstComment(comment.id)}
                onFirstCommentChange={v => setNewCommentText(p => ({ ...p, [comment.id]: v }))}
                onReopen={() => handleReopen(comment.id)}
                onDelete={() => handleDelete(comment.id)}
                onDeleteReply={rid => handleDeleteReply(comment.id, rid)}
                ref={activeId === comment.id ? activeRef : null}
              />
            ))}
          </>
        )}
        </div>
      </div>
      )}
    </>
  );
}

// ── COMMENT CARD ──────────────────────────────────────────────────────────────
const CommentCard = React.forwardRef(function CommentCard({
  comment, isActive, isResolved, T, user, workspaceUsers = [],
  replyText, newCommentText,
  onActivate, onReply, onReplyChange,
  onFirstComment, onFirstCommentChange,
  onResolve, onReopen, onDelete, onDeleteReply, onAssign,
}, ref) {
  const [showReplyBox, setShowReplyBox] = useState(false);
  const replyInputRef   = useRef(null);
  const firstInputRef   = useRef(null);

  useEffect(() => {
    if (isActive && !comment.replies?.length && firstInputRef.current) {
      firstInputRef.current.focus();
    }
  }, [isActive, comment.replies?.length]);

  useEffect(() => {
    if (showReplyBox && replyInputRef.current) replyInputRef.current.focus();
  }, [showReplyBox]);

  return (
    <div
      id={`comment-card-${comment.id}`}  // <-- ADDED SO SVG CAN FIND IT
      ref={ref}
      onClick={onActivate}
      style={{
        margin: '0 10px 8px',
        borderRadius: 8,
        border: isActive
          ? `1px solid ${isResolved ? 'rgba(16,185,129,0.4)' : 'rgba(245,158,11,0.4)'}`
          : `1px solid ${T.border}`,
        background: isActive
          ? (isResolved ? T.greenBg : T.amberBg)
          : T.surface,
        cursor: 'pointer',
        transition: 'border-color 0.2s, background 0.2s',
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div style={{ padding: '10px 12px 8px', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{
          width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
          background: avatarColor(comment.createdBy?.uid),
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 800, color: '#fff',
        }}>
          {(comment.createdBy?.email || '?').charAt(0).toUpperCase()}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {comment.createdBy?.email?.split('@')[0] || 'Unknown'}
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
              <Clock size={10} style={{ color: T.textMuted }} />
              <span style={{ fontSize: 10, color: T.textMuted }}>{relativeTime(comment.createdAt)}</span>
            </div>
          </div>

          {comment.contextLabel && comment.contextLabel !== 'General' && (
            <div style={{ fontSize: 9, fontWeight: 800, color: '#0ea5e9', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📍 {comment.contextLabel}
            </div>
          )}

          {comment.assignee && (
            <div style={{ 
              display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 4,
              background: 'rgba(59,130,246,0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.2)',
              fontSize: 9, fontWeight: 700, borderRadius: 12, padding: '2px 6px'
            }}>
              <User size={9} /> {comment.assignee.uid === user?.uid ? 'Assigned to Me' : `Assigned to: ${comment.assignee.email?.split('@')[0]}`}
            </div>
          )}

          {comment.quote && (
            <div style={{
              fontSize: 11, color: T.textSub, marginTop: 4,
              padding: '4px 8px',
              borderLeft: `2px solid ${isResolved ? T.green : T.amber}`,
              background: isResolved ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)',
              borderRadius: '0 4px 4px 0',
              fontStyle: 'italic',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              "{comment.quote}"
            </div>
          )}

          {isResolved && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 5,
              background: T.greenBg, color: T.green,
              fontSize: 10, fontWeight: 700, borderRadius: 20, padding: '2px 7px',
            }}>
              <CheckCheck size={9} /> Resolved
            </div>
          )}
        </div>
      </div>

      {/* Expanded thread — only when active */}
      {isActive && (
        <div onClick={e => e.stopPropagation()} style={{ padding: '0 12px 10px' }}>

          {/* First comment input */}
          {(!comment.replies || comment.replies.length === 0) && (
            <div style={{ marginBottom: 8 }}>
              <textarea
                ref={firstInputRef}
                value={newCommentText}
                onChange={e => onFirstCommentChange(e.target.value)}
                placeholder="Add a comment…"
                rows={2}
                style={taStyle(T)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onFirstComment(); }
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                <Btn bg={T.amber} onClick={onFirstComment} disabled={!newCommentText.trim()}>
                  Comment
                </Btn>
              </div>
            </div>
          )}

          {/* Existing replies */}
          {(comment.replies || []).map(reply => (
            <div key={reply.id} style={{ display: 'flex', gap: 7, marginBottom: 8, alignItems: 'flex-start' }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                background: avatarColor(reply.author?.uid),
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 800, color: '#fff',
              }}>
                {(reply.author?.email || '?').charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>
                    {reply.author?.email?.split('@')[0] || 'Unknown'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontSize: 10, color: T.textMuted }}>{relativeTime(reply.createdAt)}</span>
                    {reply.author?.uid === user?.uid && (
                      <button
                        onClick={() => onDeleteReply(reply.id)}
                        title="Delete reply"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textMuted, padding: 2, borderRadius: 4, display: 'flex' }}
                      >
                        <Trash2 size={10} />
                      </button>
                    )}
                  </div>
                </div>
                <p style={{ fontSize: 12, color: T.text, margin: 0, lineHeight: 1.5, wordBreak: 'break-word' }}>
                  {reply.text}
                </p>
              </div>
            </div>
          ))}

          {/* Reply input */}
          {comment.replies?.length > 0 && (
            showReplyBox ? (
              <div style={{ marginTop: 6 }}>
                <textarea
                  ref={replyInputRef}
                  value={replyText}
                  onChange={e => onReplyChange(e.target.value)}
                  placeholder="Reply…"
                  rows={2}
                  style={taStyle(T)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onReply(); setShowReplyBox(false); }
                    if (e.key === 'Escape') setShowReplyBox(false);
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 4 }}>
                  <Btn secondary T={T} onClick={() => setShowReplyBox(false)}>Cancel</Btn>
                  <Btn bg={T.amber} onClick={() => { onReply(); setShowReplyBox(false); }} disabled={!replyText.trim()}>
                    Reply
                  </Btn>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowReplyBox(true)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: T.textMuted, fontSize: 11, fontWeight: 600, padding: '4px 0',
                }}
              >
                <Reply size={12} /> Reply
              </button>
            )
          )}

          {/* Resolve / Reopen / Delete / Assign */}
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, alignItems: 'center',
            borderTop: `1px solid ${T.border}`, paddingTop: 8,
          }}>
            {!isResolved
              ? <Btn icon={<CheckCheck size={11} />} bg={T.green} onClick={onResolve}>Resolve</Btn>
              : <Btn icon={<AlertCircle size={11} />} secondary T={T} onClick={onReopen}>Re-open</Btn>
            }
            <Btn icon={<Trash2 size={11} />} danger onClick={onDelete}>Delete</Btn>

            <div style={{ flex: 1 }} />
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={12} style={{ color: T.textMuted }} />
              <select
                value={comment.assignee?.uid || ''}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) { onAssign(null, null); return; }
                  const selected = workspaceUsers.find(u => u.uid === val);
                  if (selected) onAssign(selected.uid, selected.email);
                }}
                style={{
                  background: T.inputBg, color: T.text, border: `1px solid ${T.inputBorder}`,
                  borderRadius: 4, padding: '4px 6px', fontSize: '0.7rem', outline: 'none', cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                <option value="">Unassigned</option>
                <option value={user?.uid}>Assign to Me</option>
                {workspaceUsers.filter(u => u.uid !== user?.uid).map(u => (
                  <option key={u.uid} value={u.uid}>{u.email?.split('@')[0]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ── STYLE HELPERS ─────────────────────────────────────────────────────────────
function taStyle(T) {
  return {
    width: '100%', resize: 'vertical', minHeight: 56,
    background: T.inputBg, border: `1px solid ${T.inputBorder}`,
    borderRadius: 6, padding: '7px 10px',
    color: T.text, fontSize: 12, lineHeight: 1.5,
    fontFamily: 'inherit', outline: 'none',
    transition: 'border-color 0.15s',
  };
}

function Btn({ children, icon, bg, danger, secondary, T, onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        background: danger ? 'rgba(239,68,68,0.12)' : secondary ? 'transparent' : (bg || '#ef4444'),
        color:      danger ? '#ef4444'               : secondary ? (T?.textMuted || '#94a3b8') : '#fff',
        border:     secondary ? `1px solid ${T?.border || 'rgba(255,255,255,0.08)'}` : 'none',
        borderRadius: 5, padding: '4px 9px', fontSize: 11,
        fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'opacity 0.15s, background 0.15s',
        fontFamily: 'inherit',
      }}
    >
      {icon}{children}
    </button>
  );
}
