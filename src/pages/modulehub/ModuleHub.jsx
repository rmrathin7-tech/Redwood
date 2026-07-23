import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Search, Users, Sun, Moon, LogOut,
  FileText, BarChart3, Building2,
  CheckCircle2, MessageSquare, Trash2, Edit3, Globe,
  ShieldAlert, Sparkles, RefreshCw, Kanban,
  CornerDownRight, Clock, Link, Target, Briefcase, Inbox,
  ChevronDown, Menu, X, Send, Lock
} from 'lucide-react';
import { auth, db } from '../../firebase';
import {
  collection, query, where, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, serverTimestamp, setDoc, orderBy, getDoc
} from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import IMTaskBoard from '../im/components/IMTaskBoard.jsx';
import ProjectActivityPanel from './ProjectActivityPanel.jsx';

// ── TILT CARD (Glass Slate — subtle, sharpened) ─────────────────────────────
const TiltCard = React.memo(function TiltCard({ children, style, className, onClick }) {
  const cardRef = useRef(null);
  const glowRef = useRef(null);
  const frameRef = useRef(null);

  const handleMouseMove = useCallback((e) => {
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const rotX = ((y - cy) / cy) * -2;
    const rotY = ((x - cx) / cx) * 2;

    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      card.style.transform = `perspective(900px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-2px)`;
      if (glowRef.current) {
        glowRef.current.style.background = `radial-gradient(140px circle at ${x}px ${y}px, rgba(0, 240, 255, 0.07), transparent 70%)`;
        glowRef.current.style.opacity = '1';
      }
    });
  }, []);

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    if (cardRef.current) cardRef.current.style.transform = 'perspective(900px) rotateX(0deg) rotateY(0deg) translateY(0)';
    if (glowRef.current) glowRef.current.style.opacity = '0';
  }, []);

  return (
    <div
      ref={cardRef} className={`tilt-card ${className || ''}`}
      style={{
        ...style, transformStyle: 'preserve-3d', willChange: 'transform',
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
        transition: 'transform 0.3s cubic-bezier(0.23,1,0.32,1), box-shadow 0.3s ease, border-color 0.3s ease',
      }}
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onClick={onClick}
    >
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.3s ease', zIndex: 0 }} />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {children}
      </div>
    </div>
  );
});

