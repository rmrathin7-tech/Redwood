import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Search, LayoutDashboard, Users, Sun, Moon, LogOut,
  Plus, FolderOpen, Archive, Trash2, RefreshCw, AlertTriangle,
  Copy, ExternalLink, BarChart2, Activity, X
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { auth, db } from '../../firebase.js';
import {
  collection, query, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, setDoc, orderBy
} from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

// <-- 1. IMPORT THE NEW GLOBAL BOARD -->
import GlobalBoard from './GlobalBoard.jsx'; 


// ── TYPEWRITER PLACEHOLDER ────────────────────────────────────────────────────
const PLACEHOLDER_PHRASES = [
  'Q3 India Growth Fund...',
  'Series B SaaS Acquisition...',
  'Infrastructure Debt Note...',
  'Real Estate Opportunity...',
  'Climate Tech Venture...',
  'Healthcare Roll-up...',
];


// ── HIGHLIGHT MATCH ───────────────────────────────────────────────────────────
function HighlightText({ text, query }) {
  if (!query.trim()) return <span>{text}</span>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, idx)}
      <mark style={{ background: 'rgba(185,28,28,0.35)', color: 'inherit', borderRadius: '3px', padding: '0 2px' }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </span>
  );
}


// ── 3D TILT CARD WITH GLASS GLARE ────────────────────────────────────────────
const TiltCard = React.memo(function TiltCard({ children, style, className, onClick, onContextMenu, draggable, onDragStart, onDragOver, onDrop, isDragging }) {
  const cardRef = useRef(null);
  const glowRef = useRef(null);
  const glareRef = useRef(null);
  const frameRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -7;
    const rotY = ((x - cx) / cx) * 7;
    
    // Calculate glare position (opposite of mouse)
    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      card.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-5px) scale(1.015)`;
      
      if (glowRef.current) {
        glowRef.current.style.background = `radial-gradient(160px circle at ${x}px ${y}px, rgba(255,255,255,0.1), transparent 70%)`;
        glowRef.current.style.opacity = '1';
      }
      
      if (glareRef.current) {
        glareRef.current.style.background = `radial-gradient(circle at ${glareX}% ${glareY}%, rgba(255,255,255,0.08) 0%, transparent 50%)`;
        glareRef.current.style.opacity = '1';
      }
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (cardRef.current) cardRef.current.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
    if (glowRef.current) glowRef.current.style.opacity = '0';
    if (glareRef.current) glareRef.current.style.opacity = '0';
  }, []);

  return (
    <div
      ref={cardRef}
      className={`tilt-card ${className || ''}`}
      style={{
        ...style,
        transformStyle: 'preserve-3d',
        willChange: 'transform',
        position: 'relative',
        overflow: 'hidden',
        opacity: isDragging ? 0.4 : 1,
        cursor: 'pointer',
        transition: isDragging ? 'opacity 0.2s' : 'transform 0.4s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s ease, border-color 0.4s ease, opacity 0.2s ease',
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Interactive Hover Glow */}
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.4s ease', zIndex: 0 }} />
      {/* High-end Glass Glare */}
      <div ref={glareRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.4s ease', zIndex: 2, mixBlendMode: 'overlay' }} />
      
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {children}
      </div>
    </div>
  );
});


// ── DELETE CONFIRM MODAL ──────────────────────────────────────────────────────
const DeleteModal = React.memo(function DeleteModal({ projectName, onConfirm, onCancel, isDark }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease' }}>
      <div style={{ background: isDark ? '#111827' : '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: '16px', padding: '28px', width: '360px', boxShadow: '0 24px 60px rgba(0,0,0,0.4)', animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} color="#ef4444" />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: isDark ? '#f1f5f9' : '#0f172a' }}>Delete Memo</h3>
            <p style={{ margin: 0, fontSize: '0.8rem', color: isDark ? '#64748b' : '#94a3b8' }}>This cannot be undone</p>
          </div>
        </div>
        <p style={{ fontSize: '0.88rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '20px', lineHeight: 1.5 }}>
          Are you sure you want to permanently delete <strong style={{ color: isDark ? '#f1f5f9' : '#0f172a' }}>"{projectName}"</strong>? All data will be lost.
        </p>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onCancel} className="modal-cancel-btn" style={{ flex: 1, padding: '10px', borderRadius: '10px', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontWeight: '600', fontSize: '0.88rem', fontFamily: 'inherit', transition: 'all 0.2s' }}>Cancel</button>
          <button onClick={onConfirm} className="modal-delete-btn" style={{ flex: 1, padding: '10px', borderRadius: '10px', borderWidth: '0', borderStyle: 'solid', borderColor: 'transparent', background: '#ef4444', color: '#fff', cursor: 'pointer', fontWeight: '700', fontSize: '0.88rem', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(239,68,68,0.3)', transition: 'all 0.2s' }}>Delete Forever</button>
        </div>
      </div>
    </div>
  );
});


// ── CONTEXT MENU ──────────────────────────────────────────────────────────────
const ContextMenu = React.memo(function ContextMenu({ x, y, project, onOpen, onArchive, onDelete, onCopy, onClose, isDark }) {
  const ref = useRef(null);
  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    setTimeout(() => window.addEventListener('mousedown', handler), 0);
    return () => window.removeEventListener('mousedown', handler);
  }, [onClose]);

  const items = [
    { icon: <ExternalLink size={13} />, label: 'Open Memo', action: onOpen },
    { icon: <Copy size={13} />, label: 'Copy Link', action: onCopy },
    { divider: true },
    { icon: <Archive size={13} />, label: 'Archive', action: onArchive, color: '#f59e0b' },
    { icon: <Trash2 size={13} />, label: 'Delete', action: onDelete, color: '#ef4444' },
  ];

  return (
    <div ref={ref} style={{ position: 'fixed', left: x, top: y, zIndex: 500, background: isDark ? 'rgba(10,12,22,0.98)' : '#fff', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: '10px', padding: '5px', minWidth: '170px', boxShadow: isDark ? '0 16px 40px rgba(0,0,0,0.7)' : '0 16px 40px rgba(0,0,0,0.15)', backdropFilter: 'blur(20px)', animation: 'slideUp 0.2s cubic-bezier(0.34,1.56,0.64,1)' }}>
      {items.map((item, i) => item.divider ? (
        <div key={i} style={{ height: '1px', background: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)', margin: '4px 0' }} />
      ) : (
        <button key={i} onClick={() => { item.action(); onClose(); }} className="ctx-item"
          style={{ display: 'flex', alignItems: 'center', gap: '9px', width: '100%', padding: '8px 10px', borderRadius: '7px', background: 'transparent', borderWidth: '0', borderStyle: 'solid', borderColor: 'transparent', color: item.color || (isDark ? '#cbd5e1' : '#374151'), cursor: 'pointer', fontSize: '0.82rem', fontWeight: '500', fontFamily: 'inherit', transition: 'all 0.15s', textAlign: 'left' }}>
          {item.icon} {item.label}
        </button>
      ))}
    </div>
  );
});


// ── ARCHIVED CARD ────────────────────────────────────────────────────────────
const ArchivedCard = React.memo(function ArchivedCard({ project, onRestore, onDelete, isDark, searchQuery }) {
  return (
    <div className="archive-card" style={{
      display: 'flex', flexDirection: 'column', gap: '8px',
      padding: '12px 14px', borderRadius: '10px',
      borderWidth: '1px', borderStyle: 'solid',
      borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)',
      background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
      transition: 'background 0.2s, border-color 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <span style={{ fontSize: '0.85rem', color: isDark ? '#6b7280' : '#64748b', fontWeight: '500', lineHeight: 1.3, wordBreak: 'break-word', flex: 1 }}>
          <HighlightText text={project.name} query={searchQuery} />
        </span>
        <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
          <button className="action-icon restore-btn" onClick={() => onRestore(project.id, project.name)} style={{ background: 'transparent', borderWidth: '0', borderStyle: 'solid', borderColor: 'transparent', color: '#22c55e', cursor: 'pointer' }} title="Restore"><RefreshCw size={13} /></button>
          <button className="action-icon delete-btn" onClick={() => onDelete(project)} style={{ background: 'transparent', borderWidth: '0', borderStyle: 'solid', borderColor: 'transparent', color: '#ef4444', cursor: 'pointer' }} title="Delete permanently"><Trash2 size={13} /></button>
        </div>
      </div>
    </div>
  );
});


// ── STATS BAR ─────────────────────────────────────────────────────────────────
function StatsBar({ total, active, archived, isDark }) {
  const stats = [
    { label: 'Total', value: total, color: isDark ? '#94a3b8' : '#64748b', dot: isDark ? 'rgba(148,163,184,0.5)' : 'rgba(100,116,139,0.4)' },
    { label: 'Active', value: active, color: '#22c55e', dot: 'rgba(34,197,94,0.5)' },
    { label: 'Archived', value: archived, color: isDark ? '#f59e0b' : '#d97706', dot: 'rgba(245,158,11,0.45)' },
  ];
  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
      {stats.map(s => (
        <div key={s.label} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '7px 14px', borderRadius: '20px',
          borderWidth: '1px', borderStyle: 'solid',
          borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.08)',
          background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.7)',
          backdropFilter: 'blur(8px)',
          transition: 'all 0.3s',
        }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: s.dot, boxShadow: `0 0 5px ${s.dot}` }} />
          <span style={{ fontSize: '0.75rem', fontWeight: '600', color: isDark ? '#475569' : '#94a3b8', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{s.label}</span>
          <span style={{ fontSize: '0.9rem', fontWeight: '800', color: s.color, minWidth: '16px', textAlign: 'center' }}>{s.value}</span>
        </div>
      ))}
    </div>
  );
}


// ── MAIN DASHBOARD ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [theme, setTheme] = useState('dark');
  const [searchQuery, setSearchQuery] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [user, setUser] = useState(null);
  const [projects, setProjects] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isUsersPanelOpen, setIsUsersPanelOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState(null);
  const [creating, setCreating] = useState(false);
  const [ctxMenu, setCtxMenu] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [cardOrder, setCardOrder] = useState([]);
  const [placeholder, setPlaceholder] = useState('Name your new memo...');
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  
  // <-- 2. ADD STATE FOR GLOBAL BOARD & AUDIT LOGS -->
  const [isGlobalBoardOpen, setIsGlobalBoardOpen] = useState(false);
  const [isAuditPanelOpen, setIsAuditPanelOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);

  // Canvas tracking
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const trailRef = useRef([]);
  const ripplesRef = useRef([]); 
  
  const isDark = theme === 'dark';

  const showToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); document.querySelector('.create-input')?.focus(); }
      if (e.key === 'Escape') { setDeleteTarget(null); setCtxMenu(null); setIsUsersPanelOpen(false); setIsGlobalBoardOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Smooth Typewriter
  useEffect(() => {
    let phraseIdx = 0, displayed = '', isDeleting = false;
    let tid;
    function tick() {
      const phrase = PLACEHOLDER_PHRASES[phraseIdx];
      if (!isDeleting && displayed === phrase) {
        tid = setTimeout(() => { isDeleting = true; tick(); }, 2500); // Longer pause
        return;
      }
      if (isDeleting && displayed === '') {
        isDeleting = false;
        phraseIdx = (phraseIdx + 1) % PLACEHOLDER_PHRASES.length;
        tid = setTimeout(tick, 500);
        return;
      }
      displayed = isDeleting ? displayed.slice(0, -1) : phrase.slice(0, displayed.length + 1);
      setPlaceholder(displayed || '\u200b');
      tid = setTimeout(tick, isDeleting ? 30 : 60);
    }
    tid = setTimeout(tick, 1500);
    return () => clearTimeout(tid);
  }, []);

  // Auth & Workspace Presence
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { navigate('/login'); return; }
      setUser(u);
      const ref = doc(db, 'workspace-users', u.uid);
      await setDoc(ref, { userId: u.uid, email: u.email, isOnline: true, currentPage: 'dashboard', currentIM: null, lastActive: serverTimestamp() }, { merge: true });
      const hb = setInterval(() => updateDoc(ref, { lastActive: serverTimestamp() }), 30000);
      const bye = () => updateDoc(ref, { isOnline: false, lastActive: serverTimestamp() });
      window.addEventListener('beforeunload', bye);
      return () => { clearInterval(hb); window.removeEventListener('beforeunload', bye); };
    });
    return unsub;
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'workspace-users'), snap => {
      const now = Date.now();
      setOnlineUsers(snap.docs.map(d => d.data()).filter(d => d.isOnline && (now - (d.lastActive?.toMillis?.() || 0) < 120000)));
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'workspace-audit-logs'), orderBy('timestamp', 'desc'));
    return onSnapshot(q, snap => {
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  const logAction = async (action, entityName) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'workspace-audit-logs'), {
        action, 
        entityType: 'PROJECT', 
        entityName,
        userEmail: user.email, 
        userId: user.uid, 
        timestamp: serverTimestamp()
      });
    } catch (e) { console.error('Audit log failed', e); }
  };

  useEffect(() => {
    if (!user) return;
    return onSnapshot(query(collection(db, 'projects')), snap => {
      const loaded = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setProjects(loaded);
      setCardOrder(prev => {
        const ids = loaded.filter(p => !p.archived).map(p => p.id);
        const existing = prev.filter(id => ids.includes(id));
        const newIds = ids.filter(id => !prev.includes(id));
        return [...existing, ...newIds];
      });
    });
  }, [user]);

  const createProject = useCallback(async () => {
    if (!newProjectName.trim() || !user || creating) return;
    setCreating(true);
    const projName = newProjectName.trim();
    try {
      await addDoc(collection(db, 'projects'), { name: projName, createdAt: serverTimestamp(), archived: false, createdBy: user.email });
      await logAction('CREATED', projName);
      setNewProjectName('');
      showToast(`"${projName}" created`);
    } catch { showToast('Failed to create memo', 'error'); }
    finally { setCreating(false); }
  }, [newProjectName, user, creating, showToast]);

  const archiveProject = useCallback(async (id, name) => {
    await updateDoc(doc(db, 'projects', id), { archived: true });
    await logAction('ARCHIVED', name);
    showToast(`"${name}" archived`);
  }, [showToast, user]);

  const restoreProject = useCallback(async (id, name) => {
    await updateDoc(doc(db, 'projects', id), { archived: false });
    await logAction('RESTORED', name);
    showToast(`"${name}" restored`);
  }, [showToast, user]);

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    const targetName = deleteTarget.name;
    await deleteDoc(doc(db, 'projects', deleteTarget.id));
    await logAction('PURGED', targetName);
    showToast(`"${targetName}" deleted`, 'error');
    setDeleteTarget(null);
  }, [deleteTarget, showToast, user]);

  const handleLogout = useCallback(async () => { await signOut(auth); navigate('/login'); }, [navigate]);

  const formatTime = useCallback((ts) => {
    if (!ts?.toDate) return 'Just now';
    const d = ts.toDate();
    const diff = Date.now() - d.getTime();
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }, []);

  const handleDragStart = useCallback((id) => setDragIdx(id), []);
  const handleDragOver = useCallback((e, id) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === id) return;
    setCardOrder(prev => {
      const from = prev.indexOf(dragIdx);
      const to = prev.indexOf(id);
      if (from === -1 || to === -1) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragIdx);
      return next;
    });
  }, [dragIdx]);
  const handleDrop = useCallback(() => setDragIdx(null), []);

  // ── INTERACTIVE CANVAS ENGINE ─────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let raf;
    let time = 0;

    const PARTICLE_COUNT = window.innerWidth > 1024 ? 200 : 100;
    const CONNECT_DIST_SQ = 20000;
    const MOUSE_ATTRACT_DIST = 160;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize);
    resize();

    // Spawn Shockwave Ripple on Click
    const handleCanvasClick = (e) => {
      ripplesRef.current.push({
        x: e.clientX,
        y: e.clientY,
        radius: 0,
        maxRadius: 300,
        alpha: 0.8,
        speed: 12
      });
    };
    window.addEventListener('click', handleCanvasClick);

    const onMouseMove = (e) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      trailRef.current.push({ x: e.clientX, y: e.clientY, age: 0 });
      if (trailRef.current.length > 20) trailRef.current.shift();
    };
    window.addEventListener('mousemove', onMouseMove);

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() * 1.5 + 0.5,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.5 + 0.2,
      twinkle: Math.random() * Math.PI * 2,
      phase: Math.random() * Math.PI * 2,
      freq: 0.2 + Math.random() * 0.3, // Slower, smoother twinkle
    }));

    let g1, g2;
    const buildGradients = () => {
      g1 = ctx.createRadialGradient(canvas.width * 0.15, canvas.height * 0.1, 0, canvas.width * 0.15, canvas.height * 0.1, canvas.width * 0.6);
      g1.addColorStop(0, isDark ? 'rgba(60,100,220,0.1)' : 'rgba(60,100,220,0.06)');
      g1.addColorStop(1, 'transparent');
      g2 = ctx.createRadialGradient(canvas.width * 0.85, canvas.height * 0.15, 0, canvas.width * 0.85, canvas.height * 0.15, canvas.width * 0.6);
      g2.addColorStop(0, isDark ? 'rgba(100,60,200,0.1)' : 'rgba(100,60,200,0.05)');
      g2.addColorStop(1, 'transparent');
    };
    buildGradients();
    window.addEventListener('resize', buildGradients);

    let frameCount = 0;

    const animate = () => {
      time += 0.005; // Slower time step
      frameCount++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = g1; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = g2; ctx.fillRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      // 1. Process Ripples (Shockwaves)
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        r.radius += r.speed;
        r.alpha -= 0.02;
        r.speed *= 0.96; // decelerate ripple

        if (r.alpha <= 0) {
          ripplesRef.current.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = isDark ? `rgba(185, 28, 28, ${r.alpha * 0.4})` : `rgba(30, 60, 200, ${r.alpha * 0.3})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Shockwave physics: Push particles outward
        particles.forEach(p => {
          const dx = p.x - r.x;
          const dy = p.y - r.y;
          const dist = Math.hypot(dx, dy);
          // If particle is exactly at the ripple edge
          if (Math.abs(dist - r.radius) < 15) {
            const force = r.alpha * 1.5;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        });
      }

      // 2. Process Particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const dx = p.x - mx, dy = p.y - my;
        const distSq = dx * dx + dy * dy;
        
        // Mouse Attract
        if (distSq < MOUSE_ATTRACT_DIST * MOUSE_ATTRACT_DIST) {
          const dist = Math.sqrt(distSq);
          const force = (MOUSE_ATTRACT_DIST - dist) / MOUSE_ATTRACT_DIST;
          p.vx += (dx / dist) * force * 0.4; // Softer pull
          p.vy += (dy / dist) * force * 0.4;
        }
        
        // Friction and bounds
        p.vx *= 0.98; p.vy *= 0.98;
        p.x += p.vx; p.y += p.vy;
        p.twinkle += 0.01; // Slower twinkle
        
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
      }

      // 3. Draw Connections
      if (frameCount % 2 === 0) {
        for (let a = 0; a < particles.length; a++) {
          for (let b = a + 1; b < particles.length; b++) {
            const dx = particles[a].x - particles[b].x;
            const dy = particles[a].y - particles[b].y;
            const distSq = dx * dx + dy * dy;
            if (distSq < CONNECT_DIST_SQ) {
              const dma = Math.hypot(particles[a].x - mx, particles[a].y - my);
              const dmb = Math.hypot(particles[b].x - mx, particles[b].y - my);
              const near = dma < MOUSE_ATTRACT_DIST || dmb < MOUSE_ATTRACT_DIST;
              const wave = 0.5 + 0.5 * Math.sin(time * particles[a].freq + particles[a].phase);

              const op = near
                ? (1 - distSq / CONNECT_DIST_SQ) * 0.35
                : isDark
                  ? (1 - distSq / CONNECT_DIST_SQ) * 0.15 * (0.5 + 0.5 * wave)
                  : (1 - distSq / CONNECT_DIST_SQ) * 0.25 * (0.6 + 0.4 * wave);

              ctx.strokeStyle = near
                ? `rgba(185,28,28,${op})`
                : isDark
                  ? `rgba(180,215,255,${op})`
                  : `rgba(10,20,80,${op})`; 
              ctx.lineWidth = near ? 1.0 : (isDark ? 0.7 : 0.9);

              ctx.beginPath();
              ctx.moveTo(particles[a].x, particles[a].y);
              ctx.lineTo(particles[b].x, particles[b].y);
              ctx.stroke();
            }
          }
        }
      }

      // 4. Draw Particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const a = p.alpha * (0.7 + Math.sin(p.twinkle) * 0.3); // Smoother, subtler twinkle
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? `rgba(210,230,255,${a})` : `rgba(20,30,70,${a})`;
        ctx.fill();
      }

      // 5. Draw Mouse Trail
      if (trailRef.current.length > 0) {
        for (let i = 0; i < trailRef.current.length; i++) {
          const pt = trailRef.current[i];
          pt.age++;
          const progress = i / trailRef.current.length;
          const alpha = progress * (isDark ? 0.25 : 0.15) * (1 - pt.age / 40);
          if (alpha > 0) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, (1 - progress) * 2.5 + 0.5, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(185,28,28,${alpha})`;
            ctx.fill();
          }
        }
        trailRef.current = trailRef.current.filter(pt => pt.age < 40);
      }

      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', buildGradients);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('click', handleCanvasClick);
      cancelAnimationFrame(raf);
    };
  }, [theme]);

  // ── MEMOIZED FILTERED LISTS ───────────────────────────────────────────────
  const allActive = useMemo(() =>
    projects.filter(p => !p.archived && p.name?.toLowerCase().includes(searchQuery.toLowerCase())),
    [projects, searchQuery]
  );

  const active = useMemo(() => {
    const ordered = cardOrder
      .map(id => allActive.find(p => p.id === id))
      .filter(Boolean);
    const extras = allActive.filter(p => !cardOrder.includes(p.id));
    return [...ordered, ...extras];
  }, [allActive, cardOrder]);

  const archived = useMemo(() =>
    projects.filter(p => p.archived && p.name?.toLowerCase().includes(searchQuery.toLowerCase())),
    [projects, searchQuery]
  );

  const totalCount = projects.length;
  const activeCount = projects.filter(p => !p.archived).length;
  const archivedCount = projects.filter(p => p.archived).length;

  const cardBase = useMemo(() => ({
    background: isDark ? 'rgba(17,24,39,0.55)' : 'rgba(255,255,255,0.65)',
    borderWidth: '1px', borderStyle: 'solid',
    borderColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '16px',
    padding: '20px',
    boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 30px rgba(0,0,0,0.06)',
    minHeight: '140px',
  }), [isDark]);

  const handleRootClick = useCallback(() => { setCtxMenu(null); setIsUsersPanelOpen(false); }, []);

  return (
    <div
      style={{ minHeight: '100vh', width: '100vw', fontFamily: '"Inter","system-ui",-apple-system,sans-serif', backgroundColor: isDark ? '#05070d' : '#f5f7ff', color: isDark ? '#e6edf3' : '#0f172a', overflowX: 'hidden', position: 'relative' }}
      onClick={handleRootClick}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.12)'}; border-radius: 4px; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes slideLeft { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes cardIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes toastIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }
        
        /* Smooth Breathing Aura instead of hard blinking */
        @keyframes smooth-breathe { 
          0%, 100% { box-shadow: 0 0 10px rgba(185,28,28,0.4); transform: scale(1); } 
          50% { box-shadow: 0 0 20px rgba(185,28,28,0.8); transform: scale(1.1); } 
        }
        .pulse-dot { animation: smooth-breathe 3s ease-in-out infinite; }
        
        @keyframes spin { to { transform: rotate(360deg); } }
        
        /* Soft cursor fade instead of hard blink */
        @keyframes soft-blink { 0%, 100% { opacity: 0.8; } 50% { opacity: 0.2; } }

        .glass-btn { transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1); }
        .glass-btn:hover { background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'} !important; transform: translateY(-2px); border-color: ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'} !important; box-shadow: 0 4px 15px rgba(0,0,0,0.1); }
        
        .search-input:focus { border-color: ${isDark ? 'rgba(185,28,28,0.5)' : '#dc2626'} !important; box-shadow: 0 0 0 4px ${isDark ? 'rgba(185,28,28,0.1)' : 'rgba(220,38,38,0.1)'} !important; outline: none; }
        .create-input:focus { border-color: ${isDark ? 'rgba(185,28,28,0.5)' : '#dc2626'} !important; box-shadow: 0 0 0 4px ${isDark ? 'rgba(185,28,28,0.1)' : 'rgba(220,38,38,0.1)'} !important; outline: none; }
        
        .create-btn { transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1); }
        .create-btn:hover:not(:disabled) { filter: brightness(1.15); transform: translateY(-3px); box-shadow: 0 10px 25px rgba(185,28,28,0.4) !important; }
        .create-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .tilt-card:hover { border-color: ${isDark ? 'rgba(185,28,28,0.4)' : 'rgba(185,28,28,0.3)'} !important; box-shadow: ${isDark ? '0 12px 45px rgba(0,0,0,0.6), 0 0 0 1px rgba(185,28,28,0.2)' : '0 12px 40px rgba(0,0,0,0.15), 0 0 0 1px rgba(185,28,28,0.15)'} !important; }

        .action-icon { transition: all 0.2s cubic-bezier(0.23, 1, 0.32, 1); border-radius: 8px; padding: 6px; display: inline-flex; align-items: center; justify-content: center; }
        .action-icon.archive-btn:hover { background: rgba(251,191,36,0.15) !important; color: #f59e0b !important; transform: scale(1.15) translateY(-2px); }
        .action-icon.delete-btn:hover  { background: rgba(239,68,68,0.15) !important; color: #ef4444 !important; transform: scale(1.15) translateY(-2px); }
        .action-icon.restore-btn:hover { background: rgba(34,197,94,0.15) !important; color: #22c55e !important; transform: scale(1.15) translateY(-2px); }

        .archive-card:hover { background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)'} !important; border-color: ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'} !important; transform: translateX(4px); }
        .modal-cancel-btn:hover { background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} !important; }
        .modal-delete-btn:hover { filter: brightness(1.15); transform: translateY(-2px); }
        .ctx-item:hover { background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'} !important; transform: translateX(2px); }

        .stat-pill:hover { border-color: ${isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.18)'} !important; background: ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.95)'} !important; transform: translateY(-2px); box-shadow: 0 4px 15px rgba(0,0,0,0.05); }

        .create-input::placeholder { color: ${isDark ? 'rgba(148,163,184,0.6)' : 'rgba(100,116,139,0.6)'}; font-weight: 300; }
        .tw-cursor { display: inline-block; width: 2px; height: 1em; background: currentColor; margin-left: 2px; vertical-align: middle; animation: soft-blink 1.2s ease-in-out infinite; border-radius: 2px; opacity: 0.8; }
      `}</style>

      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }} />

      {/* Toast */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '24px', right: '24px', zIndex: 300, background: isDark ? 'rgba(17,24,39,0.95)' : 'rgba(255,255,255,0.95)', borderWidth: '1px', borderStyle: 'solid', borderColor: toast.type === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(34,197,94,0.3)', borderRadius: '12px', padding: '14px 20px', boxShadow: '0 15px 40px rgba(0,0,0,0.3)', fontSize: '0.88rem', fontWeight: '600', color: toast.type === 'error' ? '#ef4444' : '#22c55e', display: 'flex', alignItems: 'center', gap: '10px', backdropFilter: 'blur(20px)', animation: 'toastIn 0.3s cubic-bezier(0.23,1,0.32,1)' }}>
          {toast.type === 'error' ? '✕' : '✓'} {toast.msg}
        </div>
      )}

      {ctxMenu && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} project={ctxMenu.project} isDark={isDark}
          onOpen={() => navigate(`/module-hub?project=${ctxMenu.project.id}&name=${encodeURIComponent(ctxMenu.project.name)}`)}
          onArchive={() => archiveProject(ctxMenu.project.id, ctxMenu.project.name)}
          onDelete={() => setDeleteTarget({ id: ctxMenu.project.id, name: ctxMenu.project.name })}
          onCopy={() => { navigator.clipboard.writeText(`${window.location.origin}/module-hub?project=${ctxMenu.project.id}&name=${encodeURIComponent(ctxMenu.project.name)}`); showToast('Link copied'); }}
          onClose={() => setCtxMenu(null)}
        />
      )}

      {deleteTarget && <DeleteModal projectName={deleteTarget.name} onConfirm={confirmDelete} onCancel={() => setDeleteTarget(null)} isDark={isDark} />}

      {/* ── TOPBAR ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '70px', background: isDark ? 'linear-gradient(180deg, rgba(5,7,13,0.85) 0%, rgba(5,7,13,0.6) 100%)' : 'linear-gradient(180deg, rgba(245,247,255,0.9) 0%, rgba(245,247,255,0.7) 100%)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', zIndex: 100, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: '800', letterSpacing: '2px', fontSize: '1rem', textShadow: isDark ? '0 0 20px rgba(255,255,255,0.2)' : 'none' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#b91c1c', border: '1px solid #ff4444' }} className="pulse-dot" />
          REDWOOD
        </div>

        <div style={{ flex: 1, maxWidth: '500px', position: 'relative', margin: '0 32px' }}>
          <Search size={16} strokeWidth={2.5} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }} />
          <input type="text" className="search-input" placeholder="Search archives..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: '30px', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', color: isDark ? '#f1f5f9' : '#0f172a', fontSize: '0.9rem', fontFamily: 'inherit', fontWeight: '300', transition: 'all 0.3s' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
          
          {/* <-- 3. WIRE THE BOARD BUTTON TO STATE --> */}
          <button 
            className="glass-btn" 
            onClick={() => setIsGlobalBoardOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '30px', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', fontFamily: 'inherit' }}
          >
            <LayoutDashboard size={15} /> Board
          </button>
          
          <button 
            className="glass-btn" 
            onClick={() => setIsAuditPanelOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '30px', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', fontFamily: 'inherit' }}
          >
            <Activity size={15} /> Logs
          </button>

          <button className="glass-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '30px', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500', fontFamily: 'inherit' }}
            onClick={e => { e.stopPropagation(); setIsUsersPanelOpen(p => !p); }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            <Users size={15} /> {onlineUsers.length}
          </button>

          {isUsersPanelOpen && (
            <div style={{ position: 'absolute', top: '120%', right: '60px', width: '260px', zIndex: 200, animation: 'slideUp 0.25s cubic-bezier(0.23,1,0.32,1)', background: isDark ? 'rgba(10,12,22,0.98)' : 'rgba(255,255,255,0.98)', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', borderRadius: '16px', padding: '12px', boxShadow: isDark ? '0 20px 50px rgba(0,0,0,0.7)' : '0 20px 50px rgba(0,0,0,0.15)', backdropFilter: 'blur(30px)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', color: isDark ? '#475569' : '#94a3b8', marginBottom: '12px', padding: '0 4px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, paddingBottom: '8px' }}>Active Nodes</div>
              {onlineUsers.length > 0 ? onlineUsers.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '10px', transition: 'background 0.2s', cursor: 'default' }} onMouseEnter={e => e.currentTarget.style.background = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: `hsl(${(u.email.charCodeAt(0) * 47) % 360},60%,${isDark ? '40%' : '60%'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#fff', flexShrink: 0, boxShadow: '0 4px 10px rgba(0,0,0,0.2)' }}>{u.email[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', color: isDark ? '#e2e8f0' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email.split('@')[0]}</div>
                    <div style={{ fontSize: '0.75rem', color: isDark ? '#64748b' : '#94a3b8', fontWeight: '400' }}>
                      {u.currentPage === 'dashboard' ? '🏠 Dashboard' : u.currentPage === 'im' ? `📄 ${u.currentIM?.title || 'IM'}` : u.currentPage === 'fsa' ? '📊 FSA' : u.currentPage === 'module-hub' ? '🗂 Module Hub' : u.currentPage}
                    </div>
                  </div>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                </div>
              )) : <div style={{ padding: '12px 8px', fontSize: '0.85rem', color: isDark ? '#475569' : '#94a3b8', fontStyle: 'italic' }}>Only you are connected</div>}
            </div>
          )}

          <div style={{ width: '1px', height: '24px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0 6px' }} />
          <button className="glass-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={{ background: 'transparent', borderWidth: '1px', borderStyle: 'solid', borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)', borderRadius: '50%', cursor: 'pointer', padding: '10px', color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center' }}>
            {isDark ? <Sun size={18} strokeWidth={2} /> : <Moon size={18} strokeWidth={2} />}
          </button>
          <button className="glass-btn" onClick={handleLogout} title="Logout" style={{ background: 'transparent', borderWidth: '0', borderStyle: 'solid', borderColor: 'transparent', cursor: 'pointer', padding: '10px', color: isDark ? '#ef4444' : '#ef4444', display: 'flex', alignItems: 'center', borderRadius: '50%' }}>
            <LogOut size={18} strokeWidth={2} />
          </button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main style={{ position: 'relative', zIndex: 10, maxWidth: '1200px', margin: '0 auto', padding: '120px 32px 80px' }}>

        {/* Page heading */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '3rem', fontWeight: '200', margin: '0 0 10px', letterSpacing: '-1px', color: isDark ? '#fff' : '#000' }}>Investment Memos</h2>
          <p style={{ margin: 0, color: isDark ? '#64748b' : '#64748b', fontSize: '1rem', fontWeight: '300', letterSpacing: '2px', textTransform: 'uppercase' }}>
            Collaborative Intelligence Layer · {active.length} active
          </p>
        </div>

        {/* ── STATS BAR ── */}
        <StatsBar
          total={totalCount}
          active={activeCount}
          archived={archivedCount}
          isDark={isDark}
        />

        {/* Create bar */}
        <div style={{ display: 'flex', gap: '12px', marginBottom: '40px', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: '420px' }}>
            <input
              type="text"
              className="create-input"
              placeholder={newProjectName ? '' : placeholder}
              value={newProjectName}
              onChange={e => setNewProjectName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createProject()}
              style={{
                width: '100%', padding: '14px 20px', borderRadius: '12px',
                borderWidth: '1px', borderStyle: 'solid',
                borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)',
                background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.8)',
                backdropFilter: 'blur(10px)',
                color: isDark ? '#fff' : '#000', fontSize: '1rem', fontFamily: 'inherit', fontWeight: '400',
                transition: 'all 0.3s',
              }}
            />
            {!newProjectName && (
              <div style={{ position: 'absolute', right: '16px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <span className="tw-cursor" />
              </div>
            )}
          </div>
          <button
            className="create-btn"
            onClick={createProject}
            disabled={creating || !newProjectName.trim()}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '14px 28px', borderRadius: '12px', borderWidth: '0', borderStyle: 'solid', borderColor: 'transparent', cursor: 'pointer', fontFamily: 'inherit', background: isDark ? '#b91c1c' : '#dc2626', color: '#fff', fontWeight: '700', fontSize: '1rem', boxShadow: '0 8px 20px rgba(185,28,28,0.3)', whiteSpace: 'nowrap' }}
          >
            {creating ? <RefreshCw size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <Plus size={18} strokeWidth={2.5} />}
            {creating ? 'Initializing...' : 'Initialize'}
          </button>
        </div>

        {/* Active grid */}
        {active.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: '24px', marginBottom: '64px' }}>
            {active.map((project, i) => (
              <TiltCard
                key={project.id}
                style={{ ...cardBase, animation: `cardIn 0.5s cubic-bezier(0.23,1,0.32,1) ${Math.min(i * 0.08, 0.6)}s both` }}
                onClick={() => navigate(`/module-hub?project=${project.id}&name=${encodeURIComponent(project.name)}`)}
                onContextMenu={e => { e.preventDefault(); setCtxMenu({ x: e.clientX, y: e.clientY, project }); }}
                draggable
                onDragStart={() => handleDragStart(project.id)}
                onDragOver={e => handleDragOver(e, project.id)}
                onDrop={handleDrop}
                isDragging={dragIdx === project.id}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0, flex: 1 }}>
                    <div style={{ padding: '8px', background: isDark ? 'rgba(185,28,28,0.1)' : 'rgba(220,38,38,0.1)', borderRadius: '10px' }}>
                      <FolderOpen size={20} color={isDark ? '#b91c1c' : '#dc2626'} style={{ flexShrink: 0 }} strokeWidth={2} />
                    </div>
                    <h3 style={{ margin: '4px 0 0 0', fontSize: '1.1rem', fontWeight: '600', lineHeight: 1.3, wordBreak: 'break-word' }}>
                      <HighlightText text={project.name} query={searchQuery} />
                    </h3>
                  </div>
                  <button
                    className="action-icon archive-btn"
                    onClick={e => { e.stopPropagation(); archiveProject(project.id, project.name); }}
                    title="Send to Archive"
                    style={{ background: 'transparent', borderWidth: '0', borderStyle: 'solid', borderColor: 'transparent', color: isDark ? '#475569' : '#94a3b8', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <Archive size={16} strokeWidth={2} />
                  </button>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                  <span>Extracted: {formatTime(project.createdAt)}</span>
                  <span style={{ fontSize: '0.7rem', fontWeight: '800', color: isDark ? '#94a3b8' : '#64748b', letterSpacing: '0.1em' }}>ACCESS ➔</span>
                </div>
              </TiltCard>
            ))}
          </div>
        ) : (
          <div style={{ padding: '64px', textAlign: 'center', color: isDark ? '#475569' : '#94a3b8', borderWidth: '1px', borderStyle: 'dashed', borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)', borderRadius: '20px', marginBottom: '64px', animation: 'fadeIn 0.5s ease', background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
            <BarChart2 size={48} style={{ opacity: 0.3, margin: '0 auto 16px' }} strokeWidth={1} />
            <div style={{ fontSize: '1.1rem', fontWeight: '300', letterSpacing: '1px' }}>
              {searchQuery ? `No dossiers found matching "${searchQuery}"` : 'The archive is empty. Awaiting new initialization.'}
            </div>
          </div>
        )}

        {/* Archived grid */}
        {archived.length > 0 && (
          <div style={{ opacity: 0.8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
              <Archive size={16} color={isDark ? '#64748b' : '#94a3b8'} strokeWidth={1.5} />
              <span style={{ fontSize: '0.85rem', fontWeight: '600', letterSpacing: '0.1em', textTransform: 'uppercase', color: isDark ? '#64748b' : '#94a3b8' }}>
                Deep Archive · {archived.length}
              </span>
              <div style={{ flex: 1, height: '1px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
              {archived.map(project => (
                <ArchivedCard
                  key={project.id}
                  project={project}
                  onRestore={restoreProject}
                  onDelete={(p) => setDeleteTarget({ id: p.id, name: p.name })}
                  isDark={isDark}
                  searchQuery={searchQuery}
                />
              ))}
            </div>
          </div>
        )}
      </main>

      {/* <-- 4. RENDER GLOBAL BOARD --> */}
      {isGlobalBoardOpen && (
        <GlobalBoard 
          projects={active} 
          isDark={isDark} 
          onClose={() => setIsGlobalBoardOpen(false)} 
        />
      )}

      {/* <-- 5. RENDER AUDIT LOG PANEL --> */}
      {isAuditPanelOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, display: 'flex', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)', animation: 'fadeIn 0.2s ease' }} onClick={() => setIsAuditPanelOpen(false)}>
          <div style={{ width: '400px', height: '100%', background: isDark ? '#0f172a' : '#ffffff', borderLeft: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, display: 'flex', flexDirection: 'column', animation: 'slideLeft 0.3s cubic-bezier(0.23,1,0.32,1)', boxShadow: '-10px 0 40px rgba(0,0,0,0.3)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '24px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: isDark ? '#f1f5f9' : '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}><Activity size={18} color={isDark ? '#00f0ff' : '#0ea5e9'} /> Audit Logbook</h3>
              <button onClick={() => setIsAuditPanelOpen(false)} style={{ background: 'none', border: 'none', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
              {auditLogs.length > 0 ? auditLogs.map(log => (
                <div key={log.id} style={{ padding: '16px', marginBottom: '12px', borderRadius: '10px', background: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.03)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 800, color: log.action === 'CREATED' ? '#22c55e' : log.action === 'ARCHIVED' ? '#f59e0b' : log.action === 'PURGED' || log.action === 'DELETED' ? '#ef4444' : '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      {log.action} {log.entityType}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: isDark ? '#64748b' : '#94a3b8', fontWeight: 600 }}>
                      {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.95rem', color: isDark ? '#e2e8f0' : '#1e293b', fontWeight: 600, marginBottom: '6px', lineHeight: 1.4 }}>
                    {log.projectName ? <span style={{ color: isDark ? '#94a3b8' : '#64748b', fontWeight: 400 }}>{log.projectName} / </span> : ''}
                    {log.entityName}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '20px', height: '20px', borderRadius: '5px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', color: isDark ? '#fff' : '#000', fontWeight: 800 }}>
                      {log.userEmail.charAt(0).toUpperCase()}
                    </div>  
                    {log.userEmail}
                  </div>
                </div>
              )) : <div style={{ textAlign: 'center', padding: '40px 20px', color: isDark ? '#64748b' : '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem' }}>No activity recorded yet.</div>}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
