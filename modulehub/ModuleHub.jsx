import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { 
  ArrowLeft, Search, Users, Sun, Moon, LogOut, 
  Plus, FileText, BarChart3, Network, Building2,
  CheckCircle2, MessageSquare, Trash2, Edit3, Globe,
  ShieldAlert, Sparkles, RefreshCw, Kanban,
  CornerDownRight, Clock, Link
} from 'lucide-react';
import { auth, db } from '../../firebase';
import { 
  collection, query, where, onSnapshot, addDoc, updateDoc, 
  deleteDoc, doc, serverTimestamp, setDoc, orderBy, getDoc 
} from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import IMTaskBoard from '../im/components/IMTaskBoard.jsx'; 
// ── 3D TILT CARD (Glass Slate) ──────────────────────────────────────────────
const TiltCard = React.memo(function TiltCard({ children, style, className, onClick }) {
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
    const rotX = ((y - cy) / cy) * -4;
    const rotY = ((x - cx) / cx) * 4;
    const glareX = (x / rect.width) * 100;
    const glareY = (y / rect.height) * 100;

    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-4px) scale(1.01)`;
      if (glowRef.current) {
        glowRef.current.style.background = `radial-gradient(180px circle at ${x}px ${y}px, rgba(0, 240, 255, 0.1), transparent 70%)`;
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
    if (cardRef.current) cardRef.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0) scale(1)';
    if (glowRef.current) glowRef.current.style.opacity = '0';
    if (glareRef.current) glareRef.current.style.opacity = '0';
  }, []);

  return (
    <div
      ref={cardRef} className={`tilt-card ${className || ''}`}
      style={{
        ...style, transformStyle: 'preserve-3d', willChange: 'transform',
        position: 'relative', overflow: 'hidden', cursor: 'pointer',
        transition: 'transform 0.4s cubic-bezier(0.23,1,0.32,1), box-shadow 0.4s ease, border-color 0.4s ease',
      }}
      onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave} onClick={onClick}
    >
      <div ref={glowRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.4s ease', zIndex: 0 }} />
      <div ref={glareRef} style={{ position: 'absolute', inset: 0, borderRadius: 'inherit', opacity: 0, pointerEvents: 'none', transition: 'opacity 0.4s ease', zIndex: 2, mixBlendMode: 'overlay' }} />
      <div style={{ position: 'relative', zIndex: 1, height: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
      <div style={{ background: isDark ? 'rgba(10,14,24,0.85)' : 'rgba(255,255,255,0.9)', border: `1px solid ${isDark ? 'rgba(0,240,255,0.2)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '16px', padding: '30px', width: '400px', boxShadow: isDark ? '0 24px 60px rgba(0,0,0,0.6), 0 0 30px rgba(0,240,255,0.05) inset' : '0 24px 60px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)' }}>
        <h3 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', fontWeight: '600', color: isDark ? '#fff' : '#000', display: 'flex', alignItems: 'center', gap: '10px' }}>
          {isDestructive ? <ShieldAlert color="#ef4444" /> : <Sparkles color="#00f0ff" size={18} />} {title}
        </h3>
        <div style={{ marginBottom: '24px' }}>{children}</div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={onClose} style={{ flex: 1, padding: '10px', borderRadius: '10px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontWeight: '500', transition: 'all 0.2s' }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 1, padding: '10px', borderRadius: '10px', background: isDestructive ? '#ef4444' : (isDark ? 'rgba(0,240,255,0.15)' : '#0ea5e9'), color: isDestructive ? '#fff' : (isDark ? '#00f0ff' : '#fff'), border: isDestructive ? 'none' : `1px solid ${isDark ? 'rgba(0,240,255,0.3)' : 'transparent'}`, cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', boxShadow: isDestructive ? '0 4px 15px rgba(239,68,68,0.3)' : (isDark ? '0 4px 15px rgba(0,240,255,0.2)' : '0 4px 15px rgba(14,165,233,0.3)') }}>{confirmText}</button>
        </div>
      </div>
    </div>
  );
};


// ── MAIN MODULE HUB ─────────────────────────────────────────────────────────
export default function ModuleHub() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const projectName = searchParams.get('name') || 'UNKNOWN_DOSSIER';

  const [theme, setTheme] = useState('dark');
  const [user, setUser] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isUsersPanelOpen, setIsUsersPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Data States
  const [imList, setImList] = useState([]);
  const [fsaList, setFsaList] = useState([]);
  const [fcList, setFcList] = useState([]);
  const [bsaList, setBsaList] = useState([]);
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
  const [activeOpsImId, setActiveOpsImId] = useState(null); // <-- ADDED Task Board State

  const isDark = theme === 'dark';
  const canvasRef = useRef(null);
  const mouseRef = useRef({ x: -9999, y: -9999 });
  const ripplesRef = useRef([]);

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
    // IMs
    unsubs.push(onSnapshot(query(collection(db, 'investment-memos'), where('projectId', '==', projectId)), snap => {
      setImList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    // FCs
    unsubs.push(onSnapshot(query(collection(db, 'first-connect-reports'), where('projectId', '==', projectId)), snap => {
      setFcList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    // FSAs
    unsubs.push(onSnapshot(collection(db, 'projects', projectId, 'fsa'), snap => {
      setFsaList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    // BSAs
    unsubs.push(onSnapshot(collection(db, 'projects', projectId, 'bsa'), snap => {
      setBsaList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }));
    // Updates
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
    const list = type === 'im' ? imList : type === 'fsa' ? fsaList : type === 'fc' ? fcList : type === 'bsa' ? bsaList : protocols;
    return list.find(i => i.id === id)?.title || 'Unknown Document';
  };

  // ── CREATION HANDLERS ──
  const handleCreateSimple = async () => {
    if (!modalInput.trim() || !user || !activeModal) return;
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
        title: modalInput.trim(), domain: fsaData.domain, entityType: fsaData.entityType,
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
      if (type === 'protocol') await deleteDoc(doc(db, 'projects', projectId, 'protocols', id)); // Protocols remain hard delete
      
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
        ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: isDark ? '#00f0ff' : '#0ea5e9', textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Link size={12} /> {part}</a>
        : <span key={i}>{part}</span>
    );
  };

  // ── INTERACTIVE CANVAS ENGINE ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    let raf; let time = 0;
    const PARTICLE_COUNT = window.innerWidth > 1024 ? 120 : 70;
    const CONNECT_DIST_SQ = 25000;
    const MOUSE_ATTRACT_DIST = 180;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', resize); resize();

    const handleCanvasClick = (e) => {
      ripplesRef.current.push({ x: e.clientX, y: e.clientY, radius: 0, alpha: 0.8, speed: 10 });
    };
    window.addEventListener('click', handleCanvasClick);
    const onMouseMove = (e) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMouseMove);

    const particles = Array.from({ length: PARTICLE_COUNT }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      size: Math.random() * 1.5 + 0.5, vx: (Math.random() - 0.5) * 0.2, vy: (Math.random() - 0.5) * 0.2,
      alpha: Math.random() * 0.5 + 0.2, twinkle: Math.random() * Math.PI * 2,
    }));

    // Background geometric nodes (Hexagons)
    const hexNodes = Array.from({ length: 6 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      radius: Math.random() * 80 + 40, rot: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.005, vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.1
    }));

    // Data Comets (Shooting Data Streams)
    const comets = Array.from({ length: 3 }, () => ({
      x: Math.random() * canvas.width, y: Math.random() * canvas.height,
      length: Math.random() * 150 + 50, speed: Math.random() * 4 + 4
    }));

    let g1, g2;
    const buildGradients = () => {
      g1 = ctx.createRadialGradient(canvas.width * 0.2, canvas.height * 0.8, 0, canvas.width * 0.2, canvas.height * 0.8, canvas.width * 0.6);
      g1.addColorStop(0, isDark ? 'rgba(0,240,255,0.08)' : 'rgba(0,240,255,0.05)'); // Cyan Nebula
      g1.addColorStop(1, 'transparent');
      g2 = ctx.createRadialGradient(canvas.width * 0.8, canvas.height * 0.2, 0, canvas.width * 0.8, canvas.height * 0.2, canvas.width * 0.6);
      g2.addColorStop(0, isDark ? 'rgba(176,85,255,0.08)' : 'rgba(176,85,255,0.05)'); // Violet Nebula
      g2.addColorStop(1, 'transparent');
    };
    buildGradients(); window.addEventListener('resize', buildGradients);

    const animate = () => {
      time += 0.005; ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = g1; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = g2; ctx.fillRect(0, 0, canvas.width, canvas.height);

      const mx = mouseRef.current.x, my = mouseRef.current.y;

      // 1. Hexagonal Data Cores (Slow background elements)
      hexNodes.forEach(hex => {
        hex.x += hex.vx; hex.y += hex.vy; hex.rot += hex.rotSpeed;
        if (hex.x < -150) hex.x = canvas.width + 150;
        if (hex.x > canvas.width + 150) hex.x = -150;
        if (hex.y < -150) hex.y = canvas.height + 150;
        if (hex.y > canvas.height + 150) hex.y = -150;

        ctx.save();
        ctx.translate(hex.x, hex.y);
        ctx.rotate(hex.rot);
        ctx.beginPath();
        for(let i=0; i<6; i++) {
          const angle = i * Math.PI / 3;
          ctx.lineTo(Math.cos(angle) * hex.radius, Math.sin(angle) * hex.radius);
        }
        ctx.closePath();
        ctx.strokeStyle = isDark ? 'rgba(0, 240, 255, 0.04)' : 'rgba(14, 165, 233, 0.04)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      });

      // 2. Data Comets
      comets.forEach(c => {
        c.x += c.speed; c.y += c.speed * 0.4;
        if (c.x > canvas.width + 200 || c.y > canvas.height + 200) {
          if (Math.random() > 0.5) { c.x = -200; c.y = Math.random() * canvas.height; }
          else { c.x = Math.random() * canvas.width; c.y = -200; }
          c.speed = Math.random() * 4 + 4;
          c.length = Math.random() * 150 + 50;
        }
        const grad = ctx.createLinearGradient(c.x, c.y, c.x - c.length, c.y - c.length * 0.4);
        grad.addColorStop(0, isDark ? 'rgba(176,85,255,0.6)' : 'rgba(14,165,233,0.6)');
        grad.addColorStop(1, 'transparent');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x - c.length, c.y - c.length * 0.4); ctx.stroke();
      });

      // 3. Ripples
      for (let i = ripplesRef.current.length - 1; i >= 0; i--) {
        const r = ripplesRef.current[i];
        r.radius += r.speed; r.alpha -= 0.02; r.speed *= 0.96;
        if (r.alpha <= 0) { ripplesRef.current.splice(i, 1); continue; }
        ctx.beginPath(); ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(0, 240, 255, ${r.alpha * 0.4})`;
        ctx.lineWidth = 1.5; ctx.stroke();
        particles.forEach(p => {
          const dist = Math.hypot(p.x - r.x, p.y - r.y);
          if (Math.abs(dist - r.radius) < 20) {
            p.vx += ((p.x - r.x) / dist) * r.alpha * 2;
            p.vy += ((p.y - r.y) / dist) * r.alpha * 2;
          }
        });
      }

      // 4. Flowing Network Connections
      ctx.save();
      ctx.setLineDash([4, 8]);
      ctx.lineDashOffset = -time * 50; // Makes lines actively stream

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const distSq = (p.x - mx) ** 2 + (p.y - my) ** 2;
        
        if (distSq < MOUSE_ATTRACT_DIST ** 2) {
          const dist = Math.sqrt(distSq);
          p.vx += ((p.x - mx) / dist) * ((MOUSE_ATTRACT_DIST - dist) / MOUSE_ATTRACT_DIST) * 0.3;
          p.vy += ((p.y - my) / dist) * ((MOUSE_ATTRACT_DIST - dist) / MOUSE_ATTRACT_DIST) * 0.3;
        }
        
        p.vx *= 0.98; p.vy *= 0.98; p.x += p.vx; p.y += p.vy; p.twinkle += 0.01;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dSq = (p.x - p2.x) ** 2 + (p.y - p2.y) ** 2;
          
          if (dSq < CONNECT_DIST_SQ) {
            const op = (1 - dSq / CONNECT_DIST_SQ) * 0.2;
            
            // Draw flowing dashed line
            ctx.strokeStyle = isDark ? `rgba(0,240,255,${op})` : `rgba(0,150,255,${op})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();

            // Draw data packet moving along line for random connections
            if ((i + j) % 5 === 0) {
              const progress = (time * (((i+j)%3+1)*0.5) ) % 1; 
              const px = p.x + (p2.x - p.x) * progress;
              const py = p.y + (p2.y - p.y) * progress;
              ctx.beginPath();
              ctx.arc(px, py, 1.5, 0, Math.PI * 2);
              ctx.fillStyle = isDark ? `rgba(176,85,255, ${op * 4})` : `rgba(14,165,233, ${op * 4})`;
              ctx.fill();
            }
          }
        }
      }
      ctx.restore();

      // 5. Draw Particle Nodes
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
      window.removeEventListener('resize', buildGradients);
      window.removeEventListener('click', handleCanvasClick);
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
    ];
    return items.sort((a, b) => (b.archivedAt?.toMillis?.() || 0) - (a.archivedAt?.toMillis?.() || 0));
  }, [imList, fsaList, fcList, bsaList]);

  const cardBase = {
    background: isDark ? 'rgba(10,14,24,0.6)' : 'rgba(255,255,255,0.7)',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
    backdropFilter: 'blur(16px)', borderRadius: '12px', padding: '16px',
    boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.4)' : '0 8px 20px rgba(0,0,0,0.05)',
  };

  const renderGrid = (title, icon, list, type) => {
    const filtered = list.filter(item => !item.archived && item.title?.toLowerCase().includes(searchQuery.toLowerCase()));
    return (
      <div style={{ marginBottom: '40px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: '700', color: isDark ? '#94a3b8' : '#64748b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon} {title}
        </h3>
        {filtered.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '20px' }}>
            {filtered.map((item, i) => (
              <TiltCard 
                key={item.id} style={{...cardBase, animation: `fadeIn 0.4s ${i * 0.05}s both`}}
                onClick={() => navigate(`/${type === 'fsa' ? 'fsa' : type === 'fc' ? 'fc' : type === 'bsa' ? 'bsa' : 'im'}?project=${projectId}&${type}=${item.id}&name=${encodeURIComponent(projectName)}`)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{ padding: '8px', background: isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)', borderRadius: '8px' }}>
                      {icon}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: isDark ? '#fff' : '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title || 'Untitled'}</h4>
                      {type === 'fsa' && (
                        <div style={{ fontSize: '0.65rem', color: isDark ? '#00f0ff' : '#0ea5e9', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px', fontWeight: '600' }}>
                          {entityMap[item.entityType] || item.entityType} · {domainMap[item.domain] || item.domain}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* <-- ADDED: Ops Kanban Button for IMs --> */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {type === 'im' && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveOpsImId(item.id); }} 
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', border: 'none', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', padding: '4px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s' }} 
                        className="glass-btn"
                      >
                        <Kanban size={12} /> Ops
                      </button>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); setDeleteTarget({id: item.id, type}); setActiveModal('delete'); }} style={{ background: 'transparent', border: 'none', color: isDark ? '#64748b' : '#94a3b8', cursor: 'pointer', padding: '4px', borderRadius: '6px' }} className="action-hover">
                      <Trash2 size={14} />
                    </button>
                  </div>

                </div>
                <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: isDark ? '#64748b' : '#94a3b8' }}>
                  <span>{formatTime(item.createdAt)}</span>
                  <span style={{ fontWeight: '700', color: isDark ? '#00f0ff' : '#0ea5e9' }}>OPEN ➔</span>
                </div>
              </TiltCard>
            ))}
          </div>
        ) : (
          <div style={{ padding: '30px', textAlign: 'center', color: isDark ? '#475569' : '#94a3b8', border: `1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '12px', fontSize: '0.9rem', fontStyle: 'italic', background: isDark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}>
            No {title} records found.
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', fontFamily: '"Inter", sans-serif', backgroundColor: isDark ? '#04060a' : '#f0f4f8', color: isDark ? '#e2e8f0' : '#0f172a', overflowX: 'hidden', position: 'relative' }} onClick={() => setIsUsersPanelOpen(false)}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: ${isDark ? 'rgba(0,240,255,0.2)' : 'rgba(0,0,0,0.15)'}; border-radius: 4px; }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) scale(0.98); } to { opacity: 1; transform: translateY(0) scale(1); } }
        @keyframes smooth-breathe { 0%, 100% { box-shadow: 0 0 10px rgba(0,240,255,0.4); transform: scale(1); } 50% { box-shadow: 0 0 20px rgba(0,240,255,0.8); transform: scale(1.1); } }
        .pulse-dot { animation: smooth-breathe 3s ease-in-out infinite; }
        
        .glass-btn { transition: all 0.3s cubic-bezier(0.23, 1, 0.32, 1); }
        .glass-btn:hover { background: ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)'} !important; transform: translateY(-2px); border-color: ${isDark ? 'rgba(0,240,255,0.3)' : 'rgba(14,165,233,0.3)'} !important; box-shadow: 0 4px 15px ${isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)'}; color: ${isDark ? '#00f0ff' : '#0ea5e9'} !important; }
        
        .action-hover:hover { background: rgba(239,68,68,0.15) !important; color: #ef4444 !important; transform: scale(1.1); }
        .check-hover:hover { border-color: #22c55e !important; }
        
        .panel-glass { background: ${isDark ? 'rgba(10,14,24,0.5)' : 'rgba(255,255,255,0.6)'}; border: 1px solid ${isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}; backdrop-filter: blur(16px); border-radius: 16px; padding: 24px; box-shadow: ${isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 24px rgba(0,0,0,0.05)'}; }
        
        .custom-input { width: 100%; padding: 12px 16px; border-radius: 10px; border: 1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}; background: ${isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.8)'}; color: inherit; font-family: inherit; font-size: 0.9rem; outline: none; transition: all 0.3s; }
        .custom-input:focus { border-color: ${isDark ? '#00f0ff' : '#0ea5e9'}; box-shadow: 0 0 0 3px ${isDark ? 'rgba(0,240,255,0.15)' : 'rgba(14,165,233,0.15)'}; }
      `}</style>

      <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0, pointerEvents: 'none' }} />

      {/* ── MODALS ── */}
      <GlassModal isOpen={activeModal === 'im' || activeModal === 'fc' || activeModal === 'bsa' || activeModal === 'protocol'} title={`Initialize New ${activeModal === 'im' ? 'Investment Memo' : activeModal === 'fc' ? 'First Connect' : activeModal === 'bsa' ? 'Bank Analysis' : 'Protocol'}`} onClose={() => {setActiveModal(null); setModalInput('');}} onConfirm={handleCreateSimple} confirmText="Initialize" isDark={isDark}>
        <input type="text" className="custom-input" placeholder="Enter designation..." value={modalInput} onChange={e => setModalInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreateSimple()} autoFocus />
      </GlassModal>

      <GlassModal isOpen={activeModal === 'fsa'} title="Initialize Financial Analysis" onClose={() => {setActiveModal(null); setModalInput('');}} onConfirm={handleCreateFsa} confirmText="Initialize" isDark={isDark}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '6px', display: 'block' }}>Designation Name</label>
            <input type="text" className="custom-input" placeholder="e.g. Acme Corp FY24" value={modalInput} onChange={e => setModalInput(e.target.value)} autoFocus />
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '6px', display: 'block' }}>Domain / Industry</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <select className="custom-input" value={fsaData.domain} onChange={e => setFsaData({...fsaData, domain: e.target.value})} style={{ flex: 1 }}>
                {rawDomains.length ? rawDomains.map(d => <option key={d.id} value={d.id}>{d.label}</option>) : <option value="">No domains found</option>}
              </select>
              <button onClick={handleCustomDomain} style={{ padding: '0 16px', borderRadius: '10px', border: `1px solid ${isDark ? 'rgba(0,240,255,0.3)' : 'rgba(14,165,233,0.3)'}`, background: isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)', color: isDark ? '#00f0ff' : '#0ea5e9', cursor: 'pointer', fontWeight: '600' }}>+</button>
            </div>
          </div>
          <div>
            <label style={{ fontSize: '0.8rem', color: isDark ? '#94a3b8' : '#64748b', marginBottom: '6px', display: 'block' }}>Entity Structure</label>
            <select className="custom-input" value={fsaData.entityType} onChange={e => setFsaData({...fsaData, entityType: e.target.value})}>
              {rawEntities.length ? rawEntities.map(e => <option key={e.key} value={e.key}>{e.label}</option>) : <option value="">No entities found</option>}
            </select>
          </div>
        </div>
      </GlassModal>

      <GlassModal isOpen={activeModal === 'delete'} title="Confirm Archive" onClose={() => setDeleteTarget(null)} onConfirm={handleDelete} confirmText="Archive Dossier" isDestructive isDark={isDark}>
        <p style={{ margin: 0, fontSize: '0.9rem', color: isDark ? '#cbd5e1' : '#475569', lineHeight: 1.5 }}>Are you sure you want to archive this record? It will be safely removed from your active workspace view.</p>
      </GlassModal>

      {/* ── TOPBAR ── */}
      <header style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '70px', background: isDark ? 'linear-gradient(180deg, rgba(4,6,10,0.85) 0%, rgba(4,6,10,0.6) 100%)' : 'linear-gradient(180deg, rgba(240,244,248,0.9) 0%, rgba(240,244,248,0.7) 100%)', backdropFilter: 'blur(24px)', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', zIndex: 100 }}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          <button onClick={() => navigate('/')} style={{ background: 'transparent', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, color: isDark ? '#fff' : '#000', padding: '8px 16px', borderRadius: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', fontWeight: '500', transition: 'all 0.2s' }} onMouseEnter={e => e.currentTarget.style.borderColor = isDark ? '#00f0ff' : '#0ea5e9'} onMouseLeave={e => e.currentTarget.style.borderColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}>
            <ArrowLeft size={16} /> Back to Archive
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontWeight: '800', letterSpacing: '2px', fontSize: '1rem', color: isDark ? '#fff' : '#000' }}>
            <Globe size={18} color={isDark ? '#00f0ff' : '#0ea5e9'} /> MODULE HUB
          </div>
        </div>

        <div style={{ flex: 1, maxWidth: '400px', position: 'relative', margin: '0 32px' }}>
          <Search size={16} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }} />
          <input type="text" className="custom-input" placeholder="Search within dossier..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '42px', borderRadius: '30px' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', position: 'relative' }}>
          <button className="glass-btn" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '30px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer', fontSize: '0.85rem', fontWeight: '500' }} onClick={e => { e.stopPropagation(); setIsUsersPanelOpen(p => !p); }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }} />
            <Users size={15} /> {onlineUsers.length}
          </button>

          {isUsersPanelOpen && (
            <div style={{ position: 'absolute', top: '120%', right: '60px', width: '260px', zIndex: 200, animation: 'slideUp 0.25s ease', background: isDark ? 'rgba(10,14,24,0.95)' : 'rgba(255,255,255,0.95)', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, borderRadius: '16px', padding: '12px', boxShadow: isDark ? '0 20px 50px rgba(0,0,0,0.7)' : '0 20px 50px rgba(0,0,0,0.15)', backdropFilter: 'blur(30px)' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase', color: isDark ? '#475569' : '#94a3b8', marginBottom: '12px', padding: '0 4px', borderBottom: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, paddingBottom: '8px' }}>Active Nodes</div>
              {onlineUsers.length > 0 ? onlineUsers.map((u, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px', borderRadius: '10px' }}>
                  <div style={{ width: '30px', height: '30px', borderRadius: '8px', background: `hsl(${(u.email.charCodeAt(0) * 47) % 360},60%,${isDark ? '40%' : '60%'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: '800', color: '#fff', flexShrink: 0 }}>{u.email[0].toUpperCase()}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: '600', color: isDark ? '#e2e8f0' : '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.email.split('@')[0]}</div>
                  </div>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} />
                </div>
              )) : <div style={{ padding: '12px 8px', fontSize: '0.85rem', color: isDark ? '#475569' : '#94a3b8', fontStyle: 'italic' }}>Only you are connected</div>}
            </div>
          )}

          <div style={{ width: '1px', height: '24px', background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)', margin: '0 6px' }} />
          <button className="glass-btn" onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} style={{ background: 'transparent', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`, borderRadius: '50%', cursor: 'pointer', padding: '10px', color: isDark ? '#94a3b8' : '#64748b' }}>
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <button className="glass-btn" onClick={() => signOut(auth).then(()=>navigate('/login'))} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '10px', color: '#ef4444' }}>
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* ── MAIN WORKSPACE ── */}
      <main style={{ position: 'relative', zIndex: 10, maxWidth: '1400px', margin: '0 auto', padding: '120px 40px 80px' }}>
        
        {/* Dossier Header & Action Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '48px', flexWrap: 'wrap', gap: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: isDark ? '#00f0ff' : '#0ea5e9', fontSize: '0.85rem', fontWeight: '600', letterSpacing: '2px', textTransform: 'uppercase', marginBottom: '12px' }}>
              <Sparkles size={16} /> Active Dossier Profile
            </div>
            <h1 style={{ fontSize: '3.5rem', fontWeight: '200', margin: 0, letterSpacing: '-1.5px', color: isDark ? '#fff' : '#000' }}>{projectName}</h1>
          </div>
          
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <button className="glass-btn" onClick={() => setActiveModal('im')} style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? '#fff' : '#000', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, padding: '10px 20px', borderRadius: '12px', fontWeight: '600' }}><FileText size={16} color={isDark ? '#00f0ff' : '#0ea5e9'} /> + IM</button>
            <button className="glass-btn" onClick={() => setActiveModal('fsa')} style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? '#fff' : '#000', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, padding: '10px 20px', borderRadius: '12px', fontWeight: '600' }}><BarChart3 size={16} color="#22c55e" /> + FSA</button>
            <button className="glass-btn" onClick={() => setActiveModal('fc')} style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? '#fff' : '#000', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, padding: '10px 20px', borderRadius: '12px', fontWeight: '600' }}><CheckCircle2 size={16} color="#f59e0b" /> + FC</button>
            <button className="glass-btn" onClick={() => setActiveModal('bsa')} style={{ background: isDark ? 'rgba(255,255,255,0.03)' : '#fff', color: isDark ? '#fff' : '#000', border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}`, padding: '10px 20px', borderRadius: '12px', fontWeight: '600' }}><Building2 size={16} color="#a855f7" /> + BSA</button>
          </div>
        </div>

       {/* ── PROGRESS FEED (FULL WIDTH) ── */}
        <div style={{ marginBottom: '60px' }}>
          <div className="panel-glass" style={{ display: 'flex', flexDirection: 'column', maxHeight: '600px' }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '1rem', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '1px', color: isDark ? '#94a3b8' : '#64748b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <MessageSquare size={18} color={isDark ? '#00f0ff' : '#0ea5e9'} /> Global Network Feed
            </h3>
            
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', paddingRight: '8px', marginBottom: '20px' }}>
              {updates.length > 0 ? updates.map(u => (
                <div key={u.id} style={{ padding: '16px', background: isDark ? 'rgba(0,0,0,0.3)' : 'rgba(255,255,255,0.7)', borderRadius: '12px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                  
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: `hsl(${(u.authorEmail?.charCodeAt(0) * 47 || 0) % 360},60%,${isDark ? '40%' : '60%'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', fontWeight: '800', color: '#fff' }}>
                        {u.authorEmail?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div>
                        <div style={{ fontSize: '0.85rem', fontWeight: '600', color: isDark ? '#e2e8f0' : '#0f172a' }}>{u.authorEmail?.split('@')[0]}</div>
                        <div style={{ fontSize: '0.7rem', color: isDark ? '#64748b' : '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={10} /> {u.createdAt?.toDate ? u.createdAt.toDate().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'}) : 'Just now'}
                          {u.isEdited && <span style={{ fontStyle: 'italic', opacity: 0.7 }}>(edited)</span>}
                        </div>
                      </div>
                    </div>
                    
                    {u.authorId === user?.uid && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setEditingUpdateId(u.id); setEditUpdateText(u.text); }} style={{ background: 'none', border: 'none', color: isDark ? '#94a3b8' : '#64748b', cursor: 'pointer' }} className="action-hover"><Edit3 size={14} /></button>
                        <button onClick={() => handleDeleteUpdate(u.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }} className="action-hover"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>

                  {editingUpdateId === u.id ? (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                      <input type="text" className="custom-input" value={editUpdateText} onChange={e => setEditUpdateText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSaveEdit(u.id)} autoFocus />
                      <button onClick={() => handleSaveEdit(u.id)} style={{ padding: '0 16px', borderRadius: '10px', background: '#22c55e', color: '#fff', border: 'none', fontWeight: '600', cursor: 'pointer' }}>Save</button>
                      <button onClick={() => setEditingUpdateId(null)} style={{ padding: '0 16px', borderRadius: '10px', background: 'transparent', border: `1px solid ${isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)'}`, color: isDark ? '#fff' : '#000', cursor: 'pointer' }}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '0.95rem', color: isDark ? '#cbd5e1' : '#334155', lineHeight: 1.6, marginBottom: '12px', wordBreak: 'break-word' }}>
                      {renderTextWithLinks(u.text)}
                    </div>
                  )}

                  <div style={{ marginLeft: '42px', paddingLeft: '16px', borderLeft: `2px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}` }}>
                    {(u.replies || []).map(reply => (
                      <div key={reply.id} style={{ marginBottom: '12px', fontSize: '0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
                          <span style={{ fontWeight: '600', color: isDark ? '#e2e8f0' : '#0f172a' }}>{reply.authorEmail.split('@')[0]}</span>
                          <span style={{ fontSize: '0.65rem', color: isDark ? '#64748b' : '#94a3b8' }}>{new Date(reply.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'})}</span>
                        </div>
                        <div style={{ color: isDark ? '#94a3b8' : '#475569', lineHeight: 1.5 }}>{renderTextWithLinks(reply.text)}</div>
                      </div>
                    ))}
                    
                    {replyingToId === u.id ? (
                       <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                         <input type="text" className="custom-input" placeholder="Type reply..." value={replyInput} onChange={e => setReplyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostReply(u.id)} autoFocus style={{ padding: '8px 12px', fontSize: '0.8rem' }} />
                         <button onClick={() => handlePostReply(u.id)} style={{ padding: '0 12px', borderRadius: '8px', background: isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)', color: isDark ? '#00f0ff' : '#0ea5e9', border: 'none', fontWeight: '600', cursor: 'pointer', fontSize: '0.8rem' }}>Reply</button>
                         <button onClick={() => { setReplyingToId(null); setReplyInput(''); }} style={{ padding: '0 12px', borderRadius: '8px', background: 'transparent', color: isDark ? '#94a3b8' : '#64748b', border: 'none', cursor: 'pointer', fontSize: '0.8rem' }}>Cancel</button>
                       </div>
                    ) : (
                      <button onClick={() => setReplyingToId(u.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: isDark ? '#00f0ff' : '#0ea5e9', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '600', padding: 0, opacity: 0.8 }}><CornerDownRight size={12} /> Reply</button>
                    )}
                  </div>
                </div>
              )) : <div style={{ textAlign: 'center', color: isDark ? '#475569' : '#94a3b8', fontStyle: 'italic', fontSize: '0.9rem', padding: '40px' }}>No global updates logged. Be the first to transmit.</div>}
            </div>

            <div style={{ display: 'flex', gap: '12px', background: isDark ? 'rgba(0,0,0,0.4)' : '#fff', padding: '16px', borderRadius: '12px', border: `1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}` }}>
              <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: `hsl(${(user?.email?.charCodeAt(0) * 47 || 0) % 360},60%,${isDark ? '40%' : '60%'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', fontWeight: '800', color: '#fff', flexShrink: 0 }}>
                {user?.email?.[0]?.toUpperCase() || '?'}
              </div>
              <input type="text" className="custom-input" placeholder="Transmit network update..." value={updateInput} onChange={e => setUpdateInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostUpdate()} style={{ background: 'transparent', border: 'none', boxShadow: 'none', padding: '0 8px', fontSize: '0.95rem' }} />
              <button onClick={handlePostUpdate} style={{ padding: '0 24px', borderRadius: '10px', background: isDark ? 'rgba(0,240,255,0.1)' : 'rgba(14,165,233,0.1)', border: `1px solid ${isDark ? 'rgba(0,240,255,0.3)' : 'rgba(14,165,233,0.3)'}`, color: isDark ? '#00f0ff' : '#0ea5e9', fontWeight: '700', cursor: 'pointer', transition: 'all 0.2s' }} className="glass-btn">Transmit</button>
            </div>
          </div>
        </div>


       {/* ── MODULE GRIDS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {renderGrid('Investment Memos', <FileText size={24} color={isDark ? '#00f0ff' : '#0ea5e9'} strokeWidth={1.5} />, imList, 'im')}
          {renderGrid('Financial Analysis', <BarChart3 size={24} color="#22c55e" strokeWidth={1.5} />, fsaList, 'fsa')}
          {renderGrid('First Connect', <CheckCircle2 size={24} color="#f59e0b" strokeWidth={1.5} />, fcList, 'fc')}
          {renderGrid('Bank Statements', <Building2 size={24} color="#a855f7" strokeWidth={1.5} />, bsaList, 'bsa')}
        </div>

        {/* ── ARCHIVED DOSSIERS ── */}
        {archivedItems.length > 0 && (
          <div style={{ marginTop: '60px', paddingTop: '40px', borderTop: `1px dashed ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'}` }}>
            <h3 style={{ fontSize: '1rem', fontWeight: '700', color: isDark ? '#64748b' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Trash2 size={20} /> Deep Archive
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(260px,1fr))', gap: '20px' }}>
              {archivedItems.map((item) => (
                <TiltCard key={`${item.type}-${item.id}`} style={{...cardBase, opacity: 0.7, filter: 'grayscale(0.5)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                      <div style={{ padding: '8px', background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', borderRadius: '8px', color: isDark ? '#94a3b8' : '#64748b', fontWeight: '800', fontSize: '0.7rem' }}>
                        {item.typeName}
                      </div>
                      <div>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: '600', color: isDark ? '#cbd5e1' : '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: 'line-through' }}>{item.title || 'Untitled'}</h4>
                      </div>
                    </div>
                  </div>
                  <div style={{ marginTop: 'auto', paddingTop: '12px', borderTop: `1px solid ${isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)'}`, display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <button onClick={(e) => { e.stopPropagation(); handleRestore(item.id, item.type); }} style={{ flex: 1, padding: '6px', background: isDark ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.15)', border: `1px solid ${isDark ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.4)'}`, color: '#22c55e', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} className="glass-btn">
                      <RefreshCw size={12} /> Restore
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleHardDelete(item.id, item.type); }} style={{ flex: 1, padding: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#ef4444', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }} className="action-hover">
                      <Trash2 size={12} /> Purge
                    </button>
                  </div>
                </TiltCard>
              ))}
            </div>
          </div>
        )}

      </main> {/* <--- MOVE THIS UP HERE */}

      {/* <-- MOVED: Task Board Modal Render is now OUTSIDE of <main> --> */}
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