// ── GLASS MODAL COMPONENT ───────────────────────────────────────────────────
const GlassModal = ({ isOpen, title, onClose, onConfirm, confirmText, isDestructive, children, isDark }) => {
  if (!isOpen) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn 0.2s ease' }}>
      <div style={{ background: isDark ? 'rgba(10,14,24,0.9)' : 'rgba(255,255,255,0.92)', border: `1px solid ${isDark ? 'rgba(0,240,255,0.2)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '14px', padding: '26px', width: '380px', boxShadow: isDark ? '0 24px 60px rgba(0,0,0,0.6)' : '0 24px 60px rgba(0,0,0,0.2)', animation: 'slideUp 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <h3 style={{ margin: '0 0 18px 0', fontSize: '1.05rem', fontWeight: '700', color: isDark ? '#fff' : '#000', display: 'flex', alignItems: 'center', gap: '9px' }}>
          {isDestructive ? <ShieldAlert size={17} color="#ef4444" /> : <Sparkles color="#00f0ff" size={17} />} {title}
        </h3>
        <div style={{ marginBottom: '20px' }}>{children}</div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '9px', borderRadius: '9px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontWeight: '600', fontSize: '0.85rem', transition: 'all 0.2s' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '9px', borderRadius: '9px', background: isDestructive ? '#ef4444' : (isDark ? 'rgba(0,240,255,0.15)' : '#0ea5e9'), color: isDestructive ? '#fff' : (isDark ? '#00f0ff' : '#fff'), border: isDestructive ? 'none' : `1px solid ${isDark ? 'rgba(0,240,255,0.3)' : 'transparent'}`, cursor: 'pointer', fontWeight: '700', fontSize: '0.85rem', transition: 'all 0.2s' }}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
};

// ── COMPACT ACTION BUTTON (toolbar) ─────────────────────────────────────────
const ActionBtn = ({ icon, label, onClick, isDark, disabled, title }) => (
  <button
    className="glass-btn hub-action-btn"
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    title={title || label}
    style={{
      display: 'flex', alignItems: 'center', gap: '6px',
      background: isDark ? 'rgba(255,255,255,0.03)' : '#fff',
      color: disabled ? (isDark ? '#3f4b5c' : '#c1c9d2') : (isDark ? '#e2e8f0' : '#0f172a'),
      border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
      padding: '7px 12px', borderRadius: '9px', fontWeight: '600', fontSize: '0.76rem',
      cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1, whiteSpace: 'nowrap',
    }}
  >
    {icon} {label}
  </button>
);

// ── MAIN MODULE HUB ─────────────────────────────────────────────────────────
export default function ModuleHub() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectName = searchParams.get('name') || 'UNKNOWN_DOSSIER';

  const [theme, setTheme] = useState(() => {
    try {
      const saved = localStorage.getItem('hub-theme');
      if (saved === 'dark' || saved === 'light') return saved;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch { return 'dark'; }
  });
  const [user, setUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isUsersPanelOpen, setIsUsersPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Data States
  const [imList, setImList] = useState([]);
  const [fsaList, setFsaList] = useState([]);
  const [fcList, setFcList] = useState([]);
  const [bsaList, setBsaList] = useState([]);
  const [srlList, setSrlList] = useState([]);
  const [profilingList, setProfilingList] = useState([]);
  const [updates, setUpdates] = useState([]);

  // Progress Feed states
  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [editUpdateText, setEditUpdateText] = useState('');
  const [replyingToId, setReplyingToId] = useState(null);
  const [replyInput, setReplyInput] = useState('');
  const [domainMap, setDomainMap] = useState({});
  const [entityMap, setEntityMap] = useState({});
  const [rawDomains, setRawDomains] = useState([]);
  const [rawEntities, setRawEntities] = useState([]);

  // Modal States
  const [activeModal, setActiveModal] = useState(null); // 'im', 'fc', 'bsa', 'protocol', 'delete', 'fsa'
  const [modalInput, setModalInput] = useState('');
  const [fsaData, setFsaData] = useState({ domain: '', entityType: '' });
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [updateInput, setUpdateInput] = useState('');
const [activeOpsImId, setActiveOpsImId] = useState(null);
  const [isActivityPanelOpen, setIsActivityPanelOpen] = useState(true);
  const [activityUnseenCount, setActivityUnseenCount] = useState(0);
  const [imCommentCounts, setImCommentCounts] = useState({}); // imId -> { totalOpen, totalResolved, myOpen }

  // ── PER-IM COMMENT COUNTER (Personalized & Global) ──
  useEffect(() => {
    if (!user) return;
    const imIds = imList.map(im => im.id);
    if (imIds.length === 0) { setImCommentCounts({}); return; }
    const chunk = (arr, size = 10) => { const out = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; };
    const unsubs = [];
    const perChunkCounts = {}; // chunkIndex -> { imId: {totalOpen, totalResolved, myOpen} }
    chunk(imIds, 10).forEach((group, gi) => {
      unsubs.push(onSnapshot(query(collection(db, 'im-comments'), where('imId', 'in', group)), snap => {
        const counts = {};
        group.forEach(id => { counts[id] = { totalOpen: 0, totalResolved: 0, myOpen: 0 }; });
        snap.docs.forEach(d => {
          const data = d.data();
          if (!counts[data.imId]) counts[data.imId] = { totalOpen: 0, totalResolved: 0, myOpen: 0 };
          if (data.status === 'resolved') {
            counts[data.imId].totalResolved += 1;
          } else {
            counts[data.imId].totalOpen += 1;
            if (data.assignee?.uid === user.uid) {
              counts[data.imId].myOpen += 1;
            }
          }
        });
        perChunkCounts[gi] = counts;
        const merged = Object.assign({}, ...Object.values(perChunkCounts));
        setImCommentCounts(merged);
      }));
    });
    return () => unsubs.forEach(u => u());
  }, [imList, user]);

  const isDark = theme === 'dark';
  useEffect(() => {
    try { localStorage.setItem('hub-theme', theme); } catch {}
  }, [theme]);

  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });

  // Redirect if no project ID
  useEffect(() => {
    if (!projectId) navigate('/');
  }, [projectId, navigate]);

  // ── AUTH & PRESENCE ──
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { navigate('/login'); return; }
      setUser(u);
      const ref = doc(db, 'workspace-users', u.uid);
      await setDoc(ref, { userId: u.uid, email: u.email, isOnline: true, currentPage: 'module-hub', currentIM: { id: projectId, title: projectName }, lastActive: serverTimestamp() }, { merge: true });
      const hb = setInterval(() => updateDoc(ref, { lastActive: serverTimestamp() }), 30000);
      const bye = () => updateDoc(ref, { isOnline: false, lastActive: serverTimestamp() });
      window.addEventListener('beforeunload', bye);
      return () => { clearInterval(hb); window.removeEventListener('beforeunload', bye); };
    });
    return unsub;
  }, [projectId, projectName, navigate]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(collection(db, 'workspace-users'), snap => {
      const now = Date.now();
      setOnlineUsers(snap.docs.map(d => d.data()).filter(d => d.isOnline && (now - (d.lastActive?.toMillis?.() || 0) < 120000)));
    });
  }, [user]);

  // ── FETCH CONFIGS (For FSA) ──
  useEffect(() => {
    const fetchConfigs = async () => {
      try {
        const [domSnap, entSnap] = await Promise.all([
          getDoc(doc(db, "workspace-config", "domainTemplates")),
          getDoc(doc(db, "workspace-config", "entityTypes"))
        ]);
        const domData = domSnap.data() || {};
        const domains = domData.domains || domData.templates?.map((t, i) => ({ id: t.key || `dom_${i}`, label: t.label })) || [];
        const entities = entSnap.data()?.types || [];

        setRawDomains(domains);
        setRawEntities(entities);
        setDomainMap(domains.reduce((acc, d) => ({...acc, [d.id]: d.label}), {}));
        setEntityMap(entities.reduce((acc, e) => ({...acc, [e.key]: e.label}), {}));

        if (domains.length > 0) setFsaData(prev => ({ ...prev, domain: domains[0].id }));
        if (entities.length > 0) setFsaData(prev => ({ ...prev, entityType: entities[0].key }));
      } catch (err) { console.error("Error fetching configs:", err); }
    };
    fetchConfigs();
  }, []);

  // ── DATA SUBSCRIPTIONS ──
  useEffect(() => {
    if (!projectId) return;

    const unsubs = [];
    unsubs.push(onSnapshot(query(collection(db, 'investment-memos'), where('projectId', '==', projectId)), snap => {
      setImList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(query(collection(db, 'first-connect-reports'), where('projectId', '==', projectId)), snap => {
      setFcList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'projects', projectId, 'fsa'), snap => {
      setFsaList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'projects', projectId, 'bsa'), snap => {
      setBsaList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(query(collection(db, 'srl-assessments'), where('linkedProjectId', '==', projectId)), snap => {
      setSrlList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(collection(db, 'projects', projectId, 'profiling'), snap => {
      setProfilingList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    unsubs.push(onSnapshot(query(collection(db, 'projects', projectId, 'updates'), orderBy('createdAt', 'desc')), snap => {
      setUpdates(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));

    return () => unsubs.forEach(u => u());
  }, [projectId]);

  // ── AUDIT LOGGER ──
  const logAction = async (action, entityType, entityName) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'workspace-audit-logs'), {
        action,
        entityType: entityType.toUpperCase(),
        entityName,
        userEmail: user.email,
        userId: user.uid,
        projectId,
        projectName,
        timestamp: serverTimestamp()
      });
    } catch (e) { console.error('Audit log failed', e); }
  };

  const getItemTitle = (id, type) => {
    const list = type === 'im' ? imList : type === 'fsa' ? fsaList : type === 'fc' ? fcList : type === 'bsa' ? bsaList : type === 'profiling' ? profilingList : type === 'srl' ? srlList : [];
    return list.find(i => i.id === id)?.title || ((type === 'srl' || type === 'profiling') ? list.find(i => i.id === id)?.companyName : 'Unknown Document');
  };

  // ── IM cap: only one active Investment Memo allowed per project ──
  const activeImCount = useMemo(() => imList.filter(i => !i.archived).length, [imList]);
  const imLimitReached = activeImCount >= 1;

  // ── CREATION HANDLERS ──
  const handleCreateSimple = async () => {
    if (!modalInput.trim() || !user || !activeModal) return;
    if (activeModal === 'im' && imLimitReached) { setActiveModal(null); setModalInput(''); return; }
    const title = modalInput.trim();

    try {
      if (activeModal === 'im') {
        await addDoc(collection(db, 'investment-memos'), { projectId, userId: user.uid, title, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      } else if (activeModal === 'fc') {
        await addDoc(collection(db, 'first-connect-reports'), { projectId, userId: user.uid, title, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      } else if (activeModal === 'bsa') {
        await addDoc(collection(db, 'projects', projectId, 'bsa'), { title, data: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid });
      } else if (activeModal === 'protocol') {
        await addDoc(collection(db, 'projects', projectId, 'protocols'), { title, checked: false, createdAt: serverTimestamp() });
      }
      await logAction('CREATED', activeModal, title);
      setActiveModal(null); setModalInput('');
    } catch (err) { console.error(err); }
  };

  const handleCreateFsa = async () => {
    if (!modalInput.trim() || !user) return;
    try {
      await addDoc(collection(db, 'projects', projectId, 'fsa'), {
        title: modalInput.trim(),
        name: modalInput.trim(),
        domain: fsaData.domain,
        entityType: fsaData.entityType,
        data: {}, years: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp(), createdBy: user.uid
      });
      await logAction('CREATED', 'FSA', modalInput.trim());
      setActiveModal(null); setModalInput('');
    } catch (err) { console.error(err); }
  };

  const handleCustomDomain = async () => {
    const label = window.prompt("Enter new domain name:");
    if (!label?.trim()) return;
    const newDomain = { id: `dom_${Date.now()}`, label: label.trim() };
    try {
      const domRef = doc(db, "workspace-config", "domainTemplates");
      await setDoc(domRef, { domains: [...rawDomains, newDomain] }, { merge: true });
      setRawDomains(prev => [...prev, newDomain]);
      setDomainMap(prev => ({...prev, [newDomain.id]: newDomain.label}));
      setFsaData(prev => ({ ...prev, domain: newDomain.id }));
    } catch (err) { alert("Error creating domain"); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { id, type } = deleteTarget;
    try {
      const payload = { archived: true, archivedAt: serverTimestamp(), archivedBy: user?.uid };
      if (type === 'im') await updateDoc(doc(db, 'investment-memos', id), payload);
      if (type === 'fc') await updateDoc(doc(db, 'first-connect-reports', id), payload);
      if (type === 'fsa') await updateDoc(doc(db, 'projects', projectId, 'fsa', id), payload);
      if (type === 'bsa') await updateDoc(doc(db, 'projects', projectId, 'bsa', id), payload);
      if (type === 'srl') await updateDoc(doc(db, 'srl-assessments', id), payload);
      if (type === 'profiling') await updateDoc(doc(db, 'projects', projectId, 'profiling', id), payload);
      if (type === 'protocol') await deleteDoc(doc(db, 'projects', projectId, 'protocols', id));

      await logAction(type === 'protocol' ? 'DELETED' : 'ARCHIVED', type, getItemTitle(id, type));

      setDeleteTarget(null); setActiveModal(null);
    } catch (err) { console.error(err); }
  };

  const handleRestore = async (id, type) => {
    try {
      const payload = { archived: false };
      if (type === 'im') await updateDoc(doc(db, 'investment-memos', id), payload);
      if (type === 'fc') await updateDoc(doc(db, 'first-connect-reports', id), payload);
      if (type === 'fsa') await updateDoc(doc(db, 'projects', projectId, 'fsa', id), payload);
      if (type === 'bsa') await updateDoc(doc(db, 'projects', projectId, 'bsa', id), payload);
      if (type === 'srl') await updateDoc(doc(db, 'srl-assessments', id), payload);
      if (type === 'profiling') await updateDoc(doc(db, 'projects', projectId, 'profiling', id), payload);

      await logAction('RESTORED', type, getItemTitle(id, type));
    } catch (err) { console.error(err); }
  };

  const handleHardDelete = async (id, type) => {
    if (!window.confirm('Are you absolutely sure? This cannot be undone.')) return;
    try {
      const title = getItemTitle(id, type);
      if (type === 'im') await deleteDoc(doc(db, 'investment-memos', id));
      if (type === 'fc') await deleteDoc(doc(db, 'first-connect-reports', id));
      if (type === 'fsa') await deleteDoc(doc(db, 'projects', projectId, 'fsa', id));
      if (type === 'bsa') await deleteDoc(doc(db, 'projects', projectId, 'bsa', id));
      if (type === 'srl') await deleteDoc(doc(db, 'srl-assessments', id));
      if (type === 'profiling') await deleteDoc(doc(db, 'projects', projectId, 'profiling', id));

      await logAction('PURGED', type, title);
    } catch (err) { console.error(err); }
  };

  const handlePostUpdate = async () => {
    if (!updateInput.trim() || !user) return;
    try {
      await addDoc(collection(db, 'projects', projectId, 'updates'), {
        text: updateInput.trim(), authorEmail: user.email, authorId: user.uid, createdAt: serverTimestamp(), replies: []
      });
      setUpdateInput('');
    } catch (err) { console.error(err); }
  };

  const handleDeleteUpdate = async (id) => {
    if (!window.confirm("Are you sure you want to delete this update?")) return;
    await deleteDoc(doc(db, 'projects', projectId, 'updates', id));
  };

  const handleSaveEdit = async (id) => {
    if (!editUpdateText.trim()) return;
    await updateDoc(doc(db, 'projects', projectId, 'updates', id), {
      text: editUpdateText.trim(), isEdited: true, updatedAt: serverTimestamp()
    });
    setEditingUpdateId(null);
  };

  const handlePostReply = async (id) => {
    if (!replyInput.trim() || !user) return;
    const updateRef = doc(db, 'projects', projectId, 'updates', id);
    const snap = await getDoc(updateRef);
    if (snap.exists()) {
      const currentReplies = snap.data().replies || [];
      await updateDoc(updateRef, {
        replies: [...currentReplies, {
          id: Date.now().toString(), text: replyInput.trim(), authorEmail: user.email, authorId: user.uid, createdAt: new Date().toISOString()
        }]
      });
    }
    setReplyingToId(null); setReplyInput('');
  };

  const renderTextWithLinks = (text) => {
    if (!text) return null;
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.split(urlRegex).map((part, i) =>
      part.match(urlRegex)
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: isDark ? '#00f0ff' : '#0ea5e9', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Link size={11} /> {part}</a>
        : <span key={i}>{part}</span>
    );
  };

  // ── AMBIENT BACKGROUND (toned down: quiet drift, no comets/hexagons, no dashes) ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let raf;
    const PARTICLE_COUNT = window.innerWidth > 1024 ? 46 : 26;
    const CONNECT_DIST_SQ = 16000;
    const MOUSE_ATTRACT_DIST = 140;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize); resize();

    const onMouseMove = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMouseMove);

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      size: Math.random() * 1.2 + 0.4, vx: (Math.random() - 0.5) * 0.12, vy: (Math.random() - 0.5) * 0.12,
      alpha: Math.random() * 0.35 + 0.15, twinkle: Math.random() * Math.PI * 2,
    }));

    let g1;
    const buildGradient = () => {
      g1 = ctx.createRadialGradient(canvas.width * 0.15, canvas.height * 0.9, 0, canvas.width * 0.15, canvas.height * 0.9, canvas.width * 0.55);
      g1.addColorStop(0, isDark ? 'rgba(0,240,255,0.05)' : 'rgba(0,240,255,0.03)');
      g1.addColorStop(1, 'transparent');
    };
    buildGradient(); window.addEventListener('resize', buildGradient);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = g1; ctx.fillRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x, my = mouseRef.current.y;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const distSq = (p.x - mx) ** 2 + (p.y - my) ** 2;
        if (distSq < MOUSE_ATTRACT_DIST ** 2) {
          const dist = Math.sqrt(distSq) || 1;
          p.vx += ((p.x - mx) / dist) * ((MOUSE_ATTRACT_DIST - dist) / MOUSE_ATTRACT_DIST) * 0.15;
          p.vy += ((p.y - my) / dist) * ((MOUSE_ATTRACT_DIST - dist) / MOUSE_ATTRACT_DIST) * 0.15;
        }
        p.vx *= 0.98; p.vy *= 0.98; p.x += p.vx; p.y += p.vy; p.twinkle += 0.008;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dSq = (p.x - p2.x) ** 2 + (p.y - p2.y) ** 2;
          if (dSq < CONNECT_DIST_SQ) {
            const op = (1 - dSq / CONNECT_DIST_SQ) * 0.1;
            ctx.strokeStyle = isDark ? `rgba(0,240,255,${op})` : `rgba(0,150,255,${op})`;
            ctx.lineWidth = 0.6;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
          }
        }
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const a = p.alpha * (0.6 + Math.sin(p.twinkle) * 0.4);
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = isDark ? `rgba(200,240,255,${a})` : `rgba(0,100,200,${a})`;
        ctx.fill();
      }

      raf = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('resize', buildGradient);
      window.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(raf);
    };
  }, [theme]);

  // ── HELPERS ──
  const formatTime = (ts) => ts?.toDate ? ts.toDate().toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Just now';

  const archivedItems = useMemo(() => {
    const items = [
      ...imList.filter(i => i.archived).map(i => ({...i, type: 'im', typeName: 'IM'})),
      ...fsaList.filter(i => i.archived).map(i => ({...i, type: 'fsa', typeName: 'FSA'})),
      ...fcList.filter(i => i.archived).map(i => ({...i, type: 'fc', typeName: 'FC'})),
      ...bsaList.filter(i => i.archived).map(i => ({...i, type: 'bsa', typeName: 'BSA'})),
      ...srlList.filter(i => i.archived).map(i => ({...i, type: 'srl', typeName: 'SRL'})),
    ];
    return items.sort((a, b) => (b.archivedAt?.toMillis?.() || 0) - (a.archivedAt?.toMillis?.() || 0));
  }, [imList, fsaList, fcList, bsaList, srlList]);

  const renderGrid = (title, icon, list, type) => {
    const activeList = list.filter(item => !item.archived);
    const filtered = activeList.filter(item => (item.title || item.companyName || '').toLowerCase().includes(searchQuery.toLowerCase()));
    return (
      <div className="hub-section">
        <div className="hub-section-head">
          <span className="hub-section-title">{icon}{title}</span>
          <span className="hub-section-count">{activeList.length}</span>
        </div>
        {filtered.length > 0 ? (
          <div className="hub-card-grid">
            {filtered.map((item, i) => (
              <TiltCard
                key={item.id} className="hub-card" style={{ animation: `fadeIn 0.35s ${i * 0.03}s both` }}
                onClick={() => {
                  if (type === 'srl') navigate('/srl-hub');
                  else if (type === 'profiling') navigate(`/profiling?project=${projectId}&name=${encodeURIComponent(projectName)}`);
                  else navigate(`/${type === 'fsa' ? 'fsa' : type === 'fc' ? 'fc' : type === 'bsa' ? 'bsa' : 'im'}?project=${projectId}&${type}=${item.id}&name=${encodeURIComponent(projectName)}`);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', minWidth: 0 }}>
                    <div style={{ padding: '6px', background: isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)', borderRadius: '7px', display: 'flex' }}>
                      {icon}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <h4 style={{ margin: 0, fontSize: '0.85rem', fontWeight: '600', color: isDark ? '#fff' : '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || item.companyName || 'Untitled'}</h4>
                      {type === 'fsa' && (
                        <div style={{ fontSize: '0.6rem', color: isDark ? '#00f0ff' : '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.4px', marginTop: '2px', fontWeight: '700' }}>
                          {entityMap[item.entityType] || item.entityType} · {domainMap[item.domain] || item.domain}
                        </div>
                      )}
                      {type === 'im' && imCommentCounts[item.id] && (imCommentCounts[item.id].totalOpen + imCommentCounts[item.id].totalResolved) > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                          {imCommentCounts[item.id].totalOpen > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.62rem', fontWeight: 700, color: '#f59e0b' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#f59e0b' }} />
                              {imCommentCounts[item.id].totalOpen} open
                              {imCommentCounts[item.id].myOpen > 0 && (
                                <span style={{ opacity: 0.8, marginLeft: '2px' }}>(You: {imCommentCounts[item.id].myOpen})</span>
                              )}
                            </span>
                          )}
                          {imCommentCounts[item.id].totalResolved > 0 && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', fontSize: '0.62rem', fontWeight: 700, color: isDark ? '#4ade80' : '#16a34a' }}>
                              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isDark ? '#4ade80' : '#16a34a' }} />
                              {imCommentCounts[item.id].totalResolved} resolved
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                    {type === 'im' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); setActiveOpsImId(item.id); }}
                        style={{ display: 'flex', alignItems: 'center', gap: '3px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: 'none', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', padding: '3px 6px', borderRadius: '6px', fontSize: '0.65rem', fontWeight: 700 }}
                        className="glass-btn"
                      >
                        <Kanban size={10} /> Ops
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({id: item.id, type}); setActiveModal('delete'); }} style={{ background: 'transparent', border: 'none', color: isDark ? '#64748b' : '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '6px' }} className="action-hover">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 'auto', paddingTop: '8px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                  <span>{formatTime(item.createdAt)}</span>
                  <span style={{ fontWeight: '700', color: isDark ? '#00f0ff' : '#0ea5e9' }}>Open →</span>
                </div>
              </TiltCard>
            ))}
          </div>
        ) : (
          <div className="hub-empty-row">No {title.toLowerCase()} yet.</div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', fontFamily: '"Inter", sans-serif', backgroundColor: isDark ? '#04060a' : '#f0f4f8', color: isDark ? '#e2e8f0' : '#0f172a', overflowX: 'hidden', position: 'relative' }} onClick={() => setIsUsersPanelOpen(false)}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(0,240,255,0.2)' : 'rgba(0,0,0,0.15)'}; border-radius: 4px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes smooth-breathe { 0%, 100% { box-shadow: 0 0 8px rgba(0,240,255,0.4); } 50% { box-shadow: 0 0 16px rgba(0,240,255,0.7); } }
        .pulse-dot { animation: smooth-breathe 3s ease-in-out infinite; }

        /* ── LIVELY AMBIENT ORBS ── */
        .hub-bg-orbs { position: fixed; inset: 0; z-index: 0; overflow: hidden; pointer-events: none; }
        .hub-bg-grid {
          position: absolute; inset: -1px; opacity: ${isDark ? 0.06 : 0.05};
          background-image: linear-gradient(${isDark ? 'rgba(0,240,255,0.5)' : 'rgba(14,165,233,0.6)'} 1px, transparent 1px),
                             linear-gradient(90deg, ${isDark ? 'rgba(0,240,255,0.5)' : 'rgba(14,165,233,0.6)'} 1px, transparent 1px);
          background-size: 46px 46px;
          mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 80%);
        }
        .hub-orb { position: absolute; border-radius: 50%; filter: blur(60px); will-change: transform; }
        .hub-orb-1 {
          width: 420px; height: 420px; top: -120px; left: -100px;
          background: ${isDark ? 'radial-gradient(circle, rgba(0,240,255,0.16), transparent 70%)' : 'radial-gradient(circle, rgba(14,165,233,0.14), transparent 70%)'};
          animation: driftA 26s ease-in-out infinite;
        }
        .hub-orb-2 {
          width: 360px; height: 360px; bottom: -80px; right: -60px;
          background: ${isDark ? 'radial-gradient(circle, rgba(168,85,247,0.14), transparent 70%)' : 'radial-gradient(circle, rgba(168,85,247,0.10), transparent 70%)'};
          animation: driftB 32s ease-in-out infinite;
        }
        .hub-orb-3 {
          width: 300px; height: 300px; top: 40%; left: 55%;
          background: ${isDark ? 'radial-gradient(circle, rgba(236,72,153,0.10), transparent 70%)' : 'radial-gradient(circle, rgba(236,72,153,0.08), transparent 70%)'};
          animation: driftC 22s ease-in-out infinite;
        }
        @keyframes driftA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(60px,50px) scale(1.15); } }
        @keyframes driftB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,-40px) scale(1.1); } }
        @keyframes driftC { 0%,100% { transform: translate(0,0) scale(1); } 33% { transform: translate(-40px,30px) scale(0.9); } 66% { transform: translate(30px,-30px) scale(1.1); } }

        .glass-btn { transition: all 0.2s ease; }
        .glass-btn:not(:disabled):hover { background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'} !important; border-color: ${isDark ? 'rgba(0,240,255,0.3)' : 'rgba(14,165,233,0.3)'} !important; color: ${isDark ? '#00f0ff' : '#0ea5e9'} !important; }

        .action-hover:hover { background: rgba(239,68,68,0.15) !important; color: #ef4444 !important; }

        .hub-send-btn { transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease; }
        .hub-send-btn:not(:disabled):hover { transform: scale(1.08); filter: brightness(1.1); }
        .hub-send-btn:not(:disabled):active { transform: scale(0.94); }

        .theme-toggle { transition: box-shadow 0.2s ease; }
        .theme-toggle:hover { box-shadow: 0 0 10px ${isDark ? 'rgba(0,240,255,0.25)' : 'rgba(251,191,36,0.35)'}; }

        .custom-input { width: 100%; padding: 10px 14px; border-radius: 9px; border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; background: ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)'}; color: inherit; font-family: inherit; font-size: 0.85rem; outline: none; transition: all 0.2s; }
        .custom-input:focus { border-color: ${isDark ? '#00f0ff' : '#0ea5e9'}; box-shadow: 0 0 0 3px ${isDark ? 'rgba(0,240,255,0.15)' : 'rgba(14,165,233,0.15)'}; }

        /* ── LAYOUT SHELL ── */
.hub-sidebar { position: fixed; top: 60px; width: 300px; flex-shrink: 0; height: calc(100vh - 60px); display: flex; flex-direction: column; border-right: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; background: ${isDark ? 'rgba(6,9,16,0.6)' : 'rgba(255,255,255,0.5)'}; backdrop-filter: blur(20px); z-index: 40; }
.hub-main { flex: 1; min-width: 0; padding: 28px 32px 60px; max-width: 1200px; margin-left: 280px; }
        .hub-main { flex: 1; min-width: 0; padding: 28px 32px 60px; max-width: 1200px; }

        .hub-side-notif { flex-shrink: 0; border-bottom: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; }
        .hub-notif-trigger { width: 100%; display: flex; align-items: center; gap: 8px; padding: 14px; background: transparent; border: none; cursor: pointer; color: ${isDark ? '#e2e8f0' : '#0f172a'}; font-size: 0.8rem; font-weight: 700; text-align: left; }
        .hub-notif-trigger:hover { background: ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}; }
        .hub-notif-badge { min-width: 17px; height: 17px; padding: 0 5px; border-radius: 999px; background: #ef4444; color: #fff; font-size: 0.6rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px ${isDark ? '#070b12' : '#fff'}; }
        .hub-chev { margin-left: auto; transition: transform 0.2s ease; color: ${isDark ? '#64748b' : '#94a3b8'}; }
        .hub-chev.open { transform: rotate(180deg); }

        .hub-side-feed { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .hub-feed-head { padding: 12px 14px 8px; font-size: 0.68rem; font-weight: 800; letter-spacing: 0.8px; text-transform: uppercase; color: ${isDark ? '#64748b' : '#94a3b8'}; display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
        .hub-feed-messages { flex: 1; overflow-y: auto; padding: 4px 12px; display: flex; flex-direction: column; gap: 10px; }
        .hub-feed-empty { text-align: center; font-size: 0.78rem; font-style: italic; color: ${isDark ? '#475569' : '#94a3b8'}; padding: 24px 12px; }
        .hub-feed-msg { padding: 10px; border-radius: 10px; background: ${isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'}; border: 1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}; }
        .hub-feed-input-row { flex-shrink: 0; display: flex; gap: 6px; padding: 10px 12px 14px; align-items: center; }

        /* ── ACTION TOOLBAR ── */
        .hub-actions-row { display: flex; gap: 6px; flex-wrap: wrap; }

        /* ── DOSSIER HEADER ── */
        .hub-dossier-head { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 28px; flex-wrap: wrap; gap: 16px; }
        .hub-title { font-size: 2rem; font-weight: 700; margin: 0; letter-spacing: -0.5px; color: ${isDark ? '#fff' : '#000'}; }

        /* ── MODULE SECTIONS (now arranged side by side as panels) ── */
        .hub-modules-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: 16px; align-items: start; }
        .hub-section {
          margin-bottom: 0; padding: 14px 16px 16px; border-radius: 12px;
          border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'};
          background: ${isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.012)'};
          transition: border-color 0.2s ease;
        }
        .hub-section:hover { border-color: ${isDark ? 'rgba(0,240,255,0.15)' : 'rgba(14,165,233,0.2)'}; }
        .hub-section-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .hub-section-title { font-size: 0.72rem; font-weight: 800; color: ${isDark ? '#94a3b8' : '#64748b'}; text-transform: uppercase; letter-spacing: 0.8px; display: flex; align-items: center; gap: 7px; }
        .hub-section-count { font-size: 0.65rem; font-weight: 700; color: ${isDark ? '#475569' : '#94a3b8'}; background: ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}; padding: 1px 7px; border-radius: 999px; }
        .hub-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
        @media (max-width: 700px) {
          .hub-modules-grid { grid-template-columns: 1fr; }
        }
        .hub-card { background: ${isDark ? 'rgba(10,14,24,0.6)' : 'rgba(255,255,255,0.7)'}; border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}; backdrop-filter: blur(16px); border-radius: 10px; padding: 12px; box-shadow: ${isDark ? '0 4px 16px rgba(0,0,0,0.35)' : '0 4px 12px rgba(0,0,0,0.05)'}; }
        .hub-empty-row { padding: 12px 14px; font-size: 0.78rem; font-style: italic; color: ${isDark ? '#475569' : '#94a3b8'}; border: 1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; border-radius: 9px; background: ${isDark ? 'rgba(255,255,255,0.015)' : 'rgba(0,0,0,0.015)'}; }

        .hub-mobile-toggle { display: none; }
        .hub-sidebar-backdrop { display: none; }

        @media (max-width: 880px) {
  .hub-mobile-toggle { display: flex; }
  .hub-sidebar { position: fixed; top: 60px; left: 0; height: calc(100vh - 60px); transform: translateX(-100%); transition: transform 0.25s ease; z-index: 150; box-shadow: 20px 0 40px rgba(0,0,0,0.3); }
  .hub-sidebar.open { transform: translateX(0); }
  .hub-sidebar-backdrop.open { display: block; position: fixed; inset: 60px 0 0 0; background: rgba(0,0,0,0.5); z-index: 140; }
  .hub-main { padding: 20px 16px 48px; margin-left: 0; }
}
      `}</style>

      <div className="hub-bg-orbs" aria-hidden="true">
        <span className="hub-orb hub-orb-1" />
        <span className="hub-orb hub-orb-2" />
        <span className="hub-orb hub-orb-3" />
        <div className="hub-bg-grid" />
      </div>
      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }} />

      {/* ── MODALS ── */}

      <GlassModal isOpen={activeModal === 'im' || activeModal === 'fc' || activeModal === 'bsa' || activeModal === 'protocol'} title={`New ${activeModal === 'im' ? 'Investment Memo' : activeModal === 'fc' ? 'First Connect' : activeModal === 'bsa' ? 'Bank Analysis' : 'Protocol'}`} onClose={() => {setActiveModal(null); setModalInput('');}} onConfirm={handleCreateSimple} confirmText="Create" isDark={isDark}>
        <input type="text" className="custom-input" placeholder="Enter designation..." value={modalInput} onChange={e => setModalInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateSimple()} autoFocus />
      </GlassModal>

      <GlassModal isOpen={activeModal === 'fsa'} title="New Financial Analysis" onClose={() => {setActiveModal(null); setModalInput('');}} onConfirm={handleCreateFsa} confirmText="Create" isDark={isDark}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '5px', display: 'block' }}>Designation Name</label>
            <input type="text" className="custom-input" placeholder="e.g. Acme Corp FY24" value={modalInput} onChange={e => setModalInput(e.target.value)} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '5px', display: 'block' }}>Domain / Industry</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select className="custom-input" value={fsaData.domain} onChange={e => setFsaData({...fsaData, domain: e.target.value})} style={{ flex: 1 }}>
                {rawDomains.length ? rawDomains.map(d => <option key={d.id} value={d.id}>{d.label}</option>) : <option value="">No domains found</option>}
              </select>
              <button onClick={handleCustomDomain} style={{ padding: '0 14px', borderRadius: '9px', border: `1px solid ${isDark ? 'rgba(0,240,255,0.3)' : 'rgba(14,165,233,0.3)'}`, background: isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)', color: isDark ? '#00f0ff' : '#0ea5e9', cursor: 'pointer', fontWeight: '700' }}>+</button>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.75rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '5px', display: 'block' }}>Entity Structure</label>
            <select className="custom-input" value={fsaData.entityType} onChange={e => setFsaData({...fsaData, entityType: e.target.value})}>
              {rawEntities.length ? rawEntities.map(e => <option key={e.key} value={e.key}>{e.label}</option>) : <option value="">No entities found</option>}
            </select>
          </div>
        </div>
      </GlassModal>

      <GlassModal isOpen={activeModal === 'delete'} title="move to trash" onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} confirmText="confirm" isDestructive isDark={isDark}>
        <p style={{ margin: 0, fontSize: '0.85rem', color: isDark ? '#cbd5e1' : '#475569', lineHeight: 1.5 }}>Are you sure you want to move this record to trash? It will be safely removed from your active workspace view.</p>
      </GlassModal>

      {/* ── TOPBAR ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '60px', background: isDark ? 'linear-gradient(180deg, rgba(4,6,10,0.9) 0%, rgba(4,6,10,0.7) 100%)' : 'linear-gradient(180deg, rgba(240,244,248,0.92) 0%, rgba(240,244,248,0.75) 100%)', backdropFilter: 'blur(24px)', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 100 }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button className="hub-mobile-toggle" onClick={(e) => { e.stopPropagation(); setIsMobileSidebarOpen(o => !o); }} style={{ background: 'transparent', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#fff' : '#000', width: '34px', height: '34px', borderRadius: '9px', cursor: 'pointer', alignItems: 'center', justifyContent: 'center' }}>
            <Menu size={16} />
          </button>
          <button onClick={() => navigate('/')} style={{ background: 'transparent', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#fff' : '#000', padding: '7px 13px', borderRadius: '9px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: '600' }} className="glass-btn">
            <ArrowLeft size={14} /> Dashboard
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '9px', fontWeight: '800', letterSpacing: '1.5px', fontSize: '0.85rem', color: isDark ? '#fff' : '#000' }}>
            <Globe size={16} color={isDark ? '#00f0ff' : '#0ea5e9'} /> MODULE HUB
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: '360px', position: 'relative', margin: '0 24px' }}>
          <Search size={14} style={{ position: 'absolute', left: '13px', top: '50%', transform: 'translateY(-50%)', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }} />
          <input type="text" className="custom-input" placeholder="Search within dossier..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '34px', borderRadius: '30px', padding: '8px 14px 8px 34px', fontSize: '0.8rem' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          <button className="glass-btn" style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 13px', borderRadius: '30px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontSize: '0.78rem', fontWeight: '500' }} onClick={e => { e.stopPropagation(); setIsUsersPanelOpen(p => !p); }}>
            <div className="pulse-dot" style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e' }} />
            <Users size={13} /> {onlineUsers.length}
          </button>

          {isUsersPanelOpen && (
            <div style={{ position: 'absolute', top: '120%', right: '55px', width: '240px', zIndex: 200, animation: 'slideUp 0.2s ease', background: isDark ? 'rgba(10,14,24,0.95)' : 'rgba(255,255,255,0.95)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '14px', padding: '10px', boxShadow: isDark ? '0 20px 50px rgba(0,0,0,0.7)' : '0 20px 50px rgba(0,0,0,0.15)', backdropFilter: 'blur(30px)' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase', color: isDark ? '#475569' : '#94a3b8', marginBottom: '10px', padding: '0 4px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, paddingBottom: '7px' }}>Active Nodes</div>
              {onlineUsers.length > 0 ? onlineUsers.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '7px' }}>
                  <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: `hsl(${(u.email.charCodeAt(0) * 47) % 360},60%,${isDark ? '40%' : '60%'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '800', color: '#fff', flexShrink: 0 }}>{u.email[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0, fontSize: '0.8rem', fontWeight: '600', color: isDark ? '#e2e8f0' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email.split('@')[0]}</div>
                  <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#22c55e' }} />
                </div>
              )) : <div style={{ padding: '10px 8px', fontSize: '0.8rem', color: isDark ? '#475569' : '#94a3b8', fontStyle: 'italic' }}>Only you are connected</div>}
            </div>
          )}

          <div style={{ width: '1px', height: '20px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0 4px' }} />
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            aria-label="Toggle theme"
            style={{
              position: 'relative', width: '52px', height: '28px', borderRadius: '999px', cursor: 'pointer',
              border: `1px solid ${isDark ? 'rgba(0,240,255,0.25)' : 'rgba(14,165,233,0.3)'}`,
              background: isDark ? 'linear-gradient(180deg, #0b1220, #060a12)' : 'linear-gradient(180deg, #cdeeff, #f0f9ff)',
              display: 'flex', alignItems: 'center', padding: '2px', flexShrink: 0,
            }}
          >
            <Sun size={13} style={{ position: 'absolute', left: '6px', color: isDark ? 'rgba(255,255,255,0.25)' : '#f59e0b', transition: 'color 0.25s ease' }} />
            <Moon size={12} style={{ position: 'absolute', right: '6px', color: isDark ? '#00f0ff' : 'rgba(0,0,0,0.2)', transition: 'color 0.25s ease' }} />
            <div
              className="theme-toggle-thumb"
              style={{
                width: '22px', height: '22px', borderRadius: '50%',
                background: isDark ? 'radial-gradient(circle at 35% 30%, #1e293b, #0f172a)' : 'radial-gradient(circle at 35% 30%, #fff7d6, #fbbf24)',
                boxShadow: isDark ? '0 0 10px rgba(0,240,255,0.5), inset 0 0 6px rgba(0,240,255,0.3)' : '0 0 10px rgba(251,191,36,0.6)',
                transform: isDark ? 'translateX(24px)' : 'translateX(0px)',
                transition: 'transform 0.28s cubic-bezier(0.34,1.56,0.64,1), background 0.25s ease',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
              }}
            >
              {isDark ? <Moon size={11} color="#00f0ff" /> : <Sun size={11} color="#b45309" />}
            </div>
          </button>
          <button className="glass-btn" onClick={() => signOut(auth).then(()=>navigate('/login'))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', width: '34px', height: '34px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444' }}>
            <LogOut size={15} />
          </button>
        </div>
      </header>

      {/* ── SHELL: SIDEBAR + MAIN ── */}
      <div className="hub-shell">

        <div className={`hub-sidebar-backdrop ${isMobileSidebarOpen ? 'open' : ''}`} onClick={() => setIsMobileSidebarOpen(false)} />

        <aside className={`hub-sidebar ${isMobileSidebarOpen ? 'open' : ''}`} onClick={(e) => e.stopPropagation()}>
          {/* ── ASSIGNED TO ME: notification-style, collapsed by default ── */}
          <div className="hub-side-notif">
            <button className="hub-notif-trigger" onClick={() => setIsActivityPanelOpen(o => !o)}>
              <Inbox size={15} color={isDark ? '#00f0ff' : '#0ea5e9'} />
              Assigned to Me
              {activityUnseenCount > 0 && <span className="hub-notif-badge">{activityUnseenCount}</span>}
              <ChevronDown size={14} className={`hub-chev ${isActivityPanelOpen ? 'open' : ''}`} />
            </button>
            <ProjectActivityPanel
              isDark={isDark}
              navigate={navigate}
              projectId={projectId}
              projectName={projectName}
              imList={imList}
              isOpen={isActivityPanelOpen}
              onClose={() => setIsActivityPanelOpen(false)}
              onUnseenCountChange={setActivityUnseenCount}
            />
          </div>

          {/* ── TEAM FEED: compact chat box, fills remaining sidebar height ── */}
          <div className="hub-side-feed">
            <div className="hub-feed-head"><MessageSquare size={13} color={isDark ? '#00f0ff' : '#0ea5e9'} /> Team Feed</div>

            <div className="hub-feed-messages">
              {updates.length > 0 ? updates.map(u => (
                <div key={u.id} className="hub-feed-msg">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '6px', background: `hsl(${(u.authorEmail?.charCodeAt(0) * 47 || 0) % 360},60%,${isDark ? '40%' : '60%'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
                        {u.authorEmail?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: '700', color: isDark ? '#e2e8f0' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.authorEmail?.split('@')[0]}</div>
                        <div style={{ fontSize: '0.6rem', color: isDark ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={9} /> {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Just now'}
                          {u.isEdited && <span style={{ fontStyle: 'italic', opacity: 0.7 }}>(edited)</span>}
                        </div>
                      </div>
                    </div>
                    {u.authorId === user?.uid && (
                      <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
                        <button onClick={() => { setEditingUpdateId(u.id); setEditUpdateText(u.text); }} style={{ background: 'none', border: 'none', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', padding: '2px' }} className="action-hover"><Edit3 size={11} /></button>
                        <button onClick={() => handleDeleteUpdate(u.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '2px' }} className="action-hover"><Trash2 size={11} /></button>
                      </div>
                    )}
                  </div>

                  {editingUpdateId === u.id ? (
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <input type="text" className="custom-input" value={editUpdateText} onChange={e => setEditUpdateText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveEdit(u.id)} autoFocus style={{ padding: '6px 10px', fontSize: '0.75rem' }} />
                      <button onClick={() => handleSaveEdit(u.id)} style={{ padding: '0 10px', borderRadius: '7px', background: '#22c55e', color: '#fff', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.7rem' }}>Save</button>
                      <button onClick={() => setEditingUpdateId(null)} style={{ padding: '0 10px', borderRadius: '7px', background: 'transparent', border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`, color: isDark ? '#fff' : '#000', cursor: 'pointer', fontSize: '0.7rem' }}>×</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.78rem', color: isDark ? '#cbd5e1' : '#334155', lineHeight: 1.45, wordBreak: 'break-word' }}>
                      {renderTextWithLinks(u.text)}
                    </div>
                  )}

                  <div style={{ marginTop: '8px', marginLeft: '10px', paddingLeft: '10px', borderLeft: `2px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                    {(u.replies || []).map(reply => (
                      <div key={reply.id} style={{ marginBottom: '8px', fontSize: '0.7rem' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '2px' }}>
                          <span style={{ fontWeight: '700', color: isDark ? '#e2e8f0' : '#0f172a' }}>{reply.authorEmail.split('@')[0]}</span>
                          <span style={{ fontSize: '0.58rem', color: isDark ? '#64748b' : '#94a3b8' }}>{new Date(reply.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <div style={{ color: isDark ? '#94a3b8' : '#475569', lineHeight: 1.4 }}>{renderTextWithLinks(reply.text)}</div>
                      </div>
                    ))}

                    {replyingToId === u.id ? (
                      <div style={{ display: 'flex', gap: '5px', marginTop: '4px' }}>
                        <input type="text" className="custom-input" placeholder="Reply..." value={replyInput} onChange={e => setReplyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostReply(u.id)} autoFocus style={{ padding: '6px 9px', fontSize: '0.72rem' }} />
                        <button onClick={() => handlePostReply(u.id)} style={{ padding: '0 9px', borderRadius: '7px', background: isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)', color: isDark ? '#00f0ff' : '#0ea5e9', border: 'none', fontWeight: '700', cursor: 'pointer', fontSize: '0.7rem' }}>Send</button>
                      </div>
                    ) : (
                      <button onClick={() => setReplyingToId(u.id)} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'none', border: 'none', color: isDark ? '#00f0ff' : '#0ea5e9', cursor: 'pointer', fontSize: '0.68rem', fontWeight: '700', padding: 0, opacity: 0.85 }}><CornerDownRight size={10} /> Reply</button>
                    )}
                  </div>
                </div>
              )) : <div className="hub-feed-empty">No updates yet. Say hello 👋</div>}
            </div>

            <div className="hub-feed-input-row">
              <div style={{ width: '26px', height: '26px', borderRadius: '7px', background: `hsl(${(user?.email?.charCodeAt(0) * 47 || 0) % 360},60%,${isDark ? '40%' : '60%'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.7rem', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <input type="text" className="custom-input" placeholder="Message the team…" value={updateInput} onChange={e => setUpdateInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostUpdate()} style={{ padding: '8px 12px', fontSize: '0.78rem' }} />
              <button
                onClick={handlePostUpdate}
                title="Send"
                disabled={!updateInput.trim()}
                className="hub-send-btn"
                style={{
                  width: '32px', height: '32px', flexShrink: 0, borderRadius: '50%', border: 'none',
                  background: updateInput.trim()
                    ? (isDark ? 'linear-gradient(135deg, #00f0ff, #0ea5e9)' : 'linear-gradient(135deg, #0ea5e9, #6366f1)')
                    : (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'),
                  color: updateInput.trim() ? '#04060a' : (isDark ? '#475569' : '#94a3b8'),
                  cursor: updateInput.trim() ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: updateInput.trim() ? '0 0 12px rgba(0,240,255,0.35)' : 'none',
                }}
              >
                <Send size={13} />
              </button>
            </div>
          </div>
        </aside>

        {/* ── MAIN WORKSPACE ── */}
        <main className="hub-main">

          {/* Dossier Header & Action Bar */}
          <div className="hub-dossier-head">
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: isDark ? '#00f0ff' : '#0ea5e9', fontSize: '0.7rem', fontWeight: '700', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>
                <Sparkles size={12} /> Active Dossier
              </div>
              <h1 className="hub-title">{projectName}</h1>
            </div>

            <div className="hub-actions-row">
              <ActionBtn
                isDark={isDark}
                disabled={imLimitReached}
                title={imLimitReached ? 'Only one Investment Memo is allowed per project' : 'New Investment Memo'}
                icon={imLimitReached ? <Lock size={13} color={isDark ? '#3f4b5c' : '#c1c9d2'} /> : <FileText size={13} color={isDark ? '#00f0ff' : '#0ea5e9'} />}
                label="IM"
                onClick={() => setActiveModal('im')}
              />
              <ActionBtn isDark={isDark} icon={<BarChart3 size={13} color="#22c55e" />} label="FSA" onClick={() => setActiveModal('fsa')} />
              <ActionBtn isDark={isDark} icon={<CheckCircle2 size={13} color="#f59e0b" />} label="FC" onClick={() => setActiveModal('fc')} />
              <ActionBtn isDark={isDark} icon={<Building2 size={13} color="#a855f7" />} label="BSA" onClick={() => setActiveModal('bsa')} />
              <ActionBtn isDark={isDark} icon={<Briefcase size={13} color="#ec4899" />} label="Profiling" onClick={() => navigate(`/profiling?project=${projectId}&name=${encodeURIComponent(projectName)}`)} />
              <ActionBtn isDark={isDark} icon={<Target size={13} color="#3b82f6" />} label="SRL" onClick={() => navigate('/srl-hub')} />
            </div>
          </div>

          {/* ── MODULE GRIDS (now laid out side by side to use the available width) ── */}
          <div className="hub-modules-grid">
            {renderGrid('Investment Memos', <FileText size={13} color={isDark ? '#00f0ff' : '#0ea5e9'} strokeWidth={2} />, imList, 'im')}
            {renderGrid('Financial Analysis', <BarChart3 size={13} color="#22c55e" strokeWidth={2} />, fsaList, 'fsa')}
            {renderGrid('First Connect', <CheckCircle2 size={13} color="#f59e0b" strokeWidth={2} />, fcList, 'fc')}
            {renderGrid('Bank Statements', <Building2 size={13} color="#a855f7" strokeWidth={2} />, bsaList, 'bsa')}
            {renderGrid('Company Profiling', <Briefcase size={13} color="#ec4899" strokeWidth={2} />, profilingList, 'profiling')}
            {renderGrid('Startup Readiness Level', <Target size={13} color="#3b82f6" strokeWidth={2} />, srlList, 'srl')}
          </div>

          {/* ── ARCHIVED DOSSIERS ── */}
          {archivedItems.length > 0 && (
            <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: `1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
              <h3 style={{ fontSize: '0.78rem', fontWeight: '800', color: isDark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
                <Trash2 size={14} /> Trash
              </h3>
              <div className="hub-card-grid">
                {archivedItems.map((item) => (
                  <div key={`${item.type}-${item.id}`} className="hub-card" style={{ opacity: 0.7, filter: 'grayscale(0.5)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{ padding: '6px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: '7px', color: isDark ? '#94a3b8' : '#64748b', fontWeight: '800', fontSize: '0.62rem' }}>
                          {item.typeName}
                        </div>
                        <h4 style={{ margin: 0, fontSize: '0.82rem', fontWeight: '600', color: isDark ? '#cbd5e1' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'line-through' }}>{item.title || item.companyName || 'Untitled'}</h4>
                      </div>
                    </div>
                    <div style={{ marginTop: 'auto', paddingTop: '10px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                      <button onClick={(e) => { e.stopPropagation(); handleRestore(item.id, item.type); }} style={{ flex: 1, padding: '5px', background: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.15)', border: `1px solid ${isDark ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.4)'}`, color: '#22c55e', borderRadius: '6px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }} className="glass-btn">
                        <RefreshCw size={11} /> Restore
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleHardDelete(item.id, item.type); }} style={{ flex: 1, padding: '5px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.68rem', fontWeight: '700', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }} className="action-hover">
                        <Trash2 size={11} /> Purge
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </main>
      </div>

      {activeOpsImId && (
        <IMTaskBoard
          imId={activeOpsImId}
          projectId={projectId}
          isDark={isDark}
          onClose={() => setActiveOpsImId(null)}
        />
      )}
    </div>
  );
}