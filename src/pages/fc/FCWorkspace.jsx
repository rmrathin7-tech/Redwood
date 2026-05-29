import  { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Settings, Sun, Moon, Menu,
  CheckCircle2, ShieldAlert, Loader2, ChevronDown, Lock, PanelLeftClose,
  MessageSquare
} from 'lucide-react';
import { auth, db } from '../../firebase.js';
import {
  doc, onSnapshot, updateDoc, serverTimestamp, setDoc, collection
} from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

// ── TRUE CODE REUSE: Importing components directly from the IM folder! ──
import BlockRegistry from '../im/components/BlockRegistry.jsx';
import CommentsSidebar from '../im/components/CommentsSidebar.jsx';

// ── AVATAR COLOR POOL ──────────────────────────────────────────────────────
const AVATAR_COLORS = ['#3b82f6','#10b981','#8b5cf6','#f59e0b','#ec4899','#06b6d4'];
const avatarColor = (uid) => AVATAR_COLORS[(uid?.charCodeAt(0) || 0) % AVATAR_COLORS.length];

// ── STAGGER DELAY per block index ─────────────────────────────────────────
const STAGGER_MS = 40;

export default function FCWorkspace() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  
  // FIX: Using 'fc' instead of 'im'
  const fcId = searchParams.get('fc');
  const projectName = searchParams.get('name') || 'Active Dossier';

  const [user, setUser] = useState(null);
  const [schema, setSchema] = useState([]);
  const [fcData, setFcData] = useState({});
  const [activeLocks, setActiveLocks] = useState({});
  const [activeSection, setActiveSection] = useState(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState('idle');
  const [theme, setTheme] = useState('dark');
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});
  const [sectionTransition, setSectionTransition] = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [visibleBlocks, setVisibleBlocks] = useState(new Set());
  const [myLockedBlock, setMyLockedBlock] = useState(null);
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false);

  const saveTimers = useRef({});
  const savedTimers = useRef({});
  const mainRef = useRef(null);
  const isDark = theme === 'dark';

  const T = useMemo(() => ({
    bg:         isDark ? '#060910'                    : '#f1f5f9',
    surface:    isDark ? '#0d1117'                    : '#ffffff',
    surface2:   isDark ? '#111827'                    : '#f8fafc',
    surface3:   isDark ? 'rgba(255,255,255,0.03)'     : 'rgba(0,0,0,0.03)',
    border:     isDark ? 'rgba(255,255,255,0.07)'     : 'rgba(0,0,0,0.09)',
    text:       isDark ? '#f1f5f9'                    : '#0f172a',
    textMuted:  isDark ? '#64748b'                    : '#94a3b8',
    textSub:    isDark ? '#475569'                    : '#cbd5e1',
    accent:     '#f59e0b', // Changed accent to Amber for FC
    accentDim:  isDark ? 'rgba(245,158,11,0.12)'      : 'rgba(217,119,6,0.07)',
    accentGlow: 'rgba(245,158,11,0.2)',
    green:      '#10b981',
    amber:      '#f59e0b',
    amberDim:   'rgba(245,158,11,0.12)',
    header:     isDark ? 'rgba(6,9,16,0.92)'          : 'rgba(255,255,255,0.92)',
    sidebar:    isDark ? '#080c14'                    : '#ffffff',
    shadow:     isDark ? '0 1px 3px rgba(0,0,0,0.4)' : '0 1px 3px rgba(0,0,0,0.06)',
    shadowLg:   isDark ? '0 8px 32px rgba(0,0,0,0.6)': '0 8px 32px rgba(0,0,0,0.1)',
  }), [isDark]);

  // Auth & Presence
  useEffect(() => {
    if (!projectId || !fcId) { navigate('/module-hub'); return; }
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) { navigate('/login'); return; }
      setUser(u);
      const userRef = doc(db, 'workspace-users', u.uid);
      await setDoc(userRef, {
        userId: u.uid, email: u.email, isOnline: true,
        currentPage: 'fc', currentFC: { id: projectId, title: projectName }, // Updated to FC
        currentBlockId: null, lastActive: serverTimestamp(),
      }, { merge: true });
      const hb = setInterval(() => updateDoc(userRef, { lastActive: serverTimestamp() }), 30000);
      const bye = () => updateDoc(userRef, { isOnline: false, currentBlockId: null, lastActive: serverTimestamp() });
      window.addEventListener('beforeunload', bye);
      return () => { clearInterval(hb); window.removeEventListener('beforeunload', bye); };
    });
    return unsub;
  }, [projectId, fcId, projectName, navigate]);

  // FIX: Load from 'fc-schema'
  useEffect(() => {
    if (!fcId) return;
    return onSnapshot(doc(db, 'config', 'fc-schema'), (snap) => {
      if (snap.exists()) {
        const sections = snap.data().sections || [];
        setSchema(sections);
        setActiveSection(prev => prev ?? (sections[0]?.key || null));
      }
    });
  }, [fcId]);

  // FIX: Load from 'first-connect-reports'
  useEffect(() => {
    if (!fcId) return;
    return onSnapshot(doc(db, 'first-connect-reports', fcId), (snap) => {
      if (snap.exists()) setFcData(prev => ({ ...prev, ...(snap.data().data || {}) }));
    });
  }, [fcId]);

  // Multiplayer Presence Sync
  useEffect(() => {
    if (!projectId) return;
    return onSnapshot(collection(db, 'workspace-users'), (snap) => {
      const now = Date.now();
      const locks = {}, online = [];
      snap.docs.forEach(d => {
        const u = d.data();
        const lastActive = u.lastActive?.toMillis?.() || 0;
        if (!u.isOnline || now - lastActive > 45_000) return;
        if (u.currentFC?.id !== projectId) return; // Check currentFC instead of currentIM
        online.push({ uid: u.userId, email: u.email, section: u.currentSection });
        if (u.currentBlockId && user && u.userId !== user.uid) {
          locks[u.currentBlockId] = { email: u.email, uid: u.userId };
        }
      });
      setActiveLocks(locks);
      setOnlineUsers(online);
    });
  }, [projectId, user]);

  const handleDataChange = useCallback(async (dataPath, value, blockId) => {
    if (!dataPath || !fcId) return;
    setFcData(prev => {
      const next = { ...prev };
      const keys = dataPath.split('.');
      let cur = next;
      for (let i = 0; i < keys.length - 1; i++) {
        if (typeof cur[keys[i]] !== 'object' || cur[keys[i]] === null) cur[keys[i]] = {};
        cur = cur[keys[i]];
      }
      cur[keys[keys.length - 1]] = value;
      return next;
    });
    setSaveStatus('saving');
    clearTimeout(saveTimers.current[dataPath]);
    saveTimers.current[dataPath] = setTimeout(async () => {
      try {
        // FIX: Save to 'first-connect-reports'
        await updateDoc(doc(db, 'first-connect-reports', fcId), {
          [`data.${dataPath}`]: value,
          updatedAt: serverTimestamp(),
        });
        setSaveStatus('saved');
        if (blockId) {
          window.dispatchEvent(new CustomEvent('im-block-saved', { detail: { blockId } }));
        }
        clearTimeout(savedTimers.current.main);
        savedTimers.current.main = setTimeout(() => setSaveStatus('idle'), 3000);
      } catch (err) {
        console.error('[FCWorkspace] Save failed:', dataPath, err);
        setSaveStatus('error');
      }
    }, 700);
  }, [fcId]);

  const handleBlockFocus = useCallback(async (blockId) => {
    if (!user) return;
    setMyLockedBlock(blockId);
    await updateDoc(doc(db, 'workspace-users', user.uid), {
      currentBlockId: blockId,
      currentSection: activeSection,
    });
  }, [user, activeSection]);

  const handleBlockBlur = useCallback(async () => {
    if (!user) return;
    setMyLockedBlock(null);
    await updateDoc(doc(db, 'workspace-users', user.uid), { currentBlockId: null });
  }, [user]);

  const handleSectionClick = useCallback(async (sectionKey) => {
    if (sectionKey === activeSection) return;
    setSectionTransition(true);
    setVisibleBlocks(new Set());
    setTimeout(() => {
      setActiveSection(sectionKey);
      setSectionTransition(false);
      if (mainRef.current) mainRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }, 130);
    if (user) await updateDoc(doc(db, 'workspace-users', user.uid), {
      currentBlockId: null,
      currentSection: sectionKey,
    });
  }, [user, activeSection]);

  const toggleGroup = useCallback((groupId) =>
    setCollapsedGroups(p => ({ ...p, [groupId]: !p[groupId] })), []);

  const activeSectionSchema = useMemo(() =>
    schema.find(s => s.key === activeSection), [schema, activeSection]);
  const activeSectionChildren = useMemo(() => {
    if (!activeSectionSchema?.id) return [];
    return schema
      .filter(s => s.parentId === activeSectionSchema.id)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [schema, activeSectionSchema]);
  const activeSectionHasBlocks = (activeSectionSchema?.blocks || []).length > 0;
  const showSubsectionPrompt = !!activeSectionSchema && !activeSectionHasBlocks && activeSectionChildren.length > 0;

  useEffect(() => {
    if (!activeSectionSchema) return;
    const blocks = (activeSectionSchema.blocks || [])
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    setVisibleBlocks(new Set());
    const timers = blocks.map((block, i) =>
      setTimeout(() => {
        setVisibleBlocks(prev => new Set([...prev, block.id]));
      }, i * STAGGER_MS + 50)
    );
    return () => timers.forEach(clearTimeout);
  }, [activeSection, activeSectionSchema]);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const total = scrollHeight - clientHeight;
      setScrollProgress(total > 0 ? (scrollTop / total) * 100 : 0);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = () => setCommentsSidebarOpen(true);
    window.addEventListener('im-open-comments-sidebar', handler);
    return () => window.removeEventListener('im-open-comments-sidebar', handler);
  }, []);

  const flatSections = useMemo(() => {
    const parents = schema.filter(s => !s.parentId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const result = [];
    parents.forEach(p => {
      const children = schema
        .filter(s => s.parentId === p.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      result.push({ ...p, isParent: true, hasChildren: children.length > 0 });
      if (!collapsedGroups[p.id]) children.forEach(c => result.push({ ...c, isParent: false }));
    });
    return result;
  }, [schema, collapsedGroups]);

  const exitToHub = async () => {
    if (user) await updateDoc(doc(db, 'workspace-users', user.uid), {
      currentBlockId: null, currentPage: 'module-hub',
    });
    navigate(`/module-hub?project=${projectId}&name=${encodeURIComponent(projectName)}`);
  };

  const SaveChip = () => {
    const config = {
      saving: { icon: <Loader2 size={11} style={{ animation: 'imSpin 0.8s linear infinite' }} />, label: 'Saving',  color: T.textMuted, bg: T.surface3,               border: 'transparent' },
      error:  { icon: <ShieldAlert size={11} />,                                                   label: 'Failed',  color: '#ef4444',   bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.25)' },
      saved:  { icon: <CheckCircle2 size={11} />,                                                  label: 'Saved',   color: T.green,     bg: 'rgba(16,185,129,0.1)',   border: 'rgba(16,185,129,0.25)' },
      idle:   { icon: <CheckCircle2 size={11} />,                                                  label: 'Saved',   color: T.textSub,   bg: 'transparent',            border: 'transparent' },
    }[saveStatus] ?? { icon: null, label: '', color: T.textMuted, bg: 'transparent', border: 'transparent' };

    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20,
        background: config.bg, color: config.color, fontSize: 11, fontWeight: 700, border: `1px solid ${config.border}`, transition: 'all 0.35s cubic-bezier(0.4,0,0.2,1)',
      }}>
        {config.icon} {config.label}
      </div>
    );
  };

  const LockIndicator = () => {
    if (!myLockedBlock) return null;
    const othersOnline = onlineUsers.filter(u => u.uid !== user?.uid);
    if (othersOnline.length === 0) return null;
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 20,
        background: T.amberDim, border: '1px solid rgba(245,158,11,0.25)', fontSize: 11, fontWeight: 700, color: T.amber, animation: 'imFadeIn 0.2s ease',
      }}>
        <Lock size={10} /> You're locking a field
      </div>
    );
  };

  return (
    <div style={{
      display: 'flex', height: '100vh', overflow: 'hidden',
      background: T.bg, color: T.text, fontFamily: "'Inter', 'DM Sans', system-ui, sans-serif",
    }}>

      <aside style={{
        width: isSidebarOpen ? 272 : 0, minWidth: isSidebarOpen ? 272 : 0, overflow: 'hidden',
        background: T.sidebar, borderRight: `1px solid ${T.border}`,
        display: 'flex', flexDirection: 'column', transition: 'width 0.3s cubic-bezier(0.4,0,0.2,1), min-width 0.3s cubic-bezier(0.4,0,0.2,1)', flexShrink: 0, zIndex: 20,
      }}>
        <div style={{ padding: '18px 20px 16px', borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, letterSpacing: 2.5, textTransform: 'uppercase', color: T.text, marginBottom: 8 }}>
              RED<span style={{ color: T.accent }}>WOOD</span>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: T.accentDim, border: `1px solid rgba(245,158,11,0.15)`, borderRadius: 20, padding: '3px 10px 3px 7px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.accent, boxShadow: `0 0 6px ${T.accentGlow}`, animation: 'imPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, letterSpacing: 0.3 }}>{projectName}</span>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(false)} title="Minimize Sidebar"
            style={{ background: T.surface3, border: `1px solid ${T.border}`, color: T.textMuted, cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'color 0.15s, background 0.15s' }}
            onMouseEnter={e => { e.currentTarget.style.background = T.border; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.textMuted; }}
          >
            <PanelLeftClose size={14} />
          </button>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 8px', scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent` }}>
          {flatSections.map(section => {
            const isActive = activeSection === section.key;
            const isCollapsed = collapsedGroups[section.id];
            const viewers = onlineUsers.filter(u => u.section === section.key && u.uid !== user?.uid);

            if (section.isParent) return (
              <div key={section.id}>
                <div
                  onClick={() => { handleSectionClick(section.key); if (isCollapsed) toggleGroup(section.id); }}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 10px', borderRadius: 7, cursor: 'pointer', marginBottom: 1,
                    color: isActive ? T.text : T.textMuted, background: isActive ? T.accentDim : 'transparent', userSelect: 'none', transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.surface3; }} onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, overflow: 'hidden' }}>
                    {isActive && <div style={{ width: 3, height: 14, borderRadius: 2, background: T.accent, flexShrink: 0, boxShadow: `0 0 8px ${T.accentGlow}` }} />}
                    <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isActive ? T.accent : 'inherit' }}>{section.navLabel}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                    {viewers.length > 0 && viewers.slice(0, 2).map((v, i) => (
                      <div key={v.uid} title={v.email} style={{ width: 16, height: 16, borderRadius: '50%', fontSize: 8, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(v.uid), boxShadow: `0 0 0 2px ${T.sidebar}`, marginLeft: i > 0 ? -5 : 0 }}>{v.email.charAt(0).toUpperCase()}</div>
                    ))}
                    {section.hasChildren && (
                      <div onClick={(e) => { e.stopPropagation(); toggleGroup(section.id); }} style={{ color: T.textSub, transition: 'transform 0.22s ease', transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)', padding: '4px' }}>
                        <ChevronDown size={13} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );

            return (
              <div
                key={section.id} onClick={() => handleSectionClick(section.key)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 6px 22px', borderRadius: 7, cursor: 'pointer',
                  marginBottom: 1, userSelect: 'none', position: 'relative', transition: 'all 0.15s ease', background: isActive ? T.accentDim : 'transparent', color: isActive ? T.accent : T.textMuted,
                }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.text; } }} onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; } }}
              >
                {isActive
                  ? <div style={{ position: 'absolute', left: 10, width: 2, height: 14, borderRadius: 2, background: T.accent, boxShadow: `0 0 6px ${T.accentGlow}` }} />
                  : <div style={{ position: 'absolute', left: 13, width: 4, height: 4, borderRadius: '50%', background: T.textSub }} />
                }
                <span style={{ fontSize: 11.5, fontWeight: isActive ? 700 : 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingLeft: 6 }}>{section.navLabel}</span>
                {viewers.length > 0 && (
                  <div style={{ display: 'flex', flexShrink: 0 }}>
                    {viewers.slice(0, 2).map((v, i) => (
                      <div key={v.uid} title={v.email} style={{ width: 14, height: 14, borderRadius: '50%', fontSize: 7, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(v.uid), boxShadow: `0 0 0 2px ${T.sidebar}`, marginLeft: i > 0 ? -4 : 0 }}>{v.email.charAt(0).toUpperCase()}</div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {onlineUsers.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <div style={{ display: 'flex' }}>
              {onlineUsers.slice(0, 4).map((u, i) => (
                <div key={u.uid} title={u.email} style={{ width: 22, height: 22, borderRadius: '50%', fontSize: 9, fontWeight: 800, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatarColor(u.uid), boxShadow: `0 0 0 2px ${T.sidebar}`, marginLeft: i > 0 ? -6 : 0 }}>
                  {u.email.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: T.green, flexShrink: 0, boxShadow: '0 0 6px rgba(16,185,129,0.5)', animation: 'imPulse 2s ease-in-out infinite' }} />
              <span style={{ fontSize: 11, fontWeight: 600, color: T.textMuted }}>{onlineUsers.length} online</span>
            </div>
          </div>
        )}
      </aside>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        <header style={{
          flexShrink: 0, background: T.header, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', position: 'sticky', top: 0, zIndex: 10,
        }}>
          <div style={{ height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => setIsSidebarOpen(p => !p)} title={isSidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s, background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; }}
              >
                <Menu size={17} />
              </button>

              <button
                onClick={exitToHub}
                style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, transition: 'color 0.15s, background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; }}
              >
                <ArrowLeft size={13} /> Hub
              </button>

              <div style={{ width: 1, height: 18, background: T.border, margin: '0 4px' }} />

              <div style={{
                fontSize: 13, fontWeight: 700, color: T.text, opacity: sectionTransition ? 0 : 1, transform: sectionTransition ? 'translateY(4px)' : 'translateY(0)',
                transition: 'opacity 0.15s ease, transform 0.15s ease', maxWidth: 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {activeSectionSchema?.heading || activeSectionSchema?.navLabel || 'First Connect Document'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  {LockIndicator()}
  {SaveChip()}

              <div style={{ width: 1, height: 18, background: T.border, margin: '0 2px' }} />

              <button
                onClick={() => setCommentsSidebarOpen(p => !p)} title="Comments"
                style={{
                  background: commentsSidebarOpen ? T.amberDim : 'none', border: 'none', color: commentsSidebarOpen ? T.amber : T.textMuted,
                  cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = commentsSidebarOpen ? T.amberDim : 'transparent'; e.currentTarget.style.color = commentsSidebarOpen ? T.amber : T.textMuted; }}
              >
                <MessageSquare size={15} />
              </button>

              <button
                onClick={() => setTheme(p => p === 'dark' ? 'light' : 'dark')} title="Toggle theme"
                style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s, background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; }}
              >
                {isDark ? <Sun size={15} /> : <Moon size={15} />}
              </button>

              {/* FIX: Route to fc-settings instead of im-settings */}
              <button
                onClick={() => navigate(`/fc-settings?fc=${fcId}&project=${projectId}&name=${encodeURIComponent(projectName)}`)}
                title="FC Settings"
                style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex', alignItems: 'center', transition: 'color 0.15s, background 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.text; }} onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = T.textMuted; }}
              >
                <Settings size={15} />
              </button>
            </div>
          </div>

          <div style={{ height: 2, background: T.border, position: 'relative' }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, height: 2, width: `${scrollProgress}%`,
              background: `linear-gradient(90deg, ${T.accent}, #f97316)`, borderRadius: '0 2px 2px 0',
              transition: 'width 0.1s linear', boxShadow: `0 0 8px ${T.accentGlow}`, opacity: scrollProgress > 2 ? 1 : 0,
            }} />
          </div>
        </header>

        <main
          ref={mainRef}
          style={{
            flex: 1, overflowY: 'auto', padding: '40px 48px',
            scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent`,
          }}
        >
          {schema.length === 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60vh', gap: 16 }}>
              <div style={{ width: 64, height: 64, borderRadius: 16, background: T.accentDim, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Settings size={28} style={{ color: T.accent, opacity: 0.6 }} />
              </div>
              <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>No schema configured</div>
              <div style={{ fontSize: 13, color: T.textMuted, textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
                Build the FC template in Settings before filling in content.
              </div>
              <button
                onClick={() => navigate(`/fc-settings?fc=${fcId}&project=${projectId}&name=${encodeURIComponent(projectName)}`)}
                style={{ marginTop: 4, padding: '10px 22px', borderRadius: 8, background: T.accent, color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, boxShadow: `0 4px 14px ${T.accentGlow}`, transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${T.accentGlow}`; }} onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 4px 14px ${T.accentGlow}`; }}
              >
                Open Settings
              </button>
            </div>
          ) : !activeSectionSchema ? (
            <div style={{ color: T.textMuted, fontSize: 14, textAlign: 'center', marginTop: 80 }}>
              Select a section from the sidebar to begin.
            </div>
          ) : showSubsectionPrompt ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '52vh', gap: 10, textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>
                {activeSectionSchema.heading || activeSectionSchema.navLabel}
              </div>
              <div style={{ maxWidth: 420, fontSize: 13, color: T.textMuted, lineHeight: 1.6 }}>
                This section has only subsections. Choose a subsection from the left sidebar to continue.
              </div>
            </div>
          ) : (
            <div style={{
              maxWidth: 820, margin: '0 auto', opacity: sectionTransition ? 0 : 1, transform: sectionTransition ? 'translateY(10px)' : 'translateY(0)',
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}>
              <div style={{ marginBottom: 32 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 8 }}>
                  <div style={{ width: 4, height: 32, borderRadius: 3, flexShrink: 0, background: `linear-gradient(180deg, ${T.accent}, rgba(245,158,11,0.3))` }} />
                  <h2 style={{ fontSize: 24, fontWeight: 800, color: T.text, margin: 0, letterSpacing: -0.3, lineHeight: 1.2 }}>
                    {activeSectionSchema.heading || activeSectionSchema.navLabel}
                  </h2>
                </div>

                {activeSectionSchema.desc && (
                  <p style={{ margin: '0 0 0 18px', fontSize: 13, color: T.textMuted, lineHeight: 1.6, maxWidth: 560 }}>
                    {activeSectionSchema.desc}
                  </p>
                )}
                <div style={{ marginTop: 16, height: 1, background: `linear-gradient(90deg, ${T.border} 0%, transparent 80%)` }} />
              </div>

              {(activeSectionSchema.blocks || [])
                .slice()
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .map(block => {
                  const getValue = (path) => {
                    if (!path) return undefined;
                    return path.split('.').reduce((obj, key) => obj?.[key], fcData);
                  };
                  const isVisible = visibleBlocks.has(block.id);
                  return (
                    <div
                      key={block.id}
                      style={{
                        opacity: isVisible ? 1 : 0, transform: isVisible ? 'translateY(0)' : 'translateY(10px)',
                        transition: 'opacity 0.25s ease, transform 0.25s ease',
                      }}
                    >
                      {/* Reuse the IM Block Registry to handle rendering! */}
                      <BlockRegistry
                        block={block}
                        value={getValue(block.dataPath)}
                        onChange={(path, value) => handleDataChange(path, value, block.id)}
                        lockedBy={activeLocks[block.id] || null}
                        onFocus={handleBlockFocus}
                        onBlur={handleBlockBlur}
                        isDark={isDark}
                      />
                    </div>
                  );
                })}
            </div>
          )}
        </main>
      </div>

      {/* REUSED: Comments Sidebar points to the same component, just feeds it the FC ID */}
      <CommentsSidebar
        imId={fcId} 
        isDark={isDark}
        isOpen={commentsSidebarOpen}
        onClose={() => setCommentsSidebarOpen(false)}
      />

      <style>{`
        @keyframes imSpin    { from { transform: rotate(0deg); }   to   { transform: rotate(360deg); } }
        @keyframes imPulse   { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(1.2); } }
        @keyframes imFadeIn  { from { opacity: 0; transform: translateX(6px); } to { opacity: 1; transform: translateX(0); } }
        ::-webkit-scrollbar       { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.18); }
      `}</style>
    </div>
  );
}
